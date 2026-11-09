const db = require("../database/db");
const { hasPermission } = require("../services/auth.service");
function requireAuthenticated(req, res, next) {
  if (req.session?.accountId) {
    const account = db
      .prepare("SELECT role,token_version,active FROM accounts WHERE id=?")
      .get(req.session.accountId);
    if (account?.active && account.token_version === req.session.tokenVersion) {
      req.session.role = account.role;
      req.session.admin = account.role === "admin";
      return next();
    }
  }
  return res
    .status(401)
    .json({ exito: false, mensaje: "Inicia sesión para continuar." });
}
function requirePermission(permission) {
  return (req, res, next) =>
    requireAuthenticated(req, res, () =>
      hasPermission(req.session.role, permission)
        ? next()
        : res
            .status(403)
            .json({
              exito: false,
              mensaje: "Tu cuenta no tiene permiso para esta acción.",
            }),
    );
}
const requireAdmin = requirePermission("admin");
function requireKiosk(req, res, next) {
  if (
    req.session?.kiosk &&
    req.session.kioskVersion ===
      db
        .prepare("SELECT valor FROM config_general WHERE clave='kiosk_version'")
        .get()?.valor
  )
    return next();
  return requirePermission("asistencias:write")(req, res, next);
}
module.exports = {
  requireAdmin,
  requireAuthenticated,
  requirePermission,
  requireKiosk,
};
