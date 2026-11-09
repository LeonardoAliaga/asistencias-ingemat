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
  await page.selectOption("#v2-manual-student", "DEMO001");
  await page.fill("#v2-manual-answers", Array(100).fill("A").join(" "));
  await page.click("#v2-manual button[type=submit]");
  await expect(page.locator("#v2-message")).toContainText("2000 puntos");
  await page.click('[data-local-tab="exam-results"]');
  await expect(page.locator("#v2-results")).toContainText("ALUMNO ANA DEMO");
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
  await page.selectOption("#v2-guide-category", "WhatsApp oficial");
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
  await page.selectOption("#turno", "tarde");
  await page.selectOption("#ciclo", "ANUAL");
  await page.click("#form-agregar button[type=submit]");
  await expect(page.locator("#create-user-dialog")).not.toBeVisible();
  await page.fill("#people-search", "UI003");
  await expect(page.locator(".person-row:visible")).toContainText("JULIA");
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
  await nextStep(page, 1);
  await expect(page.locator(".v2-section-editor")).toHaveCount(19);
  await expect(page.locator("#v2-structure-summary")).toContainText(
    "Distribución completa",
  );
  await expect(page.locator("[data-course-name]").nth(11)).toHaveValue(
    "Historia del Perú",
  );
  const course = page.locator(".v2-section-editor").nth(3);
  await course.locator("summary").first().click();
  await course.locator("[data-course-area]").selectOption("E");
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
  await nextStep(page, 1);
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
  await nextStep(page, 1);
  await expect(page.locator(".v2-section-editor")).toHaveCount(19);
});

async function startVisualKeys(page) {
  await login(page);
  await navigate(page, "exams");
  await page.click("#v2-new");
  await page.fill('[name="titulo"]', "CLAVES VISUALES UI");
  await page.selectOption('[name="ciclo"]', "ANUAL");
  await nextStep(page, 1);
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
  await nextStep(page, 1);
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
async function cameraSource(page, mode = "ready") {
  await page.addInitScript((mode) => {
    window.__cameraStreams = [];
    window.__cameraRequests = [];
    window.__torch = [];
    window.__paintCamera = (number = 1) => {
      const canvas = window.__cameraCanvas,
        c = canvas.getContext("2d");
      c.fillStyle = "white";
      c.fillRect(0, 0, canvas.width, canvas.height);
      c.fillStyle = "black";
      c.font = "70px sans-serif";
      c.fillText(`Cartilla de prueba ${number}`, 140, 140);
      for (let i = 0; i < 40; i++)
        c.strokeRect(
          120 + (i % 10) * 100,
          250 + Math.floor(i / 10) * 100,
          30,
          30,
        );
    };
    Object.defineProperty(window, "ImageCapture", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      configurable: true,
      value: async (constraints) => {
        window.__cameraRequests.push(constraints);
        if (mode === "denied")
          throw new DOMException("denied", "NotAllowedError");
        if (mode === "late")
          await new Promise((resolve) => (window.__grantCamera = resolve));
        const canvas = document.createElement("canvas");
        canvas.width = 1600;
        canvas.height = 1132;
        window.__cameraCanvas = canvas;
        window.__paintCamera();
        const stream = canvas.captureStream(15),
          track = stream.getVideoTracks()[0];
        track.getCapabilities = () => ({ torch: true });
        track.getSettings = () => ({
          deviceId: constraints.video.deviceId?.exact || "back-camera",
        });
        track.applyConstraints = async (settings) => {
          window.__torch.push(settings);
        };
        window.__cameraStreams.push(stream);
        return stream;
      },
    });
    Object.defineProperty(navigator.mediaDevices, "enumerateDevices", {
      configurable: true,
      value: async () => [
        { kind: "videoinput", deviceId: "back-camera", label: "Trasera" },
        { kind: "videoinput", deviceId: "other-camera", label: "Otra cámara" },
      ],
    });
  }, mode);
}
async function selectCameraExam(page) {
  await login(page);
  await navigate(page, "imports");
  const option = page
    .locator("#v2-import-exam option")
    .filter({ hasText: "SIMULACRO DE DEMOSTRACIÓN" });
  const id = await option.getAttribute("value");
  await page.selectOption("#v2-import-exam", id);
  return id;
}
async function nativePhoto(page) {
  const bytes = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1600;
    canvas.height = 1132;
    const c = canvas.getContext("2d");
    c.fillStyle = "white";
    c.fillRect(0, 0, 1600, 1132);
    c.fillStyle = "black";
    c.font = "60px sans-serif";
    c.fillText("FOTO NATIVA SINTÉTICA", 100, 200);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.setInputFiles("#camera-native", {
    name: "foto.png",
    mimeType: "image/png",
    buffer: Buffer.from(bytes, "base64"),
  });
  await expect(page.locator(".camera-photos li")).toHaveCount(1);
}

