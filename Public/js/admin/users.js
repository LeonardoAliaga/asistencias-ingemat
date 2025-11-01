// Proyecto/Public/js/admin/users.js

import { initAccordion } from "./accordion.js";

/**
 * Crea la estructura HTML para los elementos de lista de usuarios.
 */
function crearListaUsuarios(usuarios, esDocente = false) {
  return usuarios
    .map((u) => {
      let infoAdicional = "";
      const diasAsistencia = u.dias_asistencia
        ? u.dias_asistencia.join(", ")
        : "";

      if (u.rol === "estudiante") {
        // 🚀 ESTUDIANTE: Muestra Turno y Días
        infoAdicional = ` (${u.turno}) (${diasAsistencia})`;
      } else if (u.rol === "docente") {
        // 🚀 DOCENTE: Muestra solo Días
        infoAdicional = ` (${diasAsistencia})`;
      }

      return `
            <li style="position:relative;">
              ${u.codigo} - ${u.nombre}${infoAdicional}
              <span class="btn-eliminar" style="display:none;position:absolute;right:5px;cursor:pointer;color:red;font-weight:bold;">
                <i class="bi bi-x-circle-fill"></i>
              </span>
            </li>
          `;
    })
    .join("");
}

/**
 * Asigna eventos de eliminación a los botones de la lista.
 */
function agregarEventosEliminar() {
  document.querySelectorAll(".btn-eliminar").forEach((btn) => {
    btn.parentElement.onmouseenter = () => (btn.style.display = "inline");
    btn.parentElement.onmouseleave = () => (btn.style.display = "none");
    btn.onclick = async function (e) {
      e.stopPropagation();
      const nombreCompleto = btn.parentElement.textContent.trim();
      const nombre = nombreCompleto.split(" - ")[1]
        ? nombreCompleto.split(" - ")[1].split("(")[0].trim()
        : nombreCompleto.split(" - ")[0].trim();

      if (confirm(`¿Seguro que deseas eliminar a:\n${nombre}?`)) {
        const codigo = btn.parentElement.textContent.split(" - ")[0].trim();
        await fetch(`/api/usuarios/${codigo}`, { method: "DELETE" });
        cargarUsuarios(true); // Recargar ambas vistas
      }
    };
  });
}

/**
 * Carga y renderiza la lista de usuarios, agrupada por ciclo en acordeones.
 */
export async function cargarUsuarios(forceReload = false) {
  const resUsuarios = await fetch("/api/usuarios");
  const usuarios = await resUsuarios.json();

  // 🚀 NUEVO: Obtener la lista dinámica de ciclos
  const resCiclos = await fetch("/api/ciclos");
  const ciclosData = await resCiclos.json();
  const ciclosOrdenados = ciclosData.ciclos;

  const ciclos = {};
  const docentes = [];
  usuarios.forEach((u) => {
    if (u.rol === "estudiante") {
      if (!ciclos[u.ciclo]) ciclos[u.ciclo] = [];
      ciclos[u.ciclo].push(u);
    } else {
      docentes.push(u);
    }
  });

  // --- Vista Estudiantes (Acordeón) ---
  const alumnosCompletaDiv = document.getElementById("vista-alumnos");
  if (alumnosCompletaDiv) {
    alumnosCompletaDiv.innerHTML = "";

    // Itera usando la lista ordenada y completa de ciclos
    ciclosOrdenados.forEach((ciclo, index) => {
      const grupo = ciclos[ciclo] || [];
      const count = grupo.length;

      if (count === 0) return;

      // Ordenación: Turno y luego Alfabético
      grupo.sort((a, b) => {
        if (a.turno === "mañana" && b.turno === "tarde") return -1;
        if (a.turno === "tarde" && b.turno === "mañana") return 1;
        return a.nombre.localeCompare(b.nombre, "es");
      });

      const isActive = index === 0 ? "active" : "";

      alumnosCompletaDiv.innerHTML += `
          <div class="accordion-item">
            <button class="accordion-header ${isActive}" data-target="ciclo-${ciclo}">
              <h3>CICLO ${ciclo.toUpperCase()} (${count} Alumnos)</h3>
              <i class="bi bi-chevron-down"></i>
            </button>
            <div id="ciclo-${ciclo}" class="accordion-content ${
        isActive ? "show" : ""
      }">
              <ul>${crearListaUsuarios(grupo)}</ul>
            </div>
          </div>
        `;
    });

    initAccordion();
  }

  // --- Vista Docentes (Dashboard) ---
  docentes.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  const docentesDiv = document.getElementById("vista-docentes");
  if (docentesDiv) {
    docentesDiv.innerHTML = `<ul>${crearListaUsuarios(docentes, true)}</ul>`;
  }

  agregarEventosEliminar();
}

/**
 * Obtiene los días de asistencia seleccionados en el formulario.
 */
function getSelectedDays() {
  const selectedDays = [];
  document.querySelectorAll(".day-btn.active").forEach((button) => {
    selectedDays.push(button.getAttribute("data-day"));
  });
  return selectedDays;
}

// --- *** HELPERS PARA EL SELECTOR DE HORA *** ---

/**
 * Rellena los selects de hora (01-12) y minutos (00-59).
 */
function populateTimeSelects(hrSelect, minSelect) {
  // Horas (01-12)
  for (let i = 1; i <= 12; i++) {
    const val = i.toString().padStart(2, "0");
    hrSelect.options.add(new Option(val, val));
  }
  // Minutos (00-59)
  for (let i = 0; i < 60; i++) {
    const val = i.toString().padStart(2, "0");
    minSelect.options.add(new Option(val, val));
  }
}

