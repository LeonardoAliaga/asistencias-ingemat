const { Writable } = require("node:stream");
const readline = require("node:readline/promises");
const db = require("../src/database/db");
const {
  hashPassword,
  validatePassword,
} = require("../src/services/auth.service");
(async () => {
  const username = String(process.argv[2] || "admin")
    .trim()
    .toLowerCase();
  const account = db
    .prepare("SELECT id FROM accounts WHERE username=?")
    .get(username);
  if (!account)
    throw new Error(
      "Cuenta no encontrada. Inicializa la instalación antes de recuperar una cuenta.",
    );
  let password = process.env.ADMIN_RESET_PASSWORD;
  if (!password) {
    if (!process.stdin.isTTY)
      throw new Error(
        "Usa una terminal interactiva o define ADMIN_RESET_PASSWORD temporalmente.",
      );
    const output = new Writable({
      write(chunk, encoding, callback) {
        callback();
      },
    });
    const input = readline.createInterface({
      input: process.stdin,
      output,
      terminal: true,
    });
    process.stdout.write("Nueva contraseña (no se muestra): ");
    password = await input.question("");
    process.stdout.write("\nRepite la contraseña: ");
    const repeated = await input.question("");
    input.close();
    process.stdout.write("\n");
    if (password !== repeated) throw new Error("Las contraseñas no coinciden.");
  }
  validatePassword(password);
  db.prepare(
    "UPDATE accounts SET password_hash=?,must_change_password=0,token_version=token_version+1,active=1 WHERE id=?",
  ).run(hashPassword(password), account.id);
  db.prepare(
    "INSERT INTO audit_events(actor,action,entity,entity_id,details) VALUES(?,?,?,?,?)",
  ).run(
    "administracion_local",
    "restablecer_password",
    "cuenta",
    String(account.id),
    "{}",
  );
  console.log(
    "Contraseña restablecida. Las sesiones anteriores quedan invalidadas.",
  );
})()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => db.close());
