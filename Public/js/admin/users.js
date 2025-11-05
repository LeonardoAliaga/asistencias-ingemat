// Proyecto/Public/js/admin/users.js

import { initAccordion } from "./accordion.js";

let allUserOptions = []; // Caché de usuarios para justificar
let currentAutocompleteFocus = -1; // Para navegación por teclado

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
        infoAdicional = ` (${u.turno}) (${diasAsistencia})`;
      } else if (u.rol === "docente") {
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

// --- INICIO LÓGICA DE AUTOCOMPLETADO ---

/**
 * Cierra todas las listas de autocompletado activas.
 */
function closeAllAutocompleteLists(elmnt) {
  const items = document.getElementById("justificar-resultados");
  if (items) {
    items.innerHTML = ""; // Limpiamos los items
  }
  currentAutocompleteFocus = -1;
}

/**
 * Añade la clase 'activa' para navegación por teclado.
 */
function addAutocompleteActive(items) {
  if (!items) return false;
  removeAutocompleteActive(items);
  if (currentAutocompleteFocus >= items.length) currentAutocompleteFocus = 0;
  if (currentAutocompleteFocus < 0) currentAutocompleteFocus = items.length - 1;

  const activeItem = items[currentAutocompleteFocus];
  if (activeItem) {
    activeItem.classList.add("autocomplete-active");
    activeItem.scrollIntoView({ block: "nearest" });
  }
}

/**
 * Remueve la clase 'activa' de los items.
 */
function removeAutocompleteActive(items) {
  for (let i = 0; i < items.length; i++) {
    items[i].classList.remove("autocomplete-active");
  }
}

/**
 * Inicializa los listeners para el nuevo autocompletado.
 */
function initAutocomplete() {
  const input = document.getElementById("justificar-usuario-filtro");
  const hiddenInput = document.getElementById("justificar-alumno-hidden");
  const resultsContainer = document.getElementById("justificar-resultados");

  if (!input || !hiddenInput || !resultsContainer) {
    console.error(
      "Faltan elementos del autocompletado (input, hidden, o results)."
    );
    return;
  }

  // Listener para cuando el usuario escribe
  input.addEventListener("input", function (e) {
    const val = this.value;
    closeAllAutocompleteLists();
    if (!val || val.length < 2) {
      hiddenInput.value = ""; // Limpiamos el valor si no hay texto
      return false;
    }

    const valNorm = val
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, ""); // Rango correcto para acentos

    allUserOptions.forEach((user) => {
      const userNameNorm = user.nombre
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, ""); // Rango correcto para acentos

      const index = userNameNorm.indexOf(valNorm);

      if (index !== -1) {
        const itemDiv = document.createElement("div");
        itemDiv.classList.add("autocomplete-item");

        // Resaltar la coincidencia
        itemDiv.innerHTML =
          user.nombre.substring(0, index) +
          "<strong>" +
          user.nombre.substring(index, index + val.length) +
          "</strong>" +
          user.nombre.substring(index + val.length) +
          ` <small>(${user.rol})</small>`;

        // Guardar los datos en el div
        itemDiv.dataset.codigo = user.codigo;
        itemDiv.dataset.nombre = user.nombre;

        // Listener de clic para el item
        itemDiv.addEventListener("click", function (e) {
          input.value = this.dataset.nombre;
          hiddenInput.value = this.dataset.codigo;
          closeAllAutocompleteLists();
        });
        resultsContainer.appendChild(itemDiv);
      }
    });
  });

  // Listener para navegación por teclado
  input.addEventListener("keydown", function (e) {
    let items = resultsContainer.getElementsByClassName("autocomplete-item");
    if (e.keyCode == 40) {
      // Flecha Abajo
      currentAutocompleteFocus++;
      addAutocompleteActive(items);
      e.preventDefault();
    } else if (e.keyCode == 38) {
      // Flecha Arriba
      currentAutocompleteFocus--;
      addAutocompleteActive(items);
      e.preventDefault();
    } else if (e.keyCode == 13) {
      // Enter
      e.preventDefault();
      if (currentAutocompleteFocus > -1 && items[currentAutocompleteFocus]) {
        items[currentAutocompleteFocus].click();
      }
    } else if (e.keyCode == 27) {
      // Escape
      closeAllAutocompleteLists();
      input.value = "";
      hiddenInput.value = "";
    }
  });

  // Cerrar la lista al hacer clic fuera
  document.addEventListener("click", function (e) {
    if (e.target !== input) {
      closeAllAutocompleteLists(e.target);
    }
  });
}

// --- FIN LÓGICA DE AUTOCOMPLETADO ---

/**
 * Carga y renderiza la lista de usuarios.
 */
