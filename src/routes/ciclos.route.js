// src/routes/ciclos.route.js
const express = require("express");
const fs = require("fs");
const path = require("path");
const { getCiclosData, normalizarTexto } = require("../utils/helpers"); // Importar helper

const router = express.Router();
const ciclosPath = path.join(__dirname, "../../data/ciclos.json");

// Helper para guardar ciclos
function saveCiclos(data) {
  try {
    // Asegurar que la carpeta data exista
    const dataDir = path.dirname(ciclosPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(ciclosPath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Ciclos Route: Error al guardar ciclos.json:", err);
    throw new Error("Error interno al guardar los datos de ciclos."); // Lanzar error
  }
}

// GET /api/ciclos - Obtener lista de ciclos
router.get("/", (req, res) => {
  // getCiclosData maneja la creación/lectura y errores
  try {
    const data = getCiclosData();
    res.json(data);
  } catch (err) {
    // Aunque getCiclosData ya loguea, podemos loguear aquí también si queremos
    console.error("Ciclos Route: Error al obtener datos de ciclos:", err);
    // Devolver un default por si acaso
    res
      .status(500)
      .json({ ciclos: ["semestral", "anual", "sabatino", "domingos"] });
  }
});

// POST /api/ciclos - Agregar ciclo
router.post("/", (req, res) => {
  const { nombre } = req.body;
  if (!nombre || typeof nombre !== "string" || nombre.trim().length === 0) {
    console.log("Ciclos Route: Intento de agregar ciclo con nombre vacío.");
    return res
      .status(400)
      .json({ mensaje: "El nombre del ciclo no puede estar vacío." });
  }
  let data;
  try {
    data = getCiclosData();
  } catch (err) {
    return res
      .status(500)
      .json({ exito: false, mensaje: "Error al leer datos de ciclos." });
  }

  const nombreNormalizado = normalizarTexto(nombre);

  if (data.ciclos.map((c) => normalizarTexto(c)).includes(nombreNormalizado)) {
    console.log(`Ciclos Route: Intento de agregar ciclo duplicado: ${nombre}`);
    return res.status(409).json({ mensaje: "El ciclo ya existe." });
  }

  const nombreEnMayusculas = nombre.trim().toUpperCase();
  data.ciclos.push(nombreEnMayusculas); // Guardar en mayúsculas
  try {
    saveCiclos(data);
    console.log(`Ciclos Route: Ciclo '${nombre}' agregado.`);
    res
      .status(201)
      .json({ exito: true, mensaje: `Ciclo '${nombre}' agregado.` });
  } catch (err) {
    res.status(500).json({ exito: false, mensaje: err.message });
  }
});

// DELETE /api/ciclos/:ciclo - Eliminar ciclo
router.delete("/:ciclo", (req, res) => {
  const cicloABorrar = req.params.ciclo;
  let data;
  try {
    data = getCiclosData();
  } catch (err) {
    return res
      .status(500)
      .json({ exito: false, mensaje: "Error al leer datos de ciclos." });
  }
  const initialLength = data.ciclos.length;

  data.ciclos = data.ciclos.filter(
    (c) => c.toLowerCase() !== cicloABorrar.toLowerCase()
  );

  if (data.ciclos.length === initialLength) {
    console.log(
      `Ciclos Route: No se encontró ciclo para eliminar: ${cicloABorrar}`
    );
    return res.status(404).json({ mensaje: "Ciclo no encontrado." });
  }

  try {
    saveCiclos(data);
    console.log(`Ciclos Route: Ciclo '${cicloABorrar}' eliminado.`);
    res.json({ exito: true, mensaje: `Ciclo '${cicloABorrar}' eliminado.` });
  } catch (err) {
    res.status(500).json({ exito: false, mensaje: err.message });
  }
});

module.exports = router;
