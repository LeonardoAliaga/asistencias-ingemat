const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { parse } = require("csv-parse/sync");
const db = require("../database/db");
const config = require("../config");
const { layouts } = require("./omr-layout");
const { bookletLayouts } = require("./omr-booklet-layout");
const { runReader } = require("./omr-runtime.service");
function sheetLayouts(def, version, sheet) {
  if (version === 5) {
    const saved = db
      .prepare("SELECT definition FROM omr_layouts WHERE id=?")
      .get(sheet?.layout_id);
    if (!saved)
      throw new AppError(
        "No se encuentra el diseño registrado de esta cartilla.",
      );
    return JSON.parse(saved.definition);
  }
  return version === 2
    ? layouts(def.totalQuestions)
    : bookletLayouts(def, version === 3 ? "quarter-duplex" : "half-single");
}
const { resolveQR } = require("./omr-pdf.service");
const {
  getExam,
  saveGrade,
  examStudents,
  assignedArea,
} = require("./evaluations.service");
const { grade, normalizeResponse } = require("./grading.service");
const { AppError } = require("../utils/errors");
const { audit } = require("./audit.service");
const root = path.join(config.dataDir, "imports");
fs.mkdirSync(root, { recursive: true });
function batch(id) {
  const b = db.prepare("SELECT * FROM import_batches WHERE id=?").get(id);
  if (!b) throw new AppError("Lote no encontrado.", 404);
  return { ...b, files: JSON.parse(b.files), result: JSON.parse(b.result) };
}
// Read-only presentation data: matching a student never resolves an area,
// changes a stored reading or makes a batch eligible for grading.
function batchView(id) {
  const b = batch(id),
    exam = b.evaluation_id ? getExam(b.evaluation_id) : null,
    groups = new Map(),
    matched = new Map(),
    cache = new Map(),
    lookup = db.prepare(
      "SELECT u.codigo,u.nombre,u.apellido,u.ciclo,r.name_snapshot,r.cycle_snapshot FROM usuarios u LEFT JOIN exam_roster r ON r.evaluation_id=? AND r.user_uid=u.uid WHERE u.codigo=? AND u.rol='estudiante' AND u.archived_at IS NULL AND (? = '' OR UPPER(u.ciclo)=UPPER(?) OR r.user_uid IS NOT NULL)",
    );
  const findStudent = (exam, code) => {
    const key = `${exam.id}:${code}`;
    if (typeof code !== "string" || !code) return null;
    if (!cache.has(key)) {
      const student = lookup.get(exam.id, code, exam.ciclo, exam.ciclo);
      cache.set(
        key,
        student
          ? {
              code: student.codigo,
              ...(!exam.ciclo
                ? { cycle: student.cycle_snapshot ?? student.ciclo }
                : {}),
              name:
                student.name_snapshot ||
                `${student.apellido} ${student.nombre}`.trim(),
            }
          : null,
      );
    }
    return cache.get(key);
  };
  for (const page of b.result.pages || []) {
    page.identifiedStudent = null;
    if (page.error || page.excluded) continue;
    try {
      const sheet = resolveQR(page.qr),
        current = exam || getExam(sheet.evaluation_id);
      if (
        sheet.evaluation_id !== current.id ||
        sheet.revision > current.revision ||
        !sheetLayouts(current.definition, sheet.layout_version, sheet).some(
          (l) => l.page === sheet.page,
        )
      )
        continue;
      page.examId = current.id;
      page.examTitle = current.titulo;
      page.examAreas = current.definition.areas.map(({ code, name }) => ({
        code,
        name,
      }));
      const group = groups.get(sheet.id) || {
        pages: [],
        codes: new Set(),
        exam: current,
      };
      group.pages.push(page);
      if (sheet.layout_version === 2) group.codes.add(sheet.student_code);
      else if (sheet.page === 1 && page.identification) {
        const code = (page.identificationOverride || page.identification).code;
        group.codes.add(
          typeof code === "string" && /^\d{8}$/.test(code) ? code : "",
        );
      }
      groups.set(sheet.id, group);
    } catch {
      // Invalid/unregistered QR data must not identify a student for display.
    }
  }
  for (const [sheetId, group] of groups) {
    if (group.codes.size !== 1) continue;
    const code = [...group.codes][0];
    if (!code) continue;
    const student = findStudent(group.exam, code);
    matched.set(sheetId, student);
    for (const page of group.pages) page.identifiedStudent = student;
  }
  for (const row of b.result.rows || [])
    row.identifiedStudent =
      b.source === "omr"
        ? matched.get(row.sheetId) || null
        : findStudent(exam || getExam(row.examId), row.codigoEstudiante);
  return b;
}
function listBatches(req) {
  return db
    .prepare(
      "SELECT b.id,b.evaluation_id,b.revision,b.source,b.status,b.error,b.actor,b.created_at,(SELECT group_concat(e.titulo,' · ') FROM json_each(COALESCE(json_extract(b.result,'$.revisions'),'{}')) r JOIN evaluaciones e ON e.id=r.key) AS exam_titles FROM import_batches b WHERE b.status NOT IN ('committed','failed') OR NOT EXISTS (SELECT 1 FROM hidden_import_batches h WHERE h.batch_id=b.id AND h.actor=?) ORDER BY b.created_at DESC,b.rowid DESC LIMIT 100",
    )
    .all(req.session.username);
}
function clearBatchHistory(req) {
  const result = db
    .prepare(
      "INSERT OR IGNORE INTO hidden_import_batches(actor,batch_id) SELECT ?,id FROM import_batches WHERE status IN ('committed','failed')",
    )
    .run(req.session.username);
  return { hidden: result.changes };
}
function restoreBatchHistory(req) {
  db.prepare("DELETE FROM hidden_import_batches WHERE actor=?").run(
    req.session.username,
  );
  return { exito: true };
}
function writeResult(id, result, status) {
  db.prepare(
    "UPDATE import_batches SET result=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
  ).run(JSON.stringify(result), status, id);
}
function createCSV(id, text, req) {
  const exam = getExam(id);
  if (!exam.definition || !["listo", "publicado"].includes(exam.estado))
    throw new AppError("Valida el examen antes de importar.");
  if (typeof text !== "string" || Buffer.byteLength(text) > 2 * 1024 * 1024)
    throw new AppError("El CSV supera 2 MB.");
  let records;
  try {
    records = parse(text, {
      columns: true,
      bom: true,
      skip_empty_lines: true,
      trim: true,
      max_record_size: 12000,
    });
  } catch {
    throw new AppError(
      "CSV inválido. Usa columnas codigo,area,version,1,2,... separadas por comas.",
    );
  }
  if (!records.length || records.length > 500)
    throw new AppError("El CSV debe contener entre 1 y 500 estudiantes.");
  const codes = new Set(),
    rows = records.map((r, index) => {
      const code = String(r.codigo || "").toUpperCase();
      if (codes.has(code))
        throw new AppError(`Código duplicado en fila ${index + 2}: ${code}`);
      codes.add(code);
      const user = examStudents(exam, code);
      if (!user)
        throw new AppError(
          `Fila ${index + 2}: estudiante ${code} no está habilitado para este examen.`,
        );
      const respuestas = {};
      for (let q = 1; q <= exam.definition.totalQuestions; q++) {
        if (!(String(q) in r))
          throw new AppError(`Falta la columna ${q} en el CSV.`);
        respuestas[q] = normalizeResponse(r[q]);
      }
      const area = String(r.area || assignedArea(user.area)).toUpperCase(),
        form = String(r.version || "A").toUpperCase();
      const preview = grade(exam.definition, respuestas, area, form);
      return {
        codigoEstudiante: code,
        area: preview.area,
        form,
        respuestas,
        preview,
      };
    });
  const batchId = randomUUID();
  db.prepare(
    "INSERT INTO import_batches(id,evaluation_id,revision,source,status,result,actor) VALUES(?,?,?,'csv','ready',?,?)",
  ).run(
    batchId,
    id,
    exam.revision,
    JSON.stringify({ rows, reviewVersion: 1 }),
    req.session.username,
  );
  audit(req, "previsualizar_csv", "lote", batchId, { filas: rows.length });
  return batch(batchId);
}
function createScan(id = "", files, req) {
  id ||= "";
  const requestId = req.body?.requestId;
  if (requestId !== undefined) {
    if (
      typeof requestId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        requestId,
      )
    )
      throw new AppError("Identificador de captura inválido.");
    const previous = db
      .prepare(
        "SELECT evaluation_id,batch_id FROM scan_requests WHERE actor=? AND request_id=?",
      )
      .get(req.session.username, requestId);
    if (previous) {
      if (previous.evaluation_id !== id)
        throw new AppError("Este envío pertenece a otro examen.", 409);
      return batch(previous.batch_id);
    }
  }
  const exam = id ? getExam(id) : null;
  if (
    exam &&
    (!exam.definition || !["listo", "publicado"].includes(exam.estado))
  )
    throw new AppError("Valida el examen antes de escanear.");
  if (!files?.length)
    throw new AppError("Selecciona al menos un PDF o imagen.");
  const batchId = randomUUID(),
    dir = path.join(root, batchId);
  fs.mkdirSync(dir, { recursive: true });
  const moved = [];
  try {
    for (const file of files) {
      const ext = path.extname(file.originalname).toLowerCase();
      if (![".pdf", ".png", ".jpg", ".jpeg"].includes(ext))
        throw new AppError("Solo se admiten PDF, PNG o JPG.");
      const target = path.join(dir, randomUUID() + ext);
      fs.renameSync(file.path, target);
      moved.push({
        path: path.relative(config.dataDir, target),
        name: path.basename(file.originalname).slice(0, 120),
      });
    }
    db.transaction(() => {
      db.prepare(
        "INSERT INTO import_batches(id,evaluation_id,revision,source,files,actor) VALUES(?,?,?,'omr',?,?)",
      ).run(
        batchId,
        id,
        exam?.revision || 0,
        JSON.stringify(moved),
        req.session.username,
      );
      if (requestId)
        db.prepare(
          "INSERT INTO scan_requests(actor,request_id,evaluation_id,batch_id) VALUES(?,?,?,?)",
        ).run(req.session.username, requestId, id, batchId);
      audit(req, "cargar_cartillas", "lote", batchId, {
        archivos: files.length,
      });
    })();
    return batch(batchId);
  } catch (error) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw error;
  }
}
function buildExamRows(exam, result, currentBatchId) {
  const sheets = new Map();
  let needsReview = false;
  for (const page of result.pages || []) {
    delete page.warning;
    if (page.excluded) continue;
    if (page.error) {
      needsReview = true;
      continue;
    }
    try {
      const sheet = resolveQR(page.qr);
      if (
        sheet.evaluation_id !== exam.id ||
        sheet.revision > exam.revision ||
        ![2, 3, 4, 5].includes(sheet.layout_version)
      )
        throw new AppError("Cartilla de otro examen o formato incompatible.");
      if (
        db
          .prepare("SELECT 1 FROM imported_sheets WHERE sheet_id=? AND page=?")
          .get(sheet.id, sheet.page)
      )
        throw new AppError(
          "Esta página ya fue importada. No se volverá a registrar.",
        );
      if (
        page.layoutVersion !== undefined &&
        page.layoutVersion !== sheet.layout_version
      )
        throw new AppError(
          "La lectura no corresponde al diseño de esta cartilla.",
        );
      const geometry = sheetLayouts(
        exam.definition,
        sheet.layout_version,
        sheet,
      ).find((l) => l.page === sheet.page);
      if (!geometry) throw new AppError("Página desconocida.");
      const expectedQuestions = geometry.bubbles
        .map((b) => String(b.question))
        .sort();
      if (
        JSON.stringify(Object.keys(page.responses || {}).sort()) !==
        JSON.stringify(expectedQuestions)
      )
        throw new AppError(
          "La lectura no contiene las preguntas exactas de esta cara.",
        );
      page.examId = exam.id;
      page.examTitle = exam.titulo;
      page.sheetId = sheet.id;
      page.codigoEstudiante = sheet.student_code;
      page.area = sheet.area;
      page.form = sheet.form;
      const group = sheets.get(sheet.id) || {
        sheet,
        pages: new Set(),
        respuestas: {},
      };
      if (group.pages.has(sheet.page))
        throw new AppError("Página duplicada dentro de este lote.");
      if (
        !sheetLayouts(exam.definition, sheet.layout_version, sheet).some(
          (l) => l.page === sheet.page,
        )
      )
        throw new AppError("Página desconocida.");
      group.pages.add(sheet.page);
      if (page.identification)
        group.identification =
          page.identificationOverride || page.identification;
      Object.assign(group.respuestas, page.responses);
      sheets.set(sheet.id, group);
      if (
        Object.values(page.responses).some((r) =>
          ["uncertain", "multiple"].includes(r.status),
        ) &&
        !page.reviewed
      )
        needsReview = true;
    } catch (error) {
      page.error = error.message;
      needsReview = true;
    }
  }
  const rows = [];
  for (const [sheetId, g] of sheets) {
    const expected = sheetLayouts(
      exam.definition,
      g.sheet.layout_version,
      g.sheet,
    ).length;
    if (g.pages.size !== expected) {
      needsReview = true;
      for (const p of result.pages)
        if (p.sheetId === sheetId)
          p.warning = `Faltan páginas: se requieren ${expected}.`;
      continue;
    }
    try {
      if (g.sheet.layout_version !== 2) {
        const identity = g.identification;
        if (!identity || !/^\d{8}$/.test(identity.code || ""))
          throw new AppError(
            "Revisa la identificación: marca exactamente un dígito en cada una de las 8 columnas.",
          );
        const student = examStudents(exam, identity.code);
        if (!student)
          throw new AppError(
            "El código marcado no corresponde a un estudiante del examen. Revisa la identificación.",
          );
        if (!exam.definition.areas.some((a) => a.code === identity.area))
          throw new AppError(
            "Revisa la identificación: marca una sola área válida.",
          );
        if (
          exam.definition.areas.length > 1 &&
          assignedArea(student.area) &&
          assignedArea(student.area) !== identity.area
        )
          throw new AppError(
            "El área marcada no coincide con el perfil registrado. Revisa la cartilla y el perfil del alumno.",
          );
        g.sheet.student_code = identity.code;
        g.sheet.area = identity.area;
        for (const p of result.pages)
          if (p.sheetId === sheetId) {
            p.codigoEstudiante = identity.code;
            p.area = identity.area;
          }
      }
      const preview = grade(
        exam.definition,
        g.respuestas,
        g.sheet.area,
        g.sheet.form,
      );
      rows.push({
        examId: exam.id,
        examTitle: exam.titulo,
        revision: exam.revision,
        sheetId,
        codigoEstudiante: g.sheet.student_code,
        area: g.sheet.area,
        form: g.sheet.form,
        respuestas: g.respuestas,
        preview,
      });
    } catch (error) {
      needsReview = true;
      for (const p of result.pages)
        if (p.sheetId === sheetId) p.warning = error.message;
    }
  }
  result.rows = rows;
  return needsReview || !rows.length ? "review" : "ready";
}
// Automatic batches can contain several exams. Keep each exam's rules and
// revisions separate while reviewing/committing the batch as one transaction.
function buildRows(exam, result, currentBatchId) {
  const groups = new Map();
  let needsReview = false;
  for (const page of result.pages || []) {
    delete page.warning;
    if (page.excluded) continue;
    if (page.error) {
      needsReview = true;
      continue;
    }
    try {
      const sheet = resolveQR(page.qr),
        current = exam || getExam(sheet.evaluation_id);
      if (
        !current.definition ||
        !["listo", "publicado"].includes(current.estado)
      )
        throw new AppError(
          "El examen de esta cartilla no está listo para recibir respuestas.",
        );
      if (sheet.evaluation_id !== current.id)
        throw new AppError("Cartilla de otro examen.");
      const group = groups.get(current.id) || { exam: current, pages: [] };
      group.pages.push(page);
      groups.set(current.id, group);
    } catch (error) {
      page.error = error.message;
      needsReview = true;
    }
  }
  const rows = [],
    revisions = {};
  for (const group of groups.values()) {
    const part = { pages: group.pages };
    if (buildExamRows(group.exam, part, currentBatchId) !== "ready")
      needsReview = true;
    rows.push(...part.rows);
    revisions[group.exam.id] = group.exam.revision;
  }
  const students = new Set();
  for (const row of rows) {
    const key = `${row.examId}:${row.codigoEstudiante}`;
    if (students.has(key)) {
      needsReview = true;
      for (const p of result.pages || [])
        if (
          !p.excluded &&
          p.examId === row.examId &&
          p.codigoEstudiante === row.codigoEstudiante
        )
          p.warning =
            "Hay varias cartillas del mismo estudiante en este examen. Excluye la repetida.";
    }
    students.add(key);
  }
  result.rows = rows;
  result.revisions = revisions;
  return needsReview || !rows.length ? "review" : "ready";
}
async function readRegisteredSheets(current, requestPath) {
  const sourceDir = path.join(root, current.id, "sources"),
    pageDir = path.join(root, current.id, "pages");
  fs.writeFileSync(
    requestPath,
    JSON.stringify({
      mode: "identify",
      files: current.files.map((f) => ({
        ...f,
        path: path.resolve(config.dataDir, f.path),
      })),
      outputDir: sourceDir,
    }),
  );
  const discovered = await runReader(requestPath, { batchId: current.id });
  const files = [],
    pages = discovered.pages;
  for (const [index, page] of pages.entries()) {
    try {
      if (page.error) continue;
      const sheet = resolveQR(page.qr),
        exam = getExam(sheet.evaluation_id);
      page.examId = exam.id;
      page.examTitle = exam.titulo;
      if (current.evaluation_id && current.evaluation_id !== exam.id)
        throw new AppError("Cartilla de otro examen.");
      if (!exam.definition || !["listo", "publicado"].includes(exam.estado))
        throw new AppError(
          "El examen del QR no está listo para recibir respuestas.",
        );
      if (sheet.revision > exam.revision)
        throw new AppError("Revisión de cartilla incompatible.");
      const layout = sheetLayouts(
        exam.definition,
        sheet.layout_version,
        sheet,
      ).find((l) => l.page === sheet.page);
      if (!layout) throw new AppError("Cara de cartilla desconocida.");
      const source = path.resolve(page.sourcePath || "");
      if (!source.startsWith(sourceDir + path.sep))
        throw new AppError("Imagen de captura inválida.");
      files.push({
        path: source,
        name: page.file,
        layout,
        expectedQR: page.qr,
        sourceIndex: index,
      });
    } catch (error) {
      page.error = error.message;
    }
  }
  if (files.length) {
    fs.writeFileSync(
      requestPath,
      JSON.stringify({ mode: "read", files, outputDir: pageDir }),
    );
    const readings = await runReader(requestPath, { batchId: current.id });
    for (const [i, file] of files.entries())
      pages[file.sourceIndex] = {
        ...pages[file.sourceIndex],
        ...(readings.pages[i] || {
          error: "El lector no devolvió esta cartilla.",
        }),
      };
  }
  for (const page of pages) {
    if (!page.imagePath && page.sourcePath) page.imagePath = page.sourcePath;
    delete page.sourcePath;
    if (page.imagePath)
      page.imagePath = path.relative(config.dataDir, page.imagePath);
  }
  return { pages, reviewVersion: 1 };
}
let busy = false;
async function processScanQueue() {
  if (busy) return;
  const b = db
    .prepare(
      "SELECT id FROM import_batches WHERE source='omr' AND status='queued' ORDER BY created_at LIMIT 1",
    )
    .get();
  if (!b) return;
  busy = true;
  try {
    const current = batch(b.id),
      exam = current.evaluation_id ? getExam(current.evaluation_id) : null;
    if (
      !db
        .prepare(
          "UPDATE import_batches SET status='processing' WHERE id=? AND status='queued'",
        )
        .run(b.id).changes
    )
      return;
    if (exam && exam.revision !== current.revision)
      db.prepare("UPDATE import_batches SET revision=? WHERE id=?").run(
        exam.revision,
        b.id,
      );
    const requestPath = path.join(root, b.id, "request.json");
    const result = await readRegisteredSheets(current, requestPath);
    const state = buildRows(exam, result, b.id);
    writeResult(b.id, result, state);
    if (process.env.OMR_DEBUG === "1")
      console.info("[OMR] Lote procesado", {
        batchId: b.id,
        status: state,
        pages: result.pages.length,
        readyRows: result.rows?.length || 0,
      });
  } catch (error) {
    console.error("[OMR] Lote fallido", {
      batchId: b.id,
      code: error.code,
      message: error.message,
      stack: error.stack,
    });
    db.prepare(
      "UPDATE import_batches SET status='failed',error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
    ).run(error.message, b.id);
  } finally {
    busy = false;
  }
}
function reviewPage(id, index, body, req) {
  const b = batch(id);
  if (!["review", "ready"].includes(b.status))
    throw new AppError("El lote no está disponible para revisión.", 409);
  if (body.reviewVersion !== b.result.reviewVersion)
    throw new AppError(
      "Otra persona modificó este lote. Actualiza la revisión.",
      409,
    );
  const page = b.result.pages?.[index];
  if (!page) throw new AppError("Página no encontrada.", 404);
  if (String(body.reason || "").trim().length < 5)
    throw new AppError("Describe el motivo de la revisión.");
  if (body.exclude) {
    page.excluded = true;
    page.exclusionReason = body.reason;
  } else {
    if (page.error)
      throw new AppError(
        "Esta página no se puede identificar. Exclúyela y vuelve a escanearla.",
      );
    if (body.identification !== undefined) {
      if (!page.identification || ![3, 4, 5].includes(page.layoutVersion))
        throw new AppError("Esta cara no tiene identificación editable.");
      const identity = body.identification;
      if (
        !identity ||
        !/^\d{8}$/.test(identity.code || "") ||
        !getExam(
          b.evaluation_id || resolveQR(page.qr).evaluation_id,
        ).definition.areas.some((a) => a.code === identity.area)
      )
        throw new AppError("Indica un código de 8 dígitos y un área válida.");
      page.identificationOverride = {
        code: identity.code,
        area: identity.area,
        actor: req.session.username,
        reason: body.reason,
      };
    }
    const normalized = {};
    for (const q of Object.keys(page.responses)) {
      if (!(q in (body.responses || {})))
        throw new AppError(`Falta revisar la pregunta ${q}.`);
      normalized[q] = normalizeResponse(body.responses[q]);
      if (normalized[q].status === "uncertain")
        throw new AppError("Resuelve las marcas dudosas antes de confirmar.");
    }
    page.originalResponses ||= page.responses;
    page.responses = normalized;
    page.reviewed = true;
    page.reviewedBy = req.session.username;
    page.reviewReason = body.reason;
    delete page.warning;
  }
  b.result.reviewVersion++;
  const state = buildRows(
    b.evaluation_id ? getExam(b.evaluation_id) : null,
    b.result,
    id,
  );
  writeResult(id, b.result, state);
  audit(req, "revisar_cartilla", "lote", id, {
    index,
    reason: body.reason,
    excluded: !!body.exclude,
  });
  return batch(id);
}
function refreshBatch(id, req) {
  const b = batch(id);
  if (!["ready", "review"].includes(b.status))
    throw new AppError("Este lote no se puede actualizar.", 409);
  const exam = b.evaluation_id ? getExam(b.evaluation_id) : null;
  if (b.source === "omr") {
    for (const p of b.result.pages || []) delete p.warning;
    const state = buildRows(exam, b.result, id);
    b.result.reviewVersion++;
    writeResult(id, b.result, state);
  } else {
    for (const row of b.result.rows)
      row.preview = grade(exam.definition, row.respuestas, row.area, row.form);
    b.result.reviewVersion++;
    writeResult(id, b.result, "ready");
  }
  db.prepare("UPDATE import_batches SET revision=? WHERE id=?").run(
    exam?.revision || 0,
    id,
  );
  audit(req, "actualizar_revision_lote", "lote", id, {
    revisions: b.result.revisions || { [exam.id]: exam.revision },
  });
  return batch(id);
}
function commitBatch(id, body, req) {
  const b = batch(id),
    exam = b.evaluation_id ? getExam(b.evaluation_id) : null;
  if (b.status !== "ready")
    throw new AppError(
      "Resuelve las incidencias del lote antes de importar.",
      409,
    );
  const revisions = b.result.revisions || { [exam.id]: b.revision };
  for (const [examId, revision] of Object.entries(revisions)) {
    const current = getExam(examId);
    if (
      current.revision !== revision ||
      !["listo", "publicado"].includes(current.estado)
    )
      throw new AppError(
        "Las claves cambiaron o el examen dejó de estar listo desde la lectura. Actualiza el lote.",
        409,
      );
  }
  if (body.reviewVersion !== b.result.reviewVersion)
    throw new AppError("El lote cambió. Actualiza la previsualización.", 409);
  const results = [];
  db.transaction(() => {
    if (
      !db
        .prepare(
          "UPDATE import_batches SET status='committing' WHERE id=? AND status='ready'",
        )
        .run(id).changes
    )
      throw new AppError("El lote ya está siendo importado.", 409);
    for (const row of b.result.rows)
      results.push(
        saveGrade(row.examId || exam.id, row, req, {
          allowReplace: body.allowReplace === true,
          reason:
            body.reason ||
            (body.allowReplace ? "" : `Importación del lote ${id}`),
          source: b.source,
        }),
      );
    for (const p of b.result.pages || [])
      if (!p.excluded)
        db.prepare(
          "INSERT INTO imported_sheets(sheet_id,page,batch_id) VALUES(?,?,?)",
        ).run(p.sheetId, p.page, id);
    db.prepare(
      "UPDATE import_batches SET status='committed',updated_at=CURRENT_TIMESTAMP WHERE id=?",
    ).run(id);
    audit(req, "confirmar_lote", "lote", id, { estudiantes: results.length });
  })();
  return results;
}
module.exports = {
  root,
  batch,
  batchView,
  listBatches,
  clearBatchHistory,
  restoreBatchHistory,
  createCSV,
  createScan,
  processScanQueue,
  reviewPage,
  commitBatch,
  refreshBatch,
};
