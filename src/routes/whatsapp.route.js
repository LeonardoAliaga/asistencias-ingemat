// Proyecto/src/routes/whatsapp.route.js
const express = require("express");
const fs = require("fs");
const path = require("path");
const {
  getGroupChats,
  isWhatsappReady,
  getQR,
  forceRestart,
  sendMessage,
  MessageMedia,
} = require("../../Whatsapp/WhatsappClient");
const { generateReportImage } = require("../services/report-generator"); // Importar generador

const router = express.Router();
const configPath = path.join(__dirname, "../../data/whatsappConfig.json");

// Función para leer la configuración (MODIFICADA)
const readConfig = () => {
  const defaultConfig = {
    enabledGeneral: false,
    studentNotificationsEnabled: false,
    teacherNotificationsEnabled: false,
    automatedReportEnabled: false,
    studentRules: [],
    teacherTargetType: "number",
    teacherTargetId: null,
    automatedReport: {
      sendTimeMañana: "08:50",
      sendTimeTarde: "17:00",
      targets: [],
    },
  };

  try {
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, "utf8");
      let config = JSON.parse(data);

      if (config.enabled !== undefined) {
        config.studentNotificationsEnabled = config.enabled;
        delete config.enabled;
      }
      if (
        config.automatedReport &&
        config.automatedReport.enabled !== undefined
      ) {
        config.automatedReportEnabled = config.automatedReport.enabled;
        delete config.automatedReport.enabled;
      }
      if (
        config.automatedReport &&
        config.automatedReport.sendTime !== undefined
      ) {
        config.automatedReport.sendTimeMañana = config.automatedReport.sendTime;
        delete config.automatedReport.sendTime;
      }

      let finalConfig = { ...defaultConfig, ...config };
      finalConfig.automatedReport = {
        ...defaultConfig.automatedReport,
        ...config.automatedReport,
      };
      return finalConfig;
    }
  } catch (error) {
    console.error("Error leyendo configuración de WhatsApp:", error);
  }
  return defaultConfig;
};

