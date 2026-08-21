// src/routes/biblioteca.route.js
const express = require("express");
const fs = require("fs");
const path = require("path");
const { normalizarTexto, getFullName } = require("../utils/helpers.js");

const router = express.Router();

const bibliotecaPath = path.join(__dirname, "../../data/biblioteca.json");
const prestamosPath = path.join(__dirname, "../../data/prestamos.json");
const usuariosPath = path.join(__dirname, "../../data/usuarios.json");

// Helpers de lectura / escritura
function getBibliotecaData() {
  try {
    if (!fs.existsSync(bibliotecaPath)) {
      const initial = {
        secciones: ["MATEMÁTICA", "FÍSICA", "QUÍMICA", "LETRAS", "BIOLOGÍA"],
        libros: [],
      };
      fs.writeFileSync(bibliotecaPath, JSON.stringify(initial, null, 2));
      return initial;
    }
    return JSON.parse(fs.readFileSync(bibliotecaPath, "utf8"));
  } catch (err) {
    console.error("Error al leer biblioteca.json:", err);
    return { secciones: [], libros: [] };
  }
}

function saveBibliotecaData(data) {
  try {
    fs.writeFileSync(bibliotecaPath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Error al guardar biblioteca.json:", err);
  }
}

function getPrestamosData() {
  try {
    if (!fs.existsSync(prestamosPath)) {
      const initial = { prestamos: [] };
      fs.writeFileSync(prestamosPath, JSON.stringify(initial, null, 2));
      return initial;
    }
    return JSON.parse(fs.readFileSync(prestamosPath, "utf8"));
  } catch (err) {
    console.error("Error al leer prestamos.json:", err);
    return { prestamos: [] };
  }
}

function savePrestamosData(data) {
  try {
    fs.writeFileSync(prestamosPath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Error al guardar prestamos.json:", err);
  }
}

function getUsuariosData() {
  try {
    if (!fs.existsSync(usuariosPath)) return [];
    return JSON.parse(fs.readFileSync(usuariosPath, "utf8"));
  } catch (err) {
    console.error("Error al leer usuarios.json:", err);
    return [];
  }
}

// GET /api/biblioteca - Obtener catálogo completo y secciones
router.get("/", (req, res) => {
  const data = getBibliotecaData();
  res.json({ exito: true, secciones: data.secciones || [], libros: data.libros || [] });
});

// POST /api/biblioteca/seccion - Agregar una sección / estante
router.post("/seccion", (req, res) => {
  const { nombre } = req.body;
  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ exito: false, mensaje: "El nombre de la sección es obligatorio." });
  }

  const nombreNorm = nombre.trim().toUpperCase();
  const data = getBibliotecaData();

  if (data.secciones.some((s) => s.toUpperCase() === nombreNorm)) {
    return res.status(400).json({ exito: false, mensaje: `La sección "${nombreNorm}" ya existe.` });
  }

  data.secciones.push(nombreNorm);
  saveBibliotecaData(data);
  res.json({ exito: true, mensaje: `Sección "${nombreNorm}" agregada correctamente.`, secciones: data.secciones });
});

// DELETE /api/biblioteca/seccion/:nombre - Eliminar sección
router.delete("/seccion/:nombre", (req, res) => {
  const nombreNorm = decodeURIComponent(req.params.nombre).trim().toUpperCase();
  const data = getBibliotecaData();

  const idx = data.secciones.findIndex((s) => s.toUpperCase() === nombreNorm);
  if (idx === -1) {
    return res.status(404).json({ exito: false, mensaje: `Sección "${nombreNorm}" no encontrada.` });
  }

  data.secciones.splice(idx, 1);
  saveBibliotecaData(data);
  res.json({ exito: true, mensaje: `Sección "${nombreNorm}" eliminada.`, secciones: data.secciones });
});

// POST /api/biblioteca/libro - Registrar un nuevo libro
router.post("/libro", (req, res) => {
  const { codigo, titulo, seccion } = req.body;
  if (!codigo || !titulo || !seccion) {
    return res.status(400).json({ exito: false, mensaje: "Código, título y sección son campos obligatorios." });
  }

  const codigoNorm = codigo.trim().toUpperCase();
  const tituloNorm = titulo.trim();
  const seccionNorm = seccion.trim().toUpperCase();

  const data = getBibliotecaData();

  if (data.libros.some((l) => l.codigo.toUpperCase() === codigoNorm)) {
    return res.status(400).json({ exito: false, mensaje: `El código de libro "${codigoNorm}" ya está en uso.` });
  }

  const nuevoLibro = {
    id: `LIB-${Date.now().toString().slice(-6)}`,
    codigo: codigoNorm,
    titulo: tituloNorm,
    seccion: seccionNorm,
    estado: "disponible",
    fechaRegistro: new Date().toLocaleDateString("es-PE"),
  };

  data.libros.push(nuevoLibro);
  saveBibliotecaData(data);

  res.json({ exito: true, mensaje: `Libro "${tituloNorm}" registrado con éxito.`, libro: nuevoLibro });
});

// DELETE /api/biblioteca/libro/:id - Eliminar libro
router.delete("/libro/:id", (req, res) => {
  const id = req.params.id;
  const data = getBibliotecaData();

  const idx = data.libros.findIndex((l) => l.id === id || l.codigo.toUpperCase() === id.toUpperCase());
  if (idx === -1) {
    return res.status(404).json({ exito: false, mensaje: "Libro no encontrado." });
  }

  const libroEliminado = data.libros.splice(idx, 1)[0];
  saveBibliotecaData(data);

  res.json({ exito: true, mensaje: `Libro "${libroEliminado.titulo}" eliminado.`, id: id });
});

