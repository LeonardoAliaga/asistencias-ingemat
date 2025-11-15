// src/routes/horarios.route.js
const express = require("express");
const fs = require("fs");
const path = require("path");
const { obtenerHorarios } = require("../utils/helpers"); // Importar para leer

const router = express.Router();
const horariosPath = path.join(__dirname, "../../data/horarios.json");

// GET /api/horarios - Obtener horarios
router.get("/", (req, res) => {
  // obtenerHorarios ya maneja creación/lectura y errores
  const horarios = obtenerHorarios();
  res.json(horarios);
});

// POST /api/horarios - Guardar horarios (MODIFICADO)
router.post("/", (req, res) => {
  const { ciclo, horarios } = req.body; // Nueva estructura: { ciclo: "ANUAL"|"default", horarios: { mañana: {...}, tarde: {...} } }
  const timeRegex = /^[0-2][0-9]:[0-5][0-9]$/; // Regex para HH:MM

  // 1. Validar el payload
  if (
    !ciclo ||
    !horarios ||
    typeof horarios !== "object" ||
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
      req.body
    );
    return res.status(400).json({ mensaje: "Formato de horarios inválido." });
  }

  try {
    // 2. Leer la configuración COMPLETA
    const configCompleta = obtenerHorarios();

    // 3. Modificar la sección correspondiente
    if (ciclo === "default") {
      configCompleta.default = horarios;
      console.log("Horarios Route: Actualizando horarios 'default'.");
    } else {
      // Asegurarse de que el contenedor de ciclos exista
      if (!configCompleta.ciclos) {
        configCompleta.ciclos = {};
      }
      configCompleta.ciclos[ciclo] = horarios;
      console.log(
        `Horarios Route: Actualizando horarios para ciclo '${ciclo}'.`
      );
    }

    // 4. Guardar la configuración COMPLETA
    fs.writeFileSync(horariosPath, JSON.stringify(configCompleta, null, 2));
    res.json({
      mensaje: `Horarios para '${ciclo}' actualizados correctamente`,
    });
  } catch (err) {
    console.error("Horarios Route: Error al guardar horarios:", err);
    res.status(500).json({ mensaje: "Error interno al guardar horarios." });
  }
});

module.exports = router;
