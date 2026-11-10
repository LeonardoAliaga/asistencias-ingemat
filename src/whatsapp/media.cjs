const fs = require("node:fs");
const path = require("node:path");
const MAX_BYTES = 10 * 1024 * 1024;
const GROUP_ID = /^\d{5,22}(?:-\d{5,22})?@g\.us$/;
const isPhone = (value) =>
  typeof value === "string" && /^\+[1-9]\d{7,14}$/.test(value);
function inspectMedia(buffer, format) {
  if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > MAX_BYTES)
    throw new Error("El archivo está vacío o supera los 10 MB.");
  if (format === "png") {
    if (
      buffer.length < 24 ||
      !buffer.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))
    )
      throw new Error("El reporte no es una imagen PNG válida.");
    const width = buffer.readUInt32BE(16),
      height = buffer.readUInt32BE(20);
    if (
      !width ||
      !height ||
      width > 2400 ||
      height > 24000 ||
      width * height > 30000000
    )
      throw new Error(
        "El reporte es demasiado grande. Elige una semana o periodo más corto.",
      );
  } else if (format === "pdf") {
    if (buffer.subarray(0, 5).toString() !== "%PDF-")
      throw new Error("El reporte no es un PDF válido.");
  } else throw new Error("Selecciona imagen o PDF.");
}
function resolveAttachment(directory, attachment) {
  if (
    !attachment ||
    !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(attachment.id) ||
    !["png", "pdf"].includes(attachment.format)
  )
    throw new Error("Adjunto inválido.");
  if (
    typeof attachment.fileName !== "string" ||
    !/^[A-Za-z0-9_-][A-Za-z0-9_. -]{0,110}$/.test(attachment.fileName) ||
    !attachment.fileName.endsWith("." + attachment.format)
  )
    throw new Error("Nombre de archivo inválido.");
  return path.join(directory, `${attachment.id}.${attachment.format}`);
}
function readAttachment(directory, attachment) {
  const filename = resolveAttachment(directory, attachment);
  const stat = fs.lstatSync(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BYTES)
    throw new Error("Adjunto no disponible.");
  const buffer = fs.readFileSync(filename);
  inspectMedia(buffer, attachment.format);
  return buffer;
}
function mediaContent(directory, attachment, caption) {
  const buffer = readAttachment(directory, attachment);
  return attachment.format === "png"
    ? { image: buffer, mimetype: "image/png", caption }
    : {
        document: buffer,
        mimetype: "application/pdf",
        fileName: attachment.fileName,
        caption,
      };
}
module.exports = {
  MAX_BYTES,
  GROUP_ID,
  isPhone,
  inspectMedia,
  resolveAttachment,
  readAttachment,
  mediaContent,
};
