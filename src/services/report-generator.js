// Proyecto Beta/src/services/report-generator.js
const { createCanvas, registerFont } = require("canvas");
const path = require("path");
const fs = require("fs");
const ExcelJS = require("exceljs");
const {
  estilosEstadoEstudiante,
  estiloFalta,
  estiloNoAsiste,
  estiloDocenteRegistrado,
  estiloFaltaJustificada,
  estiloTardanzaJustificada,
  estiloDatosBase,
  estiloEncabezadoBase,
  fillEncabezadoDocente,
  fillEncabezadoEstudiante,
} = require("./excel/excel.constants.js");
const { normalizarTexto } = require("../utils/helpers.js");

// --- Configuración de Estilos para Canvas ---
try {
  registerFont(
    path.join(__dirname, "../../Public/fonts/ZTGatha-SemiBold.otf"),
    { family: "Gatha" }
  );
  registerFont(path.join(__dirname, "../../Public/fonts/coolvetica rg.otf"), {
    family: "Coolvetica",
  });
} catch (err) {
  console.warn(
    "Report-Generator: No se pudieron cargar las fuentes personalizadas. Usando 'sans-serif'.",
    err.message
  );
}

// --- MAPA DE ESTILOS ACTUALIZADO ---
const styles = {
  puntual: {
    bg: "#" + estilosEstadoEstudiante.puntual.fill.fgColor.argb.substring(2),
    text: "#" + estilosEstadoEstudiante.puntual.font.color.argb.substring(2),
  },
  tolerancia: {
    bg: "#" + estilosEstadoEstudiante.tolerancia.fill.fgColor.argb.substring(2),
    text: "#" + estilosEstadoEstudiante.tolerancia.font.color.argb.substring(2),
  },
  tarde: {
    bg: "#" + estilosEstadoEstudiante.tarde.fill.fgColor.argb.substring(2),
    text: "#" + estilosEstadoEstudiante.tarde.font.color.argb.substring(2),
  },
  docente: {
    bg: "#" + estiloDocenteRegistrado.fill.fgColor.argb.substring(2),
    text:
      "#" +
      (estiloDocenteRegistrado.font.color
        ? estiloDocenteRegistrado.font.color.argb.substring(2)
        : "000000"),
  },
  falta: {
    bg: "#" + estiloFalta.fill.fgColor.argb.substring(2),
    text: "#" + estiloFalta.font.color.argb.substring(2),
  },
  no_asiste: {
    bg: "#" + estiloNoAsiste.fill.fgColor.argb.substring(2),
    text: "#" + estiloNoAsiste.font.color.argb.substring(2),
  },
  falta_justificada: {
    // <-- MODIFICADO (justificado -> falta_justificada)
    bg: "#" + estiloFaltaJustificada.fill.fgColor.argb.substring(2),
    text: "#" + estiloFaltaJustificada.font.color.argb.substring(2),
  },
  // --- NUEVO ESTILO AÑADIDO ---
  tardanza_justificada: {
    bg: "#" + estiloTardanzaJustificada.fill.fgColor.argb.substring(2),
    text: "#" + estiloTardanzaJustificada.font.color.argb.substring(2),
  },
  // --- FIN NUEVO ESTILO ---
  registrado: { bg: "#E7E6E6", text: "#000000" },
  header: {
    bg: (turno) =>
      turno === "docentes"
        ? "#" + fillEncabezadoDocente.fgColor.argb.substring(2)
        : "#" + fillEncabezadoEstudiante.fgColor.argb.substring(2),
    text: "#" + estiloEncabezadoBase.font.color.argb.substring(2),
  },
  base: { bg: "#FFFFFF", text: "#000000" },
  title: { text: "#000000", font: "bold 20px Gatha, sans-serif" },
  headerFont: "bold 16px Coolvetica, sans-serif",
  dataFont: "15px Coolvetica, sans-serif",
};

const ROW_HEIGHT = 30;
const TITLE_HEIGHT = 40;
const HEADER_HEIGHT = 35;
const PADDING = 10;
const COL_WIDTHS = [40, 300, 90, 150, 100];
const TOTAL_WIDTH = COL_WIDTHS.reduce((a, b) => a + b, 0) + PADDING * 2;
const registrosPath = path.join(__dirname, "../../Registros");

