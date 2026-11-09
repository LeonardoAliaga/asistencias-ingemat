const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ingemat-wa-"));
process.env.DATA_DIR = dir;
process.env.DISABLE_MIGRATION_BACKUP = "1";
process.env.WHATSAPP_ACCESS_TOKEN = "fake-test-token";
process.env.WHATSAPP_PHONE_NUMBER_ID = "123456789";
process.env.WHATSAPP_APP_SECRET = "fake-test-app-secret";
process.env.WHATSAPP_VERIFY_TOKEN = "fake-test-verify-token";
const db = require("../src/database/db"),
  n = require("../src/services/notifications.service");
db.prepare(
  "INSERT INTO config_general(clave,valor) VALUES('whatsapp_cloud_config',?)",
).run(
  JSON.stringify({
    enabled: true,
    language: "es",
    attendanceTemplate: "asistencia",
    resultsTemplate: "resultado",
  }),
);
after(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
const job = (key, extra = {}) =>
  n.enqueue({
    eventKey: key,
    recipient: "+51900111222",
    kind: "attendance",
    payload: {
      template: "asistencia",
      language: "es",
      parameters: ["DEMO", "2026-11-08", "08:00", "puntual"],
    },
    ...extra,
  });
test("enqueue is idempotent per academic event", () => {
  assert.equal(job("same"), job("same"));
  assert.equal(db.prepare("SELECT COUNT(*) n FROM outbox").get().n, 1);
});
test("early delivery callback is correlated before the send response, and never regresses", async () => {
  const id = job("early");
  let requests = 0;
  await n.processOutbox(async (url, options) => {
    requests++;
    const body = JSON.parse(options.body);
    assert.equal(body.messaging_product, "whatsapp");
    assert.equal(body.type, "template");
    assert.match(url, /^https:\/\/graph.facebook.com\//);
    n.handleStatus({
      id: "wamid-" + body.biz_opaque_callback_data,
      status: "delivered",
      biz_opaque_callback_data: body.biz_opaque_callback_data,
    });
    return new Response(
      JSON.stringify({
        messages: [{ id: "wamid-" + body.biz_opaque_callback_data }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  });
  assert.equal(requests, 2);
  assert.equal(
    db.prepare("SELECT status FROM outbox WHERE id=?").get(id).status,
    "delivered",
  );
  n.handleStatus({ id: "wamid-" + id, status: "sent" });
  assert.equal(
    db.prepare("SELECT status FROM outbox WHERE id=?").get(id).status,
    "delivered",
  );
});
test("uncertain network delivery requires reconciliation rather than automatic duplicate sending", async () => {
  const id = job("timeout");
  await n.processOutbox(async () => {
    throw new TypeError("Network unavailable");
  });
  assert.equal(
    db.prepare("SELECT status FROM outbox WHERE id=?").get(id).status,
    "unknown",
  );
  let called = false;
  await n.processOutbox(async () => {
    called = true;
  });
  assert.equal(called, false);
});
test("transient provider errors retry with backoff and permanent errors stop", async () => {
  const id = job("rate-limit");
  await n.processOutbox(
    async () =>
      new Response(
        JSON.stringify({ error: { code: 130429, message: "Rate limited" } }),
        { status: 429 },
      ),
  );
  let row = db.prepare("SELECT * FROM outbox WHERE id=?").get(id);
  assert.equal(row.status, "retry");
  assert(row.next_attempt_at > Date.now());
  db.prepare("UPDATE outbox SET next_attempt_at=0 WHERE id=?").run(id);
  await n.processOutbox(
    async () =>
      new Response(
        JSON.stringify({
          error: { code: 132001, message: "Template missing" },
        }),
        { status: 400 },
      ),
  );
  row = db.prepare("SELECT * FROM outbox WHERE id=?").get(id);
  assert.equal(row.status, "failed");
});
test("revoked contacts cancel notices still waiting in the queue", async () => {
  db.prepare(
    "INSERT INTO contacts(id,user_uid,name,phone,consent,active) VALUES(?,?,?,?,0,1)",
  ).run("revoked", "synthetic", "APODERADO", "+51900111222");
  const id = job("consent", { contactId: "revoked" });
  let called = false;
  await n.processOutbox(async () => {
    called = true;
  });
  assert.equal(called, false);
  assert.equal(
    db.prepare("SELECT status FROM outbox WHERE id=?").get(id).status,
    "cancelled",
  );
});
test("duplicate and out-of-order webhook events are harmless", () => {
  const id = job("dedupe");
  db.prepare(
    "UPDATE outbox SET provider_id='wamid-dedupe',status='accepted' WHERE id=?",
  ).run(id);
  const event = { id: "wamid-dedupe", status: "read", timestamp: "100" };
  n.handleStatus(event);
  n.handleStatus(event);
  n.handleStatus({ id: "wamid-dedupe", status: "sent", timestamp: "90" });
  assert.equal(
    db.prepare("SELECT status FROM outbox WHERE id=?").get(id).status,
    "read",
  );
  assert.equal(
    db
      .prepare("SELECT COUNT(*) n FROM webhook_events WHERE id=?")
      .get(
        require("crypto")
          .createHash("sha256")
          .update(JSON.stringify(event))
          .digest("hex"),
      ).n,
    1,
  );
});

test("corrected grades cancel obsolete pending results and require a fresh publication without blocking attendance", async () => {
  const e = require("../src/services/evaluations.service");
  const req = { session: { username: "test", role: "admin" } };
  const uid = require("node:crypto").randomUUID();
  db.prepare("INSERT INTO ciclos(nombre) VALUES('ANUAL')").run();
  db.prepare(
    "INSERT INTO usuarios(codigo,nombre,apellido,rol,turno,ciclo,uid) VALUES('GRADE001','DEMO','ALUMNO','estudiante','mañana','ANUAL',?)",
  ).run(uid);
  db.prepare(
    "INSERT INTO contacts(id,user_uid,name,phone,consent,active) VALUES('grade-contact',?,'APODERADO','+51900111222',1,1)",
  ).run(uid);
  let exam = e.saveExam(
    {
      titulo: "NOTAS Y AVISOS",
      ciclo: "ANUAL",
      fecha: "2026-11-09",
      definition: { totalQuestions: 1, keys: { 1: "A" } },
    },
    req,
  );
  exam = e.readyExam(exam.id, req);
  e.saveGrade(
    exam.id,
    { codigoEstudiante: "GRADE001", respuestas: { 1: "A" } },
    req,
  );
  db.prepare("UPDATE evaluaciones SET estado='publicado' WHERE id=?").run(
    exam.id,
  );
  exam = e.getExam(exam.id);
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
  assert.equal(
    db.prepare("SELECT status FROM outbox WHERE id=?").get(original.id).status,
    "cancelled",
  );
  assert.equal(e.getExam(exam.id).estado, "listo");
  assert.equal(n.resultState(JSON.parse(original.payload)), "stale");
  assert.throws(() => n.notifyResults(e.getExam(exam.id), req), /Publica/);
  // A valid grade waiting for publication must not occupy the limited send batch.
  db.prepare("UPDATE evaluaciones SET estado='publicado' WHERE id=?").run(
    exam.id,
  );
  assert.equal(n.notifyResults(e.getExam(exam.id), req), 1);
  db.prepare("UPDATE evaluaciones SET estado='listo' WHERE id=?").run(exam.id);
  const attendance = job("attendance-during-review");
  const sent = [];
  await n.processOutbox(async (_, options) => {
    const body = JSON.parse(options.body);
    sent.push(body.biz_opaque_callback_data);
    return new Response(
      JSON.stringify({
        messages: [{ id: "wamid-" + body.biz_opaque_callback_data }],
      }),
      { status: 200 },
    );
  });
  assert(sent.includes(attendance));
  assert(
    !sent.some(
      (id) =>
        db.prepare("SELECT kind FROM outbox WHERE id=?").get(id).kind ===
        "results",
    ),
  );
  db.prepare("UPDATE evaluaciones SET estado='publicado' WHERE id=?").run(
    exam.id,
  );
  await n.processOutbox(async (_, options) => {
    const body = JSON.parse(options.body);
    sent.push(body.biz_opaque_callback_data);
    return new Response(
      JSON.stringify({
        messages: [{ id: "wamid-" + body.biz_opaque_callback_data }],
      }),
      { status: 200 },
    );
  });
  assert(
    sent.some(
      (id) =>
        db.prepare("SELECT kind FROM outbox WHERE id=?").get(id).kind ===
        "results",
    ),
  );
});
