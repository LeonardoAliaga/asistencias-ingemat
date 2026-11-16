CREATE TABLE IF NOT EXISTS omr_layouts (
 id TEXT PRIMARY KEY,
 definition TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- A physical capture has no exam until its signed QRs have been read.
CREATE TABLE scanner_jobs_new (
 id TEXT PRIMARY KEY,
 evaluation_id TEXT REFERENCES evaluaciones(id),
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
INSERT INTO scanner_jobs_new SELECT * FROM scanner_jobs;
DROP TABLE scanner_jobs;
ALTER TABLE scanner_jobs_new RENAME TO scanner_jobs;
CREATE INDEX scanner_jobs_owner_exam ON scanner_jobs(actor,evaluation_id,status);
INSERT INTO schema_migrations(version) VALUES(7);
