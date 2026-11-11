let toast, timer;
export function showWhatsAppToast(text, type = "info") {
  toast?.remove();
  clearTimeout(timer);
  toast = document.createElement("div");
  toast.className = `whatsapp-toast ${type}`;
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  const message = document.createElement("span");
  message.textContent = text;
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "×";
  close.setAttribute("aria-label", "Cerrar aviso de WhatsApp");
  close.onclick = () => toast?.remove();
  toast.append(message, close);
  document.body.append(toast);
  timer = setTimeout(() => toast?.remove(), type === "error" ? 9000 : 5500);
}
export function mountWhatsAppStatus() {
  let lastState = "",
    failed = false;
  async function check() {
    if (document.hidden) return;
    try {
      const response = await fetch("/api/v2/whatsapp/status");
      if (!response.ok) return;
      const s = await response.json();
      const recovered = failed;
      failed = false;
      if (s.state === lastState && !recovered) return;
      lastState = s.state;
      if (s.connected)
        showWhatsAppToast(
          "WhatsApp conectado. La sesión está lista.",
          "success",
        );
      else if (["error", "logged_out"].includes(s.state))
        showWhatsAppToast(
          s.note ||
            "No se pudo conectar WhatsApp. Revisa el paquete Baileys y su versión.",
          "error",
        );
      else if (["starting", "connecting", "reconnecting"].includes(s.state))
        showWhatsAppToast("Conectando la sesión de WhatsApp…");
      else if (s.state === "pairing")
        showWhatsAppToast(
          "WhatsApp necesita vinculación. Abre Comunicación para escanear el QR.",
        );
    } catch {
      if (!failed)
        showWhatsAppToast(
          "No se pudo consultar la conexión de WhatsApp. La app sigue funcionando.",
          "error",
        );
      failed = true;
    }
  }
  void check();
  const polling = setInterval(check, 5000);
  window.addEventListener("beforeunload", () => clearInterval(polling), {
    once: true,
  });
}
