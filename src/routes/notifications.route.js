const express = require("express");
const db = require("../database/db");
const { requireAdmin } = require("../middleware/auth.middleware");
const notifications = require("../services/notifications.service");
const settings = require("../services/notification-config.service");
const baileys = require("../services/baileys.service");
const { AppError } = require("../utils/errors");
const { audit } = require("../services/audit.service");
const router = express.Router();
router.use(requireAdmin);
router.get("/health", (req, res) => {
  res.set("Cache-Control", "no-store").json(notifications.status());
});
router.get("/", (req, res) =>
  res.set("Cache-Control", "no-store").json({
    exito: true,
    status: notifications.status(),
    config: settings.getConfig(),
    outbox: db
      .prepare(
        "SELECT id,recipient,kind,status,attempts,error,provider_id,provider,created_at,next_attempt_at," +
        "json_extract(CASE WHEN json_valid(payload) THEN payload ELSE '{}' END,'$.bulkBatchId') AS bulk_batch_id," +
        "json_extract(CASE WHEN json_valid(payload) THEN payload ELSE '{}' END,'$.studentCode') AS student_code," +
        "json_extract(CASE WHEN json_valid(payload) THEN payload ELSE '{}' END,'$.area') AS ranking_area," +
        "json_extract(CASE WHEN json_valid(payload) THEN payload ELSE '{}' END,'$.page') AS ranking_page," +
        "json_extract(CASE WHEN json_valid(payload) THEN payload ELSE '{}' END,'$.pages') AS ranking_pages " +
        "FROM outbox ORDER BY created_at DESC LIMIT 100",
      )
      .all(),
  }),
);
router.put("/config", (req, res) => {
  const clean = settings.validateConfig(req.body, notifications.providerReady);
  settings.storeConfig(clean);
  audit(req, "configurar_whatsapp", "config", clean.provider, {
    enabled: clean.enabled,
    provider: clean.provider,
  });
  res.json({ exito: true });
});
router.post("/baileys/connect", (req, res) => {
  const status = baileys.connect();
  audit(req, "conectar_whatsapp", "config", "baileys", {});
  res.status(202).json(status);
});
router.post("/baileys/stop", (req, res) => {
  settings.pause();
  baileys.stop();
  audit(req, "detener_whatsapp", "config", "baileys", {});
  res.json(baileys.status());
});
router.post("/baileys/reset", async (req, res) => {
  settings.pause();
  await baileys.reset();
  audit(req, "reiniciar_sesion_whatsapp", "config", "baileys", {});
  res.json(baileys.status());
});
router.get("/baileys/qr", (req, res) => {
  const qr = baileys.getQR();
  if (!qr)
    throw new AppError(
      "El QR no está disponible o caducó. Conecta o reintenta la vinculación.",
      409,
    );
  res.set("Cache-Control", "no-store").json(qr);
});
router.post("/:id/retry", (req, res) => {
  const row = db.prepare("SELECT * FROM outbox WHERE id=?").get(req.params.id);
  if (!row || !["failed", "unknown"].includes(row.status))
    throw new AppError("El mensaje no se puede reenviar en su estado actual.");
  if (row.provider !== settings.getConfig().provider)
    throw new AppError(
      "Selecciona el proveedor original del aviso para reintentarlo. No se cambia de proveedor automáticamente.",
      409,
    );
  if (notifications.attendanceDeleted(row))
    throw new AppError(
      "El registro de asistencia fue eliminado. Este aviso no se puede reenviar.",
      409,
    );
  const report = notifications.reportState(row);
  if (!report.current) throw new AppError(report.error, 409);
  if (
    row.kind === "results" &&
    notifications.resultState(JSON.parse(row.payload)) !== "current"
  )
    throw new AppError(
      "El resultado fue modificado. Revisa las respuestas y genera un aviso actualizado.",
      409,
    );
  if (row.kind === "results")
    throw new AppError("El envío individual de resultados de simulacros ya no está disponible.", 409);
  if (row.status === "unknown" && req.body.confirmNotDelivered !== true)
    throw new AppError(
      "Confirma que el mensaje no fue entregado antes de reenviarlo.",
    );
  db.prepare(
    "UPDATE outbox SET status='pending',next_attempt_at=0,error='' WHERE id=?",
  ).run(row.id);
  audit(req, "reintentar_aviso", "notificacion", row.id);
  res.json({ exito: true });
});
module.exports = router;
