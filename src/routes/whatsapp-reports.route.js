const express = require("express");
const multer = require("multer");
const db = require("../database/db");
const baileys = require("../services/baileys.service");
const groups = require("../services/whatsapp-groups.service");
const reports = require("../services/whatsapp-reports.service");
const storage = require("../services/whatsapp-report-storage.service");
const settings = require("../services/notification-config.service");
const {
  requireAdmin,
  requirePermission,
} = require("../middleware/auth.middleware");
const { hasPermission } = require("../services/auth.service");
const { AppError } = require("../utils/errors");
const { MAX_BYTES } = require("../whatsapp/media.cjs");
const router = express.Router();
const operator = requirePermission("asistencias:write");
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1, fields: 8, parts: 9 },
});
function receiveReport(req, res, next) {
  upload.single("report")(req, res, (error) => {
    if (error instanceof multer.MulterError)
      return next(
        new AppError(
          error.code === "LIMIT_FILE_SIZE"
            ? "El reporte supera los 10 MB. Selecciona una semana o periodo más corto."
            : "No se pudo recibir el reporte. Vuelve a abrir el envío.",
          error.code === "LIMIT_FILE_SIZE" ? 413 : 400,
        ),
      );
    next(error);
  });
}
router.get("/status", requirePermission("usuarios:read"), (req, res) => {
  const s = baileys.status();
  res.set("Cache-Control", "no-store").json({
    state: s.state,
    connected: s.connected,
    note: s.note,
    needsPackageReview: s.needsPackageReview,
    enabled: settings.getConfig().enabled,
  });
});
router.get("/groups", requireAdmin, async (req, res) =>
  res.json({
    groups: await groups.listGroups(req.query.q, req.query.refresh === "1"),
  }),
);
router.get("/attendance-groups", requireAdmin, (req, res) =>
  res.json({
    cycles: db
      .prepare("SELECT nombre FROM ciclos ORDER BY nombre")
      .all()
      .map((c) => ({ cycle: c.nombre, target: groups.target(c.nombre) })),
  }),
);
router.put("/attendance-groups", requireAdmin, async (req, res) =>
  res.json({
    exito: true,
    target: await groups.setMapping(req.body.cycle, req.body.groupId, req),
  }),
);
router.get("/attendance-target", operator, (req, res) =>
  res.json({ target: groups.target(req.query.cycle) }),
);
router.get("/student-contacts", requireAdmin, (req, res) =>
  res.json({ contacts: reports.contacts(req.query.studentCode) }),
);
router.post("/student-report", requireAdmin, receiveReport, async (req, res) =>
  res
    .status(202)
    .json(
      await reports.studentReport({ ...req.body, png: req.file?.buffer }, req),
    ),
);
// Previsualización sin efectos: incluye alumnos sin contacto autorizado para indicar exclusiones.
router.get("/batch-students",requireAdmin,(req,res)=>
  res.set("Cache-Control","no-store").json(reports.batchStudents(req.query.cycle))
);
router.post("/batch-student-reports",requireAdmin,async(req,res)=>
  res.status(202).json(await reports.batchStudentReports(req.body,req))
);
router.post("/exam-group-summary", requireAdmin, (req, res) =>
  res.status(202).json(require("../services/exam-group-results.service").enqueueSummary(req.body, req)),
);
router.post("/attendance-report", operator, async (req, res) =>
  res.status(202).json(await reports.dailyReport(req.body, req)),
);
router.get("/reports/:id/file", (req, res) => {
  const row = db
    .prepare(
      "SELECT * FROM outbox WHERE id=? AND kind IN ('student_report','attendance_report','exam_group_summary')",
    )
    .get(req.params.id);
  if (!row) throw new AppError("Reporte no encontrado.", 404);
  if (
    req.session.role !== "admin" &&
    !(
      row.kind === "attendance_report" &&
      hasPermission(req.session.role, "asistencias:write")
    )
  )
    throw new AppError("No tienes permiso para descargar este reporte.", 403);
  const attachment = JSON.parse(row.payload).attachment;
  let buffer;
  try {
    buffer = storage.read(attachment);
  } catch {
    throw new AppError(
      "El archivo no está disponible. Genera el reporte nuevamente.",
      404,
    );
  }
  res
    .set("Cache-Control", "no-store")
    .type(attachment.format === "pdf" ? "application/pdf" : "image/png")
    .attachment(attachment.fileName)
    .send(buffer);
});
module.exports = router;
