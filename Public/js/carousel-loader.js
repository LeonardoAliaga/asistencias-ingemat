// Public/js/carousel-loader.js
document.addEventListener("DOMContentLoaded", () => {
  const slidesContainer = document.querySelector(".carousel-slides");

  if (!slidesContainer) return;

  async function loadCarouselImages() {
    try {
      const res = await fetch("/api/carousel");
      const data = await res.json();

      if (data.exito && data.images && data.images.length > 0) {
        slidesContainer.innerHTML = ""; // Limpiar slides hardcodeados

        data.images.forEach((imgName, index) => {
          const slide = document.createElement("div");
          slide.className = "carousel-slide";
          if (index === 0) {
            slide.classList.add("active"); // Activar la primera
          }

          const img = document.createElement("img");
          img.src = `img/ingresantes/${imgName}`;
          img.alt = "Ingresantes Ingemat";

          slide.appendChild(img);
          slidesContainer.appendChild(slide);
        });

        // Disparar un evento para que carousel.js sepa que ya puede inicializarse
        document.dispatchEvent(new Event("carouselReady"));
      } else {
        // Si falla o no hay imágenes, dejar los slides hardcodeados (si los hubiera)
        console.warn("No se cargaron imágenes dinámicas para el carrusel.");
        document.dispatchEvent(new Event("carouselReady"));
      }
    } catch (err) {
      console.error("Error al cargar imágenes del carrusel:", err);
      // Dejar que carousel.js se inicie con lo que haya
      document.dispatchEvent(new Event("carouselReady"));
    }
  }

  loadCarouselImages();
});
