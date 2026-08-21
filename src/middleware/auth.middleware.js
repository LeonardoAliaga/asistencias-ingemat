// src/middleware/auth.middleware.js

/**
 * Middleware para requerir sesión de administración activa.
 * Redirige a /admin si es navegación HTML o retorna HTTP 401 para API.
 */
const requireAdmin = (req, res, next) => {
  if (req.session && req.session.admin) {
    return next();
  }

  const isApi =
    (req.originalUrl && req.originalUrl.includes("/api")) ||
    (req.headers.accept && req.headers.accept.includes("json")) ||
    req.xhr;

  if (isApi) {
    return res.status(401).json({ exito: false, mensaje: "No autorizado" });
  }

  return res.redirect("/admin");
};

module.exports = { requireAdmin };
