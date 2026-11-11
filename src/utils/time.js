const { timezone } = require("../config");
function localParts(date = new Date()) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
}
function businessDate(date) {
  const p = localParts(date);
  return `${p.year}-${p.month}-${p.day}`;
}
function businessTime(date) {
  const p = localParts(date);
  return `${p.hour}:${p.minute}`;
}
function displayDate(iso) {
  const [y, m, d] = String(iso).split("-");
  return `${d}/${m}/${y}`;
}
function weekday(date = new Date()) {
  return ["D", "L", "M", "MI", "J", "V", "S"][
    new Date(`${businessDate(date)}T12:00:00Z`).getUTCDay()
  ];
}
module.exports = { businessDate, businessTime, displayDate, weekday };
