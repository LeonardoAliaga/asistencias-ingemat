const { runNaps, executable } = require("../src/services/scanner.service");
const db = require("../src/database/db");
const driver = process.argv[2] || "wia";
if (!["wia", "twain"].includes(driver)) {
  console.error("Usa: npm run scanner:doctor -- wia (o twain)");
  process.exitCode = 1;
  db.close();
} else {
  console.info("[NAPS2] Diagnóstico", {
    executable: executable(),
    driver,
    cwd: process.cwd(),
  });
  runNaps(["--listdevices", "--driver", driver], { timeout: 30000 })
    .then((text) => {
      console.info(
        "[NAPS2] Escáneres disponibles:\n" +
          (text.trim() || "(ninguno; comprueba el controlador Brother)"),
      );
      if (!text.trim()) process.exitCode = 1;
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    })
    .finally(() => db.close());
}
