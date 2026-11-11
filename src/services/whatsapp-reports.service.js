const crypto = require("node:crypto");
const { attendanceReportCaption, studentReportCaption } = require("./whatsapp-report-captions.service");
const db = require("../database/db");
const notifications = require("./notifications.service");
const groups = require("./whatsapp-groups.service");
const storage = require("./whatsapp-report-storage.service");
const attendance = require("./attendance.service");
const studentPdf = require("./student-report-pdf.service");
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
    pdf = null,
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
    .update(pdf || png)
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
  const file = pdf || await storage.convertPNG(png, format, breaks);
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
  if (!["png","pdf"].includes(input.format)) throw new AppError("Selecciona imagen o PDF.");
  if (input.format === "png" && !Buffer.isBuffer(input.png))
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
  const pdf = input.format === "pdf" ? await studentPdf.generate(user.codigo,input.week||"TODAS") : null;
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
        text: studentReportCaption({ name: `${user.apellido} ${user.nombre}`, code: user.codigo, period, requestId: input.requestId }),
      },
      png: input.png,
      pdf,
      format: input.format,
      breaks,
      requestId: input.requestId,
    },
    req,
  );
}

const BATCH_MAX = 20;
// Ajusta aquí el rango de espera entre reportes consecutivos del mismo lote.
// Son segundos completos e incluyen ambos extremos. El primer envío es inmediato.
// Respeta siempre las políticas de WhatsApp y la autorización de cada destinatario.
const BATCH_INTERVAL_SECONDS = Object.freeze({ min: 10, max: 15 });
if (!Number.isInteger(BATCH_INTERVAL_SECONDS.min) ||
    !Number.isInteger(BATCH_INTERVAL_SECONDS.max) ||
    BATCH_INTERVAL_SECONDS.min < 1 ||
    BATCH_INTERVAL_SECONDS.max < BATCH_INTERVAL_SECONDS.min) {
  throw new Error("El intervalo de lotes de WhatsApp debe tener mínimo >= 1 y máximo >= mínimo.");
}
function nextBatchSpacingMs() {
  return crypto.randomInt(
    BATCH_INTERVAL_SECONDS.min,
    BATCH_INTERVAL_SECONDS.max + 1,
  ) * 1000;
}
function batchStudents(cycle) {
  const normalized=String(cycle||"").trim().toUpperCase();
  if (!normalized || normalized.length>80) throw new AppError("Selecciona un ciclo válido.");
  const found=db.prepare("SELECT 1 FROM ciclos WHERE UPPER(nombre)=?").get(normalized);
  if (!found) throw new AppError("El ciclo no existe.",404);
  const students=db.prepare(
    "SELECT codigo,apellido,nombre,ciclo FROM usuarios WHERE rol='estudiante' AND UPPER(ciclo)=? ORDER BY apellido,nombre,codigo"
  ).all(normalized);
  const getContacts=db.prepare(
    "SELECT id,name,phone FROM contacts WHERE user_uid=(SELECT uid FROM usuarios WHERE codigo=?) AND active=1 AND consent=1 ORDER BY name"
  );
  return {cycle:normalized,students:students.map(user=>({
    codigo:user.codigo,nombre:[user.apellido,user.nombre].filter(Boolean).join(" "),
    ciclo:user.ciclo,contacts:getContacts.all(user.codigo)
  }))};
}
async function batchStudentReports(input,req) {
  const collection=batchStudents(input?.cycle);
  const items=input?.items;
  if(!Array.isArray(items)||items.length<1||items.length>BATCH_MAX)
    throw new AppError("Selecciona de 1 a "+BATCH_MAX+" estudiantes por lote.");
  const batchId=String(input.requestId||"");
  if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(batchId))
    throw new AppError("Identificador de lote inválido.");
  if(input.format !== "pdf")
    throw new AppError("Los reportes individuales en lote se envían como PDF académico.");
  const week=studentPdf.weekValue(input.week||"TODAS");
  const byCode=new Map(collection.students.map(s=>[s.codigo,s]));
  const seen=new Set(),prepared=[];
  for(const item of items){
    if(!item||typeof item!=="object"||Array.isArray(item)) throw new AppError("Selección de estudiantes inválida.");
    const code=String(item.code||"").trim().toUpperCase();
    const selected=byCode.get(code);
    if(!selected||seen.has(code)) throw new AppError("Hay estudiantes repetidos o fuera del ciclo.");
    seen.add(code);
    const guardian=selected.contacts.find(c=>c.id===item.contactId);
    if(!guardian) throw new AppError("Un apoderado no está autorizado o ya no pertenece al estudiante "+code+".",409);
    prepared.push({code,guardian,user:student(code)});
  }
  // No admite sobrecargar la cola. Un nuevo lote se podrá preparar al liberar los anteriores.
  const existing=db.prepare(
    "SELECT COUNT(*) AS n FROM outbox WHERE kind='student_report' AND status IN ('pending','retry','sending') AND json_extract(CASE WHEN json_valid(payload) THEN payload ELSE '{}' END,'$.bulkBatchId') IS NOT NULL"
  ).get().n;
  const keys=prepared.map(({user,guardian})=>"baileys:student_report:"+user.uid+":"+guardian.id+":"+batchId);
  const duplicates=keys.filter(key=>db.prepare("SELECT 1 FROM outbox WHERE event_key=?").get(key)).length;
  if(existing+prepared.length-duplicates>40)
    throw new AppError("Hay demasiados reportes en cola. Revisa su entrega en Comunicación antes de crear otro lote.",409);
  const pending=db.prepare(
    "SELECT MAX(next_attempt_at) AS latest, COUNT(*) AS total FROM outbox WHERE kind='student_report' AND status IN ('pending','retry') AND json_extract(CASE WHEN json_valid(payload) THEN payload ELSE '{}' END,'$.bulkBatchId') IS NOT NULL"
  ).get();
  // El primer envío entra de inmediato si no hay otro lote pendiente.
  // Si existe cola anterior, se respeta su turno y la separación configurada.
  const previousDue=Number(pending?.latest||0);
  let scheduledAt=Number(pending?.total||0)>0
    ? Math.max(Date.now(),previousDue)+nextBatchSpacingMs()
    : 0;
  let newItems=0;
  const results=[];
  for(const {code,guardian,user} of prepared){
    const data=studentPdf.load(code,week);
    const pdf=await studentPdf.render(data);
    const sent=await enqueueReport({
      kind:"student_report",
      key:user.uid+":"+guardian.id,
      recipient:guardian.phone,
      contactId:guardian.id,
      payload:{
        studentUid:user.uid,studentCode:code,bulkBatchId:batchId,
        period:data.period,
        text:studentReportCaption({
          name:[user.apellido,user.nombre].filter(Boolean).join(" "),
          code,period:data.period,requestId:batchId+":"+code,
        }),
      },
      pdf,format:"pdf",requestId:batchId,
    },req);
    if(!sent.duplicate){
      if(newItems>0) scheduledAt=Math.max(Date.now(),scheduledAt)+nextBatchSpacingMs();
      db.prepare("UPDATE outbox SET next_attempt_at=? WHERE id=? AND status='pending'").run(scheduledAt,sent.id);
      newItems++;
    }
    results.push({code,id:sent.id,status:sent.status,duplicate:!!sent.duplicate});
  }
  return {exito:true,cycle:collection.cycle,selected:prepared.length,
    enqueued:results.filter(r=>!r.duplicate).length,duplicate:results.filter(r=>r.duplicate).length,
    results, spacingRangeSeconds:{...BATCH_INTERVAL_SECONDS}};
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
        text: attendanceReportCaption({ cycle: target.cycle, date: input.date, shift, requestId: input.requestId }),
      },
      png,
      format: input.format,
      breaks,
      requestId: input.requestId,
    },
    req,
  );
}
module.exports = { contacts, studentReport, dailyReport, batchStudents, batchStudentReports, BATCH_MAX };
