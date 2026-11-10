const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { parse } = require("csv-parse/sync");
const db = require("../database/db");
const config = require("../config");
const { layouts } = require("./omr-layout");
const { bookletLayouts } = require("./omr-booklet-layout");
const { runReader } = require("./omr-runtime.service");
function sheetLayouts(def, version) {
  return version === 2
    ? layouts(def.totalQuestions)
    : bookletLayouts(def, version === 3 ? "quarter-duplex" : "half-single");
}
const { resolveQR } = require("./omr-pdf.service");
const { getExam, saveGrade } = require("./evaluations.service");
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
    exam = getExam(b.evaluation_id),
    groups = new Map(),
    matched = new Map(),
    cache = new Map(),
    lookup = db.prepare(
      "SELECT u.codigo,u.nombre,u.apellido,r.name_snapshot FROM usuarios u LEFT JOIN exam_roster r ON r.evaluation_id=? AND r.user_uid=u.uid WHERE u.codigo=? AND u.rol='estudiante' AND (UPPER(u.ciclo)=UPPER(?) OR r.user_uid IS NOT NULL)",
    );
  const findStudent = (code) => {
    if (typeof code !== "string" || !code) return null;
    if (!cache.has(code)) {
      const student = lookup.get(exam.id, code, exam.ciclo);
      cache.set(
        code,
        student
          ? {
              code: student.codigo,
              name:
                student.name_snapshot ||
                `${student.apellido} ${student.nombre}`.trim(),
            }
          : null,
      );
    }
    return cache.get(code);
  };
  for (const page of b.result.pages || []) {
    page.identifiedStudent = null;
    if (page.error || page.excluded) continue;
    try {
      const sheet = resolveQR(page.qr);
      if (
        sheet.evaluation_id !== exam.id ||
        sheet.revision > exam.revision ||
        !sheetLayouts(exam.definition, sheet.layout_version).some(
          (l) => l.page === sheet.page,
        )
      )
        continue;
      const group = groups.get(sheet.id) || { pages: [], codes: new Set() };
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
    const student = findStudent(code);
    matched.set(sheetId, student);
    for (const page of group.pages) page.identifiedStudent = student;
  }
  for (const row of b.result.rows || [])
    row.identifiedStudent =
      b.source === "omr"
        ? matched.get(row.sheetId) || null
        : findStudent(row.codigoEstudiante);
  return b;
}
function listBatches(req) {
  return db
    .prepare(
      "SELECT b.id,b.evaluation_id,b.revision,b.source,b.status,b.error,b.actor,b.created_at FROM import_batches b WHERE b.status NOT IN ('committed','failed') OR NOT EXISTS (SELECT 1 FROM hidden_import_batches h WHERE h.batch_id=b.id AND h.actor=?) ORDER BY b.created_at DESC,b.rowid DESC LIMIT 100",
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
      const user = db
        .prepare("SELECT * FROM usuarios WHERE codigo=? AND rol='estudiante'")
        .get(code);
      if (
        !user ||
        (user.ciclo.toUpperCase() !== exam.ciclo.toUpperCase() &&
          !db
            .prepare(
              "SELECT 1 FROM exam_roster WHERE evaluation_id=? AND user_uid=?",
            )
            .get(id, user.uid))
      )
        throw new AppError(
          `Fila ${index + 2}: estudiante ${code} no pertenece al ciclo.`,
        );
      const respuestas = {};
      for (let q = 1; q <= exam.definition.totalQuestions; q++) {
        if (!(String(q) in r))
          throw new AppError(`Falta la columna ${q} en el CSV.`);
        respuestas[q] = normalizeResponse(r[q]);
      }
      const area = String(r.area || user.area || "").toUpperCase(),
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
function createScan(id, files, req) {
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
  const exam = getExam(id);
  if (!exam.definition || !["listo", "publicado"].includes(exam.estado))
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
        exam.revision,
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
function buildRows(exam, result, currentBatchId) {
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
        ![2, 3, 4].includes(sheet.layout_version)
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
        !sheetLayouts(exam.definition, sheet.layout_version).some(
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
        const student = db
          .prepare(
            "SELECT * FROM usuarios WHERE codigo=? AND rol='estudiante' AND (UPPER(ciclo)=UPPER(?) OR uid IN (SELECT user_uid FROM exam_roster WHERE evaluation_id=?))",
          )
          .get(identity.code, exam.ciclo, exam.id);
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
          student.area &&
          student.area !== identity.area
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
      exam = getExam(current.evaluation_id);
    if (
      !db
        .prepare(
          "UPDATE import_batches SET status='processing' WHERE id=? AND status='queued'",
        )
        .run(b.id).changes
    )
      return;
    if (exam.revision !== current.revision)
      db.prepare("UPDATE import_batches SET revision=? WHERE id=?").run(
        exam.revision,
        b.id,
      );
    const requestPath = path.join(root, b.id, "request.json");
    fs.writeFileSync(
      requestPath,
      JSON.stringify({
        files: current.files.map((f) => ({
          ...f,
          path: path.resolve(config.dataDir, f.path),
        })),
        layouts: [
          ...layouts(exam.definition.totalQuestions),
          ...(exam.definition.totalQuestions <= 120 &&
          exam.definition.areas.length <= 5 &&
          (exam.definition.areas.length === 1 ||
            exam.definition.areas.every((a) => a.code.length === 1))
            ? ["quarter-duplex", "half-single"].flatMap((format) => {
                try {
                  return bookletLayouts(exam.definition, format);
                } catch {
                  return [];
                }
              })
            : []),
        ],
        outputDir: path.join(root, b.id, "pages"),
      }),
    );
    const result = {
      ...(await runReader(requestPath, { batchId: b.id })),
      reviewVersion: 1,
    };
    for (const page of result.pages || [])
      if (page.imagePath)
        page.imagePath = path.relative(config.dataDir, page.imagePath);
    const state = buildRows(exam, result, b.id);
    writeResult(b.id, result, state);
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
      if (!page.identification || ![3, 4].includes(page.layoutVersion))
        throw new AppError("Esta cara no tiene identificación editable.");
      const identity = body.identification;
      if (
        !identity ||
        !/^\d{8}$/.test(identity.code || "") ||
        !getExam(b.evaluation_id).definition.areas.some(
          (a) => a.code === identity.area,
        )
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
  const state = buildRows(getExam(b.evaluation_id), b.result, id);
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
  const exam = getExam(b.evaluation_id);
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
    exam.revision,
    id,
  );
  audit(req, "actualizar_revision_lote", "lote", id, {
    revision: exam.revision,
  });
  return batch(id);
}
function commitBatch(id, body, req) {
  const b = batch(id),
    exam = getExam(b.evaluation_id);
  if (b.status !== "ready")
    throw new AppError(
      "Resuelve las incidencias del lote antes de importar.",
      409,
    );
  if (exam.revision !== b.revision)
    throw new AppError(
      "Las claves cambiaron desde la lectura. Revisa el lote de nuevo.",
      409,
    );
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
        saveGrade(exam.id, row, req, {
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
