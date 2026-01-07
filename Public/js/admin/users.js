// Proyecto/Public/js/admin/users.js

import { initAccordion } from "./accordion.js";

export let allUserOptions = []; // Exportado para usar en otros módulos
let currentAutocompleteFocus = -1; // Para navegación por teclado
let fullHorariosConfig = {}; // <-- NUEVO: Caché para la config de horarios

// Helper cliente: obtener nombre completo desde objetos usuario
// Devuelve preferentemente "APELLIDO NOMBRE" (sin coma). Usa heurística para registros legacy.
function getFullNameClient(u = {}) {
  if (!u) return "";
  const apellido = u.apellido ? String(u.apellido).trim() : "";
  const nombre = u.nombre ? String(u.nombre).trim() : "";
  if (apellido && nombre) return `${apellido} ${nombre}`;
  if (nombre) return nombre;
  return "";
}

/**
 * Crea la estructura HTML para los elementos de lista de usuarios.
 */
function crearListaUsuarios(usuarios, esDocente = false) {
  return usuarios
    .map((u) => {
      const diasAsistencia = u.dias_asistencia
        ? u.dias_asistencia.join(", ")
        : "";

      // Mostrar código y nombre; omitimos mostrar el turno al lado del nombre
      // Añadimos TRES botones: eliminar, carnet y editar
      return `
            <li style="position:relative;padding-right:110px;">
              <div style="display:flex;flex-direction:column;">
                <span><strong>${u.codigo}</strong> - ${getFullNameClient(
        u
      )}</span>
                <small style="color:#666">${diasAsistencia}</small>
              </div>
              <div style="position:absolute;right:5px;top:8px;display:flex;gap:8px;">
                <span class="btn-edit-usuario" title="Editar usuario" style="display:none;cursor:pointer;color:#007bff;">
                  <i class="bi bi-pencil-fill"></i>
                </span>
                <span class="btn-barcode" title="Generar carnet" style="display:none;cursor:pointer;color:#0b5;">
                  <i class="bi bi-person-badge"></i>
                </span>
                <span class="btn-eliminar" title="Eliminar usuario" style="display:none;cursor:pointer;color:red;">
                  <i class="bi bi-x-circle-fill"></i>
                </span>
              </div>
            </li>
          `;
    })
    .join("");
}

/**
 * Asigna eventos de eliminación a los botones de la lista.
 */
function agregarEventosEliminar() {
  document.querySelectorAll(".btn-eliminar").forEach((btn) => {
    // Los botones están dentro de un contenedor absoluto, manejamos el hover en el LI
    const li = btn.closest("li");
    if (li) {
      li.onmouseenter = () => {
        const bc = li.querySelector(".btn-barcode");
        const ed = li.querySelector(".btn-edit-usuario"); // <-- Mostrar botón editar
        if (bc) bc.style.display = "inline";
        if (ed) ed.style.display = "inline"; // <-- Mostrar botón editar
        btn.style.display = "inline";
      };
      li.onmouseleave = () => {
        const bc = li.querySelector(".btn-barcode");
        const ed = li.querySelector(".btn-edit-usuario"); // <-- Ocultar botón editar
        if (bc) bc.style.display = "none";
        if (ed) ed.style.display = "none"; // <-- Ocultar botón editar
        btn.style.display = "none";
      };
    }
    btn.onclick = async function (e) {
      e.stopPropagation();
      const nombreCompleto = li.textContent.trim();
      const nombre = nombreCompleto.split(" - ")[1]
        ? nombreCompleto.split(" - ")[1].split("(")[0].trim()
        : nombreCompleto.split(" - ")[0].trim();

      if (confirm(`¿Seguro que deseas eliminar a:\n${nombre}?`)) {
        const codigo = li.querySelector("strong")
          ? li.querySelector("strong").textContent.trim()
          : li.textContent.split(" - ")[0].trim();
        await fetch(`/api/usuarios/${codigo}`, { method: "DELETE" });
        cargarUsuarios(true); // Recargar ambas vistas
      }
    };
  });
}

// --- NUEVA FUNCIÓN PARA EVENTOS DE EDITAR ---
/**
 * Asigna eventos de edición (abrir modal) a los botones de la lista.
 */
function agregarEventosEditar() {
  document.querySelectorAll(".btn-edit-usuario").forEach((btn) => {
    const li = btn.closest("li");
    if (li) {
      btn.onclick = function (e) {
        e.stopPropagation();
        const codigo = li.querySelector("strong")
          ? li.querySelector("strong").textContent.trim()
          : li.textContent.split(" - ")[0].trim();
        abrirModalEditar(codigo);
      };
    }
  });
}

function agregarEventosBarcode() {
  document.querySelectorAll(".btn-barcode").forEach((btn) => {
    const li = btn.closest("li");
    if (li) {
      btn.onclick = function (e) {
        e.stopPropagation();
        const codigo = li.querySelector("strong")
          ? li.querySelector("strong").textContent.trim()
          : li.textContent.split(" - ")[0].trim();
        // No necesitamos el nombre separado aquí, usamos el código para buscar
        mostrarBarcodeModal(codigo);
      };
    }
  });
}

