import {
  cargarUsuarios,
  initUserFormEvents,
  cargarHorarios,
  filterArchivedStudents,
} from "./admin/users.js";
import {
  cargarArchivosExcel,
  initModalEvents,
  cargarCiclos,
} from "./admin/excel-preview.js";
import { initBibliotecaAdmin } from "./admin/biblioteca-admin.js";
import {
  initEvaluacionesAdmin,
  cargarDatosEvaluaciones,
} from "./admin/evaluaciones-admin.js";
import { v2Ready, openV2Panel, openV2Guide } from "./admin/v2.js";
import "./admin/forms.js";

const $ = (id) => document.getElementById(id);
const all = ["admin", "corrector", "docente", "recepcion"],
  academic = ["admin", "corrector", "docente"];
const routes = {
  overview: {
    title: "Resumen",
    group: "Vista general",
    description: "La jornada de tu academia, en un solo lugar.",
    guide: "primer-inicio",
    roles: all,
  },
  attendance: {
    title: "Asistencia",
    group: "Control diario",
    description:
      "Consulta los ingresos, revisa tardanzas y exporta el registro de cada jornada.",
    guide: "asistencia",
    roles: all,
    v2: true,
  },
  archives: {
    title: "Archivos históricos",
    group: "Asistencia",
    description:
      "Consulta los registros Excel conservados de la instalación anterior.",
    guide: "excel-asistencia",
    roles: all,
  },
  people: {
    title: "Estudiantes y docentes",
    group: "Personas",
    description:
      "Mantén el directorio actualizado y genera los carnets de tu academia.",
    guide: "usuarios",
    roles: all,
  },
  exams: {
    title: "Simulacros",
    group: "Académico",
    description:
      "Prepara el examen, imprime cartillas y consulta los resultados por curso y área.",
    guide: "simulacro-120",
    roles: academic,
    v2: true,
  },
  imports: {
    title: "Lectura de cartillas",
    group: "Académico",
    description:
      "Carga un lote, revisa las incidencias y confirma sus calificaciones.",
    guide: "escanear-lote",
    roles: ["admin", "corrector"],
    v2: true,
  },
  tests: {
    title: "Tests y prácticas",
    group: "Académico",
    description:
      "Registra evaluaciones con nota directa y consulta sus resultados.",
    guide: "tareas",
    roles: ["admin", "corrector"],
  },
  tasks: {
    title: "Tareas",
    group: "Académico",
    description:
      "Registra entregas y calificaciones por estudiante, curso y semana.",
    guide: "tareas",
    roles: ["admin", "docente"],
  },
  reports: {
    title: "Reportes académicos",
    group: "Académico",
    description:
      "Consulta el seguimiento individual, los consolidados semanales y los rankings.",
    guide: "reporte-alumno",
    roles: academic,
  },
  library: {
    title: "Biblioteca",
    group: "Gestión",
    description:
      "Organiza el catálogo y lleva el control de préstamos y devoluciones.",
    guide: "biblioteca",
    roles: all,
  },
  notifications: {
    title: "Comunicación",
    group: "Gestión",
    description:
      "Vincula WhatsApp con Baileys y comprueba sus estados de entrega.",
    guide: "whatsapp-configurar",
    roles: ["admin"],
    v2: true,
  },
  cycles: {
    title: "Ciclos y horarios",
    group: "Configuración",
    description:
      "Define los ciclos de la academia y los horarios que utiliza la asistencia.",
    guide: "ciclos",
    roles: ["admin"],
  },
  website: {
    title: "Página pública",
    group: "Gestión",
    description:
      "Actualiza los ciclos publicados y las imágenes de ingresantes.",
    guide: "web-publica",
    roles: ["admin"],
  },
  settings: {
    title: "Cuentas y respaldo",
    group: "Configuración",
    description:
      "Administra accesos, conserva copias de seguridad y revisa la actividad.",
    guide: "roles",
    roles: ["admin"],
    v2: true,
  },
  account: {
    title: "Mi cuenta",
    group: "Acceso personal",
    description: "Actualiza tu contraseña y protege tu acceso a la academia.",
    guide: "roles",
    roles: all,
  },
  guide: {
    title: "Guía y tutoriales",
    group: "Centro de ayuda",
    description:
      "Encuentra instrucciones para cada tarea y resuelve tus dudas paso a paso.",
    guide: "primer-inicio",
    roles: all,
    v2: true,
  },
};
let session,
  current = "overview",
  initialized = false,
  routeVersion = 0;
