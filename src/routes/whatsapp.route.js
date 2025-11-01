// Proyecto/src/routes/whatsapp.route.js
const express = require("express");
const fs = require("fs");
const path = require("path");
const {
  getGroupChats,
  isWhatsappReady,
  getQR,
  forceRestart,
} = require("../../Whatsapp/WhatsappClient"); // Importar funciones necesarias

const router = express.Router();
const configPath = path.join(__dirname, "../../data/whatsappConfig.json");

// Función para leer la configuración (MODIFICADA)
const readConfig = () => {
  const defaultConfig = {
    enabled: false,
    studentRules: [],
    teacherTargetType: "number", // <--- NUEVO
    teacherTargetId: null, // <--- NUEVO (reemplaza a teacherNumber)
  };

  try {
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, "utf8");
      let config = JSON.parse(data);

      // --- Lógica de Migración ---
      // Si encontramos el formato antiguo (teacherNumber), lo convertimos al nuevo
      if (config.teacherNumber !== undefined) {
        console.log(
          "Config WhatsApp: Detectado formato antiguo (teacherNumber), migrando a nuevo formato."
        );
        config.teacherTargetType = "number";
        config.teacherTargetId = config.teacherNumber;
        delete config.teacherNumber; // Eliminar la clave antigua
      }
      // --- Fin Migración ---

      // Fusionar con el default para asegurar que todas las claves existan
      return { ...defaultConfig, ...config };
    }
  } catch (error) {
    console.error("Error leyendo configuración de WhatsApp:", error);
  }
  // Devuelve un objeto con la estructura por defecto si no existe o hay error
  return defaultConfig;
};

// Función para guardar la configuración (SIN CAMBIOS, ya guarda el objeto)
const saveConfig = (config) => {
  try {
    // Asegurarse que la carpeta data exista
    const dataDir = path.dirname(configPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log("Configuración de WhatsApp guardada:", config); // Log al guardar
    return true;
  } catch (error) {
    console.error("Error guardando configuración de WhatsApp:", error);
    return false;
  }
};

// --- RUTAS API ---

// GET /whatsapp/api/config - Obtener configuración actual
router.get("/config", (req, res) => {
  console.log("Recibida petición GET /whatsapp/api/config"); // Log
  const config = readConfig();
  console.log("Configuración leída:", config); // Log
  res.json({ exito: true, config });
});

// POST /whatsapp/api/config - Guardar nueva configuración (MODIFICADA)
router.post("/config", (req, res) => {
  console.log("Recibida petición POST /whatsapp/api/config"); // Log
  const newConfig = req.body;
  console.log("Datos recibidos para guardar:", newConfig); // Log
  // Validación de la nueva estructura
  if (
    typeof newConfig.enabled !== "boolean" ||
    !Array.isArray(newConfig.studentRules) ||
    !newConfig.teacherTargetType // Validar que exista la nueva clave
  ) {
    console.error("Datos de configuración inválidos recibidos.");
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

// GET /whatsapp/api/status - Obtener estado de conexión de WhatsApp
router.get("/status", (req, res) => {
  console.log("Recibida petición GET /whatsapp/api/status"); // Log
  const readyState = isWhatsappReady();
  console.log("Estado WhatsApp:", readyState); // Log
  res.json({ exito: true, isReady: readyState });
});

// GET /whatsapp/api/qr - Obtener el QR si existe
router.get("/qr", (req, res) => {
  console.log("Recibida petición GET /whatsapp/api/qr");
  const qr = getQR();
  res.json({ exito: true, qr: qr }); // Devuelve el QR (puede ser null)
});

// GET /whatsapp/api/groups - Obtener lista de grupos
router.get("/groups", async (req, res) => {
  console.log("Recibida petición GET /whatsapp/api/groups"); // Log
  if (!isWhatsappReady()) {
    console.log("Estado WhatsApp: No listo"); // Log
    return res.status(503).json({
      exito: false,
      mensaje: "WhatsApp no está conectado.",
      groups: [],
    });
  }
  try {
    console.log("Llamando a getGroupChats..."); // Log
    const groups = await getGroupChats();
    console.log(`getGroupChats devolvió ${groups.length} grupos.`); // Log más conciso
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

// POST /whatsapp/api/restart - Forzar reinicio
router.post("/restart", (req, res) => {
  console.log("Recibida petición POST /whatsapp/api/restart");
  try {
    forceRestart("manual_restart_request"); // Llama a la función exportada
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

module.exports = router;
