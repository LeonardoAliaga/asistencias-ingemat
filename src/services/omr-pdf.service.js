const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");
const { randomUUID, createHmac } = require("node:crypto");
const db = require("../database/db");
const { sessionSecret } = require("../config");
const { layouts } = require("./omr-layout");
const markers = require("../omr/markers.json");
const { AppError } = require("../utils/errors");
function qrPayload(id, page, version = 2) {
  const body = `v${version}:${id}:${page}`;
  return `${body}:${createHmac("sha256", sessionSecret).update(body).digest("hex").slice(0, 24)}`;
}
function resolveQR(value) {
  const match = String(value).match(
    /^v([234]):([a-f0-9-]{36}):(\d+):([a-f0-9]{24})$/,
  );
  if (
    !match ||
    qrPayload(match[2], Number(match[3]), Number(match[1])) !== value
  )
    throw new AppError("El identificador de la cartilla no es válido.");
  const sheet = db.prepare("SELECT * FROM omr_sheets WHERE id=?").get(match[2]);
  if (!sheet)
    throw new AppError("La cartilla no está registrada en esta academia.");
  if (sheet.layout_version !== Number(match[1]))
    throw new AppError("Versión de cartilla incompatible.");
  return { ...sheet, page: Number(match[3]) };
}
async function makePDF(
  exam,
  students,
  { form = "A", mode = "personalized", ...options } = {},
) {
  if (!exam.definition || !["listo", "publicado"].includes(exam.estado))
    throw new AppError("Valida el examen antes de imprimir sus cartillas.");
  if (!exam.definition.forms[form]) throw new AppError("Versión desconocida.");
  if (mode === "blank")
    return require("./omr-booklet-pdf").makeBookletPDF(
      exam,
      { form, ...options },
      qrPayload,
    );
  if (mode !== "personalized")
    throw new AppError("Modo de cartilla desconocido.");
  if (!students.length || students.length > 500)
    throw new AppError("Selecciona entre 1 y 500 estudiantes.");
  const prepared = students.map((u) => {
    const area =
      exam.definition.areas.length === 1
        ? exam.definition.areas[0].code
        : u.area;
    if (!exam.definition.areas.some((a) => a.code === area))
      throw new AppError(
        `El estudiante ${u.codigo} necesita un área válida antes de imprimir.`,
      );
    return { u, area, id: randomUUID() };
  });
  const doc = new PDFDocument({
      autoFirstPage: false,
      compress: true,
      info: { Title: `Cartillas - ${exam.titulo}` },
    }),
    chunks = [];
  const done = new Promise((resolve, reject) => {
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  const pages = layouts(exam.definition.totalQuestions);
  for (const { u, area, id } of prepared) {
    db.prepare(
      "INSERT INTO omr_sheets(id,evaluation_id,student_code,area,form,revision) VALUES(?,?,?,?,?,?)",
    ).run(id, exam.id, u.codigo, area, form, exam.revision);
    for (const layout of pages) {
      doc.addPage({ size: [layout.width, layout.height], margin: 0 });
      for (const marker of layout.markers) {
        const cell = marker.size / 6;
        doc.fillColor("black");
        for (let r = 0; r < 6; r++)
          for (let c = 0; c < 6; c++)
            if (markers[marker.id][r][c])
              doc
                .rect(
                  marker.x - marker.size / 2 + c * cell,
                  marker.y - marker.size / 2 + r * cell,
                  cell,
                  cell,
                )
                .fill();
      }
      doc
        .fillColor("#0A2240")
        .font("Helvetica-Bold")
        .fontSize(18)
        .text("INGEMAT", 65, 28, { lineBreak: false });
      doc.fontSize(12).text(exam.titulo, 65, 52, { width: 570, height: 28 });
      doc
        .fillColor("black")
        .fontSize(11)
        .text(`${u.apellido} ${u.nombre}`, 65, 78, { width: 570, height: 15 });
      doc
        .font("Helvetica")
        .fontSize(9)
        .text(
          `Código: ${u.codigo}   Ciclo: ${exam.ciclo}   Área: ${area}   Versión: ${form}   Revisión: ${exam.revision}`,
          65,
          96,
          { width: 610 },
        );
      doc
        .fontSize(8)
        .text(
          "Rellena una burbuja por pregunta. Borra por completo. No marques los cuadrados de las esquinas.",
          65,
          113,
          { width: 610 },
        );
      doc.image(
        await QRCode.toBuffer(qrPayload(id, layout.page), {
          width: 320,
          margin: 4,
          errorCorrectionLevel: "M",
        }),
        {
          x: layout.qr.x,
          y: layout.qr.y,
          width: layout.qr.size,
          height: layout.qr.size,
        },
      );
      for (const bubble of layout.bubbles) {
        doc
          .fillColor("black")
          .font("Helvetica-Bold")
          .fontSize(8)
          .text(String(bubble.question), bubble.labelX - 12, bubble.y - 3, {
            width: 18,
            align: "right",
            lineBreak: false,
          });
        for (const opt of bubble.options) {
          doc
            .strokeColor("#555555")
            .lineWidth(0.5)
            .circle(opt.x, opt.y, opt.radius)
            .stroke();
          if ((bubble.question - layout.bubbles[0].question) % 25 === 0)
            doc
              .font("Helvetica")
              .fontSize(7)
              .text(opt.option, opt.x - 3, opt.y - 15, {
                width: 6,
                align: "center",
                lineBreak: false,
              });
        }
      }
      doc
        .fillColor("#444444")
        .fontSize(8)
        .text(
          `Cuadernillo: ${exam.definition.totalQuestions} preguntas | Evalúa: ${exam.definition.areas.find((a) => a.code === area).requiredQuestions} | Página ${layout.page}/${pages.length} | Imprimir al 100% en A4 horizontal`,
          65,
          545,
          { lineBreak: false },
        );
    }
  }
  doc.end();
  return done;
}
module.exports = { makePDF, resolveQR, qrPayload };
