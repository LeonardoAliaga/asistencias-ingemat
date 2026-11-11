// src/routes/usuarios.route.js
const express = require("express");
const db = require("../database/db");
const { normalizarTexto, getCiclosData } = require("../utils/helpers");

const router = express.Router();
const { randomUUID } = require("node:crypto");

// Helper para leer usuarios desde SQLite
function readUsuarios() {
  const rows = db
    .prepare("SELECT * FROM usuarios ORDER BY apellido ASC, nombre ASC")
    .all();
  return rows.map((u) => {
    const nombre = u.nombre ? String(u.nombre).trim().toUpperCase() : "";
    const apellido = u.apellido ? String(u.apellido).trim().toUpperCase() : "";
    const nombre_completo =
      `${apellido}${apellido && nombre ? " " : ""}${nombre}`.trim();
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
      area: u.area || "",
      uid: u.uid,
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
  if (!/^[A-Z0-9_-]{1,32}$/.test(codigoNuevo))
    return res.status(400).json({
      exito: false,
      mensaje:
        "El código debe tener de 1 a 32 letras, números, guiones o guiones bajos.",
    });

  // Verificar duplicado
  const existente = db
    .prepare("SELECT codigo FROM usuarios WHERE codigo = ?")
    .get(codigoNuevo);
  if (existente) {
    return res.status(409).json({
      exito: false,
      mensaje: `El código '${codigoNuevo}' ya está en uso.`,
    });
  }

  let turno = String(nuevoUsuario.turno || "").toLowerCase();
  let ciclo = nuevoUsuario.ciclo || "";
  let dias_asistencia = nuevoUsuario.dias_asistencia;

  if (nuevoUsuario.rol === "estudiante") {
    if (!["mañana", "tarde"].includes(turno) || !ciclo) {
      return res.status(400).json({
        exito: false,
        mensaje: "Turno y ciclo son obligatorios para estudiantes.",
      });
    }
    try {
      const ciclosData = getCiclosData();
      const existe = (ciclosData.ciclos || []).some(
        (c) => normalizarTexto(c) === normalizarTexto(ciclo),
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
    return res
      .status(400)
      .json({ exito: false, mensaje: "Rol de usuario no válido." });
  }

  if (
    !Array.isArray(dias_asistencia) ||
    dias_asistencia.some(
      (day) => !["L", "M", "MI", "J", "V", "S", "D"].includes(day),
    )
  )
    return res
      .status(400)
      .json({ exito: false, mensaje: "Días de asistencia inválidos." });
  const nombre = String(nuevoUsuario.nombre).trim().toUpperCase();
  const apellido = String(nuevoUsuario.apellido || "")
    .trim()
    .toUpperCase();
  const student = nuevoUsuario.rol === "estudiante";
  const area = student
    ? String(nuevoUsuario.area || "")
        .trim()
        .toUpperCase()
    : "";
  const guardian =
    student &&
    nuevoUsuario.guardian &&
    typeof nuevoUsuario.guardian === "object"
      ? nuevoUsuario.guardian
      : {};
  const guardianName = String(guardian.name || "").trim();
  const guardianPhone = String(guardian.phone || "").replace(/[\s()-]/g, "");
  if (
    (area && !/^[A-Z0-9_-]{1,20}$/.test(area)) ||
    ((guardianName || guardianPhone || guardian.consent) &&
      (!guardianName ||
        guardianName.length > 100 ||
        !/^\+[1-9]\d{7,14}$/.test(guardianPhone)))
  )
    return res
      .status(400)
      .json({
        exito: false,
        mensaje:
          "Revisa el área y completa nombre y teléfono internacional del apoderado (+51...).",
      });
  if (!nombre || nombre.length > 100 || apellido.length > 100)
    return res
      .status(400)
      .json({ exito: false, mensaje: "Nombre o apellido inválido." });

  try {
    db.transaction(() => {
      const uid = randomUUID();
      db.prepare(
        `
      INSERT INTO usuarios (codigo, nombre, apellido, rol, turno, ciclo, dias_asistencia,uid,area)
      VALUES (?, ?, ?, ?, ?, ?, ?,?,?)
    `,
      ).run(
        codigoNuevo,
        nombre,
        apellido,
        nuevoUsuario.rol,
        turno,
        ciclo,
        JSON.stringify(dias_asistencia),
        uid,
        area,
      );
      if (guardianName) {
        const consent = guardian.consent === true ? 1 : 0;
        db.prepare(
          "INSERT INTO contacts(id,user_uid,name,phone,consent,consented_at) VALUES(?,?,?,?,?,?)",
        ).run(
          randomUUID(),
          uid,
          guardianName,
          guardianPhone,
          consent,
          consent ? new Date().toISOString() : null,
        );
      }
    })();

    console.log(
      `Usuarios Route: Usuario '${apellido} ${nombre}' (${nuevoUsuario.rol}) guardado en SQLite.`,
    );
    res
      .status(201)
      .json({ exito: true, mensaje: "Usuario agregado correctamente." });
  } catch (err) {
    res.status(500).json({ exito: false, mensaje: err.message });
  }
});

// PUT /api/usuarios/:codigo - Editar usuario
router.put("/:codigo", (req, res) => {
  const originalCodigo = String(req.params.codigo).trim().toUpperCase();
  const updatedUsuario = req.body || {};
  const nuevoCodigo = String(updatedUsuario.codigo || originalCodigo)
    .trim()
    .toUpperCase();
  if (
    !/^[A-Z0-9_-]{1,32}$/.test(nuevoCodigo) ||
    !["estudiante", "docente"].includes(updatedUsuario.rol)
  )
    return res
      .status(400)
      .json({ exito: false, mensaje: "Código o rol inválido." });

  if (!updatedUsuario.codigo || !updatedUsuario.nombre || !updatedUsuario.rol) {
    return res
      .status(400)
      .json({ exito: false, mensaje: "Faltan datos obligatorios." });
  }

  const userExistente = db
    .prepare("SELECT * FROM usuarios WHERE codigo = ?")
    .get(originalCodigo);
  if (!userExistente) {
    return res
      .status(404)
      .json({ exito: false, mensaje: "Usuario original no encontrado." });
  }

  if (originalCodigo !== nuevoCodigo) {
    const dup = db
      .prepare("SELECT codigo FROM usuarios WHERE codigo = ?")
      .get(nuevoCodigo);
    if (dup) {
      return res.status(409).json({
        exito: false,
        mensaje: `El nuevo código '${nuevoCodigo}' ya está en uso.`,
      });
    }
  }

  const nombre = String(updatedUsuario.nombre).trim().toUpperCase();
  const apellido = String(updatedUsuario.apellido || "")
    .trim()
    .toUpperCase();
  let turno = String(updatedUsuario.turno || userExistente.turno).toLowerCase();
  let ciclo = updatedUsuario.ciclo || userExistente.ciclo;
  if (!nombre || nombre.length > 100 || apellido.length > 100)
    return res
      .status(400)
      .json({ exito: false, mensaje: "Nombre o apellido inválido." });
  if (
    updatedUsuario.rol === "estudiante" &&
    (!["mañana", "tarde"].includes(turno) ||
      !getCiclosData().ciclos.some(
        (c) => normalizarTexto(c) === normalizarTexto(ciclo),
      ))
  )
    return res
      .status(400)
      .json({ exito: false, mensaje: "Turno o ciclo inválido." });
  const isStudent = updatedUsuario.rol === "estudiante";
  const hasArea = Object.hasOwn(updatedUsuario, "area");
  const area = isStudent && hasArea
    ? String(updatedUsuario.area || "GENERAL").trim().toUpperCase()
    : userExistente.area || "";
  if (isStudent && !/^[A-Z0-9_-]{1,20}$/.test(area))
    return res.status(400).json({ exito: false, mensaje: "Selecciona un área válida." });

  const hasGuardians = isStudent && Object.hasOwn(updatedUsuario, "guardians");
  const rawGuardians = updatedUsuario.guardians;
  let guardians = [];
  if (hasGuardians) {
    if (!Array.isArray(rawGuardians) || rawGuardians.length > 20)
      return res.status(400).json({ exito: false, mensaje: "Lista de apoderados inválida (máximo 20)." });
    const current = db.prepare("SELECT id FROM contacts WHERE user_uid=? AND active=1").all(userExistente.uid);
    const known = new Set(current.map(c => c.id));
    const seenIds = new Set(), seenPhones = new Set();
    for (const item of rawGuardians) {
      if (!item || typeof item !== "object" || Array.isArray(item))
        return res.status(400).json({ exito: false, mensaje: "Datos de apoderado inválidos." });
      const id = item.id ? String(item.id) : null;
      if (id && (!known.has(id) || seenIds.has(id)))
        return res.status(400).json({ exito: false, mensaje: "El apoderado seleccionado no pertenece a este estudiante." });
      if (id) seenIds.add(id);
      if (item.remove === true) {
        if (!id) return res.status(400).json({ exito: false, mensaje: "No se puede retirar un apoderado no guardado." });
        guardians.push({ id, remove: true });
        continue;
      }
      const name = String(item.name || "").trim(),
        phone = String(item.phone || "").replace(/[\s()-]/g, "");
      if (!name || name.length > 100 || !/^\+[1-9]\d{7,14}$/.test(phone) || seenPhones.has(phone))
        return res.status(400).json({ exito: false, mensaje: "Revisa el nombre y teléfono internacional (+51...) de cada apoderado; no repitas números." });
      seenPhones.add(phone);
      guardians.push({ id, name, phone, consent: item.consent === true });
    }
    if (current.some(c => !seenIds.has(c.id)))
      return res.status(409).json({ exito: false, mensaje: "La lista de apoderados cambió. Vuelve a abrir el formulario para evitar perder datos." });
  }
  let dias_asistencia =
    updatedUsuario.dias_asistencia ||
    JSON.parse(userExistente.dias_asistencia || "[]");

  if (updatedUsuario.rol === "docente") {
    turno = "";
    ciclo = "";
  }
  if (
    !Array.isArray(dias_asistencia) ||
    !dias_asistencia.length ||
    dias_asistencia.some(
      (day) => !["L", "M", "MI", "J", "V", "S", "D"].includes(day),
    )
  )
    return res
      .status(400)
      .json({ exito: false, mensaje: "Días de asistencia inválidos." });

  try {
    db.transaction(() => {
      if (originalCodigo !== nuevoCodigo) {
        for (const [table, column] of [
          ["respuestas_evaluacion", "codigoEstudiante"],
          ["registros_tarea", "codigoEstudiante"],
          ["prestamos", "estudianteCodigo"],
          ["omr_sheets", "student_code"],
          ["attendance", "student_code"],
          ["grade_history", "student_code"],
        ])
          db.prepare(`UPDATE ${table} SET ${column}=? WHERE ${column}=?`).run(
            nuevoCodigo,
            originalCodigo,
          );
      }
      db.prepare(
        "UPDATE usuarios SET codigo=?,nombre=?,apellido=?,rol=?,turno=?,ciclo=?,dias_asistencia=?,area=? WHERE codigo=?",
      ).run(
        nuevoCodigo,
        nombre,
        apellido,
        updatedUsuario.rol,
        turno,
        ciclo,
        JSON.stringify(dias_asistencia),
        area,
        originalCodigo,
      );
      if (hasGuardians) {
        const now = new Date().toISOString();
        for (const guardian of guardians) {
          if (guardian.remove) {
            db.prepare("UPDATE contacts SET active=0,consent=0,consented_at=NULL WHERE id=? AND user_uid=?")
              .run(guardian.id, userExistente.uid);
          } else if (guardian.id) {
            db.prepare("UPDATE contacts SET name=?,phone=?,consent=?,consented_at=CASE WHEN ?=1 THEN COALESCE(consented_at,?) ELSE NULL END WHERE id=? AND user_uid=?")
              .run(guardian.name, guardian.phone, Number(guardian.consent), Number(guardian.consent), now, guardian.id, userExistente.uid);
          } else {
            db.prepare("INSERT INTO contacts(id,user_uid,name,phone,consent,consented_at,active) VALUES(?,?,?,?,?,?,1) ON CONFLICT(user_uid,phone) DO UPDATE SET name=excluded.name,consent=excluded.consent,consented_at=excluded.consented_at,active=1")
              .run(randomUUID(), userExistente.uid, guardian.name, guardian.phone, Number(guardian.consent), guardian.consent ? now : null);
          }
        }
      }
    })();

    console.log(
      `Usuarios Route: Usuario '${originalCodigo}' actualizado a '${nuevoCodigo}' en SQLite.`,
    );
    res.json({ exito: true, mensaje: "Usuario actualizado correctamente." });
  } catch (err) {
    const conflict = String(err.message).includes("UNIQUE constraint");
    res.status(conflict ? 409 : 500).json({
      exito: false,
      mensaje: conflict ? "Ese número de WhatsApp ya está registrado para este estudiante." : "No se pudieron guardar los cambios del usuario.",
    });
  }
});

// DELETE /api/usuarios/:codigo - Eliminar usuario
router.delete("/:codigo", (req, res) => {
  const codigoAEliminar = String(req.params.codigo).trim().toUpperCase();

  try {
    const user = db
      .prepare("SELECT uid FROM usuarios WHERE codigo=?")
      .get(codigoAEliminar);
    const history = db
      .prepare(
        "SELECT 1 FROM respuestas_evaluacion WHERE codigoEstudiante=? UNION ALL SELECT 1 FROM attendance WHERE user_uid=? UNION ALL SELECT 1 FROM registros_tarea WHERE codigoEstudiante=? UNION ALL SELECT 1 FROM prestamos WHERE estudianteCodigo=? UNION ALL SELECT 1 FROM exam_roster WHERE user_uid=? LIMIT 1",
      )
      .get(
        codigoAEliminar,
        user?.uid || "",
        codigoAEliminar,
        codigoAEliminar,
        user?.uid || "",
      );
    if (history)
      return res.status(409).json({
        exito: false,
        mensaje:
          "Este usuario tiene historial académico. Conserva su registro y cambia su ciclo si corresponde.",
      });
    const info = db
      .prepare("DELETE FROM usuarios WHERE codigo = ?")
      .run(codigoAEliminar);
    if (info.changes === 0) {
      return res
        .status(404)
        .json({ exito: false, mensaje: "Usuario no encontrado." });
    }
    console.log(
      `Usuarios Route: Usuario con código '${codigoAEliminar}' eliminado de SQLite.`,
    );
    res.json({ exito: true, mensaje: "Usuario eliminado." });
  } catch (err) {
    res.status(500).json({ exito: false, mensaje: err.message });
  }
});

module.exports = router;
