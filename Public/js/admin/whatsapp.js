// Proyecto/Public/js/admin/whatsapp.js

let currentWhatsappConfig = {
  enabled: false,
  studentRules: [],
  teacherNumber: null,
};
let availableGroups = [];
let hasUnsavedChanges = false;

// --- Elementos del DOM ---
const statusIndicator = document.getElementById("whatsapp-status-indicator");
const statusMessage = document.getElementById("whatsapp-status-message");
const refreshStatusBtn = document.getElementById("btn-refresh-whatsapp-status");
const enabledToggle = document.getElementById("whatsapp-enabled-toggle");
const enabledLabel = document.getElementById("whatsapp-enabled-label");
const studentRulesListDiv = document.getElementById("student-rules-list");
const ruleCicloSelect = document.getElementById("rule-ciclo");
const ruleTurnoSelect = document.getElementById("rule-turno");
const ruleTargetTypeSelect = document.getElementById("rule-target-type");
const ruleGroupField = document.getElementById("rule-group-field");
const ruleGroupSelect = document.getElementById("rule-group-select");
const ruleGroupSearch = document.getElementById("rule-group-search");
const ruleNumberField = document.getElementById("rule-number-field");
const ruleNumberInput = document.getElementById("rule-number-input");
const addRuleBtn = document.getElementById("btn-add-student-rule");
const msgAddRule = document.getElementById("msg-add-rule");
const teacherNumberInput = document.getElementById("teacher-number-input");
const saveConfigBtn = document.getElementById("btn-save-whatsapp-config");
const msgWhatsappConfig = document.getElementById("msg-whatsapp-config");

const unsavedAlert = document.getElementById("unsaved-changes-alert");
const jumpToSaveBtn = document.getElementById("btn-jump-to-save");
const saveSection = document.getElementById("whatsapp-save-section");

// --- Funciones ---

// Muestra/Oculta la alerta de cambios sin guardar
function showUnsavedNotification(show = true) {
  if (unsavedAlert) {
    unsavedAlert.style.display = show ? "flex" : "none"; // Usar flex por el botón
  }
  hasUnsavedChanges = show; // Actualizar bandera
}

// Marca que hay cambios y muestra la notificación
function markUnsavedChanges() {
  if (!hasUnsavedChanges) {
    console.log("Cambios detectados, mostrando notificación.");
    showUnsavedNotification(true);
  }
}

// Muestra mensajes temporales
function showMessage(element, message, isError = false) {
  if (!element) return;
  element.textContent = message;
  element.className = isError ? "form-message error" : "form-message success";
  element.style.display = "block";
  setTimeout(() => {
    if (element) {
      // Re-check if element still exists
      element.style.display = "none";
      element.textContent = "";
      element.className = "form-message";
    }
  }, 4000);
}

