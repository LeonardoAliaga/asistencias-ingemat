import {
  mountSearchSuggestions,
  normalizeSearchText,
} from "../search-suggestions.js";

export function mountManualStudentSearch({
  input,
  hidden,
  list,
  summary,
  getStudents,
  onChange,
  showOnEmpty = true,
  emptyMessage = "No hay estudiantes que coincidan con la búsqueda en este simulacro.",
}) {
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

  const search = mountSearchSuggestions({
    input,
    list,
    showOnEmpty,
    selectFirstOnEnter: true,
    onEdit: clearSelection,
    onEmpty(empty) {
      if (!hidden.value) summary.textContent = empty ? emptyMessage : "";
    },
    suggestions(query) {
      const tokens = query.split(/\s+/).filter(Boolean);
      return (getStudents() || [])
        .filter(({ apellido, nombre, codigo, ciclo }) => {
          const terms = normalizeSearchText(
            `${apellido} ${nombre} ${codigo} ${ciclo}`,
          );
          return tokens.every((token) => terms.includes(token));
        })
        .sort((a, b) => {
          const aCode = normalizeSearchText(a.codigo).startsWith(query) ? 0 : 1;
          const bCode = normalizeSearchText(b.codigo).startsWith(query) ? 0 : 1;
          return (
            aCode - bCode ||
            String(a.apellido).localeCompare(String(b.apellido), "es") ||
            String(a.nombre).localeCompare(String(b.nombre), "es")
          );
        })
        .slice(0, 12)
        .map((student) => ({
          value: student,
          code: student.codigo,
          label: `${student.apellido} ${student.nombre}`,
          detail: [student.codigo, student.ciclo].filter(Boolean).join(" · "),
        }));
    },
    onSelect(student) {
      const name = `${student.apellido} ${student.nombre}`;
      hidden.value = student.codigo;
      input.value = `${name} · ${student.codigo}`;
      summary.textContent = `Seleccionado: ${name} (${student.codigo})`;
      notifyChange(student);
    },
  });

  return {
    ...search,
    reset() {
      input.value = "";
      clearSelection();
      search.close();
    },
    isSelected() {
      return (
        !!hidden.value &&
        (getStudents() || []).some((student) => student.codigo === hidden.value)
      );
    },
  };
}
