// Variable global para manejar el scanner
let html5QrCode = null; // CUIDADO: Cambié el nombre de la variable para reflejar que usamos la clase base
let isCooldown = false;
let receptionStudentSearch = null;
function destroyReceptionSearch() {
  receptionStudentSearch?.destroy?.();
  receptionStudentSearch = null;
}

// =========================================================
// FUNCIÓN COMPARTIDA PARA REGISTRAR CÓDIGOS (Sin cambios)
// =========================================================
const registrarCodigo = async (codigo, resultadoDiv, inputToRefocus = null) => {
  resultadoDiv.innerHTML = "<i>Procesando...</i>";

  if (!codigo) {
    resultadoDiv.innerHTML = "❌ Nada que registrar";
    if (inputToRefocus) inputToRefocus.focus();
    return;
  }

  try {
    const res = await fetch("/api/registrar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigo }),
    });

    const data = await res.json();

    if (data.exito) {
      let estadoTexto = "";
      if (data.rol === "estudiante") {
        if (data.estado === "puntual") estadoTexto = "🟢 Puntual";
        else if (data.estado === "tolerancia") estadoTexto = "🟠 Tolerancia";
        else if (data.estado === "tarde") estadoTexto = "🔴 Tarde";
        else if (data.estado === "justificada")
          estadoTexto = "🟠 Tard. Justif.";

        resultadoDiv.innerHTML = `
          <div style="padding: 10px; letter-spacing: 1px; border-radius: 8px; width: 100%;">
            <span><b>Ciclo:</b> ${data.ciclo} | <b>Turno:</b> ${
              data.turno
            }</span>
            <br>
            <span>📚 <b>${data.nombre}</b> registrado</span>
            <br>
            <span>🕓 ${data.hora} | ${estadoTexto}</span>
            ${
              data.mensajeAdicional
                ? `<br><span style="font-size: smaller; color: #ccc;">(${data.mensajeAdicional})</span>`
                : ""
            }
          </div>
        `;
      } else {
        resultadoDiv.innerHTML = `
          <div style="letter-spacing: 1px; padding: 10px; border-radius: 8px; width: 100%;">
            <span><b>Docente</b></span>
            <br>
            <span>✅ <b>${data.nombre}</b> registrado</span>
            <br>
            <span>🕓 ${data.hora}</span>
          </div>
        `;
      }
      return true;
    } else {
      resultadoDiv.textContent = `❌ ${data.mensaje || "No se pudo registrar la asistencia."}`;
      return false;
    }
  } catch (error) {
    console.error("Error en fetch:", error);
    resultadoDiv.textContent = "❌ Error de conexión.";
    return false;
  } finally {
    if (inputToRefocus) {
      inputToRefocus.value = "";
      inputToRefocus.focus();
    }
  }
};

