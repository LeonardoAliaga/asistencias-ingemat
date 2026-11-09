const crypto = require("node:crypto");
const db = require("../database/db");
const { AppError } = require("../utils/errors");
function getConfig() {
  const row = db
    .prepare(
      "SELECT valor FROM config_general WHERE clave='whatsapp_cloud_config'",
    )
    .get();
  return {
    enabled: false,
    language: "es",
    attendanceTemplate: "",
    resultsTemplate: "",
    ...JSON.parse(row?.valor || "{}"),
  };
}
function credentials() {
  return {
    token: process.env.WHATSAPP_ACCESS_TOKEN,
    phoneId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    version: process.env.WHATSAPP_API_VERSION || "v25.0",
  };
}
function status() {
  const c = credentials();
  return {
    provider: "meta_cloud",
    configured: !!(
      c.token &&
      c.phoneId &&
      process.env.WHATSAPP_APP_SECRET &&
      process.env.WHATSAPP_VERIFY_TOKEN
    ),
    enabled: getConfig().enabled,
    version: c.version,
    groupSupport: false,
  };
}
function enqueue({ eventKey, recipient, kind, payload, contactId = null }) {
  if (!/^\+[1-9]\d{7,14}$/.test(recipient))
    throw new AppError(
      "El teléfono debe tener formato internacional, por ejemplo +51900111222.",
    );
  const id = crypto.randomUUID();
  const result = db
    .prepare(
      "INSERT OR IGNORE INTO outbox(id,event_key,recipient,kind,payload,contact_id) VALUES(?,?,?,?,?,?)",
    )
    .run(id, eventKey, recipient, kind, JSON.stringify(payload), contactId);
  return result.changes
    ? id
    : db.prepare("SELECT id FROM outbox WHERE event_key=?").get(eventKey).id;
}
function notifyAttendance(record, user) {
  const config = getConfig();
  if (!config.enabled) return 0;
  if (!config.attendanceTemplate)
    throw new AppError("Configura la plantilla de asistencia de WhatsApp.");
  const contacts = db
    .prepare(
      "SELECT * FROM contacts WHERE user_uid=? AND consent=1 AND active=1",
    )
    .all(user.uid);
  for (const c of contacts)
    enqueue({
      eventKey: `asistencia:${record.id}:${c.id}`,
      recipient: c.phone,
      contactId: c.id,
      kind: "attendance",
      payload: {
        template: config.attendanceTemplate,
        language: config.language,
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
  if (!config.enabled || !config.resultsTemplate)
    throw new AppError(
      "Activa WhatsApp y configura la plantilla de resultados.",
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
        .get(`resultado:${exam.id}:${exam.revision}:${r.id}:${c.id}`);
      enqueue({
        eventKey: `resultado:${exam.id}:${exam.revision}:${r.id}:${c.id}`,
        recipient: c.phone,
        contactId: c.id,
        kind: "results",
        payload: {
          evaluationId: exam.id,
          gradeId: r.id,
          revision: exam.revision,
          template: config.resultsTemplate,
          language: config.language,
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
    "UPDATE outbox SET status='cancelled',error='La calificación cambió. Revisa y publica los resultados actualizados.',updated_at=CURRENT_TIMESTAMP WHERE kind='results' AND json_extract(payload,'$.evaluationId')=? AND contact_id IN (SELECT id FROM contacts WHERE user_uid=?) AND status IN ('pending','retry','failed')",
  ).run(evaluationId, userUid);
}
async function send(row, fetchImpl = fetch) {
  const c = credentials();
  if (!c.token || !c.phoneId)
    throw new AppError("Faltan las credenciales de WhatsApp Cloud API.", 503);
  if (!/^v\d+\.\d+$/.test(c.version) || !/^\d+$/.test(c.phoneId))
    throw new AppError(
      "La versión de API o el identificador del número no son válidos.",
    );
  const payload = JSON.parse(row.payload);
  const response = await fetchImpl(
    `https://graph.facebook.com/${c.version}/${c.phoneId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${c.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        biz_opaque_callback_data: row.id,
        recipient_type: "individual",
        to: row.recipient.replace("+", ""),
        type: "template",
        template: {
          name: payload.template,
          language: { code: payload.language },
          components: [
            {
              type: "body",
              parameters: payload.parameters.map((text) => ({
                type: "text",
                text: String(text),
              })),
            },
          ],
        },
      }),
      signal: AbortSignal.timeout(20000),
    },
  );
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(
      `Meta ${result.error?.code || response.status}: ${result.error?.message || "No se pudo enviar"}`,
    );
    error.retryable = response.status === 429 || response.status >= 500;
    throw error;
  }
  const id = result.messages?.[0]?.id;
  if (!id) {
    const error = new Error(
      "Meta no devolvió identificador del mensaje. Comprueba la entrega antes de reenviar.",
    );
    error.deliveryUnknown = true;
    throw error;
  }
  return id;
}
let busy = false;
async function processOutbox(fetchImpl = fetch) {
  if (busy || !getConfig().enabled || !status().configured) return;
  busy = true;
  try {
    const rows = db
      .prepare(
        "SELECT o.* FROM outbox o LEFT JOIN evaluaciones e ON e.id=json_extract(o.payload,'$.evaluationId') WHERE o.status IN ('pending','retry') AND o.next_attempt_at<=? AND (o.kind!='results' OR json_extract(o.payload,'$.gradeId') IS NULL OR e.estado IN ('publicado','archivado') OR NOT EXISTS (SELECT 1 FROM respuestas_evaluacion r WHERE r.id=json_extract(o.payload,'$.gradeId'))) ORDER BY o.created_at LIMIT 5",
      )
      .all(Date.now());
    for (const row of rows) {
      if (
        row.kind === "results" &&
        resultState(JSON.parse(row.payload)) === "stale"
      ) {
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
        const id = await send(row, fetchImpl);
        db.prepare(
          "UPDATE outbox SET status=CASE WHEN status IN ('sending','unknown','retry') THEN 'accepted' ELSE status END,provider_id=?,error='',updated_at=CURRENT_TIMESTAMP WHERE id=?",
        ).run(id, row.id);
      } catch (error) {
        // A timeout may occur after Meta accepted a message. Manual reconciliation prevents duplicate notices.
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
          String(error.message).slice(0, 500),
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
    if (
      !db.prepare("INSERT OR IGNORE INTO webhook_events(id) VALUES(?)").run(id)
        .changes
    )
      return;
    const row = db
      .prepare("SELECT id,status FROM outbox WHERE provider_id=? OR id=?")
      .get(event.id, String(event.biz_opaque_callback_data || ""));
    if (!row) return;
    db.prepare("UPDATE outbox SET provider_id=? WHERE id=?").run(
      event.id,
      row.id,
    );
    const order = { accepted: 0, sent: 1, delivered: 2, read: 3 };
    const next = event.status;
    if (next === "failed" && !["delivered", "read"].includes(row.status))
      db.prepare(
        "UPDATE outbox SET status='failed',error=?,updated_at=CURRENT_TIMESTAMP WHERE provider_id=?",
      ).run(JSON.stringify(event.errors || []).slice(0, 500), event.id);
    else if (
      order[next] !== undefined &&
      (order[row.status] ?? -1) < order[next]
    )
      db.prepare(
        "UPDATE outbox SET status=?,updated_at=CURRENT_TIMESTAMP WHERE provider_id=?",
      ).run(next, event.id);
  })();
}
module.exports = {
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
