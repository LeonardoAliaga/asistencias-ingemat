// Proyecto/Public/js/admin/users.js

import { initAccordion } from "./accordion.js";

/**
 * Crea la estructura HTML para los elementos de lista de usuarios.
 * @param {Array} usuarios - Lista de objetos de usuario.
 * @param {boolean} esDocente - Indica si la lista es de docentes.
 * @returns {string} HTML de la lista.
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
      // Obtener el nombre para el mensaje de confirmación
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
  const res = await fetch("/api/usuarios");
  const usuarios = await res.json();

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

    Object.keys(ciclos).forEach((ciclo, index) => {
      // Ordenación: Turno y luego Alfabético
      ciclos[ciclo].sort((a, b) => {
        if (a.turno === "mañana" && b.turno === "tarde") return -1;
        if (a.turno === "tarde" && b.turno === "mañana") return 1;
        return a.nombre.localeCompare(b.nombre, "es");
      });

      const isActive = index === 0 ? "active" : "";

      alumnosCompletaDiv.innerHTML += `
          <div class="accordion-item">
            <button class="accordion-header ${isActive}" data-target="ciclo-${ciclo}">
              <h3>CICLO ${ciclo.toUpperCase()} (${
        ciclos[ciclo].length
      } Alumnos)</h3>
              <i class="bi bi-chevron-down"></i>
            </button>
            <div id="ciclo-${ciclo}" class="accordion-content ${
        isActive ? "show" : ""
      }">
              <ul>${crearListaUsuarios(ciclos[ciclo])}</ul>
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
    // FIX: Se usa crearListaUsuarios para docentes también
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

/**
 * Carga y muestra los horarios de entrada y tolerancia.
 */
export async function cargarHorarios() {
  const res = await fetch("/api/horarios");
  const horarios = await res.json();

  const entradaManana = document.getElementById("entrada-manana");
  const summaryManana = document.getElementById("summary-manana");

  if (entradaManana) {
    document.getElementById("entrada-manana").value = horarios.mañana.entrada;
    document.getElementById("tolerancia-manana").value =
      horarios.mañana.tolerancia;
    document.getElementById("entrada-tarde").value = horarios.tarde.entrada;
    document.getElementById("tolerancia-tarde").value =
      horarios.tarde.tolerancia;
  }

  if (summaryManana) {
    document.getElementById(
      "summary-manana"
    ).textContent = `Entrada: ${horarios.mañana.entrada} | Tolerancia: ${horarios.mañana.tolerancia}`;
    document.getElementById(
      "summary-tarde"
    ).textContent = `Entrada: ${horarios.tarde.entrada} | Tolerancia: ${horarios.tarde.tolerancia}`;
  }
}

/**
 * Inicializa los eventos del formulario de agregar usuario y los botones de días.
 */
export function initUserFormEvents() {
  // Lógica de los botones de día
  document.querySelectorAll(".day-btn").forEach((button) => {
    button.addEventListener("click", function () {
      this.classList.toggle("active");
    });
  });

  // Evento de submit del formulario
  const formAgregar = document.getElementById("form-agregar");
  if (formAgregar) {
    formAgregar.onsubmit = async function (e) {
      e.preventDefault();
      const codigo = document.getElementById("codigo").value.trim();
      const nombre = document.getElementById("nombre").value.trim();
      const rol = document.getElementById("rol").value;
      const turno = document.getElementById("turno").value;
      const ciclo = document.getElementById("ciclo").value;
      const diasAsistencia = getSelectedDays();

      if (!codigo || !nombre || !rol) {
        alert("Todos los campos son obligatorios.");
        return;
      }
      if (rol === "estudiante" && (!turno || !ciclo)) {
        alert("El turno y ciclo son obligatorios para estudiantes.");
        return;
      }
      if (rol === "estudiante" && diasAsistencia.length === 0) {
        alert(
          "Debes seleccionar al menos un día de asistencia para el estudiante."
        );
        return;
      }

      const payload = { codigo, nombre, rol, turno, ciclo };
      if (rol === "estudiante" || rol === "docente") {
        // Aplicar días también a docentes
        payload.dias_asistencia = diasAsistencia;
      }

      await fetch("/api/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      cargarUsuarios(true);

      // Restablecer el formulario
      document.getElementById("form-agregar").reset();
      // Restablecer botones de día a L-S activo (por defecto)
      document.querySelectorAll(".day-btn").forEach((button) => {
        if (button.getAttribute("data-day") !== "D") {
          button.classList.add("active");
        } else {
          button.classList.remove("active");
        }
      });
    };

    // Evento de cambio de rol para mostrar/ocultar campos
    const rolSelect = document.getElementById("rol");
    if (rolSelect) {
      const toggleUserFields = function () {
        const esEstudiante = rolSelect.value === "estudiante";
        const esDocente = rolSelect.value === "docente";

        const turno = document.getElementById("turno");
        const ciclo = document.getElementById("ciclo");
        const diasSelector = document.getElementById(
          "dias-asistencia-selector"
        );

        // Turno y Ciclo solo para estudiantes
        if (turno) turno.disabled = !esEstudiante;
        if (ciclo) ciclo.disabled = !esEstudiante;

        // Días de asistencia para estudiantes y docentes
        if (diasSelector)
          diasSelector.style.display =
            esEstudiante || esDocente ? "block" : "none";

        if (!esEstudiante) {
          if (turno) turno.value = "";
          if (ciclo) ciclo.value = "";
        }
      };
      rolSelect.onchange = toggleUserFields;
      // Ejecutar al cargar
      toggleUserFields();
    }
  }
}
