// Proyecto/src/routes/api.route.js

const express = require("express");
const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");
const { guardarRegistro } = path.join(
  path.dirname(process.execPath),
  "../services/excel.service"
);
const { estadoAsistencia, getDayAbbreviation, normalizarTexto } = path.join(
  path.dirname(process.execPath),
  "../utils/helpers"
);

const router = express.Router();
const usuariosPath = path.join(
  path.dirname(process.execPath),
  "../../data/usuarios.json"
);
const registrosPath = path.join(
  path.dirname(process.execPath),
  "../../Registros"
);
const horariosPath = path.join(
  path.dirname(process.execPath),
  "../../data/horarios.json"
);
const ciclosPath = path.join(
  path.dirname(process.execPath),
  "../../data/ciclos.json"
); // 🚀 NUEVO

// Helper para convertir "HH:MM" (24h) a "HH:MM AM/PM" (12h)
function convertTo12Hour(time24h) {
  if (
    !time24h ||
    time24h.toUpperCase() === "FALTA" ||
    time24h.toUpperCase() === "NO ASISTE" ||
    !time24h.includes(":")
  )
    return time24h;

  const [hour, minute] = time24h.split(":").map(Number);
  if (isNaN(hour) || isNaN(minute)) return time24h;

  // Usamos una fecha fija para el objeto Date
  const date = new Date(2000, 0, 1, hour, minute);

  // Usamos Intl.DateTimeFormat para conversión localizada a 12h
  return date
    .toLocaleTimeString("es-PE", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })
    .replace(/\s/g, "")
    .toUpperCase();
}

function getCiclosData() {
  try {
    return JSON.parse(fs.readFileSync(ciclosPath, "utf8"));
  } catch {
    return { ciclos: ["semestral", "anual", "sabatino", "domingos"] };
  }
}

router.post("/registrar", async (req, res) => {
  const { codigo } = req.body;
  const usuarios = JSON.parse(fs.readFileSync(usuariosPath, "utf8"));
  const usuario = usuarios.find((u) => u.codigo === codigo);

  if (!usuario) {
    return res
      .status(404)
      .json({ exito: false, mensaje: "Código no encontrado" });
  }

  const fecha = new Date();
  const fechaStr = fecha.toLocaleDateString("es-PE");
  const diaAbbr = getDayAbbreviation(fecha);

  // 💡 Generar la hora de registro en formato 24 horas (HH:MM)
  const horaStr = fecha.toLocaleTimeString("es-PE", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false, // Forzamos el formato 24H
  });

  // Chequeo de días de asistencia antes de llamar a guardarRegistro
  if (
    usuario.rol === "estudiante" &&
    usuario.dias_asistencia &&
    !usuario.dias_asistencia.includes(diaAbbr)
  ) {
    // No retornamos aquí, dejamos que el servicio intente registrar, solo para mostrar el error específico si falla.
  }

  const guardado = await guardarRegistro(usuario, fechaStr, horaStr);

  if (!guardado) {
    // Si la función devuelve false, significa que el registro fue rechazado porque
    // *YA TIENE* un registro de hora válido (no FALTA ni NO ASISTE).

    // Mostramos el mensaje genérico de "ya tiene registro".
    return res.status(409).json({
      exito: false,
      mensaje: `${usuario.nombre} ya tiene registro.`,
    });
  }

  // Calcula el estado de asistencia
  let estado = "";
  let ciclo = "";
  let turno = "";

  if (usuario.rol === "estudiante") {
    estado = estadoAsistencia(usuario.turno, horaStr);
    ciclo = usuario.ciclo;
    turno = usuario.turno;
  }

  // Convertir a 12h solo para mostrar en la respuesta al usuario
  const hora12h = convertTo12Hour(horaStr);

  res.json({
    exito: true,
    nombre: usuario.nombre,
    hora: `${fechaStr} ${hora12h}`,
    estado,
    ciclo,
    turno,
    rol: usuario.rol,
  });
});

// Obtener todos los usuarios
router.get("/usuarios", (req, res) => {
  const usuarios = JSON.parse(fs.readFileSync(usuariosPath, "utf8"));
  res.json(usuarios);
});
// Agregar usuario
router.post("/usuarios", (req, res) => {
  const usuarios = JSON.parse(fs.readFileSync(usuariosPath, "utf8"));
  // Validamos y si tiene dias_asistencia lo añadimos.
  const nuevoUsuario = req.body;
  if (nuevoUsuario.rol === "estudiante" && !nuevoUsuario.dias_asistencia) {
    // Valor por defecto si se agregó sin seleccion de días (aunque el front lo fuerza)
    nuevoUsuario.dias_asistencia = ["L", "M", "MI", "J", "V", "S"];
  }

  usuarios.push(nuevoUsuario);
  fs.writeFileSync(usuariosPath, JSON.stringify(usuarios, null, 2));
  res.json({ exito: true });
});
// Eliminar usuario
router.delete("/usuarios/:codigo", (req, res) => {
  let usuarios = JSON.parse(fs.readFileSync(usuariosPath, "utf8"));
  usuarios = usuarios.filter((u) => u.codigo !== req.params.codigo);
  fs.writeFileSync(usuariosPath, JSON.stringify(usuarios, null, 2));
  res.json({ exito: true });
});

