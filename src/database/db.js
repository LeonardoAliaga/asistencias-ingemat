const Database = require("better-sqlite3");
const fs = require("node:fs");
const path = require("node:path");
const { dataDir } = require("../config");
const dbPath = path.join(dataDir, "ingemat.db");
const existed = fs.existsSync(dbPath);
const db = new Database(dbPath);
fs.chmodSync(dbPath, 0o600);
db.pragma("foreign_keys = ON");
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 5000");
let migrated = false;
try {
  migrated = !!db
    .prepare("SELECT version FROM schema_migrations WHERE version=2")
    .get();
} catch {}
if (!migrated && existed && !process.env.DISABLE_MIGRATION_BACKUP) {
  const backupDir = path.join(dataDir, "backups");
  fs.mkdirSync(backupDir, { recursive: true });
  db.prepare("VACUUM INTO ?").run(
    path.join(backupDir, "pre-v2-" + Date.now() + ".db"),
  );
}
db.exec(
  fs.readFileSync(path.join(__dirname, "migrations/001-legacy.sql"), "utf8"),
);
function addColumn(table, name, definition) {
  if (!db.pragma(`table_info(${table})`).some((c) => c.name === name))
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
}
for (const [table, name, definition] of [
  ["libros", "editorial", "TEXT DEFAULT ''"],
  ["evaluaciones", "tipo", "TEXT DEFAULT 'simulacro_estandar'"],
  ["evaluaciones", "totalPreguntasCuadernillo", "INTEGER DEFAULT NULL"],
  ["evaluaciones", "preguntasPorArea", "TEXT DEFAULT '{}'"],
  ["evaluaciones", "preguntasSinDescuento", "TEXT DEFAULT '{}'"],
  ["evaluaciones", "definition", "TEXT DEFAULT ''"],
  ["evaluaciones", "revision", "INTEGER DEFAULT 1"],
  ["evaluaciones", "estado", "TEXT DEFAULT 'legacy'"],
  ["respuestas_evaluacion", "area", "TEXT DEFAULT ''"],
  ["respuestas_evaluacion", "detail", "TEXT DEFAULT '{}'"],
  ["respuestas_evaluacion", "revision", "INTEGER DEFAULT 1"],
  ["usuarios", "uid", "TEXT DEFAULT ''"],
  ["usuarios", "area", "TEXT DEFAULT ''"],
])
  addColumn(table, name, definition);
db.exec(fs.readFileSync(path.join(__dirname, "migrations/002-v2.sql"), "utf8"));
addColumn("outbox", "contact_id", "TEXT DEFAULT NULL");
const uuid = require("node:crypto").randomUUID;
for (const row of db
  .prepare("SELECT codigo FROM usuarios WHERE uid='' OR uid IS NULL")
  .all())
  db.prepare("UPDATE usuarios SET uid=? WHERE codigo=?").run(
    uuid(),
    row.codigo,
  );
db.exec(
  "CREATE UNIQUE INDEX IF NOT EXISTS usuarios_uid ON usuarios(uid) WHERE uid <> ''",
);
db.prepare("INSERT OR IGNORE INTO schema_migrations(version) VALUES(2)").run();
db.prepare("DELETE FROM config_general WHERE clave='admin_password'").run();
module.exports = db;
