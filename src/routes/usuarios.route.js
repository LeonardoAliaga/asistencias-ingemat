// src/routes/usuarios.route.js
const express = require("express");
const fs = require("fs");
const path = require("path");

const { normalizarTexto, getCiclosData } = require("../utils/helpers");
const router = express.Router();
const usuariosPath = path.join(__dirname, "../../data/usuarios.json");

// Helper para leer usuarios (con manejo de creación de archivo)
function readUsuarios() {
  try {
    if (!fs.existsSync(usuariosPath)) {
      fs.writeFileSync(usuariosPath, JSON.stringify([], null, 2));
      console.log("Usuarios Route: Archivo usuarios.json creado vacío.");
      return [];
    }
    const raw = JSON.parse(fs.readFileSync(usuariosPath, "utf8"));
    // Migrar entradas antiguas: asegurar campos nombre, apellido y nombre_completo
    const migrated = raw.map((u) => {
      if (!u) return u;
      // Si ya tiene nombre_completo, dejar
      if (u.nombre_completo) return u;
      // Si sólo tenía 'nombre' como string con nombre completo
      if (u.nombre && u.apellido === undefined) {
        return { ...u, apellido: "", nombre_completo: String(u.nombre).trim() };
      }
      // Si tiene nombre y apellido
      if (u.nombre && u.apellido !== undefined) {
        return {
          ...u,
          nombre_completo: `${String(u.nombre).trim()} ${String(
            u.apellido
          ).trim()}`.trim(),
        };
      }
      return u;
    });
    return migrated;
  } catch (err) {
    console.error("Usuarios Route: Error al leer/crear usuarios.json:", err);
    throw new Error("Error interno al acceder a los datos de usuarios."); // Lanzar error para capturar en ruta
  }
}

// Helper para guardar usuarios
function saveUsuarios(usuarios) {
  try {
    fs.writeFileSync(usuariosPath, JSON.stringify(usuarios, null, 2));
  } catch (writeErr) {
    console.error("Usuarios Route: Error al guardar usuarios.json:", writeErr);
    throw new Error("Error interno al guardar los datos de usuarios."); // Lanzar error
  }
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
  let usuarios;
  try {
    usuarios = readUsuarios();
  } catch (readErr) {
    return res.status(500).json({ exito: false, mensaje: readErr.message });
  }

  const nuevoUsuario = req.body || {};
  if (
    !nuevoUsuario ||
    !nuevoUsuario.codigo ||
    !nuevoUsuario.nombre ||
    nuevoUsuario.nombre === undefined ||
    !nuevoUsuario.rol
  ) {
    console.log(
      "Usuarios Route: Intento de agregar usuario con datos incompletos.",
      nuevoUsuario
    );
    return res.status(400).json({
      exito: false,
      mensaje: "Faltan datos obligatorios del usuario.",
    });
  }
  const codigoNuevo = String(nuevoUsuario.codigo).trim();
  if (usuarios.some((u) => String(u.codigo).trim() === codigoNuevo)) {
    console.log(
      `Usuarios Route: Intento de agregar usuario con código duplicado: ${nuevoUsuario.codigo}`
    );
    return res.status(409).json({
      exito: false,
      mensaje: `El código '${nuevoUsuario.codigo}' ya está en uso.`,
    });
  }

  // Lógica de validación y días por defecto
  if (nuevoUsuario.rol === "estudiante") {
    if (!nuevoUsuario.turno || !nuevoUsuario.ciclo) {
      console.log(
        "Usuarios Route: Faltan turno o ciclo para estudiante.",
        nuevoUsuario
      );
      return res.status(400).json({
        exito: false,
        mensaje: "Turno y ciclo son obligatorios para estudiantes.",
      });
    }
    // Validar que el ciclo exista en la lista de ciclos configurados
    try {
      const ciclosData = getCiclosData();
      const existe = (ciclosData.ciclos || []).some(
        (c) => normalizarTexto(c) === normalizarTexto(nuevoUsuario.ciclo)
      );
      if (!existe) {
        return res.status(400).json({
          exito: false,
          mensaje: `Ciclo '${nuevoUsuario.ciclo}' no existe.`,
        });
      }
    } catch (e) {
      console.warn("Usuarios Route: no se pudo validar ciclo:", e);
    }
    if (
      !Array.isArray(nuevoUsuario.dias_asistencia) ||
      nuevoUsuario.dias_asistencia.length === 0
    ) {
      console.log(
        "Usuarios Route: Asignando días por defecto a estudiante.",
        nuevoUsuario.codigo
      );
      nuevoUsuario.dias_asistencia = ["L", "M", "MI", "J", "V", "S"];
    }
  } else if (nuevoUsuario.rol === "docente") {
    nuevoUsuario.turno = "";
    nuevoUsuario.ciclo = "";
    if (
      !Array.isArray(nuevoUsuario.dias_asistencia) ||
      nuevoUsuario.dias_asistencia.length === 0
    ) {
      console.log(
        "Usuarios Route: Asignando días por defecto a docente.",
        nuevoUsuario.codigo
      );
      nuevoUsuario.dias_asistencia = ["L", "M", "MI", "J", "V", "S"];
    }
  } else {
    console.log("Usuarios Route: Rol de usuario inválido.", nuevoUsuario);
    return res
      .status(400)
      .json({ exito: false, mensaje: "Rol de usuario no válido." });
  }
  // Normalizar campos de nombre/apellido antes de guardar
  const nombre = nuevoUsuario.nombre
    ? String(nuevoUsuario.nombre).trim().toUpperCase()
    : "";
  const apellido = nuevoUsuario.apellido
    ? String(nuevoUsuario.apellido).trim().toUpperCase()
    : "";

  // Construir objeto final a guardar
  const usuarioToSave = {
    ...nuevoUsuario,
    codigo: codigoNuevo,
    nombre: nombre,
    apellido: apellido,
    // Formato canónico: 'APELLIDO NOMBRE'
    nombre_completo: `${apellido}${
      apellido && nombre ? " " : ""
    }${nombre}`.trim(),
  };

  usuarios.push(usuarioToSave);
  try {
    saveUsuarios(usuarios);
    console.log(
      `Usuarios Route: Usuario '${usuarioToSave.nombre_completo}' (${usuarioToSave.rol}) agregado.`
    );
    res
      .status(201)
      .json({ exito: true, mensaje: "Usuario agregado correctamente." });
  } catch (writeErr) {
    res.status(500).json({ exito: false, mensaje: writeErr.message });
  }
});

// DELETE /api/usuarios/:codigo - Eliminar usuario
router.delete("/:codigo", (req, res) => {
  let usuarios;
  const codigoAEliminar = req.params.codigo;
  try {
    usuarios = readUsuarios();
  } catch (readErr) {
    return res.status(500).json({ exito: false, mensaje: readErr.message });
  }

  const initialLength = usuarios.length;
  usuarios = usuarios.filter((u) => u.codigo !== codigoAEliminar);

  if (usuarios.length === initialLength) {
    console.log(
      `Usuarios Route: No se encontró usuario para eliminar con código: ${codigoAEliminar}`
    );
    return res
      .status(404)
      .json({ exito: false, mensaje: "Usuario no encontrado." });
  }

  try {
    saveUsuarios(usuarios);
    console.log(
      `Usuarios Route: Usuario con código '${codigoAEliminar}' eliminado.`
    );
    res.json({ exito: true, mensaje: "Usuario eliminado." });
  } catch (writeErr) {
    res.status(500).json({ exito: false, mensaje: writeErr.message });
  }
});

module.exports = router;
