const { AppError } = require("../utils/errors");
const FORMATS = {
  "quarter-duplex": {
    version: 3,
    width: 841.89 / 2,
    height: 595.28 / 2,
    sheetWidth: 841.89,
    sheetHeight: 595.28,
    perSheet: 4,
    sides: 2,
  },
  "half-single": {
    version: 4,
    width: 595.28,
    height: 841.89 / 2,
    sheetWidth: 595.28,
    sheetHeight: 841.89,
    perSheet: 2,
    sides: 1,
  },
};
function bookletLayouts(definition, format = "quarter-duplex") {
  const spec = FORMATS[format];
  if (!spec) throw new AppError("Formato de cartilla desconocido.");
  if (definition.totalQuestions > 120)
    throw new AppError(
      "Estos formatos admiten hasta 120 preguntas. Usa el formato anterior para un cuadernillo mayor.",
    );
  if (
    definition.areas.length > 5 ||
    (definition.areas.length > 1 &&
      definition.areas.some((a) => a.code.length !== 1))
  )
    throw new AppError(
      "Estos formatos admiten hasta cinco áreas de una letra o dígito.",
    );
  const half = format === "half-single",
    W = spec.width,
    H = spec.height;
  const pages = Array.from({ length: spec.sides }, (_, i) => ({
    version: spec.version,
    page: i + 1,
    width: W,
    height: H,
    format,
    markers: [
      { id: 0, x: 20, y: 20, size: 10 },
      { id: 1, x: W - 20, y: 20, size: 10 },
      { id: 2, x: W - 20, y: H - 20, size: 10 },
      { id: 3, x: 20, y: H - 20, size: 10 },
    ],
    qr: { x: W - 80, y: 22, size: 48 },
    bubbles: [],
    headings: [],
  }));
  pages[0].identification = {
    columns: Array.from({ length: 8 }, (_, column) => ({
      column,
      options: Array.from({ length: 10 }, (_, digit) => ({
        option: String(digit),
        x: (half ? 39 : 48) + column * (half ? 18.5 : 20.5),
        y: (half ? 244 : 190) + digit * (half ? 11.2 : 8.2),
        radius: half ? 4.1 : 3.4,
        sample: "ring",
      })),
    })),
    areas:
      definition.areas.length === 1
        ? []
        : definition.areas.map((a, i) => ({
            option: a.code,
            x: (half ? 33 : 113) + i * (half ? 28 : 21),
            y: half ? 197 : 148,
            radius: 3.7,
            sample: "ring",
          })),
    defaultArea:
      definition.areas.length === 1 ? definition.areas[0].code : null,
  };
  let side = 0,
    col = 0,
    y = 80;
  const geometry = () =>
    half
      ? {
          cols: 5,
          x: 207,
          width: 73.2,
          end: 393,
          row: 9,
          radius: 3.2,
          pitch: 10.2,
        }
      : side === 0
        ? {
            cols: 3,
            x: 244,
            width: 51.7,
            end: 272,
            row: 8.5,
            radius: 3,
            pitch: 7.5,
          }
        : {
            cols: 5,
            x: 22,
            width: 75.4,
            end: 272,
            row: 9,
            radius: 3.2,
            pitch: 10.2,
          };
  const nextColumn = () => {
    col++;
    if (col === geometry().cols) {
      side++;
      col = 0;
    }
    if (side >= pages.length)
      throw new AppError(
        "Los cursos no caben con estos nombres y cantidades. Acorta los nombres o usa el formato anterior.",
      );
    y = 80;
  };
  for (const section of definition.sections) {
    let remaining = [...section.questions],
      continued = false;
    while (remaining.length) {
      const g = geometry(),
        title = section.name + (continued ? " (cont.)" : ""),
        header = Math.ceil(title.length / (g.width < 60 ? 18 : 26)) * 6 + 8;
      const needed = header + remaining.length * g.row;
      const capacity = Math.floor((g.end - y - header) / g.row);
      if (
        capacity < 1 ||
        (capacity < 3 && remaining.length > capacity && y !== 80)
      ) {
        nextColumn();
        continue;
      }
      const x = g.x + col * g.width;
      pages[side].headings.push({
        name: title,
        x,
        y,
        width: g.width - 3,
        height: header,
        pitch: g.pitch,
        answerX: x + (g.width < 60 ? 12 : 18),
      });
      y += header;
      const take =
        remaining.length > capacity &&
        remaining.length - capacity < 3 &&
        capacity > 3
          ? remaining.length - 3
          : capacity;
      for (const question of remaining.splice(0, take)) {
        pages[side].bubbles.push({
          question,
          labelX: x,
          y: y + 4,
          options: ["A", "B", "C", "D", "E"].map((option, i) => ({
            option,
            x: x + (g.width < 60 ? 12 : 18) + i * g.pitch,
            y: y + 4,
            radius: g.radius,
          })),
        });
        y += g.row;
      }
      if (remaining.length) {
        continued = true;
        nextColumn();
      }
    }
  }
  return pages;
}
// A4 landscape: long-edge binding mirrors rows; short-edge binding mirrors columns.
function duplexSlot(index, edge = "short") {
  const col = index % 2,
    row = Math.floor(index / 2);
  return edge === "short" ? row * 2 + (1 - col) : (1 - row) * 2 + col;
}
module.exports = { bookletLayouts, duplexSlot, FORMATS };
