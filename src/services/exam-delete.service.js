// Supresión definitiva de un simulacro y de sus datos propios.
// Los perfiles de estudiantes, asistencias diarias y libros son independientes.
const fs = require("node:fs");
const path = require("node:path");
const db = require("../database/db");
const { dataDir } = require("../config");
const { AppError } = require("../utils/errors");
const { audit } = require("./audit.service");
const storage = require("./whatsapp-report-storage.service");

function removeLocalArtifact(folder, name, ext = "") {
  // Los identificadores son generados internamente; nunca aceptamos rutas de entrada.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(name))
    return null;
  const target = path.join(dataDir, folder, name + ext);
  try {
    fs.rmSync(target, { recursive: folder === "imports", force: true });
    return null;
  } catch (error) {
    return `No se pudo eliminar el archivo ${folder}/${name}${ext}: ${error.code || error.message}`;
  }
}

function deleteExam(id, confirmation, req) {
  if (typeof id !== "string" || !id.trim()) throw new AppError("Simulacro inválido.");
  const exam = db.prepare("SELECT id,titulo FROM evaluaciones WHERE id=?").get(id);
  if (!exam) throw new AppError("Simulacro no encontrado.", 404);
  if (confirmation !== exam.titulo)
    throw new AppError("Escribe el título exacto del simulacro para confirmar la eliminación definitiva.", 400);

  const artifacts = { batches: [], scans: [], rankings: [] };
  const deleted = db.transaction(() => {
    // Nunca dejamos que el lector OMR o NAPS2 escriban resultados sobre un examen eliminado.
    const scanning = db.prepare(
      "SELECT 1 FROM scanner_jobs WHERE evaluation_id=? AND status='scanning' LIMIT 1",
    ).get(id);
    const importing = db.prepare(
      "SELECT 1 FROM import_batches WHERE evaluation_id=? AND status IN ('queued','processing','committing') LIMIT 1",
    ).get(id);
    if (scanning || importing)
      throw new AppError("Hay una captura o importación en curso. Finalízala antes de eliminar el simulacro.", 409);
    const sending = db.prepare(
      "SELECT 1 FROM outbox WHERE kind IN ('results','exam_group_summary') AND status='sending' AND json_extract(CASE WHEN json_valid(payload) THEN payload ELSE '{}' END,'$.evaluationId')=? LIMIT 1",
    ).get(id);
    if (sending)
      throw new AppError("Se está enviando un aviso de este simulacro. Espera a que termine antes de eliminarlo.", 409);
    artifacts.batches = db.prepare("SELECT id FROM import_batches WHERE evaluation_id=?").all(id).map(r => r.id);
    artifacts.scans = db.prepare("SELECT id FROM scanner_jobs WHERE evaluation_id=?").all(id).map(r => r.id);
    artifacts.rankings = db.prepare(
      "SELECT payload FROM outbox WHERE kind='exam_group_summary' AND json_extract(CASE WHEN json_valid(payload) THEN payload ELSE '{}' END,'$.evaluationId')=?",
    ).all(id).map(r => {
      try { return JSON.parse(r.payload).attachment; } catch { return null; }
    }).filter(Boolean);

    const notices = db.prepare(
      "DELETE FROM outbox WHERE kind IN ('results','exam_group_summary') AND json_extract(CASE WHEN json_valid(payload) THEN payload ELSE '{}' END,'$.evaluationId')=?",
    ).run(id).changes;
    const scanner = db.prepare("DELETE FROM scanner_jobs WHERE evaluation_id=?").run(id).changes;
    const importedPages = db.prepare(
      "DELETE FROM imported_sheets WHERE batch_id IN (SELECT id FROM import_batches WHERE evaluation_id=?)",
    ).run(id).changes;
    db.prepare("DELETE FROM scan_requests WHERE evaluation_id=?").run(id);
    db.prepare("DELETE FROM hidden_import_batches WHERE batch_id IN (SELECT id FROM import_batches WHERE evaluation_id=?)").run(id);
    const batches = db.prepare("DELETE FROM import_batches WHERE evaluation_id=?").run(id).changes;
    const sheets = db.prepare("DELETE FROM omr_sheets WHERE evaluation_id=?").run(id).changes;
    const corrections = db.prepare("DELETE FROM grade_history WHERE evaluation_id=?").run(id).changes;
    const revisions = db.prepare("DELETE FROM evaluation_revisions WHERE evaluation_id=?").run(id).changes;
    db.prepare("DELETE FROM exam_roster WHERE evaluation_id=?").run(id);
    const grades = db.prepare("DELETE FROM respuestas_evaluacion WHERE evaluacion_id=?").run(id).changes;
    db.prepare("DELETE FROM evaluaciones WHERE id=?").run(id);
    audit(req, "eliminar_definitivamente", "evaluacion", id, {
      titulo: exam.titulo, grades, corrections, revisions, sheets,
      batches, importedPages, scanner, notices,
    });
    return { grades, corrections, revisions, sheets, batches, importedPages, scanner, notices };
  })();

  // La base de datos se elimina atómicamente primero; archivos solo de estos IDs.
  const cleanupWarnings = [
    ...artifacts.batches.map(id => removeLocalArtifact("imports", id)),
    ...artifacts.scans.map(id => removeLocalArtifact("scanner", id, ".pdf")),
  ].filter(Boolean);
  for (const attachment of artifacts.rankings) storage.remove(attachment);
  return { exito: true, deleted, cleanupWarnings };
}
module.exports = { deleteExam };
