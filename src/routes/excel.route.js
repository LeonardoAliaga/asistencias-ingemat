// src/routes/excel.route.js
const express = require("express");
const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");
// --- IMPORTACIONES CORREGIDAS ---
const { normalizarTexto, getFullName } = require("../utils/helpers.js");
const {
  estiloFaltaJustificada, // <-- MODIFICADO
  estilosEstadoEstudiante,
  estiloFalta,
  estiloNoAsiste,
  estiloDocenteRegistrado,
  estiloTardanzaJustificada, // <-- AÑADIDO
} = require("../services/excel/excel.constants.js");
const usuariosPath = path.join(__dirname, "../../data/usuarios.json");
// --- FIN IMPORTACIONES ---

const router = express.Router();
const registrosPath = path.join(__dirname, "../../Registros");

// Helper para asegurar que la carpeta Registros exista
function ensureRegistrosDir() {
  try {
    if (!fs.existsSync(registrosPath)) {
      fs.mkdirSync(registrosPath, { recursive: true });
      console.log("Excel Route: Carpeta Registros creada.");
    }
  } catch (err) {
    console.error("Excel Route: Error al crear carpeta Registros:", err);
  }
}

// GET /api/excel - Listar archivos Excel
router.get("/", (req, res) => {
  ensureRegistrosDir();
  try {
    const archivos = fs
      .readdirSync(registrosPath)
      .filter((f) => f.endsWith(".xlsx") && !f.startsWith("~"));
    // Ordenar para mostrar los más recientes primero
    archivos.sort((a, b) => {
      const dateA = a.split(" ")[0].split("-").reverse().join("");
      const dateB = b.split(" ")[0].split("-").reverse().join("");
      return dateB.localeCompare(dateA); // Orden descendente
    });
    res.json(archivos);
  } catch (err) {
    console.error("Excel Route: Error al listar archivos:", err);
    res.status(500).json([]);
  }
});

// GET /api/excel/:archivo - Descargar archivo Excel
router.get("/:archivo", (req, res) => {
  const archivo = req.params.archivo;
  if (
    archivo.includes("..") ||
    archivo.includes("/") ||
    !archivo.endsWith(".xlsx")
  ) {
    console.log(
      `Excel Route: Intento de acceso inválido a archivo: ${archivo}`
    );
    return res.status(400).send("Nombre de archivo inválido.");
  }
  const ruta = path.join(registrosPath, archivo);

  if (!fs.existsSync(ruta)) {
    console.log(`Excel Route: Archivo no encontrado para descarga: ${archivo}`);
    return res.status(404).send("Archivo no encontrado.");
  }
  console.log(`Excel Route: Solicitud de descarga para ${archivo}`);
  res.download(ruta, archivo, (err) => {
    if (err) {
      console.error(`Excel Route: Error al descargar ${archivo}:`, err);
      if (!res.headersSent) {
        res.status(500).send("Error al descargar el archivo.");
      }
    } else {
      console.log(`Excel Route: Archivo ${archivo} descargado.`);
    }
  });
});

