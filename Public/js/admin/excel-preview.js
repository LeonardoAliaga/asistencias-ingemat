// Proyecto/Public/js/admin/excel-preview.js

/**
 * Convierte el contenido "CSV" plano de UNA HOJA en una tabla HTML.
 */
function csvToHtmlTable(csvText) {
  const rows = csvText.trim().split("\n");
  if (rows.length === 0) return "<p><i>(Hoja vacía)</i></p>";

  let html = "<table><tbody>";
  const csvRegex = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/;

  rows.forEach((line) => {
    if (line.trim() === "") {
      return; // Ignorar líneas vacías
    }
    const cells = line.split(csvRegex);
    const cleanedCells = cells.map((cell) =>
      cell
        .trim()
        .replace(/^"(.*)"$/, "$1")
        .replace(/""/g, '"')
    );
    while (cleanedCells.length < 6) cleanedCells.push("");

    if (
      cleanedCells[0].startsWith("REGISTRO DE ASISTENCIA") &&
      cleanedCells.slice(1, 5).every((c) => c === "")
    ) {
      html += `<tr class="table-title"><td colspan="5" class="table-title-cell">${cleanedCells[0]}</td></tr>`;
      return;
    }
    const isHeaderRow = cleanedCells[0].toUpperCase().includes("N°");
    if (isHeaderRow) {
      html += '<tr class="table-header">';
      cleanedCells.slice(0, 5).forEach((cell) => (html += `<th>${cell}</th>`));
      html += "</tr>";
      return;
    }
    const cellNro = cleanedCells[0];
    if (!isNaN(parseInt(cellNro)) && cellNro.trim().length > 0) {
      // El backend (excel.route.js) ahora envía "justificado" en cleanedCells[5]
      const statusClass = cleanedCells[5] ? `status-${cleanedCells[5]}` : "";
      html += '<tr class="table-data">';
      cleanedCells.slice(0, 5).forEach((cell, index) => {
        const tdClass = index === 4 ? statusClass : "";
        html += `<td class="${tdClass}">${cell}</td>`;
      });
      html += "</tr>";
    }
  });

  html += "</tbody></table>";
  return html;
}

/**
 * Muestra el modal con pestañas para cada hoja del archivo Excel.
 */
async function mostrarPreview(archivo) {
  const modal = document.getElementById("preview-modal");
  const previewContentArea = document.getElementById("preview-content");
  const previewFilename = document.getElementById("preview-filename");
  const previewTabsContainer = document.getElementById("preview-tabs");

  if (
    !modal ||
    !previewContentArea ||
    !previewFilename ||
    !previewTabsContainer
  ) {
    console.error(
      "Elementos del modal o contenedor de pestañas no encontrados."
    );
    return;
  }

  previewFilename.textContent = archivo;
  previewTabsContainer.innerHTML = "";
  previewContentArea.innerHTML = "<p><i>Cargando vista previa...</i></p>";
  modal.style.display = "block";

  try {
    const res = await fetch(`/api/excel/preview/${archivo}`);
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.mensaje || `Error ${res.status}`);
    }
    const data = await res.json();

    previewContentArea.innerHTML = "";

    if (data.exito && data.sheets && data.sheets.length > 0) {
      data.sheets.sort((a, b) => {
        const order = { Mañana: 1, Tarde: 2, Docentes: 3 };
        const orderA = order[a.name] || 99;
        const orderB = order[b.name] || 99;
        if (orderA === orderB) return a.name.localeCompare(b.name);
        return orderA - orderB;
      });

      data.sheets.forEach((sheet, index) => {
        const tabButton = document.createElement("button");
        tabButton.textContent = sheet.name;
        tabButton.classList.add("preview-tab");
        tabButton.setAttribute("data-target", `sheet-content-${index}`);
        previewTabsContainer.appendChild(tabButton);

        const contentPanel = document.createElement("div");
        contentPanel.id = `sheet-content-${index}`;
        contentPanel.classList.add("preview-tab-content");
        contentPanel.innerHTML = csvToHtmlTable(sheet.content);
        previewContentArea.appendChild(contentPanel);

        if (index === 0) {
          tabButton.classList.add("active");
          contentPanel.classList.add("active");
        }

        tabButton.addEventListener("click", () => {
          previewTabsContainer
            .querySelectorAll(".preview-tab")
            .forEach((tab) => tab.classList.remove("active"));
          previewContentArea
            .querySelectorAll(".preview-tab-content")
            .forEach((panel) => panel.classList.remove("active"));

          tabButton.classList.add("active");
          contentPanel.classList.add("active");
        });
      });
    } else if (data.exito && (!data.sheets || data.sheets.length === 0)) {
      previewContentArea.innerHTML =
        '<p style="color:orange;">El archivo existe pero no contiene hojas válidas.</p>';
    } else {
      previewContentArea.innerHTML = `<p style="color:red;">Error: ${
        data.mensaje || "No se pudo obtener la vista previa."
      }</p>`;
    }
  } catch (error) {
    console.error("Error al obtener o procesar vista previa:", error);
    if (previewContentArea.innerHTML.includes("Cargando")) {
      previewContentArea.innerHTML = "";
    }
    previewContentArea.innerHTML += `<p style="color:red;">Error al procesar el archivo: ${error.message}</p>`;
  }
}

