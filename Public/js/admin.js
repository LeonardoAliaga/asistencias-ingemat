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
// Importar la inicialización de la pestaña WhatsApp
import { initWhatsappAdmin } from "./admin/whatsapp.js"; // Ajusta la ruta si es necesario

// --- Lógica para el manejo de vistas ---
function mostrarVista(vistaId, buttonId) {
  document.querySelectorAll(".vista-content").forEach((el) => {
    el.style.display = "none";
  });
  const vistaActiva = document.getElementById(vistaId);
  if (vistaActiva) {
    vistaActiva.style.display = "block";
  } else {
    console.error("Error: Vista no encontrada -", vistaId);
    // Mostrar vista principal por defecto en caso de error
    document.getElementById("vista-principal").style.display = "block";
    buttonId = "btn-vista-inicio"; // Asegurar que el botón activo sea el correcto
  }

  document.querySelectorAll(".nav-button").forEach((btn) => {
    btn.classList.remove("active");
  });
  const botonActivo = document.getElementById(buttonId);
  if (botonActivo) {
    botonActivo.classList.add("active");
  } else {
    console.error("Error: Botón no encontrado -", buttonId);
    // Activar botón de inicio por defecto
    document.getElementById("btn-vista-inicio").classList.add("active");
  }

  // Cargar datos específicos de la vista si es necesario
  if (vistaId === "vista-alumnos-completa") {
    cargarUsuarios(true); // Forzar recarga al cambiar a esta vista
  } else if (vistaId === "vista-whatsapp") {
    // Inicializar la lógica de la pestaña WhatsApp CADA VEZ que se muestra
    initWhatsappAdmin();
  } else if (vistaId === "vista-principal") {
    // Recargar datos dinámicos de la vista principal al volver a ella
    cargarUsuarios();
    cargarArchivosExcel();
    cargarHorarios();
    cargarCiclos();
  }
}

// Muestra mensajes globales (para agregar usuario, ciclos, etc.)
function showGlobalMessage(elementId, message, isError = false) {
  const element = document.getElementById(elementId);
  if (!element) return;
  element.textContent = message;
  element.className = isError ? "form-message error" : "form-message success"; // Asumiendo clases CSS
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

document.getElementById("btn-vista-alumnos").onclick = () => {
  mostrarVista("vista-alumnos-completa", "btn-vista-alumnos");
};

// Nuevo botón WhatsApp
document.getElementById("btn-vista-whatsapp").onclick = () => {
  mostrarVista("vista-whatsapp", "btn-vista-whatsapp");
};

// --- *** NUEVO HELPER (para submit de horarios) *** ---
/**
 * Lee 3 selects (por ID) y devuelve una hora 24h (ej: "03", "00", "PM" -> "15:00")
 */
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
// --- *** FIN HELPER *** ---

// Formulario Horarios (MODIFICADO)
document.getElementById("form-horarios").onsubmit = async function (e) {
  e.preventDefault();
  const botonSubmit = this.querySelector('button[type="submit"]');
  botonSubmit.disabled = true;

  // Modificado para usar el helper
  const payload = {
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

  try {
    const res = await fetch("/api/horarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.mensaje || `Error ${res.status}`);
    showGlobalMessage("msg-horarios", data.mensaje || "Horarios guardados.");
    // Recargar horarios en la UI
    cargarHorarios();
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
    this.reset(); // Limpiar campo
  } catch (error) {
    showGlobalMessage("msg-password", `Error: ${error.message}`, true);
  } finally {
    botonSubmit.disabled = false;
  }
};

// Formulario Agregar Ciclo (movido desde excel-preview.js para centralizar)
document.getElementById("form-agregar-ciclo").onsubmit = async function (e) {
  e.preventDefault();
  const botonSubmit = this.querySelector('button[type="submit"]');
  botonSubmit.disabled = true;
  const nombreInput = document.getElementById("nuevo-ciclo-nombre");
  const nombre = nombreInput.value.trim();
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

    nombreInput.value = ""; // Limpiar input
    showGlobalMessage("msg-ciclos", data.mensaje || "Ciclo agregado.");
    await cargarCiclos(); // Recargar lista de ciclos
    // Disparar evento para que users.js actualice el select
    window.dispatchEvent(new CustomEvent("cyclesUpdated"));
  } catch (error) {
    showGlobalMessage("msg-ciclos", `Error: ${error.message}`, true);
  } finally {
    botonSubmit.disabled = false;
  }
};

// Formulario Agregar Usuario (movido desde users.js para centralizar)
document.getElementById("form-agregar").onsubmit = async function (e) {
  e.preventDefault();
  const botonSubmit = this.querySelector('button[type="submit"]');
  botonSubmit.disabled = true;

  const codigo = document.getElementById("codigo").value.trim();
  const nombre = document.getElementById("nombre").value.trim();
  const rol = document.getElementById("rol").value;
  const turno = document.getElementById("turno").value;
  const ciclo = document.getElementById("ciclo").value;

  // Función auxiliar para obtener días seleccionados
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

  // Validaciones
  let errorMsg = null;
  if (!codigo || !nombre || !rol) {
    errorMsg = "Código, Nombre y Rol son obligatorios.";
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

  const payload = { codigo, nombre, rol };
  if (rol === "estudiante") {
    payload.turno = turno;
    payload.ciclo = ciclo;
    payload.dias_asistencia = diasAsistencia;
  } else if (rol === "docente") {
    payload.dias_asistencia = diasAsistencia;
    // Asegurarse de no enviar turno/ciclo para docentes
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
    await cargarUsuarios(true); // Recargar ambas vistas (docentes y alumnos)

    // Restablecer formulario
    this.reset();
    // Resetear botones de días (activar L-S por defecto)
    document
      .querySelectorAll("#dias-asistencia-selector .day-btn")
      .forEach((button) => {
        const day = button.getAttribute("data-day");
        if (day !== "D") {
          // Activar L, M, MI, J, V, S
          button.classList.add("active");
        } else {
          // Desactivar D
          button.classList.remove("active");
        }
      });
    // Resetear visibilidad de campos condicionales
    document.getElementById("rol").dispatchEvent(new Event("change"));
  } catch (error) {
    showGlobalMessage("msg-agregar-usuario", `Error: ${error.message}`, true);
  } finally {
    botonSubmit.disabled = false;
  }
};

// Botón Logout
document.getElementById("btn-logout").onclick = async function () {
  try {
    await fetch("/admin/logout", { method: "POST" });
    window.location.href = "/admin"; // Redirigir siempre
  } catch (error) {
    console.error("Error al cerrar sesión:", error);
    // Igual intenta redirigir
    window.location.href = "/admin";
  }
};

// ====================================================
// Inicialización General
// ====================================================

window.onload = function () {
  console.log("Admin panel cargado.");
  initUserFormEvents(); // Inicializa eventos de formulario de usuario (toggle de campos, botones de día)
  initModalEvents(); // Inicializa eventos del modal de vista previa

  // Cargar datos iniciales para la vista principal
  cargarUsuarios(); // Carga docentes para vista principal y alumnos para la otra vista
  cargarArchivosExcel();
  cargarHorarios(); // Carga horarios y puebla los nuevos <select>
  cargarCiclos(); // Carga lista de ciclos y actualiza select en form agregar usuario

  // Mostrar vista principal por defecto
  mostrarVista("vista-principal", "btn-vista-inicio");

  // Escuchar evento para actualizar select de ciclo cuando se añaden/eliminan ciclos
  window.addEventListener("cyclesUpdated", async () => {
    await cargarCiclos(); // Recarga la lista y actualiza el select
  });
};
