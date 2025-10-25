// Proyecto/Public/js/admin/excel-preview.js

/**
 * Convierte el contenido "CSV" plano en una tabla HTML, detectando Títulos y Encabezados,
 * y aplicando clases de estado a la celda de hora.
 */
function csvToHtmlTable(csvText) {
  const rows = csvText.trim().split("\n");
  if (rows.length === 0) return "<p>El archivo está vacío.</p>";

  let html = "<table><tbody>";
  const csvRegex = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/; // Regex para dividir CSV

  rows.forEach((line) => {
    // Si la línea está completamente vacía, genera una fila vacía para espaciado
    if (line.trim() === "") {
      // html += '<tr><td colspan="5" style="height: 10px; border: none;"></td></tr>'; // Fila vacía como separador
      return; // O simplemente ignorarla
    }

    const cells = line.split(csvRegex);
    // Limpiar comillas y espacios, ahora esperamos 6 celdas
    const cleanedCells = cells.map((cell) =>
      cell.trim().replace(/^"(.*)"$/, "$1")
    );

    // Asegurar que siempre haya 6 elementos (rellenar con vacíos si faltan)
    while (cleanedCells.length < 6) {
      cleanedCells.push("");
    }

    // 1. Detección Fila Título Sección (solo tiene contenido en la primera celda)
    if (
      cleanedCells[0].startsWith("REGISTRO DE ASISTENCIA") &&
      cleanedCells.slice(1, 5).every((c) => c === "")
    ) {
      html += `<tr class="table-title"><td colspan="5" class="table-title-cell">${cleanedCells[0]}</td></tr>`;
      return; // Pasar a la siguiente línea
    }

    // 2. Detección Fila Encabezado (primera celda contiene N°)
    const isHeaderRow = cleanedCells[0].toUpperCase().includes("N°");
    if (isHeaderRow) {
      html += '<tr class="table-header">';
      // Mostrar solo las primeras 5 columnas como encabezados visibles
      cleanedCells.slice(0, 5).forEach((cell) => {
        html += `<th>${cell}</th>`;
      });
      html += "</tr>";
      return; // Pasar a la siguiente línea
    }

    // 3. FILA DE DATOS NORMAL (verificar si la primera celda es un número)
    const cellNro = cleanedCells[0];
    // Verificar que sea un número y no esté vacío
    if (!isNaN(parseInt(cellNro)) && cellNro.trim().length > 0) {
      const statusClass = cleanedCells[5] ? `status-${cleanedCells[5]}` : ""; // Obtener clase de la 6ta columna

      html += '<tr class="table-data">';
      // Iterar por las 5 celdas de datos visibles
      cleanedCells.slice(0, 5).forEach((cell, index) => {
        if (index === 4) {
          // Si es la celda de la HORA (índice 4 = 5ta columna)
          html += `<td class="${statusClass}">${cell}</td>`; // Añadir la clase de estado
        } else {
          html += `<td>${cell}</td>`; // Celda normal
        }
      });
      html += "</tr>";
    }
    // Ignorar otras líneas que no sean título, encabezado o datos válidos
  }); // Fin forEach row

  html += "</tbody></table>";
  return html;
}

// --- Resto de funciones (mostrarPreview, cargarArchivosExcel, etc.) SIN CAMBIOS ---

/**
 * Muestra el modal y carga el contenido del archivo Excel (XLSX).
 */
async function mostrarPreview(archivo) {
  const modal = document.getElementById("preview-modal");
  const previewContent = document.getElementById("preview-content");
  const previewFilename = document.getElementById("preview-filename");

  if (!modal || !previewContent || !previewFilename) return; // Asegurar que existan

  previewFilename.textContent = archivo;
  previewContent.innerHTML = "<p><i>Cargando vista previa...</i></p>"; // Mensaje de carga
  modal.style.display = "block";

  try {
    const res = await fetch(`/api/excel/preview/${archivo}`);
    if (!res.ok) {
      // Capturar errores HTTP
      const errorData = await res.json().catch(() => ({})); // Intentar leer JSON de error
      throw new Error(
        errorData.mensaje || `Error ${res.status} al obtener vista previa`
      );
    }
    const data = await res.json();

    if (data.exito && data.content) {
      previewContent.innerHTML = csvToHtmlTable(data.content);
    } else {
      // Usar data.mensaje si existe, sino un mensaje genérico
      previewContent.innerHTML = `<p style="color:red;">Error: ${
        data.mensaje || "No se pudo generar la vista previa del contenido."
      }</p>`;
    }
  } catch (error) {
    console.error("Error al obtener vista previa:", error);
    previewContent.innerHTML = `<p style="color:red;">Error al procesar el archivo: ${error.message}</p>`;
  }
}

