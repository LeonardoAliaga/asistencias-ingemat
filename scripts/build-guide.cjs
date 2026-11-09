const fs = require("node:fs");
const path = require("node:path");
const guide = require("../src/content/guide.json");
const out = [
  "# Guía completa de INGEMAT 2.0",
  "",
  "Este contenido también está integrado en la dashboard, con buscador, categorías y ayuda contextual.",
  "",
];
for (const article of guide.articles) {
  out.push(`## ${article.title}`, "", article.summary, "");
  article.steps.forEach((step, i) =>
    out.push(`${i + 1}. **${step.title}.** ${step.text}`),
  );
  if (article.tips?.length) out.push("", ...article.tips.map((t) => `- ${t}`));
  out.push("");
}
fs.writeFileSync(path.join(__dirname, "../docs/GUIA.md"), out.join("\n"));
console.log(`${guide.articles.length} tutoriales exportados a docs/GUIA.md`);
