// Proyecto/Public/js/carousel.js

// --- MODIFICADO: Envolver todo en una función ---
function initCarousel() {
  const slidesContainer = document.querySelector(".carousel-slides");
  const slides = document.querySelectorAll(".carousel-slide");
  const prevBtn = document.querySelector(".prev-btn");
  const nextBtn = document.querySelector(".next-btn");

  if (!slidesContainer || slides.length === 0 || !prevBtn || !nextBtn) {
    console.warn("Elementos del carrusel no encontrados. No se iniciará.");
    return;
  }

  let currentIndex = 0;

  function updateCarousel() {
    slides.forEach((slide, index) => {
      slide.classList.remove("active");
      if (index === currentIndex) {
        slide.classList.add("active");
      }
    });
  }

  function nextSlide() {
    currentIndex = (currentIndex + 1) % slides.length;
    updateCarousel();
  }

  function prevSlide() {
    currentIndex = (currentIndex - 1 + slides.length) % slides.length;
    updateCarousel();
  }

  // Event Listeners for buttons
  nextBtn.addEventListener("click", nextSlide);
  prevBtn.addEventListener("click", prevSlide);

  // Auto-play, cambia de diapositiva
  setInterval(nextSlide, 5000);

  // Asegurarse que el primer slide esté activo
  updateCarousel();
}

// --- MODIFICADO: Esperar al evento personalizado ---
document.addEventListener("carouselReady", () => {
  console.log("Carousel Ready: Inicializando carrusel...");
  initCarousel();
});
