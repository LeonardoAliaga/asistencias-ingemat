import { showWhatsAppToast } from "./whatsapp-status.js";
function requestId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // getRandomValues is available on HTTP LAN installations too.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
const escape = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
async function api(url, options) {
  const r = await fetch(url, options),
    data = await r.json();
  if (!r.ok) throw new Error(data.mensaje || "No se pudo preparar el envío.");
  return data;
}
async function dialog({ title, description, contacts, target, preview, send }) {
  document.getElementById("report-whatsapp-dialog")?.close();
  const el = document.createElement("dialog");
  el.id = "report-whatsapp-dialog";
  el.className = "v2-dialog report-whatsapp-dialog";
  el.setAttribute("aria-labelledby", "report-whatsapp-title");
  el.innerHTML = `<div class="v2-card-title"><h3 id="report-whatsapp-title">${escape(title)}</h3><button type="button" class="v2-button secondary" data-close>Cerrar</button></div><form id="report-whatsapp-form" class="stack"><p>${escape(description)}</p>${contacts ? `<label>Apoderado autorizado<select name="reportContact" required ${contacts.length ? "" : "disabled"}><option value="">Selecciona un apoderado</option>${contacts.map((c) => `<option value="${escape(c.id)}">${escape(c.name)} · ${escape(c.phone)}</option>`).join("")}</select></label>${contacts.length ? "" : '<p class="v2-help">No hay apoderados autorizados. Registra el contacto y su autorización desde Editar usuario.</p>'}` : `<p class="v2-notice">Grupo del ciclo: <strong>${escape(target.subject)}</strong></p>`}<label>Enviar como<select name="reportFormat"><option value="png">Imagen PNG</option><option value="pdf">Documento PDF</option></select></label>${preview ? '<img class="report-whatsapp-preview" alt="Vista previa del reporte que se enviará" />' : ""}<p class="v2-help">Se enviará únicamente al destinatario indicado. Si WhatsApp está desconectado, el reporte esperará en la cola. Puedes revisar la entrega en Comunicación.</p><p role="alert" class="field-error" data-error hidden></p><button class="v2-button" type="submit" ${contacts && !contacts.length ? "disabled" : ""}>Poner reporte en cola</button></form>`;
  document.body.append(el);
  let previewURL;
  if (preview) {
    previewURL = URL.createObjectURL(preview);
    el.querySelector("img").src = previewURL;
  }
  el.addEventListener(
    "close",
    () => {
      if (previewURL) URL.revokeObjectURL(previewURL);
      el.remove();
    },
    { once: true },
  );
  el.querySelector("[data-close]").onclick = () => el.close();
  const form = el.querySelector("form"),
    attemptId = requestId();
  if (contacts?.length === 1)
    form.elements.reportContact.value = contacts[0].id;
  form.onsubmit = async (event) => {
    event.preventDefault();
    const button = form.querySelector("button[type=submit]"),
      error = el.querySelector("[data-error]");
    button.disabled = true;
    error.hidden = true;
    try {
      const result = await send({
        format: form.elements.reportFormat.value,
        contactId: form.elements.reportContact?.value,
        requestId: attemptId,
      });
      el.close();
      showWhatsAppToast(
        result.duplicate
          ? "Este reporte ya estaba registrado. Revisa su estado en Comunicación."
          : "Reporte en cola de WhatsApp. Comprueba su entrega en Comunicación.",
        "success",
      );
    } catch (e) {
      error.textContent = e.message;
      error.hidden = false;
    } finally {
      button.disabled = false;
    }
  };
  el.showModal();
}
export async function openStudentReport({ report, canvas }) {
  if (!report?.estudiante) throw new Error("Selecciona primero un estudiante.");
  const code = report.estudiante.codigo,
    { contacts } = await api(
      `/api/v2/whatsapp/student-contacts?studentCode=${encodeURIComponent(code)}`,
    );
  if (canvas.height > 24000)
    throw new Error("Elige una semana para reducir el tamaño del reporte.");
  const png = await new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) =>
        b
          ? resolve(b)
          : reject(new Error("No se pudo generar la imagen del reporte.")),
      "image/png",
    ),
  );
  const period = report.selectedSemanaLabel || "Todas las semanas registradas";
  return dialog({
    title: "Enviar reporte del alumno",
    description: `${report.estudiante.nombre} (${code}) · ${period}`,
    contacts,
    preview: png,
    send: ({ format, contactId, requestId }) => {
      const body = new FormData();
      body.append("report", png, "reporte.png");
      body.append("studentCode", code);
      body.append("contactId", contactId);
      body.append("format", format);
      body.append("period", period);
      body.append("requestId", requestId);
      body.append("breaks", JSON.stringify(canvas.reportPageBreaks || []));
      body.append("week", report.selectedSemana || "TODAS");
      return api("/api/v2/whatsapp/student-report", { method: "POST", body });
    },
  });
}
export async function openDailyReport({ date, cycle, shift, target }) {
  if (!target) throw new Error("Configura el grupo del ciclo en Comunicación.");
  return dialog({
    title: "Enviar reporte de asistencia",
    description: `${cycle} · ${date} · ${shift || "todos los turnos"}`,
    target,
    send: ({ format, requestId }) =>
      api("/api/v2/whatsapp/attendance-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          cycle,
          shift,
          groupId: target.id,
          format,
          requestId,
        }),
      }),
  });
}
