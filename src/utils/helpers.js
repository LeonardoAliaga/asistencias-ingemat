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
        default: {
          mañana: { entrada: "08:30", tolerancia: "08:35" },
          tarde: { entrada: "15:00", tolerancia: "15:15" },
        },
        ciclos: {}, // Inicialmente vacío
      };
      fs.writeFileSync(horariosPath, JSON.stringify(defaultHorarios, null, 2));
      console.log(
        "Utils: Archivo horarios.json creado con valores por defecto."
      );
      return defaultHorarios;
    }
    const data = JSON.parse(fs.readFileSync(horariosPath, "utf8"));
    // Asegurar que la estructura mínima exista
    if (!data.default || !data.ciclos) {
      const mergedData = {
        default: data.default || {
          mañana: data.mañana || { entrada: "08:30", tolerancia: "08:35" },
          tarde: data.tarde || { entrada: "15:00", tolerancia: "15:15" },
        },
        ciclos: data.ciclos || {},
      };
      delete mergedData.mañana; // Limpiar estructura antigua
      delete mergedData.tarde; // Limpiar estructura antigua
      fs.writeFileSync(horariosPath, JSON.stringify(mergedData, null, 2));
      console.log("Utils: Migrando horarios.json a nueva estructura.");
      return mergedData;
    }
    return data;
  } catch (error) {
    console.error("Utils: Error al leer/crear horarios.json:", error);
    // Devolver default en caso de error grave
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

// Lógica de Asistencia (MODIFICADA para usar horarios por ciclo)
function estadoAsistencia(cicloUsuario, turno, horaStr) {
  const horariosConfig = obtenerHorarios();
  const horaNum = convertirAHoras(horaStr);
  if (horaNum === -1) {
    console.warn(
      `Utils: Hora inválida '${horaStr}' recibida en estadoAsistencia.`
    );
    return "tarde";
  }

  let horariosTurno;
  // 1. Intentar obtener el horario específico del ciclo
  if (
    cicloUsuario &&
    horariosConfig.ciclos[cicloUsuario] &&
    horariosConfig.ciclos[cicloUsuario][turno]
  ) {
    horariosTurno = horariosConfig.ciclos[cicloUsuario][turno];
    console.log(`Utils: Usando horario de CICLO ${cicloUsuario} - ${turno}.`);
  } else {
    // 2. Usar el horario "default"
    horariosTurno = horariosConfig.default[turno];
    console.log(`Utils: Usando horario DEFAULT - ${turno}.`);
  }

  // 3. Fallback final si todo falla
  const { entrada, tolerancia } = horariosTurno || {
    entrada: "08:30",
    tolerancia: "08:35",
  };
  const hEntrada = convertirAHoras(entrada);
  const hTol = convertirAHoras(tolerancia);

  if (hEntrada === -1 || hTol === -1) {
    console.error(
      `Utils: Formato de horario inválido en horarios.json para ${
        cicloUsuario || "default"
      } - ${turno}. E:${entrada}, T:${tolerancia}`
    );
    return "tarde";
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
// Obtener nombre completo de un usuario (compatibilidad con esquemas antiguos)
function getFullName(usuario = {}) {
  if (!usuario) return "";

  // Forma canónica: 'APELLIDO NOMBRE' cuando existan ambos campos
  const apellido = usuario.apellido ? usuario.apellido.toString().trim() : "";
  const nombre = usuario.nombre ? usuario.nombre.toString().trim() : "";
  if (apellido && nombre) return `${apellido} ${nombre}`;

  // Si sólo hay nombre, devolverlo tal cual (sin intentar dividir)
  if (nombre) return nombre;

  return "";
}

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
  obtenerHorarios,
  getDayAbbreviation,
  convertTo12Hour, // Exportar para usar en otros módulos
  getCiclosData, // Exportar para usar en otros módulos
  getFullName,
};
