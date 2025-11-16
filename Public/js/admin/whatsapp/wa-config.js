// Proyecto Beta/Public/js/admin/whatsapp/wa-config.js
import * as dom from "./wa-dom.js";
import * as state from "./wa-state.js";
import {
  showMessage,
  markUnsavedChanges,
  showUnsavedNotification,
  // populateGroupSelect (ELIMINADO)
} from "./wa-helpers.js";
import { renderStudentRules } from "./wa-rules-student.js";
import { updateTeacherTargetUI } from "./wa-rules-teacher.js";
import {
  renderReportRules,
  // filterReportGroupOptions (ELIMINADO)
} from "./wa-rules-report.js";

// --- populateGroupSelect FUE ELIMINADA DE AQUÍ ---

export async function loadCiclosForRuleSelect() {
  if (!dom.ruleCicloSelect) return;
  try {
    const res = await fetch("/api/ciclos");
    if (!res.ok) throw new Error(`Error ${res.status} al cargar ciclos`);
    const data = await res.json();

    const selectsToPopulate = [dom.ruleCicloSelect, dom.reportRuleCicloSelect];
    selectsToPopulate.forEach((selectEl) => {
      if (selectEl) {
        selectEl.innerHTML = '<option value="">Selecciona Ciclo</option>';

        // --- INICIO DE CORRECCIÓN ---
        // Añadir la opción DOCENTES solo al selector de reportes
        if (selectEl.id === "report-rule-ciclo") {
          const optionDocentes = document.createElement("option");
          optionDocentes.value = "DOCENTES";
          optionDocentes.textContent = "Reporte Docentes";
          selectEl.appendChild(optionDocentes);
        }
        // --- FIN DE CORRECCIÓN ---

        if (data && data.ciclos) {
          data.ciclos.forEach((ciclo) => {
            const option = document.createElement("option");
            option.value = ciclo;
            option.textContent = ciclo.charAt(0).toUpperCase() + ciclo.slice(1);
            selectEl.appendChild(option);
          });
        }
      }
    });
  } catch (error) {
    console.error("Error cargando ciclos para reglas:", error);
    [dom.ruleCicloSelect, dom.reportRuleCicloSelect].forEach((selectEl) => {
      if (selectEl)
        selectEl.innerHTML = '<option value="">Error al cargar</option>';
    });
  }
}

export async function loadGroups() {
  console.log("Iniciando loadGroups...");
  // --- MODIFICADO: Actualizar placeholders de inputs de filtro ---
  [
    dom.ruleGroupFiltro,
    dom.teacherGroupFiltro,
    dom.reportRuleGroupFiltro,
  ].forEach((inputEl) => {
    if (inputEl) {
      inputEl.placeholder = "Cargando grupos...";
      inputEl.disabled = true;
    }
  });

  try {
    const response = await fetch("/whatsapp/api/groups");
    if (!response.ok) throw new Error(`Error ${response.status} del servidor`);
    const data = await response.json();
    if (data.exito && Array.isArray(data.groups)) {
      const sortedGroups = data.groups.sort((a, b) =>
        a.name.localeCompare(b.name)
      );
      state.setGroups(sortedGroups);

      console.log(
        `[wa-config.js] loadGroups: ${state.availableGroups.length} grupos recibidos y guardados en el estado.`
      );

      // --- MODIFICADO: Habilitar inputs de filtro ---
      [
        dom.ruleGroupFiltro,
        dom.teacherGroupFiltro,
        dom.reportRuleGroupFiltro,
      ].forEach((inputEl) => {
        if (inputEl) {
          inputEl.disabled = false;
          inputEl.placeholder = "Buscar grupo por nombre...";
        }
      });

      // --- MODIFICADO: Cargar la configuración *después* de tener los grupos ---
      // Esto permite que loadWhatsappConfig ponga los nombres de grupo guardados
      await loadWhatsappConfig();
    } else {
      throw new Error(
        data.mensaje || "Formato de respuesta inválido de la API de grupos"
      );
    }
  } catch (error) {
    console.error("Error cargando grupos:", error);
    // --- MODIFICADO: Mostrar error en inputs de filtro ---
    [
      dom.ruleGroupFiltro,
      dom.teacherGroupFiltro,
      dom.reportRuleGroupFiltro,
    ].forEach((inputEl) => {
      if (inputEl) {
        inputEl.placeholder = `Error: ${error.message}`;
      }
    });
    state.setGroups([]);
  }
  console.log("loadGroups finalizado.");
}

