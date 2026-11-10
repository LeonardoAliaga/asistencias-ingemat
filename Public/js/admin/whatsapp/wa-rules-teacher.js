// Proyecto Beta/Public/js/admin/whatsapp/wa-rules-teacher.js
import * as dom from "./wa-dom.js";
import * as state from "./wa-state.js";
import { markUnsavedChanges } from "./wa-helpers.js";

import { setupGroupAutocomplete } from "./wa-group-autocomplete.js";

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
  setupGroupAutocomplete({input:dom.teacherGroupFiltro,hiddenInput:dom.teacherGroupHidden,resultsContainer:dom.teacherGroupResultados,getGroups:()=>state.availableGroups,onSelect:markUnsavedChanges});

  if (dom.teacherNumberInputEl) {
    dom.teacherNumberInputEl.addEventListener("input", markUnsavedChanges);
  }
}
