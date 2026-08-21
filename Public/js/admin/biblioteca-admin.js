// Public/js/admin/biblioteca-admin.js

export function initBibliotecaAdmin() {
  const vistaBib = document.getElementById("vista-biblioteca");
  if (!vistaBib) return;

  setupSubtabs();
  setupSeccionesYLibros();
  setupControlPrestamos();
  cargarTodoBibliotecaAdmin();
}

// 1. Manejo de Sub-Pestañas Internas
function setupSubtabs() {
  const subtabs = [
    { btn: "subtab-bib-estantes", panel: "bib-panel-estantes" },
    { btn: "subtab-bib-gestion", panel: "bib-panel-gestion" },
    { btn: "subtab-bib-prestamos", panel: "bib-panel-prestamos" },
  ];

  subtabs.forEach(({ btn, panel }) => {
    const btnEl = document.getElementById(btn);
    if (!btnEl) return;

    btnEl.addEventListener("click", () => {
      subtabs.forEach((item) => {
        document.getElementById(item.btn)?.classList.remove("active");
        const p = document.getElementById(item.panel);
        if (p) p.style.display = "none";
      });

      btnEl.classList.add("active");
      const targetPanel = document.getElementById(panel);
      if (targetPanel) targetPanel.style.display = "block";

      cargarTodoBibliotecaAdmin();
    });
  });
}

// 2. Cargar Todo (Estantes, Catálogo, Préstamos y Select de Secciones)
export async function cargarTodoBibliotecaAdmin() {
  try {
    const res = await fetch("/api/biblioteca");
    const data = await res.json();

    if (data.exito) {
      renderAdminBookshelf(data.secciones, data.libros);
      renderCatalogoLibros(data.libros);
      populateSeccionesSelect(data.secciones);
    }
  } catch (err) {
    console.error("Error al cargar biblioteca admin:", err);
  }

  cargarPrestamosAdmin();
}

// 3. Renderizar Estantería Visual en Admin
function renderAdminBookshelf(secciones, libros) {
  const container = document.getElementById("admin-bookshelf-container");
  if (!container) return;

  const searchInput = document.getElementById("admin-book-search");
  const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : "";

  let html = "";
  let seccionesMostradas = 0;

  secciones.forEach((seccion) => {
    const librosSeccion = libros.filter(
      (l) =>
        l.seccion.toUpperCase() === seccion.toUpperCase() &&
        (!searchTerm ||
          l.titulo.toLowerCase().includes(searchTerm) ||
          l.codigo.toLowerCase().includes(searchTerm))
    );

    // Ocultar la sección si hay búsqueda activa y no hay libros que coincidan
    if (searchTerm && librosSeccion.length === 0) {
      return;
    }

    seccionesMostradas++;

    html += `
      <div class="shelf-section">
        <div class="shelf-title">
          <span><i class="bi bi-bookmark-star"></i> ESTANTE: ${seccion}</span>
          <button class="btn-delete-seccion" data-seccion="${seccion}" style="background:transparent; border:none; color:#ef4444; cursor:pointer; font-size:0.85rem; padding: 2px 6px; border-radius:4px;" title="Eliminar Sección"><i class="bi bi-trash"></i> Eliminar Sección</button>
        </div>
        <div class="shelf-books-grid">
    `;

    if (librosSeccion.length === 0) {
      html += `<div class="empty-shelf"><i>Sin libros en este estante.</i></div>`;
    } else {
      librosSeccion.forEach((libro) => {
        const isDisp = libro.estado === "disponible";
        const badgeClass = isDisp ? "badge-available" : "badge-borrowed";
        const badgeText = isDisp ? "DISPONIBLE" : "PRESTADO";

        html += `
          <div class="book-card ${isDisp ? "" : "borrowed"}">
            <div class="book-spine"></div>
            <div class="book-details">
              <span class="book-code">${libro.codigo}</span>
              <h4 class="book-title">${libro.titulo}</h4>
              <span class="book-status ${badgeClass}">${badgeText}</span>
            </div>
          </div>
        `;
      });
    }

    html += `
        </div>
      </div>
    `;
  });

  if (searchTerm && seccionesMostradas === 0) {
    html = `<div style="text-align:center; padding: 30px; background:#fff; border-radius:10px; border:1px solid #e2e8f0; color:#64748b;">🔍 No se encontraron libros ni estantes que coincidan con "<b>${searchTerm}</b>".</div>`;
  }

  container.innerHTML = html;

  // Listeners para eliminar sección
  container.querySelectorAll(".btn-delete-seccion").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const sec = e.currentTarget.getAttribute("data-seccion");
      if (confirm(`¿Seguro que desea eliminar la sección "${sec}"?`)) {
        await eliminarSeccion(sec);
      }
    });
  });

  if (searchInput && !searchInput.dataset.listener) {
    searchInput.dataset.listener = "true";
    searchInput.addEventListener("input", () => renderAdminBookshelf(secciones, libros));
  }
}