/**
 * Establece los 3 selects (hr, min, ampm) a partir de una hora 24h (ej: "15:30").
 */
function setPickerFrom24h(time24h, hrSelect, minSelect, ampmSelect) {
  if (!time24h || !hrSelect || !minSelect || !ampmSelect) return;

  const [hours, minutes] = time24h.split(":").map(Number);
  const ampm = hours >= 12 ? "PM" : "AM";
  let hr12 = hours % 12;
  if (hr12 === 0) hr12 = 12; // 0h (medianoche) y 12h (mediodía) son "12"

  hrSelect.value = hr12.toString().padStart(2, "0");
  minSelect.value = minutes.toString().padStart(2, "0");
  ampmSelect.value = ampm;
}

/**
 * Convierte una hora 24h (ej: "15:00") a un string 12h (ej: "03:00 PM").
 */
function convert24hTo12h(time24h) {
  if (!time24h) return "";
  try {
    const [hours, minutes] = time24h.split(":").map(Number);
    const ampm = hours >= 12 ? "PM" : "AM";
    let hr12 = hours % 12;
    if (hr12 === 0) hr12 = 12;
    return `${hr12.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")} ${ampm}`;
  } catch (e) {
    console.error("Error convirtiendo 24h a 12h:", time24h, e);
    return "Error";
  }
}

/**
 * Carga y muestra los horarios de entrada y tolerancia.
 */
export async function cargarHorarios() {
  const res = await fetch("/api/horarios");
  const horarios = await res.json();

  // Referencias a los selects de hora
  const em_hr = document.getElementById("entrada-manana-hr");
  const em_min = document.getElementById("entrada-manana-min");
  const em_ampm = document.getElementById("entrada-manana-ampm");
  const tm_hr = document.getElementById("tolerancia-manana-hr");
  const tm_min = document.getElementById("tolerancia-manana-min");
  const tm_ampm = document.getElementById("tolerancia-manana-ampm");
  const et_hr = document.getElementById("entrada-tarde-hr");
  const et_min = document.getElementById("entrada-tarde-min");
  const et_ampm = document.getElementById("entrada-tarde-ampm");
  const tt_hr = document.getElementById("tolerancia-tarde-hr");
  const tt_min = document.getElementById("tolerancia-tarde-min");
  const tt_ampm = document.getElementById("tolerancia-tarde-ampm");

  const summaryManana = document.getElementById("summary-manana");

  // Rellenar los selects (si están presentes y vacíos)
  if (em_hr && em_hr.options.length === 0) {
    console.log("Rellenando selectores de hora por primera vez.");
    populateTimeSelects(em_hr, em_min);
    populateTimeSelects(tm_hr, tm_min);
    populateTimeSelects(et_hr, et_min);
    populateTimeSelects(tt_hr, tt_min);
  }

  // Establecer los valores de los selects desde la API
  if (em_hr) {
    setPickerFrom24h(horarios.mañana.entrada, em_hr, em_min, em_ampm);
    setPickerFrom24h(horarios.mañana.tolerancia, tm_hr, tm_min, tm_ampm);
    setPickerFrom24h(horarios.tarde.entrada, et_hr, et_min, et_ampm);
    setPickerFrom24h(horarios.tarde.tolerancia, tt_hr, tt_min, tt_ampm);
  }

  // Actualizar el resumen de texto (ahora en formato 12h)
  if (summaryManana) {
    const h12_em = convert24hTo12h(horarios.mañana.entrada);
    const h12_tm = convert24hTo12h(horarios.mañana.tolerancia);
    const h12_et = convert24hTo12h(horarios.tarde.entrada);
    const h12_tt = convert24hTo12h(horarios.tarde.tolerancia);

    document.getElementById(
      "summary-manana"
    ).textContent = `Entrada: ${h12_em} | Tolerancia: ${h12_tm}`;
    document.getElementById(
      "summary-tarde"
    ).textContent = `Entrada: ${h12_et} | Tolerancia: ${h12_tt}`;
  }
}

/**
 * Inicializa los eventos del formulario de agregar usuario y los botones de días.
 * (MODIFICADO)
 */
export function initUserFormEvents() {
  // 1. Botones de Día
  document.querySelectorAll(".day-btn").forEach((button) => {
    button.addEventListener("click", function () {
      this.classList.toggle("active");
    });
  });

  // 2. Formulario Agregar Usuario (FIX: Campos condicionales)
  const rolSelect = document.getElementById("rol");
  if (rolSelect) {
    const toggleUserFields = function () {
      const esEstudiante = rolSelect.value === "estudiante";
      const esDocente = rolSelect.value === "docente";

      const turno = document.getElementById("turno");
      const ciclo = document.getElementById("ciclo");
      const diasSelector = document.getElementById("dias-asistencia-selector");

      if (turno) turno.disabled = !esEstudiante;
      if (ciclo) ciclo.disabled = !esEstudiante;
      if (diasSelector)
        diasSelector.style.display =
          esEstudiante || esDocente ? "block" : "none";

      if (!esEstudiante) {
        if (turno) turno.value = "";
        if (ciclo) ciclo.value = "";
      }
    };
    rolSelect.onchange = toggleUserFields;
    toggleUserFields();
  }

  // 3. Formulario Agregar Submit
  // (Este listener se movió a admin.js para centralizar)

  // --- *** NUEVO CÓDIGO AÑADIDO *** ---
  // 4. Forzar mayúsculas en el input de nombre
  const nombreInput = document.getElementById("nombre");
  if (nombreInput) {
    nombreInput.addEventListener("input", function () {
      // 'this' se refiere al elemento input
      this.value = this.value.toUpperCase();
    });
  }
  // --- *** FIN DE CÓDIGO AÑADIDO *** ---
}