// --- RUTA PREVIEW MODIFICADA PARA MÚLTIPLES HOJAS Y JUSTIFICADO ---
router.get("/preview/:archivo", async (req, res) => {
  const archivo = req.params.archivo;
  if (
    archivo.includes("..") ||
    archivo.includes("/") ||
    !archivo.endsWith(".xlsx")
  ) {
    return res.status(400).json({ mensaje: "Nombre de archivo inválido." });
  }
  const ruta = path.join(registrosPath, archivo);

  if (!fs.existsSync(ruta)) {
    return res.status(404).json({ mensaje: "Archivo no encontrado" });
  }
  console.log(
    `Excel Route: Generando preview para ${archivo} (todas las hojas)`
  );

  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(ruta);

    const sheetsData = [];

    // --- MAPA DE COLORES ACTUALIZADO ---
    const colorMap = {
      [estilosEstadoEstudiante.puntual.fill.fgColor.argb.substring(2)]:
        "puntual",
      [estilosEstadoEstudiante.tolerancia.fill.fgColor.argb.substring(2)]:
        "tolerancia",
      [estilosEstadoEstudiante.tarde.fill.fgColor.argb.substring(2)]: "tarde",
      [estiloFalta.fill.fgColor.argb.substring(2)]: "falta",
      [estiloNoAsiste.fill.fgColor.argb.substring(2)]: "no_asiste",
      [estiloDocenteRegistrado.fill.fgColor.argb.substring(2)]: "docente",
      [estiloFaltaJustificada.fill.fgColor.argb.substring(2)]:
        "falta_justificada", // <-- MODIFICADO
      [estiloTardanzaJustificada.fill.fgColor.argb.substring(2)]:
        "tardanza_justificada", // <-- AÑADIDO
    };
    // --- FIN ACTUALIZACIÓN ---

    workbook.eachSheet((worksheet, sheetId) => {
      console.log(` - Procesando hoja: ${worksheet.name}`);
      let csvContent = "";

      worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
        let rowValues = [];
        let rowHasContent = false;
        let isTitleRow = false;
        let isHeaderRow = false;
        let attendanceStatus = "";

        for (let colNumber = 1; colNumber <= 5; colNumber++) {
          const cell = row.getCell(colNumber);
          let value = cell.value;
          let finalValue = "";

          if (
            colNumber === 1 &&
            cell.isMerged &&
            typeof value === "string" &&
            value.startsWith("REGISTRO DE ASISTENCIA")
          ) {
            finalValue = value;
            rowHasContent = true;
            isTitleRow = true;
            rowValues.push(`"${finalValue.replace(/"/g, '""')}"`);
            break;
          }
          if (
            colNumber === 1 &&
            typeof value === "string" &&
            (value === "N°" || value?.toString().toUpperCase().includes("N°"))
          ) {
            isHeaderRow = true;
          }

          if (value !== null && value !== undefined) {
            if (typeof value === "object" && value && value.richText) {
              finalValue = value.richText.map((rt) => rt.text).join("");
            } else if (value instanceof Date) {
              if (colNumber === 5) {
                finalValue = value
                  .toLocaleTimeString("es-PE", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: true,
                  })
                  .replace(/\s/g, "")
                  .toUpperCase();
              } else {
                finalValue = value.toLocaleDateString("es-PE");
              }
            } else if (
              typeof value === "object" &&
              value &&
              value.result !== undefined
            ) {
              let resultValue = value.result;
              if (resultValue instanceof Date && colNumber === 5) {
                finalValue = resultValue
                  .toLocaleTimeString("es-PE", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: true,
                  })
                  .replace(/\s/g, "")
                  .toUpperCase();
              } else {
                finalValue = String(resultValue);
              }
            } else {
              finalValue = String(value);
            }

            finalValue = finalValue.trim();
            if (finalValue.length > 0) rowHasContent = true;

            // --- DETECTAR ESTADO (CORREGIDO) ---
            if (!isTitleRow && !isHeaderRow && colNumber === 5) {
              const upperVal = finalValue.toUpperCase();

              // 1. Priorizar el TEXTO para estados literales
              if (upperVal === "FALTA") {
                attendanceStatus = "falta";
              } else if (upperVal === "NO ASISTE") {
                attendanceStatus = "no_asiste";
              } else if (upperVal === "F. JUSTIFICADA") {
                attendanceStatus = "falta_justificada";
              } else if (finalValue) {
                // 2. Si es un valor (hora), usar el COLOR para el estado
                const fillColor = cell.fill;
                if (
                  fillColor &&
                  fillColor.type === "pattern" &&
                  fillColor.pattern === "solid" &&
                  fillColor.fgColor &&
                  fillColor.fgColor.argb
                ) {
                  const bgColor = fillColor.fgColor.argb
                    .toUpperCase()
                    .substring(2);
                  // Usar colorMap, default a 'registrado' (para horas)
                  attendanceStatus = colorMap[bgColor] || "registrado";
                  // Sobrescribir si es tardanza justificada (J)
                  if (upperVal.endsWith("(J)")) {
                    attendanceStatus = "tardanza_justificada";
                  }
                } else {
                  attendanceStatus = "registrado"; // Default para horas sin color
                }
              }
            }
            // --- FIN DETECTAR ESTADO ---
          }

          if (/[",\n\r]/.test(finalValue)) {
            finalValue = `"${finalValue.replace(/"/g, '""')}"`;
          }
          rowValues.push(finalValue);
        }

        if (rowHasContent) {
          if (!isTitleRow && !isHeaderRow) {
            rowValues.push(attendanceStatus || "");
          } else if (isHeaderRow) {
            rowValues.push("ESTADO");
          }
          while (rowValues.length < 6) {
            rowValues.push("");
          }
          csvContent += rowValues.slice(0, 6).join(",") + "\n";
        } else if (rowNumber > 1) {
          csvContent += "\n";
        }
      });

      sheetsData.push({ name: worksheet.name, content: csvContent.trim() });
    });

    res.json({ exito: true, sheets: sheetsData });
  } catch (error) {
    console.error(`Excel Preview: Error al procesar ${archivo}:`, error);
    res.status(500).json({
      mensaje: "Error al procesar el archivo XLSX.",
      detalle: error.message,
    });
  }
});

