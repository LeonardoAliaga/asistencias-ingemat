const { Client, LocalAuth, NoAuth, MessageMedia } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const color = require("ansi-colors");
const fs = require("fs");
const path = require("path"); // <--- AÑADIDO

// Variable para controlar si el cliente está listo
let isWhatsappReady = false;
let whatsappClient = null;
let currentQR = null;

const localAuthPath = path.join(__dirname, "../../LocalAuth"); // <--- AÑADIDO

// --- NUEVA FUNCIÓN DE REINICIO ---
const deleteLocalAuthAndRestart = (trigger = "unknown") => {
  console.warn(
    `${color.red(
      "Whatsapp"
    )} Fallo de sesión (${trigger}). Borrando LocalAuth y reiniciando...`
  );
  isWhatsappReady = false;
  currentQR = null;

  // 1. Destruir el cliente actual en memoria para liberar archivos
  const destroyPromise = whatsappClient
    ? whatsappClient.destroy().catch((e) => {
        console.warn(
          `${color.yellow("Whatsapp")} Error al destruir cliente (esperado):`,
          e.message
        );
      })
    : Promise.resolve();

  whatsappClient = null;

  // 2. Esperar a que se destruya y luego borrar la carpeta
  destroyPromise.then(() => {
    setTimeout(() => {
      try {
        if (fs.existsSync(localAuthPath)) {
          fs.rmSync(localAuthPath, { recursive: true, force: true });
          console.log(
            `${color.green("Whatsapp")} Carpeta LocalAuth borrada exitosamente.`
          );
        }
      } catch (e) {
        console.error(
          `${color.red(
            "Whatsapp"
          )} Error al borrar LocalAuth (EBUSY?). Es posible que se requiera un reinicio manual de la app.`,
          e.message
        );
        // Si falla aquí (ej. EBUSY de nuevo), no podemos hacer más.
        // Pero al menos ya no debería crashear la app.
        return; // No intentar reiniciar si no se pudo borrar
      }

      // 3. Reiniciar la inicialización
      console.log(`${color.yellow("Whatsapp")} Reiniciando cliente...`);
      initializeWhatsappClient();
    }, 1000); // 1 segundo de espera para que el SO libere los archivos
  });
};
// --- FIN NUEVA FUNCIÓN ---

const initializeWhatsappClient = () => {
  console.log(`${color.yellow("Whatsapp")} Inicializando...`);
  try {
    whatsappClient = new Client({
      authStrategy: new LocalAuth({
        dataPath: "LocalAuth",
      }),
      webVersionCache: {
        type: "remote",
        remotePath:
          "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html",
      },
      // puppeteer: {
      //   headless: true,
      //   args: ["--no-sandbox", "--disable-setuid-sandbox"],
      // }
    });

    whatsappClient.on("qr", (qr) => {
      currentQR = qr; // Almacena el QR
      console.log(
        `${color.yellow(
          "Whatsapp"
        )} QR Recibido. Almacenado para el panel admin.`
      );
      qrcode.generate(qr, { small: true });
    });

    whatsappClient.on("ready", async () => {
      currentQR = null; // Limpia el QR al conectar
      isWhatsappReady = true;
      console.log(
        `${color.green("Whatsapp")} está listo en ${color.cyan(
          "Asistencias Ingemat"
        )}`
      );
    });

    // --- MANEJO DE FALLOS MODIFICADO ---
    whatsappClient.on("auth_failure", (error) => {
      isWhatsappReady = false;
      console.error(`${color.red("Whatsapp")} Fallo de autenticación:`, error);
      deleteLocalAuthAndRestart("auth_failure"); // <--- LLAMAR A REINICIO
    });

    whatsappClient.on("disconnected", (reason) => {
      currentQR = null;
      isWhatsappReady = false;
      console.warn(`${color.yellow("Whatsapp")} Desconectado:`, reason);
      // Si la razón es una desconexión (logout), borramos la sesión
      if (reason) {
        deleteLocalAuthAndRestart("disconnected"); // <--- LLAMAR A REINICIO
      }
    });
    // --- FIN MANEJO DE FALLOS ---

    whatsappClient.on("error", (error) => {
      isWhatsappReady = false;
      console.error(`${color.red("Whatsapp Error:")}`, error);
      // Errores genéricos
    });

    // --- CAPTURA DE ERROR MODIFICADA ---
    whatsappClient.initialize().catch((error) => {
      isWhatsappReady = false;
      console.error(
        `${color.red("Whatsapp")} Error CRÍTICO al inicializar:`,
        error.message
      );
      // Aquí capturamos el EBUSY y evitamos el crash
      if (
        error.message.includes("EBUSY") ||
        error.message.includes("unlink") ||
        error.message.includes("resource busy or locked")
      ) {
        console.warn(
          `${color.yellow(
            "Whatsapp"
          )} Error EBUSY detectado. La sesión está bloqueada o corrupta.`
        );
        deleteLocalAuthAndRestart("initialize_catch_ebusy"); // <--- LLAMAR A REINICIO
      } else {
        // Otro error de inicialización, intentar reiniciar por si acaso
        deleteLocalAuthAndRestart("initialize_catch_other");
      }
    });
    // --- FIN CAPTURA DE ERROR ---
  } catch (error) {
    isWhatsappReady = false;
    console.error(
      `${color.red("Whatsapp")} Error crítico al crear el cliente:`,
      error
    );
  }
};