/**
 * Carga la lista de archivos Excel y asigna eventos de descarga/previsualización.
 */
export async function cargarArchivosExcel() {
  const excelDiv = document.getElementById("archivos-excel");
  if (!excelDiv) return;

  excelDiv.innerHTML = "<i>Cargando archivos...</i>"; // Indicador de carga

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
        (a) =>
          `
                  <div class="excel-item">
                      <a href="/api/excel/${a}" download title="Descargar ${a}"><i class="bi bi-file-earmark-arrow-down-fill"></i> ${a}</a>
                      <button class="btn-preview" data-filename="${a}" title="Vista Previa de ${a}"><i class="bi bi-eye-fill"></i></button>
                  </div>
                  `
      )
      .join("");

    // Reasignar eventos a los nuevos botones
    document
      .querySelectorAll("#archivos-excel .btn-preview")
      .forEach((button) => {
        button.addEventListener("click", (e) => {
          const filename = e.currentTarget.getAttribute("data-filename");
          if (filename) {
            // Asegurarse que el atributo existe
            mostrarPreview(filename);
          } else {
            console.error(
              "Botón de vista previa sin atributo data-filename:",
              e.currentTarget
            );
          }
        });
      });
  } catch (error) {
    console.error("Error al cargar archivos Excel:", error);
    excelDiv.innerHTML =
      '<p style="color: red;">Error al cargar la lista de archivos.</p>';
  }
}

/**
 * Carga la lista de ciclos y asigna eventos de eliminación.
 * También actualiza el select de ciclos en el formulario de agregar usuario.
 */
export async function cargarCiclos() {
  const listContainer = document.getElementById("ciclos-list");
  const selectCiclo = document.getElementById("ciclo"); // Referencia al select de usuario

  if (listContainer) listContainer.innerHTML = "<i>Cargando ciclos...</i>";
  if (selectCiclo)
    selectCiclo.innerHTML = '<option value="">Cargando...</option>';

  try {
    const res = await fetch("/api/ciclos");
    if (!res.ok) throw new Error(`Error ${res.status}`);
    const data = await res.json();

    // Actualizar lista de gestión de ciclos
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

        // Reasignar eventos de eliminación
        document
          .querySelectorAll("#ciclos-list .btn-eliminar-ciclo")
          .forEach((btn) => {
            btn.onclick = async function () {
              const ciclo = this.getAttribute("data-ciclo");
              if (
                confirm(
                  `¿Seguro que desea eliminar el ciclo "${ciclo.toUpperCase()}"?\n¡Esto NO se puede deshacer!`
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
                  // Recargar las listas después de eliminar
                  await cargarCiclos(); // Llama de nuevo a esta función para refrescar todo
                  // Notificar a user.js para actualizar su select (si es necesario, aunque cargarCiclos ya lo hace)
                  // window.dispatchEvent(new CustomEvent("cyclesUpdated"));
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
    } // Fin if(listContainer)

    // Actualizar select en formulario de agregar usuario
    if (selectCiclo) {
      selectCiclo.innerHTML = '<option value="">Selecciona ciclo</option>'; // Opción por defecto
      if (data.ciclos && data.ciclos.length > 0) {
        data.ciclos.forEach((ciclo) => {
          const option = document.createElement("option");
          option.value = ciclo;
          option.textContent = ciclo.charAt(0).toUpperCase() + ciclo.slice(1);
          selectCiclo.appendChild(option);
        });
      } else {
        selectCiclo.innerHTML = '<option value="">No hay ciclos</option>'; // Indicar si no hay ciclos
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

/**
 * Inicializa los eventos del formulario de agregar ciclo.
 * (Movido a admin.js para centralizar la lógica de formularios)
 */
export function initCicloFormEvents() {
  // Esta función ahora solo existe para mantener la importación en admin.js,
  // pero la lógica real del submit está en admin.js
  console.log("initCicloFormEvents llamado (lógica en admin.js)");
}

/**
 * Inicializa los eventos de cierre del modal.
 */
export function initModalEvents() {
  const closeBtn = document.getElementById("close-preview");
  const modal = document.getElementById("preview-modal");

  if (closeBtn && modal) {
    // Asegurarse que ambos existen
    closeBtn.onclick = function () {
      modal.style.display = "none";
    };
  }

  if (modal) {
    window.onclick = function (event) {
      if (event.target == modal) {
        modal.style.display = "none";
      }
    };
    // Cerrar con tecla Escape
    window.addEventListener("keydown", function (event) {
      if (event.key === "Escape" || event.key === "Esc") {
        if (modal.style.display === "block") {
          modal.style.display = "none";
        }
      }
    });
  }
}
