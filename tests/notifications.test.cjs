const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ingemat-notifications-"));
process.env.DATA_DIR = dir;
process.env.DISABLE_MIGRATION_BACKUP = "1";
const db = require("../src/database/db"),
  n = require("../src/services/notifications.service"),
  settings = require("../src/services/notification-config.service"),
  baileys = require("../src/services/baileys.service");
let connected = true;
baileys.status = () => ({
  connected,
  state: connected ? "connected" : "error",
  needsPackageReview: !connected,
  note: connected ? "Conectado" : baileys.REVIEW_NOTE,
});
settings.storeConfig({ ...settings.defaults, enabled: true });
after(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
const job = (eventKey, extra = {}) =>
  n.enqueue({
    eventKey,
    recipient: "+51900111222",
    kind: "attendance",
    payload: { parameters: ["DEMO", "2026-11-10", "08:00", "puntual"] },
    ...extra,
  });
const row = (id) => db.prepare("SELECT * FROM outbox WHERE id=?").get(id);
const messageId = (id) => id.replaceAll("-", "").toUpperCase();
test("Baileys messages are plain text snapshots and idempotent per academic event", () => {
  const id = job("same");
  assert.equal(job("same"), id);
  assert.equal(row(id).provider, "baileys");
  assert(JSON.parse(row(id).payload).text.includes("Estudiante: DEMO"));
  settings.storeConfig({
    ...settings.getConfig(),
    attendanceMessage: "Nuevo texto {nombre}",
  });
  assert(JSON.parse(row(id).payload).text.startsWith("INGEMAT"));
});
test("early receipts are correlated with a stable ID before send completes and never regress", async () => {
  const id = job("early");
  let calls = 0;
  await n.processOutbox(async (r) => {
    calls++;
    assert.equal(row(r.id).provider_id, messageId(r.id));
    n.handleStatus({ id: messageId(r.id), status: "read" });
    return messageId(r.id);
  });
  assert.equal(calls, 2);
  assert.equal(row(id).status, "read");
  n.handleStatus({ id: messageId(id), status: "sent" });
  assert.equal(row(id).status, "read");
});
test("offline service keeps pending jobs and does not occupy academic operations", async () => {
  connected = false;
  const id = job("offline");
  let called = false;
  await n.processOutbox(async () => {
    called = true;
  });
  assert.equal(called, false);
  assert.equal(row(id).status, "pending");
  connected = true;
  await n.processOutbox(async (r) => messageId(r.id));
  assert.equal(row(id).status, "accepted");
});
test("deleted attendance cannot be sent even if a stale job returns to the pending queue", async () => {
  const id = job("baileys:asistencia:deleted-record:contact");
  let sent = 0;
  await n.processOutbox(async () => {
    sent++;
  });
  assert.equal(sent, 0);
  assert.equal(row(id).status, "cancelled");
});
test("worker failure or timeout after submission is unknown and never automatically duplicated", async () => {
  const id = job("uncertain");
  await n.processOutbox(async () => {
    throw Object.assign(Error("Internal error"), { deliveryUnknown: true });
  });
  assert.equal(row(id).status, "unknown");
  assert.match(row(id).error, /Revisa el paquete Baileys/);
  let calls = 0;
  await n.processOutbox(async () => {
    calls++;
  });
  assert.equal(calls, 0);
});
test("a message explicitly not submitted remains pending without consuming an attempt", async () => {
  const id = job("not-submitted");
  await n.processOutbox(async () => {
    throw Object.assign(Error("Disconnected"), { notSent: true });
  });
  assert.equal(row(id).status, "pending");
  assert.equal(row(id).attempts, 0);
  assert(row(id).next_attempt_at > Date.now());
  db.prepare("UPDATE outbox SET next_attempt_at=0 WHERE id=?").run(id);
  await n.processOutbox(async (r) => messageId(r.id));
});
test("revoked consent cancels a queued message before calling the worker", async () => {
  db.prepare(
    "INSERT INTO contacts(id,user_uid,name,phone,consent,active) VALUES('revoked','synthetic','CONTACTO','+51900111222',0,1)",
  ).run();
  const id = job("revoked", { contactId: "revoked" });
  let called = false;
  await n.processOutbox(async () => {
    called = true;
  });
  assert.equal(called, false);
  assert.equal(row(id).status, "cancelled");
});
test("malformed message data cannot block valid jobs in the same batch", async () => {
  const bad = job("bad"),
    good = job("good");
  db.prepare("UPDATE outbox SET payload='{' WHERE id=?").run(bad);
  await n.processOutbox(async (r) => messageId(r.id));
  assert.equal(row(bad).status, "failed");
  assert.equal(row(good).status, "accepted");
});
test("historical paid-provider notices cannot be sent or changed by Baileys receipts", async () => {
  const id = job("historical");
  db.prepare(
    "UPDATE outbox SET provider='meta_cloud',provider_id='OLD' WHERE id=?",
  ).run(id);
  let called = false;
  await n.processOutbox(async () => {
    called = true;
  });
  assert.equal(called, false);
  n.handleStatus({ id: "OLD", status: "read" });
  assert.equal(row(id).status, "pending");
  const count = db
    .prepare("SELECT COUNT(*) n FROM notification_receipts")
    .get().n;
  n.handleStatus({ id: "not-an-app-message", status: "read" });
  assert.equal(
    db.prepare("SELECT COUNT(*) n FROM notification_receipts").get().n,
    count,
  );
  await assert.rejects(n.send(row(id)), /histórico/);
});
test("duplicate receipts are deduplicated and a delivery failure keeps the package review note", async () => {
  const id = job("receipt");
  await n.processOutbox(async (r) => messageId(r.id));
  const event = { id: messageId(id), status: "failed" };
  n.handleStatus(event);
  n.handleStatus(event);
  assert.equal(row(id).status, "failed");
  assert.match(row(id).error, /Revisa el paquete Baileys/);
  const hash = require("node:crypto")
    .createHash("sha256")
    .update(JSON.stringify(event))
    .digest("hex");
  assert.equal(
    db
      .prepare("SELECT COUNT(*) n FROM notification_receipts WHERE id=?")
      .get(hash).n,
    1,
  );
  db.prepare("UPDATE outbox SET status='cancelled' WHERE id=?").run(id);
});
test("attendance, grades and corrections continue when the optional WhatsApp service is broken", async () => {
  const e = require("../src/services/evaluations.service"),
    attendance = require("../src/services/attendance.service");
  const req = { session: { username: "test", role: "admin" } },
    uid = require("node:crypto").randomUUID();
  db.prepare("INSERT INTO ciclos(nombre) VALUES('ANUAL')").run();
  db.prepare(
    "INSERT INTO usuarios(codigo,nombre,apellido,rol,turno,ciclo,uid) VALUES('GRADE001','DEMO','ALUMNO','estudiante','mañana','ANUAL',?)",
  ).run(uid);
  db.prepare(
    "INSERT INTO contacts(id,user_uid,name,phone,consent,active) VALUES('grade-contact',?,'APODERADO','+51900111222',1,1)",
  ).run(uid);
  connected = false;
  const attendanceResult = attendance.register(
    "GRADE001",
    req,
    new Date("2026-11-10T13:00:00Z"),
  );
  assert.equal(attendanceResult.exito, true);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM attendance").get().n, 1);
  let exam = e.readyExam(
    e.saveExam(
      {
        titulo: "NOTAS Y AVISOS",
        ciclo: "ANUAL",
        definition: { totalQuestions: 1, keys: { 1: "A" } },
      },
      req,
    ).id,
    req,
  );
  e.saveGrade(
    exam.id,
    { codigoEstudiante: "GRADE001", respuestas: { 1: "A" } },
    req,
  );
  // Los avisos manuales deben funcionar directamente en estado Listo.
  exam = e.getExam(exam.id);
  assert.equal(exam.estado, "listo");
  assert.equal(n.notifyResults(exam, req), 1);
  assert.equal(n.notifyResults(exam, req), 0);
  const original = db
    .prepare("SELECT * FROM outbox WHERE kind='results'")
    .get();
  e.saveGrade(
    exam.id,
    { codigoEstudiante: "GRADE001", respuestas: { 1: "B" } },
    req,
    { allowReplace: true, reason: "Corrección comprobada con la cartilla" },
  );
  assert.equal(row(original.id).status, "cancelled");
  assert.equal(e.getExam(exam.id).estado, "listo");
  assert.equal(n.notifyResults(e.getExam(exam.id), req), 1);
  assert.equal(n.notifyResults(e.getExam(exam.id), req), 0);
  assert.equal(n.resultState(JSON.parse(db.prepare("SELECT payload FROM outbox WHERE kind='results' AND status='pending' ORDER BY created_at DESC,id DESC LIMIT 1").get().payload)), "current");
  connected = true;
  // El envío solicitado manualmente funciona aun con avisos automáticos apagados.
  settings.storeConfig({ ...settings.getConfig(), enabled: false });
  const automatic = job("disabled-automatic-attendance");
  const kinds = [];
  await n.processOutbox(async (entry) => {
    kinds.push(entry.kind);
    return messageId(entry.id);
  });
  assert(kinds.includes("results"));
  assert(!kinds.includes("attendance"));
  assert.equal(row(automatic).status, "pending");
  assert.equal(n.resultState(JSON.parse(
    db.prepare("SELECT payload FROM outbox WHERE kind='results' AND status='accepted' ORDER BY id DESC LIMIT 1").get().payload
  )), "current");
});

test("actual Baileys send failures show a safe code without exposing messages or recipients", async () => {
  // Aislamos la cola de otros escenarios y activamos el procesamiento del aviso.
  settings.storeConfig({ ...settings.getConfig(), enabled: true });
  db.prepare("UPDATE outbox SET status='cancelled' WHERE status IN ('pending','retry')").run();
  const id=n.enqueue({
    eventKey:"wa-test-failure-"+Date.now(),
    recipient:"+51900111222",
    kind:"attendance_report",
    payload:{
      text:"MENSAJE_PRIVADO_DE_PRUEBA",
      cycle:"ANUAL",date:"2026-11-10",
    },
  });
  // La validación de reportes requiere un grupo; aquí probamos el diagnóstico con un
  // aviso no dependiente de archivos adjuntos.
  db.prepare("UPDATE outbox SET kind='attendance' WHERE id=?").run(id);
  let logs=[];
  const previous=console.error;
  console.error=(...args)=>logs.push(args);
  try {
    await n.processOutbox(async () => {
      throw Object.assign(new Error("ERROR_PRIVADO"),{
        code:"BAILEYS_SEND_ERROR",deliveryUnknown:true,notSent:false,providerStatus:403,
      });
    });
  } finally {console.error=previous;}
  const stored=row(id);
  assert.equal(stored.status,"unknown");
  assert.match(stored.error,/BAILEYS_SEND_ERROR/);
  assert.match(stored.error,/403/);
  assert(logs.some(entry=>entry[0]==="[WhatsApp] Fallo de envío"));
  assert(!JSON.stringify(logs).includes("MENSAJE_PRIVADO_DE_PRUEBA"));
  assert(!JSON.stringify(logs).includes("+51900111222"));
  assert(!JSON.stringify(logs).includes("ERROR_PRIVADO"));
});
