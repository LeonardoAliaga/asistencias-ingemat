// Proyecto/Public/js/admin/users.js

import { initAccordion } from "./accordion.js";

let allUserOptions = []; // Caché de usuarios para justificar
let currentAutocompleteFocus = -1; // Para navegación por teclado

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
      // Añadimos dos botones: eliminar y generar barcode
      return `
            <li style="position:relative;padding-right:86px;">
              <div style="display:flex;flex-direction:column;">
                <span><strong>${u.codigo}</strong> - ${getFullNameClient(
        u
      )}</span>
                <small style="color:#666">${diasAsistencia}</small>
              </div>
              <div style="position:absolute;right:5px;top:8px;display:flex;gap:8px;">
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
        if (bc) bc.style.display = "inline";
        btn.style.display = "inline";
      };
      li.onmouseleave = () => {
        const bc = li.querySelector(".btn-barcode");
        if (bc) bc.style.display = "none";
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
        b.apellido ? String(b.apellido).trim() : getFullNameClient(b)
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
          b.apellido ? String(b.apellido).trim() : getFullNameClient(b)
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
  initTurnoTabs();
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

  const [hours, minutes] = time24h.split(":").map(Number);
  const ampm = hours >= 12 ? "PM" : "AM";
  let hr12 = hours % 12;
  if (hr12 === 0) hr12 = 12;

  hrSelect.value = hr12.toString().padStart(2, "0");
  minSelect.value = minutes.toString().padStart(2, "0");
  ampmSelect.value = ampm;
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

export async function cargarHorarios() {
  const res = await fetch("/api/horarios");
  const horarios = await res.json();

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

  if (em_hr && em_hr.options.length === 0) {
    console.log("Rellenando selectores de hora por primera vez.");
    populateTimeSelects(em_hr, em_min);
    populateTimeSelects(tm_hr, tm_min);
    populateTimeSelects(et_hr, et_min);
    populateTimeSelects(tt_hr, tt_min);
  }

  if (em_hr) {
    setPickerFrom24h(horarios.mañana.entrada, em_hr, em_min, em_ampm);
    setPickerFrom24h(horarios.mañana.tolerancia, tm_hr, tm_min, tm_ampm);
    setPickerFrom24h(horarios.tarde.entrada, et_hr, et_min, et_ampm);
    setPickerFrom24h(horarios.tarde.tolerancia, tt_hr, tt_min, tt_ampm);
  }

  if (summaryManana) {
    const h12_em = convert24hTo12h(horarios.mañana.entrada);
    const h12_tm = convert24hTo12h(horarios.mañana.tolerancia);
    const h12_et = convert24hTo12h(horarios.tarde.entrada);
    const h12_tt = convert24hTo12h(horarios.tarde.tolerancia);

    document.getElementById(
      "summary-manana"
    ).textContent = `Entrada: ${h12_em} | Tolerancia: ${h12_tm}`;
    document.getElementById(
      "summary-tarde"
    ).textContent = `Entrada: ${h12_et} | Tolerancia: ${h12_tt}`;
  }
}

export function initUserFormEvents() {
  // 1. Botones de Día
  document.querySelectorAll(".day-btn").forEach((button) => {
    button.addEventListener("click", function () {
      this.classList.toggle("active");
    });
  });

  // 2. Formulario Agregar Usuario (FIX: Campos condicionales)
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

  // 3. Formulario Agregar Submit
  // (Este listener se movió a admin.js para centralizar)

  // 4. Forzar mayúsculas en el input de nombre
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

  // 5. Inicializar el autocompletado
  initAutocomplete();
  // 6. Inicializar tabs de turno si ya existen
  if (typeof initTurnoTabs === "function") initTurnoTabs();
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