// 4. Renderizar Catálogo en Tabla con Buscador Dinámico
function renderCatalogoLibros(libros) {
  const tbody = document.getElementById("tabla-catalogo-libros-body");
  if (!tbody) return;

  const searchInput = document.getElementById("search-catalogo-libros");
  const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : "";

  let librosFiltrados = libros || [];

  if (searchTerm) {
    librosFiltrados = librosFiltrados.filter(
      (l) =>
        l.titulo.toLowerCase().includes(searchTerm) ||
        l.codigo.toLowerCase().includes(searchTerm) ||
        l.seccion.toLowerCase().includes(searchTerm)
    );
  }

  if (librosFiltrados.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center"><i>${
      searchTerm ? `No se encontraron libros en el catálogo que coincidan con "${searchTerm}".` : "No hay libros registrados en el catálogo."
    }</i></td></tr>`;
  } else {
    let html = "";
    librosFiltrados.forEach((l) => {
      const isDisp = l.estado === "disponible";
      const statusClass = isDisp ? "status-puntual" : "status-tarde";

      html += `
        <tr>
          <td class="text-center"><b>${l.codigo}</b></td>
          <td class="text-left">${l.titulo}</td>
          <td class="text-center"><span style="background:#f1f5f9; padding:3px 8px; border-radius:4px; font-weight:600; font-size:0.8rem;">${l.seccion}</span></td>
          <td class="text-center ${statusClass}">${l.estado.toUpperCase()}</td>
          <td class="text-center">
            <button class="btn-delete-libro" data-id="${l.id}" style="background:#fef2f2; border:1px solid #fca5a5; color:#dc2626; border-radius:4px; padding:4px 8px; cursor:pointer;" title="Eliminar libro"><i class="bi bi-trash"></i></button>
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
  }

  tbody.querySelectorAll(".btn-delete-libro").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = e.currentTarget.getAttribute("data-id");
      if (confirm("¿Seguro que desea eliminar este libro del catálogo?")) {
        await eliminarLibro(id);
      }
    });
  });

  if (searchInput && !searchInput.dataset.listener) {
    searchInput.dataset.listener = "true";
    searchInput.addEventListener("input", () => renderCatalogoLibros(libros));
  }
}

// Populate select de secciones
function populateSeccionesSelect(secciones) {
  const select = document.getElementById("libro-seccion-select");
  if (!select) return;

  if (!secciones || secciones.length === 0) {
    select.innerHTML = '<option value="">No hay secciones disponibles</option>';
    return;
  }

  select.innerHTML =
    '<option value="">-- Seleccionar Sección --</option>' +
    secciones.map((s) => `<option value="${s}">${s}</option>`).join("");
}

// 5. Setup de Formularios (Secciones y Libros)
function setupSeccionesYLibros() {
  const btnAddSec = document.getElementById("btn-agregar-seccion");
  const inputSec = document.getElementById("nueva-seccion-input");
  const msgSec = document.getElementById("msg-seccion");

  if (btnAddSec && inputSec) {
    btnAddSec.addEventListener("click", async () => {
      const val = inputSec.value.trim();
      if (!val) {
        if (msgSec) msgSec.innerHTML = `<span style="color:red;">Ingrese un nombre para la sección.</span>`;
        return;
      }
      try {
        const res = await fetch("/api/biblioteca/seccion", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nombre: val }),
        });
        const data = await res.json();
        if (data.exito) {
          if (msgSec) msgSec.innerHTML = `<span style="color:green;">✅ ${data.mensaje}</span>`;
          inputSec.value = "";
          cargarTodoBibliotecaAdmin();
        } else {
          if (msgSec) msgSec.innerHTML = `<span style="color:red;">❌ ${data.mensaje}</span>`;
        }
      } catch (err) {
        if (msgSec) msgSec.innerHTML = `<span style="color:red;">Error: ${err.message}</span>`;
      }
    });
  }

  const formLibro = document.getElementById("form-agregar-libro");
  const msgLibro = document.getElementById("msg-libro");

  if (formLibro) {
    formLibro.addEventListener("submit", async (e) => {
      e.preventDefault();
      const titulo = document.getElementById("libro-titulo-input").value;
      const codigo = document.getElementById("libro-codigo-input").value;
      const seccion = document.getElementById("libro-seccion-select").value;

      try {
        const res = await fetch("/api/biblioteca/libro", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ titulo, codigo, seccion }),
        });
        const data = await res.json();
        if (data.exito) {
          if (msgLibro) msgLibro.innerHTML = `<span style="color:green;">✅ ${data.mensaje}</span>`;
          formLibro.reset();
          cargarTodoBibliotecaAdmin();
        } else {
          if (msgLibro) msgLibro.innerHTML = `<span style="color:red;">❌ ${data.mensaje}</span>`;
        }
      } catch (err) {
        if (msgLibro) msgLibro.innerHTML = `<span style="color:red;">Error: ${err.message}</span>`;
      }
    });
  }
}

