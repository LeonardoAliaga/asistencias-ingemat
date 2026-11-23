let scannerLibrary;

function loadScanner() {
  scannerLibrary ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/vendor/html5-qrcode.min.js";
    script.addEventListener("load", () => resolve(window.Html5Qrcode), {
      once: true,
    });
    script.addEventListener(
      "error",
      () => {
        script.remove();
        reject(new Error("No se pudo cargar el lector de cámara."));
      },
      { once: true },
    );
    document.head.append(script);
  }).catch((error) => {
    scannerLibrary = undefined;
    throw error;
  });
  return scannerLibrary;
}

function cameraError(error) {
  // The scanner package wraps some DOMExceptions as strings.
  const reason = String(error);
  if (
    reason.includes("NotAllowedError") ||
    reason.includes("Permission denied")
  )
    return "Permite el acceso a la cámara en el navegador o usa el código del carné.";
  if (reason.includes("NotFoundError"))
    return "No hay una cámara disponible. Puedes registrar con el código del carné.";
  return "No se pudo iniciar la cámara. Comprueba que esté disponible y vuelve a intentarlo.";
}

export function mountReceptionCamera({
  frame,
  reader,
  status,
  startButton,
  stopButton,
  onCode,
}) {
  let session;

  function showState(state, message = "") {
    const focused = document.activeElement;
    const opening = state === "starting";
    const showStop = opening || state === "active";
    frame.dataset.state = state;
    status.textContent = message;
    startButton.hidden = showStop;
    startButton.setAttribute("aria-disabled", String(state === "stopping"));
    stopButton.hidden = !showStop;
    stopButton.textContent = opening ? "Cancelar" : "Apagar cámara";
    if (focused === startButton && showStop) stopButton.focus();
    if (focused === stopButton && !showStop) startButton.focus();
  }

  async function release(attempt) {
    const video = reader.querySelector("video");
    const stream = video?.srcObject;
    if (video) {
      video.onabort = null;
      video.onerror = null;
    }
    try {
      if (attempt.opened) await attempt.scanner.stop();
      attempt.scanner?.clear();
    } catch {
      // A cancelled start may have a stream before the scanner is ready.
    } finally {
      stream?.getTracks().forEach((track) => track.stop());
      reader.replaceChildren();
      frame.append(reader);
      attempt.staging.remove();
      session = undefined;
    }
  }

  async function start() {
    if (session) return;
    if (!window.isSecureContext) {
      showState(
        "error",
        "El navegador requiere HTTPS para usar la cámara en la red. Puedes registrar con el código del carné.",
      );
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      showState(
        "error",
        "Este navegador no ofrece acceso a la cámara. Usa el código del carné.",
      );
      return;
    }
    // The scanner needs a measurable surface even if the operator changes
    // views before the browser finishes asking for camera permission.
    const staging = document.createElement("div");
    staging.className = "station-camera-staging";
    staging.style.inlineSize = `${frame.clientWidth}px`;
    staging.setAttribute("aria-hidden", "true");
    staging.append(reader);
    document.body.append(staging);
    const attempt = {
      staging,
      cancelled: false,
      opened: false,
      started: false,
      lastCode: "",
      lastSeen: 0,
    };
    session = attempt;
    showState("starting", "Abriendo cámara…");
    let failure;
    try {
      const Scanner = await loadScanner();
      if (attempt.cancelled) return;
      attempt.scanner = new Scanner(reader.id);
      await attempt.scanner.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: (width, height) => ({
            width: Math.floor(width * 0.84),
            height: Math.floor(height * 0.65),
          }),
        },
        (value) => {
          if (attempt.cancelled) return;
          const code = value.trim().toUpperCase();
          const now = performance.now();
          if (code === attempt.lastCode && now - attempt.lastSeen < 1500) {
            attempt.lastSeen = now;
            return;
          }
          if (!code || !onCode(code)) return;
          attempt.lastCode = code;
          attempt.lastSeen = now;
        },
      );
      attempt.opened = true;
      // start() can resolve while the library's first play() is pending.
      await reader.querySelector("video")?.play();
      attempt.started = true;
      if (!attempt.cancelled) {
        frame.append(reader);
        staging.remove();
        showState(
          "active",
          "Cámara activa. Retira el carné después de cada lectura.",
        );
      }
    } catch (error) {
      failure = cameraError(error);
    } finally {
      if (attempt.cancelled || failure) {
        await release(attempt);
        showState(
          attempt.cancelled ? "idle" : "error",
          attempt.cancelled ? "" : failure,
        );
      }
    }
  }

  async function stop() {
    const attempt = session;
    if (!attempt || attempt.cancelled) return;
    attempt.cancelled = true;
    showState("stopping", "Cerrando cámara…");
    if (!attempt.started) return;
    await release(attempt);
    showState("idle");
  }

  startButton.addEventListener("click", start);
  stopButton.addEventListener("click", stop);
  window.addEventListener("pagehide", stop);
  return { stop };
}