// Actualiza el indicador de estado de conexión
async function updateWhatsappStatus() {
  if (!statusIndicator || !statusMessage) return;
  statusIndicator.textContent = "Verificando...";
  statusIndicator.className = "status-checking";
  statusMessage.textContent = "";
  if (refreshStatusBtn) refreshStatusBtn.disabled = true;
  console.log("Verificando estado de WhatsApp...");

  try {
    const response = await fetch("/whatsapp/api/status");
    console.log("Respuesta de /status:", response.status);
    if (!response.ok) {
      throw new Error(`Error ${response.status} del servidor`);
    }
    const data = await response.json();
    console.log("Datos de /status:", data);

    if (data.exito) {
      if (data.isReady) {
        statusIndicator.textContent = "Conectado";
        statusIndicator.className = "status-connected";
        statusMessage.textContent = "El cliente de WhatsApp está operativo.";
        console.log("WhatsApp conectado, llamando a loadGroups...");
        await loadGroups(); // Llamar a cargar grupos ahora que está conectado
      } else {
        statusIndicator.textContent = "Desconectado";
        statusIndicator.className = "status-disconnected";
        statusMessage.textContent =
          "Cliente no listo. Revisa la consola del servidor o escanea el QR si es necesario.";
        if (ruleGroupSelect)
          ruleGroupSelect.innerHTML =
            '<option value="">WhatsApp no conectado</option>';
        if (ruleGroupSelect) ruleGroupSelect.disabled = true;
        if (ruleGroupSearch) ruleGroupSearch.disabled = true;
        availableGroups = [];
        console.log("WhatsApp desconectado.");
        // Limpiar la lista visualmente si estaba poblada
        populateGroupSelect([]);
      }
    } else {
      throw new Error(data.mensaje || "Respuesta API /status sin éxito");
    }
  } catch (error) {
    console.error("Error al obtener estado de WhatsApp:", error);
    statusIndicator.textContent = "Error";
    statusIndicator.className = "status-error";
    statusMessage.textContent = `Error al verificar: ${error.message}`;
    if (ruleGroupSelect)
      ruleGroupSelect.innerHTML =
        '<option value="">Error al verificar</option>';
    if (ruleGroupSelect) ruleGroupSelect.disabled = true;
    if (ruleGroupSearch) ruleGroupSearch.disabled = true;
    availableGroups = [];
  } finally {
    if (refreshStatusBtn) {
      refreshStatusBtn.disabled = false;
    }
    console.log("Verificación de estado finalizada.");
  }
}

// Carga la configuración desde el backend
async function loadWhatsappConfig() {
  try {
    const response = await fetch("/whatsapp/api/config");
    if (!response.ok) throw new Error(`Error ${response.status} del servidor`);
    const data = await response.json();
    if (data.exito && data.config) {
      currentWhatsappConfig = data.config;
      // Actualizar UI
      if (enabledToggle) enabledToggle.checked = currentWhatsappConfig.enabled;
      if (enabledLabel)
        enabledLabel.textContent = currentWhatsappConfig.enabled
          ? "Notificaciones Activadas"
          : "Notificaciones Desactivadas";
      const teacherNum = currentWhatsappConfig.teacherNumber || "";
      if (teacherNumberInput)
        teacherNumberInput.value = teacherNum.replace("@c.us", "");
      renderStudentRules(); // Renderizar reglas después de cargar la configuración
    } else {
      throw new Error(data.mensaje || "No se pudo cargar la configuración");
    }
  } catch (error) {
    console.error("Error cargando configuración:", error);
    showMessage(
      msgWhatsappConfig,
      `Error al cargar configuración: ${error.message}`,
      true
    );
  }
}

// Guarda la configuración en el backend
async function saveWhatsappConfig() {
  if (!saveConfigBtn) return;
  saveConfigBtn.disabled = true;
  showMessage(msgWhatsappConfig, "Guardando...", false);

  const configToSave = {
    enabled: enabledToggle ? enabledToggle.checked : false,
    studentRules: currentWhatsappConfig.studentRules || [],
    teacherNumber: null,
  };
  const teacherNumRaw = teacherNumberInput
    ? teacherNumberInput.value.trim()
    : "";
  const teacherNum = teacherNumRaw.replace(/\D/g, "");
  if (teacherNum) {
    if (teacherNum.length >= 9) {
      configToSave.teacherNumber = `${teacherNum}@c.us`;
    } else {
      showMessage(
        msgWhatsappConfig,
        "El número de docente parece inválido (muy corto).",
        true
      );
      saveConfigBtn.disabled = false;
      return;
    }
  }

  try {
    const response = await fetch("/whatsapp/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(configToSave),
    });
    if (!response.ok) throw new Error(`Error ${response.status} del servidor`);
    const data = await response.json();
    if (data.exito) {
      showMessage(msgWhatsappConfig, data.mensaje || "Configuración guardada.");
      currentWhatsappConfig = configToSave;
      showUnsavedNotification(false); // <-- Ocultar notificación al guardar
    } else {
      throw new Error(data.mensaje || "Error desconocido al guardar");
    }
  } catch (error) {
    console.error("Error guardando configuración:", error);
    showMessage(msgWhatsappConfig, `Error al guardar: ${error.message}`, true);
  } finally {
    saveConfigBtn.disabled = false;
  }
}

