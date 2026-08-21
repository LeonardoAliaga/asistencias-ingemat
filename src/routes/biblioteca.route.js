// src/routes/biblioteca.route.js
const express = require("express");
const db = require("../database/db.js");
const { getFullName } = require("../utils/helpers.js");

const router = express.Router();

// Helper para obtener secciones únicas del catálogo
function getSecciones() {
  const defaultSecciones = ["MATEMÁTICA", "FÍSICA", "QUÍMICA", "LETRAS", "BIOLOGÍA"];
  const rows = db.prepare("SELECT DISTINCT categoria FROM libros WHERE categoria != ''").all();
  const set = new Set([...defaultSecciones, ...rows.map((r) => r.categoria.toUpperCase())]);
  return Array.from(set);
}

// GET /api/biblioteca - Obtener catálogo completo y secciones
router.get("/", (req, res) => {
  try {
    const secciones = getSecciones();
    const libros = db.prepare("SELECT * FROM libros ORDER BY titulo ASC").all().map((l) => ({
      id: l.id,
      codigo: l.codigo,
      titulo: l.titulo,
      seccion: l.categoria,
      estado: l.prestados >= l.stock ? "prestado" : "disponible",
      stock: l.stock,
      prestados: l.prestados,
    }));

    res.json({ exito: true, secciones, libros });
  } catch (err) {
    res.status(500).json({ exito: false, mensaje: err.message });
  }
});

// POST /api/biblioteca/libro - Registrar un nuevo libro
router.post("/libro", (req, res) => {
  const { codigo, titulo, seccion } = req.body;
  if (!codigo || !titulo || !seccion) {
    return res.status(400).json({ exito: false, mensaje: "Código, título y sección son campos obligatorios." });
  }

  const codigoNorm = String(codigo).trim().toUpperCase();
  const tituloNorm = String(titulo).trim();
  const seccionNorm = String(seccion).trim().toUpperCase();

  const dup = db.prepare("SELECT codigo FROM libros WHERE codigo = ?").get(codigoNorm);
  if (dup) {
    return res.status(400).json({ exito: false, mensaje: `El código de libro "${codigoNorm}" ya está en uso.` });
  }

  const newId = `LIB-${Date.now().toString().slice(-6)}`;

  try {
    db.prepare(`
      INSERT INTO libros (id, codigo, titulo, categoria, stock, prestados)
      VALUES (?, ?, ?, ?, 1, 0)
    `).run(newId, codigoNorm, tituloNorm, seccionNorm);

    const nuevoLibro = {
      id: newId,
      codigo: codigoNorm,
      titulo: tituloNorm,
      seccion: seccionNorm,
      estado: "disponible",
    };

    res.json({ exito: true, mensaje: `Libro "${tituloNorm}" registrado con éxito.`, libro: nuevoLibro });
  } catch (err) {
    res.status(500).json({ exito: false, mensaje: err.message });
  }
});

// DELETE /api/biblioteca/libro/:id - Eliminar libro
router.delete("/libro/:id", (req, res) => {
  const id = req.params.id;
  const libro = db.prepare("SELECT * FROM libros WHERE id = ? OR codigo = ?").get(id, id.toUpperCase());

  if (!libro) {
    return res.status(404).json({ exito: false, mensaje: "Libro no encontrado." });
  }

  try {
    db.prepare("DELETE FROM libros WHERE id = ?").run(libro.id);
    res.json({ exito: true, mensaje: `Libro "${libro.titulo}" eliminado.`, id: libro.id });
  } catch (err) {
    res.status(500).json({ exito: false, mensaje: err.message });
  }
});

// GET /api/biblioteca/prestamos - Obtener historial y préstamos activos
router.get("/prestamos", (req, res) => {
  try {
    const rows = db.prepare("SELECT * FROM prestamos ORDER BY id DESC").all();
    const prestamos = rows.map((p) => {
      const libro = db.prepare("SELECT titulo FROM libros WHERE codigo = ?").get(p.libroCodigo);
      const usuario = db.prepare("SELECT ciclo, turno FROM usuarios WHERE codigo = ?").get(p.estudianteCodigo);

      return {
        id: p.id,
        codigoLibro: p.libroCodigo,
        tituloLibro: libro ? libro.titulo : `Libro [${p.libroCodigo}]`,
        codigoUsuario: p.estudianteCodigo,
        nombreUsuario: p.estudianteNombre,
        ciclo: usuario ? usuario.ciclo : "-",
        turno: usuario ? usuario.turno : "-",
        fechaPrestamo: p.fechaPrestamo,
        fechaDevolucion: p.fechaDevolucion || null,
        estado: p.estado.toLowerCase(),
      };
    });

    res.json({ exito: true, prestamos });
  } catch (err) {
    res.status(500).json({ exito: false, mensaje: err.message });
  }
});

