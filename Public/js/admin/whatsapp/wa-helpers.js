// Proyecto Beta/Public/js/admin/whatsapp/wa-helpers.js
import * as dom from "./wa-dom.js";
import * as state from "./wa-state.js";

export function showMessage(element, message, isError = false) {
  if (!element) return;
  element.textContent = message;
  element.className = isError ? "form-message error" : "form-message success";
  element.style.display = "block";
  setTimeout(() => {
    if (element) {
      element.style.display = "none";
      element.textContent = "";
      element.className = "form-message";
    }
  }, 4000);
}

export function showUnsavedNotification(show = true) {
  if (dom.unsavedAlert) {
    dom.unsavedAlert.style.display = show ? "flex" : "none";
  }
  state.setUnsavedChanges(show);
}

export function markUnsavedChanges() {
  if (!state.hasUnsavedChanges) {
    console.log("Cambios detectados, mostrando notificación.");
    showUnsavedNotification(true);
  }
}

// --- FUNCIÓN populateGroupSelect ELIMINADA ---
