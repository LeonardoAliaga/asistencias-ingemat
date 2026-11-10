export function mountScanner({ api, escape: esc, onUploaded, username }) {
  const $ = (id) => document.getElementById(id);
  const key = `ingemat.scanner.${username}`;
  let pending = {},
    jobs = [],
    serverBusy = false,
    requesting = false,
    refreshing = false,
    refreshQueued = false,
    displayedExam = "";
  try {
    pending = JSON.parse(sessionStorage.getItem(key) || "{}") || {};
  } catch {
    pending = {};
  }
  const save = () => {
    try {
      sessionStorage.setItem(key, JSON.stringify(pending));
    } catch {}
  };
  const json = (body, method = "POST") => ({
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const status = (text, error = false) => {
    $("scanner-status").textContent = text;
    $("scanner-status").classList.toggle("field-error", error);
  };
  const uuid = () => {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const s = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
  };
  const labels = {
    scanning: "Escaneando",
    ready: "Lista para procesar",
    failed: "Fallida",
    cancelled: "Cancelada",
  };
  function scanBlockReason() {
    if (requesting) return "Espera a que termine la solicitud en curso.";
    if (pending.import)
      return "Verifica el envío pendiente antes de añadir otra captura.";
    if (jobs.some((job) => job.status === "scanning"))
      return "Hay un escaneo en curso. Espera a que termine o pulsa Cancelar escaneo.";
    if (serverBusy)
      return "El escáner está ocupado por otra solicitud. El botón se habilitará cuando termine.";
    if (!pending.start && !$("v2-import-exam").value) {
      return [...$("v2-import-exam").options].some((option) => option.value)
        ? "Selecciona un examen listo en este panel para habilitar el escaneo."
        : "No hay exámenes listos. Primero crea y valida un simulacro en la sección Simulacros.";
    }
    if (!pending.start && !$("scanner-device").value)
      return "Pulsa Buscar escáneres y selecciona el equipo que vas a usar.";
    return "";
  }
  function render() {
    const locked =
      requesting ||
      !!pending.start ||
      !!pending.import ||
      jobs.some((j) => j.status === "scanning");
    $("v2-import-exam").disabled = locked;
    for (const id of [
      "scanner-driver",
      "scanner-device",
      "scanner-source",
      "scanner-size",
      "scanner-discover",
    ])
      $(id).disabled = locked;
    const blocked = scanBlockReason();
    $("scanner-start").disabled = !!blocked;
    $("scanner-start").title = blocked;
    const readiness =
      blocked ||
      (pending.start
        ? "Comprueba la captura pendiente para recuperar su estado sin repetir la orden."
        : "Listo para escanear. Coloca el papel y pulsa Escanear y añadir.");
    if ($("scanner-readiness").textContent !== readiness)
      $("scanner-readiness").textContent = readiness;
    $("scanner-start").textContent = pending.start
      ? "Verificar captura pendiente"
      : "Escanear y añadir";
    $("scanner-process").disabled =
      requesting ||
      !!pending.start ||
      jobs.some((j) => j.status === "scanning") ||
      (!pending.import && !jobs.some((j) => j.status === "ready"));
    $("scanner-process").textContent = pending.import
      ? "Verificar envío pendiente"
      : "Procesar capturas";
    $("scanner-queue").innerHTML = jobs.length
      ? `<ul class="scanner-captures">${jobs.map((j, i) => `<li><div><strong>Captura ${i + 1} · ${esc(labels[j.status] || j.status)}</strong><p>${j.source === "glass" ? "Cristal" : "Alimentador"} · ${esc(j.pageSize.toUpperCase())}${j.bytes ? ` · ${(j.bytes / 1024).toFixed(0)} KB` : ""}</p>${j.error ? `<p class="field-error">${esc(j.error)}</p>` : ""}</div><div class="v2-toolbar">${j.fileUrl ? `<a class="v2-link" href="${esc(j.fileUrl)}" target="_blank" rel="noopener">Ver PDF ${i + 1}</a>` : ""}${j.status === "scanning" ? `<button class="v2-link" type="button" data-cancel="${esc(j.id)}">Cancelar escaneo</button>` : `<button class="v2-link" type="button" data-discard="${esc(j.id)}" ${requesting || pending.import ? "disabled" : ""}>Quitar captura ${i + 1}</button>`}</div></li>`).join("")}</ul>`
      : '<p class="v2-help">Las capturas aparecerán aquí. Cambia o voltea la hoja para añadir otra cara.</p>';
  }
  async function refresh() {
    const examId = $("v2-import-exam").value;
    if (displayedExam !== examId) {
      displayedExam = examId;
      jobs = [];
      serverBusy = false;
      render();
    }
    if (refreshing) {
      refreshQueued = true;
      return;
    }
    if (!examId) {
      jobs = [];
      serverBusy = false;
      render();
      return;
    }
    refreshing = true;
    try {
      const data = await api(
        `/api/v2/scanner/jobs?examId=${encodeURIComponent(examId)}`,
      );
      if ($("v2-import-exam").value !== examId) return;
      jobs = data.jobs;
      serverBusy = data.busy;
      if (pending.start && jobs.some((j) => j.id === pending.start.requestId)) {
        delete pending.start;
        save();
      }
      render();
    } catch (error) {
      status(error.message, true);
    } finally {
      refreshing = false;
      if (refreshQueued) {
        refreshQueued = false;
        void refresh();
      }
    }
  }
  async function act(fn) {
    if (requesting) return;
    requesting = true;
    render();
    try {
      await fn();
    } catch (error) {
      status(error.message, true);
    } finally {
      requesting = false;
      render();
    }
  }
  $("scanner-discover").addEventListener("click", () =>
    act(async () => {
      const driver = $("scanner-driver").value;
      status("Buscando escáneres en la computadora del servidor…");
      const data = await api(`/api/v2/scanner/devices?driver=${driver}`);
      $("scanner-device").innerHTML =
        '<option value="">Selecciona un escáner</option>' +
        data.devices
          .map((d) => `<option value="${esc(d)}">${esc(d)}</option>`)
          .join("");
      const brother = data.devices.find((d) => /T920DW/i.test(d));
      if (brother) $("scanner-device").value = brother;
      else if (data.devices.length === 1)
        $("scanner-device").value = data.devices[0];
      status(
        data.devices.length
          ? `${data.devices.length} escáner(es) disponible(s).`
          : "No se encontraron escáneres. Comprueba el controlador Brother o prueba TWAIN.",
      );
    }),
  );
  $("scanner-driver").addEventListener("change", () => {
    $("scanner-device").innerHTML =
      '<option value="">Busca los escáneres con este controlador</option>';
    render();
  });
  $("scanner-device").addEventListener("change", render);
  $("v2-import-exam").addEventListener("change", refresh);
  $("scanner-start").addEventListener("click", () =>
    act(async () => {
      if (!pending.start)
        pending.start = {
          requestId: uuid(),
          examId: $("v2-import-exam").value,
          driver: $("scanner-driver").value,
          device: $("scanner-device").value,
          source: $("scanner-source").value,
          pageSize: $("scanner-size").value,
        };
      save();
      render();
      try {
        await api("/api/v2/scanner/jobs", json(pending.start));
        delete pending.start;
        save();
        status(
          "Escaneo solicitado. Espera a que la captura esté lista antes de cambiar o voltear el papel.",
        );
        await refresh();
      } catch (error) {
        if (error.status && error.status < 500) {
          delete pending.start;
          save();
        }
        throw new Error(
          `${error.message}${pending.start ? " Usa Verificar captura pendiente: no se repetirá una orden ya recibida." : ""}`,
        );
      }
    }),
  );
  $("scanner-process").addEventListener("click", () =>
    act(async () => {
      if (!pending.import)
        pending.import = {
          examId: $("v2-import-exam").value,
          jobIds: jobs.filter((j) => j.status === "ready").map((j) => j.id),
          requestId: uuid(),
        };
      save();
      render();
      let batch;
      try {
        batch = await api("/api/v2/scanner/import", json(pending.import));
      } catch (error) {
        if (error.status && error.status < 500) {
          delete pending.import;
          save();
        }
        throw new Error(
          `${error.message}${pending.import ? " Reintenta Verificar envío pendiente para recuperar el mismo lote." : ""}`,
        );
      }
      delete pending.import;
      save();
      status(
        "Lote recibido. Revisa las incidencias en Lotes recientes y confirma las notas cuando esté completo.",
      );
      await refresh();
      await onUploaded(batch);
    }),
  );
  $("scanner-queue").addEventListener("click", (event) => {
    const cancel = event.target.closest("[data-cancel]"),
      discard = event.target.closest("[data-discard]");
    if (!cancel && !discard) return;
    void act(async () => {
      await api(
        `/api/v2/scanner/jobs/${cancel?.dataset.cancel || discard.dataset.discard}${cancel ? "/cancel" : ""}`,
        json({}, cancel ? "POST" : "DELETE"),
      );
      await refresh();
    });
  });
  if (pending.start || pending.import) {
    $("v2-import-exam").value = (pending.start || pending.import).examId;
    status(
      "Hay una solicitud pendiente de comprobar. Usa Verificar para recuperar su estado sin repetirla.",
    );
  }
  render();
  setInterval(() => {
    if (
      !$("v2-scanner").closest("[data-v2-panel]").hidden &&
      !document.hidden &&
      !document.getElementById("vista-v2").hidden
    )
      void refresh();
  }, 1500);
  return { refresh };
}
