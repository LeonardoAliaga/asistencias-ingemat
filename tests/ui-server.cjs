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
