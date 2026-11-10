const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const PDFDocument = require("pdfkit");
const { createCanvas, loadImage } = require("@napi-rs/canvas");
const config = require("../config");
const {
  inspectMedia,
  resolveAttachment,
  readAttachment,
} = require("../whatsapp/media.cjs");
const { AppError } = require("../utils/errors");
const directory = path.join(config.dataDir, "whatsapp", "reports");
async function convertPNG(buffer, format, breaks = []) {
  try {
    inspectMedia(buffer, "png");
  } catch (e) {
    throw new AppError(e.message);
  }
  if (!["png", "pdf"].includes(format))
    throw new AppError("Selecciona imagen o PDF.");
  let image;
  try {
    image = await loadImage(buffer);
  } catch {
    throw new AppError(
      "No se pudo leer la imagen del reporte. Genera el reporte nuevamente.",
    );
  }
  if (format === "png") return buffer;
  const width = image.width,
    height = image.height;
  const candidates = [...new Set(breaks)]
    .filter((y) => Number.isInteger(y) && y > 0 && y <= height)
    .sort((a, b) => a - b);
  const doc = new PDFDocument({
    size: "A4",
    margin: 32,
    autoFirstPage: false,
    info: { Title: "Reporte INGEMAT", Author: "Academia INGEMAT" },
  });
  const chunks = [];
  const result = new Promise((resolve, reject) => {
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  const scale = (595.28 - 64) / width,
    maxHeight = Math.floor((841.89 - 88) / scale);
  let y = 0,
    page = 0;
  while (y < height) {
    const limit = Math.min(height, y + maxHeight);
    let end =
      limit === height
        ? height
        : candidates.filter((v) => v > y + 100 && v <= limit).at(-1);
    // Images without explicit row breaks use low-ink horizontal bands near the page bottom.
    if (!end) {
      const probe = createCanvas(width, Math.min(100, limit - y));
      const ctx = probe.getContext("2d");
      const start = limit - probe.height;
      ctx.drawImage(
        image,
        0,
        start,
        width,
        probe.height,
        0,
        0,
        width,
        probe.height,
      );
      const pixels = ctx.getImageData(0, 0, width, probe.height).data;
      let best = Infinity;
      for (let row = 0; row < probe.height; row++) {
        let ink = 0;
        for (let x = 0; x < width; x++) {
          const i = (row * width + x) * 4;
          if (Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) < 180) ink++;
        }
        if (ink <= best) {
          best = ink;
          end = start + row + 1;
        }
      }
    }
    if (!end || end <= y) end = limit;
    const slice = createCanvas(width, end - y);
    slice
      .getContext("2d")
      .drawImage(image, 0, y, width, end - y, 0, 0, width, end - y);
    doc.addPage();
    doc.image(slice.toBuffer("image/png"), 32, 32, {
      width: width * scale,
      height: (end - y) * scale,
    });
    doc
      .fontSize(9)
      .fillColor("#64748b")
      .text(`INGEMAT | Página ${++page}`, 32, 796, {
        width: 531,
        align: "right",
        lineBreak: false,
      });
    y = end;
  }
  doc.end();
  const pdf = await result;
  inspectMedia(pdf, "pdf");
  return pdf;
}
function save(buffer, format, name) {
  inspectMedia(buffer, format);
  const attachment = {
    id: crypto.randomUUID(),
    format,
    fileName:
      name.replace(/[^A-Za-z0-9_. -]/g, "_").slice(0, 100) + "." + format,
  };
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.writeFileSync(resolveAttachment(directory, attachment), buffer, {
    flag: "wx",
    mode: 0o600,
  });
  return attachment;
}
function remove(attachment) {
  try {
    fs.unlinkSync(resolveAttachment(directory, attachment));
  } catch {}
}
function read(attachment) {
  return readAttachment(directory, attachment);
}
module.exports = { directory, convertPNG, save, remove, read };
