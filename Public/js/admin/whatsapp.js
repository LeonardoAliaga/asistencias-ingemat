// Proyecto/Public/js/admin/whatsapp.js

let currentWhatsappConfig = {
  enabled: false,
  studentRules: [],
  // teacherNumber: null, (obsoleto)
  teacherTargetType: "number",
  teacherTargetId: null,
};
let availableGroups = [];
let hasUnsavedChanges = false;
let statusCheckInterval = null; // para polling

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
// const teacherNumberInput = document.getElementById("teacher-number-input"); // (Reemplazado)
const saveConfigBtn = document.getElementById("btn-save-whatsapp-config");
const msgWhatsappConfig = document.getElementById("msg-whatsapp-config");

const unsavedAlert = document.getElementById("unsaved-changes-alert");
const jumpToSaveBtn = document.getElementById("btn-jump-to-save");
const saveSection = document.getElementById("whatsapp-save-section");

const configContent = document.getElementById("whatsapp-config-content");
const qrContainer = document.getElementById("whatsapp-qr-container");
const qrCanvas = document.getElementById("whatsapp-qr-canvas");
const qrMessage = document.getElementById("whatsapp-qr-message");

const forceRestartBtn = document.getElementById("btn-force-whatsapp-restart");
const msgForceRestart = document.getElementById("msg-force-restart");

// --- NUEVOS ELEMENTOS PARA DOCENTES ---
const teacherTargetTypeSelect = document.getElementById("teacher-target-type");
const teacherGroupField = document.getElementById("teacher-group-field");
const teacherGroupSelect = document.getElementById("teacher-group-select");
const teacherGroupSearch = document.getElementById("teacher-group-search");
const teacherNumberField = document.getElementById("teacher-number-field");
const teacherNumberInputEl = document.getElementById("teacher-number-input"); // (ID ya existe, solo nueva variable)

