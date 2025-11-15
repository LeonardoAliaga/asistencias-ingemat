// Public/js/admin-info.js
document.addEventListener("DOMContentLoaded", () => {
  // --- Selectores GESTOR DE CICLOS ---
  const btn = document.getElementById("btn-vista-info");
  const infoView = document.getElementById("info-section");
  const btnAdd = document.getElementById("btn-add-ciclo");
  const modal = document.getElementById("ciclo-form-modal");
  const closeBtn = document.getElementById("close-ciclo-form");
  const form = document.getElementById("ciclo-form");
  const list = document.getElementById("info-list");
  const cancelBtn = document.getElementById("ciclo-cancel");
  const slugInput = document.getElementById("ciclo-slug");

  // --- Selectores GESTOR DE CARRUSEL (NUEVOS) ---
  const fileInput = document.getElementById("carousel-upload-input");
  const uploadNameInput = document.getElementById("carousel-upload-name"); // <-- AÑADIDO
  const previewContainer = document.getElementById(
    "carousel-preview-container"
  );
  const previewImage = document.getElementById("carousel-preview");
  const previewDims = document.getElementById("carousel-preview-dims");
  const uploadBtn = document.getElementById("btn-upload-carousel");
  const imageListContainer = document.getElementById("carousel-list-container");
  const uploadMsg = document.getElementById("msg-carousel-upload");

  // --- Lógica GESTOR DE CICLOS ---
  if (btn && infoView) {
    // Nada adicional: `admin.js` mostrará la vista principal y activará el botón.
  }

  btnAdd &&
    btnAdd.addEventListener("click", () => {
      openForm();
    });
  closeBtn && closeBtn.addEventListener("click", closeForm);
  cancelBtn && cancelBtn.addEventListener("click", closeForm);

  if (slugInput) {
    slugInput.addEventListener("input", (e) => {
      e.target.value = sanitizeSlug(e.target.value);
    });
  }

  let editingSlug = null;

  function sanitizeSlug(text) {
    return text
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9\-]/g, "")
      .replace(/-+/g, "-");
  }

  function openForm(ciclo) {
    modal.style.display = "block";
    document.body.style.overflow = "hidden";
    if (ciclo) {
      editingSlug = ciclo.slug;
      document.getElementById("ciclo-form-title").textContent = "Editar Ciclo";
      document.getElementById("ciclo-titulo").value = ciclo.titulo || "";
      document.getElementById("ciclo-slug").value = ciclo.slug || "";
      document.getElementById("ciclo-descripcion").value =
        ciclo.descripcion || "";
      document.getElementById("ciclo-beneficios").value = (
        ciclo.beneficios || []
      ).join("\n");
      const current =
        (ciclo.priceHistory || []).find((p) => p.to === null) || {};
      document.getElementById("ciclo-price").value = current.price || "";
      document.getElementById("ciclo-published").checked = !!ciclo.published;
    } else {
      editingSlug = null;
      document.getElementById("ciclo-form-title").textContent = "Agregar Ciclo";
      form.reset();
    }
  }
  function closeForm() {
    modal.style.display = "none";
    document.body.style.overflow = "";
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const slug = document.getElementById("ciclo-slug").value.trim();
    if (!slug || !/^[a-z0-9\-]+$/.test(slug)) {
      alert("Slug inválido. Solo minúsculas, números y guiones permitidos.");
      return;
    }
    const payload = {
      titulo: document.getElementById("ciclo-titulo").value.trim(),
      slug: slug,
      descripcion: document.getElementById("ciclo-descripcion").value.trim(),
      beneficios: document
        .getElementById("ciclo-beneficios")
        .value.split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      price: document.getElementById("ciclo-price").value
        ? Number(document.getElementById("ciclo-price").value)
        : undefined,
      published: document.getElementById("ciclo-published").checked,
    };
    if (!payload.titulo || !payload.slug) {
      alert("Título y Slug son obligatorios.");
      return;
    }
    try {
      if (!editingSlug) {
        const res = await fetch("/api/ciclos-visual", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (data.exito) {
          closeForm();
          loadList();
        } else alert("Error: " + (data.mensaje || ""));
      } else {
        const res = await fetch(
          "/api/ciclos-visual/" + encodeURIComponent(editingSlug),
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }
        );
        const data = await res.json();
        if (data.exito) {
          closeForm();
          loadList();
        } else alert("Error: " + (data.mensaje || ""));
      }
    } catch (err) {
      console.error(err);
      alert("Error guardando");
    }
  });

  async function loadList() {
    try {
      const res = await fetch("/api/ciclos-visual");
      const data = await res.json();
      if (!data.exito) return;
      renderList(data.ciclos || []);
    } catch (err) {
      console.error(err);
    }
  }

  function renderList(ciclos) {
    list.innerHTML = "";
    if (!ciclos.length) {
      list.innerHTML =
        "<p style='color: #999; text-align: center;'>No hay ciclos agregados.</p>";
      return;
    }
    ciclos.sort((a, b) => (a.orden || 0) - (b.orden || 0));
    ciclos.forEach((c) => {
      const div = document.createElement("div");
      div.className = "ciclo-admin-item";
      const current = (c.priceHistory || []).find((p) => p.to === null) || {};
      const prev = (c.priceHistory || []).slice().reverse()[1] || null;

      // --- INICIO CORRECCIÓN 1: HTML COMPLETO DE LA TARJETA DE CICLO ---
      div.innerHTML = `
        <div class="ciclo-admin-header">
          <div class="ciclo-admin-title">
            <h4>${c.titulo}</h4>
            <span class="ciclo-slug">${c.slug}</span>
          </div>
          <div class="ciclo-admin-status">
            ${
              c.published
                ? '<span class="badge-published">Publicado</span>'
                : '<span class="badge-draft">Borrador</span>'
            }
          </div>
        </div>
        <div class="ciclo-admin-body">
          <p class="ciclo-desc">${(c.descripcion || "").substring(0, 100)}${
        (c.descripcion || "").length > 100 ? "..." : ""
      }</p>
          <div class="ciclo-benefits-preview">
            ${
              c.beneficios && c.beneficios.length > 0
                ? `<strong>${c.beneficios.length} beneficio${
                    c.beneficios.length !== 1 ? "s" : ""
                  }</strong>`
                : ""
            }
          </div>
          <div class="ciclo-price-preview">
            ${
              current.price
                ? `<strong>S/ ${current.price}</strong>`
                : '<span style="color: #999;">Sin precio</span>'
            }
            ${
              prev
                ? `<span class="price-history">(era S/ ${prev.price})</span>`
                : ""
            }
          </div>
        </div>
        <div class="ciclo-admin-actions">
          <button class="btn-admin-edit" data-edit="${
            c.slug
          }"><i class="bi bi-pencil-square"></i> Editar</button>
          <button class="btn-admin-delete" data-delete="${
            c.slug
          }"><i class="bi bi-trash"></i> Eliminar</button>
        </div>
      `;
      // --- FIN CORRECCIÓN 1 ---
      list.appendChild(div);
    });

    // bind events
    list.querySelectorAll("[data-edit]").forEach((b) =>
      b.addEventListener("click", (ev) => {
        const slug = ev.currentTarget.getAttribute("data-edit");
        const ciclo = ciclos.find((x) => x.slug === slug);
        if (ciclo) openForm(ciclo);
      })
    );
    list.querySelectorAll("[data-delete]").forEach((b) =>
      b.addEventListener("click", async (ev) => {
        const slug = ev.currentTarget.getAttribute("data-delete");
        if (!confirm("¿Eliminar el ciclo '" + slug + "'?")) return;
        try {
          const res = await fetch(
            "/api/ciclos-visual/" + encodeURIComponent(slug),
            { method: "DELETE" }
          );
          const data = await res.json();
          if (data.exito) loadList();
          else alert("Error: " + (data.mensaje || ""));
        } catch (err) {
          console.error(err);
          alert("Error eliminando");
        }
      })
    );
  }

  // --- Lógica GESTOR DE CARRUSEL (NUEVA) ---

  let currentBase64Image = null;
  const targetWidth = 1080;
  const targetHeight = 1080;
  let isResolutionValid = false; // <-- AÑADIDO

  function showCarouselMessage(message, isError = false) {
    uploadMsg.textContent = message;
    uploadMsg.className = isError
      ? "form-message error"
      : "form-message success";
    uploadMsg.style.display = "block";
  }

  // --- FUNCIÓN MODIFICADA ---
  function validateUploadButton() {
    const name = uploadNameInput.value.trim();
    if (isResolutionValid && name) {
      uploadBtn.disabled = false;
      showCarouselMessage("Resolución correcta y nombre listo.", false);
    } else if (!isResolutionValid) {
      uploadBtn.disabled = true;
      showCarouselMessage(
        `Resolución incorrecta. Se requiere ${targetWidth}x${targetHeight}.`,
        true
      );
    } else if (!name) {
      uploadBtn.disabled = true;
      showCarouselMessage(
        "Por favor, introduce un nombre para el archivo.",
        true
      );
    }
  }

  if (fileInput) {
    fileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) {
        previewContainer.style.display = "none";
        return;
      }
      const reader = new FileReader();
      reader.onload = function (event) {
        const img = new Image();
        img.onload = function () {
          const w = this.width;
          const h = this.height;
          previewDims.textContent = `${w}x${h} píxeles`;
          previewImage.src = event.target.result;
          previewContainer.style.display = "block";
          currentBase64Image = event.target.result;

          if (w === targetWidth && h === targetHeight) {
            previewDims.style.color = "green";
            isResolutionValid = true; // <-- MODIFICADO
          } else {
            previewDims.style.color = "red";
            isResolutionValid = false; // <-- MODIFICADO
          }
          validateUploadButton(); // <-- MODIFICADO
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // --- LISTENER AÑADIDO ---
  if (uploadNameInput) {
    uploadNameInput.addEventListener("input", validateUploadButton);
  }

  if (uploadBtn) {
    uploadBtn.addEventListener("click", async () => {
      if (!currentBase64Image || uploadBtn.disabled) return;
      uploadBtn.disabled = true;
      showCarouselMessage("Subiendo imagen...", false);

      try {
        const res = await fetch("/api/carousel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageData: currentBase64Image,
            imageName: imageName, // <-- ENVIAR EL NOMBRE
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.mensaje || "Error del servidor.");

        showCarouselMessage("Imagen subida con éxito.", false);
        fileInput.value = "";
        uploadNameInput.value = ""; // <-- LIMPIAR NOMBRE
        previewContainer.style.display = "none";
        currentBase64Image = null;
        isResolutionValid = false;
        loadCarouselImages(); // Recargar la lista
      } catch (err) {
        showCarouselMessage(`Error: ${err.message}`, true);
      } finally {
        uploadBtn.disabled = false;
      }
    });
  }

  async function loadCarouselImages() {
    if (!imageListContainer) return;
    imageListContainer.innerHTML = "<p>Cargando imágenes...</p>";
    try {
      const res = await fetch("/api/carousel");
      const data = await res.json();
      if (!data.exito || !data.images)
        throw new Error("No se pudo cargar la lista.");

      if (data.images.length === 0) {
        imageListContainer.innerHTML = "<p>No hay imágenes en el carrusel.</p>";
        return;
      }

      imageListContainer.innerHTML = "";
      data.images.forEach((imgName) => {
        const item = document.createElement("div");
        item.className = "carousel-item";

        // --- INICIO CORRECCIÓN 2: AÑADIR ÍCONO AL BOTÓN ---
        item.innerHTML = `
          <img src="../img/ingresantes/${imgName}" alt="${imgName}" class="carousel-item-preview" />
          <span class="carousel-item-name">${imgName}</span>
          <button class="btn-delete-carousel" data-filename="${imgName}" title="Eliminar">
            <i class="bi bi-trash-fill"></i>
          </button>
        `;
        // --- FIN CORRECCIÓN 2 ---

        item
          .querySelector(".btn-delete-carousel")
          .addEventListener("click", handleDeleteCarouselImage);
        imageListContainer.appendChild(item);
      });
    } catch (err) {
      imageListContainer.innerHTML = `<p style="color:red;">${err.message}</p>`;
    }
  }

  async function handleDeleteCarouselImage(e) {
    const btn = e.currentTarget;
    const filename = btn.getAttribute("data-filename");

    if (!confirm(`¿Seguro que deseas eliminar la imagen ${filename}?`)) {
      return;
    }

    btn.disabled = true;
    try {
      const res = await fetch(`/api/carousel/${filename}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.mensaje);

      loadCarouselImages(); // Recargar lista
    } catch (err) {
      alert(`Error al eliminar: ${err.message}`);
      btn.disabled = false;
    }
  }

  // --- Carga inicial de ambas listas ---
  loadList();
  loadCarouselImages();
});
