const { test, expect } = require("@playwright/test");
async function login(page) {
  await page.goto("/admin");
  await page.fill("#password", "Browser-test-only-2026");
  await page.click("button[type=submit]");
  await page.waitForURL("**/admin");
  await expect(page.locator("#btn-vista-v2")).toBeVisible();
}
test("create, validate and grade an exam from the dashboard", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  await page.click("#btn-vista-v2");
  await page.click("#v2-new");
  await page.fill("#v2-exam-editor [name=titulo]", "SIMULACRO UI");
  await page.selectOption("#v2-exam-editor [name=ciclo]", "ANUAL");
  await page.fill("#v2-keys", Array(100).fill("A").join(" "));
  await page.click("#v2-exam-editor button[type=submit]");
  await expect(page.locator("#v2-message")).toContainText("Borrador guardado");
  await page.click("#v2-ready");
  await expect(page.locator("#v2-message")).toContainText("Examen validado");
  await page.selectOption("#v2-manual-student", "DEMO001");
  await page.fill("#v2-manual-answers", Array(100).fill("A").join(" "));
  await page.click("#v2-manual button[type=submit]");
  await expect(page.locator("#v2-message")).toContainText("2000 puntos");
  await expect(page.locator("#v2-results")).toContainText("ALUMNO ANA DEMO");
  expect(errors).toEqual([]);
});
test("guide searches, category filters and step-by-step tutorials work", async ({
  page,
}) => {
  await login(page);
  await page.click("#btn-vista-guia");
  await expect(page.locator("#v2-guide-count")).toHaveText("34 tutoriales");
  await page.fill("#v2-guide-search", "120");
  await expect(page.locator("#v2-guide-count")).toHaveText("2 tutoriales");
  await page.locator('#v2-guide-list [data-guide="simulacro-120"]').click();
  await expect(page.locator("#v2-dialog")).toBeVisible();
  await expect(page.locator(".v2-tutorial li")).toHaveCount(8);
  await page.keyboard.press("Escape");
  await page.fill("#v2-guide-search", "");
  await page.selectOption("#v2-guide-category", "WhatsApp oficial");
  await expect(page.locator("#v2-guide-count")).toHaveText("4 tutoriales");
});
test("mobile views fit the viewport and legacy HTML is sanitized", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  for (const tab of ["guide", "contacts", "attendance"]) {
    await page.click("#btn-vista-v2");
    await page.click(`[data-v2-tab="${tab}"]`);
    await expect(page.locator(`[data-v2-panel="${tab}"]`)).toBeVisible();
    const size = await page.evaluate(() => ({
      width: innerWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    expect(size.scroll).toBeLessThanOrEqual(size.width);
  }
  const safe = await page.evaluate(() => {
    const el = document.createElement("div");
    el.innerHTML =
      '<img src=x onerror="window.bad=true"><svg onload="window.bad=true"></svg><script>window.bad=true</script>';
    return (
      !el.innerHTML.includes("onerror") &&
      !el.innerHTML.includes("<script") &&
      !window.bad
    );
  });
  expect(safe).toBe(true);
});

test("legacy user and library forms still save once after repeated navigation", async ({
  page,
}) => {
  await login(page);
  await page.click("#btn-vista-inicio");
  await page.fill("#codigo", "UI003");
  await page.fill("#nombre", "JULIA");
  await page.fill("#apellido", "DEMO");
  await page.selectOption("#rol", "estudiante");
  await page.selectOption("#turno", "tarde");
  await page.selectOption("#ciclo", "ANUAL");
  await page.click("#form-agregar button[type=submit]");
  await expect(page.locator("#msg-agregar-usuario")).toContainText(
    "Usuario agregado",
  );
  await page.click("#btn-vista-biblioteca");
  await page.click("#btn-vista-inicio");
  await page.click("#btn-vista-biblioteca");
  await page.click("#subtab-bib-gestion");
  let creates = 0;
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().endsWith("/api/biblioteca/libro"))
      creates++;
  });
  await page.fill("#nueva-seccion-input", "CIENCIAS");
  await page.click("#btn-agregar-seccion");
  await expect(page.locator("#msg-seccion")).toContainText("creada");
  await page.fill("#libro-titulo-input", "Física de prueba");
  await page.fill("#libro-codigo-input", "UI-LIB");
  await page.selectOption("#libro-seccion-select", "CIENCIAS");
  await page.click("#form-agregar-libro button[type=submit]");
  await expect(page.locator("#tabla-catalogo-libros-body")).toContainText(
    "Física de prueba",
  );
  expect(creates).toBe(1);
});
test("public library explains access and the reception pairing dialog opens", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("https://www.google.com/**", (route) => route.abort());
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.click("#btn-prestamo-libros");
  await expect(page.locator(".box-header")).toContainText(
    "Una cuenta de recepción",
  );
  await page
    .getByRole("button", { name: "Vincular punto de asistencia" })
    .click();
  await expect(page.locator("#kiosk-pair-form")).toBeVisible();
  await page.click("#kiosk-pair-close");
  await expect(page.locator("#kiosk-pair-form")).not.toBeVisible();
  expect(errors).toEqual([]);
});
