// Variantes editoriales para notificaciones transaccionales de INGEMAT.
// No garantizan evitar restricciones de WhatsApp.
const { randomInt } = require("crypto");
const choose = (variants) => variants[randomInt(variants.length)];

function attendanceMessage({ nombre, ciclo, turno, hora, estado, justificado, fueraDeHorario }) {
  const icon = justificado ? "🟠" : ({ puntual:"✅", tolerancia:"🟡", tarde:"🕒" }[estado] || "📋");
  const info = `*${nombre}* (${ciclo} - ${turno})`;
  const time = `*${hora}${justificado ? " (J)" : ""}* ${icon}`;
  return choose([
    `📚 *Registro de asistencia*\n${info}\nIngreso: ${time}`,
    `📋 *Asistencia INGEMAT*\n${info}\nHora registrada: ${time}`,
    `📝 *Control de ingreso*\n${info}\nIngreso confirmado: ${time}`,
    `🏫 *Notificación de asistencia*\n${info}\nRegistro: ${time}`,
  ]) + (fueraDeHorario ? "\n_(Registro fuera de día programado)_" : "");
}
function teacherMessage({ nombre, hora, fueraDeHorario }) {
  const info = `*${nombre}*\nIngreso: *${hora}*`;
  return choose([
    `👨‍🏫 *Ingreso de docente*\n${info}`,
    `📋 *Asistencia docente*\n${info}`,
    `🏫 *Registro de docente*\n${info}`,
  ]) + (fueraDeHorario ? "\n_(Registro fuera de día programado)_" : "");
}
function reportMessage({ ciclo, turno }) {
  const grupo = String(ciclo).toUpperCase() === "DOCENTES" ? "Docentes" : `${ciclo} - ${turno}`;
  return choose([
    `📊 *Reporte de asistencias*\n${grupo}\nAdjuntamos el registro del día.`,
    `📋 *INGEMAT | Asistencia diaria*\n${grupo}\nConsulta el reporte adjunto.`,
    `🏫 *Resumen de asistencia*\n${grupo}\nReporte correspondiente al día de hoy.`,
  ]);
}
function carnetMessage(nombre) {
  const estudiante = String(nombre || "estudiante").trim();
  return choose([
    `👋 Hola ${estudiante}, te enviamos tu carnet digital de INGEMAT.`,
    `🎓 ${estudiante}, aquí tienes tu carnet digital de INGEMAT.`,
    `📚 Hola ${estudiante}. Adjuntamos tu carnet digital INGEMAT.`,
  ]);
}
module.exports = { attendanceMessage, teacherMessage, reportMessage, carnetMessage };
