// src/routes/api.route.js
const express = require("express");
const registrarRouter = require("./registrar.route");
const usuariosRouter = require("./usuarios.route");
const ciclosRouter = require("./ciclos.route");
const notesRouter = require("./notes.route");
const excelRouter = require("./excel.route");
const horariosRouter = require("./horarios.route");

const router = express.Router();

// Montar los routers específicos en sus prefijos correspondientes
router.use("/registrar", registrarRouter);
router.use("/usuarios", usuariosRouter);
router.use("/ciclos", ciclosRouter);
router.use("/notes", notesRouter);
router.use("/excel", excelRouter);
router.use("/horarios", horariosRouter);

module.exports = router;
