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
        .prepare("SELECT id FROM respuestas_evaluacion WHERE evaluacion_id = ? ORDER BY puntajeTotal DESC")
        .all(id);

      const updatePos = db.prepare("UPDATE respuestas_evaluacion SET posicion = ? WHERE id = ?");
      respRows.forEach((r, idx) => {
        updatePos.run(idx + 1, r.id);
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
    const getRegs = db.prepare("SELECT codigoEstudiante, nombreEstudiante, nota, estado FROM registros_tarea WHERE tarea_id = ?");

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

module.exports = router;
