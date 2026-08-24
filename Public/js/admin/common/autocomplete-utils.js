// Public/js/admin/common/autocomplete-utils.js

/**
 * Configura un buscador inteligente autocompletable para estudiantes con filtrado dinámico opcional por ciclo.
 * 
 * @param {string} searchInputId - ID del input de texto de búsqueda
 * @param {string|null} hiddenInputId - ID del input hidden para almacenar el código del alumno (opcional)
 * @param {string} resultsContainerId - ID del contenedor dropdown para renderizar las sugerencias
 * @param {Function|null} getCicloFiltroFn - Función opcional que devuelve el ciclo actual por el que filtrar
 * @param {Function|null} getUsuariosListFn - Función que devuelve el array de usuarios
 * @param {Function|null} onSelectFn - Callback opcional al seleccionar un estudiante ({ code, name, user })
 */
export function setupStudentAutocomplete(
  searchInputId,
  hiddenInputId,
  resultsContainerId,
  getCicloFiltroFn = null,
  getUsuariosListFn = null,
  onSelectFn = null
) {
  const searchInput = document.getElementById(searchInputId);
  const hiddenInput = hiddenInputId ? document.getElementById(hiddenInputId) : null;
  const resultsContainer = document.getElementById(resultsContainerId);

  if (!searchInput || !resultsContainer) return;

  let activeIndex = -1;

  const closeDropdown = () => {
    resultsContainer.innerHTML = "";
    resultsContainer.style.display = "none";
    activeIndex = -1;
  };

  const updateActiveItem = (items) => {
    items.forEach((it, idx) => {
      if (idx === activeIndex) {
        it.style.backgroundColor = "#e0f2fe";
        it.scrollIntoView({ block: "nearest" });
      } else {
        it.style.backgroundColor = "";
      }
    });
  };

  searchInput.addEventListener("input", () => {
    const query = searchInput.value.trim().toLowerCase();
    if (hiddenInput) hiddenInput.value = "";
    activeIndex = -1;

    if (!query) {
      closeDropdown();
      return;
    }

    const cicloFiltro = typeof getCicloFiltroFn === "function" ? getCicloFiltroFn() : null;
    const usuariosList = typeof getUsuariosListFn === "function" ? getUsuariosListFn() : (window._globalUsuariosCache || []);

    if (!Array.isArray(usuariosList) || usuariosList.length === 0) {
      resultsContainer.innerHTML = `
        <div class="student-autocomplete-item" style="color: #94a3b8; cursor: default;">
          <i>Cargando listado de estudiantes...</i>
        </div>
      `;
      resultsContainer.style.display = "block";
      return;
    }

    let filtrados = usuariosList;
    if (cicloFiltro && cicloFiltro.trim() !== "" && cicloFiltro.toUpperCase() !== "TODOS") {
      const fCiclo = cicloFiltro.trim().toUpperCase();
      filtrados = usuariosList.filter((u) => String(u.ciclo || "").trim().toUpperCase() === fCiclo);
    }

    const matches = filtrados.filter((u) => {
      const cod = String(u.codigo || "").toLowerCase();
      const nom = String(u.nombre || "").toLowerCase();
      const ape = String(u.apellido || "").toLowerCase();
      const dni = String(u.dni || "").toLowerCase();
      const nomCompleto = `${nom} ${ape}`.trim();
      return (
        cod.includes(query) ||
        nom.includes(query) ||
        ape.includes(query) ||
        nomCompleto.includes(query) ||
        dni.includes(query)
      );
    });

    if (matches.length === 0) {
      const msgInfo = cicloFiltro
        ? `Sin alumnos en el ciclo '${cicloFiltro}' con esa búsqueda`
        : "Sin resultados para esa búsqueda";
      resultsContainer.innerHTML = `
        <div class="student-autocomplete-item" style="color: #94a3b8; font-size: 0.85rem; cursor: default;">
          ⚠️ ${msgInfo}
        </div>
      `;
      resultsContainer.style.display = "block";
      return;
    }

    let html = "";
    matches.slice(0, 10).forEach((u) => {
      const nombreCompleto = `${u.nombre || ""} ${u.apellido || ""}`.trim() || u.nombre || u.apellido || "Estudiante";
      const cicloText = u.ciclo || "Sin ciclo";
      html += `
        <div class="student-autocomplete-item" data-code="${u.codigo}" data-name="${nombreCompleto}" data-ciclo="${cicloText}">
          <b>[${u.codigo}]</b> ${nombreCompleto} <small style="color:#64748b; margin-left:4px;">(${cicloText})</small>
        </div>
      `;
    });

    resultsContainer.innerHTML = html;
    resultsContainer.style.display = "block";

    resultsContainer.querySelectorAll(".student-autocomplete-item").forEach((item) => {
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        seleccionarEstudiante(item);
      });
    });
  });

  const seleccionarEstudiante = (itemEl) => {
    const code = itemEl.getAttribute("data-code");
    const name = itemEl.getAttribute("data-name");

    if (code) {
      searchInput.value = `[${code}] ${name}`;
      if (hiddenInput) hiddenInput.value = code;
      closeDropdown();

      const usuariosList = typeof getUsuariosListFn === "function" ? getUsuariosListFn() : (window._globalUsuariosCache || []);
      const userObj = usuariosList.find((u) => String(u.codigo).toUpperCase() === String(code).toUpperCase());

      if (typeof onSelectFn === "function") {
        onSelectFn({ code, name, user: userObj });
      }

      searchInput.dispatchEvent(new Event("change", { bubbles: true }));
    }
  };

  // Navegación por teclado
  searchInput.addEventListener("keydown", (e) => {
    const items = resultsContainer.querySelectorAll(".student-autocomplete-item[data-code]");
    if (items.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIndex = (activeIndex + 1) % items.length;
      updateActiveItem(items);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIndex = (activeIndex - 1 + items.length) % items.length;
      updateActiveItem(items);
    } else if (e.key === "Enter" && activeIndex >= 0 && activeIndex < items.length) {
      e.preventDefault();
      seleccionarEstudiante(items[activeIndex]);
    } else if (e.key === "Escape") {
      closeDropdown();
    }
  });

  // Cerrar al hacer clic fuera
  document.addEventListener("click", (e) => {
    if (!searchInput.contains(e.target) && !resultsContainer.contains(e.target)) {
      closeDropdown();
    }
  });
}