export async function loadWhatsappConfig() {
  try {
    const response = await fetch("/whatsapp/api/config");
    if (!response.ok) throw new Error(`Error ${response.status} del servidor`);
    const data = await response.json();
    if (data.exito && data.config) {
      const defaultConfig = {
        enabledGeneral: false,
        studentNotificationsEnabled: false,
        teacherNotificationsEnabled: false,
        automatedReportEnabled: false,
        studentRules: [],
        teacherTargetType: "number",
        teacherTargetId: null,
        automatedReport: {
          targets: [],
        },
      };

      // --- Lógica de Migración ---
      let config = { ...defaultConfig, ...data.config };
      config.automatedReport = {
        ...defaultConfig.automatedReport,
        ...data.config.automatedReport,
      };
      if (config.enabled !== undefined) {
        config.studentNotificationsEnabled = config.enabled;
        delete config.enabled;
      }
      if (
        config.automatedReport &&
        config.automatedReport.enabled !== undefined
      ) {
        config.automatedReportEnabled = config.automatedReport.enabled;
        delete config.automatedReport.enabled;
      }
      // --- Fin Migración ---

      state.setConfig(config);

      // --- Actualizar UI General (Toggles) ---
      if (dom.enabledGeneralToggle)
        dom.enabledGeneralToggle.checked =
          state.currentWhatsappConfig.enabledGeneral;
      if (dom.enabledGeneralLabel)
        dom.enabledGeneralLabel.textContent = state.currentWhatsappConfig
          .enabledGeneral
          ? "Activación General de WhatsApp (ENCENDIDO)"
          : "Activación General de WhatsApp (APAGADO)";

      if (dom.studentNotificationsToggle)
        dom.studentNotificationsToggle.checked =
          state.currentWhatsappConfig.studentNotificationsEnabled;
      if (dom.studentNotificationsLabel)
        dom.studentNotificationsLabel.textContent = state.currentWhatsappConfig
          .studentNotificationsEnabled
          ? "Notificaciones de Estudiantes (Activadas)"
          : "Notificaciones de Estudiantes (Desactivadas)";

      if (dom.teacherNotificationsToggle)
        dom.teacherNotificationsToggle.checked =
          state.currentWhatsappConfig.teacherNotificationsEnabled;
      if (dom.teacherNotificationsLabel)
        dom.teacherNotificationsLabel.textContent = state.currentWhatsappConfig
          .teacherNotificationsEnabled
          ? "Notificaciones de Docentes (Activadas)"
          : "Notificaciones de Docentes (Desactivadas)";

      if (dom.reportEnabledToggle)
        dom.reportEnabledToggle.checked =
          state.currentWhatsappConfig.automatedReportEnabled;
      if (dom.reportEnabledLabel)
        dom.reportEnabledLabel.textContent = state.currentWhatsappConfig
          .automatedReportEnabled
          ? "Reporte por Imagen (Activado)"
          : "Reporte por Imagen (Desactivado)";
      // --- Fin Toggles ---

      const targetType =
        state.currentWhatsappConfig.teacherTargetType || "number";
      const targetId = state.currentWhatsappConfig.teacherTargetId || "";
      if (dom.teacherTargetTypeSelect)
        dom.teacherTargetTypeSelect.value = targetType;

      // --- LÓGICA MODIFICADA PARA AUTOCOMPLETADO DE DOCENTE ---
      if (targetType === "number") {
        if (dom.teacherNumberInputEl)
          dom.teacherNumberInputEl.value = targetId.replace("@c.us", "");
        if (dom.teacherGroupFiltro) dom.teacherGroupFiltro.value = "";
        if (dom.teacherGroupHidden) dom.teacherGroupHidden.value = "";
      } else {
        if (dom.teacherGroupHidden) dom.teacherGroupHidden.value = targetId;
        const group = state.availableGroups.find((g) => g.id === targetId);
        if (dom.teacherGroupFiltro)
          dom.teacherGroupFiltro.value = group ? group.name : targetId;
        if (dom.teacherNumberInputEl) dom.teacherNumberInputEl.value = "";
      }
      // --- FIN LÓGICA MODIFICADA ---
      updateTeacherTargetUI();

      renderStudentRules();

      const reportConfig = state.currentWhatsappConfig.automatedReport;

      if (dom.ruleCicloSelect.options.length <= 1)
        await loadCiclosForRuleSelect();

      renderReportRules();
    } else {
      throw new Error(data.mensaje || "No se pudo cargar la configuración");
    }
  } catch (error) {
    console.error("Error cargando configuración:", error);
    showMessage(
      dom.msgWhatsappConfig,
      `Error al cargar configuración: ${error.message}`,
      true
    );
  }
}

