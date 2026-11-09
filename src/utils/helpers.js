// src/utils/helpers.js
const db = require("../database/db");

// Obtener la configuración de horarios por ciclo o por defecto desde SQLite
function obtenerHorarios() {
  try {
    const rows = db.prepare("SELECT * FROM horarios").all();
    const defaultHorarios = {
      default: {
        mañana: { entrada: "08:30", tolerancia: "08:35" },
        tarde: { entrada: "15:00", tolerancia: "15:15" },
      },
      ciclos: {},
    };

    rows.forEach((r) => {
      const cicloKey = String(r.ciclo).trim().toUpperCase();
      const horario = {
        mañana: {
          entrada: r.manana_entrada || "08:30",
          tolerancia: r.manana_tolerancia || "08:35",
        },
        tarde: {
          entrada: r.tarde_entrada || "15:00",
          tolerancia: r.tarde_tolerancia || "15:15",
        },
      };
      if (cicloKey === "DEFAULT") defaultHorarios.default = horario;
      else defaultHorarios.ciclos[cicloKey] = horario;
    });

    return defaultHorarios;
  } catch (error) {
    console.error("Utils: Error al leer horarios desde SQLite:", error);
    return {
      default: {
        mañana: { entrada: "08:30", tolerancia: "08:35" },
        tarde: { entrada: "15:00", tolerancia: "15:15" },
      },
      ciclos: {},
    };
  }
}

// Helper para obtener la abreviatura del día de la semana
function getDayAbbreviation(fecha) {
  const dayNames = ["D", "L", "M", "MI", "J", "V", "S"];
  return dayNames[fecha.getDay()];
}

// Convertir HH:MM 24H a HH:MM AM/PM 12H
function convertTo12Hour(time24h) {
  if (
    !time24h ||
    typeof time24h !== "string" ||
    time24h.toUpperCase() === "FALTA" ||
    time24h.toUpperCase() === "NO ASISTE" ||
    !time24h.includes(":")
  )
    return time24h;

  const partes = time24h.split(":").map(Number);
  if (partes.length < 2 || isNaN(partes[0]) || isNaN(partes[1])) {
    return time24h;
  }
  const [hour, minute] = partes;

  const date = new Date(2000, 0, 1, hour, minute);
  return date
    .toLocaleTimeString("es-PE", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })
    .replace(/\s/g, "")
    .toUpperCase();
}

// Convertir HH:MM 24H a número de horas (para comparaciones)
function convertirAHoras(horaStr) {
  if (typeof horaStr !== "string" || !horaStr.includes(":")) return -1;
  const partes = horaStr.trim().split(":").map(Number);

  if (
    partes.length < 2 ||
    isNaN(partes[0]) ||
    isNaN(partes[1]) ||
    partes[0] < 0 ||
    partes[0] > 23 ||
    partes[1] < 0 ||
    partes[1] > 59
  ) {
    return -1;
  }
  const [h, m] = partes;
  return h + m / 60;
}

// Lógica de Asistencia (usando horarios por ciclo)
function estadoAsistencia(cicloUsuario, turno, horaStr) {
  const horariosConfig = obtenerHorarios();
  const horaNum = convertirAHoras(horaStr);
  if (horaNum === -1) {
    return "tarde";
  }

  let horariosTurno;
  const cicloKey = (cicloUsuario || "").toUpperCase();

  if (
    cicloKey &&
    horariosConfig.ciclos[cicloKey] &&
    horariosConfig.ciclos[cicloKey][turno]
  ) {
    horariosTurno = horariosConfig.ciclos[cicloKey][turno];
  } else {
    horariosTurno = horariosConfig.default[turno];
  }

  const { entrada, tolerancia } = horariosTurno || {
    entrada: "08:30",
    tolerancia: "08:35",
  };
  const hEntrada = convertirAHoras(entrada);
  const hTol = convertirAHoras(tolerancia);

  if (hEntrada === -1 || hTol === -1) {
    return "tarde";
  }

  if (horaNum <= hEntrada) return "puntual";
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

// Obtener nombre completo de un usuario
function getFullName(usuario = {}) {
  if (!usuario) return "";
  const apellido = usuario.apellido ? usuario.apellido.toString().trim() : "";
  const nombre = usuario.nombre ? usuario.nombre.toString().trim() : "";
  if (apellido && nombre) return `${apellido} ${nombre}`;
  if (nombre) return nombre;
  return "";
}

// Obtener lista de ciclos desde SQLite
function getCiclosData() {
  try {
    const rows = db.prepare("SELECT nombre FROM ciclos ORDER BY id ASC").all();
    if (rows.length > 0) {
      return { ciclos: rows.map((r) => r.nombre) };
    }
  } catch (error) {
    console.error("Utils: Error al leer ciclos desde SQLite:", error);
  }
  return { ciclos: ["SEMESTRAL", "ANUAL", "SABATINO", "DOMINGOS"] };
}

module.exports = {
  convertirAHoras,
  estadoAsistencia,
  normalizarTexto,
  obtenerHorarios,
  convertTo12Hour,
  getDayAbbreviation,
  getFullName,
  getCiclosData,
};
