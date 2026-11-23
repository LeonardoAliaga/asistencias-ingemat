export function initGallery(onAvailabilityChange) {
  const image = document.getElementById("gallery-image");
  const gallery = image.closest(".site-gallery");
  const controls = document.getElementById("gallery-controls");
  const status = document.getElementById("gallery-status");
  const pictureFolder = "/img/ingresantes/";
  const fallback = "/img/ingresantes.png";
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const descriptions = new Map([
    [
      "Ingresantes2.png",
      "Ingresantes de INGEMAT a la Universidad Nacional de Ingeniería",
    ],
    [
      "Ingresantes3.png",
      "Ingresante de INGEMAT a Ingeniería Agroindustrial en San Marcos",
    ],
    [
      "Ingresantes4.png",
      "Ingresantes de INGEMAT a Economía e Ingeniería de Telecomunicaciones en San Marcos",
    ],
    [
      "Ingresantes5.png",
      "Ingresante de INGEMAT a Administración en San Marcos",
    ],
    ["Ingresantes6.png", "Ingresante de INGEMAT a Pesquería"],
    [
      "Ingresantes7.png",
      "Ingresante de INGEMAT a Psicología en la Universidad de San Martín de Porres",
    ],
  ]);
  let files = [];
  let current = 0;
  let enabled = false;
  let inView = false;
  let hovered = false;
  let timer;

  function scheduleRotation() {
    window.clearTimeout(timer);
    const rotating =
      enabled &&
      files.length > 1 &&
      inView &&
      !hovered &&
      !document.hidden &&
      !gallery.querySelector(":focus-visible");
    status.setAttribute("aria-live", rotating ? "off" : "polite");
    if (rotating) timer = window.setTimeout(() => showPhoto(current + 1), 5000);
  }

  function setRotation(next) {
    enabled = next;
    scheduleRotation();
  }

  function showPhoto(index) {
    current = (index + files.length) % files.length;
    const file = files[current];
    const src = pictureFolder + encodeURIComponent(file);
    image.alt = descriptions.get(file) || "Ingresantes de la academia INGEMAT";
    if (image.getAttribute("src") !== src) image.src = src;
    status.textContent = `Imagen ${current + 1} de ${files.length}. ${image.alt}`;
    scheduleRotation();
  }

  image.addEventListener("error", () => {
    if (image.getAttribute("src") !== fallback) {
      image.alt = "Estudiantes de la academia INGEMAT";
      image.src = fallback;
    }
  });
  image.addEventListener("load", () => {
    if (enabled && !motion.matches && files.length > 1)
      image.animate([{ opacity: 0.78 }, { opacity: 1 }], { duration: 180 });
  });

  document
    .getElementById("gallery-prev")
    .addEventListener("click", () => showPhoto(current - 1));
  document
    .getElementById("gallery-next")
    .addEventListener("click", () => showPhoto(current + 1));
  gallery.addEventListener("focusin", scheduleRotation);
  gallery.addEventListener("focusout", () => queueMicrotask(scheduleRotation));
  gallery.addEventListener("pointerenter", (event) => {
    if (event.pointerType !== "mouse") return;
    hovered = true;
    scheduleRotation();
  });
  gallery.addEventListener("pointerleave", () => {
    hovered = false;
    scheduleRotation();
  });
  document.addEventListener("visibilitychange", scheduleRotation);
  new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    scheduleRotation();
  }).observe(gallery);

  async function loadPhotos() {
    try {
      const response = await fetch("/api/carousel");
      const data = await response.json();
      if (!response.ok || !data.exito || !Array.isArray(data.images)) return;
      files = data.images.filter(
        (file) =>
          typeof file === "string" && /^I[^/\\]+\.(?:png|jpe?g)$/i.test(file),
      );
      controls.hidden = files.length < 2;
      onAvailabilityChange(!controls.hidden);
      if (files.length) showPhoto(0);
    } catch {
      // The HTML already contains an image for offline use.
    }
  }

  void loadPhotos();
  return setRotation;
}