// --- MAPA DE COLORES ACTUALIZADO ---
const colorMap = {
  [estilosEstadoEstudiante.puntual.fill.fgColor.argb]: "puntual",
  [estilosEstadoEstudiante.tolerancia.fill.fgColor.argb]: "tolerancia",
  [estilosEstadoEstudiante.tarde.fill.fgColor.argb]: "tarde",
  [estiloFalta.fill.fgColor.argb]: "falta",
  [estiloNoAsiste.fill.fgColor.argb]: "no_asiste",
  [estiloDocenteRegistrado.fill.fgColor.argb]: "docente",
  [estiloFaltaJustificada.fill.fgColor.argb]: "falta_justificada",
  [estiloTardanzaJustificada.fill.fgColor.argb]: "tardanza_justificada",
};
// --- FIN CONFIGURACIÓN ---

async function getExcelData(fileName) {
  const ruta = path.join(registrosPath, fileName);
  if (!fs.existsSync(ruta)) {
    throw new Error(`Archivo no encontrado: ${fileName}`);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(ruta);
  const allSheetsData = [];

  workbook.eachSheet((worksheet) => {
    let currentSection = null;
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const cellA = row.getCell(1);
      let cellAValue = cellA.value;
      if (typeof cellAValue === "object" && cellAValue?.richText) {
        cellAValue = cellAValue.richText.map((rt) => rt.text).join("");
      }
      cellAValue = cellAValue?.toString() || "";

      if (cellA.isMerged && cellAValue.startsWith("REGISTRO DE ASISTENCIA")) {
        const parts = cellAValue
          .split(" - ")
          .map((p) => p.trim().toLowerCase());

        const isDocentes =
          parts.some((p) => p === "docentes") ||
          worksheet.name.toLowerCase() === "docentes";

        currentSection = {
          sheetName: worksheet.name,
          title: cellAValue,
          ciclo: isDocentes ? "docentes" : parts[1] || "unknown",
          turno: isDocentes ? "docentes" : parts[2] || "unknown",
          headers: [],
          rows: [],
        };
        allSheetsData.push(currentSection);
      } else if (cellAValue.toUpperCase().includes("N°") && currentSection) {
        currentSection.headers = [
          row.getCell(1).value,
          row.getCell(2).value,
          row.getCell(3).value,
          row.getCell(4).value,
          row.getCell(5).value,
        ].map((h) => h?.toString() || "");
      } else if (
        !isNaN(parseInt(cellAValue)) &&
        currentSection &&
        row.getCell(2).value
      ) {
        let nombre = row.getCell(2).value;
        if (typeof nombre === "object" && nombre?.richText) {
          nombre = nombre.richText.map((t) => t.text).join("");
        }

        const cellE = row.getCell(5);
        let cellEValue = cellE.value;
        let status = "registrado";

        if (cellEValue instanceof Date) {
          cellEValue = cellEValue
            .toLocaleTimeString("es-PE", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: true,
            })
            .replace(/\s/g, "")
            .toUpperCase();
        } else {
          cellEValue = cellEValue?.toString() || "";
        }

        // --- LÓGICA DE ESTADO ACTUALIZADA ---
        const cellEFill = cellE.fill;
        if (cellEFill && cellEFill.fgColor && cellEFill.fgColor.argb) {
          const argb = cellEFill.fgColor.argb.toUpperCase();
          status = colorMap[argb] || status;
        }

        const upperVal = cellEValue.toUpperCase();
        if (status === "registrado") {
          // Fallback por texto si el color no está mapeado
          if (upperVal === "FALTA") status = "falta";
          else if (upperVal === "NO ASISTE") status = "no_asiste";
          else if (upperVal === "F. JUSTIFICADA") status = "falta_justificada"; // <-- MODIFICADO
        }

        // Check para tardanza justificada (J)
        if (upperVal.endsWith("(J)") && status !== "puntual") {
          status = "tardanza_justificada";
        }
        // --- FIN LÓGICA DE ESTADO ---

        currentSection.rows.push({
          n: row.getCell(1).value?.toString() || "",
          nombre: nombre?.toString() || "",
          turno: row.getCell(3).value?.toString() || "",
          dias: row.getCell(4).value?.toString() || "",
          hora: cellEValue,
          status: status,
        });
      }
    });
  });
  return allSheetsData;
}

