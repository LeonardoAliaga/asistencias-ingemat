const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");
const { randomUUID, createHash } = require("node:crypto");
const path = require("node:path");
const db = require("../database/db");
const markers = require("../omr/markers.json");
const { adaptiveLayout } = require("./omr-adaptive-layout");
const { AppError } = require("../utils/errors");
async function makeAdaptivePDF(
  exam,
  { count = 6, form = "A" } = {},
  qrPayload,
) {
  if (!Number.isInteger(count) || count < 1 || count > 500)
    throw new AppError("Indica entre 1 y 500 cartillas.");
  const spec = adaptiveLayout(exam.definition),
    layout = spec.pages[0],
    definition = JSON.stringify(spec.pages),
    layoutId = createHash("sha256").update(definition).digest("hex"),
    items = Array.from({ length: count }, (_, i) => ({
      id: randomUUID(),
      number: i + 1,
    }));
  const doc = new PDFDocument({
      autoFirstPage: false,
      info: { Title: `Cartillas - ${exam.titulo}` },
    }),
    chunks = [];
  const done = new Promise((resolve, reject) => {
    doc.on("data", (b) => chunks.push(b));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  const prefs = doc.ref({ Duplex: "Simplex", PrintScaling: "None" });
  doc._root.data.ViewerPreferences = prefs;
  const text = (
    value,
    x,
    y,
    size = 5,
    width = 100,
    bold = false,
    height = 12,
  ) =>
    doc
      .fillColor("black")
      .font(bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(size)
      .text(String(value), x, y, { width, height, lineBreak: false });
  const circle = (opt, label) => {
    doc
      .strokeColor("#555555")
      .lineWidth(0.35)
      .circle(opt.x, opt.y, opt.radius)
      .stroke();
    if (label !== undefined)
      doc
        .fillColor("black")
        .font("Helvetica")
        .fontSize(4.4)
        .text(label, opt.x - 4, opt.y - 1.6, {
          width: 8,
          height: 6,
          align: "center",
          lineBreak: false,
        });
  };
  function draw(item) {
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
      path.join(__dirname, "../../Public/img/logo-examen.png"),
      22,
      24,
      { width: 48, height: 21 },
    );
    text(exam.titulo, 78, 22, 7, layout.width - 152, true, 18);
    text(
      `${exam.definition.totalQuestions} preguntas | Versión ${form}`,
      78,
      42,
      5,
      layout.width - 152,
    );
    text(
      `Cartilla ${item.number} | Control ${item.id.slice(-8)}`,
      78,
      51,
      4.5,
      layout.width - 152,
    );
    const matrix = QRCode.create(qrPayload(item.id, 1, 5), {
        errorCorrectionLevel: "M",
      }).modules,
      cell = layout.qr.size / (matrix.size + 8);
    doc
      .fillColor("white")
      .rect(layout.qr.x, layout.qr.y, layout.qr.size, layout.qr.size)
      .fill();
    for (let r = 0; r < matrix.size; r++)
      for (let c = 0; c < matrix.size; c++)
        if (matrix.get(r, c))
          doc
            .fillColor("black")
            .rect(
              layout.qr.x + (c + 4) * cell,
              layout.qr.y + (r + 4) * cell,
              cell,
              cell,
            )
            .fill();
    text("CÓDIGO DEL ESTUDIANTE (8 dígitos)", 22, 60, 5, 124, true);
    for (const column of layout.identification.columns) {
      const x = column.options[0].x;
      doc
        .strokeColor("#555555")
        .lineWidth(0.35)
        .rect(x - 5.5, 70, 11, 10)
        .stroke();
      for (const opt of column.options) circle(opt, opt.option);
    }
    for (const [label, y] of [
      ["APELLIDOS", 75],
      ["NOMBRES", 97],
    ]) {
      text(label, 147, y, 5, layout.width - 176, true);
      doc
        .strokeColor("#777777")
        .moveTo(147, y + 15)
        .lineTo(layout.width - 23, y + 15)
        .stroke();
    }
    text("ÁREA", 147, 119, 5, layout.width - 176, true);
    if (layout.identification.areas.length)
      for (const opt of layout.identification.areas) {
        circle(opt);
        text(opt.option, opt.x + 5, opt.y - 2, 4.5, opt.labelWidth);
      }
    else text(exam.definition.areas[0].name, 147, 130, 5, layout.width - 176);
    for (const h of layout.headings) {
      doc
        .fillColor("#eeeeee")
        .rect(h.x - 1, h.y - 1, h.width, h.height)
        .fill();
      doc
        .fillColor("black")
        .font("Helvetica-Bold")
        .fontSize(5.2)
        .text(h.name, h.x, h.y, {
          width: h.width - 2,
          height: h.height - 6,
          lineGap: 0,
        });
      for (let i = 0; i < 5; i++)
        text(
          "ABCDE"[i],
          h.answerX + i * h.pitch - 1.5,
          h.y + h.height - 5,
          3.5,
          5,
          false,
          6,
        );
    }
    for (const bubble of layout.bubbles) {
      text(bubble.question, bubble.labelX, bubble.y - 2, 4.5, 11, true, 7);
      for (const opt of bubble.options) circle(opt);
    }
    text(
      "Rellena los círculos. Conserva el QR y los cuatro marcadores. No fotocopiar.",
      28,
      layout.height - 16,
      4.2,
      layout.width - 56,
      false,
      8,
    );
  }
  for (let offset = 0; offset < items.length; offset += spec.perSheet) {
    doc.addPage({ size: [spec.sheetWidth, spec.sheetHeight], margin: 0 });
    for (let i = 0; i < spec.perSheet && items[offset + i]; i++) {
      doc
        .save()
        .translate(
          (i % spec.cols) * spec.width,
          Math.floor(i / spec.cols) * spec.height,
        );
      draw(items[offset + i]);
      doc.restore();
    }
    doc.save().strokeColor("#aaaaaa").lineWidth(0.3).dash(3, { space: 3 });
    for (let col = 1; col < spec.cols; col++)
      doc
        .moveTo(col * spec.width, 0)
        .lineTo(col * spec.width, spec.sheetHeight);
    for (let row = 1; row < spec.rows; row++)
      doc
        .moveTo(0, row * spec.height)
        .lineTo(spec.sheetWidth, row * spec.height);
    doc.stroke().restore();
  }
  doc.end();
  const bytes = await done;
  db.transaction(() => {
    db.prepare(
      "INSERT OR IGNORE INTO omr_layouts(id,definition) VALUES(?,?)",
    ).run(layoutId, definition);
    const insert = db.prepare(
      "INSERT INTO omr_sheets(id,evaluation_id,student_code,area,form,revision,layout_version,layout_id) VALUES(?,?,'','',?,?,5,?)",
    );
    for (const item of items)
      insert.run(item.id, exam.id, form, exam.revision, layoutId);
  })();
  return bytes;
}
module.exports = { makeAdaptivePDF };
