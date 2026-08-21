// src/routes/evaluaciones.route.js
const express = require("express");
const ExcelJS = require("exceljs");
const db = require("../database/db.js");
const { getFullName } = require("../utils/helpers.js");

const router = express.Router();

// Helper para obtener una evaluación completa con sus respuestas
function getEvaluacionCompleta(id) {
  const evalRow = db.prepare("SELECT * FROM evaluaciones WHERE id = ?").get(id);
  if (!evalRow) return null;

  const respRows = db
    .prepare("SELECT * FROM respuestas_evaluacion WHERE evaluacion_id = ? ORDER BY puntajeTotal DESC")
    .all(id);

  let claves = {};
  try {
    claves = JSON.parse(evalRow.claves || "{}");
  } catch (e) {}

  const respuestasEstudiantes = respRows.map((r, i) => {
    let respuestas = {};
    try {
      respuestas = JSON.parse(r.respuestas || "{}");
    } catch (e) {}
    return {
      codigoEstudiante: r.codigoEstudiante,
      nombreEstudiante: r.nombreEstudiante,
      ciclo: r.ciclo,
      correctas: r.correctas,
      incorrectas: r.incorrectas,
      enBlanco: r.enBlanco,
      puntajeTotal: r.puntajeTotal,
      posicion: i + 1,
      respuestas,
    };
  });

  return {
    id: evalRow.id,
    titulo: evalRow.titulo,
    ciclo: evalRow.ciclo,
    fecha: evalRow.fecha,
    numPreguntas: evalRow.numPreguntas,
    puntajeCorrecta: evalRow.puntajeCorrecta,
    puntajeIncorrecta: evalRow.puntajeIncorrecta,
    claveRespuestas: claves,
    respuestasEstudiantes,
  };
}

// 1. GET /api/evaluaciones - Listar todas las evaluaciones
router.get("/", (req, res) => {
  try {
    const rows = db.prepare("SELECT id FROM evaluaciones ORDER BY creado_en DESC").all();
    const evaluaciones = rows.map((r) => getEvaluacionCompleta(r.id)).filter(Boolean);
    res.json({ exito: true, evaluaciones });
  } catch (err) {
    res.status(500).json({ exito: false, mensaje: err.message });
  }
});