function findSection(data, ciclo, turno) {
  if (!data || !Array.isArray(data)) return null;
  // El turno para docentes siempre será 'docentes'
  const searchTurno = ciclo === "docentes" ? "docentes" : turno;
  return data.find((s) => s.ciclo === ciclo && s.turno === searchTurno);
}

async function generateReportImage(ciclo, turno) {
  const today = new Date();
  const fileName =
    today
      .toLocaleDateString("es-PE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
      .replace(/\//g, "-") + ".xlsx";

  let sectionData;
  try {
    const allData = await getExcelData(fileName);

    // EXCEPCIÓN: si el ciclo es DOCENTES, buscar 'docentes'
    const cicloNorm =
      ciclo.toUpperCase() === "DOCENTES"
        ? "docentes"
        : ciclo.trim().toLowerCase();
    const turnoNorm =
      ciclo.toUpperCase() === "DOCENTES"
        ? "docentes"
        : turno.trim().toLowerCase();

    sectionData = findSection(allData, cicloNorm, turnoNorm);

    // Si no se encontró, registrar la información
    if (!sectionData) {
      console.log(
        `Report-Generator: No se encontró sección exacta para '${cicloNorm} - ${turnoNorm}'. Secciones disponibles: ${allData
          .map((s) => `${s.ciclo} - ${s.turno}`)
          .join(", ")}`
      );
    }
  } catch (err) {
    console.error(
      `Report-Generator: Error al LEER/PROCESAR datos para ${fileName}: ${err.message}`
    );
    return null;
  }

  if (!sectionData || sectionData.rows.length === 0) {
    console.log(
      `Report-Generator: No se encontraron datos para ${ciclo} - ${turno} en ${fileName}.`
    );
    return null;
  }

  const { title, headers, rows, turno: sectionTurno } = sectionData;
  const totalHeight =
    TITLE_HEIGHT + HEADER_HEIGHT + rows.length * ROW_HEIGHT + PADDING * 2;

  const canvas = createCanvas(TOTAL_WIDTH, totalHeight);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, TOTAL_WIDTH, totalHeight);

  let currentY = PADDING;

  ctx.fillStyle = styles.title.text;
  ctx.font = styles.title.font;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(title, TOTAL_WIDTH / 2, currentY);
  currentY += TITLE_HEIGHT;

  ctx.font = styles.headerFont;
  let currentX = PADDING;

  const headerStyle = styles.header;
  ctx.fillStyle = headerStyle.bg(sectionTurno);
  ctx.fillRect(PADDING, currentY, TOTAL_WIDTH - PADDING * 2, HEADER_HEIGHT);

  ctx.fillStyle = headerStyle.text;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (let i = 0; i < headers.length; i++) {
    const width = COL_WIDTHS[i];
    ctx.fillText(
      headers[i],
      currentX + width / 2,
      currentY + HEADER_HEIGHT / 2
    );
    currentX += width;
  }
  currentY += HEADER_HEIGHT;

  ctx.font = styles.dataFont;

  for (const row of rows) {
    currentX = PADDING;
    const rowValues = [row.n, row.nombre, row.turno, row.dias, row.hora];
    const statusStyle = styles[row.status] || styles.base;

    for (let i = 0; i < rowValues.length; i++) {
      const width = COL_WIDTHS[i];
      const isStatusCell = i === 4;

      ctx.fillStyle = isStatusCell ? statusStyle.bg : styles.base.bg;
      ctx.fillRect(currentX, currentY, width, ROW_HEIGHT);
      ctx.fillStyle = isStatusCell ? statusStyle.text : styles.base.text;

      if (i === 1) {
        ctx.textAlign = "left";
        ctx.fillText(rowValues[i], currentX + 5, currentY + ROW_HEIGHT / 2);
      } else {
        ctx.textAlign = "center";
        ctx.fillText(
          rowValues[i],
          currentX + width / 2,
          currentY + ROW_HEIGHT / 2
        );
      }

      ctx.strokeStyle = "#DDDDDD";
      ctx.strokeRect(currentX, currentY, width, ROW_HEIGHT);

      currentX += width;
    }
    currentY += ROW_HEIGHT;
  }

  console.log(`Report-Generator: Imagen generada para ${ciclo} - ${turno}.`);
  return canvas.toBuffer("image/png");
}

module.exports = {
  generateReportImage,
};
