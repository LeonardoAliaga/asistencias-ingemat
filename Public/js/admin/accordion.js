// Proyecto/Public/js/admin/accordion.js

/**
 * Inicializa y maneja la funcionalidad de acordeón para la lista de estudiantes.
 */
export function initAccordion() {
  document.querySelectorAll(".accordion-header").forEach((header) => {
    header.onclick = function () {
      const targetId = this.getAttribute("data-target");
      const content = document.getElementById(targetId);

      // Cierra los demás acordeones
      document.querySelectorAll(".accordion-header").forEach((h) => {
        if (h !== this) h.classList.remove("active");
      });
      document.querySelectorAll(".accordion-content").forEach((c) => {
        if (c !== content) c.classList.remove("show");
      });

      // Toggle del actual
      this.classList.toggle("active");
      content.classList.toggle("show");
    };
  });
}
