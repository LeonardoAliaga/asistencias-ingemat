// Búsqueda de grupos con autocompletado accesible sobre la API de Baileys.
export function mountWhatsAppGroups({ api, json }) {
  const $ = (id) => document.getElementById(id),
    cycle = $("wa-group-cycle"),
    search = $("wa-group-search"),
    selected = $("wa-group-select"),
    suggestions = $("wa-group-suggestions"),
    selectedLabel = $("wa-group-selected"),
    message = $("wa-group-message");
  let cycles = [], matches = [], generation = 0, debounce, focus = -1;
  const info = (text) => (message.textContent = text);
  function close() {
    suggestions.replaceChildren();
    suggestions.hidden = true;
    search.setAttribute("aria-expanded", "false");
    focus = -1;
  }
  function showTarget() {
    const target = cycles.find((c) => c.cycle === cycle.value)?.target;
    $("wa-group-current").textContent = target
      ? `Grupo actual: ${target.subject}`
      : "Este ciclo no tiene un grupo configurado.";
    search.value = "";
    selected.value = "";
    selectedLabel.textContent = "";
    matches = [];
    close();
    info("");
  }
  async function load() {
    const previous = cycle.value;
    const data = await api("/api/v2/whatsapp/attendance-groups");
    cycles = data.cycles;
    cycle.replaceChildren(...cycles.map((c) => new Option(c.cycle, c.cycle)));
    if (cycles.some((c) => c.cycle === previous)) cycle.value = previous;
    showTarget();
  }
  function choose(group) {
    selected.value = group.id;
    search.value = group.subject;
    selectedLabel.textContent = `Seleccionado: ${group.subject} (${group.size} miembros)`;
    close();
    info("Pulsa Guardar grupo del ciclo para confirmar el destino.");
  }
  function render() {
    suggestions.replaceChildren();
    focus = -1;
    if (!matches.length) {
      const notice = document.createElement("div");
      notice.className = "autocomplete-item wa-group-empty";
      notice.textContent = "No hay coincidencias. Prueba otro nombre o actualiza los grupos.";
      suggestions.append(notice);
    }
    for (const group of matches.slice(0, 12)) {
      const item = document.createElement("div");
      item.className = "autocomplete-item wa-group-option";
      item.setAttribute("role", "option");
      item.tabIndex = -1;
      item.textContent = `${group.subject} · ${group.size} miembros`;
      item.addEventListener("pointerdown", (event) => {
        event.preventDefault(); // evita perder la selección en el blur del input
        choose(group);
      });
      item.addEventListener("click", () => choose(group));
      suggestions.append(item);
    }
    suggestions.hidden = false;
    search.setAttribute("aria-expanded", "true");
  }
  async function find(refresh = false) {
    const token = ++generation;
    const query = search.value;
    info("Buscando grupos de la sesión…");
    try {
      const data = await api(
        `/api/v2/whatsapp/groups?q=${encodeURIComponent(query)}${refresh ? "&refresh=1" : ""}`,
      );
      if (token !== generation) return;
      matches = data.groups;
      render();
      info(
        matches.length
          ? `${matches.length} grupo(s). Escribe el nombre y selecciona uno de los resultados.`
          : "No se encontraron grupos. Comprueba que el teléfono pertenece al grupo y prueba otra búsqueda.",
      );
    } catch (error) {
      if (token !== generation) return;
      matches = [];
      close();
      info(error.message);
    }
  }
  cycle.onchange = () => {
    generation++;
    clearTimeout(debounce);
    showTarget();
  };
  search.oninput = () => {
    generation++; // invalida búsquedas pendientes inmediatamente
    selected.value = "";
    selectedLabel.textContent = "";
    clearTimeout(debounce);
    close();
    debounce = setTimeout(() => void find(), 220);
  };
  search.onfocus = () => {
    if (matches.length) render();
    else if (!search.value.trim()) void find();
  };
  search.onkeydown = (event) => {
    const items = [...suggestions.querySelectorAll('[role="option"]')];
    if (event.key === "Escape") return close();
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!items.length) return;
      focus = (focus + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items.forEach((item, index) => item.classList.toggle("active", index === focus));
      items[focus].scrollIntoView({ block: "nearest" });
    } else if (event.key === "Enter" && !suggestions.hidden && items.length) {
      event.preventDefault();
      items[focus < 0 ? 0 : focus].click();
    }
  };
  document.addEventListener("pointerdown", (event) => {
    if (!search.contains(event.target) && !suggestions.contains(event.target)) close();
  });
  $("wa-group-refresh").onclick = () => {
    clearTimeout(debounce);
    void find(true);
    search.focus();
  };
  async function save(groupId) {
    const button = groupId ? $("wa-group-save") : $("wa-group-remove");
    button.disabled = true;
    try {
      await api("/api/v2/whatsapp/attendance-groups", json({ cycle: cycle.value, groupId }, "PUT"));
      await load();
      info(groupId
        ? "Grupo del ciclo guardado. Ya puedes enviar el reporte desde Asistencias."
        : "Grupo del ciclo retirado.");
    } catch (error) {
      info(error.message);
    } finally {
      button.disabled = false;
    }
  }
  $("wa-group-save").onclick = () => selected.value
    ? save(selected.value)
    : info("Selecciona primero un grupo de las sugerencias.");
  $("wa-group-remove").onclick = () => {
    if (confirm(`¿Quitar el grupo de reportes del ciclo ${cycle.value}?`)) void save("");
  };
  return { load };
}