// 2. POST /api/evaluaciones - Crear nueva evaluación / simulacro
router.post("/", (req, res) => {
  try {
    const {
      titulo,
      ciclo,
      fecha,
      numPreguntas,
      puntajeCorrecta,
      puntajeIncorrecta,
      claveRespuestas,
    } = req.body;

    if (!titulo || !ciclo || !numPreguntas || !claveRespuestas) {
      return res.status(400).json({
        exito: false,
        mensaje: "Faltan datos obligatorios para crear la evaluación.",
      });
    }

    const newId = `EVAL-${Date.now()}`;
    const fechaUsar = fecha || new Date().toISOString().split("T")[0];

    db.prepare(`
      INSERT INTO evaluaciones (id, titulo, ciclo, fecha, numPreguntas, puntajeCorrecta, puntajeIncorrecta, claves)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      newId,
      titulo.trim(),
      ciclo.trim(),
      fechaUsar,
      parseInt(numPreguntas, 10),
      parseFloat(puntajeCorrecta) || 20,
      Math.abs(parseFloat(puntajeIncorrecta) || 0),
      JSON.stringify(claveRespuestas || {})
    );

    const nuevaEval = getEvaluacionCompleta(newId);
    res.json({
      exito: true,
      mensaje: "Evaluación creada correctamente.",
      evaluacion: nuevaEval,
    });
  } catch (err) {
    console.error("Error al crear evaluación en SQLite:", err);
    res.status(500).json({ exito: false, mensaje: "Error interno del servidor." });
  }
});

// 3. DELETE /api/evaluaciones/:id - Eliminar evaluación
router.delete("/:id", (req, res) => {
  try {
    const { id } = req.params;
    const info = db.prepare("DELETE FROM evaluaciones WHERE id = ?").run(id);

    if (info.changes === 0) {
      return res.status(404).json({ exito: false, mensaje: "Evaluación no encontrada." });
    }

    res.json({ exito: true, mensaje: "Evaluación eliminada correctamente." });
  } catch (err) {
    console.error("Error al eliminar evaluación en SQLite:", err);
    res.status(500).json({ exito: false, mensaje: "Error interno del servidor." });
  }
});

// 4. POST /api/evaluaciones/:id/respuesta - Registrar respuestas de alumno
router.post("/:id/respuesta", (req, res) => {
  try {
    const { id } = req.params;
    const { codigoEstudiante, respuestas } = req.body;

    if (!codigoEstudiante || !respuestas) {
      return res.status(400).json({
        exito: false,
        mensaje: "Código de estudiante y respuestas son obligatorios.",
      });
    }

    const codeUpper = String(codigoEstudiante).trim().toUpperCase();
    const usuario = db.prepare("SELECT * FROM usuarios WHERE codigo = ?").get(codeUpper);

    if (!usuario) {
      return res.status(404).json({
        exito: false,
        mensaje: `El estudiante con código '${codigoEstudiante}' no existe.`,
      });
    }

    const evalObj = getEvaluacionCompleta(id);
    if (!evalObj) {
      return res.status(404).json({ exito: false, mensaje: "Evaluación no encontrada." });
    }

    // Calificar respuestas
    let correctas = 0;
    let incorrectas = 0;
    let enBlanco = 0;

    for (let i = 1; i <= evalObj.numPreguntas; i++) {
      const qKey = i.toString();
      const respAlumno = (respuestas[qKey] || "").trim().toUpperCase();
      const respOficial = (evalObj.claveRespuestas[qKey] || "").trim().toUpperCase();

      if (!respAlumno) {
        enBlanco++;
      } else if (respAlumno === respOficial) {
        correctas++;
      } else {
        incorrectas++;
      }
    }

    const puntajeTotal = parseFloat(
      (correctas * evalObj.puntajeCorrecta - incorrectas * evalObj.puntajeIncorrecta).toFixed(3)
    );

    const nombreEstudiante = `${usuario.apellido}${usuario.apellido && usuario.nombre ? " " : ""}${usuario.nombre}`.trim();
    const cicloEstudiante = usuario.ciclo || evalObj.ciclo;

    db.transaction(() => {
      // Borrar respuesta previa del alumno si existe
      db.prepare("DELETE FROM respuestas_evaluacion WHERE evaluacion_id = ? AND codigoEstudiante = ?").run(
        id,
        codeUpper
      );

      // Insertar nuevo resultado
      db.prepare(`
        INSERT INTO respuestas_evaluacion (evaluacion_id, codigoEstudiante, nombreEstudiante, ciclo, correctas, incorrectas, enBlanco, puntajeTotal, respuestas)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        codeUpper,
        nombreEstudiante,
        cicloEstudiante,
        correctas,
        incorrectas,
        enBlanco,
        puntajeTotal,
        JSON.stringify(respuestas)
      );

      // Re-calcular posiciones del ranking
      const respRows = db
        .prepare("SELECT id, codigoEstudiante FROM respuestas_evaluacion WHERE evaluacion_id = ? ORDER BY puntajeTotal DESC")
        .all(id);

      const updatePos = db.prepare("UPDATE respuestas_evaluacion SET posicion = ? WHERE id = ?");
      let miPosicion = 1;
      respRows.forEach((r, idx) => {
        const pos = idx + 1;
        updatePos.run(pos, r.id);
        if (r.codigoEstudiante === codeUpper) {
          miPosicion = pos;
        }
      });
    })();

    const registroEstudiante = {
      codigoEstudiante: codeUpper,
      nombreEstudiante,
      ciclo: cicloEstudiante,
      respuestas,
      correctas,
      incorrectas,
      enBlanco,
      puntajeTotal,
      posicion: miPosicion,
    };

    res.json({
      exito: true,
      mensaje: "Respuestas calificadas correctamente.",
      resultado: registroEstudiante,
    });
  } catch (err) {
    console.error("Error al registrar respuestas en SQLite:", err);
    res.status(500).json({ exito: false, mensaje: "Error interno del servidor." });
  }
});

