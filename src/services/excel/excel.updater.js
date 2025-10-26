// src/services/excel/excel.updater.js
// SIN CAMBIOS respecto a la versión anterior (modularizada).
// La función updateAttendanceRecord recibe la hoja correcta y la actualiza.

const {
  estadoAsistencia,
  normalizarTexto,
  aplicarEstiloCelda,
  convertTo12Hour,
} = require("../../utils/helpers.js");
const {
  estilosEstadoEstudiante,
  estiloDocenteRegistrado,
  estiloDatosBase,
  centerAlignment,
  leftAlignment,
} = require("./excel.constants.js");
const { applyBaseDataRowStyles } = require("./excel.helpers.js");

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
    valorCelda !== "NO ASISTE"
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
  aplicarEstiloCelda(filaActualizada.getCell(5), estiloCeldaHora);

  console.log(`✅ Registro actualizado para ${usuario.nombre} a ${hora12h}.`);
  return true;
}

module.exports = {
  updateAttendanceRecord,
};
