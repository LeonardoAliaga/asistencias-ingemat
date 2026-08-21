// Variable global para manejar el scanner
let html5QrCode = null; // CUIDADO: Cambié el nombre de la variable para reflejar que usamos la clase base
let isCooldown = false;

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
    } else {
      resultadoDiv.innerHTML = `<span style="color: #ff6b6b; font-weight: bold;">❌ ${data.mensaje}</span>`;
    }
  } catch (error) {
    console.error("Error en fetch:", error);
    resultadoDiv.innerHTML = `❌ Error de conexión.`;
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
        <button id="registrar-btn" class="btn-red">Registrar</button>
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

    codigoInput.focus();
  });

// =========================================================
// LÓGICA DEL BOTÓN ESCANEAR (CÁMARA TRASERA AUTO)
// =========================================================
document
  .getElementById("btn-scan")
  .addEventListener("click", async function (e) {
    e.preventDefault();

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
        onScanSuccess
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

    // Detener escáner si está activo
    if (html5QrCode) {
      try {
        await html5QrCode.stop();
        html5QrCode.clear();
      } catch (err) {}
      html5QrCode = null;
    }

    const box = document.querySelector(".box-header");
    box.innerHTML = `
      <img src="./img/Logo 1x1 nb.png" alt="Logo Ingemat" style="width:14rem;"/>
      <h2 style="margin: 10px 0; color: var(--red); font-family: var(--font-heading);">📚 Préstamo de Libros</h2>
      <div style="display:flex; flex-direction:column; align-items:center; gap:12px; width: 100%; max-width: 400px;">
        <div id="resultado-prestamo" style="margin-top:5px; font-size:0.95rem; width:100%; text-align:center;"></div>
        
        <div style="width:100%; text-align:left;">
          <label style="font-size:0.85rem; font-weight:600; color:#333;">1. Código del Libro:</label>
          <input type="text" id="codigo-libro-input" placeholder="Escanea o escribe código del libro (ej. MAT-01)" style="padding:10px 12px; font-size:0.95rem; width:100%; border-radius:6px; border:1px solid #ccc; text-transform:uppercase; margin-top:4px;" />
        </div>

        <div style="width:100%; text-align:left;">
          <label style="font-size:0.85rem; font-weight:600; color:#333;">2. Código del Estudiante:</label>
          <input type="text" id="codigo-estudiante-input" placeholder="Escanea o escribe código del carnet (ej. EST-001)" style="padding:10px 12px; font-size:0.95rem; width:100%; border-radius:6px; border:1px solid #ccc; text-transform:uppercase; margin-top:4px;" />
        </div>

        <button id="btn-submit-prestamo" class="btn-red" style="width:100%; padding:11px; font-size:1rem; font-weight:700; margin-top:6px; cursor:pointer;">
          <i class="bi bi-journal-check"></i> Registrar Préstamo
        </button>
      </div>
    `;

    const libroInput = document.getElementById("codigo-libro-input");
    const estudianteInput = document.getElementById("codigo-estudiante-input");
    const btnSubmit = document.getElementById("btn-submit-prestamo");
    const resDiv = document.getElementById("resultado-prestamo");

    libroInput.focus();

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
          body: JSON.stringify({ codigoLibro: codLibro, codigoUsuario: codEstudiante }),
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

    libroInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.keyCode === 13) {
        e.preventDefault();
        estudianteInput.focus();
      }
    });
  });
}

// =========================================================
// RENDERIZADO DEL ESTANTE DE LIBROS PÚBLICO
// =========================================================
async function cargarEstantePublico() {
  const container = document.getElementById("public-bookshelf-container");
  if (!container) return;

  try {
    const res = await fetch("/api/biblioteca");
    const data = await res.json();

    if (!data.exito || !data.secciones) {
      container.innerHTML = "<p><i>No se pudieron cargar los estantes.</i></p>";
      return;
    }

    const { secciones, libros } = data;
    const filterInput = document.getElementById("public-book-search");
    const searchTerm = filterInput ? filterInput.value.trim().toLowerCase() : "";

    let html = "";

    secciones.forEach((seccion) => {
      const librosSeccion = libros.filter(
        (l) =>
          l.seccion.toUpperCase() === seccion.toUpperCase() &&
          (!searchTerm ||
            l.titulo.toLowerCase().includes(searchTerm) ||
            l.codigo.toLowerCase().includes(searchTerm))
      );

      html += `
        <div class="shelf-section">
          <div class="shelf-title"><i class="bi bi-bookmark-star"></i> ESTANTE: ${seccion}</div>
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