// 5. GET /api/evaluaciones/:id/ranking - Obtener Ranking de Evaluación
router.get("/:id/ranking", (req, res) => {
  try {
    const { id } = req.params;
    const evalObj = getEvaluacionCompleta(id);

    if (!evalObj) {
      return res.status(404).json({ exito: false, mensaje: "Evaluación no encontrada." });
    }

    res.json({
      exito: true,
      evaluacion: {
        id: evalObj.id,
        titulo: evalObj.titulo,
        ciclo: evalObj.ciclo,
        fecha: evalObj.fecha,
        numPreguntas: evalObj.numPreguntas,
        puntajeCorrecta: evalObj.puntajeCorrecta,
        puntajeIncorrecta: evalObj.puntajeIncorrecta,
      },
      ranking: evalObj.respuestasEstudiantes,
    });
  } catch (err) {
    console.error("Error al obtener ranking:", err);
    res.status(500).json({ exito: false, mensaje: "Error interno del servidor." });
  }
});

// 6. GET /api/evaluaciones/:id/excel - Exportar Cuadro de Notas a Excel
router.get("/:id/excel", async (req, res) => {
  try {
    const { id } = req.params;
    const evalObj = getEvaluacionCompleta(id);

    if (!evalObj) {
      return res.status(404).send("Evaluación no encontrada.");
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Ranking General");

    // Ancho de Columnas (6 Columnas sin Código ni Ciclo)
    sheet.columns = [
      { key: "posicion", width: 14 },
      { key: "nombreEstudiante", width: 42 },
      { key: "correctas", width: 14 },
      { key: "incorrectas", width: 14 },
      { key: "enBlanco", width: 14 },
      { key: "puntajeTotal", width: 18 },
    ];

    // Banner de Título
    sheet.mergeCells("A1:F1");
    const titleCell = sheet.getCell("A1");
    titleCell.value = "ACADEMIA PREUNIVERSITARIA INGEMAT - CUADRO GENERAL DE MÉRITO Y RANKING";
    titleCell.font = { name: "Arial", size: 13, bold: true, color: { argb: "FFFFFFFF" } };
    titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0A2240" } };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    sheet.getRow(1).height = 34;

    // Metadatos
    sheet.mergeCells("A2:F2");
    const subTitleCell = sheet.getCell("A2");
    subTitleCell.value = `EXAMEN: ${evalObj.titulo.toUpperCase()} | CICLO: ${evalObj.ciclo} | FECHA: ${evalObj.fecha} | PREGUNTAS: ${evalObj.numPreguntas}`;
    subTitleCell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FF475569" } };
    subTitleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
    subTitleCell.alignment = { horizontal: "center", vertical: "middle" };
    sheet.getRow(2).height = 22;

    sheet.getRow(3).height = 10;

    // Cabecera
    const headers = ["POSICIÓN", "ESTUDIANTE", "CORRECTAS", "INCORRECTAS", "EN BLANCO", "PUNTAJE TOTAL"];
    const headerRow = sheet.getRow(4);
    headerRow.height = 28;

    headers.forEach((h, idx) => {
      const cell = headerRow.getCell(idx + 1);
      cell.value = h;
      cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFB72107" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = {
        top: { style: "thin", color: { argb: "FFCBD5E1" } },
        bottom: { style: "medium", color: { argb: "FF0F172A" } },
        left: { style: "thin", color: { argb: "FFCBD5E1" } },
        right: { style: "thin", color: { argb: "FFCBD5E1" } },
      };
    });

    // Filas
    evalObj.respuestasEstudiantes.forEach((item, index) => {
      const pos = index + 1;
      let posText = `#${pos}`;
      if (pos === 1) posText = "🥇 1°";
      if (pos === 2) posText = "🥈 2°";
      if (pos === 3) posText = "🥉 3°";

      const row = sheet.addRow([
        posText,
        item.nombreEstudiante,
        item.correctas,
        item.incorrectas,
        item.enBlanco,
        item.puntajeTotal,
      ]);

      row.height = 22;
      let rowBg = pos % 2 === 0 ? "FFF8FAFC" : "FFFFFFFF";
      let isTop = false;

      if (pos === 1) {
        rowBg = "FFFFF9C3";
        isTop = true;
      } else if (pos === 2) {
        rowBg = "FFF1F5F9";
        isTop = true;
      } else if (pos === 3) {
        rowBg = "FFFFEDD5";
        isTop = true;
      }

      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: rowBg } };
        cell.font = {
          name: "Arial",
          size: 10,
          bold: isTop || colNumber === 1 || colNumber === 6,
          color: { argb: colNumber === 6 ? "FFB72107" : "FF0F172A" },
        };
        cell.alignment = {
          horizontal: colNumber === 2 ? "left" : "center",
          vertical: "middle",
        };
        cell.border = {
          top: { style: "thin", color: { argb: "FFCBD5E1" } },
          bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
          left: { style: "thin", color: { argb: "FFCBD5E1" } },
          right: { style: "thin", color: { argb: "FFCBD5E1" } },
        };
      });
    });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Ranking_${evalObj.titulo.replace(/[^a-zA-Z0-9]/g, "_")}.xlsx"`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("Error al exportar Excel de evaluación en SQLite:", err);
    res.status(500).send("Error interno al generar el archivo Excel.");
  }
});

