const db = require("../database/db");
const DEFAULT_CYCLES = ["SEMESTRAL", "ANUAL", "SABATINO", "DOMINGOS"];
// Run after legacy import. Register the historical first-run choices once,
// rather than exposing selectable names that do not exist in the database.
function initializeCycles() {
  db.transaction(() => {
    if (
      db
        .prepare(
          "SELECT 1 FROM config_general WHERE clave='cycles_initialized'",
        )
        .get()
    )
      return;
    if (!db.prepare("SELECT 1 FROM ciclos LIMIT 1").get()) {
      const insert = db.prepare("INSERT INTO ciclos(nombre) VALUES(?)");
      for (const name of DEFAULT_CYCLES) insert.run(name);
    }
    db.prepare(
      "INSERT INTO config_general(clave,valor) VALUES('cycles_initialized','1')",
    ).run();
  })();
}
module.exports = { initializeCycles };
