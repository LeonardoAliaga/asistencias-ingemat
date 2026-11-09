const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { randomUUID } = require("node:crypto");
const { createCanvas, loadImage } = require("@napi-rs/canvas");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ingemat-image-"));
process.env.DATA_DIR = dir;
process.env.DISABLE_MIGRATION_BACKUP = "1";
const db = require("../src/database/db");
const attendance = require("../src/services/attendance.service");
const { renderReportSections } = require("../src/services/report-generator");
const day = "2026-11-09";
for (const [code, name, shift, time, status] of [
  ["I1", "ZAPATA ANA", "mañana", "08:30", "puntual"],
  ["I2", "ALIAGA LEONARDO", "mañana", "08:35", "tolerancia"],
  ["I3", "MEDINA LUIS", "mañana", "08:40", "tarde"],
  ["I4", "PEREZ MARIA", "mañana", "09:00", "justificada"],
  ["I5", "ROJAS JOSE", "tarde", "15:00", "puntual"],
  ["D1", "DOCENTE CARLOS", "docente", "08:30", "registrado"],
]) {
  const uid = randomUUID();
  db.prepare(
    "INSERT INTO usuarios(codigo,nombre,apellido,rol,uid) VALUES(?,?,?,?,?)",
  ).run(code, name, "", shift === "docente" ? "docente" : "estudiante", uid);
  db.prepare(
    "INSERT INTO attendance(id,user_uid,student_code,name_snapshot,cycle_snapshot,shift_snapshot,business_date,arrival_time,arrived_at,status,source) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
  ).run(
    randomUUID(),
    uid,
    code,
    name,
    shift === "docente" ? "" : "ANUAL",
    shift,
    day,
    time,
    day + "T13:00:00Z",
    status,
    "operador",
  );
}
after(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
async function pixels(buffer) {
  const image = await loadImage(buffer),
    canvas = createCanvas(image.width, image.height),
    ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  return {
    width: canvas.width,
    height: canvas.height,
    color: (x, y) => [...ctx.getImageData(x, y, 1, 1).data],
  };
}
test("attendance image preserves classic three-column dimensions, headers and status colors", async () => {
  const section = attendance.imageSections(day, "ANUAL", "mañana")[0];
  assert.equal(section.title, "REGISTRO DE ASISTENCIA - ANUAL - MAÑANA");
  assert.equal(section.headers[4], "LUNES 09");
  assert.deepEqual(
    section.rows.map((r) => r.nombre),
    ["ALIAGA LEONARDO", "MEDINA LUIS", "PEREZ MARIA", "ZAPATA ANA"],
  );
  assert.deepEqual(
    section.rows.map((r) => r.n),
    ["1", "2", "3", "4"],
  );
  assert.equal(section.rows[2].hora, "09:00AM (J)");
  const png = await pixels(attendance.image(day, "ANUAL", "mañana"));
  assert.deepEqual([png.width, png.height], [560, 215]);
  assert.deepEqual(png.color(15, 55), [10, 34, 64, 255]);
  assert.deepEqual(png.color(400, 90), [255, 235, 156, 255]);
  assert.deepEqual(png.color(400, 120), [255, 199, 206, 255]);
  assert.deepEqual(png.color(400, 150), [255, 235, 156, 255]);
  assert.deepEqual(png.color(400, 180), [198, 239, 206, 255]);
});
test("combined attendance images retain separate cycle/shift sections and teacher colors", async () => {
  assert.equal(attendance.imageSections(day).length, 3);
  const png = await pixels(attendance.image(day));
  assert.deepEqual([png.width, png.height], [560, 465]);
  const teacher = await pixels(attendance.image(day, "", "docente"));
  assert.deepEqual(teacher.color(15, 55), [0, 128, 128, 255]);
  assert.deepEqual(teacher.color(400, 90), [214, 234, 248, 255]);
  assert.equal(
    attendance.workbook(day, "ANUAL", "tarde").getWorksheet(1).rowCount,
    2,
  );
  assert.equal(attendance.list(day, "ANUAL", "tarde")[0].student_code, "I5");
});
test("image export rejects empty selections, invalid filters and oversized images without truncation", () => {
  assert.throws(() => attendance.image("2026-02-30"), /Fecha inválida/);
  assert.throws(() => attendance.image(day, "", "noche"), /turno válido/);
  assert.throws(() => attendance.image("2031-01-01"), /No hay asistencias/);
  assert.throws(
    () => renderReportSections([{ rows: Array(600).fill({}) }]),
    /demasiado largo/,
  );
});