// 7. GET /api/evaluaciones/tareas/list - Listar Tareas Registradas
router.get("/tareas/list", (req, res) => {
  try {
    const tareaRows = db.prepare("SELECT * FROM tareas ORDER BY creado_en DESC").all();
    const getRegs = db.prepare("SELECT id, codigoEstudiante, nombreEstudiante, nota, estado FROM registros_tarea WHERE tarea_id = ?");

    const tareas = tareaRows.map((t) => ({
      id: t.id,
      curso: t.curso,
      ciclo: t.ciclo,
      fecha: t.fecha,
      tipoEvaluacion: t.tipoEvaluacion,
      registros: getRegs.all(t.id),
    }));

    res.json({ exito: true, tareas });
  } catch (err) {
    res.status(500).json({ exito: false, mensaje: err.message });
  }
});

// 8. POST /api/evaluaciones/tareas - Registrar Tarea y Calificación
router.post("/tareas", (req, res) => {
  try {
    const { curso, ciclo, fecha, tipoEvaluacion, registros } = req.body;

    if (!curso || !ciclo || !registros || !Array.isArray(registros)) {
      return res.status(400).json({
        exito: false,
        mensaje: "Curso, ciclo y registros de estudiantes son obligatorios.",
      });
    }

    const newId = `TAR-${Date.now()}`;
    const fechaUsar = fecha || new Date().toISOString().split("T")[0];

    db.transaction(() => {
      db.prepare(`
        INSERT INTO tareas (id, curso, ciclo, fecha, tipoEvaluacion)
        VALUES (?, ?, ?, ?, ?)
      `).run(newId, curso.trim(), ciclo.trim(), fechaUsar, tipoEvaluacion || "vigesimal");

      const insertReg = db.prepare(`
        INSERT INTO registros_tarea (tarea_id, codigoEstudiante, nombreEstudiante, nota, estado)
        VALUES (?, ?, ?, ?, ?)
      `);

      for (const r of registros) {
        const codeUpper = String(r.codigoEstudiante || "").trim().toUpperCase();
        const u = db.prepare("SELECT nombre, apellido FROM usuarios WHERE codigo = ?").get(codeUpper);
        const nombreEstudiante = u ? `${u.apellido}${u.apellido && u.nombre ? " " : ""}${u.nombre}`.trim() : `Alumno [${codeUpper}]`;

        insertReg.run(newId, codeUpper, nombreEstudiante, r.nota !== undefined ? r.nota : null, r.estado || "EVALUADO");
      }
    })();

    const tareaRegistrada = {
      id: newId,
      curso: curso.trim(),
      ciclo: ciclo.trim(),
      fecha: fechaUsar,
      tipoEvaluacion: tipoEvaluacion || "vigesimal",
      registros: db.prepare("SELECT codigoEstudiante, nombreEstudiante, nota, estado FROM registros_tarea WHERE tarea_id = ?").all(newId),
    };

    res.json({
      exito: true,
      mensaje: "Registro de tareas guardado correctamente.",
      tarea: tareaRegistrada,
    });
  } catch (err) {
    console.error("Error al guardar tareas en SQLite:", err);
    res.status(500).json({ exito: false, mensaje: "Error interno del servidor." });
  }
});

