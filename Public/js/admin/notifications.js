// Optional UI: this module is loaded dynamically so its failure cannot block admin.
export function mountNotifications({
  api,
  escape: esc,
  json,
  table,
  badge,
  stamp,
  message,
}) {
  const $ = (id) => document.getElementById(id),
    form = $("v2-wa-config");
  let qrExpiry = 0,
    refreshing = false,
    lastHealth = null;
  const setText = (id, value) => {
    const el = $(id);
    if (el.textContent !== value) el.textContent = value;
  };
  async function renderHealth(health) {
    const warning = $("whatsapp-service-warning");
    warning.hidden =
      health.provider !== "baileys" || !health.needsPackageReview;
    setText("whatsapp-service-warning", warning.hidden ? "" : health.note);
    lastHealth = health;
    {
      setText(
        "v2-wa-status",
        `Baileys ${health.version} · ${health.connected ? "Conectado" : "Sin conexión"} · Avisos ${health.enabled ? "activados" : "desactivados"}. ${health.note}`,
      );
      setText(
        "v2-baileys-status",
        health.note + (health.code ? ` Código: ${health.code}.` : ""),
      );
      $("v2-baileys-connect").disabled =
        [
          "starting",
          "connecting",
          "reconnecting",
          "connected",
          "logged_out",
        ].includes(health.state) ||
        (health.state === "pairing" && health.qrAvailable);
      $("v2-baileys-stop").disabled = ["idle", "stopped"].includes(
        health.state,
      );
      $("v2-baileys-reset").disabled = health.state === "resetting";
      if (health.qrAvailable && qrExpiry !== health.qrExpiresAt) {
        const qr = await api("/api/v2/notifications/baileys/qr");
        if (
          typeof qr.dataUrl === "string" &&
          qr.dataUrl.startsWith("data:image/png;base64,")
        ) {
          $("v2-baileys-qr-image").src = qr.dataUrl;
          $("v2-baileys-qr").hidden = false;
          qrExpiry = qr.expiresAt;
        }
      } else if (!health.qrAvailable) {
        $("v2-baileys-qr").hidden = true;
        $("v2-baileys-qr-image").removeAttribute("src");
        qrExpiry = 0;
      }
    }
  }

  async function health() {
    if (refreshing) return;
    refreshing = true;
    try {
      await renderHealth(await api("/api/v2/notifications/health"));
    } catch {
      const warning = $("whatsapp-service-warning");
      warning.hidden = false;
      setText(
        "whatsapp-service-warning",
        "No se pudo consultar WhatsApp. Revisa el paquete Baileys y la conexión con el servidor.",
      );
    } finally {
      refreshing = false;
    }
  }
  async function load() {
    const data = await api("/api/v2/notifications");
    form.elements.enabled.checked = data.config.enabled;
    for (const key of ["attendanceMessage", "resultsMessage"])
      form.elements[key].value = data.config[key] ?? "";
    await renderHealth(data.status);
    $("v2-outbox").innerHTML = table(
      [
        "Fecha",
        "Destinatario",
        "Aviso / proveedor",
        "Estado",
        "Detalle",
        "Acción",
      ],
      data.outbox.map((r) => [
        esc(stamp(r.created_at)),
        esc(r.recipient),
        `${r.kind === "attendance" ? "Asistencia" : "Resultado"}<br>${r.provider === "baileys" ? "Baileys" : "Histórico anterior"}`,
        badge(r.status),
        esc(r.error),
        r.provider === "baileys" && ["failed", "unknown"].includes(r.status)
          ? `<button class="v2-link" data-retry="${esc(r.id)}" data-unknown="${r.status === "unknown"}">Reintentar</button>`
          : "",
      ]),
    );
    for (const button of $("v2-outbox").querySelectorAll("[data-retry]"))
      button.onclick = () =>
        act(button, async () => {
          const unknown = button.dataset.unknown === "true";
          if (
            unknown &&
            !confirm(
              "Comprueba con el destinatario que este aviso NO se entregó. ¿Confirmas que no lo recibió?",
            )
          )
            return;
          await api(
            `/api/v2/notifications/${button.dataset.retry}/retry`,
            json({ confirmNotDelivered: unknown }),
          );
          await load();
          message("Aviso programado para reintento.");
        });
  }
  async function act(button, fn) {
    button.disabled = true;
    try {
      await fn();
    } catch (error) {
      message(error.message, true);
    } finally {
      button.disabled = false;
      if (button.id.startsWith("v2-baileys") && lastHealth)
        void renderHealth(lastHealth).catch(() => {});
    }
  }
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void act(event.submitter, async () => {
      const values = Object.fromEntries(new FormData(form));
      values.enabled = form.elements.enabled.checked;
      await api("/api/v2/notifications/config", json(values, "PUT"));
      await load();
      message("Configuración de WhatsApp guardada.");
    });
  });
  $("v2-refresh-notifications").onclick = () =>
    act($("v2-refresh-notifications"), load);
  for (const action of ["connect", "stop", "reset"]) {
    const button = $("v2-baileys-" + action);
    button.onclick = () =>
      act(button, async () => {
        if (
          action === "reset" &&
          !confirm(
            "Se eliminará la sesión local de WhatsApp y se desactivarán los avisos. Necesitarás vincular de nuevo el teléfono. Las notas y asistencias se conservan. ¿Continuar?",
          )
        )
          return;
        await api(`/api/v2/notifications/baileys/${action}`, json({}));
        if (action !== "connect") form.elements.enabled.checked = false;
        await health();
      });
  }
  void health();
  const timer = setInterval(() => {
    if (!document.hidden) void health();
  }, 5000);
  window.addEventListener("pagehide", () => clearInterval(timer), {
    once: true,
  });
  return { load, health };
}
