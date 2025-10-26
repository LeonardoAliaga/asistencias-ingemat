// src/services/excel/excel.helpers.js
const path = require("path");
const { aplicarEstiloCelda } = require("../../utils/helpers.js"); // Helper general

const registrosPath = path.join(__dirname, "../../../Registros");

/**
 * Determina la ruta del archivo Excel único para el día y el nombre de la hoja destino.
 * @param {string} fechaStr - Fecha en formato 'DD/MM/YYYY'.
 * @param {object} usuario - Objeto del usuario.
 * @returns {{filePath: string, sheetName: string}|null} Ruta del archivo y nombre de la hoja, o null si el rol es inválido.
 */
function determineExcelInfo(fechaStr, usuario) {
  let sheetName = "";
  if (usuario.rol === "docente") {
    sheetName = "Docentes"; // Nombre de la hoja para docentes
  } else if (usuario.rol === "estudiante") {
    // Asegúrate que turno exista y sea 'mañana' o 'tarde'
    if (usuario.turno === "mañana") {
      sheetName = "Mañana"; // Nombre de la hoja para turno mañana
    } else if (usuario.turno === "tarde") {
      sheetName = "Tarde"; // Nombre de la hoja para turno tarde
    } else {
      console.warn(
        `⚠️ Turno desconocido para estudiante ${usuario.codigo}: ${usuario.turno}. Usando hoja 'Otros'.`
      );
      sheetName = "Otros"; // Hoja para casos inesperados
    }
  } else {
    console.error(`❌ Rol de usuario desconocido: ${usuario.rol}`);
    return null; // No se puede determinar la hoja
  }

  const baseName = fechaStr.replace(/\//g, "-");
  const fileName = `${baseName}.xlsx`; // Nombre de archivo único por día
  const filePath = path.join(registrosPath, fileName);

  return { filePath, sheetName };
}

/**
 * Establece anchos de columna predeterminados y ajusta dinámicamente si es necesario.
 * @param {ExcelJS.Worksheet} worksheet - La hoja de cálculo.
 */
function setColumnWidths(worksheet) {
  worksheet.columns.forEach((col, index) => {
    let defaultWidth = 10; // Ancho por defecto
    if (index === 0) defaultWidth = 5; // N°
    else if (index === 1) defaultWidth = 35; // ALUMNO/DOCENTE
    else if (index === 2) defaultWidth = 10; // TURNO
    else if (index === 3) defaultWidth = 20; // DÍAS ASISTENCIA
    else if (index === 4) defaultWidth = 15; // HORA REGISTRO

    col.width = defaultWidth;
    // Ajuste dinámico opcional
    /*
         col.eachCell({ includeEmpty: true }, (cell) => {
             if (!cell.isMerged && cell.value) {
                 const len = cell.value.toString().length;
                 if (len + 2 > col.width) {
                     col.width = Math.min(len + 2, 50);
                 }
             }
         });
         */
  });
}

/**
 * Aplica estilos básicos a una fila de datos (N°, Nombre, Turno, Días).
 * @param {ExcelJS.Row} row - La fila a estilizar.
 * @param {object} estiloBase - El estilo de datos base importado de constants.
 * @param {object} centerAlign - El estilo de alineación central importado de constants.
 * @param {object} leftAlign - El estilo de alineación izquierda importado de constants.
 */
function applyBaseDataRowStyles(row, estiloBase, centerAlign, leftAlign) {
  aplicarEstiloCelda(row.getCell(1), { ...estiloBase, alignment: centerAlign }); // N°
  aplicarEstiloCelda(row.getCell(2), { ...estiloBase, alignment: leftAlign }); // Nombre
  aplicarEstiloCelda(row.getCell(3), { ...estiloBase, alignment: centerAlign }); // Turno
  aplicarEstiloCelda(row.getCell(4), { ...estiloBase, alignment: centerAlign }); // Días
}

module.exports = {
  determineExcelInfo, // Cambiado el nombre de la función
  setColumnWidths,
  applyBaseDataRowStyles,
};
