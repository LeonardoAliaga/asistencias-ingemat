const { normalizeDefinition } = require("./grading.service");
const presets = require("../content/exam-presets.json").map((preset) => ({
  ...preset,
  definition: normalizeDefinition(preset.definition, { complete: false }),
}));
// Each editor receives its own copy; built-ins never overwrite saved exams/templates.
function listPresets() {
  return structuredClone(presets);
}
module.exports = { listPresets };