// Dibuja un rectángulo redondeado en canvas (helper simple)
function roundRect(ctx, x, y, width, height, radius, fill, stroke) {
  if (typeof radius === "undefined") radius = 5;
  if (typeof radius === "number") {
    radius = { tl: radius, tr: radius, br: radius, bl: radius };
  } else {
    var defaultRadius = { tl: 0, tr: 0, br: 0, bl: 0 };
    for (var side in defaultRadius)
      radius[side] = radius[side] || defaultRadius[side];
  }
  ctx.beginPath();
  ctx.moveTo(x + radius.tl, y);
  ctx.lineTo(x + width - radius.tr, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius.tr);
  ctx.lineTo(x + width, y + height - radius.br);
  ctx.quadraticCurveTo(
    x + width,
    y + height,
    x + width - radius.br,
    y + height
  );
  ctx.lineTo(x + radius.bl, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius.bl);
  ctx.lineTo(x, y + radius.tl);
  ctx.quadraticCurveTo(x, y, x + radius.tl, y);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

function mostrarBarcodeModal(codigo) {
  const modal = document.getElementById("barcode-modal");
  const canvas = document.getElementById("barcode-canvas");
  const txt = document.getElementById("barcode-text");
  const download = document.getElementById("download-barcode");

  if (!modal || !canvas || !txt || !download) return;

  // Buscar datos del usuario por codigo desde la caché
  const user = allUserOptions.find((u) => u.codigo === codigo);
  if (!user) {
    txt.textContent = `Usuario ${codigo} no encontrado`;
    modal.style.display = "block";
    return;
  }

  txt.textContent = `${getFullNameClient(user)} (${codigo})`;

  // Prepare canvas for vertical card
  const ctx = canvas.getContext("2d");
  const W = 320; // vertical card width
  const H = 480; // vertical card height
  canvas.width = W;
  canvas.height = H;

  const logo = new Image();
  logo.src = "../img/Logo 1x4 b&w.svg";

  const primary = "#0A2240"; // proyecto (puedes reemplazar)
  const accent = "#F2B705"; // acento suave
  const bg = "#FFFFFF";

  const drawCard = () => {
    const padding = 18;
    ctx.clearRect(0, 0, W, H);

    // Card background with subtle border
    ctx.fillStyle = bg;
    roundRect(ctx, 6, 6, W - 12, H - 12, 12, true, true);
    ctx.fillStyle = "#f8f9fb";
    ctx.fillRect(8, 8, W - 16, H - 16);

    let y = 24;

    // Logo centered
    const logoMaxW = 180;
    const logoMaxH = 90;
    if (logo.complete && logo.naturalWidth) {
      const ratio = logo.naturalWidth / logo.naturalHeight;
      let logoW = logoMaxW;
      let logoH = Math.round(logoW / ratio);
      if (logoH > logoMaxH) {
        logoH = logoMaxH;
        logoW = Math.round(logoH * ratio);
      }
      ctx.drawImage(logo, W / 2 - logoW / 2, y, logoW, logoH);
      y += logoH + 14;
    }

    // Title area (small band)
    ctx.fillStyle = primary;
    ctx.fillRect(20, y - 6, W - 40, 28);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 12px Arial";
    ctx.textAlign = "center";
    ctx.fillText("CARNET - ACADEMIA INGEMAT", W / 2, y + 14);
    y += 36;

    // Nombre
    ctx.fillStyle = "#666";
    ctx.font = "bold 11px Arial";
    ctx.textAlign = "left";
    ctx.fillText("NOMBRE:", 28, y);
    y += 18;
    ctx.fillStyle = primary;
    ctx.font = "bold 18px Arial";
    ctx.fillText(user.nombre ? user.nombre.toUpperCase() : "-", 28, y);
    y += 28;

    // Apellido
    ctx.fillStyle = "#666";
    ctx.font = "bold 11px Arial";
    ctx.fillText("APELLIDO:", 28, y);
    y += 18;
    ctx.fillStyle = primary;
    ctx.font = "bold 18px Arial";
    ctx.fillText(user.apellido ? user.apellido.toUpperCase() : "-", 28, y);
    y += 34;

    // Si es docente mostramos cargo; si no mostramos ciclo y turno
    if (user.rol === "docente") {
      ctx.fillStyle = "#666";
      ctx.font = "bold 11px Arial";
      ctx.fillText("CARGO:", 28, y);
      y += 18;
      ctx.fillStyle = primary;
      ctx.font = "bold 13px Arial";
      ctx.fillText("DOCENTE", 28, y);
      y += 34;
    } else {
      ctx.fillStyle = "#666";
      ctx.font = "bold 11px Arial";
      ctx.fillText("CICLO Y TURNO:", 28, y);
      y += 18;
      ctx.fillStyle = "#333";
      ctx.font = "bold 13px Arial";
      ctx.fillText(
        `${(user.ciclo || "").toString().toUpperCase()} - ${user.turno || ""}`,
        28,
        y
      );
      y += 34;
    }

    // Divider
    ctx.strokeStyle = "#e6e9ee";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(24, y);
    ctx.lineTo(W - 24, y);
    ctx.stroke();
    y += 18;

    // Código big text
    ctx.fillStyle = "#666";
    ctx.font = "bold 11px Arial";
    ctx.textAlign = "left";
    ctx.fillText("CÓDIGO:", 28, y);
    y += 16;
    ctx.fillStyle = "#000";
    ctx.font = "bold 20px monospace";
    ctx.textAlign = "center";
    ctx.fillText(user.codigo || "-", W / 2, y);
    y += 28;

    // Barcode larger (centrado)
    const tmp = document.createElement("canvas");
    tmp.width = W - 56;
    tmp.height = 110;
    JsBarcode(tmp, user.codigo || "", {
      format: "CODE128",
      displayValue: true,
      fontSize: 18,
      height: 90,
      margin: 6,
    });
    const barcodeX = Math.round((W - tmp.width) / 2);
    ctx.drawImage(tmp, barcodeX, y);
    y += tmp.height + 8;
    ctx.textAlign = "start";

    // Footer small
    ctx.fillStyle = "#999";
    ctx.font = "10px Arial";
    ctx.textAlign = "center";
    ctx.fillText("Academia INGEMAT", W / 2, H - 18);

    // Prepare download
    const dataURL = canvas.toDataURL("image/png");
    download.href = dataURL;
    download.download = `carnet-${user.codigo}.png`;
  };

  if (logo.complete) drawCard();
  else logo.onload = () => drawCard();
  logo.onerror = () => {
    console.warn("No se pudo cargar el logo para el carnet");
    drawCard();
  };

  modal.style.display = "block";

  const closeBtn = document.getElementById("close-barcode");
  if (closeBtn) closeBtn.onclick = () => (modal.style.display = "none");

  window.onclick = function (event) {
    if (event.target === modal) modal.style.display = "none";
  };

  // Notas: cargar y guardar en archivo separado via API
  const notesTextarea = document.getElementById("barcode-notes");
  const saveNotesBtn = document.getElementById("save-barcode-notes");
  const notesMsg = document.getElementById("barcode-notes-msg");

  if (notesTextarea) notesTextarea.value = "";
  if (notesMsg) notesMsg.textContent = "";

  // Cargar notas existentes
  (async () => {
    try {
      const res = await fetch(`/api/notes/${encodeURIComponent(codigo)}`);
      if (res.ok) {
        const data = await res.json();
        if (notesTextarea) notesTextarea.value = data.notas || "";
      }
    } catch (e) {
      console.warn("No se pudieron cargar las notas:", e);
    }
  })();

  if (saveNotesBtn) {
    // evitar duplicar listeners
    saveNotesBtn.onclick = async function (e) {
      e.preventDefault();
      if (!notesTextarea) return;
      saveNotesBtn.disabled = true;
      const payload = { notas: notesTextarea.value.trim() };
      try {
        const res = await fetch(`/api/notes/${encodeURIComponent(codigo)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.mensaje || "Error guardando notas");
        if (notesMsg) {
          notesMsg.style.color = "green";
          notesMsg.textContent = "Notas guardadas";
          setTimeout(() => (notesMsg.textContent = ""), 2000);
        }
      } catch (err) {
        if (notesMsg) {
          notesMsg.style.color = "red";
          notesMsg.textContent = `Error: ${err.message}`;
        }
      } finally {
        saveNotesBtn.disabled = false;
      }
    };
  }
}

// --- NUEVA FUNCIÓN PARA ABRIR Y POBLAR EL MODAL DE EDICIÓN ---
function abrirModalEditar(codigo) {
  const modal = document.getElementById("edit-user-modal");
  if (!modal) return;

  const user = allUserOptions.find((u) => u.codigo === codigo);
  if (!user) {
    alert("Error: No se pudieron encontrar los datos del usuario.");
    return;
  }

  // Poblar el formulario
  document.getElementById("edit-original-codigo").value = user.codigo || "";
  document.getElementById("edit-codigo").value = user.codigo || "";
  document.getElementById("edit-nombre").value = user.nombre || "";
  document.getElementById("edit-apellido").value = user.apellido || "";
  document.getElementById("edit-rol").value = user.rol || "estudiante";
  document.getElementById("edit-turno").value = user.turno || "";
  document.getElementById("edit-ciclo").value = user.ciclo || "";

  // Poblar select de ciclos (si aún no está poblado)
  const cicloSelect = document.getElementById("edit-ciclo");
  if (cicloSelect.options.length <= 1) {
    const addCicloSelect = document.getElementById("ciclo");
    if (addCicloSelect) {
      cicloSelect.innerHTML = addCicloSelect.innerHTML;
      cicloSelect.value = user.ciclo || ""; // Re-seleccionar
    }
  }

  // Configurar campos condicionales (rol, turno, ciclo)
  const esEstudiante = user.rol === "estudiante";
  const esDocente = user.rol === "docente";
  document.getElementById("edit-turno").disabled = !esEstudiante;
  document.getElementById("edit-ciclo").disabled = !esEstudiante;
  document.getElementById("edit-dias-asistencia-selector").style.display =
    esEstudiante || esDocente ? "block" : "none";

  // Marcar días de asistencia
  const diasContainer = document.getElementById(
    "edit-dias-asistencia-selector"
  );
  diasContainer.querySelectorAll(".day-btn").forEach((btn) => {
    const day = btn.getAttribute("data-day");
    if (user.dias_asistencia && user.dias_asistencia.includes(day)) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });

  // Limpiar mensaje de estado previo
  document.getElementById("msg-editar-usuario").style.display = "none";

  // Mostrar modal
  modal.style.display = "block";
}

// --- INICIO LÓGICA DE AUTOCOMPLETADO ---

/**
 * Cierra todas las listas de autocompletado activas.
 */
function closeAllAutocompleteLists(elmnt) {
  const items = document.getElementById("justificar-resultados");
  if (items) {
    items.innerHTML = ""; // Limpiamos los items
  }
  currentAutocompleteFocus = -1;
}

/**
 * Añade la clase 'activa' para navegación por teclado.
 */
function addAutocompleteActive(items) {
  if (!items) return false;
  removeAutocompleteActive(items);
  if (currentAutocompleteFocus >= items.length) currentAutocompleteFocus = 0;
  if (currentAutocompleteFocus < 0) currentAutocompleteFocus = items.length - 1;

  const activeItem = items[currentAutocompleteFocus];
  if (activeItem) {
    activeItem.classList.add("autocomplete-active");
    activeItem.scrollIntoView({ block: "nearest" });
  }
}

/**
 * Remueve la clase 'activa' de los items.
 */
function removeAutocompleteActive(items) {
  for (let i = 0; i < items.length; i++) {
    items[i].classList.remove("autocomplete-active");
  }
}

/**
 * Inicializa los listeners para el nuevo autocompletado.
 */
function initAutocomplete() {
  const input = document.getElementById("justificar-usuario-filtro");
  const hiddenInput = document.getElementById("justificar-alumno-hidden");
  const resultsContainer = document.getElementById("justificar-resultados");

  if (!input || !hiddenInput || !resultsContainer) {
    console.error(
      "Faltan elementos del autocompletado (input, hidden, o results)."
    );
    return;
  }

  // Listener para cuando el usuario escribe
  input.addEventListener("input", function (e) {
    const val = this.value;
    closeAllAutocompleteLists();
    if (!val || val.length < 2) {
      hiddenInput.value = ""; // Limpiamos el valor si no hay texto
      return false;
    }

    const valNorm = val
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, ""); // Rango correcto para acentos

    allUserOptions.forEach((user) => {
      const fullNameStr = getFullNameClient(user) || "";
      const searchStr = `${fullNameStr} ${user.codigo || ""} ${
        user.rol || ""
      }`.trim();
      const userNameNorm = searchStr
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, ""); // Rango correcto para acentos

      const index = userNameNorm.indexOf(valNorm);

      if (index !== -1) {
        const itemDiv = document.createElement("div");
        itemDiv.classList.add("autocomplete-item");

        // Resaltar la coincidencia
        // find display version and highlight in it
        const displayName = fullNameStr;
        // compute highlight positions on searchable string; for simplicity highlight in displayName if substring found
        const dispNorm = displayName
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");
        const dispIndex = dispNorm.indexOf(valNorm);
        let highlighted = displayName;
        if (dispIndex !== -1) {
          highlighted =
            displayName.substring(0, dispIndex) +
            "<strong>" +
            displayName.substring(dispIndex, dispIndex + val.length) +
            "</strong>" +
            displayName.substring(dispIndex + val.length);
        }
        itemDiv.innerHTML = highlighted + ` <small>(${user.rol})</small>`;

        // Guardar los datos en el div
        itemDiv.dataset.codigo = user.codigo;
        itemDiv.dataset.nombre = fullNameStr;

        // Listener de clic para el item
        itemDiv.addEventListener("click", function (e) {
          input.value = this.dataset.nombre;
          hiddenInput.value = this.dataset.codigo;
          closeAllAutocompleteLists();
        });
        resultsContainer.appendChild(itemDiv);
      }
    });
  });

  // Listener para navegación por teclado
  input.addEventListener("keydown", function (e) {
    let items = resultsContainer.getElementsByClassName("autocomplete-item");
    if (e.keyCode == 40) {
      // Flecha Abajo
      currentAutocompleteFocus++;
      addAutocompleteActive(items);
      e.preventDefault();
    } else if (e.keyCode == 38) {
      // Flecha Arriba
      currentAutocompleteFocus--;
      addAutocompleteActive(items);
      e.preventDefault();
    } else if (e.keyCode == 13) {
      // Enter
      e.preventDefault();
      if (currentAutocompleteFocus > -1 && items[currentAutocompleteFocus]) {
        items[currentAutocompleteFocus].click();
      }
    } else if (e.keyCode == 27) {
      // Escape
      closeAllAutocompleteLists();
      input.value = "";
      hiddenInput.value = "";
    }
  });

  // Cerrar la lista al hacer clic fuera
  document.addEventListener("click", function (e) {
    if (e.target !== input) {
      closeAllAutocompleteLists(e.target);
    }
  });
}

// --- FIN LÓGICA DE AUTOCOMPLETADO ---

/**
 * Carga y renderiza la lista de usuarios.
 */
export async function cargarUsuarios(forceReload = false) {
  // --- Referencias a elementos del DOM ---
  const resUsuarios = await fetch("/api/usuarios");
  const usuarios = await resUsuarios.json();

  // --- LÓGICA DE FILTRO (NUEVA) ---
  // Guardar todos los usuarios ordenados en el caché (orden por apellido cuando exista)
  allUserOptions = usuarios.sort((a, b) => {
    const ka = (
      a.apellido ? String(a.apellido).trim() : getFullNameClient(a)
    ).toUpperCase();
    const kb = (
      b.apellido ? String(b.apellido).trim() : getFullNameClient(b)
    ).toUpperCase();
    return ka.localeCompare(kb, "es");
  });
  // --- FIN LÓGICA DE FILTRO ---

  const resCiclos = await fetch("/api/ciclos");
  const ciclosData = await resCiclos.json();
  const ciclosOrdenados = ciclosData.ciclos;

  const ciclos = {};
  const docentes = [];
  usuarios.forEach((u) => {
    if (u.rol === "estudiante") {
      if (!ciclos[u.ciclo]) ciclos[u.ciclo] = [];
      ciclos[u.ciclo].push(u);
    } else {
      docentes.push(u);
    }
  });

  // --- Vista Usuarios (Acordeón) ---
  const usuariosCompletaDiv = document.getElementById("vista-usuarios-list");
  if (usuariosCompletaDiv && (forceReload || !usuariosCompletaDiv.innerHTML)) {
    usuariosCompletaDiv.innerHTML = "";

    // --- NUEVO: Renderizar Docentes Primero ---
    docentes.sort((a, b) => {
      const ka = (
        a.apellido ? String(a.apellido).trim() : getFullNameClient(a)
      ).toUpperCase();
      const kb = (
        b.apellido ? String(b.apellido).trim() : getFullNameClient(a)
      ).toUpperCase();
      return ka.localeCompare(kb, "es");
    });
    if (docentes.length > 0) {
      usuariosCompletaDiv.innerHTML += `
        <div class="accordion-item">
          <button class="accordion-header active" data-target="ciclo-docentes">
            <h3>DOCENTES (${docentes.length} Usuarios)</h3>
            <i class="bi bi-chevron-down"></i>
          </button>
          <div id="ciclo-docentes" class="accordion-content show">
            <ul>${crearListaUsuarios(docentes, true)}</ul>
          </div>
        </div>
      `;
    }

    ciclosOrdenados.forEach((ciclo, index) => {
      const grupo = ciclos[ciclo] || [];
      const count = grupo.length;

      if (count === 0) return;

      grupo.sort((a, b) => {
        if (a.turno === "mañana" && b.turno === "tarde") return -1;
        if (a.turno === "tarde" && b.turno === "mañana") return 1;
        const ka = (
          a.apellido ? String(a.apellido).trim() : getFullNameClient(a)
        ).toUpperCase();
        const kb = (
          b.apellido ? String(b.apellido).trim() : getFullNameClient(a)
        ).toUpperCase();
        return ka.localeCompare(kb, "es");
      });

      // Solo activa el primero si NO hay docentes
      const isActive = index === 0 && docentes.length === 0 ? "active" : "";
      const show = index === 0 && docentes.length === 0 ? "show" : "";

      usuariosCompletaDiv.innerHTML += `
          <div class="accordion-item">
            <button class="accordion-header ${isActive}" data-target="ciclo-${ciclo}">
              <h3>CICLO ${ciclo.toUpperCase()} (${count} Alumnos)</h3>
              <i class="bi bi-chevron-down"></i>
            </button>
            <div id="ciclo-${ciclo}" class="accordion-content ${show}">
              <div class="turno-tabs" data-ciclo="${ciclo}">
                <button class="turno-tab active" data-turno="mañana">Mañana (${
                  grupo.filter((u) => u.turno === "mañana").length
                })</button>
                <button class="turno-tab" data-turno="tarde">Tarde (${
                  grupo.filter((u) => u.turno === "tarde").length
                })</button>
              </div>
              <div class="turno-content">
                <div class="turno-panel" data-turno="mañana" style="display:block;">
                  <ul>${crearListaUsuarios(
                    grupo.filter((u) => u.turno === "mañana")
                  )}</ul>
                </div>
                <div class="turno-panel" data-turno="tarde" style="display:none;">
                  <ul>${crearListaUsuarios(
                    grupo.filter((u) => u.turno === "tarde")
                  )}</ul>
                </div>
              </div>
            </div>
          </div>
        `;
    });

    initAccordion();
  }

  // --- (Vista Docentes (Dashboard) ELIMINADA) ---

  agregarEventosEliminar();
  agregarEventosBarcode();
  agregarEventosEditar(); // <-- AÑADIDO
  initTurnoTabs();
  initExportUI()
}

/**
 * Obtiene los días de asistencia seleccionados en el formulario.
 */
function getSelectedDays() {
  const selectedDays = [];
  document.querySelectorAll(".day-btn.active").forEach((button) => {
    selectedDays.push(button.getAttribute("data-day"));
  });
  return selectedDays;
}

// --- *** HELPERS PARA EL SELECTOR DE HORA *** ---
function populateTimeSelects(hrSelect, minSelect) {
  for (let i = 1; i <= 12; i++) {
    const val = i.toString().padStart(2, "0");
    hrSelect.options.add(new Option(val, val));
  }
  for (let i = 0; i < 60; i++) {
    const val = i.toString().padStart(2, "0");
    minSelect.options.add(new Option(val, val));
  }
}

function setPickerFrom24h(time24h, hrSelect, minSelect, ampmSelect) {
  if (!time24h || !hrSelect || !minSelect || !ampmSelect) return;

  try {
    const [hours, minutes] = time24h.split(":").map(Number);
    const ampm = hours >= 12 ? "PM" : "AM";
    let hr12 = hours % 12;
    if (hr12 === 0) hr12 = 12;

    hrSelect.value = hr12.toString().padStart(2, "0");
    minSelect.value = minutes.toString().padStart(2, "0");
    ampmSelect.value = ampm;
  } catch (e) {
    console.error(`Error al setear picker desde 24h: ${time24h}`, e);
    // No hacer nada, dejar los valores por defecto
  }
}

function convert24hTo12h(time24h) {
  if (!time24h) return "";
  try {
    const [hours, minutes] = time24h.split(":").map(Number);
    const ampm = hours >= 12 ? "PM" : "AM";
    let hr12 = hours % 12;
    if (hr12 === 0) hr12 = 12;
    return `${hr12.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")} ${ampm}`;
  } catch (e) {
    console.error("Error convirtiendo 24h a 12h:", time24h, e);
    return "Error";
  }
}

// --- FUNCIÓN cargarHorarios (MODIFICADA) ---
export async function cargarHorarios() {
  // 1. Referencias a todos los elementos del picker
  const em_hr = document.getElementById("entrada-manana-hr");
  const em_min = document.getElementById("entrada-manana-min");
  const em_ampm = document.getElementById("entrada-manana-ampm");
  const tm_hr = document.getElementById("tolerancia-manana-hr");
  const tm_min = document.getElementById("tolerancia-manana-min");
  const tm_ampm = document.getElementById("tolerancia-manana-ampm");
  const et_hr = document.getElementById("entrada-tarde-hr");
  const et_min = document.getElementById("entrada-tarde-min");
  const et_ampm = document.getElementById("entrada-tarde-ampm");
  const tt_hr = document.getElementById("tolerancia-tarde-hr");
  const tt_min = document.getElementById("tolerancia-tarde-min");
  const tt_ampm = document.getElementById("tolerancia-tarde-ampm");
  const summaryManana = document.getElementById("summary-manana");
  const summaryTarde = document.getElementById("summary-tarde");
  const cicloSelect = document.getElementById("horarios-ciclo-select");

  if (!cicloSelect || !em_hr) return; // Salir si los elementos no están

  // 2. Rellenar los pickers (HH, MM) solo una vez
  if (em_hr.options.length === 0) {
    console.log("Rellenando selectores de hora por primera vez.");
    populateTimeSelects(em_hr, em_min);
    populateTimeSelects(tm_hr, tm_min);
    populateTimeSelects(et_hr, et_min);
    populateTimeSelects(tt_hr, tt_min);
  }

  try {
    // 3. Obtener la lista de ciclos (de /api/ciclos)
    const resCiclos = await fetch("/api/ciclos");
    const ciclosData = await resCiclos.json();
    const ciclos = ciclosData.ciclos || [];

    // 4. Obtener la configuración completa de horarios
    const resHorarios = await fetch("/api/horarios");
    fullHorariosConfig = await resHorarios.json(); // Guardar en caché global

    // 5. Poblar el select de ciclos
    cicloSelect.innerHTML =
      '<option value="default">Horario Default (General)</option>';
    ciclos.forEach((ciclo) => {
      const option = document.createElement("option");
      option.value = ciclo;
      option.textContent = `Ciclo: ${ciclo}`;
      cicloSelect.appendChild(option);
    });

    // 6. Función para actualizar los pickers
    const actualizarPickers = (cicloKey) => {
      let config = fullHorariosConfig.default; // Empezar con default

      if (
        cicloKey !== "default" &&
        fullHorariosConfig.ciclos &&
        fullHorariosConfig.ciclos[cicloKey]
      ) {
        // Si existe config para este ciclo, usarla
        config = fullHorariosConfig.ciclos[cicloKey];
      } else if (cicloKey !== "default") {
        // Si no existe, usar default (y mostrarlo)
        config = fullHorariosConfig.default;
        console.log(`No hay horario para ${cicloKey}, mostrando 'default'.`);
      }

      // Poblar los 8 selects y 2 resúmenes
      setPickerFrom24h(config.mañana.entrada, em_hr, em_min, em_ampm);
      setPickerFrom24h(config.mañana.tolerancia, tm_hr, tm_min, tm_ampm);
      setPickerFrom24h(config.tarde.entrada, et_hr, et_min, et_ampm);
      setPickerFrom24h(config.tarde.tolerancia, tt_hr, tt_min, tt_ampm);

      const h12_em = convert24hTo12h(config.mañana.entrada);
      const h12_tm = convert24hTo12h(config.mañana.tolerancia);
      const h12_et = convert24hTo12h(config.tarde.entrada);
      const h12_tt = convert24hTo12h(config.tarde.tolerancia);

      if (summaryManana)
        summaryManana.textContent = `Entrada: ${h12_em} | Tolerancia: ${h12_tm}`;
      if (summaryTarde)
        summaryTarde.textContent = `Entrada: ${h12_et} | Tolerancia: ${h12_tt}`;
    };

    // 7. Añadir el listener al select
    cicloSelect.onchange = () => {
      actualizarPickers(cicloSelect.value);
    };

    // 8. Cargar los valores 'default' al inicio
    cicloSelect.value = "default";
    actualizarPickers("default");
  } catch (error) {
    console.error("Error al cargar horarios o ciclos:", error);
    cicloSelect.innerHTML = '<option value="">Error al cargar ciclos</option>';
  }
}

export function initUserFormEvents() {
  // 1. Botones de Día (Formulario Agregar)
  document
    .querySelectorAll("#dias-asistencia-selector .day-btn")
    .forEach((button) => {
      button.addEventListener("click", function () {
        this.classList.toggle("active");
      });
    });

  // 2. Formulario Agregar Usuario (Campos condicionales)
  const rolSelect = document.getElementById("rol");
  if (rolSelect) {
    const toggleUserFields = function () {
      const esEstudiante = rolSelect.value === "estudiante";
      const esDocente = rolSelect.value === "docente";

      const turno = document.getElementById("turno");
      const ciclo = document.getElementById("ciclo");
      const diasSelector = document.getElementById("dias-asistencia-selector");

      if (turno) turno.disabled = !esEstudiante;
      if (ciclo) ciclo.disabled = !esEstudiante;
      if (diasSelector)
        diasSelector.style.display =
          esEstudiante || esDocente ? "block" : "none";

      if (!esEstudiante) {
        if (turno) turno.value = "";
        if (ciclo) ciclo.value = "";
      }
    };
    rolSelect.onchange = toggleUserFields;
    toggleUserFields();
  }

  // 3. Forzar mayúsculas en el input de nombre (Agregar)
  const nombreInput = document.getElementById("nombre");
  if (nombreInput) {
    nombreInput.addEventListener("input", function () {
      this.value = this.value.toUpperCase();
    });
  }
  const apellidoInput = document.getElementById("apellido");
  if (apellidoInput) {
    apellidoInput.addEventListener("input", function () {
      this.value = this.value.toUpperCase();
    });
  }

  // 4. Inicializar el autocompletado (Justificar)
  initAutocomplete();
  // 5. Inicializar tabs de turno si ya existen
  if (typeof initTurnoTabs === "function") initTurnoTabs();

  // --- NUEVO: Lógica para el Modal de Edición ---
  const modal = document.getElementById("edit-user-modal");
  if (modal) {
    // 6. Botones de Día (Formulario Editar)
    document
      .querySelectorAll("#edit-dias-asistencia-selector .day-btn")
      .forEach((button) => {
        button.addEventListener("click", function () {
          this.classList.toggle("active");
        });
      });

    // 7. Formulario Editar (Campos condicionales)
    const editRolSelect = document.getElementById("edit-rol");
    if (editRolSelect) {
      const toggleEditFields = function () {
        const esEstudiante = editRolSelect.value === "estudiante";
        const esDocente = editRolSelect.value === "docente";

        const turno = document.getElementById("edit-turno");
        const ciclo = document.getElementById("edit-ciclo");
        const diasSelector = document.getElementById(
          "edit-dias-asistencia-selector"
        );

        if (turno) turno.disabled = !esEstudiante;
        if (ciclo) ciclo.disabled = !esEstudiante;
        if (diasSelector)
          diasSelector.style.display =
            esEstudiante || esDocente ? "block" : "none";

        if (!esEstudiante) {
          if (turno) turno.value = "";
          if (ciclo) ciclo.value = "";
        }
      };
      editRolSelect.onchange = toggleEditFields;
    }

    // 8. Forzar mayúsculas (Editar)
    const editNombreInput = document.getElementById("edit-nombre");
    if (editNombreInput) {
      editNombreInput.addEventListener("input", function () {
        this.value = this.value.toUpperCase();
      });
    }
    const editApellidoInput = document.getElementById("edit-apellido");
    if (editApellidoInput) {
      editApellidoInput.addEventListener("input", function () {
        this.value = this.value.toUpperCase();
      });
    }

    // 9. Botones de cerrar modal
    const closeBtn = document.getElementById("close-edit-modal");
    if (closeBtn) closeBtn.onclick = () => (modal.style.display = "none");
    window.addEventListener("click", function (event) {
      if (event.target == modal) {
        modal.style.display = "none";
      }
    });
  }
}

/**
 * Inicializa los tabs de turno (mañana/tarde) dentro de cada ciclo en el acordeón.
 */
function initTurnoTabs() {
  document.querySelectorAll(".turno-tabs").forEach((tabsContainer) => {
    const ciclo = tabsContainer.dataset.ciclo;
    const tabs = tabsContainer.querySelectorAll(".turno-tab");
    tabs.forEach((tab) => {
      tab.onclick = function () {
        // desactivar todos los tabs hermanos
        tabs.forEach((t) => t.classList.remove("active"));
        this.classList.add("active");
        const turno = this.dataset.turno;
        const content =
          tabsContainer.parentElement.querySelector(".turno-content");
        if (!content) return;
        content.querySelectorAll(".turno-panel").forEach((panel) => {
          if (panel.dataset.turno === turno) panel.style.display = "block";
          else panel.style.display = "none";
        });
      };
    });
  });
}

// --- LÓGICA DE EXPORTACIÓN (UI) ---

function initExportUI() {
    const selectGrupo = document.getElementById('export-select-grupo');
    const selectTurno = document.getElementById('export-select-turno');
    const btnPdf = document.getElementById('btn-descargar-pdf');
    const btnZip = document.getElementById('btn-descargar-zip');
    const lblPdf = document.getElementById('pdf-count-label');
    const lblZip = document.getElementById('zip-count-label');

    if (!selectGrupo || !selectTurno) return;

    // 1. Llenar el select de grupos con los ciclos disponibles
    // Limpiamos opciones anteriores (dejando la default y docentes)
    while (selectGrupo.options.length > 2) {
        selectGrupo.remove(2);
    }
    
    // Obtenemos ciclos únicos de allUserOptions
    const ciclosSet = new Set();
    allUserOptions.forEach(u => {
        if(u.ciclo && u.rol === 'estudiante') ciclosSet.add(u.ciclo);
    });
    
    Array.from(ciclosSet).sort().forEach(ciclo => {
        const opt = document.createElement('option');
        opt.value = ciclo;
        opt.textContent = `CICLO ${ciclo}`;
        selectGrupo.appendChild(opt);
    });

    // 2. Evento cambio de grupo
    selectGrupo.onchange = () => {
        const grupo = selectGrupo.value;
        
        // Resetear turno
        selectTurno.value = "";
        
        if (grupo === 'docentes') {
            selectTurno.disabled = true; // Docentes no tienen turno
            actualizarBotonesExportacion('docentes', null);
        } else if (grupo === "") {
            selectTurno.disabled = true;
            disableExportButtons();
        } else {
            // Es un ciclo, habilitar turno
            selectTurno.disabled = false;
            disableExportButtons(); // Esperar a que elija turno
        }
    };

    // 3. Evento cambio de turno
    selectTurno.onchange = () => {
        const grupo = selectGrupo.value;
        const turno = selectTurno.value;
        if (grupo && turno) {
            actualizarBotonesExportacion(grupo, turno);
        } else {
            disableExportButtons();
        }
    };

    // Helper para contar usuarios y habilitar botones
    function actualizarBotonesExportacion(grupo, turno) {
        let filtrados = [];

        if (grupo === 'docentes') {
            filtrados = allUserOptions.filter(u => u.rol === 'docente');
        } else {
            // Es alumno
            filtrados = allUserOptions.filter(u => 
                u.rol === 'estudiante' && 
                u.ciclo === grupo && 
                u.turno === turno
            );
        }

        const count = filtrados.length;

        if (count > 0) {
            btnPdf.disabled = false;
            btnZip.disabled = false;
            lblPdf.textContent = `(${count} usuarios)`;
            lblZip.textContent = `(${count} imágenes)`;
            
            // Guardamos los datos filtrados en el botón para usarlos al hacer clic
            // (Esto lo usaremos en la siguiente fase)
            btnPdf.dataset.filtroGrupo = grupo;
            btnPdf.dataset.filtroTurno = turno || "";
            btnZip.dataset.filtroGrupo = grupo;
            btnZip.dataset.filtroTurno = turno || "";
        } else {
            disableExportButtons();
            lblPdf.textContent = "(0 usuarios)";
            lblZip.textContent = "(Sin resultados)";
        }
    }

    function disableExportButtons() {
        btnPdf.disabled = true;
        btnZip.disabled = true;
        lblPdf.textContent = "(Selecciona filtros)";
        lblZip.textContent = "(Selecciona filtros)";
    }
    // 4. Listeners de los botones
    btnPdf.onclick = function() {
        procesarDescarga('pdf');
    };

    btnZip.onclick = function() {
        procesarDescarga('zip');
    };
}

// ==========================================
// FASE 2: LÓGICA DE EXPORTACIÓN MASIVA
// ==========================================


/**
 * Función principal que orquesta la descarga.
 * Se llama desde los botones de exportación.
 */
async function procesarDescarga(tipo) {
  const btn = tipo === 'pdf' ? document.getElementById('btn-descargar-pdf') : document.getElementById('btn-descargar-zip');
  if (!btn || btn.disabled) return;

  // 1. Obtener filtros del botón
  const grupo = btn.dataset.filtroGrupo;
  const turno = btn.dataset.filtroTurno;

  // 2. Filtrar usuarios
  let usuariosAProcesar = [];
  if (grupo === 'docentes') {
    usuariosAProcesar = allUserOptions.filter(u => u.rol === 'docente');
  } else {
    usuariosAProcesar = allUserOptions.filter(u => 
      u.rol === 'estudiante' && u.ciclo === grupo && u.turno === turno
    );
  }

  if (usuariosAProcesar.length === 0) {
    alert("No hay usuarios para exportar.");
    return;
  }

  // 3. Preparar UI
  document.getElementById('export-progress-area').style.display = 'block';
  bloquearBotonesExport(true);
  
  try {
    // 4. Cargar recursos previos (Logo) una sola vez
    actualizarProgreso(0, "Cargando recursos...");
    const logoImg = await cargarImagenPromesa("../img/Logo 1x4 b&w.svg");

    // 5. Inicializar contenedores (ZIP o PDF)
    let zip = null;
    let pdfDoc = null;
    
    if (tipo === 'zip') {
      // @ts-ignore
      zip = new JSZip();
    } else {
      // @ts-ignore
      const { jsPDF } = window.jspdf;
      pdfDoc = new jsPDF({ unit: "mm", format: "a4" });
    }

    // Configuración para Grid en PDF (A4: 210x297mm)
    // Carnet aprox 5.4cm x 8.6cm (Vertical)
    const cardW_mm = 54; 
    const cardH_mm = 85.6;
    const marginX = 18; // Margen izquierdo
    const marginY = 15; // Margen superior
    const gapX = 10;    // Espacio horizontal entre carnets
    const gapY = 10;    // Espacio vertical
    let col = 0, row = 0;

    // Canvas temporal en memoria
    const canvasTemp = document.createElement('canvas');
    canvasTemp.width = 320;
    canvasTemp.height = 480;
    const ctx = canvasTemp.getContext('2d');

    // 6. Bucle de Generación
    const total = usuariosAProcesar.length;
    
    for (let i = 0; i < total; i++) {
      const usuario = usuariosAProcesar[i];
      
      // Actualizar barra cada 5 usuarios para no bloquear el UI
      if (i % 5 === 0) {
        actualizarProgreso(Math.round((i / total) * 100), `Generando carnet de: ${usuario.nombre} (${i+1}/${total})`);
        await new Promise(r => setTimeout(r, 0)); // Ceder control al UI
      }

      // Dibujar en el canvas oculto
      dibujarCarnetEnContexto(ctx, usuario, logoImg, 320, 480);

      // Obtener imagen
      const imgData = canvasTemp.toDataURL("image/png");

      if (tipo === 'zip') {
        // Agregar al ZIP: "codigo - Apellido Nombre.png"
        const cleanName = getFullNameClient(usuario).replace(/[^a-z0-9 ]/gi, '_');
        const fileName = `${usuario.codigo} - ${cleanName}.png`;
        // Remove header data:image/png;base64,
        zip.file(fileName, imgData.split(',')[1], {base64: true});
      
      } else {
        // Agregar al PDF
        // Calcular posición
        const xPos = marginX + (col * (cardW_mm + gapX));
        const yPos = marginY + (row * (cardH_mm + gapY));

        pdfDoc.addImage(imgData, 'PNG', xPos, yPos, cardW_mm, cardH_mm);

        col++;
        if (col >= 3) { // 3 columnas máximo
          col = 0;
          row++;
          if (row >= 3) { // 3 filas máximo (9 carnets por hoja)
            // Si quedan más usuarios, nueva página
            if (i < total - 1) {
              pdfDoc.addPage();
              col = 0;
              row = 0;
            }
          }
        }
      }
    }

    // 7. Finalizar y Descargar
    actualizarProgreso(95, "Comprimiendo archivo final...");
    
    const timestamp = new Date().toISOString().slice(0,10);
    const nombreArchivoBase = `Carnets_${grupo}_${turno || 'Docentes'}_${timestamp}`;

    if (tipo === 'zip') {
      const content = await zip.generateAsync({type:"blob"});
      downloadBlob(content, `${nombreArchivoBase}.zip`);
    } else {
      pdfDoc.save(`${nombreArchivoBase}.pdf`);
    }

    actualizarProgreso(100, "¡Descarga completada!");
    setTimeout(() => {
      document.getElementById('export-progress-area').style.display = 'none';
      bloquearBotonesExport(false);
    }, 2000);

  } catch (err) {
    console.error(err);
    alert("Error al generar los archivos: " + err.message);
    bloquearBotonesExport(false);
    document.getElementById('export-progress-area').style.display = 'none';
  }
}

// --- HELPERS PARA EL PROCESO ---

function bloquearBotonesExport(estado) {
  document.getElementById('btn-descargar-pdf').disabled = estado;
  document.getElementById('btn-descargar-zip').disabled = estado;
  // No deshabilitamos los selects para permitir cambiar de opinión, 
  // pero el usuario debería esperar.
}

function actualizarProgreso(porcentaje, texto) {
  const bar = document.getElementById('export-progress-bar');
  const txt = document.getElementById('export-status-msg');
  const pct = document.getElementById('export-percent');
  if(bar) bar.style.width = `${porcentaje}%`;
  if(txt) txt.textContent = texto;
  if(pct) pct.textContent = `${porcentaje}%`;
}

function cargarImagenPromesa(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous"; // Importante para evitar Tainted Canvas
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error(`No se pudo cargar la imagen: ${src}`));
    img.src = src;
  });
}

function downloadBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

/**
 * Lógica pura de dibujo (extraída de tu función original).
 * Dibuja un carnet en el contexto 2D proporcionado.
 */
function dibujarCarnetEnContexto(ctx, user, logoImg, W, H) {
  const primary = "#0A2240"; 
  // const accent = "#F2B705"; // no usado en el diseño actual pero disponible
  const bg = "#FFFFFF";

  // Limpiar
  ctx.clearRect(0, 0, W, H);

  // Fondo
  ctx.fillStyle = bg;
  roundRect(ctx, 6, 6, W - 12, H - 12, 12, true, true); // Usamos tu función existente roundRect
  ctx.fillStyle = "#f8f9fb";
  ctx.fillRect(8, 8, W - 16, H - 16);

  let y = 24;

  // Logo
  const logoMaxW = 180;
  const logoMaxH = 90;
  if (logoImg) {
    const ratio = logoImg.naturalWidth / logoImg.naturalHeight;
    let logoW = logoMaxW;
    let logoH = Math.round(logoW / ratio);
    if (logoH > logoMaxH) {
      logoH = logoMaxH;
      logoW = Math.round(logoH * ratio);
    }
    ctx.drawImage(logoImg, W / 2 - logoW / 2, y, logoW, logoH);
    y += logoH + 14;
  }

  // Título
  ctx.fillStyle = primary;
  ctx.fillRect(20, y - 6, W - 40, 28);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 12px Arial";
  ctx.textAlign = "center";
  ctx.fillText("CARNET - ACADEMIA INGEMAT", W / 2, y + 14);
  y += 36;

  // Datos Helper
  const drawField = (label, value, isRole = false) => {
    ctx.fillStyle = "#666";
    ctx.font = "bold 11px Arial";
    ctx.textAlign = "left";
    ctx.fillText(label, 28, y);
    y += 18;
    ctx.fillStyle = isRole ? "#333" : primary;
    ctx.font = isRole ? "bold 13px Arial" : "bold 18px Arial";
    // Cortar texto si es muy largo
    let valStr = value ? value.toUpperCase() : "-";
    if (valStr.length > 22) valStr = valStr.substring(0,22) + "...";
    ctx.fillText(valStr, 28, y);
    y += isRole ? 34 : 28;
  };

  drawField("NOMBRE:", user.nombre);
  
  // Apellido (ajustando espaciado manual como en original)
  y += 6; 
  drawField("APELLIDO:", user.apellido);
  y += 6;

  // Ciclo/Turno o Cargo
  if (user.rol === "docente") {
    drawField("CARGO:", "DOCENTE", true);
  } else {
    drawField("CICLO Y TURNO:", `${(user.ciclo || "").toString().toUpperCase()} - ${user.turno || ""}`, true);
  }

  // Divider
  ctx.strokeStyle = "#e6e9ee";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(24, y);
  ctx.lineTo(W - 24, y);
  ctx.stroke();
  y += 18;

  // Código
  ctx.fillStyle = "#666";
  ctx.font = "bold 11px Arial";
  ctx.textAlign = "left";
  ctx.fillText("CÓDIGO:", 28, y);
  y += 16;
  ctx.fillStyle = "#000";
  ctx.font = "bold 20px monospace";
  ctx.textAlign = "center";
  ctx.fillText(user.codigo || "-", W / 2, y);
  y += 28;

  // Barcode
  // Truco: Usamos un canvas temporal para JsBarcode y lo dibujamos en el principal
  const barcodeCanvas = document.createElement("canvas");
  try {
    JsBarcode(barcodeCanvas, user.codigo || "0000", {
      format: "CODE128",
      displayValue: true,
      fontSize: 18,
      height: 90,
      margin: 6,
      background: "#f8f9fb" // Que coincida con el fondo
    });
    // Centrar
    const barcodeX = Math.round((W - barcodeCanvas.width) / 2);
    ctx.drawImage(barcodeCanvas, barcodeX, y);
    y += barcodeCanvas.height + 8;
  } catch (e) {
    console.warn("Error generando barcode para", user.codigo);
  }

  // Footer
  ctx.textAlign = "start"; // Reset
  ctx.fillStyle = "#999";
  ctx.font = "10px Arial";
  ctx.textAlign = "center";
  ctx.fillText("Academia INGEMAT", W / 2, H - 18);
}

// --- UTILIDADES EXPORTADAS PARA GENERACIÓN DE CARNETS ---

function cargarImagenPromesa(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error(`Error cargando imagen: ${src}`));
    img.src = src;
  });
}

