CREATE TABLE IF NOT EXISTS scanner_jobs (
 id TEXT PRIMARY KEY,
 evaluation_id TEXT NOT NULL REFERENCES evaluaciones(id),
 revision INTEGER NOT NULL,
 actor TEXT NOT NULL,
 driver TEXT NOT NULL,
 device TEXT NOT NULL,
 source TEXT NOT NULL,
 page_size TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('scanning','ready','failed','cancelled','imported','discarded')),
 error TEXT NOT NULL DEFAULT '',
 bytes INTEGER NOT NULL DEFAULT 0,
 batch_id TEXT REFERENCES import_batches(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS scanner_jobs_owner_exam ON scanner_jobs(actor,evaluation_id,status);
INSERT OR IGNORE INTO schema_migrations(version) VALUES(4);
