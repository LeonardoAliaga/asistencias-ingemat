const PDFDocument = require("pdfkit"),
  QRCode = require("qrcode");
const { randomUUID } = require("node:crypto");
const db = require("../database/db");
const markers = require("../omr/markers.json");
const { bookletLayouts, duplexSlot, FORMATS } = require("./omr-booklet-layout");
const { AppError } = require("../utils/errors");
async function makeBookletPDF(
  exam,
  { count = 4, form = "A", format = "quarter-duplex", edge = "short" } = {},
  qrPayload,
) {
  if (!Number.isInteger(count) || count < 1 || count > 500)
    throw new AppError("Indica entre 1 y 500 cartillas.");
  if (
    !["quarter-duplex", "half-single"].includes(format) ||
    !["long", "short"].includes(edge)
  )
    throw new AppError("Formato o borde de doble cara inválido.");
  const layouts = bookletLayouts(exam.definition, format),
    spec = FORMATS[format],
    items = Array.from({ length: count }, (_, i) => ({
      id: randomUUID(),
      number: i + 1,
    }));
  const doc = new PDFDocument({
      autoFirstPage: false,
      compress: true,
      info: { Title: `Cartillas de identificación - ${exam.titulo}` },
    }),
    chunks = [];
  const done = new Promise((resolve, reject) => {
    doc.on("data", (b) => chunks.push(b));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  const prefs = doc.ref({
    Duplex:
      spec.sides === 1
        ? "Simplex"
        : edge === "long"
          ? "DuplexFlipLongEdge"
          : "DuplexFlipShortEdge",
    PrintScaling: "None",
  });
  doc._root.data.ViewerPreferences = prefs;
  const perSheet = spec.perSheet;
  const draw = async (item, layout) => {
    const half = format === "half-single";
    const text = (value, x, y, size = 6, width = 250, bold = false) =>
      doc
        .fillColor("black")
        .font(bold ? "Helvetica-Bold" : "Helvetica")
        .fontSize(size)
        .text(value, x, y, { width, height: 20, lineBreak: false });
    for (const m of layout.markers) {
      const cell = m.size / 6;
      for (let r = 0; r < 6; r++)
        for (let c = 0; c < 6; c++)
          if (markers[m.id][r][c])
            doc
              .fillColor("black")
              .rect(
                m.x - m.size / 2 + c * cell,
                m.y - m.size / 2 + r * cell,
                cell,
                cell,
              )
              .fill();
    }
    doc.image(
      require("node:path").join(__dirname, "../../Public/img/logo-examen.png"),
      25,
      20,
      { width: 68, height: 29.5 },
    );
    text(exam.titulo, 105, 24, 8, layout.width - 195, true);
    text(
      `Cartilla ${String(item.number).padStart(3, "0")} | Cara ${layout.page}/${spec.sides} | Versión ${form}`,
      105,
      42,
      6,
      layout.width - 195,
    );
    text(
      `Código de control: ${item.id.slice(-8)}`,
      105,
      54,
      5.5,
      layout.width - 195,
    );
    const matrix = QRCode.create(
      qrPayload(item.id, layout.page, spec.version),
      { errorCorrectionLevel: "M" },
    ).modules;
    const cell = layout.qr.size / (matrix.size + 8);
    doc
      .fillColor("white")
      .rect(layout.qr.x, layout.qr.y, layout.qr.size, layout.qr.size)
      .fill();
    doc.fillColor("black");
    for (let r = 0; r < matrix.size; r++)
      for (let c = 0; c < matrix.size; c++)
        if (matrix.get(r, c))
          doc
            .rect(
              layout.qr.x + (c + 4) * cell,
              layout.qr.y + (r + 4) * cell,
              cell,
              cell,
            )
            .fill();
    const circle = (opt, label) => {
      doc
        .strokeColor("#555555")
        .lineWidth(0.35)
        .circle(opt.x, opt.y, opt.radius)
        .stroke();
      if (label)
        doc
          .fillColor("black")
          .font("Helvetica")
          .fontSize(5.2)
          .text(label, opt.x - 4, opt.y + 1.8, {
            width: 8,
            align: "center",
            baseline: "alphabetic",
            lineBreak: false,
          });
    };
    if (layout.identification) {
      const panelWidth = half ? 170 : 210;
      doc
        .strokeColor("#777777")
        .lineWidth(0.4)
        .rect(22, 77, panelWidth, half ? 312 : 193)
        .stroke();
      const names = half
        ? [
            ["APELLIDOS", 84, [102, 114]],
            ["NOMBRES", 126, [144, 156]],
            ["ÁREA", 169, [185]],
          ]
        : [
            ["APELLIDOS", 84, [101]],
            ["NOMBRES", 112, [129]],
            ["ÁREA", 140, [157]],
          ];
      for (const [label, y, lines] of names) {
        text(label, 27, y, 6, panelWidth - 10, true);
        for (const line of lines)
          doc
            .strokeColor("#777777")
            .moveTo(27, line)
            .lineTo(label === "ÁREA" && !half ? 90 : panelWidth + 16, line)
            .stroke();
      }
      if (half) text("Marca tu área:", 27, 187, 5.5, 150);
      if (layout.identification.areas.length)
        layout.identification.areas.forEach((o) => circle(o, o.option, true));
      else
        text(
          `Perfil: ${exam.definition.areas[0].code}`,
          half ? 27 : 106,
          half ? 196 : 145,
          5.5,
          110,
          true,
        );
      text(
        "CÓDIGO DEL ESTUDIANTE",
        27,
        half ? 207 : 162,
        6,
        panelWidth - 10,
        true,
      );
      for (const column of layout.identification.columns) {
        const x = column.options[0].x;
        doc
          .strokeColor("#555555")
          .rect(x - 6.5, half ? 218 : 174, 13, 12)
          .stroke();
        for (const o of column.options) circle(o, o.option, true);
      }
      if (half) {
        text("Escribe los 8 dígitos en los recuadros.", 27, 360, 6, 156);
        text("Rellena un círculo por cada columna.", 27, 371, 6, 156);
      }
    }
    for (const h of layout.headings) {
      doc
        .fillColor("#eeeeee")
        .rect(h.x - 1, h.y - 1, h.width + 1, h.height - 1)
        .fill();
      doc
        .fillColor("black")
        .font("Helvetica-Bold")
        .fontSize(5.4)
        .text(h.name, h.x + 1, h.y + 1, {
          width: h.width - 3,
          height: h.height - 2,
          lineGap: 0,
        });
    }
    for (const bubble of layout.bubbles) {
      text(
        String(bubble.question),
        bubble.labelX,
        bubble.y - 2.5,
        5.5,
        16,
        true,
      );
      for (const o of bubble.options) circle(o, null);
    }
    // A-E above each response column/section, outside the measurement circles.
    for (const h of layout.headings)
      for (let i = 0; i < 5; i++)
        text(
          "ABCDE"[i],
          h.answerX + i * h.pitch - 1.5,
          h.y + h.height - 5,
          3.5,
          5,
        );
    text(
      `${exam.definition.totalQuestions} preguntas | ${layout.bubbles.length} en esta cara | Cartilla ${String(item.number).padStart(3, "0")}`,
      32,
      layout.height - 19,
      5.5,
      layout.width - 64,
    );
    text(
      "Rellena los círculos. Conserva el QR y los cuatro marcadores. No fotocopiar.",
      32,
      layout.height - 11,
      5,
      layout.width - 64,
    );
  };
  for (let offset = 0; offset < items.length; offset += perSheet) {
    for (let side = 0; side < spec.sides; side++) {
      doc.addPage({ size: [spec.sheetWidth, spec.sheetHeight], margin: 0 });
      for (let local = 0; local < perSheet; local++) {
        const item = items[offset + local];
        if (!item) continue;
        const slot =
          side === 1 && perSheet === 4 ? duplexSlot(local, edge) : local;
        doc.save();
        if (perSheet === 4)
          doc.translate(
            (slot % 2) * spec.width,
            Math.floor(slot / 2) * spec.height,
          );
        else doc.translate(0, slot * spec.height);
        await draw(item, layouts[side]);
        doc.restore();
      }
      doc.save().strokeColor("#aaaaaa").lineWidth(0.3).dash(3, { space: 3 });
      if (perSheet === 4)
        doc.moveTo(spec.width, 0).lineTo(spec.width, spec.sheetHeight);
      doc
        .moveTo(0, spec.height)
        .lineTo(spec.sheetWidth, spec.height)
        .stroke()
        .restore();
    }
  }
  // Register only after rendering succeeds, so a rejected layout leaves no sheets.
  db.transaction(() => {
    for (const item of items)
      db.prepare(
        "INSERT INTO omr_sheets(id,evaluation_id,student_code,area,form,revision,layout_version) VALUES(?,?,'','',?,?,?)",
      ).run(item.id, exam.id, form, exam.revision, spec.version);
  })();
  doc.end();
  return done;
}
module.exports = { makeBookletPDF };