/**
 * Genera el Base64 del carnet de un usuario específico.
 * Reutiliza la lógica visual de tu carnet actual.
 */
export async function generarCarnetBase64(usuario) {
  // 1. Cargar logo
  let logoImg;
  try {
    logoImg = await cargarImagenPromesa("../img/Logo 1x4 b&w.svg");
  } catch (e) {
    console.warn("Logo no cargó, generando sin logo.");
  }

  // 2. Crear canvas en memoria
  const canvas = document.createElement('canvas');
  const W = 320; 
  const H = 480;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // 3. Variables de estilo (idénticas a tu mostrarBarcodeModal)
  const primary = "#0A2240";
  const bg = "#FFFFFF";

  // --- DIBUJADO (Copiado y adaptado de tu función drawCard) ---
  ctx.clearRect(0, 0, W, H);

  // Fondo
  ctx.fillStyle = bg;
  // Usamos tu función roundRect que ya existe en este archivo
  roundRect(ctx, 6, 6, W - 12, H - 12, 12, true, true);
  ctx.fillStyle = "#f8f9fb";
  ctx.fillRect(8, 8, W - 16, H - 16);

  let y = 24;

  // Logo
  const logoMaxW = 180;
  const logoMaxH = 90;
  if (logoImg) {
    const ratio = logoImg.naturalWidth / logoImg.naturalHeight;
    let logoW = logoMaxW;
    let logoH = Math.round(logoW / ratio);
    if (logoH > logoMaxH) {
      logoH = logoMaxH;
      logoW = Math.round(logoH * ratio);
    }
    ctx.drawImage(logoImg, W / 2 - logoW / 2, y, logoW, logoH);
    y += logoH + 14;
  }

  // Título
  ctx.fillStyle = primary;
  ctx.fillRect(20, y - 6, W - 40, 28);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 12px Arial";
  ctx.textAlign = "center";
  ctx.fillText("CARNET - ACADEMIA INGEMAT", W / 2, y + 14);
  y += 36;

  // Helpers de texto
  const drawLabel = (text) => {
    ctx.fillStyle = "#666";
    ctx.font = "bold 11px Arial";
    ctx.textAlign = "left";
    ctx.fillText(text, 28, y);
    y += 18;
  };
  const drawValue = (text, size = "18px", color = primary) => {
    ctx.fillStyle = color;
    ctx.font = `bold ${size} Arial`;
    // Cortar texto largo
    let val = text ? text.toUpperCase() : "-";
    if (val.length > 22) val = val.substring(0, 22) + "...";
    ctx.fillText(val, 28, y);
    y += (size === "13px" ? 34 : 28); // Ajuste de espaciado según tamaño
  };

  // Nombre
  drawLabel("NOMBRE:");
  drawValue(usuario.nombre);
  y += 6; // Ajuste manual original

  // Apellido
  drawLabel("APELLIDO:");
  drawValue(usuario.apellido);
  y += 6;

  // Rol / Ciclo
  if (usuario.rol === "docente") {
    drawLabel("CARGO:");
    drawValue("DOCENTE", "13px");
  } else {
    drawLabel("CICLO Y TURNO:");
    const info = `${(usuario.ciclo || "").toString().toUpperCase()} - ${usuario.turno || ""}`;
    drawValue(info, "13px", "#333");
  }

  // Divisor
  ctx.strokeStyle = "#e6e9ee";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(24, y);
  ctx.lineTo(W - 24, y);
  ctx.stroke();
  y += 18;

  // Código Texto
  ctx.fillStyle = "#666";
  ctx.font = "bold 11px Arial";
  ctx.textAlign = "left";
  ctx.fillText("CÓDIGO:", 28, y);
  y += 16;
  ctx.fillStyle = "#000";
  ctx.font = "bold 20px monospace";
  ctx.textAlign = "center";
  ctx.fillText(usuario.codigo || "-", W / 2, y);
  y += 28;

  // Código de Barras (JsBarcode)
  const tmpC = document.createElement("canvas");
  // JsBarcode necesita un elemento canvas real, aunque sea en memoria
  try {
    JsBarcode(tmpC, usuario.codigo || "0000", {
        format: "CODE128",
        displayValue: true,
        fontSize: 18,
        height: 90,
        margin: 6,
        background: "#f8f9fb"
    });
    const barcodeX = Math.round((W - tmpC.width) / 2);
    ctx.drawImage(tmpC, barcodeX, y);
  } catch(e) { console.error("Error JsBarcode", e); }

  // Footer
  ctx.textAlign = "start"; // Reset safety
  ctx.fillStyle = "#999";
  ctx.font = "10px Arial";
  ctx.textAlign = "center";
  ctx.fillText("Academia INGEMAT", W / 2, H - 18);

  // 4. Retornar DataURL
  return canvas.toDataURL("image/png");
}