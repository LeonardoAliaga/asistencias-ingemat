const { randomUUID } = require("node:crypto");
const db = require("../database/db");
const ExcelJS = require("exceljs");
const {
  businessDate,
  businessTime,
  weekday,
  displayDate,
} = require("../utils/time");
const { estadoAsistencia, getFullName } = require("../utils/helpers");
const { AppError } = require("../utils/errors");
const { audit } = require("./audit.service");
const { hasPermission } = require("./auth.service");
const notifications = require("./notifications.service");
function register(code, req, date = new Date()) {
  let codigo = String(code || "")
    .trim()
    .toUpperCase();
  if (!codigo || codigo.length > 40)
    throw new AppError("Ingresa un código válido.");
  let justified = false;
  if (
    !db.prepare("SELECT 1 FROM usuarios WHERE codigo=?").get(codigo) &&
    codigo.endsWith("J")
  ) {
    codigo = codigo.slice(0, -1);
    justified = true;
  }
  if (justified && !hasPermission(req.session?.role, "asistencias:justify"))
    throw new AppError(
      "La justificación requiere una cuenta autorizada. Registra la asistencia con el código habitual.",
      403,
    );
  const user = db.prepare("SELECT * FROM usuarios WHERE codigo=?").get(codigo);
  if (!user) throw new AppError("Código no encontrado.", 404);
  const day = businessDate(date),
    time = businessTime(date),
    shift = user.turno || "docente";
  if (
    db
      .prepare(
        "SELECT id FROM attendance WHERE user_uid=? AND business_date=? AND shift_snapshot=?",
      )
      .get(user.uid, day, shift)
  )
    throw new AppError(
      "Ya existe un registro de asistencia para esta fecha y turno.",
      409,
    );
  const record = {
    id: randomUUID(),
    user_uid: user.uid,
    student_code: codigo,
    name_snapshot: getFullName(user),
    cycle_snapshot: user.ciclo || "",
    shift_snapshot: shift,
    business_date: day,
    arrival_time: time,
    arrived_at: date.toISOString(),
    status: justified
      ? "justificada"
      : user.rol === "estudiante"
        ? estadoAsistencia(user.ciclo, String(user.turno).toLowerCase(), time)
        : "registrado",
  };
  let queued = 0;
  // Store the attendance and notification jobs together. A disabled transport never prevents registration.
  db.transaction(() => {
    db.prepare(
      "INSERT INTO attendance(id,user_uid,student_code,name_snapshot,cycle_snapshot,shift_snapshot,business_date,arrival_time,arrived_at,status,source) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    ).run(
      record.id,
      user.uid,
      codigo,
      record.name_snapshot,
      record.cycle_snapshot,
      shift,
      day,
      time,
      record.arrived_at,
      record.status,
      req.session?.kiosk ? "kiosco" : "operador",
    );
    try {
      queued = notifications.notifyAttendance(record, user);
    } catch (e) {
      audit(
        req,
        "notificacion_pendiente_configuracion",
        "asistencia",
        record.id,
        { mensaje: e.message },
      );
    }
    audit(req, "registrar", "asistencia", record.id, { codigo });
  })();
  const days = JSON.parse(user.dias_asistencia || "[]");
  const scheduled = !days.length || days.includes(weekday(date));
  return {
    exito: true,
    nombre: record.name_snapshot,
    hora: `${displayDate(day)} ${time}`,
    estado: record.status,
    ciclo: user.ciclo,
    turno: user.turno,
    rol: user.rol,
    whatsappEnviado: false,
    notificacionesEnCola: queued,
    mensajeAdicional: scheduled ? null : "Registrado fuera del día programado.",
  };
}
function list(day = businessDate(), cycle = "") {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new AppError("Fecha inválida.");
  return db
    .prepare(
      "SELECT * FROM attendance WHERE business_date=? AND (?='' OR UPPER(cycle_snapshot)=UPPER(?)) ORDER BY arrived_at DESC,name_snapshot",
    )
    .all(day, cycle, cycle);
}
function workbook(day, cycle = "") {
  const rows = list(day, cycle),
    wb = new ExcelJS.Workbook(),
    sheet = wb.addWorksheet("Asistencias");
  sheet.columns = [
    { header: "CÓDIGO", key: "student_code", width: 18 },
    { header: "ESTUDIANTE / DOCENTE", key: "name_snapshot", width: 40 },
    { header: "CICLO", key: "cycle_snapshot", width: 22 },
    { header: "TURNO", key: "shift_snapshot", width: 14 },
    { header: "FECHA", key: "business_date", width: 16 },
    { header: "HORA", key: "arrival_time", width: 12 },
    { header: "ESTADO", key: "status", width: 18 },
    { header: "JUSTIFICACIÓN", key: "justification", width: 45 },
  ];
  sheet.addRows(rows);
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF0A2240" },
  };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = "A1:H1";
  return wb;
}
function justify(id, reason, req) {
  if (String(reason || "").trim().length < 5)
    throw new AppError("Describe el motivo de la justificación.");
  const row = db.prepare("SELECT * FROM attendance WHERE id=?").get(id);
  if (!row) throw new AppError("Registro no encontrado.", 404);
  db.prepare(
    "UPDATE attendance SET status='justificada',justification=? WHERE id=?",
  ).run(reason.trim(), id);
  audit(req, "justificar", "asistencia", id, { reason });
}
module.exports = { register, list, workbook, justify };
