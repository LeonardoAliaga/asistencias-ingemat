// src/routes/carousel.route.js
const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();
const imgFolderPath = path.join(__dirname, "../../Public/img/ingresantes");
const carouselPrefix = "I"; // Prefijo para imágenes del carrusel

// Helper para asegurar que la carpeta exista
function ensureIngresantesDir() {
  try {
    if (!fs.existsSync(imgFolderPath)) {
      fs.mkdirSync(imgFolderPath, { recursive: true });
      console.log("Carousel Route: Carpeta 'img/ingresantes' creada.");
    }
  } catch (err) {
    console.error(
      "Carousel Route: Error al crear carpeta 'img/ingresantes':",
      err
    );
  }
}
// --- FIN FUNCIÓN AÑADIDA ---

// GET /api/carousel - Listar imágenes del carrusel
router.get("/", (req, res) => {
  ensureIngresantesDir(); // <-- Llamada a la función
  try {
    const allFiles = fs.readdirSync(imgFolderPath);
    const carouselImages = allFiles
      .filter(
        (file) =>
          file.startsWith(carouselPrefix) &&
          (file.endsWith(".png") ||
            file.endsWith(".jpg") ||
            file.endsWith(".jpeg"))
      )
      .sort((a, b) => {
        // Ordenar por timestamp (nombre de archivo)
        const timeA = parseInt(a.substring(1).split(".")[0] || "0");
        const timeB = parseInt(b.substring(1).split(".")[0] || "0");
        return timeA - timeB; // Más antiguas primero
      });

    res.json({ exito: true, images: carouselImages });
  } catch (err) {
    console.error("Error listando imágenes de carrusel:", err);
    res.status(500).json({ exito: false, mensaje: "Error al leer imágenes." });
  }
});

// POST /api/carousel - Subir una nueva imagen (Base64)
router.post("/", (req, res) => {
  const { imageData, imageName } = req.body; // <-- RECIBIR NOMBRE

  if (!imageData || !imageData.startsWith("data:image/")) {
    return res
      .status(400)
      .json({ exito: false, mensaje: "Formato de imagen inválido." });
  }
  // --- VALIDACIÓN DE NOMBRE ---
  if (
    !imageName ||
    typeof imageName !== "string" ||
    imageName.trim().length === 0
  ) {
    return res
      .status(400)
      .json({ exito: false, mensaje: "Se requiere un nombre para la imagen." });
  }

  try {
    const matches = imageData.match(/^data:image\/(.+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      throw new Error("Datos Base64 inválidos.");
    }

    const extension = matches[1].split("+")[0]; // "png" o "jpeg"
    const base64Data = matches[2];

    if (!["png", "jpeg", "jpg"].includes(extension)) {
      return res
        .status(400)
        .json({ exito: false, mensaje: "Solo se permite PNG o JPEG." });
    }

    const sanitizedName = imageName
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_ -]/g, "")
      .replace(/[\s_]+/g, "-")
      .trim()
      .replace(/^-+|-+$/g, "");

    if (!sanitizedName) {
      return res.status(400).json({
        exito: false,
        mensaje: "El nombre del archivo es inválido.",
      });
    }

    const fileName = `${carouselPrefix}${sanitizedName}.${extension}`;
    const filePath = path.join(imgFolderPath, fileName);

    // --- CHEQUEO DE COLISIÓN ---
    if (fs.existsSync(filePath)) {
      return res.status(409).json({
        exito: false,
        mensaje: "Ya existe una imagen con ese nombre. Por favor, elige otro.",
      });
    }
    // --- FIN CHEQUEO ---

    fs.writeFileSync(filePath, base64Data, "base64");

    console.log(`Carousel: Imagen guardada: ${fileName}`);
    res
      .status(201)
      .json({ exito: true, mensaje: "Imagen subida.", fileName: fileName });
  } catch (err) {
    console.error("Error al guardar imagen de carrusel:", err);
    res
      .status(500)
      .json({ exito: false, mensaje: "Error al guardar la imagen." });
  }
});

// DELETE /api/carousel/:filename - Eliminar una imagen
router.delete("/:filename", (req, res) => {
  const filename = req.params.filename;

  // Validación de seguridad
  if (
    !filename.startsWith(carouselPrefix) ||
    filename.includes("..") ||
    filename.includes("/")
  ) {
    return res
      .status(400)
      .json({ exito: false, mensaje: "Nombre de archivo inválido." });
  }

  const filePath = path.join(imgFolderPath, filename);

  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`Carousel: Imagen eliminada: ${filename}`);
      res.json({ exito: true, mensaje: "Imagen eliminada." });
    } else {
      res.status(404).json({ exito: false, mensaje: "Imagen no encontrada." });
    }
  } catch (err) {
    console.error(`Error al eliminar imagen ${filename}:`, err);
    res
      .status(500)
      .json({ exito: false, mensaje: "Error al eliminar la imagen." });
  }
});

module.exports = router;
