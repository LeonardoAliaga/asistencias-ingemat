const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { spawnSync } = require("node:child_process");
test("upgrading an existing scanner queue preserves captures and allows automatic unassigned captures exactly once", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ingemat-omr-migration-"));
  const modulePath = path.resolve("src/database/db.js");
  const run = (code) => {
    const result = spawnSync(
      process.execPath,
      [
        "-e",
        `const db=require(${JSON.stringify(modulePath)});${code};db.close()`,
      ],
      {
        encoding: "utf8",
        env: { ...process.env, DATA_DIR: dir, DISABLE_MIGRATION_BACKUP: "1" },
      },
    );
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  try {
    run(`db.exec("INSERT INTO evaluaciones(id,titulo,ciclo,fecha,numPreguntas,puntajeCorrecta,puntajeIncorrecta) VALUES('original','ORIGINAL','ANUAL','2026-11-16',1,20,1.125)");
      db.exec("DROP TABLE scanner_jobs; CREATE TABLE scanner_jobs(id TEXT PRIMARY KEY,evaluation_id TEXT NOT NULL REFERENCES evaluaciones(id),revision INTEGER NOT NULL,actor TEXT NOT NULL,driver TEXT NOT NULL,device TEXT NOT NULL,source TEXT NOT NULL,page_size TEXT NOT NULL,status TEXT NOT NULL,error TEXT NOT NULL DEFAULT '',bytes INTEGER NOT NULL DEFAULT 0,batch_id TEXT REFERENCES import_batches(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
      db.exec("INSERT INTO scanner_jobs(id,evaluation_id,revision,actor,driver,device,source,page_size,status) VALUES('capture','original',1,'operator','wia','Brother','glass','a4','ready'); DELETE FROM schema_migrations WHERE version=7")`);
    const upgraded = JSON.parse(
      run(`console.log(JSON.stringify({row:db.prepare("SELECT * FROM scanner_jobs WHERE id='capture'").get(),notnull:db.pragma('table_info(scanner_jobs)').find(c=>c.name==='evaluation_id').notnull}));
      db.exec("INSERT INTO scanner_jobs(id,evaluation_id,revision,actor,driver,device,source,page_size,status) VALUES('automatic',NULL,0,'operator','wia','Brother','glass','a4','ready')")`),
    );
    assert.equal(upgraded.row.status, "ready");
    assert.equal(upgraded.row.evaluation_id, "original");
    assert.equal(upgraded.notnull, 0);
    const again = JSON.parse(
      run(
        `console.log(JSON.stringify({count:db.prepare('SELECT COUNT(*) n FROM scanner_jobs').get().n,versions:db.prepare('SELECT COUNT(*) n FROM schema_migrations WHERE version=7').get().n,fk:db.pragma('foreign_key_check')}))`,
      ),
    );
    assert.equal(again.count, 2);
    assert.equal(again.versions, 1);
    assert.deepEqual(again.fk, []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
