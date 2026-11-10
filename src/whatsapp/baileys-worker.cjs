// This process owns the third-party package, network connection and auth database.
// It never imports the academy database, HTTP app or academic services.
const QRCode = require("qrcode");
const { openAuthStore } = require("./auth-store.cjs");
const { GROUP_ID, isPhone, mediaContent } = require("./media.cjs");
let socket,
  store,
  reconnectTimer,
  stopped = false,
  attempts = 0,
  sending = false,
  socketGeneration = 0;
const emit = (message) => {
  if (process.connected) process.send(message);
};
function fatal(code) {
  if (stopped) return;
  stopped = true;
  clearTimeout(reconnectTimer);
  try {
    emit({ type: "fault", code });
  } catch {}
  setTimeout(() => process.exit(1), 25);
}
process.on("uncaughtException", () => fatal("BAILEYS_UNCAUGHT_ERROR"));
process.on("unhandledRejection", () => fatal("BAILEYS_REJECTED_PROMISE"));
const heartbeat = setInterval(() => emit({ type: "heartbeat" }), 5000);
heartbeat.unref();
function close() {
  stopped = true;
  clearTimeout(reconnectTimer);
  try {
    socket?.end(new Error("Local shutdown"));
  } catch {}
  try {
    store?.close();
  } catch {}
  process.exit(0);
}
process.on("disconnect", close);
process.on("SIGTERM", close);
const logger = {
  level: "silent",
  child() {
    return this;
  },
  trace() {},
  debug() {},
  info() {},
  warn() {},
  error() {},
  fatal() {},
};
async function start() {
  let baileys;
  try {
    baileys = await import("@whiskeysockets/baileys");
  } catch {
    fatal("BAILEYS_PACKAGE_LOAD_ERROR");
    return;
  }
  if (
    typeof baileys.default !== "function" ||
    !baileys.initAuthCreds ||
    !baileys.BufferJSON ||
    !baileys.proto
  ) {
    fatal("BAILEYS_INCOMPATIBLE_PACKAGE");
    return;
  }
  if (process.argv.includes("--diagnose")) {
    console.log(
      "Baileys 7.0.0-rc14: carga y contratos básicos correctos. No se conectó ninguna cuenta.",
    );
    process.exit(0);
  }
  try {
    store = openAuthStore(process.env.INGEMAT_WA_AUTH_DIR, baileys);
  } catch {
    fatal("BAILEYS_SESSION_STORE_ERROR");
    return;
  }
  function guarded(fn) {
    return (...args) => {
      Promise.resolve()
        .then(() => fn(...args))
        .catch(() => fatal("BAILEYS_CALLBACK_ERROR"));
    };
  }
  function connect() {
    if (stopped) return;
    const token = ++socketGeneration;
    emit({ type: "state", state: "connecting" });
    socket = baileys.default({
      auth: store.state,
      logger,
      markOnlineOnConnect: false,
      syncFullHistory: false,
      shouldSyncHistoryMessage: () => false,
      getMessage: async (key) => store.getMessage(key),
      connectTimeoutMs: 20000,
      defaultQueryTimeoutMs: 20000,
    });
    socket.ev.on(
      "creds.update",
      guarded(() => store.saveCreds()),
    );
    socket.ev.on(
      "connection.update",
      guarded(async (update) => {
        if (token !== socketGeneration || stopped) return;
        if (update.qr) {
          const dataUrl = await QRCode.toDataURL(update.qr, {
            width: 280,
            margin: 3,
          });
          if (token !== socketGeneration || stopped) return;
          emit({ type: "state", state: "pairing" });
          emit({ type: "qr", dataUrl });
        }
        if (update.connection === "open") {
          attempts = 0;
          emit({ type: "state", state: "connected" });
        }
        if (update.connection === "close") {
          const code = update.lastDisconnect?.error?.output?.statusCode;
          if (code === baileys.DisconnectReason.loggedOut) {
            emit({ type: "state", state: "logged_out" });
            return;
          }
          if (++attempts > 5) {
            fatal("BAILEYS_RECONNECT_EXHAUSTED");
            return;
          }
          emit({ type: "state", state: "reconnecting" });
          clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(
            () => {
              if (token !== socketGeneration || stopped) return;
              try {
                connect();
              } catch {
                fatal("BAILEYS_RECONNECT_ERROR");
              }
            },
            Math.min(30000, 1000 * 2 ** attempts),
          );
        }
      }),
    );
    socket.ev.on(
      "messages.update",
      guarded((updates) => {
        for (const { key, update } of updates) {
          if (!key.fromMe || !key.id) continue;
          const status = {
            0: "failed",
            2: "sent",
            3: "delivered",
            4: "read",
            5: "read",
          }[update.status];
          if (status) emit({ type: "delivery", messageId: key.id, status });
        }
      }),
    );
    socket.ev.on(
      "message-receipt.update",
      guarded((updates) => {
        for (const { key, receipt } of updates) {
          if (!key.fromMe || !key.id) continue;
          const status =
            receipt.readTimestamp || receipt.playedTimestamp
              ? "read"
              : receipt.receiptTimestamp
                ? "delivered"
                : null;
          if (status) emit({ type: "delivery", messageId: key.id, status });
        }
      }),
    );
  }
  process.on(
    "message",
    guarded(async (message) => {
      if (message?.type === "list_groups") {
        try {
          if (stopped || socket?.ws?.isOpen !== true) throw new Error();
          const groups = await socket.groupFetchAllParticipating();
          emit({
            type: "result",
            id: message.id,
            ok: true,
            groups: Object.values(groups)
              .slice(0, 1000)
              .map((g) => ({
                id: g.id,
                subject: String(g.subject || "Sin nombre").slice(0, 256),
                size: g.size || g.participants?.length || 0,
              })),
          });
        } catch {
          emit({ type: "result", id: message.id, ok: false, notSent: true });
        }
        return;
      }
      if (message?.type !== "send") return;
      if (stopped || sending || socket?.ws?.isOpen !== true) {
        emit({ type: "result", id: message.id, ok: false, notSent: true });
        return;
      }
      if (
        (!isPhone(message.recipient) &&
          !(message.attachment && GROUP_ID.test(message.recipient))) ||
        typeof message.text !== "string" ||
        !message.text.trim() ||
        message.text.length > 6000 ||
        !/^[A-Z0-9]{16,64}$/.test(message.messageId)
      ) {
        emit({
          type: "result",
          id: message.id,
          ok: false,
          notSent: true,
          invalidMessage: true,
        });
        return;
      }
      sending = true;
      let content;
      try {
        content = message.attachment
          ? mediaContent(
              process.env.INGEMAT_WA_MEDIA_DIR,
              message.attachment,
              message.text,
            )
          : { text: message.text };
      } catch {
        sending = false;
        emit({
          type: "result",
          id: message.id,
          ok: false,
          notSent: true,
          invalidMessage: true,
        });
        return;
      }
      try {
        const result = await socket.sendMessage(
          GROUP_ID.test(message.recipient)
            ? message.recipient
            : message.recipient.slice(1) + "@s.whatsapp.net",
          content,
          { messageId: message.messageId },
        );
        if (!result?.key?.id) throw new Error("Missing message ID");
        store.saveMessage(result.key.id, result.message);
        emit({
          type: "result",
          id: message.id,
          ok: true,
          messageId: result.key.id,
        });
      } catch {
        emit({ type: "result", id: message.id, ok: false, notSent: false });
        fatal("BAILEYS_SEND_ERROR");
      } finally {
        sending = false;
      }
    }),
  );
  try {
    connect();
  } catch {
    fatal("BAILEYS_SOCKET_ERROR");
  }
}
void start().catch(() => fatal("BAILEYS_START_ERROR"));
