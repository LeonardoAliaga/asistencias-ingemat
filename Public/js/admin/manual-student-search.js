// Selección inteligente local de alumnos elegibles para el simulacro.
// El formulario solo envía códigos verificados al elegir una sugerencia.
const normalize = (text) => String(text || "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase("es").trim();

export function mountManualStudentSearch({ input, hidden, list, summary, getStudents, onChange }) {
  let matches = [], active = -1;
  function close() {
    list.replaceChildren();
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    active = -1;
  }
  function notifyChange(student) {
    onChange?.(student);
    hidden.dispatchEvent(new Event("change", { bubbles: true }));
  }
  function clearSelection() {
    const wasSelected = !!hidden.value;
    hidden.value = "";
    summary.textContent = "";
    if (wasSelected) notifyChange(null);
  }
  function choose(student) {
    hidden.value = student.codigo;
    input.value = `${student.apellido} ${student.nombre} · ${student.codigo}`;
    summary.textContent = `Seleccionado: ${student.apellido} ${student.nombre} (${student.codigo})`;
    close();
    notifyChange(student);
  }
  function render() {
    close();
    const query = normalize(input.value);
    const tokens = query.split(/\s+/).filter(Boolean);
    matches = (getStudents() || [])
      .filter((student) => tokens.every((token) =>
        normalize(`${student.apellido} ${student.nombre} ${student.codigo} ${student.ciclo}`).includes(token)))
      .sort((a, b) => {
        const aCode = normalize(a.codigo).startsWith(query) ? 0 : 1;
        const bCode = normalize(b.codigo).startsWith(query) ? 0 : 1;
        return aCode - bCode || String(a.apellido).localeCompare(String(b.apellido), "es")
          || String(a.nombre).localeCompare(String(b.nombre), "es");
      }).slice(0, 12);
    if (!matches.length) {
      const notice = document.createElement("div");
      notice.className = "student-autocomplete-item manual-student-empty";
      notice.textContent = "No hay estudiantes que coincidan con la búsqueda en este simulacro.";
      list.append(notice);
    } else {
      matches.forEach((student, index) => {
        const option = document.createElement("button");
        option.type = "button";
        option.className = "student-autocomplete-item";
        option.id = `manual-student-option-${index}`;
        option.dataset.code = student.codigo;
        option.setAttribute("role", "option");
        option.setAttribute("aria-selected", "false");
        option.tabIndex = -1;
        option.textContent = `${student.apellido} ${student.nombre} · ${student.codigo} · ${student.ciclo}`;
        option.addEventListener("pointerdown", (event) => event.preventDefault());
        option.addEventListener("click", () => choose(student));
        list.append(option);
      });
    }
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
  }
  function setActive(index) {
    const options = [...list.querySelectorAll('[role="option"]')];
    if (!options.length) return;
    active = (index + options.length) % options.length;
    options.forEach((el, i) => {
      el.classList.toggle("active", i === active);
      el.setAttribute("aria-selected", String(i === active));
    });
    input.setAttribute("aria-activedescendant", options[active].id);
    options[active].scrollIntoView({ block: "nearest" });
  }
  input.addEventListener("focus", () => render());
  input.addEventListener("input", () => {
    clearSelection();
    render();
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") return close();
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (list.hidden) render();
      setActive(active + (event.key === "ArrowDown" ? 1 : -1));
    } else if (event.key === "Enter" && !list.hidden && matches.length) {
      event.preventDefault();
      choose(matches[active < 0 ? 0 : active]);
    }
  });
  document.addEventListener("pointerdown", (event) => {
    if (!input.contains(event.target) && !list.contains(event.target)) close();
  });
  return {
    reset() {
      input.value = "";
      clearSelection();
      close();
    },
    isSelected() {
      return !!hidden.value && (getStudents() || []).some((student) => student.codigo === hidden.value);
    },
  };
}
