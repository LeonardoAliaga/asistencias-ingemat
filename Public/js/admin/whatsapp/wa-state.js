// Proyecto Beta/Public/js/admin/whatsapp/wa-state.js

export let currentWhatsappConfig = {
  enabledGeneral: false,
  studentNotificationsEnabled: false,
  teacherNotificationsEnabled: false,
  automatedReportEnabled: false,
  studentRules: [],
  teacherTargetType: "number",
  teacherTargetId: null,
  automatedReport: {
    // sendTimeMañana y Tarde eliminados
    targets: [],
  },
};
export let availableGroups = [];
export let hasUnsavedChanges = false;
export let statusCheckInterval = null;

export function setConfig(config) {
  currentWhatsappConfig = config;
}
export function setGroups(groups) {
  availableGroups = groups;
}
export function setUnsavedChanges(value) {
  hasUnsavedChanges = value;
}
export function setStatusInterval(interval) {
  statusCheckInterval = interval;
}
