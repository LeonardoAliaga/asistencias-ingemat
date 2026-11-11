// Editor transaccional de apoderados y áreas desde Editar usuario.
// Se conserva el ID de cada contacto y los retiros se aplican solo al guardar.
const $ = id => document.getElementById(id);
const baseAreas = ["A", "B", "C", "D", "E", "GENERAL"];
let initialized = false;
function field(labelText, input) {
  const label = document.createElement("label");
  label.className = "field";
  label.append(document.createTextNode(labelText), input);
  return label;
}
function guardianRow(contact = {}) {
  const row = document.createElement("div");
  row.className = "edit-guardian-row";
  row.dataset.id = contact.id || "";
  const pair = document.createElement("div");
  pair.className = "form-row";
  const name = document.createElement("input");
  name.type = "text";
  name.className = "edit-guardian-name";
  name.maxLength = 100;
  name.autocomplete = "name";
  name.value = contact.name || "";
  const phone = document.createElement("input");
  phone.type = "tel";
  phone.className = "edit-guardian-phone";
  phone.placeholder = "+51900111222";
  phone.autocomplete = "tel";
  phone.value = contact.phone || "";
  pair.append(field("Nombre del apoderado", name), field("Número de WhatsApp", phone));
  const consent = document.createElement("input");
  consent.type = "checkbox";
  consent.className = "edit-guardian-consent";
  consent.checked = contact.consent === true || contact.consent === 1;
  const consentLabel = field("El apoderado autorizó recibir avisos de este estudiante", consent);
  consentLabel.className = "v2-checkbox";
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "v2-link";
  remove.textContent = "Retirar apoderado";
  const undo = document.createElement("button");
  undo.type = "button";
  undo.className = "v2-link";
  undo.textContent = "Deshacer retiro";
  undo.hidden = true;
  const note = document.createElement("span");
  note.className = "v2-help";
  note.textContent = "Este contacto quedará inactivo al guardar.";
  note.hidden = true;
  remove.addEventListener("click", () => {
    if (!row.dataset.id) return row.remove();
    row.dataset.remove = "true";
    pair.hidden = consentLabel.hidden = remove.hidden = true;
    undo.hidden = note.hidden = false;
  });
  undo.addEventListener("click", () => {
    delete row.dataset.remove;
    pair.hidden = consentLabel.hidden = remove.hidden = note.hidden = false;
    undo.hidden = note.hidden = true;
  });
  row.append(pair, consentLabel, remove, undo, note);
  $("edit-guardians-list").append(row);
}
export function initEditStudentDetails() {
  if (initialized) return;
  initialized = true;
  const areaGroup = $("edit-student-area-group");
  areaGroup.addEventListener("change", (event) => {
    const box = event.target.closest('input[name="edit-student-area"]');
    if (!box) return;
    const all = [...areaGroup.querySelectorAll('input[name="edit-student-area"]')];
    if (box.checked) all.forEach(other => { if (other !== box) other.checked = false; });
    else if (!all.some(other => other.checked)) box.checked = true;
  });
  $("edit-add-guardian").addEventListener("click", () => guardianRow());
}
export function populateEditStudentDetails(student = null) {
  const group = $("edit-student-area-group");
  group.querySelectorAll("[data-legacy-area]").forEach(item => item.remove());
  const area = String(student?.area || "GENERAL").trim().toUpperCase() || "GENERAL";
  if (!baseAreas.includes(area)) {
    const label = document.createElement("label");
    label.dataset.legacyArea = "1";
    const box = document.createElement("input");
    box.type = "checkbox";
    box.name = "edit-student-area";
    box.value = area;
    label.append(box, document.createTextNode(" Área existente: " + area));
    group.querySelector(".student-area-options").append(label);
  }
  group.querySelectorAll('input[name="edit-student-area"]').forEach(box => {
    box.checked = box.value === area;
  });
  $("edit-guardians-list").replaceChildren();
  const contacts = (student?.contacts || []).filter(c => !!c.active);
  contacts.forEach(guardianRow);
  if (!contacts.length) guardianRow();
}
export function getEditStudentDetails() {
  const area = [...$("edit-student-area-group").querySelectorAll('input[name="edit-student-area"]')].find(x=>x.checked)?.value || "GENERAL";
  const guardians = [...$("edit-guardians-list").querySelectorAll(".edit-guardian-row")].map(row=>{
    const id = row.dataset.id || undefined;
    if (row.dataset.remove === "true") return { id, remove: true };
    return {
      id,
      name: row.querySelector(".edit-guardian-name").value.trim(),
      phone: row.querySelector(".edit-guardian-phone").value.trim(),
      consent: row.querySelector(".edit-guardian-consent").checked,
    };
  }).filter(g=>g.remove || g.id || g.name || g.phone || g.consent);
  return { area, guardians };
}
