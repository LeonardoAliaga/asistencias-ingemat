// src/utils/helpers.js
const fs = require("fs");
const path = require("path");

const horariosPath = path.join(__dirname, "../../data/horarios.json");
const ciclosPath = path.join(__dirname, "../../data/ciclos.json"); // Añadido path

// Si el archivo no existe, usa valores por defecto
function obtenerHorarios() {
  try {
    // Asegurar que exista el archivo
    if (!fs.existsSync(horariosPath)) {
      const defaultHorarios = {
        mañana: { entrada: "08:30", tolerancia: "08:35" },
        tarde: { entrada: "15:00", tolerancia: "15:15" },
      };
      fs.writeFileSync(horariosPath, JSON.stringify(defaultHorarios, null, 2));
      console.log(
        "Utils: Archivo horarios.json creado con valores por defecto."
      );
      return defaultHorarios;
    }
    return JSON.parse(fs.readFileSync(horariosPath, "utf8"));
  } catch (error) {
    console.error("Utils: Error al leer/crear horarios.json:", error);
    // Devolver default en caso de error grave
    return {
      mañana: { entrada: "08:30", tolerancia: "08:35" },
      tarde: { entrada: "15:00", tolerancia: "15:15" },
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
    typeof time24h !== "string" || // Añadir chequeo de tipo
    time24h.toUpperCase() === "FALTA" ||
    time24h.toUpperCase() === "NO ASISTE" ||
    !time24h.includes(":")
  )
    return time24h;

  const partes = time24h.split(":").map(Number); // Simplificado
  if (partes.length < 2 || isNaN(partes[0]) || isNaN(partes[1])) {
    console.warn(
      `Utils: Formato de hora inválido recibido en convertTo12Hour: ${time24h}`
    );
    return time24h; // Devolver original si el formato es malo
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
  if (typeof horaStr !== "string" || !horaStr.includes(":")) return -1; // Validación básica
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
    return -1; // Devuelve -1 si el formato es inválido
  }
  const [h, m] = partes;
  return h + m / 60;
}

// Lógica de Asistencia usando horarios configurables
function estadoAsistencia(turno, horaStr) {
  const horarios = obtenerHorarios();
  const horaNum = convertirAHoras(horaStr); // Necesitamos convertirAHoras
  // Verificar si la conversión falló
  if (horaNum === -1) {
    console.warn(
      `Utils: Hora inválida '${horaStr}' recibida en estadoAsistencia.`
    );
    return "tarde"; // O un estado por defecto/error
  }

  // Usar un turno por defecto si no se encuentra (ej. mañana)
  const { entrada, tolerancia } = horarios[turno] ||
    horarios["mañana"] || { entrada: "08:30", tolerancia: "08:35" };
  const hEntrada = convertirAHoras(entrada);
  const hTol = convertirAHoras(tolerancia);

  // Verificar si las conversiones de horarios fallaron
  if (hEntrada === -1 || hTol === -1) {
    console.error(
      `Utils: Formato de horario inválido en horarios.json para turno '${
        turno || "default"
      }'. Entrada: ${entrada}, Tolerancia: ${tolerancia}`
    );
    return "tarde"; // Estado por defecto en caso de error de configuración
  }

  if (horaNum < hEntrada) return "puntual";
  if (horaNum <= hTol) return "tolerancia";
  return "tarde";
}

function normalizarTexto(txt = "") {
  return txt
    .toString() // Asegurar que sea string
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

// FUNCIÓN AUXILIAR APLICAR ESTILO (ELIMINADA)

// Obtener lista de ciclos (Movido de api.route.js)
function getCiclosData() {
  try {
    const dataDir = path.dirname(ciclosPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    if (!fs.existsSync(ciclosPath)) {
      const defaultCiclos = {
        ciclos: ["semestral", "anual", "sabatino", "domingos"],
      };
      fs.writeFileSync(ciclosPath, JSON.stringify(defaultCiclos, null, 2));
      console.log("Utils: Archivo ciclos.json creado con valores por defecto.");
      return defaultCiclos;
    }
    return JSON.parse(fs.readFileSync(ciclosPath, "utf8"));
  } catch (error) {
    console.error("Utils: Error al leer/crear ciclos.json:", error);
    return { ciclos: ["semestral", "anual", "sabatino", "domingos"] };
  }
}

module.exports = {
  convertirAHoras, // Necesario para estadoAsistencia
  estadoAsistencia,
  normalizarTexto,
  // aplicarEstiloCelda, <-- ELIMINADO
  obtenerHorarios,
  getDayAbbreviation,
  convertTo12Hour, // Exportar para usar en otros módulos
  getCiclosData, // Exportar para usar en otros módulos
};
