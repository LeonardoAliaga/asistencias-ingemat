// src/services/excel/excel.updater.js
const ExcelJS = require("exceljs");
const {
  estiloFalta,
  estiloNoAsiste,
  estiloDocenteRegistrado,
  estilosEstadoEstudiante,
  estiloTardanzaJustificada,
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
  getFullName,
} = require("../../utils/helpers");
const { applyBaseDataRowStyles } = require("./excel.helpers.js"); // Importar helper de estilo

function updateAttendanceRecord(hoja, usuario, horaStr, isJustified = false) {
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

    // comparar usando la forma canónica retornada por getFullName(usuario)
    const cellNorm = normalizarTexto(String(nombreCelda));
    const preferredNorm = normalizarTexto(getFullName(usuario));

    if (cellNorm === preferredNorm) {
      filaEncontrada = row;
      numFila = rowNumber;
      return false;
    }
  });

  if (!filaEncontrada) {
    console.log(
      `❌ No se encontró a ${getFullName(usuario)} en la hoja actual.`
    );
    return false;
  }

  const celdaHora = filaEncontrada.getCell(5);
  const valorCelda = (celdaHora.value || "").toString().trim().toUpperCase();

  //Permitir sobrescribir "FALTA", "NO ASISTE", "F. JUSTIFICADA" o vacío
  if (
    valorCelda !== "" &&
    valorCelda !== "FALTA" &&
    valorCelda !== "NO ASISTE" &&
    valorCelda !== "F. JUSTIFICADA" &&
    !valorCelda.endsWith("(J)") // No sobrescribir si ya está justificado
  ) {
    console.log(
      `⚠️ ${getFullName(usuario)} ya tiene registro: ${valorCelda}. Rechazado.`
    );
    return false;
  }

  const hora12h = convertTo12Hour(horaStr);

  // --- INICIO LÓGICA DE JUSTIFICACIÓN (J) ---
  let valorHoraParaExcel = hora12h;
  let estiloCeldaHora;

  if (usuario.rol === "estudiante") {
    const estado = estadoAsistencia(usuario.ciclo, usuario.turno, horaStr);

    if (isJustified && (estado === "tarde" || estado === "tolerancia")) {
      // Es tardanza justificada
      valorHoraParaExcel = `${hora12h} (J)`;
      estiloCeldaHora = estiloTardanzaJustificada;
    } else {
      // Registro normal
      estiloCeldaHora =
        estilosEstadoEstudiante[estado] || estilosEstadoEstudiante.tarde;
    }
  } else {
    // Docente
    if (isJustified) {
      valorHoraParaExcel = `${hora12h} (J)`;
    }
    estiloCeldaHora = estiloDocenteRegistrado;
  }
  // --- FIN LÓGICA DE JUSTIFICACIÓN (J) ---

  const numOriginal = filaEncontrada.getCell(1).value;
  const nombreOriginal = filaEncontrada.getCell(2).value;
  const turnoOriginal = filaEncontrada.getCell(3).value;
  const diasOriginal = filaEncontrada.getCell(4).value;
  const nuevaFilaValores = [
    numOriginal,
    nombreOriginal,
    turnoOriginal,
    diasOriginal,
    valorHoraParaExcel, // Usar el valor modificado (con o sin J)
  ];

  hoja.spliceRows(numFila, 1, nuevaFilaValores);
  const filaActualizada = hoja.getRow(numFila);

  applyBaseDataRowStyles(
    filaActualizada,
    estiloDatosBase,
    centerAlignment,
    leftAlignment
  );

  filaActualizada.getCell(5).style = {
    fill: { ...estiloCeldaHora.fill },
    font: { ...estiloCeldaHora.font },
    alignment: { ...estiloCeldaHora.alignment },
    border: { ...estiloCeldaHora.border },
  };

  console.log(
    `✅ Registro actualizado para ${getFullName(
      usuario
    )} a ${valorHoraParaExcel}.`
  );
  return true;
}

module.exports = {
  updateAttendanceRecord,
};
