// app.js (Inicia el servidor y carga las rutas)

const express = require("express");
const path = require("path");
const session = require("express-session");
const fs = require("fs");
const apiRouter = require("./src/routes/api.route");

const app = express();
const PORT = process.env.PORT || 3000; // Asegúrate de que esta línea esté corregida

// Middleware Globales
app.use(express.json());
app.use(express.static("public"));

app.use(
  session({
    secret: "1234", // Cambia esto por algo aleatorio
    resave: false,
    saveUninitialized: true,
  })
);

const passwordPath = path.join(__dirname, "data/password.json");

// Función para obtener la contraseña actual
function getPassword() {
  try {
    const data = fs.readFileSync(passwordPath, "utf8");
    return JSON.parse(data).password;
  } catch {
    return "admin123"; // Valor por defecto si no existe el archivo
  }
}

// Ruta de login (POST)
app.post("/admin/login", (req, res) => {
  const { password } = req.body;
  if (password === getPassword()) {
    req.session.admin = true;
    return res.json({ exito: true });
  }
  res.json({ exito: false, mensaje: "Contraseña incorrecta" });
});

// Ruta de logout
app.post("/admin/logout", (req, res) => {
  req.session.destroy(() => res.json({ exito: true }));
});

// Ruta para cambiar contraseña (solo si está logueado)
app.post("/admin/password", (req, res) => {
  if (!req.session.admin)
    return res.status(401).json({ exito: false, mensaje: "No autorizado" });
  const { nueva } = req.body;
  fs.writeFileSync(passwordPath, JSON.stringify({ password: nueva }, null, 2));
  res.json({ exito: true, mensaje: "Contraseña actualizada" });
});

// 🚀 NUEVA RUTA PARA LA URL RAÍZ (/)
app.get("/", (req, res) => {
  // Envía el archivo index.html como respuesta a la ruta raíz
  res.sendFile(path.join(__dirname, "Public/index.html"));
});

// Ruta protegida para /admin
app.get("/admin", (req, res) => {
  if (!req.session.admin) {
    return res.sendFile(path.join(__dirname, "Public/pages/admin-login.html"));
  }
  res.sendFile(path.join(__dirname, "Public/pages/admin.html"));
});

// Configuración de rutas de la API
app.use("/api", apiRouter);
// Ruta para mostrar el panel de administración
app.use("/api", require("./src/routes/api.route"));

// Asegurar que la carpeta de registros exista
const registrosPath = path.join(__dirname, "registros");
if (!fs.existsSync(registrosPath)) fs.mkdirSync(registrosPath);

app.listen(PORT, () => console.log(`Servidor en http://localhost:${PORT}`));
