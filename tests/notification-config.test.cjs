const { test, after } = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ingemat-wa-config-"));
process.env.DATA_DIR = dir;
process.env.DISABLE_MIGRATION_BACKUP = "1";
const db = require("../src/database/db"),
  config = require("../src/services/notification-config.service");
after(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
test("configuration exposes only Baileys and activation requires a connected session", () => {
  assert.equal(config.getConfig().provider, "baileys");
  assert.equal(config.getConfig().enabled, false);
  assert.throws(
    () =>
      config.validateConfig(
        { provider: "meta_cloud", enabled: false },
        () => true,
      ),
    /única/,
  );
  assert.throws(
    () => config.validateConfig({ enabled: true }, () => false),
    /Vincula/,
  );
  assert.equal(
    config.validateConfig({ enabled: true }, () => true).enabled,
    true,
  );
});
test("message variables are bounded and values are substituted literally", () => {
  assert.throws(
    () =>
      config.validateConfig(
        { enabled: false, attendanceMessage: "Hola {nombre} {ejecutar}" },
        () => false,
      ),
    /variables/,
  );
  assert.throws(
    () =>
      config.validateConfig(
        { enabled: false, resultsMessage: "X".repeat(3001) },
        () => false,
      ),
    /3000/,
  );
  const text = config.renderMessage("attendance", [
    "$& {nombre}",
    "2026-11-10",
    "08:00",
    "puntual",
  ]);
  assert(text.includes("Estudiante: $& {nombre}"));
  assert(!text.includes("undefined"));
});
test("malformed settings are disabled and unknown fields never leak into the API", () => {
  db.prepare(
    "INSERT OR REPLACE INTO config_general(clave,valor) VALUES('whatsapp_config','{')",
  ).run();
  assert.doesNotThrow(() => config.getConfig());
  assert.equal(config.getConfig().enabled, false);
  db.prepare(
    "UPDATE config_general SET valor=? WHERE clave='whatsapp_config'",
  ).run(JSON.stringify({ enabled: true, token: "private-old-token" }));
  assert(!("token" in config.getConfig()));
});

test("multiple message variants remain valid and can select each text without changing variables", () => {
  const settings = config.validateConfig({
    enabled: false,
    attendanceMessage: "✅ Estudiante: {nombre}, {hora}\n---\n📋 Estudiante: {nombre}, {estado}",
  }, () => false);
  assert.equal(config.renderMessage("attendance", ["Ana", "2026-11-10", "07:50", "puntual"], settings, () => 0), "✅ Estudiante: Ana, 07:50");
  assert.equal(config.renderMessage("attendance", ["Ana", "2026-11-10", "07:50", "puntual"], settings, () => 1), "📋 Estudiante: Ana, puntual");
  assert.throws(() => config.validateConfig({ enabled: false, attendanceMessage: "Estudiante: {nombre}\n---\nSIN ALUMNO" }, () => false), /nombre/);
  assert.throws(() => config.validateConfig({ enabled: false, attendanceMessage: Array.from({ length: 11 }, () => "{nombre}").join("\n---\n") }, () => false), /10 variantes/);
});
