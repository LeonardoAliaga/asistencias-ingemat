const { test, after } = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ingemat-wa-transition-"));
process.env.DATA_DIR = dir;
process.env.DISABLE_MIGRATION_BACKUP = "1";
const Database = require("better-sqlite3");
let old = new Database(path.join(dir, "ingemat.db"));
for (const name of ["001-legacy.sql", "002-v2.sql"])
  old.exec(
    fs.readFileSync(
      path.join(__dirname, "../src/database/migrations", name),
      "utf8",
    ),
  );
old
  .prepare(
    "INSERT INTO config_general(clave,valor) VALUES('whatsapp_cloud_config',?)",
  )
  .run(JSON.stringify({ enabled: true, attendanceTemplate: "previous" }));
for (const status of ["pending", "accepted", "unknown"])
  old
    .prepare(
      "INSERT INTO outbox(id,event_key,recipient,kind,payload,status) VALUES(?,?, '+51900111222','attendance','{}',?)",
    )
    .run(status, status, status);
old.close();
const db = require("../src/database/db"),
  cfg = require("../src/services/notification-config.service");
after(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
test("legacy migration disables the paid integration without replaying notices or deleting history", () => {
  assert.equal(cfg.getConfig().provider, "baileys");
  assert.equal(cfg.getConfig().enabled, false);
  assert.equal(
    db.prepare("SELECT status FROM outbox WHERE id='pending'").get().status,
    "cancelled",
  );
  assert.equal(
    db.prepare("SELECT status FROM outbox WHERE id='accepted'").get().status,
    "accepted",
  );
  assert.equal(
    db.prepare("SELECT status FROM outbox WHERE id='unknown'").get().status,
    "unknown",
  );
  assert.equal(db.prepare("SELECT COUNT(*) n FROM outbox").get().n, 3);
  assert(
    !db
      .prepare(
        "SELECT 1 FROM config_general WHERE clave='whatsapp_cloud_config'",
      )
      .get(),
  );
  cfg.storeConfig({ ...cfg.defaults, enabled: true });
  db.exec(
    fs.readFileSync(
      path.join(__dirname, "../src/database/migrations/006-baileys.sql"),
      "utf8",
    ),
  );
  assert.equal(cfg.getConfig().enabled, true);
});
