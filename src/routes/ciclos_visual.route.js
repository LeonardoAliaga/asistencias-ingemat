const express = require("express");
const db = require("../database/db");

const router = express.Router();

function readData() {
  try {
    const row = db.prepare("SELECT valor FROM config_general WHERE clave = 'ciclos_visual'").get();
    if (row && row.valor) {
      return JSON.parse(row.valor);
    }
  } catch (err) {
    console.error("Error leyendo ciclos_visual desde SQLite", err);
  }
  return { ciclos: [] };
}

function writeData(obj) {
  try {
    db.prepare("INSERT OR REPLACE INTO config_general (clave, valor) VALUES ('ciclos_visual', ?)").run(
      JSON.stringify(obj, null, 2)
    );
    return true;
  } catch (err) {
    console.error("Error escribiendo ciclos_visual en SQLite", err);
    return false;
  }
}

// Public: lista de ciclos publicados
router.get("/", (req, res) => {
  const data = readData();
  if (!req.session || !req.session.admin) {
    return res.json({
      exito: true,
      ciclos: (data.ciclos || []).filter((c) => c.published),
    });
  }
  res.json({ exito: true, ciclos: data.ciclos || [] });
});

// Get por slug
router.get("/:slug", (req, res) => {
  const data = readData();
  const c = (data.ciclos || []).find((x) => x.slug === req.params.slug);
  if (!c) return res.status(404).json({ exito: false, mensaje: "No encontrado" });
  res.json({ exito: true, ciclo: c });
});

function requireAdmin(req, res, next) {
  if (req.session && req.session.admin) return next();
  return res.status(401).json({ exito: false, mensaje: "No autorizado" });
}

// Create
router.post("/", requireAdmin, (req, res) => {
  const { titulo, slug, descripcion, beneficios, orden, published, price } = req.body;
  if (!titulo || !slug) {
    return res.status(400).json({ exito: false, mensaje: "Título y slug requeridos" });
  }

  const data = readData();
  if (!Array.isArray(data.ciclos)) data.ciclos = [];

  if (data.ciclos.some((x) => x.slug === slug)) {
    return res.status(409).json({ exito: false, mensaje: "Slug en uso" });
  }

  const newCiclo = {
    id: "cv-" + Date.now(),
    titulo,
    slug,
    descripcion: descripcion || "",
    beneficios: Array.isArray(beneficios) ? beneficios : [],
    orden: Number(orden) || 0,
    published: Boolean(published),
    price: price || "",
  };

  data.ciclos.push(newCiclo);
  if (writeData(data)) {
    res.status(201).json({ exito: true, ciclo: newCiclo });
  } else {
    res.status(500).json({ exito: false, mensaje: "Error guardando datos" });
  }
});

// Update
router.put("/:id", requireAdmin, (req, res) => {
  const data = readData();
  const idx = (data.ciclos || []).findIndex((x) => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ exito: false, mensaje: "No encontrado" });

  const current = data.ciclos[idx];
  const { titulo, slug, descripcion, beneficios, orden, published, price } = req.body;

  if (slug && slug !== current.slug) {
    if (data.ciclos.some((x) => x.slug === slug && x.id !== current.id)) {
      return res.status(409).json({ exito: false, mensaje: "Slug en uso" });
    }
  }

  data.ciclos[idx] = {
    ...current,
    titulo: titulo !== undefined ? titulo : current.titulo,
    slug: slug !== undefined ? slug : current.slug,
    descripcion: descripcion !== undefined ? descripcion : current.descripcion,
    beneficios: Array.isArray(beneficios) ? beneficios : current.beneficios,
    orden: orden !== undefined ? Number(orden) : current.orden,
    published: published !== undefined ? Boolean(published) : current.published,
    price: price !== undefined ? price : current.price,
  };

  if (writeData(data)) {
    res.json({ exito: true, ciclo: data.ciclos[idx] });
  } else {
    res.status(500).json({ exito: false, mensaje: "Error guardando datos" });
  }
});

// Delete
router.delete("/:id", requireAdmin, (req, res) => {
  const data = readData();
  const initial = (data.ciclos || []).length;
  data.ciclos = (data.ciclos || []).filter((x) => x.id !== req.params.id);
  if (data.ciclos.length === initial) {
    return res.status(404).json({ exito: false, mensaje: "No encontrado" });
  }
  if (writeData(data)) {
    res.json({ exito: true });
  } else {
    res.status(500).json({ exito: false, mensaje: "Error guardando datos" });
  }
});

module.exports = router;
