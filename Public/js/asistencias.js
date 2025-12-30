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
