const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { randomUUID } = require("node:crypto");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ingemat-import-history-"));
process.env.DATA_DIR = dir;
process.env.DISABLE_MIGRATION_BACKUP = "1";
const db = require("../src/database/db"),
  imports = require("../src/services/imports.service");
const admin = { session: { username: "admin" } },
  other = { session: { username: "other" } };
after(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
function batch(status) {
  const id = randomUUID();
  db.prepare(
    "INSERT INTO import_batches(id,evaluation_id,revision,source,status,actor,result) VALUES(?,'exam',1,'omr',?,'admin',?)",
  ).run(id, status, JSON.stringify({ pages: [], rows: [], reviewVersion: 1 }));
  return id;
}
const visible = (req) => imports.listBatches(req).map((b) => b.id);
test("clearing only hides terminal batches for that account and never deletes saved readings or files", () => {
  const failed = batch("failed"),
    committed = batch("committed"),
    ready = batch("ready"),
    queued = batch("queued"),
    review = batch("review"),
    processing = batch("processing");
  const original = imports.batch(committed);
  const filename = path.join(dir, "preserved-scan.pdf");
  fs.writeFileSync(filename, "%PDF-preserve");
  assert.equal(imports.clearBatchHistory(admin).hidden, 2);
  assert(!visible(admin).includes(failed));
  assert(!visible(admin).includes(committed));
  for (const id of [ready, queued, review, processing])
    assert(visible(admin).includes(id));
  assert(visible(other).includes(failed));
  assert(visible(other).includes(committed));
  assert.deepEqual(imports.batch(committed), original);
  assert(fs.existsSync(filename));
  assert.equal(imports.clearBatchHistory(admin).hidden, 0);
});
test("restoring is account-scoped and jobs that finish after cleanup remain visible", () => {
  imports.clearBatchHistory(other);
  const id = batch("processing");
  imports.clearBatchHistory(admin);
  db.prepare("UPDATE import_batches SET status='committed' WHERE id=?").run(id);
  assert(visible(admin).includes(id));
  const fresh = batch("failed");
  assert(visible(admin).includes(fresh));
  imports.restoreBatchHistory(admin);
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(*) n FROM hidden_import_batches WHERE actor='admin'",
      )
      .get().n,
    0,
  );
  assert(
    db
      .prepare(
        "SELECT COUNT(*) n FROM hidden_import_batches WHERE actor='other'",
      )
      .get().n > 0,
  );
});
