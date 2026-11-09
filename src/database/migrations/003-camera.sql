-- Retry receipts survive restarts and apply only to the submitting operator.
CREATE TABLE IF NOT EXISTS scan_requests (
  actor TEXT NOT NULL,
  request_id TEXT NOT NULL,
  evaluation_id TEXT NOT NULL,
  batch_id TEXT NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  PRIMARY KEY(actor, request_id)
);
INSERT OR IGNORE INTO schema_migrations(version) VALUES(3);