async function eliminarSeccion(nombre) {
  try {
    const res = await fetch(`/api/biblioteca/seccion/${encodeURIComponent(nombre)}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (data.exito) {
      cargarTodoBibliotecaAdmin();
    } else {
      alert(`Error: ${data.mensaje}`);
    }
  } catch (err) {
    alert(`Error de red: ${err.message}`);
  }
}

async function eliminarLibro(id) {
  try {
    const res = await fetch(`/api/biblioteca/libro/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (data.exito) {
      cargarTodoBibliotecaAdmin();
    } else {
      alert(`Error: ${data.mensaje}`);
    }
  } catch (err) {
    alert(`Error de red: ${err.message}`);
  }
}

// 6. Setup de Control de Préstamos y Devoluciones
function setupControlPrestamos() {
  const filterEstado = document.getElementById("filter-prestamos-estado");
  const searchInput = document.getElementById("search-prestamos");

  if (filterEstado) filterEstado.addEventListener("change", cargarPrestamosAdmin);
  if (searchInput) searchInput.addEventListener("input", cargarPrestamosAdmin);
}

async function cargarPrestamosAdmin() {
  const tbody = document.getElementById("tabla-prestamos-body");
  if (!tbody) return;

  try {
    const res = await fetch("/api/biblioteca/prestamos");
    const data = await res.json();

    if (!data.exito || !data.prestamos) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center"><i>No se pudieron cargar los préstamos.</i></td></tr>`;
      return;
    }

    const filterEstado = document.getElementById("filter-prestamos-estado")?.value || "todos";
    const searchTerm = document.getElementById("search-prestamos")?.value.trim().toLowerCase() || "";

    let prestamos = data.prestamos;

    if (filterEstado !== "todos") {
      prestamos = prestamos.filter((p) => p.estado === filterEstado);
    }

    if (searchTerm) {
      prestamos = prestamos.filter(
        (p) =>
          p.nombreUsuario.toLowerCase().includes(searchTerm) ||
          p.codigoUsuario.toLowerCase().includes(searchTerm) ||
          p.tituloLibro.toLowerCase().includes(searchTerm) ||
          p.codigoLibro.toLowerCase().includes(searchTerm)
      );
    }

    if (prestamos.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center"><i>No hay registros de préstamos con los filtros aplicados.</i></td></tr>`;
      return;
    }

    let html = "";
    prestamos.forEach((p) => {
      const isPrestado = p.estado === "prestado";
      const statusClass = isPrestado ? "status-tolerancia" : "status-puntual";
      const statusLabel = isPrestado ? "PRESTADO" : "DEVUELTO";

      html += `
        <tr>
          <td class="text-center"><b>${p.codigoLibro}</b></td>
          <td class="text-left">${p.tituloLibro}</td>
          <td class="text-left"><b>${p.nombreUsuario}</b> <br><small style="color:#64748b;">${p.codigoUsuario}</small></td>
          <td class="text-center">${p.ciclo} / ${p.turno}</td>
          <td class="text-center">${p.fechaPrestamo}</td>
          <td class="text-center">${p.fechaDevolucion || "-"}</td>
          <td class="text-center ${statusClass}">${statusLabel}</td>
          <td class="text-center">
            ${
              isPrestado
                ? `<button class="btn-marcar-devuelto btn-form-submit" data-id="${p.id}" style="padding: 5px 10px; font-size: 0.8rem; background: #059669;"><i class="bi bi-check2-circle"></i> Devolver</button>`
                : `<span style="color:#059669; font-weight:600; font-size:0.85rem;"><i class="bi bi-check-all"></i> Concluido</span>`
            }
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = html;

    tbody.querySelectorAll(".btn-marcar-devuelto").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        const idPr = e.currentTarget.getAttribute("data-id");
        if (confirm("¿Confirmar recepción y marcar libro como DEVUELTO?")) {
          await registrarDevolucion(idPr);
        }
      });
    });
  } catch (err) {
    console.error("Error al cargar préstamos admin:", err);
    tbody.innerHTML = `<tr><td colspan="8" class="text-center" style="color:red;">Error al cargar préstamos: ${err.message}</td></tr>`;
  }
}

async function registrarDevolucion(idPrestamo) {
  try {
    const res = await fetch("/api/biblioteca/devolucion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idPrestamo }),
    });

    const data = await res.json();
    if (data.exito) {
      cargarTodoBibliotecaAdmin();
    } else {
      alert(`Error al registrar devolución: ${data.mensaje}`);
    }
  } catch (err) {
    alert(`Error de conexión: ${err.message}`);
  }
}
