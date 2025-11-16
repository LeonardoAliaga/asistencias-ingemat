// Proyecto/Public/js/admin.js - Archivo principal que orquesta todo

import {
  cargarUsuarios,
  initUserFormEvents,
  cargarHorarios,
} from "./admin/users.js";
import {
  cargarArchivosExcel,
  initModalEvents,
  cargarCiclos,
  initCicloFormEvents,
} from "./admin/excel-preview.js";
import { initWhatsappAdmin } from "./admin/whatsapp.js";

// --- Lógica para el manejo de vistas ---
async function mostrarVista(vistaId, buttonId) {
  // <-- Convertida a async
  document.querySelectorAll(".vista-content").forEach((el) => {
    el.style.display = "none";
  });
  const vistaActiva = document.getElementById(vistaId);
  if (vistaActiva) {
    vistaActiva.style.display = "block";
  } else {
    console.error("Error: Vista no encontrada -", vistaId);
    document.getElementById("vista-principal").style.display = "block";
    buttonId = "btn-vista-inicio";
  }

  document.querySelectorAll(".nav-button").forEach((btn) => {
    btn.classList.remove("active");
  });
  const botonActivo = document.getElementById(buttonId);
  if (botonActivo) {
    botonActivo.classList.add("active");
  } else {
    console.error("Error: Botón no encontrado -", buttonId);
    document.getElementById("btn-vista-inicio").classList.add("active");
  }

  if (vistaId === "vista-usuarios-completa") {
    await cargarUsuarios(true); // Esperar a que cargue
  } else if (vistaId === "vista-whatsapp") {
    initWhatsappAdmin();
  } else if (vistaId === "vista-principal") {
    // Recargar datos dinámicos de la vista principal al volver a ella
    // Esperar a que los usuarios carguen es crucial para el buscador
    await cargarUsuarios();
    await cargarArchivosExcel();
    await cargarHorarios(); // <-- cargarHorarios ahora es async
    await cargarCiclos();
    // *** CORRECCIÓN: Eliminar llamada duplicada a initUserFormEvents() ***
    // (Ya se llama en window.onload después de la carga inicial)
  }
}

// Muestra mensajes globales
function showGlobalMessage(elementId, message, isError = false) {
  const element = document.getElementById(elementId);
  if (!element) return;
  element.textContent = message;
  element.className = isError ? "form-message error" : "form-message success";
  element.style.display = "block";
  setTimeout(() => {
    element.style.display = "none";
    element.textContent = "";
    element.className = "form-message";
  }, 4000);
}

// --- Lógica de Eventos del Dashboard ---

// Botones de Navegación
document.getElementById("btn-vista-inicio").onclick = () => {
  mostrarVista("vista-principal", "btn-vista-inicio");
};

document.getElementById("btn-vista-usuarios").onclick = () => {
  mostrarVista("vista-usuarios-completa", "btn-vista-usuarios");
};

document.getElementById("btn-vista-whatsapp").onclick = () => {
  mostrarVista("vista-whatsapp", "btn-vista-whatsapp");
};

// Botón INFO: mostrar la vista específica de INFO (vista-info)
const btnInfo = document.getElementById("btn-vista-info");
if (btnInfo) {
  btnInfo.onclick = () => {
    mostrarVista("vista-info", "btn-vista-info");
  };
}

// --- *** NUEVO HELPER (para submit de horarios) *** ---
function get24hFromPicker(hrId, minId, ampmId) {
  try {
    let hours = parseInt(document.getElementById(hrId).value, 10);
    const minutes = document.getElementById(minId).value;
    const ampm = document.getElementById(ampmId).value;

    if (ampm === "PM" && hours !== 12) {
      hours += 12;
    }
    if (ampm === "AM" && hours === 12) {
      hours = 0; // Medianoche
    }
    return `${hours.toString().padStart(2, "0")}:${minutes}`;
  } catch (e) {
    console.error("Error al convertir 12h a 24h:", hrId, e);
    return "00:00"; // Fallback
  }
}

