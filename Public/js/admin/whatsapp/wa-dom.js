// Proyecto Beta/Public/js/admin/whatsapp/wa-dom.js

// --- Elementos del DOM ---
export const statusIndicator = document.getElementById(
  "whatsapp-status-indicator"
);
export const statusMessage = document.getElementById("whatsapp-status-message");
export const refreshStatusBtn = document.getElementById(
  "btn-refresh-whatsapp-status"
);

// --- Toggles de Activación (NUEVOS IDs) ---
export const enabledGeneralToggle = document.getElementById(
  "whatsapp-enabled-general"
);
export const enabledGeneralLabel = document.getElementById(
  "whatsapp-enabled-general-label"
);
export const studentNotificationsToggle = document.getElementById(
  "student-notifications-toggle"
);
export const studentNotificationsLabel = document.getElementById(
  "student-notifications-label"
);
export const teacherNotificationsToggle = document.getElementById(
  "teacher-notifications-toggle"
);
export const teacherNotificationsLabel = document.getElementById(
  "teacher-notifications-label"
);
export const reportEnabledToggle = document.getElementById(
  "report-enabled-toggle"
);
export const reportEnabledLabel = document.getElementById(
  "report-enabled-label"
);
// --- Fin Toggles ---

export const studentRulesListDiv =
  document.getElementById("student-rules-list");
export const ruleCicloSelect = document.getElementById("rule-ciclo");
export const ruleTurnoSelect = document.getElementById("rule-turno");
export const ruleTargetTypeSelect = document.getElementById("rule-target-type");
export const ruleGroupField = document.getElementById("rule-group-field");
// --- CAMPOS DE GRUPO DE ESTUDIANTES (Autocompletar) ---
export const ruleGroupFiltro = document.getElementById("rule-group-filtro");
export const ruleGroupHidden = document.getElementById("rule-group-hidden");
export const ruleGroupResultados = document.getElementById(
  "rule-group-resultados"
);
// --- FIN ---
export const ruleNumberField = document.getElementById("rule-number-field");
export const ruleNumberInput = document.getElementById("rule-number-input");
export const addRuleBtn = document.getElementById("btn-add-student-rule");
export const msgAddRule = document.getElementById("msg-add-rule");
export const saveConfigBtn = document.getElementById(
  "btn-save-whatsapp-config"
);
export const msgWhatsappConfig = document.getElementById("msg-whatsapp-config");

export const unsavedAlert = document.getElementById("unsaved-changes-alert");
export const jumpToSaveBtn = document.getElementById("btn-jump-to-save");
export const saveSection = document.getElementById("whatsapp-save-section");

export const configContent = document.getElementById("whatsapp-config-content");
export const qrContainer = document.getElementById("whatsapp-qr-container");
export const qrCanvas = document.getElementById("whatsapp-qr-canvas");
export const qrMessage = document.getElementById("whatsapp-qr-message");

export const forceRestartBtn = document.getElementById(
  "btn-force-whatsapp-restart"
);
export const msgForceRestart = document.getElementById("msg-force-restart");

export const teacherTargetTypeSelect = document.getElementById(
  "teacher-target-type"
);
export const teacherGroupField = document.getElementById("teacher-group-field");
// --- CAMPOS DE GRUPO DE DOCENTES (Autocompletar) ---
export const teacherGroupFiltro = document.getElementById(
  "teacher-group-filtro"
);
export const teacherGroupHidden = document.getElementById(
  "teacher-group-hidden"
);
export const teacherGroupResultados = document.getElementById(
  "teacher-group-resultados"
);
// --- FIN ---
export const teacherNumberField = document.getElementById(
  "teacher-number-field"
);
export const teacherNumberInputEl = document.getElementById(
  "teacher-number-input"
);

// --- Elementos para Reporte Automático ---
export const reportRulesListDiv = document.getElementById("report-rules-list");
export const reportRuleCicloSelect =
  document.getElementById("report-rule-ciclo");
export const reportRuleTurnoSelect =
  document.getElementById("report-rule-turno");
// --- CAMPOS DE GRUPO DE REPORTE (Autocompletar) ---
export const reportRuleGroupFiltro = document.getElementById(
  "report-rule-group-filtro"
);
export const reportRuleGroupHidden = document.getElementById(
  "report-rule-group-hidden"
);
export const reportRuleGroupResultados = document.getElementById(
  "report-rule-resultados"
);
// --- FIN ---
export const btnAddReportRule = document.getElementById("btn-add-report-rule");
export const msgAddReportRule = document.getElementById("msg-add-report-rule");
