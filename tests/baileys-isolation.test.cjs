const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const dir = fs.mkdtempSync(
  path.join(os.tmpdir(), "ingemat-baileys-isolation-"),
);
process.env.DATA_DIR = dir;
process.env.DISABLE_MIGRATION_BACKUP = "1";
const {
  createBaileysService,
  REVIEW_NOTE,
} = require("../src/services/baileys.service");
const services = [];
after(() => {
  for (const s of services) s.stop();
  fs.rmSync(dir, { recursive: true, force: true });
});
function fixture(options = {}) {
  const child = new EventEmitter();
  child.exitCode = null;
  child.kill = () => {
    child.exitCode = 0;
    queueMicrotask(() => child.emit("exit", 0));
    return true;
  };
  child.send = (message, callback) => {
    child.command = message;
    callback?.();
  };
  let forks = 0,
    spawnOptions;
  const service = createBaileysService({
    spawn: (_, __, opts) => {
      forks++;
      spawnOptions = opts;
      return child;
    },
    ...options,
  });
  services.push(service);
  return {
    service,
    child,
    forks: () => forks,
    options: () => spawnOptions,
    connected: () =>
      child.emit("message", { type: "state", state: "connected" }),
  };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
test("media sends use private bounded files and preserve stable IDs for individual and group recipients", async () => {
  const { randomUUID } = require("node:crypto");
  const { createCanvas } = require("@napi-rs/canvas");
  const { mediaContent } = require("../src/whatsapp/media.cjs");
  const mediaDir = path.join(dir, "reports");
  fs.mkdirSync(mediaDir);
  const attachment = {
    id: randomUUID(),
    format: "png",
    fileName: "Reporte_DEMO001.png",
  };
  const png = createCanvas(30, 30).toBuffer("image/png");
  fs.writeFileSync(path.join(mediaDir, `${attachment.id}.png`), png);
  assert(mediaContent(mediaDir, attachment, "Reporte").image.equals(png));
  const f = fixture({ mediaDir });
  f.service.connect();
  f.connected();
  const sent = f.service.sendMedia(
    "120363123456789@g.us",
    "Reporte",
    "0123456789ABCDEF",
    attachment,
  );
  assert.deepEqual(f.child.command.attachment, attachment);
  assert.equal(f.child.command.recipient, "120363123456789@g.us");
  assert.equal(f.child.command.text, "Reporte");
  f.child.emit("message", {
    type: "result",
    id: f.child.command.id,
    ok: true,
    messageId: "0123456789ABCDEF",
  });
  assert.equal(await sent, "0123456789ABCDEF");
  await assert.rejects(
    f.service.sendMedia("+51900111222", "Reporte", "0123456789ABCDEF", {
      ...attachment,
      id: "../private",
    }),
    (e) => e.code === "BAILEYS_INVALID_MESSAGE" && e.notSent,
  );
  await assert.rejects(
    f.service.sendText("120363123456789@g.us", "Texto", "0123456789ABCDEF"),
  );
  const pdf = {
    id: randomUUID(),
    format: "pdf",
    fileName: "Reporte_DEMO001.pdf",
  };
  fs.writeFileSync(path.join(mediaDir, `${pdf.id}.pdf`), "%PDF-1.7\nexample");
  const content = mediaContent(mediaDir, pdf, "Informe");
  assert.equal(content.mimetype, "application/pdf");
  assert.equal(content.fileName, pdf.fileName);
  assert(Buffer.isBuffer(content.document));
  assert.throws(() =>
    mediaContent(mediaDir, { ...pdf, fileName: "../reporte.pdf" }, ""),
  );
});
test("group discovery returns only bounded group labels and does not expose participant data", async () => {
  const f = fixture();
  f.service.connect();
  f.connected();
  const groups = f.service.listGroups();
  assert.equal(f.child.command.type, "list_groups");
  f.child.emit("message", {
    type: "result",
    id: f.child.command.id,
    ok: true,
    groups: [
      {
        id: "120363123456789@g.us",
        subject: "Anual - Mañana",
        size: 25,
        participants: ["private"],
      },
      { id: "invalid", subject: "Rejected" },
    ],
  });
  assert.deepEqual(await groups, [
    { id: "120363123456789@g.us", subject: "Anual - Mañana", size: 25 },
  ]);
  f.service.stop();
  await assert.rejects(f.service.listGroups(), (e) => e.notSent);
});
test("supervisor is lazy and enforces a separate IPC process with bounded JS heap", () => {
  const f = fixture();
  assert.equal(f.forks(), 0);
  assert.equal(f.service.status().state, "idle");
  const oldSecret = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = "do-not-pass-to-third-party";
  f.service.connect();
  if (oldSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = oldSecret;
  assert.equal(f.options().env.SESSION_SECRET, undefined);
  f.service.connect();
  assert.equal(f.forks(), 1);
  assert(f.options().execArgv.includes("--max-old-space-size=256"));
  assert.deepEqual(f.options().stdio, ["ignore", "ignore", "ignore", "ipc"]);
});
test("spawn and async process failures produce the package review note instead of escaping", () => {
  const s = createBaileysService({
    spawn: () => {
      throw Error("private diagnostic");
    },
  });
  services.push(s);
  assert.doesNotThrow(() => s.connect());
  assert.equal(s.status().needsPackageReview, true);
  assert.equal(s.status().note, REVIEW_NOTE);
  const f = fixture();
  f.service.connect();
  assert.doesNotThrow(() => f.child.emit("error", Error("secret")));
  assert(!JSON.stringify(f.service.status()).includes("secret"));
});
test("QR is private, has a parent-side expiry and is removed when stopped", () => {
  const f = fixture();
  f.service.connect();
  f.child.emit("message", { type: "state", state: "pairing" });
  f.child.emit("message", {
    type: "qr",
    dataUrl: "data:image/png;base64,cHJpdmF0ZQ==",
  });
  assert.equal(f.service.status().qrAvailable, true);
  assert(!JSON.stringify(f.service.status()).includes("cHJpdmF0ZQ"));
  assert(f.service.getQR().expiresAt <= Date.now() + 60000);
  f.service.stop();
  assert.equal(f.service.getQR(), null);
});
test("a worker confirms only the requested stable message ID and early receipts are correlated", async () => {
  const f = fixture();
  f.service.connect();
  f.connected();
  let delivered;
  f.service.onDelivery((event) => {
    delivered = event;
  });
  const messageId = "0123456789ABCDEF0123456789ABCDEF";
  const p = f.service.sendText("+51900111222", "Aviso", messageId);
  f.child.emit("message", { type: "delivery", messageId, status: "read" });
  assert.equal(delivered.id, messageId);
  f.child.emit("message", {
    type: "result",
    id: f.child.command.id,
    ok: true,
    messageId,
  });
  assert.equal(await p, messageId);
});
test("worker crash during send is unknown and is not silently restarted", async () => {
  const f = fixture();
  f.service.connect();
  f.connected();
  const p = f.service.sendText("+51900111222", "Aviso", "0123456789ABCDEF");
  f.child.emit("exit", 7);
  await assert.rejects(p, (e) => e.deliveryUnknown === true);
  assert.equal(f.service.status().state, "error");
  await wait(30);
  assert.equal(f.forks(), 1);
  await assert.rejects(
    f.service.sendText("+51900111222", "Aviso", "0123456789ABCDEF"),
    (e) => e.notSent === true,
  );
});
test("send timeout kills only the worker, preserves ambiguity and allows explicit reconnect", async () => {
  const f = fixture({ timeoutMs: 30 });
  f.service.connect();
  f.connected();
  const p = f.service.sendText("+51900111222", "Aviso", "0123456789ABCDEF");
  const keepAlive = wait(70);
  await assert.rejects(p, (e) => e.deliveryUnknown === true);
  await keepAlive;
  assert.equal(f.service.status().code, "BAILEYS_SEND_TIMEOUT");
  f.service.connect();
  assert.equal(f.forks(), 2);
});
test("boot and heartbeat deadlines stop unresponsive workers without automatic crash loops", async () => {
  const boot = fixture({ bootMs: 20 });
  boot.service.connect();
  await wait(45);
  assert.equal(boot.service.status().code, "BAILEYS_BOOT_TIMEOUT");
  const f = fixture({ watchdogMs: 20, tickMs: 5 });
  f.service.connect();
  f.connected();
  await wait(45);
  assert.equal(f.service.status().code, "BAILEYS_UNRESPONSIVE");
  assert.equal(f.forks(), 1);
});
test("late messages after stopping cannot restore a stopped connection", () => {
  const f = fixture();
  f.service.connect();
  f.connected();
  f.service.stop();
  f.connected();
  f.child.emit("message", { type: "fault", code: "LATE_ERROR" });
  assert.equal(f.service.status().state, "stopped");
});
test("reset clears only local WhatsApp session files and keeps academic data", async () => {
  const auth = path.join(dir, "auth");
  fs.mkdirSync(auth);
  const academic = path.join(dir, "academic.db");
  fs.writeFileSync(academic, "preserve");
  for (const suffix of ["", "-wal", "-shm"])
    fs.writeFileSync(path.join(auth, "baileys-auth.db" + suffix), "session");
  const f = fixture({ authDir: auth });
  f.service.connect();
  await f.service.reset();
  assert(fs.existsSync(academic));
  assert.deepEqual(fs.readdirSync(auth), []);
});
test("a real child import/crash cannot bring down the HTTP application", async () => {
  process.env.ADMIN_INITIAL_PASSWORD = "Isolation-test-password-2026";
  const { createApp } = require("../app"),
    db = require("../src/database/db");
  const filename = path.join(dir, "crash-worker.cjs");
  fs.writeFileSync(
    filename,
    "process.send({type:'fault',code:'BAILEYS_PACKAGE_LOAD_ERROR'});setTimeout(()=>process.exit(9),10)",
  );
  const s = createBaileysService({ workerPath: filename });
  services.push(s);
  const server = createApp().listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  try {
    s.connect();
    for (let i = 0; i < 100 && s.status().state !== "error"; i++)
      await wait(10);
    assert.equal(s.status().needsPackageReview, true);
    assert.equal(
      (await fetch(`http://127.0.0.1:${server.address().port}/health`)).status,
      200,
    );
    assert.equal(db.prepare("SELECT 1 n").get().n, 1);
  } finally {
    await new Promise((r) => server.close(r));
    db.close();
  }
});
test("transactional auth persists both credentials and Signal keys including buffers", async (t) => {
  let module;
  try {
    module = await import("@whiskeysockets/baileys");
  } catch {
    t.skip(
      "Paquete opcional no disponible; el diagnóstico lo informa sin bloquear la app.",
    );
    return;
  }
  const { openAuthStore } = require("../src/whatsapp/auth-store.cjs"),
    auth = path.join(dir, "auth-store");
  let store = openAuthStore(auth, module);
  store.state.creds.registered = true;
  store.saveCreds();
  await store.state.keys.set({
    session: { sample: Buffer.from([0, 1, 250, 255]) },
  });
  store.close();
  store = openAuthStore(auth, module);
  assert.equal(store.state.creds.registered, true);
  const keys = await store.state.keys.get("session", ["sample"]);
  assert.deepEqual(Buffer.from(keys.sample), Buffer.from([0, 1, 250, 255]));
  await store.state.keys.set({ session: { sample: null } });
  assert.equal(
    (await store.state.keys.get("session", ["sample"])).sample,
    undefined,
  );
  store.close();
});

test("a reconnect cannot start another worker while the session reset is in progress", async () => {
  const f = fixture();
  f.child.kill = () => true;
  f.service.connect();
  const reset = f.service.reset();
  assert.equal(f.service.status().state, "resetting");
  f.service.connect();
  assert.equal(f.forks(), 1);
  f.child.exitCode = 0;
  f.child.emit("exit", 0);
  await reset;
  f.service.connect();
  assert.equal(f.forks(), 2);
});
