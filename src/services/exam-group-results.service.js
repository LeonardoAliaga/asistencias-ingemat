const crypto = require("node:crypto");
const db = require("../database/db");
const groups = require("./whatsapp-groups.service");
const notifications = require("./notifications.service");
const storage = require("./whatsapp-report-storage.service");
const { groupPages, renderPage } = require("./exam-ranking-image.service");
const { audit } = require("./audit.service");
const { AppError } = require("../utils/errors");
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

function snapshot(id) {
  const exam = db.prepare(
    "SELECT id,titulo,ciclo,fecha,estado,revision,definition FROM evaluaciones WHERE id=?",
  ).get(id);
  if (!exam) throw new AppError("Simulacro no encontrado.", 404);
  const rows = db.prepare(
    "SELECT id,area,nombreEstudiante,correctas,incorrectas,enBlanco,puntajeTotal " +
    "FROM respuestas_evaluacion WHERE evaluacion_id=? " +
    "ORDER BY area,puntajeTotal DESC,nombreEstudiante COLLATE NOCASE,id",
  ).all(id);
  const signature = crypto.createHash("sha256")
    .update(JSON.stringify({ exam, rows })).digest("hex");
  return { exam, rows, signature };
}

function currentTarget(report, groupId) {
  const target = groups.target(report.exam.ciclo);
  if (!target)
    throw new AppError("Configura primero el grupo del ciclo en Comunicación.", 409);
  if (target.id !== groupId)
    throw new AppError("El grupo del ciclo cambió. Confirma el destino nuevamente.", 409);
  return target;
}
function priorRequest(examId, requestId, report, target) {
  const prefix = "baileys:exam_group_summary:" + examId + ":" + requestId + ":";
  const records = db.prepare(
    "SELECT id,status,payload FROM outbox WHERE kind='exam_group_summary' AND substr(event_key,1,?)=? ORDER BY event_key",
  ).all(prefix.length, prefix);
  if (!records.length) return null;
  if (records.some(row => {
    const payload = JSON.parse(row.payload);
    return payload.signature !== report.signature || payload.groupId !== target.id;
  })) throw new AppError("El ranking cambió. Usa un nuevo envío.", 409);
  const areas = new Set(records.map(row => JSON.parse(row.payload).area)).size;
  return {
    exito: true, id: records[0].id, ids: records.map(row => row.id),
    images: records.length, areas, duplicate: true,
    status: records[0].status, target: { subject: target.subject },
  };
}
function enqueueSummary(input, req) {
  const examId = String(input?.examId || "");
  const requestId = String(input?.requestId || "");
  if (!UUID.test(examId) || !UUID.test(requestId))
    throw new AppError("Simulacro o identificador de envío inválido.");
  if (input?.confirmAuthorized !== true)
    throw new AppError("Confirma que el grupo está autorizado para recibir nombres y resultados de los estudiantes.", 400);
  const report = snapshot(examId);
  if (!["listo", "publicado"].includes(report.exam.estado))
    throw new AppError("Valida el simulacro antes de enviar el ranking.", 409);
  if (!report.rows.length)
    throw new AppError("Este simulacro no tiene calificaciones registradas.", 409);
  const target = currentTarget(report, input.groupId);
  const previous = priorRequest(examId, requestId, report, target);
  if (previous) return previous;
  const inflight = db.prepare(
    "SELECT 1 FROM outbox WHERE kind='exam_group_summary' AND status IN ('pending','retry','sending','unknown') " +
    "AND json_extract(CASE WHEN json_valid(payload) THEN payload ELSE '{}' END,'$.evaluationId')=? LIMIT 1",
  ).get(examId);
  if (inflight)
    throw new AppError(
      "Hay un ranking pendiente o de entrega incierta. Comprueba los envíos anteriores antes de repetir.",
      409,
    );

  const pages = groupPages(report);
  const attachments = [];
  try {
    for (const [index, page] of pages.entries()) {
      const buffer = renderPage(report, page);
      const attachment = storage.save(
        buffer, "png",
        "Ranking_" + page.area.replace(/[^\p{L}\p{N} -]/gu,"").slice(0, 36)
          + "_P" + page.page,
      );
      attachments.push({ index, page, attachment });
    }
    const ids = db.transaction(() => {
      // Todo el conjunto queda creado o no queda ninguno.
      const result = [];
      for (const { index, page, attachment } of attachments) {
        const caption = [
          "📊 INGEMAT · " + report.exam.titulo,
          "Área: " + page.area,
          "Ranking " + page.page + "/" + page.total,
          "Buenas · Malas · Vacías · Puntaje",
        ].join("\n").slice(0, 1500);
        result.push(notifications.enqueue({
          eventKey: "baileys:exam_group_summary:" + examId + ":" + requestId + ":"
            + String(index + 1).padStart(4, "0"),
          recipient: target.id,
          kind: "exam_group_summary",
          payload: {
            evaluationId: examId, cycle: target.cycle, groupId: target.id,
            revision: report.exam.revision, signature: report.signature,
            requestId, area: page.area, page: page.page, pages: page.total,
            attachment, text: caption,
          },
        }));
      }
      audit(req, "enviar_ranking_por_area", "evaluacion", examId, {
        images: result.length, areas: new Set(pages.map(p => p.code)).size,
        revision: report.exam.revision,
      });
      return result;
    })();
    return {
      exito: true, id: ids[0], ids,
      images: ids.length, areas: new Set(pages.map(p => p.code)).size,
      duplicate: false, status: "pending", target: { subject: target.subject },
    };
  } catch (error) {
    for (const entry of attachments) storage.remove(entry.attachment);
    throw error;
  }
}
module.exports = { snapshot, enqueueSummary };