// --- NUEVA RUTA PARA JUSTIFICAR FALTAS ---
router.post("/justificar", async (req, res) => {
  const { codigo, fecha } = req.body; // fecha debe ser "DD-MM-YYYY"

  if (!codigo || !fecha) {
    return res
      .status(400)
      .json({ exito: false, mensaje: "Faltan código o fecha." });
  }

  const fileName = `${fecha}.xlsx`;
  const rutaExcel = path.join(registrosPath, fileName);

  if (!fs.existsSync(rutaExcel)) {
    return res
      .status(404)
      .json({ exito: false, mensaje: `El archivo ${fileName} no existe.` });
  }

  try {
    // 1. Encontrar al usuario y su hoja
    const usuarios = JSON.parse(fs.readFileSync(usuariosPath, "utf8"));
    const usuario = usuarios.find((u) => u.codigo === codigo);

    if (!usuario) {
      return res
        .status(404)
        .json({ exito: false, mensaje: "Código de usuario no encontrado." });
    }

    let sheetName = "";
    if (usuario.rol === "docente") sheetName = "Docentes";
    else if (usuario.turno === "mañana") sheetName = "Mañana";
    else if (usuario.turno === "tarde") sheetName = "Tarde";

    if (!sheetName) {
      return res
        .status(400)
        .json({ exito: false, mensaje: "No se pudo determinar la hoja." });
    }

    // 2. Abrir el Excel y buscar al alumno
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(rutaExcel);
    const hoja = workbook.getWorksheet(sheetName);
    if (!hoja) {
      return res
        .status(404)
        .json({ exito: false, mensaje: `Hoja ${sheetName} no encontrada.` });
    }

    let filaEncontrada = null;
    hoja.eachRow((row, rowNumber) => {
      let celdaNombre = row.getCell(2).value;
      if (typeof celdaNombre === "object" && celdaNombre?.richText) {
        celdaNombre = celdaNombre.richText.map((t) => t.text).join("");
      }

      if (
        normalizarTexto(celdaNombre?.toString() || "") ===
        normalizarTexto(getFullName(usuario))
      ) {
        filaEncontrada = row;
        return false; // Detener bucle
      }
    });

    if (!filaEncontrada) {
      return res.status(404).json({
        exito: false,
        mensaje: `Usuario ${getFullName(
          usuario
        )} no encontrado en la hoja ${sheetName}.`,
      });
    }

    // 3. Verificar y aplicar la justificación
    const celdaEstado = filaEncontrada.getCell(5);
    const valorActual = celdaEstado.value?.toString().toUpperCase();

    if (valorActual === "FALTA") {
      celdaEstado.value = "F. JUSTIFICADA"; // <-- MODIFICADO

      // --- CORRECCIÓN DEFINITIVA ---
      // Asignar un clon profundo del objeto de estilo a la celda
      celdaEstado.style = {
        fill: { ...estiloFaltaJustificada.fill }, // <-- MODIFICADO
        font: { ...estiloFaltaJustificada.font }, // <-- MODIFICADO
        alignment: { ...estiloFaltaJustificada.alignment }, // <-- MODIFICADO
        border: { ...estiloFaltaJustificada.border }, // <-- MODIFICADO
      };
      // --- FIN CORRECCIÓN ---

      await workbook.xlsx.writeFile(rutaExcel);
      res.json({ exito: true, mensaje: "Falta justificada correctamente." });
    } else if (valorActual === "F. JUSTIFICADA") {
      // <-- MODIFICADO
      res
        .status(400)
        .json({ exito: false, mensaje: "Esta falta ya estaba justificada." });
    } else {
      res.status(400).json({
        exito: false,
        mensaje: `No se puede justificar. Estado actual: ${
          valorActual || "VACÍO"
        }. (Solo se puede justificar una 'FALTA')`,
      });
    }
  } catch (error) {
    console.error("Error al justificar falta:", error);
    res
      .status(500)
      .json({ exito: false, mensaje: "Error interno del servidor." });
  }
});
// --- FIN NUEVA RUTA ---

module.exports = router;
