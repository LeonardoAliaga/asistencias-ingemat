const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const db = require("../database/db");
const config = require("../config");
const imports = require("./imports.service");
const { getExam } = require("./evaluations.service");
const { audit } = require("./audit.service");
const { AppError } = require("../utils/errors");
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function executable() {
  if (process.env.NAPS2_BIN) return process.env.NAPS2_BIN;
  if (process.platform !== "win32") return "naps2.console";
  for (const base of [
    process.env.ProgramFiles,
    process.env["ProgramFiles(x86)"],
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Programs"),
  ].filter(Boolean)) {
    const candidate = path.join(base, "NAPS2", "NAPS2.Console.exe");
    if (fs.existsSync(candidate)) return candidate;
  }
  return "C:/Program Files/NAPS2/NAPS2.Console.exe";
}
function runNaps(args, { signal, timeout = 300000 } = {}) {
  const bin = executable();
  console.info("[NAPS2] Ejecutando", { executable: bin, args });
  return new Promise((resolve, reject) => {
    let out = "",
      err = "",
      settled = false,
      timer;
    const child = spawn(bin, args, { shell: false, windowsHide: true, signal });
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) {
        console.error("[NAPS2] Falló el proceso", {
          code: error.code,
          message: error.message,
          stderr: err,
          stdout: out.slice(-4000),
        });
        reject(error);
      } else resolve(out);
    };
    timer = setTimeout(() => {
      finish(
        new AppError(
          "NAPS2 agotó el tiempo disponible. Revisa el escáner y repite la captura.",
          504,
        ),
      );
      child.kill();
    }, timeout);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (c) => {
      out = (out + c).slice(-65536);
    });
    child.stderr.on("data", (c) => {
      err = (err + c).slice(-16384);
    });
    child.once("error", (error) => {
      if (error.name === "AbortError") return;
      finish(
        new AppError(
          `No se pudo iniciar NAPS2 (${error.code || "SPAWN"}). Instala NAPS2 en la PC del servidor o configura NAPS2_BIN.`,
          503,
        ),
      );
    });
    child.once("close", (code) =>
      finish(
        code === 0
          ? null
          : new AppError(
              `NAPS2 terminó con error (${code}). ${err.trim().slice(-1200) || out.trim().slice(-1200) || "Comprueba el controlador, la conexión y el papel."}`,
              502,
            ),
      ),
    );
  });
}
function createScannerService({
  database = db,
  run = runNaps,
  dataDir = config.dataDir,
  importService = imports,
  examService = { getExam },
  recordAudit = audit,
} = {}) {
  const root = path.join(dataDir, "scanner");
  fs.mkdirSync(root, { recursive: true });
  let active = null,
    discovering = false;
  const devices = new Map();
  const actor = (req) => req.session.username;
  const file = (id) => path.join(root, `${id}.pdf`);
  const remove = (target, options = {}) => {
    try {
      fs.rmSync(target, { ...options, force: true });
    } catch (error) {
      console.warn("[NAPS2] No se pudo limpiar un archivo temporal", {
        target,
        message: error.message,
      });
    }
  };
  const owned = (id, req) => {
    const row = database
      .prepare("SELECT * FROM scanner_jobs WHERE id=? AND actor=?")
      .get(id, actor(req));
    if (!row) throw new AppError("Captura no encontrada.", 404);
    return row;
  };
  const view = (row) => ({
    id: row.id,
    examId: row.evaluation_id,
    status: row.status,
    error: row.error,
    device: row.device,
    driver: row.driver,
    source: row.source,
    pageSize: row.page_size,
    bytes: row.bytes,
    createdAt: row.created_at,
    batchId: row.batch_id,
    fileUrl:
      row.status === "ready" ? `/api/v2/scanner/jobs/${row.id}/file` : null,
  });
  const examReady = (id) => {
    const exam = examService.getExam(id);
    if (!exam.definition || !["listo", "publicado"].includes(exam.estado))
      throw new AppError("Selecciona un simulacro validado.", 409);
    return exam;
  };
  function recover() {
    database
      .prepare(
        "UPDATE scanner_jobs SET status='failed',error='El servidor se reinició durante el escaneo. Comprueba el papel y vuelve a escanear; no se repetirá automáticamente.' WHERE status='scanning'",
      )
      .run();
  }
  async function discover(driver) {
    if (!["wia", "twain"].includes(driver))
      throw new AppError("Selecciona WIA o TWAIN.");
    if (active || discovering)
      throw new AppError("El escáner está ocupado. Espera a que termine.", 409);
    discovering = true;
    try {
      const text = await run(["--listdevices", "--driver", driver], {
        timeout: 30000,
      });
      const names = [
        ...new Set(
          text
            .replace(/^\uFEFF/, "")
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter((s) => s && s.length <= 256 && !/^[\-\x00-\x1f]/.test(s)),
        ),
      ];
      devices.set(driver, names);
      return { driver, devices: names };
    } finally {
      discovering = false;
    }
  }
  async function perform(row, controller, req) {
    try {
      await run(
        [
          "--noprofile",
          "--driver",
          row.driver,
          "--device",
          row.device,
          "--source",
          row.source,
          "--pagesize",
          row.page_size,
          "--dpi",
          "300",
          "--bitdepth",
          "gray",
          "--disableocr",
          "-n",
          "1",
          "-o",
          file(row.id),
        ],
        { signal: controller.signal },
      );
      if (controller.signal.aborted) throw new AppError("Escaneo cancelado.");
      const stat = fs.statSync(file(row.id));
      if (stat.size < 5 || stat.size > 20 * 1024 * 1024)
        throw new AppError(
          "El PDF está vacío o supera 20 MB. Divide la pila en grupos más pequeños.",
        );
      const handle = fs.openSync(file(row.id), "r");
      const header = Buffer.alloc(5);
      try {
        fs.readSync(handle, header, 0, 5, 0);
      } finally {
        fs.closeSync(handle);
      }
      if (header.toString() !== "%PDF-")
        throw new AppError(
          "NAPS2 no generó un PDF válido. Revisa la consola [NAPS2].",
        );
      database
        .prepare(
          "UPDATE scanner_jobs SET status='ready',bytes=?,error='' WHERE id=?",
        )
        .run(stat.size, row.id);
      recordAudit(req, "escanear", "captura", row.id, {
        source: row.source,
        size: row.page_size,
      });
      console.info("[NAPS2] Captura lista", { id: row.id, bytes: stat.size });
    } catch (error) {
      remove(file(row.id));
      database
        .prepare("UPDATE scanner_jobs SET status=?,error=? WHERE id=?")
        .run(
          controller.signal.aborted ? "cancelled" : "failed",
          error.message,
          row.id,
        );
      console.error("[NAPS2] Captura fallida", {
        id: row.id,
        message: error.message,
      });
    } finally {
      if (active?.id === row.id) active = null;
    }
  }
  function start(body = {}, req) {
    const { requestId: id, examId, driver, device, source, pageSize } = body;
    if (typeof id !== "string" || !UUID.test(id) || typeof examId !== "string")
      throw new AppError("Identificador de captura inválido.");
    const existing = database
      .prepare("SELECT * FROM scanner_jobs WHERE id=?")
      .get(id);
    if (existing) {
      if (existing.actor !== actor(req))
        throw new AppError("Captura no encontrada.", 404);
      if (
        existing.evaluation_id !== examId ||
        existing.driver !== driver ||
        existing.device !== device ||
        existing.source !== source ||
        existing.page_size !== pageSize
      )
        throw new AppError(
          "Este identificador ya corresponde a otra captura.",
          409,
        );
      return view(existing);
    }
    const exam = examReady(examId);
    if (
      !["wia", "twain"].includes(driver) ||
      !devices.get(driver)?.includes(device)
    )
      throw new AppError("Busca los escáneres y selecciona uno de la lista.");
    if (
      !["glass", "feeder"].includes(source) ||
      !["a4", "a5"].includes(pageSize)
    )
      throw new AppError(
        "Origen o tamaño no admitido. Usa cristal o alimentador y A4 o media hoja.",
      );
    if (active || discovering)
      throw new AppError("El escáner está ocupado. Espera a que termine.", 409);
    if (
      database
        .prepare(
          "SELECT COUNT(*) n FROM scanner_jobs WHERE actor=? AND evaluation_id=? AND status='ready'",
        )
        .get(actor(req), examId).n >= 10
    )
      throw new AppError(
        "Procesa o quita las 10 capturas pendientes antes de añadir otra.",
        409,
      );
    database
      .prepare(
        "INSERT INTO scanner_jobs(id,evaluation_id,revision,actor,driver,device,source,page_size,status) VALUES(?,?,?,?,?,?,?,?,'scanning')",
      )
      .run(
        id,
        examId,
        exam.revision,
        actor(req),
        driver,
        device,
        source,
        pageSize,
      );
    const controller = new AbortController();
    active = { id, controller };
    void perform(owned(id, req), controller, req).catch((error) =>
      console.error("[NAPS2] No se pudo guardar el estado de captura", {
        id,
        message: error.message,
      }),
    );
    return view(owned(id, req));
  }
  function list(examId, req) {
    return {
      busy: !!active || discovering,
      jobs: database
        .prepare(
          "SELECT * FROM scanner_jobs WHERE actor=? AND evaluation_id=? AND status NOT IN ('discarded','imported') ORDER BY created_at,rowid",
        )
        .all(actor(req), examId)
        .map(view),
    };
  }
  function clearFailed(examId, req) {
    const rows = database
      .prepare(
        "SELECT id FROM scanner_jobs WHERE actor=? AND evaluation_id=? AND status IN ('failed','cancelled')",
      )
      .all(actor(req), examId);
    database.transaction(() => {
      for (const row of rows)
        database
          .prepare(
            "UPDATE scanner_jobs SET status='discarded' WHERE id=? AND status IN ('failed','cancelled')",
          )
          .run(row.id);
    })();
    for (const row of rows) remove(file(row.id));
    return { cleared: rows.length };
  }
  function cancel(id, req) {
    const row = owned(id, req);
    if (row.status === "scanning" && active?.id === id)
      active.controller.abort();
    return view(owned(id, req));
  }
  function discard(id, req) {
    const row = owned(id, req);
    if (!["ready", "failed", "cancelled"].includes(row.status))
      throw new AppError(
        "Solo puedes quitar capturas terminadas y sin procesar.",
        409,
      );
    database
      .prepare("UPDATE scanner_jobs SET status='discarded' WHERE id=?")
      .run(id);
    remove(file(id));
    return { exito: true };
  }
  function processCaptures(body = {}, req) {
    const { examId, jobIds, requestId } = body;
    if (
      typeof requestId !== "string" ||
      !UUID.test(requestId) ||
      typeof examId !== "string" ||
      !Array.isArray(jobIds) ||
      !jobIds.length ||
      jobIds.some((id) => typeof id !== "string" || !UUID.test(id)) ||
      jobIds.length > 10 ||
      new Set(jobIds).size !== jobIds.length
    )
      throw new AppError(
        "Selecciona de 1 a 10 capturas y usa un identificador válido.",
      );
    const previous = database
      .prepare("SELECT * FROM scan_requests WHERE actor=? AND request_id=?")
      .get(actor(req), requestId);
    if (previous) {
      const saved = database
        .prepare("SELECT id FROM scanner_jobs WHERE actor=? AND batch_id=?")
        .all(actor(req), previous.batch_id)
        .map((r) => r.id)
        .sort();
      if (
        previous.evaluation_id !== examId ||
        JSON.stringify(saved) !== JSON.stringify([...jobIds].sort())
      )
        throw new AppError("Este envío ya pertenece a otras capturas.", 409);
      return importService.batch(previous.batch_id);
    }
    const exam = examReady(examId);
    const rows = jobIds.map((id) => owned(id, req));
    if (rows.some((r) => r.evaluation_id !== examId || r.status !== "ready"))
      throw new AppError(
        "Las capturas deben estar listas y pertenecer al mismo simulacro.",
        409,
      );
    const temp = path.join(root, randomUUID());
    fs.mkdirSync(temp);
    let result,
      committed = false;
    try {
      const files = rows.map((r, i) => {
        const target = path.join(temp, `${i}.pdf`);
        fs.copyFileSync(file(r.id), target);
        return { path: target, originalname: `Escaneo-${i + 1}.pdf` };
      });
      database.transaction(() => {
        result = importService.createScan(examId, files, {
          ...req,
          body: { requestId },
        });
        for (const row of rows)
          database
            .prepare(
              "UPDATE scanner_jobs SET status='imported',batch_id=? WHERE id=?",
            )
            .run(result.id, row.id);
      })();
      committed = true;
      for (const row of rows) remove(file(row.id));
      return result;
    } catch (error) {
      if (result && !committed)
        remove(path.join(importService.root, result.id), {
          recursive: true,
          force: true,
        });
      throw error;
    } finally {
      remove(temp, { recursive: true });
    }
  }
  function download(id, req) {
    const row = owned(id, req);
    if (row.status !== "ready" || !fs.existsSync(file(id)))
      throw new AppError("PDF no disponible.", 404);
    return file(id);
  }
  return {
    discover,
    start,
    list,
    clearFailed,
    cancel,
    discard,
    processCaptures,
    download,
    recover,
    stop: () => active?.controller.abort(),
  };
}
module.exports = { createScannerService, runNaps, executable };
