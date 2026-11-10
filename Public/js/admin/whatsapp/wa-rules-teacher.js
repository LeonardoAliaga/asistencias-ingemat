// Proyecto Beta/Public/js/admin/whatsapp/wa-rules-teacher.js
import * as dom from "./wa-dom.js";
import * as state from "./wa-state.js";
import { markUnsavedChanges } from "./wa-helpers.js";

let currentAutocompleteFocus = -1;

// --- INICIO LÓGICA DE AUTOCOMPLETADO (COPIADA) ---

function closeAllAutocompleteLists(elmnt) {
  const items = dom.teacherGroupResultados;
  if (items && items !== elmnt) {
    items.innerHTML = "";
  }
  currentAutocompleteFocus = -1;
}

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

function removeAutocompleteActive(items) {
  for (let i = 0; i < items.length; i++) {
    items[i].classList.remove("autocomplete-active");
  }
}

function initTeacherAutocomplete() {
  const input = dom.teacherGroupFiltro;
  const hiddenInput = dom.teacherGroupHidden;
  const resultsContainer = dom.teacherGroupResultados;

  if (!input || !hiddenInput || !resultsContainer) return;

  input.addEventListener("input", function (e) {
    const val = this.value;
    closeAllAutocompleteLists();
    if (!val || val.length < 2) {
      hiddenInput.value = "";
      return false;
    }

    console.log(
      `[wa-rules-teacher.js] Buscando grupos. Usando lista de ${state.availableGroups.length} grupos del estado.`
    );
    const valNorm = val.toLowerCase();

    state.availableGroups.forEach((group) => {
      const groupNameNorm = group.name.toLowerCase();
      const index = groupNameNorm.indexOf(valNorm);

      if (index !== -1) {
        const itemDiv = document.createElement("div");
        itemDiv.classList.add("autocomplete-item");
        itemDiv.innerHTML =
          group.name.substring(0, index) +
          "<strong>" +
          group.name.substring(index, index + val.length) +
          "</strong>" +
          group.name.substring(index + val.length);

        itemDiv.dataset.id = group.id;
        itemDiv.dataset.name = group.name;

        itemDiv.addEventListener("click", function (e) {
          input.value = this.dataset.name;
          hiddenInput.value = this.dataset.id;
          closeAllAutocompleteLists();
          markUnsavedChanges(); // Marcar cambios al seleccionar
        });
        resultsContainer.appendChild(itemDiv);
      }
    });
  });

  input.addEventListener("keydown", function (e) {
    let items = resultsContainer.getElementsByClassName("autocomplete-item");
    if (e.keyCode == 40) {
      currentAutocompleteFocus++;
      addAutocompleteActive(items);
      e.preventDefault();
    } else if (e.keyCode == 38) {
      currentAutocompleteFocus--;
      addAutocompleteActive(items);
      e.preventDefault();
    } else if (e.keyCode == 13) {
      e.preventDefault();
      if (currentAutocompleteFocus > -1 && items[currentAutocompleteFocus]) {
        items[currentAutocompleteFocus].click();
      }
    } else if (e.keyCode == 27) {
      closeAllAutocompleteLists();
      input.value = "";
      hiddenInput.value = "";
    }
  });

  document.addEventListener("click", function (e) {
    if (e.target !== input) {
      closeAllAutocompleteLists(e.target);
    }
  });
}

// --- FIN LÓGICA DE AUTOCOMPLETADO ---

export function updateTeacherTargetUI() {
  if (!dom.teacherTargetTypeSelect) return;

  const isGroup = dom.teacherTargetTypeSelect.value === "group";
  if (dom.teacherGroupField)
    dom.teacherGroupField.style.display = isGroup ? "block" : "none";
  if (dom.teacherNumberField)
    dom.teacherNumberField.style.display = isGroup ? "none" : "block";

  const isConnected =
    dom.statusIndicator &&
    dom.statusIndicator.classList.contains("status-connected");

  if (isGroup) {
    if (dom.teacherGroupFiltro) dom.teacherGroupFiltro.disabled = !isConnected;
    if (!isConnected) {
      if (dom.teacherGroupFiltro)
        dom.teacherGroupFiltro.placeholder = "WhatsApp no conectado";
    } else if (state.availableGroups.length === 0) {
      if (dom.teacherGroupFiltro)
        dom.teacherGroupFiltro.placeholder = "No hay grupos disponibles";
    } else {
      if (dom.teacherGroupFiltro)
        dom.teacherGroupFiltro.placeholder = "Buscar grupo por nombre...";
    }
  }
}

export function initTeacherRuleListeners() {
  if (dom.teacherTargetTypeSelect) {
    dom.teacherTargetTypeSelect.addEventListener("change", () => {
      updateTeacherTargetUI();
      markUnsavedChanges();
    });
  }

  // --- INICIALIZAR AUTOCOMPLETADO (LÍNEA FALTANTE) ---
  initTeacherAutocomplete();

  if (dom.teacherNumberInputEl) {
    dom.teacherNumberInputEl.addEventListener("input", markUnsavedChanges);
  }
}
