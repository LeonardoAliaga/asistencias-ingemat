// src/services/excel/excel.generator.js
const db = require("../../database/db.js");
const { getDayAbbreviation, getFullName } = require("../../utils/helpers.js");
const {
  estiloFalta,
  estiloNoAsiste,
  estiloEncabezadoBase,
  fillEncabezadoEstudiante,
  fillEncabezadoDocente,
  estiloDatosBase,
  centerAlignment,
  leftAlignment,
} = require("./excel.constants.js");
const { applyBaseDataRowStyles } = require("./excel.helpers.js");

function getCiclosList() {
  try {
    const rows = db.prepare("SELECT nombre FROM ciclos ORDER BY id ASC").all();
    if (rows.length > 0) return rows.map((r) => r.nombre);
  } catch {}
  return ["SEMESTRAL", "ANUAL", "SABATINO", "DOMINGOS"];
}

function getUsuariosList() {
  try {
    const rows = db.prepare("SELECT * FROM usuarios").all();
    return rows.map((u) => {
      let dias_asistencia = ["L", "M", "MI", "J", "V", "S"];
      try {
        dias_asistencia = JSON.parse(u.dias_asistencia || "[]");
        if (!Array.isArray(dias_asistencia) || dias_asistencia.length === 0) {
          dias_asistencia = ["L", "M", "MI", "J", "V", "S"];
        }
      } catch (e) {}

      return {
        codigo: String(u.codigo).toUpperCase(),
        nombre: u.nombre,
        apellido: u.apellido,
        rol: u.rol,
        turno: u.turno || "",
        ciclo: u.ciclo || "",
        dias_asistencia,
      };
    });
  } catch {
    return [];
  }
}

function generateStudentSheetStructure(
  hoja,
  turnoActual,
  nombreColumnaFecha,
  diaAbbr,
) {
  let fila = 1;
  const ciclos = getCiclosList();
  const usuarios = getUsuariosList();
  const estudiantes = usuarios.filter((u) => u.rol === "estudiante");

  for (const ciclo of ciclos) {
    const grupo = estudiantes
      .filter(
        (e) =>
          e.ciclo.toUpperCase() === ciclo.toUpperCase() &&
          e.turno.toUpperCase() === turnoActual.toUpperCase(),
      )
      .sort((a, b) => {
        const ka = (a.apellido || getFullName(a)).toString().toUpperCase();
        const kb = (b.apellido || getFullName(b)).toString().toUpperCase();
        return ka.localeCompare(kb, "es", { sensitivity: "base" });
      });

    if (grupo.length === 0) continue;

    // Título
    hoja.getCell(`A${fila}`).value =
      `REGISTRO DE ASISTENCIA - ${ciclo.toUpperCase()} - ${turnoActual.toUpperCase()}`;
    hoja.mergeCells(`A${fila}:E${fila}`);
    hoja.getCell(`A${fila}`).font = { bold: true, size: 14 };
    hoja.getCell(`A${fila}`).alignment = { horizontal: "center" };
    fila++;

    // Encabezado
    hoja.getRow(fila).values = [
      "N°",
      "ESTUDIANTE",
      "TURNO",
      "CICLO",
      nombreColumnaFecha,
    ];

    hoja.getRow(fila).eachCell((cell) => {
      cell.style = estiloEncabezadoBase;
      cell.fill = fillEncabezadoEstudiante;
    });

    fila++;

    // Datos de Estudiantes
    grupo.forEach((estudiante, idx) => {
      const diasAsistenciaUpper = (
        estudiante.dias_asistencia || ["L", "M", "MI", "J", "V", "S"]
      ).map((d) => d.toUpperCase());
      const isScheduled = diasAsistenciaUpper.includes(diaAbbr.toUpperCase());

      const valorAsistenciaInicial = isScheduled ? "FALTA" : "NO ASISTE";

      const row = hoja.getRow(fila);
      row.values = [
        idx + 1,
        getFullName(estudiante),
        estudiante.turno,
        estudiante.ciclo,
        valorAsistenciaInicial,
      ];

      applyBaseDataRowStyles(
        row,
        estiloDatosBase,
        centerAlignment,
        leftAlignment,
      );

      const styleToApply = isScheduled ? estiloFalta : estiloNoAsiste;
      row.getCell(5).style = {
        fill: { ...styleToApply.fill },
        font: { ...styleToApply.font },
        alignment: { ...styleToApply.alignment },
        border: { ...styleToApply.border },
      };

      fila++;
    });
    fila++;
  }
}

function generateTeacherSheetStructure(hoja, nombreColumnaFecha, diaAbbr) {
  let fila = 1;
  const usuarios = getUsuariosList();
  const docentes = usuarios
    .filter((u) => u.rol === "docente")
    .sort((a, b) => {
      const ka = (a.apellido || getFullName(a)).toString().toUpperCase();
      const kb = (b.apellido || getFullName(b)).toString().toUpperCase();
      return ka.localeCompare(kb, "es", { sensitivity: "base" });
    });

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
    "CICLO",
    nombreColumnaFecha,
  ];

  hoja.getRow(fila).eachCell((cell) => {
    cell.style = estiloEncabezadoBase;
    cell.fill = fillEncabezadoDocente;
  });

  fila++;

  // Datos
  docentes.forEach((docente, idx) => {
    const diasAsistenciaUpper = (
      docente.dias_asistencia || ["L", "M", "MI", "J", "V", "S"]
    ).map((d) => d.toUpperCase());
    const isScheduled = diasAsistenciaUpper.includes(diaAbbr.toUpperCase());
    const valorAsistenciaInicial = isScheduled ? "FALTA" : "NO ASISTE";

    const row = hoja.getRow(fila);
    row.values = [
      idx + 1,
      getFullName(docente),
      "N/A",
      "DOCENTE",
      valorAsistenciaInicial,
    ];

    applyBaseDataRowStyles(
      row,
      estiloDatosBase,
      centerAlignment,
      leftAlignment,
    );

    const styleToApply = isScheduled ? estiloFalta : estiloNoAsiste;
    row.getCell(5).style = {
      fill: { ...styleToApply.fill },
      font: { ...styleToApply.font },
      alignment: { ...styleToApply.alignment },
      border: { ...styleToApply.border },
    };

    fila++;
  });
}

module.exports = {
  generateStudentSheetStructure,
  generateTeacherSheetStructure,
};