// Formulario Horarios (MODIFICADO)
document.getElementById("form-horarios").onsubmit = async function (e) {
  e.preventDefault();
  const botonSubmit = this.querySelector('button[type="submit"]');
  botonSubmit.disabled = true;

  // 1. Obtener el ciclo seleccionado
  const cicloSeleccionado = document.getElementById(
    "horarios-ciclo-select"
  ).value;
  if (!cicloSeleccionado) {
    showGlobalMessage("msg-horarios", `Error: No se seleccionó ciclo.`, true);
    botonSubmit.disabled = false;
    return;
  }

  // 2. Obtener los horarios de los pickers
  const payloadHorarios = {
    mañana: {
      entrada: get24hFromPicker(
        "entrada-manana-hr",
        "entrada-manana-min",
        "entrada-manana-ampm"
      ),
      tolerancia: get24hFromPicker(
        "tolerancia-manana-hr",
        "tolerancia-manana-min",
        "tolerancia-manana-ampm"
      ),
    },
    tarde: {
      entrada: get24hFromPicker(
        "entrada-tarde-hr",
        "entrada-tarde-min",
        "entrada-tarde-ampm"
      ),
      tolerancia: get24hFromPicker(
        "tolerancia-tarde-hr",
        "tolerancia-tarde-min",
        "tolerancia-tarde-ampm"
      ),
    },
  };

  // 3. Crear el payload final
  const payload = {
    ciclo: cicloSeleccionado,
    horarios: payloadHorarios,
  };

  try {
    const res = await fetch("/api/horarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.mensaje || `Error ${res.status}`);
    showGlobalMessage("msg-horarios", data.mensaje || "Horarios guardados.");

    // Recargar la configuración de horarios en el frontend
    // (cargarHorarios() recargará todo el select y la config)
    await cargarHorarios();
  } catch (error) {
    showGlobalMessage("msg-horarios", `Error: ${error.message}`, true);
  } finally {
    botonSubmit.disabled = false;
  }
};

// Formulario Cambiar Contraseña
document.getElementById("form-password").onsubmit = async function (e) {
  e.preventDefault();
  const botonSubmit = this.querySelector('button[type="submit"]');
  botonSubmit.disabled = true;
  const nueva = document.getElementById("nueva-password").value;
  try {
    const res = await fetch("/admin/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nueva }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.mensaje || `Error ${res.status}`);
    showGlobalMessage(
      "msg-password",
      data.mensaje || "Contraseña actualizada."
    );
    this.reset();
  } catch (error) {
    showGlobalMessage("msg-password", `Error: ${error.message}`, true);
  } finally {
    botonSubmit.disabled = false;
  }
};

// Formulario Agregar Ciclo
document.getElementById("form-agregar-ciclo").onsubmit = async function (e) {
  e.preventDefault();
  const botonSubmit = this.querySelector('button[type="submit"]');
  botonSubmit.disabled = true;
  const nombreInput = document.getElementById("nuevo-ciclo-nombre");
  // Normalizar: colapsar espacios, trim y forzar mayúsculas
  const nombre = (nombreInput.value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
  if (!nombre) {
    showGlobalMessage(
      "msg-ciclos",
      "El nombre del ciclo no puede estar vacío.",
      true
    );
    botonSubmit.disabled = false;
    return;
  }

  try {
    const res = await fetch("/api/ciclos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.mensaje || `Error ${res.status}`);

    nombreInput.value = "";
    showGlobalMessage("msg-ciclos", data.mensaje || "Ciclo agregado.");
    await cargarCiclos();
    await cargarHorarios(); // <-- Recargar horarios para que aparezca el nuevo ciclo
    window.dispatchEvent(new CustomEvent("cyclesUpdated"));
  } catch (error) {
    showGlobalMessage("msg-ciclos", `Error: ${error.message}`, true);
  } finally {
    botonSubmit.disabled = false;
  }
};

// Formulario Agregar Usuario
document.getElementById("form-agregar").onsubmit = async function (e) {
  e.preventDefault();
  const botonSubmit = this.querySelector('button[type="submit"]');
  botonSubmit.disabled = true;

  const codigo = document.getElementById("codigo").value.trim().toUpperCase(); // <-- FORZAR MAYÚSCULAS
  const nombre = document.getElementById("nombre").value.trim();
  const apellido =
    (document.getElementById("apellido") &&
      document.getElementById("apellido").value.trim()) ||
    "";
  const rol = document.getElementById("rol").value;
  const turno = document.getElementById("turno").value;
  const ciclo = document.getElementById("ciclo").value;

  const getSelectedDays = () => {
    const selected = [];
    document
      .querySelectorAll("#dias-asistencia-selector .day-btn.active")
      .forEach((btn) => {
        selected.push(btn.getAttribute("data-day"));
      });
    return selected;
  };
  const diasAsistencia = getSelectedDays();

  let errorMsg = null;
  if (!codigo || !nombre || !apellido || !rol) {
    errorMsg = "Código, Nombre, Apellido y Rol son obligatorios.";
  } else if (rol === "estudiante" && (!turno || !ciclo)) {
    errorMsg = "Turno y Ciclo son obligatorios para estudiantes.";
  } else if (
    (rol === "estudiante" || rol === "docente") &&
    diasAsistencia.length === 0
  ) {
    errorMsg = "Selecciona al menos un día de asistencia.";
  }

  if (errorMsg) {
    showGlobalMessage("msg-agregar-usuario", errorMsg, true);
    botonSubmit.disabled = false;
    return;
  }

  const payload = { codigo, nombre, apellido, rol };
  if (rol === "estudiante") {
    payload.turno = turno;
    payload.ciclo = ciclo;
    payload.dias_asistencia = diasAsistencia;
  } else if (rol === "docente") {
    payload.dias_asistencia = diasAsistencia;
    payload.turno = "";
    payload.ciclo = "";
  }

  try {
    const res = await fetch("/api/usuarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.mensaje || `Error ${res.status}`);

    showGlobalMessage(
      "msg-agregar-usuario",
      data.mensaje || "Usuario agregado."
    );
    await cargarUsuarios(true);

    this.reset();
    document
      .querySelectorAll("#dias-asistencia-selector .day-btn")
      .forEach((button) => {
        const day = button.getAttribute("data-day");
        if (day !== "D") {
          button.classList.add("active");
        } else {
          button.classList.remove("active");
        }
      });
    document.getElementById("rol").dispatchEvent(new Event("change"));
  } catch (error) {
    showGlobalMessage("msg-agregar-usuario", `Error: ${error.message}`, true);
  } finally {
    botonSubmit.disabled = false;
  }
};

// --- FORMULARIO EDITAR USUARIO (MODIFICADO) ---
document.getElementById("form-editar").onsubmit = async function (e) {
  e.preventDefault();
  const botonSubmit = this.querySelector('button[type="submit"]');
  botonSubmit.disabled = true;

  const originalCodigo = document
    .getElementById("edit-original-codigo")
    .value.trim();

  // --- INICIO CORRECCIÓN 1 ---
  const codigo = document
    .getElementById("edit-codigo")
    .value.trim()
    .toUpperCase();
  // --- FIN CORRECCIÓN 1 ---

  const nombre = document.getElementById("edit-nombre").value.trim();
  const apellido = document.getElementById("edit-apellido").value.trim();
  const rol = document.getElementById("edit-rol").value;
  const turno = document.getElementById("edit-turno").value;
  const ciclo = document.getElementById("edit-ciclo").value;

  const getSelectedDays = () => {
    const selected = [];
    document
      .querySelectorAll("#edit-dias-asistencia-selector .day-btn.active")
      .forEach((btn) => {
        selected.push(btn.getAttribute("data-day"));
      });
    return selected;
  };
  const diasAsistencia = getSelectedDays();

  let errorMsg = null;
  if (!codigo || !nombre || !apellido || !rol || !originalCodigo) {
    errorMsg = "Código, Nombre, Apellido y Rol son obligatorios.";
  } else if (rol === "estudiante" && (!turno || !ciclo)) {
    errorMsg = "Turno y Ciclo son obligatorios para estudiantes.";
  } else if (
    (rol === "estudiante" || rol === "docente") &&
    diasAsistencia.length === 0
  ) {
    errorMsg = "Selecciona al menos un día de asistencia.";
  }

  if (errorMsg) {
    showGlobalMessage("msg-editar-usuario", errorMsg, true);
    botonSubmit.disabled = false;
    return;
  }

  const payload = { codigo, nombre, apellido, rol };
  if (rol === "estudiante") {
    payload.turno = turno;
    payload.ciclo = ciclo;
    payload.dias_asistencia = diasAsistencia;
  } else if (rol === "docente") {
    payload.dias_asistencia = diasAsistencia;
    payload.turno = "";
    payload.ciclo = "";
  }

  try {
    const res = await fetch(`/api/usuarios/${originalCodigo}`, {
      method: "PUT", // Usar PUT para actualizar
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.mensaje || `Error ${res.status}`);

    showGlobalMessage(
      "msg-editar-usuario",
      data.mensaje || "Usuario actualizado."
    );
    // Ocultar modal
    document.getElementById("edit-user-modal").style.display = "none";
    // Recargar la lista de usuarios en la vista activa
    const vistaActiva = document.querySelector(
      ".vista-content[style*='block']"
    );
    if (vistaActiva) {
      if (vistaActiva.id === "vista-usuarios-completa") {
        await cargarUsuarios(true);
      } else if (vistaActiva.id === "vista-principal") {
        await cargarUsuarios(); // Recargar solo la vista principal
      }
    }
  } catch (error) {
    showGlobalMessage("msg-editar-usuario", `Error: ${error.message}`, true);
  } finally {
    botonSubmit.disabled = false;
  }
};
// --- FIN FORMULARIO EDITAR USUARIO ---

// --- FORMULARIO JUSTIFICAR FALTA (ACTUALIZADO) ---
document.getElementById("form-justificar-falta").onsubmit = async function (e) {
  e.preventDefault();
  const botonSubmit = this.querySelector('button[type="submit"]');
  botonSubmit.disabled = true;

  // Leer del input oculto
  const codigo = document.getElementById("justificar-alumno-hidden").value;
  const fechaInput = document.getElementById("justificar-fecha").value; // "YYYY-MM-DD"
  const filtroInput = document.getElementById("justificar-usuario-filtro");

  if (!codigo || !fechaInput) {
    showGlobalMessage(
      "msg-justificar-falta",
      "Debes seleccionar fecha y un usuario válido de la lista.",
      true
    );
    botonSubmit.disabled = false;
    return;
  }

  // Convertir fecha de YYYY-MM-DD a DD-MM-YYYY
  const fechaParts = fechaInput.split("-");
  const fechaFormateada = `${fechaParts[2]}-${fechaParts[1]}-${fechaParts[0]}`;

  try {
    const res = await fetch("/api/excel/justificar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigo: codigo, fecha: fechaFormateada }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.mensaje || `Error ${res.status}`);

    showGlobalMessage(
      "msg-justificar-falta",
      data.mensaje || "Falta justificada."
    );
    // Limpiar los campos
    filtroInput.value = "";
    document.getElementById("justificar-alumno-hidden").value = "";
  } catch (error) {
    showGlobalMessage("msg-justificar-falta", `Error: ${error.message}`, true);
  } finally {
    botonSubmit.disabled = false;
  }
};
// --- FIN FORMULARIO JUSTIFICAR ---

// Botón Logout
document.getElementById("btn-logout").onclick = async function () {
  try {
    await fetch("/admin/logout", { method: "POST" });
    window.location.href = "/admin";
  } catch (error) {
    console.error("Error al cerrar sesión:", error);
    window.location.href = "/admin";
  }
};

// ====================================================
// Inicialización General
// ====================================================

window.onload = async function () {
  // <-- *** FUNCIÓN CONVERTIDA A ASYNC ***
  console.log("Admin panel cargado.");

  initModalEvents(); // Esta no depende de datos, puede ir primero

  // Cargar datos iniciales para la vista principal
  // *** CORRECCIÓN: Esperar (await) a que los datos carguen ***
  await cargarUsuarios();
  await cargarArchivosExcel();
  await cargarHorarios(); // <-- MODIFICADO
  await cargarCiclos();

  // *** CORRECCIÓN: Llamar a initUserFormEvents DESPUÉS de que cargarUsuarios haya terminado ***
  initUserFormEvents();

  mostrarVista("vista-principal", "btn-vista-inicio");

  window.addEventListener("cyclesUpdated", async () => {
    await cargarCiclos();
    await cargarHorarios(); // <-- Recargar horarios si los ciclos cambian
  });

  // --- AÑADIDO: Poner fecha de hoy por defecto ---
  try {
    const today = new Date();
    const year = today.getFullYear();
    const month = (today.getMonth() + 1).toString().padStart(2, "0");
    const day = today.getDate().toString().padStart(2, "0");
    const fechaHoy = `${year}-${month}-${day}`; // Formato YYYY-MM-DD

    const justificarFechaInput = document.getElementById("justificar-fecha");
    if (justificarFechaInput) {
      justificarFechaInput.value = fechaHoy;
    }
  } catch (e) {
    console.error("Error al setear fecha por defecto:", e);
  }
  // --- FIN AÑADIDO ---
};
