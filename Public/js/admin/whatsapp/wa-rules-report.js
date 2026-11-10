// Proyecto Beta/Public/js/admin/whatsapp/wa-rules-report.js
import * as dom from "./wa-dom.js";
import * as state from "./wa-state.js";
import { showMessage, markUnsavedChanges } from "./wa-helpers.js";

let currentAutocompleteFocus = -1;

// --- INICIO LÓGICA DE AUTOCOMPLETADO (COPIADA) ---

function closeAllAutocompleteLists(elmnt) {
  const items = dom.reportRuleGroupResultados;
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

function initReportAutocomplete() {
  const input = dom.reportRuleGroupFiltro;
  const hiddenInput = dom.reportRuleGroupHidden;
  const resultsContainer = dom.reportRuleGroupResultados;

  if (!input || !hiddenInput || !resultsContainer) return;

  input.addEventListener("input", function (e) {
    const val = this.value;
    closeAllAutocompleteLists();
    if (!val || val.length < 2) {
      hiddenInput.value = "";
      return false;
    }

    console.log(
      `[wa-rules-report.js] Buscando grupos. Usando lista de ${state.availableGroups.length} grupos del estado.`
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

async function handleManualSend(event) {
  const button = event.currentTarget;
  const ciclo = button.getAttribute("data-ciclo");
  const turno = button.getAttribute("data-turno");
  const groupId = button.getAttribute("data-group-id");

  if (
    !confirm(
      `¿Seguro que deseas enviar el reporte de ${
        ciclo === "DOCENTES" ? "Docentes" : `${ciclo} - ${turno}`
      } al grupo ahora?`
    )
  ) {
    return;
  }

  button.disabled = true;
  // Usar el msgAddReportRule para feedback de envío
  showMessage(
    dom.msgAddReportRule,
    `Enviando reporte ${
      ciclo === "DOCENTES" ? "Docentes" : `${ciclo} - ${turno}`
    }...`,
    false
  );

  try {
    const response = await fetch("/whatsapp/api/send-report-manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ciclo, turno, groupId }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.mensaje || `Error ${response.status}`);
    }

    showMessage(
      dom.msgAddReportRule,
      data.mensaje || "Reporte enviado.",
      false
    );
  } catch (error) {
    console.error("Error en envío manual:", error);
    showMessage(dom.msgAddReportRule, `Error: ${error.message}`, true);
  } finally {
    button.disabled = false;
  }
}

export function renderReportRules() {
  if (!dom.reportRulesListDiv) return;
  dom.reportRulesListDiv.innerHTML = "";
  const rules = state.currentWhatsappConfig.automatedReport?.targets || [];

  if (rules.length === 0) {
    dom.reportRulesListDiv.innerHTML =
      "<p>No hay destinos de reporte definidos.</p>";
    return;
  }

  const ul = document.createElement("ul");
  ul.className = "rules-ul";
  rules.forEach((rule, index) => {
    const li = document.createElement("li");
    const group = state.availableGroups.find((g) => g.id === rule.groupId);
    const targetDisplay = group
      ? group.name
      : `${rule.groupId || "N/A"} (No encontrado)`;

    let ruleDisplay = "";
    let dataTurno = rule.turno; // Por defecto

    if (rule.ciclo === "DOCENTES") {
      ruleDisplay = `<b>Reporte Docentes</b>`;
      dataTurno = "docentes"; // Asegurar que el turno sea 'docentes'
    } else {
      const cicloDisplay = rule.ciclo
        ? rule.ciclo.charAt(0).toUpperCase() + rule.ciclo.slice(1)
        : "N/A";
      const turnoDisplay = rule.turno
        ? rule.turno.charAt(0).toUpperCase() + rule.turno.slice(1)
        : "N/A";
      ruleDisplay = `<b>${cicloDisplay} - ${turnoDisplay}</b>`;
    }

    li.innerHTML = `
      <span>${ruleDisplay} &rarr; <i>${targetDisplay}</i></span>
      <div class="rule-actions">
        <button 
          class="btn-rule-action btn-send-manual" 
          title="Enviar reporte ahora"
          data-ciclo="${rule.ciclo}"
          data-turno="${dataTurno}"
          data-group-id="${rule.groupId}"
        >
          <i class="bi bi-send-fill"></i>
        </button>
        <button 
          class="btn-rule-action btn-delete-rule btn-delete-report-rule" 
          data-index="${index}" 
          title="Eliminar Regla"
        >
          <i class="bi bi-trash-fill"></i>
        </button>
      </div>
    `;
    ul.appendChild(li);
  });

  dom.reportRulesListDiv.appendChild(ul);

  document.querySelectorAll(".btn-delete-report-rule").forEach((button) => {
    button.addEventListener("click", handleDeleteReportRule);
  });
  document.querySelectorAll(".btn-send-manual").forEach((button) => {
    button.addEventListener("click", handleManualSend);
  });
}

export function handleDeleteReportRule(event) {
  const index = parseInt(event.currentTarget.getAttribute("data-index"), 10);
  if (
    !isNaN(index) &&
    confirm("¿Seguro que deseas eliminar este destino de reporte?")
  ) {
    if (state.currentWhatsappConfig.automatedReport?.targets) {
      state.currentWhatsappConfig.automatedReport.targets.splice(index, 1);
      renderReportRules();
      markUnsavedChanges();
      showMessage(dom.msgWhatsappConfig, "Destino eliminado.", false);
    }
  }
}

export function handleAddReportRule() {
  const ciclo = dom.reportRuleCicloSelect
    ? dom.reportRuleCicloSelect.value
    : "";
  let turno = dom.reportRuleTurnoSelect ? dom.reportRuleTurnoSelect.value : ""; // <-- Cambiado a let
  const groupId = dom.reportRuleGroupHidden
    ? dom.reportRuleGroupHidden.value
    : "";

  let validationError = null;

  if (ciclo === "DOCENTES") {
    turno = "docentes"; // Forzar turno para docentes
    if (!groupId) {
      validationError = "Debes seleccionar un grupo de WhatsApp de la lista.";
    }
  } else {
    // Es un ciclo de estudiante
    if (!ciclo || !turno) {
      validationError = "Debes seleccionar un ciclo y un turno.";
    } else if (!groupId) {
      validationError = "Debes seleccionar un grupo de WhatsApp de la lista.";
    }
  }

  if (!state.currentWhatsappConfig.automatedReport) {
    state.currentWhatsappConfig.automatedReport = {
      targets: [],
    };
  }

  const rules = state.currentWhatsappConfig.automatedReport.targets;

  if (validationError) {
    showMessage(dom.msgAddReportRule, validationError, true);
    return;
  }

  rules.push({ ciclo, turno, groupId });

  renderReportRules();
  if (dom.reportRuleCicloSelect) dom.reportRuleCicloSelect.value = "";
  if (dom.reportRuleTurnoSelect) dom.reportRuleTurnoSelect.value = "";
  if (dom.reportRuleGroupHidden) dom.reportRuleGroupHidden.value = "";
  if (dom.reportRuleGroupFiltro) dom.reportRuleGroupFiltro.value = "";

  // Disparar el evento change para que la UI se resetee (oculte el turno)
  if (dom.reportRuleCicloSelect) {
    dom.reportRuleCicloSelect.dispatchEvent(new Event("change"));
  }

  showMessage(dom.msgAddReportRule, "Destino agregado temporalmente.");
  markUnsavedChanges();
}

export function initReportRuleListeners() {
  if (dom.reportEnabledToggle) {
    dom.reportEnabledToggle.addEventListener("change", () => {
      if (dom.reportEnabledLabel)
        dom.reportEnabledLabel.textContent = dom.reportEnabledToggle.checked
          ? "Reporte por Imagen (Activado)"
          : "Reporte por Imagen (Desactivado)";
      markUnsavedChanges();
    });
  }

  // --- INICIALIZAR AUTOCOMPLETADO (LÍNEA FALTANTE) ---
  initReportAutocomplete();

  if (dom.btnAddReportRule) {
    dom.btnAddReportRule.addEventListener("click", handleAddReportRule);
  }

  // --- INICIO CORRECCIÓN ---
  // Listener para ocultar turno si se selecciona "Docentes"
  if (dom.reportRuleCicloSelect) {
    dom.reportRuleCicloSelect.addEventListener("change", () => {
      const turnoContainer = document.getElementById(
        "report-rule-turno-container"
      );
      if (turnoContainer) {
        if (dom.reportRuleCicloSelect.value === "DOCENTES") {
          turnoContainer.style.display = "none";
        } else {
          turnoContainer.style.display = "block";
        }
      }
      markUnsavedChanges();
    });
  }
  // --- FIN CORRECCIÓN ---

  [dom.reportRuleCicloSelect, dom.reportRuleTurnoSelect].forEach((el) => {
    if (el) el.addEventListener("change", markUnsavedChanges);
  });
}