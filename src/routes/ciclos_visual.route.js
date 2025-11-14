const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();

const dataPath = path.join(__dirname, "../../data/ciclos_visual.json");

function readData() {
  try {
    if (!fs.existsSync(dataPath)) return { ciclos: [] };
    return JSON.parse(fs.readFileSync(dataPath, "utf8"));
  } catch (err) {
    console.error("Error leyendo ciclos_visual.json", err);
    return { ciclos: [] };
  }
}

function writeData(obj) {
  try {
    fs.writeFileSync(dataPath, JSON.stringify(obj, null, 2), "utf8");
    return true;
  } catch (err) {
    console.error("Error escribiendo ciclos_visual.json", err);
    return false;
  }
}

// Public: lista de ciclos publicados
router.get("/", (req, res) => {
  const data = readData();
  // si no es admin, filtrar solo publicados
  if (!req.session || !req.session.admin) {
    return res.json({
      exito: true,
      ciclos: data.ciclos.filter((c) => c.published),
    });
  }
  res.json({ exito: true, ciclos: data.ciclos });
});

// Get por slug
router.get("/:slug", (req, res) => {
  const data = readData();
  const c = data.ciclos.find((x) => x.slug === req.params.slug);
  if (!c)
    return res.status(404).json({ exito: false, mensaje: "No encontrado" });
  res.json({ exito: true, ciclo: c });
});

// Middleware admin required for mutating ops
function requireAdmin(req, res, next) {
  if (req.session && req.session.admin) return next();
  return res.status(401).json({ exito: false, mensaje: "No autorizado" });
}

// Create
router.post("/", requireAdmin, (req, res) => {
  const { titulo, slug, descripcion, beneficios, orden, published, price } =
    req.body;
  if (!titulo || !slug)
    return res.status(400).json({ exito: false, mensaje: "Faltan campos" });
  const data = readData();
  if (data.ciclos.find((x) => x.slug === slug))
    return res.status(400).json({ exito: false, mensaje: "Slug ya existe" });
  const now = new Date().toISOString();
  const ciclo = {
    slug,
    orden: orden || data.ciclos.length + 1,
    titulo,
    descripcion: descripcion || "",
    beneficios: Array.isArray(beneficios)
      ? beneficios
      : beneficios
      ? beneficios
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean)
      : [],
    priceHistory: price ? [{ price: Number(price), from: now, to: null }] : [],
    published: !!published,
    updatedAt: now,
  };
  data.ciclos.push(ciclo);
  writeData(data);
  res.json({ exito: true, ciclo });
});

// Update
router.put("/:slug", requireAdmin, (req, res) => {
  const slug = req.params.slug;
  const data = readData();
  const idx = data.ciclos.findIndex((x) => x.slug === slug);
  if (idx === -1)
    return res.status(404).json({ exito: false, mensaje: "No encontrado" });
  const ciclo = data.ciclos[idx];
  const { titulo, descripcion, beneficios, orden, published, price, newSlug } =
    req.body;
  if (titulo !== undefined) ciclo.titulo = titulo;
  if (descripcion !== undefined) ciclo.descripcion = descripcion;
  if (beneficios !== undefined)
    ciclo.beneficios = Array.isArray(beneficios)
      ? beneficios
      : beneficios
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean);
  if (orden !== undefined) ciclo.orden = orden;
  if (published !== undefined) ciclo.published = !!published;
  // price handling: if price provided and differs, close previous and add new
  if (price !== undefined) {
    const p = Number(price);
    const current = (ciclo.priceHistory || []).find((x) => x.to === null);
    const now = new Date().toISOString();
    if (!current || current.price !== p) {
      if (current) current.to = now;
      ciclo.priceHistory = ciclo.priceHistory || [];
      ciclo.priceHistory.push({ price: p, from: now, to: null });
    }
  }
  if (newSlug) ciclo.slug = newSlug;
  ciclo.updatedAt = new Date().toISOString();
  data.ciclos[idx] = ciclo;
  writeData(data);
  res.json({ exito: true, ciclo });
});

// Delete
router.delete("/:slug", requireAdmin, (req, res) => {
  const slug = req.params.slug;
  const data = readData();
  const idx = data.ciclos.findIndex((x) => x.slug === slug);
  if (idx === -1)
    return res.status(404).json({ exito: false, mensaje: "No encontrado" });
  data.ciclos.splice(idx, 1);
  writeData(data);
  res.json({ exito: true });
});

module.exports = router;
