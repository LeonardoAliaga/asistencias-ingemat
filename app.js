const express = require("express");
const path = require("path");
const session = require("express-session");
const fs = require("fs");

// Inicializar Base de Datos SQLite y Migración Automática
const db = require("./src/database/db.js");
const { ejecutarMigracionInicial } = require("./src/database/migrador.js");

try {
  ejecutarMigracionInicial();
} catch (e) {
  console.error("⚠️ Error durante la migración inicial:", e);
}

const apiRouter = require("./src/routes/api.route");
const whatsappRouter = require("./src/routes/whatsapp.route.js");

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware Globales
app.use(express.json({ limit: "5mb" }));
app.use(express.static(path.join(__dirname, "Public")));

app.use(
  session({
    secret: "1234",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false },
  })
);

// Función para obtener la contraseña actual desde SQLite
function getPassword() {
  try {
    const row = db.prepare("SELECT valor FROM config_general WHERE clave = 'admin_password'").get();
    if (row && row.valor) {
      return row.valor;
    }
  } catch (err) {
    console.error("Error leyendo contraseña desde SQLite:", err);
  }
  db.prepare("INSERT OR REPLACE INTO config_general (clave, valor) VALUES ('admin_password', 'admin123')").run();
  return "admin123";
}

// Ruta de login (POST)
app.post("/admin/login", (req, res) => {
  const { password } = req.body;
  if (password === getPassword()) {
    req.session.admin = true;
    return res.json({ exito: true });
  }
  res.status(401).json({ exito: false, mensaje: "Contraseña incorrecta" });
});

// Ruta de logout
app.post("/admin/logout", (req, res) => {
  if (req.session) {
    req.session.destroy((err) => {
      if (err) {
        return res
          .status(500)
          .json({ exito: false, mensaje: "No se pudo cerrar sesión" });
      }
      res.clearCookie("connect.sid");
      return res.json({ exito: true });
    });
  } else {
    return res.json({ exito: true });
  }
});

const { requireAdmin } = require("./src/middleware/auth.middleware");

// Ruta para cambiar contraseña (protegida)
app.post("/admin/password", requireAdmin, (req, res) => {
  const { nueva } = req.body;
  if (!nueva || nueva.length < 4) {
    return res.status(400).json({
      exito: false,
      mensaje: "La contraseña debe tener al menos 4 caracteres",
    });
  }
  try {
    db.prepare("INSERT OR REPLACE INTO config_general (clave, valor) VALUES ('admin_password', ?)").run(nueva);
    res.json({ exito: true, mensaje: "Contraseña actualizada" });
  } catch (error) {
    console.error("Error al guardar nueva contraseña en SQLite:", error);
    res
      .status(500)
      .json({ exito: false, mensaje: "Error al guardar la contraseña" });
  }
});

// Ruta raíz para servir index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "Public/index.html"));
});

// Ruta para /admin (muestra login o panel)
app.get("/admin", (req, res) => {
  if (req.session && req.session.admin) {
    res.sendFile(path.join(__dirname, "Public/pages/admin.html"));
  } else {
    res.sendFile(path.join(__dirname, "Public/pages/admin-login.html"));
  }
});

// Routers de API
app.use("/api", apiRouter);
app.use("/whatsapp/api", requireAdmin, whatsappRouter);

// Asegurar que la carpeta de registros exista
const registrosDir = path.join(__dirname, "Registros");
if (!fs.existsSync(registrosDir)) {
  try {
    fs.mkdirSync(registrosDir);
  } catch (mkdirError) {}
}

app.listen(PORT, () =>
  console.log(`🚀 Servidor INGEMAT iniciado con SQLite en http://localhost:${PORT}`)
);
