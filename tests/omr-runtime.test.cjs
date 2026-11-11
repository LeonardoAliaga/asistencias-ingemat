const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ingemat-runtime-"));
process.env.DATA_DIR = dir;
const {
  executePython,
  runReader,
} = require("../src/services/omr-runtime.service");
after(() => fs.rmSync(dir, { recursive: true, force: true }));

function capture() {
  const entries = [];
  return {
    entries,
    logger: Object.fromEntries(
      ["info", "warn", "error"].map((level) => [
        level,
        (...args) => entries.push({ level, args }),
      ]),
    ),
  };
}
function nodeOptions(captured, extra = {}) {
  return {
    python: process.execPath,
    logger: captured.logger,
    batchId: "synthetic-batch",
    ...extra,
  };
}

test("missing executable logs the actual path and ENOENT once, without hanging", async () => {
  const captured = capture(),
    python = path.join(dir, "Python con espacios ñ", "missing.exe");
  await assert.rejects(
    executePython(
      ["reader.py", "request.json"],
      nodeOptions(captured, { python }),
    ),
    { code: "ENOENT" },
  );
  const failed = captured.entries.filter((e) => e.level === "error");
  assert.equal(failed.length, 1);
  assert.equal(failed[0].args[1].python, python);
  assert.equal(failed[0].args[1].executableExists, false);
  assert.match(failed[0].args[1].cause, /ENOENT/);
});

test("nonzero exit retains Python traceback, exit code and batch while keeping stdout private", async () => {
  const captured = capture();
  const traceback =
    "Traceback (most recent call last):\n" +
    "line\n".repeat(600) +
    "ModuleNotFoundError: No module named 'cv2'\n";
  const script = path.join(dir, "failed-process.cjs");
  fs.writeFileSync(
    script,
    "process.stdout.write('PRIVATE_ANSWERS'); process.stderr.write(" +
      JSON.stringify(traceback) +
      "); process.exitCode=7",
  );
  await assert.rejects(executePython([script], nodeOptions(captured)), {
    code: "OMR_EXIT",
    exitCode: 7,
  });
  const details = captured.entries.find((e) => e.level === "error").args[1];
  assert.equal(details.stderr, traceback);
  assert.equal(details.batchId, "synthetic-batch");
  assert.equal(details.stderrTruncated, false);
  assert(!JSON.stringify(captured.entries).includes("PRIVATE_ANSWERS"));
  assert.equal(Object.hasOwn(details, "stdout"), false);
});

test("successful process keeps Unicode JSON intact and logs warnings separately", async () => {
  const captured = capture();
  const output = JSON.stringify({ pages: [{ note: "niño" }] });
  const result = await executePython(
    [
      "-e",
      "process.stdout.write(" +
        JSON.stringify(output) +
        ");process.stderr.write('native warning')",
    ],
    nodeOptions(captured),
  );
  assert.equal(result.stdout, output);
  assert.equal(result.code, 0);
  assert.equal(captured.entries.filter((e) => e.level === "warn").length, 1);
});

test("timeout settles once and terminates the process", async () => {
  const captured = capture();
  await assert.rejects(
    executePython(
      ["-e", "setInterval(()=>{},1000)"],
      nodeOptions(captured, { timeoutMs: 150 }),
    ),
    { code: "OMR_TIMEOUT" },
  );
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(captured.entries.filter((e) => e.level === "error").length, 1);
});

test("oversized stdout is stopped and stderr is bounded with an explicit truncation flag", async () => {
  const captured = capture();
  await assert.rejects(
    executePython(
      ["-e", "process.stdout.write('x'.repeat(4096))"],
      nodeOptions(captured, { maxOutputBytes: 100 }),
    ),
    { code: "OMR_OUTPUT_LIMIT" },
  );
  const other = capture();
  await assert.rejects(
    executePython(
      [
        "-e",
        "process.stderr.write('x'.repeat(70000)+'TRACE_END');process.exitCode=1",
      ],
      nodeOptions(other),
    ),
    { code: "OMR_EXIT" },
  );
  const details = other.entries.find((e) => e.level === "error").args[1];
  assert.equal(details.stderr.length, 65536);
  assert.equal(details.stderrTruncated, true);
  assert(details.stderr.endsWith("TRACE_END"));
});

test("invalid reader output is actionable without exposing response contents", async () => {
  for (const stdout of ["PRIVATE_STUDENT_ANSWERS", "{}", '{"pages":[null]}']) {
    const captured = capture();
    await assert.rejects(
      runReader("request.json", {
        logger: captured.logger,
        batchId: "synthetic",
        execute: async () => ({ stdout }),
      }),
      /npm run omr:doctor/,
    );
    assert(
      !JSON.stringify(captured.entries).includes("PRIVATE_STUDENT_ANSWERS"),
    );
  }
  const captured = capture();
  const result = await runReader("request.json", {
    logger: captured.logger,
    batchId: "synthetic",
    execute: async () => ({
      stdout: JSON.stringify({
        pages: [
          { error: "No se detectaron marcadores" },
          { responses: { 1: "PRIVATE_ANSWERS" } },
        ],
      }),
    }),
  });
  assert.equal(result.pages.length, 2);
  assert.equal(captured.entries.filter((e) => e.level === "warn").length, 1);
  assert(!JSON.stringify(captured.entries).includes("PRIVATE_ANSWERS"));
});

test("doctor reports every missing dependency and the exact interpreter", async () => {
  const captured = capture();
  // Isolated Python with no site-packages reproduces a freshly created venv.
  const result = await executePython(
    ["-I", "-S", path.resolve("src/omr/doctor.py")],
    { logger: captured.logger, allowFailure: true },
  );
  assert.equal(result.code, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, false);
  assert(report.python.executable);
  assert.equal(report.dependencies.length, 5);
  assert(
    report.dependencies.every(
      (d) => !d.ok && /ModuleNotFoundError/.test(d.traceback),
    ),
  );
});

test("doctor CLI returns a failure code with real startup error and never prints secrets", () => {
  const result = spawnSync(process.execPath, ["scripts/check-omr.cjs"], {
    encoding: "utf8",
    env: {
      ...process.env,
      PYTHON_BIN: path.join(dir, "not-installed.exe"),
      WHATSAPP_ACCESS_TOKEN: "PRIVATE_ACCESS_TOKEN",
    },
    timeout: 5000,
  });
  assert.equal(result.status, 1, result.error?.message);
  const text = result.stdout + result.stderr;
  assert.match(text, /ENOENT/);
  assert.match(text, /not-installed.exe/);
  assert(!text.includes("PRIVATE_ACCESS_TOKEN"));
});

test("OMR successful runs are quiet unless debug is explicitly enabled", async () => {
  const original=process.env.OMR_DEBUG;
  delete process.env.OMR_DEBUG;
  try {
    const captured=capture();
    await executePython(["-e","process.stdout.write('OK')"], nodeOptions(captured));
    assert.equal(captured.entries.length,0);
    process.env.OMR_DEBUG="1";
    const debug=capture();
    await executePython(["-e","process.stdout.write('OK')"], nodeOptions(debug));
    assert(debug.entries.some(entry=>entry.level==="info"));
  } finally {
    if(original===undefined) delete process.env.OMR_DEBUG;
    else process.env.OMR_DEBUG=original;
  }
});
