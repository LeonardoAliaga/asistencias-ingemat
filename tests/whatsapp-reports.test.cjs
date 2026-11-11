const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  crypto = require("node:crypto");
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ingemat-wa-reports-"));
process.env.DATA_DIR = directory;
process.env.NODE_ENV = "test";
process.env.DISABLE_MIGRATION_BACKUP = "1";
process.env.ADMIN_INITIAL_PASSWORD = "Report-test-password-2026";
const db = require("../src/database/db");
const baileys = require("../src/services/baileys.service");
const groups = require("../src/services/whatsapp-groups.service");
const notifications = require("../src/services/notifications.service");
const settings = require("../src/services/notification-config.service");
const storage = require("../src/services/whatsapp-report-storage.service");
const { createCanvas } = require("@napi-rs/canvas");
const { createApp } = require("../app");
const { hashPassword } = require("../src/services/auth.service");
const g1 = {
  id: "120363123456789@g.us",
  subject: "INGEMAT Anual Mañana",
  size: 30,
};
const g2 = {
  id: "120363987654321@g.us",
  subject: "Semestral - Tarde",
  size: 25,
};
let connected = true,
  base,
  server,
  admin,
  desk,
  teacher,
  guest;
baileys.status = () => ({
  state: connected ? "connected" : "error",
  connected,
  note: "Estado de prueba",
});
baileys.listGroups = async () => [g1, g2];
const pngCanvas = createCanvas(1100, 1800),
  ctx = pngCanvas.getContext("2d");
