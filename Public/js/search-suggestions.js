export function normalizeSearchText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .trim();
}

export function mountSearchSuggestions({
  input,
  list,
  suggestions,
  onSelect,
  onEdit,
  onEmpty,
  showOnEmpty = false,
  selectFirstOnEnter = false,
}) {
  const events = new AbortController();
  const listener = { signal: events.signal };
  let matches = [];
  let active = -1;

  function close() {
    matches = [];
    active = -1;
    list.replaceChildren();
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
  }

  function choose(match) {
    close();
    onSelect(match.value);
  }

  function refresh() {
    close();
    const query = normalizeSearchText(input.value);
    if (input.readOnly || input.disabled || (!query && !showOnEmpty)) return;

    matches = suggestions(query);
    onEmpty?.(matches.length === 0);
    if (!matches.length) return;
    matches.forEach((match, index) => {
      const option = document.createElement("div");
      option.className = "student-autocomplete-item";
      option.id = `${list.id}-option-${index}`;
      option.dataset.code = match.code;
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", "false");

      const label = document.createElement("span");
      label.className = "suggestion-label";
      label.textContent = match.label;
      option.append(label);
      if (match.detail) {
        const detail = document.createElement("span");
        detail.className = "suggestion-detail";
        detail.textContent = match.detail;
        option.append(detail);
      }
      option.addEventListener("mousedown", (event) => event.preventDefault());
      option.addEventListener("click", () => choose(match));
      list.append(option);
    });
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
  }

  input.addEventListener("focus", refresh, listener);
  input.addEventListener("blur", close, listener);
  input.addEventListener(
    "input",
    () => {
      onEdit?.();
      refresh();
    },
    listener,
  );
  input.addEventListener(
    "keydown",
    (event) => {
      if (event.isComposing || input.readOnly) return;
      if (event.key === "Escape" && !list.hidden) {
        event.preventDefault();
        close();
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        if (list.hidden) refresh();
        if (!matches.length) return;
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        active =
          active === -1 && step === -1
            ? matches.length - 1
            : (active + step + matches.length) % matches.length;
        [...list.children].forEach((option, index) => {
          option.classList.toggle("active", index === active);
          option.setAttribute("aria-selected", String(index === active));
        });
        const option = list.children[active];
        input.setAttribute("aria-activedescendant", option.id);
        option.scrollIntoView({ block: "nearest" });
      } else if (
        event.key === "Enter" &&
        matches.length &&
        (active >= 0 || selectFirstOnEnter)
      ) {
        event.preventDefault();
        choose(matches[Math.max(active, 0)]);
      }
    },
    listener,
  );

  return {
    close,
    refresh,
    destroy() {
      events.abort();
      close();
    },
  };
}
