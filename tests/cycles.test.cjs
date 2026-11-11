const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ingemat-cycles-"));
process.env.DATA_DIR = dir;
process.env.DISABLE_MIGRATION_BACKUP = "1";
const db = require("../src/database/db");
const { initializeCycles } = require("../src/services/cycles.service");
const { getCiclosData } = require("../src/utils/helpers");
const { saveExam, readyExam } = require("../src/services/evaluations.service");
after(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
test("first-run cycles are registered before being offered and can save/validate an exam", () => {
  assert.deepEqual(getCiclosData().ciclos, []);
  initializeCycles();
  const names = getCiclosData().ciclos;
  assert.deepEqual(names, ["SEMESTRAL", "ANUAL", "SABATINO", "DOMINGOS"]);
  for (const cycle of names) {
    const saved = saveExam(
      {
        titulo: "Ciclo registrado",
        ciclo: cycle,
        fecha: "2026-11-09",
        definition: { totalQuestions: 1, keys: { 1: "A" } },
      },
      { session: { username: "test" } },
    );
    assert.equal(
      readyExam(saved.id, { session: { username: "test" } }).estado,
      "listo",
    );
  }
  assert.throws(
    () => saveExam({ titulo: "Inválido", ciclo: "NO EXISTE" }, {}),
    /ya no existe/,
  );
});
test("custom cycle configuration is respected and deliberate deletion does not bring back fake choices", () => {
  db.exec(
    "DELETE FROM ciclos; DELETE FROM config_general WHERE clave='cycles_initialized'",
  );
  db.prepare("INSERT INTO ciclos(nombre) VALUES(?)").run(" ESPECIAL ");
  initializeCycles();
  assert.deepEqual(getCiclosData().ciclos, [" ESPECIAL "]);
  const saved = saveExam(
    {
      titulo: "Con espacios heredados",
      ciclo: "ESPECIAL",
      definition: { totalQuestions: 1 },
    },
    { session: { username: "test" } },
  );
  assert.equal(saved.ciclo, "ESPECIAL");
  db.exec("DELETE FROM ciclos");
  initializeCycles();
  assert.deepEqual(getCiclosData().ciclos, []);
});
