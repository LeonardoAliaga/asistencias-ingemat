const { test, expect } = require("@playwright/test");
const AxeBuilder = require("@axe-core/playwright").default;
async function login(page, username = "admin") {
  await page.goto("/admin");
  await page.fill("#username", username);
  await page.fill("#password", "Browser-test-only-2026");
  await page.click("button[type=submit]");
  await page.waitForURL("**/admin");
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
}
async function navigate(page, route) {
  const selector =
    route === "account"
      ? ".account-chip"
      : `#admin-sidebar [data-route="${route}"]`;
  if (route !== "account" && page.viewportSize().width <= 960)
    await page.click("#sidebar-toggle");
  await page.locator(selector).click();
  await expect(page.locator("#main-content")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await expect(page.locator(selector)).toHaveAttribute("aria-current", "page");
}

async function nextStep(page, number) {
  await page.click("#wizard-next");
  await expect(page.locator(`[data-wizard-pane="${number}"]`)).toBeVisible();
}

async function pasteKeys(page, text) {
  await page.locator("#v2-keys-bulk").evaluate((el) => {
    el.open = true;
  });
  await page.fill("#v2-keys", text);
}

test("create, validate and grade an exam from the dashboard", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  await navigate(page, "exams");
  await page.click("#v2-new");
  await expect(page.locator("#v2-exam-editor")).toBeVisible();
  await page.selectOption("#v2-preset", "100");
  await page.fill("#v2-exam-editor [name=titulo]", "SIMULACRO UI");
  await page.selectOption("#v2-exam-editor [name=ciclo]", "ANUAL");
  await nextStep(page, 1);
  await nextStep(page, 2);
  await pasteKeys(page, Array(100).fill("A").join(" "));
  await nextStep(page, 3);
  await page.click("#wizard-save");
  await expect(page.locator("#v2-message")).toContainText("Borrador guardado");
  await page.click("#v2-ready");
  await expect(page.locator("#v2-message")).toContainText("Examen validado");
  await page.click("#v2-manual-tab");
  await page.fill("#v2-manual-student-search", "DEMO001");
  await expect(page.locator('#v2-manual-student-results [role="option"]')).toHaveCount(1);
  await page.locator("#v2-manual-student-search").press("ArrowDown");
  await page.locator("#v2-manual-student-search").press("Enter");
  await expect(page.locator("#v2-manual-student")).toHaveValue("DEMO001");
  await page.locator("#v2-manual-bulk").evaluate((el) => { el.open = true; });
  await page.fill("#v2-manual-answers", Array(100).fill("A").join(" "));
  await expect(page.locator("#v2-manual .key-editor")).toContainText("100 de 100 registradas");
  await page.click("#v2-manual button[type=submit]");
  await expect(page.locator("#v2-message")).toContainText("2000 puntos");
  await page.click('[data-local-tab="exam-results"]');
  await expect(page.locator("#v2-results")).toContainText("ALUMNO ANA DEMO");
  expect(errors).toEqual([]);
});
for (const width of [1440, 390])
  test(`guardian contacts can be saved, updated and revoked at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await login(page);
    await navigate(page, "contacts");
    await page.fill("#v2-contact-search", "DEMO003");
    const card = page.locator("#v2-contacts .v2-card");
    const dialog = page.locator("#v2-dialog");
    const phone = width === 1440 ? "+51900000001" : "+51900000002";
    await card.getByRole("button", { name: "Agregar apoderado" }).click();
    await dialog.getByLabel("Nombre del apoderado").fill("María Muñoz Ñahui");
    await dialog.getByLabel("Teléfono internacional").fill("900000001");
    await dialog
      .getByLabel("Autorizó recibir avisos de este estudiante")
      .check();
    const rejected = page.waitForResponse(
      (r) =>
        r.request().method() === "POST" &&
        r.url().endsWith("/students/DEMO003/contacts"),
    );
    await dialog.getByRole("button", { name: "Guardar contacto" }).click();
    expect((await rejected).status()).toBe(400);
    await expect(dialog.getByRole("alert")).toContainText(
      "teléfono internacional",
    );
    await expect(
      dialog.getByRole("button", { name: "Guardar contacto" }),
    ).toBeEnabled();
    await expect(dialog.getByLabel("Nombre del apoderado")).toHaveValue(
      "María Muñoz Ñahui",
    );
    await expect(
      dialog.getByLabel("Autorizó recibir avisos de este estudiante"),
    ).toBeChecked();
    await dialog.getByLabel("Teléfono internacional").fill(phone);
    await dialog.getByRole("button", { name: "Guardar contacto" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(card).toContainText("María Muñoz Ñahui");
    const saved = async () => {
      const response = await page.request.get("/api/v2/students");
      expect(response.ok()).toBe(true);
      const students = await response.json();
      expect(students.find((s) => s.codigo === "DEMO002").contacts).toEqual([]);
      return students
        .find((s) => s.codigo === "DEMO003")
        .contacts.filter((c) => c.phone === phone);
    };
    expect(await saved()).toEqual([
      expect.objectContaining({
        name: "María Muñoz Ñahui",
        consent: 1,
        active: 1,
      }),
    ]);
    await page.reload();
    await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
    await navigate(page, "contacts");
    await page.fill("#v2-contact-search", "DEMO003");
    await expect(card).toContainText(phone);
    await card.getByRole("button", { name: "Agregar apoderado" }).click();
    await dialog
      .getByLabel("Nombre del apoderado")
      .fill("María Muñoz actualizado");
    await dialog.getByLabel("Teléfono internacional").fill(phone);
    await dialog.getByRole("button", { name: "Guardar contacto" }).click();
    await expect(dialog).not.toBeVisible();
    expect(await saved()).toEqual([
      expect.objectContaining({
        name: "María Muñoz actualizado",
        consent: 0,
        active: 1,
      }),
    ]);
    const row = card.locator(".v2-contact-row").filter({ hasText: phone });
    await expect(row).toContainText("Sin autorización");
    await row.getByRole("button", { name: "Revocar" }).click();
    await expect(row).toHaveCount(0);
    expect(await saved()).toEqual([
      expect.objectContaining({ consent: 0, active: 0 }),
    ]);
    expect(errors).toEqual([]);
  });

test("guide searches, category filters and step-by-step tutorials work", async ({
  page,
}) => {
  await login(page);
  await navigate(page, "guide");
  await expect(page.locator("#v2-guide-count")).toHaveText("34 tutoriales");
  await page.fill("#v2-guide-search", "120");
  await expect(page.locator("#v2-guide-count")).toHaveText("2 tutoriales");
  await page.locator('#v2-guide-list [data-guide="simulacro-120"]').click();
  await expect(page.locator("#v2-dialog")).toBeVisible();
  await expect(page.locator(".v2-tutorial li")).toHaveCount(8);
  await page.keyboard.press("Escape");
  await page.fill("#v2-guide-search", "");
  await page.selectOption("#v2-guide-category", "WhatsApp");
  await expect(page.locator("#v2-guide-count")).toHaveText("4 tutoriales");
});
test("mobile views fit the viewport and legacy HTML is sanitized", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  for (const tab of ["guide", "contacts", "attendance"]) {
    await navigate(page, tab);
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
  await navigate(page, "people");
  await page.click("#people-create");
  await page.fill("#codigo", "UI003");
  await page.fill("#nombre", "JULIA");
  await page.fill("#apellido", "DEMO");
  await page.selectOption("#rol", "estudiante");
  await expect(page.locator("#new-student-details")).toBeVisible();
  await expect(page.locator('#new-student-area-group input[value="GENERAL"]')).toBeChecked();
  await page.locator('#new-student-area-group input[value="E"]').check();
  await expect(page.locator('#new-student-area-group input:checked')).toHaveCount(1);
  await page.fill("#new-guardian-name", "MARÍA DEMO");
  await page.fill("#new-guardian-phone", "+51900000009");
  await page.check("#new-guardian-consent");
  await page.selectOption("#turno", "tarde");
  await page.selectOption("#ciclo", "ANUAL");
  await page.click("#form-agregar button[type=submit]");
  await expect(page.locator("#create-user-dialog")).not.toBeVisible();
  await page.fill("#people-search", "UI003");
  await expect(page.locator(".person-row:visible")).toContainText("JULIA");
  const savedStudent = (
    await (await page.request.get("/api/v2/students")).json()
  ).find((s) => s.codigo === "UI003");
  expect(savedStudent.area).toBe("E");
  expect(savedStudent.contacts).toEqual([
    expect.objectContaining({
      name: "MARÍA DEMO",
      phone: "+51900000009",
      consent: 1,
    }),
  ]);
  await navigate(page, "library");
  await navigate(page, "overview");
  await navigate(page, "library");
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
  await page
    .locator("#tabla-catalogo-libros-body tr")
    .filter({ hasText: "UI-LIB" })
    .locator(".btn-edit-libro")
    .click();
  await expect(page.locator("#modal-editar-libro")).toBeVisible();
  await page.fill("#edit-libro-titulo", "Física: edición corregida");
  await page.click("#form-editar-libro button[type=submit]");
  await expect(page.locator("#modal-editar-libro")).not.toBeVisible();
  await expect(page.locator("#tabla-catalogo-libros-body")).toContainText(
    "Física: edición corregida",
  );
});
test("public library explains account access without reception pairing", async ({
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
  await expect(page.locator("#kiosk-status, #kiosk-pair-form")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("wizard validates area quotas, preserves step data and prepares a 120-question exam", async ({
  page,
}) => {
  await login(page);
  await navigate(page, "exams");
  await page.click("#v2-new");
  await expect(page.locator("#v2-exam-editor")).toBeVisible();
  await page.fill('[name="titulo"]', "ÁREAS UI 120");
  await page.selectOption('[name="ciclo"]', "ANUAL");
  await page.selectOption("#v2-preset", "areas");
  await nextStep(page, 1);
  await expect(page.locator("[data-wizard-pane]:visible")).toHaveCount(1);
  await page.click("#wizard-next");
  await expect(page.locator('[data-wizard-pane="1"]')).toBeVisible();
  await expect(page.locator("#v2-structure-summary")).toContainText(
    "0 de 100 preguntas asignadas",
  );
  await page.locator("[data-course-name]").fill("Matemática");
  await page.locator("[data-course-range]").fill("1-60");
  for (const row of await page.locator("[data-rule-area]").all()) {
    await page
      .locator("[data-course-area]")
      .selectOption(await row.getAttribute("data-rule-area"));
    await row.locator("[data-rule-questions]").fill("1-60");
  }
  await page.click("#v2-add-section");
  const science = page.locator(".v2-section-editor").last();
  await science.locator("[data-course-name]").fill("Ciencias");
  await science.locator("[data-course-range]").fill("61-120");
  for (const row of await science.locator("[data-rule-area]").all()) {
    await science
      .locator("[data-course-area]")
      .selectOption(await row.getAttribute("data-rule-area"));
    await row.locator("[data-rule-questions]").fill("61-120");
    await row.locator("[data-rule-selection]").selectOption("choose");
    await row.locator("[data-rule-quota]").fill("40");
  }
  await expect(page.locator("#v2-structure-summary")).toContainText(
    "Distribución completa",
  );
  await nextStep(page, 2);
  await pasteKeys(page, Array(120).fill("A").join(" "));
  await nextStep(page, 3);
  await expect(page.locator("#wizard-prepare")).toBeEnabled();
  await page.click("#wizard-back");
  await expect(page.locator("#v2-keys")).toHaveValue(
    Array(120).fill("A").join(" "),
  );
  await pasteKeys(page, Array(119).fill("A").join(" "));
  await nextStep(page, 3);
  await expect(page.locator("#wizard-prepare")).toBeDisabled();
  await page.click("#wizard-back");
  await pasteKeys(page, Array(120).fill("A").join(" "));
  await nextStep(page, 3);
  await page.click("#wizard-prepare");
  await expect(page.locator("#v2-message")).toContainText("Examen validado");
  await expect(page.locator("#v2-exam-summary")).toContainText(
    "120 preguntas impresas",
  );
});

test("search finds both shifts and restores the directory tabs when cleared", async ({
  page,
}) => {
  await login(page);
  await navigate(page, "people");
  await page.fill("#people-search", "fernandez");
  await expect(page.locator(".person-row:visible")).toHaveCount(1);
  await expect(
    page.locator(".person-row:visible").filter({ hasText: "DEMO003" }),
  ).toBeVisible();
  await page.fill("#people-search", "");
  await page.locator(".accordion-header").filter({ hasText: "ANUAL" }).click();
  await expect(page.locator(".turno-tabs")).toBeVisible();
  await page.locator('.turno-tab[data-turno="tarde"]').click();
  await expect(
    page.locator(".person-row:visible").filter({ hasText: "DEMO003" }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Editar a FERNÁNDEZ DE LA CRUZ MARÍA FERNANDA",
    })
    .click();
  await expect(page.locator("#edit-user-modal")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#edit-user-modal")).not.toBeVisible();
});

for (const width of [320, 390, 768, 1024, 1440])
  test(`all admin sections fit a ${width}px viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await login(page);
    for (const route of [
      "overview",
      "attendance",
      "people",
      "contacts",
      "exams",
      "imports",
      "tests",
      "tasks",
      "reports",
      "library",
      "notifications",
      "cycles",
      "website",
      "settings",
      "account",
      "guide",
    ]) {
      await navigate(page, route);
      const size = await page.evaluate(() => ({
        width: innerWidth,
        scroll: document.documentElement.scrollWidth,
      }));
      expect(size.scroll, route).toBeLessThanOrEqual(size.width);
      await expect(page.locator("h1:visible")).toHaveCount(1);
      await expect(page.locator("#app-message")).toBeHidden();
    }
    await navigate(page, "exams");
    await page.click("#v2-new");
    await expect(page.locator("#v2-exam-editor")).toBeVisible();
    await page.fill('[name="titulo"]', "CUSTOM UI");
    await page.selectOption('[name="ciclo"]', "ANUAL");
    await page.selectOption("#v2-preset", "100");
    await page.fill('[name="total"]', "10");
    await nextStep(page, 1);
    await expect(page.locator("[data-course-range]")).toHaveValue("1-10");
    await expect(page.locator("#v2-structure-summary")).toContainText(
      "Distribución completa",
    );
    const size = await page.evaluate(() => ({
      width: innerWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    expect(size.scroll).toBeLessThanOrEqual(size.width);
  });

test("mobile menu closes with Escape, restores focus and stays usable after resizing", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.click("#sidebar-toggle");
  await expect(page.locator("#sidebar-toggle")).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await page.keyboard.press("Escape");
  await expect(page.locator("#sidebar-toggle")).toBeFocused();
  await page.click("#sidebar-toggle");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await navigate(page, "people");
  await page.click("#people-create");
  await expect(page.locator("#create-user-dialog")).toBeVisible();
});

test("each operator sees the sections allowed by their role", async ({
  browser,
}) => {
  for (const [role, visible, hidden] of [
    ["recepcion", "attendance", "exams"],
    ["corrector", "exams", "cycles"],
    ["docente", "tasks", "settings"],
  ]) {
    const page = await browser.newPage();
    await login(page, role);
    await expect(
      page.locator(`#admin-sidebar [data-route="${visible}"]`),
    ).toBeVisible();
    await expect(
      page.locator(`#admin-sidebar [data-route="${hidden}"]`),
    ).toBeHidden();
    await navigate(page, visible);
    await page.goto(`/admin#${hidden}`);
    await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
    await expect(page.locator("#page-title")).toHaveText("Resumen");
    await page.close();
  }
});

test("admin pages and dialogs pass automated WCAG A/AA checks", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.goto("/admin");
  let result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(result.violations).toEqual([]);
  await login(page);
  for (const route of [
    "overview",
    "people",
    "attendance",
    "contacts",
    "exams",
    "imports",
    "tests",
    "tasks",
    "reports",
    "library",
    "cycles",
    "notifications",
    "settings",
    "website",
    "account",
    "guide",
  ]) {
    await navigate(page, route);
    result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect.soft(result.violations, route).toEqual([]);
  }
  await navigate(page, "exams");
  await page.click("#v2-new");
  await expect(page.locator("#v2-exam-editor")).toBeVisible();
  result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(result.violations, "wizard").toEqual([]);
  await page.click('[data-guide="simulacro-100"]');
  await expect(page.locator("#v2-dialog")).toBeVisible();
  result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(result.violations, "tutorial dialog").toEqual([]);
});

