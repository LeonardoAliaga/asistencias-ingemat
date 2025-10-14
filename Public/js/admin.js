function crearListaUsuarios(usuarios, esDocente = false) {
  return usuarios
    .map(
      (u) => `
    <li style="position:relative;">
      ${u.codigo} - ${u.nombre}${!esDocente ? ` (${u.turno})` : ""}
      <span class="btn-eliminar" style="display:none;position:absolute;right:5px;cursor:pointer;color:red;font-weight:bold;">
        <i class="bi bi-x-circle-fill"></i>
      </span>
    </li>
  `
    )
    .join("");
}

function agregarEventosEliminar() {
  document.querySelectorAll(".btn-eliminar").forEach((btn) => {
    btn.parentElement.onmouseenter = () => (btn.style.display = "inline");
    btn.parentElement.onmouseleave = () => (btn.style.display = "none");
    btn.onclick = async function (e) {
      e.stopPropagation();
      // Obtener el nombre para el mensaje de confirmación
      const nombreCompleto = btn.parentElement.textContent.trim();
      const nombre = nombreCompleto.split(" - ")[1]
        ? nombreCompleto.split(" - ")[1].split("(")[0].trim()
        : nombreComplepto.split(" - ")[0].trim();

      if (confirm(`¿Seguro que deseas eliminar a:\n${nombre}?`)) {
        const codigo = btn.parentElement.textContent.split(" - ")[0].trim();
        await fetch(`/api/usuarios/${codigo}`, { method: "DELETE" });
        // Recargar ambas vistas después de la eliminación
        cargarUsuarios(true);
      }
    };
  });
}

/**
 * Carga y renderiza la lista de usuarios en las diferentes vistas.
 * @param {boolean} forceReload Indica si debe recargar las dos vistas.
 */
async function cargarUsuarios(forceReload = false) {
  const res = await fetch("/api/usuarios");
  const usuarios = await res.json();

  // Separar alumnos por ciclo
  const ciclos = {};
  const docentes = [];
  usuarios.forEach((u) => {
    if (u.rol === "estudiante") {
      if (!ciclos[u.ciclo]) ciclos[u.ciclo] = [];
      ciclos[u.ciclo].push(u);
    } else {
      docentes.push(u);
    }
  });

  // ====================================================
  // 🟢 VISTA ESTUDIANTES COMPLETA (Separada por ciclo)
  // ====================================================
  const alumnosCompletaDiv = document.getElementById("vista-alumnos");
  alumnosCompletaDiv.innerHTML = "";
  Object.keys(ciclos).forEach((ciclo) => {
    // 💡 LÓGICA DE DOBLE ORDENACIÓN PARA ESTUDIANTES: Turno y luego Alfabético
    ciclos[ciclo].sort((a, b) => {
      // 1. Comparar por turno (Mañana primero)
      if (a.turno === "mañana" && b.turno === "tarde") return -1;
      if (a.turno === "tarde" && b.turno === "mañana") return 1;

      // 2. Si los turnos son iguales, ordenar por nombre alfabéticamente
      return a.nombre.localeCompare(b.nombre, "es");
    });

    alumnosCompletaDiv.innerHTML += `<h3>CICLO ${ciclo.toUpperCase()} (${
      ciclos[ciclo].length
    } Alumnos)</h3><ul>${crearListaUsuarios(ciclos[ciclo])}</ul>`;
  });

  // ====================================================
  // 🟢 VISTA DOCENTES (Resumen en el Dashboard)
  // ====================================================

  // APLICAR ORDEN ALFABÉTICO POR NOMBRE a los docentes (sin turno)
  docentes.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  const docentesDiv = document.getElementById("vista-docentes");
  docentesDiv.innerHTML = `<ul>${crearListaUsuarios(docentes, true)}</ul>`;

  agregarEventosEliminar();
}

// ====================================================
// 🟢 LÓGICA DE VISTAS (Pestañas del Navbar)
// ====================================================
function mostrarVista(vistaId, buttonId) {
  document.querySelectorAll(".vista-content").forEach((el) => {
    el.style.display = "none";
  });
  document.getElementById(vistaId).style.display = "block";

  document.querySelectorAll(".nav-button").forEach((btn) => {
    btn.classList.remove("active");
  });
  document.getElementById(buttonId).classList.add("active");

  // Si cambiamos a la vista de estudiantes, aseguramos que se recargue
  if (vistaId === "vista-alumnos-completa") {
    cargarUsuarios();
  }
}

