import { mountManualStudentSearch } from "./admin/manual-student-search.js";
import { mountReceptionCamera } from "./reception-camera.js";
import {
  mountSearchSuggestions,
  normalizeSearchText,
} from "./search-suggestions.js";

const $ = (id) => document.getElementById(id);
const tabs = [...document.querySelectorAll("[data-method]")];
const modeNames = tabs.map((tab) => tab.dataset.method);
const signInUrl = "/pages/admin-login.html?destino=recepcion";
const codeInput = $("codigo");
const searchInput = $("reception-student-search");
const bookInput = $("codigo-libro-input");
const borrowerInput = $("codigo-estudiante-input");
const attendanceResult = $("resultado");
const loanResult = $("resultado-prestamo");
const studentSubmit = $("reception-register-student");
let mode;
let attendanceBusy = false;
let loanBusy = false;
let students;
let studentsLoading = false;
let books;
let catalogRequest;

const codeOf = (value) => value.trim().toUpperCase();
const modes = [...modeNames, "prestamos"];
const getHashMode = () => {
  const hash = window.location.hash.slice(1);
  return modes.includes(hash) ? hash : "asistencia";
};

async function requestJson(url, options) {
  let response;
  try {
    response = await fetch(url, options);
  } catch {
    throw new Error("No se pudo conectar con INGEMAT. Vuelve a intentarlo.");
  }
  const data = await response.json().catch(() => null);
  if (response.status === 401) {
    const error = new Error("Tu sesión terminó. Inicia sesión para continuar.");
    error.signIn = true;
    throw error;
  }
  if (!response.ok || !data || data.exito === false)
    throw new Error(
      data?.mensaje ||
        "No se pudo completar la operación. Vuelve a intentarlo.",
    );
  return data;
}

const post = (url, body) =>
  requestJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

function node(tag, className, content) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (content) element.textContent = content;
  return element;
}

function icon(name) {
  const element = node("i", `bi ${name}`);
  element.setAttribute("aria-hidden", "true");
  return element;
}

function renderResult(
  root,
  { state, title, name, detail, facts = [], signIn },
) {
  const icons = {
    pending: "bi-hourglass-split",
    success: "bi-check-lg",
    error: "bi-exclamation-lg",
  };
  const content = node("div", "station-result-content");
  const symbol = node("span", "station-result-icon");
  symbol.append(icon(icons[state]));
  content.append(symbol, node("p", "station-result-title", title));
  if (name) content.append(node("p", "station-result-name", name));
  if (detail) content.append(node("p", "station-result-detail", detail));
  if (signIn) {
    const link = node("a", "", "Iniciar sesión");
    link.href = signInUrl + window.location.hash;
    content.append(link);
  }
  const list = node("dl", "station-result-meta");
  for (const [label, value, tone] of facts) {
    if (!value) continue;
    const pair = node("div");
    const term = node("dd", "", value);
    if (tone) term.dataset.tone = tone;
    pair.append(node("dt", "", label), term);
    list.append(pair);
  }
  if (list.childElementCount) content.append(list);
  root.dataset.state = state;
  root.replaceChildren(content);
}

function fieldError(input, errorId, message = "") {
  $(errorId).textContent = message;
  if (message) input.setAttribute("aria-invalid", "true");
  else input.removeAttribute("aria-invalid");
}

function restoreInputFocus(input, expectedMode) {
  const focused = document.activeElement;
  if (
    mode === expectedMode &&
    (focused === document.body || input.form.contains(focused))
  )
    input.focus({ preventScroll: true });
}

function setAttendanceBusy(busy) {
  attendanceBusy = busy;
  codeInput.readOnly = busy;
  searchInput.readOnly = busy;
  $("registrar-btn").disabled = busy;
  studentSubmit.disabled = busy || !studentSearch.isSelected();
  if (busy) studentSearch.close();
}

const attendanceStatuses = {
  puntual: ["Puntual", "success"],
  tolerancia: ["Tolerancia", "warning"],
  tarde: ["Tarde", "late"],
  justificada: ["Justificada", "warning"],
  registrado: ["Registrado", "success"],
};

