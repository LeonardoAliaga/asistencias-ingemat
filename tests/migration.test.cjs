const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ingemat-migration-"));
process.env.DATA_DIR = dir;
process.env.ADMIN_INITIAL_PASSWORD = "Migration-test-only-2026";
process.env.DISABLE_MIGRATION_BACKUP = "1";
fs.writeFileSync(
  path.join(dir, "usuarios.json"),
  JSON.stringify([
    {
      codigo: "LEG001",
      nombre: "DEMO",
      apellido: "LEGADO",
      rol: "estudiante",
      ciclo: "ANUAL",
      turno: "mañana",
    },
  ]),
);
fs.writeFileSync(
  path.join(dir, "ciclos.json"),
  JSON.stringify({ ciclos: ["ANUAL"] }),
);
fs.writeFileSync(
  path.join(dir, "horarios.json"),
  JSON.stringify({
    default: {
      mañana: { entrada: "09:00", tolerancia: "09:10" },
      tarde: { entrada: "16:00", tolerancia: "16:05" },
    },
  }),
);
fs.writeFileSync(
  path.join(dir, "password.json"),
  JSON.stringify({ password: "old-public-secret" }),
);
fs.writeFileSync(
  path.join(dir, "evaluaciones.json"),
  JSON.stringify({
    evaluaciones: [
      {
        id: "legacy",
        titulo: "EXAMEN LEGADO",
        ciclo: "ANUAL",
        fecha: "2026-01-01",
        tipo: "simulacro_areas",
        numPreguntas: 100,
        totalPreguntasCuadernillo: 120,
        puntajeCorrecta: 20,
        puntajeIncorrecta: 1.125,
        claves: { 1: "A" },
        preguntasPorArea: { A: { 1: "A" } },
        respuestasEstudiantes: [
          {
            codigoEstudiante: "LEG001",
            area: "A",
            puntajeTotal: 20,
            respuestas: { 1: "A" },
          },
        ],
      },
    ],
  }),
);
const db = require("../src/database/db"),
  { ejecutarMigracionInicial } = require("../src/database/migrador"),
  auth = require("../src/services/auth.service");
after(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
test("legacy JSON imports once, preserves areas and never restores a plaintext admin password", () => {
  ejecutarMigracionInicial();
  auth.bootstrapAdmin();
  assert.equal(
    require("../src/utils/helpers").obtenerHorarios().default.mañana.entrada,
    "09:00",
  );
  const user = db.prepare("SELECT * FROM usuarios").get();
  assert.equal(user.codigo, "LEG001");
  assert.match(user.uid, /^[a-f0-9-]{36}$/);
  const exam = db.prepare("SELECT * FROM evaluaciones").get();
  assert.equal(exam.tipo, "simulacro_areas");
  assert.equal(exam.totalPreguntasCuadernillo, 120);
  assert.equal(
    db.prepare("SELECT area FROM respuestas_evaluacion").get().area,
    "A",
  );
  assert.equal(
    db
      .prepare("SELECT valor FROM config_general WHERE clave='admin_password'")
      .get(),
    undefined,
  );
  const before = db
    .prepare("SELECT password_hash FROM accounts")
    .get().password_hash;
  fs.writeFileSync(
    path.join(dir, "password.json"),
    JSON.stringify({ password: "changed-legacy-secret" }),
  );
  ejecutarMigracionInicial(true);
  assert.equal(
    db.prepare("SELECT password_hash FROM accounts").get().password_hash,
    before,
  );
  assert.equal(db.prepare("SELECT COUNT(*) n FROM usuarios").get().n, 1);
  assert.equal(
    db.prepare("SELECT COUNT(*) n FROM respuestas_evaluacion").get().n,
    1,
  );
});