test("direct grades and tasks stay in their own sections and appear in student reports", async ({
  page,
}) => {
  await login(page);
  await navigate(page, "tests");
  await page.fill("#eval-titulo-input", "PRÁCTICA UI");
  await page.selectOption("#eval-ciclo-select", "ANUAL");
  await page.click("#form-crear-evaluacion button[type=submit]");
  await expect(page.locator("#evaluaciones-list-container")).toContainText(
    "PRÁCTICA UI",
  );
  const option = page
    .locator("#eval-select-respuesta option")
    .filter({ hasText: "PRÁCTICA UI" });
  await page.selectOption(
    "#eval-select-respuesta",
    await option.getAttribute("value"),
  );
  await page.fill("#eval-student-search", "DEMO002");
  await page.locator("#eval-student-results [data-code=DEMO002]").click();
  await expect(
    page.locator("#eval-respuestas-estudiante-container"),
  ).toBeHidden();
  await page.fill("#eval-nota-directa-input", "17.5");
  await page.click("#form-registrar-respuestas-estudiante button[type=submit]");
  await expect(page.locator("#msg-respuesta-estudiante")).toContainText(
    "Calificación registrada",
  );
  await navigate(page, "tasks");
  await page.selectOption("#tarea-curso-select", "ÁLGEBRA");
  await page.selectOption("#tarea-ciclo-select", "ANUAL");
  await page.selectOption("#tarea-tipo-eval-select", "vigesimal");
  await page.fill("#tarea-student-search", "DEMO002");
  await page.locator("#tarea-student-results [data-code=DEMO002]").click();
  await page.fill("#tarea-nota-vigesimal", "18");
  await page.click("#form-registrar-tareas button[type=submit]");
  await expect(
    page.locator("#tareas-list-container tr").filter({ hasText: "DEMO002" }),
  ).toContainText("18 / 20");
  await page.setViewportSize({ width: 320, height: 900 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
  await navigate(page, "reports");
  await page.fill("#reporte-student-search", "DEMO002");
  await page.locator("#reporte-student-results [data-code=DEMO002]").click();
  await expect(page.locator("#alumno-reporte-dashboard")).toContainText(
    "PRÁCTICA UI",
  );
  await expect(page.locator("#alumno-reporte-dashboard")).toContainText(
    "ÁLGEBRA",
  );
  let audit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(audit.violations, "populated student report").toEqual([]);

  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
  await page.click('[data-local-tab="history"]');
  const ranking = page
    .locator("#eval-select-ranking option")
    .filter({ hasText: "PRÁCTICA UI" });
  await page.selectOption(
    "#eval-select-ranking",
    await ranking.getAttribute("value"),
  );
  await expect(page.locator("#tabla-ranking-body")).toContainText("LUIS DEMO");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
  audit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(audit.violations, "populated ranking").toEqual([]);
});

test("table sanitization preserves cells and removes executable markup", async ({
  page,
}) => {
  await login(page);
  const result = await page.evaluate(() => {
    const tbody = document.createElement("tbody");
    tbody.innerHTML =
      '<tr><td>Una fila</td><td><img src=x onerror="window.bad=true"><button>Editar</button></td></tr>';
    return {
      rows: tbody.querySelectorAll("tr").length,
      cells: tbody.querySelectorAll("td").length,
      buttons: tbody.querySelectorAll("button").length,
      safe: !tbody.innerHTML.includes("onerror") && !window.bad,
    };
  });
  expect(result).toEqual({ rows: 1, cells: 2, buttons: 1, safe: true });
});

test("attendance copies a real PNG with the classic layout and selected filters", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await login(page);
  await navigate(page, "attendance");
  await page.selectOption("#v2-attendance-cycle", "ANUAL");
  await page.selectOption("#v2-attendance-shift", "mañana");
  await expect(page.locator("#v2-attendance")).toContainText("DEMO001");
  await expect(page.locator("#v2-attendance")).not.toContainText("DEMO003");
  const response = page.waitForResponse(
    (r) => r.url().includes("/api/v2/attendance/image?") && r.status() === 200,
  );
  await page.click("#v2-attendance-image");
  expect((await response).url()).toContain("turno=ma%C3%B1ana");
  await expect(page.locator("#v2-message")).toContainText(
    "copiada al portapapeles",
  );
  const png = await page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    const blob = await items
      .find((item) => item.types.includes("image/png"))
      .getType("image/png");
    const bitmap = await createImageBitmap(blob);
    const result = {
      type: blob.type,
      width: bitmap.width,
      height: bitmap.height,
    };
    bitmap.close();
    return result;
  });
  expect(png).toEqual({ type: "image/png", width: 560, height: 155 });
  await expect(page.locator("#v2-attendance-export")).toHaveAttribute(
    "href",
    /turno=ma%C3%B1ana/,
  );
});
test("attendance downloads the PNG when clipboard permission is blocked", async ({
  page,
}) => {
  await login(page);
  await navigate(page, "attendance");
  await page.evaluate(() =>
    Object.defineProperty(navigator.clipboard, "write", {
      value: () =>
        Promise.reject(new DOMException("Blocked", "NotAllowedError")),
    }),
  );
  const downloading = page.waitForEvent("download");
  await page.click("#v2-attendance-image");
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(
    /^Asistencia_\d{4}-\d{2}-\d{2}\.png$/,
  );
  await expect(page.locator("#v2-message")).toContainText("Se descargó el PNG");
});
test("empty attendance exports explain the selection and leave the button available", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await login(page);
  await navigate(page, "attendance");
  await page.fill("#v2-attendance-date", "2040-01-01");
  await page.click("#v2-attendance-load");
  await expect(page.locator("#v2-attendance")).toContainText(
    "Todavía no hay registros",
  );
  await page.click("#v2-attendance-image");
  await expect(page.locator("#v2-message")).toContainText(
    "No hay asistencias registradas",
  );
  await expect(page.locator("#v2-attendance-image")).toBeEnabled();
  expect(errors).toEqual([]);
});

