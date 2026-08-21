const express = require("express");
const db = require("../database/db");
const { getCiclosData, normalizarTexto } = require("../utils/helpers");
const { requireAdmin } = require("../middleware/auth.middleware");

const router = express.Router();

// GET /api/ciclos - Obtener lista de ciclos desde SQLite
router.get("/", (req, res) => {
  try {
    const data = getCiclosData();
    res.json(data);
  } catch (err) {
    console.error("Ciclos Route: Error al obtener datos de ciclos:", err);
    res.status(500).json({ ciclos: ["SEMESTRAL", "ANUAL", "SABATINO", "DOMINGOS"] });
  }
});

// POST /api/ciclos - Agregar ciclo en SQLite
router.post("/", requireAdmin, (req, res) => {
  const { nombre } = req.body;
  if (!nombre || typeof nombre !== "string" || nombre.trim().length === 0) {
    return res.status(400).json({ mensaje: "El nombre del ciclo no puede estar vacío." });
  }

  const nombreMayus = nombre.trim().toUpperCase();

  try {
    const existe = db.prepare("SELECT id FROM ciclos WHERE UPPER(nombre) = ?").get(nombreMayus);
    if (existe) {
      return res.status(409).json({ mensaje: "El ciclo ya existe." });
    }

    db.prepare("INSERT INTO ciclos (nombre) VALUES (?)").run(nombreMayus);
    console.log(`Ciclos Route: Ciclo '${nombreMayus}' agregado a SQLite.`);
    res.status(201).json({ exito: true, mensaje: `Ciclo '${nombreMayus}' agregado.` });
  } catch (err) {
    res.status(500).json({ exito: false, mensaje: err.message });
  }
});

// DELETE /api/ciclos/:ciclo - Eliminar ciclo en SQLite
router.delete("/:ciclo", requireAdmin, (req, res) => {
  const cicloABorrar = String(req.params.ciclo).trim().toUpperCase();

  try {
    const info = db.prepare("DELETE FROM ciclos WHERE UPPER(nombre) = ?").run(cicloABorrar);
    if (info.changes === 0) {
      return res.status(404).json({ mensaje: "Ciclo no encontrado." });
    }

    console.log(`Ciclos Route: Ciclo '${cicloABorrar}' eliminado de SQLite.`);
    res.json({ exito: true, mensaje: `Ciclo '${cicloABorrar}' eliminado.` });
  } catch (err) {
    res.status(500).json({ exito: false, mensaje: err.message });
  }
});

module.exports = router;
