import { mountScanner } from "./scanner.js";
import { mountKeyEditor } from "./key-editor.js";
const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const state = {
  exams: [],
  students: [],
  templates: [],
  guides: [],
  selected: null,
  editor: null,
  batch: null,
  tab: "exams",
  role: "",
  timezone: "America/Lima",
  areas: [],
  sections: [],
  poll: null,
};
const today = () => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: state.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts()
      .map((p) => [p.type, p.value]),
  );
  return `${p.year}-${p.month}-${p.day}`;
};
const stamp = (value) =>
  new Intl.DateTimeFormat("es-PE", {
    timeZone: state.timezone,
    dateStyle: "short",
    timeStyle: "short",
  }).format(
    new Date(
      String(value).includes("T")
        ? value
        : String(value).replace(" ", "T") + "Z",
    ),
  );
const json = (body, method = "POST") => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
async function api(url, options) {
  const response = await fetch(url, options);
  let value;
  try {
    value = await response.json();
  } catch {
    throw new Error("El servidor no devolvió una respuesta válida.");
  }
  if (!response.ok) {
    const error = new Error(
      value.mensaje || `No se pudo completar (${response.status}).`,
    );
    error.status = response.status;
    throw error;
  }
  return value;
}
function message(text, error = false) {
  const el = $("v2-message");
  el.hidden = false;
  el.classList.toggle("error", error);
  el.textContent = text;
  el.scrollIntoView({ block: "nearest", behavior: "smooth" });
}
function bind(id, event, fn) {
  $(id)?.addEventListener(event, async (e) => {
    if (event === "submit") e.preventDefault();
    const button =
      event === "submit"
        ? e.submitter || e.target.querySelector("button[type=submit]")
        : e.currentTarget;
    try {
      if (button?.tagName === "BUTTON") button.disabled = true;
      await fn(e);
    } catch (error) {
      message(error.message, true);
    } finally {
      if (button?.tagName === "BUTTON") button.disabled = false;
      if (id === "v2-exam-editor") updateWizardFeedback();
    }
  });
}
function table(headers, rows) {
  if (!rows.length)
    return '<div class="v2-empty">Todavía no hay registros para esta selección.</div>';
  return `<div class="v2-table-scroll" tabindex="0" role="region" aria-label="Tabla de registros"><table class="v2-table"><thead><tr>${headers.map((h) => `<th scope="col">${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((cells) => `<tr>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
const statuses = {
  borrador: "Borrador",
  listo: "Listo",
  publicado: "Publicado",
  legacy: "Histórico",
  queued: "En cola",
  processing: "Procesando",
  review: "Revisar",
  ready: "Listo",
  committed: "Importado",
  failed: "Fallido",
  pending: "Pendiente",
  retry: "Reintento",
  sending: "Enviando",
  accepted: "Aceptado por Meta",
  sent: "Enviado",
  delivered: "Entregado",
  read: "Leído",
  unknown: "Por comprobar",
  cancelled: "Cancelado",
};
function badge(value) {
  return `<span class="v2-badge ${["listo", "publicado", "ready", "committed", "delivered", "read"].includes(value) ? "good" : ["review", "retry", "unknown", "queued"].includes(value) ? "warn" : ["failed"].includes(value) ? "bad" : ""}">${esc(statuses[value] || value)}</span>`;
}
function showDialog(title, html) {
  $("v2-dialog-title").textContent = title;
  $("v2-dialog-body").innerHTML = html;
  $("v2-dialog").showModal();
}
function expose() {
  window.ingematAdmin?.activateV2(state.tab);
}
async function tab(name) {
  if (state.tab !== name) $("v2-message").hidden = true;
  state.tab = name;
  expose();
  for (const el of document.querySelectorAll("[data-v2-panel]"))
    el.hidden = el.dataset.v2Panel !== name;
  for (const b of document.querySelectorAll("[data-v2-tab]"))
    b.setAttribute("aria-selected", String(b.dataset.v2Tab === name));

  if (name === "imports") {
    await loadBatches();
    await state.scanner?.refresh();
  }
  if (name === "attendance") await loadAttendance();
  if (name === "contacts") {
    await loadStudents();
    renderContacts();
  }
  if (name === "notifications") await loadNotifications();
  if (name === "settings") await loadSettings();
  if (name === "guide") renderGuides();
}
async function loadCycles() {
  const oldExamCycle = $("v2-exam-editor").elements.ciclo.value;
  const oldAttendanceCycle = $("v2-attendance-cycle").value;
  const cycles = await api("/api/ciclos"),
    list = cycles.ciclos || cycles;
  const opts = list
    .map(
      (c) =>
        `<option value="${esc(typeof c === "string" ? c : c.nombre)}">${esc(typeof c === "string" ? c : c.nombre)}</option>`,
    )
    .join("");
  $("v2-exam-editor").elements.ciclo.setCustomValidity(
    list.length ? "" : "Primero registra un ciclo en la sección Ciclos.",
  );
  $("v2-exam-editor").elements.ciclo.innerHTML =
    '<option value="">Selecciona un ciclo</option>' + opts;
  $("v2-attendance-cycle").innerHTML =
    '<option value="">Todos los ciclos</option>' + opts;
  if (
    [...$("v2-exam-editor").elements.ciclo.options].some(
      (o) => o.value === oldExamCycle,
    )
  )
    $("v2-exam-editor").elements.ciclo.value = oldExamCycle;
  if (
    [...$("v2-attendance-cycle").options].some(
      (o) => o.value === oldAttendanceCycle,
    )
  )
    $("v2-attendance-cycle").value = oldAttendanceCycle;
}
async function loadStudents() {
  state.students = await api("/api/v2/students");
}
async function loadExams(selected) {
  const importSelection = $("v2-import-exam").value;
  state.exams = await api("/api/v2/exams");
  const options =
    '<option value="">Selecciona una evaluación</option>' +
    state.exams
      .map(
        (e) =>
          `<option value="${esc(e.id)}">${esc(e.titulo)} · ${esc(e.ciclo)} · ${esc(statuses[e.estado] || e.estado)}</option>`,
      )
      .join("");
  $("v2-exam-select").innerHTML = options;
  $("v2-import-exam").innerHTML =
    '<option value="">Selecciona un examen listo</option>' +
    state.exams
      .filter((e) => e.definition && ["listo", "publicado"].includes(e.estado))
      .map((e) => `<option value="${esc(e.id)}">${esc(e.titulo)}</option>`)
      .join("");
  if ([...$("v2-import-exam").options].some((o) => o.value === importSelection))
    $("v2-import-exam").value = importSelection;
  void state.scanner?.refresh();
  if (selected) {
    $("v2-exam-select").value = selected;
    await selectExam(selected);
  }
  await loadTemplates();
}
async function loadTemplates() {
  const previous = $("v2-preset").value;
  state.templates = await api("/api/v2/templates");
  const saved = state.templates.filter((t) => !t.builtIn);
  $("v2-preset").innerHTML =
    '<optgroup label="Preestablecidas"><option value="repaso-unmsm">Simulacro tipo UNMSM</option><option value="100">Base de 100 preguntas</option><option value="120">Base de 120 preguntas</option><option value="areas">Base por áreas · configurar cursos</option></optgroup>' +
    (saved.length
      ? '<optgroup label="Mis plantillas">' +
        saved
          .map(
            (t) => `<option value="saved:${esc(t.id)}">${esc(t.name)}</option>`,
          )
          .join("") +
        "</optgroup>"
      : "") +
    '<option value="custom">Personalizado · empezar desde cero</option>';
  if ([...$("v2-preset").options].some((o) => o.value === previous))
    $("v2-preset").value = previous;
}

function matchesUNMSM(definition) {
  const template = state.templates.find((t) => t.presetId === "repaso-unmsm");
  if (!template) return false;
  const attitude = definition.sections?.[0]?.scoring;
  if (
    Number(attitude?.wrong ?? definition.scoring?.wrong ?? 1.125) !== 0 ||
    Number(attitude?.blank ?? definition.scoring?.blank ?? 0) !== 0
  )
    return false;
  const outline = (d) => ({
    total: d.totalQuestions,
    areas: d.areas.map((a) => [a.code, a.name, a.requiredQuestions]),
    sections: d.sections.map((c) => ({
      name: c.name,
      questions: Array.isArray(c.questions) ? c.questions : expand(c.questions),
      rules: d.areas.map((a) => {
        const r = c.rules[a.code],
          questions = Array.isArray(r.questions)
            ? r.questions
            : expand(r.questions);
        return [
          a.code,
          questions,
          r.selection || "fixed",
          r.quota ?? questions.length,
        ];
      }),
    })),
  });
  try {
    return (
      JSON.stringify(outline(definition)) ===
      JSON.stringify(outline(template.definition))
    );
  } catch {
    return false;
  }
}
function wizardSteps() {
  return state.fixedPreset ? [0, 2, 3] : [0, 1, 2, 3];
}
function syncWizardMode() {
  const steps = wizardSteps();
  document
    .querySelector(".wizard-steps")
    .classList.toggle("is-fixed", !!state.fixedPreset);
  for (const button of document.querySelectorAll("[data-wizard-step]")) {
    const index = steps.indexOf(Number(button.dataset.wizardStep));
    button.hidden = index < 0;
    if (index >= 0)
      button.querySelector(".wizard-number").textContent = index + 1;
  }
  $("v2-fixed-preset").hidden = !state.fixedPreset;
  $("wizard-scoring-help").textContent = state.fixedPreset
    ? "Valores generales. Las actitudinales mantienen 0 por error o blanco."
    : "Valores generales del simulacro; puedes ajustar cada curso en Cursos y áreas.";
  $("v2-exam-editor").elements.total.readOnly = !!state.fixedPreset;
}
function moveWizard(direction) {
  const steps = wizardSteps(),
    index = steps.indexOf(wizardStep);
  showWizardStep(
    steps[Math.max(0, Math.min(steps.length - 1, index + direction))],
    direction > 0,
  );
}

async function selectExam(id) {
  const summary = state.exams.find((e) => e.id === id);
  state.selected = summary
    ? {
        ...(await api(`/api/v2/exams/${encodeURIComponent(id)}`)),
        participants: summary.participants,
      }
    : null;
  const e = state.selected;
  $("v2-exam-actions").hidden = !e;
  $("v2-exam-workspace").hidden = !e?.definition;
  $("v2-exam-editor").hidden = true;
  $("v2-exam-editor").closest(".v2-panel").classList.remove("is-editing");
  $("v2-manual-answers").value = "";
  $("v2-manual-replace").checked = false;
  $("v2-manual-reason").value = "";
  $("v2-manual-reason").required = false;
  if (!e) {
    $("v2-exam-summary").textContent = "Selecciona un examen o crea uno nuevo.";
    return;
  }
  $("v2-exam-summary").innerHTML =
    `${badge(e.estado)} <strong>${esc(e.titulo)}</strong> · ${esc(e.fecha)} · ${e.definition?.totalQuestions || e.totalPreguntasCuadernillo || e.numPreguntas} preguntas impresas · ${e.participants} evaluados · revisión ${e.revision}${e.estado === "legacy" ? "<p>Sus notas históricas se conservan. Crea un examen v2 para utilizar cursos y lectura por lotes.</p>" : ""}`;
  const canWrite = ["admin", "corrector"].includes(state.role);
  $("v2-edit").hidden = e.estado !== "borrador" || !canWrite;
  $("v2-ready").hidden = e.estado !== "borrador" || !canWrite;
  $("v2-publish").hidden = e.estado !== "listo" || !canWrite;
  $("v2-revise").hidden =
    !["listo", "publicado"].includes(e.estado) || !e.definition || !canWrite;
  $("v2-notify").hidden = e.estado !== "publicado" || state.role !== "admin";
  $("v2-archive").hidden = !canWrite;
  if (!e.definition) return;
  const students = state.students.filter(
    (u) =>
      e.eligibleStudentCodes?.includes(u.codigo) ??
      u.ciclo.toUpperCase() === e.ciclo.toUpperCase(),
  );
  const options = students
    .map(
      (u) =>
        `<option value="${esc(u.codigo)}">${esc(u.apellido)} ${esc(u.nombre)} · ${esc(u.codigo)}</option>`,
    )
    .join("");
  $("v2-sheet-student").innerHTML =
    '<option value="">Todo el ciclo</option>' + options;
  $("v2-manual-student").innerHTML =
    '<option value="">Selecciona un estudiante</option>' + options;
  const areaOptions = e.definition.areas
    .map(
      (a) =>
        `<option value="${esc(a.code)}">${esc(a.code)} · ${esc(a.name)} (${a.requiredQuestions})</option>`,
    )
    .join("");
  $("v2-manual-area").innerHTML = areaOptions;
  $("v2-result-area").innerHTML =
    '<option value="">Todas las áreas</option>' + areaOptions;
  const forms = Object.keys(e.definition.forms)
    .map((f) => `<option value="${esc(f)}">Versión ${esc(f)}</option>`)
    .join("");
  $("v2-sheet-form").innerHTML = forms;
  $("v2-manual-form").innerHTML = forms;
  $("v2-ranking-excel").href =
    `/api/evaluaciones/${encodeURIComponent(e.id)}/excel`;
  $("v2-manual").hidden = !canWrite;
  $("v2-manual-tab").hidden = !canWrite;
  $("v2-scan-open").hidden = !canWrite;
  $("v2-replace-reason").hidden = true;
  $("v2-print").disabled =
    !canWrite || !["listo", "publicado"].includes(e.estado);
  await loadResults();
}
function expand(text) {
  const result = [];
  for (const token of String(text || "")
    .split(/[,;\s]+/)
    .filter(Boolean)) {
    const m = token.match(/^(\d+)(?:-(\d+))?$/);
    if (!m) throw new Error(`Rango inválido: ${token}`);
    const a = Number(m[1]),
      b = Number(m[2] || m[1]);
    if (a < 1 || b < a || b > 200)
      throw new Error(`Rango fuera del cuadernillo: ${token}`);
    for (let q = a; q <= b; q++) result.push(q);
  }
  return result;
}
function compact(numbers) {
  if (!numbers?.length) return "";
  const a = [...numbers],
    out = [];
  let start = a[0],
    prev = a[0];
  for (let i = 1; i <= a.length; i++) {
    if (a[i] === prev + 1) {
      prev = a[i];
      continue;
    }
    out.push(start === prev ? String(start) : `${start}-${prev}`);
    start = prev = a[i];
  }
  return out.join(",");
}
function keyValues(text) {
  const result = {};
  const raw = String(text || "").trim();
  if (!raw) return result;
  if (/^\d+\s*[,;:]/.test(raw)) {
    for (const line of raw.split(/\r?\n/).filter(Boolean)) {
      const m = line.trim().match(/^(\d+)\s*[,;:]\s*(.*)$/);
      if (!m) throw new Error(`Línea inválida: ${line}`);
      if (result[m[1]] !== undefined)
        throw new Error(`La pregunta ${m[1]} está repetida.`);
      result[m[1]] = m[2].trim();
    }
  } else {
    raw.split(/[\s,;]+/).forEach((v, i) => (result[i + 1] = v));
  }
  return result;
}
function answerValues(text) {
  return Object.fromEntries(
    Object.entries(keyValues(text)).map(([n, v]) => {
      const options =
        v === "-"
          ? []
          : v
              .toUpperCase()
              .split(/[\/\s]+/)
              .filter(Boolean);
      return [
        n,
        {
          status:
            options.length > 1
              ? "multiple"
              : options.length
                ? "single"
                : "blank",
          options,
        },
      ];
    }),
  );
}
function questionSet(text, total) {
  const values = expand(text);
  if (values.some((q) => q > total))
    throw new Error(
      "Las excepciones deben indicar preguntas dentro del cuadernillo.",
    );
  return new Set(values);
}
function optionScoreValues(text, total) {
  const scores = {};
  for (const line of text.split(/\r?\n/).filter((l) => l.trim())) {
    const values = line.split(",").map((v) => v.trim()),
      q = Number(values[0]);
    if (
      values.length !== 6 ||
      !Number.isInteger(q) ||
      q < 1 ||
      q > total ||
      scores[q] ||
      values.slice(1).some((v) => !v || !Number.isFinite(Number(v)))
    )
      throw new Error(
        "Los puntajes por alternativa requieren una pregunta válida sin repetir y cinco valores: número,A,B,C,D,E.",
      );
    scores[q] = Object.fromEntries(
      ["A", "B", "C", "D", "E"].map((o, i) => [o, Number(values[i + 1])]),
    );
  }
  return scores;
}
function optionScoreText(keys) {
  return Object.entries(keys)
    .filter(([, k]) => k.optionScores)
    .map(([q, k]) =>
      [q, ...["A", "B", "C", "D", "E"].map((o) => k.optionScores[o])].join(","),
    )
    .join("\n");
}
function collectEditor({ structureOnly = false } = {}) {
  const form = $("v2-exam-editor"),
    total = Number(form.elements.total.value);
  const areas = [...$("v2-areas").querySelectorAll(".v2-area-row")].map(
    (row) => ({
      code: row.querySelector("[data-area-code]").value.trim().toUpperCase(),
      name: row.querySelector("[data-area-name]").value.trim(),
      requiredQuestions: Number(row.querySelector("[data-area-total]").value),
    }),
  );
  const sections = [
    ...$("v2-sections").querySelectorAll(".v2-section-editor"),
  ].map((el, i) => {
    const questions = expand(el.querySelector("[data-course-range]").value),
      rules = {};
    for (const a of areas) {
      const r = [...el.querySelectorAll("[data-rule-area]")].find(
        (x) => x.dataset.ruleArea === a.code,
      );
      if (!r)
        throw new Error(
          "Aplica los cambios de áreas antes de guardar los cursos.",
        );
      const qs =
          areas.length === 1 &&
          r.querySelector("[data-rule-selection]").value === "fixed"
            ? questions
            : expand(r.querySelector("[data-rule-questions]").value),
        selection = r.querySelector("[data-rule-selection]").value;
      rules[a.code] = {
        questions: qs,
        selection,
        quota:
          selection === "fixed"
            ? qs.length
            : Number(r.querySelector("[data-rule-quota]").value),
      };
    }
    return {
      id: `curso-${i + 1}`,
      name: el.querySelector("[data-course-name]").value,
      questions,
      rules,
      scoring: {
        correct: Number(el.querySelector("[data-course-correct]").value),
        wrong: Number(el.querySelector("[data-course-wrong]").value),
        blank: Number(el.querySelector("[data-course-blank]").value),
      },
    };
  });
  const payload = {
    titulo: form.elements.titulo.value,
    ciclo: form.elements.ciclo.value,
    fecha: form.elements.fecha.value,
    definition: {
      totalQuestions: total,
      areas,
      sections,
      keys: {},
      scoring: {
        correct: Number(form.elements.correct.value),
        wrong: Number(form.elements.wrong.value),
        blank: Number(form.elements.blank.value),
      },
      forms: {},
    },
  };
  if (structureOnly) return payload;
  const values = keyValues($("v2-keys").value),
    noPenalty = questionSet($("v2-no-penalty").value, total),
    annulled = questionSet($("v2-void").value, total);
  const keys = {};
  for (let q = 1; q <= total; q++)
    keys[q] = {
      answers: (values[q] || "").toUpperCase().split("/").filter(Boolean),
      noPenalty: noPenalty.has(q),
      voidPolicy: annulled.has(q) ? $("v2-void-policy").value : null,
    };
  for (const [q, scores] of Object.entries(
    optionScoreValues($("v2-option-scores").value, total),
  ))
    keys[q].optionScores = scores;
  const forms = {};
  for (const line of $("v2-forms")
    .value.split(/\r?\n/)
    .filter((l) => l.trim())) {
    const index = line.indexOf(":");
    if (index < 1)
      throw new Error("Las versiones deben tener el formato A:1-100.");
    forms[line.slice(0, index).trim().toUpperCase()] = expand(
      line.slice(index + 1),
    );
  }
  payload.definition.keys = keys;
  payload.definition.forms = forms;
  return payload;
}
function captureAreas() {
  state.areas = [...$("v2-areas").querySelectorAll(".v2-area-row")].map(
    (row) => ({
      code: row.querySelector("[data-area-code]").value.trim().toUpperCase(),
      name: row.querySelector("[data-area-name]").value,
      requiredQuestions: Number(row.querySelector("[data-area-total]").value),
    }),
  );
}
function captureSections() {
  const elements = [...$("v2-sections").querySelectorAll(".v2-section-editor")];
  if (!elements.length) return;
  // Keep incomplete ranges as text when adding/removing another course.
  const safeRange = (value) => {
    try {
      return expand(value);
    } catch {
      return [];
    }
  };
  state.sections = elements.map((el) => {
    const text = el.querySelector("[data-course-range]").value;
    return {
      name: el.querySelector("[data-course-name]").value,
      questions: safeRange(text),
      _range: text,
      scoring: Object.fromEntries(
        ["correct", "wrong", "blank"].map((key) => [
          key,
          Number(el.querySelector(`[data-course-${key}]`).value),
        ]),
      ),
      rules: Object.fromEntries(
        [...el.querySelectorAll("[data-rule-area]")].map((row) => {
          const selection = row.querySelector("[data-rule-selection]").value;
          const range =
            state.areas.length === 1 && selection === "fixed"
              ? text
              : row.querySelector("[data-rule-questions]").value;
          const questions = safeRange(range);
          return [
            row.dataset.ruleArea,
            {
              questions,
              _range: range,
              selection,
              quota:
                selection === "fixed"
                  ? questions.length
                  : Number(row.querySelector("[data-rule-quota]").value),
            },
          ];
        }),
      ),
    };
  });
}

function renderAreas() {
  $("wizard-areas").querySelector("summary").textContent =
    `Áreas y cantidad evaluable · ${state.areas.length} perfil${state.areas.length === 1 ? "" : "es"}`;
  const area = $("v2-areas");
  area.innerHTML =
    state.areas
      .map(
        (a, i) =>
          `<div class="v2-area-row"><label>Código<input data-area-code value="${esc(a.code)}" maxlength="20" required></label><label>Nombre del perfil<input data-area-name value="${esc(a.name)}" maxlength="100" required></label><label>Preguntas evaluables<input data-area-total type="number" min="1" max="200" value="${a.requiredQuestions}" required></label><button type="button" class="v2-link" data-remove-area="${i}" ${state.areas.length === 1 ? "disabled" : ""}>Quitar</button></div>`,
      )
      .join("") +
    '<button type="button" class="v2-button secondary" id="v2-apply-areas">Aplicar perfiles a los cursos</button>';
  area.querySelectorAll("[data-remove-area]").forEach(
    (b) =>
      (b.onclick = () => {
        captureSections();
        captureAreas();
        state.areas.splice(Number(b.dataset.removeArea), 1);
        state.definitionDirty = true;
        renderAreas();
        renderSections();
      }),
  );
  $("v2-apply-areas").onclick = () => {
    state.definitionDirty = true;
    try {
      captureSections();
      captureAreas();
      if (
        state.areas.some((a) => !a.code) ||
        new Set(state.areas.map((a) => a.code)).size !== state.areas.length
      )
        throw new Error("Usa códigos de área únicos.");
      renderSections();
      message("Perfiles aplicados. Revisa los números y cupos de cada curso.");
    } catch (e) {
      message(e.message, true);
    }
  };
}
function renderSections() {
  const form = $("v2-exam-editor"),
    total = Number(form.elements.total.value);
  $("v2-sections").innerHTML = state.sections
    .map((course, i) => {
      const rules = state.areas
        .map((a) => {
          const rule = course.rules?.[a.code] || {
            questions: state.areas.length === 1 ? course.questions : [],
            selection: "fixed",
            quota: 0,
          };
          return `<div class="v2-form-grid v2-rule" data-rule-area="${esc(a.code)}" ${state.areas.length > 1 && a !== state.areas[0] ? "hidden" : ""}><label>Área ${esc(a.code)} · preguntas<input data-rule-questions value="${esc(rule._range ?? compact(rule.questions))}" placeholder="Ej.: 1-10,15"></label><label>Modo<select data-rule-selection><option value="fixed" ${rule.selection === "fixed" ? "selected" : ""}>Preguntas fijas</option><option value="choose" ${rule.selection === "choose" ? "selected" : ""}>Elegir un cupo</option></select></label><label>Cupo<input data-rule-quota type="number" min="0" max="${total}" value="${rule.quota ?? rule.questions?.length ?? 0}"></label></div>`;
        })
        .join("");
      return `<details class="v2-section-editor" ${state.sections.length === 1 || state.expandedCourse === i ? "open" : ""}><summary><span class="course-number">${i + 1}</span><span class="course-caption"><strong>${esc(course.name || "Nuevo curso")}</strong><small>${esc(compact(course.questions)) || "Completa la distribución"}</small></span><i class="bi bi-chevron-down" aria-hidden="true"></i></summary><div class="course-fields"><div class="v2-form-grid"><label>Nombre del curso<input data-course-name value="${esc(course.name)}" maxlength="100" required placeholder="Ej.: Aritmética"></label><label>Preguntas del curso<input data-course-range value="${esc(course._range ?? compact(course.questions))}" required placeholder="Ej.: 1-20"></label></div>${state.areas.length === 1 ? `<details><summary>Selección de preguntas para este perfil</summary>${rules}<p class="v2-help">En preguntas fijas se utiliza el rango del curso. Elige un cupo si el alumno debe responder solo una parte.</p></details>` : `<div class="stack"><label>Configurar área de postulación<select data-course-area>${state.areas.map((a) => `<option value="${esc(a.code)}">${esc(a.code)} · ${esc(a.name)}</option>`).join("")}</select></label><p class="v2-help">Configura un perfil a la vez. El resumen comprueba las cantidades de todas las áreas.</p>${rules}</div>`}<details><summary>Puntajes especiales para este curso</summary><div class="course-scoring">${["correct", "wrong", "blank"].map((key, j) => `<label>${["Correcta", "Penalización", "Blanco"][j]}<input data-course-${key} type="number" step=".001" ${key === "wrong" ? 'min="0"' : ""} value="${course.scoring?.[key] ?? Number(form.elements[key].value)}"></label>`).join("")}</div></details><button type="button" class="v2-link" data-remove-section="${i}">Quitar este curso</button></div></details>`;
    })
    .join("");
  for (const picker of $("v2-sections").querySelectorAll("[data-course-area]"))
    picker.onchange = () => {
      for (const rule of picker
        .closest(".v2-section-editor")
        .querySelectorAll("[data-rule-area]"))
        rule.hidden = rule.dataset.ruleArea !== picker.value;
    };
  for (const row of $("v2-sections").querySelectorAll("[data-rule-area]")) {
    const select = row.querySelector("[data-rule-selection]"),
      quota = row.querySelector("[data-rule-quota]");
    const updateRule = () => {
      row.classList.toggle("is-fixed", select.value === "fixed");
      quota.disabled = select.value === "fixed";
      quota.closest("label").hidden = select.value === "fixed";
      row.querySelector("[data-rule-questions]").closest("label").hidden =
        state.areas.length === 1 && select.value === "fixed";
    };
    updateRule();
    select.onchange = () => {
      updateRule();
      updateWizardFeedback();
    };
  }
  for (const button of $("v2-sections").querySelectorAll(
    "[data-remove-section]",
  ))
    button.onclick = () => {
      captureSections();
      state.sections.splice(Number(button.dataset.removeSection), 1);
      state.definitionDirty = true;
      renderSections();
    };
  if ($("v2-wizard-review")) updateWizardFeedback();
}
function setEditor(def, id = null) {
  state.editor = id;
  state.definitionDirty = false;
  $("v2-template-feedback").textContent = "";
  $("v2-preset-source").hidden = true;
  const f = $("v2-exam-editor");
  f.hidden = false;
  f.closest(".v2-panel").classList.add("is-editing");
  f.elements.total.value = def.totalQuestions;
  f.elements.correct.value = def.scoring?.correct ?? 20;
  f.elements.wrong.value = def.scoring?.wrong ?? 1.125;
  f.elements.blank.value = def.scoring?.blank ?? 0;
  state.defaultScoring = Object.fromEntries(
    ["correct", "wrong", "blank"].map((key) => [
      key,
      Number(f.elements[key].value),
    ]),
  );
  state.areas = structuredClone(def.areas);
  state.sections = structuredClone(def.sections);
  renderAreas();
  renderSections();
  $("v2-keys").value = Object.entries(def.keys || {})
    .filter(([, k]) => (typeof k === "string" ? k : k.answers?.length))
    .map(([n, k]) => `${n},${typeof k === "string" ? k : k.answers.join("/")}`)
    .join("\n");
  $("v2-no-penalty").value = compact(
    Object.keys(def.keys || {})
      .filter((q) => def.keys[q].noPenalty)
      .map(Number),
  );
  $("v2-void").value = compact(
    Object.keys(def.keys || {})
      .filter((q) => def.keys[q].voidPolicy)
      .map(Number),
  );
  $("v2-void-policy").value =
    Object.values(def.keys || {}).find((k) => k.voidPolicy)?.voidPolicy ||
    "credit";
  $("v2-option-scores").value = Object.entries(def.keys || {})
    .filter(([, k]) => k.optionScores)
    .map(([n, k]) =>
      [n, ...["A", "B", "C", "D", "E"].map((o) => k.optionScores[o])].join(","),
    )
    .join("\n");
  $("wizard-areas").open = false;
  $("v2-forms").value = Object.entries(def.forms || {})
    .map(([n, m]) => `${n}:${compact(m)}`)
    .join("\n");
  state.expandedCourse = null;
  state.lastTotal = def.totalQuestions;
  state.currentPreset =
    def.areas.length > 1
      ? "areas"
      : def.sections.length > 1
        ? "custom"
        : [100, 120].includes(def.totalQuestions)
          ? String(def.totalQuestions)
          : "custom";
  state.fixedPreset = matchesUNMSM(def);
  if (state.fixedPreset) state.currentPreset = "repaso-unmsm";
  $("v2-preset").value = state.currentPreset;
  $("v2-preset-source").hidden = !state.fixedPreset;
  syncWizardMode();
  $("v2-format-confirm").hidden = true;
  state.keyEditor?.reset();
  showWizardStep(0, false);
}
function preset(value) {
  const editorId = state.editor;
  const selectedTemplate = state.templates.find((t) =>
    t.builtIn ? t.presetId === value : `saved:${t.id}` === value,
  );
  if (selectedTemplate) {
    setEditor(selectedTemplate.definition, editorId);
    state.currentPreset = value;
    $("v2-preset").value = value;
    $("v2-preset-source").hidden = !state.fixedPreset;
    return;
  }
  if (value === "repaso-unmsm") {
    message(
      "No se pudo cargar la plantilla. Recarga la página para intentarlo de nuevo.",
      true,
    );
    return;
  }
  const total =
      value === "custom"
        ? ""
        : value === "areas"
          ? 120
          : value === "120"
            ? 120
            : 100,
    areas =
      value === "areas"
        ? ["A", "B", "C", "D", "E"].map((code) => ({
            code,
            name: `Área ${code}`,
            requiredQuestions: 100,
          }))
        : [
            {
              code: "GENERAL",
              name: "General",
              requiredQuestions: Number(total),
            },
          ];
  setEditor(
    {
      totalQuestions: total,
      areas,
      sections:
        value === "custom"
          ? []
          : [
              {
                name: "General",
                questions: Array.from({ length: total }, (_, i) => i + 1),
                rules: Object.fromEntries(
                  areas.map((a) => [
                    a.code,
                    {
                      questions:
                        value === "areas"
                          ? []
                          : Array.from({ length: total }, (_, i) => i + 1),
                      selection: "fixed",
                      quota: value === "areas" ? 0 : total,
                    },
                  ]),
                ),
              },
            ],
      scoring: { correct: 20, wrong: 1.125, blank: 0 },
      keys: {},
      forms: {},
    },
    editorId,
  );
  $("v2-preset").value = value;
  state.currentPreset = value;
  if (value === "areas")
    message(
      "Define los cursos y las preguntas de cada área. No hay una distribución oficial precargada.",
    );
}
async function loadResults() {
  const e = state.selected;
  if (!e?.definition) return;
  const data = await api(`/api/v2/exams/${e.id}/results`),
    area = $("v2-result-area").value,
    rows = data.rows.filter((r) => !area || r.area === area);
  let last,
    rank = 0;
  $("v2-results").innerHTML = table(
    [
      "Puesto",
      "Estudiante",
      "Área",
      "Correctas / errores / blancos",
      "Puntaje",
      "Detalle",
    ],
    rows.map((r, i) => {
      if (r.puntajeTotal !== last) rank = i + 1;
      last = r.puntajeTotal;
      return [
        String(area ? rank : r.posicion),
        `<strong>${esc(r.nombreEstudiante)}</strong><br>${esc(r.codigoEstudiante)}`,
        esc(r.area),
        `${r.correctas} / ${r.incorrectas} / ${r.enBlanco}${r.detail.anuladas ? ` · ${r.detail.anuladas} anuladas` : ""}`,
        `<strong>${r.puntajeTotal}</strong>`,
        `<button class="v2-link" data-result="${esc(r.codigoEstudiante)}">Cursos e historial</button>`,
      ];
    }),
  );
  $("v2-results")
    .querySelectorAll("[data-result]")
    .forEach(
      (b) =>
        (b.onclick = async () => {
          try {
            const row = data.rows.find(
                (r) => r.codigoEstudiante === b.dataset.result,
              ),
              history = await api(
                `/api/v2/exams/${e.id}/history/${encodeURIComponent(row.codigoEstudiante)}`,
              );
            showDialog(
              `Resultado · ${row.nombreEstudiante}`,
              `${table(
                ["Curso", "Correctas", "Errores", "Blancos", "Puntaje"],
                (row.detail.courses || []).map((c) => [
                  esc(c.name),
                  String(c.correctas),
                  String(c.incorrectas),
                  String(c.enBlanco),
                  String(c.puntaje),
                ]),
              )}<p>Revisión ${row.revision} · motor ${esc(row.detail.engineVersion || "anterior")} · origen ${esc(row.detail.source || "histórico")}</p><h4>Correcciones previas</h4>${table(
                ["Fecha", "Operador", "Motivo"],
                history.map((h) => [
                  esc(stamp(h.created_at)),
                  esc(h.actor),
                  esc(h.reason),
                ]),
              )}`,
            );
          } catch (err) {
            message(err.message, true);
          }
        }),
    );
  $("v2-ranking-excel").href =
    `/api/evaluaciones/${e.id}/excel${area ? "?area=" + encodeURIComponent(area) : ""}`;
}
async function loadBatches() {
  const batches = await api("/api/v2/imports");
  const signature = JSON.stringify([
    batches,
    state.exams.map((e) => [e.id, e.titulo]),
  ]);
  if (state.batchHistorySignature === signature) {
    if (state.batch) await openBatch(state.batch.id);
    return;
  }
  state.batchHistorySignature = signature;
  const previous = $("v2-batch-select")?.value || state.batch?.id;
  const selected = batches.some((b) => b.id === previous)
    ? previous
    : batches[0]?.id;
  $("v2-batches").innerHTML = batches.length
    ? `<div class="v2-toolbar batch-history-picker"><label>Lote guardado (${batches.length})<select id="v2-batch-select">${batches.map((b) => `<option value="${esc(b.id)}" ${b.id === selected ? "selected" : ""}>${esc(stamp(b.created_at))} · ${esc(state.exams.find((e) => e.id === b.evaluation_id)?.titulo || b.evaluation_id)} · ${esc(statuses[b.status] || b.status)}</option>`).join("")}</select></label><button class="v2-button secondary" id="v2-open-batch" data-batch="${esc(selected)}" type="button">Abrir lote</button></div>`
    : '<p class="v2-help">No hay lotes recientes en tu lista.</p>';
  $("v2-clear-batches").disabled = !batches.some((b) =>
    ["committed", "failed"].includes(b.status),
  );
  bind("v2-batch-select", "change", () => {
    $("v2-open-batch").dataset.batch = $("v2-batch-select").value;
  });
  bind("v2-open-batch", "click", () => openBatch($("v2-batch-select").value));
  if (state.batch) await openBatch(state.batch.id);
}
function scannedStudentLabel(page) {
  const student = page.identifiedStudent;
  if (student)
    return `<strong>${esc(student.name)}</strong><br><span>Código: ${esc(student.code)}</span>`;
  const code =
    (page.identificationOverride || page.identification)?.code ||
    page.codigoEstudiante;
  return code
    ? `${esc(code)}<br><small>Identificación pendiente</small>`
    : "Sin identificar";
}
function scannedStudentNotice(page) {
  const student = page.identifiedStudent;
  return student
    ? `<p class="v2-notice"><strong>Estudiante identificado</strong><br>${scannedStudentLabel(page)}</p>`
    : `<p class="v2-notice warning"><strong>Estudiante sin identificar</strong><br>${scannedStudentLabel(page)}. Comprueba el código y el padrón del examen.</p>`;
}
async function openBatch(id) {
  const request = (state.batchRequest = (state.batchRequest || 0) + 1);
  const b = await api(`/api/v2/imports/${id}`);
  if (request !== state.batchRequest) return;
  state.batch = b;
  const el = $("v2-batch-detail");
  const signature = JSON.stringify(b);
  // Polling unchanged data must not erase the operator's reason or selection.
  if (state.batchSignature === signature && !el.hidden) return;
  state.batchSignature = signature;
  el.hidden = false;
  el.innerHTML = `<div class="v2-card-title"><h3>Lote · ${esc(b.source.toUpperCase())}</h3>${badge(b.status)}</div>${b.error ? `<p class="v2-notice warning">${esc(b.error)}</p>` : ""}${["queued", "processing"].includes(b.status) ? "<p>Procesando en segundo plano. Esta vista se actualiza automáticamente.</p>" : ""}${
    b.result.pages
      ? table(
          ["Página", "Estudiante", "Marcas", "Incidencia", "Acción"],
          b.result.pages.map((p, i) => [
            `${i + 1} · ${esc(p.file)}`,
            scannedStudentLabel(p),
            Object.values(p.responses || {}).filter(
              (r) => r.status === "single",
            ).length + " únicas",
            p.excluded
              ? "Excluida"
              : esc(
                  p.error ||
                    p.warning ||
                    Object.values(p.responses || {}).filter((r) =>
                      ["multiple", "uncertain"].includes(r.status),
                    ).length + " marcas para revisar",
                ),
            b.status === "committed"
              ? "Importada"
              : `<button class="v2-link" data-review="${i}">${p.error ? "Excluir" : "Revisar"}</button>`,
          ]),
        )
      : ""
  }<h4>Previsualización de calificaciones</h4>${table(
    ["Estudiante", "Área", "Versión", "Evaluables", "Puntaje"],
    (b.result.rows || []).map((r) => [
      scannedStudentLabel(r),
      esc(r.area),
      esc(r.form),
      String(r.preview.totalEvaluables),
      String(r.preview.puntajeTotal),
    ]),
  )}${["ready", "review"].includes(b.status) ? '<button id="v2-batch-refresh-keys" class="v2-button secondary">Actualizar con las claves vigentes</button>' : ""}${b.status === "ready" ? '<label class="v2-checkbox"><input id="v2-batch-replace" type="checkbox"> Corregir calificaciones que ya existan</label><label>Motivo de la corrección<input id="v2-batch-reason" placeholder="Obligatorio si reemplazas notas"></label><button id="v2-batch-commit" class="v2-button">Confirmar importación del lote</button>' : ""}`;
  el.querySelectorAll("[data-review]").forEach(
    (button) =>
      (button.onclick = () => reviewPage(Number(button.dataset.review))),
  );
  bind("v2-batch-refresh-keys", "click", async () => {
    await api(`/api/v2/imports/${b.id}/refresh`, json({}));
    await openBatch(b.id);
    message("Previsualización recalculada con las claves vigentes.");
  });
  bind("v2-batch-commit", "click", async () => {
    const replace = $("v2-batch-replace").checked,
      reason = $("v2-batch-reason").value;
    if (replace && reason.trim().length < 5)
      throw new Error("Escribe el motivo antes de reemplazar notas.");
    const r = await api(
      `/api/v2/imports/${b.id}/commit`,
      json({
        reviewVersion: b.result.reviewVersion,
        allowReplace: replace,
        reason,
      }),
    );
    message(`${r.results.length} calificaciones importadas.`);
    await loadBatches();
    await loadExams(state.selected?.id);
  });
}
function codeColumnPreview(identification) {
  if (identification?.columns?.length !== 8) return "";
  const labels = {
    single: "Leído",
    blank: "Sin marca",
    uncertain: "Revisar",
    multiple: "Varias marcas",
  };
  return `<p class="v2-help">Lectura original del código, de izquierda a derecha. Comprueba las columnas con ? contra la cartilla.</p><ol class="identity-columns" aria-label="Lectura de las ocho columnas del código">${identification.columns
    .map((column, index) => {
      const single =
        column.status === "single" && /^[0-9]$/.test(column.options?.[0] || "");
      const digit = single ? column.options[0] : "?";
      const label = labels[column.status] || "Revisar";
      return `<li class="${single ? "" : "needs-review"}" aria-label="Columna ${index + 1}: ${esc(single ? digit : label)}"><span>Col. ${index + 1}</span><strong>${esc(digit)}</strong><small>${esc(label)}</small></li>`;
    })
    .join("")}</ol>`;
}
function areaReadingPreview(identification) {
  const reading = identification?.areaReading;
  // Older batches and exams with one fixed profile have no marked-area reading.
  if (!reading) return "";
  const single = reading.status === "single" && reading.options?.length === 1;
  const labels = {
    blank: "Sin marca",
    uncertain: "Revisar marca tenue o incompleta",
    multiple: "Varias marcas",
  };
  const label = single
    ? reading.options[0]
    : labels[reading.status] || "Revisar";
  return `<p class="${single ? "v2-help" : "v2-notice warning"}" data-area-reading>Lectura original del área: ${esc(label)}.${single ? "" : " Coteja la cartilla y selecciona el área correcta."}</p>`;
}
function reviewPage(index) {
  const b = state.batch,
    p = b.result.pages[index];
  const reviewTitle = `Revisar cartilla · ${p.identifiedStudent?.name || p.codigoEstudiante || "sin identificar"}`;
  showDialog(
    reviewTitle,
    `<div class="v2-scan-review"><div>${p.imageUrl ? `<a href="${esc(p.imageUrl)}" target="_blank" rel="noopener"><img src="${esc(p.imageUrl)}" alt="Cartilla escaneada; abrir para ampliar"></a>` : "<p>La página no se pudo identificar. Exclúyela con un motivo y vuelve a escanearla.</p>"}</div><form id="v2-review-form">${
      p.error
        ? `<p class="v2-notice warning">${esc(p.error)}</p>`
        : `<div id="v2-review-student">${scannedStudentNotice(p)}</div>${
            p.identification
              ? `<div class="v2-notice warning">Comprueba el código y el área contra la cartilla. Una corrección requiere motivo.</div>${codeColumnPreview(p.identification)}${areaReadingPreview(p.identification)}<div class="v2-form-grid"><label>Código de 8 dígitos<input id="v2-review-code" inputmode="numeric" pattern="[0-9]{8}" maxlength="8" required value="${esc((p.identificationOverride || p.identification).code)}"></label><label>Área marcada<select id="v2-review-area" required><option value="">Selecciona un área</option>${
                  state.exams
                    .find((e) => e.id === b.evaluation_id)
                    ?.definition?.areas?.map(
                      (a) =>
                        `<option value="${esc(a.code)}">${esc(a.code)}</option>`,
                    )
                    .join("") || ""
                }</select></label></div>`
              : ""
          }<div class="v2-question-grid">${Object.entries(p.responses)
            .map(
              ([q, r]) =>
                `<label class="${["multiple", "uncertain"].includes(r.status) ? "doubt" : ""}">Pregunta ${q}<select data-review-question="${q}"><option value="?" ${r.status === "uncertain" ? "selected" : ""}>Revisar</option><option value="-" ${r.status === "blank" ? "selected" : ""}>Blanco</option>${["A", "B", "C", "D", "E"].map((o) => `<option value="${o}" ${r.status === "single" && r.options[0] === o ? "selected" : ""}>${o}</option>`).join("")}${r.status === "multiple" ? '<option value="MULTIPLE" selected>Marca doble</option>' : ""}</select></label>`,
            )
            .join("")}</div>`
    }<label>Motivo<input id="v2-review-reason" required minlength="5" placeholder="Revisado contra la cartilla física"></label>${p.error ? "" : '<button class="v2-button" type="submit">Confirmar revisión</button>'}<button class="v2-button danger" type="button" id="v2-review-exclude">Excluir esta página</button></form></div>`,
  );
  bind("v2-review-code", "input", () => {
    const original = (p.identificationOverride || p.identification).code || "";
    $("v2-dialog-title").textContent =
      $("v2-review-code").value === original
        ? reviewTitle
        : "Revisar cartilla · código en revisión";
    $("v2-review-student").innerHTML =
      $("v2-review-code").value === original
        ? scannedStudentNotice(p)
        : '<p class="v2-help">El nuevo código se verificará al confirmar la revisión.</p>';
  });
  if (p.identification)
    api(`/api/v2/exams/${b.evaluation_id}`)
      .then((exam) => {
        const select = $("v2-review-area");
        if (!select) return;
        select.innerHTML =
          '<option value="">Selecciona un área</option>' +
          exam.definition.areas
            .map(
              (a) =>
                `<option value="${esc(a.code)}">${esc(a.code)} · ${esc(a.name)}</option>`,
            )
            .join("");
        select.value =
          (p.identificationOverride || p.identification).area || "";
      })
      .catch((error) => message(error.message, true));
  const save = async (exclude) => {
    const reason = $("v2-review-reason").value;
    if (reason.trim().length < 5)
      throw new Error("Describe el motivo de la revisión.");
    const responses = {};
    if (!exclude)
      for (const input of document.querySelectorAll("[data-review-question]")) {
        const q = input.dataset.reviewQuestion,
          v = input.value;
        if (v === "?") throw new Error(`Revisa la pregunta ${q}.`);
        responses[q] =
          v === "MULTIPLE"
            ? { status: "multiple", options: p.responses[q].options }
            : v === "-"
              ? { status: "blank", options: [] }
              : { status: "single", options: [v] };
      }
    await api(
      `/api/v2/imports/${b.id}/pages/${index}`,
      json(
        {
          reviewVersion: b.result.reviewVersion,
          reason,
          responses,
          exclude,
          ...(!exclude && p.identification
            ? {
                identification: {
                  code: $("v2-review-code").value,
                  area: $("v2-review-area").value,
                },
              }
            : {}),
        },
        "PATCH",
      ),
    );
    $("v2-dialog").close();
    await openBatch(b.id);
  };
  bind("v2-review-form", "submit", () => save(false));
  bind("v2-review-exclude", "click", () => save(true));
}
function attendanceQuery() {
  return new URLSearchParams({
    date: $("v2-attendance-date").value || today(),
    ciclo: $("v2-attendance-cycle").value,
    turno: $("v2-attendance-shift").value,
  }).toString();
}
async function copyAttendanceImage() {
  const query = attendanceQuery();
  const imagePromise = fetch(`/api/v2/attendance/image?${query}`).then(
    async (response) => {
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(
          error.mensaje || "No se pudo generar la imagen de asistencia.",
        );
      }
      return response.blob();
    },
  );
  // Start writing during the click gesture. ClipboardItem resolves the PNG when
  // the server finishes, including browsers that require transient activation.
  let writing;
  if (
    window.isSecureContext &&
    navigator.clipboard?.write &&
    window.ClipboardItem
  ) {
    try {
      writing = navigator.clipboard.write([
        new ClipboardItem({ "image/png": imagePromise }),
      ]);
    } catch (error) {
      writing = Promise.reject(error);
    }
  }
  const [imageResult, copyResult] = await Promise.allSettled([
    imagePromise,
    writing || Promise.resolve(false),
  ]);
  if (imageResult.status === "rejected") throw imageResult.reason;
  if (writing && copyResult.status === "fulfilled") {
    message(
      "Imagen de asistencia copiada al portapapeles. Ya puedes pegarla con Ctrl+V.",
    );
    return;
  }
  const url = URL.createObjectURL(imageResult.value),
    link = document.createElement("a");
  link.href = url;
  link.download = `Asistencia_${new URLSearchParams(query).get("date")}.png`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  message(
    "Se descargó el PNG porque el navegador no permitió copiar la imagen al portapapeles.",
  );
}
async function loadAttendance() {
  const query = attendanceQuery(),
    version = (state.attendanceVersion || 0) + 1;
  state.attendanceVersion = version;
  const data = await api(`/api/v2/attendance?${query}`);
  if (version !== state.attendanceVersion) return;
  $("v2-attendance").innerHTML = table(
    ["Código", "Persona", "Ciclo / turno", "Hora", "Estado", "Acción"],
    data.rows.map((r) => [
      esc(r.student_code),
      esc(r.name_snapshot),
      `${esc(r.cycle_snapshot)} / ${esc(r.shift_snapshot)}`,
      esc(r.arrival_time || "-"),
      `${esc(r.status)}${r.justification ? `<br>${esc(r.justification)}` : ""}`,
      ["admin", "recepcion"].includes(state.role)
        ? `<button class="v2-link" data-justify="${r.id}">Justificar</button>`
        : "",
    ]),
  );
  $("v2-attendance-export").href = `/api/v2/attendance/excel?${query}`;
  $("v2-attendance")
    .querySelectorAll("[data-justify]")
    .forEach(
      (b) =>
        (b.onclick = () => {
          showDialog(
            "Justificar asistencia",
            '<form id="v2-justify-form"><label>Motivo<textarea id="v2-justify-reason" minlength="5" required></textarea></label><button type="submit" class="v2-button">Guardar justificación</button></form>',
          );
          bind("v2-justify-form", "submit", async () => {
            await api(
              `/api/v2/attendance/${b.dataset.justify}/justify`,
              json({ reason: $("v2-justify-reason").value }),
            );
            $("v2-dialog").close();
            await loadAttendance();
            message("Justificación guardada.");
          });
        }),
    );
}
function renderContacts() {
  const search = $("v2-contact-search").value.toLowerCase();
  const students = state.students.filter((u) =>
    `${u.codigo} ${u.nombre} ${u.apellido} ${u.ciclo}`
      .toLowerCase()
      .includes(search),
  );
  $("v2-contacts").innerHTML =
    students
      .slice(0, 60)
      .map(
        (u) =>
          `<article class="v2-card"><div class="v2-contact-header"><h3>${esc(u.apellido)} ${esc(u.nombre)}</h3><span>${esc(u.codigo)} · ${esc(u.ciclo)}</span></div><div class="v2-toolbar"><label>Área de postulación<input data-area-code-student="${esc(u.codigo)}" value="${esc(u.area)}" maxlength="20" placeholder="A, B, C… o GENERAL" ${state.role !== "admin" ? "disabled" : ""}></label>${state.role === "admin" ? `<button class="v2-button secondary" data-save-student="${esc(u.codigo)}">Guardar área</button><button class="v2-button" data-add-contact="${esc(u.codigo)}">Agregar apoderado</button>` : ""}</div>${
            u.contacts
              .filter((c) => c.active)
              .map(
                (c) =>
                  `<div class="v2-contact-row"><strong>${esc(c.name)}</strong> · ${esc(c.phone)} · ${c.consent ? "Autorizado" : "Sin autorización"} ${state.role === "admin" ? `<button class="v2-link" data-revoke="${c.id}">Revocar</button>` : ""}</div>`,
              )
              .join("") ||
            '<p class="v2-help">No hay contactos activos registrados.</p>'
          }</article>`,
      )
      .join("") || '<div class="v2-empty">No se encontraron estudiantes.</div>';
  for (const b of document.querySelectorAll("[data-save-student]"))
    b.onclick = async () => {
      try {
        const input = [
          ...document.querySelectorAll("[data-area-code-student]"),
        ].find((i) => i.dataset.areaCodeStudent === b.dataset.saveStudent);
        await api(
          `/api/v2/students/${encodeURIComponent(b.dataset.saveStudent)}`,
          json({ area: input.value }, "PATCH"),
        );
        await loadStudents();
        message(
          "Área actualizada. Las cartillas ya impresas conservan su área original.",
        );
      } catch (e) {
        message(e.message, true);
      }
    };
  for (const b of document.querySelectorAll("[data-add-contact]"))
    b.onclick = () => {
      showDialog(
        "Agregar contacto autorizado",
        '<form id="v2-contact-form"><label>Nombre del apoderado<input name="name" required maxlength="100"></label><label>Teléfono internacional<input name="phone" type="tel" required placeholder="+51900111222"></label><label class="v2-checkbox"><input name="consent" type="checkbox"> Autorizó recibir avisos de este estudiante</label><button type="submit" class="v2-button">Guardar contacto</button></form>',
      );
      bind("v2-contact-form", "submit", async (e) => {
        const f = e.target;
        await api(
          `/api/v2/students/${encodeURIComponent(b.dataset.addContact)}/contacts`,
          json({
            name: f.elements.name.value,
            phone: f.elements.phone.value,
            consent: f.elements.consent.checked,
          }),
        );
        $("v2-dialog").close();
        await loadStudents();
        renderContacts();
        message("Contacto guardado.");
      });
    };
  for (const b of document.querySelectorAll("[data-revoke]"))
    b.onclick = async () => {
      try {
        await api(`/api/v2/contacts/${b.dataset.revoke}`, { method: "DELETE" });
        await loadStudents();
        renderContacts();
        message("Autorización revocada.");
      } catch (e) {
        message(e.message, true);
      }
    };
}
async function loadNotifications() {
  const data = await api("/api/v2/notifications");
  $("v2-cloud-status").innerHTML =
    `${data.status.configured ? "<strong>Credenciales completas</strong>" : "<strong>Falta completar la conexión del servidor</strong>"} · WhatsApp Cloud API · ${esc(data.status.version)}<p>Configura y aprueba las plantillas antes de activar los envíos. La recepción de estados requiere un webhook público con HTTPS.</p>`;
  const f = $("v2-cloud-config");
  f.elements.enabled.checked = data.config.enabled;
  for (const key of ["language", "attendanceTemplate", "resultsTemplate"])
    f.elements[key].value = data.config[key];
  $("v2-outbox").innerHTML = table(
    ["Fecha", "Destinatario", "Aviso", "Estado", "Detalle", "Acción"],
    data.outbox.map((r) => [
      esc(stamp(r.created_at)),
      esc(r.recipient),
      r.kind === "attendance" ? "Asistencia" : "Resultado",
      badge(r.status),
      esc(r.error),
      ["failed", "unknown"].includes(r.status)
        ? `<button class="v2-link" data-retry="${r.id}" data-unknown="${r.status === "unknown"}">Reintentar</button>`
        : "",
    ]),
  );
  $("v2-outbox")
    .querySelectorAll("[data-retry]")
    .forEach(
      (b) =>
        (b.onclick = async () => {
          try {
            const unknown = b.dataset.unknown === "true";
            if (
              unknown &&
              !confirm(
                "Comprueba con el destinatario que este aviso NO se entregó. ¿Confirmas que no lo recibió?",
              )
            )
              return;
            await api(
              `/api/v2/notifications/${b.dataset.retry}/retry`,
              json({ confirmNotDelivered: unknown }),
            );
            await loadNotifications();
            message("Aviso programado para reintento.");
          } catch (e) {
            message(e.message, true);
          }
        }),
    );
}
async function loadSettings() {
  const [accounts, audit] = await Promise.all([
    api("/api/v2/accounts"),
    api("/api/v2/audit"),
  ]);
  $("v2-accounts").innerHTML = table(
    ["Usuario", "Rol", "Estado", "Acción"],
    accounts.map((a) => [
      esc(a.username),
      esc(a.role),
      a.active ? "Activa" : "Desactivada",
      a.username === state.username
        ? "Tu cuenta"
        : `<button class="v2-link" data-account="${a.id}" data-active="${a.active}">${a.active ? "Desactivar" : "Activar"}</button>`,
    ]),
  );
  $("v2-audit").innerHTML = table(
    ["Fecha", "Operador", "Acción", "Entidad"],
    audit.map((a) => [
      esc(stamp(a.created_at)),
      esc(a.actor),
      esc(a.action),
      `${esc(a.entity)} · ${esc(a.entity_id)}`,
    ]),
  );
  $("v2-accounts")
    .querySelectorAll("[data-account]")
    .forEach(
      (b) =>
        (b.onclick = async () => {
          try {
            await api(
              `/api/v2/accounts/${b.dataset.account}`,
              json({ active: b.dataset.active !== "1" }, "PATCH"),
            );
            await loadSettings();
            message("Estado de cuenta actualizado.");
          } catch (e) {
            message(e.message, true);
          }
        }),
    );
}
function renderGuides() {
  const q = $("v2-guide-search").value.toLowerCase(),
    category = $("v2-guide-category").value;
  const results = state.guides.filter(
    (a) =>
      (!category || a.category === category) &&
      `${a.title} ${a.summary} ${a.steps.map((s) => s.title + " " + s.text).join(" ")}`
        .toLowerCase()
        .includes(q),
  );
  $("v2-guide-count").textContent = `${results.length} tutoriales`;
  $("v2-guide-list").innerHTML =
    results
      .map(
        (a) =>
          `<article class="v2-guide-card"><span class="v2-eyebrow">${esc(a.category)}</span><h4>${esc(a.title)}</h4><p>${esc(a.summary)}</p><button class="v2-link" data-guide="${esc(a.id)}">Abrir tutorial · ${a.steps.length} pasos →</button></article>`,
      )
      .join("") ||
    '<div class="v2-empty">No hay tutoriales con esa búsqueda. Prueba otra palabra.</div>';
}
function openGuide(id) {
  const a = state.guides.find((a) => a.id === id);
  if (!a) return;
  showDialog(
    a.title,
    `<article class="v2-tutorial"><p class="v2-eyebrow">${esc(a.category)}</p><p>${esc(a.summary)}</p><ol>${a.steps.map((s) => `<li><strong>${esc(s.title)}</strong><p>${esc(s.text)}</p></li>`).join("")}</ol>${a.tips?.length ? `<div class="v2-notice warning">${a.tips.map(esc).join("<br>")}</div>` : ""}</article>`,
  );
}
let wizardStep = 0;
function revealField(field) {
  const pane = field.closest("[data-wizard-pane]");
  if (pane) showWizardStep(Number(pane.dataset.wizardPane), false);
  for (
    let parent = field.parentElement;
    parent && parent !== pane;
    parent = parent.parentElement
  )
    if (parent.tagName === "DETAILS") parent.open = true;
  field.focus();
  field.reportValidity();
}
function showWizardStep(next, validate = true) {
  next = Math.max(0, Math.min(3, next));
  if (state.fixedPreset && next === 1) next = wizardStep > 1 ? 0 : 2;
  if (validate && next > wizardStep) {
    for (const pane of document.querySelectorAll("[data-wizard-pane]")) {
      if (
        Number(pane.dataset.wizardPane) >= next ||
        (state.fixedPreset && pane.dataset.wizardPane === "1")
      )
        continue;
      for (const field of pane.querySelectorAll("input,select,textarea")) {
        if (!field.disabled && !field.checkValidity()) {
          revealField(field);
          return;
        }
      }
    }
    if (next > 1 && updateWizardFeedback()?.issues.length) {
      state.fixedPreset = false;
      state.currentPreset = "custom";
      $("v2-preset").value = "custom";
      syncWizardMode();
      showWizardStep(1, false);
      $("v2-structure-summary").focus();
      return;
    }
  }
  if (next === 2) state.keyEditor?.refresh();
  wizardStep = next;
  for (const pane of document.querySelectorAll("[data-wizard-pane]"))
    pane.hidden = Number(pane.dataset.wizardPane) !== next;
  for (const button of document.querySelectorAll("[data-wizard-step]")) {
    const i = Number(button.dataset.wizardStep);
    if (i === next) button.setAttribute("aria-current", "step");
    else button.removeAttribute("aria-current");
    button.classList.toggle("is-complete", i < next);
  }
  $("wizard-back").hidden = next === 0;
  $("wizard-next").hidden = next === 3;
  $("wizard-save").hidden = next !== 3;
  $("wizard-prepare").hidden = next !== 3;
  const steps = wizardSteps();
  $("wizard-progress").textContent =
    `Paso ${steps.indexOf(next) + 1} de ${steps.length}`;
  updateWizardFeedback();
  const heading = document.querySelector(`[data-wizard-pane="${next}"] h3`);
  heading.tabIndex = -1;
  heading.focus({ preventScroll: true });
  $("v2-exam-editor").scrollIntoView({ block: "start", behavior: "instant" });
}
function updateWizardFeedback() {
  if (!$("v2-exam-editor")) return;
  const total = Number($("v2-exam-editor").elements.total.value);
  let keys = {},
    keyError = "";
  try {
    keys = keyValues($("v2-keys").value);
  } catch (error) {
    keyError = error.message;
  }
  const validKey = (v) =>
    /^[ABCDE](?:\/[ABCDE])*$/.test(String(v).trim().toUpperCase());
  const count = Object.entries(keys).filter(
    ([q, v]) => Number(q) >= 1 && Number(q) <= total && validKey(v),
  ).length;
  if (
    Object.entries(keys).some(
      ([q, v]) => Number(q) < 1 || Number(q) > total || !validKey(v),
    )
  )
    keyError =
      "Revisa las claves: usa alternativas A a E y números dentro del cuadernillo.";
  $("v2-keys-count").textContent =
    keyError || `${count} de ${total} claves ingresadas`;
  $("v2-keys-count").classList.toggle("field-error", !!keyError);
  const feedback = $("v2-structure-summary");
  feedback.tabIndex = -1;
  $("wizard-prepare").disabled = true;
  try {
    const { definition: def } = collectEditor({ structureOnly: true });
    const all = def.sections.flatMap((s) => s.questions),
      unique = new Set(all),
      issues = [];
    if (!Number.isInteger(total) || total < 1 || total > 200)
      issues.push("El cuadernillo debe tener entre 1 y 200 preguntas.");
    if (
      !def.sections.length ||
      def.sections.some((s) => !s.questions.length || !s.name.trim())
    )
      issues.push("Completa el nombre y las preguntas de cada curso.");
    if (all.some((q) => q < 1 || q > total))
      issues.push("Hay preguntas fuera del cuadernillo.");
    if (unique.size !== all.length)
      issues.push("Una pregunta aparece en más de un curso.");
    if (unique.size !== total)
      issues.push(`Los cursos cubren ${unique.size} de ${total} preguntas.`);
    if (
      new Set(def.areas.map((a) => a.code)).size !== def.areas.length ||
      def.areas.some(
        (a) =>
          !/^[A-Z0-9_-]{1,20}$/.test(a.code) ||
          a.requiredQuestions < 1 ||
          a.requiredQuestions > total,
      )
    )
      issues.push(
        "Revisa los códigos y las cantidades evaluables de las áreas.",
      );
    for (const s of def.sections)
      for (const a of def.areas) {
        const r = s.rules[a.code];
        if (r.questions.some((q) => !s.questions.includes(q)))
          issues.push(
            `${s.name}, área ${a.code}: hay preguntas fuera del curso.`,
          );
        if (
          !Number.isInteger(r.quota) ||
          r.quota < 0 ||
          r.quota > r.questions.length
        )
          issues.push(
            `${s.name}, área ${a.code}: el cupo supera las preguntas disponibles.`,
          );
      }
    const areaIssues = new Map();
    const totals = def.areas.map((a) => {
      const assigned = def.sections.reduce(
        (sum, s) => sum + (s.rules[a.code]?.quota || 0),
        0,
      );
      if (assigned !== a.requiredQuestions) {
        const key = `${assigned} de ${a.requiredQuestions} preguntas asignadas`;
        areaIssues.set(key, [...(areaIssues.get(key) || []), a.code]);
      }
      return { ...a, assigned };
    });
    for (const [text, codes] of areaIssues)
      issues.push(
        `Área${codes.length > 1 ? "s" : ""} ${codes.join(", ")}: ${text}.`,
      );
    feedback.classList.toggle("error", issues.length > 0);
    feedback.textContent = issues.length
      ? issues.join(" ")
      : `Distribución completa: ${total} preguntas en ${def.sections.length} curso${def.sections.length === 1 ? "" : "s"}. ${def.areas.length} perfil${def.areas.length === 1 ? "" : "es"} con las cantidades correctas.`;
    for (const el of $("v2-sections").querySelectorAll(".v2-section-editor")) {
      el.querySelector(".course-caption strong").textContent =
        el.querySelector("[data-course-name]").value || "Nuevo curso";
      el.querySelector(".course-caption small").textContent =
        el.querySelector("[data-course-range]").value ||
        "Completa la distribución";
    }
    let complete = 0;
    try {
      const { definition } = collectEditor();
      complete = Object.values(definition.keys).filter(
        (k) =>
          k.voidPolicy ||
          k.optionScores ||
          (k.answers.length && k.answers.every((v) => /^[ABCDE]$/.test(v))),
      ).length;
      for (const [name, mapping] of Object.entries(definition.forms))
        if (
          mapping.length !== total ||
          new Set(mapping).size !== total ||
          mapping.some((q) => q < 1 || q > total)
        )
          keyError = `La versión ${name} debe contener todas las preguntas una sola vez.`;
      if (
        Object.values(definition.keys).some(
          (k) =>
            k.optionScores &&
            Object.values(k.optionScores).some((v) => !Number.isFinite(v)),
        )
      )
        keyError = "Revisa los puntajes por alternativa.";
    } catch (error) {
      keyError = error.message;
    }
    $("v2-wizard-review").innerHTML =
      `<div class="wizard-review-grid"><div><strong>${total}</strong><span>preguntas impresas</span></div><div><strong>${def.sections.length}</strong><span>cursos</span></div><div><strong>${complete}/${total}</strong><span>preguntas con clave o regla</span></div></div><div class="v2-card wizard-review-details"><h3>${esc($("v2-exam-editor").elements.titulo.value || "Sin título")}</h3><p>${esc($("v2-exam-editor").elements.ciclo.value)} · ${esc($("v2-exam-editor").elements.fecha.value)}</p>${table(
        ["Perfil", "Preguntas evaluables"],
        totals.map((a) => [
          `${esc(a.code)} · ${esc(a.name)}`,
          `${a.assigned} de ${a.requiredQuestions}`,
        ]),
      )}</div><p class="${keyError ? "field-error" : "v2-help"}">${esc(keyError || (complete === total ? "La clave está completa. Puedes guardar y validar el simulacro." : "Puedes guardar el borrador y completar las claves después. Para validar se requiere una clave o regla para cada pregunta."))}</p>`;
    $("wizard-prepare").disabled =
      issues.length > 0 || !!keyError || complete !== total;
    return { issues, def };
  } catch (error) {
    feedback.classList.add("error");
    feedback.textContent = error.message;
    $("v2-wizard-review").textContent = error.message;
    return { issues: [error.message] };
  }
}
function syncSimpleTotal() {
  const total = Number($("v2-exam-editor").elements.total.value),
    previous = Number(state.lastTotal);
  if (
    !Number.isInteger(total) ||
    total < 1 ||
    total > 200 ||
    total === previous
  )
    return;
  captureSections();
  if (
    state.areas.length === 1 &&
    state.areas[0].requiredQuestions === previous
  ) {
    state.areas[0].requiredQuestions = total;
    renderAreas();
  }
  if (
    state.sections.length === 1 &&
    state.sections[0].questions.length === previous &&
    state.sections[0].questions.every((q, i) => q === i + 1)
  ) {
    delete state.sections[0]._range;
    state.sections[0].questions = Array.from(
      { length: total },
      (_, i) => i + 1,
    );
    for (const rule of Object.values(state.sections[0].rules)) {
      if (rule.selection === "fixed" && rule.questions.length === previous) {
        delete rule._range;
        rule.questions = [...state.sections[0].questions];
        rule.quota = total;
      }
    }
    renderSections();
  }
  state.lastTotal = total;
  $("v2-preset").value = "custom";
  state.currentPreset = "custom";
  updateWizardFeedback();
}

async function initialize() {
  const session = await window.ingematSession;
  if (!session.usuario) {
    location.assign("/pages/admin-login.html");
    return;
  }
  state.role = session.usuario.role;
  state.timezone = session.timezone || "America/Lima";
  document.body.dataset.accountRole = state.role;
  if (state.role !== "admin")
    for (const id of [
      "horarios-section",
      "gestion-ciclos-section",
      "agregar-usuario-section",
      "btn-vista-info",
    ])
      $(id).hidden = true;
  if (!["admin", "recepcion"].includes(state.role))
    for (const id of [
      "justificar-falta-section",
      "subtab-bib-gestion",
      "subtab-bib-prestamos",
    ])
      $(id).hidden = true;
  if (state.role === "recepcion") $("btn-vista-evaluaciones").hidden = true;
  state.username = session.usuario.username;
  const view = $("vista-v2");
  view.innerHTML = await (await fetch("/pages/v2-panel.html")).text();
  document.body.append($("v2-dialog"));
  $("v2-attendance-date").value = today();
  for (const el of view.querySelectorAll("[data-admin]"))
    el.hidden = state.role !== "admin";
  for (const b of view.querySelectorAll("[data-v2-tab]")) {
    if (
      state.role === "recepcion" &&
      ["exams", "imports"].includes(b.dataset.v2Tab)
    )
      b.hidden = true;
    b.onclick = () =>
      tab(b.dataset.v2Tab).catch((e) => message(e.message, true));
  }
  const guide = await api("/api/v2/guide");
  state.guides = guide.articles;
  $("v2-guide-category").innerHTML =
    '<option value="">Todos los temas</option>' +
    [...new Set(state.guides.map((a) => a.category))]
      .map((c) => `<option>${esc(c)}</option>`)
      .join("");
  await loadCycles();
  await loadStudents();
  if (state.role !== "recepcion") await loadExams();
  $("v2-new").hidden = !["admin", "corrector"].includes(state.role);
  document.addEventListener("click", (e) => {
    const guide = e.target.closest("[data-guide]");
    if (guide) {
      e.preventDefault();
      openGuide(guide.dataset.guide);
    }
  });
  bind("v2-dialog-close", "click", () => $("v2-dialog").close());
  $("v2-dialog").addEventListener("click", (e) => {
    if (e.target === $("v2-dialog")) {
      const r = e.target.getBoundingClientRect();
      if (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      )
        e.target.close();
    }
  });
  bind("wizard-next", "click", () => moveWizard(1));
  bind("wizard-back", "click", () => moveWizard(-1));
  for (const button of document.querySelectorAll("[data-wizard-step]"))
    button.onclick = () =>
      showWizardStep(
        Number(button.dataset.wizardStep),
        Number(button.dataset.wizardStep) > wizardStep,
      );
  $("v2-exam-editor").elements.total.addEventListener(
    "change",
    syncSimpleTotal,
  );
  $("v2-exam-editor").addEventListener(
    "invalid",
    (event) => {
      const pane = event.target.closest("[data-wizard-pane]");
      if (pane) showWizardStep(Number(pane.dataset.wizardPane), false);
      for (
        let parent = event.target.parentElement;
        parent && parent !== pane;
        parent = parent.parentElement
      )
        if (parent.tagName === "DETAILS") parent.open = true;
    },
    true,
  );
  state.keyEditor = mountKeyEditor($("v2-keys"), {
    getDefinition: () => collectEditor({ structureOnly: true }).definition,
    parse: keyValues,
    escape: esc,
  });
  $("v2-exam-editor").addEventListener("input", (event) => {
    if (
      !event.target.matches(
        '[name="titulo"], [name="ciclo"], [name="fecha"], #v2-preset, #v2-template-name, [data-course-area], .key-editor select, .key-editor input',
      )
    )
      state.definitionDirty = true;
    const key = event.target.name;
    if (["correct", "wrong", "blank"].includes(key)) {
      for (const field of $("v2-sections").querySelectorAll(
        `[data-course-${key}]`,
      ))
        if (
          !(
            state.fixedPreset &&
            key !== "correct" &&
            field.closest(".v2-section-editor") ===
              $("v2-sections").firstElementChild
          ) &&
          Number(field.value) === state.defaultScoring[key]
        )
          field.value = event.target.value;
      state.defaultScoring[key] = Number(event.target.value);
    }
    updateWizardFeedback();
  });
  $("v2-exam-editor").addEventListener("change", (event) => {
    if (
      !event.target.matches(
        '[name="titulo"], [name="ciclo"], [name="fecha"], #v2-preset, #v2-template-name, [data-course-area], .key-editor select, .key-editor input',
      )
    )
      state.definitionDirty = true;
    updateWizardFeedback();
  });
  bind("v2-guide-search", "input", renderGuides);
  bind("v2-guide-category", "change", renderGuides);
  bind("v2-contact-search", "input", renderContacts);
  bind("v2-attendance-load", "click", loadAttendance);
  bind("v2-attendance-image", "click", copyAttendanceImage);
  for (const id of [
    "v2-attendance-date",
    "v2-attendance-cycle",
    "v2-attendance-shift",
  ])
    bind(id, "change", loadAttendance);
  bind("v2-refresh-batches", "click", loadBatches);
  bind("v2-clear-batches", "click", async () => {
    const result = await api("/api/v2/imports/clear-history", json({}));
    await loadBatches();
    $("v2-history-status").textContent =
      `${result.hidden} lotes finalizados ocultos. Puedes restaurar la lista.`;
  });
  bind("v2-restore-batches", "click", async () => {
    await api("/api/v2/imports/restore-history", json({}));
    await loadBatches();
    $("v2-history-status").textContent = "Lista restaurada.";
  });
  bind("v2-refresh-notifications", "click", loadNotifications);
  bind("v2-reload", "click", async () => {
    await loadCycles();
    await loadStudents();
    await loadExams(state.selected?.id);
  });
  bind("v2-manual-replace", "change", () => {
    $("v2-replace-reason").hidden = !$("v2-manual-replace").checked;
    $("v2-manual-reason").required = $("v2-manual-replace").checked;
  });
  bind("v2-exam-select", "change", (e) => selectExam(e.target.value));
  bind("v2-result-area", "change", loadResults);
  bind("v2-new", "click", async () => {
    await loadCycles();
    await loadStudents();
    state.editor = null;
    const f = $("v2-exam-editor");
    f.reset();
    f.elements.fecha.value = today();
    preset("repaso-unmsm");
    f.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  bind("v2-preset", "change", (e) => {
    const value = e.target.value;
    captureSections();
    const hasWork =
      state.definitionDirty ||
      state.editor != null ||
      $("v2-keys").value.trim();
    if (hasWork) {
      state.pendingPreset = value;
      $("v2-format-confirm").hidden = false;
    } else preset(value);
  });
  bind("v2-format-apply", "click", () => preset(state.pendingPreset));
  bind("v2-format-keep", "click", () => {
    $("v2-preset").value = state.currentPreset;
    $("v2-format-confirm").hidden = true;
  });
  bind("v2-edit", "click", () => {
    const e = state.selected;
    setEditor(e.definition, e.id);
    const f = $("v2-exam-editor");
    f.elements.titulo.value = e.titulo;
    f.elements.ciclo.value = e.ciclo;
    f.elements.fecha.value = e.fecha;
    f.scrollIntoView({ behavior: "smooth" });
  });
  bind("v2-apply-scoring", "click", () => {
    state.definitionDirty = true;
    const f = $("v2-exam-editor");
    for (const course of $("v2-sections").querySelectorAll(
      ".v2-section-editor",
    ))
      for (const key of ["correct", "wrong", "blank"])
        course.querySelector(`[data-course-${key}]`).value =
          f.elements[key].value;
    captureSections();
    message(
      "Puntajes generales aplicados a todos los cursos. Puedes ajustar cada curso por separado.",
    );
  });
  bind("v2-add-area", "click", () => {
    state.definitionDirty = true;
    captureSections();
    captureAreas();
    state.areas.push({
      code: String.fromCharCode(65 + state.areas.length),
      name: "Nueva área",
      requiredQuestions: Number($("v2-exam-editor").elements.total.value),
    });
    renderAreas();
    renderSections();
  });
  bind("v2-add-section", "click", () => {
    state.definitionDirty = true;
    captureSections();
    state.sections.push({ name: "Nuevo curso", questions: [], rules: {} });
    state.expandedCourse = state.sections.length - 1;
    renderSections();
  });
  bind("v2-cancel-edit", "click", () => {
    $("v2-exam-editor").hidden = true;
    $("v2-exam-editor").closest(".v2-panel").classList.remove("is-editing");
  });
  bind("v2-exam-editor", "submit", async (event) => {
    const prepare = event.submitter?.id === "wizard-prepare";
    const payload = collectEditor(),
      id = state.editor;
    const e = await api(
      id ? `/api/v2/exams/${id}` : "/api/v2/exams",
      json(payload, id ? "PUT" : "POST"),
    );
    state.editor = e.id;
    if (prepare) await api(`/api/v2/exams/${e.id}/ready`, json({}));
    await loadExams(e.id);
    message(
      prepare
        ? "Examen validado. Ya puedes imprimir e importar cartillas."
        : "Borrador guardado. Valida el examen cuando completes todas las claves y reglas.",
    );
  });
  bind("v2-ready", "click", async () => {
    const e = await api(`/api/v2/exams/${state.selected.id}/ready`, json({}));
    await loadExams(e.id);
    message("Examen validado. Ya puedes imprimir e importar cartillas.");
  });
  bind("v2-publish", "click", async () => {
    await api(`/api/v2/exams/${state.selected.id}/publish`, json({}));
    await loadExams(state.selected.id);
    message(
      "Resultados publicados. Los avisos se envían solo cuando pulses Notificar resultados.",
    );
  });
  bind("v2-archive", "click", async () => {
    if (!confirm("¿Archivar este examen? Sus notas e historial se conservan."))
      return;
    await api(`/api/v2/exams/${state.selected.id}`, { method: "DELETE" });
    await loadExams();
    await selectExam("");
    message("Evaluación archivada.");
  });
  bind("v2-notify", "click", async () => {
    if (
      !confirm(
        "¿Poner en cola los resultados para todos los contactos autorizados de este examen?",
      )
    )
      return;
    const result = await api(
      `/api/v2/exams/${state.selected.id}/notify`,
      json({}),
    );
    message(
      `${result.queued} avisos nuevos en cola. Los ya programados no se duplican.`,
    );
  });
  const printGuidance = () => {
    const blank = $("v2-sheet-mode").value === "blank",
      half = $("v2-sheet-format").value === "half-single";
    $("v2-sheet-blank").hidden = !blank;
    $("v2-sheet-student-label").hidden = blank;
    $("v2-sheet-edge-label").hidden = half;
    const count = Number($("v2-sheet-count").value),
      sheets = Math.ceil(count / (half ? 2 : 4));
    $("v2-sheet-instructions").textContent = !blank
      ? "Formato anterior: A4 horizontal, una cara, al 100%."
      : half
        ? `${sheets} hojas A4 verticales, ${sheets} páginas. Cartillas horizontales a media hoja. Imprime una sola cara, al 100%, sin ajustar; no actives dos páginas por hoja.`
        : `${sheets} hojas A4 horizontales, ${sheets * 2} páginas alternadas frente/reverso. Imprime a doble cara por borde ${$("v2-sheet-edge").value === "short" ? "corto" : "largo"}, al 100%, sin ajustar; el PDF ya contiene cuatro cartillas por cara.`;
  };
  for (const id of [
    "v2-sheet-mode",
    "v2-sheet-format",
    "v2-sheet-count",
    "v2-sheet-edge",
  ])
    bind(id, "change", printGuidance);
  printGuidance();
  bind("v2-print", "click", () => {
    const e = state.selected;
    const q = new URLSearchParams({ form: $("v2-sheet-form").value });
    if ($("v2-sheet-mode").value === "blank") {
      const count = Number($("v2-sheet-count").value);
      if (!Number.isInteger(count) || count < 1 || count > 500)
        throw new Error("Indica entre 1 y 500 cartillas.");
      q.set("mode", "blank");
      q.set("count", count);
      q.set("format", $("v2-sheet-format").value);
      q.set("edge", $("v2-sheet-edge").value);
    } else if ($("v2-sheet-student").value)
      q.set("code", $("v2-sheet-student").value);
    window.open(`/api/v2/exams/${e.id}/sheets.pdf?${q}`, "_blank", "noopener");
  });
  window.addEventListener("ingemat:scan", async (e) => {
    await tab("imports");
    if (e.detail?.id) $("v2-import-exam").value = e.detail.id;
    updateCSVLink();
  });
  bind("v2-scan-open", "click", async () => {
    await tab("imports");
    $("v2-import-exam").value = state.selected.id;
    updateCSVLink();
  });
  bind("v2-import-exam", "change", updateCSVLink);
  bind("v2-manual-student", "change", (e) => {
    const u = state.students.find((u) => u.codigo === e.target.value);
    $("v2-manual-answers").value = "";
    $("v2-manual-replace").checked = false;
    if (
      u?.area &&
      state.selected.definition.areas.some((a) => a.code === u.area)
    )
      $("v2-manual-area").value = u.area;
  });
  bind("v2-manual", "submit", async () => {
    const replace = $("v2-manual-replace").checked,
      reason = $("v2-manual-reason").value;
    if (replace && reason.trim().length < 5)
      throw new Error("Describe el motivo de la corrección.");
    const data = await api(
      `/api/v2/exams/${state.selected.id}/grade`,
      json({
        codigoEstudiante: $("v2-manual-student").value,
        area: $("v2-manual-area").value,
        form: $("v2-manual-form").value,
        respuestas: answerValues($("v2-manual-answers").value),
        allowReplace: replace,
        reason,
      }),
    );
    await loadExams(state.selected.id);
    message(
      `Calificación guardada: ${data.resultado.puntajeTotal} puntos; ${data.resultado.correctas} correctas, ${data.resultado.incorrectas} errores y ${data.resultado.enBlanco} blancos.`,
    );
  });
  state.scanner = mountScanner({
    api,
    escape: esc,
    username: session.usuario.username,
    onUploaded: async (batch) => {
      state.batch = { id: batch.id };
      await loadBatches();
    },
  });
  bind("v2-scan-form", "submit", async () => {
    const id = $("v2-import-exam").value,
      files = [...$("v2-scan-files").files];
    if (!id) throw new Error("Selecciona un examen listo.");
    if (files.length > 10 || files.some((f) => f.size > 20 * 1024 * 1024))
      throw new Error("Admite hasta 10 archivos de 20 MB.");
    const data = new FormData();
    for (const file of files) data.append("files", file);
    const b = await api(`/api/v2/exams/${id}/scan`, {
      method: "POST",
      body: data,
    });
    state.batch = { id: b.id };
    await loadBatches();
    message("Lote en cola. Puedes seguir trabajando mientras se procesa.");
  });
  bind("v2-csv-form", "submit", async () => {
    const id = $("v2-import-exam").value;
    if (!id) throw new Error("Selecciona un examen.");
    const file = $("v2-csv-file").files[0];
    if (!file || file.size > 2 * 1024 * 1024)
      throw new Error("Selecciona un CSV de hasta 2 MB.");
    const b = await api(
      `/api/v2/exams/${id}/import-csv`,
      json({ csv: await file.text() }),
    );
    state.batch = { id: b.id };
    await loadBatches();
    message(
      "CSV validado. Revisa la previsualización y confirma la importación.",
    );
  });
  bind("v2-cloud-config", "submit", async (e) => {
    const f = e.target;
    await api(
      "/api/v2/notifications/config",
      json(
        {
          enabled: f.elements.enabled.checked,
          language: f.elements.language.value,
          attendanceTemplate: f.elements.attendanceTemplate.value,
          resultsTemplate: f.elements.resultsTemplate.value,
        },
        "PUT",
      ),
    );
    await loadNotifications();
    message("Configuración de WhatsApp guardada.");
  });
  bind("v2-account-form", "submit", async (e) => {
    await api(
      "/api/v2/accounts",
      json(Object.fromEntries(new FormData(e.target))),
    );
    e.target.reset();
    await loadSettings();
    message("Cuenta creada. La contraseña debe cambiarse al iniciar sesión.");
  });
  bind("v2-backup", "click", async () => {
    const r = await api("/api/v2/backup", json({}));
    $("v2-backup-result").innerHTML =
      `<p>${esc(r.mensaje)}</p><a href="/api/v2/backups/${encodeURIComponent(r.filename)}" class="v2-button secondary">Descargar copia</a>`;
  });
  bind("v2-save-template", "click", async () => {
    const name = $("v2-template-name").value.trim();
    if (!name) {
      $("v2-template-name").focus();
      throw new Error("Escribe un nombre para guardar la plantilla.");
    }
    await api(
      "/api/v2/templates",
      json({ name, definition: collectEditor().definition }),
    );
    await loadTemplates();
    $("v2-template-feedback").textContent =
      "Plantilla guardada. La encontrarás en Datos al crear otro simulacro.";
  });
  bind("v2-revise", "click", reviseKeysDialog);
  state.poll = setInterval(() => {
    if (state.tab === "imports" && !document.hidden && !$("vista-v2").hidden)
      loadBatches().catch(() => {});
  }, 4000);
  renderGuides();
}
function updateCSVLink() {
  $("v2-csv-template").href = $("v2-import-exam").value
    ? `/api/v2/exams/${$("v2-import-exam").value}/csv-template`
    : "#";
}
function reviseKeysDialog() {
  const e = state.selected;
  const noPenalty = compact(
    Object.keys(e.definition.keys)
      .filter((q) => e.definition.keys[q].noPenalty)
      .map(Number),
  );
  const annulled = compact(
    Object.keys(e.definition.keys)
      .filter((q) => e.definition.keys[q].voidPolicy)
      .map(Number),
  );
  showDialog(
    "Revisar claves y reglas",
    `<form id="v2-revise-form"><p>Al confirmar se recalculan automáticamente todas las respuestas registradas. Se guarda el historial y el simulacro vuelve a Listo para revisar antes de publicarlo otra vez.</p>
    <details><summary>Pegar una lista de claves (opcional)</summary><label>Claves corregidas<textarea id="v2-revision-keys" rows="9" required>${esc(
      Object.entries(e.definition.keys)
        .map(([n, k]) => `${n},${k.answers.join("/")}`)
        .join("\n"),
    )}</textarea></label></details>
    <section class="stack" aria-labelledby="revision-rules-title"><h4 id="revision-rules-title">Excepciones de puntaje</h4>
      <label>Preguntas sin penalización<input id="v2-revision-no-penalty" value="${esc(noPenalty)}" placeholder="Ej.: 1-10"></label>
      <label>Preguntas anuladas<input id="v2-revision-void" value="${esc(annulled)}" placeholder="Ej.: 42,67"></label>
      <label>Regla de anulación<select id="v2-revision-policy"><option value="preserve">Conservar reglas actuales (nuevas: otorgar puntos)</option><option value="credit">Otorgar puntos a todas las indicadas</option><option value="exclude">Excluir del puntaje todas las indicadas</option></select></label>
      <label>Puntos por alternativa (número,A,B,C,D,E)<textarea id="v2-revision-option-scores" rows="3" placeholder="15,20,15,10,5,0">${esc(optionScoreText(e.definition.keys))}</textarea></label>
      <p class="v2-help">Deja vacía una lista para quitar esas excepciones. Revisa los valores contra el reglamento antes de confirmar.</p>
    </section>
    <details><summary>¿Qué son las versiones A/B?</summary><p>Son órdenes diferentes de las mismas preguntas. Si la primera pregunta de B corresponde a la 51 del original, el lector aplica la clave de la 51. No son revisiones de notas. El orden de las versiones queda fijado al validar, para conservar la interpretación de respuestas y cartillas ya registradas.</p><p class="v2-help">Versiones de este simulacro: ${esc(Object.keys(e.definition.forms).join(", "))}. Para cambiar su orden crea un simulacro nuevo.</p></details>
    <label>Motivo de la corrección<input id="v2-revision-reason" required minlength="5"></label>
    <button type="submit" class="v2-button">Aplicar cambios y recalcular</button></form>`,
  );
  mountKeyEditor($("v2-revision-keys"), {
    getDefinition: () => e.definition,
    parse: keyValues,
    escape: esc,
  }).reset();
  bind("v2-revise-form", "submit", async () => {
    const total = e.definition.totalQuestions,
      values = keyValues($("v2-revision-keys").value),
      noPenalty = questionSet($("v2-revision-no-penalty").value, total),
      annulled = questionSet($("v2-revision-void").value, total),
      scores = optionScoreValues($("v2-revision-option-scores").value, total),
      keys = structuredClone(e.definition.keys),
      policy = $("v2-revision-policy").value;
    if (Object.keys(values).some((q) => Number(q) < 1 || Number(q) > total))
      throw new Error(
        "Las claves deben corresponder a preguntas del cuadernillo.",
      );
    for (const [q, key] of Object.entries(keys)) {
      key.answers = (values[q] || "").toUpperCase().split("/").filter(Boolean);
      key.noPenalty = noPenalty.has(Number(q));
      key.voidPolicy = annulled.has(Number(q))
        ? policy === "preserve"
          ? key.voidPolicy || "credit"
          : policy
        : null;
      if (scores[q]) key.optionScores = scores[q];
      else delete key.optionScores;
    }
    await api(
      `/api/v2/exams/${e.id}/revise-keys`,
      json({ keys, reason: $("v2-revision-reason").value }),
    );
    $("v2-dialog").close();
    await loadExams(e.id);
    message(
      "Nueva revisión aplicada. Puntajes y ranking recalculados. Comprueba las notas antes de volver a publicar.",
    );
  });
}

export const v2Ready = initialize();
export async function openV2Panel(name) {
  await v2Ready;
  return tab(name);
}
export async function openV2Guide(id) {
  await v2Ready;
  return openGuide(id);
}