// POST /api/biblioteca/prestamo - Registrar un préstamo (Código Libro + Código Estudiante)
router.post("/prestamo", (req, res) => {
  const { codigoLibro, codigoUsuario } = req.body;

  if (!codigoLibro || !codigoUsuario) {
    return res.status(400).json({ exito: false, mensaje: "Se requiere el código del libro y del estudiante." });
  }

  const codLibroNorm = String(codigoLibro).trim().toUpperCase();
  const codUsuarioNorm = String(codigoUsuario).trim().toUpperCase();

  const usuario = db.prepare("SELECT * FROM usuarios WHERE codigo = ?").get(codUsuarioNorm);
  if (!usuario) {
    return res.status(404).json({
      exito: false,
      mensaje: `Código de estudiante "${codUsuarioNorm}" no encontrado en el sistema.`,
    });
  }

  const libro = db.prepare("SELECT * FROM libros WHERE codigo = ?").get(codLibroNorm);
  if (!libro) {
    return res.status(404).json({
      exito: false,
      mensaje: `Código de libro "${codLibroNorm}" no registrado en la biblioteca.`,
    });
  }

  const prestamoActivo = db
    .prepare("SELECT * FROM prestamos WHERE libroCodigo = ? AND estado = 'PRESTADO'")
    .get(codLibroNorm);

  if (prestamoActivo || libro.prestados >= libro.stock) {
    return res.status(400).json({
      exito: false,
      mensaje: `El libro "${libro.titulo}" (${libro.codigo}) figura como PRESTADO actualmente.`,
    });
  }

  const fechaActual = new Date();
  const timestampStr =
    fechaActual.toLocaleDateString("es-PE") +
    " " +
    fechaActual.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: true }).toUpperCase();

  const nombreEstudiante = `${usuario.apellido}${usuario.apellido && usuario.nombre ? " " : ""}${usuario.nombre}`.trim();
  const newId = `PREST-${Date.now().toString().slice(-6)}`;

  try {
    db.transaction(() => {
      db.prepare(`
        INSERT INTO prestamos (id, libroCodigo, estudianteCodigo, estudianteNombre, fechaPrestamo, estado)
        VALUES (?, ?, ?, ?, ?, 'PRESTADO')
      `).run(newId, libro.codigo, usuario.codigo, nombreEstudiante, timestampStr);

      db.prepare("UPDATE libros SET prestados = prestados + 1 WHERE id = ?").run(libro.id);
    })();

    const nuevoPrestamo = {
      id: newId,
      codigoLibro: libro.codigo,
      tituloLibro: libro.titulo,
      codigoUsuario: usuario.codigo,
      nombreUsuario: nombreEstudiante,
      ciclo: usuario.ciclo || "-",
      turno: usuario.turno || "-",
      fechaPrestamo: timestampStr,
      fechaDevolucion: null,
      estado: "prestado",
    };

    res.json({
      exito: true,
      mensaje: `📖 Libro "${libro.titulo}" prestado a ${nombreEstudiante} (${usuario.ciclo || ""})`,
      prestamo: nuevoPrestamo,
      usuario: { nombre: nombreEstudiante, ciclo: usuario.ciclo, turno: usuario.turno },
      libro: { codigo: libro.codigo, titulo: libro.titulo },
    });
  } catch (err) {
    res.status(500).json({ exito: false, mensaje: err.message });
  }
});

// POST /api/biblioteca/devolucion - Registrar la devolución de un libro prestado
router.post("/devolucion", (req, res) => {
  const { idPrestamo, codigoLibro } = req.body;

  if (!idPrestamo && !codigoLibro) {
    return res.status(400).json({ exito: false, mensaje: "Falta identificador de préstamo o libro." });
  }

  let prestamo = null;
  if (idPrestamo) {
    prestamo = db.prepare("SELECT * FROM prestamos WHERE id = ? AND estado = 'PRESTADO'").get(idPrestamo);
  } else if (codigoLibro) {
    prestamo = db
      .prepare("SELECT * FROM prestamos WHERE libroCodigo = ? AND estado = 'PRESTADO'")
      .get(String(codigoLibro).trim().toUpperCase());
  }

  if (!prestamo) {
    return res.status(404).json({ exito: false, mensaje: "No se encontró un préstamo activo para esta selección." });
  }

  const fechaActual = new Date();
  const timestampStr =
    fechaActual.toLocaleDateString("es-PE") +
    " " +
    fechaActual.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: true }).toUpperCase();

  try {
    db.transaction(() => {
      db.prepare("UPDATE prestamos SET estado = 'DEVUELTO', fechaDevolucion = ? WHERE id = ?").run(
        timestampStr,
        prestamo.id
      );

      db.prepare("UPDATE libros SET prestados = MAX(0, prestados - 1) WHERE codigo = ?").run(prestamo.libroCodigo);
    })();

    const libro = db.prepare("SELECT titulo FROM libros WHERE codigo = ?").get(prestamo.libroCodigo);

    res.json({
      exito: true,
      mensaje: `✅ Libro "${libro ? libro.titulo : prestamo.libroCodigo}" marcado como DEVUELTO por ${prestamo.estudianteNombre}.`,
      prestamo: {
        id: prestamo.id,
        codigoLibro: prestamo.libroCodigo,
        estudianteNombre: prestamo.estudianteNombre,
        estado: "devuelto",
        fechaDevolucion: timestampStr,
      },
    });
  } catch (err) {
    res.status(500).json({ exito: false, mensaje: err.message });
  }
});

module.exports = router;