// 9. GET /api/evaluaciones/reporte-estudiante/:codigo - Reporte Consolidado del Alumno
router.get("/reporte-estudiante/:codigo", (req, res) => {
  try {
    const { codigo } = req.params;
    const codeUpper = String(codigo).trim().toUpperCase();

    const usuario = db.prepare("SELECT * FROM usuarios WHERE codigo = ?").get(codeUpper);
    if (!usuario) {
      return res.status(404).json({
        exito: false,
        mensaje: `No se encontró ningún estudiante con el código '${codigo}'.`,
      });
    }

    const nombreEstudiante = `${usuario.apellido}${usuario.apellido && usuario.nombre ? " " : ""}${usuario.nombre}`.trim();

    // 1. Evaluaciones
    const evalRows = db.prepare(`
      SELECT e.id as evaluacionId, e.titulo, e.ciclo, e.fecha, e.numPreguntas,
             r.correctas, r.incorrectas, r.enBlanco, r.puntajeTotal, r.posicion
      FROM respuestas_evaluacion r
      JOIN evaluaciones e ON r.evaluacion_id = e.id
      WHERE r.codigoEstudiante = ?
      ORDER BY e.creado_en DESC
    `).all(codeUpper);

    // 2. Tareas
    const tareaRows = db.prepare(`
      SELECT t.id as tareaId, t.curso, t.ciclo, t.fecha, t.tipoEvaluacion, r.nota, r.estado
      FROM registros_tarea r
      JOIN tareas t ON r.tarea_id = t.id
      WHERE r.codigoEstudiante = ?
      ORDER BY t.creado_en DESC
    `).all(codeUpper);

    res.json({
      exito: true,
      estudiante: {
        codigo: usuario.codigo,
        nombre: nombreEstudiante,
        ciclo: usuario.ciclo || "N/A",
        turno: usuario.turno || "MAÑANA",
        rol: usuario.rol || "ESTUDIANTE",
      },
      historialEvaluaciones: evalRows,
      historialTareas: tareaRows,
    });
  } catch (err) {
    console.error("Error al obtener reporte de estudiante en SQLite:", err);
    res.status(500).json({ exito: false, mensaje: "Error interno del servidor." });
  }
});

// 10. DELETE /api/evaluaciones/tareas/registro/:id - Eliminar un Registro Individual de Tarea
router.delete("/tareas/registro/:id", (req, res) => {
  try {
    const { id } = req.params;
    const reg = db.prepare("SELECT tarea_id FROM registros_tarea WHERE id = ?").get(id);
    if (!reg) {
      return res.status(404).json({ exito: false, mensaje: "Registro de tarea no encontrado." });
    }

    const tareaId = reg.tarea_id;
    db.prepare("DELETE FROM registros_tarea WHERE id = ?").run(id);

    // Si ya no quedan registros para esta tarea, limpiar la tarea padre
    const countRemaining = db.prepare("SELECT COUNT(*) as count FROM registros_tarea WHERE tarea_id = ?").get(tareaId);
    if (countRemaining && countRemaining.count === 0) {
      db.prepare("DELETE FROM tareas WHERE id = ?").run(tareaId);
    }

    res.json({ exito: true, mensaje: "Registro de tarea eliminado correctamente." });
  } catch (err) {
    console.error("Error al eliminar registro de tarea:", err);
    res.status(500).json({ exito: false, mensaje: err.message });
  }
});

// 11. DELETE /api/evaluaciones/tareas/:id - Eliminar Grupo de Tarea Completo
router.delete("/tareas/:id", (req, res) => {
  try {
    const { id } = req.params;
    db.prepare("DELETE FROM tareas WHERE id = ?").run(id);
    res.json({ exito: true, mensaje: "Tarea y sus registros eliminados correctamente." });
  } catch (err) {
    console.error("Error al eliminar grupo de tarea:", err);
    res.status(500).json({ exito: false, mensaje: err.message });
  }
});

