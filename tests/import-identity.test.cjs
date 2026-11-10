const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { randomUUID } = require("node:crypto");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ingemat-identity-view-"));
process.env.DATA_DIR = dir;
process.env.DISABLE_MIGRATION_BACKUP = "1";
const db = require("../src/database/db"),
  exams = require("../src/services/evaluations.service"),
  imports = require("../src/services/imports.service"),
  { qrPayload } = require("../src/services/omr-pdf.service");
const req = { session: { username: "test", role: "admin" } };
db.prepare("INSERT INTO ciclos(nombre) VALUES(?)").run("ANUAL");
for (const [code, name, cycle, role] of [
  ["00123456", "ANA MARÍA", "ANUAL", "estudiante"],
  ["00234567", "LUIS", "ANUAL", "estudiante"],
  ["00345678", "OTRO CICLO", "OTRO", "estudiante"],
  ["00456789", "DOCENTE", "ANUAL", "docente"],
])
  db.prepare(
    "INSERT INTO usuarios(codigo,nombre,apellido,rol,ciclo,uid) VALUES(?,?,?,?,?,?)",
  ).run(code, name, "PÉREZ", role, cycle, randomUUID());
const definition =
  require("../src/services/exam-presets.service").listPresets()[0].definition;
definition.keys = Object.fromEntries(
  Array.from({ length: 120 }, (_, i) => [i + 1, "A"]),
);
const exam = exams.readyExam(
  exams.saveExam(
    { titulo: "Identificación visible", ciclo: "ANUAL", definition },
    req,
  ).id,
  req,
);
after(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
function sheet(version = 3, examId = exam.id) {
  const id = randomUUID();
  db.prepare(
    "INSERT INTO omr_sheets(id,evaluation_id,student_code,area,revision,layout_version) VALUES(?,?,?,?,?,?)",
  ).run(id, examId, version === 2 ? "00123456" : "", "A", 1, version);
  return id;
}
function page(id, side = 1, code = "00123456", extra = {}) {
  return {
    qr: qrPayload(id, side, 3),
    page: side,
    layoutVersion: 3,
    ...(side === 1 ? { identification: { code, area: "A" } } : {}),
    responses: {},
    ...extra,
  };
}
function batch(pages, rows = [], source = "omr") {
  const id = randomUUID();
  db.prepare(
    "INSERT INTO import_batches(id,evaluation_id,revision,source,status,result,actor) VALUES(?,?,1,?,'review',?,'test')",
  ).run(id, exam.id, source, JSON.stringify({ pages, rows, reviewVersion: 1 }));
  return id;
}
test("student name and exact code appear on both signed sides and preview, without changing stored readings", () => {
  const s = sheet(),
    id = batch(
      [page(s, 2), page(s)],
      [{ sheetId: s, codigoEstudiante: "00123456" }],
    );
  const original = imports.batch(id);
  const view = imports.batchView(id);
  const expected = { code: "00123456", name: "PÉREZ ANA MARÍA" };
  assert.ok(
    view.result.pages.every(
      (p) => JSON.stringify(p.identifiedStudent) === JSON.stringify(expected),
    ),
  );
  assert.deepEqual(view.result.rows[0].identifiedStudent, expected);
  assert.deepEqual(imports.batch(id), original);
});
test("matching a code identifies its student even with pending area or missing reverse, without making the batch ready", () => {
  for (const missingReverse of [false, true]) {
    const s = sheet(),
      front = page(s);
    front.identification.area = "";
    const id = batch(missingReverse ? [front] : [front, page(s, 2)]);
    const view = imports.batchView(id);
    assert.equal(
      view.result.pages[0].identifiedStudent.name,
      "PÉREZ ANA MARÍA",
    );
    assert.equal(view.result.pages[0].identification.area, "");
    assert.equal(view.status, "review");
    assert.deepEqual(view.result.rows, []);
  }
});
test("unknown, incomplete, wrong-cycle and non-student codes and invalid or excluded sheets never borrow a name", () => {
  const s = sheet();
  for (const candidate of [
    page(s, 1, "99999999"),
    page(s, 1, "0012345"),
    page(s, 1, ""),
    page(s, 1, "00345678"),
    page(s, 1, "00456789"),
    page(s, 1, "00123456", { qr: qrPayload(s, 1, 3).slice(0, -1) + "Z" }),
    page(sheet(3, "another-exam")),
    page(s, 1, "00123456", { excluded: true }),
    page(s, 1, "00123456", { error: "Página inválida" }),
    page(s, 9),
  ]) {
    // A stale cached UI field must never survive a fresh presentation lookup.
    candidate.identifiedStudent = { code: "00123456", name: "Nombre anterior" };
    const view = imports.batchView(batch([candidate]));
    assert.equal(view.result.pages[0].identifiedStudent, null);
  }
  const conflict = imports.batchView(
    batch([page(s), page(s, 1, "00234567"), page(s, 2)]),
  );
  assert.ok(conflict.result.pages.every((p) => p.identifiedStudent === null));
});
test("a reviewed code overrides the original and updates only the matching front and reverse", () => {
  const first = sheet(),
    second = sheet();
  const front = page(first, 1, "00123456", {
    identificationOverride: { code: "00234567", area: "C" },
  });
  const id = batch([page(second, 2), front, page(first, 2), page(second)]);
  const view = imports.batchView(id);
  assert.deepEqual(
    view.result.pages.map((p) => p.identifiedStudent.code),
    ["00123456", "00234567", "00234567", "00123456"],
  );
  assert.equal(view.result.pages[1].identification.code, "00123456");
  assert.equal(view.result.pages[1].identifiedStudent.name, "PÉREZ LUIS");
});
test("roster name snapshot remains consistent with grades after a student changes cycle and name", () => {
  const s = sheet();
  db.prepare(
    "UPDATE usuarios SET ciclo='OTRO',nombre='NOMBRE NUEVO' WHERE codigo='00234567'",
  ).run();
  const view = imports.batchView(batch([page(s, 1, "00234567")]));
  assert.deepEqual(view.result.pages[0].identifiedStudent, {
    code: "00234567",
    name: "PÉREZ LUIS",
  });
});
test("legacy personalized QR sheets and CSV previews also show a verified student name", () => {
  const s = sheet(2);
  const legacy = imports.batchView(
    batch([{ qr: qrPayload(s, 1, 2), responses: {} }]),
  );
  assert.equal(
    legacy.result.pages[0].identifiedStudent.name,
    "PÉREZ ANA MARÍA",
  );
  const csv = imports.batchView(
    batch([], [{ codigoEstudiante: "00123456" }], "csv"),
  );
  assert.equal(csv.result.rows[0].identifiedStudent.name, "PÉREZ ANA MARÍA");
});