// Función para guardar la configuración
const saveConfig = (config) => {
  try {
    const dataDir = path.dirname(configPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log("Configuración de WhatsApp guardada:", config);
    return true;
  } catch (error) {
    console.error("Error guardando configuración de WhatsApp:", error);
    return false;
  }
};

// --- RUTAS API ---

// GET /whatsapp/api/config
router.get("/config", (req, res) => {
  const config = readConfig();
  res.json({ exito: true, config });
});

// POST /whatsapp/api/config
router.post("/config", (req, res) => {
  const newConfig = req.body;
  // Validación de la nueva estructura
  if (
    typeof newConfig.enabledGeneral !== "boolean" ||
    typeof newConfig.studentNotificationsEnabled !== "boolean" ||
    typeof newConfig.teacherNotificationsEnabled !== "boolean" ||
    typeof newConfig.automatedReportEnabled !== "boolean" ||
    !Array.isArray(newConfig.studentRules) ||
    !newConfig.teacherTargetType ||
    !newConfig.automatedReport
  ) {
    console.error("Datos de configuración inválidos recibidos:", newConfig);
    return res
      .status(400)
      .json({ exito: false, mensaje: "Formato de configuración inválido." });
  }

  if (saveConfig(newConfig)) {
    res.json({ exito: true, mensaje: "Configuración de WhatsApp guardada." });
  } else {
    res
      .status(500)
      .json({ exito: false, mensaje: "Error al guardar la configuración." });
  }
});

// GET /whatsapp/api/status
router.get("/status", (req, res) => {
  const readyState = isWhatsappReady();
  res.json({ exito: true, isReady: readyState });
});

// GET /whatsapp/api/qr
router.get("/qr", (req, res) => {
  const qr = getQR();
  res.json({ exito: true, qr: qr });
});

// GET /whatsapp/api/groups
router.get("/groups", async (req, res) => {
  if (!isWhatsappReady()) {
    return res.status(503).json({
      exito: false,
      mensaje: "WhatsApp no está conectado.",
      groups: [],
    });
  }
  try {
    const groups = await getGroupChats();
    res.json({ exito: true, groups });
  } catch (error) {
    console.error("Error en API /groups:", error);
    res.status(500).json({
      exito: false,
      mensaje: "Error al obtener los grupos de WhatsApp.",
      groups: [],
    });
  }
});

// POST /whatsapp/api/restart
router.post("/restart", (req, res) => {
  try {
    forceRestart("manual_restart_request");
    res.json({
      exito: true,
      mensaje: "Reiniciando cliente de WhatsApp. Refresca en unos segundos.",
    });
  } catch (e) {
    res
      .status(500)
      .json({ exito: false, mensaje: "Error al intentar reiniciar." });
  }
});

// --- NUEVA RUTA PARA ENVÍO MANUAL ---
router.post("/send-report-manual", async (req, res) => {
  const { ciclo, turno, groupId } = req.body;
  console.log(
    `API: Solicitud de envío manual para ${ciclo} - ${turno} al grupo ${groupId}`
  );

  if (!isWhatsappReady()) {
    return res
      .status(503)
      .json({ exito: false, mensaje: "WhatsApp no está conectado." });
  }
  if (!ciclo || !turno || !groupId) {
    return res.status(400).json({
      exito: false,
      mensaje: "Faltan datos (ciclo, turno o groupId).",
    });
  }

  try {
    const imageBuffer = await generateReportImage(ciclo, turno);
    if (!imageBuffer) {
      return res.status(404).json({
        exito: false,
        mensaje: `No se encontraron datos de asistencia para ${ciclo} - ${turno}. Asegúrate que el archivo Excel del día exista.`,
      });
    }

    const media = new MessageMedia(
      "image/png",
      imageBuffer.toString("base64"),
      `Reporte Asistencia ${ciclo} ${turno}.png`
    );

    const sent = await sendMessage(groupId, media);

    if (sent) {
      res.json({ exito: true, mensaje: "Reporte enviado exitosamente." });
    } else {
      res
        .status(500)
        .json({ exito: false, mensaje: "Error al enviar el mensaje." });
    }
  } catch (error) {
    console.error("Error en envío manual:", error);
    res.status(500).json({
      exito: false,
      mensaje: `Error al generar la imagen: ${error.message}`,
    });
  }
});

// --- NUEVA RUTA: ENVÍO MANUAL DE CARNET ---
router.post("/send-carnet", async (req, res) => {
  const { number, imageBase64, nombre } = req.body;

  if (!isWhatsappReady()) {
    return res.status(503).json({ exito: false, mensaje: "WhatsApp no está conectado." });
  }
  if (!number || !imageBase64) {
    return res.status(400).json({ exito: false, mensaje: "Faltan datos (número o imagen)." });
  }

  try {
    // 1. Formatear número (añadir sufijo @c.us si no es un grupo)
    // Si el usuario pone 51999..., lo convertimos. Si pone un ID de grupo, lo dejamos.
    let chatId = number;
    if (!number.includes('@')) {
        chatId = `${number}@c.us`;
    }

    // 2. Preparar la imagen (Media)
    // Quitamos el prefijo data:image/... si viene
    const base64Data = imageBase64.replace(/^data:image\/png;base64,/, "");
    const media = new MessageMedia('image/png', base64Data, 'carnet.png');

    // 3. Enviar mensaje
    // Usamos tu función importada 'sendMessage' que ya maneja la lógica interna
    const caption = `Hola ${nombre || 'Estudiante'}, aquí tienes tu carnet digital de INGEMAT.`;
    const sent = await sendMessage(chatId, media);
    
    // NOTA: sendMessage actualmente devuelve true/false, pero si envías media
    // quizás quieras enviar el caption por separado o modificar sendMessage en WhatsappClient.js
    // Para no complicar, enviamos la imagen y luego el texto si lo deseas, 
    // o asumimos que la imagen habla por sí sola.
    // Si tu sendMessage soporta caption en el objeto media (whatsapp-web.js nativo lo hace, pero tu wrapper no parece recibirlo explícitamente).
    // Por ahora, enviamos solo la imagen.
    
    if (sent) {
        // Opcional: Enviar saludo textual después
        await sendMessage(chatId, caption); 
        res.json({ exito: true, mensaje: "Carnet enviado correctamente." });
    } else {
        res.status(500).json({ exito: false, mensaje: "No se pudo enviar el mensaje (ver logs)." });
    }

  } catch (error) {
    console.error("Error en /send-carnet:", error);
    res.status(500).json({ exito: false, mensaje: `Error interno: ${error.message}` });
  }
});

module.exports = router;

module.exports = router;
