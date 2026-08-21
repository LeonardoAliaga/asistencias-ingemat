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
            <div class="excel-item-actions">
              <button class="btn-preview" data-filename="${a}" title="Vista Previa Completa de ${a}">
                <i class="bi bi-eye-fill"></i>
              </button>
              <button class="btn-image-preview" data-filename="${a}" title="Generar Imagen/Copiar Cuadro de ${a}">
                <i class="bi bi-image"></i>
              </button>
            </div>
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
    document
      .querySelectorAll("#archivos-excel .btn-image-preview")
      .forEach((button) => {
        button.addEventListener("click", (e) => {
          const filename = e.currentTarget.getAttribute("data-filename");
          if (filename) abrirModalImagen(filename);
          else console.error("Botón imagen sin data-filename:", e.currentTarget);
        });
      });
  } catch (error) {
    console.error("Error al cargar archivos Excel:", error);
    excelDiv.innerHTML =
      '<p style="color: red;">Error al cargar la lista de archivos.</p>';
  }
}

// --- LÓGICA DEL MODAL DE EXPORTACIÓN A IMAGEN (3 COLUMNAS) ---
let currentArchivoImagen = "";

async function abrirModalImagen(archivo) {
  currentArchivoImagen = archivo;
  const modal = document.getElementById("image-export-modal");
  const filenameEl = document.getElementById("image-modal-filename");
  const cicloSelect = document.getElementById("image-modal-ciclo");
  const msgEl = document.getElementById("msg-image-modal");

  if (!modal || !filenameEl || !cicloSelect) return;

  filenameEl.textContent = `Archivo: ${archivo}`;
  if (msgEl) msgEl.innerHTML = "";
  modal.style.display = "block";

  try {
    cicloSelect.innerHTML = '<option value="">Cargando ciclos...</option>';
    const res = await fetch("/api/ciclos");
    const data = await res.json();
    cicloSelect.innerHTML = "";

    let ciclosList = [];
    if (data && data.ciclos && Array.isArray(data.ciclos)) {
      ciclosList = data.ciclos;
    }

    if (ciclosList.length > 0) {
      ciclosList.forEach((c) => {
        const opt = document.createElement("option");
        opt.value = c;
        opt.textContent = c.toUpperCase();
        cicloSelect.appendChild(opt);
      });
    }

    const optDoc = document.createElement("option");
    optDoc.value = "docentes";
    optDoc.textContent = "DOCENTES";
    cicloSelect.appendChild(optDoc);

    await actualizarVistaPreviaImagen();
  } catch (err) {
    console.error("Error al cargar ciclos en modal imagen:", err);
    cicloSelect.innerHTML = '<option value="">Error al cargar ciclos</option>';
  }
}

const sectionDataCache = new Map();

async function getSectionDataCached(archivo, ciclo, turno) {
  const cacheKey = `${archivo}_${ciclo}_${turno}`.toLowerCase();
  if (sectionDataCache.has(cacheKey)) {
    return sectionDataCache.get(cacheKey);
  }
  const res = await fetch(
    `/api/excel/section-data?archivo=${encodeURIComponent(
      archivo
    )}&ciclo=${encodeURIComponent(ciclo)}&turno=${encodeURIComponent(turno)}`
  );
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.mensaje || "No se encontraron registros para este ciclo y turno.");
  }
  const data = await res.json();
  if (data && data.exito) {
    sectionDataCache.set(cacheKey, data);
  }
  return data;
}

