// src/routes/horarios.route.js
const express = require("express");
const fs = require("fs");
const path = require("path");
const { obtenerHorarios } = require("../utils/helpers"); // Importar solo lo necesario

const router = express.Router();
const horariosPath = path.join(__dirname, "../../data/horarios.json");

// GET /api/horarios - Obtener horarios
router.get("/", (req, res) => {
  // obtenerHorarios ya maneja creación/lectura y errores
  const horarios = obtenerHorarios();
  res.json(horarios);
});

// POST /api/horarios - Guardar horarios
router.post("/", (req, res) => {
  const horarios = req.body;
  const timeRegex = /^[0-2][0-9]:[0-5][0-9]$/; // Regex para HH:MM

  // Validación robusta
  if (
    !horarios ||
    typeof horarios !== "object" || // Verificar que sea objeto
    !horarios.mañana ||
    typeof horarios.mañana !== "object" ||
    !horarios.tarde ||
    typeof horarios.tarde !== "object" ||
    !horarios.mañana.entrada ||
    !timeRegex.test(horarios.mañana.entrada) ||
    !horarios.mañana.tolerancia ||
    !timeRegex.test(horarios.mañana.tolerancia) ||
    !horarios.tarde.entrada ||
    !timeRegex.test(horarios.tarde.entrada) ||
    !horarios.tarde.tolerancia ||
    !timeRegex.test(horarios.tarde.tolerancia)
  ) {
    console.log(
      "Horarios Route: Intento de guardar horarios con formato inválido.",
      horarios
    );
    return res.status(400).json({ mensaje: "Formato de horarios inválido." });
  }

  try {
    // Asegurar que la carpeta data exista
    const dataDir = path.dirname(horariosPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(horariosPath, JSON.stringify(horarios, null, 2));
    console.log("Horarios Route: Horarios actualizados.", horarios);
    res.json({ mensaje: "Horarios actualizados correctamente" });
  } catch (err) {
    console.error("Horarios Route: Error al guardar horarios:", err);
    res.status(500).json({ mensaje: "Error interno al guardar horarios." });
  }
});

module.exports = router;
