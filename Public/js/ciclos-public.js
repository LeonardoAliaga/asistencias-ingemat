(() => {
  const list = document.getElementById("cycles-list");
  const status = document.getElementById("cycles-status");
  const contact = document.getElementById("cycles-contact");
  const currency = new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
  });

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function formatPrice(value) {
    const text = String(value ?? "").trim();
    if (!text) return "";
    return Number.isFinite(Number(text)) ? currency.format(Number(text)) : text;
  }

  function cyclePrice(cycle) {
    const history = Array.isArray(cycle.priceHistory) ? cycle.priceHistory : [];
    const activeIndex = history.findLastIndex((entry) => entry.to == null);
    const index = activeIndex < 0 ? history.length - 1 : activeIndex;
    const current = String(cycle.price ?? "").trim() || history[index]?.price;
    const previous = history[index - 1]?.price;
    const offer =
      current != null && previous != null && Number(current) < Number(previous);

    const price = node("div", "ciclo-price");
    if (offer) price.append(node("del", "", formatPrice(previous)));
    price.append(node("span", "", formatPrice(current) || "Consultar precio"));
    if (offer) price.append(node("span", "ciclo-price-tag", "Oferta"));
    return price;
  }

  function cycleCard(cycle) {
    const card = node("article", "ciclo-card");
    card.append(node("h3", "", cycle.titulo));
    if (cycle.descripcion) card.append(node("p", "", cycle.descripcion));

    const benefits = Array.isArray(cycle.beneficios) ? cycle.beneficios : [];
    if (benefits.length) {
      const items = node("ul");
      for (const benefit of benefits) {
        const item = node("li");
        const check = node("i", "bi bi-check-lg");
        check.setAttribute("aria-hidden", "true");
        item.append(check, node("span", "", benefit));
        items.append(item);
      }
      card.append(items);
    }

    const footer = node("div", "ciclo-card-footer");
    const inquiry = node("a", "site-text-link", "Consultar ciclo");
    const link = new URL(contact.href);
    link.searchParams.set(
      "text",
      `Hola, quisiera información sobre el ciclo ${cycle.titulo}.`,
    );
    inquiry.href = link.href;
    inquiry.setAttribute(
      "aria-label",
      `Consultar el ciclo ${cycle.titulo} por WhatsApp`,
    );
    footer.append(cyclePrice(cycle), inquiry);
    card.append(footer);
    return card;
  }

  async function loadCycles() {
    try {
      const response = await fetch("/api/ciclos-visual");
      const data = await response.json();
      if (!response.ok || !data.exito || !Array.isArray(data.ciclos))
        throw Error();
      const cycles = data.ciclos
        .filter((cycle) => cycle.published)
        .sort((a, b) => (a.orden || 0) - (b.orden || 0));
      list.replaceChildren(...cycles.map(cycleCard));
      status.textContent = cycles.length
        ? ""
        : "Consulta por WhatsApp los próximos ciclos y horarios.";
    } catch {
      status.textContent =
        "No se pudieron cargar los ciclos. Puedes consultarlos por WhatsApp.";
    }
  }

  void loadCycles();
})();
