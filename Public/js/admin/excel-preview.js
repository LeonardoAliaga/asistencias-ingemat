// Proyecto/Public/js/admin/excel-preview.js

/**
 * Convierte el contenido "CSV" plano en una tabla HTML, detectando Títulos y Encabezados.
 */
function csvToHtmlTable(csvText) {
  const rows = csvText.trim().split("\n");
  if (rows.length === 0) return "<p>El archivo está vacío.</p>";

  let html = "<table><tbody>";

  // Regex para dividir CSV: divide por coma solo si NO está dentro de comillas
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
                  <button class="btn-preview" data-filename="${a}" title="Vista Previa"><i class="bi bi-eye-fill"></i></button>
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
 * Carga la lista de ciclos y asigna eventos de eliminación.
 */
export async function cargarCiclos() {
  const listContainer = document.getElementById("ciclos-list");
  if (!listContainer) return;

  const res = await fetch("/api/ciclos");
  const data = await res.json();

  listContainer.innerHTML = data.ciclos
    .map(
      (ciclo) => `
        <li class="ciclo-item">
            ${ciclo.charAt(0).toUpperCase() + ciclo.slice(1)}
            <button class="btn-eliminar-ciclo" data-ciclo="${ciclo}" title="Eliminar ciclo">
                <i class="bi bi-x-circle-fill"></i>
            </button>
        </li>
    `
    )
    .join("");

  document.querySelectorAll(".btn-eliminar-ciclo").forEach((btn) => {
    btn.onclick = async function () {
      const ciclo = this.getAttribute("data-ciclo");
      if (
        confirm(`¿Seguro que desea eliminar el ciclo "${ciclo.toUpperCase()}"?`)
      ) {
        await fetch(`/api/ciclos/${ciclo}`, { method: "DELETE" });
        // Recargar las listas
        cargarCiclos();
        // Necesitamos initUserFormEvents aquí para actualizar el select, pero lo exportamos
        window.dispatchEvent(new CustomEvent("cyclesUpdated"));
      }
    };
  });

  // 🚀 ACTUALIZAR SELECT DE USUARIO
  const selectCiclo = document.getElementById("ciclo");
  if (selectCiclo) {
    selectCiclo.innerHTML = '<option value="">Selecciona ciclo</option>';
    data.ciclos.forEach((ciclo) => {
      const option = document.createElement("option");
      option.value = ciclo;
      option.textContent = ciclo.charAt(0).toUpperCase() + ciclo.slice(1);
      selectCiclo.appendChild(option);
    });
  }
}

/**
 * Inicializa los eventos del formulario de agregar ciclo.
 */
export function initCicloFormEvents() {
  const form = document.getElementById("form-agregar-ciclo");
  if (form) {
    form.onsubmit = async function (e) {
      e.preventDefault();
      const nombre = document
        .getElementById("nuevo-ciclo-nombre")
        .value.trim()
        .toLowerCase();
      if (!nombre) return;

      await fetch("/api/ciclos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre }),
      });

      document.getElementById("nuevo-ciclo-nombre").value = "";
      cargarCiclos();
    };
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
