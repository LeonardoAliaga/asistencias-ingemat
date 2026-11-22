const PDFDocument = require("pdfkit");
const path = require("node:path");
const { normalizeDefinition } = require("./grading.service");
const { AppError } = require("../utils/errors");

const logo = path.join(__dirname, "../../Public/img/logo-examen.png");
const columns = 4;
const questionsPerPage = columns * 34;

function makeAnswerKeyPDF(exam) {
  if (!exam.definition || !["listo", "publicado"].includes(exam.estado))
    throw new AppError("Valida el examen antes de descargar sus claves.", 409);

  const { forms, keys, totalQuestions } = normalizeDefinition(exam.definition);
  const pages = [];
  for (const [form, questions] of Object.entries(forms)) {
    for (let start = 0; start < questions.length; start += questionsPerPage)
      pages.push({
        form,
        start,
        questions: questions.slice(start, start + questionsPerPage),
      });
  }

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 0,
      autoFirstPage: false,
      info: {
        Title: `Claves de respuestas · ${exam.titulo}`,
        Author: "Academia INGEMAT",
      },
    });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const margin = 40;
    const date = exam.fecha.split("-").reverse().join("/");
    const accent = "#B72107";
    const ink = "#12233E";
    const muted = "#46566B";
    for (const [index, { form, start, questions }] of pages.entries()) {
      doc.addPage();
      const width = doc.page.width - 2 * margin;
      doc.image(logo, margin, 33, { fit: [113, 46] });
      doc
        .fillColor(ink)
        .font("Helvetica-Bold")
        .fontSize(23)
        .text("Claves de respuestas", margin + 135, 44, { lineBreak: false });
      doc.rect(margin, 84, width, 2).fill(accent);
      doc
        .fillColor(ink)
        .fontSize(14)
        .text(exam.titulo, margin, 94, { width, height: 45, ellipsis: true });
      doc
        .fillColor(muted)
        .font("Helvetica")
        .fontSize(10)
        .text(
          `Versión ${form}   ·   ${totalQuestions} preguntas   ·   ${date}   ·   Revisión ${exam.revision}`,
          margin,
          145,
          { lineBreak: false },
        );

      const gap = 10;
      const columnWidth = (width - (columns - 1) * gap) / columns;
      const rows = Math.ceil(questions.length / columns);
      const rowHeight = 18;
      const top = 168;
      for (let i = 0; i < questions.length; i += rows) {
        const x = margin + (i / rows) * (columnWidth + gap);
        doc.rect(x, top, columnWidth, 20).fill(ink);
        doc
          .fillColor("#FFFFFF")
          .font("Helvetica-Bold")
          .fontSize(9)
          .text("N.º", x + 9, top + 6, { lineBreak: false })
          .text("Clave", x + 38, top + 6, { lineBreak: false });

        for (const [offset, question] of questions
          .slice(i, i + rows)
          .entries()) {
          const y = top + 20 + offset * rowHeight;
          const key = keys[question];
          const answer = key.voidPolicy ? "Anulada" : key.answers.join(" / ");
          doc
            .rect(x, y, columnWidth, rowHeight)
            .fill(offset % 2 === 0 ? "#F0F3F8" : "#FAFBFD");
          doc
            .fillColor(muted)
            .font("Helvetica")
            .fontSize(10)
            .text(String(start + i + offset + 1), x + 9, y + 4, {
              lineBreak: false,
            });
          doc
            .fillColor(key.voidPolicy ? muted : ink)
            .font("Helvetica-Bold")
            .text(answer, x + 38, y + 4, { lineBreak: false });
        }
      }
      doc
        .fillColor(muted)
        .font("Helvetica")
        .fontSize(8)
        .text(`Página ${index + 1} de ${pages.length}`, margin, 815, {
          width,
          align: "right",
          lineBreak: false,
        });
    }
    doc.end();
  });
}

module.exports = { makeAnswerKeyPDF };
