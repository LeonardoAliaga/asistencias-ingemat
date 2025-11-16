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
necesarias;
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

module.exports = router;