const sendMessage = async (to, message) => {
  if (!isWhatsappReady || !whatsappClient) {
    console.warn(
      `${color.yellow("Whatsapp")} no está listo. Mensaje no enviado a ${to}.`
    );
    return false;
  }
  try {
    let chatId = to;
    if (/^\d+$/.test(to) && !to.includes("@")) {
      chatId = `${to}@c.us`;
    } else if (!to.includes("@g.us") && !to.includes("@c.us")) {
      console.warn(
        `${color.yellow(
          "Whatsapp"
        )} Destinatario inválido: ${to}. No es número ni ID de grupo.`
      );
      return false;
    }
    if (typeof message === "string") {
      await whatsappClient.sendMessage(chatId, `${message}\n\n_Ingemat_`);
    } else {
      await whatsappClient.sendMessage(chatId, message);
    }

    console.log(`${color.green("Whatsapp")} Mensaje enviado a ${chatId}`);
    return true;
  } catch (error) {
    console.error(
      `${color.red("Whatsapp")} Error al enviar mensaje a ${to}:`,
      error.message
    );
    if (error.message.includes("Chat not found")) {
      console.warn(
        `${color.yellow("Whatsapp")} El chat ${to} no fue encontrado.`
      );
    }
    return false;
  }
};

const getGroupChats = async () => {
  if (!isWhatsappReady || !whatsappClient) {
    console.warn(
      `${color.yellow("Whatsapp")} no está listo para obtener chats.`
    );
    return [];
  }
  try {
    const chats = await whatsappClient.getChats();
    const groups = chats
      .filter((chat) => chat.isGroup)
      .map((chat) => ({ id: chat.id._serialized, name: chat.name }));
    // --- NUEVO CONSOLE.LOG ---
    console.log(
      `${color.magenta("WhatsappClient")} getGroupChats: Encontrados ${
        groups.length
      } grupos.`
    );
    // --- FIN CONSOLE.LOG ---
    return groups;
  } catch (error) {
    console.error(`${color.red("Whatsapp")} Error al obtener chats:`, error);
    return [];
  }
};

// Llama a la inicialización al cargar el módulo
initializeWhatsappClient();

module.exports = {
  sendMessage,
  getGroupChats,
  isWhatsappReady: () => isWhatsappReady,
  getQR: () => currentQR,
  forceRestart: deleteLocalAuthAndRestart,
  MessageMedia,
};
