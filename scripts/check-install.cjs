const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

try {
  const root = path.resolve(__dirname, "..");
  const lock = JSON.parse(
    fs.readFileSync(path.join(root, "package-lock.json"), "utf8"),
  );
  const sqlite = lock.packages?.["node_modules/better-sqlite3"];
  assert.ok(sqlite, "Falta better-sqlite3 en package-lock.json.");
  assert.equal(
    sqlite.gypfile,
    false,
    "El lockfile perdió gypfile: false de better-sqlite3. Restaura ese metadato antes de npm ci: sin él npm puede ejecutar node-gyp innecesariamente.",
  );
  console.log(
    `[Instalación] Lockfile SQLite ${sqlite.version}: compilación automática desactivada.`,
  );
  if (!process.argv.includes("--lock-only")) {
    const manifest = require("better-sqlite3/package.json");
    assert.equal(
      manifest.version,
      sqlite.version,
      "SQLite instalado no coincide con el lockfile. Ejecuta npm ci.",
    );
    assert.equal(
      manifest.gypfile,
      false,
      "El paquete SQLite instalado no declara gypfile: false.",
    );
    const Database = require("better-sqlite3");
    const db = new Database(":memory:");
    try {
      db.exec("CREATE TABLE prueba (codigo TEXT PRIMARY KEY, nombre TEXT)");
      const insert = db.prepare("INSERT INTO prueba VALUES (?, ?)");
      db.transaction(() => insert.run("00001234", "Muñoz Ñahui"))();
      assert.deepEqual(db.prepare("SELECT * FROM prueba").get(), {
        codigo: "00001234",
        nombre: "Muñoz Ñahui",
      });
      assert.throws(
        db.transaction(() => {
          insert.run("00005678", "Temporal");
          throw new Error("rollback de prueba");
        }),
        /rollback de prueba/,
      );
      assert.equal(
        db.prepare("SELECT count(*) AS total FROM prueba").get().total,
        1,
      );
      assert.equal(db.pragma("integrity_check", { simple: true }), "ok");
      const prebuild =
        path.join(
          path.dirname(require.resolve("better-sqlite3/package.json")),
          "prebuilds",
        ) + path.sep;
      assert.ok(
        Object.keys(require.cache).some(
          (file) => file.startsWith(prebuild) && file.endsWith(".node"),
        ),
        "SQLite no cargó su binario distribuido con el paquete.",
      );
      console.log(
        `[Instalación] SQLite operativo en ${process.platform}/${process.arch}, Node ${process.versions.node}: binario incluido, escritura y rollback correctos.`,
      );
    } finally {
      db.close();
    }
  }
} catch (error) {
  console.error(`[Instalación] ${error.message}`);
  process.exitCode = 1;
}