function showAttendanceResult(result, method) {
  renderResult(attendanceResult, result);
  const link = $("camera-result-link");
  link.hidden = method !== "camara" || result.state === "pending";
  link.dataset.state = result.state;
  link.firstElementChild.textContent = result.title;
  link.setAttribute("aria-label", `${result.title}. Ver resultado`);
}

async function recordAttendance(code, method) {
  setAttendanceBusy(true);
  showAttendanceResult(
    {
      state: "pending",
      title: "Registrando asistencia…",
    },
    method,
  );
  try {
    const data = await post("/api/registrar", { codigo: code });
    const [status, tone] =
      attendanceStatuses[data.estado] || attendanceStatuses.registrado;
    showAttendanceResult(
      {
        state: "success",
        title: "Asistencia registrada",
        name: data.nombre,
        detail: data.mensajeAdicional,
        facts: [
          ["Estado", status, tone],
          ["Hora", data.hora],
          ["Ciclo", data.ciclo],
          data.rol === "docente"
            ? ["Perfil", "Docente"]
            : ["Turno", data.turno],
        ],
      },
      method,
    );
    if (method === "asistencia") codeInput.value = "";
    if (method === "alumno") studentSearch.reset();
  } catch (error) {
    showAttendanceResult(
      {
        state: "error",
        title: "No se registró la asistencia",
        detail: error.message,
        signIn: error.signIn,
      },
      method,
    );
  } finally {
    setAttendanceBusy(false);
    if (method === "asistencia") restoreInputFocus(codeInput, method);
    if (method === "alumno") restoreInputFocus(searchInput, method);
  }
}

const studentSearch = mountManualStudentSearch({
  input: searchInput,
  hidden: $("reception-student-code"),
  list: $("reception-student-results"),
  summary: $("reception-student-selected"),
  getStudents: () => students,
  showOnEmpty: false,
  emptyMessage: "No hay estudiantes que coincidan con la búsqueda.",
  onChange: () => {
    studentSubmit.disabled = attendanceBusy || !studentSearch.isSelected();
  },
});

async function loadStudents() {
  if (students || studentsLoading) return;
  studentsLoading = true;
  $("student-retry").hidden = true;
  $("student-load-status").textContent = "Cargando estudiantes…";
  try {
    const data = await requestJson("/api/v2/attendance/students", {
      cache: "no-store",
    });
    if (!Array.isArray(data))
      throw new Error("No se pudo cargar la lista de estudiantes.");
    students = data;
    searchInput.disabled = false;
    $("student-load-status").textContent = students.length
      ? ""
      : "No hay estudiantes disponibles.";
  } catch (error) {
    $("student-load-status").textContent = error.message;
    $("student-retry").hidden = false;
  } finally {
    studentsLoading = false;
  }
}

$("attendance-code-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (attendanceBusy) return;
  const code = codeOf(codeInput.value);
  if (!code) {
    fieldError(codeInput, "code-error", "Ingresa el código del carné.");
    codeInput.focus();
    return;
  }
  fieldError(codeInput, "code-error");
  void recordAttendance(code, "asistencia");
});
codeInput.addEventListener("input", () => fieldError(codeInput, "code-error"));

$("attendance-search-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!attendanceBusy && studentSearch.isSelected())
    void recordAttendance($("reception-student-code").value, "alumno");
});
$("student-retry").addEventListener("click", loadStudents);

const bookNote = $("libro-selected-preview");
const bookSearch = mountSearchSuggestions({
  input: bookInput,
  list: $("libro-search-dropdown"),
  onEdit() {
    bookNote.textContent = "";
    fieldError(bookInput, "book-error");
  },
  onEmpty(empty) {
    if (books?.length && empty)
      bookNote.textContent =
        "No hay coincidencias. Si conoces el código, puedes ingresarlo directamente.";
  },
  suggestions(query) {
    return (books || [])
      .filter((book) =>
        normalizeSearchText(
          [book.codigo, book.titulo, book.editorial, book.seccion].join(" "),
        ).includes(query),
      )
      .slice(0, 10)
      .map((book) => ({
        code: book.codigo,
        value: book,
        label: book.titulo,
        detail: [
          book.codigo,
          book.editorial,
          book.seccion,
          book.estado === "disponible"
            ? "Disponible"
            : "Sin ejemplares disponibles",
        ]
          .filter(Boolean)
          .join(" · "),
      }));
  },
  onSelect(book) {
    bookInput.value = book.codigo;
    bookNote.textContent = `${book.titulo} (${book.codigo})`;
    fieldError(bookInput, "book-error");
    borrowerInput.focus();
  },
});

