const crypto = require("node:crypto");
const db = require("../database/db");
const notifications = require("./notifications.service");
const groups = require("./whatsapp-groups.service");
const storage = require("./whatsapp-report-storage.service");
const attendance = require("./attendance.service");
const { AppError } = require("../utils/errors");
const { audit } = require("./audit.service");
function student(code) {
  const row = db
    .prepare(
      "SELECT uid,codigo,nombre,apellido FROM usuarios WHERE codigo=? AND rol='estudiante'",
    )
    .get(
      String(code || "")
        .trim()
        .toUpperCase(),
    );
  if (!row) throw new AppError("Estudiante no encontrado.", 404);
  return row;
}
function contacts(code) {
  const user = student(code);
  return db
    .prepare(
      "SELECT id,name,phone FROM contacts WHERE user_uid=? AND active=1 AND consent=1 ORDER BY name",
    )
    .all(user.uid);
}
async function enqueueReport(
  {
    kind,
    key,
    recipient,
    contactId = null,
    payload,
    png,
    format,
    breaks = [],
    requestId,
  },
  req,
) {
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(requestId))
    throw new AppError(
      "Identificador de envío inválido. Vuelve a abrir la ventana de envío.",
    );
  const fingerprint = crypto
    .createHash("sha256")
    .update(png)
    .update(JSON.stringify({ recipient, format, payload }))
    .digest("hex");
  const eventKey = `baileys:${kind}:${key}:${requestId}`;
  const existing = db
    .prepare("SELECT * FROM outbox WHERE event_key=?")
    .get(eventKey);
  if (existing) {
    if (JSON.parse(existing.payload).fingerprint !== fingerprint)
      throw new AppError(
        "Este intento ya corresponde a otro archivo. Vuelve a abrir el envío.",
        409,
      );
    return {
      exito: true,
      id: existing.id,
      status: existing.status,
      duplicate: true,
    };
  }
  const file = await storage.convertPNG(png, format, breaks);
  const attachment = storage.save(
    file,
    format,
    `Reporte_${payload.studentCode || payload.cycle || "INGEMAT"}_${payload.date || "academico"}`,
  );
  try {
    return db.transaction(() => {
      const id = notifications.enqueue({
        eventKey,
        recipient,
        kind,
        contactId,
        payload: { ...payload, attachment, fingerprint },
      });
      const row = db
        .prepare("SELECT status,payload FROM outbox WHERE id=?")
        .get(id);
      const savedPayload = JSON.parse(row.payload);
      if (savedPayload.fingerprint !== fingerprint)
        throw new AppError(
          "Este intento ya corresponde a otro archivo. Vuelve a abrir el envío.",
          409,
        );
      const duplicate = savedPayload.attachment.id !== attachment.id;
      if (duplicate) storage.remove(attachment);
      else
        audit(req, "enviar_reporte_whatsapp", "notificacion", id, {
          kind,
          format,
          studentCode: payload.studentCode,
          cycle: payload.cycle,
          date: payload.date,
          contactId,
        });
      return { exito: true, id, status: row.status, duplicate };
    })();
  } catch (e) {
    storage.remove(attachment);
    throw e;
  }
}
async function studentReport(input, req) {
  const user = student(input.studentCode);
  const contact = contacts(user.codigo).find((c) => c.id === input.contactId);
  if (!contact)
    throw new AppError(
      "Selecciona un apoderado autorizado de este estudiante.",
      409,
    );
  if (!Buffer.isBuffer(input.png))
    throw new AppError("No se recibió la imagen del reporte.");
  const period = String(input.period || "Todas las semanas registradas")
    .trim()
    .slice(0, 160);
  let breaks = [];
  try {
    breaks = JSON.parse(input.breaks || "[]");
    if (!Array.isArray(breaks) || breaks.length > 2000) throw new Error();
  } catch {
    throw new AppError("Los saltos de página del reporte no son válidos.");
  }
  return enqueueReport(
    {
      kind: "student_report",
      key: `${user.uid}:${contact.id}`,
      recipient: contact.phone,
      contactId: contact.id,
      payload: {
        studentUid: user.uid,
        studentCode: user.codigo,
        period,
        text: `Reporte académico de ${user.apellido} ${user.nombre} (${user.codigo}). ${period}.`,
      },
      png: input.png,
      format: input.format,
      breaks,
      requestId: input.requestId,
    },
    req,
  );
}
async function dailyReport(input, req) {
  if (typeof input.date !== "string")
    throw new AppError("Selecciona la fecha del reporte.");
  const target = groups.target(input.cycle);
  if (!target)
    throw new AppError(
      "Configura primero un grupo de WhatsApp para este ciclo en Comunicación.",
      409,
    );
  if (input.groupId !== target.id)
    throw new AppError(
      "El grupo del ciclo cambió. Revisa el destinatario antes de enviar.",
      409,
    );
  const shift = String(input.shift || "");
  const png = attendance.image(input.date, target.cycle, shift);
  // Classic attendance sections have 30px rows, with a 95px title/header/margins block.
  let offset = 0;
  const breaks = [];
  for (const section of attendance.imageSections(
    input.date,
    target.cycle,
    shift,
  )) {
    for (let i = 1; i <= section.rows.length; i++)
      breaks.push(offset + 85 + i * 30);
    offset += 95 + section.rows.length * 30;
    breaks.push(offset);
  }
  return enqueueReport(
    {
      kind: "attendance_report",
      key: `${target.cycle}:${input.date}:${shift || "todos"}`,
      recipient: target.id,
      payload: {
        cycle: target.cycle,
        date: input.date,
        shift,
        text: `Reporte de asistencia · ${target.cycle} · ${input.date}${shift ? " · " + shift : " · todos los turnos"}.`,
      },
      png,
      format: input.format,
      breaks,
      requestId: input.requestId,
    },
    req,
  );
}
module.exports = { contacts, studentReport, dailyReport };
