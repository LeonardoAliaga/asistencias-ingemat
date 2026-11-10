const db = require("../database/db");
const baileys = require("./baileys.service");
const { GROUP_ID } = require("../whatsapp/media.cjs");
const { AppError } = require("../utils/errors");
const { audit } = require("./audit.service");
let cached = [],
  cachedAt = 0,
  loading;
const normalize = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
function closeWord(word, query) {
  if (word.includes(query)) return true;
  if (query.length < 4 || Math.abs(word.length - query.length) > 1)
    return false;
  if (word.length === query.length) {
    const different = [...word]
      .map((c, i) => (c === query[i] ? -1 : i))
      .filter((i) => i >= 0);
    return (
      different.length === 1 ||
      (different.length === 2 &&
        different[1] === different[0] + 1 &&
        word[different[0]] === query[different[1]] &&
        word[different[1]] === query[different[0]])
    );
  }
  const longer = word.length > query.length ? word : query,
    shorter = word.length > query.length ? query : word;
  for (let i = 0; i < longer.length; i++)
    if (longer.slice(0, i) + longer.slice(i + 1) === shorter) return true;
  return false;
}
function searchGroups(groups, query = "") {
  const tokens = normalize(query).split(" ").filter(Boolean).slice(0, 8);
  return groups
    .filter((g) =>
      tokens.every((q) =>
        normalize(g.subject)
          .split(" ")
          .some((w) => closeWord(w, q)),
      ),
    )
    .sort((a, b) => a.subject.localeCompare(b.subject, "es"))
    .slice(0, 100);
}
async function listGroups(query = "", refresh = false) {
  if (!baileys.status().connected)
    throw new AppError(
      "Conecta WhatsApp en Comunicación para buscar sus grupos.",
      409,
    );
  if (refresh || Date.now() - cachedAt > 30000) {
    loading ||= baileys
      .listGroups()
      .then((groups) => {
        cached = groups;
        cachedAt = Date.now();
      })
      .finally(() => (loading = null));
    await loading;
  }
  return searchGroups(cached, String(query).slice(0, 100));
}
function mappings() {
  try {
    const map = JSON.parse(
      db
        .prepare(
          "SELECT valor FROM config_general WHERE clave='whatsapp_attendance_groups'",
        )
        .get()?.valor || "{}",
    );
    return map && typeof map === "object" && !Array.isArray(map) ? map : {};
  } catch {
    return {};
  }
}
function target(cycle) {
  const key = String(cycle || "")
      .trim()
      .toUpperCase(),
    map = mappings();
  const exists = db
    .prepare("SELECT 1 FROM ciclos WHERE UPPER(nombre)=?")
    .get(key);
  return exists && GROUP_ID.test(map[key]?.id)
    ? {
        cycle: key,
        id: map[key].id,
        subject: String(map[key].subject || "Grupo del ciclo"),
      }
    : null;
}
async function setMapping(cycle, groupId, req) {
  const key = String(cycle || "")
    .trim()
    .toUpperCase();
  if (!db.prepare("SELECT 1 FROM ciclos WHERE UPPER(nombre)=?").get(key))
    throw new AppError("El ciclo no existe.", 404);
  let group;
  if (groupId) {
    if (!GROUP_ID.test(groupId))
      throw new AppError("Selecciona un grupo de la búsqueda.");
    // Revalidate membership using a fresh list rather than accepting arbitrary JIDs.
    await listGroups("", true);
    group = cached.find((g) => g.id === groupId);
    if (!group)
      throw new AppError(
        "El grupo no está disponible en la sesión conectada.",
        409,
      );
  }
  return db.transaction(() => {
    const map = mappings();
    if (group) map[key] = { id: group.id, subject: group.subject };
    else delete map[key];
    db.prepare(
      "INSERT OR REPLACE INTO config_general(clave,valor) VALUES('whatsapp_attendance_groups',?)",
    ).run(JSON.stringify(map));
    db.prepare(
      "UPDATE outbox SET status='cancelled',error='El grupo del ciclo cambió; genera el reporte de nuevo.',updated_at=CURRENT_TIMESTAMP WHERE kind='attendance_report' AND json_extract(CASE WHEN json_valid(payload) THEN payload ELSE '{}' END,'$.cycle')=? AND recipient!=? AND status IN ('pending','retry','failed')",
    ).run(key, group?.id || "");
    audit(req, "configurar_grupo_asistencia", "ciclo", key, {
      groupId: group?.id || null,
    });
    return target(key);
  })();
}
module.exports = { listGroups, searchGroups, mappings, target, setMapping };
