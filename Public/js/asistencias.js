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
        <input type="text" id="codigo" placeholder="Introduce el codigo" style="padding:10px; font-size:18px;"/>
        <button id="registrar-btn" class="btn-red">Registrar</button>
      </div>
    `;

    document.getElementById("registrar-btn").onclick = async function () {
      const codigo = document.getElementById("codigo").value.trim();

      const res = await fetch("/api/registrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo }),
      });

      const data = await res.json();
      const resultado = document.getElementById("resultado");

      if (!codigo) return (resultado.innerHTML = "❌ Nada que registrar");
      if (data.exito) {
        let estadoTexto = "";
        if (data.rol === "estudiante") {
          if (data.estado === "puntual") estadoTexto = "🟢 Puntual";
          else if (data.estado === "tolerancia") estadoTexto = "🟠 Tolerancia";
          else if (data.estado === "tarde") estadoTexto = "🔴 Tarde";
          resultado.innerHTML = `
      <span><b>Ciclo:</b> ${data.ciclo} | <b>Turno:</b> ${data.turno}</span>
      <span>📚 <b>${data.nombre}</b> registrado</span>
      <span>🕓 ${data.hora} | ${estadoTexto}</span>
    `;
        } else {
          resultado.innerHTML = `
      <span><b>Docente</b></span>
      <span>✅ <b>${data.nombre}</b> registrado</span>
      <span>🕓 ${data.hora}</span>
    `;
        }
      } else {
        resultado.innerHTML = `❌ ${data.mensaje}`;
      }
      document.getElementById("codigo").value = "";
    };
  });