test("new exam defaults to the PDF distribution, saves without keys and validates with keys", async ({
  page,
}) => {
  await login(page);
  await navigate(page, "exams");
  await page.click("#v2-new");
  await expect(page.locator("#v2-preset")).toHaveValue("repaso-unmsm");
  await expect(page.locator('[name="total"]')).toHaveValue("120");
  await expect(page.locator("#v2-preset-source")).toBeVisible();
  await page.fill('[name="titulo"]', "REPASO PDF UI");
  await page.selectOption('[name="ciclo"]', "ANUAL");
  await expect(page.locator('[data-wizard-step="1"]')).toBeHidden();
  await expect(
    page.locator(".v2-section-editor").first().locator("[data-course-wrong]"),
  ).toHaveValue("0");
  await expect(
    page.locator(".v2-section-editor").first().locator("[data-course-correct]"),
  ).toHaveValue("20");
  await expect(
    page.locator(".v2-section-editor").first().locator("[data-course-blank]"),
  ).toHaveValue("0");
  await expect(
    page.locator(".v2-section-editor").nth(1).locator("[data-course-wrong]"),
  ).toHaveValue("1.125");
  await expect(page.locator(".v2-section-editor")).toHaveCount(19);
  await expect(page.locator("#v2-structure-summary")).toContainText(
    "Distribución completa",
  );
  await expect(page.locator("[data-course-name]").nth(11)).toHaveValue(
    "Historia del Perú",
  );
  const course = page.locator(".v2-section-editor").nth(3);
  await expect(
    course.locator('[data-rule-area="E"] [data-rule-questions]'),
  ).toHaveValue("31-32");
  await nextStep(page, 2);
  await expect(page.locator("#v2-keys")).toHaveValue("");
  await nextStep(page, 3);
  await expect(page.locator("#wizard-prepare")).toBeDisabled();
  await page.click("#wizard-save");
  await expect(page.locator("#v2-message")).toContainText("Borrador guardado");
  await page.click("#v2-edit");
  await expect(page.locator('[data-wizard-step="1"]')).toBeHidden();
  await expect(
    page.locator(".v2-section-editor").first().locator("[data-course-wrong]"),
  ).toHaveValue("0");
  await expect(
    page.locator(".v2-section-editor").first().locator("[data-course-correct]"),
  ).toHaveValue("20");
  await expect(
    page.locator(".v2-section-editor").first().locator("[data-course-blank]"),
  ).toHaveValue("0");
  await expect(
    page.locator(".v2-section-editor").nth(1).locator("[data-course-wrong]"),
  ).toHaveValue("1.125");
  await nextStep(page, 2);
  await pasteKeys(page, Array(120).fill("A").join(" "));
  await nextStep(page, 3);
  await page.click("#wizard-prepare");
  await expect(page.locator("#v2-message")).toContainText("validado");
});

test("switching formats protects edits but does not interrupt an untouched default", async ({
  page,
}) => {
  await login(page);
  await navigate(page, "exams");
  await page.click("#v2-new");
  await page.selectOption("#v2-preset", "100");
  await expect(page.locator("#v2-format-confirm")).toBeHidden();
  await expect(page.locator('[name="total"]')).toHaveValue("100");
  await page.fill('[name="titulo"]', "Formato editable");
  await page.selectOption('[name="ciclo"]', "ANUAL");
  await nextStep(page, 1);
  await page.fill("[data-course-name]", "Mi curso");
  await page.click("#wizard-back");
  await page.selectOption("#v2-preset", "repaso-unmsm");
  await expect(page.locator("#v2-format-confirm")).toBeVisible();
  await page.click("#v2-format-keep");
  await expect(page.locator("#v2-preset")).toHaveValue("100");
  await page.selectOption("#v2-preset", "repaso-unmsm");
  await page.click("#v2-format-apply");
  await expect(page.locator('[name="total"]')).toHaveValue("120");
  await nextStep(page, 2);
  await expect(page.locator(".v2-section-editor")).toHaveCount(19);
});

async function startVisualKeys(page) {
  await login(page);
  await navigate(page, "exams");
  await page.click("#v2-new");
  await page.fill('[name="titulo"]', "CLAVES VISUALES UI");
  await page.selectOption('[name="ciclo"]', "ANUAL");
  await nextStep(page, 2);
  return page.locator("#v2-exam-editor .key-editor");
}

