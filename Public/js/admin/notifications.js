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
  const groupsUI = import("./whatsapp-groups.js")
    .then((m) => m.mountWhatsAppGroups({ api, json }))
    .catch(() => null);
  const setText = (id, value) => {
    const el = $(id);
    if (el.textContent !== value) el.textContent = value;
  };
  async function renderHealth(health) {
    const warning = $("whatsapp-service-warning");
    // Connection notices are shown by the temporary corner toast. Details
    // remain in Comunicación without adding a persistent banner to every view.
    warning.hidden = true;
    setText(
      "whatsapp-service-warning",
      health.needsPackageReview ? health.note : "",
    );
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
      warning.hidden = true;
      setText(
        "whatsapp-service-warning",
        "No se pudo consultar WhatsApp. Revisa el paquete Baileys y la conexión con el servidor.",
      );
      setText("v2-baileys-status", warning.textContent);
    } finally {
      refreshing = false;
    }
  }
  function updateCountdowns() {
    for (const item of $("v2-outbox").querySelectorAll(".v2-batch-countdown")) {
      const due = Number(item.dataset.dueMs);
      if (!Number.isFinite(due) || due < 0) {
        item.textContent = "Pendiente";
        continue;
      }
      if (due === 0) {
        item.textContent = "0 s · esperando procesamiento";
        continue;
      }
      const seconds = Math.max(0, Math.ceil((due - Date.now()) / 1000));
      item.textContent = seconds > 0
        ? `En ${seconds} s`
        : "0 s · esperando procesamiento";
    }
  }
  const countdownTimer = setInterval(() => {
    if (!document.hidden) updateCountdowns();
  }, 1000);
  window.addEventListener("pagehide", () => clearInterval(countdownTimer), { once: true });
  async function load() {
    const data = await api("/api/v2/notifications");
    form.elements.enabled.checked = data.config.enabled;
    await renderHealth(data.status);
    try {
      await (await groupsUI)?.load();
    } catch (error) {
      $("wa-group-message").textContent = error.message;
    }
    $("v2-outbox").innerHTML = table(
      [
        "Fecha",
        "Destinatario",
        "Aviso / proveedor",
        "Estado",
        "Envío en (segundos)",
        "Detalle",
        "Acción",
      ],
      data.outbox.map((r) => [
        esc(stamp(r.created_at)),
        esc(r.recipient),
        `${esc({ attendance: "Asistencia", results: "Resultado", student_report: "Reporte del alumno", attendance_report: "Reporte del ciclo", exam_group_summary: "Ranking por área al grupo" }[r.kind] || r.kind)}${r.bulk_batch_id && r.student_code ? ` · ${esc(r.student_code)}`
            : r.ranking_area ? ` · ${esc(r.ranking_area)} (imagen ${Number(r.ranking_page) || 1}/${Number(r.ranking_pages) || 1})` : ""}<br>${r.provider === "baileys" ? "Baileys" : "Histórico anterior"}`,
        badge(r.status),
        r.bulk_batch_id
          ? ["pending", "retry"].includes(r.status)
            ? `<span class="v2-batch-countdown" role="timer" aria-live="off" data-due-ms="${Math.max(0,Number(r.next_attempt_at) || 0)}">Calculando…</span>`
            : esc({ sending: "Enviando", accepted: "Aceptado", sent: "Enviado", delivered: "Entregado", read: "Leído", unknown: "Por comprobar", failed: "Fallido", cancelled: "Cancelado" }[r.status] || r.status)
          : "—",
        esc(r.error) +
          (["student_report", "attendance_report", "exam_group_summary"].includes(r.kind)
            ? `<br><a href="/api/v2/whatsapp/reports/${encodeURIComponent(r.id)}/file">Descargar archivo del envío</a>`
            : ""),
        r.provider === "baileys" && ["failed", "unknown"].includes(r.status)
          ? `<button class="v2-link" data-retry="${esc(r.id)}" data-unknown="${r.status === "unknown"}">Reintentar</button>`
          : "",
      ]),
    );
    updateCountdowns();
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
