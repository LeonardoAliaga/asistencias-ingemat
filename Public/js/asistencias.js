document
  .getElementById("btn-asistencias")
  .addEventListener("click", function (e) {
    e.preventDefault();
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

    // --- NUEVO: Obtener referencias a los elementos ---
    const codigoInput = document.getElementById("codigo");
    const registrarBtn = document.getElementById("registrar-btn");
    const resultadoDiv = document.getElementById("resultado");

    // --- AÑADIDO: Forzar mayúsculas en el input de registro ---
    codigoInput.style.textTransform = "uppercase";
    // --- FIN AÑADIDO ---

    // --- NUEVO: Función para manejar el registro ---
    const registrarAsistencia = async () => {
      // --- INICIO CORRECCIÓN (ERROR 1) ---
      const codigo = codigoInput.value.trim().toUpperCase(); // <-- Añadir .toUpperCase()
      // --- FIN CORRECCIÓN ---

      // Limpiar mensaje anterior mientras se procesa
      resultadoDiv.innerHTML = "<i>Procesando...</i>";

      if (!codigo) {
        resultadoDiv.innerHTML = "❌ Nada que registrar";
        codigoInput.focus(); // Re-enfocar para el siguiente escaneo
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
            else if (data.estado === "tolerancia")
              estadoTexto = "🟠 Tolerancia";
            else if (data.estado === "tarde") estadoTexto = "🔴 Tarde";
            // --- MODIFICADO: Texto para tardanza justificada ---
            else if (data.estado === "justificada")
              estadoTexto = "🟠 Tard. Justif."; // Color Naranja

            resultadoDiv.innerHTML = `
            <span><b>Ciclo:</b> ${data.ciclo} | <b>Turno:</b> ${
              data.turno
            }</span>
            <span>📚 <b>${data.nombre}</b> registrado</span>
            <span>🕓 ${data.hora} | ${estadoTexto}</span>
            ${
              data.mensajeAdicional
                ? `<span style="font-size: smaller; color: grey;">(${data.mensajeAdicional})</span>`
                : ""
            }
          `;
          } else {
            // Docente
            resultadoDiv.innerHTML = `
            <span><b>Docente</b></span>
            <span>✅ <b>${data.nombre}</b> registrado</span>
            <span>🕓 ${data.hora}</span>
             ${
               data.mensajeAdicional
                 ? `<span style="font-size: smaller; color: grey;">(${data.mensajeAdicional})</span>`
                 : ""
             }
          `;
          }
        } else {
          resultadoDiv.innerHTML = `❌ ${data.mensaje}`;
        }
      } catch (error) {
        console.error("Error en fetch:", error);
        resultadoDiv.innerHTML = `❌ Error de conexión al registrar. Intenta de nuevo.`;
      } finally {
        codigoInput.value = ""; // Limpiar el input después de procesar
        codigoInput.focus(); // Re-enfocar para el siguiente escaneo
      }
    };

    // --- MODIFICADO: Asignar la función al botón ---
    registrarBtn.onclick = registrarAsistencia;

    // --- NUEVO: Escuchar por la tecla Enter en el input ---
    codigoInput.addEventListener("keydown", function (event) {
      // Verificar si la tecla presionada es Enter
      if (event.key === "Enter" || event.keyCode === 13) {
        event.preventDefault(); // Prevenir cualquier comportamiento por defecto (como submit de formulario)
        registrarAsistencia(); // Llamar a la función de registro
      }
    });

    // --- NUEVO: Enfocar el campo de código automáticamente ---
    codigoInput.focus();
  });