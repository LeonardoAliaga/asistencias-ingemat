// src/services/excel/excel.generator.js
// SIN CAMBIOS respecto a la versión anterior (modularizada).
// Las funciones generateStudentSheetStructure y generateTeacherSheetStructure
// ya reciben el objeto 'hoja' y lo llenan, lo cual es perfecto para este nuevo enfoque.

const fs = require("fs");
const path = require("path");
const {
  getDayAbbreviation,
  aplicarEstiloCelda,
} = require("../../utils/helpers.js");
const {
  estiloFalta,
  estiloNoAsiste,
  estiloEncabezadoBase,
  fillEncabezadoEstudiante,
  fillEncabezadoDocente,
  estiloDatosBase, // Importar para applyBaseDataRowStyles
  centerAlignment, // Importar para applyBaseDataRowStyles
  leftAlignment, // Importar para applyBaseDataRowStyles
} = require("./excel.constants.js");
const { applyBaseDataRowStyles } = require("./excel.helpers.js");

const usuariosPath = path.join(__dirname, "../../../data/usuarios.json");
const ciclosPath = path.join(__dirname, "../../../data/ciclos.json");

function getCiclosList() {
  try {
    const data = JSON.parse(fs.readFileSync(ciclosPath, "utf8"));
    return data.ciclos;
  } catch {
    return ["semestral", "anual", "sabatino", "domingos"];
  }
}

function generateStudentSheetStructure(
  hoja,
  turnoActual,
  nombreColumnaFecha,
  diaAbbr
) {
  let fila = 1;
  const ciclos = getCiclosList();
  const estudiantes = JSON.parse(fs.readFileSync(usuariosPath, "utf8")).filter(
    (u) => u.rol === "estudiante"
  );

  for (const ciclo of ciclos) {
    const grupo = estudiantes
      .filter((e) => e.ciclo === ciclo && e.turno === turnoActual)
      .sort((a, b) =>
        a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" })
      );

    if (grupo.length === 0) continue;

    // Título
    hoja.getCell(
      `A${fila}`
    ).value = `REGISTRO DE ASISTENCIA - ${ciclo.toUpperCase()} - ${turnoActual.toUpperCase()}`;
    hoja.mergeCells(`A${fila}:E${fila}`);
    hoja.getCell(`A${fila}`).font = { bold: true, size: 14 };
    hoja.getCell(`A${fila}`).alignment = { horizontal: "center" };
    fila++;

    // Encabezado
    hoja.getRow(fila).values = [
      "N°",
      "ALUMNO",
      "TURNO",
      "DÍAS ASISTENCIA",
      nombreColumnaFecha,
    ];
    hoja.getRow(fila).eachCell((cell) =>
      aplicarEstiloCelda(cell, {
        ...estiloEncabezadoBase,
        fill: fillEncabezadoEstudiante,
      })
    );
    fila++;

    // Datos
    grupo.forEach((est, i) => {
      const isScheduled =
        est.dias_asistencia && est.dias_asistencia.includes(diaAbbr);
      const initialStatus = isScheduled ? "FALTA" : "NO ASISTE";
      const diasAsistenciaStr = est.dias_asistencia
        ? est.dias_asistencia.join(", ")
        : "";

      const row = hoja.addRow([
        i + 1,
        est.nombre,
        est.turno.toUpperCase(),
        diasAsistenciaStr,
        initialStatus,
      ]);

      applyBaseDataRowStyles(
        row,
        estiloDatosBase,
        centerAlignment,
        leftAlignment
      );
      aplicarEstiloCelda(
        row.getCell(5),
        isScheduled ? estiloFalta : estiloNoAsiste
      );

      fila++;
    });
    fila++;
  }
}

function generateTeacherSheetStructure(hoja, nombreColumnaFecha, diaAbbr) {
  let fila = 1;
  const docentes = JSON.parse(fs.readFileSync(usuariosPath, "utf8"))
    .filter((u) => u.rol === "docente")
    .sort((a, b) =>
      a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" })
    );

  // Título
  hoja.getCell(`A${fila}`).value = "REGISTRO DE ASISTENCIA - DOCENTES";
  hoja.mergeCells(`A${fila}:E${fila}`);
  hoja.getCell(`A${fila}`).font = { bold: true, size: 14 };
  hoja.getCell(`A${fila}`).alignment = { horizontal: "center" };
  fila++;

  // Encabezado
  hoja.getRow(fila).values = [
    "N°",
    "DOCENTE",
    "TURNO",
    "DÍAS ASISTENCIA",
    nombreColumnaFecha,
  ];
  hoja.getRow(fila).eachCell((cell) =>
    aplicarEstiloCelda(cell, {
      ...estiloEncabezadoBase,
      fill: fillEncabezadoDocente,
    })
  );
  fila++;

  // Datos
  docentes.forEach((doc, i) => {
    const isScheduled =
      doc.dias_asistencia && doc.dias_asistencia.includes(diaAbbr);
    const initialStatus = isScheduled ? "FALTA" : "NO ASISTE";
    const diasAsistenciaStr = doc.dias_asistencia
      ? doc.dias_asistencia.join(", ")
      : "";

    const row = hoja.addRow([
      i + 1,
      doc.nombre,
      "",
      diasAsistenciaStr,
      initialStatus,
    ]);

    applyBaseDataRowStyles(
      row,
      estiloDatosBase,
      centerAlignment,
      leftAlignment
    );
    aplicarEstiloCelda(
      row.getCell(5),
      isScheduled ? estiloFalta : estiloNoAsiste
    );
  });
}

module.exports = {
  generateStudentSheetStructure,
  generateTeacherSheetStructure,
};
