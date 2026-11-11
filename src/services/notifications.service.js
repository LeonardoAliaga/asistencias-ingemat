const crypto = require("node:crypto");
const db = require("../database/db");
const { AppError } = require("../utils/errors");
const { getConfig, renderMessage } = require("./notification-config.service");
const baileys = require("./baileys.service");
const reportStorage = require("./whatsapp-report-storage.service");
const groups = require("./whatsapp-groups.service");
const { GROUP_ID } = require("../whatsapp/media.cjs");
function providerReady() {
  return baileys.status().connected;
}
// Informes de error sin destinatarios, mensajes, contactos, QR ni datos de sesión.
function sendFailureDetail(error) {
  const code = /^[A-Z0-9_]{1,60}$/.test(String(error?.code || ""))
    ? error.code : "WHATSAPP_SEND_FAILED";
  const status = Number.isInteger(error?.providerStatus) &&
    error.providerStatus >= 100 && error.providerStatus <= 599
      ? " · estado " + error.providerStatus : "";
  const guidance = {
    BAILEYS_INVALID_MESSAGE: "Destinatario o mensaje rechazado por el validador.",
    BAILEYS_OFFLINE: "WhatsApp está desconectado; el aviso no llegó a enviarse.",
    BAILEYS_SEND_ERROR: "El envío falló en Baileys. Comprueba la conexión y los permisos del grupo; ante una entrega incierta, verifica antes de reintentar.",
    BAILEYS_SEND_TIMEOUT: "WhatsApp no respondió a tiempo. Comprueba si llegó antes de reintentar.",
  }[code] || "El componente de WhatsApp informó un error de envío.";
  return `${guidance} Código: ${code}${status}.`;
}
function logSendFailure(row, error, state) {
  const code = /^[A-Z0-9_]{1,60}$/.test(String(error?.code || ""))
    ? error.code : "WHATSAPP_SEND_FAILED";
  const details = {
    avisoId: row.id,
    tipo: row.kind,
    estado: state,
    codigo: code,
    intento: row.attempts + 1,
    noEnviado: error?.notSent === true,
    entregaIncierta: error?.deliveryUnknown === true,
  };
  if (Number.isInteger(error?.providerStatus)) details.estadoProveedor = error.providerStatus;
  console.error("[WhatsApp] Fallo de envío", details);
}
function status() {
  return {
    provider: "baileys",
    configured: providerReady(),
    enabled: getConfig().enabled,
    groupSupport: true,
    ...baileys.status(),
  };
}
function enqueue({ eventKey, recipient, kind, payload, contactId = null }) {
  const config = getConfig();
  const provider = "baileys";
  payload = {
    ...payload,
    text: ["student_report", "attendance_report", "exam_group_summary"].includes(kind)
      ? String(payload.text || "")
      : renderMessage(kind, payload.parameters, config),
  };
  if (
    !/^\+[1-9]\d{7,14}$/.test(recipient) &&
    !(["attendance_report", "exam_group_summary"].includes(kind) && GROUP_ID.test(recipient))
  )
    throw new AppError(
      "El teléfono debe tener formato internacional, por ejemplo +51900111222.",
    );
  const id = crypto.randomUUID();
  const result = db
    .prepare(
      "INSERT OR IGNORE INTO outbox(id,event_key,recipient,kind,payload,contact_id,provider) VALUES(?,?,?,?,?,?,?)",
    )
    .run(
      id,
      eventKey,
      recipient,
      kind,
      JSON.stringify(payload),
      contactId,
      provider,
    );
  return result.changes
    ? id
    : db.prepare("SELECT id FROM outbox WHERE event_key=?").get(eventKey).id;
}
function notifyAttendance(record, user) {
  const config = getConfig();
  if (!config.enabled) return 0;
  const contacts = db
    .prepare(
      "SELECT * FROM contacts WHERE user_uid=? AND consent=1 AND active=1",
    )
    .all(user.uid);
  for (const c of contacts)
    enqueue({
      eventKey: `baileys:asistencia:${record.id}:${c.id}`,
      recipient: c.phone,
      contactId: c.id,
      kind: "attendance",
      payload: {
        parameters: [
          record.name_snapshot,
          record.business_date,
          record.arrival_time,
          record.status,
        ],
      },
    });
  return contacts.length;
}
function notifyResults(exam, req) {
  if (!["listo", "publicado"].includes(exam.estado))
    throw new AppError("Valida el simulacro antes de notificar resultados.");
  if (!db.prepare("SELECT 1 FROM respuestas_evaluacion WHERE evaluacion_id=?").get(exam.id))
    throw new AppError("Registra las calificaciones antes de notificar resultados.", 409);
  // Una orden manual no activa los avisos automáticos de asistencia.
  let queued = 0;
  for (const r of db
    .prepare(
      "SELECT r.*,u.uid FROM respuestas_evaluacion r JOIN usuarios u ON u.codigo=r.codigoEstudiante WHERE r.evaluacion_id=? AND u.archived_at IS NULL",
    )
    .all(exam.id)) {
    for (const c of db
      .prepare(
        "SELECT * FROM contacts WHERE user_uid=? AND consent=1 AND active=1",
      )
      .all(r.uid)) {
      const before = db
        .prepare("SELECT id FROM outbox WHERE event_key=?")
        .get(`baileys:resultado:${exam.id}:${exam.revision}:${r.id}:${c.id}`);
      enqueue({
        eventKey: `baileys:resultado:${exam.id}:${exam.revision}:${r.id}:${c.id}`,
        recipient: c.phone,
        contactId: c.id,
        kind: "results",
        payload: {
          evaluationId: exam.id,
          gradeId: r.id,
          revision: exam.revision,
          parameters: [
            r.nombreEstudiante,
            exam.titulo,
            String(r.puntajeTotal),
            r.area,
          ],
        },
      });
      if (!before) queued++;
    }
  }
  return queued;
}
function resultState(payload) {
  if (!payload.evaluationId || !payload.gradeId) return "current";
  const row = db
    .prepare(
      "SELECT e.estado,r.revision FROM respuestas_evaluacion r JOIN evaluaciones e ON e.id=r.evaluacion_id WHERE r.id=? AND e.id=?",
    )
    .get(payload.gradeId, payload.evaluationId);
  if (!row || row.revision !== payload.revision || row.estado === "archivado")
    return "stale";
  return ["listo", "publicado"].includes(row.estado) ? "current" : "paused";
}
function cancelPendingResults(evaluationId, userUid) {
  db.prepare(
    "UPDATE outbox SET status='cancelled',error='La calificación cambió. Revisa las respuestas antes de generar nuevos avisos.',updated_at=CURRENT_TIMESTAMP WHERE kind='results' AND json_extract(CASE WHEN json_valid(payload) THEN payload ELSE '{}' END,'$.evaluationId')=? AND contact_id IN (SELECT id FROM contacts WHERE user_uid=?) AND status IN ('pending','retry','failed')",
  ).run(evaluationId, userUid);
}
function cancelPendingAttendance(recordId) {
  return db
    .prepare(
      "UPDATE outbox SET status='cancelled',error='El registro de asistencia fue eliminado.',updated_at=CURRENT_TIMESTAMP WHERE kind='attendance' AND (instr(event_key,?)=1 OR instr(event_key,?)=1) AND status IN ('pending','retry','failed')",
    )
    .run(`baileys:asistencia:${recordId}:`, `asistencia:${recordId}:`).changes;
}
function attendanceDeleted(row) {
  if (row.kind !== "attendance") return false;
  const match = /^(?:baileys:)?asistencia:([^:]+):/.exec(row.event_key);
  return (
    !!match && !db.prepare("SELECT 1 FROM attendance WHERE id=?").get(match[1])
  );
}
function reportState(row) {
  if (!["student_report", "attendance_report", "exam_group_summary"].includes(row.kind))
    return { current: true };
  try {
    const payload = JSON.parse(row.payload);
    if (row.kind === "exam_group_summary") {
      const target=groups.target(payload.cycle);
      const report=require("./exam-group-results.service").snapshot(payload.evaluationId);
      if (!target || target.id !== row.recipient || !["listo", "publicado"].includes(report.exam.estado)
          || report.signature !== payload.signature)
        return { current:false,cancel:true,
          error:"El grupo o los resultados cambiaron. Publica nuevamente el resumen actualizado." };
      return { current:true };
    }
    if (
      row.kind === "attendance_report" &&
      groups.target(payload.cycle)?.id !== row.recipient
    )
      return {
        current: false,
        cancel: true,
        error: "El grupo del ciclo cambió. Genera el reporte nuevamente.",
      };
    if (
      row.kind === "student_report" &&
      !db
        .prepare(
          "SELECT 1 FROM contacts WHERE id=? AND user_uid=? AND phone=? AND active=1 AND consent=1",
        )
        .get(row.contact_id, payload.studentUid, row.recipient)
    )
      return {
        current: false,
        cancel: true,
        error:
          "El apoderado ya no tiene autorización para recibir este reporte.",
      };
    reportStorage.read(payload.attachment);
    return { current: true };
  } catch {
    return {
      current: false,
      error:
        "El archivo del reporte no está disponible. Genera y envía un reporte nuevo.",
    };
  }
}
async function send(row) {
  if (row.provider !== "baileys")
    throw new AppError("Este aviso es histórico y no se enviará por Baileys.");
  const payload = JSON.parse(row.payload);
  if (["student_report", "attendance_report"].includes(row.kind))
    return baileys.sendMedia(
      row.recipient,
      payload.text,
      row.id.replaceAll("-", "").toUpperCase(),
      payload.attachment,
    );
  return baileys.sendText(
    row.recipient,
    payload.text,
    row.id.replaceAll("-", "").toUpperCase(),
  );
}
let busy = false;
async function processOutbox(sendImpl = send) {
  const config = getConfig();
  if (busy || !providerReady(config.provider)) return;
  busy = true;
  try {
    const rows = db
      .prepare(
        "SELECT o.* FROM outbox o LEFT JOIN evaluaciones e ON e.id=json_extract(CASE WHEN json_valid(o.payload) THEN o.payload ELSE '{}' END,'$.evaluationId') WHERE o.provider=? AND (?=1 OR o.kind IN ('student_report','attendance_report','exam_group_summary','results')) AND o.status IN ('pending','retry') AND o.next_attempt_at<=? AND (o.kind!='results' OR json_extract(CASE WHEN json_valid(o.payload) THEN o.payload ELSE '{}' END,'$.gradeId') IS NULL OR e.estado IN ('listo','publicado','archivado') OR NOT EXISTS (SELECT 1 FROM respuestas_evaluacion r WHERE r.id=json_extract(CASE WHEN json_valid(o.payload) THEN o.payload ELSE '{}' END,'$.gradeId'))) ORDER BY o.created_at LIMIT 5",
      )
      .all(config.provider, config.enabled ? 1 : 0, Date.now());
    for (const row of rows) {
      if (config.provider === "baileys" && !providerReady("baileys")) break;
      if (attendanceDeleted(row)) {
        db.prepare(
          "UPDATE outbox SET status='cancelled',error='El registro de asistencia fue eliminado.',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('pending','retry')",
        ).run(row.id);
        continue;
      }
      const report = reportState(row);
      if (!report.current) {
        db.prepare(
          "UPDATE outbox SET status=?,error=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('pending','retry')",
        ).run(report.cancel ? "cancelled" : "failed", report.error, row.id);
        continue;
      }
      let payload;
      try {
        payload = JSON.parse(row.payload);
      } catch {
        db.prepare("UPDATE outbox SET status='failed',error=? WHERE id=?").run(
          "Datos del aviso inválidos. Revisa el paquete y la configuración de WhatsApp.",
          row.id,
        );
        continue;
      }
      if (row.kind === "results" && resultState(payload) === "stale") {
        db.prepare(
          "UPDATE outbox SET status='cancelled',error='La calificación o el simulacro cambió' WHERE id=?",
        ).run(row.id);
        continue;
      }
      if (
        row.contact_id &&
        !db
          .prepare(
            "SELECT 1 FROM contacts WHERE id=? AND active=1 AND consent=1",
          )
          .get(row.contact_id)
      ) {
        db.prepare(
          "UPDATE outbox SET status='cancelled',error='Autorización revocada' WHERE id=?",
        ).run(row.id);
        continue;
      }
      if (
        !db
          .prepare(
            "UPDATE outbox SET status='sending',attempts=attempts+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('pending','retry')",
          )
          .run(row.id).changes
      )
        continue;
      try {
        if (row.provider === "baileys")
          db.prepare("UPDATE outbox SET provider_id=? WHERE id=?").run(
            row.id.replaceAll("-", "").toUpperCase(),
            row.id,
          );
        const id = await sendImpl(row);
        db.prepare(
          "UPDATE outbox SET status=CASE WHEN status IN ('sending','unknown','retry') THEN 'accepted' ELSE status END,provider_id=?,error='',updated_at=CURRENT_TIMESTAMP WHERE id=?",
        ).run(id, row.id);
      } catch (error) {
        if (
          row.provider === "baileys" &&
          error.notSent === true &&
          error.code !== "BAILEYS_INVALID_MESSAGE"
        ) {
          db.prepare(
            "UPDATE outbox SET status='pending',attempts=MAX(0,attempts-1),error=?,next_attempt_at=? WHERE id=? AND status='sending'",
          ).run(sendFailureDetail(error), Date.now() + 30000, row.id);
          if (row.error !== sendFailureDetail(error))
            logSendFailure(row, error, "pending");
          break;
        }
        // The worker may fail after WhatsApp accepted a message. Manual reconciliation prevents duplicate notices.
        const uncertain =
          ["TimeoutError", "AbortError"].includes(error.name) ||
          error instanceof TypeError ||
          error instanceof SyntaxError ||
          error.deliveryUnknown === true;
        const retry = error.retryable && row.attempts < 4 && !uncertain;
        db.prepare(
          "UPDATE outbox SET status=?,error=?,next_attempt_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='sending'",
        ).run(
          uncertain ? "unknown" : retry ? "retry" : "failed",
          sendFailureDetail(error),
          Date.now() +
            Math.min(3600000, 30000 * 2 ** row.attempts) +
            Math.floor(Math.random() * 3000),
          row.id,
        );
        logSendFailure(row, error, uncertain ? "unknown" : retry ? "retry" : "failed");
      }
    }
  } finally {
    busy = false;
  }
}
function handleStatus(event) {
  if (
    !event ||
    typeof event.id !== "string" ||
    !["sent", "delivered", "read", "failed"].includes(event.status)
  )
    return;
  const id = crypto
    .createHash("sha256")
    .update(JSON.stringify(event))
    .digest("hex");
  db.transaction(() => {
    const row = db
      .prepare(
        "SELECT id,status FROM outbox WHERE provider='baileys' AND provider_id=?",
      )
      .get(event.id);
    if (!row) return;
    if (
      !db
        .prepare("INSERT OR IGNORE INTO notification_receipts(id) VALUES(?)")
        .run(id).changes
    )
      return;
    db.prepare("UPDATE outbox SET provider_id=? WHERE id=?").run(
      event.id,
      row.id,
    );
    const order = { accepted: 0, sent: 1, delivered: 2, read: 3 };
    const next = event.status;
    if (next === "failed" && !["delivered", "read"].includes(row.status)) {
      db.prepare(
        "UPDATE outbox SET status='failed',error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
      ).run("WhatsApp confirmó que el aviso no fue entregado. Revisa la conexión y el destinatario. Código: BAILEYS_DELIVERY_FAILED.", row.id);
      console.error("[WhatsApp] Fallo de entrega", {
        avisoId: row.id, codigo: "BAILEYS_DELIVERY_FAILED",
      });
    } else if (
      order[next] !== undefined &&
      (order[row.status] ?? -1) < order[next]
    )
      db.prepare(
        "UPDATE outbox SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
      ).run(next, row.id);
  })();
}
baileys.onDelivery(handleStatus);
module.exports = {
  providerReady,
  getConfig,
  status,
  enqueue,
  notifyAttendance,
  notifyResults,
  processOutbox,
  handleStatus,
  send,
  resultState,
  cancelPendingResults,
  cancelPendingAttendance,
  attendanceDeleted,
  reportState,
};
