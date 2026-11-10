const db = require("../database/db");
const notifications = require("./notifications.service");
const imports = require("./imports.service");
let timers = [];
function start() {
  if (timers.length) return;
  const cfg = notifications.getConfig();
  if (cfg.provider === "baileys" && cfg.enabled)
    require("./baileys.service").connect();
  db.prepare(
    "UPDATE import_batches SET status='queued' WHERE status='processing'",
  ).run();
  db.prepare(
    "UPDATE outbox SET status='unknown',error='El servidor se reinició durante el envío. Revisa la entrega antes de reenviar.' WHERE status='sending'",
  ).run();
  timers = [
    setInterval(() => imports.processScanQueue().catch(console.error), 1500),
    setInterval(() => notifications.processOutbox().catch(console.error), 3000),
  ];
  for (const timer of timers) timer.unref();
}
function stop() {
  require("./baileys.service").stop();
  timers.forEach(clearInterval);
  timers = [];
}
module.exports = { start, stop };
