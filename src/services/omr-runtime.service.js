const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const config = require("../config");

const hint =
  "Revisa los registros [OMR] en la consola del servidor o ejecuta npm run omr:doctor.";
const readerPath = path.join(__dirname, "../omr/reader.py");

// Only process metadata and stderr are logged. Reader stdout contains student
// answers and is never printed, including when it is malformed or too large.
function executePython(
  args,
  {
    python = config.python,
    batchId,
    label = "lector",
    timeoutMs = 300000,
    maxOutputBytes = 8 * 1024 * 1024,
    allowFailure = false,
    logger = console,
  } = {},
) {
  const started = Date.now();
  const context = {
    batchId,
    python,
    args,
    cwd: process.cwd(),
    envFile: path.resolve(".env"),
    envFileExists: fs.existsSync(path.resolve(".env")),
    executableExists: /[/\\]/.test(python)
      ? fs.existsSync(python)
      : "buscar en PATH",
    platform: process.platform,
    node: process.version,
  };
  logger.info(`[OMR] Inicio de ${label}`, context);
  return new Promise((resolve, reject) => {
    let child,
      timer,
      settled = false,
      stdout = "",
      stderr = "",
      outputBytes = 0,
      stderrTruncated = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const details = {
        ...context,
        durationMs: Date.now() - started,
        stdoutBytes: outputBytes,
        stderr,
        stderrTruncated,
      };
      if (error) {
        logger.error(`[OMR] Falló ${label}`, {
          ...details,
          code: error.code,
          exitCode: error.exitCode,
          signal: error.signal,
          message: error.message,
          cause: error.cause?.stack || error.cause?.message,
        });
        reject(error);
      } else {
        if (stderr)
          logger.warn(`[OMR] Salida de diagnóstico de ${label}`, details);
        logger.info(`[OMR] Finalizó ${label}`, {
          batchId,
          exitCode: result.code,
          durationMs: details.durationMs,
          stdoutBytes: outputBytes,
        });
        resolve(result);
      }
    };
    const failure = (message, code, extra = {}) =>
      Object.assign(new Error(`${message} ${hint}`), { code, ...extra });
    try {
      child = spawn(python, args, {
        shell: false,
        windowsHide: true,
        env: {
          ...process.env,
          PYTHONIOENCODING: "utf-8",
          PYTHONUNBUFFERED: "1",
        },
      });
    } catch (cause) {
      finish(
        failure(
          `No se pudo iniciar Python (${cause.code || "SPAWN"}).`,
          cause.code || "SPAWN",
          { cause },
        ),
      );
      return;
    }
    timer = setTimeout(() => {
      finish(
        failure(
          "El lector agotó el tiempo disponible. Reduce el tamaño del lote.",
          "OMR_TIMEOUT",
        ),
      );
      child.kill();
    }, timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      if (settled) return;
      outputBytes += Buffer.byteLength(chunk);
      if (outputBytes > maxOutputBytes) {
        finish(
          failure(
            "La respuesta del lector supera el límite permitido.",
            "OMR_OUTPUT_LIMIT",
          ),
        );
        child.kill();
        return;
      }
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      if (settled) return;
      const value = stderr + chunk;
      stderrTruncated ||= value.length > 65536;
      stderr = value.slice(-65536);
    });
    child.once("error", (cause) =>
      finish(
        failure(
          `No se pudo iniciar Python (${cause.code || "SPAWN"}).`,
          cause.code || "SPAWN",
          { cause },
        ),
      ),
    );
    child.once("close", (code, signal) => {
      if (code !== 0 && !allowFailure) {
        finish(
          failure(
            `Python terminó con error (código ${code ?? "sin código"}${signal ? `, señal ${signal}` : ""}).`,
            "OMR_EXIT",
            { exitCode: code, signal },
          ),
        );
        return;
      }
      finish(null, { stdout, stderr, code, signal });
    });
  });
}

async function runReader(
  requestPath,
  { batchId, execute = executePython, logger = console } = {},
) {
  const { stdout } = await execute([readerPath, requestPath], {
    batchId,
    logger,
  });
  let result;
  try {
    result = JSON.parse(stdout.trim());
    if (
      !result ||
      !Array.isArray(result.pages) ||
      result.pages.some(
        (page) => !page || typeof page !== "object" || Array.isArray(page),
      )
    )
      throw new Error("El resultado no contiene una lista pages.");
  } catch (cause) {
    logger.error("[OMR] Respuesta inválida del lector", {
      batchId,
      stdoutBytes: Buffer.byteLength(stdout),
      cause:
        cause instanceof SyntaxError
          ? "SyntaxError: JSON inválido"
          : cause.message,
    });
    throw new Error(`El lector no devolvió un resultado válido. ${hint}`);
  }
  for (const [index, page] of result.pages.entries()) {
    if (page.error)
      logger.warn("[OMR] No se pudo leer una cartilla", {
        batchId,
        page: index + 1,
        error: page.error,
      });
  }
  logger.info("[OMR] Lectura recibida", {
    batchId,
    pages: result.pages.length,
    unreadable: result.pages.filter((p) => p.error).length,
  });
  return result;
}

async function checkRuntime() {
  try {
    const { stdout, code } = await executePython(
      [path.join(__dirname, "../omr/doctor.py")],
      {
        label: "diagnóstico",
        timeoutMs: 30000,
        maxOutputBytes: 256 * 1024,
        allowFailure: true,
      },
    );
    const report = JSON.parse(stdout.trim());
    if (
      !report ||
      typeof report.ok !== "boolean" ||
      !Array.isArray(report.dependencies)
    )
      throw new Error("Respuesta de diagnóstico inválida.");
    if (code !== 0) report.ok = false;
    console[report.ok ? "info" : "error"](
      "[OMR] Diagnóstico de Python y dependencias",
      report,
    );
    if (!report.ok)
      console.error(
        "[OMR] Instala src/omr/requirements.txt con el ejecutable indicado en PYTHON_BIN. La asistencia y el panel siguen disponibles.",
      );
    return report;
  } catch (error) {
    console.error("[OMR] Diagnóstico no disponible", {
      code: error.code,
      message: error.message,
    });
    return { ok: false, error: error.message };
  }
}

module.exports = { executePython, runReader, checkRuntime };
