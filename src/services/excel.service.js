// src/services/excel.service.js

const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");
const { getDayAbbreviation } = require("../utils/helpers.js");
const {
  determineExcelInfo,
  setColumnWidths,
} = require("./excel/excel.helpers.js");
const {
  generateStudentSheetStructure,
  generateTeacherSheetStructure,
} = require("./excel/excel.generator.js");
const { updateAttendanceRecord } = require("./excel/excel.updater.js");

/**
 * Guarda o actualiza el registro de asistencia en la hoja correcta del archivo Excel del día.
 * @param {object} usuario - Objeto del usuario (con rol, turno, nombre, etc.).
 * @param {string} fechaStr - Fecha en formato 'DD/MM/YYYY'.
 * @param {string} horaStr - Hora en formato 'HH:MM' (24h).
 * @param {boolean} isJustified - Flag para tardanza justificada (NUEVO)
 * @returns {Promise<boolean>} True si se guardó/actualizó, False en caso contrario.
 */
async function guardarRegistro(
  usuario,
  fechaStr,
  horaStr,
  isJustified = false,
) {
  const excelInfo = determineExcelInfo(fechaStr, usuario);
  if (!excelInfo) {
    return false; // Error en el rol/turno, ya logueado en el helper
  }
  const { filePath, sheetName } = excelInfo; // filePath es AHORA el archivo único del día

  try {
    const fecha = new Date();
    const diaAbbr = getDayAbbreviation(fecha);
    const diaSemana = fecha
      .toLocaleDateString("es-PE", { weekday: "long" })
      .toUpperCase();
    const diaNumero = fecha.getDate().toString().padStart(2, "0");
    const nombreColumnaFecha = `${diaSemana} ${diaNumero}`;

    const workbook = new ExcelJS.Workbook();
    let hoja;
    let isNewSheet = false; // Flag para saber si creamos la hoja

    if (fs.existsSync(filePath)) {
      // Leer archivo existente
      await workbook.xlsx.readFile(filePath);
      console.log(`📗 Archivo existente cargado: ${path.basename(filePath)}`);
      hoja = workbook.getWorksheet(sheetName); // Intentar obtener la hoja específica

      if (!hoja) {
        // La hoja para este turno/rol no existe aún, crearla
        console.log(
          `📄 Creando nueva hoja "${sheetName}" en archivo existente.`,
        );
        hoja = workbook.addWorksheet(sheetName);
        isNewSheet = true;
      } else {
        console.log(`📄 Usando hoja existente "${sheetName}".`);
        // --- VERIFICACIÓN/ACTUALIZACIÓN DE COLUMNA DE FECHA (Importante si el archivo existe) ---
        let headerRowIndex = 2; // Asumimos que la fila 2 es el encabezado por defecto

        const headerRow = hoja.getRow(headerRowIndex);
        let columnIndex = -1;
        headerRow.eachCell((cell, colNumber) => {
          // Compara el valor de la celda (convertido a string y mayúsculas) con el nombre de columna esperado
          if (
            cell.value &&
            cell.value.toString().toUpperCase() ===
              nombreColumnaFecha.toUpperCase()
          ) {
            columnIndex = colNumber;
          }
        });

        if (columnIndex === -1) {
          console.error(
            `❌ Error Crítico: Columna de fecha "${nombreColumnaFecha}" no existe en la hoja "${sheetName}" del archivo ${path.basename(
              filePath,
            )}. Registro fallido.`,
          );
          return false;
        }
        // --- FIN VERIFICACIÓN COLUMNA ---
      }
    } else {
      // Crear archivo y hoja nuevos
      console.log(
        `💾 Creando nuevo archivo: ${path.basename(
          filePath,
        )} con hoja "${sheetName}"`,
      );
      hoja = workbook.addWorksheet(sheetName);
      isNewSheet = true;
    }

    // Si la hoja es nueva, generar su estructura inicial
    if (isNewSheet) {
      console.log(
        `🏗️ Generando estructura para la nueva hoja "${sheetName}"...`,
      );
      if (sheetName === "Mañana" || sheetName === "Tarde") {
        const turno = sheetName.toLowerCase(); // 'mañana' o 'tarde'
        generateStudentSheetStructure(hoja, turno, nombreColumnaFecha, diaAbbr);
      } else if (sheetName === "Docentes") {
        generateTeacherSheetStructure(hoja, nombreColumnaFecha, diaAbbr);
      } else {
        console.warn(
          `⚠️ No se generó estructura para hoja con nombre inesperado: ${sheetName}`,
        );
      }
      setColumnWidths(hoja); // Establecer anchos para la nueva hoja
    }

    // Actualizar el registro del usuario en la hoja correcta
    const actualizado = updateAttendanceRecord(
      hoja,
      usuario,
      horaStr,
      isJustified,
    );

    if (actualizado) {
      // Guardar el workbook completo si hubo una actualización exitosa
      await workbook.xlsx.writeFile(filePath);
      console.log(
        `💾 Cambios guardados en ${path.basename(
          filePath,
        )} (Hoja: ${sheetName})`,
      );
      return true;
    } else {
      // No guardar si no se actualizó (ya tenía registro o no se encontró en esta hoja)
      return false;
    }
  } catch (err) {
    console.error(
      `❌ ERROR en guardarRegistro (${path.basename(
        filePath || "N/A",
      )}, Hoja: ${sheetName || "N/A"}):`,
    );
    console.error(err);
    return false;
  }
}

module.exports = {
  guardarRegistro,
};