async function loadBooks() {
  if (books || catalogRequest) return;
  const request = requestJson("/api/biblioteca", { cache: "no-store" });
  catalogRequest = request;
  const catalogStatus = $("book-catalog-status");
  catalogStatus.textContent = "Cargando catálogo…";
  try {
    const data = await request;
    if (catalogRequest !== request) return;
    if (!Array.isArray(data.libros))
      throw new Error("El catálogo no está disponible.");
    books = data.libros;
    catalogStatus.textContent = books.length
      ? ""
      : "Aún no hay libros en el catálogo.";
    if (document.activeElement === bookInput) bookSearch.refresh();
  } catch {
    if (catalogRequest === request)
      catalogStatus.textContent =
        "El catálogo no se pudo cargar. Puedes ingresar el código del libro.";
  } finally {
    if (catalogRequest === request) catalogRequest = undefined;
  }
}

bookInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.isComposing || event.defaultPrevented)
    return;
  event.preventDefault();
  if (loanBusy) return;
  if (!codeOf(bookInput.value)) {
    fieldError(bookInput, "book-error", "Ingresa o busca el código del libro.");
    return;
  }
  borrowerInput.focus();
});
borrowerInput.addEventListener("input", () =>
  fieldError(borrowerInput, "borrower-error"),
);

$("loan-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (loanBusy) return;
  const codigoLibro = codeOf(bookInput.value);
  const codigoUsuario = codeOf(borrowerInput.value);
  fieldError(
    bookInput,
    "book-error",
    codigoLibro ? "" : "Ingresa o busca el código del libro.",
  );
  fieldError(
    borrowerInput,
    "borrower-error",
    codigoUsuario ? "" : "Ingresa el código del estudiante.",
  );
  if (!codigoLibro || !codigoUsuario) {
    (codigoLibro ? borrowerInput : bookInput).focus();
    return;
  }
  loanBusy = true;
  bookInput.readOnly = true;
  borrowerInput.readOnly = true;
  $("btn-submit-prestamo").disabled = true;
  bookSearch.close();
  renderResult(loanResult, {
    state: "pending",
    title: "Registrando préstamo…",
  });
  try {
    const data = await post("/api/biblioteca/prestamo", {
      codigoLibro,
      codigoUsuario,
    });
    renderResult(loanResult, {
      state: "success",
      title: "Préstamo registrado",
      name: data.libro.titulo,
      facts: [
        ["Estudiante", data.usuario.nombre],
        ["Hora", data.prestamo.fechaPrestamo],
        ["Código del libro", data.libro.codigo],
        ["Ciclo", data.usuario.ciclo],
      ],
    });
    bookInput.value = "";
    borrowerInput.value = "";
    bookNote.textContent = "";
    books = undefined;
    catalogRequest = undefined;
    if (mode === "prestamos") void loadBooks();
  } catch (error) {
    renderResult(loanResult, {
      state: "error",
      title: "No se registró el préstamo",
      detail: error.message,
      signIn: error.signIn,
    });
  } finally {
    loanBusy = false;
    bookInput.readOnly = false;
    borrowerInput.readOnly = false;
    $("btn-submit-prestamo").disabled = false;
    if (!bookInput.value) restoreInputFocus(bookInput, "prestamos");
  }
});

const camera = mountReceptionCamera({
  frame: $("station-camera"),
  reader: $("reader"),
  status: $("camera-status"),
  startButton: $("camera-start"),
  stopButton: $("camera-stop"),
  onCode(code) {
    if (mode !== "camara" || attendanceBusy) return false;
    void recordAttendance(code, "camara");
    return true;
  },
});
$("camera-result-link").addEventListener("click", () => {
  $("attendance-result-heading").focus();
});

