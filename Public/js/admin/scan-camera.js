const MAX_FILES = 10,
  MAX_BYTES = 20 * 1024 * 1024,
  MAX_EDGE = 4096;
function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 15) | 64;
  b[8] = (b[8] & 63) | 128;
  const h = [...b].map((v) => v.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
function jpeg(canvas) {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) =>
        b
          ? resolve(b)
          : reject(
              new Error("No se pudo generar la foto. Inténtalo de nuevo."),
            ),
      "image/jpeg",
      0.95,
    ),
  );
}
// Advisory checks only: these cannot certify that bubbles/QR/markers are readable.
export function photoWarnings(data, width, height) {
  const gray = new Float32Array(width * height);
  let sum = 0,
    squares = 0,
    lap = 0,
    lapSquares = 0,
    n = 0;
  for (let i = 0; i < gray.length; i++) {
    const j = i * 4,
      v = data[j] * 0.299 + data[j + 1] * 0.587 + data[j + 2] * 0.114;
    gray[i] = v;
    sum += v;
    squares += v * v;
  }
  const mean = sum / gray.length,
    contrast = Math.sqrt(Math.max(0, squares / gray.length - mean * mean));
  for (let y = 1; y < height - 1; y++)
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x,
        v =
          4 * gray[i] -
          gray[i - 1] -
          gray[i + 1] -
          gray[i - width] -
          gray[i + width];
      lap += v;
      lapSquares += v * v;
      n++;
    }
  const sharpness = n ? lapSquares / n - (lap / n) ** 2 : 0;
  const warnings = [];
  if (mean < 65) warnings.push("Poca luz: ilumina la hoja de forma uniforme.");
  if (contrast < 18)
    warnings.push("Poco contraste: comprueba que se vean las marcas y el QR.");
  if (sharpness < 45)
    warnings.push(
      "Posible desenfoque: revisa la foto ampliada y repítela si no está nítida.",
    );
  return warnings;
}
async function preparePhoto(blob) {
  if (!blob?.size || blob.size > MAX_BYTES)
    throw new Error("La foto debe pesar hasta 20 MB.");
  let image, objectURL;
  try {
    if (typeof createImageBitmap === "function")
      image = await createImageBitmap(blob, { imageOrientation: "from-image" });
    else {
      objectURL = URL.createObjectURL(blob);
      image = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () =>
          reject(new Error("Formato de foto no compatible. Usa JPG o PNG."));
        img.src = objectURL;
      });
    }
    const width = image.width,
      height = image.height;
    if (
      width < 64 ||
      height < 64 ||
      Math.max(width / height, height / width) > 10 ||
      width * height > 60_000_000
    )
      throw new Error(
        "La imagen tiene dimensiones excesivas o no es válida. Usa una foto de hasta 60 megapíxeles.",
      );
    const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    const sample = document.createElement("canvas");
    const sampleScale = Math.min(
      1,
      480 / Math.max(canvas.width, canvas.height),
    );
    sample.width = Math.max(3, Math.round(canvas.width * sampleScale));
    sample.height = Math.max(3, Math.round(canvas.height * sampleScale));
    const context = sample.getContext("2d", { willReadFrequently: true });
    context.drawImage(canvas, 0, 0, sample.width, sample.height);
    const warnings = photoWarnings(
      context.getImageData(0, 0, sample.width, sample.height).data,
      sample.width,
      sample.height,
    );
    if (Math.min(width, height) < 700 || Math.max(width, height) < 1200)
      warnings.unshift(
        "Resolución baja: acerca la hoja o utiliza la cámara del dispositivo.",
      );
    const encoded = await jpeg(canvas);
    if (encoded.size > MAX_BYTES)
      throw new Error("La foto supera 20 MB. Reduce su resolución.");
    const hash = crypto.subtle
      ? [
          ...new Uint8Array(
            await crypto.subtle.digest("SHA-256", await encoded.arrayBuffer()),
          ),
        ]
          .map((v) => v.toString(16).padStart(2, "0"))
          .join("")
      : null;
    return {
      blob: encoded,
      width: canvas.width,
      height: canvas.height,
      warnings,
      hash,
    };
  } catch (error) {
    if (error.name === "InvalidStateError" || error.name === "EncodingError")
      throw new Error("No se pudo abrir la imagen. Usa una foto JPG o PNG.");
    throw error;
  } finally {
    image?.close?.();
    if (objectURL) URL.revokeObjectURL(objectURL);
  }
}
export function mountScanCamera({ api, escape, onUploaded }) {
  const $ = (id) => document.getElementById(id),
    root = $("v2-camera"),
    video = $("camera-video"),
    select = $("v2-import-exam");
  let stream = null,
    starting = false,
    capturing = false,
    uploading = false,
    session = 0,
    photoOperation = 0;
  let photos = [],
    examId = "",
    examLabel = "",
    requestId = "",
    attempted = false,
    torch = false;
  const status = (text, warning = false) => {
    $("camera-status").textContent = text;
    $("camera-status").classList.toggle("field-error", warning);
  };
  function controls() {
    const locked = capturing || uploading || attempted;
    select.disabled = photos.length > 0 || uploading || capturing;
    $("camera-capture").disabled =
      !stream || locked || photos.length >= MAX_FILES;
    $("camera-start").disabled = starting || locked;
    $("camera-start").hidden = !!stream || starting;
    $("camera-close").disabled = !stream && !starting && !capturing;
    $("camera-native").disabled = locked || photos.length >= MAX_FILES;
    $("camera-send").disabled = !photos.length || uploading || capturing;
    $("camera-send").textContent = uploading
      ? "Enviando…"
      : attempted
        ? "Reintentar el mismo envío"
        : `Procesar capturas${photos.length ? ` (${photos.length})` : ""}`;
    $("camera-clear").disabled = !photos.length || locked;
    $("camera-device").disabled = locked || starting;
    $("camera-torch").disabled = !stream || locked;
    $("camera-live").hidden = !stream;
    root.setAttribute("aria-busy", String(starting || capturing || uploading));
    root
      .querySelectorAll("[data-camera-remove]")
      .forEach((b) => (b.disabled = locked));
  }
  function renderPhotos() {
    $("camera-queue").innerHTML = photos.length
      ? `<p class="v2-help">${photos.length} de ${MAX_FILES} capturas · ${escape(examLabel)}</p><ol class="camera-photos">${photos.map((p, i) => `<li><a href="${p.url}" target="_blank" rel="noopener"><img src="${p.url}" alt="Captura ${i + 1}; abrir para revisar" width="140" height="100"></a><div><strong>Captura ${i + 1}</strong><p class="v2-help">${p.width} × ${p.height} px · ${(p.blob.size / 1024 / 1024).toFixed(1)} MB</p><p class="${p.warnings.length ? "field-error" : "v2-help"}">${escape(p.warnings.join(" ") || "Comprueba que el QR, los cuatro marcadores y las respuestas se vean completos y nítidos.")}</p><a href="${p.url}" download="captura-${i + 1}.jpg">Guardar foto</a> <button type="button" class="v2-link" data-camera-remove="${i}">Quitar captura ${i + 1}</button></div></li>`).join("")}</ol>`
      : '<p class="v2-help">Todavía no hay capturas. Puedes tomar hasta 10 fotos y procesarlas juntas.</p>';
    root.querySelectorAll("[data-camera-remove]").forEach(
      (b) =>
        (b.onclick = () => {
          if (capturing || uploading || attempted) return;
          URL.revokeObjectURL(photos[Number(b.dataset.cameraRemove)].url);
          photos.splice(Number(b.dataset.cameraRemove), 1);
          requestId = "";
          if (!photos.length) examId = examLabel = "";
          renderPhotos();
        }),
    );
    controls();
  }
  function stop(reason) {
    session++;
    photoOperation++;
    starting = capturing = false;
    if (stream) for (const track of stream.getTracks()) track.stop();
    stream = null;
    video.srcObject = null;
    torch = false;
    $("camera-torch").hidden = true;
    $("camera-torch").setAttribute("aria-pressed", "false");
    controls();
    if (reason) status(reason);
  }
  async function start(deviceId) {
    if (starting || capturing || uploading || attempted) return;
    root.hidden = false;
    if (!select.value) {
      status("Selecciona un examen listo antes de encender la cámara.", true);
      return;
    }
    stop();
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      status(
        "La cámara en directo necesita HTTPS. Usa la cámara del dispositivo o carga una foto JPG/PNG.",
        true,
      );
      return;
    }
    const generation = session;
    starting = true;
    status(
      "Solicitando acceso a la cámara. Puedes cancelar con Apagar cámara.",
    );
    controls();
    let candidate;
    try {
      const camera = deviceId
        ? { deviceId: { exact: deviceId } }
        : { facingMode: { ideal: "environment" } };
      try {
        candidate = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { ...camera, width: { ideal: 2560 }, height: { ideal: 1920 } },
        });
      } catch (error) {
        if (error.name !== "OverconstrainedError") throw error;
        candidate = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: camera,
        });
      }
      if (
        generation !== session ||
        document.hidden ||
        root.closest("[data-v2-panel]").hidden ||
        $("vista-v2").hidden
      ) {
        candidate.getTracks().forEach((t) => t.stop());
        return;
      }
      stream = candidate;
      video.srcObject = stream;
      $("camera-live").hidden = false;
      await video.play();
      if (generation !== session) return;
      const track = stream.getVideoTracks()[0];
      track.addEventListener(
        "ended",
        () => {
          if (generation === session)
            stop("La cámara se desconectó. Puedes volver a encenderla.");
        },
        { once: true },
      );
      let caps = {};
      try {
        caps = track.getCapabilities?.() || {};
      } catch {}
      if (caps.focusMode?.includes("continuous"))
        await track
          .applyConstraints({ advanced: [{ focusMode: "continuous" }] })
          .catch(() => {});
      $("camera-torch").hidden = !caps.torch;
      const devices = await navigator.mediaDevices
        .enumerateDevices()
        .catch(() => []);
      if (generation !== session) return;
      $("camera-device").innerHTML = devices
        .filter((d) => d.kind === "videoinput")
        .map(
          (d, i) =>
            `<option value="${escape(d.deviceId)}">${escape(d.label || `Cámara ${i + 1}`)}</option>`,
        )
        .join("");
      $("camera-device").value = track.getSettings().deviceId || "";
      status(
        `Cámara lista · ${video.videoWidth} × ${video.videoHeight} px. Mantén la hoja quieta antes de capturar.`,
      );
    } catch (error) {
      candidate?.getTracks().forEach((t) => t.stop());
      if (generation !== session) return;
      stop();
      const messages = {
        NotAllowedError:
          "No se concedió acceso a la cámara. Habilita el permiso en tu navegador o usa la cámara del dispositivo.",
        NotFoundError:
          "No se encontró una cámara. Conecta una o carga imágenes.",
        NotReadableError:
          "La cámara está ocupada o no se puede abrir. Cierra otras aplicaciones que la estén usando.",
      };
      status(
        messages[error.name] ||
          "No se pudo abrir la cámara. Prueba otra cámara o utiliza la cámara del dispositivo.",
        true,
      );
    } finally {
      if (generation === session) starting = false;
      controls();
    }
  }
  async function frameBlob() {
    const track = stream?.getVideoTracks()[0];
    if (!track || video.readyState < 2 || !video.videoWidth)
      throw new Error(
        "Espera a que aparezca la imagen de la cámara antes de capturar.",
      );
    if (typeof ImageCapture === "function") {
      try {
        const camera = new ImageCapture(track),
          caps = await camera.getPhotoCapabilities?.();
        const settings = {};
        if (caps?.imageWidth?.max && caps?.imageHeight?.max) {
          const scale = Math.min(
            1,
            MAX_EDGE / Math.max(caps.imageWidth.max, caps.imageHeight.max),
          );
          settings.imageWidth = Math.max(
            caps.imageWidth.min,
            Math.round(caps.imageWidth.max * scale),
          );
          settings.imageHeight = Math.max(
            caps.imageHeight.min,
            Math.round(caps.imageHeight.max * scale),
          );
        }
        return await camera.takePhoto(settings);
      } catch {
        /* Firefox/Safari and devices without still-photo support use the video frame. */
      }
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    return jpeg(canvas);
  }
  async function capture(nativeBlob) {
    if (capturing || uploading || attempted || photos.length >= MAX_FILES)
      return;
    if (!select.value) {
      status("Selecciona un examen listo antes de capturar.", true);
      return;
    }
    const selectedId = examId || select.value,
      selectedLabel = examLabel || select.selectedOptions[0].textContent;
    const operation = ++photoOperation;
    capturing = true;
    controls();
    status("Preparando la foto… Mantén esta pestaña abierta.");
    try {
      const photo = await preparePhoto(nativeBlob || (await frameBlob()));
      if (operation !== photoOperation) return;
      if (photo.hash && photos.some((p) => p.hash === photo.hash)) {
        status(
          "Esa misma imagen ya está en la bandeja. Cambia de cartilla antes de capturar otra.",
          true,
        );
        return;
      }
      examId = selectedId;
      examLabel = selectedLabel;
      requestId = "";
      photos.push({ ...photo, url: URL.createObjectURL(photo.blob) });
      renderPhotos();
      status(
        `Captura ${photos.length} añadida.${photo.warnings.length ? " Hay avisos de calidad: revisa la foto antes de enviarla." : " Revisa la miniatura y continúa con la siguiente hoja."}`,
        !!photo.warnings.length,
      );
    } catch (error) {
      if (operation === photoOperation) status(error.message, true);
    } finally {
      if (operation === photoOperation) capturing = false;
      controls();
    }
  }
  async function send() {
    if (!photos.length || uploading || capturing) return;
    uploading = true;
    attempted = true;
    requestId ||= uuid();
    controls();
    status("Enviando capturas al lector OMR…");
    const data = new FormData();
    data.append("requestId", requestId);
    photos.forEach((p, i) =>
      data.append("files", p.blob, `captura-${i + 1}.jpg`),
    );
    const timeout = new AbortController(),
      timer = setTimeout(() => timeout.abort(), 60000);
    let accepted;
    try {
      accepted = await api(`/api/v2/exams/${encodeURIComponent(examId)}/scan`, {
        method: "POST",
        body: data,
        signal: timeout.signal,
      });
    } catch (error) {
      if (
        error.status >= 400 &&
        error.status < 500 &&
        ![408, 429].includes(error.status)
      )
        attempted = false;
      status(
        `No se confirmó el envío: ${error.message} ${attempted ? "Reintenta el mismo envío; su identificador evita duplicar el lote. Puedes guardar las fotos mientras recuperas la conexión." : "Las fotos siguen en la bandeja. Corrige el problema y vuelve a intentar."}`,
        true,
      );
    } finally {
      clearTimeout(timer);
      uploading = false;
      controls();
    }
    if (!accepted) return;
    photos.forEach((p) => URL.revokeObjectURL(p.url));
    photos = [];
    examId = examLabel = requestId = "";
    attempted = false;
    renderPhotos();
    status(
      "Lote recibido y en cola. Puedes capturar el siguiente grupo. Revisa y confirma el lote para guardar las notas.",
    );
    try {
      await onUploaded(accepted);
    } catch {
      status(
        "El lote fue recibido, pero no se actualizó el listado. Pulsa Actualizar lotes; no vuelvas a enviar esas fotos.",
        true,
      );
    }
  }
  $("v2-camera-open").onclick = () => {
    root.hidden = false;
    root.scrollIntoView({ block: "start", behavior: "smooth" });
    start();
  };
  $("camera-start").onclick = () => start();
  $("camera-close").onclick = () =>
    stop("Cámara apagada. Las fotos pendientes se conservan en esta pestaña.");
  $("camera-device").onchange = () => start($("camera-device").value);
  $("camera-capture").onclick = () => capture();
  $("camera-native").onchange = async (event) => {
    const file = event.target.files[0];
    event.target.value = "";
    if (file) await capture(file);
  };
  $("camera-send").onclick = send;
  $("camera-clear").onclick = () => {
    if (capturing || uploading || attempted) return;
    photos.forEach((p) => URL.revokeObjectURL(p.url));
    photos = [];
    examId = examLabel = requestId = "";
    renderPhotos();
    status("Bandeja vacía. Puedes comenzar otro grupo.");
  };
  $("camera-torch").onclick = async () => {
    const track = stream?.getVideoTracks()[0];
    if (!track || capturing || uploading) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch }] });
      torch = !torch;
      $("camera-torch").setAttribute("aria-pressed", String(torch));
    } catch {
      status(
        "Este dispositivo no permite cambiar la linterna. Usa iluminación externa.",
        true,
      );
    }
  };
  const pause = () =>
    stop(
      "Cámara pausada al salir de esta vista. Las fotos pendientes se conservan.",
    );
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && (stream || starting || capturing)) pause();
  });
  window.addEventListener("pagehide", () => stop());
  window.addEventListener("beforeunload", (event) => {
    if (photos.length || uploading) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  const observer = new MutationObserver(() => {
    if (
      (root.closest("[data-v2-panel]").hidden || $("vista-v2").hidden) &&
      (stream || starting || capturing)
    )
      pause();
  });
  observer.observe(root.closest("[data-v2-panel]"), {
    attributes: true,
    attributeFilter: ["hidden"],
  });
  observer.observe($("vista-v2"), {
    attributes: true,
    attributeFilter: ["hidden"],
  });
  renderPhotos();
  return {
    syncExam: () => {
      if (photos.length) select.value = examId;
      controls();
    },
  };
}
