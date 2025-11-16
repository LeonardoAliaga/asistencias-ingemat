// src/routes/registrar.route.js
const express = require("express");
const fs = require("fs");
const path = require("path");
const { guardarRegistro } = require("../services/excel.service");
const {
  estadoAsistencia,
  getDayAbbreviation,
  convertTo12Hour,
  normalizarTexto,
} = require("../utils/helpers");
const { getFullName } = require("../utils/helpers");
const {
  sendMessage,
  isWhatsappReady,
} = require("../../Whatsapp/WhatsappClient");

const router = express.Router();
const usuariosPath = path.join(__dirname, "../../data/usuarios.json");
const whatsappConfigPath = path.join(
  __dirname,
  "../../data/whatsappConfig.json"
);

// Función para leer config de WhatsApp (con nuevos defaults)
const readWhatsappConfig = () => {
  const defaultConfig = {
    enabledGeneral: false,
    studentNotificationsEnabled: false,
    teacherNotificationsEnabled: false,
    studentRules: [],
    teacherTargetType: "number",
    teacherTargetId: null,
  };
  try {
    if (fs.existsSync(whatsappConfigPath)) {
      const data = fs.readFileSync(whatsappConfigPath, "utf8");
      let config = JSON.parse(data);

      if (config.enabled !== undefined) {
        config.studentNotificationsEnabled = config.enabled;
        delete config.enabled;
      }

      return { ...defaultConfig, ...config };
    }
    console.log(
      "Registrar Route: Archivo de config WhatsApp no encontrado, usando default."
    );
  } catch (error) {
    console.error(
      "Registrar Route: Error leyendo configuración de WhatsApp:",
      error
    );
  }
  return defaultConfig;
};

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

  let usuarios = [];
  try {
    if (!fs.existsSync(usuariosPath)) {
      console.error(
        "Registrar Route: Error CRÍTICO - usuarios.json no existe."
      );
      return res.status(500).json({
        exito: false,
        mensaje: "Error interno: Falta archivo de usuarios.",
      });
    }
    usuarios = JSON.parse(fs.readFileSync(usuariosPath, "utf8"));
  } catch (err) {
    console.error("Registrar Route: Error al leer usuarios.json:", err);
    return res
      .status(500)
      .json({ exito: false, mensaje: "Error interno al buscar usuario." });
  }

  const usuario = usuarios.find((u) => u.codigo === codigo);

  if (!usuario) {
    console.log(`Registrar Route: Código no encontrado - ${codigo}`);
    return res
      .status(404)
      .json({ exito: false, mensaje: "Código no encontrado" });
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
      // --- MODIFICADO: Pasar 'usuario.ciclo' a estadoAsistencia ---
      const estado = estadoAsistencia(usuario.ciclo, usuario.turno, horaStr);
      let estadoEmoji = "";
      if (estado === "puntual") estadoEmoji = "✅";
      else if (estado === "tolerancia") estadoEmoji = "⚠️";
      else if (estado === "tarde") estadoEmoji = "❌";

      // --- Añadir (J) al mensaje de WhatsApp si está justificado ---
      let justificadoStr = "";
      if (isJustified && (estado === "tarde" || estado === "tolerancia")) {
        estadoEmoji = "🟠"; // Naranja para justificado
        justificadoStr = " (J)";
      }

      mensajeWhatsapp = `*${getFullName(usuario)}* (${usuario.ciclo} - ${
        usuario.turno
      })\nIngreso: *${hora12h}${justificadoStr}* ${estadoEmoji}`;
      // --- Fin modificación WhatsApp ---

      if (!isScheduledToday) {
        mensajeWhatsapp += `\n_(Registro fuera de día programado)_`;
      }

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
      mensajeWhatsapp = `Docente *${getFullName(
        usuario
      )}*\nIngreso: *${hora12h}* 👨‍🏫`;
      const isTeacherScheduled =
        usuario.dias_asistencia && usuario.dias_asistencia.includes(diaAbbr);
      if (!isTeacherScheduled) {
        mensajeWhatsapp += `\n_(Registro fuera de día programado)_`;
      }
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
