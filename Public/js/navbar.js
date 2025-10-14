// Proyecto/Public/js/navbar.js

// Función para el menú móvil (se mantiene igual)
function toggle() {
  var navbar = document.getElementById("navbar");
  navbar.classList.toggle("active");
}

document.addEventListener("DOMContentLoaded", () => {
  const navbar = document.getElementById("navbar");
  const logo = document.getElementById("navbar-logo");

  // Definimos constantes para mayor claridad
  const LOGO_REGULAR = "tigre2.svg";
  const LOGO_STICKY = "Logo 1x4 b&w.svg";
  const SCROLL_THRESHOLD = 50; // Umbral de scroll para activar sticky

  // Lógica de scroll unificada para la clase y el logo
  function handleScroll() {
    const isSticky = window.scrollY > SCROLL_THRESHOLD;

    // 1. Gestiona la clase 'sticky'
    navbar.classList.toggle("sticky", isSticky);

    // 2. Gestiona el cambio de logo
    if (isSticky) {
      // Estado STICKY: El logo debe ser Logo 1x4 b&w.svg
      // Comprobamos si el logo actual es el REGULAR antes de cambiar
      if (logo.src.endsWith(LOGO_REGULAR)) {
        logo.src = `./img/${LOGO_STICKY}`;
      }
    } else {
      // Estado REGULAR (no sticky): El logo debe ser tigre2.svg
      // Comprobamos si el logo actual es el STICKY antes de cambiar
      if (logo.src.endsWith(LOGO_STICKY)) {
        logo.src = `./img/${LOGO_REGULAR}`;
      }
    }
  }

  // Asignar el listener de scroll
  window.addEventListener("scroll", handleScroll);

  // Ejecutar una vez al cargar la página para el estado inicial
  handleScroll();
});
