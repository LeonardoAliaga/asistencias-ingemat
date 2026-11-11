const { createCanvas } = require("@napi-rs/canvas");
const PAGE_ROWS = 22;
const MAX_IMAGES = 120;
const WIDTH = 1320;
const ROW_HEIGHT = 56;

function fitText(ctx, value, width) {
  let text = String(value ?? "");
  if (ctx.measureText(text).width <= width) return text;
  while (text && ctx.measureText(text + "…").width > width) text = text.slice(0, -1);
  return text + "…";
}
function groupPages(report) {
  const definition = JSON.parse(report.exam.definition || "{}");
  const labels = new Map((definition.areas || []).map(area => [
    area.code, String(area.name || area.nombre || area.code).slice(0, 120),
  ]));
  const groups = new Map();
  for (const row of report.rows) {
    const code = row.area || "GENERAL";
    if (!groups.has(code)) groups.set(code, []);
    groups.get(code).push(row);
  }
  const result = [];
  for (const [code, rows] of [...groups].sort(([a], [b]) => a.localeCompare(b, "es"))) {
    rows.sort((a, b) => Number(b.puntajeTotal) - Number(a.puntajeTotal)
      || String(a.nombreEstudiante).localeCompare(String(b.nombreEstudiante), "es"));
    let last = null, position = 0;
    const ranked = rows.map((row, i) => {
      const score = Number(row.puntajeTotal || 0);
      if (last === null || score !== last) position = i + 1;
      last = score;
      return {
        position, name: row.nombreEstudiante || "Sin nombre",
        good: Number(row.correctas || 0),
        bad: Number(row.incorrectas || 0),
        blank: Number(row.enBlanco || 0),
        score,
      };
    });
    const total = Math.ceil(ranked.length / PAGE_ROWS);
    for (let page = 0; page < total; page++) {
      result.push({
        code, area: labels.get(code) || code, page: page + 1, total,
        areaCount: ranked.length, rows: ranked.slice(page * PAGE_ROWS, (page + 1) * PAGE_ROWS),
      });
    }
  }
  if (result.length > MAX_IMAGES)
    throw new Error("El ranking requiere demasiadas imágenes. Divide los resultados en varios envíos.");
  return result;
}
function formatScore(value) {
  return Number(value).toLocaleString("es-PE", { maximumFractionDigits: 3 });
}
function renderPage(report, page) {
  const height = 234 + page.rows.length * ROW_HEIGHT + 70;
  const canvas = createCanvas(WIDTH, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#f3f6fc"; ctx.fillRect(0, 0, WIDTH, height);
  ctx.fillStyle = "#122848"; ctx.fillRect(0, 0, WIDTH, 176);
  ctx.textBaseline = "middle"; ctx.fillStyle = "#ffffff";
  ctx.font = "bold 36px Arial, sans-serif";
  ctx.fillText(fitText(ctx, "INGEMAT · " + report.exam.titulo, WIDTH - 94), 48, 50);
  ctx.font = "bold 26px Arial, sans-serif";
  ctx.fillText(fitText(ctx, "RANKING · ÁREA " + page.area, WIDTH - 94), 48, 101);
  ctx.font = "21px Arial, sans-serif"; ctx.fillStyle = "#d8e7ff";
  ctx.fillText(fitText(ctx, "Ciclo: " + report.exam.ciclo + "  |  Fecha: "
    + report.exam.fecha + "  |  Evaluados en el área: " + page.areaCount, WIDTH - 96), 48, 143);
  ctx.fillStyle = "#e0eaff"; ctx.fillRect(30, 178, WIDTH - 60, 56);
  ctx.font = "bold 20px Arial, sans-serif"; ctx.fillStyle = "#152c50";
  ctx.textAlign = "left"; ctx.fillText("Puesto", 47, 207);
  ctx.fillText("Apellidos y nombres", 155, 207);
  ctx.textAlign = "center";
  for (const [text, x] of [["Buenas", 855], ["Malas", 970], ["Vacías", 1086], ["Puntaje", 1210]]) {
    ctx.fillText(text, x, 207);
  }
  const formatInt = n => String(Math.max(0, Math.trunc(n)));
  for (const [index, row] of page.rows.entries()) {
    const top = 234 + index * ROW_HEIGHT;
    ctx.fillStyle = index % 2 === 0 ? "#ffffff" : "#f8faff";
    ctx.fillRect(30, top, WIDTH - 60, ROW_HEIGHT);
    ctx.fillStyle = "#dae3f0"; ctx.fillRect(30, top + ROW_HEIGHT - 1, WIDTH - 60, 1);
    ctx.font = "bold 20px Arial, sans-serif";
    ctx.fillStyle = "#233657"; ctx.textAlign = "left";
    ctx.fillText(String(row.position), 56, top + 28);
    ctx.font = "20px Arial, sans-serif";
    ctx.fillText(fitText(ctx, row.name, 630), 155, top + 28);
    ctx.textAlign = "center";
    ctx.fillText(formatInt(row.good), 855, top + 28);
    ctx.fillText(formatInt(row.bad), 970, top + 28);
    ctx.fillText(formatInt(row.blank), 1086, top + 28);
    ctx.font = "bold 22px Arial, sans-serif"; ctx.fillStyle = "#165b98";
    ctx.fillText(formatScore(row.score), 1210, top + 28);
  }
  ctx.textAlign = "right"; ctx.font = "19px Arial, sans-serif"; ctx.fillStyle = "#475569";
  ctx.fillText("Área " + page.area + " · Página " + page.page + " de " + page.total,
    WIDTH - 48, height - 33);
  return canvas.toBuffer("image/png");
}
module.exports = { groupPages, renderPage, PAGE_ROWS };
