const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ingemat-test-"));
process.env.DATA_DIR = dir;
process.env.ADMIN_INITIAL_PASSWORD = "Test-only-secure-2026";
process.env.DISABLE_MIGRATION_BACKUP = "1";
process.env.NODE_ENV = "test";
const { createApp } = require("../app");
const db = require("../src/database/db");
const { grade } = require("../src/services/grading.service");
let server, base, admin, guest, exam;
async function client() {
  const jar = new Map();
  let csrf = "";
  const call = async (url, body, method = "GET") => {
    const headers = { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join(";") };
    if (body !== undefined && !(body instanceof FormData))
      headers["Content-Type"] = "application/json";
    if (method !== "GET") headers["x-csrf-token"] = csrf;
    const r = await fetch(base + url, {
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
    for (const line of r.headers.getSetCookie()) {
      const [pair] = line.split(";");
      const [k, ...v] = pair.split("=");
      jar.set(k, v.join("="));
      if (k === "ingemat.csrf") csrf = decodeURIComponent(v.join("="));
    }
    const buffer = Buffer.from(await r.arrayBuffer());
    const text = buffer.toString("utf8");
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { status: r.status, data, headers: r.headers, buffer };
  };
  await call("/api/session");
  return call;
}
before(async () => {
  server = createApp().listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
  admin = await client();
  guest = await client();
  assert.equal(
    (
      await admin(
        "/admin/login",
        { username: "admin", password: process.env.ADMIN_INITIAL_PASSWORD },
        "POST",
      )
    ).status,
    200,
  );
});
after(async () => {
  await new Promise((r) => server.close(r));
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
test("private APIs and direct admin HTML require a session, and writes require CSRF", async () => {
  assert.equal((await guest("/api/evaluaciones")).status, 401);
  assert.equal((await guest("/api/biblioteca")).status, 401);
  assert.equal((await guest("/pages/admin.html")).status, 302);
  const r = await fetch(base + "/api/ciclos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(r.status, 403);
});
test("create cycle, students and validated exam through HTTP", async () => {
  assert.equal(
    (await admin("/api/ciclos", { nombre: "INTENSIVO" }, "POST")).status,
    201,
  );
  for (const code of ["T001", "T002", "T003"]) {
    const r = await admin(
      "/api/usuarios",
      {
        codigo: code,
        nombre: "ALUMNO",
        apellido: code,
        rol: "estudiante",
        turno: "mañana",
        ciclo: "ANUAL",
      },
      "POST",
    );
    assert.equal(r.status, 201, JSON.stringify(r.data));
  }
  assert.equal(
    db.prepare("SELECT COUNT(DISTINCT uid) n FROM usuarios").get().n,
    3,
  );
  const definition = {
    totalQuestions: 4,
    areas: [
      { code: "A", name: "Salud", requiredQuestions: 2 },
      { code: "C", name: "Ingeniería", requiredQuestions: 2 },
    ],
    sections: [
      {
        name: "General",
        questions: [1, 2, 3, 4],
        rules: { A: { questions: [1, 2] }, C: { questions: [3, 4] } },
      },
    ],
    keys: { 1: "A", 2: "B", 3: "C", 4: "D" },
  };
  let r = await admin(
    "/api/v2/exams",
    { titulo: "PRUEBA", ciclo: "ANUAL", fecha: "2026-11-08", definition },
    "POST",
  );
  assert.equal(r.status, 201, JSON.stringify(r.data));
  exam = r.data;
  r = await admin(`/api/v2/exams/${exam.id}/ready`, {}, "POST");
  assert.equal(r.status, 200);
});
test("grade records, shared ranks, replacement reasons and key revisions retain history", async () => {
  for (const code of ["T001", "T002"]) {
    const r = await admin(
      `/api/v2/exams/${exam.id}/grade`,
      { codigoEstudiante: code, area: "A", respuestas: { 1: "A", 2: "B" } },
      "POST",
    );
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.resultado.posicion, 1);
  }
  let r = await admin(
    `/api/v2/exams/${exam.id}/grade`,
    {
      codigoEstudiante: "T001",
      area: "Z",
      respuestas: { 1: "A" },
      allowReplace: true,
      reason: "Corrección de prueba",
    },
    "POST",
  );
  assert.equal(r.status, 400);
  r = await admin(
    `/api/v2/exams/${exam.id}/grade`,
    { codigoEstudiante: "T001", area: "A", respuestas: { 1: "A" } },
    "POST",
  );
  assert.equal(r.status, 409);
  assert.equal(
    (
      await admin(
        `/api/v2/exams/${exam.id}/grade`,
        {
          codigoEstudiante: "T001",
          area: "A",
          respuestas: { 1: "A" },
          allowReplace: true,
        },
        "POST",
      )
    ).status,
    400,
  );
  const keys = { ...exam.definition.keys, 1: { answers: ["B"] } };
  r = await admin(
    `/api/v2/exams/${exam.id}/revise-keys`,
    { keys, reason: "Cambio de clave oficial" },
    "POST",
  );
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(
    db
      .prepare(
        "SELECT puntajeTotal FROM respuestas_evaluacion WHERE codigoEstudiante=?",
      )
      .get("T001").puntajeTotal,
    18.875,
  );
  assert.equal(db.prepare("SELECT COUNT(*) n FROM grade_history").get().n, 2);
});
test("CSV preview detects duplicates and commit is atomic on conflicting grades", async () => {
  let r = await admin(
    `/api/v2/exams/${exam.id}/import-csv`,
    { csv: "codigo,area,version,1,2,3,4\nT003,A,A,A,B,,\nT001,A,A,A,B,," },
    "POST",
  );
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const id = r.data.id;
  const visible = await admin(`/api/v2/imports/${id}`);
  assert.equal(visible.status, 200);
  assert.deepEqual(visible.data.result.rows[0].identifiedStudent, {
    code: "T003",
    name: "T003 ALUMNO",
  });
  assert.equal((await guest(`/api/v2/imports/${id}`)).status, 401);
  r = await admin(`/api/v2/imports/${id}/commit`, { reviewVersion: 1 }, "POST");
  assert.equal(r.status, 409);
  assert.equal(
    db
      .prepare("SELECT 1 FROM respuestas_evaluacion WHERE codigoEstudiante=?")
      .get("T003"),
    undefined,
  );
  assert.equal(
    db.prepare("SELECT status FROM import_batches WHERE id=?").get(id).status,
    "ready",
  );
  r = await admin(
    `/api/v2/exams/${exam.id}/import-csv`,
    { csv: "codigo,area,version,1,2,3,4\nT003,A,A,A,B,,\nT003,A,A,A,B,," },
    "POST",
  );
  assert.equal(r.status, 400);
});
test("contacts need explicit authorization and unknown areas cannot print sheets", async () => {
  let r = await admin(
    "/api/v2/students/T001/contacts",
    { name: "APODERADO", phone: "+51900111222", consent: false },
    "POST",
  );
  assert.equal(r.status, 200);
  assert.equal(db.prepare("SELECT consent FROM contacts").get().consent, 0);
  r = await admin(`/api/v2/exams/${exam.id}/sheets.pdf?code=T001`);
  assert.equal(r.status, 400);
  await admin("/api/v2/students/T001", { area: "A" }, "PATCH");
  r = await admin(`/api/v2/exams/${exam.id}/sheets.pdf?code=T001`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("content-type"), "application/pdf");
});
test("attendance requires an authorized account, rejects duplicates and removes pairing endpoints", async () => {
  assert.equal(
    (await guest("/api/registrar", { codigo: "T001" }, "POST")).status,
    401,
  );
  assert.equal(
    (await guest("/api/kiosk/pair", { token: "retired" }, "POST")).status,
    404,
  );
  assert.equal((await admin("/api/v2/kiosk-token", {}, "POST")).status, 404);
  assert.equal(
    Object.hasOwn((await guest("/api/session")).data, "kiosk"),
    false,
  );
  assert.equal(
    (
      await admin(
        "/api/v2/accounts",
        {
          username: "desk-test",
          password: "Reception-test-only-2026",
          role: "recepcion",
        },
        "POST",
      )
    ).status,
    201,
  );
  const desk = await client();
  await desk(
    "/admin/login",
    { username: "desk-test", password: "Reception-test-only-2026" },
    "POST",
  );
  assert.equal(
    (await desk("/api/registrar", { codigo: "T001" }, "POST")).status,
    200,
  );
  assert.equal(
    (await desk("/api/registrar", { codigo: "T001" }, "POST")).status,
    409,
  );
  assert.equal(
    (await desk("/api/registrar", { codigo: "T002J" }, "POST")).status,
    200,
  );
  assert.equal((await desk("/api/v2/exams")).status, 403);
  assert.equal(
    db.prepare("SELECT source FROM attendance WHERE student_code='T001'").get()
      .source,
    "operador",
  );
});
test("operator permissions and guide coverage are enforced", async () => {
  let r = await admin(
    "/api/v2/accounts",
    {
      username: "docente",
      password: "Teacher-test-only-2026",
      role: "docente",
    },
    "POST",
  );
  assert.equal(r.status, 201);
  const teacher = await client();
  await teacher(
    "/admin/login",
    { username: "docente", password: "Teacher-test-only-2026" },
    "POST",
  );
  assert.equal((await teacher("/api/v2/accounts")).status, 403);
  assert.equal((await guest("/api/v2/scanner/devices")).status, 401);
  assert.equal((await teacher("/api/v2/scanner/devices")).status, 403);
  assert.equal((await teacher("/api/v2/scanner/jobs", {}, "POST")).status, 403);
  assert.equal(
    (await teacher("/api/v2/scanner/jobs/unknown/file")).status,
    403,
  );
  assert.equal(
    (await admin("/api/v2/scanner/devices?driver=invalid")).status,
    400,
  );
  assert.equal((await teacher("/api/v2/notifications")).status, 403);
  assert.equal((await teacher("/api/v2/exams", {}, "POST")).status, 403);
  assert.equal(
    (
      await teacher(
        "/api/excel/justificar",
        { codigo: "T001", fecha: "01-01-2026" },
        "POST",
      )
    ).status,
    403,
  );
  await admin(
    "/api/v2/accounts",
    {
      username: "recepcion",
      password: "Reception-test-only-2026",
      role: "recepcion",
    },
    "POST",
  );
  const reception = await client();
  await reception(
    "/admin/login",
    { username: "recepcion", password: "Reception-test-only-2026" },
    "POST",
  );
  assert.equal(
    (await teacher("/api/registrar", { codigo: "T003" }, "POST")).status,
    403,
  );
  assert.equal((await reception("/api/evaluaciones")).status, 403);
  assert.equal((await reception("/api/v2/exams")).status, 403);
  const guide = await teacher("/api/v2/guide");
  assert.equal(guide.data.articles.length, 34);
  assert(guide.data.articles.every((a) => a.steps.length >= 5));
});
test("password change checks current password and keeps no plaintext credential", async () => {
  assert.equal(
    (
      await admin(
        "/admin/password",
        { nueva: "New-test-password-2026", actual: "WRONG" },
        "POST",
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await admin(
        "/admin/password",
        {
          nueva: "New-test-password-2026",
          actual: process.env.ADMIN_INITIAL_PASSWORD,
        },
        "POST",
      )
    ).status,
    200,
  );
  assert.match(
    db
      .prepare("SELECT password_hash FROM accounts WHERE username=?")
      .get("admin").password_hash,
    /^scrypt:/,
  );
  assert.equal(
    db
      .prepare("SELECT * FROM config_general WHERE clave='admin_password'")
      .get(),
    undefined,
  );
});

test("default schedules apply to unconfigured cycles, boundaries are punctual and Lima dates ignore server timezone", async () => {
  const helpers = require("../src/utils/helpers");
  const time = require("../src/utils/time");
  assert.equal(
    time.businessDate(new Date("2026-11-09T02:30:00Z")),
    "2026-11-08",
  );
  assert.equal(time.businessTime(new Date("2026-11-09T02:30:00Z")), "21:30");
  assert.equal(time.weekday(new Date("2026-11-09T02:30:00Z")), "D");
  const horarios = {
    mañana: { entrada: "09:00", tolerancia: "09:10" },
    tarde: { entrada: "16:00", tolerancia: "16:10" },
  };
  let r = await admin("/api/horarios", { ciclo: "DEFAULT", horarios }, "POST");
  assert.equal(r.status, 200);
  assert.equal(helpers.estadoAsistencia("ANUAL", "mañana", "09:00"), "puntual");
  assert.equal(
    helpers.estadoAsistencia("ANUAL", "mañana", "09:05"),
    "tolerancia",
  );
  assert.equal(helpers.estadoAsistencia("ANUAL", "mañana", "09:11"), "tarde");
  assert.equal(
    (
      await admin(
        "/api/horarios",
        {
          ciclo: "DEFAULT",
          horarios: {
            ...horarios,
            mañana: { entrada: "29:00", tolerancia: "29:10" },
          },
        },
        "POST",
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await admin(
        "/api/horarios",
        {
          ciclo: "DEFAULT",
          horarios: {
            ...horarios,
            mañana: { entrada: "09:00", tolerancia: "08:50" },
          },
        },
        "POST",
      )
    ).status,
    400,
  );
});
test("changing a student code and cycle preserves identity, contacts, printed sheets and academic history", async () => {
  const before = db.prepare("SELECT * FROM usuarios WHERE codigo='T001'").get();
  assert.equal(
    (await admin("/api/ciclos", { nombre: "SEMESTRAL" }, "POST")).status,
    409,
  );
  const r = await admin(
    "/api/usuarios/T001",
    {
      codigo: "T009",
      nombre: "ALUMNO",
      apellido: "CORREGIDO",
      rol: "estudiante",
      turno: "mañana",
      ciclo: "SEMESTRAL",
    },
    "PUT",
  );
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(
    db.prepare("SELECT uid FROM usuarios WHERE codigo='T009'").get().uid,
    before.uid,
  );
  assert.equal(
    db
      .prepare("SELECT COUNT(*) n FROM contacts WHERE user_uid=?")
      .get(before.uid).n,
    1,
  );
  assert.equal(
    db
      .prepare("SELECT COUNT(*) n FROM grade_history WHERE student_code='T001'")
      .get().n,
    0,
  );
  assert.equal(
    db
      .prepare("SELECT COUNT(*) n FROM grade_history WHERE student_code='T009'")
      .get().n,
    1,
  );
  assert.equal(
    db.prepare("SELECT student_code FROM omr_sheets").get().student_code,
    "T009",
  );
  assert.equal(
    db.prepare("SELECT student_code FROM attendance").get().student_code,
    "T009",
  );
  const selected = await admin(`/api/v2/exams/${exam.id}`);
  assert(selected.data.eligibleStudentCodes.includes("T009"));
  assert.equal(
    (await admin(`/api/v2/exams/${exam.id}/sheets.pdf?code=T009`)).status,
    200,
  );
  const corrected = await admin(
    `/api/v2/exams/${exam.id}/grade`,
    {
      codigoEstudiante: "T009",
      area: "A",
      respuestas: { 1: "B", 2: "B" },
      allowReplace: true,
      reason: "Verificación después de corregir matrícula",
    },
    "POST",
  );
  assert.equal(corrected.status, 200, JSON.stringify(corrected.data));
  assert.equal(
    db
      .prepare(
        "SELECT ciclo,nombreEstudiante FROM respuestas_evaluacion WHERE codigoEstudiante='T009'",
      )
      .get().ciclo,
    "ANUAL",
  );
  assert.equal(
    (await admin("/api/usuarios/T009", undefined, "DELETE")).status,
    409,
  );
});
test("paid WhatsApp endpoints are removed and Baileys controls require an administrator", async () => {
  assert.equal((await admin("/webhooks/whatsapp")).status,404);
  assert.equal((await admin("/whatsapp/api/status")).status,404);
  assert.equal((await guest("/api/v2/notifications/health")).status,401);
  const cfg = await admin("/api/v2/notifications");
  assert.equal(cfg.data.status.provider,"baileys");
  assert.equal(cfg.data.config.enabled,false);
  assert(!("attendanceTemplate" in cfg.data.config));
  assert.equal((await admin("/api/v2/notifications/config", {enabled:true},"PUT")).status,400);
  assert.equal((await admin("/api/v2/notifications/config", {enabled:false,provider:"meta_cloud"},"PUT")).status,400);
  assert.equal((await guest("/api/v2/notifications/baileys/connect",{},"POST")).status,401);
  assert.equal((await admin("/api/v2/notifications/baileys/qr")).status,409);
  assert.equal((await admin("/api/v2/notifications/baileys/stop",{},"POST")).status,200);
  assert.equal((await admin("/api/v2/notifications/config", {enabled:false},"PUT")).status,200);
});

test("academic exports are valid workbooks and referenced cycles/books cannot be removed", async () => {
  const ExcelJS = require("exceljs");
  const exported = await admin(`/api/evaluaciones/${exam.id}/excel`);
  assert.equal(exported.status, 200);
  // Decode via a direct authenticated session to preserve binary bytes.
  const session = await fetch(base + "/api/session");
  const cookies = session.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  const csrf = (await session.json()).csrfToken;
  const login = await fetch(base + "/admin/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookies,
      "x-csrf-token": csrf,
    },
    body: JSON.stringify({
      username: "admin",
      password: "New-test-password-2026",
    }),
  });
  const authenticated = login.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  const bytes = await fetch(base + `/api/evaluaciones/${exam.id}/excel`, {
    headers: { Cookie: authenticated },
  });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(await bytes.arrayBuffer()));
  assert(workbook.worksheets.length > 0);
  assert(workbook.worksheets[0].rowCount >= 3);
  assert.equal(
    (await admin("/api/ciclos/ANUAL", undefined, "DELETE")).status,
    409,
  );
  let r = await admin(
    "/api/biblioteca/libro",
    { codigo: "LIB-TEST", titulo: "Álgebra sintética", seccion: "MATEMÁTICA" },
    "POST",
  );
  assert.equal(r.status, 200);
  const bookId = r.data.libro.id;
  db.prepare("UPDATE libros SET stock=2 WHERE id=?").run(bookId);
  const first = await admin(
    "/api/biblioteca/prestamo",
    { codigoLibro: "LIB-TEST", codigoUsuario: "T009" },
    "POST",
  );
  const second = await admin(
    "/api/biblioteca/prestamo",
    { codigoLibro: "LIB-TEST", codigoUsuario: "T002" },
    "POST",
  );
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(
    (
      await admin(
        "/api/biblioteca/prestamo",
        { codigoLibro: "LIB-TEST", codigoUsuario: "T003" },
        "POST",
      )
    ).status,
    400,
  );
  assert.equal(
    (await admin("/api/biblioteca/libro/" + bookId, undefined, "DELETE"))
      .status,
    409,
  );
  assert.equal(
    (
      await admin(
        "/api/biblioteca/devolucion",
        { codigoLibro: "LIB-TEST" },
        "POST",
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await admin(
        "/api/biblioteca/devolucion",
        { idPrestamo: first.data.prestamo.id },
        "POST",
      )
    ).status,
    200,
  );
  assert.equal(
    db.prepare("SELECT prestados FROM libros WHERE id=?").get(bookId).prestados,
    1,
  );
  assert.equal(
    (
      await admin(
        "/api/biblioteca/devolucion",
        { idPrestamo: first.data.prestamo.id },
        "POST",
      )
    ).status,
    404,
  );
});
test("historical Excel routes reject traversal and ambiguous names", async () => {
  const ExcelJS = require("exceljs");
  const recordsDir = require("../src/config").recordsDir;
  const wb = new ExcelJS.Workbook(),
    sheet = wb.addWorksheet("Mañana");
  sheet.addRow(["N°", "Nombre", "Ciclo", "Turno", "Hora"]);
  sheet.addRow([1, "CORREGIDO ALUMNO", "SEMESTRAL", "mañana", "FALTA"]);
  sheet.addRow([2, "CORREGIDO ALUMNO", "SEMESTRAL", "mañana", "FALTA"]);
  await wb.xlsx.writeFile(path.join(recordsDir, "01-01-2026.xlsx"));
  assert.equal(
    (
      await admin(
        "/api/excel/justificar",
        { codigo: "T009", fecha: "01-01-2026" },
        "POST",
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await admin(
        "/api/excel/section-data?archivo=..%5Cdata%5Carchivo.xlsx&ciclo=ANUAL&turno=mañana",
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await admin(
        "/api/excel/report-image?archivo=..%2Farchivo.xlsx&ciclo=ANUAL&turno=mañana",
      )
    ).status,
    400,
  );
});

test("attendance PNG export requires an operator, applies filters and returns the classic image", async () => {
  const service = require("../src/services/attendance.service");
  service.register(
    "T002",
    { session: { username: "admin", role: "admin" } },
    new Date("2031-02-17T13:30:00Z"),
  );
  const query = "date=2031-02-17&ciclo=ANUAL&turno=mañana";
  const r = await admin(`/api/v2/attendance/image?${query}`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type"), /^image\/png/);
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.deepEqual(
    [...r.buffer.subarray(0, 8)],
    [137, 80, 78, 71, 13, 10, 26, 10],
  );
  assert.equal(r.buffer.readUInt32BE(16), 560);
  assert.equal(r.buffer.readUInt32BE(20), 125);
  assert.equal((await guest(`/api/v2/attendance/image?${query}`)).status, 401);
  assert.equal(
    (await admin("/api/v2/attendance/image?date=2031-02-30")).status,
    400,
  );
  assert.equal(
    (await admin("/api/v2/attendance/image?date=2031-02-17&turno=tarde"))
      .status,
    404,
  );
});

test("built-in repaso template coexists with saved templates without modifying existing exams", async () => {
  const beforeTemplates = db
    .prepare("SELECT * FROM exam_templates ORDER BY id")
    .all();
  const beforeExams = db
    .prepare("SELECT id,definition FROM evaluaciones ORDER BY id")
    .all();
  assert.equal((await guest("/api/v2/templates")).status, 401);
  const response = await admin("/api/v2/templates");
  assert.equal(response.status, 200);
  const preset = response.data.find((t) => t.id === "builtin:repaso-unmsm");
  assert.equal(preset.isDefault, true);
  assert.equal(preset.definition.sections.length, 19);
  assert.deepEqual(
    db.prepare("SELECT * FROM exam_templates ORDER BY id").all(),
    beforeTemplates,
  );
  assert.deepEqual(
    db.prepare("SELECT id,definition FROM evaluaciones ORDER BY id").all(),
    beforeExams,
  );
  const saved = await admin(
    "/api/v2/templates",
    { name: "Repaso adaptado", definition: preset.definition },
    "POST",
  );
  assert.equal(saved.status, 201, JSON.stringify(saved.data));
  const templates = (await admin("/api/v2/templates")).data;
  assert.ok(templates.some((t) => t.name === "Repaso adaptado" && !t.builtIn));
  assert.equal(templates.filter((t) => t.isDefault).length, 1);
  const draft = await admin(
    "/api/v2/exams",
    {
      titulo: "Repaso sin claves",
      ciclo: "ANUAL",
      fecha: "2026-11-09",
      definition: preset.definition,
    },
    "POST",
  );
  assert.equal(draft.status, 201, JSON.stringify(draft.data));
  assert.equal(draft.data.definition.totalQuestions, 120);
  const ready = await admin(`/api/v2/exams/${draft.data.id}/ready`, {}, "POST");
  assert.equal(ready.status, 400);
  assert.match(
    ready.data.error || ready.data.mensaje || JSON.stringify(ready.data),
    /Falta la clave/,
  );
});

test("scan uploads are idempotent per operator and reject cross-exam receipt reuse", async () => {
  const preset =
    require("../src/services/exam-presets.service").listPresets()[0].definition;
  preset.keys = Object.fromEntries(
    Array.from({ length: 120 }, (_, i) => [i + 1, "A"]),
  );
  const created = await admin(
    "/api/v2/exams",
    {
      titulo: "CÁMARA HTTP",
      ciclo: "ANUAL",
      fecha: "2026-11-09",
      definition: preset,
    },
    "POST",
  );
  assert.equal(created.status, 201);
  const id = created.data.id;
  assert.equal(
    (await admin(`/api/v2/exams/${id}/ready`, {}, "POST")).status,
    200,
  );
  const requestId = require("node:crypto").randomUUID();
  function upload(token = requestId) {
    const data = new FormData();
    data.append("requestId", token);
    data.append(
      "files",
      new Blob(
        ["synthetic upload; decoding covered in OMR integration tests"],
        { type: "image/jpeg" },
      ),
      "captura-1.jpg",
    );
    return data;
  }
  const first = await admin(`/api/v2/exams/${id}/scan`, upload(), "POST");
  assert.equal(first.status, 202);
  const retry = await admin(`/api/v2/exams/${id}/scan`, upload(), "POST");
  assert.equal(retry.status, 202);
  assert.equal(first.data.id, retry.data.id);
  assert.equal(
    db
      .prepare("SELECT COUNT(*) n FROM import_batches WHERE evaluation_id=?")
      .get(id).n,
    1,
  );
  assert.equal(
    db
      .prepare("SELECT COUNT(*) n FROM scan_requests WHERE request_id=?")
      .get(requestId).n,
    1,
  );
  assert.equal(
    (await admin(`/api/v2/exams/${exam.id}/scan`, upload(), "POST")).status,
    409,
  );
  assert.equal(
    (await admin(`/api/v2/exams/${id}/scan`, upload("bad-key"), "POST")).status,
    400,
  );
  assert.equal(
    (await guest(`/api/v2/exams/${id}/scan`, upload(), "POST")).status,
    401,
  );
  assert.deepEqual(fs.readdirSync(path.join(dir, "temp")), []);
});

test("exception revisions recalculate stored answers and keep booklet versions fixed", async () => {
  let result = await admin(
    "/api/v2/exams",
    {
      titulo: "REVISIÓN DE REGLAS",
      ciclo: "ANUAL",
      fecha: "2026-11-09",
      definition: {
        totalQuestions: 4,
        keys: { 1: "A", 2: "A", 3: "A", 4: "A" },
        forms: { A: [1, 2, 3, 4], B: [4, 3, 2, 1] },
      },
    },
    "POST",
  );
  assert.equal(result.status, 201);
  const id = result.data.id;
  assert.equal(
    (await admin(`/api/v2/exams/${id}/ready`, {}, "POST")).status,
    200,
  );
  result = await admin(
    `/api/v2/exams/${id}/grade`,
    {
      codigoEstudiante: "T002",
      area: "GENERAL",
      form: "B",
      respuestas: { 1: "B", 2: "B", 3: "B", 4: "B" },
    },
    "POST",
  );
  assert.equal(result.status, 200);
  assert.equal(result.data.resultado.puntajeTotal, -4.5);
  const before = (await admin(`/api/v2/exams/${id}`)).data;
  const keys = structuredClone(before.definition.keys);
  keys[1].noPenalty = true;
  keys[2].optionScores = { A: 20, B: 5, C: 0, D: 0, E: 0 };
  keys[3].voidPolicy = "exclude";
  result = await admin(
    `/api/v2/exams/${id}/revise-keys`,
    { keys, reason: "Excepciones cotejadas con el reglamento" },
    "POST",
  );
  assert.equal(result.status, 200);
  assert.equal(result.data.revision, 2);
  assert.deepEqual(result.data.definition.forms, before.definition.forms);
  const rows = (await admin(`/api/v2/exams/${id}/results`)).data.rows;
  assert.equal(rows[0].puntajeTotal, 3.875);
  assert.equal(rows[0].detail.form, "B");
  result = await admin(
    `/api/v2/exams/${id}/revise-keys`,
    {
      keys,
      forms: { A: [4, 3, 2, 1], B: [1, 2, 3, 4] },
      reason: "Intento de cambiar el orden",
    },
    "POST",
  );
  assert.equal(result.status, 409);
  assert.match(result.data.mensaje, /versiones.*fijados/);
  assert.equal((await admin(`/api/v2/exams/${id}`)).data.revision, 2);
});

test("batch history cleanup is authenticated, reversible and preserves direct access to saved data", async () => {
  const id = require("node:crypto").randomUUID();
  db.prepare(
    "INSERT INTO import_batches(id,evaluation_id,revision,source,status,actor,result) VALUES(?,?,1,'omr','failed','admin','{}')",
  ).run(id, exam.id);
  assert.equal(
    (await guest("/api/v2/imports/clear-history", {}, "POST")).status,
    401,
  );
  assert.equal(
    (await admin("/api/v2/imports/clear-history", {}, "POST")).status,
    200,
  );
  assert(!(await admin("/api/v2/imports")).data.some((b) => b.id === id));
  assert.equal((await admin(`/api/v2/imports/${id}`)).data.id, id);
  assert.equal(
    (await admin("/api/v2/imports/restore-history", {}, "POST")).status,
    200,
  );
  assert((await admin("/api/v2/imports")).data.some((b) => b.id === id));
  assert.equal(
    (await guest("/api/v2/scanner/clear-failed", { examId: exam.id }, "POST"))
      .status,
    401,
  );
  assert.equal(
    (await admin("/api/v2/scanner/clear-failed", { examId: exam.id }, "POST"))
      .status,
    200,
  );
});

test("attendance deletion is authorized, atomic, audited and cancels only related unsent notices", async () => {
  const { randomUUID } = require("node:crypto");
  const attendance = require("../src/services/attendance.service");
  const uid = randomUUID();
  db.prepare(
    "INSERT INTO usuarios(codigo,nombre,apellido,rol,turno,ciclo,uid) VALUES('DELETE01','ANA','PRUEBA','estudiante','mañana','ANUAL',?)",
  ).run(uid);
  attendance.register(
    "DELETE01",
    { session: { username: "admin", role: "admin" } },
    new Date("2032-01-15T13:00:00Z"),
  );
  const record = attendance.list("2032-01-15")[0];
  const addNotice = (
    status,
    eventKey = `baileys:asistencia:${record.id}:${randomUUID()}`,
    kind = "attendance",
  ) => {
    const id = randomUUID();
    db.prepare(
      "INSERT INTO outbox(id,event_key,recipient,kind,payload,status,provider) VALUES(?,?,'+51900000001',?,'{}',?,'baileys')",
    ).run(id, eventKey, kind, status);
    return id;
  };
  const pending = ["pending", "retry", "failed"].map((status) =>
    addNotice(status),
  );
  const legacy = addNotice("pending", `asistencia:${record.id}:legacy`);
  const preserved = [
    "unknown",
    "sending",
    "accepted",
    "sent",
    "delivered",
    "read",
  ].map((status) => [addNotice(status), status]);
  const unrelated = addNotice(
    "pending",
    `baileys:asistencia:${record.id}extra:other`,
  );
  const results = addNotice(
    "pending",
    `baileys:asistencia:${record.id}:result`,
    "results",
  );
  const url = `/api/v2/attendance/${record.id}`;
  assert.equal((await guest(url, undefined, "DELETE")).status, 401);
  const teacher = await client();
  await teacher(
    "/admin/login",
    { username: "docente", password: "Teacher-test-only-2026" },
    "POST",
  );
  assert.equal((await teacher(url, undefined, "DELETE")).status, 403);
  const desk = await client();
  await desk(
    "/admin/login",
    { username: "desk-test", password: "Reception-test-only-2026" },
    "POST",
  );
  // If writing the audit fails, both the attendance and its pending notices must remain.
  db.exec(
    "CREATE TEMP TRIGGER reject_attendance_delete_audit BEFORE INSERT ON audit_events WHEN NEW.action='eliminar' AND NEW.entity='asistencia' BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END",
  );
  try {
    assert.equal((await admin(url, undefined, "DELETE")).status, 500);
    assert(db.prepare("SELECT 1 FROM attendance WHERE id=?").get(record.id));
    assert.equal(
      db.prepare("SELECT status FROM outbox WHERE id=?").get(pending[0]).status,
      "pending",
    );
  } finally {
    db.exec("DROP TRIGGER reject_attendance_delete_audit");
  }
  const removed = await desk(url, undefined, "DELETE");
  assert.equal(removed.status, 200);
  assert.equal(removed.data.cancelledNotifications, 4);
  assert.equal(
    (await admin("/api/v2/attendance?date=2032-01-15")).data.rows.length,
    0,
  );
  assert.equal(attendance.workbook("2032-01-15").getWorksheet(1).rowCount, 1);
  for (const id of [...pending, legacy])
    assert.equal(
      db.prepare("SELECT status FROM outbox WHERE id=?").get(id).status,
      "cancelled",
    );
  for (const [id, status] of [
    ...preserved,
    [unrelated, "pending"],
    [results, "pending"],
  ])
    assert.equal(
      db.prepare("SELECT status FROM outbox WHERE id=?").get(id).status,
      status,
    );
  const audit = db
    .prepare(
      "SELECT * FROM audit_events WHERE entity='asistencia' AND entity_id=? AND action='eliminar'",
    )
    .get(record.id);
  assert.equal(audit.actor, "desk-test");
  assert.deepEqual(JSON.parse(audit.details).record, record);
  assert.equal(
    (
      await admin(
        `/api/v2/notifications/${preserved[0][0]}/retry`,
        { confirmNotDelivered: true },
        "POST",
      )
    ).status,
    409,
  );
  assert.equal((await admin(url, undefined, "DELETE")).status, 404);
  assert.equal(
    (await admin("/api/registrar", { codigo: "DELETE01" }, "POST")).status,
    200,
  );
  assert.equal(
    (
      await admin(
        `/api/v2/attendance/${db.prepare("SELECT id FROM attendance WHERE student_code='DELETE01'").get().id}`,
        undefined,
        "DELETE",
      )
    ).status,
    200,
  );
});

test("new students store their area and optional authorized guardian atomically", async () => {
  const input={codigo:"GUARD01",nombre:"ANA",apellido:"MUÑOZ",rol:"estudiante",turno:"mañana",ciclo:"ANUAL",area:"c",guardian:{name:"María Ñahui",phone:"+51 900 000 001",consent:true}};
  const invalid=await admin("/api/usuarios",{...input,guardian:{name:"Sin teléfono"}},"POST");
  assert.equal(invalid.status,400);
  assert(!db.prepare("SELECT 1 FROM usuarios WHERE codigo=?").get(input.codigo));
  const created=await admin("/api/usuarios",input,"POST");
  assert.equal(created.status,201,JSON.stringify(created.data));
  const user=db.prepare("SELECT uid,area FROM usuarios WHERE codigo=?").get(input.codigo);
  assert.equal(user.area,"C");
  assert.deepEqual(db.prepare("SELECT name,phone,consent FROM contacts WHERE user_uid=?").get(user.uid),{name:"María Ñahui",phone:"+51900000001",consent:1});
  db.exec("CREATE TEMP TRIGGER reject_guardian BEFORE INSERT ON contacts BEGIN SELECT RAISE(ABORT,'synthetic contact failure'); END");
  try {
    assert.equal((await admin("/api/usuarios",{...input,codigo:"GUARD02"},"POST")).status,500);
    assert(!db.prepare("SELECT 1 FROM usuarios WHERE codigo='GUARD02'").get());
  } finally {db.exec("DROP TRIGGER reject_guardian");}
  db.prepare("DELETE FROM contacts WHERE user_uid=?").run(user.uid);
  db.prepare("DELETE FROM usuarios WHERE codigo=?").run(input.codigo);
});


test("editing a student updates area and guardian consent atomically without losing contacts", async () => {
  const code = "EDITGUARD01";
  const baseUser = {
    codigo: code, nombre: "ANA", apellido: "PRUEBA", rol: "estudiante",
    turno: "mañana", ciclo: "ANUAL", dias_asistencia: ["L"], area: "GENERAL",
  };
  assert.equal((await admin("/api/usuarios", baseUser, "POST")).status, 201);
  const uid = db.prepare("SELECT uid FROM usuarios WHERE codigo=?").get(code).uid;
  const guardian = { name: "María Ñahui", phone: "+51911111111", consent: true };
  try {
    let response = await admin("/api/usuarios/" + code, {
      ...baseUser, area: "B", guardians: [guardian],
    }, "PUT");
    assert.equal(response.status, 200, JSON.stringify(response.data));
    assert.equal(db.prepare("SELECT area FROM usuarios WHERE codigo=?").get(code).area, "B");
    const saved = db.prepare("SELECT id,name,phone,consent,active FROM contacts WHERE user_uid=?").get(uid);
    assert.deepEqual({name:saved.name,phone:saved.phone,consent:saved.consent,active:saved.active},
      {name:guardian.name,phone:guardian.phone,consent:1,active:1});
    const invalid = await admin("/api/usuarios/" + code, {
      ...baseUser, area: "E",
      guardians: [{ id:saved.id, name:"María Ñahui", phone:"911111111", consent:false }],
    }, "PUT");
    assert.equal(invalid.status, 400);
    assert.equal(db.prepare("SELECT area FROM usuarios WHERE codigo=?").get(code).area, "B");
    assert.equal(db.prepare("SELECT consent FROM contacts WHERE id=?").get(saved.id).consent, 1);
    response = await admin("/api/usuarios/" + code, {
      ...baseUser, codigo:"EDITGUARD02", area:"D", guardians:[
        {id:saved.id,name:"María actualizada",phone:guardian.phone,consent:false},
        {name:"José Apoderado",phone:"+51922222222",consent:true},
      ],
    }, "PUT");
    assert.equal(response.status, 200, JSON.stringify(response.data));
    assert.equal(db.prepare("SELECT area FROM usuarios WHERE codigo='EDITGUARD02'").get().area, "D");
    assert.equal(db.prepare("SELECT uid FROM usuarios WHERE codigo='EDITGUARD02'").get().uid, uid);
    let contacts = db.prepare("SELECT id,name,phone,consent,active FROM contacts WHERE user_uid=? ORDER BY phone").all(uid);
    assert.equal(contacts.length, 2);
    assert.equal(contacts.find(c=>c.id===saved.id).consent, 0);
    const other=contacts.find(c=>c.id!==saved.id);
    assert.equal(other.consent, 1);
    response=await admin("/api/usuarios/EDITGUARD02",{
      ...baseUser,codigo:"EDITGUARD02",area:"D",guardians:[
        {id:saved.id, remove:true},
        {id:other.id, name:other.name,phone:other.phone,consent:true},
      ],
    },"PUT");
    assert.equal(response.status,200);
    assert.equal(db.prepare("SELECT active FROM contacts WHERE id=?").get(saved.id).active,0);
    assert.equal(db.prepare("SELECT active FROM contacts WHERE id=?").get(other.id).active,1);
    // Requests from old clients that omit area/guardians must preserve them.
    const { area: ignoredArea, ...legacyInput } = baseUser;
    response=await admin("/api/usuarios/EDITGUARD02",{
      ...legacyInput,codigo:"EDITGUARD02",nombre:"ANA CORREGIDA",
    },"PUT");
    assert.equal(response.status,200);
    assert.equal(db.prepare("SELECT area FROM usuarios WHERE codigo='EDITGUARD02'").get().area,"D");
    assert.equal(db.prepare("SELECT consent FROM contacts WHERE id=?").get(other.id).consent,1);
  } finally {
    db.prepare("DELETE FROM contacts WHERE user_uid=?").run(uid);
    db.prepare("DELETE FROM usuarios WHERE uid=?").run(uid);
  }
});
