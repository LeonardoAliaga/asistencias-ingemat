// src/database/db.js
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const dataDir = path.join(__dirname, "../../data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, "ingemat.db");
const db = new Database(dbPath);

// Habilitar claves foráneas y WAL mode para rendimiento
db.pragma("foreign_keys = ON");
db.pragma("journal_mode = WAL");

// --- INICIALIZACIÓN DE TABLAS ---
db.exec(`
  -- Tabla de Usuarios (Estudiantes y Docentes)
  CREATE TABLE IF NOT EXISTS usuarios (
    codigo TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    apellido TEXT NOT NULL,
    rol TEXT NOT NULL,
    turno TEXT DEFAULT '',
    ciclo TEXT DEFAULT '',
    dias_asistencia TEXT DEFAULT '[]',
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Tabla de Ciclos
  CREATE TABLE IF NOT EXISTS ciclos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT UNIQUE NOT NULL
  );

  -- Tabla de Horarios por Ciclo
  CREATE TABLE IF NOT EXISTS horarios (
    ciclo TEXT PRIMARY KEY,
    manana_entrada TEXT DEFAULT '',
    manana_tolerancia TEXT DEFAULT '',
    tarde_entrada TEXT DEFAULT '',
    tarde_tolerancia TEXT DEFAULT ''
  );

  -- Tabla de Evaluaciones / Simulacros
  CREATE TABLE IF NOT EXISTS evaluaciones (
    id TEXT PRIMARY KEY,
    titulo TEXT NOT NULL,
    ciclo TEXT NOT NULL,
    fecha TEXT NOT NULL,
    numPreguntas INTEGER NOT NULL,
    puntajeCorrecta REAL NOT NULL,
    puntajeIncorrecta REAL NOT NULL,
    claves TEXT DEFAULT '{}',
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Tabla de Respuestas de Estudiantes por Evaluación
  CREATE TABLE IF NOT EXISTS respuestas_evaluacion (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    evaluacion_id TEXT NOT NULL,
    codigoEstudiante TEXT NOT NULL,
    nombreEstudiante TEXT NOT NULL,
    ciclo TEXT DEFAULT '',
    correctas INTEGER NOT NULL,
    incorrectas INTEGER NOT NULL,
    enBlanco INTEGER NOT NULL,
    puntajeTotal REAL NOT NULL,
    posicion INTEGER DEFAULT 0,
    respuestas TEXT DEFAULT '{}',
    FOREIGN KEY(evaluacion_id) REFERENCES evaluaciones(id) ON DELETE CASCADE
  );

  -- Tabla de Tareas por Curso
  CREATE TABLE IF NOT EXISTS tareas (
    id TEXT PRIMARY KEY,
    curso TEXT NOT NULL,
    ciclo TEXT NOT NULL,
    fecha TEXT NOT NULL,
    tipoEvaluacion TEXT NOT NULL,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Tabla de Registros Individuales de Tarea por Alumno
  CREATE TABLE IF NOT EXISTS registros_tarea (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tarea_id TEXT NOT NULL,
    codigoEstudiante TEXT NOT NULL,
    nombreEstudiante TEXT DEFAULT '',
    nota REAL DEFAULT NULL,
    estado TEXT DEFAULT 'EVALUADO',
    FOREIGN KEY(tarea_id) REFERENCES tareas(id) ON DELETE CASCADE
  );

  -- Tabla de Biblioteca (Libros)
  CREATE TABLE IF NOT EXISTS libros (
    id TEXT PRIMARY KEY,
    codigo TEXT UNIQUE NOT NULL,
    titulo TEXT NOT NULL,
    autor TEXT DEFAULT '',
    categoria TEXT DEFAULT '',
    editorial TEXT DEFAULT '',
    stock INTEGER DEFAULT 1,
    prestados INTEGER DEFAULT 0
  );

  -- Tabla de Secciones de Biblioteca
  CREATE TABLE IF NOT EXISTS secciones_biblioteca (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT UNIQUE NOT NULL
  );

  -- Tabla de Préstamos de Biblioteca
  CREATE TABLE IF NOT EXISTS prestamos (
    id TEXT PRIMARY KEY,
    libroCodigo TEXT NOT NULL,
    estudianteCodigo TEXT NOT NULL,
    estudianteNombre TEXT DEFAULT '',
    fechaPrestamo TEXT NOT NULL,
    fechaDevolucion TEXT DEFAULT '',
    estado TEXT DEFAULT 'PRESTADO'
  );

  -- Tabla de Configuración de WhatsApp
  CREATE TABLE IF NOT EXISTS whatsapp_config (
    id TEXT PRIMARY KEY DEFAULT 'config',
    enabled INTEGER DEFAULT 0,
    messageTemplate TEXT DEFAULT '',
    delaySeconds INTEGER DEFAULT 5,
    mediaPath TEXT DEFAULT ''
  );

  -- Tabla de Configuración General (Password, notas, etc.)
  CREATE TABLE IF NOT EXISTS config_general (
    clave TEXT PRIMARY KEY,
    valor TEXT NOT NULL
  );
`);

// --- Migraciones y semillas adicionales ---
try {
  db.exec("ALTER TABLE libros ADD COLUMN editorial TEXT DEFAULT ''");
} catch (e) {
  // Columna ya existe
}

// Inicializar secciones por defecto si la tabla está vacía y nunca se ha inicializado
const initSecFlag = db.prepare("SELECT valor FROM config_general WHERE clave = 'secciones_biblioteca_inicializadas'").get();
if (!initSecFlag) {
  const countSecciones = db.prepare("SELECT COUNT(*) as count FROM secciones_biblioteca").get();
  if (countSecciones && countSecciones.count === 0) {
    const defaultSecciones = ["MATEMÁTICA", "FÍSICA", "QUÍMICA", "LETRAS", "BIOLOGÍA"];
    const insertSec = db.prepare("INSERT OR IGNORE INTO secciones_biblioteca (nombre) VALUES (?)");
    defaultSecciones.forEach((sec) => insertSec.run(sec));
  }
  db.prepare("INSERT OR REPLACE INTO config_general (clave, valor) VALUES ('secciones_biblioteca_inicializadas', '1')").run();
}

console.log("🟢 Base de Datos SQLite (ingemat.db) inicializada correctamente.");

module.exports = db;
