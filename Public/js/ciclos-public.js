// Public/js/ciclos-public.js
async function loadCiclosPublic() {
  try {
    const res = await fetch("/api/ciclos-visual");
    const data = await res.json();
    if (!data.exito) return;
    const cont = document.querySelector("#ciclos .ciclos-grid");
    if (!cont) return;
    cont.innerHTML = "";
    (data.ciclos || [])
      .filter((c) => c.published)
      .sort((a, b) => (a.orden || 0) - (b.orden || 0))
      .forEach((c) => {
        const card = document.createElement("article");
        card.className = "ciclo-card";
        const current =
          (c.priceHistory || [])
            .slice()
            .reverse()
            .find((p) => p.to === null) ||
          (c.priceHistory || []).slice().reverse()[0] ||
          null;
        const prev = (c.priceHistory || []).slice().reverse()[1] || null;

        // Mostrar oferta solo si el precio actual es menor al anterior
        const isOffer = prev && current && current.price < prev.price;

        card.innerHTML = `
          <div class="card-header">
            <h3 class="card-title">${c.titulo}</h3>
          </div>
          <div class="card-body">
            <p class="card-description">${c.descripcion || ""}</p>
            <div class="card-benefits">
              <strong class="benefits-label">Incluye:</strong>
              <ul class="benefits-list">
                ${(c.beneficios || [])
                  .map(
                    (b) =>
                      `<li><i class="bi bi-check-circle-fill"></i> ${b}</li>`
                  )
                  .join("")}
              </ul>
            </div>
          </div>
          <div class="card-footer">
            <div class="card-price">
              ${prev ? `<span class="old-price">S/ ${prev.price}</span>` : ""}
              <div class="price-container">
                ${
                  current
                    ? `<span class="current-price">S/ ${current.price}</span>
                       ${
                         isOffer
                           ? '<span class="badge-offer">OFERTA</span>'
                           : ""
                       }`
                    : '<span style="color: #999;">Consultar precio</span>'
                }
              </div>
            </div>
          </div>
        `;
        cont.appendChild(card);
      });
  } catch (err) {
    console.error(err);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadCiclosPublic();
});
