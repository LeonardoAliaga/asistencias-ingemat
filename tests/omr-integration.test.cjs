const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { randomUUID } = require("node:crypto");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ingemat-batch-"));
process.env.DATA_DIR = dir;
process.env.DISABLE_MIGRATION_BACKUP = "1";
const db = require("../src/database/db");
const e = require("../src/services/evaluations.service");
const imports = require("../src/services/imports.service");
const { makePDF } = require("../src/services/omr-pdf.service");
const { range } = require("../src/services/grading.service");
const req = { session: { username: "test", role: "admin" } };
after(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
test("printed personalized PDF -> Python reader -> review -> revised keys -> atomic grades; duplicate scans blocked", async () => {
  db.prepare("INSERT INTO ciclos(nombre) VALUES(?)").run("ANUAL");
  for (const [code, area] of [
    ["DEMO001", "A"],
    ["DEMO002", "C"],
  ])
    db.prepare(
      "INSERT INTO usuarios(codigo,nombre,apellido,rol,turno,ciclo,uid,area) VALUES(?,?,?,?,?,?,?,?)",
    ).run(
      code,
      "DEMO",
      code,
      "estudiante",
      "mañana",
      "ANUAL",
      randomUUID(),
      area,
    );
  const definition = {
    totalQuestions: 120,
    areas: [
      { code: "A", name: "Salud", requiredQuestions: 100 },
      { code: "C", name: "Ingeniería", requiredQuestions: 100 },
    ],
    sections: [
      {
        name: "General",
        questions: range("1-120"),
        rules: {
          A: { questions: range("1-100") },
          C: { questions: range("21-120") },
        },
      },
    ],
    keys: Object.fromEntries(range("1-120").map((q) => [q, "A"])),
  };
  const draft = e.saveExam(
      {
        titulo: "INTEGRACIÓN OMR",
        ciclo: "ANUAL",
        fecha: "2026-11-08",
        definition,
      },
      req,
    ),
    exam = e.readyExam(draft.id, req);
  const bytes = await makePDF(
    exam,
    db.prepare("SELECT * FROM usuarios ORDER BY codigo").all(),
  );
  const filename = path.join(dir, "upload.pdf");
  fs.writeFileSync(filename, bytes);
  let b = imports.createScan(
    exam.id,
    [{ path: filename, originalname: "lote.pdf" }],
    req,
  );
  await imports.processScanQueue();
  b = imports.batch(b.id);
  assert.equal(
    b.status,
    "ready",
    JSON.stringify(
      b.result.pages?.map((p) => ({
        page: p.page,
        error: p.error,
        warning: p.warning,
      })),
    ),
  );
  assert.equal(b.result.rows.length, 2);
  assert.equal(b.result.pages.length, 2);
  const keys = {
    ...exam.definition.keys,
    1: { answers: [], voidPolicy: "credit", credit: 20 },
  };
  e.reviseKeys(
    exam.id,
    { keys, reason: "Pregunta anulada tras el examen" },
    req,
  );
  assert.throws(
    () =>
      imports.commitBatch(b.id, { reviewVersion: b.result.reviewVersion }, req),
    /claves cambiaron/,
  );
  b = imports.refreshBatch(b.id, req);
  assert.equal(b.revision, 2);
  assert.equal(
    b.result.rows.find((r) => r.area === "A").preview.puntajeTotal,
    20,
  );
  assert.equal(
    b.result.rows.find((r) => r.area === "C").preview.puntajeTotal,
    0,
  );
  const grades = imports.commitBatch(
    b.id,
    { reviewVersion: b.result.reviewVersion },
    req,
  );
  assert.equal(grades.length, 2);
  assert.equal(
    db.prepare("SELECT COUNT(*) n FROM respuestas_evaluacion").get().n,
    2,
  );
  assert.throws(
    () =>
      imports.commitBatch(b.id, { reviewVersion: b.result.reviewVersion }, req),
    /incidencias/,
  );
  const again = path.join(dir, "duplicate.pdf");
  fs.writeFileSync(again, bytes);
  const duplicate = imports.createScan(
    exam.id,
    [{ path: again, originalname: "repetido.pdf" }],
    req,
  );
  await imports.processScanQueue();
  const read = imports.batch(duplicate.id);
  assert.equal(read.status, "review");
  assert(read.result.pages.every((p) => /ya fue importada/.test(p.error)));
  assert.equal(
    db.prepare("SELECT COUNT(*) n FROM respuestas_evaluacion").get().n,
    2,
  );
  // Sheets printed before a key correction remain valid: only the keys changed, not the layout.
  assert.equal(read.result.pages[0].page, 1);
});
