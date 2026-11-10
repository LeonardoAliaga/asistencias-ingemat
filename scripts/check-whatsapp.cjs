const { spawnSync } = require("node:child_process");
const path = require("node:path");
const result = spawnSync(
  process.execPath,
  [path.join(__dirname, "../src/whatsapp/baileys-worker.cjs"), "--diagnose"],
  { encoding: "utf8", timeout: 20000, windowsHide: true },
);
if (result.status === 0) console.log(result.stdout.trim());
else {
  console.error(
    "Revisa el paquete Baileys y su versión. Ejecuta npm ci y repite npm run whatsapp:doctor. Este fallo no impide iniciar INGEMAT.",
  );
  process.exitCode = 1;
}