// 🚀 RUTAS DE CICLOS
router.get("/ciclos", (req, res) => {
  res.json(getCiclosData());
});

router.post("/ciclos", (req, res) => {
  const { nombre } = req.body;
  let data = getCiclosData();
  const nombreNormalizado = normalizarTexto(nombre);

  if (data.ciclos.map(normalizarTexto).includes(nombreNormalizado)) {
    return res.status(409).json({ mensaje: "El ciclo ya existe." });
  }

  data.ciclos.push(nombreNormalizado);
  fs.writeFileSync(ciclosPath, JSON.stringify(data, null, 2));
  res.json({ mensaje: `Ciclo ${nombreNormalizado.toUpperCase()} agregado.` });
});

router.delete("/ciclos/:ciclo", (req, res) => {
  const cicloABorrar = normalizarTexto(req.params.ciclo);
  let data = getCiclosData();

  data.ciclos = data.ciclos.filter((c) => normalizarTexto(c) !== cicloABorrar);

  fs.writeFileSync(ciclosPath, JSON.stringify(data, null, 2));
  res.json({ mensaje: `Ciclo ${cicloABorrar.toUpperCase()} eliminado.` });
});
// --------------------

// Listar archivos Excel
router.get("/excel", (req, res) => {
  const archivos = fs
    .readdirSync(registrosPath)
    .filter((f) => f.endsWith(".xlsx"));
  res.json(archivos);
});
// Descargar archivo Excel
router.get("/excel/:archivo", (req, res) => {
  const archivo = req.params.archivo;
  const ruta = path.join(registrosPath, archivo);
  res.download(ruta);
});

// Obtener contenido del archivo XLSX para vista previa (usando ExcelJS)
router.get("/excel/preview/:archivo", async (req, res) => {
  const archivo = req.params.archivo;
  const ruta = path.join(registrosPath, archivo);

  if (!fs.existsSync(ruta)) {
    return res.status(404).json({ mensaje: "Archivo no encontrado" });
  }

  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(ruta);
    const worksheet = workbook.getWorksheet("Asistencia");

    if (!worksheet) {
      return res
        .status(404)
        .json({ mensaje: "Hoja 'Asistencia' no encontrada" });
    }

    let csvContent = "";

    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      let rowValues = [];

      // Detección de títulos (celdas fusionadas, en Columna 1)
      const firstCell = row.getCell(1);
      const cellValue = firstCell.value;

      if (
        typeof cellValue === "string" &&
        cellValue.startsWith("REGISTRO DE ASISTENCIA")
      ) {
        csvContent += cellValue + "\n";
        csvContent += "\n"; // Fila de separación visual
        return;
      }

      // Detección de filas de separación completamente vacías (ignoramos)
      if (!row.values.some((v) => v !== null && v !== undefined && v !== "")) {
        return;
      }

      let rowHasContent = false;

      // Recorremos hasta la columna 5 (Registro de Hora)
      for (let colNumber = 1; colNumber <= 5; colNumber++) {
        const cell = row.getCell(colNumber);
        let value = cell.value;
        let finalValue = "";

        if (value !== null && value !== undefined && value !== "") {
          rowHasContent = true;
          if (typeof value === "object") {
            if (value.richText) {
              finalValue = value.richText.map((t) => t.text).join("");
            } else if (value.result) {
              finalValue = value.result;
            } else if (value.text) {
              finalValue = value.text;
            } else {
              finalValue = String(value);
            }
          } else {
            finalValue = String(value);
          }
        }

        // CONVERSIÓN A 12H para la columna de hora (columna 5)
        if (colNumber === 5) {
          finalValue = convertTo12Hour(finalValue);
        }

        // **MEJORA DE EXTRACCIÓN:** Aseguramos que la columna 4 (DÍAS ASISTENCIA) se envuelva en comillas
        // si contiene comas, para evitar el split en el frontend.
        if (colNumber === 4 && finalValue.includes(",")) {
          finalValue = `"${finalValue}"`;
        }

        rowValues.push(finalValue.trim());
      }

      // 4. Si es una fila de datos o encabezado válido
      if (rowHasContent) {
        // Unimos los valores, asegurando 5 columnas
        while (rowValues.length < 5) {
          rowValues.push("");
        }
        csvContent += rowValues.slice(0, 5).join(",") + "\n";
      }
    });

    res.json({ exito: true, content: csvContent.trim() });
  } catch (error) {
    console.error("Error al leer archivo XLSX para previsualización:", error);
    res.status(500).json({
      mensaje:
        "Error al procesar el archivo XLSX (Posible corrupción o formato no estándar).",
      detalle: error.message,
    });
  }
});

// Obtener horarios
router.get("/horarios", (req, res) => {
  let horarios;
  try {
    horarios = JSON.parse(fs.readFileSync(horariosPath, "utf8"));
  } catch {
    // Valores por defecto si no existe el archivo
    horarios = {
      mañana: { entrada: "08:00", tolerancia: "08:15" },
      tarde: { entrada: "14:00", tolerancia: "14:15" },
    };
  }
  res.json(horarios);
});

// Guardar horarios
router.post("/horarios", (req, res) => {
  const horarios = req.body;
  fs.writeFileSync(horariosPath, JSON.stringify(horarios, null, 2));
  res.json({ mensaje: "Horarios actualizados correctamente" });
});

module.exports = router;
