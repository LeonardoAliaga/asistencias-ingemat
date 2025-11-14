const express = require("express");
const path = require("path");
const fs = require("fs");

const router = express.Router();

const dataPath = path.join(__dirname, "..", "..", "data", "notes.json");

// Middleware para proteger rutas: solo admin en sesión
function requireAdminMiddleware(req, res, next) {
  if (req.session && req.session.admin) return next();
  // Si la petición es desde API, devolver JSON de error
  return res.status(401).json({ exito: false, mensaje: "No autorizado" });
}

// Aplicar protección a todas las rutas de este router
router.use(requireAdminMiddleware);

function ensureNotesFile() {
  try {
    if (!fs.existsSync(path.dirname(dataPath))) {
      fs.mkdirSync(path.dirname(dataPath), { recursive: true });
    }
    if (!fs.existsSync(dataPath)) {
      fs.writeFileSync(dataPath, JSON.stringify({}, null, 2));
    }
  } catch (e) {
    console.error("Error asegurando notes.json:", e);
  }
}

router.get("/:codigo", (req, res) => {
  const { codigo } = req.params;
  ensureNotesFile();
  try {
    const raw = fs.readFileSync(dataPath, "utf8");
    const all = JSON.parse(raw || "{}");
    const notas = all[codigo] || "";
    res.json({ codigo, notas });
  } catch (e) {
    console.error("Error leyendo notes.json:", e);
    res.status(500).json({ mensaje: "Error leyendo notas" });
  }
});

router.post("/:codigo", (req, res) => {
  const { codigo } = req.params;
  const { notas } = req.body;
  if (typeof notas !== "string") {
    return res.status(400).json({ mensaje: "Campo 'notas' requerido" });
  }
  ensureNotesFile();
  try {
    const raw = fs.readFileSync(dataPath, "utf8");
    const all = JSON.parse(raw || "{}");
    all[codigo] = notas;
    fs.writeFileSync(dataPath, JSON.stringify(all, null, 2));
    res.json({ exito: true, mensaje: "Notas guardadas", codigo });
  } catch (e) {
    console.error("Error escribiendo notes.json:", e);
    res.status(500).json({ mensaje: "Error guardando notas" });
  }
});

module.exports = router;
