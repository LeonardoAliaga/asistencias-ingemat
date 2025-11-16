// src/routes/usuarios.route.js
const express = require("express");
const fs = require("fs");
const path = require("path");

const {
  normalizarTexto,
  getCiclosData,
  getFullName,
} = require("../utils/helpers");
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
    const migrated = raw.map((u) => {
      if (!u) return u;
      const nombre = u.nombre ? String(u.nombre).trim().toUpperCase() : "";
      const apellido = u.apellido
        ? String(u.apellido).trim().toUpperCase()
        : "";
      const nombre_completo = `${apellido}${
        apellido && nombre ? " " : ""
      }${nombre}`.trim();
      return {
        ...u,
        nombre: nombre,
        apellido: apellido,
        nombre_completo: nombre_completo,
      };
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
    throw new Error("Error interno al guardar los datos de usuarios.");
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
  const codigoNuevo = String(nuevoUsuario.codigo).trim().toUpperCase();
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

// --- RUTA PUT (MODIFICADA) ---
router.put("/:codigo", (req, res) => {
  let usuarios;
  const originalCodigo = req.params.codigo;
  try {
    usuarios = readUsuarios();
  } catch (readErr) {
    return res.status(500).json({ exito: false, mensaje: readErr.message });
  }

  const updatedUsuario = req.body || {};

  // --- INICIO CORRECCIÓN 1 ---
  const nuevoCodigo = String(updatedUsuario.codigo).trim().toUpperCase();
  // --- FIN CORRECCIÓN 1 ---

  // 1. Validar datos
  if (!updatedUsuario.codigo || !updatedUsuario.nombre || !updatedUsuario.rol) {
    return res
      .status(400)
      .json({ exito: false, mensaje: "Faltan datos obligatorios." });
  }

  // 2. Encontrar el índice del usuario original
  const userIndex = usuarios.findIndex((u) => u.codigo === originalCodigo);
  if (userIndex === -1) {
    return res
      .status(404)
      .json({ exito: false, mensaje: "Usuario original no encontrado." });
  }

  // 3. Verificar si el nuevo código ya existe (y no es el usuario actual)
  if (
    originalCodigo !== nuevoCodigo &&
    usuarios.some((u) => u.codigo === nuevoCodigo)
  ) {
    return res.status(409).json({
      exito: false,
      mensaje: `El nuevo código '${nuevoCodigo}' ya está en uso.`,
    });
  }

  // 4. Normalizar y construir el objeto actualizado
  const nombre = updatedUsuario.nombre
    ? String(updatedUsuario.nombre).trim().toUpperCase()
    : "";
  const apellido = updatedUsuario.apellido
    ? String(updatedUsuario.apellido).trim().toUpperCase()
    : "";

  const usuarioToSave = {
    ...usuarios[userIndex], // Preservar campos no enviados (como 'notes' si existiera)
    ...updatedUsuario, // Sobrescribir con los nuevos datos
    codigo: nuevoCodigo,
    nombre: nombre,
    apellido: apellido,
    nombre_completo: `${apellido}${
      apellido && nombre ? " " : ""
    }${nombre}`.trim(),
  };

  // 5. Limpiar campos de estudiante si el rol cambia a docente
  if (usuarioToSave.rol === "docente") {
    usuarioToSave.turno = "";
    usuarioToSave.ciclo = "";
  }

  // 6. Reemplazar el usuario en el array
  usuarios[userIndex] = usuarioToSave;

  // 7. Guardar
  try {
    saveUsuarios(usuarios);
    console.log(
      `Usuarios Route: Usuario '${originalCodigo}' actualizado a '${nuevoCodigo}'.`
    );
    res.json({ exito: true, mensaje: "Usuario actualizado correctamente." });
  } catch (writeErr) {
    res.status(500).json({ exito: false, mensaje: writeErr.message });
  }
});
// --- FIN RUTA PUT ---

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