// =========================================================
// LÓGICA DEL BOTÓN ASISTENCIAS (INPUT MANUAL)
// =========================================================
document
  .getElementById("btn-asistencias")
  .addEventListener("click", async function (e) {
    e.preventDefault();
    destroyReceptionSearch();

    // Detener escáner si está activo
    if (html5QrCode) {
      try {
        await html5QrCode.stop();
        html5QrCode.clear();
      } catch (err) {
        console.log("Scanner no estaba corriendo");
      }
      html5QrCode = null;
    }

    const box = document.querySelector(".box-header");
    box.innerHTML = `
    <img src="./img/Logo 1x1 nb.png" alt="Logo Ingemat" style="width:18rem;"/>
    <h1>¡Te damos la bienvenida!</h1>
      <div style="display:flex; flex-direction:column; align-items:center; gap:10px;">
        <div id="resultado" style="margin-top:20px; font-size:20px; display: grid; justify-items:center;"></div>
        <input type="text" id="codigo" placeholder="Introduce o escanea el código" style="padding:10px; font-size:18px;"/>
        <div class="reception-register-actions">
          <button id="registrar-btn" class="btn-red" type="button">Registrar</button>
          <button id="reception-search-toggle" class="reception-search-toggle" type="button" aria-controls="reception-search-panel" aria-expanded="false">
            <i class="bi bi-search" aria-hidden="true"></i> Buscar alumno
          </button>
        </div>
        <div id="reception-search-panel" class="reception-search-panel" hidden>
          <label for="reception-student-search">Buscar por nombre, apellido o código</label>
          <div class="reception-search-field">
            <input id="reception-student-search" type="search" autocomplete="off" role="combobox" aria-autocomplete="list" aria-controls="reception-student-results" aria-expanded="false" placeholder="Ej.: María Fernández o 00001234" />
            <div id="reception-student-results" class="reception-student-results" role="listbox" hidden></div>
          </div>
          <input id="reception-student-code" type="hidden" />
          <p id="reception-student-selected" class="reception-search-status" role="status" aria-live="polite"></p>
          <button id="reception-register-student" type="button" class="btn-red reception-register-student" disabled>Registrar alumno seleccionado</button>
        </div>
        <p id="reception-search-error" class="reception-search-status" role="status" hidden></p>
      </div>
    `;

    const codigoInput = document.getElementById("codigo");
    const registrarBtn = document.getElementById("registrar-btn");
    const resultadoDiv = document.getElementById("resultado");

    codigoInput.style.textTransform = "uppercase";

    const handleManualRegister = () => {
      const codigo = codigoInput.value.trim().toUpperCase();
      registrarCodigo(codigo, resultadoDiv, codigoInput);
    };

    registrarBtn.onclick = handleManualRegister;

    codigoInput.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.keyCode === 13) {
        event.preventDefault();
        handleManualRegister();
      }
    });

    const searchToggle = document.getElementById("reception-search-toggle"),
      searchPanel = document.getElementById("reception-search-panel"),
      searchError = document.getElementById("reception-search-error"),
      selectedCode = document.getElementById("reception-student-code"),
      searchInput = document.getElementById("reception-student-search"),
      registerSelected = document.getElementById("reception-register-student");
    searchToggle.addEventListener("click", async () => {
      const opening = searchPanel.hidden;
      searchPanel.hidden = !opening;
      searchToggle.setAttribute("aria-expanded", String(opening));
      if (!opening) {
        codigoInput.focus();
        return;
      }
      searchError.hidden = true;
      if (!receptionStudentSearch) {
        searchToggle.disabled = true;
        try {
          // Solo Recepción y Administración pueden consultar nombres y códigos.
          const response = await fetch("/api/v2/attendance/students", { cache: "no-store" });
          if (!response.ok) {
            if (response.status === 401 || response.status === 403)
              throw new Error("Inicia sesión con una cuenta de Recepción o Administración para buscar alumnos.");
            throw new Error("No se pudo cargar el listado de alumnos.");
          }
          const students = await response.json();
          if (!Array.isArray(students)) throw new Error("El listado de alumnos no es válido.");
          const { mountManualStudentSearch } = await import("/js/admin/manual-student-search.js");
          if (!searchPanel.isConnected) return;
          receptionStudentSearch = mountManualStudentSearch({
            input: searchInput,
            hidden: selectedCode,
            list: document.getElementById("reception-student-results"),
            summary: document.getElementById("reception-student-selected"),
            getStudents: () => students,
            emptyMessage: "No hay estudiantes que coincidan con la búsqueda.",
            onChange: () => {
              registerSelected.disabled = !receptionStudentSearch?.isSelected();
            },
          });
        } catch (error) {
          searchError.textContent = error.message;
          searchError.hidden = false;
          searchPanel.hidden = true;
          searchToggle.setAttribute("aria-expanded", "false");
          return;
        } finally {
          searchToggle.disabled = false;
        }
      }
      searchInput.focus();
    });
    registerSelected.addEventListener("click", async () => {
      if (!receptionStudentSearch?.isSelected()) return;
      registerSelected.disabled = true;
      try {
        const recorded = await registrarCodigo(selectedCode.value, resultadoDiv);
        if (recorded) {
          receptionStudentSearch.reset();
          if (!searchPanel.hidden) searchInput.focus();
        }
      } finally {
        registerSelected.disabled = !receptionStudentSearch?.isSelected();
      }
    });

    codigoInput.focus();
  });

