// Proyecto/Public/js/admin.js - Archivo principal que orquesta todo

import {
  cargarUsuarios,
  initUserFormEvents,
  cargarHorarios,
} from "./admin/users.js";
import { cargarArchivosExcel, initModalEvents } from "./admin/excel-preview.js";

// Lógica para el manejo de vistas (manteniendo las funciones principales aquí)
function mostrarVista(vistaId, buttonId) {
  document.querySelectorAll(".vista-content").forEach((el) => {
    el.style.display = "none";
  });
  document.getElementById(vistaId).style.display = "block";

  document.querySelectorAll(".nav-button").forEach((btn) => {
    btn.classList.remove("active");
  });
  document.getElementById(buttonId).classList.add("active");

  if (vistaId === "vista-alumnos-completa") {
    cargarUsuarios();
  }
}

// Lógica de Eventos del Dashboard (submits y navegación principal)
document.getElementById("btn-vista-inicio").onclick = () => {
  mostrarVista("vista-principal", "btn-vista-inicio");
  cargarUsuarios();
  cargarArchivosExcel();
  cargarHorarios();
};

document.getElementById("btn-vista-alumnos").onclick = () => {
  mostrarVista("vista-alumnos-completa", "btn-vista-alumnos");
  cargarUsuarios();
};

document.getElementById("form-horarios").onsubmit = async function (e) {
  e.preventDefault();
  const payload = {
    mañana: {
      entrada: document.getElementById("entrada-manana").value,
      tolerancia: document.getElementById("tolerancia-manana").value,
    },
    tarde: {
      entrada: document.getElementById("entrada-tarde").value,
      tolerancia: document.getElementById("tolerancia-tarde").value,
    },
  };
  const res = await fetch("/api/horarios", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  const msgDiv = document.getElementById("msg-horarios");
  msgDiv.textContent = data.mensaje || "Horarios guardados";
  msgDiv.style.display = "block";
  setTimeout(() => {
    msgDiv.style.display = "none";
  }, 3000);
};

document.getElementById("form-password").onsubmit = async function (e) {
  e.preventDefault();
  const nueva = document.getElementById("nueva-password").value;
  const res = await fetch("/admin/password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nueva }),
  });
  const data = await res.json();
  const msgDiv = document.getElementById("msg-password");
  msgDiv.textContent = data.mensaje;
  this.reset();
  msgDiv.style.display = "block";
  setTimeout(() => {
    msgDiv.style.display = "none";
  }, 3000);
};

document.getElementById("btn-logout").onclick = async function () {
  await fetch("/admin/logout", { method: "POST" });
  window.location.href = "/admin";
};

// ====================================================
// Inicialización
// ====================================================

window.onload = function () {
  // FIX: Se mantiene la llamada explícita aquí, ya que el initUserFormEvents es el único
  // que inicia los campos condicionales y listeners.
  initUserFormEvents();
  initModalEvents();

  // Cargar datos (Esto debe ejecutarse al final para asegurar que los elementos existan)
  cargarUsuarios();
  cargarArchivosExcel();
  cargarHorarios();

  // Inicializar la vista después de que todo esté cargado
  mostrarVista("vista-principal", "btn-vista-inicio");
};
