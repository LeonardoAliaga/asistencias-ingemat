const { randomUUID, createHash } = require("node:crypto");
const db = require("../database/db");
const { normalizeDefinition, grade } = require("./grading.service");
const { AppError } = require("../utils/errors");
const { audit } = require("./audit.service");
const { businessDate } = require("../utils/time");
function getExam(id) {
  const row = db.prepare("SELECT * FROM evaluaciones WHERE id=?").get(id);
  if (!row) throw new AppError("Evaluación no encontrada.", 404);
  return {
    ...row,
    definition: row.definition ? JSON.parse(row.definition) : null,
  };
}
function saveExam(body, req, id) {
  const title = String(body.titulo || "").trim(),
    cycle = String(body.ciclo || "").trim();
  if (!title || title.length > 180 || !cycle)
    throw new AppError("Indica título y ciclo.");
  const registeredCycle = db
    .prepare("SELECT nombre FROM ciclos WHERE UPPER(TRIM(nombre))=UPPER(?)")
    .get(cycle);
  if (!registeredCycle)
    throw new AppError(
      "El ciclo seleccionado ya no existe. Actualiza los ciclos y elige uno registrado.",
    );
  const def = normalizeDefinition(body.definition, { complete: false });
  const existing = id ? getExam(id) : null;
  if (existing && existing.estado !== "borrador")
    throw new AppError(
      "Un examen listo o publicado conserva su estructura. Usa una revisión de claves para corregirlo.",
      409,
    );
  const examId = id || randomUUID(),
    fecha = body.fecha || businessDate();
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(fecha) ||
    Number.isNaN(Date.parse(fecha)) ||
    new Date(fecha + "T00:00:00Z").toISOString().slice(0, 10) !== fecha
  )
    throw new AppError("Fecha inválida.");
  const keys = Object.fromEntries(
    Object.entries(def.keys).map(([q, k]) => [q, k.answers[0] || ""]),
  );
  const areas = Object.fromEntries(
    def.areas.map((a) => [
      a.code,
      Object.fromEntries(
        def.sections.flatMap((s) =>
          s.rules[a.code].questions.map((q) => [q, keys[q]]),
        ),
      ),
    ]),
  );
  const args = [
    title,
    cycle,
    fecha,
    def.areas.length > 1 ? "simulacro_areas" : "simulacro_estandar",
    def.areas[0].requiredQuestions,
    def.totalQuestions,
    def.scoring.correct,
    def.scoring.wrong,
    JSON.stringify(keys),
    JSON.stringify(areas),
    JSON.stringify(def),
  ];
  if (existing)
    db.prepare(
      "UPDATE evaluaciones SET titulo=?,ciclo=?,fecha=?,tipo=?,numPreguntas=?,totalPreguntasCuadernillo=?,puntajeCorrecta=?,puntajeIncorrecta=?,claves=?,preguntasPorArea=?,definition=? WHERE id=?",
    ).run(...args, examId);
  else
    db.prepare(
      "INSERT INTO evaluaciones(titulo,ciclo,fecha,tipo,numPreguntas,totalPreguntasCuadernillo,puntajeCorrecta,puntajeIncorrecta,claves,preguntasPorArea,definition,id,estado) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,'borrador')",
    ).run(...args, examId);
  audit(req, existing ? "editar" : "crear", "evaluacion", examId, {
    titulo: title,
  });
  return getExam(examId);
}
function readyExam(id, req) {
  const exam = getExam(id);
  if (exam.estado !== "borrador")
    throw new AppError("Solo se puede validar un borrador.", 409);
  const def = normalizeDefinition(exam.definition);
  db.transaction(() => {
    db.prepare(
      "UPDATE evaluaciones SET estado='listo',definition=? WHERE id=?",
    ).run(JSON.stringify(def), id);
    db.prepare(
      "INSERT OR IGNORE INTO exam_roster(evaluation_id,user_uid,code_snapshot,name_snapshot,cycle_snapshot) SELECT ?,uid,codigo,TRIM(apellido||' '||nombre),ciclo FROM usuarios WHERE rol='estudiante' AND archived_at IS NULL AND UPPER(ciclo)=UPPER(?)",
    ).run(id, exam.ciclo);
    db.prepare(
      "INSERT INTO evaluation_revisions(evaluation_id,revision,definition,key_snapshot,actor,reason) VALUES(?,?,?,?,?,?)",
    ).run(
      id,
      exam.revision,
      JSON.stringify(def),
      JSON.stringify(def.keys),
      req.session.username,
      "Validación inicial",
    );
    audit(req, "validar", "evaluacion", id);
  })();
  return getExam(id);
}
function rankExam(id) {
  const rows = db
    .prepare(
      "SELECT id,codigoEstudiante,puntajeTotal FROM respuestas_evaluacion WHERE evaluacion_id=? ORDER BY puntajeTotal DESC,codigoEstudiante ASC",
    )
    .all(id);
  let lastScore,
    rank = 0;
  const update = db.prepare(
    "UPDATE respuestas_evaluacion SET posicion=? WHERE id=?",
  );
  rows.forEach((r, i) => {
    if (r.puntajeTotal !== lastScore) rank = i + 1;
    lastScore = r.puntajeTotal;
    update.run(rank, r.id);
  });
}
function saveGrade(
  id,
  body,
  req,
  { reason = "", allowReplace = false, source = "manual" } = {},
) {
  const exam = getExam(id);
  if (!exam.definition || !["listo", "publicado"].includes(exam.estado))
    throw new AppError(
      "Primero valida la estructura y las claves del simulacro.",
    );
  const code = String(body.codigoEstudiante || "")
    .trim()
    .toUpperCase();
  const user = db.prepare("SELECT * FROM usuarios WHERE codigo=?").get(code);
  if (!user || user.rol !== "estudiante")
    throw new AppError("Estudiante no encontrado.", 404);
  if (user.archived_at) throw new AppError("El estudiante está archivado. Restáuralo antes de registrar nuevas notas.", 409);
  if (
    String(user.ciclo).toUpperCase() !== String(exam.ciclo).toUpperCase() &&
    !db
      .prepare("SELECT 1 FROM exam_roster WHERE evaluation_id=? AND user_uid=?")
      .get(id, user.uid)
  )
    throw new AppError("El estudiante no pertenece al ciclo de este examen.");
  const prev = db
    .prepare(
      "SELECT * FROM respuestas_evaluacion WHERE evaluacion_id=? AND codigoEstudiante=? ORDER BY id DESC",
    )
    .get(id, code);
  if (prev && !allowReplace)
    throw new AppError(
      `El estudiante ${code} ya tiene calificación. Confirma la corrección con un motivo.`,
      409,
    );
  if (prev && String(reason).trim().length < 5)
    throw new AppError("Describe el motivo de la corrección.");
  const result = grade(
    exam.definition,
    body.respuestas,
    body.area || user.area,
    body.form || "A",
  );
  result.revision = exam.revision;
  result.source = source;
  result.definitionHash = createHash("sha256")
    .update(JSON.stringify(exam.definition))
    .digest("hex");
  const roster = db
    .prepare("SELECT * FROM exam_roster WHERE evaluation_id=? AND user_uid=?")
    .get(id, user.uid);
  const name =
    roster?.name_snapshot || `${user.apellido} ${user.nombre}`.trim();
  const cycle = roster?.cycle_snapshot || user.ciclo;
  db.transaction(() => {
    // A changed grade must be reviewed before another publication/notice.
    require("./notifications.service").cancelPendingResults(id, user.uid);
    if (exam.estado === "publicado")
      db.prepare("UPDATE evaluaciones SET estado='listo' WHERE id=?").run(id);
    if (prev)
      db.prepare(
        "INSERT INTO grade_history(evaluation_id,student_code,revision,snapshot,actor,reason) VALUES(?,?,?,?,?,?)",
      ).run(
        id,
        code,
        prev.revision,
        JSON.stringify(prev),
        req.session?.username || "sistema",
        reason,
      );
    db.prepare(
      "DELETE FROM respuestas_evaluacion WHERE evaluacion_id=? AND codigoEstudiante=?",
    ).run(id, code);
    db.prepare(
      "INSERT INTO respuestas_evaluacion(evaluacion_id,codigoEstudiante,nombreEstudiante,ciclo,area,correctas,incorrectas,enBlanco,puntajeTotal,respuestas,detail,revision) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
    ).run(
      id,
      code,
      name,
      cycle,
      result.area,
      result.correctas,
      result.incorrectas,
      result.enBlanco,
      result.puntajeTotal,
      JSON.stringify(body.respuestas),
      JSON.stringify(result),
      exam.revision,
    );
    rankExam(id);
    audit(req, prev ? "corregir_nota" : "calificar", "evaluacion", id, {
      codigo: code,
      puntaje: result.puntajeTotal,
      revision: exam.revision,
      source,
      reason,
    });
  })();
  return {
    ...result,
    codigoEstudiante: code,
    nombreEstudiante: name,
    posicion: db
      .prepare(
        "SELECT posicion FROM respuestas_evaluacion WHERE evaluacion_id=? AND codigoEstudiante=?",
      )
      .get(id, code).posicion,
  };
}
function reviseKeys(id, body, req) {
  const exam = getExam(id);
  if (!exam.definition || !["listo", "publicado"].includes(exam.estado))
    throw new AppError("El examen no está listo.");
  const reason = String(body.reason || "").trim();
  if (reason.length < 5) throw new AppError("Indica el motivo de la revisión.");
  if (
    body.forms !== undefined &&
    JSON.stringify(body.forms) !== JSON.stringify(exam.definition.forms)
  )
    throw new AppError(
      "Las versiones y su orden quedan fijados al validar. Crea otro simulacro si necesitas cambiar el orden del cuadernillo.",
      409,
    );
  const next = normalizeDefinition({ ...exam.definition, keys: body.keys });
  const results = db
    .prepare("SELECT * FROM respuestas_evaluacion WHERE evaluacion_id=?")
    .all(id);
  db.transaction(() => {
    db.prepare(
      "UPDATE evaluaciones SET definition=?,revision=revision+1,estado='listo',claves=? WHERE id=?",
    ).run(
      JSON.stringify(next),
      JSON.stringify(
        Object.fromEntries(
          Object.entries(next.keys).map(([n, k]) => [n, k.answers[0] || ""]),
        ),
      ),
      id,
    );
    db.prepare(
      "INSERT INTO evaluation_revisions(evaluation_id,revision,definition,key_snapshot,actor,reason) VALUES(?,?,?,?,?,?)",
    ).run(
      id,
      exam.revision + 1,
      JSON.stringify(next),
      JSON.stringify(next.keys),
      req.session.username,
      reason,
    );
    for (const r of results) {
      const oldDetail = JSON.parse(r.detail || "{}");
      saveGrade(
        id,
        {
          codigoEstudiante: r.codigoEstudiante,
          area: r.area,
          form: oldDetail.form || "A",
          respuestas: JSON.parse(r.respuestas),
        },
        req,
        { allowReplace: true, reason, source: "recalculo" },
      );
    }
    audit(req, "revisar_claves", "evaluacion", id, {
      reason,
      revision: exam.revision + 1,
      calificaciones: results.length,
    });
  })();
  return getExam(id);
}
module.exports = {
  getExam,
  saveExam,
  readyExam,
  saveGrade,
  reviseKeys,
  rankExam,
};
