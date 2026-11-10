// Buscador compartido de grupos para notificaciones WhatsApp.
const initialized = new WeakSet();
const normalize = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").trim();
export function setupGroupAutocomplete({ input, hiddenInput, resultsContainer, getGroups, onSelect }) {
  if (!input || !hiddenInput || !resultsContainer || initialized.has(input)) return;
  initialized.add(input);
  let focus = -1;
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  resultsContainer.setAttribute("role", "listbox");
  function close() {
    resultsContainer.replaceChildren();
    resultsContainer.style.display = "none";
    input.setAttribute("aria-expanded", "false");
    focus = -1;
  }
  function select(group) {
    input.value = group.name;
    hiddenInput.value = group.id;
    close();
    onSelect?.();
  }
  function render() {
    resultsContainer.replaceChildren();
    focus = -1;
    hiddenInput.value = "";
    if (input.disabled) return close();
    const query = normalize(input.value);
    const groups = (getGroups() || []).filter(g => g?.id && g?.name);
    const matches = groups.filter(g => normalize(g.name).includes(query))
      .sort((a,b) => Number(normalize(b.name).startsWith(query)) - Number(normalize(a.name).startsWith(query)) || a.name.localeCompare(b.name, "es"))
      .slice(0, 12);
    if (!matches.length) {
      const item = document.createElement("div");
      item.className = "autocomplete-item autocomplete-empty";
      item.textContent = groups.length ? "No se encontraron grupos." : "No hay grupos disponibles. Comprueba la conexión.";
      resultsContainer.append(item);
    }
    matches.forEach(group => {
      const item = document.createElement("div");
      item.className = "autocomplete-item";
      item.setAttribute("role", "option");
      item.textContent = group.name;
      item.addEventListener("pointerdown", e => { e.preventDefault(); select(group); });
      item.addEventListener("click", () => select(group));
      resultsContainer.append(item);
    });
    resultsContainer.style.display = "block";
    input.setAttribute("aria-expanded", "true");
  }
  input.addEventListener("focus", render);
  input.addEventListener("input", render);
  input.addEventListener("keydown", e => {
    const items = [...resultsContainer.querySelectorAll('[role="option"]')];
    if (e.key === "Escape") return close();
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!items.length) return;
      focus = (focus + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items.forEach((el,i) => el.classList.toggle("autocomplete-active",i === focus));
      items[focus].scrollIntoView({block:"nearest"});
    } else if (e.key === "Enter" && items.length && resultsContainer.style.display === "block") {
      e.preventDefault();
      items[focus < 0 ? 0 : focus].click();
    }
  });
  document.addEventListener("pointerdown", e => {
    if (!input.contains(e.target) && !resultsContainer.contains(e.target)) close();
  });
}
