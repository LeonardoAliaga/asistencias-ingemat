const express = require("express");
const path = require("path");
const session = require("express-session");
const fs = require("fs");
const apiRouter = require("./src/routes/api.route");
const whatsappRouter = require("./src/routes/whatsapp.route.js");
// const reportScheduler = require("./src/services/report-scheduler.js"); // <-- ELIMINADO

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware Globales
app.use(express.json({ limit: "5mb" })); // aumentar límite para payloads de imágenes en base64 (subida de fotos)
app.use(express.static(path.join(__dirname, "Public")));

app.use(
  session({
    secret: "1234", // Cambia esto por algo aleatorio y seguro
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }, // Poner a true si usas HTTPS
  })
);

const passwordPath = path.join(__dirname, "data/password.json");

// Función para obtener la contraseña actual
function getPassword() {
  try {
    const data = fs.readFileSync(passwordPath, "utf8");
    return JSON.parse(data).password;
  } catch {
    // Si el archivo no existe o hay error, crea uno con contraseña por defecto
    try {
      fs.writeFileSync(
        passwordPath,
        JSON.stringify({ password: "admin123" }, null, 2)
      );
      return "admin123";
    } catch (writeError) {
      console.error("Error al crear archivo de contraseña:", writeError);
      return "admin123"; // Retorna el default si falla la escritura
    }
  }
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
      res.clearCookie("connect.sid"); // Limpia la cookie de sesión
      return res.json({ exito: true });
    });
  } else {
    return res.json({ exito: true }); // Si no hay sesión, igual es éxito
  }
});

// Middleware para proteger rutas de admin
const requireAdmin = (req, res, next) => {
  if (req.session && req.session.admin) {
    next();
  } else {
    if (req.path.startsWith("/api/") || req.path.startsWith("/whatsapp/api/")) {
      res.status(401).json({ exito: false, mensaje: "No autorizado" });
    } else {
      res.redirect("/admin"); // Redirige a /admin que mostrará el login si no hay sesión
    }
  }
};

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
    fs.writeFileSync(
      passwordPath,
      JSON.stringify({ password: nueva }, null, 2)
    );
    res.json({ exito: true, mensaje: "Contraseña actualizada" });
  } catch (error) {
    console.error("Error al guardar nueva contraseña:", error);
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
    console.log(`Carpeta ${registrosDir} creada.`);
  } catch (mkdirError) {
    console.error(`Error al crear la carpeta ${registrosDir}:`, mkdirError);
  }
}
// Asegurar que la carpeta data exista
const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) {
  try {
    fs.mkdirSync(dataDir);
    console.log(`Carpeta ${dataDir} creada.`);
  } catch (mkdirError) {
    console.error(`Error al crear la carpeta ${dataDir}:`, mkdirError);
  }
}

app.listen(PORT, () =>
  console.log(`Servidor iniciado en http://localhost:${PORT}`)
);

// Iniciar el programador de reportes
// reportScheduler.init(); // <-- ELIMINADO