// 12. GET /api/evaluaciones/tareas/excel-salon - Exportar Consolidado de Tareas por Salón / Ciclo
router.get("/tareas/excel-salon", async (req, res) => {
  try {
    const { ciclo } = req.query;
    if (!ciclo || !ciclo.trim()) {
      return res.status(400).send("Debe especificar un ciclo o salón para exportar.");
    }
    const cicloNorm = ciclo.trim();

    // 1. Obtener todos los estudiantes del ciclo desde usuarios
    const estudiantes = db.prepare(`
      SELECT codigo, nombre, apellido, ciclo
      FROM usuarios
      WHERE UPPER(rol) = 'ESTUDIANTE' AND UPPER(ciclo) = UPPER(?)
      ORDER BY apellido ASC, nombre ASC
    `).all(cicloNorm);

    // 2. Obtener tareas del ciclo que tengan al menos 1 registro (contar un curso si hay como mínimo un estudiante registrado)
    const tareasRows = db.prepare(`
      SELECT t.id, t.curso, t.fecha, t.tipoEvaluacion, COUNT(r.id) as totalRegistros
      FROM tareas t
      JOIN registros_tarea r ON t.id = r.tarea_id
      WHERE UPPER(t.ciclo) = UPPER(?)
      GROUP BY t.id
      HAVING totalRegistros > 0
      ORDER BY t.fecha ASC, t.curso ASC
    `).all(cicloNorm);

    // 3. Obtener todos los registros de tareas para este ciclo
    const registrosRows = db.prepare(`
      SELECT r.tarea_id, r.codigoEstudiante, r.nota, r.estado
      FROM registros_tarea r
      JOIN tareas t ON r.tarea_id = t.id
      WHERE UPPER(t.ciclo) = UPPER(?)
    `).all(cicloNorm);

    // Mapa de registros: `tareaId_codigoEstudiante` -> { nota, estado }
    const mapaRegistros = new Map();
    registrosRows.forEach((reg) => {
      const key = `${reg.tarea_id}_${String(reg.codigoEstudiante).toUpperCase()}`;
      mapaRegistros.set(key, reg);
    });

    // Si algún alumno registrado en tareas no figura en la tabla usuarios con ese ciclo, incluirlo
    const codigosEstudiantesSet = new Set(estudiantes.map((e) => e.codigo.toUpperCase()));
    registrosRows.forEach((reg) => {
      const cod = String(reg.codigoEstudiante).toUpperCase();
      if (!codigosEstudiantesSet.has(cod)) {
        const u = db.prepare("SELECT codigo, nombre, apellido, ciclo FROM usuarios WHERE codigo = ?").get(cod);
        estudiantes.push({
          codigo: cod,
          nombre: u ? u.nombre : "",
          apellido: u ? u.apellido : `Alumno [${cod}]`,
          ciclo: cicloNorm,
        });
        codigosEstudiantesSet.add(cod);
      }
    });

    if (estudiantes.length === 0 && tareasRows.length === 0) {
      return res.status(404).send(`No se encontraron registros de tareas ni estudiantes para el ciclo "${cicloNorm}".`);
    }

    const ExcelJS = require("exceljs");
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(`Tareas - ${cicloNorm.substring(0, 25)}`);

    const totalCols = Math.max(3 + tareasRows.length + 2, 5);

    // Fila 1: Título Institucional
    sheet.mergeCells(1, 1, 1, totalCols);
    const titleCell = sheet.getCell(1, 1);
    titleCell.value = `ACADEMIA INGEMAT - CONSOLIDADO DE TAREAS: ${cicloNorm.toUpperCase()}`;
    titleCell.font = { name: "Arial", size: 14, bold: true, color: { argb: "FFFFFFFF" } };
    titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    sheet.getRow(1).height = 32;

    // Fila 2: Subtítulo Informativo
    sheet.mergeCells(2, 1, 2, totalCols);
    const subtitleCell = sheet.getCell(2, 1);
    const todayStr = new Date().toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" });
    subtitleCell.value = `Ciclo / Salón: ${cicloNorm} | Total Estudiantes: ${estudiantes.length} | Tareas Evaluadas: ${tareasRows.length} | Fecha de Emisión: ${todayStr}`;
    subtitleCell.font = { name: "Arial", size: 10, italic: true, color: { argb: "FF475569" } };
    subtitleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
    subtitleCell.alignment = { horizontal: "center", vertical: "middle" };
    sheet.getRow(2).height = 20;

    sheet.addRow([]); // Fila 3 vacía

    // Fila 4: Cabeceras
    const headers = ["N°", "CÓDIGO", "ESTUDIANTE"];
    tareasRows.forEach((t) => {
      const fParts = (t.fecha || "").split("-");
      const fFormatted = fParts.length === 3 ? `${fParts[2]}/${fParts[1]}` : t.fecha;
      headers.push(`${t.curso}\n(${fFormatted})`);
    });
    headers.push("ENTREGADAS", "NO PRESENTÓ (NP)");

    const headerRow = sheet.addRow(headers);
    headerRow.height = 30;
    headerRow.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
      cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.border = {
        top: { style: "thin", color: { argb: "FF94A3B8" } },
        bottom: { style: "medium", color: { argb: "FF64748B" } },
        left: { style: "thin", color: { argb: "FF94A3B8" } },
        right: { style: "thin", color: { argb: "FF94A3B8" } },
      };
    });

    // Filas de Alumnos
    estudiantes.forEach((est, idx) => {
      const nombreCompleto = `${est.apellido || ""}${est.apellido && est.nombre ? " " : ""}${est.nombre || ""}`.trim() || `Alumno [${est.codigo}]`;
      const rowData = [
        idx + 1,
        est.codigo,
        nombreCompleto,
      ];

      let countEntregadas = 0;
      let countNP = 0;

      tareasRows.forEach((t) => {
        const key = `${t.id}_${est.codigo.toUpperCase()}`;
        const reg = mapaRegistros.get(key);

        if (reg) {
          if (reg.nota !== null && reg.nota !== undefined) {
            rowData.push(Number(reg.nota));
            countEntregadas++;
          } else if (reg.estado === "NO PRESENTÓ") {
            rowData.push("NP");
            countNP++;
          } else {
            rowData.push(reg.estado || "PRESENTÓ");
            countEntregadas++;
          }
        } else {
          // A los que no hubo registro, mostrar NP (no presentó)
          rowData.push("NP");
          countNP++;
        }
      });

      rowData.push(countEntregadas, countNP);

      const studentRow = sheet.addRow(rowData);
      studentRow.height = 22;
      const isEven = idx % 2 === 0;
      const bg = isEven ? "FFFFFFFF" : "FFF8FAFC";

      studentRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const isNP = cell.value === "NP";
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: isNP ? "FFFEE2E2" : bg },
        };
        cell.font = {
          name: "Arial",
          size: 9.5,
          bold: colNumber <= 2 || isNP || colNumber > (3 + tareasRows.length),
          color: { argb: isNP ? "FF991B1B" : (colNumber === 3 ? "FF0F172A" : "FF334155") },
        };
        cell.alignment = {
          horizontal: colNumber === 3 ? "left" : "center",
          vertical: "middle",
        };
        cell.border = {
          top: { style: "thin", color: { argb: "FFE2E8F0" } },
          bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
          left: { style: "thin", color: { argb: "FFE2E8F0" } },
          right: { style: "thin", color: { argb: "FFE2E8F0" } },
        };
      });
    });

    // Ajuste de anchos de columna
    sheet.getColumn(1).width = 6;   // N°
    sheet.getColumn(2).width = 14;  // CÓDIGO
    sheet.getColumn(3).width = 34;  // ESTUDIANTE
    tareasRows.forEach((t, i) => {
      sheet.getColumn(4 + i).width = Math.max(t.curso.length + 4, 15);
    });
    sheet.getColumn(4 + tareasRows.length).width = 16;     // ENTREGADAS
    sheet.getColumn(5 + tareasRows.length).width = 18;     // NO PRESENTÓ (NP)

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Tareas_Salon_${cicloNorm.replace(/[^a-zA-Z0-9]/g, "_")}.xlsx"`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("Error al exportar Excel de tareas de salón en SQLite:", err);
    res.status(500).send("Error interno al generar el archivo Excel de tareas.");
  }
});

module.exports = router;