function updateMode() {
  const previous = mode;
  const focused = document.activeElement;
  mode = getHashMode();
  if (previous === mode) return;
  if (previous === "camara") void camera.stop();
  if (previous === "alumno") studentSearch.close();
  if (previous === "prestamos") bookSearch.close();
  const isLoan = mode === "prestamos";
  $("attendance-view").hidden = isLoan;
  $("loans-view").hidden = !isLoan;
  if (isLoan) {
    $("station-attendance-link").removeAttribute("aria-current");
    $("station-loans-link").setAttribute("aria-current", "page");
  } else {
    $("station-loans-link").removeAttribute("aria-current");
    $("station-attendance-link").setAttribute("aria-current", "page");
  }
  const title = $("station-title");
  title.textContent = isLoan ? "Registrar préstamo" : "Registrar asistencia";
  $("station-intro").textContent = isLoan
    ? "Registra la entrega de libros a estudiantes."
    : "Ingreso de estudiantes y docentes.";
  tabs.forEach((tab) => {
    const active = tab.dataset.method === (isLoan ? "asistencia" : mode);
    tab.tabIndex = active ? 0 : -1;
    tab.setAttribute("aria-selected", String(active));
    $(tab.getAttribute("aria-controls")).hidden = !active;
  });
  if (previous && (previous === "prestamos") !== isLoan) title.focus();
  else if (focused.closest('[role="tabpanel"][hidden]'))
    tabs.find((tab) => tab.dataset.method === mode)?.focus();
  if (mode === "alumno") void loadStudents();
  if (isLoan) void loadBooks();
}

tabs.forEach((tab, index) => {
  tab.addEventListener("click", () => {
    window.location.hash = tab.dataset.method;
  });
  tab.addEventListener("keydown", (event) => {
    const nextTab = {
      ArrowLeft: (index - 1 + tabs.length) % tabs.length,
      ArrowRight: (index + 1) % tabs.length,
      Home: 0,
      End: tabs.length - 1,
    }[event.key];
    if (nextTab === undefined) return;
    event.preventDefault();
    tabs[nextTab].focus();
    tabs[nextTab].click();
  });
});

document.querySelector(".station-skip").addEventListener("click", (event) => {
  event.preventDefault();
  $("station-main").focus();
});

function showAccess(message, label, href = signInUrl + window.location.hash) {
  $("station-access-message").textContent = message;
  const button = $("station-access-link");
  button.href = href;
  button.replaceChildren(label, icon("bi-arrow-right"));
  button.hidden = false;
}

async function init() {
  try {
    const session = await window.ingematSession;
    const user = session.usuario;
    if (!["admin", "recepcion"].includes(user?.role)) {
      showAccess(
        "Una cuenta de Recepción o Administración puede registrar asistencias y préstamos.",
        user ? "Cambiar de cuenta" : "Iniciar sesión",
      );
      return;
    }
    if (user.mustChangePassword) {
      showAccess(
        "Cambia tu contraseña inicial en el panel para usar Recepción.",
        "Ir al panel",
        "/admin",
      );
      return;
    }
    const date = $("station-date");
    date.dateTime = window.ingematToday();
    date.textContent = new Intl.DateTimeFormat("es-PE", {
      dateStyle: "long",
      timeZone: "UTC",
    }).format(new Date(date.dateTime + "T12:00:00Z"));
    $("station-access").hidden = true;
    $("station-nav").hidden = false;
    $("station-operations").hidden = false;
    updateMode();
    window.addEventListener("hashchange", updateMode);
    if (
      mode === "asistencia" &&
      window.matchMedia("(pointer: fine)").matches &&
      document.activeElement === document.body
    )
      codeInput.focus({ preventScroll: true });
  } catch {
    showAccess(
      "No pudimos comprobar tu acceso. Revisa la conexión y vuelve a intentarlo.",
      "Reintentar",
      window.location.href,
    );
  }
}

void init();
