const crypto = require("node:crypto");
const db = require("../database/db");
const { AppError } = require("../utils/errors");
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  return `scrypt:${salt}:${crypto.scryptSync(password, salt, 64).toString("hex")}`;
}
function verifyPassword(password, hash) {
  if (typeof password !== "string" || password.length > 256) return false;
  const [type, salt, value] = String(hash || "").split(":");
  if (type !== "scrypt" || !salt || !value) return false;
  const actual = crypto.scryptSync(password, salt, 64),
    expected = Buffer.from(value, "hex");
  return (
    expected.length === actual.length &&
    crypto.timingSafeEqual(actual, expected)
  );
}
function validatePassword(password) {
  if (
    typeof password !== "string" ||
    password.length < 12 ||
    password.length > 256
  )
    throw new AppError("Usa una contraseña de 12 a 256 caracteres.");
}
function bootstrapAdmin() {
  if (db.prepare("SELECT COUNT(*) n FROM accounts").get().n) return;
  const password =
    process.env.ADMIN_INITIAL_PASSWORD ||
    crypto.randomBytes(15).toString("base64url");
  validatePassword(password);
  db.prepare(
    "INSERT INTO accounts(username,password_hash,role,must_change_password) VALUES(?,?,?,1)",
  ).run("admin", hashPassword(password), "admin");
  if (!process.env.ADMIN_INITIAL_PASSWORD)
    console.log(
      `\nINGEMAT: acceso inicial\nUsuario: admin\nContraseña temporal: ${password}\nCámbiala al iniciar sesión. Esta clave no vuelve a mostrarse.\n`,
    );
}
const permissions = {
  admin: ["*"],
  corrector: [
    "evaluaciones:read",
    "evaluaciones:write",
    "usuarios:read",
    "reportes:read",
  ],
  docente: [
    "evaluaciones:read",
    "tareas:write",
    "usuarios:read",
    "reportes:read",
  ],
  recepcion: [
    "usuarios:read",
    "asistencias:write",
    "asistencias:justify",
    "reportes:read",
    "biblioteca:write",
  ],
};
function hasPermission(role, permission) {
  return (
    permissions[role]?.includes("*") ||
    permissions[role]?.includes(permission) ||
    false
  );
}
module.exports = {
  hashPassword,
  verifyPassword,
  validatePassword,
  bootstrapAdmin,
  hasPermission,
  permissions,
};
