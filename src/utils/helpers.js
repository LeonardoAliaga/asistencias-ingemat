const fs = require("fs");
const path = require("path");
const horariosPath = path.join(
  path.dirname(process.execPath),
  "../../data/horarios.json"
);

// Si el archivo no existe, usa valores por defecto
function obtenerHorarios() {
  try {
    return JSON.parse(fs.readFileSync(horariosPath, "utf8"));
  } catch {
    return {
      mañana: { entrada: "08:00", tolerancia: "08:15" },
      tarde: { entrada: "14:00", tolerancia: "14:15" },
    };
  }
}

// Helper para obtener la abreviatura del día de la semana
function getDayAbbreviation(fecha) {
  // 0=Dom, 1=Lun, 2=Mar, 3=Miércoles, 4=Jue, 5=Vie, 6=Sáb
  const dayNames = ["D", "L", "M", "MI", "J", "V", "S"];
  return dayNames[fecha.getDay()];
}

// 🎯 FUNCIÓN CONVERTIR A HORAS (Maneja HH:MM 24H)
function convertirAHoras(horaStr) {
  const partes = horaStr.trim().split(":").map(Number);

  if (partes.length < 2 || isNaN(partes[0]) || isNaN(partes[1])) {
    return -1;
  }

  const [h, m] = partes;
  return h + m / 60;
}

// Lógica de Asistencia usando horarios configurables
function estadoAsistencia(turno, horaStr) {
  const horarios = obtenerHorarios();
  const horaNum = convertirAHoras(horaStr);
  const { entrada, tolerancia } = horarios[turno] || horarios["mañana"];
  const hEntrada = convertirAHoras(entrada);
  const hTol = convertirAHoras(tolerancia);

  if (horaNum < hEntrada) return "puntual";
  if (horaNum <= hTol) return "tolerancia";
  return "tarde";
}

function normalizarTexto(txt = "") {
  return txt
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

// FUNCIÓN AUXILIAR PARA APLICAR ESTILO
function aplicarEstiloCelda(celda, estilo) {
  if (estilo.fill) celda.fill = estilo.fill;
  if (estilo.font) celda.font = estilo.font;
  if (estilo.alignment) celda.alignment = estilo.alignment;
  if (estilo.border) celda.border = estilo.border;
}

module.exports = {
  convertirAHoras,
  estadoAsistencia,
  normalizarTexto,
  aplicarEstiloCelda,
  obtenerHorarios,
  getDayAbbreviation,
};