document.getElementById("btn-vista-inicio").onclick = () => {
  mostrarVista("vista-principal", "btn-vista-inicio");
  // Forzamos la recarga de los módulos del dashboard (docentes, horarios, excel)
  cargarUsuarios();
  cargarArchivosExcel();
  cargarHorarios();
};

document.getElementById("btn-vista-alumnos").onclick = () => {
  mostrarVista("vista-alumnos-completa", "btn-vista-alumnos");
  cargarUsuarios(); // Cargar la vista detallada
};

// ====================================================
// FIN LÓGICA DE VISTAS
// ====================================================

// Agregar usuario
document.getElementById("form-agregar").onsubmit = async function (e) {
  e.preventDefault();
  const codigo = document.getElementById("codigo").value.trim();
  const nombre = document.getElementById("nombre").value.trim();
  const rol = document.getElementById("rol").value;
  const turno = document.getElementById("turno").value;
  const ciclo = document.getElementById("ciclo").value;

  if (!codigo || !nombre || !rol) {
    alert("Todos los campos son obligatorios.");
    return;
  }
  if (rol === "estudiante" && (!turno || !ciclo)) {
    alert("El turno y ciclo son obligatorios para estudiantes.");
    return;
  }

  await fetch("/api/usuarios", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ codigo, nombre, rol, turno, ciclo }),
  });
  cargarUsuarios(true); // Recarga forzada para ambas vistas
  this.reset();
};

document.getElementById("rol").onchange = function () {
  const esEstudiante = this.value === "estudiante";
  document.getElementById("turno").disabled = !esEstudiante;
  document.getElementById("ciclo").disabled = !esEstudiante;
  if (!esEstudiante) {
    document.getElementById("turno").value = "";
    document.getElementById("ciclo").value = "";
  }
};

async function cargarHorarios() {
  const res = await fetch("/api/horarios");
  const horarios = await res.json();
  document.getElementById("entrada-manana").value = horarios.mañana.entrada;
  document.getElementById("tolerancia-manana").value =
    horarios.mañana.tolerancia;
  document.getElementById("entrada-tarde").value = horarios.tarde.entrada;
  document.getElementById("tolerancia-tarde").value = horarios.tarde.tolerancia;
}

document.getElementById("form-horarios").onsubmit = async function (e) {
  e.preventDefault();
  const entradaManana = document.getElementById("entrada-manana").value;
  const toleranciaManana = document.getElementById("tolerancia-manana").value;
  const entradaTarde = document.getElementById("entrada-tarde").value;
  const toleranciaTarde = document.getElementById("tolerancia-tarde").value;

  const res = await fetch("/api/horarios", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mañana: { entrada: entradaManana, tolerancia: toleranciaManana },
      tarde: { entrada: entradaTarde, tolerancia: toleranciaTarde },
    }),
  });
  const data = await res.json();

  const msgDiv = document.getElementById("msg-horarios");
  msgDiv.textContent = data.mensaje || "Horarios guardados";
  // Muestra el mensaje
  msgDiv.style.display = "block";

  // Oculta el mensaje después de 3 segundos
  setTimeout(() => {
    msgDiv.textContent = "";
    // Oculta el contenedor
    msgDiv.style.display = "none";
  }, 3000);
};

document.getElementById("form-password").onsubmit = async function (e) {
  e.preventDefault();
  const nueva = document.getElementById("nueva-password").value;
  const res = await fetch("/admin/password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nueva }),
  });
  const data = await res.json();

  const msgDiv = document.getElementById("msg-password");
  msgDiv.textContent = data.mensaje;
  this.reset();
  // Muestra el mensaje
  msgDiv.style.display = "block";

  // Oculta el mensaje después de 3 segundos
  setTimeout(() => {
    msgDiv.textContent = "";
    // Oculta el contenedor
    msgDiv.style.display = "none";
  }, 3000);
};

document.getElementById("btn-logout").onclick = async function () {
  await fetch("/admin/logout", { method: "POST" });
  window.location.href = "/admin";
};