async function actualizarVistaPreviaImagen() {
  const container = document.getElementById("image-modal-table-container");
  const cicloSelect = document.getElementById("image-modal-ciclo");
  const turnoSelect = document.getElementById("image-modal-turno");
  const msgEl = document.getElementById("msg-image-modal");

  if (!container || !cicloSelect || !turnoSelect || !currentArchivoImagen) return;
  if (msgEl) msgEl.innerHTML = "";

  const ciclo = cicloSelect.value;
  const turno = turnoSelect.value;

  if (!ciclo || !turno) {
    container.innerHTML = "<p><i>Seleccione ciclo y turno.</i></p>";
    return;
  }

  container.innerHTML = "<p><i>Cargando vista previa del cuadro (3 columnas)...</i></p>";

  try {
    const data = await getSectionDataCached(currentArchivoImagen, ciclo, turno);

    if (!data.exito || !data.rows || data.rows.length === 0) {
      container.innerHTML = `<p style="color: #7f8c8d; font-weight: bold; text-align: center; padding: 25px;">No hay registros disponibles para ${ciclo.toUpperCase()} (${turno.toUpperCase()}).</p>`;
      return;
    }

    const headerColumn3 = data.dateHeader || "HORA / ESTADO";

    let html = `
      <div class="image-table-title">${data.title}</div>
      <table class="three-col-table">
        <thead>
          <tr>
            <th style="width: 45px;">N°</th>
            <th>NOMBRES Y APELLIDOS</th>
            <th style="width: 160px;">${headerColumn3}</th>
          </tr>
        </thead>
        <tbody>
    `;

    data.rows.forEach((row) => {
      const statusClass = row.status ? `status-${row.status}` : "";
      html += `
        <tr>
          <td class="text-center">${row.n}</td>
          <td class="text-left">${row.nombre}</td>
          <td class="text-center ${statusClass}">${row.hora || "-"}</td>
        </tr>
      `;
    });

    html += `
        </tbody>
      </table>
    `;

    container.innerHTML = html;
  } catch (err) {
    console.error("Error al actualizar vista previa imagen:", err);
    container.innerHTML = `<p style="color: #c0392b; font-weight: bold; text-align: center; padding: 25px;">${err.message}</p>`;
  }
}