// Carga los ciclos disponibles en el select de reglas
async function loadCiclosForRuleSelect() {
  if (!ruleCicloSelect) return;
  try {
    const res = await fetch("/api/ciclos");
    if (!res.ok) throw new Error(`Error ${res.status} al cargar ciclos`);
    const data = await res.json();
    ruleCicloSelect.innerHTML = '<option value="">Selecciona Ciclo</option>';
    if (data && data.ciclos) {
      data.ciclos.forEach((ciclo) => {
        const option = document.createElement("option");
        option.value = ciclo;
        option.textContent = ciclo.charAt(0).toUpperCase() + ciclo.slice(1);
        ruleCicloSelect.appendChild(option);
      });
    }
  } catch (error) {
    console.error("Error cargando ciclos para reglas:", error);
    ruleCicloSelect.innerHTML = '<option value="">Error al cargar</option>';
  }
}

// Carga los grupos desde el backend y popula el select y el filtro
async function loadGroups() {
  console.log("Iniciando loadGroups...");
  if (!ruleGroupSelect || !ruleGroupSearch) return;

  ruleGroupSelect.innerHTML = '<option value="">Cargando grupos...</option>';
  ruleGroupSelect.disabled = true;
  ruleGroupSearch.value = "";
  ruleGroupSearch.disabled = true;

  try {
    console.log("Haciendo fetch a /whatsapp/api/groups...");
    const response = await fetch("/whatsapp/api/groups");
    console.log("Respuesta de /groups:", response.status);
    if (!response.ok) throw new Error(`Error ${response.status} del servidor`);
    const data = await response.json();
    console.log("Datos de /groups:", data);

    if (data.exito && Array.isArray(data.groups)) {
      availableGroups = data.groups.sort((a, b) =>
        a.name.localeCompare(b.name)
      );
      console.log(`Grupos cargados: ${availableGroups.length}`);
      populateGroupSelect(availableGroups); // Llenar con todos inicialmente
      ruleGroupSelect.disabled = false;
      ruleGroupSearch.disabled = false;
      // Renderizar reglas de nuevo por si los nombres de grupo estaban pendientes
      renderStudentRules();
    } else {
      throw new Error(
        data.mensaje || "Formato de respuesta inválido de la API de grupos"
      );
    }
  } catch (error) {
    console.error("Error cargando grupos:", error);
    ruleGroupSelect.innerHTML = `<option value="">Error: ${error.message}</option>`;
    availableGroups = [];
    ruleGroupSelect.disabled = true;
    ruleGroupSearch.disabled = true;
  }
  console.log("loadGroups finalizado.");
}

// Popula el select de grupos con las opciones dadas
function populateGroupSelect(groups) {
  if (!ruleGroupSelect) return;
  console.log("Populando select con", groups.length, "grupos.");
  ruleGroupSelect.innerHTML = ""; // Limpiar

  // Añadir opción por defecto primero
  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = "Selecciona un grupo";
  ruleGroupSelect.appendChild(defaultOption);

  const isConnected =
    statusIndicator && statusIndicator.classList.contains("status-connected");
  if (!isConnected) {
    ruleGroupSelect.innerHTML =
      '<option value="">WhatsApp no conectado</option>';
    return;
  }

  if (groups.length === 0) {
    const noGroupOption = document.createElement("option");
    noGroupOption.value = "";
    noGroupOption.disabled = true;
    const searchTerm = ruleGroupSearch ? ruleGroupSearch.value.trim() : "";
    noGroupOption.textContent = searchTerm
      ? "No hay coincidencias"
      : "No se encontraron grupos";
    ruleGroupSelect.appendChild(noGroupOption);
    return;
  }

  const searchTerm = ruleGroupSearch ? ruleGroupSearch.value.trim() : "";
  let groupsToShow = groups;
  let messageOption = null;

  if (!searchTerm && availableGroups.length > 10) {
    groupsToShow = groups.slice(0, 10);
    messageOption = document.createElement("option");
    messageOption.value = "";
    messageOption.disabled = true;
    messageOption.textContent = `(${
      availableGroups.length - 10
    } más - usa la búsqueda)`;
  }

  groupsToShow.forEach((group) => {
    if (group && group.id && group.name) {
      const option = document.createElement("option");
      option.value = group.id;
      option.textContent = group.name;
      ruleGroupSelect.appendChild(option);
    } else {
      console.warn("Grupo inválido encontrado:", group);
    }
  });

  if (messageOption) {
    ruleGroupSelect.appendChild(messageOption);
  }
}

