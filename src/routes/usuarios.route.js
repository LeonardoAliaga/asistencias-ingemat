// src/routes/usuarios.route.js
const express = require("express");
const db = require("../database/db");
const { normalizarTexto, getCiclosData } = require("../utils/helpers");

const router = express.Router();

// Helper para leer usuarios desde SQLite
function readUsuarios() {
  const rows = db.prepare("SELECT * FROM usuarios ORDER BY apellido ASC, nombre ASC").all();
  return rows.map((u) => {
    const nombre = u.nombre ? String(u.nombre).trim().toUpperCase() : "";
    const apellido = u.apellido ? String(u.apellido).trim().toUpperCase() : "";
    const nombre_completo = `${apellido}${apellido && nombre ? " " : ""}${nombre}`.trim();
    let dias_asistencia = ["L", "M", "MI", "J", "V", "S"];
    try {
      dias_asistencia = JSON.parse(u.dias_asistencia || "[]");
      if (!Array.isArray(dias_asistencia) || dias_asistencia.length === 0) {
        dias_asistencia = ["L", "M", "MI", "J", "V", "S"];
      }
    } catch (e) {}

    return {
      codigo: String(u.codigo).toUpperCase(),
      nombre,
      apellido,
      nombre_completo,
      rol: u.rol,
      turno: u.turno || "",
      ciclo: u.ciclo || "",
      dias_asistencia,
    };
  });
}

// GET /api/usuarios - Obtener todos los usuarios
router.get("/", (req, res) => {
  try {
    const usuarios = readUsuarios();
    res.json(usuarios);
  } catch (err) {
    res.status(500).json({ exito: false, mensaje: err.message });
  }
});

