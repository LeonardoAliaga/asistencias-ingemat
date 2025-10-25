// src/routes/excel.route.js
const express = require("express");
const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");
// Importar helpers necesarios
const { convertTo12Hour, normalizarTexto } = require("../utils/helpers"); // No necesitamos estadoAsistencia aquí

const router = express.Router();
const registrosPath = path.join(__dirname, "../../Registros");
// const usuariosPath = path.join(__dirname, "../../data/usuarios.json"); // No necesitamos usuarios aquí

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
    res.json(archivos.sort().reverse());
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

// GET /api/excel/preview/:archivo - Obtener contenido para vista previa MODIFICADO
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
  console.log(`Excel Route: Generando preview para ${archivo}`);
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(ruta);
    const worksheet =
      workbook.getWorksheet("Asistencia") || workbook.worksheets[0];

    if (!worksheet) {
      console.log(
        `Excel Preview: No se encontró hoja 'Asistencia' o primera hoja en ${archivo}`
      );
      return res
        .status(404)
        .json({ mensaje: "No se encontraron hojas válidas en el archivo" });
    }

    let csvContent = "";

    // Mapeo de colores ARGB (usados en excel.service.js) a estados CSS
    // Asegúrate que estos ARGB coincidan EXACTAMENTE con los de excel.service.js
    const colorMap = {
      FFC6EFCE: "puntual", // Verde (Puntual estudiante)
      FFFFE699: "tolerancia", // Naranja (Tolerancia estudiante)
      FFFFC7CE: "tarde", // Rojo (Tarde estudiante)
      FFD9D9D9: "falta", // Gris claro (Falta)
      FFC0C0C0: "no_asiste", // Gris oscuro (No Asiste)
      FFBDD7EE: "docente", // Azul claro (Docente registrado)
      // Puedes añadir más si tienes otros colores
    };

    worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      let rowValues = [];
      let rowHasContent = false;
      let isTitleRow = false;
      let isHeaderRow = false;
      let attendanceStatus = ""; // Variable para guardar el estado detectado

      // Procesar las 5 columnas existentes
      for (let colNumber = 1; colNumber <= 5; colNumber++) {
        const cell = row.getCell(colNumber);
        let value = cell.value;
        let finalValue = "";

        // Detección Título/Encabezado
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
          break; // Salir del loop de columnas
        }
        if (
          colNumber === 1 &&
          typeof value === "string" &&
          (value === "N°" || value?.toString().toUpperCase().includes("N°"))
        ) {
          isHeaderRow = true;
        }

        // Procesamiento de valor (RichText, Date, Formula, String)
        if (value !== null && value !== undefined) {
          if (typeof value === "object" && value && value.richText) {
            finalValue = value.richText.map((rt) => rt.text).join("");
          } else if (value instanceof Date) {
            // Formatear fechas correctamente
            // Si es la columna de hora (5), formatear como hora 12h
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
              // Otras columnas (si hubiera fechas)
              finalValue = value.toLocaleDateString("es-PE"); // Formato DD/MM/YYYY
            }
          } else if (
            typeof value === "object" &&
            value &&
            value.result !== undefined
          ) {
            // Formulas
            let resultValue = value.result;
            if (resultValue instanceof Date && colNumber === 5) {
              // Resultado de formula es fecha/hora
              finalValue = resultValue
                .toLocaleTimeString("es-PE", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: true,
                })
                .replace(/\s/g, "")
                .toUpperCase();
            } else {
              // Otro resultado de formula
              finalValue = String(resultValue);
            }
          } else {
            // Strings, Numbers, etc.
            finalValue = String(value);
          }

          // Convertir hora a 12H (Columna 5) si NO es FALTA/NO ASISTE
          if (
            colNumber === 5 &&
            !["FALTA", "NO ASISTE", ""].includes(finalValue.toUpperCase())
          ) {
            finalValue = convertTo12Hour(finalValue); // Asegurar formato 12H
          }

          finalValue = finalValue.trim();
          if (finalValue.length > 0) rowHasContent = true;

          // --- DETECTAR ESTADO POR COLOR (Columna 5) ---
          if (!isTitleRow && !isHeaderRow && colNumber === 5) {
            const fillColor = cell.fill;
            if (
              fillColor &&
              fillColor.type === "pattern" &&
              fillColor.pattern === "solid" &&
              fillColor.fgColor &&
              fillColor.fgColor.argb
            ) {
              const bgColor = fillColor.fgColor.argb.toUpperCase().substring(2); // Quitar FF inicial
              // Buscar en el mapeo (quitando FF de las claves del map)
              const mappedStatus = Object.keys(colorMap).find(
                (key) => key.substring(2) === bgColor
              );
              if (mappedStatus) {
                attendanceStatus = colorMap[mappedStatus];
              } else {
                // Si es una hora pero no tiene color conocido, default a 'registrado' (o lo que prefieras)
                if (
                  finalValue &&
                  !["FALTA", "NO ASISTE", ""].includes(finalValue.toUpperCase())
                ) {
                  attendanceStatus = "registrado"; // Estado genérico para horas sin color específico
                }
                // console.log(`Color no mapeado: ${bgColor} en celda ${cell.address}`); // Para debug
              }
            } else if (finalValue.toUpperCase() === "FALTA") {
              attendanceStatus = "falta"; // Asignar estado si el texto es FALTA y no hay color
            } else if (finalValue.toUpperCase() === "NO ASISTE") {
              attendanceStatus = "no_asiste"; // Asignar estado si el texto es NO ASISTE y no hay color
            } else if (
              finalValue &&
              !["FALTA", "NO ASISTE", ""].includes(finalValue.toUpperCase())
            ) {
              attendanceStatus = "registrado"; // Estado genérico por defecto para horas sin estilo
            }
          }
          // --- FIN DETECTAR ESTADO ---
        } // Fin if value !== null/undefined

        // Escapar y añadir a rowValues
        if (/[",\n\r]/.test(finalValue)) {
          finalValue = `"${finalValue.replace(/"/g, '""')}"`;
        }
        rowValues.push(finalValue);
      } // Fin for columnas 1-5

      // Añadir la fila al CSV si tiene contenido
      if (rowHasContent) {
        // Si es fila de datos, añadir el estado detectado como 6ta columna
        if (!isTitleRow && !isHeaderRow) {
          rowValues.push(attendanceStatus || ""); // Añadir estado o vacío
        } else if (isHeaderRow) {
          rowValues.push("ESTADO"); // Añadir encabezado para la columna virtual de estado
        }
        // Asegurar siempre 6 columnas para consistencia (aunque el estado solo aplica a datos)
        while (rowValues.length < 6) {
          rowValues.push("");
        }

        csvContent += rowValues.slice(0, 6).join(",") + "\n"; // Enviar 6 columnas
      } else if (rowNumber > 1) {
        // Añadir línea vacía si no es la primera y no tiene contenido
        // No añadir comas extra para líneas vacías
        // csvContent += ",,,,,\n"; // Evitar esto
        csvContent += "\n";
      }
    }); // Fin eachRow

    res.json({ exito: true, content: csvContent.trim() });
  } catch (error) {
    console.error(`Excel Preview: Error al procesar ${archivo}:`, error);
    res.status(500).json({
      mensaje:
        "Error al procesar el archivo XLSX. Puede estar corrupto o tener un formato no estándar.",
      detalle: error.message,
    });
  }
});

module.exports = router;
