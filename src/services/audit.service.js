const db = require("../database/db");
function audit(req, action, entity, entityId, details = {}) {
  db.prepare(
    "INSERT INTO audit_events(actor,action,entity,entity_id,details) VALUES(?,?,?,?,?)",
  ).run(
    req?.session?.username || (req?.session?.kiosk ? "kiosco" : "sistema"),
    action,
    entity,
    String(entityId || ""),
    JSON.stringify(details),
  );
}
module.exports = { audit };