// POST /api/usuarios - Agregar usuario
router.post("/", (req, res) => {
  const nuevoUsuario = req.body || {};
  if (
    !nuevoUsuario ||
    !nuevoUsuario.codigo ||
    !nuevoUsuario.nombre ||
    !nuevoUsuario.rol
  ) {
    return res.status(400).json({
      exito: false,
      mensaje: "Faltan datos obligatorios del usuario.",
    });
  }

  const codigoNuevo = String(nuevoUsuario.codigo).trim().toUpperCase();

  // Verificar duplicado
  const existente = db.prepare("SELECT codigo FROM usuarios WHERE codigo = ?").get(codigoNuevo);
  if (existente) {
    return res.status(409).json({
      exito: false,
      mensaje: `El código '${codigoNuevo}' ya está en uso.`,
    });
  }

  let turno = nuevoUsuario.turno || "";
  let ciclo = nuevoUsuario.ciclo || "";
  let dias_asistencia = nuevoUsuario.dias_asistencia;

  if (nuevoUsuario.rol === "estudiante") {
    if (!turno || !ciclo) {
      return res.status(400).json({
        exito: false,
        mensaje: "Turno y ciclo son obligatorios para estudiantes.",
      });
    }
    try {
      const ciclosData = getCiclosData();
      const existe = (ciclosData.ciclos || []).some(
        (c) => normalizarTexto(c) === normalizarTexto(ciclo)
      );
      if (!existe) {
        return res.status(400).json({
          exito: false,
          mensaje: `Ciclo '${ciclo}' no existe.`,
        });
      }
    } catch (e) {}

    if (!Array.isArray(dias_asistencia) || dias_asistencia.length === 0) {
      dias_asistencia = ["L", "M", "MI", "J", "V", "S"];
    }
  } else if (nuevoUsuario.rol === "docente") {
    turno = "";
    ciclo = "";
    if (!Array.isArray(dias_asistencia) || dias_asistencia.length === 0) {
      dias_asistencia = ["L", "M", "MI", "J", "V", "S"];
    }
  } else {
    return res.status(400).json({ exito: false, mensaje: "Rol de usuario no válido." });
  }

  const nombre = String(nuevoUsuario.nombre).trim().toUpperCase();
  const apellido = (nuevoUsuario.apellido || "").trim().toUpperCase();

  try {
    db.prepare(`
      INSERT INTO usuarios (codigo, nombre, apellido, rol, turno, ciclo, dias_asistencia)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(codigoNuevo, nombre, apellido, nuevoUsuario.rol, turno, ciclo, JSON.stringify(dias_asistencia));

    console.log(`Usuarios Route: Usuario '${apellido} ${nombre}' (${nuevoUsuario.rol}) guardado en SQLite.`);
    res.status(201).json({ exito: true, mensaje: "Usuario agregado correctamente." });
  } catch (err) {
    res.status(500).json({ exito: false, mensaje: err.message });
  }
});

// PUT /api/usuarios/:codigo - Editar usuario
router.put("/:codigo", (req, res) => {
  const originalCodigo = String(req.params.codigo).trim().toUpperCase();
  const updatedUsuario = req.body || {};
  const nuevoCodigo = String(updatedUsuario.codigo || originalCodigo).trim().toUpperCase();

  if (!updatedUsuario.codigo || !updatedUsuario.nombre || !updatedUsuario.rol) {
    return res.status(400).json({ exito: false, mensaje: "Faltan datos obligatorios." });
  }

  const userExistente = db.prepare("SELECT * FROM usuarios WHERE codigo = ?").get(originalCodigo);
  if (!userExistente) {
    return res.status(404).json({ exito: false, mensaje: "Usuario original no encontrado." });
  }

  if (originalCodigo !== nuevoCodigo) {
    const dup = db.prepare("SELECT codigo FROM usuarios WHERE codigo = ?").get(nuevoCodigo);
    if (dup) {
      return res.status(409).json({ exito: false, mensaje: `El nuevo código '${nuevoCodigo}' ya está en uso.` });
    }
  }

  const nombre = String(updatedUsuario.nombre).trim().toUpperCase();
  const apellido = String(updatedUsuario.apellido || "").trim().toUpperCase();
  let turno = updatedUsuario.turno || userExistente.turno;
  let ciclo = updatedUsuario.ciclo || userExistente.ciclo;
  let dias_asistencia = updatedUsuario.dias_asistencia || JSON.parse(userExistente.dias_asistencia || "[]");

  if (updatedUsuario.rol === "docente") {
    turno = "";
    ciclo = "";
  }

  try {
    db.transaction(() => {
      if (originalCodigo !== nuevoCodigo) {
        db.prepare("DELETE FROM usuarios WHERE codigo = ?").run(originalCodigo);
      }
      db.prepare(`
        INSERT OR REPLACE INTO usuarios (codigo, nombre, apellido, rol, turno, ciclo, dias_asistencia)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(nuevoCodigo, nombre, apellido, updatedUsuario.rol, turno, ciclo, JSON.stringify(dias_asistencia));
    })();

    console.log(`Usuarios Route: Usuario '${originalCodigo}' actualizado a '${nuevoCodigo}' en SQLite.`);
    res.json({ exito: true, mensaje: "Usuario actualizado correctamente." });
  } catch (err) {
    res.status(500).json({ exito: false, mensaje: err.message });
  }
});

// DELETE /api/usuarios/:codigo - Eliminar usuario
router.delete("/:codigo", (req, res) => {
  const codigoAEliminar = String(req.params.codigo).trim().toUpperCase();

  try {
    const info = db.prepare("DELETE FROM usuarios WHERE codigo = ?").run(codigoAEliminar);
    if (info.changes === 0) {
      return res.status(404).json({ exito: false, mensaje: "Usuario no encontrado." });
    }
    console.log(`Usuarios Route: Usuario con código '${codigoAEliminar}' eliminado de SQLite.`);
    res.json({ exito: true, mensaje: "Usuario eliminado." });
  } catch (err) {
    res.status(500).json({ exito: false, mensaje: err.message });
  }
});

module.exports = router;
