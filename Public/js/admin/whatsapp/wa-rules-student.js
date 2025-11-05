// Proyecto Beta/Public/js/admin/whatsapp/wa-rules-student.js
import * as dom from "./wa-dom.js";
import * as state from "./wa-state.js";
import { showMessage, markUnsavedChanges } from "./wa-helpers.js";

let currentAutocompleteFocus = -1;

// --- INICIO LÓGICA DE AUTOCOMPLETADO ---

function closeAllAutocompleteLists(elmnt) {
  const items = dom.ruleGroupResultados;
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

function initStudentAutocomplete() {
  const input = dom.ruleGroupFiltro;
  const hiddenInput = dom.ruleGroupHidden;
  const resultsContainer = dom.ruleGroupResultados;

  if (!input || !hiddenInput || !resultsContainer) return;

  input.addEventListener("input", function (e) {
    const val = this.value;
    closeAllAutocompleteLists();
    if (!val || val.length < 2) {
      hiddenInput.value = "";
      return false;
    }

    console.log(
      `[wa-rules-student.js] Buscando grupos. Usando lista de ${state.availableGroups.length} grupos del estado.`
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

  // Cerrar la lista al hacer clic fuera (adaptado)
  document.addEventListener("click", function (e) {
    if (e.target !== input) {
      closeAllAutocompleteLists(e.target);
    }
  });
}

// --- FIN LÓGICA DE AUTOCOMPLETADO ---

export function renderStudentRules() {
  if (!dom.studentRulesListDiv) return;
  dom.studentRulesListDiv.innerHTML = "";
  const rules = state.currentWhatsappConfig.studentRules || [];
  if (rules.length === 0) {
    dom.studentRulesListDiv.innerHTML =
      "<p>No hay reglas definidas para estudiantes.</p>";
    return;
  }
  const ul = document.createElement("ul");
  ul.className = "rules-ul";
  rules.forEach((rule, index) => {
    const li = document.createElement("li");
    let targetDisplay = "Destino no válido";
    if (rule.targetType === "group") {
      const group = state.availableGroups.find((g) => g.id === rule.targetId);
      targetDisplay = group
        ? `Grupo: ${group.name}`
        : `Grupo ID: ${rule.targetId || "N/A"} (No encontrado)`;
    } else if (rule.targetType === "number") {
      targetDisplay = `Número: ${
        rule.targetId ? rule.targetId.replace("@c.us", "") : "N/A"
      }`;
    }
    const cicloDisplay = rule.ciclo
      ? rule.ciclo.charAt(0).toUpperCase() + rule.ciclo.slice(1)
      : "N/A";
    const turnoDisplay = rule.turno
      ? rule.turno.charAt(0).toUpperCase() + rule.turno.slice(1)
      : "N/A";
    li.innerHTML = `
            <span><b>${cicloDisplay} - ${turnoDisplay}:</b> ${targetDisplay}</span>
            <button class="btn-delete-rule" data-index="${index}" title="Eliminar Regla"><i class="bi bi-trash-fill"></i></button>
        `;
    ul.appendChild(li);
  });
  dom.studentRulesListDiv.appendChild(ul);
  document.querySelectorAll(".btn-delete-rule").forEach((button) => {
    button.addEventListener("click", handleDeleteRule);
  });
}

export function handleDeleteRule(event) {
  const index = parseInt(event.currentTarget.getAttribute("data-index"), 10);
  if (!isNaN(index) && confirm("¿Seguro que deseas eliminar esta regla?")) {
    if (state.currentWhatsappConfig.studentRules) {
      state.currentWhatsappConfig.studentRules.splice(index, 1);
      renderStudentRules();
      markUnsavedChanges();
      showMessage(dom.msgWhatsappConfig, "Regla eliminada.", false);
    }
  }
}

export function addStudentRule() {
  const ciclo = dom.ruleCicloSelect ? dom.ruleCicloSelect.value : "";
  const turno = dom.ruleTurnoSelect ? dom.ruleTurnoSelect.value : "";
  const targetType = dom.ruleTargetTypeSelect
    ? dom.ruleTargetTypeSelect.value
    : "group";
  let targetId = "";
  let validationError = null;
  if (!ciclo || !turno) {
    validationError = "Debes seleccionar un ciclo y un turno.";
  }
  if (!state.currentWhatsappConfig.studentRules) {
    state.currentWhatsappConfig.studentRules = [];
  }
  if (
    !validationError &&
    state.currentWhatsappConfig.studentRules.some(
      (rule) => rule.ciclo === ciclo && rule.turno === turno
    )
  ) {
    validationError = `Ya existe una regla para ${ciclo} - ${turno}. Elimina la anterior primero.`;
  }
  if (!validationError) {
    if (targetType === "group") {
      targetId = dom.ruleGroupHidden ? dom.ruleGroupHidden.value : "";
      if (!targetId) {
        validationError = "Debes seleccionar un grupo de WhatsApp de la lista.";
      }
    } else {
      const numberRaw = dom.ruleNumberInput
        ? dom.ruleNumberInput.value.trim().replace(/\D/g, "")
        : "";
      if (!numberRaw) {
        validationError = "Debes ingresar un número de WhatsApp.";
      } else if (numberRaw.length < 9) {
        validationError = "El número parece demasiado corto.";
      } else {
        targetId = `${numberRaw}@c.us`;
      }
    }
  }
  if (validationError) {
    showMessage(dom.msgAddRule, validationError, true);
    return;
  }
  state.currentWhatsappConfig.studentRules.push({
    ciclo,
    turno,
    targetType,
    targetId,
  });
  renderStudentRules();
  if (dom.ruleCicloSelect) dom.ruleCicloSelect.value = "";
  if (dom.ruleTurnoSelect) dom.ruleTurnoSelect.value = "";
  if (dom.ruleTargetTypeSelect) dom.ruleTargetTypeSelect.value = "group";
  if (dom.ruleGroupFiltro) dom.ruleGroupFiltro.value = "";
  if (dom.ruleGroupHidden) dom.ruleGroupHidden.value = "";
  if (dom.ruleNumberInput) dom.ruleNumberInput.value = "";
  if (dom.ruleTargetTypeSelect)
    dom.ruleTargetTypeSelect.dispatchEvent(new Event("change"));
  showMessage(dom.msgAddRule, "Regla agregada temporalmente.");
  markUnsavedChanges();
}

export function initStudentRuleListeners() {
  if (dom.ruleTargetTypeSelect) {
    dom.ruleTargetTypeSelect.addEventListener("change", () => {
      const isGroup = dom.ruleTargetTypeSelect.value === "group";
      if (dom.ruleGroupField)
        dom.ruleGroupField.style.display = isGroup ? "block" : "none";
      if (dom.ruleNumberField)
        dom.ruleNumberField.style.display = isGroup ? "none" : "block";

      const isConnected =
        dom.statusIndicator &&
        dom.statusIndicator.classList.contains("status-connected");

      if (isGroup) {
        if (dom.ruleGroupFiltro) dom.ruleGroupFiltro.disabled = !isConnected;
        if (!isConnected) {
          if (dom.ruleGroupFiltro)
            dom.ruleGroupFiltro.placeholder = "WhatsApp no conectado";
        } else if (state.availableGroups.length === 0) {
          if (dom.ruleGroupFiltro)
            dom.ruleGroupFiltro.placeholder = "No hay grupos";
        } else {
          if (dom.ruleGroupFiltro)
            dom.ruleGroupFiltro.placeholder = "Buscar grupo por nombre...";
        }
      }
    });
  }

  // --- INICIALIZAR AUTOCOMPLETADO (LÍNEA FALTANTE) ---
  initStudentAutocomplete();

  if (dom.addRuleBtn) {
    dom.addRuleBtn.addEventListener("click", addStudentRule);
  }
  [
    dom.ruleCicloSelect,
    dom.ruleTurnoSelect,
    dom.ruleTargetTypeSelect,
    dom.ruleNumberInput,
  ].forEach((el) => {
    if (el) {
      const eventType = el.tagName === "INPUT" ? "input" : "change";
      el.addEventListener(eventType, markUnsavedChanges);
    }
  });
}
