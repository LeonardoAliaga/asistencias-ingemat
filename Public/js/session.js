(() => {
  const nativeFetch = window.fetch.bind(window);
  const boot = () =>
    nativeFetch("/api/session", { cache: "no-store" }).then((r) => r.json());
  let ready = boot();
  window.ingematSession = ready;
  let timezone = "America/Lima";
  ready.then((session) => {
    timezone = session.timezone || timezone;
  });
  window.ingematToday = () => {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
        .formatToParts()
        .map((p) => [p.type, p.value]),
    );
    return `${p.year}-${p.month}-${p.day}`;
  };
  const cookie = () =>
    document.cookie
      .split("; ")
      .find((v) => v.startsWith("ingemat.csrf="))
      ?.split("=")
      .slice(1)
      .join("=");
  window.fetch = async function (input, options = {}) {
    const url = new URL(
      typeof input === "string" ? input : input.url,
      location.href,
    );
    const method = (options.method || input?.method || "GET").toUpperCase();
    if (
      url.origin === location.origin &&
      !["GET", "HEAD", "OPTIONS"].includes(method)
    ) {
      await ready;
      options = {
        ...options,
        headers: new Headers(options.headers || input?.headers || {}),
      };
      options.headers.set("x-csrf-token", decodeURIComponent(cookie() || ""));
    }
    const response = await nativeFetch(input, options);
    if (
      response.status === 401 &&
      location.pathname.includes("admin") &&
      !url.pathname.endsWith("/login")
    )
      location.assign("/pages/admin-login.html");
    return response;
  };
  if (window.DOMPurify) {
    const descriptor = Object.getOwnPropertyDescriptor(
      Element.prototype,
      "innerHTML",
    );
    Object.defineProperty(Element.prototype, "innerHTML", {
      ...descriptor,
      set(value) {
        descriptor.set.call(
          this,
          window.DOMPurify.sanitize(String(value), {
            ADD_ATTR: ["target", "aria-label"],
            FORBID_TAGS: ["iframe", "script", "object", "embed"],
            FORBID_ATTR: ["srcdoc"],
          }),
        );
      },
    });
  }
})();