// Filtra las opciones del select de grupos según el input de búsqueda
function filterGroupOptions() {
  if (!ruleGroupSearch || !availableGroups) return;
  const searchTerm = ruleGroupSearch.value.toLowerCase().trim();
  const filteredGroups = availableGroups.filter((group) =>
    group.name.toLowerCase().includes(searchTerm)
  );
  populateGroupSelect(filteredGroups);
}

// Renderiza la lista de reglas de estudiantes
function renderStudentRules() {
  if (!studentRulesListDiv) return;
  studentRulesListDiv.innerHTML = "";
  const rules = currentWhatsappConfig.studentRules || [];

  if (rules.length === 0) {
    studentRulesListDiv.innerHTML =
      "<p>No hay reglas definidas para estudiantes.</p>";
    return;
  }

  const ul = document.createElement("ul");
  ul.className = "rules-ul";

  rules.forEach((rule, index) => {
    const li = document.createElement("li");
    let targetDisplay = "Destino no válido";
    if (rule.targetType === "group") {
      const group = availableGroups.find((g) => g.id === rule.targetId);
      targetDisplay = group
        ? `Grupo: ${group.name}`
        : `Grupo ID: ${rule.targetId || "N/A"}`;
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

  studentRulesListDiv.appendChild(ul);

  document.querySelectorAll(".btn-delete-rule").forEach((button) => {
    button.addEventListener("click", handleDeleteRule);
  });
}

// Maneja la eliminación de una regla de estudiante
function handleDeleteRule(event) {
  const index = parseInt(event.currentTarget.getAttribute("data-index"), 10);
  if (!isNaN(index) && confirm("¿Seguro que deseas eliminar esta regla?")) {
    if (currentWhatsappConfig.studentRules) {
      currentWhatsappConfig.studentRules.splice(index, 1);
      renderStudentRules();
      markUnsavedChanges(); // <-- Marcar cambios al eliminar
      showMessage(msgWhatsappConfig, "Regla eliminada.", false); // Mensaje más corto
    }
  }
}

// Añade una nueva regla de estudiante (localmente)
function addStudentRule() {
  // ... (validaciones existentes sin cambios) ...
  const ciclo = ruleCicloSelect ? ruleCicloSelect.value : "";
  const turno = ruleTurnoSelect ? ruleTurnoSelect.value : "";
  const targetType = ruleTargetTypeSelect
    ? ruleTargetTypeSelect.value
    : "group";
  let targetId = "";
  let validationError = null;

  if (!ciclo || !turno) {
    validationError = "Debes seleccionar un ciclo y un turno.";
  }

  if (!currentWhatsappConfig.studentRules) {
    currentWhatsappConfig.studentRules = [];
  }

  if (
    !validationError &&
    currentWhatsappConfig.studentRules.some(
      (rule) => rule.ciclo === ciclo && rule.turno === turno
    )
  ) {
    validationError = `Ya existe una regla para ${ciclo} - ${turno}. Elimina la anterior primero.`;
  }

  if (!validationError) {
    if (targetType === "group") {
      targetId = ruleGroupSelect ? ruleGroupSelect.value : "";
      if (!targetId) {
        validationError = "Debes seleccionar un grupo de WhatsApp.";
      }
    } else {
      // number
      const numberRaw = ruleNumberInput
        ? ruleNumberInput.value.trim().replace(/\D/g, "")
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
    showMessage(msgAddRule, validationError, true);
    return;
  }

  currentWhatsappConfig.studentRules.push({
    ciclo,
    turno,
    targetType,
    targetId,
  });
  renderStudentRules();

  // Limpiar formulario y mostrar mensaje
  if (ruleCicloSelect) ruleCicloSelect.value = "";
  if (ruleTurnoSelect) ruleTurnoSelect.value = "";
  if (ruleTargetTypeSelect) ruleTargetTypeSelect.value = "group";
  if (ruleGroupSelect) ruleGroupSelect.value = "";
  if (ruleGroupSearch) ruleGroupSearch.value = "";
  if (ruleNumberInput) ruleNumberInput.value = "";
  if (ruleTargetTypeSelect)
    ruleTargetTypeSelect.dispatchEvent(new Event("change"));
  filterGroupOptions();
  showMessage(msgAddRule, "Regla agregada temporalmente.");
  markUnsavedChanges(); // <-- Marcar cambios al añadir
}

// --- Inicialización y Event Listeners ---

export function initWhatsappAdmin() {
  console.log("Inicializando admin WhatsApp...");

  // Resetear estado al iniciar/cambiar a la pestaña
  hasUnsavedChanges = false;
  showUnsavedNotification(false); // Asegurarse de que esté oculta al inicio

  // Cargar estado inicial y configuración
  updateWhatsappStatus();
  loadWhatsappConfig();
  loadCiclosForRuleSelect();

  // Listeners existentes
  if (refreshStatusBtn) {
    refreshStatusBtn.addEventListener("click", updateWhatsappStatus);
  }
  if (enabledToggle) {
    enabledToggle.addEventListener("change", () => {
      if (enabledLabel)
        enabledLabel.textContent = enabledToggle.checked
          ? "Notificaciones Activadas"
          : "Notificaciones Desactivadas";
      markUnsavedChanges(); // <-- Marcar cambios
    });
  }
  if (ruleTargetTypeSelect) {
    ruleTargetTypeSelect.addEventListener("change", () => {
      const isGroup = ruleTargetTypeSelect.value === "group";
      if (ruleGroupField)
        ruleGroupField.style.display = isGroup ? "block" : "none";
      if (ruleNumberField)
        ruleNumberField.style.display = isGroup ? "none" : "block";
      const isConnected =
        statusIndicator &&
        statusIndicator.classList.contains("status-connected");
      if (ruleGroupSelect) ruleGroupSelect.disabled = !isConnected;
      if (ruleGroupSearch) ruleGroupSearch.disabled = !isConnected;
      if (!isConnected && isGroup && ruleGroupSelect) {
        ruleGroupSelect.innerHTML =
          '<option value="">WhatsApp no conectado</option>';
      } else if (
        isConnected &&
        isGroup &&
        ruleGroupSelect &&
        availableGroups.length === 0
      ) {
        ruleGroupSelect.innerHTML =
          '<option value="">No hay grupos disponibles</option>';
      } else if (isConnected && isGroup && ruleGroupSelect) {
        filterGroupOptions();
      }
    });
    ruleTargetTypeSelect.dispatchEvent(new Event("change"));
  }
  if (ruleGroupSearch) {
    ruleGroupSearch.addEventListener("input", filterGroupOptions);
  }
  if (addRuleBtn) {
    addRuleBtn.addEventListener("click", addStudentRule);
  }
  if (teacherNumberInput) {
    teacherNumberInput.addEventListener("input", () => {
      // Usar 'input' para detectar cambios al escribir
      markUnsavedChanges(); // <-- Marcar cambios
    });
  }
  if (saveConfigBtn) {
    saveConfigBtn.addEventListener("click", saveWhatsappConfig);
  }

  // Listener para el botón de ir a guardar
  if (jumpToSaveBtn && saveSection) {
    jumpToSaveBtn.addEventListener("click", () => {
      saveSection.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }
}
