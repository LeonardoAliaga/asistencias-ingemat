CREATE TABLE IF NOT EXISTS notification_receipts(id TEXT PRIMARY KEY,received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO config_general(clave,valor)
SELECT 'whatsapp_config','{"enabled":false,"provider":"baileys"}'
WHERE EXISTS (SELECT 1 FROM config_general WHERE clave='whatsapp_cloud_config');
DELETE FROM config_general WHERE clave='whatsapp_cloud_config';
UPDATE outbox SET status='cancelled',error='Integración anterior retirada. No se reenviará automáticamente por Baileys.' WHERE provider!='baileys' AND status IN ('pending','retry','failed');
INSERT OR IGNORE INTO schema_migrations(version) VALUES(6);
