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
const names = {
  exams: [
    "Simulacros",
    "Configura el examen una vez. Lee, revisa y califica con las mismas reglas.",
  ],
  imports: [
    "Lotes OMR",
    "Carga un salón completo y dedica tiempo a las excepciones.",
  ],
  attendance: ["Asistencias", "Ingresos guardados por código, fecha y turno."],
  contacts: [
    "Contactos y áreas",
    "Perfiles de postulación y personas autorizadas para recibir avisos.",
  ],
  notifications: [
    "Comunicación",
    "WhatsApp oficial, cola persistente y seguimiento de entregas.",
  ],
  settings: [
    "Cuentas y respaldo",
    "Permisos, vinculación de recepción y copias de seguridad.",
  ],
  guide: ["Guía y tutoriales", "Aprende cada tarea con pasos y ejemplos."],
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
  if (!response.ok)
    throw new Error(
      value.mensaje || `No se pudo completar (${response.status}).`,
    );
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
        ? e.target.querySelector("button[type=submit]")
        : e.currentTarget;
    try {
      if (button?.tagName === "BUTTON") button.disabled = true;
      await fn(e);
    } catch (error) {
      message(error.message, true);
    } finally {
      if (button?.tagName === "BUTTON") button.disabled = false;
    }
  });
}
function table(headers, rows) {
  if (!rows.length)
    return '<div class="v2-empty">Todavía no hay registros para esta selección.</div>';
  return `<div class="v2-table-scroll"><table class="v2-table"><thead><tr>${headers.map((h) => `<th scope="col">${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((cells) => `<tr>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
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
  document.querySelector(".hero-header").hidden = true;
  document
    .querySelectorAll(".vista-content,.vista-admin")
    .forEach((el) => (el.style.display = "none"));
  $("vista-v2").style.display = "block";
  document
    .querySelectorAll(".nav-button")
    .forEach((b) => b.classList.remove("active"));
  $(
    state.tab === "guide"
      ? "btn-vista-guia"
      : state.tab === "notifications"
        ? "btn-vista-whatsapp"
        : "btn-vista-v2",
  )?.classList.add("active");
}
async function tab(name) {
  if (state.tab !== name) $("v2-message").hidden = true;
  state.tab = name;
  expose();
  for (const el of document.querySelectorAll("[data-v2-panel]"))
    el.hidden = el.dataset.v2Panel !== name;
  for (const b of document.querySelectorAll("[data-v2-tab]"))
    b.setAttribute("aria-selected", String(b.dataset.v2Tab === name));
  $("v2-title").textContent = names[name][0];
  $("v2-description").textContent = names[name][1];
  if (name === "imports") await loadBatches();
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
  if (selected) {
    $("v2-exam-select").value = selected;
    await selectExam(selected);
  }
  await loadTemplates();
}
async function loadTemplates() {
  state.templates = await api("/api/v2/templates");
  $("v2-template-select").innerHTML =
    '<option value="">Cargar plantilla guardada</option>' +
    state.templates
      .map((t) => `<option value="${esc(t.id)}">${esc(t.name)}</option>`)
      .join("");
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
  $("v2-manual-answers").value = "";
  $("v2-manual-replace").checked = false;
  $("v2-manual-reason").value = "";
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
function collectEditor() {
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
      const qs = expand(r.querySelector("[data-rule-questions]").value),
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
  const values = keyValues($("v2-keys").value),
    noPenalty = new Set(expand($("v2-no-penalty").value)),
    annulled = new Set(expand($("v2-void").value));
  const keys = {};
  for (let q = 1; q <= total; q++)
    keys[q] = {
      answers: (values[q] || "").toUpperCase().split("/").filter(Boolean),
      noPenalty: noPenalty.has(q),
      voidPolicy: annulled.has(q) ? $("v2-void-policy").value : null,
    };
  for (const line of $("v2-option-scores")
    .value.split(/\r?\n/)
    .filter((l) => l.trim())) {
    const vals = line.split(",").map((s) => s.trim()),
      q = Number(vals[0]);
    if (vals.length !== 6 || !keys[q])
      throw new Error(
        "Los puntajes por alternativa requieren número,A,B,C,D,E.",
      );
    keys[q].optionScores = Object.fromEntries(
      ["A", "B", "C", "D", "E"].map((o, i) => [o, Number(vals[i + 1])]),
    );
  }
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
  return {
    titulo: form.elements.titulo.value,
    ciclo: form.elements.ciclo.value,
    fecha: form.elements.fecha.value,
    definition: {
      totalQuestions: total,
      areas,
      sections,
      keys,
      scoring: {
        correct: Number(form.elements.correct.value),
        wrong: Number(form.elements.wrong.value),
        blank: Number(form.elements.blank.value),
      },
      forms,
    },
  };
}
function captureSections() {
  if (!$("v2-sections").children.length) return;
  try {
    state.sections = collectEditor().definition.sections;
  } catch {
    /* Preserve the last valid configuration while the user edits incomplete ranges. */
  }
}
function renderAreas() {
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
        state.areas.splice(Number(b.dataset.removeArea), 1);
        renderAreas();
        renderSections();
      }),
  );
  $("v2-apply-areas").onclick = () => {
    try {
      captureSections();
      state.areas = [...area.querySelectorAll(".v2-area-row")].map((r) => ({
        code: r.querySelector("[data-area-code]").value.trim().toUpperCase(),
        name: r.querySelector("[data-area-name]").value,
        requiredQuestions: Number(r.querySelector("[data-area-total]").value),
      }));
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
    .map(
      (s, i) =>
        `<div class="v2-section-editor"><div class="v2-section-title"><strong>Curso ${i + 1}</strong><button type="button" class="v2-link" data-remove-section="${i}">Quitar curso</button></div><div class="v2-form-grid"><label>Nombre<input data-course-name value="${esc(s.name)}" required maxlength="100"></label><label>Preguntas del curso<input data-course-range value="${esc(compact(s.questions))}" placeholder="1-20" required></label><label>Correcta<input data-course-correct type="number" step=".001" value="${s.scoring?.correct ?? Number(form.elements.correct.value)}"></label><label>Penalización<input data-course-wrong type="number" min="0" step=".001" value="${s.scoring?.wrong ?? Number(form.elements.wrong.value)}"></label><label>Blanco<input data-course-blank type="number" step=".001" value="${s.scoring?.blank ?? Number(form.elements.blank.value)}"></label></div>${state.areas
          .map((a) => {
            const rule = s.rules?.[a.code] || {
              questions: state.areas.length === 1 ? s.questions : [],
              selection: "fixed",
              quota: 0,
            };
            return `<div class="v2-form-grid v2-rule" data-rule-area="${esc(a.code)}"><label>Área ${esc(a.code)} · preguntas aplicables<input data-rule-questions value="${esc(compact(rule.questions))}" placeholder="Sin preguntas para esta área"></label><label>Selección<select data-rule-selection><option value="fixed" ${rule.selection === "fixed" ? "selected" : ""}>Preguntas fijas</option><option value="choose" ${rule.selection === "choose" ? "selected" : ""}>Elegir cupo</option></select></label><label>Cupo al elegir<input data-rule-quota type="number" min="0" max="${total}" value="${rule.quota ?? rule.questions?.length ?? 0}"></label></div>`;
          })
          .join("")}</div>`,
    )
    .join("");
  for (const row of $("v2-sections").querySelectorAll("[data-rule-area]")) {
    const select = row.querySelector("[data-rule-selection]");
    const quota = row.querySelector("[data-rule-quota]");
    quota.disabled = select.value === "fixed";
    select.onchange = () => {
      quota.disabled = select.value === "fixed";
    };
  }
  $("v2-sections")
    .querySelectorAll("[data-remove-section]")
    .forEach(
      (b) =>
        (b.onclick = () => {
          captureSections();
          state.sections.splice(Number(b.dataset.removeSection), 1);
          renderSections();
        }),
    );
}
function setEditor(def, id = null) {
  state.editor = id;
  const f = $("v2-exam-editor");
  f.hidden = false;
  f.elements.total.value = def.totalQuestions;
  f.elements.correct.value = def.scoring?.correct ?? 20;
  f.elements.wrong.value = def.scoring?.wrong ?? 1.125;
  f.elements.blank.value = def.scoring?.blank ?? 0;
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
  $("v2-forms").value = Object.entries(def.forms || {})
    .map(([n, m]) => `${n}:${compact(m)}`)
    .join("\n");
}
function preset(value) {
  const editorId = state.editor;
  const total = value === "areas" ? 120 : value === "120" ? 120 : 100,
    areas =
      value === "areas"
        ? ["A", "B", "C", "D", "E"].map((code) => ({
            code,
            name: `Área ${code}`,
            requiredQuestions: 100,
          }))
        : [{ code: "GENERAL", name: "General", requiredQuestions: total }];
  setEditor(
    {
      totalQuestions: total,
      areas,
      sections: [
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
  $("v2-batches").innerHTML = table(
    ["Fecha", "Examen", "Origen", "Estado", "Acción"],
    batches.map((b) => [
      esc(stamp(b.created_at)),
      esc(
        state.exams.find((e) => e.id === b.evaluation_id)?.titulo ||
          b.evaluation_id,
      ),
      esc(b.source.toUpperCase()),
      badge(b.status),
      `<button class="v2-link" data-batch="${b.id}">Abrir lote</button>`,
    ]),
  );
  $("v2-batches")
    .querySelectorAll("[data-batch]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          openBatch(b.dataset.batch).catch((e) => message(e.message, true))),
    );
  if (state.batch) await openBatch(state.batch.id);
}
async function openBatch(id) {
  const b = await api(`/api/v2/imports/${id}`);
  state.batch = b;
  const el = $("v2-batch-detail");
  el.hidden = false;
  el.innerHTML = `<div class="v2-card-title"><h3>Lote · ${esc(b.source.toUpperCase())}</h3>${badge(b.status)}</div>${b.error ? `<p class="v2-notice warning">${esc(b.error)}</p>` : ""}${["queued", "processing"].includes(b.status) ? "<p>Procesando en segundo plano. Esta vista se actualiza automáticamente.</p>" : ""}${
    b.result.pages
      ? table(
          ["Página", "Estudiante", "Marcas", "Incidencia", "Acción"],
          b.result.pages.map((p, i) => [
            `${i + 1} · ${esc(p.file)}`,
            esc(p.codigoEstudiante || "Sin identificar"),
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
    ["Código", "Área", "Versión", "Evaluables", "Puntaje"],
    (b.result.rows || []).map((r) => [
      esc(r.codigoEstudiante),
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
function reviewPage(index) {
  const b = state.batch,
    p = b.result.pages[index];
  showDialog(
    `Revisar cartilla · ${p.codigoEstudiante || "sin identificar"}`,
    `<div class="v2-scan-review"><div>${p.imageUrl ? `<a href="${esc(p.imageUrl)}" target="_blank" rel="noopener"><img src="${esc(p.imageUrl)}" alt="Cartilla escaneada; abrir para ampliar"></a>` : "<p>La página no se pudo identificar. Exclúyela con un motivo y vuelve a escanearla.</p>"}</div><form id="v2-review-form">${
      p.error
        ? `<p class="v2-notice warning">${esc(p.error)}</p>`
        : `<div class="v2-question-grid">${Object.entries(p.responses)
            .map(
              ([q, r]) =>
                `<label class="${["multiple", "uncertain"].includes(r.status) ? "doubt" : ""}">Pregunta ${q}<select data-review-question="${q}"><option value="?" ${r.status === "uncertain" ? "selected" : ""}>Revisar</option><option value="-" ${r.status === "blank" ? "selected" : ""}>Blanco</option>${["A", "B", "C", "D", "E"].map((o) => `<option value="${o}" ${r.status === "single" && r.options[0] === o ? "selected" : ""}>${o}</option>`).join("")}${r.status === "multiple" ? '<option value="MULTIPLE" selected>Marca doble</option>' : ""}</select></label>`,
            )
            .join("")}</div>`
    }<label>Motivo<input id="v2-review-reason" required minlength="5" placeholder="Revisado contra la cartilla física"></label>${p.error ? "" : '<button class="v2-button" type="submit">Confirmar revisión</button>'}<button class="v2-button danger" type="button" id="v2-review-exclude">Excluir esta página</button></form></div>`,
  );
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
        { reviewVersion: b.result.reviewVersion, reason, responses, exclude },
        "PATCH",
      ),
    );
    $("v2-dialog").close();
    await openBatch(b.id);
  };
  bind("v2-review-form", "submit", () => save(false));
  bind("v2-review-exclude", "click", () => save(true));
}
async function loadAttendance() {
  const date = $("v2-attendance-date").value || today(),
    cycle = $("v2-attendance-cycle").value;
  const data = await api(
    `/api/v2/attendance?date=${date}&ciclo=${encodeURIComponent(cycle)}`,
  );
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
  $("v2-attendance-export").href =
    `/api/v2/attendance/excel?date=${date}&ciclo=${encodeURIComponent(cycle)}`;
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
  const view = document.createElement("div");
  view.id = "vista-v2";
  view.className = "vista-content";
  view.style.display = "none";
  view.innerHTML = await (await fetch("/pages/v2-panel.html")).text();
  document.querySelector("body > .container")?.append(view);
  if (!view.isConnected) document.querySelector(".container").append(view);
  const nav = document.querySelector(".nav-links");
  nav.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (
      b &&
      !["btn-vista-v2", "btn-vista-guia", "btn-vista-whatsapp"].includes(b.id)
    )
      document.querySelector(".hero-header").hidden = false;
  });
  for (const [id, text] of [
    ["btn-vista-v2", "SIMULACROS"],
    ["btn-vista-guia", "GUÍA"],
  ]) {
    const button = document.createElement("button");
    button.id = id;
    button.className = "nav-button";
    button.textContent = text;
    nav.insertBefore(button, $("btn-logout"));
    button.onclick = () =>
      tab(
        id === "btn-vista-guia"
          ? "guide"
          : ["admin", "corrector", "docente"].includes(state.role)
            ? "exams"
            : "attendance",
      ).catch((e) => message(e.message, true));
  }
  $("btn-vista-evaluaciones").textContent = "TAREAS Y REPORTES";
  $("btn-vista-whatsapp").onclick = () =>
    tab("notifications").catch((e) => message(e.message, true));
  $("btn-vista-whatsapp").hidden = state.role !== "admin";
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
  bind("v2-guide-search", "input", renderGuides);
  bind("v2-guide-category", "change", renderGuides);
  bind("v2-contact-search", "input", renderContacts);
  bind("v2-attendance-load", "click", loadAttendance);
  bind("v2-refresh-batches", "click", loadBatches);
  bind("v2-refresh-notifications", "click", loadNotifications);
  bind("v2-reload", "click", async () => {
    await loadCycles();
    await loadStudents();
    await loadExams(state.selected?.id);
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
    preset("100");
    f.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  bind("v2-preset", "change", (e) => {
    if (e.target.value !== "custom") preset(e.target.value);
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
    captureSections();
    state.areas.push({
      code: String.fromCharCode(65 + state.areas.length),
      name: "Nueva área",
      requiredQuestions: Number($("v2-exam-editor").elements.total.value),
    });
    renderAreas();
    renderSections();
  });
  bind("v2-add-section", "click", () => {
    captureSections();
    state.sections.push({ name: "Nuevo curso", questions: [], rules: {} });
    renderSections();
  });
  bind("v2-cancel-edit", "click", () => ($("v2-exam-editor").hidden = true));
  bind("v2-exam-editor", "submit", async () => {
    const payload = collectEditor(),
      id = state.editor;
    const e = await api(
      id ? `/api/v2/exams/${id}` : "/api/v2/exams",
      json(payload, id ? "PUT" : "POST"),
    );
    state.editor = e.id;
    await loadExams(e.id);
    message(
      "Borrador guardado. Valida el examen cuando completes todas las claves y reglas.",
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
  bind("v2-print", "click", () => {
    const e = state.selected;
    const q = new URLSearchParams({ form: $("v2-sheet-form").value });
    if ($("v2-sheet-student").value) q.set("code", $("v2-sheet-student").value);
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
  bind("v2-kiosk", "click", async () => {
    const r = await api("/api/v2/kiosk-token", json({}));
    $("v2-kiosk-output").hidden = false;
    $("v2-kiosk-output").textContent = r.token;
    message(r.mensaje);
  });
  bind("v2-backup", "click", async () => {
    const r = await api("/api/v2/backup", json({}));
    $("v2-backup-result").innerHTML =
      `<p>${esc(r.mensaje)}</p><a href="/api/v2/backups/${encodeURIComponent(r.filename)}" class="v2-button secondary">Descargar copia</a>`;
  });
  bind("v2-save-template", "click", async () => {
    const name = prompt("Nombre de la plantilla");
    if (!name) return;
    await api(
      "/api/v2/templates",
      json({ name, definition: collectEditor().definition }),
    );
    await loadTemplates();
    message("Plantilla guardada.");
  });
  bind("v2-template-select", "change", (e) => {
    const t = state.templates.find((t) => t.id === e.target.value);
    if (t) setEditor(t.definition);
  });
  bind("v2-export-structure", "click", () => {
    const blob = new Blob(
        [JSON.stringify(collectEditor().definition, null, 2)],
        { type: "application/json" },
      ),
      a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "estructura-ingemat.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  bind("v2-import-structure", "change", async (e) => {
    const file = e.target.files[0];
    if (!file || file.size > 1024 * 1024)
      throw new Error("Selecciona una estructura JSON de hasta 1 MB.");
    const definition = JSON.parse(await file.text());
    if (!definition.areas || !definition.sections)
      throw new Error("El archivo no contiene una estructura de examen.");
    setEditor(definition);
    message("Estructura cargada. Revísala y guarda un nuevo examen.");
  });
  bind("v2-revise", "click", reviseKeysDialog);
  const summary = await api("/api/v2/summary");
  const stats = document.createElement("div");
  stats.className = "v2-stats";
  stats.innerHTML = [
    [summary.usuarios, "Usuarios"],
    [summary.asistencias, "Ingresos de hoy"],
    [summary.evaluaciones, "Evaluaciones"],
    [summary.imports, "Lotes pendientes"],
  ]
    .map(
      ([n, label]) =>
        `<div class="v2-stat"><strong>${n}</strong><span>${label}</span></div>`,
    )
    .join("");
  $("vista-principal").prepend(stats);
  if (session.usuario.mustChangePassword) {
    const warning = document.createElement("div");
    warning.className = "v2-notice warning";
    warning.textContent =
      "Tu contraseña es temporal. Cámbiala en Inicio antes de continuar con la operación diaria.";
    $("vista-principal").prepend(warning);
  }
  const guideButton = document.createElement("button");
  guideButton.className = "v2-button secondary";
  guideButton.textContent = "Abrir guía completa · 34 tutoriales";
  guideButton.onclick = () => tab("guide");
  $("vista-principal").prepend(guideButton);
  state.poll = setInterval(() => {
    if (
      state.tab === "imports" &&
      !document.hidden &&
      $("vista-v2").style.display !== "none"
    )
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
  showDialog(
    "Revisar claves y recalcular",
    `<form id="v2-revise-form"><p>Se creará una revisión y se recalificarán todas las respuestas. El resultado anterior se conserva y el examen vuelve a Listo.</p><label>Claves corregidas<textarea id="v2-revision-keys" rows="9" required>${esc(
      Object.entries(e.definition.keys)
        .map(([n, k]) => `${n},${k.answers.join("/")}`)
        .join("\n"),
    )}</textarea></label><label>Preguntas anuladas<input id="v2-revision-void" value="${esc(
      compact(
        Object.keys(e.definition.keys)
          .filter((q) => e.definition.keys[q].voidPolicy)
          .map(Number),
      ),
    )}"></label><label>Regla de anulación<select id="v2-revision-policy"><option value="credit">Otorgar puntos</option><option value="exclude">Excluir del puntaje</option></select></label><label>Motivo<input id="v2-revision-reason" required minlength="5"></label><button type="submit" class="v2-button">Confirmar revisión y recalcular</button></form>`,
  );
  bind("v2-revise-form", "submit", async () => {
    const values = keyValues($("v2-revision-keys").value),
      annulled = new Set(expand($("v2-revision-void").value)),
      keys = structuredClone(e.definition.keys);
    for (const [q, k] of Object.entries(keys)) {
      k.answers = (values[q] || "").toUpperCase().split("/").filter(Boolean);
      k.voidPolicy = annulled.has(Number(q))
        ? $("v2-revision-policy").value
        : null;
    }
    await api(
      `/api/v2/exams/${e.id}/revise-keys`,
      json({ keys, reason: $("v2-revision-reason").value }),
    );
    $("v2-dialog").close();
    await loadExams(e.id);
    message(
      "Nueva revisión aplicada. Comprueba las notas antes de volver a publicar.",
    );
  });
}
initialize().catch((error) => {
  console.error(error);
  if ($("v2-message")) message(error.message, true);
});
