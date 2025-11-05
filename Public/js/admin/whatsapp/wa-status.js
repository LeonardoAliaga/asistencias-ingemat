// Proyecto Beta/Public/js/admin/whatsapp/wa-status.js
import * as dom from "./wa-dom.js";
import * as state from "./wa-state.js";
import { loadGroups } from "./wa-config.js";
// --- populateGroupSelect FUE ELIMINADA DE AQUÍ ---

export function startStatusPolling() {
  if (state.statusCheckInterval) return;
  console.log("Iniciando polling de estado de WhatsApp (cada 5 seg).");
  state.setStatusInterval(setInterval(updateWhatsappStatus, 5000));
}

export function stopStatusPolling() {
  if (state.statusCheckInterval) {
    console.log("Deteniendo polling de estado de WhatsApp.");
    clearInterval(state.statusCheckInterval);
    state.setStatusInterval(null);
  }
}

export async function fetchAndRenderQR() {
  if (!dom.qrContainer || !dom.qrCanvas || !dom.qrMessage) return;

  let data;
  try {
    const response = await fetch("/whatsapp/api/qr");
    if (!response.ok) {
      throw new Error(`El servidor respondió con ${response.status}`);
    }
    data = await response.json();
    if (!data.exito) {
      throw new Error(data.mensaje || "La API de QR falló.");
    }
  } catch (error) {
    console.error("Error al BUSCAR QR:", error);
    dom.qrMessage.textContent = `Error al contactar el servidor: ${error.message}`;
    dom.qrCanvas.style.display = "none";
    startStatusPolling();
    return;
  }

  try {
    if (data.qr) {
      dom.qrMessage.textContent =
        "Se necesita iniciar sesión. Escanea el código QR con tu teléfono.";
      dom.qrCanvas.style.display = "block";

      if (typeof QRCode === "undefined") {
        throw new Error(
          "La librería QRCode no se cargó. Asegúrate de que 'qrcode.min.js' esté en 'public/js/'."
        );
      }

      QRCode.toCanvas(dom.qrCanvas, data.qr, { width: 300 }, (error) => {
        if (error) {
          console.error("Error al generar QR en canvas:", error);
          dom.qrMessage.textContent = "Error al dibujar el código QR.";
          dom.qrCanvas.style.display = "none";
        } else {
          console.log("QR renderizado en canvas.");
        }
      });
      startStatusPolling();
    } else {
      dom.qrMessage.textContent =
        "Iniciando cliente de WhatsApp... Si se requiere sesión, el QR aparecerá aquí.";
      dom.qrCanvas.style.display = "none";
      startStatusPolling();
    }
  } catch (error) {
    console.error("Error al RENDERIZAR QR:", error);
    dom.qrMessage.textContent = `Error al renderizar: ${error.message}`;
    dom.qrCanvas.style.display = "none";
    startStatusPolling();
  }
}

export async function updateWhatsappStatus() {
  if (
    !dom.statusIndicator ||
    !dom.statusMessage ||
    !dom.configContent ||
    !dom.qrContainer
  ) {
    return;
  }
  if (dom.refreshStatusBtn && !state.statusCheckInterval) {
    dom.statusIndicator.textContent = "Verificando...";
    dom.statusIndicator.className = "status-checking";
    dom.statusMessage.textContent = "";
    dom.refreshStatusBtn.disabled = true;
  }
  console.log("Verificando estado de WhatsApp...");
  try {
    const response = await fetch("/whatsapp/api/status");
    if (!response.ok) {
      throw new Error(`Error ${response.status} del servidor`);
    }
    const data = await response.json();
    if (data.exito) {
      if (data.isReady) {
        dom.statusIndicator.textContent = "Conectado";
        dom.statusIndicator.className = "status-connected";
        dom.statusMessage.textContent =
          "El cliente de WhatsApp está operativo.";
        dom.configContent.style.display = "block";
        dom.qrContainer.style.display = "none";
        stopStatusPolling();

        // --- LÓGICA CORREGIDA (de la vez anterior) ---
        console.log(
          "WhatsApp conectado, llamando a loadGroups() para refrescar."
        );
        await loadGroups();
        // --- FIN CORRECCIÓN ---
      } else {
        dom.statusIndicator.textContent = "Desconectado";
        dom.statusIndicator.className = "status-disconnected";
        dom.statusMessage.textContent = "Cliente no listo. Iniciando sesión...";
        dom.configContent.style.display = "none";
        dom.qrContainer.style.display = "block";
        state.setGroups([]);
        await fetchAndRenderQR();
      }
    } else {
      throw new Error(data.mensaje || "Respuesta API /status sin éxito");
    }
  } catch (error) {
    console.error("Error al obtener estado de WhatsApp:", error);
    dom.statusIndicator.textContent = "Error";
    dom.statusIndicator.className = "status-error";
    dom.statusMessage.textContent = `Error al verificar: ${error.message}`;
    dom.configContent.style.display = "none";
    dom.qrContainer.style.display = "block";
    dom.qrMessage.textContent = `Error al verificar estado: ${error.message}`;
    if (dom.qrCanvas) dom.qrCanvas.style.display = "none";
    state.setGroups([]);
    stopStatusPolling();
  } finally {
    if (dom.refreshStatusBtn) {
      dom.refreshStatusBtn.disabled = false;
    }
    console.log("Verificación de estado finalizada.");
  }
}