test("visual keys support clicks, keyboard, course progress, multiple answers and draft persistence", async ({
  page,
}) => {
  const editor = await startVisualKeys(page);
  await expect(page.locator("#v2-keys")).toBeHidden();
  await editor.locator('[data-answer="B"]').click();
  await expect(editor.locator("h4")).toHaveText("Pregunta 2 de 120");
  await page.keyboard.press("c");
  await expect(editor.locator("h4")).toHaveText("Pregunta 3 de 120");
  await expect(
    editor.locator("[data-key-course] option:checked"),
  ).toContainText("2/10");
  await editor.locator("[data-key-multiple]").check();
  await editor.locator('[data-answer="B"]').click();
  await editor.locator('[data-answer="D"]').click();
  await expect(editor.locator("h4")).toHaveText("Pregunta 3 de 120");
  await expect(editor.locator('[data-answer="B"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(editor.locator('[data-answer="D"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await editor.locator("[data-key-multiple]").uncheck();
  await editor.locator("[data-key-course]").selectOption("3");
  await expect(editor.locator("h4")).toHaveText("Pregunta 31 de 120");
  await editor.locator('[data-answer="E"]').click();
  await editor.locator('[data-key-question="31"]').click();
  await editor.locator("[data-key-clear]").click();
  await expect(editor.locator('[data-key-question="31"]')).toHaveAttribute(
    "aria-label",
    "Pregunta 31: pendiente",
  );
  await editor.locator('[data-answer="A"]').click();
  await editor.locator("[data-key-pending]").click();
  await expect(editor.locator(".key-current-answer")).toHaveText("Sin clave");
  await expect(page.locator("#v2-keys-count")).toHaveText(
    "4 de 120 claves ingresadas",
  );
  await nextStep(page, 3);
  await page.click("#wizard-save");
  await expect(page.locator("#v2-message")).toContainText("Borrador guardado");
  await page.click("#v2-edit");
  await nextStep(page, 2);
  await expect(editor.locator('[data-key-question="1"]')).toHaveAttribute(
    "aria-label",
    "Pregunta 1: B",
  );
  await editor.locator('[data-key-question="3"]').click();
  await expect(editor.locator('[data-answer="D"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("#v2-keys")).toHaveValue("1,B\n2,C\n3,B/D\n31,A");
});

test("bulk paste synchronizes visual keys, rejects invalid input without losing text, and supports paging", async ({
  page,
}) => {
  const editor = await startVisualKeys(page);
  await pasteKeys(page, Array(120).fill("C").join(" "));
  await expect(editor.locator('[data-answer="C"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await editor.locator("[data-key-course]").selectOption("all");
  await editor.locator('[data-key-page="1"]').click();
  await expect(editor.locator("h4")).toHaveText("Pregunta 21 de 120");
  await pasteKeys(page, "1,B\n1,C");
  await expect(editor).toContainText("repetida");
  await expect(page.locator("#v2-keys")).toHaveValue("1,B\n1,C");
  await pasteKeys(page, "121,A");
  await expect(editor).toContainText("Revisa el texto pegado");
  await pasteKeys(page, "1,B\n2,C");
  await editor.locator("[data-key-course]").selectOption("0");
  await expect(editor.locator('[data-key-question="1"]')).toHaveAttribute(
    "aria-label",
    "Pregunta 1: B",
  );
  await editor.locator('[data-key-question="1"]').click();
  await editor.locator("[data-key-auto]").uncheck();
  await editor.locator('[data-answer="E"]').click();
  await expect(editor.locator("h4")).toHaveText("Pregunta 1 de 120");
  await expect(page.locator("#v2-keys")).toHaveValue("1,E\n2,C");
});

test("visual key editor stays accessible on mobile and advances across course boundaries", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  const editor = await startVisualKeys(page);
  await editor.locator('[data-key-question="10"]').click();
  await editor.locator('[data-answer="A"]').click();
  await expect(editor.locator("h4")).toHaveText("Pregunta 11 de 120");
  await expect(
    editor.locator("[data-key-course] option:checked"),
  ).toContainText("Habilidad Verbal");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(result.violations).toEqual([]);
});

test("prepared exam revisions use visual keys and recalculate stored results", async ({
  page,
}) => {
  await login(page);
  await navigate(page, "exams");
  const option = page
    .locator("#v2-exam-select option")
    .filter({ hasText: "SIMULACRO DE DEMOSTRACIÓN" });
  await page.selectOption(
    "#v2-exam-select",
    await option.getAttribute("value"),
  );
  await page.click("#v2-revise");
  const editor = page.locator("#v2-revise-form .key-editor");
  await expect(editor.locator('[data-answer="A"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await editor.locator('[data-answer="B"]').click();
  await page.fill("#v2-revision-reason", "Corrección visual de prueba");
  await page.click("#v2-revise-form button[type=submit]");
  await expect(page.locator("#v2-dialog")).toBeHidden();
  await expect(page.locator("#v2-message")).toContainText(
    "Nueva revisión aplicada",
  );
  await expect(page.locator("#v2-results")).toContainText("1978.875");
});

// A real canvas-backed MediaStream gives deterministic photo content without a webcam.
async function selectScannerExam(page) {
  await login(page);
  await navigate(page, "imports");
  const option = page
    .locator("#v2-import-exam option")
    .filter({ hasText: "SIMULACRO DE DEMOSTRACIÓN" });
  const id = await option.getAttribute("value");
  await page.selectOption("#v2-import-exam", id);
  return id;
}

test("printing offers quarter duplex and half single-sided with quantity and print guidance", async ({
  page,
}) => {
  await login(page);
  await navigate(page, "exams");
  const option = page
    .locator("#v2-exam-select option")
    .filter({ hasText: "SIMULACRO DE DEMOSTRACIÓN" });
  await page.selectOption(
    "#v2-exam-select",
    await option.getAttribute("value"),
  );
  await page.click('[data-local-tab="exam-sheets"]');
  await page.fill("#v2-sheet-count", "5");
  await page.locator("#v2-sheet-count").blur();
  await expect(page.locator("#v2-sheet-instructions")).toContainText(
    "2 hojas A4 horizontales, 4 páginas",
  );
  await page.evaluate(() => {
    window.open = (url) => {
      window.__printedURL = url;
    };
  });
  await page.click("#v2-print");
  let url = await page.evaluate(() => window.__printedURL);
  expect(url).toContain("mode=blank");
  expect(url).toContain("format=quarter-duplex");
  expect(url).toContain("count=5");
  const quarter = await page.request.get(url);
  expect(quarter.status()).toBe(200);
  expect(
    (await quarter.body()).toString("latin1").match(/\/Type \/Page\b/g),
  ).toHaveLength(4);
  await page.selectOption("#v2-sheet-format", "half-single");
  await expect(page.locator("#v2-sheet-edge-label")).toBeHidden();
  await expect(page.locator("#v2-sheet-instructions")).toContainText(
    "3 hojas A4 verticales, 3 páginas",
  );
  await page.click("#v2-print");
  url = await page.evaluate(() => window.__printedURL);
  const half = await page.request.get(url);
  expect(half.status()).toBe(200);
  expect(
    (await half.body()).toString("latin1").match(/\/Type \/Page\b/g),
  ).toHaveLength(3);
  await page.setViewportSize({ width: 390, height: 900 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  const audit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(audit.violations).toEqual([]);
});

for (const {
  uncertainCode = false,
  unknownStudent = false,
  areaStatus,
  label,
} of [
  { label: "complete" },
  { label: "partial", uncertainCode: true },
  { label: "unregistered code", unknownStudent: true },
  ...["single", "blank", "uncertain", "multiple"].map((areaStatus) => ({
    label: `area ${areaStatus}`,
    areaStatus,
  })),
])
  test(`identity review preserves leading zeros and shows original readings (${label})`, async ({
    page,
  }) => {
    const mobile = uncertainCode || areaStatus === "uncertain";
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    const examId = await selectScannerExam(page);
    if (areaStatus) {
      const response = await page.request.get(`/api/v2/exams/${examId}`);
      const exam = await response.json();
      exam.definition.areas = [..."ABCDE"].map((code) => ({ code }));
      await page.route(`**/api/v2/exams/${examId}`, (route) =>
        route.fulfill({ json: exam }),
      );
    }
    const originalArea = areaStatus
      ? areaStatus === "single"
        ? "C"
        : ""
      : "GENERAL";
    const originalCode = uncertainCode
      ? ""
      : unknownStudent
        ? "00999999"
        : "00123456";
    const identifiedStudent =
      uncertainCode || unknownStudent
        ? null
        : {
            code: originalCode,
            name: "PÉREZ RAMÍREZ ANA MARÍA",
          };
    const batch = {
      id: "identity-ui",
      created_at: "2026-11-09 12:00:00",
      evaluation_id: examId,
      source: "omr",
      status: "review",
      files: [],
      result: {
        reviewVersion: 1,
        rows:
          identifiedStudent && originalArea
            ? [
                {
                  codigoEstudiante: originalCode,
                  identifiedStudent,
                  area: originalArea,
                  form: "A",
                  preview: { totalEvaluables: 100, puntajeTotal: 2000 },
                },
              ]
            : [],
        pages: [
          {
            identifiedStudent,
            page: 1,
            layoutVersion: 4,
            file: "foto.jpg",
            qr: "synthetic",
            identification: {
              code: originalCode,
              area: originalArea,
              ...(areaStatus
                ? {
                    areaReading: {
                      status: areaStatus,
                      options:
                        areaStatus === "single"
                          ? ["C"]
                          : areaStatus === "multiple"
                            ? ["A", "B"]
                            : [],
                    },
                  }
                : {}),
              columns: [...(originalCode || "00123456")].map((digit, i) => ({
                status:
                  uncertainCode && [2, 4].includes(i)
                    ? i === 2
                      ? "uncertain"
                      : "blank"
                    : "single",
                options: uncertainCode && [2, 4].includes(i) ? [] : [digit],
              })),
            },
            responses: { 1: { status: "blank", options: [] } },
            warning: "Revisar identificación",
          },
        ],
      },
    };
    await page.route("**/api/v2/imports", (route) =>
      route.fulfill({ json: [batch] }),
    );
    await page.route("**/api/v2/imports/identity-ui", (route) =>
      route.fulfill({ json: batch }),
    );
    let submitted;
    await page.route("**/api/v2/imports/identity-ui/pages/0", async (route) => {
      submitted = route.request().postDataJSON();
      await route.fulfill({ json: batch });
    });
    await page.click("#v2-refresh-batches");
    await page.click('[data-batch="identity-ui"]');
    if (identifiedStudent)
      await expect(page.locator("#v2-batch-detail")).toContainText(
        identifiedStudent.name,
      );
    else
      await expect(page.locator("#v2-batch-detail")).not.toContainText(
        "PÉREZ RAMÍREZ",
      );
    await page.click('[data-review="0"]');
    if (identifiedStudent) {
      await expect(page.locator("#v2-review-student")).toContainText(
        identifiedStudent.name,
      );
      await expect(page.locator("#v2-review-student")).toContainText(
        originalCode,
      );
      await expect(page.locator("#v2-dialog-title")).toContainText(
        identifiedStudent.name,
      );
    } else {
      await expect(page.locator("#v2-review-student")).toContainText(
        "Estudiante sin identificar",
      );
    }
    await expect(page.locator("#v2-review-code")).toHaveValue(originalCode);
    await expect(page.locator(".identity-columns li")).toHaveCount(8);
    await expect(
      page.locator(".identity-columns li strong").first(),
    ).toHaveText("0");
    if (uncertainCode) {
      await expect(page.locator(".identity-columns li").nth(2)).toContainText(
        "?",
      );
      await expect(page.locator(".identity-columns li").nth(4)).toContainText(
        "Sin marca",
      );
    }
    await expect(page.locator("#v2-review-area")).toHaveValue(originalArea);
    if (areaStatus) {
      const statusLabels = {
        single: "Lectura original del área: C.",
        blank: "Sin marca",
        uncertain: "Revisar marca tenue o incompleta",
        multiple: "Varias marcas",
      };
      await expect(page.locator("[data-area-reading]")).toContainText(
        statusLabels[areaStatus],
      );
    } else {
      await expect(page.locator("[data-area-reading]")).toHaveCount(0);
    }
    if (mobile) {
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(390);
      const accessibility = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(accessibility.violations).toEqual([]);
    }
    await page.fill("#v2-review-code", "00234567");
    await expect(page.locator("#v2-review-student")).toContainText(
      "El nuevo código se verificará",
    );
    await expect(page.locator("#v2-review-student")).not.toContainText(
      "PÉREZ RAMÍREZ",
    );
    await expect(page.locator("#v2-dialog-title")).toContainText(
      "código en revisión",
    );
    const correctedArea =
      areaStatus && areaStatus !== "single" ? "B" : originalArea;
    if (correctedArea !== originalArea) {
      await page.selectOption("#v2-review-area", correctedArea);
      // Manual correction must not replace the original reader's warning.
      await expect(page.locator("[data-area-reading]")).toContainText(
        "Coteja la cartilla",
      );
    }
    await page.fill(
      "#v2-review-reason",
      "Código cotejado con la cartilla física",
    );
    await page.click("#v2-review-form button[type=submit]");
    await expect(page.locator("#v2-dialog")).toBeHidden();
    expect(submitted.identification).toEqual({
      code: "00234567",
      area: correctedArea,
    });
    expect(submitted.reason).toContain("cotejado");
    expect(submitted.responses[1].status).toBe("blank");
  });

test("one template selector, visible scoring and UNMSM three-step navigation", async ({
  page,
}) => {
  await login(page);
  await navigate(page, "exams");
  await page.click("#v2-new");
  await expect(
    page.getByRole("combobox", { name: "Plantilla", exact: true }),
  ).toHaveCount(1);
  await expect(page.locator("#v2-template-select")).toHaveCount(0);
  await expect(
    page
      .locator("#v2-preset option")
      .filter({ hasText: "Simulacro tipo UNMSM" }),
  ).toHaveCount(1);
  await expect(page.locator('[name="correct"]')).toBeVisible();
  await expect(page.locator('[name="wrong"]')).toBeVisible();
  await expect(page.locator('[name="blank"]')).toBeVisible();
  expect(
    await page
      .locator('[name="correct"]')
      .evaluate((el) => !!el.closest("details")),
  ).toBe(false);
  await expect(page.locator('[name="total"]')).toHaveAttribute("readonly", "");
  await expect(page.locator("#v2-save-template")).toBeHidden();
  await page.fill('[name="wrong"]', "0");
  await page.fill('[name="wrong"]', "2");
  await page.fill('[name="blank"]', "-0.25");
  await expect(
    page.locator(".v2-section-editor").first().locator("[data-course-wrong]"),
  ).toHaveValue("0");
  await expect(
    page.locator(".v2-section-editor").first().locator("[data-course-blank]"),
  ).toHaveValue("0");
  await expect(
    page.locator(".v2-section-editor").nth(1).locator("[data-course-wrong]"),
  ).toHaveValue("2");
  await page.fill('[name="wrong"]', "1.125");
  await page.fill('[name="blank"]', "0");
  await page.fill('[name="titulo"]', "ASISTENTE UNMSM");
  await page.selectOption('[name="ciclo"]', "ANUAL");
  await nextStep(page, 2);
  await expect(page.locator("#wizard-progress")).toHaveText("Paso 2 de 3");
  await expect(page.locator('[data-wizard-step="1"]')).toBeHidden();
  await page.click("#wizard-back");
  await expect(page.locator('[data-wizard-pane="0"]')).toBeVisible();
  await nextStep(page, 2);
  await nextStep(page, 3);
  await expect(page.locator("#v2-save-template")).toBeVisible();
  await page.fill("#v2-template-name", "MI PLANTILLA UI");
  await page.click("#v2-save-template");
  await expect(page.locator("#v2-template-feedback")).toContainText(
    "Plantilla guardada",
  );
  await page.click("#wizard-back");
  await page.click("#wizard-back");
  const saved = page
    .locator("#v2-preset option")
    .filter({ hasText: "MI PLANTILLA UI" });
  const value = await saved.getAttribute("value");
  expect(value.startsWith("saved:")).toBe(true);
  await page.selectOption("#v2-preset", value);
  await nextStep(page, 2);
  await expect(page.locator("#v2-keys")).toHaveValue("");
});

test("score exceptions can be edited and recalculated after students answer", async ({
  page,
}) => {
  await login(page);
  await navigate(page, "exams");
  await page.click("#v2-new");
  await page.selectOption("#v2-preset", "100");
  await page.fill('[name="titulo"]', "EXCEPCIONES UI");
  await page.selectOption('[name="ciclo"]', "ANUAL");
  await page.fill('[name="total"]', "4");
  await nextStep(page, 1);
  await nextStep(page, 2);
  await pasteKeys(page, "A A A A");
  await nextStep(page, 3);
  await page.click("#wizard-prepare");
  await expect(page.locator("#v2-message")).toContainText("validado");
  await page.click("#v2-manual-tab");
  await page.fill("#v2-manual-student-search", "DEMO002");
  await expect(page.locator('#v2-manual-student-results [role="option"]')).toHaveCount(1);
  await page.locator("#v2-manual-student-search").press("ArrowDown");
  await page.locator("#v2-manual-student-search").press("Enter");
  await expect(page.locator("#v2-manual-student")).toHaveValue("DEMO002");
  await page.locator("#v2-manual-bulk").evaluate((el) => { el.open = true; });
  await page.fill("#v2-manual-answers", "B B B B");
  await page.click("#v2-manual button[type=submit]");
  await expect(page.locator("#v2-message")).toContainText("-4.5 puntos");
  await page.click("#v2-revise");
  await page.fill("#v2-revision-no-penalty", "1");
  await page.fill("#v2-revision-void", "3");
  await page.selectOption("#v2-revision-policy", "exclude");
  await page.fill("#v2-revision-option-scores", "2,20,5,0,0,0");
  await page.fill("#v2-revision-reason", "Excepciones corregidas tras cotejo");
  await page.click("#v2-revise-form button[type=submit]");
  await expect(page.locator("#v2-dialog")).toBeHidden();
  await page.click('[data-local-tab="exam-results"]');
  await expect(page.locator("#v2-results")).toContainText("3.875");
  await page.click("#v2-revise");
  await expect(page.locator("#v2-revision-no-penalty")).toHaveValue("1");
  await expect(page.locator("#v2-revision-void")).toHaveValue("3");
  await expect(page.locator("#v2-revision-policy")).toHaveValue("preserve");
  await expect(page.locator("#v2-revision-option-scores")).toHaveValue(
    "2,20,5,0,0,0",
  );
  await page.fill("#v2-revision-reason", "Revisión sin modificar las reglas");
  await page.click("#v2-revise-form button[type=submit]");
  await expect(page.locator("#v2-dialog")).toBeHidden();
  await expect(page.locator("#v2-results")).toContainText("3.875");
});

test("custom template starts clean and confirms before discarding configuration", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await login(page);
  await navigate(page, "exams");
  await page.click("#v2-new");
  await page.fill('[name="titulo"]', "PERSONALIZADO UI");
  await page.selectOption('[name="ciclo"]', "ANUAL");
  await nextStep(page, 2);
  await pasteKeys(page, "A B C D E");
  await page.click("#wizard-back");
  await page.selectOption("#v2-preset", "custom");
  await expect(page.locator("#v2-format-confirm")).toBeVisible();
  await page.click("#v2-format-keep");
  await expect(page.locator("#v2-preset")).toHaveValue("repaso-unmsm");
  await expect(page.locator("#v2-keys")).toHaveValue("A B C D E");
  await page.selectOption("#v2-preset", "custom");
  await page.click("#v2-format-apply");
  await expect(page.locator("#v2-preset option").last()).toHaveAttribute(
    "value",
    "custom",
  );
  await expect(page.locator('[name="total"]')).toHaveValue("");
  await expect(page.locator('[name="total"]')).not.toHaveAttribute("readonly");
  await expect(page.locator(".v2-section-editor")).toHaveCount(0);
  for (const id of [
    "v2-keys",
    "v2-no-penalty",
    "v2-void",
    "v2-option-scores",
    "v2-forms",
  ])
    await expect(page.locator(`#${id}`)).toHaveValue("");
  await expect(page.locator(".v2-area-row")).toHaveCount(1);
  await expect(page.locator('[name="titulo"]')).toHaveValue("PERSONALIZADO UI");
  await page.fill('[name="total"]', "4");
  await nextStep(page, 1);
  await expect(page.locator("#wizard-progress")).toHaveText("Paso 2 de 4");
  await expect(page.locator("[data-area-total]")).toHaveValue("4");
  await page.click("#v2-add-section");
  await page.fill("[data-course-name]", "Álgebra");
  await page.fill("[data-course-range]", "1-4");
  await nextStep(page, 2);
  await pasteKeys(page, "A A A A");
  await nextStep(page, 3);
  await page.click("#wizard-prepare");
  await expect(page.locator("#v2-message")).toContainText("validado");
  expect(errors).toEqual([]);
});

for (const width of [390, 768, 950]) {
  test(`reception menu opens, closes and navigates under CSP at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    const violations = [];
    page.on("console", (message) => {
      if (
        message
          .text()
          .includes("violates the following Content Security Policy")
      )
        violations.push(message.text());
    });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const button = page.locator("#navbar-toggle");
    await expect(button).toHaveAccessibleName("Abrir menú");
    const menu = page.locator("#navbar-menu");
    await expect(menu).toBeHidden();
    await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "true");
    await expect(menu).toBeVisible();
    await page.click("#btn-asistencias");
    await expect(page.locator("#codigo")).toBeVisible();
    await expect(menu).toBeHidden();
    await button.focus();
    await page.keyboard.press("Enter");
    await expect(menu).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(button).toBeFocused();
    await page.keyboard.press("Space");
    await expect(menu).toBeVisible();
    await button.click();
    await expect(menu).toBeHidden();
    await button.click();
    // Move past the mobile breakpoint with an open menu, then return to mobile.
    await page.setViewportSize({ width: 1200, height: 844 });
    await expect(button).toBeHidden();
    await expect(menu).toBeVisible();
    await page.setViewportSize({ width, height: 844 });
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await expect(menu).toBeHidden();
    // The short landscape viewport must let reception reach the last link.
    await page.setViewportSize({ width, height: 280 });
    await button.click();
    await page.locator('#navbar-menu a[href="#sobre-nosotros"]').click();
    await expect(menu).toBeHidden();
    expect(violations).toEqual([]);
  });
}

async function scannerFixture(
  page,
  { loseScan = false, loseImport = false, initiallyScanning = false } = {},
) {
  let jobs = [],
    batch,
    scanPosts = 0,
    physicalScans = 0,
    importPosts = 0,
    imports = 0,
    hideJobs = false;
  const scanIds = [],
    importIds = [];
  await page.route("**/api/v2/scanner/**", async (route) => {
    const url = new URL(route.request().url()),
      method = route.request().method(),
      body = method === "POST" ? route.request().postDataJSON() : null;
    let result;
    if (url.pathname.endsWith("/devices"))
      result = {
        driver: url.searchParams.get("driver"),
        devices: ["Brother MFC-T920DW"],
      };
    else if (url.pathname.endsWith("/jobs") && method === "GET")
      result = {
        busy: jobs.some((j) => j.status === "scanning"),
        jobs: hideJobs ? [] : jobs.filter((j) => j.status !== "imported"),
      };
    else if (url.pathname.endsWith("/jobs") && method === "POST") {
      scanPosts++;
      scanIds.push(body.requestId);
      let job = jobs.find((j) => j.id === body.requestId);
      if (!job) {
        physicalScans++;
        job = {
          id: body.requestId,
          examId: body.examId,
          status: initiallyScanning ? "scanning" : "ready",
          source: body.source,
          pageSize: body.pageSize,
          bytes: 1024,
          fileUrl: `/api/v2/scanner/jobs/${body.requestId}/file`,
        };
        jobs.push(job);
      }
      if (loseScan && scanPosts === 1) {
        hideJobs = true;
        await route.abort("failed");
        return;
      }
      hideJobs = false;
      result = job;
    } else if (url.pathname.endsWith("/cancel")) {
      const id = url.pathname.split("/").at(-2);
      const job = jobs.find((j) => j.id === id);
      job.status = "cancelled";
      result = job;
    } else if (method === "DELETE") {
      jobs = jobs.filter((j) => j.id !== url.pathname.split("/").at(-1));
      result = { exito: true };
    } else if (url.pathname.endsWith("/import")) {
      importPosts++;
      importIds.push(body.requestId);
      if (!batch) {
        imports++;
        batch = {
          id: "scanner-test-batch",
          source: "omr",
          status: "queued",
          evaluation_id: body.examId,
          created_at: "2026-11-09T12:00:00Z",
          result: {},
          files: [],
        };
        jobs.forEach((j) => (j.status = "imported"));
      }
      if (loseImport && importPosts === 1) {
        await route.abort("failed");
        return;
      }
      result = batch;
    } else throw Error("Unexpected scanner route " + url.pathname);
    await route.fulfill({
      status: method === "POST" ? 202 : 200,
      contentType: "application/json",
      body: JSON.stringify(result),
    });
  });
  await page.route(/\/api\/v2\/imports(?:\/|$|\?)/, async (route) => {
    const list = new URL(route.request().url()).pathname === "/api/v2/imports";
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(list ? (batch ? [batch] : []) : batch),
    });
  });
  return {
    counts: () => ({
      scanPosts,
      physicalScans,
      importPosts,
      imports,
      scanIds,
      importIds,
    }),
  };
}

test("NAPS2 replaces cartilla camera and adds multiple scans to one reviewed OMR batch", async ({
  page,
}) => {
  const fixture = await scannerFixture(page);
  await selectScannerExam(page);
  await expect(
    page.locator("#v2-camera, #camera-video, #camera-native"),
  ).toHaveCount(0);
  await page.click("#scanner-discover");
  await expect(page.locator("#scanner-device")).toHaveValue(
    "Brother MFC-T920DW",
  );
  await page.click("#scanner-start");
  await expect(page.locator(".scanner-captures li")).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Ver PDF 1" })).toHaveAttribute(
    "href",
    /\/file$/,
  );
  await page.click("#scanner-start");
  await expect(page.locator(".scanner-captures li")).toHaveCount(2);
  await navigate(page, "people");
  await navigate(page, "imports");
  await expect(page.locator(".scanner-captures li")).toHaveCount(2);
  await page.click("#scanner-process");
  await expect(page.locator("#scanner-status")).toContainText("Lote recibido");
  await expect(page.locator(".scanner-captures li")).toHaveCount(0);
  await expect(page.locator("#v2-batch-detail")).toContainText(
    "Procesando en segundo plano",
  );
  expect(fixture.counts().physicalScans).toBe(2);
  expect(fixture.counts().imports).toBe(1);
});

test("NAPS2 connection failures explain setup and allow retry with TWAIN", async ({
  page,
}) => {
  await scannerFixture(page);
  await page.route("**/api/v2/scanner/devices?driver=wia", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        mensaje:
          "No se pudo iniciar NAPS2 (ENOENT). Instala NAPS2 o configura NAPS2_BIN.",
      }),
    }),
  );
  await selectScannerExam(page);
  await page.click("#scanner-discover");
  await expect(page.locator("#scanner-status")).toContainText("NAPS2_BIN");
  await page.selectOption("#scanner-driver", "twain");
  await page.click("#scanner-discover");
  await expect(page.locator("#scanner-start")).toBeEnabled();
});

test("uncertain scanner commands survive reload and recover the same scan and OMR receipt", async ({
  page,
}) => {
  const fixture = await scannerFixture(page, {
    loseScan: true,
    loseImport: true,
  });
  await selectScannerExam(page);
  await page.click("#scanner-discover");
  await page.click("#scanner-start");
  await expect(page.locator("#scanner-start")).toHaveText(
    "Verificar captura pendiente",
  );
  await page.reload();
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
  await navigate(page, "imports");
  await page.click("#scanner-start");
  await expect(page.locator(".scanner-captures li")).toHaveCount(1);
  await page.click("#scanner-process");
  await expect(page.locator("#scanner-process")).toHaveText(
    "Verificar envío pendiente",
  );
  await expect(page.locator("#v2-import-exam")).toBeDisabled();
  await page.click("#scanner-process");
  await expect(page.locator("#scanner-status")).toContainText("Lote recibido");
  const count = fixture.counts();
  expect(count.physicalScans).toBe(1);
  expect(count.imports).toBe(1);
  expect(new Set(count.scanIds).size).toBe(1);
  expect(new Set(count.importIds).size).toBe(1);
});

test("scanner cancellation and mobile panel remain accessible without camera permission", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await scannerFixture(page, { initiallyScanning: true });
  await selectScannerExam(page);
  await page.click("#scanner-discover");
  await page.click("#scanner-start");
  await expect(page.locator("#v2-import-exam")).toBeDisabled();
  await page.getByRole("button", { name: "Cancelar escaneo" }).click();
  await expect(page.locator(".scanner-captures li")).toContainText("Cancelada");
  await page.getByRole("button", { name: "Quitar captura 1" }).click();
  await expect(page.locator(".scanner-captures li")).toHaveCount(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(result.violations).toEqual([]);
});

test("scanner explains missing exam beside the disabled button and enables after selection", async ({
  page,
}) => {
  const fixture = await scannerFixture(page);
  await login(page);
  await navigate(page, "imports");
  await expect(page.locator("#v2-scanner #v2-import-exam")).toHaveCount(1);
  await page.click("#scanner-discover");
  await expect(page.locator("#scanner-device")).toHaveValue(
    "Brother MFC-T920DW",
  );
  await expect(page.locator("#scanner-start")).toBeDisabled();
  await expect(page.locator("#scanner-readiness")).toContainText(
    "Selecciona un examen listo",
  );
  await expect(page.locator("#scanner-status")).not.toContainText(
    "pulsa Escanear",
  );
  const option = page
    .locator("#v2-import-exam option")
    .filter({ hasText: "SIMULACRO DE DEMOSTRACIÓN" });
  await page.selectOption(
    "#v2-import-exam",
    await option.getAttribute("value"),
  );
  await expect(page.locator("#scanner-start")).toBeEnabled();
  await expect(page.locator("#scanner-readiness")).toContainText(
    "Listo para escanear",
  );
  await page.click("#scanner-start");
  await expect(page.locator(".scanner-captures li")).toHaveCount(1);
  expect(fixture.counts().physicalScans).toBe(1);
});

test("scanner explains that an exam must be validated when no ready exam exists", async ({
  page,
}) => {
  await scannerFixture(page);
  await page.route("**/api/v2/exams", (route) =>
    route.fulfill({ contentType: "application/json", body: "[]" }),
  );
  await login(page);
  await navigate(page, "imports");
  await page.click("#scanner-discover");
  await expect(page.locator("#scanner-start")).toBeDisabled();
  await expect(page.locator("#scanner-readiness")).toContainText(
    "Primero crea y valida un simulacro",
  );
});

test("scanner explains a busy device and enables when the other request finishes", async ({
  page,
}) => {
  await scannerFixture(page);
  let busy = true;
  await page.route("**/api/v2/scanner/jobs?*", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ busy, jobs: [] }),
    }),
  );
  await selectScannerExam(page);
  await page.click("#scanner-discover");
  await expect(page.locator("#scanner-start")).toBeDisabled();
  await expect(page.locator("#scanner-readiness")).toContainText(
    "ocupado por otra solicitud",
  );
  busy = false;
  await expect(page.locator("#scanner-start")).toBeEnabled();
  await expect(page.locator("#scanner-readiness")).toContainText(
    "Listo para escanear",
  );
});

for (const width of [390, 1440])
  test(`compact batch history clears and restores finished items while OMR status stays before uploads at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await scannerFixture(page);
    let hidden = false;
    const batches = Array.from({ length: 40 }, (_, i) => ({
      id: `history-${i}`,
      evaluation_id: "demo",
      source: "omr",
      status: i === 39 ? "processing" : i === 38 ? "failed" : "committed",
      created_at: "2026-11-10T12:00:00Z",
      result: {},
      files: [],
    }));
    await page.route("**/api/v2/imports", (route) =>
      route.fulfill({ json: hidden ? batches.slice(-1) : batches }),
    );
    await page.route("**/api/v2/imports/history-*", (route) => {
      const id = new URL(route.request().url()).pathname.split("/").at(-1);
      return route.fulfill({ json: batches.find((b) => b.id === id) });
    });
    await page.route("**/api/v2/imports/clear-history", (route) => {
      hidden = true;
      return route.fulfill({ json: { hidden: 39 } });
    });
    await page.route("**/api/v2/imports/restore-history", (route) => {
      hidden = false;
      return route.fulfill({ json: { exito: true } });
    });
    await selectScannerExam(page);
    await expect(page.locator("#v2-batch-select option")).toHaveCount(40);
    expect(
      await page
        .locator("#v2-batches")
        .evaluate((el) => el.getBoundingClientRect().height),
    ).toBeLessThan(180);
    await page.selectOption("#v2-batch-select", "history-39");
    await page.click("#v2-open-batch");
    await expect(page.locator("#v2-batch-detail")).toContainText("Procesando");
    expect(
      await page
        .locator("#v2-batch-detail")
        .evaluate((el) =>
          Boolean(
            el.compareDocumentPosition(
              document.getElementById("batch-history-title"),
            ) & Node.DOCUMENT_POSITION_FOLLOWING,
          ),
        ),
    ).toBe(true);
    for (const id of ["v2-scan-form", "v2-csv-form"])
      expect(
        await page
          .locator("#v2-batches")
          .evaluate(
            (el, id) =>
              Boolean(
                el.compareDocumentPosition(document.getElementById(id)) &
                Node.DOCUMENT_POSITION_FOLLOWING,
              ),
            id,
          ),
      ).toBe(true);
    await page.click("#v2-clear-batches");
    await expect(page.locator("#v2-batch-select option")).toHaveCount(1);
    await expect(page.locator("#v2-batch-detail")).toContainText("Procesando");
    await expect(page.locator("#v2-history-status")).toContainText("39 lotes");
    await page.reload();
    await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
    await navigate(page, "imports");
    await expect(page.locator("#v2-batch-select option")).toHaveCount(1);
    await page.click("#v2-restore-batches");
    await expect(page.locator("#v2-batch-select option")).toHaveCount(40);
    batches[39].status = "ready";
    await page.selectOption("#v2-batch-select", "history-39");
    await page.click("#v2-open-batch");
    await page.check("#v2-batch-replace");
    await page.fill(
      "#v2-batch-reason",
      "Motivo que no debe perderse al actualizar",
    );
    await page.click("#v2-refresh-batches");
    await expect(page.locator("#v2-batch-replace")).toBeChecked();
    await expect(page.locator("#v2-batch-reason")).toHaveValue(
      "Motivo que no debe perderse al actualizar",
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    const audit = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(audit.violations).toEqual([]);
  });

test("scanner failed attempts have bounded height and cleanup preserves ready captures on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await scannerFixture(page);
  let jobs = Array.from({ length: 32 }, (_, i) => ({
    id: `attempt-${i}`,
    status: i < 30 ? "failed" : "ready",
    source: "glass",
    pageSize: "a4",
    bytes: i < 30 ? 0 : 1024,
    error: i < 30 ? "No se pudo completar la captura. Revisa el escáner." : "",
    fileUrl: i < 30 ? null : `/api/v2/scanner/jobs/attempt-${i}/file`,
  }));
  await page.route("**/api/v2/scanner/jobs?*", (route) =>
    route.fulfill({ json: { busy: false, jobs } }),
  );
  await page.route("**/api/v2/scanner/clear-failed", (route) => {
    jobs = jobs.filter((j) => j.status === "ready");
    return route.fulfill({ json: { cleared: 30 } });
  });
  await selectScannerExam(page);
  await expect(page.locator(".scanner-captures li")).toHaveCount(32);
  expect(
    await page
      .locator("#scanner-queue")
      .evaluate((el) => el.getBoundingClientRect().height),
  ).toBeLessThanOrEqual(321);
  await page.click("#scanner-clear-failed");
  await expect(page.locator(".scanner-captures li")).toHaveCount(2);
  await expect(page.locator("#scanner-process")).toBeEnabled();
  await expect(page.locator("#scanner-clear-failed")).toBeDisabled();
  await expect(page.locator("#scanner-status")).toContainText(
    "capturas listas se conservan",
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  const audit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(audit.violations).toEqual([]);
});

async function baileysUIFixture(page, initial = {}) {
  const defaults = {
    enabled: false,
    provider: "baileys",
    attendanceMessage:
      "INGEMAT · Asistencia\nEstudiante: {nombre}\nFecha: {fecha}\nHora: {hora}\nEstado: {estado}",
    resultsMessage:
      "INGEMAT · Simulacro\nEstudiante: {nombre}\nExamen: {examen}\nPuntaje: {puntaje}\nÁrea: {area}",
  };
  let config = { ...defaults },
    health = {
      provider: "baileys",
      version: "7.0.0-rc14",
      state: "idle",
      connected: false,
      configured: false,
      enabled: false,
      qrAvailable: false,
      needsPackageReview: false,
      note: "Conecta WhatsApp antes de activar los avisos.",
      ...initial,
    };
  const posts = [];
  await page.route("**/api/v2/notifications", (r) =>
    r.fulfill({ json: { config, status: health, outbox: [] } }),
  );
  await page.route("**/api/v2/notifications/health", (r) =>
    r.fulfill({ json: health }),
  );
  await page.route("**/api/v2/whatsapp/status", (r) =>
    r.fulfill({ json: health }),
  );
  await page.route("**/api/v2/notifications/config", (r) => {
    config = { ...config, ...r.request().postDataJSON() };
    return r.fulfill({ json: { exito: true } });
  });
  await page.route("**/api/v2/notifications/baileys/*", (r) => {
    const action = new URL(r.request().url()).pathname.split("/").at(-1);
    posts.push(action);
    if (action === "qr")
      return r.fulfill({
        json: {
          dataUrl:
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6iUAAAAASUVORK5CYII=",
          expiresAt: health.qrExpiresAt,
        },
      });
    health =
      action === "connect"
        ? {
            ...health,
            state: "connected",
            connected: true,
            configured: true,
            qrAvailable: false,
            needsPackageReview: false,
            note: "WhatsApp conectado.",
          }
        : {
            ...health,
            state: "stopped",
            connected: false,
            configured: false,
            enabled: false,
            qrAvailable: false,
            needsPackageReview: false,
            note: "Conexión detenida. La sesión se conserva.",
          };
    return r.fulfill({ json: health });
  });
  return { posts, health: () => health };
}
test("Baileys is the only connection and health refresh preserves message drafts", async ({
  page,
}) => {
  await baileysUIFixture(page);
  await login(page);
  await navigate(page, "notifications");
  await expect(
    page.locator(
      "#v2-wa-config [name=provider], [name=attendanceTemplate], [name=resultsTemplate]",
    ),
  ).toHaveCount(0);
  await page.fill("[name=attendanceMessage]", "Aviso editado para {nombre}");
  await page.click("#v2-baileys-connect");
  await expect(page.locator("#v2-baileys-status")).toContainText(
    "WhatsApp conectado",
  );
  await expect(page.locator("[name=attendanceMessage]")).toHaveValue(
    "Aviso editado para {nombre}",
  );
  await expect(page.locator("#v2-baileys-connect")).toBeDisabled();
  await page.check("[name=enabled]");
  await page.click("#v2-wa-config button[type=submit]");
  await expect(page.locator("#v2-message")).toContainText(
    "Configuración de WhatsApp guardada",
  );
});
test("package error is visible across dashboard sections and academic UI remains usable on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const note =
    "WhatsApp no está disponible. Revisa el paquete Baileys y su versión. La aplicación sigue funcionando y los avisos pendientes se conservan.";
  await baileysUIFixture(page, {
    state: "error",
    needsPackageReview: true,
    note,
  });
  await login(page);
  await navigate(page, "notifications");
  await expect(page.locator(".whatsapp-toast.error")).toContainText(
    "Revisa el paquete Baileys",
  );
  await expect(page.locator("#whatsapp-service-warning")).toBeHidden();
  await expect(page.locator("#v2-baileys-connect")).toBeEnabled();
  const communicationAudit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(communicationAudit.violations).toEqual([]);
  await navigate(page, "exams");
  await page.click("#v2-new");
  await expect(page.locator("#v2-exam-editor")).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  const audit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(audit.violations).toEqual([]);
});
test("pairing QR is cleared when stopping and the phone connection never enables notifications automatically", async ({
  page,
}) => {
  const f = await baileysUIFixture(page, {
    state: "pairing",
    qrAvailable: true,
    qrExpiresAt: Date.now() + 60000,
    note: "Vincula tu teléfono.",
  });
  await login(page);
  await navigate(page, "notifications");
  await expect(page.locator("#v2-baileys-qr")).toBeVisible();
  await expect(page.locator("[name=enabled]")).not.toBeChecked();
  await page.click("#v2-baileys-stop");
  await expect(page.locator("#v2-baileys-qr")).toBeHidden();
  await expect(page.locator("#v2-baileys-qr-image")).not.toHaveAttribute(
    "src",
    /data:/,
  );
  expect(f.posts).toContain("stop");
});
test("failure to load the optional communication UI does not block the admin application", async ({
  page,
}) => {
  await page.route("**/js/admin/notifications.js", (r) => r.abort("failed"));
  await login(page);
  await navigate(page, "attendance");
  await expect(page.locator(".whatsapp-toast.error")).toContainText(
    "No se pudo cargar Comunicación",
  );
  await expect(page.locator("#whatsapp-service-warning")).toBeHidden();
  await expect(page.locator("#v2-attendance-load")).toBeVisible();
  await navigate(page, "exams");
  await page.click("#v2-new");
  await expect(page.locator("#v2-exam-editor")).toBeVisible();
});

for (const [width, username, code] of [
  [1440, "admin", "DEMO003"],
  [390, "recepcion", "DOC001"],
])
  test(`attendance deletion confirms the selected row and keeps filters at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await login(page, username);
    await navigate(page, "attendance");
    const table = page.locator("#v2-attendance");
    const row = table
      .locator("tbody tr")
      .filter({ has: page.getByRole("cell", { name: code, exact: true }) });
    await expect(row).toBeVisible();
    const button = row.getByRole("button", { name: /^Eliminar asistencia de/ });
    const id = await button.getAttribute("data-delete-attendance");
    const date = await page.inputValue("#v2-attendance-date");
    const cycle = code === "DOC001" ? "" : "ANUAL";
    const shift = code === "DOC001" ? "docente" : "tarde";
    await page.selectOption("#v2-attendance-cycle", cycle);
    await page.selectOption("#v2-attendance-shift", shift);
    await expect(row).toBeVisible();
    const size = await button.boundingBox();
    expect(size.width).toBeGreaterThanOrEqual(32);
    expect(size.width).toBeLessThanOrEqual(44);
    let deletes = 0;
    page.on("request", (request) => {
      if (
        request.method() === "DELETE" &&
        request.url().endsWith(`/attendance/${id}`)
      )
        deletes++;
    });
    page.once("dialog", async (dialog) => {
      expect(dialog.type()).toBe("confirm");
      expect(dialog.message()).toContain(code);
      expect(dialog.message()).toContain(date);
      await dialog.dismiss();
    });
    await button.click();
    await expect(row).toBeVisible();
    expect(deletes).toBe(0);
    await page.route(
      `**/api/v2/attendance/${id}`,
      (route) =>
        route.fulfill({
          status: 500,
          json: { mensaje: "No se pudo eliminar el registro de prueba." },
        }),
      { times: 1 },
    );
    page.once("dialog", (dialog) => dialog.accept());
    await button.click();
    await expect(page.locator("#v2-message")).toContainText(
      "No se pudo eliminar",
    );
    await expect(button).toBeEnabled();
    await expect(row).toBeVisible();
    page.once("dialog", (dialog) => dialog.accept());
    await button.click();
    await expect(row).toHaveCount(0);
    await expect(page.locator("#v2-message")).toHaveText(
      "Registro de asistencia eliminado.",
    );
    await expect(page.locator("#v2-attendance-date")).toHaveValue(date);
    await expect(page.locator("#v2-attendance-cycle")).toHaveValue(cycle);
    await expect(page.locator("#v2-attendance-shift")).toHaveValue(shift);
    expect(
      (
        await (await page.request.get(`/api/v2/attendance?date=${date}`)).json()
      ).rows.some((r) => r.id === id),
    ).toBe(false);
    expect(deletes).toBe(2);
  });

test("read-only operators cannot see attendance deletion controls", async ({
  page,
}) => {
  await login(page, "docente");
  await navigate(page, "attendance");
  await expect(page.locator("#v2-attendance")).toContainText("DEMO002");
  await expect(page.locator("[data-delete-attendance]")).toHaveCount(0);
});

for (const [format, width] of [
  ["png", 1440],
  ["pdf", 390],
])
  test(`student report WhatsApp prepares the ${format} attachment at ${width}px`, async ({
    page,
  }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/v2/whatsapp/student-contacts?*", (r) =>
      r.fulfill({
        json: {
          contacts: [
            {
              id: "report-guardian",
              name: "Apoderado de prueba",
              phone: "+51900000001",
            },
          ],
        },
      }),
    );
    let uploaded;
    await page.route("**/api/v2/whatsapp/student-report", async (r) => {
      uploaded = r.request().postDataBuffer();
      if (process.env.INGEMAT_REPORT_QA_DIR) {
        const fs = require("node:fs"),
          path = require("node:path");
        fs.mkdirSync(process.env.INGEMAT_REPORT_QA_DIR, { recursive: true });
        const start = uploaded.indexOf(Buffer.from("89504e470d0a1a0a", "hex"));
        const end = uploaded.indexOf(Buffer.from("IEND"), start) + 8;
        fs.writeFileSync(
          path.join(process.env.INGEMAT_REPORT_QA_DIR, "student-rendered.png"),
          uploaded.subarray(start, end),
        );
      }
      await r.fulfill({
        status: 202,
        json: { exito: true, id: "report-queued", status: "pending" },
      });
    });
    await page.setViewportSize({ width, height: 900 });
    await login(page);
    await navigate(page, "reports");
    await page.fill("#reporte-student-search", "DEMO001");
    await page.locator("#reporte-student-results [data-code=DEMO001]").click();
    await expect(page.locator("#alumno-reporte-dashboard")).toContainText(
      "ANA DEMO",
    );
    if (width === 390)
      await page.evaluate(() =>
        Object.defineProperty(crypto, "randomUUID", { value: undefined }),
      );
    await page.click("#btn-whatsapp-reporte-alumno");
    const modal = page.locator("#report-whatsapp-dialog");
    await expect(modal).toBeVisible();
    await expect(modal).toContainText("ANA DEMO");
    await expect(modal).toContainText("Apoderado de prueba");
    expect(
      await modal
        .locator("img")
        .evaluate((img) => img.complete && img.naturalWidth),
    ).toBe(1100);
    await modal.getByLabel("Enviar como").selectOption(format);
    if (process.env.INGEMAT_REPORT_QA_DIR)
      await page.screenshot({
        path: require("node:path").join(
          process.env.INGEMAT_REPORT_QA_DIR,
          `student-modal-${width}.png`,
        ),
      });
    await modal.getByRole("button", { name: "Poner reporte en cola" }).click();
    await expect(modal).toHaveCount(0);
    const body = uploaded.toString("utf8");
    expect(body).toContain('name="studentCode"\r\n\r\nDEMO001');
    expect(body).toContain(`name="format"\r\n\r\n${format}`);
    expect(body).toContain("report-guardian");
    expect(
      uploaded.indexOf(Buffer.from("89504e470d0a1a0a", "hex")),
    ).toBeGreaterThan(0);
    await expect(page.locator(".whatsapp-toast")).toContainText(
      "Reporte en cola",
    );
    expect(errors).toEqual([]);
  });

test("cycle groups are searchable and attendance shares the selected date and group", async ({
  page,
}) => {
  const group = {
    id: "120363123456789@g.us",
    subject: "INGEMAT Anual Mañana",
    size: 30,
  };
  let mapped = null,
    daily,
    searchQuery = "";
  await page.route("**/api/v2/whatsapp/attendance-groups", async (r) => {
    if (r.request().method() === "PUT") {
      const body = r.request().postDataJSON();
      expect(body.cycle).toBe("ANUAL");
      expect(body.groupId).toBe(group.id);
      mapped = group;
      await r.fulfill({ json: { exito: true, target: group } });
    } else
      await r.fulfill({
        json: { cycles: [{ cycle: "ANUAL", target: mapped }] },
      });
  });
  await page.route("**/api/v2/whatsapp/groups?*", (r) => {
    searchQuery = new URL(r.request().url()).searchParams.get("q");
    return r.fulfill({ json: { groups: [group] } });
  });
  await page.route("**/api/v2/whatsapp/attendance-target?*", (r) =>
    r.fulfill({ json: { target: mapped } }),
  );
  await page.route("**/api/v2/whatsapp/attendance-report", async (r) => {
    daily = r.request().postDataJSON();
    await r.fulfill({
      status: 202,
      json: { exito: true, id: "daily-report", status: "pending" },
    });
  });
  await login(page);
  await navigate(page, "notifications");
  await page.locator("#wa-group-settings summary").click();
  await page.fill("#wa-group-search", "manana anaul");
  await expect(page.locator("#wa-group-suggestions [role='option']")).toHaveCount(1);
  expect(searchQuery).toBe("manana anaul");
  await page.locator("#wa-group-search").press("ArrowDown");
  await page.locator("#wa-group-search").press("Enter");
  await expect(page.locator("#wa-group-select")).toHaveValue(group.id);
  await expect(page.locator("#wa-group-selected")).toContainText(group.subject);
  await expect(page.locator("#wa-group-suggestions")).toBeHidden();
  await page.click("#wa-group-save");
  await expect(page.locator("#wa-group-message")).toContainText("guardado");
  await navigate(page, "attendance");
  await page.selectOption("#v2-attendance-cycle", "ANUAL");
  await page.selectOption("#v2-attendance-shift", "mañana");
  await expect(page.locator("#v2-attendance-whatsapp")).toBeEnabled();
  await page.click("#v2-attendance-whatsapp");
  const modal = page.locator("#report-whatsapp-dialog");
  await expect(modal).toContainText(group.subject);
  await modal.getByLabel("Enviar como").selectOption("pdf");
  await modal.getByRole("button", { name: "Poner reporte en cola" }).click();
  await expect(modal).toHaveCount(0);
  expect(daily).toEqual(
    expect.objectContaining({
      cycle: "ANUAL",
      shift: "mañana",
      format: "pdf",
      groupId: group.id,
      date: await page.inputValue("#v2-attendance-date"),
    }),
  );
});

test("WhatsApp connection toast is temporary and repeated health polls do not duplicate it", async ({
  page,
}) => {
  await page.route("**/api/v2/whatsapp/status", (r) =>
    r.fulfill({
      json: {
        state: "connected",
        connected: true,
        enabled: false,
        note: "Conectado",
      },
    }),
  );
  await login(page);
  await expect(page.locator(".whatsapp-toast")).toHaveCount(1);
  await expect(page.locator(".whatsapp-toast")).toContainText(
    "WhatsApp conectado",
  );
  await expect(page.locator(".whatsapp-toast")).toHaveCount(0, {
    timeout: 10000,
  });
  await navigate(page, "attendance");
  await expect(page.locator("#v2-attendance-load")).toBeEnabled();
});

test("a WhatsApp connection error shows a dismissible corner notice and leaves attendance usable", async ({
  page,
}) => {
  await page.route("**/api/v2/whatsapp/status", (r) =>
    r.fulfill({
      json: {
        state: "error",
        connected: false,
        enabled: false,
        note: "Revisa el paquete Baileys y su versión. La aplicación sigue funcionando.",
      },
    }),
  );
  await login(page);
  await expect(page.locator(".whatsapp-toast.error")).toContainText(
    "Revisa el paquete Baileys",
  );
  await page
    .locator(".whatsapp-toast")
    .getByRole("button", { name: "Cerrar aviso de WhatsApp" })
    .click();
  await expect(page.locator(".whatsapp-toast")).toHaveCount(0);
  await navigate(page, "attendance");
  await expect(page.locator("#v2-attendance-load")).toBeEnabled();
});

test("student area checkboxes select exactly one, including the unspecified area", async ({ page }) => {
  await login(page);
  await navigate(page, "people");
  await page.click("#people-create");
  await page.selectOption("#rol", "estudiante");
  const choices = page.locator('#new-student-area-group input[name="student-area"]');
  await expect(choices).toHaveCount(6);
  await expect(page.locator('#new-student-area-group')).toContainText("Sin especificar");
  await page.locator('#new-student-area-group input[value="D"]').check();
  await expect(page.locator('#new-student-area-group input[value="GENERAL"]')).not.toBeChecked();
  await expect(page.locator('#new-student-area-group input:checked')).toHaveCount(1);
  await page.locator('#new-student-area-group input[value="D"]').click();
  await expect(page.locator('#new-student-area-group input[value="D"]')).toBeChecked();
  await page.locator('#new-student-area-group input[value="GENERAL"]').check();
  await expect(page.locator('#new-student-area-group input:checked')).toHaveCount(1);
});

test("manual answers use the quick visual editor and allow blanks and multiple marks", async ({ page }) => {
  await login(page);
  await navigate(page, "exams");
  await page.click("#v2-new");
  await page.fill('[name="titulo"]', "RESPUESTAS MANUALES UI");
  await page.selectOption('[name="ciclo"]', "ANUAL");
  await page.selectOption("#v2-preset", "100");
  await nextStep(page, 1);
  await nextStep(page, 2);
  await pasteKeys(page, Array(100).fill("A").join(" "));
  await nextStep(page, 3);
  await page.click("#wizard-prepare");
  await page.click("#v2-manual-tab");
  const editor = page.locator("#v2-manual .key-editor");
  await expect(editor.locator("h4")).toHaveText("Pregunta 1 de 100");
  await editor.locator('[data-answer="C"]').click();
  await expect(editor.locator("h4")).toHaveText("Pregunta 2 de 100");
  await page.keyboard.press("D");
  await expect(editor.locator("h4")).toHaveText("Pregunta 3 de 100");
  await editor.locator("[data-key-blank]").click();
  await expect(editor.locator("h4")).toHaveText("Pregunta 4 de 100");
  await editor.locator("[data-key-multiple]").check();
  await editor.locator('[data-answer="A"]').click();
  await editor.locator('[data-answer="B"]').click();
  await expect(editor.locator("h4")).toHaveText("Pregunta 4 de 100");
  await expect(page.locator("#v2-manual-answers")).toHaveValue("1,C\n2,D\n3,-\n4,A/B");
  await expect(editor.locator('[data-key-question="3"]')).toHaveAttribute("aria-label", "Pregunta 3: en blanco");
  await page.locator("#v2-manual-bulk").evaluate((el) => { el.open = true; });
  await page.fill("#v2-manual-answers", "1,E\n2,-");
  await expect(editor.locator('[data-key-question="2"]')).toHaveAttribute("aria-label", "Pregunta 2: en blanco");
});

test("WhatsApp report buttons have green backgrounds", async ({ page }) => {
  await login(page);
  await navigate(page, "attendance");
  await expect(page.locator("#v2-attendance-whatsapp")).toHaveCSS("background-color", "rgb(11, 120, 109)");
  await navigate(page, "reports");
  await expect(page.locator("#btn-whatsapp-reporte-alumno")).toHaveCSS("background-color", "rgb(11, 120, 109)");
});

test("manual student search supports names, ignores accents and prevents arbitrary student ids", async ({ page }) => {
  await login(page);
  await navigate(page, "exams");
  await page.click("#v2-new");
  await page.selectOption("#v2-preset", "100");
  await page.fill('[name="titulo"]', "BUSCADOR ALUMNOS");
  await page.selectOption('[name="ciclo"]', "ANUAL");
  await nextStep(page, 1);
  await nextStep(page, 2);
  await pasteKeys(page, Array(100).fill("A").join(" "));
  await nextStep(page, 3);
  await page.click("#wizard-prepare");
  await page.click("#v2-manual-tab");
  const search = page.locator("#v2-manual-student-search");
  await search.fill("ana alumno");
  await expect(page.locator('#v2-manual-student-results [data-code="DEMO001"]')).toBeVisible();
  await page.locator('#v2-manual-student-results [data-code="DEMO001"]').click();
  await expect(page.locator("#v2-manual-student")).toHaveValue("DEMO001");
  await search.fill("identificador inexistente");
  await expect(page.locator("#v2-manual-student")).toHaveValue("");
  await expect(page.locator("#v2-manual-student-results")).toContainText("No hay estudiantes");
  await page.click("#v2-manual button[type=submit]");
  await expect(page.locator("#v2-message")).toContainText("Selecciona un estudiante");
});
