// Preview original files before creating an OMR batch. Excluded originals stay
// available for another attempt; cancel never sends files to the reader.
export function previewScans(
  items,
  { title = "Revisar archivos antes de procesar", escape: esc },
) {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "scan-preview-dialog";
    dialog.setAttribute("aria-label", title);
    const included = new Set(items.map((_, i) => i));
    let selected = 0,
      settled = false;
    dialog.innerHTML = `<header class="v2-card-title"><h3>${esc(title)}</h3><button type="button" class="v2-link" data-preview-cancel>Cerrar</button></header><p class="v2-help">Comprueba todas las páginas de cada PDF. Puedes ampliar y desplazarte por el documento. Desmarca los archivos borrosos, recortados o incompletos para volver a escanearlos.</p><div class="scan-preview-grid"><div class="scan-preview-files">${items.map((item, i) => `<div class="scan-preview-file"><label><input type="checkbox" data-preview-include="${i}" checked> Incluir ${i + 1}</label><button class="v2-link" type="button" data-preview-open="${i}">${esc(item.name)}</button></div>`).join("")}</div><div class="scan-preview-document"><p><strong data-preview-name></strong> · <a target="_blank" rel="noopener" data-preview-external>Abrir en otra pestaña</a></p><div data-preview-view></div></div></div><footer class="v2-toolbar"><span data-preview-count role="status"></span><button type="button" class="v2-button secondary" data-preview-cancel>Volver sin procesar</button><button type="button" class="v2-button" data-preview-confirm>Procesar seleccionados</button></footer>`;
    const update = () => {
      dialog.querySelector("[data-preview-count]").textContent =
        `${included.size} de ${items.length} archivos seleccionados`;
      dialog.querySelector("[data-preview-confirm]").disabled = !included.size;
    };
    const open = (index) => {
      selected = index;
      const item = items[index],
        view = dialog.querySelector("[data-preview-view]");
      dialog.querySelector("[data-preview-name]").textContent = item.name;
      dialog.querySelector("[data-preview-external]").href = item.url;
      const element = document.createElement(item.pdf ? "iframe" : "img");
      element.src = item.url;
      if (item.pdf) element.title = `Vista previa de ${item.name}`;
      else element.alt = `Vista previa de ${item.name}`;
      view.replaceChildren(element);
      dialog
        .querySelectorAll("[data-preview-open]")
        .forEach((button) =>
          button.setAttribute(
            "aria-pressed",
            String(Number(button.dataset.previewOpen) === selected),
          ),
        );
    };
    const finish = (value) => {
      if (settled) return;
      settled = true;
      dialog.close();
      dialog.remove();
      resolve(value);
    };
    dialog.addEventListener("click", (event) => {
      if (event.target.closest("[data-preview-cancel]")) finish(null);
      const button = event.target.closest("[data-preview-open]");
      if (button) open(Number(button.dataset.previewOpen));
      if (event.target.closest("[data-preview-confirm]"))
        finish(items.filter((_, i) => included.has(i)));
    });
    dialog.addEventListener("change", (event) => {
      const input = event.target.closest("[data-preview-include]");
      if (input) {
        const index = Number(input.dataset.previewInclude);
        if (input.checked) included.add(index);
        else included.delete(index);
        update();
      }
    });
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      finish(null);
    });
    document.body.append(dialog);
    update();
    open(0);
    dialog.showModal();
  });
}
