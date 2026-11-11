// The v2 reader uses a shared print layout and durable, server-side batch processing.
// Legacy entry points route to the new workflow instead of guessing bubble positions.
export function setupOMRModule() {
  const create = document.getElementById("btn-preview-cartilla-crear");
  if (create)
    create.onclick = () =>
      alert(
        "Guarda y valida el examen en Simulacros para imprimir cartillas personalizadas v2.",
      );
  const scan = document.getElementById("btn-escanear-cartilla-camara");
  if (scan)
    scan.onclick = () =>
      window.dispatchEvent(
        new CustomEvent("ingemat:scan", {
          detail: {
            id: document.getElementById("eval-select-respuesta")?.value,
          },
        }),
      );
  window._abrirPrevisualizacionCartilla = abrirPrevisualizacionCartilla;
}
export function abrirPrevisualizacionCartilla(exam) {
  window.open(
    `/api/v2/exams/${encodeURIComponent(exam.id)}/sheets.pdf`,
    "_blank",
    "noopener",
  );
}
export const descargarCartillaPNG = abrirPrevisualizacionCartilla;
export const descargarCartillaPDFA4 = abrirPrevisualizacionCartilla;