export async function cargarUsuarios(forceReload = false) {
  // --- Referencias a elementos del DOM ---
  const resUsuarios = await fetch("/api/usuarios");
  const usuarios = await resUsuarios.json();

  // --- LÓGICA DE FILTRO (NUEVA) ---
  // Guardar todos los usuarios ordenados en el caché
  allUserOptions = usuarios.sort((a, b) =>
    a.nombre.localeCompare(b.nombre, "es")
  );
  // --- FIN LÓGICA DE FILTRO ---

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

  // --- Vista Usuarios (Acordeón) ---
  const usuariosCompletaDiv = document.getElementById("vista-usuarios-list");
  if (usuariosCompletaDiv && (forceReload || !usuariosCompletaDiv.innerHTML)) {
    usuariosCompletaDiv.innerHTML = "";

    // --- NUEVO: Renderizar Docentes Primero ---
    docentes.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    if (docentes.length > 0) {
      usuariosCompletaDiv.innerHTML += `
        <div class="accordion-item">
          <button class="accordion-header active" data-target="ciclo-docentes">
            <h3>DOCENTES (${docentes.length} Usuarios)</h3>
            <i class="bi bi-chevron-down"></i>
          </button>
          <div id="ciclo-docentes" class="accordion-content show">
            <ul>${crearListaUsuarios(docentes, true)}</ul>
          </div>
        </div>
      `;
    }

    ciclosOrdenados.forEach((ciclo, index) => {
      const grupo = ciclos[ciclo] || [];
      const count = grupo.length;

      if (count === 0) return;

      grupo.sort((a, b) => {
        if (a.turno === "mañana" && b.turno === "tarde") return -1;
        if (a.turno === "tarde" && b.turno === "mañana") return 1;
        return a.nombre.localeCompare(b.nombre, "es");
      });

      // Solo activa el primero si NO hay docentes
      const isActive = index === 0 && docentes.length === 0 ? "active" : "";
      const show = index === 0 && docentes.length === 0 ? "show" : "";

      usuariosCompletaDiv.innerHTML += `
          <div class="accordion-item">
            <button class="accordion-header ${isActive}" data-target="ciclo-${ciclo}">
              <h3>CICLO ${ciclo.toUpperCase()} (${count} Alumnos)</h3>
              <i class="bi bi-chevron-down"></i>
            </button>
            <div id="ciclo-${ciclo}" class="accordion-content ${show}">
              <ul>${crearListaUsuarios(grupo)}</ul>
            </div>
          </div>
        `;
    });

    initAccordion();
  }

  // --- (Vista Docentes (Dashboard) ELIMINADA) ---

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
function populateTimeSelects(hrSelect, minSelect) {
  for (let i = 1; i <= 12; i++) {
    const val = i.toString().padStart(2, "0");
    hrSelect.options.add(new Option(val, val));
  }
  for (let i = 0; i < 60; i++) {
    const val = i.toString().padStart(2, "0");
    minSelect.options.add(new Option(val, val));
  }
}

function setPickerFrom24h(time24h, hrSelect, minSelect, ampmSelect) {
  if (!time24h || !hrSelect || !minSelect || !ampmSelect) return;

  const [hours, minutes] = time24h.split(":").map(Number);
  const ampm = hours >= 12 ? "PM" : "AM";
  let hr12 = hours % 12;
  if (hr12 === 0) hr12 = 12;

  hrSelect.value = hr12.toString().padStart(2, "0");
  minSelect.value = minutes.toString().padStart(2, "0");
  ampmSelect.value = ampm;
}

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

export async function cargarHorarios() {
  const res = await fetch("/api/horarios");
  const horarios = await res.json();

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

  if (em_hr && em_hr.options.length === 0) {
    console.log("Rellenando selectores de hora por primera vez.");
    populateTimeSelects(em_hr, em_min);
    populateTimeSelects(tm_hr, tm_min);
    populateTimeSelects(et_hr, et_min);
    populateTimeSelects(tt_hr, tt_min);
  }

  if (em_hr) {
    setPickerFrom24h(horarios.mañana.entrada, em_hr, em_min, em_ampm);
    setPickerFrom24h(horarios.mañana.tolerancia, tm_hr, tm_min, tm_ampm);
    setPickerFrom24h(horarios.tarde.entrada, et_hr, et_min, et_ampm);
    setPickerFrom24h(horarios.tarde.tolerancia, tt_hr, tt_min, tt_ampm);
  }

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

  // 4. Forzar mayúsculas en el input de nombre
  const nombreInput = document.getElementById("nombre");
  if (nombreInput) {
    nombreInput.addEventListener("input", function () {
      this.value = this.value.toUpperCase();
    });
  }

  // 5. Inicializar el autocompletado
  initAutocomplete();
}
