const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { randomUUID } = require("node:crypto");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ingemat-scanner-"));
process.env.DATA_DIR = dir;
process.env.DISABLE_MIGRATION_BACKUP = "1";
const db = require("../src/database/db");
const exams = require("../src/services/evaluations.service");
const imports = require("../src/services/imports.service");
const { createScannerService } = require("../src/services/scanner.service");
db.prepare("INSERT INTO ciclos(nombre) VALUES(?)").run("ANUAL");
const req = { session: { username: "admin", role: "admin" } },
  other = { session: { username: "other", role: "corrector" } };
const exam = exams.readyExam(
  exams.saveExam(
    {
      titulo: "ESCÁNER",
      ciclo: "ANUAL",
      definition: { totalQuestions: 1, keys: { 1: "A" } },
    },
    req,
  ).id,
  req,
);
after(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
const calls = [];
let release,
  fail = false,
  large = false;
const run = async (args, { signal } = {}) => {
  calls.push(args);
  if (args.includes("--listdevices"))
    return "Brother MFC-T920DW\r\nAnother Scanner\r\n";
  await new Promise((resolve, reject) => {
    release = () => {
      if (fail) reject(new Error("Driver desconectado"));
      else resolve();
    };
    signal.addEventListener("abort", () => reject(new Error("Cancelled")), {
      once: true,
    });
  });
  const target = args[args.indexOf("-o") + 1];
  fs.writeFileSync(target, "%PDF-1.4\nSYNTHETIC SCAN\n");
  if (large) fs.truncateSync(target, 21 * 1024 * 1024);
};
const scanner = createScannerService({ run });
const body = () => ({
  requestId: randomUUID(),
  examId: exam.id,
  driver: "wia",
  device: "Brother MFC-T920DW",
  source: "glass",
  pageSize: "a4",
});
async function wait(id, status) {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    const row = scanner.list(exam.id, req).jobs.find((j) => j.id === id);
    if (row?.status === status) return row;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw Error("Status did not reach " + status);
}
async function capture() {
  const job = scanner.start(body(), req);
  release();
  await wait(job.id, "ready");
  return job;
}

test("discover uses an explicit supported driver and returns device names", async () => {
  await assert.rejects(scanner.discover("shell"), /WIA o TWAIN/);
  const result = await scanner.discover("wia");
  assert.deepEqual(result.devices, ["Brother MFC-T920DW", "Another Scanner"]);
  assert.deepEqual(calls[0], ["--listdevices", "--driver", "wia"]);
});
test("scan is idempotent, globally exclusive and passes fixed OMR settings without shell commands", async () => {
  const request = body();
  const job = scanner.start(request, req);
  assert.equal(scanner.start(request, req).id, job.id);
  assert.throws(
    () => scanner.start({ ...request, pageSize: "a5" }, req),
    /otra captura/,
  );
  assert.throws(() => scanner.start(body(), req), /ocupado/);
  assert.throws(() => scanner.start(request, other), /no encontrada/);
  await assert.rejects(scanner.discover("wia"), /ocupado/);
  const command = calls.at(-1);
  assert(command.includes("--disableocr"));
  assert.equal(command[command.indexOf("--dpi") + 1], "300");
  assert.equal(command[command.indexOf("--bitdepth") + 1], "gray");
  release();
  await wait(job.id, "ready");
  assert(fs.existsSync(scanner.download(job.id, req)));
  assert.throws(() => scanner.download(job.id, other), /no encontrada/);
});
test("invalid inputs cannot choose arbitrary devices, sizes or command options", () => {
  assert.throws(
    () => scanner.start({ ...body(), requestId: "../../x" }, req),
    /inválido/,
  );
  assert.throws(
    () => scanner.start({ ...body(), device: "--output=evil" }, req),
    /lista/,
  );
  assert.throws(
    () => scanner.start({ ...body(), source: "duplex" }, req),
    /Origen/,
  );
  assert.throws(
    () => scanner.start({ ...body(), pageSize: "a6" }, req),
    /tamaño/,
  );
});
test("cancelled captures are never sent to OMR and can be removed", async () => {
  const job = scanner.start(body(), req);
  scanner.cancel(job.id, req);
  await wait(job.id, "cancelled");
  assert.throws(() => scanner.download(job.id, req), /no disponible/);
  scanner.discard(job.id, req);
  assert(!scanner.list(exam.id, req).jobs.some((j) => j.id === job.id));
});
test("driver failures and oversized output remain actionable instead of creating an empty batch", async () => {
  fail = true;
  let job = scanner.start(body(), req);
  release();
  let result = await wait(job.id, "failed");
  assert.match(result.error, /Driver desconectado/);
  fail = false;
  large = true;
  job = scanner.start(body(), req);
  release();
  result = await wait(job.id, "failed");
  assert.match(result.error, /20 MB/);
  large = false;
});
test("selected captures create one ordinary OMR batch; a lost response can recover the same receipt", async () => {
  const first = await capture(),
    second = await capture();
  const request = {
    examId: exam.id,
    jobIds: [first.id, second.id],
    requestId: randomUUID(),
  };
  const batch = scanner.processCaptures(request, req);
  assert.equal(batch.status, "queued");
  assert.equal(batch.files.length, 2);
  assert.equal(scanner.processCaptures(request, req).id, batch.id);
  assert(batch.files.every((f) => fs.existsSync(path.join(dir, f.path))));
  assert.throws(
    () => scanner.processCaptures({ ...request, jobIds: [first.id] }, req),
    /otras capturas/,
  );
  assert.throws(
    () => scanner.processCaptures({ ...request, requestId: randomUUID() }, req),
    /listas/,
  );
});
test("failed import preserves original PDF captures for a safe retry", async () => {
  const alternative = createScannerService({
    run,
    importService: {
      ...imports,
      createScan: () => {
        throw Error("Synthetic database failure");
      },
    },
  });
  await alternative.discover("wia");
  const job = alternative.start(body(), req);
  release();
  const deadline = Date.now() + 1000;
  while (
    alternative.list(exam.id, req).jobs.find((j) => j.id === job.id).status !==
      "ready" &&
    Date.now() < deadline
  )
    await new Promise((r) => setTimeout(r, 5));
  assert.throws(
    () =>
      alternative.processCaptures(
        { examId: exam.id, jobIds: [job.id], requestId: randomUUID() },
        req,
      ),
    /database failure/,
  );
  assert(fs.existsSync(alternative.download(job.id, req)));
});
test("restart recovery marks interrupted scans failed without invoking the hardware again", () => {
  const id = randomUUID();
  db.prepare(
    "INSERT INTO scanner_jobs(id,evaluation_id,revision,actor,driver,device,source,page_size,status) VALUES(?,?,1,'admin','wia','Brother','glass','a4','scanning')",
  ).run(id, exam.id);
  const count = calls.length;
  scanner.recover();
  assert.equal(calls.length, count);
  assert.equal(
    scanner.list(exam.id, req).jobs.find((j) => j.id === id).status,
    "failed",
  );
});

test("native launcher preserves literal arguments, reports missing executable and terminates cancellation", async () => {
  const { runNaps } = require("../src/services/scanner.service");
  const previous = process.env.NAPS2_BIN;
  try {
    process.env.NAPS2_BIN = process.execPath;
    const script = path.join(dir, "fake naps2.cjs");
    fs.writeFileSync(
      script,
      "if(process.argv[2]==='wait')setInterval(()=>{},1000);else console.log(JSON.stringify(process.argv.slice(2)))",
    );
    const args = ["--device", "Brother ; literal & name", "--source", "glass"];
    assert.deepEqual(JSON.parse(await runNaps([script, ...args])), args);
    const controller = new AbortController();
    const pending = runNaps([script, "wait"], {
      signal: controller.signal,
      timeout: 3000,
    });
    setTimeout(() => controller.abort(), 30);
    await assert.rejects(pending, /NAPS2 terminó/);
    process.env.NAPS2_BIN = path.join(dir, "missing-naps2.exe");
    await assert.rejects(runNaps(["--listdevices"]), /ENOENT/);
  } finally {
    if (previous === undefined) delete process.env.NAPS2_BIN;
    else process.env.NAPS2_BIN = previous;
  }
});

test("bulk cleanup only discards failed/cancelled captures of the current operator and exam", () => {
  const rows = [];
  for (const [status, owner] of [
    ["failed", "admin"],
    ["cancelled", "admin"],
    ["ready", "admin"],
    ["scanning", "admin"],
    ["failed", "other"],
  ]) {
    const id = randomUUID();
    db.prepare(
      "INSERT INTO scanner_jobs(id,evaluation_id,revision,actor,driver,device,source,page_size,status) VALUES(?,?,1,?,'wia','Brother','glass','a4',?)",
    ).run(id, exam.id, owner, status);
    fs.writeFileSync(path.join(dir, "scanner", id + ".pdf"), "%PDF-test");
    rows.push({ id, status, owner });
  }
  assert.equal(scanner.clearFailed("different-exam", req).cleared, 0);
  const result = scanner.clearFailed(exam.id, req);
  assert(result.cleared >= 2);
  for (const row of rows) {
    const cleared =
      row.owner === "admin" && ["failed", "cancelled"].includes(row.status);
    assert.equal(
      db.prepare("SELECT status FROM scanner_jobs WHERE id=?").get(row.id)
        .status,
      cleared ? "discarded" : row.status,
    );
    assert.equal(
      fs.existsSync(path.join(dir, "scanner", row.id + ".pdf")),
      !cleared,
    );
  }
  assert.equal(scanner.clearFailed(exam.id, req).cleared, 0);
});
