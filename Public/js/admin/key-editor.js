// Visual adapter over the same serialized keys used by draft saving and revisions.
// The textarea remains the source of truth, including when a bulk paste is invalid.
export function mountKeyEditor(textarea, { getDefinition, parse, escape }) {
  const root = document.createElement("div");
  root.className = "key-editor";
  root.setAttribute("role", "group");
  root.setAttribute("aria-label", "Editor visual de claves");
  textarea.closest("details").before(root);
  let active = 1,
    course = "0",
    multiple = false,
    automatic = true,
    writing = false;
  const letters = ["A", "B", "C", "D", "E"];
  let model, values;
  function read() {
    model = getDefinition();
    values = {};
    for (const [number, value] of Object.entries(parse(textarea.value))) {
      const q = Number(number),
        answer = String(value).trim().toUpperCase();
      if (
        !Number.isInteger(q) ||
        q < 1 ||
        q > model.totalQuestions ||
        (answer && !/^[ABCDE](?:\/[ABCDE])*$/.test(answer))
      )
        throw new Error(
          "Revisa el texto pegado: usa alternativas A a E y números dentro del cuadernillo. No se reemplazó ninguna clave.",
        );
      if (answer) values[q] = [...new Set(answer.split("/"))].sort().join("/");
    }
  }
  function navigate(q) {
    active = Math.max(1, Math.min(model.totalQuestions, q));
    if (course !== "all")
      course = String(
        model.sections.findIndex((s) => s.questions.includes(active)),
      );
  }
  function write(answer) {
    if (answer) values[active] = answer;
    else delete values[active];
    textarea.value = Object.entries(values)
      .map(([q, a]) => `${q},${a}`)
      .join("\n");
    writing = true;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    writing = false;
  }
  function choose(letter) {
    try {
      read();
    } catch {
      return;
    }
    if (multiple) {
      const selected = new Set(
        (values[active] || "").split("/").filter(Boolean),
      );
      if (selected.has(letter)) selected.delete(letter);
      else selected.add(letter);
      write([...selected].sort().join("/"));
    } else {
      write(letter);
      if (automatic) navigate(active + 1);
    }
    render(`[data-answer="${letter}"]`);
  }
  function render(focus) {
    try {
      read();
    } catch (error) {
      root.innerHTML = `<p class="field-error" role="status">${escape(error.message)}</p><p class="v2-help">Abre «Pegar una lista de claves» para corregir el texto. El editor visual volverá a aparecer cuando sea válido.</p>`;
      return;
    }
    active = Math.max(1, Math.min(model.totalQuestions, active));
    if (
      course !== "all" &&
      !model.sections[Number(course)]?.questions.includes(active)
    )
      course = String(
        model.sections.findIndex((s) => s.questions.includes(active)),
      );
    const currentCourse = model.sections.find((s) =>
      s.questions.includes(active),
    );
    const questions =
      course === "all"
        ? Array.from({ length: model.totalQuestions }, (_, i) => i + 1)
        : model.sections[Number(course)]?.questions || [];
    const page = Math.max(0, Math.floor(questions.indexOf(active) / 20));
    const visible = questions.slice(page * 20, page * 20 + 20);
    const selected = (values[active] || "").split("/");
    const count = Object.keys(values).length;
    root.innerHTML = `
      <div class="key-editor-toolbar"><label>Curso<select data-key-course><option value="all" ${course === "all" ? "selected" : ""}>Todo el cuadernillo · ${count}/${model.totalQuestions}</option>${model.sections.map((s, i) => `<option value="${i}" ${course === String(i) ? "selected" : ""}>${escape(s.name)} · ${s.questions.filter((q) => values[q]).length}/${s.questions.length}</option>`).join("")}</select></label><button type="button" data-key-pending ${count === model.totalQuestions ? "disabled" : ""}>Ir a una pendiente</button></div>
      <div class="key-question-heading"><div><p class="v2-eyebrow">${escape(currentCourse?.name || "Cuadernillo")}</p><h4>Pregunta ${active} de ${model.totalQuestions}</h4></div><span class="key-current-answer">${selected[0] ? `Clave: ${escape(values[active])}` : "Sin clave"}</span></div>
      <p class="v2-help">Elige la respuesta correcta. También puedes usar las teclas A–E mientras estás en este editor.</p>
      <div class="key-alternatives" role="group" aria-label="Alternativas de la pregunta ${active}">${letters.map((l) => `<button type="button" data-answer="${l}" aria-label="${l}, pregunta ${active}" aria-pressed="${selected.includes(l)}">${l}</button>`).join("")}</div>
      <div class="key-editor-settings"><label class="v2-checkbox"><input type="checkbox" data-key-auto ${automatic ? "checked" : ""} ${multiple ? "disabled" : ""}>Avanzar al elegir</label><label class="v2-checkbox"><input type="checkbox" data-key-multiple ${multiple ? "checked" : ""}>Aceptar varias alternativas</label><button type="button" class="v2-link" data-key-clear ${values[active] ? "" : "disabled"}>Quitar esta clave</button></div>
      ${multiple ? '<p class="v2-help">Marca todas las respuestas aceptadas. El avance automático está pausado; pulsa Siguiente al terminar esta pregunta.</p>' : ""}
      <div class="key-navigation"><button type="button" data-key-prev ${active === 1 ? "disabled" : ""}>Anterior</button><p class="v2-help" role="status" aria-live="polite">${count} de ${model.totalQuestions} con alternativa</p><button type="button" data-key-next ${active === model.totalQuestions ? "disabled" : ""}>Siguiente</button></div>
      <div class="key-question-grid" role="group" aria-label="Preguntas del curso">${visible.map((q) => `<button type="button" data-key-question="${q}" class="${values[q] ? "has-answer" : ""}" ${q === active ? 'aria-current="true"' : ""} aria-label="Pregunta ${q}: ${escape(values[q] || "pendiente")}"><span>${q}</span><small>${escape(values[q] || "—")}</small></button>`).join("")}</div>
      ${questions.length > 20 ? `<div class="key-navigation"><button type="button" data-key-page="${page - 1}" ${page === 0 ? "disabled" : ""}>20 anteriores</button><span class="v2-help">${page * 20 + 1}–${Math.min((page + 1) * 20, questions.length)} de ${questions.length}</span><button type="button" data-key-page="${page + 1}" ${(page + 1) * 20 >= questions.length ? "disabled" : ""}>20 siguientes</button></div>` : ""}
      <p class="v2-help">Los números muestran tu avance: verde tiene clave; el borde azul indica la pregunta actual. Puedes volver a cualquier pregunta para corregirla.</p>`;
    root.querySelector("[data-key-course]").onchange = (event) => {
      course = event.target.value;
      active =
        course === "all" ? active : model.sections[Number(course)].questions[0];
      render("[data-key-course]");
    };
    root
      .querySelectorAll("[data-answer]")
      .forEach((b) => (b.onclick = () => choose(b.dataset.answer)));
    root.querySelectorAll("[data-key-question]").forEach(
      (b) =>
        (b.onclick = () => {
          active = Number(b.dataset.keyQuestion);
          render(`[data-key-question="${active}"]`);
        }),
    );
    root.querySelectorAll("[data-key-page]").forEach(
      (b) =>
        (b.onclick = () => {
          active = questions[Number(b.dataset.keyPage) * 20];
          render(`[data-key-question="${active}"]`);
        }),
    );
    root.querySelector("[data-key-auto]").onchange = (event) => {
      automatic = event.target.checked;
    };
    root.querySelector("[data-key-multiple]").onchange = (event) => {
      multiple = event.target.checked;
      render("[data-key-multiple]");
    };
    root.querySelector("[data-key-clear]").onclick = () => {
      write("");
      render(`[data-key-question="${active}"]`);
    };
    root.querySelector("[data-key-prev]").onclick = () => {
      navigate(active - 1);
      render("[data-key-prev]");
    };
    root.querySelector("[data-key-next]").onclick = () => {
      navigate(active + 1);
      render("[data-key-next]");
    };
    root.querySelector("[data-key-pending]").onclick = () => {
      const pending = Array.from(
        { length: model.totalQuestions },
        (_, i) => ((active + i) % model.totalQuestions) + 1,
      ).find((q) => !values[q]);
      if (pending) navigate(pending);
      render("[data-key-pending]");
    };
    if (focus) {
      const target = root.querySelector(focus);
      (target && !target.disabled
        ? target
        : root.querySelector(`[data-key-question="${active}"]`)
      )?.focus({ preventScroll: true });
    }
  }
  root.addEventListener("keydown", (event) => {
    if (
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.repeat ||
      event.target.matches("input, select, textarea")
    )
      return;
    const letter = event.key.toUpperCase();
    if (letters.includes(letter)) {
      event.preventDefault();
      choose(letter);
    } else if (["ArrowLeft", "ArrowRight"].includes(event.key)) {
      event.preventDefault();
      navigate(active + (event.key === "ArrowLeft" ? -1 : 1));
      render(`[data-key-question="${active}"]`);
    }
  });
  textarea.addEventListener("input", () => {
    if (!writing) render();
  });
  return {
    refresh: () => render(),
    reset: () => {
      active = 1;
      course = "0";
      multiple = false;
      automatic = true;
      render();
    },
  };
}
