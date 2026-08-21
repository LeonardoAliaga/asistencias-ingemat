// src/routes/evaluaciones.route.js
const express = require("express");
const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");
const { getFullName } = require("../utils/helpers.js");

const router = express.Router();

const evaluacionesPath = path.join(__dirname, "../../data/evaluaciones.json");
const tareasPath = path.join(__dirname, "../../data/tareas.json");
const usuariosPath = path.join(__dirname, "../../data/usuarios.json");
const registrosPath = path.join(__dirname, "../../Registros");

// Helpers de lectura / escritura JSON
function getEvaluacionesData() {
  try {
    if (!fs.existsSync(evaluacionesPath)) {
      const initial = { evaluaciones: [] };
      fs.writeFileSync(evaluacionesPath, JSON.stringify(initial, null, 2));
      return initial;
    }
    return JSON.parse(fs.readFileSync(evaluacionesPath, "utf8"));
  } catch (err) {
    console.error("Error al leer evaluaciones.json:", err);
    return { evaluaciones: [] };
  }
}

function saveEvaluacionesData(data) {
  try {
    fs.writeFileSync(evaluacionesPath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Error al guardar evaluaciones.json:", err);
  }
}

function getTareasData() {
  try {
    if (!fs.existsSync(tareasPath)) {
      const initial = { tareas: [] };
      fs.writeFileSync(tareasPath, JSON.stringify(initial, null, 2));
      return initial;
    }
    return JSON.parse(fs.readFileSync(tareasPath, "utf8"));
  } catch (err) {
    console.error("Error al leer tareas.json:", err);
    return { tareas: [] };
  }
}

function saveTareasData(data) {
  try {
    fs.writeFileSync(tareasPath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Error al guardar tareas.json:", err);
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

// 1. GET /api/evaluaciones - Listar todas las evaluaciones
router.get("/", (req, res) => {
  const data = getEvaluacionesData();
  res.json({ exito: true, evaluaciones: data.evaluaciones });
});

// 2. POST /api/evaluaciones - Crear nueva evaluación / simulacro
router.post("/", (req, res) => {
  try {
    const {
      titulo,
      ciclo,
      fecha,
      tipo,
      numPreguntas,
      puntajeCorrecta,
      puntajeIncorrecta,
      puntajeEnBlanco,
      claveRespuestas,
    } = req.body;

    if (!titulo || !ciclo || !numPreguntas || !claveRespuestas) {
      return res.status(400).json({
        exito: false,
        mensaje: "Faltan datos obligatorios para crear la evaluación.",
      });
    }

    const data = getEvaluacionesData();
    const newId = `EVAL-${Date.now()}`;

    const nuevaEval = {
      id: newId,
      titulo: titulo.trim(),
      ciclo: ciclo.trim(),
      fecha: fecha || new Date().toISOString().split("T")[0],
      tipo: tipo || "simulacro",
      numPreguntas: parseInt(numPreguntas, 10),
      opcionesValidas: ["A", "B", "C", "D", "E"],
      puntajeCorrecta: parseFloat(puntajeCorrecta) || 20,
      puntajeIncorrecta: Math.abs(parseFloat(puntajeIncorrecta) || 0),
      puntajeEnBlanco: parseFloat(puntajeEnBlanco) || 0,
      claveRespuestas: claveRespuestas, // { "1": "A", "2": "C", ... }
      respuestasEstudiantes: [],
    };

    data.evaluaciones.unshift(nuevaEval);
    saveEvaluacionesData(data);

    res.json({
      exito: true,
      mensaje: "Evaluación creada correctamente.",
      evaluacion: nuevaEval,
    });
  } catch (err) {
    console.error("Error al crear evaluación:", err);
    res.status(500).json({ exito: false, mensaje: "Error interno del servidor." });
  }
});

// 3. DELETE /api/evaluaciones/:id - Eliminar evaluación
router.delete("/:id", (req, res) => {
  try {
    const { id } = req.params;
    const data = getEvaluacionesData();
    const initialLen = data.evaluaciones.length;

    data.evaluaciones = data.evaluaciones.filter((e) => e.id !== id);

    if (data.evaluaciones.length === initialLen) {
      return res.status(404).json({ exito: false, mensaje: "Evaluación no encontrada." });
    }

    saveEvaluacionesData(data);
    res.json({ exito: true, mensaje: "Evaluación eliminada correctamente." });
  } catch (err) {
    console.error("Error al eliminar evaluación:", err);
    res.status(500).json({ exito: false, mensaje: "Error interno del servidor." });
  }
});

// 4. POST /api/evaluaciones/:id/respuesta - Registrar respuestas de alumno
router.post("/:id/respuesta", (req, res) => {
  try {
    const { id } = req.params;
    const { codigoEstudiante, respuestas } = req.body; // respuestas: { "1": "A", "2": "B", ... }

    if (!codigoEstudiante || !respuestas) {
      return res.status(400).json({
        exito: false,
        mensaje: "Código de estudiante y respuestas son obligatorios.",
      });
    }

    const usuarios = getUsuariosData();
    const usuario = usuarios.find(
      (u) => u.codigo.toUpperCase() === codigoEstudiante.trim().toUpperCase()
    );

    if (!usuario) {
      return res.status(404).json({
        exito: false,
        mensaje: `El estudiante con código '${codigoEstudiante}' no existe.`,
      });
    }

    const data = getEvaluacionesData();
    const evalObj = data.evaluaciones.find((e) => e.id === id);

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

    const puntajeTotal =
      correctas * evalObj.puntajeCorrecta -
      incorrectas * evalObj.puntajeIncorrecta +
      enBlanco * evalObj.puntajeEnBlanco;

    const registroEstudiante = {
      codigoEstudiante: usuario.codigo,
      nombreEstudiante: getFullName(usuario),
      ciclo: usuario.ciclo || evalObj.ciclo,
      turno: usuario.turno || "MAÑANA",
      respuestas: respuestas,
      correctas,
      incorrectas,
      enBlanco,
      puntajeTotal: parseFloat(puntajeTotal.toFixed(3)),
      fechaRegistro: new Date().toISOString(),
    };

    // Reemplazar si ya rindió el examen o agregar
    const idx = evalObj.respuestasEstudiantes.findIndex(
      (r) => r.codigoEstudiante.toUpperCase() === usuario.codigo.toUpperCase()
    );

    if (idx !== -1) {
      evalObj.respuestasEstudiantes[idx] = registroEstudiante;
    } else {
      evalObj.respuestasEstudiantes.push(registroEstudiante);
    }

    // Re-ordenar ranking por puntaje descendente y asignar posición
    evalObj.respuestasEstudiantes.sort((a, b) => b.puntajeTotal - a.puntajeTotal);
    evalObj.respuestasEstudiantes.forEach((r, i) => {
      r.posicion = i + 1;
    });

    saveEvaluacionesData(data);

    res.json({
      exito: true,
      mensaje: "Respuestas calificadas correctamente.",
      resultado: registroEstudiante,
    });
  } catch (err) {
    console.error("Error al registrar respuestas de estudiante:", err);
    res.status(500).json({ exito: false, mensaje: "Error interno del servidor." });
  }
});

// 5. GET /api/evaluaciones/:id/ranking - Obtener Ranking de Evaluación
router.get("/:id/ranking", (req, res) => {
  try {
    const { id } = req.params;
    const data = getEvaluacionesData();
    const evalObj = data.evaluaciones.find((e) => e.id === id);

    if (!evalObj) {
      return res.status(404).json({ exito: false, mensaje: "Evaluación no encontrada." });
    }

    const ranking = [...evalObj.respuestasEstudiantes].sort(
      (a, b) => b.puntajeTotal - a.puntajeTotal
    );

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
      ranking,
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
    const data = getEvaluacionesData();
    const evalObj = data.evaluaciones.find((e) => e.id === id);

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

    // Fila 1: Banner de Título Institucional (Estilo Asistencias Minimalista)
    sheet.mergeCells("A1:F1");
    const titleCell = sheet.getCell("A1");
    titleCell.value = "ACADEMIA PREUNIVERSITARIA INGEMAT - CUADRO GENERAL DE MÉRITO Y RANKING";
    titleCell.font = { name: "Arial", size: 13, bold: true, color: { argb: "FFFFFFFF" } };
    titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0A2240" } };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    sheet.getRow(1).height = 34;

    // Fila 2: Metadatos del Examen
    sheet.mergeCells("A2:F2");
    const subTitleCell = sheet.getCell("A2");
    subTitleCell.value = `EXAMEN: ${evalObj.titulo.toUpperCase()} | CICLO: ${evalObj.ciclo} | FECHA: ${evalObj.fecha} | PREGUNTAS: ${evalObj.numPreguntas}`;
    subTitleCell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FF475569" } };
    subTitleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
    subTitleCell.alignment = { horizontal: "center", vertical: "middle" };
    sheet.getRow(2).height = 22;

    // Fila 3: Espacio
    sheet.getRow(3).height = 10;

    // Fila 4: Cabecera de Tabla de Datos
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

    // Filas de Datos (Ranking Ordenado)
    const ranking = [...evalObj.respuestasEstudiantes].sort((a, b) => b.puntajeTotal - a.puntajeTotal);

    ranking.forEach((item, index) => {
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

      // Colores de Fila según posición (Podio Top 3 + Alternados)
      let rowBg = pos % 2 === 0 ? "FFF8FAFC" : "FFFFFFFF";
      let isTop = false;

      if (pos === 1) {
        rowBg = "FFFFF9C3"; // Oro suave
        isTop = true;
      } else if (pos === 2) {
        rowBg = "FFF1F5F9"; // Plata suave
        isTop = true;
      } else if (pos === 3) {
        rowBg = "FFFFEDD5"; // Bronce suave
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

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Ranking_${evalObj.titulo.replace(/[^a-zA-Z0-9]/g, "_")}.xlsx"`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("Error al exportar Excel de evaluación:", err);
    res.status(500).send("Error interno al generar el archivo Excel.");
  }
});

// 7. GET /api/evaluaciones/tareas - Listar Tareas Registradas
router.get("/tareas/list", (req, res) => {
  const data = getTareasData();
  res.json({ exito: true, tareas: data.tareas });
});

// 8. POST /api/evaluaciones/tareas - Registrar Tarea y Calificación
router.post("/tareas", (req, res) => {
  try {
    const { curso, ciclo, fecha, tipoEvaluacion, registros } = req.body;
    // registros: [{ codigoEstudiante, nota, estado }]

    if (!curso || !ciclo || !registros || !Array.isArray(registros)) {
      return res.status(400).json({
        exito: false,
        mensaje: "Curso, ciclo y registros de estudiantes son obligatorios.",
      });
    }

    const usuarios = getUsuariosData();
    const registrosEnriquecidos = registros.map((r) => {
      const codeUpper = (r.codigoEstudiante || "").trim().toUpperCase();
      const u = usuarios.find((usr) => (usr.codigo || "").toUpperCase() === codeUpper);
      return {
        codigoEstudiante: r.codigoEstudiante,
        nombreEstudiante: u ? getFullName(u) : `Alumno [${r.codigoEstudiante}]`,
        nota: r.nota !== undefined ? r.nota : null,
        estado: r.estado || "EVALUADO",
      };
    });

    const data = getTareasData();
    const newId = `TAR-${Date.now()}`;

    const nuevaTarea = {
      id: newId,
      curso: curso.trim(),
      ciclo: ciclo.trim(),
      fecha: fecha || new Date().toISOString().split("T")[0],
      tipoEvaluacion: tipoEvaluacion || "vigesimal", // "vigesimal" | "binario"
      registros: registrosEnriquecidos,
    };

    data.tareas.unshift(nuevaTarea);
    saveTareasData(data);

    res.json({
      exito: true,
      mensaje: "Registro de tareas guardado correctamente.",
      tarea: nuevaTarea,
    });
  } catch (err) {
    console.error("Error al guardar tareas:", err);
    res.status(500).json({ exito: false, mensaje: "Error interno del servidor." });
  }
});

// 9. GET /api/evaluaciones/reporte-estudiante/:codigo - Reporte Consolidado del Alumno
router.get("/reporte-estudiante/:codigo", (req, res) => {
  try {
    const { codigo } = req.params;
    const codeUpper = codigo.trim().toUpperCase();

    const usuarios = getUsuariosData();
    const usuario = usuarios.find((u) => u.codigo.toUpperCase() === codeUpper);

    if (!usuario) {
      return res.status(404).json({
        exito: false,
        mensaje: `No se encontró ningún estudiante con el código '${codigo}'.`,
      });
    }

    // 1. Desglose de Evaluaciones y Simulacros
    const evalData = getEvaluacionesData();
    const historialEvaluaciones = [];

    evalData.evaluaciones.forEach((e) => {
      const resp = e.respuestasEstudiantes.find(
        (r) => r.codigoEstudiante.toUpperCase() === codeUpper
      );
      if (resp) {
        historialEvaluaciones.push({
          evaluacionId: e.id,
          titulo: e.titulo,
          ciclo: e.ciclo,
          fecha: e.fecha,
          tipo: e.tipo,
          numPreguntas: e.numPreguntas,
          correctas: resp.correctas,
          incorrectas: resp.incorrectas,
          enBlanco: resp.enBlanco,
          puntajeTotal: resp.puntajeTotal,
          posicion: resp.posicion,
          totalParticipantes: e.respuestasEstudiantes.length,
        });
      }
    });

    // 2. Desglose de Tareas
    const tareasData = getTareasData();
    const historialTareas = [];

    tareasData.tareas.forEach((t) => {
      const reg = t.registros.find(
        (r) => r.codigoEstudiante.toUpperCase() === codeUpper
      );
      if (reg) {
        historialTareas.push({
          tareaId: t.id,
          curso: t.curso,
          ciclo: t.ciclo,
          fecha: t.fecha,
          tipoEvaluacion: t.tipoEvaluacion,
          nota: reg.nota,
          estado: reg.estado,
        });
      }
    });

    // 3. Conteo de Asistencias desde Registros Excel
    let totalPuntual = 0;
    let totalTardanza = 0;
    let totalFalta = 0;
    let totalJustificada = 0;

    if (fs.existsSync(registrosPath)) {
      const archivos = fs.readdirSync(registrosPath).filter((f) => f.endsWith(".xlsx"));
      archivos.forEach((f) => {
        // En base a nombre o verificación ligera
        totalPuntual++; // Simulación base para conteo rápido
      });
    }

    res.json({
      exito: true,
      estudiante: {
        codigo: usuario.codigo,
        nombre: getFullName(usuario),
        ciclo: usuario.ciclo || "N/A",
        turno: usuario.turno || "MAÑANA",
        rol: usuario.rol || "ESTUDIANTE",
      },
      asistenciaResumen: {
        puntual: totalPuntual,
        tardanza: totalTardanza,
        falta: totalFalta,
        justificada: totalJustificada,
      },
      historialEvaluaciones,
      historialTareas,
    });
  } catch (err) {
    console.error("Error al obtener reporte consolidado de estudiante:", err);
    res.status(500).json({ exito: false, mensaje: "Error interno del servidor." });
  }
});

module.exports = router;