test("camera captures a batch, controls devices/torch, stops on navigation and uploads real JPEGs", async ({
  page,
}) => {
  await cameraSource(page);
  const id = await selectCameraExam(page);
  await page.click("#v2-camera-open");
  await expect(page.locator("#camera-status")).toContainText("Cámara lista");
  expect(await page.evaluate(() => window.__cameraRequests[0].audio)).toBe(
    false,
  );
  expect(
    await page.evaluate(
      () => window.__cameraRequests[0].video.facingMode.ideal,
    ),
  ).toBe("environment");
  await page.click("#camera-torch");
  await expect(page.locator("#camera-torch")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.click("#camera-capture");
  await expect(page.locator(".camera-photos li")).toHaveCount(1);
  await expect(page.locator("#v2-import-exam")).toBeDisabled();
  await page.evaluate(() => window.__paintCamera(2));
  await page.click("#camera-capture");
  await expect(page.locator(".camera-photos li")).toHaveCount(2);
  await navigate(page, "people");
  expect(
    await page.evaluate(() =>
      window.__cameraStreams.every((s) =>
        s.getTracks().every((t) => t.readyState === "ended"),
      ),
    ),
  ).toBe(true);
  await navigate(page, "imports");
  await expect(page.locator(".camera-photos li")).toHaveCount(2);
  await page.click("#camera-start");
  await expect(page.locator("#camera-status")).toContainText("Cámara lista");
  await page.locator("#camera-live details summary").click();
  await page.selectOption("#camera-device", "other-camera");
  await expect
    .poll(() =>
      page.evaluate(() => window.__cameraRequests.at(-1).video.deviceId?.exact),
    )
    .toBe("other-camera");
  await expect(page.locator("#camera-status")).toContainText("Cámara lista");
  const sent = page.waitForResponse(
    (r) => r.url().endsWith(`/api/v2/exams/${id}/scan`) && r.status() === 202,
  );
  await page.click("#camera-send");
  const batch = await (await sent).json();
  expect(batch.files).toHaveLength(2);
  expect(batch.files.every((f) => f.name.endsWith(".jpg"))).toBe(true);
  await expect(page.locator("#camera-status")).toContainText("Lote recibido");
  await expect(page.locator(".camera-photos li")).toHaveCount(0);
  await expect(page.locator("#v2-import-exam")).toBeEnabled();
  await page.click("#camera-close");
});

test("denied camera falls back to native photos and uncertain uploads retry without duplicate batches", async ({
  page,
}) => {
  await cameraSource(page, "denied");
  const id = await selectCameraExam(page);
  await page.click("#v2-camera-open");
  await expect(page.locator("#camera-status")).toContainText(
    "No se concedió acceso",
  );
  await nativePhoto(page);
  let received,
    count = 0;
  const path = `**/api/v2/exams/${id}/scan`;
  await page.route(path, async (route) => {
    const result = await route.fetch();
    const data = await result.json();
    count++;
    if (count === 1) {
      received = data.id;
      await route.abort("failed");
    } else {
      expect(data.id).toBe(received);
      await route.fulfill({ response: result });
    }
  });
  await page.click("#camera-send");
  await expect(page.locator("#camera-status")).toContainText(
    "Reintenta el mismo envío",
  );
  await expect(page.locator("#camera-clear")).toBeDisabled();
  await expect(page.locator("#camera-native")).toBeDisabled();
  await page.click("#camera-send");
  await expect(page.locator("#camera-status")).toContainText("Lote recibido");
  expect(count).toBe(2);
  await expect(page.locator(".camera-photos li")).toHaveCount(0);
});

test("native photos detect exact duplicates, show quality guidance and can be removed", async ({
  page,
}) => {
  await cameraSource(page, "denied");
  await selectCameraExam(page);
  await page.click("#v2-camera-open");
  await nativePhoto(page);
  await nativePhoto(page);
  await expect(page.locator("#camera-status")).toContainText(
    "ya está en la bandeja",
  );
  await expect(page.locator(".camera-photos li")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Quitar captura 1", exact: true })
    .click();
  await expect(page.locator("#v2-import-exam")).toBeEnabled();
  await expect(page.locator("#camera-send")).toBeDisabled();
});

test("cancelled camera permission releases late streams and mobile capture is accessible", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await cameraSource(page, "late");
  await selectCameraExam(page);
  await page.click("#v2-camera-open");
  await expect(page.locator("#camera-status")).toContainText("Solicitando");
  await page.click("#camera-close");
  await page.evaluate(() => window.__grantCamera());
  await expect
    .poll(() =>
      page.evaluate(() => window.__cameraStreams[0]?.getTracks()[0].readyState),
    )
    .toBe("ended");
  await expect(page.locator("#camera-live")).toBeHidden();
  await nativePhoto(page);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(result.violations).toEqual([]);
  await page.click("#camera-clear");
});
