const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { randomUUID } = require("node:crypto");
// All browser tests use an isolated synthetic data directory, never the academy's data.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ingemat-browser-"));
process.env.DATA_DIR = dir;
process.env.ADMIN_INITIAL_PASSWORD = "Browser-test-only-2026";
process.env.DISABLE_MIGRATION_BACKUP = "1";
process.env.NODE_ENV = "test";
const { createApp } = require("../app"),
  db = require("../src/database/db");
const app = createApp();
db.prepare("INSERT INTO ciclos(nombre) VALUES(?)").run("ANUAL");
for (const [code, name, area] of [
  ["DEMO001", "ANA DEMO", "A"],
  ["DEMO002", "LUIS DEMO", "C"],
])
  db.prepare(
    "INSERT INTO usuarios(codigo,nombre,apellido,rol,turno,ciclo,uid,area) VALUES(?,?,?,?,?,?,?,?)",
  ).run(
    code,
    name,
    "ALUMNO",
    "estudiante",
    "mañana",
    "ANUAL",
    randomUUID(),
    area,
  );
db.prepare(
  "INSERT INTO usuarios(codigo,nombre,apellido,rol,turno,ciclo,uid,area) VALUES(?,?,?,?,?,?,?,?)",
).run(
  "DEMO003",
  "MARÍA FERNANDA",
  "FERNÁNDEZ DE LA CRUZ",
  "estudiante",
  "tarde",
  "ANUAL",
  randomUUID(),
  "B",
);
db.prepare(
  "INSERT INTO usuarios(codigo,nombre,apellido,rol,uid) VALUES(?,?,?,?,?)",
).run("DOC001", "CARLOS", "PROFESOR DEMO", "docente", randomUUID());
db.prepare("INSERT INTO secciones_biblioteca(nombre) VALUES(?)").run(
  "MATEMÁTICA",
);
db.prepare(
  "INSERT INTO libros(id,codigo,titulo,categoria,editorial) VALUES(?,?,?,?,?)",
).run(
  randomUUID(),
  "MAT-001",
  "Álgebra: teoría y problemas de admisión",
  "MATEMÁTICA",
  "Editorial de demostración",
);
const auth = require("../src/services/auth.service");
for (const role of ["corrector", "docente", "recepcion"])
  db.prepare(
    "INSERT INTO accounts(username,password_hash,role,must_change_password) VALUES(?,?,?,0)",
  ).run(role, auth.hashPassword("Browser-test-only-2026"), role);
const exams = require("../src/services/evaluations.service"),
  req = { session: { username: "admin" } },
  { businessDate } = require("../src/utils/time"),
  fixture = exams.saveExam(
    {
      titulo: "SIMULACRO DE DEMOSTRACIÓN",
      ciclo: "ANUAL",
      fecha: businessDate(),
      definition: {
        totalQuestions: 100,
        keys: Object.fromEntries(
          Array.from({ length: 100 }, (_, i) => [i + 1, "A"]),
        ),
      },
    },
    req,
  );
exams.readyExam(fixture.id, req);
exams.saveGrade(
  fixture.id,
  {
    codigoEstudiante: "DEMO001",
    area: "GENERAL",
    respuestas: Object.fromEntries(
      Array.from({ length: 100 }, (_, i) => [i + 1, "A"]),
    ),
  },
  req,
);
const attendance = require("../src/services/attendance.service");
for (const [code, time] of [
  ["DEMO001", "13:30"],
  ["DEMO002", "13:35"],
  ["DEMO003", "20:00"],
  ["DOC001", "13:30"],
])
  attendance.register(code, req, new Date(`${businessDate()}T${time}:00Z`));
const server = app.listen(
  Number(process.env.UI_TEST_PORT || 3017),
  "127.0.0.1",
);
process.on("SIGTERM", () =>
  server.close(() => {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
    process.exit(0);
  }),
);
