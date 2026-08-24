// Public/js/admin/whatsapp/wa-manual.js
import { allUserOptions, generarCarnetBase64 } from "../users.js";
import { setupStudentAutocomplete } from "../common/autocomplete-utils.js";

export function initManualSend() {
  const searchInput = document.getElementById("manual-carnet-search");
  const hiddenInput = document.getElementById("manual-carnet-codigo-hidden");
  const phoneInput = document.getElementById("manual-carnet-phone");
  const btnSend = document.getElementById("btn-manual-send-carnet");
  const msgDiv = document.getElementById("msg-manual-send");

  if (!searchInput || !btnSend) return;

  // 1. Autocompletado Estandarizado de Usuarios
  setupStudentAutocomplete(
    "manual-carnet-search",
    "manual-carnet-codigo-hidden",
    "manual-carnet-results",
    null,
    () => allUserOptions,
    ({ user }) => {
      if (user && user.telefono && phoneInput && !phoneInput.value) {
        phoneInput.value = user.telefono;
      }
    }
  );

  // 2. Evento Enviar Carnet
  btnSend.onclick = async () => {
    const codigo = hiddenInput ? hiddenInput.value : "";
    const phone = phoneInput ? phoneInput.value.trim() : "";

    if (msgDiv) {
      msgDiv.className = "form-message";
      msgDiv.textContent = "";
    }

    if (!codigo) {
      alert("Selecciona un usuario de la lista.");
      return;
    }
    if (!phone || phone.length < 9) {
      alert("Ingresa un número válido (mínimo 9 dígitos).");
      return;
    }

    const usuario = allUserOptions.find((u) => u.codigo === codigo);
    if (!usuario) return;

    try {
      btnSend.disabled = true;
      btnSend.innerHTML = `<i class="bi bi-hourglass-split"></i> Generando...`;

      const base64 = await generarCarnetBase64(usuario);

      btnSend.innerHTML = `<i class="bi bi-whatsapp"></i> Enviando...`;

      const res = await fetch("/whatsapp/api/send-carnet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          number: phone.startsWith("51") ? phone : `51${phone}`,
          imageBase64: base64,
          nombre: usuario.nombre,
        }),
      });

      const data = await res.json();

      if (data.exito) {
        if (msgDiv) {
          msgDiv.style.color = "#198754";
          msgDiv.innerHTML = `✅ ${data.mensaje} <br>Enviado a: <b>${usuario.nombre}</b> (${phone})`;
        }
        searchInput.value = "";
        if (hiddenInput) hiddenInput.value = "";
        if (phoneInput) phoneInput.value = "";
      } else {
        throw new Error(data.mensaje);
      }
    } catch (err) {
      console.error(err);
      if (msgDiv) {
        msgDiv.style.color = "#dc3545";
        msgDiv.textContent = `❌ Error: ${err.message}`;
      }
    } finally {
      btnSend.disabled = false;
      btnSend.innerHTML = `<i class="bi bi-send-fill"></i> Enviar`;
    }
  };
}