// --- Funciones ---
// ... (showUnsavedNotification, markUnsavedChanges, showMessage sin cambios) ...
function showUnsavedNotification(show = true) {
  if (unsavedAlert) {
    unsavedAlert.style.display = show ? "flex" : "none";
  }
  hasUnsavedChanges = show;
}
function markUnsavedChanges() {
  if (!hasUnsavedChanges) {
    console.log("Cambios detectados, mostrando notificación.");
    showUnsavedNotification(true);
  }
}
function showMessage(element, message, isError = false) {
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

// ... (fetchAndRenderQR, startStatusPolling, stopStatusPolling sin cambios) ...
async function fetchAndRenderQR() {
  if (!qrContainer || !qrCanvas || !qrMessage) return;

  let data;
  try {
    const response = await fetch("/whatsapp/api/qr");
    if (!response.ok) {
      throw new Error(`El servidor respondió con ${response.status}`);
    }
    data = await response.json();
    if (!data.exito) {
      throw new Error(data.mensaje || "La API de QR falló.");
    }
  } catch (error) {
    console.error("Error al BUSCAR QR:", error);
    qrMessage.textContent = `Error al contactar el servidor: ${error.message}`;
    qrCanvas.style.display = "none";
    startStatusPolling();
    return;
  }

  try {
    if (data.qr) {
      qrMessage.textContent =
        "Se necesita iniciar sesión. Escanea el código QR con tu teléfono.";
      qrCanvas.style.display = "block";

      if (typeof QRCode === "undefined") {
        throw new Error(
          "La librería QRCode no se cargó. Asegúrate de que 'qrcode.min.js' esté en 'public/js/'."
        );
      }

      QRCode.toCanvas(qrCanvas, data.qr, { width: 300 }, (error) => {
        if (error) {
          console.error("Error al generar QR en canvas:", error);
          qrMessage.textContent = "Error al dibujar el código QR.";
          qrCanvas.style.display = "none";
        } else {
          console.log("QR renderizado en canvas.");
        }
      });
      startStatusPolling();
    } else {
      qrMessage.textContent =
        "Iniciando cliente de WhatsApp... Si se requiere sesión, el QR aparecerá aquí.";
      qrCanvas.style.display = "none";
      startStatusPolling();
    }
  } catch (error) {
    console.error("Error al RENDERIZAR QR:", error);
    qrMessage.textContent = `Error al renderizar: ${error.message}`;
    qrCanvas.style.display = "none";
    startStatusPolling();
  }
}
function startStatusPolling() {
  if (statusCheckInterval) return;
  console.log("Iniciando polling de estado de WhatsApp (cada 5 seg).");
  statusCheckInterval = setInterval(updateWhatsappStatus, 5000);
}
function stopStatusPolling() {
  if (statusCheckInterval) {
    console.log("Deteniendo polling de estado de WhatsApp.");
    clearInterval(statusCheckInterval);
    statusCheckInterval = null;
  }
}

// ... (updateWhatsappStatus sin cambios) ...
async function updateWhatsappStatus() {
  if (!statusIndicator || !statusMessage || !configContent || !qrContainer) {
    return;
  }
  if (refreshStatusBtn && !statusCheckInterval) {
    statusIndicator.textContent = "Verificando...";
    statusIndicator.className = "status-checking";
    statusMessage.textContent = "";
    refreshStatusBtn.disabled = true;
  }
  console.log("Verificando estado de WhatsApp...");
  try {
    const response = await fetch("/whatsapp/api/status");
    if (!response.ok) {
      throw new Error(`Error ${response.status} del servidor`);
    }
    const data = await response.json();
    if (data.exito) {
      if (data.isReady) {
        statusIndicator.textContent = "Conectado";
        statusIndicator.className = "status-connected";
        statusMessage.textContent = "El cliente de WhatsApp está operativo.";
        configContent.style.display = "block";
        qrContainer.style.display = "none";
        stopStatusPolling();
        if (availableGroups.length === 0) {
          console.log("WhatsApp conectado, llamando a loadGroups...");
          await loadGroups();
        }
      } else {
        statusIndicator.textContent = "Desconectado";
        statusIndicator.className = "status-disconnected";
        statusMessage.textContent = "Cliente no listo. Iniciando sesión...";
        configContent.style.display = "none";
        qrContainer.style.display = "block";
        availableGroups = [];
        populateGroupSelect(availableGroups); // <-- Modificado para limpiar ambos selects
        await fetchAndRenderQR();
      }
    } else {
      throw new Error(data.mensaje || "Respuesta API /status sin éxito");
    }
  } catch (error) {
    console.error("Error al obtener estado de WhatsApp:", error);
    statusIndicator.textContent = "Error";
    statusIndicator.className = "status-error";
    statusMessage.textContent = `Error al verificar: ${error.message}`;
    configContent.style.display = "none";
    qrContainer.style.display = "block";
    qrMessage.textContent = `Error al verificar estado: ${error.message}`;
    if (qrCanvas) qrCanvas.style.display = "none";
    availableGroups = [];
    populateGroupSelect(availableGroups); // <-- Modificado para limpiar ambos selects
    stopStatusPolling();
  } finally {
    if (refreshStatusBtn) {
      refreshStatusBtn.disabled = false;
    }
    console.log("Verificación de estado finalizada.");
  }
}

// --- *** NUEVA FUNCIÓN *** ---
// Muestra/oculta los campos de docente según el select
function updateTeacherTargetUI() {
  if (!teacherTargetTypeSelect) return;

  const isGroup = teacherTargetTypeSelect.value === "group";
  if (teacherGroupField)
    teacherGroupField.style.display = isGroup ? "block" : "none";
  if (teacherNumberField)
    teacherNumberField.style.display = isGroup ? "none" : "block";

  const isConnected =
    statusIndicator && statusIndicator.classList.contains("status-connected");

  if (isGroup) {
    if (teacherGroupSelect) teacherGroupSelect.disabled = !isConnected;
    if (teacherGroupSearch) teacherGroupSearch.disabled = !isConnected;
    if (!isConnected) {
      if (teacherGroupSelect)
        teacherGroupSelect.innerHTML =
          '<option value="">WhatsApp no conectado</option>';
    } else if (availableGroups.length === 0) {
      if (teacherGroupSelect)
        teacherGroupSelect.innerHTML =
          '<option value="">No hay grupos disponibles</option>';
    } else {
      // Si está conectado y hay grupos, poblarlo (filtrado o no)
      filterTeacherGroupOptions();
    }
  }
}
// --- *** FIN NUEVA FUNCIÓN *** ---

// Carga la configuración desde el backend (MODIFICADO)
async function loadWhatsappConfig() {
  try {
    const response = await fetch("/whatsapp/api/config");
    if (!response.ok) throw new Error(`Error ${response.status} del servidor`);
    const data = await response.json();
    if (data.exito && data.config) {
      currentWhatsappConfig = data.config;

      // Actualizar UI General
      if (enabledToggle) enabledToggle.checked = currentWhatsappConfig.enabled;
      if (enabledLabel)
        enabledLabel.textContent = currentWhatsappConfig.enabled
          ? "Notificaciones Activadas"
          : "Notificaciones Desactivadas";

      // Actualizar UI Docentes
      const targetType = currentWhatsappConfig.teacherTargetType || "number";
      const targetId = currentWhatsappConfig.teacherTargetId || "";
      if (teacherTargetTypeSelect) teacherTargetTypeSelect.value = targetType;
      if (targetType === "number") {
        if (teacherNumberInputEl)
          teacherNumberInputEl.value = targetId.replace("@c.us", "");
        if (teacherGroupSelect) teacherGroupSelect.value = "";
      } else {
        // group
        if (teacherGroupSelect) teacherGroupSelect.value = targetId;
        if (teacherNumberInputEl) teacherNumberInputEl.value = "";
      }

      // *** CAMBIO CLAVE: ***
      // NO disparamos 'change', llamamos a la función de UI directamente
      updateTeacherTargetUI();

      // Actualizar UI Estudiantes
      renderStudentRules();
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

// ... (saveWhatsappConfig, loadCiclosForRuleSelect, loadGroups sin cambios) ...
async function saveWhatsappConfig() {
  if (!saveConfigBtn) return;
  saveConfigBtn.disabled = true;
  showMessage(msgWhatsappConfig, "Guardando...", false);
  const teacherType = teacherTargetTypeSelect
    ? teacherTargetTypeSelect.value
    : "number";
  let teacherId = null;

  if (teacherType === "number") {
    const teacherNumRaw = teacherNumberInputEl
      ? teacherNumberInputEl.value.trim()
      : "";
    const teacherNum = teacherNumRaw.replace(/\D/g, "");
    if (teacherNum) {
      if (teacherNum.length >= 9) {
        teacherId = `${teacherNum}@c.us`;
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
  } else {
    teacherId = teacherGroupSelect ? teacherGroupSelect.value : "";
    if (!teacherId) {
      showMessage(
        msgWhatsappConfig,
        "Debes seleccionar un grupo para docentes.",
        true
      );
      saveConfigBtn.disabled = false;
      return;
    }
  }

  const configToSave = {
    enabled: enabledToggle ? enabledToggle.checked : false,
    studentRules: currentWhatsappConfig.studentRules || [],
    teacherTargetType: teacherType,
    teacherTargetId: teacherId,
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
      showMessage(msgWhatsappConfig, data.mensaje || "Configuración guardada.");
      currentWhatsappConfig = configToSave;
      showUnsavedNotification(false);
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
async function loadGroups() {
  console.log("Iniciando loadGroups...");
  [ruleGroupSelect, teacherGroupSelect].forEach((selectEl) => {
    if (selectEl) {
      selectEl.innerHTML = '<option value="">Cargando grupos...</option>';
      selectEl.disabled = true;
    }
  });
  if (ruleGroupSearch) ruleGroupSearch.disabled = true;
  if (teacherGroupSearch) teacherGroupSearch.disabled = true;
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
      populateGroupSelect(availableGroups);
      [ruleGroupSelect, teacherGroupSelect].forEach(
        (selectEl) => selectEl && (selectEl.disabled = false)
      );
      if (ruleGroupSearch) ruleGroupSearch.disabled = false;
      if (teacherGroupSearch) teacherGroupSearch.disabled = false;
      renderStudentRules();
      if (
        currentWhatsappConfig.teacherTargetType === "group" &&
        teacherGroupSelect
      ) {
        teacherGroupSelect.value = currentWhatsappConfig.teacherTargetId || "";
      }
    } else {
      throw new Error(
        data.mensaje || "Formato de respuesta inválido de la API de grupos"
      );
    }
  } catch (error) {
    console.error("Error cargando grupos:", error);
    [ruleGroupSelect, teacherGroupSelect].forEach((selectEl) => {
      if (selectEl)
        selectEl.innerHTML = `<option value="">Error: ${error.message}</option>`;
    });
    availableGroups = [];
  }
  console.log("loadGroups finalizado.");
}

// ... (populateGroupSelect, filterStudentGroupOptions, filterTeacherGroupOptions sin cambios) ...
function populateGroupSelect(groups, searchTerm = "", targetSelect = "all") {
  const selectsToPopulate = [];
  if (targetSelect === "all") {
    if (ruleGroupSelect) selectsToPopulate.push(ruleGroupSelect);
    if (teacherGroupSelect) selectsToPopulate.push(teacherGroupSelect);
  } else if (targetSelect === "student" && ruleGroupSelect) {
    selectsToPopulate.push(ruleGroupSelect);
  } else if (targetSelect === "teacher" && teacherGroupSelect) {
    selectsToPopulate.push(teacherGroupSelect);
  }
  if (selectsToPopulate.length === 0) return;
  console.log(
    `Populando ${targetSelect} select(s) con ${groups.length} grupos.`
  );
  selectsToPopulate.forEach((selectEl) => {
    const currentValue = selectEl.value;
    selectEl.innerHTML = "";
    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = "Selecciona un grupo";
    selectEl.appendChild(defaultOption);
    const isConnected =
      statusIndicator && statusIndicator.classList.contains("status-connected");
    if (!isConnected) {
      selectEl.innerHTML = '<option value="">WhatsApp no conectado</option>';
      return;
    }
    if (groups.length === 0) {
      const noGroupOption = document.createElement("option");
      noGroupOption.value = "";
      noGroupOption.disabled = true;
      noGroupOption.textContent = searchTerm
        ? "No hay coincidencias"
        : "No se encontraron grupos";
      selectEl.appendChild(noGroupOption);
      return;
    }
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
        selectEl.appendChild(option);
      } else {
        console.warn("Grupo inválido encontrado:", group);
      }
    });
    if (messageOption) {
      selectEl.appendChild(messageOption);
    }
    if (
      Array.from(selectEl.options)
        .map((o) => o.value)
        .includes(currentValue)
    ) {
      selectEl.value = currentValue;
    }
  });
}
function filterStudentGroupOptions() {
  if (!ruleGroupSearch || !availableGroups) return;
  const searchTerm = ruleGroupSearch.value.toLowerCase().trim();
  const filteredGroups = availableGroups.filter((group) =>
    group.name.toLowerCase().includes(searchTerm)
  );
  populateGroupSelect(filteredGroups, searchTerm, "student");
}
function filterTeacherGroupOptions() {
  if (!teacherGroupSearch || !availableGroups) return;
  const searchTerm = teacherGroupSearch.value.toLowerCase().trim();
  const filteredGroups = availableGroups.filter((group) =>
    group.name.toLowerCase().includes(searchTerm)
  );
  populateGroupSelect(filteredGroups, searchTerm, "teacher");
}

// ... (renderStudentRules, handleDeleteRule, addStudentRule sin cambios) ...
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
        : `Grupo ID: ${rule.targetId || "N/A"} (No encontrado)`;
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
function handleDeleteRule(event) {
  const index = parseInt(event.currentTarget.getAttribute("data-index"), 10);
  if (!isNaN(index) && confirm("¿Seguro que deseas eliminar esta regla?")) {
    if (currentWhatsappConfig.studentRules) {
      currentWhatsappConfig.studentRules.splice(index, 1);
      renderStudentRules();
      markUnsavedChanges();
      showMessage(msgWhatsappConfig, "Regla eliminada.", false);
    }
  }
}
function addStudentRule() {
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
  if (ruleCicloSelect) ruleCicloSelect.value = "";
  if (ruleTurnoSelect) ruleTurnoSelect.value = "";
  if (ruleTargetTypeSelect) ruleTargetTypeSelect.value = "group";
  if (ruleGroupSelect) ruleGroupSelect.value = "";
  if (ruleGroupSearch) ruleGroupSearch.value = "";
  if (ruleNumberInput) ruleNumberInput.value = "";
  if (ruleTargetTypeSelect)
    ruleTargetTypeSelect.dispatchEvent(new Event("change"));
  filterStudentGroupOptions();
  showMessage(msgAddRule, "Regla agregada temporalmente.");
  markUnsavedChanges();
}

// --- Inicialización y Event Listeners (MODIFICADO) ---

export function initWhatsappAdmin() {
  console.log("Inicializando admin WhatsApp...");

  hasUnsavedChanges = false;
  showUnsavedNotification(false);
  stopStatusPolling();

  updateWhatsappStatus();
  loadWhatsappConfig();
  loadCiclosForRuleSelect();

  // Listeners Generales
  if (refreshStatusBtn) {
    refreshStatusBtn.addEventListener("click", updateWhatsappStatus);
  }
  if (enabledToggle) {
    enabledToggle.addEventListener("change", () => {
      if (enabledLabel)
        enabledLabel.textContent = enabledToggle.checked
          ? "Notificaciones Activadas"
          : "Notificaciones Desactivadas";
      markUnsavedChanges();
    });
  }
  if (saveConfigBtn) {
    saveConfigBtn.addEventListener("click", saveWhatsappConfig);
  }
  if (jumpToSaveBtn && saveSection) {
    jumpToSaveBtn.addEventListener("click", () => {
      saveSection.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }
  if (forceRestartBtn) {
    forceRestartBtn.onclick = async () => {
      if (
        !confirm(
          "Esto borrará la sesión actual de WhatsApp y generará un nuevo QR. ¿Continuar?"
        )
      ) {
        return;
      }
      showMessage(msgForceRestart, "Forzando reinicio...", false);
      forceRestartBtn.disabled = true;
      try {
        const res = await fetch("/whatsapp/api/restart", { method: "POST" });
        const data = await res.json();
        if (data.exito) {
          showMessage(msgForceRestart, data.mensaje, false);
          await updateWhatsappStatus();
        } else {
          throw new Error(data.mensaje);
        }
      } catch (e) {
        showMessage(msgForceRestart, `Error: ${e.message}`, true);
      } finally {
        forceRestartBtn.disabled = false;
      }
    };
  }

  // Listeners de Estudiantes
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
      if (isGroup) {
        if (ruleGroupSelect) ruleGroupSelect.disabled = !isConnected;
        if (ruleGroupSearch) ruleGroupSearch.disabled = !isConnected;
        if (!isConnected) {
          if (ruleGroupSelect)
            ruleGroupSelect.innerHTML =
              '<option value="">WhatsApp no conectado</option>';
        } else if (availableGroups.length === 0) {
          if (ruleGroupSelect)
            ruleGroupSelect.innerHTML =
              '<option value="">No hay grupos disponibles</option>';
        } else {
          filterStudentGroupOptions();
        }
      }
    });
  }
  if (ruleGroupSearch) {
    ruleGroupSearch.addEventListener("input", filterStudentGroupOptions);
  }
  if (addRuleBtn) {
    addRuleBtn.addEventListener("click", addStudentRule);
  }
  // Añadir listeners para marcar cambios en formulario de estudiantes
  [
    ruleCicloSelect,
    ruleTurnoSelect,
    ruleTargetTypeSelect,
    ruleGroupSelect,
    ruleNumberInput,
  ].forEach((el) => {
    if (el) el.addEventListener("change", markUnsavedChanges);
  });

  // --- LISTENERS MODIFICADOS/NUEVOS PARA DOCENTES ---
  if (teacherTargetTypeSelect) {
    teacherTargetTypeSelect.addEventListener("change", () => {
      // *** CAMBIO CLAVE: ***
      // 1. Llamar a la función de UI
      updateTeacherTargetUI();
      // 2. Marcar cambios (porque esto SÍ es un cambio del usuario)
      markUnsavedChanges();
    });
  }
  if (teacherGroupSearch) {
    teacherGroupSearch.addEventListener("input", filterTeacherGroupOptions);
  }
  // Añadir listeners para marcar cambios en formulario de docentes
  if (teacherGroupSelect) {
    teacherGroupSelect.addEventListener("change", markUnsavedChanges);
  }
  if (teacherNumberInputEl) {
    teacherNumberInputEl.addEventListener("input", markUnsavedChanges);
  }
}
