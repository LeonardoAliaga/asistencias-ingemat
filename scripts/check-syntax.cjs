const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
function walk(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory() &&
      !["node_modules", ".git", "data", "Registros"].includes(e.name)
        ? walk(path.join(dir, e.name))
        : e.isFile() && /\.(js|cjs)$/.test(e.name)
          ? [path.join(dir, e.name)]
          : [],
    );
}
let failed = 0;
for (const file of walk(".")) {
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=" +
        (file.replaceAll("\\", "/").startsWith("Public/js/")
          ? "module"
          : "commonjs"),
      "--check",
    ],
    { input: fs.readFileSync(file, "utf8"), encoding: "utf8" },
  );
  if (result.status) {
    console.error(file, result.stderr);
    failed++;
  }
}
console.log(
  failed ? `${failed} archivos con errores` : "Sintaxis JavaScript verificada.",
);
process.exitCode = failed ? 1 : 0;
