// src/routes/excel.route.js
const express = require("express");
const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");
// Importar helpers necesarios (si se usan, aunque en preview no tanto)
// const { convertTo12Hour, normalizarTexto, aplicarEstiloCelda } = require("../utils/helpers.js");

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
    // Ordenar para mostrar los más recientes primero si el nombre incluye fecha
    archivos.sort((a, b) => {
      // Extraer fechas si es posible (formato DD-MM-YYYY)
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

// --- RUTA PREVIEW MODIFICADA PARA MÚLTIPLES HOJAS ---
router.get("/preview/:archivo", async (req, res) => {
  const archivo = req.params.archivo;
  // Validación de nombre de archivo (sin cambios)
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

    const sheetsData = []; // Array para guardar los datos de cada hoja

    // Iterar sobre cada hoja del workbook
    workbook.eachSheet((worksheet, sheetId) => {
      console.log(` - Procesando hoja: ${worksheet.name}`);
      let csvContent = "";
      // Mapeo de colores ARGB (usados en excel.service.js) a estados CSS
      const colorMap = {
        FFC6EFCE: "puntual", // Verde (Puntual estudiante)
        FFFFE699: "tolerancia", // Naranja (Tolerancia estudiante)
        FFFFC7CE: "tarde", // Rojo (Tarde estudiante)
        FFD9D9D9: "falta", // Gris claro (Falta)
        FFC0C0C0: "no_asiste", // Gris oscuro (No Asiste)
        FFBDD7EE: "docente", // Azul claro (Docente registrado)
        // Puedes añadir más si tienes otros colores/estados
      };

      // Procesar cada fila de la hoja actual
      worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
        let rowValues = [];
        let rowHasContent = false;
        let isTitleRow = false;
        let isHeaderRow = false;
        let attendanceStatus = ""; // Variable para guardar el estado detectado

        // Procesar las 5 columnas existentes (N°, Nombre, Turno, Días, Hora)
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
            break; // Salir del loop de columnas para fila de título
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

            // NO necesitamos convertir a 12H aquí, el valor del Excel ya debería estarlo
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
                const bgColor = fillColor.fgColor.argb
                  .toUpperCase()
                  .substring(2); // Quitar FF inicial
                const mappedStatus = Object.keys(colorMap).find(
                  (key) => key.substring(2) === bgColor
                );
                if (mappedStatus) {
                  attendanceStatus = colorMap[mappedStatus];
                } else if (
                  finalValue &&
                  !["FALTA", "NO ASISTE", ""].includes(finalValue.toUpperCase())
                ) {
                  // Si es una hora pero no tiene color conocido, default a 'registrado'
                  attendanceStatus = "registrado";
                }
              } else if (finalValue.toUpperCase() === "FALTA") {
                attendanceStatus = "falta";
              } else if (finalValue.toUpperCase() === "NO ASISTE") {
                attendanceStatus = "no_asiste";
              } else if (
                finalValue &&
                !["FALTA", "NO ASISTE", ""].includes(finalValue.toUpperCase())
              ) {
                attendanceStatus = "registrado"; // Estado genérico por defecto para horas sin estilo
              }
            } // --- FIN DETECTAR ESTADO ---
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
          // Asegurar siempre 6 columnas para consistencia
          while (rowValues.length < 6) {
            rowValues.push("");
          }

          csvContent += rowValues.slice(0, 6).join(",") + "\n"; // Enviar 6 columnas
        } else if (rowNumber > 1) {
          // Añadir línea vacía si no es la primera y no tiene contenido
          csvContent += "\n";
        }
      }); // Fin eachRow

      // Guardar el nombre de la hoja y su contenido CSV procesado
      sheetsData.push({ name: worksheet.name, content: csvContent.trim() });
    }); // Fin eachSheet

    // Enviar el array de hojas y sus contenidos al frontend
    res.json({ exito: true, sheets: sheetsData });
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
