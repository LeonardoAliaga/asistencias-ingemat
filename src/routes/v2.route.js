const express = require("express");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const multer = require("multer");
const db = require("../database/db");
const config = require("../config");
const {
  requireAdmin,
  requirePermission,
} = require("../middleware/auth.middleware");
const auth = require("../services/auth.service");
const { listPresets } = require("../services/exam-presets.service");
const evaluations = require("../services/evaluations.service");
const imports = require("../services/imports.service");
const notifications = require("../services/notifications.service");
const attendance = require("../services/attendance.service");
const { normalizeDefinition } = require("../services/grading.service");
const { makePDF } = require("../services/omr-pdf.service");
const { AppError } = require("../utils/errors");
const { audit } = require("../services/audit.service");
const { businessDate } = require("../utils/time");
const router = express.Router();
const read = requirePermission("evaluaciones:read"),
  write = requirePermission("evaluaciones:write");
const tempDir = path.join(config.dataDir, "temp");
fs.mkdirSync(tempDir, { recursive: true });
const upload = multer({
  dest: tempDir,
  limits: { fileSize: 20 * 1024 * 1024, files: 10, fields: 5 },
});
router.get("/summary", (req, res) =>
  res.json({
    exito: true,
    version: "2.0.0",
    timezone: config.timezone,
    today: businessDate(),
    usuarios: db.prepare("SELECT COUNT(*) n FROM usuarios").get().n,
    evaluaciones: db
      .prepare("SELECT COUNT(*) n FROM evaluaciones WHERE estado!='archivado'")
      .get().n,
    asistencias: db
      .prepare("SELECT COUNT(*) n FROM attendance WHERE business_date=?")
      .get(businessDate()).n,
    pendientes: db
      .prepare(
        "SELECT COUNT(*) n FROM outbox WHERE status IN ('pending','retry','unknown','failed')",
      )
      .get().n,
    imports: db
      .prepare(
        "SELECT COUNT(*) n FROM import_batches WHERE status IN ('queued','processing','review')",
      )
      .get().n,
  }),
);
router.get("/guide", (req, res) => res.json(require("../content/guide.json")));
router.get("/accounts", requireAdmin, (req, res) =>
  res.json(
    db
      .prepare(
        "SELECT id,username,role,active,must_change_password FROM accounts ORDER BY username",
      )
      .all(),
  ),
);
router.post("/accounts", requireAdmin, (req, res) => {
  const username = String(req.body.username || "")
      .trim()
      .toLowerCase(),
    role = req.body.role;
  if (!/^[a-z0-9._-]{3,40}$/.test(username) || !auth.permissions[role])
    throw new AppError("Usuario o rol inválido.");
  auth.validatePassword(req.body.password);
  if (db.prepare("SELECT 1 FROM accounts WHERE username=?").get(username))
    throw new AppError("El usuario ya existe.", 409);
  const result = db
    .prepare(
      "INSERT INTO accounts(username,password_hash,role,must_change_password) VALUES(?,?,?,1)",
    )
    .run(username, auth.hashPassword(req.body.password), role);
  audit(req, "crear", "cuenta", result.lastInsertRowid, { username, role });
  res.status(201).json({ exito: true });
});
router.patch("/accounts/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (id === req.session.accountId)
    throw new AppError("No puedes desactivar tu propia cuenta.");
  const row = db.prepare("SELECT * FROM accounts WHERE id=?").get(id);
  if (!row) throw new AppError("Cuenta no encontrada.", 404);
  if (req.body.password) {
    auth.validatePassword(req.body.password);
    db.prepare(
      "UPDATE accounts SET password_hash=?,must_change_password=1,token_version=token_version+1 WHERE id=?",
    ).run(auth.hashPassword(req.body.password), id);
  }
  if (req.body.active !== undefined)
    db.prepare(
      "UPDATE accounts SET active=?,token_version=token_version+1 WHERE id=?",
    ).run(req.body.active ? 1 : 0, id);
  audit(req, "actualizar", "cuenta", id);
  res.json({ exito: true });
});
router.get("/audit", requireAdmin, (req, res) =>
  res.json(
    db.prepare("SELECT * FROM audit_events ORDER BY id DESC LIMIT 200").all(),
  ),
);
router.post("/backup", requireAdmin, (req, res) => {
  const dir = path.join(config.dataDir, "backups");
  fs.mkdirSync(dir, { recursive: true });
  const filename = `ingemat-${Date.now()}.db`;
  db.prepare("VACUUM INTO ?").run(path.join(dir, filename));
  audit(req, "backup", "config", filename);
  res.json({
    exito: true,
    filename,
    mensaje:
      "Copia consistente creada. Incluye también la carpeta imports y la clave de sesión en tu respaldo protegido.",
  });
});
router.get("/backups/:name", requireAdmin, (req, res) => {
  if (!/^ingemat-\d+\.db$/.test(req.params.name))
    throw new AppError("Nombre inválido.");
  res.download(path.join(config.dataDir, "backups", req.params.name));
});
router.get("/students", requirePermission("usuarios:read"), (req, res) => {
  const rows = db
    .prepare(
      "SELECT codigo,nombre,apellido,ciclo,turno,area,uid FROM usuarios WHERE rol='estudiante' ORDER BY apellido,nombre",
    )
    .all();
  res.json(
    rows.map((u) => ({
      ...u,
      contacts: db
        .prepare(
          "SELECT id,name,phone,consent,active FROM contacts WHERE user_uid=?",
        )
        .all(u.uid),
    })),
  );
});
router.patch("/students/:code", requireAdmin, (req, res) => {
  const code = req.params.code.toUpperCase(),
    area = String(req.body.area || "")
      .trim()
      .toUpperCase();
  if (area && !/^[A-Z0-9_-]{1,20}$/.test(area))
    throw new AppError("Código de área inválido.");
  if (
    !db.prepare("UPDATE usuarios SET area=? WHERE codigo=?").run(area, code)
      .changes
  )
    throw new AppError("Estudiante no encontrado.", 404);
  audit(req, "actualizar_area", "usuario", code, { area });
  res.json({ exito: true });
});
router.post("/students/:code/contacts", requireAdmin, (req, res) => {
  const user = db
    .prepare("SELECT * FROM usuarios WHERE codigo=?")
    .get(req.params.code.toUpperCase());
  if (!user) throw new AppError("Estudiante no encontrado.", 404);
  const name = String(req.body.name || "").trim(),
    phone = String(req.body.phone || "").replace(/[\s()-]/g, "");
  if (!name || name.length > 100 || !/^\+[1-9]\d{7,14}$/.test(phone))
    throw new AppError("Indica nombre y teléfono internacional (+51...).");
  const id = randomUUID(),
    consent = req.body.consent === true ? 1 : 0;
  db.prepare(
    "INSERT INTO contacts(id,user_uid,name,phone,consent,consented_at) VALUES(?,?,?,?,?,?) ON CONFLICT(user_uid,phone) DO UPDATE SET name=excluded.name,consent=excluded.consent,consented_at=excluded.consented_at,active=1",
  ).run(
    id,
    user.uid,
    name,
    phone,
    consent,
    consent ? new Date().toISOString() : null,
  );
  audit(req, "guardar_contacto", "usuario", user.codigo, { consent });
  res.json({ exito: true });
});
router.delete("/contacts/:id", requireAdmin, (req, res) => {
  db.prepare("UPDATE contacts SET active=0,consent=0 WHERE id=?").run(
    req.params.id,
  );
  audit(req, "revocar_contacto", "contacto", req.params.id);
  res.json({ exito: true });
});
router.get("/attendance", requirePermission("reportes:read"), (req, res) =>
  res.json({
    exito: true,
    rows: attendance.list(
      req.query.date || businessDate(),
      String(req.query.ciclo || ""),
      String(req.query.turno || ""),
    ),
  }),
);
router.get(
  "/attendance/excel",
  requirePermission("reportes:read"),
  async (req, res) => {
    const day = req.query.date || businessDate();
    res
      .type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .attachment(`asistencias-${day}.xlsx`);
    await attendance
      .workbook(
        day,
        String(req.query.ciclo || ""),
        String(req.query.turno || ""),
      )
      .xlsx.write(res);
    res.end();
  },
);
router.get(
  "/attendance/image",
  requirePermission("reportes:read"),
  (req, res) => {
    const png = attendance.image(
      req.query.date || businessDate(),
      String(req.query.ciclo || ""),
      String(req.query.turno || ""),
    );
    res.set("Cache-Control", "no-store").type("image/png").send(png);
  },
);
router.post(
  "/attendance/:id/justify",
  requirePermission("asistencias:justify"),
  (req, res) => {
    attendance.justify(req.params.id, req.body.reason, req);
    res.json({ exito: true });
  },
);
router.get("/exams", read, (req, res) =>
  res.json(
    db
      .prepare(
        "SELECT e.id,e.titulo,e.ciclo,e.fecha,e.estado,e.revision,e.numPreguntas,e.totalPreguntasCuadernillo,CASE WHEN e.definition!='' THEN json_extract(e.definition,'$.totalQuestions') ELSE NULL END AS physical_questions,COUNT(r.id) AS participants FROM evaluaciones e LEFT JOIN respuestas_evaluacion r ON r.evaluacion_id=e.id WHERE e.estado!='archivado' GROUP BY e.id ORDER BY e.creado_en DESC",
      )
      .all()
      .map((e) => ({
        ...e,
        definition: e.physical_questions
          ? { totalQuestions: e.physical_questions, summary: true }
          : null,
      })),
  ),
);
router.get("/exams/:id", read, (req, res) => {
  const exam = evaluations.getExam(req.params.id);
  const eligibleStudentCodes = db
    .prepare(
      "SELECT codigo FROM usuarios WHERE rol='estudiante' AND (UPPER(ciclo)=UPPER(?) OR uid IN (SELECT user_uid FROM exam_roster WHERE evaluation_id=?)) ORDER BY apellido,nombre",
    )
    .all(exam.ciclo, exam.id)
    .map((u) => u.codigo);
  res.json({ ...exam, eligibleStudentCodes });
});
router.post("/exams", write, (req, res) =>
  res.status(201).json(evaluations.saveExam(req.body, req)),
);
router.put("/exams/:id", write, (req, res) =>
  res.json(evaluations.saveExam(req.body, req, req.params.id)),
);
router.post("/exams/:id/ready", write, (req, res) =>
  res.json(evaluations.readyExam(req.params.id, req)),
);
router.post("/exams/:id/publish", write, (req, res) => {
  const exam = evaluations.getExam(req.params.id);
  if (exam.estado !== "listo") throw new AppError("Primero valida el examen.");
  if (
    !db
      .prepare("SELECT 1 FROM respuestas_evaluacion WHERE evaluacion_id=?")
      .get(exam.id)
  )
    throw new AppError("Registra las calificaciones antes de publicar.");
  db.prepare("UPDATE evaluaciones SET estado='publicado' WHERE id=?").run(
    exam.id,
  );
  audit(req, "publicar", "evaluacion", exam.id);
  res.json({ exito: true });
});
router.post("/exams/:id/notify", requireAdmin, (req, res) => {
  const exam = evaluations.getExam(req.params.id);
  if (exam.estado !== "publicado")
    throw new AppError("Publica los resultados antes de enviar avisos.");
  const queued = notifications.notifyResults(exam, req);
  audit(req, "notificar_resultados", "evaluacion", exam.id, { queued });
  res.json({ exito: true, queued });
});
router.post("/exams/:id/revise-keys", write, (req, res) =>
  res.json(evaluations.reviseKeys(req.params.id, req.body, req)),
);
router.post("/exams/:id/grade", write, (req, res) =>
  res.json({
    exito: true,
    resultado: evaluations.saveGrade(req.params.id, req.body, req, {
      allowReplace: req.body.allowReplace === true,
      reason:
        req.body.reason || (req.body.allowReplace ? "" : "Registro manual"),
    }),
  }),
);
router.get("/exams/:id/results", read, (req, res) => {
  const exam = evaluations.getExam(req.params.id);
  const rows = db
    .prepare(
      "SELECT * FROM respuestas_evaluacion WHERE evaluacion_id=? ORDER BY puntajeTotal DESC,codigoEstudiante",
    )
    .all(exam.id);
  res.json({
    exito: true,
    exam,
    rows: rows.map((r) => ({
      ...r,
      detail: JSON.parse(r.detail || "{}"),
      respuestas: JSON.parse(r.respuestas || "{}"),
    })),
  });
});
router.get("/exams/:id/history/:code", read, (req, res) =>
  res.json(
    db
      .prepare(
        "SELECT revision,actor,reason,created_at,snapshot FROM grade_history WHERE evaluation_id=? AND student_code=? ORDER BY id DESC",
      )
      .all(req.params.id, req.params.code.toUpperCase()),
  ),
);
router.delete("/exams/:id", write, (req, res) => {
  db.prepare("UPDATE evaluaciones SET estado='archivado' WHERE id=?").run(
    req.params.id,
  );
  audit(req, "archivar", "evaluacion", req.params.id);
  res.json({ exito: true });
});
router.get("/exams/:id/sheets.pdf", write, async (req, res) => {
  const exam = evaluations.getExam(req.params.id);
  const students = req.query.code
    ? db
        .prepare(
          "SELECT * FROM usuarios WHERE codigo=? AND rol='estudiante' AND (UPPER(ciclo)=UPPER(?) OR uid IN (SELECT user_uid FROM exam_roster WHERE evaluation_id=?))",
        )
        .all(String(req.query.code).toUpperCase(), exam.ciclo, exam.id)
    : db
        .prepare(
          "SELECT * FROM usuarios WHERE rol='estudiante' AND (UPPER(ciclo)=UPPER(?) OR uid IN (SELECT user_uid FROM exam_roster WHERE evaluation_id=?)) ORDER BY apellido,nombre",
        )
        .all(exam.ciclo, exam.id);
  const bytes = await makePDF(exam, students, {
    form: String(req.query.form || "A"),
    mode: String(req.query.mode || "personalized"),
    format: String(req.query.format || "quarter-duplex"),
    count: Number(req.query.count ?? 4),
    edge: String(req.query.edge || "short"),
  });
  audit(req, "imprimir_cartillas", "evaluacion", exam.id, {
    estudiantes: students.length,
  });
  res.type("application/pdf").attachment("cartillas-ingemat.pdf").send(bytes);
});
router.get("/exams/:id/csv-template", write, (req, res) => {
  const exam = evaluations.getExam(req.params.id);
  const header = [
    "codigo",
    "area",
    "version",
    ...Array.from({ length: exam.definition.totalQuestions }, (_, i) => i + 1),
  ].join(",");
  res
    .type("text/csv")
    .attachment("plantilla-respuestas.csv")
    .send("\uFEFF" + header + "\r\n");
});
router.post("/exams/:id/import-csv", write, (req, res) =>
  res.json(imports.createCSV(req.params.id, req.body.csv, req)),
);
router.post(
  "/exams/:id/scan",
  write,
  upload.array("files", 10),
  (req, res, next) => {
    try {
      res.status(202).json(imports.createScan(req.params.id, req.files, req));
    } catch (e) {
      next(e);
    } finally {
      for (const f of req.files || [])
        if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
    }
  },
);
router.get("/imports", read, (req, res) =>
  res.json(
    db
      .prepare(
        "SELECT id,evaluation_id,revision,source,status,error,actor,created_at FROM import_batches ORDER BY created_at DESC LIMIT 100",
      )
      .all(),
  ),
);
router.get("/imports/:id", read, (req, res) => {
  const b = imports.batch(req.params.id);
  res.json({
    ...b,
    files: b.files.map((f) => ({ name: f.name })),
    result: {
      ...b.result,
      pages: b.result.pages?.map((p, i) => ({
        ...p,
        imagePath: undefined,
        imageUrl: p.imagePath
          ? `/api/v2/imports/${b.id}/pages/${i}/image`
          : null,
      })),
    },
  });
});
router.get("/imports/:id/pages/:index/image", read, (req, res) => {
  const b = imports.batch(req.params.id),
    p = b.result.pages?.[Number(req.params.index)];
  if (!p?.imagePath) throw new AppError("Imagen no disponible.", 404);
  const resolved = path.resolve(config.dataDir, p.imagePath);
  if (!resolved.startsWith(path.join(imports.root, b.id) + path.sep))
    throw new AppError("Ruta inválida.", 403);
  res.type("image/png").sendFile(resolved);
});
router.patch("/imports/:id/pages/:index", write, (req, res) =>
  res.json(
    imports.reviewPage(req.params.id, Number(req.params.index), req.body, req),
  ),
);
router.post("/imports/:id/refresh", write, (req, res) => {
  imports.refreshBatch(req.params.id, req);
  res.json({ exito: true });
});
router.post("/imports/:id/commit", write, (req, res) =>
  res.json({
    exito: true,
    results: imports.commitBatch(req.params.id, req.body, req),
  }),
);
router.get("/templates", read, (req, res) =>
  res.json([
    ...listPresets(),
    ...db
      .prepare("SELECT * FROM exam_templates ORDER BY name")
      .all()
      .map((t) => ({ ...t, definition: JSON.parse(t.definition) })),
  ]),
);
router.post("/templates", write, (req, res) => {
  const name = String(req.body.name || "").trim();
  if (!name || name.length > 100)
    throw new AppError("Nombre de plantilla inválido.");
  const def = normalizeDefinition(req.body.definition, { complete: false }),
    id = randomUUID();
  db.prepare(
    "INSERT INTO exam_templates(id,name,definition) VALUES(?,?,?)",
  ).run(id, name, JSON.stringify(def));
  audit(req, "guardar_plantilla", "plantilla", id);
  res.status(201).json({ exito: true, id });
});
router.get("/notifications", requireAdmin, (req, res) =>
  res.json({
    exito: true,
    status: notifications.status(),
    config: notifications.getConfig(),
    outbox: db
      .prepare(
        "SELECT id,recipient,kind,status,attempts,error,provider_id,created_at FROM outbox ORDER BY created_at DESC LIMIT 100",
      )
      .all(),
  }),
);
router.put("/notifications/config", requireAdmin, (req, res) => {
  const c = req.body;
  if (
    typeof c.enabled !== "boolean" ||
    !/^\w{2,3}(?:_\w{2})?$/.test(c.language || "") ||
    ["attendanceTemplate", "resultsTemplate"].some(
      (k) => !/^[a-z0-9_]{0,100}$/.test(c[k] || ""),
    )
  )
    throw new AppError("Configuración de plantillas inválida.");
  if (
    c.enabled &&
    (!notifications.status().configured ||
      !c.attendanceTemplate ||
      !c.resultsTemplate)
  )
    throw new AppError(
      "Completa las credenciales del servidor y ambas plantillas antes de activar los envíos.",
    );
  const clean = {
    enabled: c.enabled,
    language: c.language,
    attendanceTemplate: c.attendanceTemplate || "",
    resultsTemplate: c.resultsTemplate || "",
  };
  db.prepare(
    "INSERT OR REPLACE INTO config_general(clave,valor) VALUES('whatsapp_cloud_config',?)",
  ).run(JSON.stringify(clean));
  audit(req, "configurar_whatsapp", "config", "cloud", { enabled: c.enabled });
  res.json({ exito: true });
});
router.post("/notifications/:id/retry", requireAdmin, (req, res) => {
  const row = db.prepare("SELECT * FROM outbox WHERE id=?").get(req.params.id);
  if (!row || !["failed", "unknown"].includes(row.status))
    throw new AppError("El mensaje no se puede reenviar en su estado actual.");
  if (
    row.kind === "results" &&
    notifications.resultState(JSON.parse(row.payload)) !== "current"
  )
    throw new AppError(
      "El resultado fue modificado o está sin publicar. Revisa, publica y genera el aviso actualizado.",
      409,
    );
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
