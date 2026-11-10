const db = require("../database/db");
const { AppError } = require("../utils/errors");
const defaults = {
  enabled: false,
  provider: "baileys",
  attendanceMessage:
    "INGEMAT · Asistencia\nEstudiante: {nombre}\nFecha: {fecha}\nHora: {hora}\nEstado: {estado}",
  resultsMessage:
    "INGEMAT · Simulacro\nEstudiante: {nombre}\nExamen: {examen}\nPuntaje: {puntaje}\nÁrea: {area}",
};
const fields = {
  attendance: ["nombre", "fecha", "hora", "estado"],
  results: ["nombre", "examen", "puntaje", "area"],
};
function getConfig() {
  const row = db
    .prepare("SELECT valor FROM config_general WHERE clave='whatsapp_config'")
    .get();
  let saved = {};
  try {
    saved = JSON.parse(row?.valor || "{}");
  } catch {
    return { ...defaults, enabled: false, configurationError: true };
  }
  if (!saved || typeof saved !== "object" || Array.isArray(saved))
    return { ...defaults, enabled: false, configurationError: true };
  const config = { ...defaults };
  for (const key of ["attendanceMessage", "resultsMessage"])
    if (typeof saved[key] === "string") config[key] = saved[key];
  config.enabled = saved.enabled === true;
  return config;
}
function renderMessage(kind, parameters, config = getConfig()) {
  if (!fields[kind] || !Array.isArray(parameters) || parameters.length !== 4)
    throw new AppError("Datos de aviso incompletos.");
  const values = Object.fromEntries(
    fields[kind].map((key, i) => [key, String(parameters[i] ?? "")]),
  );
  const template =
    config[kind === "attendance" ? "attendanceMessage" : "resultsMessage"];
  return template.replace(/\{([a-z]+)\}/g, (_, key) => values[key]);
}
function validateConfig(input, readiness) {
  const c = { ...getConfig(), ...input };
  if (
    typeof c.enabled !== "boolean" ||
    (input.provider !== undefined && input.provider !== "baileys")
  )
    throw new AppError("La única conexión disponible es Baileys.");
  c.provider = "baileys";
  for (const [kind, allowed] of Object.entries(fields)) {
    const key = kind === "attendance" ? "attendanceMessage" : "resultsMessage";
    if (
      typeof c[key] !== "string" ||
      !c[key].trim() ||
      c[key].length > 3000 ||
      !c[key].includes("{nombre}") ||
      [...c[key].matchAll(/\{([^{}]+)\}/g)].some(
        (match) => !allowed.includes(match[1]),
      )
    )
      throw new AppError(
        "Escribe mensajes de hasta 3000 caracteres con variables válidas y {nombre}.",
      );
  }
  if (c.enabled && !readiness("baileys"))
    throw new AppError(
      "Vincula WhatsApp antes de activar los avisos. Si falla, revisa el paquete Baileys.",
    );
  return Object.fromEntries(Object.keys(defaults).map((key) => [key, c[key]]));
}
function storeConfig(clean) {
  db.prepare(
    "INSERT OR REPLACE INTO config_general(clave,valor) VALUES('whatsapp_config',?)",
  ).run(JSON.stringify(clean));
}
function pause() {
  const c = getConfig();
  storeConfig({ ...c, enabled: false });
}
module.exports = {
  defaults,
  fields,
  getConfig,
  renderMessage,
  validateConfig,
  storeConfig,
  pause,
};
