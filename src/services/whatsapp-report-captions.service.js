// Variaciones editoriales para reportes solicitados manualmente.
// Se eligen de forma estable por requestId, preservando la idempotencia.
const crypto = require("node:crypto");
function choose(kind, requestId, templates) {
  const digest = crypto.createHash("sha256")
    .update(String(kind)).update(":").update(String(requestId)).digest();
  return templates[digest.readUInt32BE(0) % templates.length];
}
function attendanceReportCaption({ cycle, date, shift, requestId }) {
  const detail = `${cycle} · ${date} · ${shift || "todos los turnos"}`;
  return choose("attendance_report", requestId, [
    `📊 *INGEMAT · Reporte de asistencia*\n${detail}\nAdjuntamos el registro solicitado.`,
    `📋 *Asistencia del ciclo*\n${detail}\nPuedes consultar el reporte adjunto.`,
    `🏫 *Resumen diario de asistencia*\n${detail}\nReporte generado desde INGEMAT.`,
  ]);
}
function studentReportCaption({ name, code, period, requestId }) {
  const detail = `${name} (${code}) · ${period}`;
  return choose("student_report", requestId, [
    `🎓 *INGEMAT · Reporte académico*\n${detail}\nAdjuntamos los resultados.`,
    `📚 *Resumen académico*\n${detail}\nConsulta el documento adjunto.`,
    `📊 *Reporte del estudiante*\n${detail}\nInformación académica solicitada.`,
  ]);
}
module.exports = { attendanceReportCaption, studentReportCaption };