// ====================================================
// 🟢 LÓGICA DE VISTA PREVIA (Actualizada)
// ====================================================

/**
 * Convierte el contenido "CSV" plano en una tabla HTML, detectando Títulos y Encabezados.
 * @param {string} csvText Contenido del texto extraído del XLSX.
 * @returns {string} HTML de la tabla con clases de estilo.
 */
function csvToHtmlTable(csvText) {
  const rows = csvText.trim().split("\n");
  if (rows.length === 0) return "<p>El archivo está vacío.</p>";

  // Usamos el cuerpo de la tabla (tbody) y clases para los estilos sticky
  let html = "<table><thead></thead><tbody>";
  let isHeaderRow = false; // Flag para forzar la detección del encabezado de columna después de un título

  rows.forEach((line) => {
    const cells = line.split(",");

    // 1. Detección de Fila de Título de Sección (solo una celda con el texto de registro)
    if (cells.length === 1 && cells[0].startsWith("REGISTRO DE ASISTENCIA")) {
      // Renderizamos una fila con una sola celda fusionada en el TBODY, y le aplicamos la clase title-cell
      html += `<tr class="table-title"><td colspan="4" class="table-title-cell">${cells[0]}</td></tr>`;
      isHeaderRow = true; // La siguiente fila debe ser el encabezado de columna
      return;
    }

    // 2. Detección de Fila de Encabezado de Tabla (ALUMNO, DOCENTE, etc.)
    const isFirstCellHeader =
      cells[0].toUpperCase().includes("ALUMNO") ||
      cells[0].toUpperCase().includes("DOCENTE");

    if (isHeaderRow || isFirstCellHeader) {
      html += '<tr class="table-header">';
      cells.forEach((cell) => {
        // Usamos <th> para encabezados de columna
        html += `<th>${cell.trim()}</th>`;
      });
      html += "</tr>";
      isHeaderRow = false; // Ya procesamos el encabezado, volvemos a modo datos
      return;
    }

    // 3. Fila de Datos Normal
    html += '<tr class="table-data">';
    cells.forEach((cell) => {
      html += `<td>${cell.trim()}</td>`;
    });
    html += "</tr>";
  });

  html += "</tbody></table>";
  return html;
}

async function mostrarPreview(archivo) {
  const modal = document.getElementById("preview-modal");
  const previewContent = document.getElementById("preview-content");
  const previewFilename = document.getElementById("preview-filename");

  previewFilename.textContent = archivo;
  previewContent.innerHTML = "Cargando...";
  modal.style.display = "block";

  try {
    const res = await fetch(`/api/excel/preview/${archivo}`);
    const data = await res.json();

    if (data.exito) {
      // Usa la nueva función para convertir el texto CSV en tabla HTML
      previewContent.innerHTML = csvToHtmlTable(data.content);
    } else {
      previewContent.innerHTML = `<p style="color:red;">Error: ${data.mensaje}</p>`;
    }
  } catch (error) {
    previewContent.innerHTML = `<p style="color:red;">Error al conectar con el servidor.</p>`;
  }
}

// Evento para cerrar el modal
document.getElementById("close-preview").onclick = function () {
  document.getElementById("preview-modal").style.display = "none";
};

// Cerrar el modal al hacer clic fuera de él
window.onclick = function (event) {
  const modal = document.getElementById("preview-modal");
  if (event.target == modal) {
    modal.style.display = "none";
  }
};

// Descargar archivos Excel (Modificada para incluir el botón de Preview)
async function cargarArchivosExcel() {
  const res = await fetch("/api/excel");
  const archivos = await res.json();
  const excelDiv = document.getElementById("archivos-excel");

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

  // Añadir eventos al botón de previsualización
  document.querySelectorAll(".btn-preview").forEach((button) => {
    button.addEventListener("click", (e) => {
      const filename = e.currentTarget.getAttribute("data-filename");
      mostrarPreview(filename);
    });
  });
}

// ====================================================
// FIN LÓGICA DE VISTA PREVIA
// ====================================================

window.onload = function () {
  // Al cargar la página, se muestra la vista de inicio por defecto
  mostrarVista("vista-principal", "btn-vista-inicio");

  // Se cargan los datos por primera vez para llenar el dashboard
  cargarUsuarios();
  cargarArchivosExcel();
  cargarHorarios();
};