/**
 * Autocompletado genérico predictivo para cualquier entidad (libros, exámenes, temas).
 */
export function setupGenericAutocomplete({
  searchInputId,
  resultsContainerId,
  getItemsFn,
  matchFn,
  renderItemHtmlFn,
  onSelectFn,
}) {
  const searchInput = document.getElementById(searchInputId);
  const resultsContainer = document.getElementById(resultsContainerId);

  if (!searchInput || !resultsContainer) return;

  const closeDropdown = () => {
    resultsContainer.innerHTML = "";
    resultsContainer.style.display = "none";
  };

  searchInput.addEventListener("input", () => {
    const query = searchInput.value.trim().toLowerCase();
    if (!query) {
      closeDropdown();
      return;
    }

    const items = typeof getItemsFn === "function" ? getItemsFn() : [];
    const matches = items.filter((item) => matchFn(item, query));

    if (matches.length === 0) {
      resultsContainer.innerHTML = `
        <div class="student-autocomplete-item" style="color: #94a3b8; font-size: 0.85rem; cursor: default;">
          <i>Sin coincidencias</i>
        </div>
      `;
      resultsContainer.style.display = "block";
      return;
    }

    resultsContainer.innerHTML = matches.slice(0, 10).map((item, idx) => renderItemHtmlFn(item, idx)).join("");
    resultsContainer.style.display = "block";

    resultsContainer.querySelectorAll(".student-autocomplete-item[data-item-idx]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const idx = parseInt(el.getAttribute("data-item-idx"), 10);
        const selected = matches[idx];
        if (selected && typeof onSelectFn === "function") {
          onSelectFn(selected);
          closeDropdown();
        }
      });
    });
  });

  document.addEventListener("click", (e) => {
    if (!searchInput.contains(e.target) && !resultsContainer.contains(e.target)) {
      closeDropdown();
    }
  });
}
