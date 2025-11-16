// src/services/excel/excel.constants.js

// Estilos de borde y alineación comunes
const borderStyle = {
  top: { style: "thin" },
  bottom: { style: "thin" },
  left: { style: "thin" },
  right: { style: "thin" },
};
const centerAlignment = { horizontal: "center", vertical: "middle" };
const leftAlignment = { horizontal: "left", vertical: "middle" };

// Estilos específicos para celdas de estado/datos
const estiloFalta = {
  fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } }, // Gris claro
  font: { bold: true, color: { argb: "FF000000" } },
  alignment: centerAlignment,
  border: borderStyle,
};

const estiloNoAsiste = {
  fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFC0C0C0" } }, // Gris medio
  font: { bold: true, italic: true, color: { argb: "FF404040" } },
  alignment: centerAlignment,
  border: borderStyle,
};

const estiloFaltaJustificada = {
  fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFEB9C" } }, // Naranja (Tolerancia)
  font: { bold: true, color: { argb: "FF9C6500" } }, // Naranja (Tolerancia)
  alignment: centerAlignment,
  border: borderStyle,
};

const estiloTardanzaJustificada = {
  fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFEB9C" } }, // Naranja (Tolerancia)
  font: { bold: true, color: { argb: "FF9C6500" } }, // Naranja (Tolerancia)
  alignment: centerAlignment,
  border: borderStyle,
};

const estiloDatosBase = {
  font: { bold: false, color: { argb: "FF000000" } },
  border: borderStyle,
};
const estiloEncabezadoBase = {
  font: { bold: true, color: { argb: "FFFFFFFF" } },
  alignment: centerAlignment,
  border: borderStyle,
};
const fillEncabezadoEstudiante = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF0A2240" },
};
const fillEncabezadoDocente = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF008080" }, // Un color verde azulado para docentes
};

// Estilo de celda para hora registrada (docente)
const estiloDocenteRegistrado = {
  fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFD6EAF8" } }, // Azul claro
  font: { bold: true, color: { argb: "FF1B4F72" } },
  alignment: centerAlignment,
  border: borderStyle,
};

// Estilos de celda para estados de estudiante (puntual, tolerancia, tarde)
const estilosEstadoEstudiante = {
  puntual: {
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFC6EFCE" } },
    font: { bold: true, color: { argb: "FF006100" } },
    alignment: centerAlignment,
    border: borderStyle,
  },
  tolerancia: {
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFEB9C" } },
    font: { bold: true, color: { argb: "FF9C6500" } },
    alignment: centerAlignment,
    border: borderStyle,
  },
  tarde: {
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFC7CE" } },
    font: { bold: true, color: { argb: "FF9C0006" } },
    alignment: centerAlignment,
    border: borderStyle,
  },
};

module.exports = {
  borderStyle,
  centerAlignment,
  leftAlignment,
  estiloFalta,
  estiloNoAsiste,
  estiloFaltaJustificada,
  estiloTardanzaJustificada,
  estiloDatosBase,
  estiloEncabezadoBase,
  fillEncabezadoEstudiante,
  fillEncabezadoDocente,
  estiloDocenteRegistrado,
  estilosEstadoEstudiante,
};
