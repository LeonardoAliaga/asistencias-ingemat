const { fork } = require("node:child_process");
const { EventEmitter } = require("node:events");
const path = require("node:path");
const fs = require("node:fs");
const config = require("../config");
const REVIEW_NOTE =
  "WhatsApp no está disponible. Revisa el paquete Baileys y su versión. La aplicación sigue funcionando y los avisos pendientes se conservan.";
function createBaileysService({
  spawn = fork,
  workerPath = path.join(__dirname, "../whatsapp/baileys-worker.cjs"),
  authDir = path.join(config.dataDir, "whatsapp"),
  timeoutMs = 25000,
  bootMs = 30000,
  watchdogMs = 45000,
  tickMs = 5000,
} = {}) {
  const events = new EventEmitter();
  let child = null,
    generation = 0,
    sequence = 0,
    bootTimer,
    watchTimer,
    lastBeat = 0;
  let snapshot = {
    state: "idle",
    needsPackageReview: false,
    code: "",
    note: "Conecta WhatsApp y vincula tu teléfono antes de activar los avisos.",
  };
  let qr = null;
  const pending = new Map();
  const status = () => ({
    ...snapshot,
    connected: snapshot.state === "connected",
    version: "7.0.0-rc14",
    qrAvailable: !!qr && qr.expiresAt > Date.now(),
    qrExpiresAt: qr?.expiresAt || null,
  });
  function unavailable(code, unknown = false) {
    return Object.assign(new Error(REVIEW_NOTE), {
      code,
      deliveryUnknown: unknown,
      notSent: !unknown,
    });
  }
  function detach(code = "BAILEYS_STOPPED") {
    clearTimeout(bootTimer);
    clearInterval(watchTimer);
    qr = null;
    const previous = child;
    child = null;
    generation++;
    for (const entry of pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(unavailable(code, true));
    }
    pending.clear();
    if (previous) {
      try {
        previous.kill();
      } catch {}
    }
    return previous;
  }
  function fault(code) {
    detach(code);
    snapshot = {
      state: "error",
      needsPackageReview: true,
      code,
      note: REVIEW_NOTE,
    };
    console.warn("[WhatsApp] Servicio aislado detenido", { code });
  }
  function connect() {
    if (child && snapshot.state === "pairing" && !status().qrAvailable) stop();
    if (child) return status();
    const token = ++generation;
    snapshot = {
      state: "starting",
      needsPackageReview: false,
      code: "",
      note: "Iniciando el componente aislado de WhatsApp…",
    };
    qr = null;
    try {
      child = spawn(workerPath, [], {
        env: { ...process.env, INGEMAT_WA_AUTH_DIR: authDir },
        execArgv: ["--max-old-space-size=256"],
        stdio: ["ignore", "ignore", "ignore", "ipc"],
        windowsHide: true,
      });
      const current = child;
      lastBeat = Date.now();
      bootTimer = setTimeout(() => {
        if (generation === token) fault("BAILEYS_BOOT_TIMEOUT");
      }, bootMs);
      bootTimer.unref?.();
      watchTimer = setInterval(() => {
        if (generation === token && Date.now() - lastBeat > watchdogMs)
          fault("BAILEYS_UNRESPONSIVE");
      }, tickMs);
      watchTimer.unref?.();
      current.on("error", () => {
        if (generation === token) fault("BAILEYS_PROCESS_ERROR");
      });
      current.on("exit", () => {
        if (generation === token) fault("BAILEYS_PROCESS_EXIT");
      });
      current.on("disconnect", () => {
        if (generation === token) fault("BAILEYS_IPC_CLOSED");
      });
      current.on("message", (message) => {
        if (generation !== token || !message || typeof message !== "object")
          return;
        try {
          if (message.type === "heartbeat") {
            lastBeat = Date.now();
            return;
          }
          if (message.type === "fault") {
            fault(
              /^[A-Z0-9_]{1,60}$/.test(message.code)
                ? message.code
                : "BAILEYS_WORKER_ERROR",
            );
            return;
          }
          if (
            message.type === "state" &&
            [
              "connecting",
              "pairing",
              "connected",
              "reconnecting",
              "logged_out",
            ].includes(message.state)
          ) {
            clearTimeout(bootTimer);
            if (message.state !== "pairing") qr = null;
            const warning = ["reconnecting", "logged_out"].includes(
              message.state,
            );
            snapshot = {
              state: message.state,
              needsPackageReview: warning,
              code: warning ? "BAILEYS_CONNECTION_CLOSED" : "",
              note: warning
                ? REVIEW_NOTE
                : message.state === "connected"
                  ? "WhatsApp conectado. Los envíos dependen de la activación de avisos."
                  : message.state === "pairing"
                    ? "En tu teléfono abre WhatsApp → Dispositivos vinculados → Vincular un dispositivo."
                    : "Conectando con WhatsApp…",
            };
          } else if (
            message.type === "qr" &&
            typeof message.dataUrl === "string" &&
            message.dataUrl.startsWith("data:image/png;base64,") &&
            message.dataUrl.length < 200000
          ) {
            qr = { dataUrl: message.dataUrl, expiresAt: Date.now() + 60000 };
          } else if (message.type === "result") {
            const entry = pending.get(message.id);
            if (!entry) return;
            pending.delete(message.id);
            clearTimeout(entry.timer);
            if (message.ok && message.messageId === entry.messageId)
              entry.resolve(message.messageId);
            else
              entry.reject(
                unavailable("BAILEYS_SEND_ERROR", message.notSent !== true),
              );
          } else if (
            message.type === "delivery" &&
            typeof message.messageId === "string" &&
            ["sent", "delivered", "read", "failed"].includes(message.status)
          ) {
            events.emit("delivery", {
              id: message.messageId,
              status: message.status,
            });
          }
        } catch {
          fault("BAILEYS_EVENT_ERROR");
        }
      });
    } catch {
      fault("BAILEYS_SPAWN_ERROR");
    }
    return status();
  }
  function sendText(recipient, text, messageId) {
    if (!child || snapshot.state !== "connected")
      return Promise.reject(unavailable("BAILEYS_OFFLINE"));
    if (
      !/^\+[1-9]\d{7,14}$/.test(recipient) ||
      typeof text !== "string" ||
      !text.trim() ||
      text.length > 6000 ||
      !/^[A-Z0-9]{16,64}$/.test(messageId)
    )
      return Promise.reject(unavailable("BAILEYS_INVALID_MESSAGE"));
    const current = child,
      token = generation,
      id = String(++sequence);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (generation === token) fault("BAILEYS_SEND_TIMEOUT");
      }, timeoutMs);
      timer.unref?.();
      pending.set(id, { resolve, reject, timer, messageId });
      try {
        current.send(
          { type: "send", id, recipient, text, messageId },
          (error) => {
            if (error && generation === token) fault("BAILEYS_IPC_ERROR");
          },
        );
      } catch {
        fault("BAILEYS_IPC_ERROR");
      }
    });
  }
  function stop() {
    const previous = detach();
    snapshot = {
      state: "stopped",
      needsPackageReview: false,
      code: "",
      note: "Conexión detenida. La sesión se conserva para volver a conectar.",
    };
    return previous;
  }
  async function reset() {
    const previous = stop();
    if (previous && previous.exitCode == null)
      await new Promise((resolve) => {
        const timer = setTimeout(() => {
          try {
            previous.kill("SIGKILL");
          } catch {}
          resolve();
        }, 2000);
        previous.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    try {
      for (const suffix of ["", "-wal", "-shm"])
        fs.rmSync(path.join(authDir, "baileys-auth.db" + suffix), {
          force: true,
        });
    } catch {
      fault("BAILEYS_SESSION_RESET_ERROR");
    }
    return status();
  }
  function getQR() {
    return status().qrAvailable ? { ...qr } : null;
  }
  return {
    status,
    connect,
    stop,
    reset,
    sendText,
    getQR,
    onDelivery: (callback) => events.on("delivery", callback),
  };
}
const service = createBaileysService();
module.exports = { ...service, createBaileysService, REVIEW_NOTE };
