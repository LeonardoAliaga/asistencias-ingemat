// src/routes/api.route.js
const express = require("express");
const { requireAdmin } = require("../middleware/auth.middleware");

const registrarRouter = require("./registrar.route");
const usuariosRouter = require("./usuarios.route");
const ciclosRouter = require("./ciclos.route");
const ciclosVisualRouter = require("./ciclos_visual.route");
const notesRouter = require("./notes.route");
const excelRouter = require("./excel.route");
const horariosRouter = require("./horarios.route");
const carouselRouter = require("./carousel.route");
const bibliotecaRouter = require("./biblioteca.route");
const evaluacionesRouter = require("./evaluaciones.route");

const router = express.Router();

// Rutas Públicas
router.use("/registrar", registrarRouter);
router.use("/ciclos-visual", ciclosVisualRouter);
router.use("/ciclos", ciclosRouter);
router.use("/horarios", horariosRouter);
router.use("/carousel", carouselRouter);
router.use("/biblioteca", bibliotecaRouter);
router.use("/evaluaciones", evaluacionesRouter);

// Rutas Protegidas (Solo Administración)
router.use("/usuarios", requireAdmin, usuariosRouter);
router.use("/excel", requireAdmin, excelRouter);
router.use("/notes", requireAdmin, notesRouter);

module.exports = router;
