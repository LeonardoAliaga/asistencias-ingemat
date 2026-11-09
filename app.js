const express = require("express");
const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const session = require("express-session");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");
const config = require("./src/config");
const db = require("./src/database/db");
const { ejecutarMigracionInicial } = require("./src/database/migrador");
const auth = require("./src/services/auth.service");
const {
  requireAuthenticated,
  requireAdmin,
  requirePermission,
} = require("./src/middleware/auth.middleware");
const SQLiteSessionStore = require("./src/database/session-store");
const { AppError } = require("./src/utils/errors");
const { audit } = require("./src/services/audit.service");

function createApp() {
  ejecutarMigracionInicial();
  require("./src/services/cycles.service").initializeCycles();
  // Retire credentials from the removed reception-device pairing flow.
  db.prepare(
    "DELETE FROM config_general WHERE clave IN ('kiosk_token_hash','kiosk_version')",
  ).run();
  auth.bootstrapAdmin();
  const app = express();
  app.disable("x-powered-by");
  if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: [
            "'self'",
            "'unsafe-inline'",
            "https://cdn.jsdelivr.net",
            "https://cdnjs.cloudflare.com",
          ],
          styleSrc: [
            "'self'",
            "'unsafe-inline'",
            "https://fonts.googleapis.com",
            "https://cdn.jsdelivr.net",
          ],
          fontSrc: [
            "'self'",
            "https://fonts.gstatic.com",
            "https://cdn.jsdelivr.net",
            "data:",
          ],
          imgSrc: ["'self'", "data:", "blob:"],
          mediaSrc: ["'self'", "blob:"],
          frameSrc: ["'self'", "https://www.google.com"],
          connectSrc: ["'self'"],
          workerSrc: ["'self'", "blob:"],
          upgradeInsecureRequests: config.production ? [] : null,
        },
      },
      crossOriginEmbedderPolicy: false,
      strictTransportSecurity: config.production ? undefined : false,
    }),
  );
  app.use(
    express.json({
      limit: "5mb",
      verify(req, res, buf) {
        if (req.path.replace(/\/$/, "") === "/webhooks/whatsapp")
          req.rawBody = buf;
      },
    }),
  );
  app.use(
    session({
      name: "ingemat.sid",
      secret: config.sessionSecret,
      store: new SQLiteSessionStore(db),
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: config.production,
        sameSite: "strict",
        maxAge: 8 * 3600000,
      },
    }),
  );
  app.use((req, res, next) => {
    if (
      req.path.startsWith("/api/") ||
      req.path.startsWith("/admin") ||
      req.path === "/pages/admin.html"
    )
      res.set("Cache-Control", "no-store");
    next();
  });
  const csrfCookie = (res, token) =>
    res.cookie("ingemat.csrf", token, {
      httpOnly: false,
      secure: config.production,
      sameSite: "strict",
      path: "/",
    });
  app.get("/api/session", (req, res) => {
    req.session.csrf ||= crypto.randomBytes(24).toString("hex");
    csrfCookie(res, req.session.csrf);
    const account = req.session.accountId
      ? db
          .prepare(
            "SELECT id,username,role,must_change_password,active,token_version FROM accounts WHERE id=?",
          )
          .get(req.session.accountId)
      : null;
    res.set("Cache-Control", "no-store");
    res.json({
      exito: true,
      csrfToken: req.session.csrf,
      usuario:
        account?.active && account.token_version === req.session.tokenVersion
          ? {
              username: account.username,
              role: account.role,
              mustChangePassword: !!account.must_change_password,
            }
          : null,
      version: "2.0.0",
      timezone: config.timezone,
    });
  });
  app.use((req, res, next) => {
    if (
      ["GET", "HEAD", "OPTIONS"].includes(req.method) ||
      req.path.replace(/\/$/, "") === "/webhooks/whatsapp"
    )
      return next();
    if (req.headers["sec-fetch-site"] === "cross-site")
      return res.status(403).json({
        exito: false,
        mensaje: "La solicitud debe originarse en esta aplicación.",
      });
    if (!req.session.csrf || req.get("x-csrf-token") !== req.session.csrf)
      return res.status(403).json({
        exito: false,
        code: "CSRF",
        mensaje: "La sesión cambió. Actualiza la página e inténtalo de nuevo.",
      });
    next();
  });
  const loginLimiter = rateLimit({
    windowMs: 15 * 60000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: {
      exito: false,
      mensaje: "Demasiados intentos. Espera 15 minutos.",
    },
  });
  app.post("/admin/login", loginLimiter, (req, res, next) => {
    const username = String(req.body.username || "admin")
      .trim()
      .toLowerCase();
    const account = db
      .prepare("SELECT * FROM accounts WHERE username=? AND active=1")
      .get(username);
    if (
      !auth.verifyPassword(
        req.body.password,
        account?.password_hash || auth.hashPassword("unavailable-account"),
      )
    )
      return res
        .status(401)
        .json({ exito: false, mensaje: "Usuario o contraseña incorrectos." });
    req.session.regenerate((err) => {
      if (err) return next(err);
      Object.assign(req.session, {
        accountId: account.id,
        username: account.username,
        role: account.role,
        admin: account.role === "admin",
        tokenVersion: account.token_version,
        csrf: crypto.randomBytes(24).toString("hex"),
      });
      csrfCookie(res, req.session.csrf);
      audit(req, "login", "cuenta", account.id);
      res.json({
        exito: true,
        mustChangePassword: !!account.must_change_password,
      });
    });
  });
  app.post("/admin/logout", (req, res, next) =>
    req.session.destroy((e) => {
      if (e) return next(e);
      res.clearCookie("ingemat.sid");
      res.clearCookie("ingemat.csrf");
      res.json({ exito: true });
    }),
  );
  app.post("/admin/password", requireAuthenticated, (req, res) => {
    auth.validatePassword(req.body.nueva);
    const account = db
      .prepare("SELECT * FROM accounts WHERE id=?")
      .get(req.session.accountId);
    if (!auth.verifyPassword(req.body.actual, account.password_hash))
      throw new AppError("La contraseña actual no es correcta.", 403);
    db.prepare(
      "UPDATE accounts SET password_hash=?,must_change_password=0,token_version=token_version+1 WHERE id=?",
    ).run(auth.hashPassword(req.body.nueva), account.id);
    req.session.tokenVersion = account.token_version + 1;
    audit(req, "cambiar_password", "cuenta", account.id);
    res.json({
      exito: true,
      mensaje: "Contraseña actualizada. Las demás sesiones se han cerrado.",
    });
  });
  app.get("/health", (req, res) =>
    res.json({ ok: !!db.prepare("SELECT 1 ok").get().ok, version: "2.0.0" }),
  );
  app.use("/webhooks/whatsapp", require("./src/routes/webhook.route"));
  app.use("/api/v2", requireAuthenticated, require("./src/routes/v2.route"));
  app.use("/api", require("./src/routes/api.route"));
  app.use(
    "/whatsapp/api",
    requireAdmin,
    require("./src/routes/whatsapp.route"),
  );
  const adminPage = (req, res) => {
    if (!req.session.accountId) return res.redirect("/pages/admin-login.html");
    return requireAuthenticated(req, res, () =>
      res.sendFile(path.join(__dirname, "Public/pages/admin.html")),
    );
  };
  app.get(["/admin", "/pages/admin.html"], adminPage);
  app.get("/vendor/purify.min.js", (req, res) =>
    res.sendFile(
      path.join(__dirname, "node_modules/dompurify/dist/purify.min.js"),
    ),
  );
  app.use(
    "/vendor/bootstrap-icons",
    express.static(path.join(__dirname, "node_modules/bootstrap-icons/font")),
  );
  for (const [url, file] of Object.entries({
    "/vendor/JsBarcode.all.min.js": "jsbarcode/dist/JsBarcode.all.min.js",
    "/vendor/jszip.min.js": "jszip/dist/jszip.min.js",
    "/vendor/jspdf.umd.min.js": "jspdf/dist/jspdf.umd.min.js",
    "/vendor/html5-qrcode.min.js": "html5-qrcode/html5-qrcode.min.js",
  }))
    app.get(url, (req, res) =>
      res.sendFile(path.join(__dirname, "node_modules", file)),
    );
  app.use(
    express.static(path.join(__dirname, "Public"), {
      maxAge: config.production ? "1h" : 0,
    }),
  );
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const status = err.status || 500;
    if (!(err instanceof AppError) && status >= 500) console.error(err);
    res.status(status >= 400 && status < 600 ? status : 500).json({
      exito: false,
      mensaje:
        err instanceof AppError
          ? err.message
          : err.code === "LIMIT_FILE_SIZE"
            ? "El archivo supera el tamaño permitido."
            : "No se pudo completar la operación.",
      ...(err.details ? { details: err.details } : {}),
    });
  });
  return app;
}
if (require.main === module) {
  const app = createApp();
  const server = app.listen(config.port, () =>
    console.log(`INGEMAT v2: http://localhost:${config.port}`),
  );
  const workers = require("./src/services/workers");
  workers.start();
  // Report the actual interpreter and dependencies without blocking attendance.
  void require("./src/services/omr-runtime.service").checkRuntime();
  const shutdown = () => {
    workers.stop();
    server.close(() => {
      db.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
module.exports = { createApp };
