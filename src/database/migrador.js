// src/database/migrador.js
const fs = require("fs");
const path = require("path");
const db = require("./db.js");

function ejecutarMigracionInicial(force = false) {
  const dataDir = path.join(__dirname, "../../data");

  // 1. Migrar Usuarios
  const usuariosPath = path.join(dataDir, "usuarios.json");
  if (fs.existsSync(usuariosPath)) {
    try {
      const usuarios = JSON.parse(fs.readFileSync(usuariosPath, "utf8"));
      const stmtCount = db.prepare("SELECT COUNT(*) as count FROM usuarios").get();
      if ((force || stmtCount.count === 0) && Array.isArray(usuarios) && usuarios.length > 0) {
        console.log(`📦 Migrando ${usuarios.length} usuarios desde usuarios.json a SQLite...`);
        const insert = db.prepare(`
          INSERT OR REPLACE INTO usuarios (codigo, nombre, apellido, rol, turno, ciclo, dias_asistencia)
          VALUES (@codigo, @nombre, @apellido, @rol, @turno, @ciclo, @dias_asistencia)
        `);

        const insertMany = db.transaction((users) => {
          for (const u of users) {
            insert.run({
              codigo: String(u.codigo).toUpperCase(),
              nombre: u.nombre || "",
              apellido: u.apellido || "",
              rol: u.rol || "estudiante",
              turno: u.turno || "",
              ciclo: u.ciclo || "",
              dias_asistencia: JSON.stringify(u.dias_asistencia || []),
            });
          }
        });
        insertMany(usuarios);
        console.log("✅ Usuarios migrados exitosamente a SQLite.");
      }
    } catch (e) {
      console.error("⚠️ Error migrando usuarios.json:", e.message);
    }
  }

  // 2. Migrar Ciclos
  const ciclosPath = path.join(dataDir, "ciclos.json");
  if (fs.existsSync(ciclosPath)) {
    try {
      const ciclosObj = JSON.parse(fs.readFileSync(ciclosPath, "utf8"));
      const ciclos = Array.isArray(ciclosObj) ? ciclosObj : (ciclosObj.ciclos || []);
      const stmtCount = db.prepare("SELECT COUNT(*) as count FROM ciclos").get();
      if ((force || stmtCount.count === 0) && Array.isArray(ciclos) && ciclos.length > 0) {
        console.log(`📦 Migrando ${ciclos.length} ciclos a SQLite...`);
        const insert = db.prepare("INSERT OR IGNORE INTO ciclos (nombre) VALUES (?)");
        const insertMany = db.transaction((cList) => {
          for (const c of cList) insert.run(String(c).toUpperCase());
        });
        insertMany(ciclos);
        console.log("✅ Ciclos migrados exitosamente.");
      }
    } catch (e) {
      console.error("⚠️ Error migrando ciclos.json:", e.message);
    }
  }

  // 3. Migrar Ciclos Visual (Página Web Pública)
  const ciclosVisualPath = path.join(dataDir, "ciclos_visual.json");
  if (fs.existsSync(ciclosVisualPath)) {
    try {
      const cvObj = JSON.parse(fs.readFileSync(ciclosVisualPath, "utf8"));
      const row = db.prepare("SELECT valor FROM config_general WHERE clave = 'ciclos_visual'").get();
      if (force || !row) {
        console.log("📦 Migrando ciclos_visual.json a SQLite...");
        db.prepare("INSERT OR REPLACE INTO config_general (clave, valor) VALUES ('ciclos_visual', ?)").run(
          JSON.stringify(cvObj, null, 2)
        );
        console.log("✅ Ciclos visuales migrados exitosamente.");
      }
    } catch (e) {
      console.error("⚠️ Error migrando ciclos_visual.json:", e.message);
    }
  }

  // 4. Migrar Horarios
  const horariosPath = path.join(dataDir, "horarios.json");
  if (fs.existsSync(horariosPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(horariosPath, "utf8"));
      const stmtCount = db.prepare("SELECT COUNT(*) as count FROM horarios").get();
      const horariosObj = data.ciclos || data.horarios || {};
      if ((force || stmtCount.count === 0) && Object.keys(horariosObj).length > 0) {
        console.log("📦 Migrando configuración de horarios a SQLite...");
        const insert = db.prepare(`
          INSERT OR REPLACE INTO horarios (ciclo, manana_entrada, manana_tolerancia, tarde_entrada, tarde_tolerancia)
          VALUES (?, ?, ?, ?, ?)
        `);
        const insertMany = db.transaction((hObj) => {
          for (const [ciclo, h] of Object.entries(hObj)) {
            insert.run(
              ciclo.toUpperCase(),
              h.mañana?.entrada || "08:30",
              h.mañana?.tolerancia || "08:35",
              h.tarde?.entrada || "15:00",
              h.tarde?.tolerancia || "15:15"
            );
          }
        });
        insertMany(horariosObj);
        console.log("✅ Horarios migrados exitosamente.");
      }
    } catch (e) {
      console.error("⚠️ Error migrando horarios.json:", e.message);
    }
  }

  // 5. Migrar Evaluaciones y Respuestas
  const evalPath = path.join(dataDir, "evaluaciones.json");
  if (fs.existsSync(evalPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(evalPath, "utf8"));
      const stmtCount = db.prepare("SELECT COUNT(*) as count FROM evaluaciones").get();
      if ((force || stmtCount.count === 0) && data && Array.isArray(data.evaluaciones)) {
        console.log(`📦 Migrando ${data.evaluaciones.length} evaluaciones a SQLite...`);

        const insertEval = db.prepare(`
          INSERT OR REPLACE INTO evaluaciones (id, titulo, ciclo, fecha, numPreguntas, puntajeCorrecta, puntajeIncorrecta, claves)
          VALUES (@id, @titulo, @ciclo, @fecha, @numPreguntas, @puntajeCorrecta, @puntajeIncorrecta, @claves)
        `);

        const insertResp = db.prepare(`
          INSERT INTO respuestas_evaluacion (evaluacion_id, codigoEstudiante, nombreEstudiante, ciclo, correctas, incorrectas, enBlanco, puntajeTotal, posicion, respuestas)
          VALUES (@evaluacion_id, @codigoEstudiante, @nombreEstudiante, @ciclo, @correctas, @incorrectas, @enBlanco, @puntajeTotal, @posicion, @respuestas)
        `);

        const insertMany = db.transaction((evals) => {
          for (const e of evals) {
            insertEval.run({
              id: e.id,
              titulo: e.titulo,
              ciclo: e.ciclo,
              fecha: e.fecha,
              numPreguntas: e.numPreguntas,
              puntajeCorrecta: e.puntajeCorrecta,
              puntajeIncorrecta: e.puntajeIncorrecta,
              claves: JSON.stringify(e.claves || e.claveRespuestas || {}),
            });

            if (Array.isArray(e.respuestasEstudiantes)) {
              for (const r of e.respuestasEstudiantes) {
                insertResp.run({
                  evaluacion_id: e.id,
                  codigoEstudiante: String(r.codigoEstudiante).toUpperCase(),
                  nombreEstudiante: r.nombreEstudiante || "",
                  ciclo: r.ciclo || e.ciclo,
                  correctas: r.correctas || 0,
                  incorrectas: r.incorrectas || 0,
                  enBlanco: r.enBlanco || 0,
                  puntajeTotal: r.puntajeTotal || 0,
                  posicion: r.posicion || 0,
                  respuestas: JSON.stringify(r.respuestas || {}),
                });
              }
            }
          }
        });
        insertMany(data.evaluaciones);
        console.log("✅ Evaluaciones y respuestas migradas exitosamente.");
      }
    } catch (e) {
      console.error("⚠️ Error migrando evaluaciones.json:", e.message);
    }
  }

  // 6. Migrar Tareas y Registros
  const tareasPath = path.join(dataDir, "tareas.json");
  if (fs.existsSync(tareasPath)) {
    try {
      const dataObj = JSON.parse(fs.readFileSync(tareasPath, "utf8"));
      const tareas = Array.isArray(dataObj) ? dataObj : (dataObj.tareas || []);
      const stmtCount = db.prepare("SELECT COUNT(*) as count FROM tareas").get();
      if ((force || stmtCount.count === 0) && Array.isArray(tareas) && tareas.length > 0) {
        console.log(`📦 Migrando ${tareas.length} grupos de tareas a SQLite...`);

        const insertTarea = db.prepare(`
          INSERT OR REPLACE INTO tareas (id, curso, ciclo, fecha, tipoEvaluacion)
          VALUES (@id, @curso, @ciclo, @fecha, @tipoEvaluacion)
        `);

        const insertReg = db.prepare(`
          INSERT INTO registros_tarea (tarea_id, codigoEstudiante, nombreEstudiante, nota, estado)
          VALUES (@tarea_id, @codigoEstudiante, @nombreEstudiante, @nota, @estado)
        `);

        const insertMany = db.transaction((tareaList) => {
          for (const t of tareaList) {
            insertTarea.run({
              id: t.id,
              curso: t.curso,
              ciclo: t.ciclo,
              fecha: t.fecha,
              tipoEvaluacion: t.tipoEvaluacion,
            });

            if (Array.isArray(t.registros)) {
              for (const r of t.registros) {
                insertReg.run({
                  tarea_id: t.id,
                  codigoEstudiante: String(r.codigoEstudiante).toUpperCase(),
                  nombreEstudiante: r.nombreEstudiante || "",
                  nota: r.nota !== undefined ? r.nota : null,
                  estado: r.estado || "EVALUADO",
                });
              }
            }
          }
        });
        insertMany(tareas);
        console.log("✅ Tareas y calificaciones migradas exitosamente.");
      }
    } catch (e) {
      console.error("⚠️ Error migrando tareas.json:", e.message);
    }
  }

  // 7. Migrar Biblioteca
  const biblioPath = path.join(dataDir, "biblioteca.json");
  if (fs.existsSync(biblioPath)) {
    try {
      const dataObj = JSON.parse(fs.readFileSync(biblioPath, "utf8"));
      const libros = Array.isArray(dataObj) ? dataObj : (dataObj.libros || []);
      const stmtCount = db.prepare("SELECT COUNT(*) as count FROM libros").get();
      if ((force || stmtCount.count === 0) && Array.isArray(libros) && libros.length > 0) {
        console.log(`📦 Migrando ${libros.length} libros a SQLite...`);
        const insert = db.prepare(`
          INSERT OR REPLACE INTO libros (id, codigo, titulo, autor, categoria, stock, prestados)
          VALUES (@id, @codigo, @titulo, @autor, @categoria, @stock, @prestados)
        `);
        const insertMany = db.transaction((bList) => {
          for (const b of bList) {
            insert.run({
              id: b.id,
              codigo: b.codigo,
              titulo: b.titulo,
              autor: b.autor || "",
              categoria: b.categoria || b.seccion || "",
              stock: b.stock || 1,
              prestados: b.prestados || (b.estado === "prestado" ? 1 : 0),
            });
          }
        });
        insertMany(libros);
        console.log("✅ Biblioteca migrada exitosamente.");
      }
    } catch (e) {
      console.error("⚠️ Error migrando biblioteca.json:", e.message);
    }
  }

  // 8. Migrar Préstamos
  const prestamosPath = path.join(dataDir, "prestamos.json");
  if (fs.existsSync(prestamosPath)) {
    try {
      const dataObj = JSON.parse(fs.readFileSync(prestamosPath, "utf8"));
      const prestamos = Array.isArray(dataObj) ? dataObj : (dataObj.prestamos || []);
      const stmtCount = db.prepare("SELECT COUNT(*) as count FROM prestamos").get();
      if ((force || stmtCount.count === 0) && Array.isArray(prestamos) && prestamos.length > 0) {
        console.log(`📦 Migrando ${prestamos.length} préstamos a SQLite...`);
        const insert = db.prepare(`
          INSERT OR REPLACE INTO prestamos (id, libroCodigo, estudianteCodigo, estudianteNombre, fechaPrestamo, fechaDevolucion, estado)
          VALUES (@id, @libroCodigo, @estudianteCodigo, @estudianteNombre, @fechaPrestamo, @fechaDevolucion, @estado)
        `);
        const insertMany = db.transaction((pList) => {
          for (const p of pList) {
            insert.run({
              id: p.id,
              libroCodigo: p.libroCodigo,
              estudianteCodigo: p.estudianteCodigo || p.codigoUsuario,
              estudianteNombre: p.estudianteNombre || p.nombreUsuario || "",
              fechaPrestamo: p.fechaPrestamo,
              fechaDevolucion: p.fechaDevolucion || "",
              estado: (p.estado || "PRESTADO").toUpperCase(),
            });
          }
        });
        insertMany(prestamos);
        console.log("✅ Préstamos migrados exitosamente.");
      }
    } catch (e) {
      console.error("⚠️ Error migrando prestamos.json:", e.message);
    }
  }

  // 9. Migrar WhatsApp Config
  const waPath = path.join(dataDir, "whatsappConfig.json");
  if (fs.existsSync(waPath)) {
    try {
      const waConfig = JSON.parse(fs.readFileSync(waPath, "utf8"));
      const row = db.prepare("SELECT valor FROM config_general WHERE clave = 'whatsapp_config'").get();
      if (force || !row) {
        db.prepare("INSERT OR REPLACE INTO config_general (clave, valor) VALUES ('whatsapp_config', ?)").run(
          JSON.stringify(waConfig, null, 2)
        );
        console.log("✅ Configuración de WhatsApp migrada exitosamente.");
      }
    } catch (e) {
      console.error("⚠️ Error migrando whatsappConfig.json:", e.message);
    }
  }

  // 10. Migrar Password de Admin
  const passPath = path.join(dataDir, "password.json");
  if (fs.existsSync(passPath)) {
    try {
      const passObj = JSON.parse(fs.readFileSync(passPath, "utf8"));
      if (passObj && passObj.password) {
        db.prepare("INSERT OR REPLACE INTO config_general (clave, valor) VALUES ('admin_password', ?)").run(
          passObj.password
        );
        console.log("✅ Contraseña de Admin migrada exitosamente.");
      }
    } catch (e) {
      console.error("⚠️ Error migrando password.json:", e.message);
    }
  }

  // 11. Migrar Notas de Estudiantes (notes.json)
  const notesPath = path.join(dataDir, "notes.json");
  if (fs.existsSync(notesPath)) {
    try {
      const notesObj = JSON.parse(fs.readFileSync(notesPath, "utf8"));
      if (notesObj && typeof notesObj === "object") {
        const stmt = db.prepare("INSERT OR REPLACE INTO config_general (clave, valor) VALUES (?, ?)");
        for (const [codigo, nota] of Object.entries(notesObj)) {
          if (nota) stmt.run(`note_${codigo}`, String(nota));
        }
        console.log("✅ Notas de estudiantes migradas exitosamente.");
      }
    } catch (e) {
      console.error("⚠️ Error migrando notes.json:", e.message);
    }
  }
}

// Permitir ejecución directa por línea de comandos: `node src/database/migrador.js --force`
if (require.main === module) {
  const isForce = process.argv.includes("--force");
  console.log(`🚀 Ejecutando migración de datos (modo forzado: ${isForce})...`);
  ejecutarMigracionInicial(isForce);
  console.log("🎉 Proceso de migración finalizado.");
}

module.exports = { ejecutarMigracionInicial };
