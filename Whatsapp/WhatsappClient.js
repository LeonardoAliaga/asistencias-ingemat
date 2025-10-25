const { Client, LocalAuth, NoAuth, MessageMedia } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const color = require("ansi-colors");
const fs = require("fs");

// Variable para controlar si el cliente está listo
let isWhatsappReady = false;
let whatsappClient = null;

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
      // Descomenta si necesitas ejecutar sin interfaz gráfica en un servidor
      // puppeteer: {
      //   headless: true,
      //   args: ["--no-sandbox", "--disable-setuid-sandbox"],
      // }
    });

    whatsappClient.on("qr", (qr) => {
      console.log(`${color.yellow("Whatsapp")} Escanea el código QR:`);
      qrcode.generate(qr, { small: true });
    });

    whatsappClient.on("ready", async () => {
      isWhatsappReady = true;
      console.log(
        `${color.green("Whatsapp")} está listo en ${color.cyan(
          "Asistencias Ingemat"
        )}`
      );
      // Opcional: Enviar mensaje de inicio a un número específico
      // sendMessage("51912813634@c.us", "PanquiBot está listo crack!");
    });

    whatsappClient.on("auth_failure", (error) => {
      isWhatsappReady = false;
      console.error(`${color.red("Whatsapp")} Fallo de autenticación:`, error);
      // Aquí podrías intentar reiniciar o notificar de alguna manera
    });

    whatsappClient.on("disconnected", (reason) => {
      isWhatsappReady = false;
      console.warn(`${color.yellow("Whatsapp")} Desconectado:`, reason);
      // Intentar reiniciar el cliente podría ser una opción aquí
      // initializeWhatsappClient(); // Cuidado con bucles infinitos
    });

    whatsappClient.on("error", (error) => {
      isWhatsappReady = false;
      console.error(`${color.red("Whatsapp Error:")}`, error);
      // Manejo genérico de errores del cliente
    });

    whatsappClient.initialize().catch((error) => {
      isWhatsappReady = false;
      console.error(`${color.red("Whatsapp")} Error al inicializar:`, error);
    });
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
    return false; // Indica que no se envió
  }
  try {
    // Añade el sufijo @c.us si es un número y no lo tiene
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

    await whatsappClient.sendMessage(chatId, `${message}\n\n_Ingemat_`);
    console.log(`${color.green("Whatsapp")} Mensaje enviado a ${chatId}`);
    return true; // Indica que se envió (o al menos se intentó sin error)
  } catch (error) {
    console.error(
      `${color.red("Whatsapp")} Error al enviar mensaje a ${to}:`,
      error.message
    );
    // Si el error es por chat no encontrado, podría ser útil
    if (error.message.includes("Chat not found")) {
      console.warn(
        `${color.yellow("Whatsapp")} El chat ${to} no fue encontrado.`
      );
    }
    return false; // Indica que hubo un error
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
    return groups;
  } catch (error) {
    console.error(`${color.red("Whatsapp")} Error al obtener chats:`, error);
    return [];
  }
};

// Llama a la inicialización al cargar el módulo
initializeWhatsappClient();

module.exports = {
  // No exportamos el cliente directamente para controlar el acceso
  // whatsappClient,
  sendMessage,
  getGroupChats,
  isWhatsappReady: () => isWhatsappReady, // Función para verificar el estado
};
