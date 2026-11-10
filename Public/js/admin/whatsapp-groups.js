export function mountWhatsAppGroups({ api, json }) {
  const $ = (id) => document.getElementById(id),
    cycle = $("wa-group-cycle"),
    search = $("wa-group-search"),
    select = $("wa-group-select"),
    message = $("wa-group-message");
  let cycles = [],
    generation = 0,
    debounce;
  const info = (text) => (message.textContent = text);
  function showTarget() {
    const target = cycles.find((c) => c.cycle === cycle.value)?.target;
    $("wa-group-current").textContent = target
      ? `Grupo actual: ${target.subject}`
      : "Este ciclo no tiene un grupo configurado.";
    search.value = "";
    select.replaceChildren(new Option("Busca y selecciona un grupo", ""));
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
  async function find(refresh = false) {
    const token = ++generation;
    info("Buscando grupos de la sesión…");
    try {
      const data = await api(
        `/api/v2/whatsapp/groups?q=${encodeURIComponent(search.value)}${refresh ? "&refresh=1" : ""}`,
      );
      if (token !== generation) return;
      select.replaceChildren(
        new Option("Selecciona un grupo", ""),
        ...data.groups.map(
          (g) => new Option(`${g.subject} · ${g.size} miembros`, g.id),
        ),
      );
      info(
        data.groups.length
          ? `${data.groups.length} grupo(s). Busca palabras en cualquier orden, sin tildes o con un pequeño error de escritura.`
          : "No se encontraron grupos. Comprueba que el teléfono pertenece al grupo y prueba otra búsqueda.",
      );
    } catch (error) {
      if (token === generation) info(error.message);
    }
  }
  cycle.onchange = () => {
    generation++;
    showTarget();
  };
  search.oninput = () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => find(), 300);
  };
  $("wa-group-refresh").onclick = () => find(true);
  async function save(groupId) {
    const button = groupId ? $("wa-group-save") : $("wa-group-remove");
    button.disabled = true;
    try {
      await api(
        "/api/v2/whatsapp/attendance-groups",
        json({ cycle: cycle.value, groupId }, "PUT"),
      );
      await load();
      info(
        groupId
          ? "Grupo del ciclo guardado. Ya puedes enviar el reporte desde Asistencias."
          : "Grupo del ciclo retirado.",
      );
    } catch (error) {
      info(error.message);
    } finally {
      button.disabled = false;
    }
  }
  $("wa-group-save").onclick = () =>
    select.value
      ? save(select.value)
      : info("Selecciona un grupo de la búsqueda.");
  $("wa-group-remove").onclick = () => {
    if (confirm(`¿Quitar el grupo de reportes del ciclo ${cycle.value}?`))
      void save("");
  };
  return { load };
}
