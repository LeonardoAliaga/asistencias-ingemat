// Proyecto/Public/js/admin/accordion.js

/**
 * Inicializa y maneja la funcionalidad de acordeón para la lista de estudiantes.
 */
export function initAccordion() {
  document.querySelectorAll(".accordion-header").forEach((header) => {
    header.setAttribute("aria-controls", header.dataset.target);
    header.setAttribute(
      "aria-expanded",
      String(header.classList.contains("active")),
    );
    header.onclick = function () {
      const targetId = this.getAttribute("data-target");
      const content = document.getElementById(targetId);

      // Cierra los demás acordeones
      document.querySelectorAll(".accordion-header").forEach((h) => {
        if (h !== this) {
          h.classList.remove("active");
          h.setAttribute("aria-expanded", "false");
        }
      });
      document.querySelectorAll(".accordion-content").forEach((c) => {
        if (c !== content) c.classList.remove("show");
      });

      // Toggle del actual
      this.classList.toggle("active");
      content.classList.toggle("show");
      this.setAttribute(
        "aria-expanded",
        String(this.classList.contains("active")),
      );
    };
  });
}
