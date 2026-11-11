// Un mensaje grupal no contiene nombres, códigos ni notas individuales.
const crypto = require("node:crypto");
const db = require("../database/db");
const groups = require("./whatsapp-groups.service");
const notifications = require("./notifications.service");
const { audit } = require("./audit.service");
const { AppError } = require("../utils/errors");
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

function snapshot(id) {
  const exam = db.prepare("SELECT id,titulo,ciclo,fecha,estado,revision FROM evaluaciones WHERE id=?").get(id);
  if (!exam) throw new AppError("Simulacro no encontrado.", 404);
  const rows = db.prepare(
    "SELECT area,puntajeTotal,correctas,incorrectas,enBlanco FROM respuestas_evaluacion WHERE evaluacion_id=? ORDER BY area,puntajeTotal DESC,id",
  ).all(id);
  const signature = crypto.createHash("sha256")
    .update(JSON.stringify({ exam, rows })).digest("hex");
  return { exam, rows, signature };
}
function formatNumber(value) {
  return Number(value).toLocaleString("es-PE", { maximumFractionDigits: 3 });
}
function textSummary(report) {
  const { exam, rows } = report;
  const mean = rows.reduce((sum, row) => sum + row.puntajeTotal, 0) / rows.length;
  const grouped = Map.groupBy(rows, row => row.area || "GENERAL");
  const areas = [...grouped].sort(([a],[b]) => a.localeCompare(b,"es"))
    .map(([area, items]) => {
      const avg = items.reduce((sum,row)=>sum+row.puntajeTotal,0)/items.length;
      return `• ${area}: ${items.length} evaluados · promedio ${formatNumber(avg)}`;
    });
  return [
    "📊 *INGEMAT · Resultados del simulacro*",
    `*${exam.titulo}*`,
    `Ciclo: ${exam.ciclo} · Fecha: ${exam.fecha}`,
    `Revisión: ${exam.revision}`,
    `Evaluados: ${rows.length}`,
    `Promedio general: ${formatNumber(mean)} puntos`,
    `Puntaje máximo: ${formatNumber(Math.max(...rows.map(row=>row.puntajeTotal)))} puntos`,
    ...areas,
    "",
    "Por privacidad, las calificaciones individuales se entregan por los canales autorizados.",
  ].join("\n");
}
function enqueueSummary(input, req) {
  const examId = String(input?.examId || "");
  const requestId = String(input?.requestId || "");
  if (!UUID.test(requestId)) throw new AppError("Identificador de envío inválido.");
  if (!UUID.test(examId)) throw new AppError("Simulacro inválido.");
  return db.transaction(() => {
    const report = snapshot(examId);
    if (!["listo", "publicado"].includes(report.exam.estado))
      throw new AppError("Valida el simulacro antes de notificar al grupo.", 409);
    if (!report.rows.length)
      throw new AppError("El simulacro no tiene resultados para compartir.", 409);
    const target = groups.target(report.exam.ciclo);
    if (!target) throw new AppError(
      "Configura primero el grupo de este ciclo en Comunicación.",409,
    );
    if (target.id !== input.groupId)
      throw new AppError("El grupo del ciclo cambió. Confirma el destinatario nuevamente.",409);
    const eventKey = `baileys:exam_group_summary:${examId}:${requestId}`;
    const previous = db.prepare("SELECT id,status,payload FROM outbox WHERE event_key=?").get(eventKey);
    if (previous) {
      const payload=JSON.parse(previous.payload);
      if (payload.signature !== report.signature || payload.cycle !== target.cycle || payload.groupId !== target.id)
        throw new AppError("Los resultados cambiaron. Inicia un nuevo envío.", 409);
      return { exito:true,id:previous.id,status:previous.status,duplicate:true,target:{subject:target.subject} };
    }
    const inFlight = db.prepare(
      "SELECT 1 FROM outbox WHERE kind='exam_group_summary' AND status IN ('pending','retry','sending','unknown') AND json_extract(CASE WHEN json_valid(payload) THEN payload ELSE '{}' END,'$.evaluationId')=? LIMIT 1",
    ).get(examId);
    if (inFlight) throw new AppError(
      "Hay una publicación de este simulacro pendiente o incierta. Comprueba su entrega en Comunicación antes de compartirlo otra vez.",409,
    );
    const id=notifications.enqueue({
      eventKey, recipient:target.id, kind:"exam_group_summary",
      payload:{
        evaluationId:examId, cycle:target.cycle, groupId:target.id,
        revision:report.exam.revision, signature:report.signature,
        text:textSummary(report),
      },
    });
    audit(req,"compartir_resultados_grupo","evaluacion",examId,{
      id,groupId:target.id,revision:report.exam.revision,
    });
    return {exito:true,id,status:"pending",duplicate:false,target:{subject:target.subject}};
  })();
}
module.exports = { snapshot, enqueueSummary, textSummary };
