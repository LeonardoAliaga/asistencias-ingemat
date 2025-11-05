// Proyecto Beta/Public/js/admin/whatsapp.js
// --- Importar Módulos ---
import * as dom from "./whatsapp/wa-dom.js";
import * as state from "./whatsapp/wa-state.js";
import {
  showUnsavedNotification,
  markUnsavedChanges,
  showMessage, // <-- Importar showMessage
} from "./whatsapp/wa-helpers.js";
import {
  updateWhatsappStatus,
  stopStatusPolling,
} from "./whatsapp/wa-status.js";
import {
  loadWhatsappConfig,
  loadCiclosForRuleSelect,
  saveWhatsappConfig,
} from "./whatsapp/wa-config.js";
import { initStudentRuleListeners } from "./whatsapp/wa-rules-student.js";
import { initTeacherRuleListeners } from "./whatsapp/wa-rules-teacher.js";
import { initReportRuleListeners } from "./whatsapp/wa-rules-report.js";

/**
 * Inicializa toda la lógica de la pestaña de WhatsApp.
 */
export function initWhatsappAdmin() {
  console.log("Inicializando admin WhatsApp (modular v3)...");

  // 1. Resetear estado
  state.setUnsavedChanges(false);
  showUnsavedNotification(false);
  stopStatusPolling();

  // 2. Cargar datos iniciales
  updateWhatsappStatus();
  loadWhatsappConfig();
  loadCiclosForRuleSelect();

  // 3. Inicializar todos los listeners

  // -- Listeners de Estado y Conexión --
  if (dom.refreshStatusBtn) {
    dom.refreshStatusBtn.addEventListener("click", updateWhatsappStatus);
  }
  if (dom.forceRestartBtn) {
    dom.forceRestartBtn.onclick = async () => {
      if (
        !confirm(
          "Esto borrará la sesión actual de WhatsApp y generará un nuevo QR. ¿Continuar?"
        )
      ) {
        return;
      }
      showMessage(dom.msgForceRestart, "Forzando reinicio...", false);
      dom.forceRestartBtn.disabled = true;
      try {
        const res = await fetch("/whatsapp/api/restart", { method: "POST" });
        const data = await res.json();
        if (data.exito) {
          showMessage(dom.msgForceRestart, data.mensaje, false);
          await updateWhatsappStatus();
        } else {
          throw new Error(data.mensaje);
        }
      } catch (e) {
        showMessage(dom.msgForceRestart, `Error: ${e.message}`, true);
      } finally {
        dom.forceRestartBtn.disabled = false;
      }
    };
  }

  // -- Listeners de Secciones de Reglas --
  initStudentRuleListeners();
  initTeacherRuleListeners();
  initReportRuleListeners();

  // -- Listeners de Toggles (Petición 1) --
  if (dom.enabledGeneralToggle) {
    dom.enabledGeneralToggle.addEventListener("change", () => {
      if (dom.enabledGeneralLabel)
        dom.enabledGeneralLabel.textContent = dom.enabledGeneralToggle.checked
          ? "Activación General de WhatsApp (ENCENDIDO)"
          : "Activación General de WhatsApp (APAGADO)";
      markUnsavedChanges();
    });
  }
  if (dom.studentNotificationsToggle) {
    dom.studentNotificationsToggle.addEventListener("change", () => {
      if (dom.studentNotificationsLabel)
        dom.studentNotificationsLabel.textContent = dom
          .studentNotificationsToggle.checked
          ? "Notificaciones de Estudiantes (Activadas)"
          : "Notificaciones de Estudiantes (Desactivadas)";
      markUnsavedChanges();
    });
  }
  if (dom.teacherNotificationsToggle) {
    dom.teacherNotificationsToggle.addEventListener("change", () => {
      if (dom.teacherNotificationsLabel)
        dom.teacherNotificationsLabel.textContent = dom
          .teacherNotificationsToggle.checked
          ? "Notificaciones de Docentes (Activadas)"
          : "Notificaciones de Docentes (Desactivadas)";
      markUnsavedChanges();
    });
  }
  // (El listener para reportEnabledToggle ya está en initReportRuleListeners)

  // -- Listeners de Guardado y Alerta --
  if (dom.saveConfigBtn) {
    dom.saveConfigBtn.addEventListener("click", saveWhatsappConfig);
  }

  if (dom.jumpToSaveBtn && dom.saveSection) {
    dom.jumpToSaveBtn.addEventListener("click", () => {
      dom.saveSection.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }
}