// =========================================================
// LÓGICA DEL BOTÓN ESCANEAR (CÁMARA TRASERA AUTO)
// =========================================================
document
  .getElementById("btn-scan")
  .addEventListener("click", async function (e) {
    e.preventDefault();
    destroyReceptionSearch();

    // Limpieza previa
    if (html5QrCode) {
      try {
        await html5QrCode.stop();
        html5QrCode.clear();
      } catch (err) {}
      html5QrCode = null;
    }

    const box = document.querySelector(".box-header");

    // --- CAMBIO ESTÉTICO: Estructura más flexible ---
    // Quitamos alturas fijas y usamos porcentajes/flex para que no se desborde
    box.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; width: 100%; height: 100%; justify-content: flex-start; padding-top: 10rem;">
        <h2 style="color: white; margin-bottom: 10px; z-index: 10;">Escanea tu Carnet</h2>
        
        <div id="reader" style="width: 90%; max-width: 400px; border-radius: 15px; overflow: hidden; border: 2px solid white; background: #000;"></div>
        
        <div id="resultado" style="margin-top:15px; font-size:1.1rem; text-align:center; min-height: 80px; width: 90%; color: white;">
            <span>Enfoca el código de barras...</span>
        </div>

        <button class="btn-red" id="btn-cancelar" style="margin-top:10px; z-index: 10;">Cancelar / Salir</button>
    </div>
  `;

    const resultadoDiv = document.getElementById("resultado");

    // Botón Cancelar: Recarga la página para "limpiar" todo radicalmente
    document.getElementById("btn-cancelar").onclick = () =>
      window.location.reload();

    const onScanSuccess = (decodedText, decodedResult) => {
      if (isCooldown) return;
      isCooldown = true;

      // Feedback visual inmediato (vibración si el navegador lo soporta)
      if (navigator.vibrate) navigator.vibrate(200);

      registrarCodigo(decodedText, resultadoDiv, null);

      setTimeout(() => {
        isCooldown = false;
      }, 2000);
    };

    // Instanciamos la clase BASE (no Scanner)
    html5QrCode = new Html5Qrcode("reader");

    const config = {
      fps: 10,
      qrbox: { width: 250, height: 150 }, // Hacemos la caja más rectangular (tipo código de barras)
      aspectRatio: 1.0,
    };

    // --- EL TRUCO: facingMode: "environment" fuerza la trasera ---
    try {
      await html5QrCode.start(
        { facingMode: "environment" },
        config,
        onScanSuccess,
      );
      // Ocultar mensaje de espera si la cámara arranca bien
      // resultadoDiv.innerHTML = "<span>¡Cámara lista!</span>";
    } catch (err) {
      console.error("Error iniciando cámara", err);
      resultadoDiv.innerHTML = `<span style="color: orange">No se pudo iniciar la cámara trasera.<br>Verifica permisos.</span>`;
    }
  });

// =========================================================
// LÓGICA DEL BOTÓN PRÉSTAMO DE LIBROS (MANUAL / ESCÁNER)
// =========================================================
const btnPrestamoLibros = document.getElementById("btn-prestamo-libros");
if (btnPrestamoLibros) {
  btnPrestamoLibros.addEventListener("click", async function (e) {
    e.preventDefault();
    destroyReceptionSearch();

    // Detener escáner si está activo
    if (html5QrCode) {
      try {
        await html5QrCode.stop();
        html5QrCode.clear();
      } catch (err) {}
      html5QrCode = null;
    }

    const box = document.querySelector(".box-header");
    const session = await window.ingematSession;
    if (
      !session?.usuario ||
      !["admin", "recepcion"].includes(session.usuario.role)
    ) {
      box.innerHTML =
        '<h2>Préstamos de biblioteca</h2><p>Una cuenta de recepción o administración debe registrar los préstamos.</p><a class="btn-red" href="/admin">Iniciar sesión</a>';
      return;
    }
    box.innerHTML = `
      <img src="./img/Logo 1x1 nb.png" alt="Logo Ingemat" style="width:14rem;"/>
      <h2 style="margin: 10px 0; color: var(--red); font-family: var(--font-heading);">📚 Préstamo de Libros</h2>
      <div style="display:flex; flex-direction:column; align-items:center; gap:12px; width: 100%; max-width: 420px;">
        <div id="resultado-prestamo" style="margin-top:5px; font-size:0.95rem; width:100%; text-align:center;"></div>
        
        <div style="width:100%; text-align:left; position: relative;">
          <label style="font-size:0.85rem; font-weight:600; color:#333;">1. Libro (Búsqueda por código, título o editorial):</label>
          <div style="position:relative; width:100%; margin-top:4px;">
            <input type="text" id="codigo-libro-input" autocomplete="off" placeholder="🔍 Escribe código, título o editorial..." style="padding:10px 12px; font-size:0.95rem; width:100%; border-radius:6px; border:1px solid #cbd5e1; text-transform:uppercase; box-sizing: border-box;" />
            <div id="libro-search-dropdown" class="libro-dropdown" style="display:none;"></div>
          </div>
          <div id="libro-selected-preview" style="display:none; margin-top:6px; font-size:0.82rem; color:#059669; font-weight:600; background:#ecfdf5; padding:6px 10px; border-radius:6px; border:1px solid #a7f3d0;"></div>
        </div>

        <div style="width:100%; text-align:left;">
          <label style="font-size:0.85rem; font-weight:600; color:#333;">2. Código del Estudiante:</label>
          <input type="text" id="codigo-estudiante-input" placeholder="Escanea o escribe código del carnet (ej. EST-001)" style="padding:10px 12px; font-size:0.95rem; width:100%; border-radius:6px; border:1px solid #cbd5e1; text-transform:uppercase; margin-top:4px; box-sizing: border-box;" />
        </div>

        <button id="btn-submit-prestamo" class="btn-red" style="width:100%; padding:11px; font-size:1rem; font-weight:700; margin-top:6px; cursor:pointer;">
          <i class="bi bi-journal-check"></i> Registrar Préstamo
        </button>
      </div>
    `;

    const libroInput = document.getElementById("codigo-libro-input");
    const estudianteInput = document.getElementById("codigo-estudiante-input");
    const dropdownEl = document.getElementById("libro-search-dropdown");
    const previewEl = document.getElementById("libro-selected-preview");
    const btnSubmit = document.getElementById("btn-submit-prestamo");
    const resDiv = document.getElementById("resultado-prestamo");

    libroInput.focus();

    // Inicializar autocompletado inteligente de libros
    setupIntelligentBookSearch(
      libroInput,
      estudianteInput,
      previewEl,
      dropdownEl,
    );

    const handleRegistrarPrestamo = async () => {
      const codLibro = libroInput.value.trim().toUpperCase();
      const codEstudiante = estudianteInput.value.trim().toUpperCase();

      if (!codLibro || !codEstudiante) {
        resDiv.innerHTML = `<span style="color: #721c24; background-color: #f8d7da; padding: 8px 12px; border-radius: 6px; display: inline-block; width: 100%;">⚠️ Debe ingresar código del libro y del estudiante.</span>`;
        return;
      }

      resDiv.innerHTML = "<i>Procesando préstamo...</i>";

      try {
        const response = await fetch("/api/biblioteca/prestamo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            codigoLibro: codLibro,
            codigoUsuario: codEstudiante,
          }),
        });

        const data = await response.json();

        if (data.exito) {
          resDiv.innerHTML = `
            <div style="background-color: #d4edda; color: #155724; padding: 12px; border-radius: 8px; border: 1px solid #c3e6cb; width: 100%;">
              <strong>✅ ¡Préstamo Registrado!</strong><br>
              📖 <b>${data.libro.titulo}</b> (${data.libro.codigo})<br>
              👤 <b>${data.usuario.nombre}</b> [${data.usuario.ciclo || "Estudiante"}]<br>
              🕓 <span>${data.prestamo.fechaPrestamo}</span>
            </div>
          `;
          libroInput.value = "";
          estudianteInput.value = "";
          if (previewEl) {
            previewEl.style.display = "none";
            previewEl.innerHTML = "";
          }
          libroInput.focus();
          cargarEstantePublico();
        } else {
          resDiv.innerHTML = `<span style="color: #721c24; background-color: #f8d7da; padding: 8px 12px; border-radius: 6px; display: inline-block; width: 100%;">❌ ${data.mensaje}</span>`;
        }
      } catch (err) {
        console.error("Error al registrar préstamo:", err);
        resDiv.innerHTML = `<span style="color: red;">❌ Error de conexión al registrar el préstamo.</span>`;
      }
    };

    btnSubmit.onclick = handleRegistrarPrestamo;

    estudianteInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.keyCode === 13) {
        e.preventDefault();
        handleRegistrarPrestamo();
      }
    });
  });
}

// Búsqueda inteligente / predictiva de libros para préstamos
async function setupIntelligentBookSearch(
  libroInput,
  estudianteInput,
  previewEl,
  dropdownEl,
) {
  if (!libroInput || !dropdownEl) return;

  let librosList = [];
  try {
    const res = await fetch("/api/biblioteca");
    const data = await res.json();
    if (data.exito && Array.isArray(data.libros)) {
      librosList = data.libros;
    }
  } catch (err) {
    console.error("Error cargando libros para búsqueda inteligente:", err);
  }

  let selectedIndex = -1;

  function renderSuggestions(query) {
    const q = (query || "").trim().toLowerCase();
    let filtered = librosList;

    if (q) {
      filtered = librosList.filter(
        (l) =>
          l.codigo.toLowerCase().includes(q) ||
          l.titulo.toLowerCase().includes(q) ||
          (l.editorial && l.editorial.toLowerCase().includes(q)) ||
          (l.seccion && l.seccion.toLowerCase().includes(q)),
      );
    }

    if (filtered.length === 0) {
      dropdownEl.innerHTML = `
        <div style="padding: 12px; text-align: center; color: #64748b; font-size: 0.85rem;">
          🔍 No se encontraron libros coincidentes con "<b>${q}</b>"
        </div>
      `;
      dropdownEl.style.display = "block";
      selectedIndex = -1;
      return;
    }

    selectedIndex = -1;
    let html = "";
    // Limitar a máximo 10 sugerencias para rendimiento y legibilidad
    filtered.slice(0, 10).forEach((libro, idx) => {
      const isDisp = libro.estado === "disponible";
      const badgeBg = isDisp ? "#d1fae5" : "#fef3c7";
      const badgeColor = isDisp ? "#047857" : "#b45309";
      const badgeText = isDisp ? "DISPONIBLE" : "PRESTADO";

      html += `
        <div class="libro-search-item ${isDisp ? "" : "prestado-item"}" data-index="${idx}" data-codigo="${libro.codigo}">
          <div style="flex:1; min-width:0;">
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-weight:700; color:#1e293b; font-size:0.9rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${libro.titulo}</span>
            </div>
            <div style="display:flex; align-items:center; gap:8px; margin-top:2px; flex-wrap:wrap;">
              <span style="font-size:0.76rem; background:#f1f5f9; color:#475569; padding:1px 6px; border-radius:4px; font-weight:600;">${libro.seccion}</span>
              ${
                libro.editorial
                  ? `<span style="font-size:0.75rem; color:#64748b;"><i class="bi bi-building"></i> ${libro.editorial}</span>`
                  : ""
              }
            </div>
          </div>
          <div style="display:flex; flex-direction:column; align-items:flex-end; gap:3px; flex-shrink:0;">
            <span style="font-size:0.8rem; font-weight:800; color:var(--red); letter-spacing:0.5px;">${libro.codigo}</span>
            <span style="font-size:0.68rem; font-weight:700; background:${badgeBg}; color:${badgeColor}; padding:2px 6px; border-radius:4px;">${badgeText}</span>
          </div>
        </div>
      `;
    });

    dropdownEl.innerHTML = html;
    dropdownEl.style.display = "block";

    // Listeners de clic en cada sugerencia
    dropdownEl.querySelectorAll(".libro-search-item").forEach((item) => {
      item.addEventListener("click", () => {
        const codigo = item.getAttribute("data-codigo");
        seleccionarLibro(codigo);
      });
    });
  }

  function seleccionarLibro(codigo) {
    const libro = librosList.find(
      (l) => l.codigo.toUpperCase() === codigo.toUpperCase(),
    );
    if (libro) {
      libroInput.value = libro.codigo;
      if (previewEl) {
        previewEl.innerHTML = `📖 <b>${libro.titulo}</b> (${libro.codigo}) - ${libro.seccion}${libro.editorial ? ` | Ed. ${libro.editorial}` : ""}`;
        previewEl.style.display = "block";
      }
    } else {
      libroInput.value = codigo;
    }
    dropdownEl.style.display = "none";
    if (estudianteInput) estudianteInput.focus();
  }

  libroInput.addEventListener("input", () => {
    renderSuggestions(libroInput.value);
  });

  libroInput.addEventListener("focus", () => {
    if (librosList.length > 0) {
      renderSuggestions(libroInput.value);
    }
  });

  libroInput.addEventListener("keydown", (e) => {
    const items = dropdownEl.querySelectorAll(".libro-search-item");

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (items.length === 0) return;
      selectedIndex = (selectedIndex + 1) % items.length;
      items.forEach((it, i) =>
        it.classList.toggle("active", i === selectedIndex),
      );
      items[selectedIndex]?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (items.length === 0) return;
      selectedIndex = (selectedIndex - 1 + items.length) % items.length;
      items.forEach((it, i) =>
        it.classList.toggle("active", i === selectedIndex),
      );
      items[selectedIndex]?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter" || e.keyCode === 13) {
      if (selectedIndex >= 0 && items[selectedIndex]) {
        e.preventDefault();
        const codigo = items[selectedIndex].getAttribute("data-codigo");
        seleccionarLibro(codigo);
      } else {
        dropdownEl.style.display = "none";
        if (estudianteInput) estudianteInput.focus();
      }
    } else if (e.key === "Escape") {
      dropdownEl.style.display = "none";
    }
  });

  // Cerrar dropdown al hacer clic fuera
  document.addEventListener("click", (e) => {
    if (!libroInput.contains(e.target) && !dropdownEl.contains(e.target)) {
      dropdownEl.style.display = "none";
    }
  });
}

// =========================================================
const publicShelfSortMap = {};

function ordenarLibrosPublico(libros, sortKey = "titulo_asc") {
  const lista = [...libros];
  switch (sortKey) {
    case "titulo_asc":
      return lista.sort((a, b) =>
        (a.titulo || "").localeCompare(b.titulo || "", "es", {
          sensitivity: "base",
        }),
      );
    case "titulo_desc":
      return lista.sort((a, b) =>
        (b.titulo || "").localeCompare(a.titulo || "", "es", {
          sensitivity: "base",
        }),
      );
    case "codigo_asc":
      return lista.sort((a, b) =>
        (a.codigo || "").localeCompare(b.codigo || "", undefined, {
          numeric: true,
        }),
      );
    case "codigo_desc":
      return lista.sort((a, b) =>
        (b.codigo || "").localeCompare(a.codigo || "", undefined, {
          numeric: true,
        }),
      );
    case "disponible":
      return lista.sort((a, b) => {
        if (a.estado === "disponible" && b.estado !== "disponible") return -1;
        if (a.estado !== "disponible" && b.estado === "disponible") return 1;
        return (a.titulo || "").localeCompare(b.titulo || "");
      });
    default:
      return lista;
  }
}

// =========================================================
// RENDERIZADO DEL ESTANTE DE LIBROS PÚBLICO
// =========================================================
async function cargarEstantePublico() {
  const container = document.getElementById("public-bookshelf-container");
  if (!container) return;

  try {
    const session = await window.ingematSession;
    if (!session?.usuario) {
      container.innerHTML =
        '<p>El catálogo y los préstamos están disponibles para el personal autorizado. <a href="/admin">Iniciar sesión</a></p>';
      return;
    }
    const res = await fetch("/api/biblioteca");
    const data = await res.json();

    if (!data.exito || !data.secciones) {
      container.innerHTML = "<p><i>No se pudieron cargar los estantes.</i></p>";
      return;
    }

    const { secciones, libros } = data;
    const filterInput = document.getElementById("public-book-search");
    const searchTerm = filterInput
      ? filterInput.value.trim().toLowerCase()
      : "";

    let html = "";

    secciones.forEach((seccion) => {
      let librosSeccion = libros.filter(
        (l) =>
          String(l.seccion || "").toUpperCase() === seccion.toUpperCase() &&
          (!searchTerm ||
            (l.titulo && l.titulo.toLowerCase().includes(searchTerm)) ||
            (l.codigo && l.codigo.toLowerCase().includes(searchTerm)) ||
            (l.editorial && l.editorial.toLowerCase().includes(searchTerm))),
      );

      if (searchTerm && librosSeccion.length === 0) {
        return;
      }

      const currentSort = publicShelfSortMap[seccion] || "titulo_asc";
      librosSeccion = ordenarLibrosPublico(librosSeccion, currentSort);

      html += `
        <div class="shelf-section">
          <div class="shelf-title">
            <div style="display:flex; align-items:center; gap:8px;">
              <span><i class="bi bi-bookmark-star"></i> ESTANTE: ${seccion}</span>
              <span style="font-size:0.75rem; background:#f1f5f9; color:#475569; padding:2px 8px; border-radius:10px; font-weight:700;">${librosSeccion.length} libros</span>
            </div>
            <div class="shelf-sort-wrapper">
              <label style="font-size:0.78rem; font-weight:600; color:#64748b;"><i class="bi bi-arrow-down-up"></i> Orden:</label>
              <select class="shelf-sort-select public-shelf-sort" data-seccion="${seccion}">
                <option value="titulo_asc" ${currentSort === "titulo_asc" ? "selected" : ""}>🔤 Nombre (A - Z)</option>
                <option value="titulo_desc" ${currentSort === "titulo_desc" ? "selected" : ""}>🔤 Nombre (Z - A)</option>
                <option value="codigo_asc" ${currentSort === "codigo_asc" ? "selected" : ""}>🔢 Código (Asc)</option>
                <option value="codigo_desc" ${currentSort === "codigo_desc" ? "selected" : ""}>🔢 Código (Desc)</option>
                <option value="disponible" ${currentSort === "disponible" ? "selected" : ""}>🟢 Disponibles 1°</option>
              </select>
            </div>
          </div>
          <div class="shelf-books-grid">
      `;

      if (librosSeccion.length === 0) {
        html += `<div class="empty-shelf"><i>Sin libros en esta sección ${searchTerm ? "que coincidan" : ""}.</i></div>`;
      } else {
        librosSeccion.forEach((libro) => {
          const isDisp = libro.estado === "disponible";
          const badgeClass = isDisp ? "badge-available" : "badge-borrowed";
          const badgeText = isDisp ? "DISPONIBLE" : "PRESTADO";

          html += `
            <div class="book-card ${isDisp ? "" : "borrowed"}">
              <div class="book-spine"></div>
              <div class="book-details">
                <span class="book-code">${libro.codigo}</span>
                <h4 class="book-title">${libro.titulo}</h4>
                ${
                  libro.editorial
                    ? `<span class="book-editorial" style="font-size:0.76rem; color:#64748b; font-weight:500; display:block; margin-top:-2px;"><i class="bi bi-building"></i> ${libro.editorial}</span>`
                    : ""
                }
                <span class="book-status ${badgeClass}">${badgeText}</span>
              </div>
            </div>
          `;
        });
      }

      html += `
          </div>
        </div>
      `;
    });

    container.innerHTML = html;

    // Listeners de ordenación en estantería pública
    container.querySelectorAll(".public-shelf-sort").forEach((sel) => {
      sel.addEventListener("change", (e) => {
        const sec = e.target.getAttribute("data-seccion");
        const val = e.target.value;
        if (sec) {
          publicShelfSortMap[sec] = val;
          cargarEstantePublico();
        }
      });
    });

    if (filterInput && !filterInput.dataset.listener) {
      filterInput.dataset.listener = "true";
      filterInput.addEventListener("input", cargarEstantePublico);
    }
  } catch (err) {
    console.error("Error al cargar estante público:", err);
    container.innerHTML = `<p style="color:red;">Error al cargar estantes: ${err.message}</p>`;
  }
}

// Inicializar estante público en DOMContentLoaded
document.addEventListener("DOMContentLoaded", () => {
  cargarEstantePublico();
});
