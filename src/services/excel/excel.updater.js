// src/services/excel/excel.updater.js
const ExcelJS = require("exceljs");
const {
  estiloFalta,
  estiloNoAsiste,
  estiloDocenteRegistrado,
  estilosEstadoEstudiante,
  borderStyle,
  // --- IMPORTACIONES PARA HELPERS ---
  estiloDatosBase,
  centerAlignment,
  leftAlignment,
} = require("./excel.constants");
const {
  getDayAbbreviation,
  normalizarTexto, // Importar normalizarTexto
  convertTo12Hour, // Importar convertTo12Hour
  estadoAsistencia, // Importar estadoAsistencia
} = require("../../utils/helpers");
const { applyBaseDataRowStyles } = require("./excel.helpers.js"); // Importar helper de estilo

function updateAttendanceRecord(hoja, usuario, horaStr) {
  let filaEncontrada = null;
  let numFila = -1;

  hoja.eachRow((row, rowNumber) => {
    const celdaNombre = row.getCell(2);
    if (!celdaNombre || !celdaNombre.value) return;

    let nombreCelda = celdaNombre.value;
    if (
      typeof nombreCelda === "object" &&
      nombreCelda &&
      nombreCelda.richText
    ) {
      nombreCelda = nombreCelda.richText.map((t) => t.text).join("");
    } else if (
      typeof nombreCelda === "object" &&
      nombreCelda &&
      nombreCelda.text
    ) {
      nombreCelda = nombreCelda.text;
    }

    if (
      normalizarTexto(String(nombreCelda)) === normalizarTexto(usuario.nombre)
    ) {
      filaEncontrada = row;
      numFila = rowNumber;
      return false;
    }
  });

  if (!filaEncontrada) {
    console.log(`❌ No se encontró a ${usuario.nombre} en la hoja actual.`);
    return false;
  }

  const celdaHora = filaEncontrada.getCell(5);
  const valorCelda = (celdaHora.value || "").toString().trim().toUpperCase();

  if (
    valorCelda !== "" &&
    valorCelda !== "FALTA" &&
    valorCelda !== "NO ASISTE" &&
    valorCelda !== "JUSTIFICADO" // Permitir sobrescribir justificado
  ) {
    console.log(
      `⚠️ ${usuario.nombre} ya tiene registro: ${valorCelda}. Rechazado.`
    );
    return false;
  }

  const hora12h = convertTo12Hour(horaStr);

  let estiloCeldaHora;
  if (usuario.rol === "estudiante") {
    const estado = estadoAsistencia(usuario.turno, horaStr);
    estiloCeldaHora =
      estilosEstadoEstudiante[estado] || estilosEstadoEstudiante.tarde;
  } else {
    estiloCeldaHora = estiloDocenteRegistrado;
  }

  const numOriginal = filaEncontrada.getCell(1).value;
  const nombreOriginal = filaEncontrada.getCell(2).value;
  const turnoOriginal = filaEncontrada.getCell(3).value;
  const diasOriginal = filaEncontrada.getCell(4).value;
  const nuevaFilaValores = [
    numOriginal,
    nombreOriginal,
    turnoOriginal,
    diasOriginal,
    hora12h,
  ];

  hoja.spliceRows(numFila, 1, nuevaFilaValores);
  const filaActualizada = hoja.getRow(numFila);

  applyBaseDataRowStyles(
    filaActualizada,
    estiloDatosBase,
    centerAlignment,
    leftAlignment
  );

  // --- CORRECCIÓN DEFINITIVA ---
  // Asignar un clon profundo del objeto de estilo a la celda
  filaActualizada.getCell(5).style = {
    fill: { ...estiloCeldaHora.fill },
    font: { ...estiloCeldaHora.font },
    alignment: { ...estiloCeldaHora.alignment },
    border: { ...estiloCeldaHora.border },
  };
  // --- FIN CORRECCIÓN ---

  console.log(`✅ Registro actualizado para ${usuario.nombre} a ${hora12h}.`);
  return true;
}

module.exports = {
  updateAttendanceRecord,
};
