const { AppError } = require("../utils/errors");
const PDFDocument = require("pdfkit");
const metrics = new PDFDocument({ autoFirstPage: false });
metrics.font("Helvetica-Bold").fontSize(5.2);
// Sizes are PDF points. Keep bubbles at a physical size; change the card,
// never scale a crowded card down to make it fit the paper.
const A4 = [595.28, 841.89];
const CANDIDATES = [
  { cols: 2, rows: 3, sheetWidth: A4[0], sheetHeight: A4[1] },
  { cols: 2, rows: 2, sheetWidth: A4[1], sheetHeight: A4[0] },
  { cols: 1, rows: 3, sheetWidth: A4[0], sheetHeight: A4[1] },
  { cols: 1, rows: 2, sheetWidth: A4[0], sheetHeight: A4[1] },
  { cols: 1, rows: 1, sheetWidth: A4[1], sheetHeight: A4[0] },
];
function fit(definition, spec) {
  const width = spec.sheetWidth / spec.cols,
    height = spec.sheetHeight / spec.rows;
  const areaWidth = width - 168,
    areaPitch = Math.max(
      25,
      ...definition.areas.map(
        (a) =>
          Math.ceil(
            metrics.font("Helvetica").fontSize(4.5).widthOfString(a.code),
          ) + 13,
      ),
    ),
    areaCols = Math.max(1, Math.floor(areaWidth / areaPitch)),
    areaRows =
      definition.areas.length > 1
        ? Math.ceil(definition.areas.length / areaCols)
        : 0,
    start = Math.max(164, 127 + areaRows * 18 + 10),
    end = height - 22,
    columns = Math.max(1, Math.floor((width - 42) / 51)),
    columnWidth = (width - 42) / columns;
  metrics.font("Helvetica-Bold").fontSize(5.2);
  const layout = {
    version: 5,
    page: 1,
    format: "auto",
    width,
    height,
    markers: [
      { id: 0, x: 16, y: 16, size: 10 },
      { id: 1, x: width - 16, y: 16, size: 10 },
      { id: 2, x: width - 16, y: height - 16, size: 10 },
      { id: 3, x: 16, y: height - 16, size: 10 },
    ],
    qr: { x: width - 69, y: 23, size: 44 },
    identification: {
      columns: Array.from({ length: 8 }, (_, column) => ({
        column,
        options: Array.from({ length: 10 }, (_, digit) => ({
          option: String(digit),
          x: 28 + column * 14.5,
          y: 86 + digit * 7.8,
          radius: 3,
          sample: "ring",
        })),
      })),
      areas:
        definition.areas.length === 1
          ? []
          : definition.areas.map((a, i) => ({
              option: a.code,
              x: 154 + (i % areaCols) * areaPitch,
              y: 132 + Math.floor(i / areaCols) * 18,
              radius: 3,
              labelWidth: areaPitch - 10,
            })),
      defaultArea:
        definition.areas.length === 1 ? definition.areas[0].code : null,
    },
    bubbles: [],
    headings: [],
  };
  let col = 0,
    y = start;
  for (const section of definition.sections) {
    const remaining = [...section.questions];
    let continued = false;
    while (remaining.length) {
      const title = section.name + (continued ? " (cont.)" : ""),
        header =
          Math.ceil(
            metrics.heightOfString(title, {
              width: columnWidth - 5,
              lineGap: 0,
            }),
          ) + 6;
      let capacity = Math.floor((end - y - header) / 8);
      if (capacity < 1) {
        if (++col >= columns) return null;
        y = start;
        capacity = Math.floor((end - y - header) / 8);
        if (capacity < 1) return null;
      }
      const x = 22 + col * columnWidth;
      layout.headings.push({
        name: title,
        x,
        y,
        width: columnWidth - 3,
        height: header,
        answerX: x + 12,
        pitch: 7.5,
      });
      y += header;
      for (const question of remaining.splice(0, capacity)) {
        layout.bubbles.push({
          question,
          labelX: x,
          y: y + 4,
          options: [..."ABCDE"].map((option, i) => ({
            option,
            x: x + 12 + i * 7.5,
            y: y + 4,
            radius: 3,
          })),
        });
        y += 8;
      }
      if (remaining.length) {
        continued = true;
        if (++col >= columns) return null;
        y = start;
      }
    }
  }
  return {
    ...spec,
    width,
    height,
    perSheet: spec.cols * spec.rows,
    sides: 1,
    version: 5,
    format: "auto",
    pages: [layout],
  };
}
function adaptiveLayout(definition) {
  if (
    !definition ||
    !Number.isInteger(definition.totalQuestions) ||
    definition.totalQuestions < 1 ||
    definition.totalQuestions > 200
  )
    throw new AppError("El examen debe tener entre 1 y 200 preguntas.");
  for (const spec of CANDIDATES) {
    const result = fit(definition, spec);
    if (result) return result;
  }
  throw new AppError(
    "Los encabezados de cursos no caben. Acorta sus nombres antes de imprimir.",
  );
}
module.exports = { adaptiveLayout };