// GET /api/biblioteca/prestamos - Obtener historial y préstamos activos
router.get("/prestamos", (req, res) => {
  const data = getPrestamosData();
  res.json({ exito: true, prestamos: data.prestamos || [] });
});

// POST /api/biblioteca/prestamo - Registrar un préstamo (Código Libro + Código Estudiante)
router.post("/prestamo", (req, res) => {
  const { codigoLibro, codigoUsuario } = req.body;

  if (!codigoLibro || !codigoUsuario) {
    return res.status(400).json({ exito: false, mensaje: "Se requiere el código del libro y del estudiante." });
  }

  const codLibroNorm = codigoLibro.trim().toUpperCase();
  const codUsuarioNorm = codigoUsuario.trim().toUpperCase();

  // 1. Verificar usuario en usuarios.json
  const usuarios = getUsuariosData();
  const usuario = usuarios.find((u) => u.codigo.toUpperCase() === codUsuarioNorm);

  if (!usuario) {
    return res.status(404).json({
      exito: false,
      mensaje: `Código de estudiante "${codUsuarioNorm}" no encontrado en el sistema.`,
    });
  }

  // 2. Verificar libro en biblioteca.json
  const bibData = getBibliotecaData();
  const libro = bibData.libros.find((l) => l.codigo.toUpperCase() === codLibroNorm);

  if (!libro) {
    return res.status(404).json({
      exito: false,
      mensaje: `Código de libro "${codLibroNorm}" no registrado en la biblioteca.`,
    });
  }

  if (libro.estado === "prestado") {
    return res.status(400).json({
      exito: false,
      mensaje: `El libro "${libro.titulo}" (${libro.codigo}) figura como PRESTADO actualmente.`,
    });
  }

  // 3. Crear el registro de préstamo
  const fechaActual = new Date();
  const timestampStr =
    fechaActual.toLocaleDateString("es-PE") +
    " " +
    fechaActual.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: true }).toUpperCase();

  const nombreEstudiante = getFullName(usuario) || usuario.nombre || "Estudiante";

  const nuevoPrestamo = {
    id: `PREST-${Date.now().toString().slice(-6)}`,
    codigoLibro: libro.codigo,
    tituloLibro: libro.titulo,
    codigoUsuario: usuario.codigo,
    nombreUsuario: nombreEstudiante,
    ciclo: usuario.ciclo || usuario.rol || "-",
    turno: usuario.turno || "-",
    fechaPrestamo: timestampStr,
    fechaDevolucion: null,
    estado: "prestado",
  };

  // 4. Actualizar estado del libro a 'prestado'
  libro.estado = "prestado";
  saveBibliotecaData(bibData);

  // 5. Guardar el préstamo
  const prestData = getPrestamosData();
  prestData.prestamos.unshift(nuevoPrestamo); // Agregar al inicio
  savePrestamosData(prestData);

  res.json({
    exito: true,
    mensaje: `📖 Libro "${libro.titulo}" prestado a ${nombreEstudiante} (${usuario.ciclo || ""})`,
    prestamo: nuevoPrestamo,
    usuario: { nombre: nombreEstudiante, ciclo: usuario.ciclo, turno: usuario.turno },
    libro: { codigo: libro.codigo, titulo: libro.titulo },
  });
});

// POST /api/biblioteca/devolucion - Registrar la devolución de un libro prestado
router.post("/devolucion", (req, res) => {
  const { idPrestamo, codigoLibro } = req.body;

  if (!idPrestamo && !codigoLibro) {
    return res.status(400).json({ exito: false, mensaje: "Falta identificador de préstamo o libro." });
  }

  const prestData = getPrestamosData();
  const bibData = getBibliotecaData();

  let prestamo = null;

  if (idPrestamo) {
    prestamo = prestData.prestamos.find((p) => p.id === idPrestamo && p.estado === "prestado");
  } else if (codigoLibro) {
    const codNorm = codigoLibro.trim().toUpperCase();
    prestamo = prestData.prestamos.find((p) => p.codigoLibro.toUpperCase() === codNorm && p.estado === "prestado");
  }

  if (!prestamo) {
    return res.status(404).json({ exito: false, mensaje: "No se encontró un préstamo activo para esta selección." });
  }

  // 1. Actualizar préstamo a devuelto
  const fechaActual = new Date();
  const timestampStr =
    fechaActual.toLocaleDateString("es-PE") +
    " " +
    fechaActual.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: true }).toUpperCase();

  prestamo.estado = "devuelto";
  prestamo.fechaDevolucion = timestampStr;

  // 2. Liberar libro a disponible en biblioteca.json
  const libro = bibData.libros.find((l) => l.codigo.toUpperCase() === prestamo.codigoLibro.toUpperCase());
  if (libro) {
    libro.estado = "disponible";
    saveBibliotecaData(bibData);
  }

  savePrestamosData(prestData);

  res.json({
    exito: true,
    mensaje: `✅ Libro "${prestamo.tituloLibro}" marcado como DEVUELTO por ${prestamo.nombreUsuario}.`,
    prestamo,
  });
});

module.exports = router;