ctx.fillStyle = "#fdfbf7";
ctx.fillRect(0, 0, 1100, 1800);
ctx.fillStyle = "#0f172a";
ctx.font = "bold 24px sans-serif";
ctx.fillText("INGEMAT - REPORTE DE PRUEBA", 40, 60);
for (let y = 140; y < 1750; y += 38) {
  ctx.fillStyle = "#334155";
  ctx.fillText(`Curso y resultado de prueba - ${y}`, 40, y);
}
const png = pngCanvas.toBuffer("image/png");
async function client(username) {
  const cookies = new Map();
  let csrf = "";
  async function call(url, { method = "GET", body } = {}) {
    const headers = {
      Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join(";"),
    };
    if (method !== "GET") headers["x-csrf-token"] = csrf;
    if (body !== undefined && !(body instanceof FormData))
      headers["Content-Type"] = "application/json";
    const response = await fetch(base + url, {
      method,
      headers,
      body:
        body === undefined
          ? undefined
          : body instanceof FormData
            ? body
            : JSON.stringify(body),
      redirect: "manual",
    });
    for (const line of response.headers.getSetCookie()) {
      const [pair] = line.split(";");
      const [key, ...rest] = pair.split("=");
      cookies.set(key, rest.join("="));
      if (key === "ingemat.csrf") csrf = decodeURIComponent(rest.join("="));
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    let data;
    try {
      data = JSON.parse(bytes.toString());
    } catch {
      data = null;
    }
    return { status: response.status, data, bytes, headers: response.headers };
  }
  await call("/api/session");
  if (username)
    assert.equal(
      (
        await call("/admin/login", {
          method: "POST",
          body: { username, password: process.env.ADMIN_INITIAL_PASSWORD },
        })
      ).status,
      200,
    );
  return call;
}
function form({
  studentCode = "WA01",
  contactId = "guardian",
  format = "png",
  requestId = crypto.randomUUID(),
  buffer = png,
} = {}) {
  const body = new FormData();
  body.append("studentCode", studentCode);
  body.append("contactId", contactId);
  body.append("format", format);
  body.append("period", "Todas las semanas registradas");
  body.append("requestId", requestId);
  body.append(
    "breaks",
    JSON.stringify(Array.from({ length: 44 }, (_, i) => 152 + i * 38)),
  );
  body.append(
    "report",
    new Blob([buffer], { type: "image/png" }),
    "reporte.png",
  );
  return body;
}
before(async () => {
  server = createApp().listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
  for (const role of ["recepcion", "docente"])
    db.prepare(
      "INSERT INTO accounts(username,password_hash,role,must_change_password) VALUES(?,?,?,0)",
    ).run(role, hashPassword(process.env.ADMIN_INITIAL_PASSWORD), role);
  db.prepare("INSERT OR IGNORE INTO ciclos(nombre) VALUES('ANUAL')").run();
  for (const code of ["WA01", "WA02"])
    db.prepare(
      "INSERT INTO usuarios(codigo,nombre,apellido,rol,turno,ciclo,uid) VALUES(?,'MARÍA','MUÑOZ','estudiante','mañana','ANUAL',?)",
    ).run(code, code);
  db.prepare(
    "INSERT INTO contacts(id,user_uid,name,phone,consent,active) VALUES('guardian','WA01','Apoderado autorizado','+51900000001',1,1),('no-consent','WA01','Sin autorización','+51900000002',0,1),('other','WA02','Otro estudiante','+51900000003',1,1)",
  ).run();
  require("../src/services/attendance.service").register(
    "WA01",
    { session: { username: "admin", role: "admin" } },
    new Date("2032-01-15T13:00:00Z"),
  );
  settings.storeConfig({ ...settings.getConfig(), enabled: true });
  [admin, desk, teacher, guest] = await Promise.all([
    client("admin"),
    client("recepcion"),
    client("docente"),
    client(),
  ]);
});
after(async () => {
  require("../src/services/workers").stop();
  await new Promise((r) => server.close(r));
  db.close();
  fs.rmSync(directory, { recursive: true, force: true });
});
test("group search handles accents, reordered words and small typing mistakes", () => {
  assert.deepEqual(groups.searchGroups([g1, g2], "manana anaul"), [g1]);
  assert.deepEqual(groups.searchGroups([g1, g2], "TÁRDE semestral"), [g2]);
  assert.deepEqual(groups.searchGroups([g1, g2], "inexistente"), []);
});
test("group mapping is admin-only, validates actual membership and is visible to reception", async () => {
  assert.equal((await guest("/api/v2/whatsapp/groups")).status, 401);
  assert.equal((await teacher("/api/v2/whatsapp/groups")).status, 403);
  assert.equal(
    (
      await desk("/api/v2/whatsapp/attendance-groups", {
        method: "PUT",
        body: { cycle: "ANUAL", groupId: g1.id },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await admin("/api/v2/whatsapp/attendance-groups", {
        method: "PUT",
        body: { cycle: "ANUAL", groupId: "120363111111111@g.us" },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await admin("/api/v2/whatsapp/attendance-groups", {
        method: "PUT",
        body: { cycle: "ANUAL", groupId: g1.id },
      })
    ).status,
    200,
  );
  assert.equal(
    (await desk("/api/v2/whatsapp/attendance-target?cycle=ANUAL")).data.target
      .id,
    g1.id,
  );
  connected = false;
  assert.equal((await admin("/api/v2/whatsapp/groups?refresh=1")).status, 409);
  connected = true;
});
test("student report uploads require authorization, valid images and matching student contacts", async () => {
  assert.equal(
    (
      await guest("/api/v2/whatsapp/student-report", {
        method: "POST",
        body: form(),
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await desk("/api/v2/whatsapp/student-report", {
        method: "POST",
        body: form(),
      })
    ).status,
    403,
  );
  assert.deepEqual(
    (
      await admin("/api/v2/whatsapp/student-contacts?studentCode=WA01")
    ).data.contacts.map((c) => c.id),
    ["guardian"],
  );
  for (const contactId of ["no-consent", "other"])
    assert.equal(
      (
        await admin("/api/v2/whatsapp/student-report", {
          method: "POST",
          body: form({ contactId }),
        })
      ).status,
      409,
    );
  assert.equal(
    (
      await admin("/api/v2/whatsapp/student-report", {
        method: "POST",
        body: form({ buffer: Buffer.from("not a PNG") }),
      })
    ).status,
    400,
  );
  assert.equal(fs.existsSync(storage.directory), false);
  const oversized = form({ buffer: Buffer.alloc(10 * 1024 * 1024 + 1) });
  const rejected = await admin("/api/v2/whatsapp/student-report", {
    method: "POST",
    body: oversized,
  });
  assert.equal(rejected.status, 413);
  assert.match(rejected.data.mensaje, /10 MB/);
  assert.equal(fs.existsSync(storage.directory), false);
});
test("PNG and paginated PDF reports persist privately and identical request IDs do not duplicate sends", async () => {
  for (const format of ["png", "pdf"]) {
    const requestId = crypto.randomUUID();
    const sent = await admin("/api/v2/whatsapp/student-report", {
      method: "POST",
      body: form({ format, requestId }),
    });
    assert.equal(sent.status, 202, JSON.stringify(sent.data));
    const count = fs.readdirSync(storage.directory).length;
    const again = await admin("/api/v2/whatsapp/student-report", {
      method: "POST",
      body: form({ format, requestId }),
    });
    assert.equal(again.data.id, sent.data.id);
    assert.equal(again.data.duplicate, true);
    assert.equal(fs.readdirSync(storage.directory).length, count);
    assert.equal(
      (await guest(`/api/v2/whatsapp/reports/${sent.data.id}/file`)).status,
      401,
    );
    assert.equal(
      (await desk(`/api/v2/whatsapp/reports/${sent.data.id}/file`)).status,
      403,
    );
    const file = await admin(`/api/v2/whatsapp/reports/${sent.data.id}/file`);
    assert.equal(file.status, 200);
    assert.equal(file.headers.get("cache-control"), "no-store");
    assert.match(file.headers.get("content-disposition"), /attachment/);
    if (format === "pdf") {
      assert.equal(file.bytes.subarray(0, 5).toString(), "%PDF-");
      // Documento académico real, no una imagen envuelta en páginas PDF.
      assert.match(file.bytes.toString("latin1"), /\/Type \/Page\b/);
      assert.doesNotMatch(file.bytes.toString("latin1"), /\/Subtype \/Image\b/);
      if (process.env.INGEMAT_REPORT_QA_DIR) {
        fs.mkdirSync(process.env.INGEMAT_REPORT_QA_DIR, { recursive: true });
        fs.writeFileSync(
          path.join(process.env.INGEMAT_REPORT_QA_DIR, "student-report.pdf"),
          file.bytes,
        );
      }
    } else assert(file.bytes.equals(png));
  }
});
test("daily report uses only the configured cycle group and reception can send the selected date", async () => {
  const body = {
    cycle: "ANUAL",
    date: "2032-01-15",
    shift: "mañana",
    groupId: g1.id,
    format: "png",
    requestId: crypto.randomUUID(),
  };
  assert.equal(
    (
      await teacher("/api/v2/whatsapp/attendance-report", {
        method: "POST",
        body,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await desk("/api/v2/whatsapp/attendance-report", {
        method: "POST",
        body: { ...body, groupId: g2.id },
      })
    ).status,
    409,
  );
  const queued = await desk("/api/v2/whatsapp/attendance-report", {
    method: "POST",
    body,
  });
  assert.equal(queued.status, 202, JSON.stringify(queued.data));
  assert.equal(
    (await desk(`/api/v2/whatsapp/reports/${queued.data.id}/file`)).status,
    200,
  );
  const sends = [];
  const old = baileys.sendMedia;
  baileys.sendMedia = async (...args) => {
    sends.push(args);
    return args[2];
  };
  try {
    await notifications.processOutbox();
  } finally {
    baileys.sendMedia = old;
  }
  assert.equal(sends.length, 3);
  assert(sends.some((a) => a[0] === g1.id && a[3].format === "png"));
  assert(sends.some((a) => a[0] === "+51900000001" && a[3].format === "pdf"));
  assert.equal(
    db.prepare("SELECT status FROM outbox WHERE id=?").get(queued.data.id)
      .status,
    "accepted",
  );
});
test("revoked contact or changed cycle group blocks pending and manually retried reports", async () => {
  const report = await admin("/api/v2/whatsapp/student-report", {
    method: "POST",
    body: form(),
  });
  db.prepare("UPDATE contacts SET consent=0 WHERE id='guardian'").run();
  await notifications.processOutbox(async () => {
    throw new Error("Must not send");
  });
  assert.equal(
    db.prepare("SELECT status FROM outbox WHERE id=?").get(report.data.id)
      .status,
    "cancelled",
  );
  db.prepare("UPDATE outbox SET status='unknown' WHERE id=?").run(
    report.data.id,
  );
  assert.equal(
    (
      await admin(`/api/v2/notifications/${report.data.id}/retry`, {
        method: "POST",
        body: { confirmNotDelivered: true },
      })
    ).status,
    409,
  );
  db.prepare("UPDATE contacts SET consent=1 WHERE id='guardian'").run();
  const pending = await desk("/api/v2/whatsapp/attendance-report", {
    method: "POST",
    body: {
      cycle: "ANUAL",
      date: "2032-01-15",
      groupId: g1.id,
      format: "pdf",
      requestId: crypto.randomUUID(),
    },
  });
  assert.equal(pending.status, 202, JSON.stringify(pending.data));
  await admin("/api/v2/whatsapp/attendance-groups", {
    method: "PUT",
    body: { cycle: "ANUAL", groupId: g2.id },
  });
  assert.equal(
    db.prepare("SELECT status FROM outbox WHERE id=?").get(pending.data.id)
      .status,
    "cancelled",
  );
});
test("explicit report sends work with automatic notices disabled without sending queued automatic notices", async () => {
  settings.storeConfig({ ...settings.getConfig(), enabled: false });
  const automatic = notifications.enqueue({
    eventKey: "automatic-off",
    recipient: "+51900000001",
    kind: "attendance",
    payload: { parameters: ["DEMO", "2032-01-15", "08:00", "puntual"] },
  });
  const report = await admin("/api/v2/whatsapp/student-report", {
    method: "POST",
    body: form(),
  });
  assert.equal(report.status, 202);
  const sent = [];
  await notifications.processOutbox(async (row) => {
    sent.push(row.kind);
    return row.id.replaceAll("-", "").toUpperCase();
  });
  assert.deepEqual(sent, ["student_report"]);
  assert.equal(
    db.prepare("SELECT status FROM outbox WHERE id=?").get(automatic).status,
    "pending",
  );
});
test("parallel requests with the same identity cannot silently change the report file", async () => {
  const requestId = crypto.randomUUID(),
    files = fs.readdirSync(storage.directory).length;
  const responses = await Promise.all([
    admin("/api/v2/whatsapp/student-report", {
      method: "POST",
      body: form({ requestId, format: "png" }),
    }),
    admin("/api/v2/whatsapp/student-report", {
      method: "POST",
      body: form({ requestId, format: "pdf" }),
    }),
  ]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [202, 409]);
  assert.equal(fs.readdirSync(storage.directory).length, files + 1);
  assert.equal(
    db
      .prepare("SELECT count(*) AS n FROM outbox WHERE event_key LIKE ?")
      .get(`%:${requestId}`).n,
    1,
  );
});
test("startup reconnects even with notices disabled and does not start duplicate workers", () => {
  const workers = require("../src/services/workers");
  let connects = 0;
  const original = baileys.connect;
  baileys.connect = () => {
    connects++;
  };
  settings.storeConfig({ ...settings.getConfig(), enabled: false });
  try {
    workers.start();
    workers.start();
    assert.equal(connects, 1);
    assert.equal(settings.getConfig().enabled, false);
  } finally {
    workers.stop();
    baileys.connect = original;
  }
});

test("descarga y WhatsApp comparten el mismo PDF académico con tablas reales", async () => {
  const download=await admin("/api/evaluaciones/reporte-estudiante/WA01/pdf?week=TODAS");
  assert.equal(download.status,200);
  assert.equal(download.headers.get("content-type"),"application/pdf");
  const sent=await admin("/api/v2/whatsapp/student-report",{
    method:"POST",body:form({format:"pdf",requestId:crypto.randomUUID()}),
  });
  assert.equal(sent.status,202,JSON.stringify(sent.data));
  const message=await admin("/api/v2/whatsapp/reports/"+sent.data.id+"/file");
  assert.equal(message.status,200);
  assert(message.bytes.equals(download.bytes),"La descarga y el envío deben generar el mismo documento.");
  assert.doesNotMatch(download.bytes.toString("latin1"),/\/Subtype \/Image\b/);
  assert.equal((await guest("/api/evaluaciones/reporte-estudiante/WA01/pdf")).status,401);
});
test("envío por lote valida el ciclo, el consentimiento, el tamaño y la identidad del lote", async () => {
  const preview=await admin("/api/v2/whatsapp/batch-students?cycle=ANUAL");
  assert.equal(preview.status,200);
  assert.deepEqual(preview.data.students.map(s=>s.codigo),["WA01","WA02"]);
  assert.deepEqual(preview.data.students.find(s=>s.codigo==="WA01").contacts.map(c=>c.id),["guardian"]);
  assert.equal((await guest("/api/v2/whatsapp/batch-students?cycle=ANUAL")).status,401);
  assert.equal((await desk("/api/v2/whatsapp/batch-students?cycle=ANUAL")).status,403);
  assert.equal((await admin("/api/v2/whatsapp/batch-students?cycle=NADA")).status,404);
  const requestId=crypto.randomUUID();
  const body={cycle:"ANUAL",format:"pdf",week:"TODAS",requestId,
    items:[{code:"WA01",contactId:"guardian"},{code:"WA02",contactId:"other"}]};
  assert.equal((await desk("/api/v2/whatsapp/batch-student-reports",{method:"POST",body})).status,403);
  assert.equal((await admin("/api/v2/whatsapp/batch-student-reports",{
    method:"POST",body:{...body,items:[{code:"WA01",contactId:"no-consent"}]},
  })).status,409);
  assert.equal((await admin("/api/v2/whatsapp/batch-student-reports",{
    method:"POST",body:{...body,items:[{code:"WA01",contactId:"guardian"},{code:"WA01",contactId:"guardian"}]},
  })).status,400);
  const startedAt=Date.now();
  const sent=await admin("/api/v2/whatsapp/batch-student-reports",{method:"POST",body});
  const finishedAt=Date.now();
  assert.equal(sent.status,202,JSON.stringify(sent.data));
  assert.equal(sent.data.enqueued,2);
  assert.deepEqual(sent.data.spacingRangeSeconds,{min:10,max:15});
  const rows=sent.data.results.map(x=>db.prepare("SELECT * FROM outbox WHERE id=?").get(x.id));
  assert(rows.every(r=>r.kind==="student_report"));
  assert.equal(rows[0].next_attempt_at,0,"El primer reporte del lote debe estar listo para enviarse.");
  assert(rows[1].next_attempt_at>=startedAt+10_000,"El segundo espera al menos 10 segundos.");
  assert(rows[1].next_attempt_at<=finishedAt+15_000,"El segundo espera como máximo 15 segundos.");
  const outboxResponse=await admin("/api/v2/notifications");
  assert.equal(outboxResponse.status,200);
  const entries=sent.data.results.map(item=>outboxResponse.data.outbox.find(row=>row.id===item.id));
  assert(entries.every(entry=>entry && entry.bulk_batch_id===requestId));
  assert(entries.every(entry=>entry && entry.student_code));
  assert.equal(entries[0].next_attempt_at,0,"El primer aviso debe seguir listo de inmediato.");
  assert(entries[1].next_attempt_at>=startedAt+10_000,"El segundo aviso debe tener la espera programada.");
  const first=await admin("/api/v2/whatsapp/reports/"+sent.data.results[0].id+"/file");
  assert.equal(first.status,200);
  assert.doesNotMatch(first.bytes.toString("latin1"),/\/Subtype \/Image\b/);
  // Otro lote no debe adelantarse a los reportes que ya tienen un turno asignado.
  const another=await admin("/api/v2/whatsapp/batch-student-reports",{
    method:"POST",
    body:{...body,requestId:crypto.randomUUID(),items:[{code:"WA02",contactId:"other"}]},
  });
  assert.equal(another.status,202,JSON.stringify(another.data));
  const later=db.prepare("SELECT next_attempt_at FROM outbox WHERE id=?").get(another.data.results[0].id);
  assert(later.next_attempt_at>=rows[1].next_attempt_at+10_000);
  assert(later.next_attempt_at<=rows[1].next_attempt_at+15_000);
  const same=await admin("/api/v2/whatsapp/batch-student-reports",{method:"POST",body});
  assert.equal(same.status,202,JSON.stringify(same.data));
  assert.equal(same.data.enqueued,0);
  assert.equal(same.data.duplicate,2);
  assert.deepEqual(same.data.results.map(x=>x.id),sent.data.results.map(x=>x.id));
});
