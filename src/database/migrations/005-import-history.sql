CREATE TABLE IF NOT EXISTS hidden_import_batches (
 actor TEXT NOT NULL,
 batch_id TEXT NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
 hidden_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(actor,batch_id)
);
INSERT OR IGNORE INTO schema_migrations(version) VALUES(5);
