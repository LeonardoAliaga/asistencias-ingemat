// src/routes/api.route.js
const express = require("express");
const {
  requireAdmin,
  requireAuthenticated,
  requirePermission,
} = require("../middleware/auth.middleware");

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
router.use(
  "/registrar",
  requirePermission("asistencias:write"),
  registrarRouter,
);
router.use("/ciclos-visual", ciclosVisualRouter);
router.use("/ciclos", ciclosRouter);
router.use("/horarios", horariosRouter);
router.use("/carousel", carouselRouter);
router.use(
  "/biblioteca",
  requireAuthenticated,
  (req, res, next) =>
    req.method === "GET"
      ? next()
      : requirePermission("biblioteca:write")(req, res, next),
  bibliotecaRouter,
);
router.use(
  "/evaluaciones",
  requireAuthenticated,
  (req, res, next) =>
    req.method === "GET"
      ? requirePermission("evaluaciones:read")(req, res, next)
      : requirePermission(
          req.path.startsWith("/tareas")
            ? "tareas:write"
            : "evaluaciones:write",
        )(req, res, next),
  evaluacionesRouter,
);

// Rutas Protegidas (Solo Administración)
router.use(
  "/usuarios",
  (req, res, next) =>
    requirePermission(req.method === "GET" ? "usuarios:read" : "admin")(
      req,
      res,
      next,
    ),
  usuariosRouter,
);
router.use(
  "/excel",
  (req, res, next) =>
    requirePermission(
      req.method === "GET" ? "reportes:read" : "asistencias:justify",
    )(req, res, next),
  excelRouter,
);
router.use("/notes", requireAdmin, notesRouter);

module.exports = router;