export async function cargarArchivosExcel() {
  const excelDiv = document.getElementById("archivos-excel");
  if (!excelDiv) return;
  excelDiv.innerHTML = "<i>Cargando archivos...</i>";
  try {
    const res = await fetch("/api/excel");
    if (!res.ok) throw new Error(`Error ${res.status} al cargar archivos`);
    const archivos = await res.json();
    if (archivos.length === 0) {
      excelDiv.innerHTML =
        "<p>No hay archivos de asistencia generados aún.</p>";
      return;
    }
    excelDiv.innerHTML = archivos
      .map(
        (a) => `
        <div class="excel-item">
            <a href="/api/excel/${a}" download title="Descargar ${a}">
              <i class="bi bi-file-earmark-arrow-down-fill"></i> ${a}
            </a>
            <button class="btn-preview" data-filename="${a}" title="Vista Previa de ${a}">
              <i class="bi bi-eye-fill"></i>
            </button>
        </div>
      `
      )
      .join("");
    document
      .querySelectorAll("#archivos-excel .btn-preview")
      .forEach((button) => {
        button.addEventListener("click", (e) => {
          const filename = e.currentTarget.getAttribute("data-filename");
          if (filename) mostrarPreview(filename);
          else console.error("Botón sin data-filename:", e.currentTarget);
        });
      });
  } catch (error) {
    console.error("Error al cargar archivos Excel:", error);
    excelDiv.innerHTML =
      '<p style="color: red;">Error al cargar la lista de archivos.</p>';
  }
}

export async function cargarCiclos() {
  const listContainer = document.getElementById("ciclos-list");
  const selectCiclo = document.getElementById("ciclo");
  if (listContainer) listContainer.innerHTML = "<i>Cargando ciclos...</i>";
  if (selectCiclo)
    selectCiclo.innerHTML = '<option value="">Cargando...</option>';
  try {
    const res = await fetch("/api/ciclos");
    if (!res.ok) throw new Error(`Error ${res.status}`);
    const data = await res.json();
    if (listContainer) {
      if (data.ciclos && data.ciclos.length > 0) {
        listContainer.innerHTML = data.ciclos
          .map(
            (ciclo) => `
            <li class="ciclo-item">
                ${ciclo.charAt(0).toUpperCase() + ciclo.slice(1)}
                <button class="btn-eliminar-ciclo" data-ciclo="${ciclo}" title="Eliminar ciclo ${ciclo}">
                    <i class="bi bi-x-circle-fill"></i>
                </button>
            </li>
          `
          )
          .join("");
        document
          .querySelectorAll("#ciclos-list .btn-eliminar-ciclo")
          .forEach((btn) => {
            btn.onclick = async function () {
              const ciclo = this.getAttribute("data-ciclo");
              if (
                confirm(
                  `¿Seguro que desea eliminar el ciclo "${ciclo.toUpperCase()}"?`
                )
              ) {
                try {
                  const deleteRes = await fetch(`/api/ciclos/${ciclo}`, {
                    method: "DELETE",
                  });
                  const deleteData = await deleteRes.json();
                  if (!deleteRes.ok)
                    throw new Error(
                      deleteData.mensaje || `Error ${deleteRes.status}`
                    );
                  await cargarCiclos();
                } catch (deleteError) {
                  console.error("Error al eliminar ciclo:", deleteError);
                  alert(`Error al eliminar ciclo: ${deleteError.message}`);
                }
              }
            };
          });
      } else {
        listContainer.innerHTML = "<p>No hay ciclos definidos.</p>";
      }
    }
    if (selectCiclo) {
      selectCiclo.innerHTML = '<option value="">Selecciona ciclo</option>';
      if (data.ciclos && data.ciclos.length > 0) {
        data.ciclos.forEach((ciclo) => {
          const option = document.createElement("option");
          option.value = ciclo;
          option.textContent = ciclo.charAt(0).toUpperCase() + ciclo.slice(1);
          selectCiclo.appendChild(option);
        });
      } else {
        selectCiclo.innerHTML = '<option value="">No hay ciclos</option>';
      }
    }
  } catch (error) {
    console.error("Error al cargar ciclos:", error);
    if (listContainer)
      listContainer.innerHTML =
        '<p style="color: red;">Error al cargar ciclos.</p>';
    if (selectCiclo)
      selectCiclo.innerHTML = '<option value="">Error al cargar</option>';
  }
}

export function initCicloFormEvents() {
  /* Lógica en admin.js */
}

export function initModalEvents() {
  const closeBtn = document.getElementById("close-preview");
  const modal = document.getElementById("preview-modal");
  const previewContent = document.getElementById("preview-content");
  const previewTabs = document.getElementById("preview-tabs"); // Obtener contenedor de pestañas

  if (closeBtn && modal) {
    closeBtn.onclick = function () {
      modal.style.display = "none";
      if (previewContent) previewContent.innerHTML = "";
      if (previewTabs) previewTabs.innerHTML = "";
    };
  }
  if (modal) {
    window.onclick = function (event) {
      if (event.target == modal) {
        modal.style.display = "none";
        if (previewContent) previewContent.innerHTML = "";
        if (previewTabs) previewTabs.innerHTML = "";
      }
    };
    window.addEventListener("keydown", function (event) {
      if (event.key === "Escape" || event.key === "Esc") {
        if (modal.style.display === "block") {
          modal.style.display = "none";
          if (previewContent) previewContent.innerHTML = "";
          if (previewTabs) previewTabs.innerHTML = "";
        }
      }
    });
  }
}
