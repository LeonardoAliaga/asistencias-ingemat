// src/routes/registrar.route.js
const express = require("express");
const { guardarRegistro } = require("../services/excel.service");
const { estadoAsistencia, getDayAbbreviation, convertTo12Hour, getFullName } = require("../utils/helpers");
const db = require("../database/db");
const { attendanceMessage, teacherMessage } = require("../services/whatsapp-messages");
const { sendMessage, isWhatsappReady } = require("../../Whatsapp/WhatsappClient");
const router = express.Router();

function readWhatsappConfig() {
  const defaults = {
    enabledGeneral:false, studentNotificationsEnabled:false,
    teacherNotificationsEnabled:false, studentRules:[], teacherTargetId:null,
  };
  try {
    const row = db.prepare("SELECT valor FROM config_general WHERE clave = 'whatsapp_config'").get();
    if (!row?.valor) return defaults;
    const saved = JSON.parse(row.valor);
    return { ...defaults, ...saved, studentRules: Array.isArray(saved.studentRules) ? saved.studentRules : [] };
  } catch (error) {
    console.error("Error consultando configuración de WhatsApp:", error);
    return defaults;
  }
}

router.post("/", async (req, res) => {
  // --- INICIO LÓGICA DE JUSTIFICACIÓN (J) ---
  let codigo = req.body.codigo;

  // Forzar que el código siempre sea mayúsculas al recibirlo
  if (codigo && typeof codigo === "string") {
    codigo = codigo.toUpperCase();
  }

  let isJustified = false;

  if (
    codigo &&
    typeof codigo === "string" &&
    codigo.endsWith("J") && // 'codigo' ya está en mayúsculas
    codigo.length > 1
  ) {
    isJustified = true;
    codigo = codigo.substring(0, codigo.length - 1); // Quitar la 'J' para buscar
    console.log(
      `Registrar Route: Detectada tardanza justificada para ${codigo}`
    );
  }
  // --- FIN LÓGICA DE JUSTIFICACIÓN (J) ---

  let usuario = null;

  try {
    const row = db.prepare("SELECT * FROM usuarios WHERE codigo = ?").get(codigo);
    if (row) {
      let dias_asistencia = ["L", "M", "MI", "J", "V", "S"];
      try {
        dias_asistencia = JSON.parse(row.dias_asistencia || "[]");
        if (!Array.isArray(dias_asistencia) || dias_asistencia.length === 0) {
          dias_asistencia = ["L", "M", "MI", "J", "V", "S"];
        }
      } catch (e) {}

      usuario = {
        codigo: String(row.codigo).toUpperCase(),
        nombre: row.nombre,
        apellido: row.apellido,
        rol: row.rol,
        turno: row.turno || "",
        ciclo: row.ciclo || "",
        dias_asistencia,
      };
    }
  } catch (err) {
    console.error("Registrar Route: Error al consultar usuario en SQLite:", err);
    return res.status(500).json({ exito: false, mensaje: "Error interno al buscar usuario." });
  }

  if (!usuario) {
    console.log(`Registrar Route: Código no encontrado - ${codigo}`);
    return res.status(404).json({ exito: false, mensaje: "Código no encontrado" });
  }

  const fecha = new Date();
  const fechaStr = fecha.toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const diaAbbr = getDayAbbreviation(fecha);

  const horaStr = fecha.toLocaleTimeString("es-PE", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  let hora12h = convertTo12Hour(horaStr); // <--- Cambiado a let

  console.log(
    `\nRegistrar Route: Procesando ${getFullName(usuario)} (${
      usuario.rol
    }) - Código: ${codigo}`
  );

  const isScheduledToday =
    usuario.rol !== "estudiante" ||
    (usuario.dias_asistencia && usuario.dias_asistencia.includes(diaAbbr));

  // Pasar el flag 'isJustified' a guardarRegistro
  const guardado = await guardarRegistro(
    usuario,
    fechaStr,
    horaStr,
    isJustified
  );

  if (!guardado) {
    console.log(
      `Registrar Route: ${getFullName(
        usuario
      )} ya tiene registro de hora válido hoy.`
    );
    return res.status(409).json({
      exito: false,
      mensaje: `${getFullName(
        usuario
      )} ya tiene un registro de hora válido hoy.`,
    });
  }
  console.log(
    `Registrar Route: Guardado en Excel exitoso para ${getFullName(usuario)}.`
  );

  // --- Lógica de Envío de WhatsApp (MODIFICADA) ---
  const whatsappConfig = readWhatsappConfig();
  let whatsappEnviado = false;
  let mensajeWhatsapp = "";
  let destinatarioWhatsapp = null;

  // 1. Chequeo General
  if (whatsappConfig.enabledGeneral && isWhatsappReady()) {
    console.log("Registrar Route: Verificando reglas de WhatsApp...");

    // 2. Chequeo por Rol
    if (
      usuario.rol === "estudiante" &&
      whatsappConfig.studentNotificationsEnabled
    ) {
      const estado = estadoAsistencia(usuario.ciclo, usuario.turno, horaStr);
      mensajeWhatsapp = attendanceMessage({
        nombre: getFullName(usuario), ciclo: usuario.ciclo, turno: usuario.turno,
        hora: hora12h, estado,
        justificado: isJustified && (estado === "tarde" || estado === "tolerancia"),
        fueraDeHorario: !isScheduledToday,
      });

      const regla = whatsappConfig.studentRules.find(
        (r) => r.ciclo === usuario.ciclo && r.turno === usuario.turno
      );
      if (regla) {
        destinatarioWhatsapp = regla.targetId;
      }
    } else if (
      usuario.rol === "docente" &&
      whatsappConfig.teacherNotificationsEnabled
    ) {
      const isTeacherScheduled = usuario.dias_asistencia && usuario.dias_asistencia.includes(diaAbbr);
      mensajeWhatsapp = teacherMessage({
        nombre: getFullName(usuario), hora: hora12h, fueraDeHorario: !isTeacherScheduled,
      });
      destinatarioWhatsapp = whatsappConfig.teacherTargetId;
    }

    // 3. Enviar si hay destinatario
    if (destinatarioWhatsapp && mensajeWhatsapp) {
      whatsappEnviado = await sendMessage(
        destinatarioWhatsapp,
        mensajeWhatsapp
      );
    }
  } else if (whatsappConfig.enabledGeneral && !isWhatsappReady()) {
    console.warn(
      "Registrar Route: Notificación WhatsApp habilitada pero el cliente no está listo."
    );
  }
  // --- Fin Lógica WhatsApp ---

  // --- Lógica de Estado de Respuesta (MODIFICADA) ---
  let estadoRespuesta = "";
  if (usuario.rol === "estudiante") {
    // --- MODIFICADO: Pasar 'usuario.ciclo' a estadoAsistencia ---
    estadoRespuesta = estadoAsistencia(usuario.ciclo, usuario.turno, horaStr);
    if (
      isJustified &&
      (estadoRespuesta === "tarde" || estadoRespuesta === "tolerancia")
    ) {
      estadoRespuesta = "justificada"; // Nuevo estado para el frontend
    }
  }

  // --- Añadir (J) a la hora de respuesta ---
  if (
    isJustified &&
    (estadoRespuesta === "justificada" || usuario.rol === "docente")
  ) {
    hora12h = `${hora12h} (J)`;
  }
  // --- Fin modificación hora ---

  const responseData = {
    exito: true,
    nombre: getFullName(usuario),
    hora: `${fechaStr} ${hora12h}`,
    estado: estadoRespuesta,
    ciclo: usuario.ciclo || "",
    turno: usuario.turno || "",
    rol: usuario.rol,
    whatsappEnviado: whatsappEnviado,
    mensajeAdicional:
      !isScheduledToday && usuario.rol === "estudiante"
        ? `Registrado fuera de día programado (${diaAbbr}).`
        : null,
  };
  res.json(responseData);
});

module.exports = router;