async function copiarImagenAlPortapapeles() {
  const cicloSelect = document.getElementById("image-modal-ciclo");
  const turnoSelect = document.getElementById("image-modal-turno");
  const copyBtn = document.getElementById("btn-copy-table-image");
  const msgEl = document.getElementById("msg-image-modal");

  if (!cicloSelect || !turnoSelect || !currentArchivoImagen) return;

  const ciclo = cicloSelect.value;
  const turno = turnoSelect.value;
  if (!ciclo || !turno) {
    if (msgEl) msgEl.innerHTML = '<span style="color: red;">Selecciona ciclo y turno primero.</span>';
    return;
  }

  const originalBtnHTML = copyBtn ? copyBtn.innerHTML : "";
  if (copyBtn) {
    copyBtn.disabled = true;
    copyBtn.innerHTML = '<i class="bi bi-arrow-repeat spin"></i> Generando imagen...';
  }

  try {
    const res = await fetch(
      `/api/excel/report-image?archivo=${encodeURIComponent(
        currentArchivoImagen
      )}&ciclo=${encodeURIComponent(ciclo)}&turno=${encodeURIComponent(turno)}`
    );

    if (!res.ok) {
      throw new Error("No se encontraron registros para generar la imagen.");
    }

    const blob = await res.blob();

    if (navigator.clipboard && navigator.clipboard.write) {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      if (msgEl) {
        msgEl.innerHTML = `<span class="msg-success-badge"><i class="bi bi-check-circle-fill"></i> ¡Imagen de 3 columnas copiada al portapapeles! Ya puedes pegarla con Ctrl+V.</span>`;
      }
      if (copyBtn) {
        copyBtn.innerHTML = '<i class="bi bi-check-lg"></i> ¡COPIADO!';
        copyBtn.classList.add("btn-copied");
      }
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Reporte_${ciclo}_${turno}_3col.png`;
      a.click();
      if (msgEl) {
        msgEl.innerHTML = '<span style="color: #2980b9;">Imagen descargada (copia directa no soportada en este navegador).</span>';
      }
    }
  } catch (err) {
    console.error("Error al copiar imagen al portapapeles:", err);
    if (msgEl) {
      msgEl.innerHTML = `<span style="color: #e74c3c; font-weight: bold;">Error al copiar: ${err.message}</span>`;
    }
  } finally {
    setTimeout(() => {
      if (copyBtn) {
        copyBtn.disabled = false;
        copyBtn.innerHTML = originalBtnHTML;
        copyBtn.classList.remove("btn-copied");
      }
    }, 2500);
  }
}

async function descargarImagenPNG() {
  const cicloSelect = document.getElementById("image-modal-ciclo");
  const turnoSelect = document.getElementById("image-modal-turno");
  const msgEl = document.getElementById("msg-image-modal");

  if (!cicloSelect || !turnoSelect || !currentArchivoImagen) return;

  const ciclo = cicloSelect.value;
  const turno = turnoSelect.value;
  if (!ciclo || !turno) return;

  try {
    const imageUrl = `/api/excel/report-image?archivo=${encodeURIComponent(
      currentArchivoImagen
    )}&ciclo=${encodeURIComponent(ciclo)}&turno=${encodeURIComponent(turno)}`;

    const a = document.createElement("a");
    a.href = imageUrl;
    a.download = `Asistencia_${ciclo}_${turno}_${currentArchivoImagen.replace(".xlsx", "")}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch (err) {
    console.error("Error al descargar PNG:", err);
    if (msgEl) msgEl.innerHTML = `<span style="color: red;">Error al descargar: ${err.message}</span>`;
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
  const closeBtnPreview = document.getElementById("close-preview");
  const modalPreview = document.getElementById("preview-modal");
  const previewContent = document.getElementById("preview-content");
  const previewTabs = document.getElementById("preview-tabs");

  if (closeBtnPreview && modalPreview) {
    closeBtnPreview.onclick = function () {
      modalPreview.style.display = "none";
      if (previewContent) previewContent.innerHTML = "";
      if (previewTabs) previewTabs.innerHTML = "";
    };
  }

  // Eventos del modal de exportación a imagen
  const closeBtnImage = document.getElementById("close-image-modal");
  const modalImage = document.getElementById("image-export-modal");
  const cicloSelectImage = document.getElementById("image-modal-ciclo");
  const turnoSelectImage = document.getElementById("image-modal-turno");
  const btnCopyImage = document.getElementById("btn-copy-table-image");
  const btnDownloadImage = document.getElementById("btn-download-table-image");

  if (closeBtnImage && modalImage) {
    closeBtnImage.onclick = function () {
      modalImage.style.display = "none";
    };
  }

  if (cicloSelectImage) {
    cicloSelectImage.addEventListener("change", actualizarVistaPreviaImagen);
  }
  if (turnoSelectImage) {
    turnoSelectImage.addEventListener("change", actualizarVistaPreviaImagen);
  }
  if (btnCopyImage) {
    btnCopyImage.addEventListener("click", copiarImagenAlPortapapeles);
  }
  if (btnDownloadImage) {
    btnDownloadImage.addEventListener("click", descargarImagenPNG);
  }

  // Cierre global por clic afuera o tecla Escape
  window.onclick = function (event) {
    if (event.target == modalPreview) {
      modalPreview.style.display = "none";
      if (previewContent) previewContent.innerHTML = "";
      if (previewTabs) previewTabs.innerHTML = "";
    } else if (event.target == modalImage) {
      modalImage.style.display = "none";
    }
  };

  window.addEventListener("keydown", function (event) {
    if (event.key === "Escape" || event.key === "Esc") {
      if (modalPreview && modalPreview.style.display === "block") {
        modalPreview.style.display = "none";
        if (previewContent) previewContent.innerHTML = "";
        if (previewTabs) previewTabs.innerHTML = "";
      }
      if (modalImage && modalImage.style.display === "block") {
        modalImage.style.display = "none";
      }
    }
  });
}
