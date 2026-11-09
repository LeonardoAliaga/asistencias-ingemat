const express = require("express");
const notifications = require("../services/notifications.service");
const router = express.Router();
router.get("/status", (req, res) =>
  res.json({
    exito: true,
    ready: notifications.status().configured,
    provider: "meta_cloud",
    ...notifications.status(),
  }),
);
router.get("/config", (req, res) =>
  res.json({ exito: true, config: notifications.getConfig() }),
);
router.get("/groups", (req, res) =>
  res
    .status(409)
    .json({
      exito: false,
      mensaje:
        "La conexión oficial de esta versión envía avisos individuales. Los grupos de salón no son compatibles con esta integración.",
    }),
);
router.get("/qr", (req, res) =>
  res.json({
    exito: true,
    qr: null,
    mensaje:
      "Configura WhatsApp Business Platform desde Comunicación. No se utiliza un código QR de WhatsApp Web.",
  }),
);
router.post(
  ["/restart", "/config", "/send-report-manual", "/send-carnet"],
  (req, res) =>
    res
      .status(410)
      .json({
        exito: false,
        mensaje:
          "Esta función usa el transporte anterior. Configura la API oficial y los contactos en Comunicación.",
      }),
);
module.exports = router;
