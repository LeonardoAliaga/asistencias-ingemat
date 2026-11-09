// Menú móvil y navegación fija: el mismo logo se mantiene al desplazarse.
function toggle() {
  document.getElementById("navbar").classList.toggle("active");
}
document.addEventListener("DOMContentLoaded", () => {
  const navbar = document.getElementById("navbar");
  const handleScroll = () =>
    navbar.classList.toggle("sticky", window.scrollY > 50);
  window.addEventListener("scroll", handleScroll, { passive: true });
  handleScroll();
});
