const express = require("express");
const db = require("../database/db");
const { obtenerHorarios } = require("../utils/helpers");
const { requireAdmin } = require("../middleware/auth.middleware");

const router = express.Router();

// GET /api/horarios - Obtener horarios desde SQLite
router.get("/", (req, res) => {
  const horarios = obtenerHorarios();
  res.json(horarios);
});

// POST /api/horarios - Guardar horarios en SQLite
router.post("/", requireAdmin, (req, res) => {
  const { ciclo, horarios } = req.body;
  const timeRegex = /^[0-2][0-9]:[0-5][0-9]$/;

  if (
    !ciclo ||
    !horarios ||
    typeof horarios !== "object" ||
    !horarios.mañana ||
    !horarios.tarde ||
    !timeRegex.test(horarios.mañana.entrada || "") ||
    !timeRegex.test(horarios.mañana.tolerancia || "") ||
    !timeRegex.test(horarios.tarde.entrada || "") ||
    !timeRegex.test(horarios.tarde.tolerancia || "")
  ) {
    return res.status(400).json({ mensaje: "Formato de horarios inválido." });
  }

  try {
    const cicloKey = String(ciclo).trim().toUpperCase();
    db.prepare(`
      INSERT OR REPLACE INTO horarios (ciclo, manana_entrada, manana_tolerancia, tarde_entrada, tarde_tolerancia)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      cicloKey,
      horarios.mañana.entrada,
      horarios.mañana.tolerancia,
      horarios.tarde.entrada,
      horarios.tarde.tolerancia
    );

    console.log(`Horarios Route: Horarios para '${cicloKey}' actualizados en SQLite.`);
    res.json({ mensaje: `Horarios para '${cicloKey}' actualizados correctamente` });
  } catch (err) {
    console.error("Horarios Route: Error al guardar horarios en SQLite:", err);
    res.status(500).json({ mensaje: "Error interno al guardar horarios." });
  }
});

module.exports = router;