export async function saveWhatsappConfig() {
  if (!dom.saveConfigBtn) return;
  dom.saveConfigBtn.disabled = true;
  showMessage(dom.msgWhatsappConfig, "Guardando...", false);

  const teacherType = dom.teacherTargetTypeSelect
    ? dom.teacherTargetTypeSelect.value
    : "number";
  let teacherId = null;

  if (teacherType === "number") {
    const teacherNumRaw = dom.teacherNumberInputEl
      ? dom.teacherNumberInputEl.value.trim()
      : "";
    const teacherNum = teacherNumRaw.replace(/\D/g, "");
    if (teacherNum) {
      if (teacherNum.length >= 9) {
        teacherId = `${teacherNum}@c.us`;
      } else {
        showMessage(
          dom.msgWhatsappConfig,
          "El número de docente parece inválido (muy corto).",
          true
        );
        dom.saveConfigBtn.disabled = false;
        return;
      }
    }
  } else {
    // --- MODIFICADO: Leer del input oculto ---
    teacherId = dom.teacherGroupHidden ? dom.teacherGroupHidden.value : "";
    if (!teacherId) {
      showMessage(
        dom.msgWhatsappConfig,
        "Debes seleccionar un grupo para docentes de la lista.",
        true
      );
      dom.saveConfigBtn.disabled = false;
      return;
    }
  }

  const reportConfig = {
    targets: state.currentWhatsappConfig.automatedReport?.targets || [],
  };

  const configToSave = {
    enabledGeneral: dom.enabledGeneralToggle
      ? dom.enabledGeneralToggle.checked
      : false,
    studentNotificationsEnabled: dom.studentNotificationsToggle
      ? dom.studentNotificationsToggle.checked
      : false,
    teacherNotificationsEnabled: dom.teacherNotificationsToggle
      ? dom.teacherNotificationsToggle.checked
      : false,
    automatedReportEnabled: dom.reportEnabledToggle
      ? dom.reportEnabledToggle.checked
      : false,

    studentRules: state.currentWhatsappConfig.studentRules || [],
    teacherTargetType: teacherType,
    teacherTargetId: teacherId,
    automatedReport: reportConfig,
  };

  try {
    const response = await fetch("/whatsapp/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(configToSave),
    });
    if (!response.ok) throw new Error(`Error ${response.status} del servidor`);
    const data = await response.json();
    if (data.exito) {
      showMessage(
        dom.msgWhatsappConfig,
        data.mensaje || "Configuración guardada."
      );
      state.setConfig(configToSave);
      showUnsavedNotification(false);
    } else {
      throw new Error(data.mensaje || "Error desconocido al guardar");
    }
  } catch (error) {
    console.error("Error guardando configuración:", error);
    showMessage(
      dom.msgWhatsappConfig,
      `Error al guardar: ${error.message}`,
      true
    );
  } finally {
    dom.saveConfigBtn.disabled = false;
  }
}