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

const estiloDatosBase = {
  font: { bold: false, color: { argb: "FF000000" } },
  border: borderStyle,
};

const estiloEncabezadoBase = {
  font: { bold: true, color: { argb: "FFFFFFFF" } },
  alignment: centerAlignment,
  border: borderStyle,
};

const estilosEstadoEstudiante = {
  puntual: {
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFC6EFCE" } }, // Verde
    font: { bold: true, color: { argb: "FF006100" } },
    alignment: centerAlignment,
    border: borderStyle,
  },
  tolerancia: {
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFE699" } }, // Naranja
    font: { bold: true, color: { argb: "FF9C6500" } },
    alignment: centerAlignment,
    border: borderStyle,
  },
  tarde: {
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFC7CE" } }, // Rojo
    font: { bold: true, color: { argb: "FF9C0006" } },
    alignment: centerAlignment,
    border: borderStyle,
  },
};

const estiloDocenteRegistrado = {
  fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFBDD7EE" } }, // Azul claro
  font: { bold: true, color: { argb: "FF000000" } }, // Texto negro por defecto
  alignment: centerAlignment,
  border: borderStyle,
};

const fillEncabezadoEstudiante = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF404040" },
}; // Gris oscuro
const fillEncabezadoDocente = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF1F4E78" },
}; // Azul oscuro

module.exports = {
  borderStyle,
  centerAlignment,
  leftAlignment,
  estiloFalta,
  estiloNoAsiste,
  estiloDatosBase,
  estiloEncabezadoBase,
  estilosEstadoEstudiante,
  estiloDocenteRegistrado,
  fillEncabezadoEstudiante,
  fillEncabezadoDocente,
};
