const crypto = require("node:crypto");
const db = require("../database/db");
const { AppError } = require("../utils/errors");
const { getConfig, renderMessage } = require("./notification-config.service");
const baileys = require("./baileys.service");
function providerReady() {
  return baileys.status().connected;
}
function status() {
  return {
    provider: "baileys",
    configured: providerReady(),
    enabled: getConfig().enabled,
    groupSupport: false,
    ...baileys.status(),
  };
}
function enqueue({ eventKey, recipient, kind, payload, contactId = null }) {
  const config = getConfig();
  const provider = "baileys";
  payload = {
    ...payload,
    text: renderMessage(kind, payload.parameters, config),
  };
  if (!/^\+[1-9]\d{7,14}$/.test(recipient))
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
  if (exam.estado !== "publicado")
    throw new AppError("Publica los resultados antes de enviar avisos.");
  const config = getConfig();
  if (!config.enabled)
    throw new AppError(
      "Activa los avisos de WhatsApp antes de generar notificaciones.",
    );
  let queued = 0;
  for (const r of db
    .prepare(
      "SELECT r.*,u.uid FROM respuestas_evaluacion r JOIN usuarios u ON u.codigo=r.codigoEstudiante WHERE r.evaluacion_id=?",
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
  return row.estado === "publicado" ? "current" : "paused";
}
function cancelPendingResults(evaluationId, userUid) {
  db.prepare(
    "UPDATE outbox SET status='cancelled',error='La calificación cambió. Revisa y publica los resultados actualizados.',updated_at=CURRENT_TIMESTAMP WHERE kind='results' AND json_extract(CASE WHEN json_valid(payload) THEN payload ELSE '{}' END,'$.evaluationId')=? AND contact_id IN (SELECT id FROM contacts WHERE user_uid=?) AND status IN ('pending','retry','failed')",
  ).run(evaluationId, userUid);
}
async function send(row) {
  if (row.provider !== "baileys")
    throw new AppError("Este aviso es histórico y no se enviará por Baileys.");
  const payload = JSON.parse(row.payload);
  return baileys.sendText(
    row.recipient,
    payload.text,
    row.id.replaceAll("-", "").toUpperCase(),
  );
}
let busy = false;
async function processOutbox(sendImpl = send) {
  const config = getConfig();
  if (busy || !config.enabled || !providerReady(config.provider)) return;
  busy = true;
  try {
    const rows = db
      .prepare(
        "SELECT o.* FROM outbox o LEFT JOIN evaluaciones e ON e.id=json_extract(CASE WHEN json_valid(o.payload) THEN o.payload ELSE '{}' END,'$.evaluationId') WHERE o.provider=? AND o.status IN ('pending','retry') AND o.next_attempt_at<=? AND (o.kind!='results' OR json_extract(CASE WHEN json_valid(o.payload) THEN o.payload ELSE '{}' END,'$.gradeId') IS NULL OR e.estado IN ('publicado','archivado') OR NOT EXISTS (SELECT 1 FROM respuestas_evaluacion r WHERE r.id=json_extract(CASE WHEN json_valid(o.payload) THEN o.payload ELSE '{}' END,'$.gradeId'))) ORDER BY o.created_at LIMIT 5",
      )
      .all(config.provider, Date.now());
    for (const row of rows) {
      if (config.provider === "baileys" && !providerReady("baileys")) break;
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
          "UPDATE outbox SET status='cancelled',error='La calificación o publicación cambió' WHERE id=?",
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
          ).run(baileys.REVIEW_NOTE, Date.now() + 30000, row.id);
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
          baileys.REVIEW_NOTE,
          Date.now() +
            Math.min(3600000, 30000 * 2 ** row.attempts) +
            Math.floor(Math.random() * 3000),
          row.id,
        );
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
    if (next === "failed" && !["delivered", "read"].includes(row.status))
      db.prepare(
        "UPDATE outbox SET status='failed',error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
      ).run(baileys.REVIEW_NOTE, row.id);
    else if (
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
};
