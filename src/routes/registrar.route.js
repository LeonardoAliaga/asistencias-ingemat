// src/routes/registrar.route.js
const express = require("express");
const fs = require("fs");
const path = require("path");
const { guardarRegistro } = require("../services/excel.service"); // Ajusta la ruta si es necesario
const {
  estadoAsistencia,
  getDayAbbreviation,
  convertTo12Hour, // Importar desde helpers
  normalizarTexto, // Posiblemente no necesario aquí, pero por si acaso
} = require("../utils/helpers");
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

// Función para leer config de WhatsApp (específica para esta ruta)
// (Usamos la misma lógica de migración que en whatsapp.route.js para ser seguros)
const readWhatsappConfig = () => {
  const defaultConfig = {
    enabled: false,
    studentRules: [],
    teacherTargetType: "number",
    teacherTargetId: null,
  };
  try {
    if (fs.existsSync(whatsappConfigPath)) {
      const data = fs.readFileSync(whatsappConfigPath, "utf8");
      let config = JSON.parse(data);

      if (config.teacherNumber !== undefined) {
        config.teacherTargetType = "number";
        config.teacherTargetId = config.teacherNumber;
        delete config.teacherNumber;
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
  // La ruta base "/" corresponde a /api/registrar
  const { codigo } = req.body;
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
  const hora12h = convertTo12Hour(horaStr);

  console.log(
    `\nRegistrar Route: Procesando ${usuario.nombre} (${usuario.rol}) - Código: ${codigo}`
  );
  console.log(
    ` - Fecha: ${fechaStr}, Hora: ${horaStr} (${hora12h}), Día: ${diaAbbr}`
  );

  const isScheduledToday =
    usuario.rol !== "estudiante" ||
    (usuario.dias_asistencia && usuario.dias_asistencia.includes(diaAbbr));
  if (!isScheduledToday) {
    console.log(
      `Registrar Route: ${usuario.nombre} NO tiene clases programadas hoy (${diaAbbr}), pero se permite registrar.`
    );
  }

  console.log(
    `Registrar Route: Intentando guardar en Excel con hora ${horaStr}...`
  );
  const guardado = await guardarRegistro(usuario, fechaStr, horaStr);

  if (!guardado) {
    console.log(
      `Registrar Route: ${usuario.nombre} ya tiene registro de hora válido hoy.`
    );
    return res.status(409).json({
      exito: false,
      mensaje: `${usuario.nombre} ya tiene un registro de hora válido hoy.`,
    });
  }
  console.log(
    `Registrar Route: Guardado en Excel exitoso para ${usuario.nombre}.`
  );

  // --- Lógica de Envío de WhatsApp (MODIFICADA) ---
  const whatsappConfig = readWhatsappConfig();
  let whatsappEnviado = false;
  let mensajeWhatsapp = "";
  let destinatarioWhatsapp = null;

  if (whatsappConfig.enabled && isWhatsappReady()) {
    console.log("Registrar Route: Verificando reglas de WhatsApp...");
    if (usuario.rol === "estudiante") {
      const estado = estadoAsistencia(usuario.turno, horaStr);
      let estadoEmoji = "";
      if (estado === "puntual") estadoEmoji = "✅";
      else if (estado === "tolerancia") estadoEmoji = "⚠️";
      else if (estado === "tarde") estadoEmoji = "❌";

      mensajeWhatsapp = `*${usuario.nombre}* (${usuario.ciclo} - ${usuario.turno})\nIngreso: *${hora12h}* ${estadoEmoji}`;
      if (!isScheduledToday) {
        mensajeWhatsapp += `\n_(Registro fuera de día programado)_`;
      }

      const regla = whatsappConfig.studentRules.find(
        (r) => r.ciclo === usuario.ciclo && r.turno === usuario.turno
      );
      if (regla) {
        destinatarioWhatsapp = regla.targetId;
        console.log(
          ` - Regla encontrada para Estudiante: Enviar a ${regla.targetType} ${destinatarioWhatsapp}`
        );
      } else {
        console.log(
          ` - No se encontró regla de WhatsApp para ${usuario.ciclo} - ${usuario.turno}.`
        );
      }
    } else if (usuario.rol === "docente") {
      // --- LÓGICA DE DOCENTE MODIFICADA ---
      mensajeWhatsapp = `Docente *${usuario.nombre}*\nIngreso: *${hora12h}* 👨‍🏫`;
      const isTeacherScheduled =
        usuario.dias_asistencia && usuario.dias_asistencia.includes(diaAbbr);
      if (!isTeacherScheduled) {
        mensajeWhatsapp += `\n_(Registro fuera de día programado)_`;
        console.log(
          `Registrar Route: Docente ${usuario.nombre} registrando fuera de día programado (${diaAbbr}).`
        );
      }

      destinatarioWhatsapp = whatsappConfig.teacherTargetId; // <--- USAR NUEVA CLAVE
      if (destinatarioWhatsapp) {
        console.log(
          ` - Regla encontrada para Docente: Enviar a ${whatsappConfig.teacherTargetType} ${destinatarioWhatsapp}` // <--- Log mejorado
        );
      } else {
        console.log(
          ` - No se configuró un destinatario para notificaciones de docentes.` // <--- Mensaje mejorado
        );
      }
      // --- FIN LÓGICA DE DOCENTE ---
    }

    if (destinatarioWhatsapp && mensajeWhatsapp) {
      whatsappEnviado = await sendMessage(
        destinatarioWhatsapp,
        mensajeWhatsapp
      );
      if (!whatsappEnviado) {
        console.warn(
          "Registrar Route: No se pudo enviar el mensaje de WhatsApp (ver logs de WhatsappClient)."
        );
      }
    } else {
      console.log(
        "Registrar Route: No hay destinatario o mensaje para enviar por WhatsApp."
      );
    }
  } else if (whatsappConfig.enabled && !isWhatsappReady()) {
    console.warn(
      "Registrar Route: Notificación WhatsApp habilitada pero el cliente no está listo."
    );
  } else {
    console.log("Registrar Route: Notificaciones de WhatsApp deshabilitadas.");
  }

  // --- Respuesta al Cliente ---
  let estadoRespuesta = "";
  if (usuario.rol === "estudiante") {
    estadoRespuesta = estadoAsistencia(usuario.turno, horaStr);
  }

  const responseData = {
    exito: true,
    nombre: usuario.nombre,
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
  console.log("Registrar Route: Respuesta enviada al frontend:", responseData);
  res.json(responseData);
});

module.exports = router;