const roleNames = {
  admin: "Administración",
  corrector: "Corrección",
  docente: "Docencia",
  recepcion: "Recepción",
};
function notify(text, error = false) {
  $("app-message").hidden = false;
  $("app-message").textContent = text;
  $("app-message").classList.toggle("warning", error);
}
function allowed(route) {
  return routes[route]?.roles.includes(session?.usuario.role);
}
function closeMenu() {
  document.querySelector(".app-workspace").inert = false;
  document.body.classList.remove("menu-open");
  $("sidebar-toggle").setAttribute("aria-expanded", "false");
  $("sidebar-backdrop").hidden = true;
  if (matchMedia("(max-width: 960px)").matches) $("admin-sidebar").inert = true;
}
function toggleMenu() {
  const open = !document.body.classList.contains("menu-open");
  document.body.classList.toggle("menu-open", open);
  $("sidebar-toggle").setAttribute("aria-expanded", String(open));
  $("sidebar-backdrop").hidden = !open;
  $("admin-sidebar").inert = !open;
  document.querySelector(".app-workspace").inert = open;
  if (open) $("admin-sidebar").querySelector("[aria-current=page]")?.focus();
}
function activate(route, v2 = false) {
  const config = routes[route];
  current = route;
  for (const pane of document.querySelectorAll("[data-page]"))
    pane.hidden = pane.dataset.page !== route;
  $("vista-v2").hidden = !v2;
  for (const link of document.querySelectorAll("[data-route]")) {
    if (link.dataset.route === route) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  $("page-title").textContent = config.title;
  $("page-description").textContent = config.description;
  $("page-eyebrow").textContent = config.group;
  $("page-breadcrumb").textContent = config.title;
  document.title = `${config.title} · INGEMAT`;
  $("app-message").hidden = true;
  closeMenu();
}
window.ingematAdmin = {
  activateV2(route) {
    if (!allowed(route)) return;
    activate(route, true);
    if (location.hash !== `#${route}`) history.pushState({}, "", `#${route}`);
  },
};
async function navigate(route, update = true) {
  if (!initialized) return;
  if (!allowed(route)) route = "overview";
  const version = ++routeVersion;
  if (update && location.hash !== `#${route}`)
    history.pushState({}, "", `#${route}`);
  activate(route, !!routes[route].v2);
  $("main-content").setAttribute("aria-busy", "true");
  try {
    if (routes[route].v2) await openV2Panel(route);
    else if (route === "overview") await loadOverview();
    else if (route === "people") {
      await cargarUsuarios(true);
      filterPeople();
    } else if (route === "cycles") {
      await cargarCiclos();
      await cargarHorarios();
    } else if (route === "archives") await cargarArchivosExcel();
    else if (route === "library") await initBibliotecaAdmin();
    else if (["tasks", "reports", "tests"].includes(route)) {
      initEvaluacionesAdmin();
      await cargarDatosEvaluaciones();
    }
    if (version === routeVersion) {
      window.scrollTo({ top: 0, behavior: "instant" });
      $("page-title").focus({ preventScroll: true });
    }
  } catch (error) {
    if (version === routeVersion) notify(error.message, true);
  } finally {
    if (version === routeVersion)
      $("main-content").setAttribute("aria-busy", "false");
  }
}
async function loadOverview() {
  const response = await fetch("/api/v2/summary");
  if (!response.ok) throw new Error("No se pudo cargar el resumen.");
  const summary = await response.json();
  const values = [
    [
      summary.usuarios,
      "Personas registradas",
      "Estudiantes y docentes",
      "people",
    ],
    [
      summary.asistencias,
      "Ingresos de hoy",
      "Registro de la jornada",
      "calendar-check",
    ],
    [
      summary.evaluaciones,
      "Evaluaciones",
      "Simulacros y prácticas",
      "journal-check",
    ],
    [
      summary.imports,
      "Lotes por revisar",
      "Pendientes de lectura o revisión",
      "upc-scan",
    ],
  ];
  $("overview-stats").replaceChildren(
    ...values.map(([value, label, help, icon]) => {
      const card = document.createElement("div");
      card.className = "stat-card";
      const top = document.createElement("div");
      top.className = "stat-label";
      const span = document.createElement("span");
      span.textContent = label;
      const i = document.createElement("i");
      i.className = `bi bi-${icon}`;
      i.setAttribute("aria-hidden", "true");
      top.append(span, i);
      const number = document.createElement("strong");
      number.textContent = value;
      const sub = document.createElement("small");
      sub.textContent = help;
      card.append(top, number, sub);
      return card;
    }),
  );
}
function localTab(button) {
  const nav = button.closest(".local-tabs");
  const owner = nav.parentElement;
  for (const candidate of nav.querySelectorAll("[data-local-tab]")) {
    candidate.setAttribute("aria-selected", String(candidate === button));
    candidate.tabIndex = candidate === button ? 0 : -1;
  }
  for (const panel of owner.querySelectorAll(":scope > [data-local-panel]"))
    panel.hidden = panel.dataset.localPanel !== button.dataset.localTab;
}
let peopleFilterActive = false;
const peopleFilterState = new WeakMap();
function filterPeople() {
  const query = $("people-search")
    .value.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  let count = 0;
  for (const group of $("vista-usuarios-list").querySelectorAll(
    ".accordion-item",
  )) {
    const header = group.querySelector(".accordion-header"),
      content = group.querySelector(".accordion-content");
    if (query && !peopleFilterState.has(group))
      peopleFilterState.set(group, {
        active: header.classList.contains("active"),
        show: content.classList.contains("show"),
        panels: [...group.querySelectorAll(".turno-panel")].map((panel) => [
          panel,
          panel.style.display,
        ]),
      });
    if (!query && peopleFilterActive && peopleFilterState.has(group)) {
      const saved = peopleFilterState.get(group);
      header.classList.toggle("active", saved.active);
      header.setAttribute("aria-expanded", String(saved.active));
      content.classList.toggle("show", saved.show);
      for (const [panel, display] of saved.panels)
        panel.style.display = display;
      peopleFilterState.delete(group);
    }
    const tabs = group.querySelector(".turno-tabs");
    if (tabs) tabs.hidden = !!query;
    let matches = 0;
    for (const row of group.querySelectorAll("li")) {
      const text = row.textContent
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
      row.hidden = !!query && !text.includes(query);
      if (!row.hidden) matches++;
    }
    group.hidden = !!query && !matches;
    count += matches;
    if (query && matches) {
      header.classList.add("active");
      header.setAttribute("aria-expanded", "true");
      group.querySelector(".accordion-content").classList.add("show");
      for (const panel of group.querySelectorAll(".turno-panel"))
        panel.style.display = "block";
    }
  }
  peopleFilterActive = !!query;
  $("people-search-status").textContent = query
    ? `${count} coincidencia${count === 1 ? "" : "s"}`
    : "";
}
// Native dialogs and retained modal windows share keyboard and focus behavior.
function installModalBehavior() {
  let previousFocus = null;
  for (const modal of document.querySelectorAll(".modal")) {
    let wasShown = false;
    const close = modal.querySelector(".close-btn");
    if (close) {
      close.setAttribute("role", "button");
      close.tabIndex = 0;
      close.setAttribute("aria-label", "Cerrar ventana");
      close.addEventListener("keydown", (e) => {
        if (["Enter", " "].includes(e.key)) {
          e.preventDefault();
          close.click();
        }
      });
    }
    new MutationObserver(() => {
      const shown =
        modal.style.display !== "none" &&
        getComputedStyle(modal).display !== "none";
      if (shown === wasShown) return;
      wasShown = shown;
      if (shown) {
        previousFocus = document.activeElement;
        document.body.classList.add("modal-open");
        modal
          .querySelector('input:not([type=hidden]),button,[tabindex="0"]')
          ?.focus();
      } else {
        if (
          ![...document.querySelectorAll(".modal")].some(
            (m) => m.style.display !== "none",
          )
        ) {
          document.body.classList.remove("modal-open");
          document.body.style.overflow = "";
        }
        previousFocus?.focus();
      }
    }).observe(modal, { attributes: true, attributeFilter: ["style"] });
  }
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (document.body.classList.contains("menu-open")) {
        closeMenu();
        $("sidebar-toggle").focus();
      }
      for (const modal of document.querySelectorAll(".modal"))
        if (modal.style.display !== "none") modal.style.display = "none";
    }
    if (event.key === "Tab") {
      const modal = [...document.querySelectorAll(".modal")].find(
        (m) => m.style.display !== "none",
      );
      if (!modal) return;
      const nodes = [
        ...modal.querySelectorAll(
          'a[href],button,input,select,textarea,[tabindex="0"]',
        ),
      ].filter((n) => !n.disabled && n.getClientRects().length);
      const first = nodes[0],
        last = nodes.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  });
}
async function initialize() {
  session = await window.ingematSession;
  if (!session.usuario) {
    location.assign("/pages/admin-login.html");
    return;
  }
  document.body.dataset.accountRole = session.usuario.role;
  for (const link of document.querySelectorAll("[data-route]")) {
    if (routes[link.dataset.route]) link.hidden = !allowed(link.dataset.route);
  }
  for (const group of document.querySelectorAll(".nav-group"))
    if (![...group.querySelectorAll("[data-route]")].some((l) => !l.hidden))
      group.hidden = true;
  for (const node of document.querySelectorAll("[data-admin]"))
    node.hidden = session.usuario.role !== "admin";
  $("account-name").textContent = session.usuario.username;
  $("account-role").textContent = roleNames[session.usuario.role];
  $("account-avatar").textContent = session.usuario.username
    .slice(0, 1)
    .toUpperCase();
  $("app-timezone").textContent = session.timezone;
  $("topbar-date").textContent = new Intl.DateTimeFormat("es-PE", {
    dateStyle: "medium",
    timeZone: session.timezone,
  }).format(new Date());
  $("sidebar-toggle").onclick = toggleMenu;
  $("sidebar-close").onclick = () => {
    closeMenu();
    $("sidebar-toggle").focus();
  };
  $("sidebar-backdrop").onclick = () => {
    closeMenu();
    $("sidebar-toggle").focus();
  };
  const media = matchMedia("(max-width: 960px)");
  const adapt = () => {
    $("admin-sidebar").inert =
      media.matches && !document.body.classList.contains("menu-open");
  };
  media.addEventListener("change", () => {
    closeMenu();
    adapt();
  });
  adapt();
  $("btn-logout").onclick = async () => {
    await fetch("/admin/logout", { method: "POST" });
    location.assign("/admin");
  };
  $("page-help").onclick = () => openV2Guide(routes[current].guide);
  $("people-create").onclick = () => {
    $("create-user-dialog").showModal();
    $("codigo").focus();
  };
  $("people-search").addEventListener("input", filterPeople);
  $("archived-student-search").addEventListener("input", filterArchivedStudents);
  document.addEventListener("click", (event) => {
    const close = event.target.closest("[data-close-dialog]");
    if (close) $(close.dataset.closeDialog).close();
    const link = event.target.closest("[data-route]");
    if (link) {
      event.preventDefault();
      navigate(link.dataset.route);
    }
    const tab = event.target.closest("[data-local-tab]");
    if (tab) localTab(tab);
  });
  document.addEventListener("keydown", (event) => {
    const tab = event.target.closest("[role=tab][data-local-tab]");
    if (tab && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const tabs = [...tab.parentElement.querySelectorAll("[role=tab]")];
      const index =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? tabs.length - 1
            : (tabs.indexOf(tab) +
                (event.key === "ArrowRight" ? 1 : -1) +
                tabs.length) %
              tabs.length;
      tabs[index].focus();
      localTab(tabs[index]);
    }
  });
  initModalEvents();
  installModalBehavior();
  await cargarUsuarios(true);
  initUserFormEvents();
  await cargarCiclos();
  await cargarHorarios();
  if ($("justificar-fecha"))
    $("justificar-fecha").value = window.ingematToday();
  if (session.usuario.mustChangePassword) {
    const warning = document.createElement("div");
    warning.id = "password-warning";
    warning.className = "notice warning";
    warning.append("Tu contraseña es temporal. ");
    const link = document.createElement("a");
    link.href = "#account";
    link.dataset.route = "account";
    link.textContent = "Actualízala desde Mi cuenta.";
    warning.append(link);
    $("vista-principal").prepend(warning);
  }
  await v2Ready;
  $("page-title").tabIndex = -1;
  for (const nav of document.querySelectorAll('.local-tabs[role="tablist"]')) {
    const owner = nav.parentElement;
    for (const [index, button] of [
      ...nav.querySelectorAll("[data-local-tab]"),
    ].entries()) {
      button.id ||= `tab-${button.dataset.localTab}`;
      button.tabIndex =
        button.getAttribute("aria-selected") === "true" ? 0 : -1;
      const panel = [
        ...owner.querySelectorAll(":scope > [data-local-panel]"),
      ].find((p) => p.dataset.localPanel === button.dataset.localTab);
      if (panel) {
        panel.id ||= `panel-${button.dataset.localTab}`;
        panel.setAttribute("role", "tabpanel");
        panel.setAttribute("aria-labelledby", button.id);
        button.setAttribute("aria-controls", panel.id);
      }
    }
  }
  initialized = true;
  window.addEventListener("popstate", () =>
    navigate(location.hash.slice(1) || "overview", false),
  );
  window.addEventListener("hashchange", () => {
    if (location.hash.slice(1) !== current)
      navigate(location.hash.slice(1) || "overview", false);
  });
  window.addEventListener("peopleUpdated", (event) => {
    filterPeople();
    loadOverview();
    if (event.detail?.message) notify(event.detail.message);
  });
  window.addEventListener("cyclesUpdated", async () => {
    await cargarCiclos();
    await cargarHorarios();
  });
  await navigate(location.hash.slice(1) || "overview", false);
  document.body.dataset.ready = "true";
}
initialize().catch((error) => {
  console.error(error);
  notify("No se pudo preparar el panel. " + error.message, true);
});
