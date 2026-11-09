// Los eventos se registran aquí para respetar script-src-attr de la CSP.
document.addEventListener("DOMContentLoaded", () => {
  const navbar = document.getElementById("navbar"),
    button = document.getElementById("navbar-toggle"),
    menu = document.getElementById("navbar-menu"),
    mobile = window.matchMedia("(max-width: 950px)");
  if (!navbar || !button || !menu) return;

  function setMenu(open) {
    open = open && mobile.matches;
    navbar.classList.toggle("active", open);
    button.setAttribute("aria-expanded", String(open));
    button.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
  }
  button.addEventListener("click", () => {
    setMenu(button.getAttribute("aria-expanded") !== "true");
  });
  navbar.addEventListener("click", (event) => {
    if (event.target.closest("a")) setMenu(false);
  });
  document.addEventListener("click", (event) => {
    if (!navbar.contains(event.target)) setMenu(false);
  });
  document.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      button.getAttribute("aria-expanded") === "true"
    ) {
      setMenu(false);
      button.focus();
    }
  });
  mobile.addEventListener("change", () => setMenu(false));
  const handleScroll = () =>
    navbar.classList.toggle("sticky", window.scrollY > 50);
  window.addEventListener("scroll", handleScroll, { passive: true });
  setMenu(false);
  handleScroll();
});
