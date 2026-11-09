(() => {
  const container = document.createElement("div");
  container.id = "kiosk-status";
  container.style.cssText =
    "position:fixed;right:16px;bottom:16px;z-index:1001;max-width:calc(100% - 32px);display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding:10px;border:1px solid #cad5e2;border-radius:10px;background:#edf4fc;color:#0a2240;font:14px system-ui,sans-serif;box-shadow:0 5px 20px #0002";
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Vincular punto de asistencia";
  button.style.cssText =
    "padding:9px 15px;border:1px solid #b9cadf;border-radius:6px;background:white;color:#0a2240;cursor:pointer";
  const status = document.createElement("span");
  status.setAttribute("role", "status");
  container.append(button, status);
  document.body.prepend(container);
  const dialog = document.createElement("dialog");
  dialog.style.cssText =
    "padding:25px;border:1px solid #cad5e2;border-radius:12px;margin:auto;max-width:480px;width:90%";
  dialog.innerHTML =
    '<form id="kiosk-pair-form"><h2 style="font-size:21px">Activar recepción</h2><p>Un administrador debe generar el código en Cuentas y respaldo. Esta vinculación permite registrar ingresos en este navegador.</p><label for="kiosk-pair-token">Código de vinculación</label><input id="kiosk-pair-token" type="password" autocomplete="off" required style="display:block;padding:10px;margin:12px 0;width:100%"><p id="kiosk-pair-error" role="status"></p><button type="submit" style="padding:10px">Vincular</button><button type="button" id="kiosk-pair-close" style="padding:10px">Cerrar</button></form>';
  document.body.append(dialog);
  button.onclick = () => dialog.showModal();
  document.getElementById("kiosk-pair-close").onclick = () => dialog.close();
  window.ingematSession?.then(
    (s) =>
      (status.textContent = s.kiosk
        ? "Recepción vinculada"
        : s.usuario
          ? "Sesión de operador activa"
          : "Punto sin vincular"),
  );
  document.getElementById("kiosk-pair-form").onsubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch("/api/kiosk/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: document.getElementById("kiosk-pair-token").value,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.mensaje);
      document.getElementById("kiosk-pair-token").value = "";
      status.textContent = "Recepción vinculada";
      dialog.close();
    } catch (error) {
      document.getElementById("kiosk-pair-error").textContent = error.message;
    }
  };
})();
