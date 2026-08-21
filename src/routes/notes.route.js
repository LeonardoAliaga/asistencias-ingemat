const express = require("express");
const db = require("../database/db");

const router = express.Router();

function requireAdminMiddleware(req, res, next) {
  if (req.session && req.session.admin) return next();
  return res.status(401).json({ exito: false, mensaje: "No autorizado" });
}

router.use(requireAdminMiddleware);

router.get("/:codigo", (req, res) => {
  const { codigo } = req.params;
  try {
    const row = db.prepare("SELECT valor FROM config_general WHERE clave = ?").get(`note_${codigo}`);
    const notas = row ? row.valor : "";
    res.json({ codigo, notas });
  } catch (e) {
    console.error("Error leyendo notas desde SQLite:", e);
    res.status(500).json({ mensaje: "Error leyendo notas" });
  }
});

router.post("/:codigo", (req, res) => {
  const { codigo } = req.params;
  const { notas } = req.body;
  if (typeof notas !== "string") {
    return res.status(400).json({ mensaje: "Campo 'notas' requerido" });
  }
  try {
    db.prepare("INSERT OR REPLACE INTO config_general (clave, valor) VALUES (?, ?)").run(`note_${codigo}`, notas);
    res.json({ exito: true, mensaje: "Notas guardadas", codigo });
  } catch (e) {
    console.error("Error escribiendo notas en SQLite:", e);
    res.status(500).json({ mensaje: "Error guardando notas" });
  }
});

module.exports = router;
