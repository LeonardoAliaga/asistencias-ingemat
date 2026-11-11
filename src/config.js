const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
try {
  process.loadEnvFile(path.resolve(".env"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const dataDir = path.resolve(
  process.env.DATA_DIR || path.join(__dirname, "../data"),
);
fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
const secretPath = path.join(dataDir, "session-secret.key");
if (!process.env.SESSION_SECRET && !fs.existsSync(secretPath))
  fs.writeFileSync(secretPath, crypto.randomBytes(48).toString("hex"), {
    mode: 0o600,
    flag: "wx",
  });
const sessionSecret =
  process.env.SESSION_SECRET || fs.readFileSync(secretPath, "utf8").trim();
if (Buffer.byteLength(sessionSecret) < 32)
  throw new Error("SESSION_SECRET necesita al menos 32 caracteres aleatorios.");
const recordsDir = path.resolve(
  process.env.RECORDS_DIR ||
    (process.env.DATA_DIR
      ? path.join(dataDir, "registros")
      : path.join(__dirname, "../Registros")),
);
fs.mkdirSync(recordsDir, { recursive: true });
module.exports = {
  dataDir,
  recordsDir,
  sessionSecret,
  timezone: process.env.APP_TIMEZONE || "America/Lima",
  port: Number(process.env.PORT || 3001),
  production: process.env.NODE_ENV === "production",
  publicUrl: process.env.APP_URL || "",
  python:
    process.env.PYTHON_BIN ||
    (process.platform === "win32" ? "python" : "python3"),
};
