// Proyecto/Public/js/admin/excel-preview.js

/**
 * Convierte el contenido "CSV" plano en una tabla HTML, detectando Títulos y Encabezados.
 * @param {string} csvText Contenido del texto extraído del XLSX.
 * @returns {string} HTML de la tabla con clases de estilo.
 */
function csvToHtmlTable(csvText) {
  const rows = csvText.trim().split("\n");
  if (rows.length === 0) return "<p>El archivo está vacío.</p>";

  let html = "<table><tbody>";

  // Expresión regular para dividir CSV: divide por coma solo si NO está dentro de comillas
  const csvRegex = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/;

  rows.forEach((line) => {
    const cells = line.split(csvRegex);
    const cleanedCells = cells.map((cell) =>
      cell.trim().replace(/^"(.*)"$/, "$1")
    );

    if (cleanedCells.length < 5 && cleanedCells[0].length === 0) {
      return; // Ignorar líneas de continuación o vacías
    }

    // 1. Detección de Fila de Título de Sección
    if (
      cleanedCells.length === 1 &&
      cleanedCells[0].startsWith("REGISTRO DE ASISTENCIA")
    ) {
      html += `<tr class="table-title"><td colspan="5" class="table-title-cell">${cleanedCells[0]}</td></tr>`;
      return;
    }

    // 2. Detección de Fila de Encabezado de Tabla
    const isHeaderRow = cleanedCells[0].toUpperCase().includes("N°");

    if (isHeaderRow) {
      html += '<tr class="table-header">';
      cleanedCells.slice(0, 5).forEach((cell) => {
        html += `<th>${cell}</th>`;
      });
      html += "</tr>";
      return;
    }

    // 3. FILA DE DATOS NORMAL
    const cellNro = cleanedCells[0];

    if (!isNaN(parseInt(cellNro)) && cellNro.length > 0) {
      html += '<tr class="table-data">';
      cleanedCells.slice(0, 5).forEach((cell) => {
        html += `<td>${cell}</td>`;
      });
      html += "</tr>";
    }
  });

  html += "</tbody></table>";
  return html;
}

/**
 * Muestra el modal y carga el contenido del archivo Excel (XLSX).
 */
async function mostrarPreview(archivo) {
  const modal = document.getElementById("preview-modal");
  const previewContent = document.getElementById("preview-content");
  const previewFilename = document.getElementById("preview-filename");

  if (!modal) return;

  previewFilename.textContent = archivo;
  previewContent.innerHTML = "Cargando...";
  modal.style.display = "block";

  try {
    const res = await fetch(`/api/excel/preview/${archivo}`);
    const data = await res.json();

    if (data.exito) {
      previewContent.innerHTML = csvToHtmlTable(data.content);
    } else {
      previewContent.innerHTML = `<p style="color:red;">Error: ${data.mensaje}</p>`;
    }
  } catch (error) {
    console.error("Error al obtener vista previa:", error);
    previewContent.innerHTML = `<p style="color:red;">Error al conectar con el servidor.</p>`;
  }
}

/**
 * Carga la lista de archivos Excel y asigna eventos de descarga/previsualización.
 */
export async function cargarArchivosExcel() {
  const res = await fetch("/api/excel");
  const archivos = await res.json();
  const excelDiv = document.getElementById("archivos-excel");

  if (excelDiv) {
    excelDiv.innerHTML = archivos
      .map(
        (a) =>
          `
              <div class="excel-item">
                  <a href="/api/excel/${a}" download title="Descargar"><i class="bi bi-file-earmark-arrow-down-fill"></i> ${a}</a>
                  <button class="btn-preview" data-filename="${a}" title="Vista Previa"><i class="bi bi-eye-fill"></i> Previsualizar</button>
              </div>
              `
      )
      .join("");

    document.querySelectorAll(".btn-preview").forEach((button) => {
      button.addEventListener("click", (e) => {
        const filename = e.currentTarget.getAttribute("data-filename");
        mostrarPreview(filename);
      });
    });
  }
}

/**
 * Inicializa los eventos de cierre del modal.
 */
export function initModalEvents() {
  const closeBtn = document.getElementById("close-preview");
  const modal = document.getElementById("preview-modal");

  if (closeBtn) {
    closeBtn.onclick = function () {
      if (modal) modal.style.display = "none";
    };
  }

  if (modal) {
    window.onclick = function (event) {
      if (event.target == modal) {
        modal.style.display = "none";
      }
    };
  }
}
