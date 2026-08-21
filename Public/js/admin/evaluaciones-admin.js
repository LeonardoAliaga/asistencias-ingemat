// Public/js/admin/evaluaciones-admin.js

let globalEvaluaciones = [];
let globalCiclos = [];
let globalUsuarios = [];

// Variables de estado del Pop-Up Modal
let modalState = {
  mode: "clave", // 'clave' o 'respuesta_estudiante'
  numPreguntas: 0,
  respuestas: {},
};

export function initEvaluacionesAdmin() {
  const vistaEval = document.getElementById("vista-evaluaciones");
  if (!vistaEval) return;

  setupSubtabs();
  setupModalClavePopup();
  setupFormCrearEvaluacion();
  setupFormRegistrarRespuesta();
  setupFormTareas();
  setupBuscadorReporteAlumno();
  setupOMRModule();

  // Autocompletados de Estudiantes con Filtrado Dinámico por Ciclo del Examen
  setupStudentAutocomplete(
    "eval-student-search",
    "eval-codigo-estudiante",
    "eval-student-results",
    () => {
      const evalId = document.getElementById("eval-select-respuesta")?.value;
      const evalObj = globalEvaluaciones.find((e) => e.id === evalId);
      return evalObj ? evalObj.ciclo : "";
    }
  );
  setupStudentAutocomplete(
    "tarea-student-search",
    "tarea-codigo-estudiante",
    "tarea-student-results",
    () => document.getElementById("tarea-ciclo-select")?.value || ""
  );
  setupStudentAutocomplete("reporte-student-search", "search-reporte-alumno-codigo", "reporte-student-results");

  // Rellenar fecha de hoy por defecto
  setFechaHoyDefault();

  cargarDatosEvaluaciones();
}

function setFechaHoyDefault() {
  const today = new Date().toISOString().split("T")[0];
  const tareaFecha = document.getElementById("tarea-fecha-input");
  if (tareaFecha && !tareaFecha.value) {
    tareaFecha.value = today;
  }
}

// ---------------------------------------------------------
// POP-UP MODAL: Checklist Ordenado A al E
// ---------------------------------------------------------
function setupModalClavePopup() {
  const dialog = document.getElementById("modal-clave-popup");
  const btnAbrirClave = document.getElementById("btn-abrir-modal-clave");
  const btnAbrirRespEstudiante = document.getElementById("btn-abrir-modal-respuestas-estudiante");
  const btnCerrar = document.getElementById("btn-cerrar-modal-clave");
  const btnGuardar = document.getElementById("btn-guardar-modal-clave");
  const btnClear = document.getElementById("btn-quick-clear");
  const quickFillBtns = document.querySelectorAll(".btn-quick-fill");
  const checklistContainer = document.getElementById("modal-clave-checklist-container");

  if (!dialog) return;

  // Abrir Modal para Clave Oficial
  if (btnAbrirClave) {
    btnAbrirClave.addEventListener("click", () => {
      const numPreg = parseInt(document.getElementById("eval-num-preguntas")?.value, 10) || 0;
      const statusEl = document.getElementById("eval-clave-resumen-status");

      if (numPreg <= 0) {
        if (statusEl) statusEl.innerHTML = '<span style="color:#dc2626;">⚠️ Por favor ingresa el N° de preguntas antes de abrir el Pop-Up.</span>';
        return;
      }

      modalState.mode = "clave";
      modalState.numPreguntas = numPreg;

      document.getElementById("modal-clave-popup-title").innerHTML = `<i class="bi bi-ui-checks-grid"></i> Configurar Clave Oficial (${numPreg} Preguntas)`;
      renderModalChecklist();
      dialog.showModal();
    });
  }

  // Abrir Modal para Respuestas de Estudiante
  if (btnAbrirRespEstudiante) {
    btnAbrirRespEstudiante.addEventListener("click", () => {
      const evalSelect = document.getElementById("eval-select-respuesta");
      const evalId = evalSelect?.value;
      const evalObj = globalEvaluaciones.find((e) => e.id === evalId);
      const codigoEst = (document.getElementById("eval-codigo-estudiante")?.value || "").trim().toUpperCase();
      const statusEl = document.getElementById("eval-respuestas-estudiante-status");

      if (!evalObj) {
        if (statusEl) statusEl.innerHTML = '<span style="color:#dc2626;">⚠️ Selecciona un examen registrado arriba.</span>';
        return;
      }

      modalState.mode = "respuesta_estudiante";
      modalState.numPreguntas = evalObj.numPreguntas;

      // Verificar si ya hay respuestas escaneadas por cámara O guardadas previamente
      const hasScannedAnswers = modalState.respuestas && Object.keys(modalState.respuestas).length > 0;

      let prevReg = null;
      if (codigoEst && Array.isArray(evalObj.respuestasEstudiantes)) {
        prevReg = evalObj.respuestasEstudiantes.find(
          (r) => String(r.codigoEstudiante).toUpperCase() === codigoEst
        );
      }

      if (!hasScannedAnswers) {
        if (prevReg && prevReg.respuestas) {
          modalState.respuestas = { ...prevReg.respuestas };
        } else {
          modalState.respuestas = {};
        }
      }

      const count = Object.keys(modalState.respuestas).filter((k) => modalState.respuestas[k]).length;

      if (hasScannedAnswers) {
        document.getElementById("modal-clave-popup-title").innerHTML = `<i class="bi bi-camera-fill"></i> Respuestas Escaneadas: ${codigoEst} (${count}/${evalObj.numPreguntas})`;
        if (statusEl) {
          statusEl.innerHTML = `<span style="color:#166534; font-weight:700;">📷 ${count} respuestas escaneadas por cámara cargadas. Revisa o modifica antes de guardar.</span>`;
        }
      } else if (prevReg && prevReg.respuestas) {
        if (statusEl) {
          statusEl.innerHTML = `<span style="color:#2563eb; font-weight:700;">✏️ Editando respuestas guardadas anteriormente de ${prevReg.nombreEstudiante || codigoEst}. (${count} respuestas cargadas)</span>`;
        }
        document.getElementById("modal-clave-popup-title").innerHTML = `<i class="bi bi-pencil-square"></i> Modificar Respuestas: ${prevReg.nombreEstudiante || codigoEst} (${evalObj.numPreguntas} Preguntas)`;
      } else {
        document.getElementById("modal-clave-popup-title").innerHTML = `<i class="bi bi-person-check-fill"></i> Registrar Respuestas Alumno: ${evalObj.titulo} (${evalObj.numPreguntas} Preguntas)`;
      }

      renderModalChecklist();
      dialog.showModal();
    });
  }

  // Cerrar Modal
  if (btnCerrar) {
    btnCerrar.addEventListener("click", () => dialog.close());
  }

  // Acciones Rápidas (Marcar todo A, B, C, D, E)
  quickFillBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const opt = btn.getAttribute("data-option");
      for (let i = 1; i <= modalState.numPreguntas; i++) {
        modalState.respuestas[i] = opt;
      }
      renderModalChecklist();
    });
  });

  // Limpiar Selección
  if (btnClear) {
    btnClear.addEventListener("click", () => {
      modalState.respuestas = {};
      renderModalChecklist();
    });
  }

  // Guardar y Aplicar Selección
  if (btnGuardar) {
    btnGuardar.addEventListener("click", () => {
      const count = Object.keys(modalState.respuestas).filter((k) => modalState.respuestas[k]).length;

      if (modalState.mode === "clave") {
        const statusEl = document.getElementById("eval-clave-resumen-status");
        if (statusEl) {
          statusEl.innerHTML = `<b style="color:#166534;">✅ Clave configurada: ${count} de ${modalState.numPreguntas} respuestas marcadas en el Pop-Up.</b>`;
        }
      } else {
        const statusEl = document.getElementById("eval-respuestas-estudiante-status");
        if (statusEl) {
          statusEl.innerHTML = `<b style="color:#166534;">✅ Respuestas del estudiante: ${count} de ${modalState.numPreguntas} alternativas marcadas en el Pop-Up.</b>`;
        }
      }

      dialog.close();
    });
  }

  // Renderizar la grilla de filas con círculos del A al E
  function renderModalChecklist() {
    if (!checklistContainer) return;

    let html = "";
    const options = ["A", "B", "C", "D", "E"];

    for (let i = 1; i <= modalState.numPreguntas; i++) {
      const currentSelected = modalState.respuestas[i] || "";

      html += `
        <div class="checklist-q-row">
          <div class="checklist-q-num">Pregunta ${i}</div>
          <div class="checklist-options-group">
            ${options
              .map(
                (opt) => `
              <div class="opt-pill ${currentSelected === opt ? "selected" : ""}" data-q="${i}" data-opt="${opt}">
                ${opt}
              </div>
            `
              )
              .join("")}
          </div>
        </div>
      `;
    }

    checklistContainer.innerHTML = html;

    // Conectar clicks en los círculos A-E
    checklistContainer.querySelectorAll(".opt-pill").forEach((pill) => {
      pill.addEventListener("click", () => {
        const q = pill.getAttribute("data-q");
        const opt = pill.getAttribute("data-opt");

        // Si se vuelve a hacer click en la opción seleccionada, se desmarca (En blanco)
        if (modalState.respuestas[q] === opt) {
          delete modalState.respuestas[q];
        } else {
          modalState.respuestas[q] = opt;
        }

        renderModalChecklist();
      });
    });

    // Actualizar Contador del Footer
    const counterEl = document.getElementById("modal-clave-counter-status");
    const count = Object.keys(modalState.respuestas).filter((k) => modalState.respuestas[k]).length;
    if (counterEl) {
      counterEl.textContent = `${count} de ${modalState.numPreguntas} preguntas marcadas`;
    }
  }
}

// 1. Manejo de Sub-Pestañas Internas
function setupSubtabs() {
  const subtabs = [
    { btn: "subtab-eval-simulacros", panel: "eval-panel-simulacros" },
    { btn: "subtab-eval-ranking", panel: "eval-panel-ranking" },
    { btn: "subtab-eval-tareas", panel: "eval-panel-tareas" },
    { btn: "subtab-eval-reporte-alumno", panel: "eval-panel-reporte-alumno" },
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

      cargarDatosEvaluaciones();
    });
  });
}

// 2. Cargar Evaluaciones, Ciclos y Usuarios desde la API
export async function cargarDatosEvaluaciones() {
  try {
    const [resEval, resCiclos, resUsers] = await Promise.all([
      fetch("/api/evaluaciones"),
      fetch("/api/ciclos"),
      fetch("/api/usuarios"),
    ]);

    const dataEval = await resEval.json();
    const dataCiclos = await resCiclos.json();

    if (dataEval.exito) {
      globalEvaluaciones = dataEval.evaluaciones || [];
      populateSelectsEvaluaciones(globalEvaluaciones);
      renderListaEvaluaciones(globalEvaluaciones);
    }

    const listCiclos = dataCiclos.ciclos || (Array.isArray(dataCiclos) ? dataCiclos : []);
    if (listCiclos.length > 0) {
      globalCiclos = listCiclos;
      populateSelectsCiclos(globalCiclos);
    }

    if (resUsers.ok) {
      const dataUsers = await resUsers.json();
      globalUsuarios = Array.isArray(dataUsers) ? dataUsers : (dataUsers.usuarios || []);
    }
  } catch (err) {
    console.error("Error al cargar datos de evaluaciones:", err);
  }
}

function populateSelectsCiclos(ciclos) {
  const selects = ["eval-ciclo-select", "tarea-ciclo-select"];

  selects.forEach((id) => {
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Seleccionar Ciclo / Salón --</option>' +
      ciclos.map((c) => {
        const val = typeof c === "object" ? c.nombre : c;
        return `<option value="${val}">${val}</option>`;
      }).join("");
  });
}

function populateSelectsEvaluaciones(evals) {
  const selects = ["eval-select-respuesta", "eval-select-ranking"];

  selects.forEach((id) => {
    const sel = document.getElementById(id);
    if (!sel) return;
    if (evals.length === 0) {
      sel.innerHTML = '<option value="">No hay evaluaciones registradas</option>';
      return;
    }
    sel.innerHTML = '<option value="">-- Seleccionar Evaluación --</option>' +
      evals.map((e) => `<option value="${e.id}">${e.titulo} (${e.ciclo}) - ${e.fecha}</option>`).join("");
  });
}

// 3. Autocompletado de Estudiantes Reutilizable con Filtrado por Ciclo
function setupStudentAutocomplete(searchInputId, hiddenInputId, resultsContainerId, getCicloFiltroFn) {
  const searchInput = document.getElementById(searchInputId);
  const hiddenInput = document.getElementById(hiddenInputId);
  const resultsContainer = document.getElementById(resultsContainerId);

  if (!searchInput || !hiddenInput || !resultsContainer) return;

  searchInput.addEventListener("input", () => {
    const query = searchInput.value.trim().toLowerCase();
    hiddenInput.value = "";

    if (!query || globalUsuarios.length === 0) {
      resultsContainer.style.display = "none";
      return;
    }

    const cicloFiltro = typeof getCicloFiltroFn === "function" ? getCicloFiltroFn() : null;

    let usuariosFiltrados = globalUsuarios;
    if (cicloFiltro && cicloFiltro.trim() !== "" && cicloFiltro.toUpperCase() !== "TODOS") {
      usuariosFiltrados = globalUsuarios.filter((u) => (u.ciclo || "").toUpperCase() === cicloFiltro.trim().toUpperCase());
    }

    const matches = usuariosFiltrados.filter((u) => {
      const cod = (u.codigo || "").toLowerCase();
      const nom = `${u.nombre || ""} ${u.apellido || ""}`.toLowerCase();
      return cod.includes(query) || nom.includes(query);
    });

    if (matches.length === 0) {
      const msgInfo = cicloFiltro 
        ? `Sin alumnos en el ciclo '${cicloFiltro}' con esa búsqueda` 
        : 'Sin resultados';
      resultsContainer.innerHTML = `<div class="student-autocomplete-item" style="color:#94a3b8; font-size:0.85rem;">⚠️ ${msgInfo}</div>`;
      resultsContainer.style.display = "block";
      return;
    }

    let html = "";
    matches.slice(0, 8).forEach((u) => {
      const nombreCompleto = `${u.nombre || ""} ${u.apellido || ""}`.trim();
      html += `
        <div class="student-autocomplete-item" data-code="${u.codigo}" data-name="${nombreCompleto}">
          <b>[${u.codigo}]</b> ${nombreCompleto} <small style="color:#64748b;">(${u.ciclo || "Sin ciclo"})</small>
        </div>
      `;
    });

    resultsContainer.innerHTML = html;
    resultsContainer.style.display = "block";

    resultsContainer.querySelectorAll(".student-autocomplete-item").forEach((item) => {
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        const code = item.getAttribute("data-code");
        const name = item.getAttribute("data-name");

        if (code) {
          hiddenInput.value = code;
          searchInput.value = `[${code}] ${name}`;
          resultsContainer.innerHTML = "";
          resultsContainer.style.display = "none";

          // Notificar si el alumno ya tiene respuestas en el examen seleccionado
          if (searchInputId === "eval-student-search") {
            const evalSelect = document.getElementById("eval-select-respuesta");
            const evalId = evalSelect?.value;
            const evalObj = globalEvaluaciones.find((e) => e.id === evalId);
            const statusEl = document.getElementById("eval-respuestas-estudiante-status");

            if (evalObj && Array.isArray(evalObj.respuestasEstudiantes)) {
              const prevReg = evalObj.respuestasEstudiantes.find(
                (r) => String(r.codigoEstudiante).toUpperCase() === code.toUpperCase()
              );

              if (prevReg && statusEl) {
                statusEl.innerHTML = `<span style="color:#2563eb; font-weight:700;">✏️ ¡El estudiante ${name} ya rindió este examen! (Puntaje: ${prevReg.puntajeTotal} pts). Haz clic en "Abrir Formulario" para corregir/modificar sus respuestas.</span>`;
              }
            }
          }
        }
      });
    });
  });

  document.addEventListener("click", (e) => {
    if (!searchInput.contains(e.target) && !resultsContainer.contains(e.target)) {
      resultsContainer.innerHTML = "";
      resultsContainer.style.display = "none";
    }
  });
}

// 4. Crear Evaluación y Guardar Clave
function setupFormCrearEvaluacion() {
  const form = document.getElementById("form-crear-evaluacion");

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const msg = document.getElementById("msg-crear-evaluacion");

      const titulo = document.getElementById("eval-titulo-input").value.trim();
      const ciclo = document.getElementById("eval-ciclo-select").value;
      const tipo = document.getElementById("eval-tipo-select").value;
      const numPreguntas = parseInt(document.getElementById("eval-num-preguntas").value, 10);
      const puntajeCorrecta = parseFloat(document.getElementById("eval-pts-correcta").value);
      const puntajeIncorrecta = parseFloat(document.getElementById("eval-pts-incorrecta").value);
      const puntajeEnBlanco = 0;

      const claveRespuestas = modalState.mode === "clave" ? modalState.respuestas : {};

      if (Object.keys(claveRespuestas).length === 0) {
        msg.innerHTML = '<span style="color:red;">⚠️ Abre el Pop-Up y configura al menos una respuesta clave.</span>';
        return;
      }

      try {
        const res = await fetch("/api/evaluaciones", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            titulo,
            ciclo,
            tipo,
            numPreguntas,
            puntajeCorrecta,
            puntajeIncorrecta,
            puntajeEnBlanco,
            claveRespuestas,
          }),
        });

        const data = await res.json();
        if (data.exito) {
          msg.innerHTML = `<span style="color:green;">✅ ${data.mensaje}</span>`;
          form.reset();
          modalState.respuestas = {};
          const statusEl = document.getElementById("eval-clave-resumen-status");
          if (statusEl) statusEl.innerHTML = '⚪ <i>Ingresa la cantidad de preguntas y abre el Pop-Up.</i>';
          await cargarDatosEvaluaciones();
        } else {
          msg.innerHTML = `<span style="color:red;">❌ ${data.mensaje}</span>`;
        }
      } catch (err) {
        msg.innerHTML = '<span style="color:red;">❌ Error al conectar con el servidor.</span>';
      }
    });
  }
}

// 5. Registrar Respuestas de Estudiante con Detección Automática de Ciclo
function setupFormRegistrarRespuesta() {
  const evalSelect = document.getElementById("eval-select-respuesta");
  const form = document.getElementById("form-registrar-respuestas-estudiante");
  const searchInput = document.getElementById("eval-student-search");
  const hiddenCodeInput = document.getElementById("eval-codigo-estudiante");
  const statusEl = document.getElementById("eval-respuestas-estudiante-status");

  // Detección automática al cambiar la evaluación seleccionada
  if (evalSelect && searchInput) {
    evalSelect.addEventListener("change", () => {
      const evalId = evalSelect.value;
      const evalObj = globalEvaluaciones.find((e) => e.id === evalId);

      // Limpiar datos del alumno previamente buscado
      searchInput.value = "";
      if (hiddenCodeInput) hiddenCodeInput.value = "";

      if (evalObj) {
        searchInput.placeholder = `🔍 Buscar estudiante del ciclo ${evalObj.ciclo}...`;
        if (statusEl) {
          statusEl.innerHTML = `<span style="color:#0284c7; font-weight:700;">📌 Examen seleccionado: ${evalObj.titulo} | Ciclo filtrado: ${evalObj.ciclo} (${evalObj.numPreguntas} preguntas)</span>`;
        }
      } else {
        searchInput.placeholder = "🔍 Selecciona primero un examen arriba...";
        if (statusEl) {
          statusEl.innerHTML = "⚪ <i>Selecciona un examen y abre el Pop-Up.</i>";
        }
      }
    });
  }

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const msg = document.getElementById("msg-respuesta-estudiante");
      const evalId = evalSelect?.value;
      const codigoEstudiante = hiddenCodeInput?.value.trim();

      if (!evalId || !codigoEstudiante) {
        msg.innerHTML = '<span style="color:red;">Selecciona una evaluación e ingresa/selecciona el estudiante.</span>';
        return;
      }

      const respuestas = modalState.mode === "respuesta_estudiante" ? modalState.respuestas : {};

      try {
        const res = await fetch(`/api/evaluaciones/${evalId}/respuesta`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ codigoEstudiante, respuestas }),
        });

        const data = await res.json();
        if (data.exito) {
          const resObj = data.resultado;
          msg.innerHTML = `
            <div style="background:#f0fdf4; border:1px solid #86efac; padding:12px; border-radius:8px; margin-top:10px;">
              <b style="color:#166534;">✅ Respuestas registradas para ${resObj.nombreEstudiante}:</b><br/>
              <span>✔ Correctas: <b>${resObj.correctas}</b> | ❌ Incorrectas: <b>${resObj.incorrectas}</b> | ⚪ En Blanco: <b>${resObj.enBlanco}</b></span><br/>
              <span style="font-size:1.1rem; font-weight:800; color:#b72107;">Puntaje Total: ${resObj.puntajeTotal} pts</span> (Puesto #${resObj.posicion})
            </div>
          `;
          if (searchInput) searchInput.value = "";
          if (hiddenCodeInput) hiddenCodeInput.value = "";
          modalState.respuestas = {};
          await cargarDatosEvaluaciones();
        } else {
          msg.innerHTML = `<span style="color:red;">❌ ${data.mensaje}</span>`;
        }
      } catch (err) {
        msg.innerHTML = '<span style="color:red;">❌ Error al conectar con el servidor.</span>';
      }
    });
  }
}

// 6. Renderizar Lista de Evaluaciones Creadas
function renderListaEvaluaciones(evals) {
  const container = document.getElementById("evaluaciones-list-container");
  if (!container) return;

  if (evals.length === 0) {
    container.innerHTML = '<i>No hay evaluaciones creadas.</i>';
    return;
  }

  let html = `<div style="display:flex; flex-direction:column; gap:10px;">`;
  evals.forEach((e) => {
    html += `
      <div style="background:#fff; border:1px solid #e2e8f0; padding:12px 16px; border-radius:8px; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <b style="color:#0f172a; font-size:0.95rem;">${e.titulo}</b> <span style="background:#f1f5f9; padding:2px 6px; border-radius:4px; font-size:0.75rem; font-weight:600;">${e.ciclo}</span><br/>
          <small style="color:#64748b;">Preguntas: ${e.numPreguntas} | Correcta: +${e.puntajeCorrecta} | Incorrecta: -${e.puntajeIncorrecta} | Evaluados: ${e.respuestasEstudiantes.length}</small>
        </div>
        <div style="display:flex; gap:6px; align-items:center;">
          <button class="btn-download-cartilla" data-id="${e.id}" style="background:#f1f5f9; border:1px solid #cbd5e1; color:#0f172a; padding:4px 8px; border-radius:4px; cursor:pointer; font-size:0.8rem; font-weight:600;" title="Previsualizar / Imprimir Cartilla OMR"><i class="bi bi-file-earmark-pdf"></i> Cartilla</button>
          <button class="btn-delete-eval" data-id="${e.id}" style="background:#fef2f2; border:1px solid #fca5a5; color:#dc2626; padding:4px 8px; border-radius:4px; cursor:pointer;" title="Eliminar Examen"><i class="bi bi-trash"></i></button>
        </div>
      </div>
    `;
  });
  html += `</div>`;
  container.innerHTML = html;

  container.querySelectorAll(".btn-download-cartilla").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      const id = ev.currentTarget.getAttribute("data-id");
      const evalObj = evals.find((e) => e.id === id);
      if (evalObj) abrirPrevisualizacionCartilla(evalObj);
    });
  });

  container.querySelectorAll(".btn-delete-eval").forEach((btn) => {
    btn.addEventListener("click", async (ev) => {
      const id = ev.currentTarget.getAttribute("data-id");
      if (confirm("¿Seguro que deseas eliminar esta evaluación?")) {
        await fetch(`/api/evaluaciones/${id}`, { method: "DELETE" });
        await cargarDatosEvaluaciones();
      }
    });
  });
}

// 7. Ranking y Podio Top 3
const evalSelectRanking = document.getElementById("eval-select-ranking");
if (evalSelectRanking) {
  evalSelectRanking.addEventListener("change", async () => {
    const evalId = evalSelectRanking.value;
    if (!evalId) return;

    try {
      const res = await fetch(`/api/evaluaciones/${evalId}/ranking`);
      const data = await res.json();
      if (data.exito) {
        renderRankingView(data.evaluacion, data.ranking);
      }
    } catch (err) {
      console.error("Error al cargar ranking:", err);
    }
  });
}

function renderRankingView(evalObj, ranking) {
  const summaryHeader = document.getElementById("eval-ranking-summary-header");
  const podiumContainer = document.getElementById("eval-top-podium");
  const tbody = document.getElementById("tabla-ranking-body");
  const btnExcel = document.getElementById("btn-export-eval-excel");
  const btnCopyCanvas = document.getElementById("btn-copy-eval-canvas");

  if (btnExcel) {
    btnExcel.onclick = () => {
      window.location.href = `/api/evaluaciones/${evalObj.id}/excel`;
    };
  }

  if (btnCopyCanvas) {
    btnCopyCanvas.onclick = () => {
      copiarRankingAlPortapapeles(evalObj, ranking);
    };
  }

  if (summaryHeader) {
    summaryHeader.innerHTML = `
      <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px; padding:12px 16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
        <div>
          <b style="color:#0f172a; font-size:1.05rem;">📌 ${evalObj.titulo}</b> 
          <span style="background:#f1f5f9; padding:2px 8px; border-radius:4px; font-size:0.8rem; font-weight:700; color:#475569;">Ciclo: ${evalObj.ciclo}</span>
        </div>
        <div style="font-size:0.88rem; color:#64748b;">
          <span>📅 Fecha: <b>${evalObj.fecha}</b></span> &nbsp;|&nbsp; 
          <span>📊 Preguntas: <b>${evalObj.numPreguntas}</b></span> &nbsp;|&nbsp; 
          <span>👥 Participantes: <b style="color:#b72107;">${ranking.length}</b></span>
        </div>
      </div>
    `;
  }

  // Cuadritos de Mérito Top 3 (Solo en la página Web)
  if (podiumContainer) {
    if (ranking.length === 0) {
      podiumContainer.innerHTML = '<p class="text-center" style="grid-column:1/-1;"><i>Aún no hay respuestas registradas para esta evaluación.</i></p>';
    } else {
      const top1 = ranking[0];
      const top2 = ranking[1];
      const top3 = ranking[2];

      let html = "";
      if (top1) {
        html += `
          <div class="podium-card rank-1">
            <div class="podium-medal">🥇</div>
            <div style="font-size:0.75rem; font-weight:800; color:#854d0e;">1ER PUESTO</div>
            <div class="podium-name">${top1.nombreEstudiante}</div>
            <div style="font-size:0.8rem; color:#475569;">${top1.ciclo || evalObj.ciclo}</div>
            <div class="podium-score">${top1.puntajeTotal} pts</div>
          </div>
        `;
      }
      if (top2) {
        html += `
          <div class="podium-card rank-2">
            <div class="podium-medal">🥈</div>
            <div style="font-size:0.75rem; font-weight:800; color:#475569;">2DO PUESTO</div>
            <div class="podium-name">${top2.nombreEstudiante}</div>
            <div style="font-size:0.8rem; color:#475569;">${top2.ciclo || evalObj.ciclo}</div>
            <div class="podium-score">${top2.puntajeTotal} pts</div>
          </div>
        `;
      }
      if (top3) {
        html += `
          <div class="podium-card rank-3">
            <div class="podium-medal">🥉</div>
            <div style="font-size:0.75rem; font-weight:800; color:#9a3412;">3ER PUESTO</div>
            <div class="podium-name">${top3.nombreEstudiante}</div>
            <div style="font-size:0.8rem; color:#475569;">${top3.ciclo || evalObj.ciclo}</div>
            <div class="podium-score">${top3.puntajeTotal} pts</div>
          </div>
        `;
      }
      podiumContainer.innerHTML = html;
    }
  }

  // Tabla General Completa (6 Columnas sin Ciclo)
  if (tbody) {
    if (ranking.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center"><i>No hay participantes en esta evaluación aún.</i></td></tr>';
    } else {
      let html = "";
      ranking.forEach((r) => {
        let badge = `<b>#${r.posicion}</b>`;
        let bgStyle = "";

        if (r.posicion === 1) {
          badge = `🥇 <b>#1</b>`;
          bgStyle = 'style="background:#fef9c3;"';
        } else if (r.posicion === 2) {
          badge = `🥈 <b>#2</b>`;
          bgStyle = 'style="background:#f1f5f9;"';
        } else if (r.posicion === 3) {
          badge = `🥉 <b>#3</b>`;
          bgStyle = 'style="background:#ffedd5;"';
        }

        html += `
          <tr ${bgStyle}>
            <td class="text-center">${badge}</td>
            <td class="text-left" style="font-weight:600; color:#0f172a;">${r.nombreEstudiante}</td>
            <td class="text-center" style="color:#166534; font-weight:700;">${r.correctas}</td>
            <td class="text-center" style="color:#dc2626; font-weight:700;">${r.incorrectas}</td>
            <td class="text-center" style="color:#64748b;">${r.enBlanco}</td>
            <td class="text-center" style="font-weight:800; color:#b72107; font-size:1.05rem;">${r.puntajeTotal} pts</td>
          </tr>
        `;
      });
      tbody.innerHTML = html;
    }
  }
}

// Generador de Imagen de Tabla General de Ranking para Copiar al Portapapeles (Estilo Hueso Minimalista)
function copiarRankingAlPortapapeles(evalObj, ranking) {
  if (ranking.length === 0) {
    alert("⚠️ No hay participantes registrados en esta evaluación para generar la imagen.");
    return;
  }

  const canvas = document.createElement("canvas");
  const rowHeight = 40;
  const headerHeight = 195;
  const footerHeight = 70;
  const totalRows = ranking.length;

  canvas.width = 1100;
  canvas.height = headerHeight + totalRows * rowHeight + footerHeight;
  const ctx = canvas.getContext("2d");

  // Fondo Hueso / Off-White Limpio y Minimalista
  ctx.fillStyle = "#FDFBF7";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Barra de Acento Superior (Rojo Institucional INGEMAT)
  ctx.fillStyle = "#B72107";
  ctx.fillRect(0, 0, 1100, 12);

  // Encabezado Institucional
  ctx.fillStyle = "#0F172A";
  ctx.font = "bold 34px 'Segoe UI', Tahoma, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("ACADEMIA PREUNIVERSITARIA INGEMAT", 550, 62);

  ctx.fillStyle = "#B72107";
  ctx.font = "bold 23px 'Segoe UI', Tahoma, sans-serif";
  ctx.fillText(`CUADRO GENERAL DE MÉRITO Y RANKING`, 550, 100);

  ctx.fillStyle = "#475569";
  ctx.font = "17px 'Segoe UI', Tahoma, sans-serif";
  ctx.fillText(`Examen: ${evalObj.titulo.toUpperCase()} | Ciclo: ${evalObj.ciclo} | Fecha: ${evalObj.fecha} | Total Evaluados: ${ranking.length}`, 550, 138);

  // Tabla - Fila de Encabezado Clasico (Sin Columna Ciclo)
  const startX = 40;
  const tableWidth = 1020;
  const startY = 165;
  const headerRowHeight = 38;

  ctx.fillStyle = "#B72107";
  ctx.fillRect(startX, startY, tableWidth, headerRowHeight);

  ctx.strokeStyle = "#991B1B";
  ctx.lineWidth = 1;
  ctx.strokeRect(startX, startY, tableWidth, headerRowHeight);

  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 15px 'Segoe UI', sans-serif";

  ctx.textAlign = "center";
  ctx.fillText("PUESTO", 90, startY + 24);
  ctx.textAlign = "left";
  ctx.fillText("ESTUDIANTE", 160, startY + 24);
  ctx.textAlign = "center";
  ctx.fillText("CORRECTAS", 650, startY + 24);
  ctx.fillText("INCORRECTAS", 770, startY + 24);
  ctx.fillText("EN BLANCO", 890, startY + 24);
  ctx.fillText("PUNTAJE", 1010, startY + 24);

  // Render Filas de la Tabla General (Con Bordes Clasicos y 6 Columnas)
  let currentY = startY + headerRowHeight;

  ranking.forEach((r, idx) => {
    const isEven = idx % 2 === 0;
    let bgRow = isEven ? "#FFFFFF" : "#F8FAFC";

    if (r.posicion === 1) {
      bgRow = "#FEF9C3"; // Oro suave
    } else if (r.posicion === 2) {
      bgRow = "#F1F5F9"; // Plata suave
    } else if (r.posicion === 3) {
      bgRow = "#FFEDD5"; // Bronce suave
    }

    // Fondo de fila
    ctx.fillStyle = bgRow;
    ctx.fillRect(startX, currentY, tableWidth, rowHeight);

    // Borde exterior de celda / fila (Gris clasico)
    ctx.strokeStyle = "#CBD5E1";
    ctx.lineWidth = 1;
    ctx.strokeRect(startX, currentY, tableWidth, rowHeight);

    // Divisores verticales minimalistas
    ctx.beginPath();
    [140, 590, 710, 830, 950].forEach((x) => {
      ctx.moveTo(x, currentY);
      ctx.lineTo(x, currentY + rowHeight);
    });
    ctx.stroke();

    // Textos de Datos
    let posText = `#${r.posicion}`;
    if (r.posicion === 1) posText = "🥇 1°";
    if (r.posicion === 2) posText = "🥈 2°";
    if (r.posicion === 3) posText = "🥉 3°";

    ctx.fillStyle = "#0F172A";
    ctx.textAlign = "center";
    ctx.font = "bold 15px 'Segoe UI', sans-serif";
    ctx.fillText(posText, 90, currentY + 26);

    ctx.textAlign = "left";
    ctx.font = "15px 'Segoe UI', sans-serif";
    ctx.fillText(r.nombreEstudiante, 160, currentY + 26);

    ctx.textAlign = "center";
    ctx.fillStyle = "#166534";
    ctx.font = "bold 15px 'Segoe UI', sans-serif";
    ctx.fillText(String(r.correctas), 650, currentY + 26);

    ctx.fillStyle = "#DC2626";
    ctx.font = "bold 15px 'Segoe UI', sans-serif";
    ctx.fillText(String(r.incorrectas), 770, currentY + 26);

    ctx.fillStyle = "#64748B";
    ctx.font = "15px 'Segoe UI', sans-serif";
    ctx.fillText(String(r.enBlanco), 890, currentY + 26);

    ctx.fillStyle = "#B72107";
    ctx.font = "bold 16px 'Segoe UI', sans-serif";
    ctx.fillText(`${r.puntajeTotal} pts`, 1010, currentY + 26);

    currentY += rowHeight;
  });

  // Pie de Página Minimalista
  ctx.fillStyle = "#64748B";
  ctx.font = "15px 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("¡Felicitaciones a nuestros estudiantes! • INGEMAT La Mejor Preparación Preuniversitaria", 550, currentY + 40);

  // Copiar al Portapapeles mediante Clipboard API con fallback a descarga
  canvas.toBlob(async (blob) => {
    if (!blob) return;
    try {
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        alert(`✅ ¡Imagen del Ranking General de "${evalObj.titulo}" copiada con éxito al portapapeles!\n\nPuedes pegarla directamente (Ctrl+V) en WhatsApp, Word o cualquier chat.`);
      } else {
        const link = document.createElement("a");
        link.download = `Ranking_${evalObj.titulo.replace(/[^a-zA-Z0-9]/g, "_")}.png`;
        link.href = URL.createObjectURL(blob);
        link.click();
        alert(`✅ Imagen del Ranking descargada correctamente.`);
      }
    } catch (err) {
      console.error("Error al copiar al portapapeles:", err);
      const link = document.createElement("a");
      link.download = `Ranking_${evalObj.titulo.replace(/[^a-zA-Z0-9]/g, "_")}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      alert(`✅ Imagen del Ranking descargada correctamente.`);
    }
  }, "image/png");
}

// 8. Registro de Tareas por Curso (Con Alternancia Vigesimal / Binario)
function setupFormTareas() {
  const form = document.getElementById("form-registrar-tareas");
  const tipoEvalSelect = document.getElementById("tarea-tipo-eval-select");
  const groupVigesimal = document.getElementById("group-nota-vigesimal");
  const groupBinario = document.getElementById("group-nota-binario");

  const cicloSelect = document.getElementById("tarea-ciclo-select");
  const studentSearchInput = document.getElementById("tarea-student-search");
  const studentCodeInput = document.getElementById("tarea-codigo-estudiante");

  if (cicloSelect && studentSearchInput) {
    cicloSelect.addEventListener("change", () => {
      const ciclo = cicloSelect.value;
      studentSearchInput.value = "";
      if (studentCodeInput) studentCodeInput.value = "";

      if (ciclo) {
        studentSearchInput.placeholder = `🔍 Buscar estudiante del ciclo ${ciclo}...`;
      } else {
        studentSearchInput.placeholder = "🔍 Selecciona primero un ciclo / salón...";
      }
    });
  }

  if (tipoEvalSelect && groupVigesimal && groupBinario) {
    const updateModalidadVisibilidad = () => {
      const mode = tipoEvalSelect.value;
      if (mode === "vigesimal") {
        groupVigesimal.classList.remove("is-hidden");
        groupVigesimal.style.setProperty("display", "block", "important");

        groupBinario.classList.add("is-hidden");
        groupBinario.style.setProperty("display", "none", "important");
      } else if (mode === "binario") {
        groupVigesimal.classList.add("is-hidden");
        groupVigesimal.style.setProperty("display", "none", "important");

        groupBinario.classList.remove("is-hidden");
        groupBinario.style.setProperty("display", "block", "important");
      } else {
        groupVigesimal.classList.add("is-hidden");
        groupVigesimal.style.setProperty("display", "none", "important");

        groupBinario.classList.add("is-hidden");
        groupBinario.style.setProperty("display", "none", "important");
      }
    };

    tipoEvalSelect.addEventListener("change", updateModalidadVisibilidad);
    updateModalidadVisibilidad();
  }

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const msg = document.getElementById("msg-registro-tarea");

      const cursoSelect = document.getElementById("tarea-curso-select");
      const curso = cursoSelect ? cursoSelect.value.trim() : "";
      const ciclo = document.getElementById("tarea-ciclo-select").value;
      const fecha = document.getElementById("tarea-fecha-input").value;
      const tipoEvaluacion = tipoEvalSelect.value;
      const codigoEstudiante = document.getElementById("tarea-codigo-estudiante").value.trim();

      if (!curso) {
        msg.innerHTML = '<span style="color:red;">Debes seleccionar un curso predeterminado válido.</span>';
        return;
      }

      if (!ciclo || !codigoEstudiante) {
        msg.innerHTML = '<span style="color:red;">Debes seleccionar el ciclo y el estudiante.</span>';
        return;
      }

      let nota = null;
      let estado = "EVALUADO";

      if (tipoEvaluacion === "vigesimal") {
        const valNum = parseFloat(document.getElementById("tarea-nota-vigesimal").value);
        if (isNaN(valNum) || valNum < 0 || valNum > 20) {
          msg.innerHTML = '<span style="color:red;">La nota vigesimal debe ser un número entre 0 y 20.</span>';
          return;
        }
        nota = valNum;
      } else {
        const radioChecked = document.querySelector('input[name="tarea-binario-radio"]:checked');
        estado = radioChecked ? radioChecked.value : "PRESENTÓ";
      }

      const registros = [{ codigoEstudiante, nota, estado }];

      try {
        const res = await fetch("/api/evaluaciones/tareas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ curso, ciclo, fecha, tipoEvaluacion, registros }),
        });

        const data = await res.json();
        if (data.exito) {
          msg.innerHTML = `<span style="color:green;">✅ ${data.mensaje} (Datos del curso y salón conservados)</span>`;

          // Limpiar únicamente los campos del estudiante y la nota para registro continuo
          const studentSearchEl = document.getElementById("tarea-student-search");
          const studentCodeEl = document.getElementById("tarea-codigo-estudiante");
          const notaVigesimalEl = document.getElementById("tarea-nota-vigesimal");

          if (studentSearchEl) {
            studentSearchEl.value = "";
            studentSearchEl.focus(); // Enfocar para ingresar rápidamente al siguiente alumno
          }
          if (studentCodeEl) studentCodeEl.value = "";
          if (notaVigesimalEl) notaVigesimalEl.value = "";

          // Restablecer radio binario por defecto si aplica
          const defaultRadio = document.querySelector('input[name="tarea-binario-radio"][value="PRESENTÓ"]');
          if (defaultRadio) defaultRadio.checked = true;

          await cargarHistorialTareas();
        } else {
          msg.innerHTML = `<span style="color:red;">❌ ${data.mensaje}</span>`;
        }
      } catch (err) {
        msg.innerHTML = '<span style="color:red;">❌ Error al conectar con el servidor.</span>';
      }
    });
  }
  cargarHistorialTareas();
}

// Helper: Obtener Rango de Semana (Lunes a Domingo)
function getSemanaRango(fechaStr) {
  if (!fechaStr) return "Semana Sin Fecha";
  const parts = fechaStr.split("-");
  if (parts.length !== 3) return `Semana (${fechaStr})`;

  const date = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  const day = date.getDay();
  const diffToMonday = date.getDate() - day + (day === 0 ? -6 : 1);

  const monday = new Date(date.getFullYear(), date.getMonth(), diffToMonday);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);

  const pad = (n) => String(n).padStart(2, "0");
  const format = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;

  return `📅 Semana del ${format(monday)} al ${format(sunday)}`;
}

// Helper: Nombre del Día de la Semana (Soporte completo para Sábados y Fin de Semana)
function getDiaNombreFormateado(fechaStr) {
  if (!fechaStr) return "";
  const parts = fechaStr.split("-");
  if (parts.length !== 3) return fechaStr;

  const date = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  const dias = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const dayIdx = date.getDay();
  const pad = (n) => String(n).padStart(2, "0");
  const fechaFmt = `${dias[dayIdx]} ${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;

  if (dayIdx === 6) {
    return `📌 ${fechaFmt} <span style="background:#fef3c7; color:#92400e; padding:1px 6px; border-radius:4px; font-size:0.75rem; font-weight:700;">☀️ SÁBADO</span>`;
  }
  if (dayIdx === 0) {
    return `📌 ${fechaFmt} <span style="background:#fef3c7; color:#92400e; padding:1px 6px; border-radius:4px; font-size:0.75rem; font-weight:700;">☀️ DOMINGO</span>`;
  }

  return `📌 ${fechaFmt}`;
}

async function cargarHistorialTareas() {
  const container = document.getElementById("tareas-list-container");
  if (!container) return;

  try {
    const res = await fetch("/api/evaluaciones/tareas/list");
    const data = await res.json();

    if (data.exito && Array.isArray(data.tareas)) {
      // Aplanar los grupos de tareas a registros individuales de alumnos
      const todasLasTareas = [];

      data.tareas.forEach((grupo) => {
        if (grupo.registros && Array.isArray(grupo.registros)) {
          grupo.registros.forEach((reg) => {
            const cod = reg.codigoEstudiante || "";
            const u = globalUsuarios.find(
              (usr) => (usr.codigo || "").toUpperCase() === cod.toUpperCase()
            );
            const nombreEst =
              reg.nombreEstudiante ||
              (u ? `${u.nombre || ""} ${u.apellido || ""}`.trim() : `Alumno [${cod || "---"}]`);

            todasLasTareas.push({
              tareaId: grupo.id,
              curso: grupo.curso,
              ciclo: grupo.ciclo,
              fecha: grupo.fecha,
              codigoEstudiante: cod || "---",
              nombreEstudiante: nombreEst,
              nota: reg.nota !== undefined && reg.nota !== null ? reg.nota : null,
              estado: reg.estado || "EVALUADO",
            });
          });
        }
      });

      if (todasLasTareas.length === 0) {
        container.innerHTML = "<i>No hay tareas registradas aún.</i>";
        return;
      }

      // Límite de Historial Reciente: Máximo 15 registros más recientes
      const tareasLimitadas = todasLasTareas.slice(0, 15);

      // Agrupar por Semana -> Día de registro
      const tareasPorSemana = {};

      tareasLimitadas.forEach((t) => {
        const semanaKey = getSemanaRango(t.fecha);
        if (!tareasPorSemana[semanaKey]) {
          tareasPorSemana[semanaKey] = {};
        }

        const diaKey = t.fecha; // YYYY-MM-DD
        if (!tareasPorSemana[semanaKey][diaKey]) {
          tareasPorSemana[semanaKey][diaKey] = [];
        }

        tareasPorSemana[semanaKey][diaKey].push(t);
      });

      let html = `<div style="display:flex; flex-direction:column; gap:16px;">`;

      // Iterar Semanas (recientes primero)
      Object.keys(tareasPorSemana).forEach((semanaLabel) => {
        const diasObj = tareasPorSemana[semanaLabel];
        const diasArray = Object.keys(diasObj).sort().reverse(); // Días recientes primero

        let totalSemanaRegistros = 0;
        diasArray.forEach((d) => (totalSemanaRegistros += diasObj[d].length));

        html += `
          <div class="semana-card-block" style="background:#ffffff; border:1px solid #cbd5e1; border-radius:10px; overflow:hidden; box-shadow:0 2px 6px rgba(0,0,0,0.03);">
            <div style="background:#0f172a; color:#ffffff; padding:10px 16px; font-weight:800; font-size:0.92rem; display:flex; justify-content:space-between; align-items:center;">
              <span>${semanaLabel}</span>
              <span style="font-size:0.78rem; background:rgba(255,255,255,0.15); padding:3px 10px; border-radius:12px;">${totalSemanaRegistros} registros recientes</span>
            </div>
            <div style="padding:14px; display:flex; flex-direction:column; gap:14px;">
        `;

        // Iterar Días en los que HUBO REGISTROS
        diasArray.forEach((fechaDia) => {
          const registrosDia = diasObj[fechaDia];
          const diaFormateado = getDiaNombreFormateado(fechaDia);

          html += `
            <div class="dia-registros-group" style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px;">
              <div style="font-weight:800; color:#b72107; font-size:0.88rem; margin-bottom:8px; border-bottom:1px solid #e2e8f0; padding-bottom:4px;">
                ${diaFormateado} (${registrosDia.length} registros)
              </div>
              <div style="overflow-x:auto;">
                <table class="three-col-table" style="width:100%; font-size:0.85rem;">
                  <thead>
                    <tr style="background:#f1f5f9;">
                      <th style="width:90px; text-align:center;">Código</th>
                      <th style="text-align:left;">Estudiante</th>
                      <th style="text-align:left;">Curso / Asignatura</th>
                      <th style="width:130px; text-align:center;">Ciclo / Salón</th>
                      <th style="width:110px; text-align:center;">Calificación</th>
                    </tr>
                  </thead>
                  <tbody>
          `;

          registrosDia.forEach((t) => {
            const calif =
              t.nota !== null
                ? `<b style="color:#166534; font-size:0.9rem;">${t.nota} / 20</b>`
                : `<span style="background:#e2e8f0; padding:2px 8px; border-radius:4px; font-weight:700; font-size:0.78rem; color:#475569;">${t.estado}</span>`;

            html += `
              <tr>
                <td style="text-align:center;"><b>${t.codigoEstudiante}</b></td>
                <td style="text-align:left;">${t.nombreEstudiante}</td>
                <td style="text-align:left; font-weight:600; color:#0f172a;">${t.curso}</td>
                <td style="text-align:center;"><span style="background:#f1f5f9; padding:2px 6px; border-radius:4px; font-size:0.75rem;">${t.ciclo}</span></td>
                <td style="text-align:center;">${calif}</td>
              </tr>
            `;
          });

          html += `
                  </tbody>
                </table>
              </div>
            </div>
          `;
        });

        html += `
            </div>
          </div>
        `;
      });

      html += `</div>`;
      container.innerHTML = html;
    }
  } catch (err) {
    console.error("Error al cargar historial de tareas:", err);
  }
}

// Variables globales temporales para exportación a PDF
let currentStudentReportData = null;

// 9. Buscador y Reporte Consolidado por Alumno
function setupBuscadorReporteAlumno() {
  const inputSearch = document.getElementById("search-reporte-alumno-codigo");
  const btnSearch = document.getElementById("btn-buscar-reporte-alumno");
  const dashboardContainer = document.getElementById("alumno-reporte-dashboard");
  const btnPrint = document.getElementById("btn-imprimir-reporte-alumno");

  if (btnPrint) {
    btnPrint.addEventListener("click", () => {
      if (currentStudentReportData) {
        generarFichaAlumnoPDF(
          currentStudentReportData.estudiante,
          currentStudentReportData.evalHist,
          currentStudentReportData.tareaHist
        );
      } else {
        window.print();
      }
    });
  }

  const realizarBusqueda = async () => {
    const cod = inputSearch ? inputSearch.value.trim() : "";
    if (!cod) return;

    try {
      const res = await fetch(`/api/evaluaciones/reporte-estudiante/${encodeURIComponent(cod)}`);
      const data = await res.json();

      if (data.exito) {
        currentStudentReportData = {
          estudiante: data.estudiante,
          evalHist: data.historialEvaluaciones || [],
          tareaHist: data.historialTareas || [],
        };
        renderDashboardEstudiante(data.estudiante, data.historialEvaluaciones, data.historialTareas);
      } else {
        currentStudentReportData = null;
        dashboardContainer.innerHTML = `<div style="text-align:center; padding:30px; color:#ef4444;">⚠️ ${data.mensaje}</div>`;
      }
    } catch (err) {
      console.error("Error al buscar estudiante:", err);
    }
  };

  if (btnSearch) btnSearch.addEventListener("click", realizarBusqueda);
}

// Helper: Calcular el Rango de Fechas (Periodo) de las evaluaciones y tareas
function calcularRangoFechas(evalHist = [], tareaHist = []) {
  const fechas = [];

  evalHist.forEach((e) => {
    if (e.fecha) fechas.push(e.fecha);
  });
  tareaHist.forEach((t) => {
    if (t.fecha) fechas.push(t.fecha);
  });

  if (fechas.length === 0) return "Sin registros acumulados";

  fechas.sort(); // Formato YYYY-MM-DD se ordena lexicográficamente

  const minFecha = fechas[0];
  const maxFecha = fechas[fechas.length - 1];

  const format = (fStr) => {
    const parts = fStr.split("-");
    if (parts.length !== 3) return fStr;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  };

  if (minFecha === maxFecha) {
    return `Al ${format(minFecha)}`;
  }

  return `Del ${format(minFecha)} al ${format(maxFecha)}`;
}

// Generador de Ficha de Alumno en Documento PDF Limpio y Organizado
function generarFichaAlumnoPDF(est, evalHist, tareaHist) {
  const hoyStr = new Date().toLocaleDateString("es-PE", { year: "numeric", month: "long", day: "numeric" });
  const rangoFechas = calcularRangoFechas(evalHist, tareaHist);

  let evalRows = "";
  if (evalHist.length === 0) {
    evalRows = '<tr><td colspan="7" style="text-align:center; padding:12px; color:#64748b;">Sin evaluaciones registradas</td></tr>';
  } else {
    evalHist.forEach((e) => {
      evalRows += `
        <tr>
          <td style="padding:9px 12px; border-bottom:1px solid #e2e8f0; font-weight:700; color:#0f172a;">${e.titulo}</td>
          <td style="padding:9px 12px; border-bottom:1px solid #e2e8f0; text-align:center;">${e.fecha}</td>
          <td style="padding:9px 12px; border-bottom:1px solid #e2e8f0; text-align:center; color:#166534; font-weight:700;">${e.correctas}</td>
          <td style="padding:9px 12px; border-bottom:1px solid #e2e8f0; text-align:center; color:#dc2626; font-weight:700;">${e.incorrectas}</td>
          <td style="padding:9px 12px; border-bottom:1px solid #e2e8f0; text-align:center; color:#64748b;">${e.enBlanco}</td>
          <td style="padding:9px 12px; border-bottom:1px solid #e2e8f0; text-align:center; font-weight:800; color:#b72107;">${e.puntajeTotal} pts</td>
          <td style="padding:9px 12px; border-bottom:1px solid #e2e8f0; text-align:center; font-weight:700;">Puesto #${e.posicion}</td>
        </tr>
      `;
    });
  }

  let tareaRows = "";
  if (tareaHist.length === 0) {
    tareaRows = '<tr><td colspan="4" style="text-align:center; padding:12px; color:#64748b;">Sin tareas registradas</td></tr>';
  } else {
    tareaHist.forEach((t) => {
      const calif = t.nota !== null ? `<b>${t.nota} / 20</b>` : `<b>${t.estado}</b>`;
      tareaRows += `
        <tr>
          <td style="padding:9px 12px; border-bottom:1px solid #e2e8f0; font-weight:700; color:#0f172a;">${t.curso}</td>
          <td style="padding:9px 12px; border-bottom:1px solid #e2e8f0; text-align:center;">${t.fecha}</td>
          <td style="padding:9px 12px; border-bottom:1px solid #e2e8f0; text-align:center;">${t.ciclo}</td>
          <td style="padding:9px 12px; border-bottom:1px solid #e2e8f0; text-align:center; color:#166534;">${calif}</td>
        </tr>
      `;
    });
  }

  const printWindow = window.open("", "_blank");
  if (!printWindow) return;

  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Ficha Académica PDF - ${est.nombre} (${est.codigo})</title>
      <style>
        @page { size: A4 portrait; margin: 12mm; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #0f172a; margin: 0; padding: 24px; background: #ffffff; }
        .header-report { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #b72107; padding-bottom: 14px; margin-bottom: 22px; }
        .brand-title { font-size: 22px; font-weight: 800; color: #b72107; text-transform: uppercase; margin: 0; letter-spacing: 0.5px; }
        .brand-sub { font-size: 13px; color: #475569; margin-top: 3px; font-weight: 600; }
        .report-tag { background: #0f172a; color: #ffffff; padding: 6px 16px; font-weight: 700; border-radius: 6px; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; }
        
        .student-box { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 10px; padding: 16px 20px; margin-bottom: 22px; display: flex; justify-content: space-between; align-items: center; }
        .student-info h2 { margin: 0 0 6px 0; font-size: 20px; color: #0f172a; font-weight: 800; }
        .student-info p { margin: 3px 0; font-size: 13.5px; color: #475569; }
        
        .metrics-grid { display: flex; gap: 16px; margin-bottom: 26px; }
        .metric-card { flex: 1; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 10px; padding: 14px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
        .metric-num { font-size: 24px; font-weight: 800; color: #b72107; line-height: 1.1; }
        .metric-lbl { font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 700; margin-top: 4px; letter-spacing: 0.5px; }
        
        .section-title { font-size: 14px; font-weight: 800; color: #0f172a; margin: 24px 0 12px 0; border-left: 4px solid #b72107; padding-left: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 24px; }
        th { background: #f1f5f9; color: #334155; font-weight: 800; padding: 10px 12px; text-align: left; border-bottom: 2px solid #cbd5e1; text-transform: uppercase; font-size: 11px; }
        
        .footer-signatures { margin-top: 50px; display: flex; justify-content: space-around; text-align: center; page-break-inside: avoid; }
        .sig-line { width: 220px; border-top: 1px dashed #94a3b8; padding-top: 8px; font-size: 12px; color: #475569; font-weight: 700; }
      </style>
    </head>
    <body>
      <div class="header-report">
        <div>
          <h1 class="brand-title">ACADEMIA PREUNIVERSITARIA INGEMAT</h1>
          <div class="brand-sub">Sistema de Evaluación Integral y Reporte de Desempeño</div>
        </div>
        <div class="report-tag">FICHA CONSOLIDADA PDF</div>
      </div>

      <div class="student-box">
        <div class="student-info">
          <h2>${est.nombre}</h2>
          <p><b>Código de Estudiante:</b> ${est.codigo} &nbsp;|&nbsp; <b>Ciclo / Salón:</b> ${est.ciclo}</p>
          <p><b>Turno:</b> ${est.turno} &nbsp;|&nbsp; <b>Periodo Evaluado:</b> <span style="color:#b72107; font-weight:700;">${rangoFechas}</span></p>
          <p><b>Fecha de Emisión:</b> ${hoyStr}</p>
        </div>
      </div>

      <div class="metrics-grid">
        <div class="metric-card">
          <div class="metric-num">${evalHist.length}</div>
          <div class="metric-lbl">Exámenes Rendidos</div>
        </div>
        <div class="metric-card">
          <div class="metric-num">${tareaHist.length}</div>
          <div class="metric-lbl">Tareas Calificadas</div>
        </div>
        <div class="metric-card">
          <div class="metric-num" style="font-size: 15px; padding-top: 4px;">${rangoFechas}</div>
          <div class="metric-lbl">Periodo Evaluado</div>
        </div>
      </div>

      <div class="section-title">Historial de Evaluaciones y Simulacros</div>
      <table>
        <thead>
          <tr>
            <th>Examen / Simulacro</th>
            <th style="text-align:center;">Fecha</th>
            <th style="text-align:center;">Correctas</th>
            <th style="text-align:center;">Incorrectas</th>
            <th style="text-align:center;">En Blanco</th>
            <th style="text-align:center;">Puntaje Total</th>
            <th style="text-align:center;">Puesto</th>
          </tr>
        </thead>
        <tbody>
          ${evalRows}
        </tbody>
      </table>

      <div class="section-title">Historial de Calificación de Tareas por Curso</div>
      <table>
        <thead>
          <tr>
            <th>Curso / Asignatura</th>
            <th style="text-align:center;">Fecha</th>
            <th style="text-align:center;">Ciclo</th>
            <th style="text-align:center;">Calificación / Estado</th>
          </tr>
        </thead>
        <tbody>
          ${tareaRows}
        </tbody>
      </table>

      <div class="pdf-thankyou-box" style="margin-top: 36px; padding: 16px 20px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 10px; text-align: center; page-break-inside: avoid;">
        <div style="font-size: 13.5px; font-weight: 800; color: #b72107; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;">
          🎓 ¡Agradecimiento Especial por su Confianza!
        </div>
        <p style="margin: 0; font-size: 12px; color: #334155; line-height: 1.5;">
          Expresamos nuestro sincero agradecimiento al padre de familia y/o tutor de <b>${est.nombre}</b> por depositar su entera confianza en la <b>Academia Preuniversitaria INGEMAT</b>. Reafirmamos nuestro compromiso con la excelencia académica y el éxito en el ingreso universitario.
        </p>
      </div>

      <script>
        window.onload = function() {
          setTimeout(function() {
            window.print();
          }, 300);
        };
      </script>
    </body>
    </html>
  `);
  printWindow.document.close();
}

function renderDashboardEstudiante(est, evalHist, tareaHist) {
  const container = document.getElementById("alumno-reporte-dashboard");
  const btnPrint = document.getElementById("btn-imprimir-reporte-alumno");
  if (!container) return;

  if (btnPrint) btnPrint.style.display = "inline-flex";

  const rangoFechas = calcularRangoFechas(evalHist, tareaHist);

  let html = `
    <!-- Perfil del Estudiante -->
    <div class="student-profile-header">
      <div class="student-avatar-circle"><i class="bi bi-person-fill"></i></div>
      <div class="student-info-details">
        <h3>${est.nombre}</h3>
        <p><b>Código:</b> ${est.codigo} | <b>Ciclo:</b> ${est.ciclo} | <b>Turno:</b> ${est.turno}</p>
        <p style="margin-top:2px;"><b>📅 Periodo Evaluado:</b> <span style="color:#b72107; font-weight:700;">${rangoFechas}</span></p>
      </div>
    </div>

    <!-- Indicadores Rápidos -->
    <div class="student-stats-row">
      <div class="stat-pill-box">
        <div class="stat-pill-value">${evalHist.length}</div>
        <div class="stat-pill-label">Exámenes Rendidos</div>
      </div>
      <div class="stat-pill-box">
        <div class="stat-pill-value">${tareaHist.length}</div>
        <div class="stat-pill-label">Tareas Registradas</div>
      </div>
      <div class="stat-pill-box">
        <div class="stat-pill-value" style="font-size:1.1rem;">${rangoFechas}</div>
        <div class="stat-pill-label">Periodo de Registros</div>
      </div>
    </div>

    <!-- Historial de Evaluaciones y Simulacros -->
    <div class="eval-card-box">
      <h4 style="margin-bottom:12px; color:var(--black); font-family:var(--font-heading);"><i class="bi bi-journal-check"></i> Historial de Evaluaciones y Simulacros</h4>
  `;

  if (evalHist.length === 0) {
    html += `<i>El estudiante no tiene simulacros o exámenes registrados.</i>`;
  } else {
    html += `
      <table class="three-col-table" style="width:100%;">
        <thead>
          <tr>
            <th>Evaluación / Examen</th>
            <th style="width:110px;">Fecha</th>
            <th style="width:90px;">Correctas</th>
            <th style="width:90px;">Incorrectas</th>
            <th style="width:90px;">En Blanco</th>
            <th style="width:110px;">Puntaje</th>
            <th style="width:90px;">Puesto</th>
          </tr>
        </thead>
        <tbody>
    `;
    evalHist.forEach((e) => {
      let puestoBadge = `#${e.posicion}`;
      if (e.posicion === 1) puestoBadge = "🥇 #1";
      if (e.posicion === 2) puestoBadge = "🥈 #2";
      if (e.posicion === 3) puestoBadge = "🥉 #3";

      html += `
        <tr>
          <td class="text-left"><b>${e.titulo}</b></td>
          <td class="text-center">${e.fecha}</td>
          <td class="text-center" style="color:#166534; font-weight:600;">${e.correctas}</td>
          <td class="text-center" style="color:#dc2626; font-weight:600;">${e.incorrectas}</td>
          <td class="text-center" style="color:#64748b;">${e.enBlanco}</td>
          <td class="text-center" style="font-weight:800; color:#b72107; font-size:1rem;">${e.puntajeTotal} pts</td>
          <td class="text-center">${puestoBadge} / ${e.totalParticipantes}</td>
        </tr>
      `;
    });
    html += `</tbody></table>`;
  }
  html += `</div>`;

  // Historial de Tareas
  html += `
    <div class="eval-card-box">
      <h4 style="margin-bottom:12px; color:var(--black); font-family:var(--font-heading);"><i class="bi bi-file-earmark-check"></i> Historial de Tareas por Curso</h4>
  `;

  if (tareaHist.length === 0) {
    html += `<i>El estudiante no tiene tareas registradas.</i>`;
  } else {
    html += `
      <table class="three-col-table" style="width:100%;">
        <thead>
          <tr>
            <th>Curso / Asignatura</th>
            <th style="width:130px;">Fecha</th>
            <th style="width:140px;">Ciclo / Salón</th>
            <th style="width:140px; text-align:center;">Calificación / Estado</th>
          </tr>
        </thead>
        <tbody>
    `;
    tareaHist.forEach((t) => {
      let calif = t.nota !== null ? `<b style="color:#166534;">${t.nota} / 20</b>` : `<span style="background:#f1f5f9; padding:2px 8px; border-radius:4px; font-weight:700;">${t.estado}</span>`;

      html += `
        <tr>
          <td class="text-left"><b>${t.curso}</b></td>
          <td class="text-center">${t.fecha}</td>
          <td class="text-center"><span style="background:#f1f5f9; padding:2px 6px; border-radius:4px; font-size:0.8rem;">${t.ciclo}</span></td>
          <td class="text-center">${calif}</td>
        </tr>
      `;
    });
    html += `</tbody></table>`;
  }
  html += `</div>`;

  container.innerHTML = html;
}

// =========================================================
// MÓDULO OMR: Generador de Cartillas de Respuesta y Escáner por Cámara Web
// =========================================================

let currentCartillaData = null;

function setupOMRModule() {
  const btnPreviewCrear = document.getElementById("btn-preview-cartilla-crear");
  const btnCameraScan = document.getElementById("btn-escanear-cartilla-camara");

  const dialogPreview = document.getElementById("modal-preview-cartilla");
  const btnClosePreview = document.getElementById("btn-cerrar-modal-preview-cartilla");
  const btnDownloadPng = document.getElementById("btn-download-cartilla-png");
  const btnDownloadPdf = document.getElementById("btn-download-cartilla-pdf");

  const dialogScanner = document.getElementById("modal-omr-scanner");
  const btnCloseScanner = document.getElementById("btn-cerrar-modal-omr-scanner");
  const btnCaptureManual = document.getElementById("btn-capturar-omr-manual");

  // 1. Abrir Previsualización desde "Crear Nuevo Examen"
  if (btnPreviewCrear) {
    btnPreviewCrear.addEventListener("click", () => {
      const titulo = document.getElementById("eval-titulo")?.value?.trim() || "EXAMEN DE SIMULACRO";
      const ciclo = document.getElementById("eval-ciclo-select")?.value || "ANUAL";
      const numPreguntas = parseInt(document.getElementById("eval-num-preguntas")?.value, 10) || 20;

      abrirPrevisualizacionCartilla({
        id: "PREVIEW",
        titulo,
        ciclo,
        fecha: new Date().toISOString().split("T")[0],
        numPreguntas,
      });
    });
  }

  // 2. Eventos de los Botones de Descarga en el Pop-Up
  if (btnClosePreview && dialogPreview) {
    btnClosePreview.addEventListener("click", () => dialogPreview.close());
  }

  if (btnDownloadPng) {
    btnDownloadPng.addEventListener("click", () => {
      if (currentCartillaData) descargarCartillaPNG(currentCartillaData);
    });
  }

  if (btnDownloadPdf) {
    btnDownloadPdf.addEventListener("click", () => {
      if (currentCartillaData) descargarCartillaPDFA4(currentCartillaData);
    });
  }

  // 3. Abrir Escáner de Cámara Web
  if (btnCameraScan && dialogScanner) {
    btnCameraScan.addEventListener("click", () => {
      const evalId = document.getElementById("eval-select-respuesta")?.value;
      const evalObj = globalEvaluaciones.find((e) => e.id === evalId);
      const codigoEst = (document.getElementById("eval-codigo-estudiante")?.value || "").trim().toUpperCase();
      const statusEl = document.getElementById("eval-respuestas-estudiante-status");

      if (!evalObj) {
        if (statusEl) statusEl.innerHTML = '<span style="color:#dc2626;">⚠️ Selecciona un examen registrado primero.</span>';
        return;
      }
      if (!codigoEst) {
        if (statusEl) statusEl.innerHTML = '<span style="color:#dc2626;">⚠️ Selecciona al estudiante primero antes de escanear su cartilla.</span>';
        return;
      }

      iniciarCamaraOMR(evalObj, codigoEst);
    });
  }

  if (btnCloseScanner && dialogScanner) {
    btnCloseScanner.addEventListener("click", () => detenerCamaraOMR());
  }

  if (btnCaptureManual) {
    btnCaptureManual.addEventListener("click", () => procesarCapturaOMR());
  }

  // 4. Subir Foto / Imagen HD de la Cartilla
  const btnSubirFoto = document.getElementById("btn-subir-foto-omr");
  const fileInput = document.getElementById("omr-file-upload-input");

  if (btnSubirFoto && fileInput) {
    btnSubirFoto.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (evt) => {
        const img = new Image();
        img.onload = () => {
          const processCanvas = document.getElementById("omr-process-canvas");
          if (processCanvas) {
            processCanvas.width = img.naturalWidth || img.width;
            processCanvas.height = img.naturalHeight || img.height;
            const ctx = processCanvas.getContext("2d");
            ctx.drawImage(img, 0, 0);
            procesarCapturaOMR(true);
          }
        };
        img.src = evt.target.result;
      };
      reader.readAsDataURL(file);
      fileInput.value = "";
    });
  }
}

// Abrir Modal con Previsualización de Cartilla en Canvas
function abrirPrevisualizacionCartilla(evalData) {
  currentCartillaData = evalData;
  const dialog = document.getElementById("modal-preview-cartilla");
  const canvas = document.getElementById("cartilla-preview-canvas");
  const titleEl = document.getElementById("modal-preview-cartilla-title");
  const infoBanner = document.getElementById("cartilla-info-banner");

  if (!dialog || !canvas) return;

  const numP = evalData.numPreguntas || 20;
  const isCompact = numP <= 40;

  // Ajustar dimensiones: mínimo ancho equivalente a 3 columnas para > 40 preguntas
  if (isCompact) {
    canvas.width = 650;
    canvas.height = 920;
  } else {
    const cols = Math.max(1, Math.ceil(numP / 25));
    const colsForWidth = Math.max(3, cols);
    canvas.width = 360 + colsForWidth * 175 + 40; // Mínimo ~925px
    canvas.height = 760;
  }

  const formatoLabel = isCompact ? "Hoja de Respuesta Oficial INGEMAT (Vertical)" : "Ficha Óptica Admisión (Horizontal)";

  if (titleEl) titleEl.innerHTML = `<i class="bi bi-file-earmark-pdf-fill"></i> Hoja de Respuesta OMR: ${evalData.titulo}`;
  if (infoBanner) {
    infoBanner.innerHTML = `📌 <b>${evalData.titulo}</b> (${evalData.ciclo || ""}) | <b>${numP} Preguntas</b> | Formato: <b>${formatoLabel}</b>`;
  }

  dibujarCartillaOMREnCanvas(canvas, evalData);
  dialog.showModal();
}

// Router Principal de Dibujado de Cartilla
function dibujarCartillaOMREnCanvas(canvas, evalData) {
  if (!canvas) return;
  const totalQ = evalData.numPreguntas || 20;

  if (totalQ <= 40) {
    dibujarCartillaVerticalIngemat(canvas, evalData);
  } else {
    dibujarCartillaHorizontalAdmision(canvas, evalData);
  }
}

// ----------------------------------------------------------------------
// 1. HOJA DE RESPUESTA VERTICAL OFICIAL INGEMAT (<= 40 PREGUNTAS)
// ----------------------------------------------------------------------
function dibujarCartillaVerticalIngemat(canvas, evalData) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width;  // 650
  const H = canvas.height; // 920
  const totalQ = evalData.numPreguntas || 20;

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, W, H);

  // 1. Marcadores de Calibración de Alta Precisión (4 Esquinas con núcleo blanco)
  const markerSize = 24;
  const marginOffset = 18;
  const drawTargetMarker = (x, y) => {
    ctx.fillStyle = "#000000";
    ctx.fillRect(x, y, markerSize, markerSize);
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(x + (markerSize - 6) / 2, y + (markerSize - 6) / 2, 6, 6);
  };

  drawTargetMarker(marginOffset, marginOffset);
  drawTargetMarker(W - marginOffset - markerSize, marginOffset);
  drawTargetMarker(marginOffset, H - marginOffset - markerSize);
  drawTargetMarker(W - marginOffset - markerSize, H - marginOffset - markerSize);

  // 2. ENCABEZADO INGEMAT (Margen general ampliado)
  const startX = 50;
  const contentW = W - 100; // 550px

  // Logo Izquierdo
  ctx.fillStyle = "#64748B";
  ctx.font = "bold 11px Arial";
  ctx.textAlign = "left";
  ctx.fillText("Grupo", startX, 40);

  ctx.fillStyle = "#0A2240";
  ctx.font = "bold 26px 'Segoe UI', Arial, sans-serif";
  ctx.fillText("INGEMAT", startX, 64);

  ctx.fillStyle = "#475569";
  ctx.font = "bold 9px Arial";
  ctx.fillText("ACADEMIA", startX + 2, 74);

  // Título Derecho
  ctx.fillStyle = "#0A2240";
  ctx.font = "bold 24px 'Segoe UI', Arial, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("HOJA DE RESPUESTA", startX + contentW, 48);

  ctx.fillStyle = "#B72107";
  ctx.font = "bold 17px 'Segoe UI', Arial, sans-serif";
  ctx.fillText((evalData.titulo || "HABILIDADES").toUpperCase(), startX + contentW, 70);

  // 3. RECUADRO DE DATOS (CICLO | APELLIDOS Y NOMBRES) - Vacío para escritura manuscrita
  const boxY = 86;
  const boxH = 50;
  const cicloW = 140;

  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(startX, boxY, contentW, boxH);

  // Línea divisoria interna
  ctx.beginPath();
  ctx.moveTo(startX + cicloW, boxY);
  ctx.lineTo(startX + cicloW, boxY + boxH);
  ctx.stroke();

  // Labels
  ctx.fillStyle = "#0F172A";
  ctx.font = "bold 10px Arial";
  ctx.textAlign = "left";
  ctx.fillText("CICLO:", startX + 10, boxY + 18);
  ctx.fillText("APELLIDOS Y NOMBRES:", startX + cicloW + 12, boxY + 18);

  // 4. INSTRUCCIONES
  const instY = 152;

  // Lado Izquierdo: Marcas correctas / incorrectas
  ctx.fillStyle = "#334155";
  ctx.font = "bold 9.5px Arial";
  ctx.textAlign = "left";
  ctx.fillText("MARCAS CORRECTAS", startX, instY);

  // Círculo correcto
  ctx.fillStyle = "#000000";
  ctx.beginPath();
  ctx.arc(startX + 130, instY - 3.5, 6, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#334155";
  ctx.fillText("MARCAS INCORRECTAS", startX, instY + 16);

  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 1;
  const incX = startX + 130;
  ctx.fillText("✓", incX, instY + 16);
  ctx.beginPath();
  ctx.arc(incX + 16, instY + 12.5, 5.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(incX + 12, instY + 16.5);
  ctx.lineTo(incX + 20, instY + 8.5);
  ctx.stroke();

  // Lado Derecho: Lápiz 2B banner
  const pencilW = 225;
  const pencilX = startX + contentW - pencilW;
  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 1.2;
  roundRect(ctx, pencilX, instY - 10, pencilW, 26, 4, false, true);

  ctx.fillStyle = "#0F172A";
  ctx.font = "bold 10px Arial";
  ctx.textAlign = "center";
  ctx.fillText("✏️ USE SOLO LÁPIZ 2B O LAPICERO", pencilX + pencilW / 2, instY + 7);

  // 5. CONTENEDOR PRINCIPAL DE RESPUESTAS CON ALTA FIDELIDAD ÓPTICA
  const gridBoxY = 188;
  const gridBoxH = 690;

  ctx.strokeStyle = "#0F172A";
  ctx.lineWidth = 2;
  roundRect(ctx, startX, gridBoxY, contentW, gridBoxH, 12, false, true);

  // Lógica de Desborde por Altura Fija (20 filas máximo por columna)
  const maxRowsPerCol = 20;
  const numCols = totalQ > 20 ? 2 : 1;
  const colWidth = numCols === 2 ? (contentW - 20) / 2 : contentW;
  const options = ["A", "B", "C", "D", "E"];

  // Si hay 2 columnas, trazar línea central divisoria
  if (numCols === 2) {
    const dividerX = startX + contentW / 2;
    ctx.strokeStyle = "#64748B";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(dividerX, gridBoxY + 10);
    ctx.lineTo(dividerX, gridBoxY + gridBoxH - 10);
    ctx.stroke();
  }

  // Encabezados de Columnas (A B C D E) para lectura visual sin interferir dentro de burbujas
  for (let c = 0; c < numCols; c++) {
    const cStartX = startX + (c === 1 ? colWidth + 20 : 10);
    const bubbleAreaStart = cStartX + (numCols === 1 ? 65 : 44);
    const bubbleAreaWidth = colWidth - (numCols === 1 ? 90 : 54);
    const bubbleStep = bubbleAreaWidth / 5;

    ctx.fillStyle = "#475569";
    ctx.font = "bold 10.5px Arial";
    ctx.textAlign = "center";
    options.forEach((opt, optIdx) => {
      const bX = bubbleAreaStart + optIdx * bubbleStep + bubbleStep / 2;
      ctx.fillText(opt, bX, gridBoxY + 20);
    });
  }

  // Burbujas limpias con letra tenue para que el escáner no confunda letras con marcas
  const rowHeight = numCols === 1 && totalQ <= 15 ? 42 : (totalQ > 30 ? 29.5 : 32.5);
  const bubbleRadius = numCols === 1 && totalQ <= 15 ? 13 : (totalQ > 30 ? 10.5 : 11.5);
  const numFont = totalQ > 30 ? "bold 13px Arial" : "bold 14px Arial";
  const startTopPadding = 42;

  for (let q = 1; q <= totalQ; q++) {
    const colIndex = Math.floor((q - 1) / maxRowsPerCol);
    const rowIndex = (q - 1) % maxRowsPerCol;

    const colStartX = startX + (colIndex === 1 ? colWidth + 20 : 10);
    const baseY = gridBoxY + startTopPadding + rowIndex * rowHeight;

    // Fondo alternado tenue
    if (rowIndex % 2 === 0) {
      ctx.fillStyle = "#F8FAFC";
      ctx.fillRect(colStartX + 2, baseY - Math.round(rowHeight / 2) + 3, colWidth - 14, rowHeight - 2);
    }

    // Número de Pregunta nítido
    ctx.fillStyle = "#0A2240";
    ctx.font = numFont;
    ctx.textAlign = "right";
    ctx.fillText(`${q}.`, colStartX + (numCols === 1 ? 40 : 28), baseY + 4.5);

    // Burbujas ópticas con contorno negro nítido e interior limpio
    const bubbleAreaStart = colStartX + (numCols === 1 ? 65 : 44);
    const bubbleAreaWidth = colWidth - (numCols === 1 ? 90 : 54);
    const bubbleStep = bubbleAreaWidth / 5;

    options.forEach((opt, optIdx) => {
      const bX = bubbleAreaStart + optIdx * bubbleStep + bubbleStep / 2;
      const bY = baseY;

      // Anillo de la burbuja
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(bX, bY, bubbleRadius, 0, Math.PI * 2);
      ctx.stroke();

      // Letra interior en tono gris tenue para no alterar la densidad del escáner OMR
      ctx.fillStyle = "#94A3B8";
      ctx.font = "bold 9px Arial";
      ctx.textAlign = "center";
      ctx.fillText(opt, bX, bY + 3);
    });
  }
}

// ----------------------------------------------------------------------
// 2. FICHA ÓPTICA HORIZONTAL DE ADMISIÓN (> 40 PREGUNTAS)
// ----------------------------------------------------------------------
function dibujarCartillaHorizontalAdmision(canvas, evalData) {
  const ctx = canvas.getContext("2d");
  const totalQ = evalData.numPreguntas || 50;

  // Altura fija por columna (25 preguntas por columna)
  const maxPerCol = 25;
  const totalCols = Math.max(1, Math.ceil(totalQ / maxPerCol));

  // Dimensionar ancho con un mínimo equivalente a 3 columnas (~925px)
  const colsForWidth = Math.max(3, totalCols);
  const W = 360 + colsForWidth * 175 + 40;
  const H = 760;
  canvas.width = W;
  canvas.height = H;

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, W, H);

  const primaryBlue = "#0284C7";
  const softBg = "#F0F9FF";

  // 1. Marcadores de Calibración de Alta Precisión (4 Esquinas con núcleo blanco)
  const markerSize = 24;
  const marginOffset = 18;
  const drawTargetMarker = (x, y) => {
    ctx.fillStyle = "#000000";
    ctx.fillRect(x, y, markerSize, markerSize);
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(x + (markerSize - 6) / 2, y + (markerSize - 6) / 2, 6, 6);
  };

  drawTargetMarker(marginOffset, marginOffset);
  drawTargetMarker(W - marginOffset - markerSize, marginOffset);
  drawTargetMarker(marginOffset, H - marginOffset - markerSize);
  drawTargetMarker(W - marginOffset - markerSize, H - marginOffset - markerSize);

  // ---------------------------------------------------------
  // PANEL IZQUIERDO: SECCIÓN DE IDENTIFICACIÓN (CENTRADO H & V)
  // ---------------------------------------------------------
  const leftSectionW = 340;
  const leftW = 280;
  const leftX = Math.round((leftSectionW - leftW) / 2) + 10;

  const totalBlockH = 580;
  let currentY = Math.round((H - totalBlockH) / 2) + 10;

  // Encabezado Institucional
  ctx.fillStyle = primaryBlue;
  ctx.font = "bold 20px 'Segoe UI', Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Academia INGEMAT", leftX + leftW / 2, currentY + 15);

  ctx.fillStyle = "#64748B";
  ctx.font = "bold 10px 'Segoe UI', Arial, sans-serif";
  ctx.fillText("ASEGURA TU INGRESO", leftX + leftW / 2, currentY + 28);

  ctx.fillStyle = "#0F172A";
  ctx.font = "bold 10.5px Arial";
  ctx.fillText("PREPARACIÓN PREUNIVERSITARIA", leftX + leftW / 2, currentY + 46);
  ctx.fillText("DE ALTO RENDIMIENTO ACADÉMICO", leftX + leftW / 2, currentY + 59);

  currentY += 74;

  // Título: SECCIÓN DE IDENTIFICACIÓN
  ctx.strokeStyle = primaryBlue;
  ctx.lineWidth = 1.5;
  roundRect(ctx, leftX, currentY, leftW, 26, 6, false, true);

  ctx.fillStyle = primaryBlue;
  ctx.font = "bold 12px Arial";
  ctx.textAlign = "center";
  ctx.fillText("SECCIÓN DE IDENTIFICACIÓN", leftX + leftW / 2, currentY + 18);
  currentY += 34;

  // Código del Estudiante
  const numDigits = 6;
  const colW = leftW / numDigits;

  ctx.strokeStyle = primaryBlue;
  ctx.strokeRect(leftX, currentY, leftW, 22);
  ctx.fillStyle = "#0F172A";
  ctx.font = "bold 10px Arial";
  ctx.fillText("CÓDIGO DEL ESTUDIANTE", leftX + leftW / 2, currentY + 15);

  const digitBoxH = 34;
  for (let c = 0; c < numDigits; c++) {
    ctx.strokeRect(leftX + c * colW, currentY + 22, colW, digitBoxH);
  }
  currentY += 22 + digitBoxH + 14;

  // Campos Manuscritos
  const drawNameField = (label, height = 46) => {
    ctx.strokeStyle = primaryBlue;
    ctx.lineWidth = 1.2;
    roundRect(ctx, leftX, currentY, leftW, height, 4, false, true);
    ctx.fillStyle = "#64748B";
    ctx.font = "bold 9.5px Arial";
    ctx.textAlign = "center";
    ctx.fillText(label, leftX + leftW / 2, currentY + 14);
    currentY += height + 10;
  };

  drawNameField("APELLIDO PATERNO", 44);
  drawNameField("APELLIDO MATERNO", 44);
  drawNameField("NOMBRES", 44);

  // Ciclo y Fecha
  const metaBoxW = leftW / 2;
  ctx.strokeStyle = primaryBlue;
  roundRect(ctx, leftX, currentY, leftW, 42, 4, false, true);
  ctx.beginPath();
  ctx.moveTo(leftX + metaBoxW, currentY);
  ctx.lineTo(leftX + metaBoxW, currentY + 42);
  ctx.stroke();

  ctx.fillStyle = "#64748B";
  ctx.font = "bold 9px Arial";
  ctx.textAlign = "center";
  ctx.fillText("CICLO", leftX + metaBoxW / 2, currentY + 14);
  ctx.fillText("FECHA", leftX + metaBoxW + metaBoxW / 2, currentY + 14);

  // ---------------------------------------------------------
  // LÍNEA CENTRAL DIVISORIA
  // ---------------------------------------------------------
  const divX = leftSectionW + 15;
  ctx.strokeStyle = "#CBD5E1";
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(divX, 30);
  ctx.lineTo(divX, H - 30);
  ctx.stroke();
  ctx.setLineDash([]);

  // ---------------------------------------------------------
  // PANEL DERECHO: RESPUESTAS E INSTRUCCIONES
  // ---------------------------------------------------------
  const rightX = divX + 20;
  const rightW = W - rightX - 25;

  // Encabezado Derecho
  ctx.fillStyle = "#0F172A";
  ctx.font = "bold 13px 'Segoe UI', Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("ACADEMIA PREUNIVERSITARIA INGEMAT", rightX + 5, 42);

  ctx.fillStyle = primaryBlue;
  ctx.font = "bold 17px 'Segoe UI', Arial, sans-serif";
  ctx.fillText("PRUEBA DE CONOCIMIENTO", rightX + 5, 64);

  ctx.fillStyle = "#0F172A";
  ctx.font = "bold 13.5px 'Segoe UI', Arial, sans-serif";
  ctx.fillText("SECCIÓN DE RESPUESTAS", rightX + 5, 84);

  // Recuadro INSTRUCCIONES (Arriba a la derecha)
  const instW = Math.max(200, Math.min(260, rightW - 270));
  const instX = rightX + rightW - instW;
  const instY = 25;
  const instH = 86;

  ctx.strokeStyle = primaryBlue;
  ctx.lineWidth = 1.5;
  roundRect(ctx, instX, instY, instW, instH, 6, false, true);

  ctx.fillStyle = primaryBlue;
  ctx.font = "bold 12px Arial";
  ctx.textAlign = "center";
  ctx.fillText("INSTRUCCIONES", instX + instW / 2, instY + 16);

  ctx.strokeStyle = "#0F172A";
  ctx.lineWidth = 1;
  roundRect(ctx, instX + 8, instY + 22, instW - 16, 22, 4, false, true);
  ctx.fillStyle = "#0F172A";
  ctx.font = "bold 9.5px Arial";
  ctx.fillText("✏️ USE LÁPIZ 2B O LAPICERO", instX + instW / 2, instY + 37);

  // Ejemplos de Marca formateados limpiamente para no salirse
  ctx.fillStyle = "#475569";
  ctx.font = "bold 8.5px Arial";
  ctx.fillText("CORRECTO: [ ● ]   INCORRECTO: [ ✕ ] [ ∅ ]", instX + instW / 2, instY + 68);

  // Respuestas: Centrar las columnas en el espacio del panel derecho sin estirarlas
  const gridY = 120;
  const gridColW = 165;
  const options = ["A", "B", "C", "D", "E"];

  const totalGridColsWidth = totalCols * gridColW + (totalCols - 1) * 10;
  const gridStartX = rightX + Math.max(0, Math.round((rightW - totalGridColsWidth) / 2));

  for (let c = 0; c < totalCols; c++) {
    const colStartX = gridStartX + c * (gridColW + 10);
    const startQ = c * maxPerCol + 1;
    const endQ = Math.min(totalQ, (c + 1) * maxPerCol);

    ctx.strokeStyle = "#0F172A";
    ctx.lineWidth = 1.5;
    roundRect(ctx, colStartX, gridY, gridColW, 590, 6, false, true);

    for (let i = 0; i < maxPerCol; i++) {
      const qNum = startQ + i;
      const rowY = gridY + 14 + i * 22.8;

      if (qNum <= totalQ) {
        if (i % 2 === 0) {
          ctx.fillStyle = softBg;
          ctx.fillRect(colStartX + 2, rowY - 8, gridColW - 4, 21);
        }

        ctx.fillStyle = "#0A2240";
        ctx.font = "bold 11.5px Arial";
        ctx.textAlign = "right";
        ctx.fillText(`${qNum}.`, colStartX + 26, rowY + 6);

        const bubbleStep = (gridColW - 40) / 5;
        options.forEach((opt, optIdx) => {
          const bX = colStartX + 36 + optIdx * bubbleStep + bubbleStep / 2;
          const bY = rowY + 2;

          ctx.strokeStyle = "#000000";
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(bX, bY, 7.5, 0, Math.PI * 2);
          ctx.stroke();

          // Letra interior en tono tenue
          ctx.fillStyle = "#94A3B8";
          ctx.font = "bold 8px Arial";
          ctx.textAlign = "center";
          ctx.fillText(opt, bX, bY + 3);
        });
      }
    }
  }

  ctx.fillStyle = "#64748B";
  ctx.font = "bold 10px Arial";
  ctx.textAlign = "right";
  ctx.fillText("FICHA ÓPTICA INGEMAT • SISTEMA DE EVALUACIÓN", W - 35, H - 20);
}

// Función Auxiliar para Dibujar Rectángulos con Esquinas Redondeadas
function roundRect(ctx, x, y, width, height, radius, fill, stroke) {
  if (typeof radius === "undefined") radius = 5;
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

// Descargar Imagen PNG Individual de la Cartilla
function descargarCartillaPNG(evalData) {
  const canvas = document.createElement("canvas");
  const numP = evalData.numPreguntas || 20;

  if (numP <= 40) {
    canvas.width = 650;
    canvas.height = 920;
  } else {
    const cols = Math.max(1, Math.ceil(numP / 25));
    const colsForWidth = Math.max(3, cols);
    canvas.width = 360 + colsForWidth * 175 + 40;
    canvas.height = 760;
  }

  dibujarCartillaOMREnCanvas(canvas, evalData);

  const link = document.createElement("a");
  link.download = `Hoja_Respuesta_OMR_${evalData.titulo.replace(/[^a-zA-Z0-9]/g, "_")}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

// Descargar PDF A4 Imprimible
function descargarCartillaPDFA4(evalData) {
  const canvas = document.createElement("canvas");
  const numP = evalData.numPreguntas || 20;
  const isCompact = numP <= 40;

  if (isCompact) {
    canvas.width = 650;
    canvas.height = 920;
  } else {
    const cols = Math.max(1, Math.ceil(numP / 25));
    const colsForWidth = Math.max(3, cols);
    canvas.width = 360 + colsForWidth * 175 + 40;
    canvas.height = 760;
  }

  dibujarCartillaOMREnCanvas(canvas, evalData);

  const imgData = canvas.toDataURL("image/png");
  const printWin = window.open("", "_blank");
  if (!printWin) return;

  const pageSize = isCompact ? "A4 portrait" : "A4 landscape";
  const gridCss = isCompact
    ? "display:grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr; gap: 4mm; width: 198mm; height: 284mm;"
    : "display:flex; justify-content:center; align-items:center; width: 285mm; height: 198mm;";

  printWin.document.write(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Hoja de Respuesta OMR - ${evalData.titulo}</title>
      <style>
        @page { size: ${pageSize}; margin: 5mm; }
        body { margin: 0; padding: 0; font-family: sans-serif; background: #fff; }
        .page-container {
          ${gridCss}
          box-sizing: border-box;
        }
        .page-container img {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }
      </style>
    </head>
    <body>
      <div class="page-container">
        ${isCompact ? `<div><img src="${imgData}" /></div><div><img src="${imgData}" /></div>` : `<img src="${imgData}" />`}
      </div>
      <script>
        window.onload = function() {
          setTimeout(function() { window.print(); }, 300);
        };
      </script>
    </body>
    </html>
  `);
  printWin.document.close();
}

// ---------------------------------------------------------
// ESCÁNER OMR CON CÁMARA WEB (DETECCIÓN AUTOMÁTICA EN TIEMPO REAL)
// ---------------------------------------------------------

let omrVideoStream = null;
let activeScanEval = null;
let activeScanCodigo = null;
let omrAutoScanTimer = null;
let omrScanCooldown = false;

async function iniciarCamaraOMR(evalObj, codigoEst) {
  activeScanEval = evalObj;
  activeScanCodigo = codigoEst;
  omrScanCooldown = false;

  const dialog = document.getElementById("modal-omr-scanner");
  const video = document.getElementById("omr-video-feed");
  const statusEl = document.getElementById("omr-scanner-status");

  if (!dialog || !video) return;

  if (statusEl) {
    statusEl.innerHTML = `🎥 Conectando cámara web para <b>${codigoEst}</b> (${evalObj.numPreguntas} preguntas)...`;
  }

  try {
    omrVideoStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    video.srcObject = omrVideoStream;
    dialog.showModal();

    if (statusEl) {
      statusEl.innerHTML = `<b style="color:#4ade80;">📷 Auto-Escáner Activo:</b> Muestra la cartilla de <b>${codigoEst}</b> frente a la cámara. Se escaneará automáticamente al detectarla.`;
    }

    // Iniciar loop de detección automática cada 500ms
    if (omrAutoScanTimer) clearInterval(omrAutoScanTimer);
    omrAutoScanTimer = setInterval(() => {
      if (!omrScanCooldown && video.readyState === 4) {
        evaluarAutoDeteccionOMR();
      }
    }, 500);

  } catch (err) {
    console.error("Error al acceder a la cámara web:", err);
    alert("⚠️ No se pudo acceder a la cámara web. Asegúrate de otorgar los permisos en el navegador.");
  }
}

function detenerCamaraOMR() {
  const dialog = document.getElementById("modal-omr-scanner");
  const video = document.getElementById("omr-video-feed");

  if (omrAutoScanTimer) {
    clearInterval(omrAutoScanTimer);
    omrAutoScanTimer = null;
  }

  if (omrVideoStream) {
    omrVideoStream.getTracks().forEach((track) => track.stop());
    omrVideoStream = null;
  }
  if (video) video.srcObject = null;
  if (dialog) dialog.close();
}

// Bucle de Detección Automática por Contraste de Imagen
function evaluarAutoDeteccionOMR() {
  const video = document.getElementById("omr-video-feed");
  const processCanvas = document.getElementById("omr-process-canvas");
  const statusEl = document.getElementById("omr-scanner-status");

  if (!video || !processCanvas || !activeScanEval || omrScanCooldown) return;

  const W = 320;
  const H = 240;
  processCanvas.width = W;
  processCanvas.height = H;
  const ctx = processCanvas.getContext("2d");
  ctx.drawImage(video, 0, 0, W, H);

  const imgData = ctx.getImageData(0, 0, W, H);
  const data = imgData.data;

  // Analizar varianza y contraste en la región central
  let darkPixels = 0;
  let totalSampled = 0;

  for (let y = 30; y < H - 30; y += 4) {
    for (let x = 30; x < W - 30; x += 4) {
      const idx = (y * W + x) * 4;
      const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      if (gray < 85) darkPixels++;
      totalSampled++;
    }
  }

  const darkRatio = darkPixels / totalSampled;

  // Si hay marcas oscuras y cuadrículas reconocibles (entre 4% y 40% de píxeles oscuros sobre fondo blanco)
  if (darkRatio > 0.04 && darkRatio < 0.40) {
    if (statusEl) {
      statusEl.innerHTML = `<b style="color:#38bdf8;">⚡ ¡Cartilla detectada! Procesando respuestas...</b>`;
    }
    omrScanCooldown = true;
    setTimeout(() => {
      procesarCapturaOMR();
    }, 200);
  }
}

// ---------------------------------------------------------
// MOTOR DE VISIÓN POR COMPUTADORA OMR (OPENCV.JS + FALLBACK)
// ---------------------------------------------------------

function analizarBurbujasConOpenCV(processCanvas, totalQ) {
  const cv = window.cv;
  if (!cv || !cv.Mat) {
    // Si OpenCV aún no cargó, usar motor de respaldo
    const ctx = processCanvas.getContext("2d");
    return analizarBurbujasOMRFallback(ctx, processCanvas.width, processCanvas.height, totalQ);
  }

  const isVertical = totalQ <= 40;
  const targetW = isVertical ? 650 : 965;
  const targetH = isVertical ? 920 : 760;
  const options = ["A", "B", "C", "D", "E"];
  const respuestas = {};

  let src = null;
  let gray = null;
  let blurred = null;
  let thresh = null;
  let warped = null;
  let M = null;

  try {
    src = cv.imread(processCanvas);
    gray = new cv.Mat();
    blurred = new cv.Mat();
    thresh = new cv.Mat();

    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
    // Umbralización de Otsu Invertida: Fondo papel = 0 (Negro), Tinta/Grafito = 255 (Blanco)
    cv.threshold(blurred, thresh, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);

    // Intentar encontrar el contorno cuadrangular de la cartilla (o marcadores)
    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();
    cv.findContours(thresh, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    let docContour = null;
    let maxArea = 0;
    const minDocArea = (src.cols * src.rows) * 0.20;

    for (let i = 0; i < contours.size(); i++) {
      let cnt = contours.get(i);
      let area = cv.contourArea(cnt);
      if (area > minDocArea && area > maxArea) {
        let peri = cv.arcLength(cnt, true);
        let approx = new cv.Mat();
        cv.approxPolyDP(cnt, approx, 0.02 * peri, true);
        if (approx.rows === 4) {
          if (docContour) docContour.delete();
          docContour = approx;
          maxArea = area;
        } else {
          approx.delete();
        }
      }
      cnt.delete();
    }
    contours.delete();
    hierarchy.delete();

    let workingThresh = thresh;

    // Si se detectaron las 4 esquinas, aplicar corrección de perspectiva (warpPerspective)
    if (docContour && docContour.rows === 4) {
      // Ordenar los 4 puntos: [TL, TR, BR, BL]
      const pts = [];
      for (let i = 0; i < 4; i++) {
        pts.push({ x: docContour.data32S[i * 2], y: docContour.data32S[i * 2 + 1] });
      }

      // Ordenar por suma y diferencia para identificar TL, TR, BR, BL
      pts.sort((a, b) => a.y - b.y);
      const topPts = pts.slice(0, 2).sort((a, b) => a.x - b.x);
      const bottomPts = pts.slice(2, 4).sort((a, b) => a.x - b.x);

      const srcCoords = [
        topPts[0].x, topPts[0].y,
        topPts[1].x, topPts[1].y,
        bottomPts[1].x, bottomPts[1].y,
        bottomPts[0].x, bottomPts[0].y,
      ];

      const dstCoords = [
        0, 0,
        targetW, 0,
        targetW, targetH,
        0, targetH,
      ];

      let srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, srcCoords);
      let dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, dstCoords);
      M = cv.getPerspectiveTransform(srcTri, dstTri);

      warped = new cv.Mat();
      let dsize = new cv.Size(targetW, targetH);
      cv.warpPerspective(thresh, warped, M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());

      workingThresh = warped;
      srcTri.delete();
      dstTri.delete();
      docContour.delete();
    }

    const curW = workingThresh.cols;
    const curH = workingThresh.rows;

    if (isVertical) {
      // Cartilla Vertical
      const maxRows = 20;
      const numCols = totalQ > 20 ? 2 : 1;
      const gridTop = curH * 0.22;
      const gridBottom = curH * 0.94;
      const gridLeft = curW * 0.08;
      const gridRight = curW * 0.92;
      const gridWidth = gridRight - gridLeft;
      const colWidth = numCols === 2 ? gridWidth / 2 : gridWidth;
      const rowHeight = (gridBottom - gridTop) / (totalQ <= 15 ? 15 : maxRows);

      for (let q = 1; q <= totalQ; q++) {
        const colIdx = Math.floor((q - 1) / maxRows);
        const rowIdx = (q - 1) % maxRows;

        const colStartX = gridLeft + colIdx * colWidth;
        const rowCenterY = gridTop + (rowIdx + 0.5) * rowHeight;
        const bubbleAreaStart = colStartX + colWidth * 0.20;
        const bubbleAreaWidth = colWidth * 0.76;
        const bubbleStep = bubbleAreaWidth / 5;
        const radius = Math.max(5, Math.min(10, Math.round(rowHeight * 0.28)));

        const scores = [];

        options.forEach((opt, optIdx) => {
          const bubbleCenterX = Math.round(bubbleAreaStart + (optIdx + 0.5) * bubbleStep);
          const bubbleCenterY = Math.round(rowCenterY);

          // Extraer ROI circular de la burbuja
          const rx = Math.max(0, bubbleCenterX - radius);
          const ry = Math.max(0, bubbleCenterY - radius);
          const rw = Math.min(curW - rx, radius * 2);
          const rh = Math.min(curH - ry, radius * 2);

          if (rw > 0 && rh > 0) {
            let rect = new cv.Rect(rx, ry, rw, rh);
            let roi = workingThresh.roi(rect);
            let nonZero = cv.countNonZero(roi);
            let totalPixels = rw * rh;
            let density = nonZero / totalPixels;
            scores.push({ opt, density });
            roi.delete();
          } else {
            scores.push({ opt, density: 0 });
          }
        });

        scores.sort((a, b) => b.density - a.density);
        const maxScore = scores[0];
        const secondScore = scores[1];
        const avgScore = (scores[0].density + scores[1].density + scores[2].density + scores[3].density + scores[4].density) / 5;

        // Umbral de certeza para burbuja marcada
        if (maxScore.density > 0.32 && (maxScore.density - secondScore.density > 0.12 || maxScore.density > avgScore * 1.5)) {
          respuestas[q] = maxScore.opt;
        }
      }
    } else {
      // Cartilla Horizontal (> 40 preguntas)
      const maxPerCol = 25;
      const totalCols = Math.ceil(totalQ / maxPerCol);
      const gridTop = curH * 0.18;
      const gridBottom = curH * 0.94;
      const gridLeft = curW * 0.38;
      const gridRight = curW * 0.95;
      const gridWidth = gridRight - gridLeft;
      const colWidth = gridWidth / totalCols;
      const rowHeight = (gridBottom - gridTop) / maxPerCol;
      const radius = Math.max(4, Math.min(8, Math.round(rowHeight * 0.26)));

      for (let q = 1; q <= totalQ; q++) {
        const colIdx = Math.floor((q - 1) / maxPerCol);
        const rowIdx = (q - 1) % maxPerCol;

        const colStartX = gridLeft + colIdx * colWidth;
        const rowCenterY = gridTop + (rowIdx + 0.5) * rowHeight;
        const bubbleAreaStart = colStartX + colWidth * 0.22;
        const bubbleAreaWidth = colWidth * 0.74;
        const bubbleStep = bubbleAreaWidth / 5;

        const scores = [];

        options.forEach((opt, optIdx) => {
          const bubbleCenterX = Math.round(bubbleAreaStart + (optIdx + 0.5) * bubbleStep);
          const bubbleCenterY = Math.round(rowCenterY);

          const rx = Math.max(0, bubbleCenterX - radius);
          const ry = Math.max(0, bubbleCenterY - radius);
          const rw = Math.min(curW - rx, radius * 2);
          const rh = Math.min(curH - ry, radius * 2);

          if (rw > 0 && rh > 0) {
            let rect = new cv.Rect(rx, ry, rw, rh);
            let roi = workingThresh.roi(rect);
            let nonZero = cv.countNonZero(roi);
            let totalPixels = rw * rh;
            let density = nonZero / totalPixels;
            scores.push({ opt, density });
            roi.delete();
          } else {
            scores.push({ opt, density: 0 });
          }
        });

        scores.sort((a, b) => b.density - a.density);
        const maxScore = scores[0];
        const secondScore = scores[1];
        const avgScore = (scores[0].density + scores[1].density + scores[2].density + scores[3].density + scores[4].density) / 5;

        if (maxScore.density > 0.30 && (maxScore.density - secondScore.density > 0.10 || maxScore.density > avgScore * 1.45)) {
          respuestas[q] = maxScore.opt;
        }
      }
    }
  } catch (err) {
    console.error("Error procesando OMR con OpenCV:", err);
  } finally {
    // Liberar memoria WebAssembly de OpenCV para evitar fugas
    if (src) src.delete();
    if (gray) gray.delete();
    if (blurred) blurred.delete();
    if (thresh) thresh.delete();
    if (warped) warped.delete();
    if (M) M.delete();
  }

  return respuestas;
}

// Motor de respaldo puro JS en caso de que OpenCV no esté disponible
function analizarBurbujasOMRFallback(ctx, W, H, totalQ) {
  const imgData = ctx.getImageData(0, 0, W, H);
  const data = imgData.data;
  const options = ["A", "B", "C", "D", "E"];
  const respuestas = {};

  const getBrightness = (px, py) => {
    const x = Math.max(0, Math.min(W - 1, Math.round(px)));
    const y = Math.max(0, Math.min(H - 1, Math.round(py)));
    const idx = (y * W + x) * 4;
    return 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
  };

  const getCircleDarkness = (centerX, centerY, radius = 6) => {
    let darkSum = 0;
    let count = 0;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy <= radius * radius) {
          const b = getBrightness(centerX + dx, centerY + dy);
          darkSum += (255 - b);
          count++;
        }
      }
    }
    return count > 0 ? darkSum / count : 0;
  };

  const isVertical = totalQ <= 40;
  if (isVertical) {
    const maxRows = 20;
    const numCols = totalQ > 20 ? 2 : 1;
    const gridTop = H * 0.23;
    const gridBottom = H * 0.94;
    const gridLeft = W * 0.09;
    const gridRight = W * 0.91;
    const colWidth = numCols === 2 ? (gridRight - gridLeft) / 2 : (gridRight - gridLeft);
    const rowHeight = (gridBottom - gridTop) / (totalQ <= 15 ? 15 : maxRows);

    for (let q = 1; q <= totalQ; q++) {
      const colIdx = Math.floor((q - 1) / maxRows);
      const rowIdx = (q - 1) % maxRows;
      const colStartX = gridLeft + colIdx * colWidth;
      const rowCenterY = gridTop + (rowIdx + 0.5) * rowHeight;
      const bubbleAreaStart = colStartX + colWidth * 0.20;
      const bubbleAreaWidth = colWidth * 0.76;
      const bubbleStep = bubbleAreaWidth / 5;

      const scores = [];
      options.forEach((opt, optIdx) => {
        const bubbleCenterX = bubbleAreaStart + (optIdx + 0.5) * bubbleStep;
        const darkness = getCircleDarkness(bubbleCenterX, rowCenterY, Math.min(8, rowHeight * 0.25));
        scores.push({ opt, darkness });
      });

      scores.sort((a, b) => b.darkness - a.darkness);
      const maxScore = scores[0];
      const secondScore = scores[1];
      const avgScore = (scores[0].darkness + scores[1].darkness + scores[2].darkness + scores[3].darkness + scores[4].darkness) / 5;

      if (maxScore.darkness > 50 && (maxScore.darkness - secondScore.darkness > 10 || maxScore.darkness > avgScore * 1.25)) {
        respuestas[q] = maxScore.opt;
      }
    }
  }

  return respuestas;
}

// Procesar captura y precargar respuestas
function procesarCapturaOMR(fromFileUpload = false) {
  const video = document.getElementById("omr-video-feed");
  const processCanvas = document.getElementById("omr-process-canvas");
  const mainStatus = document.getElementById("eval-respuestas-estudiante-status");
  const dialogClave = document.getElementById("modal-clave-popup");

  if (!activeScanEval) return;

  if (!fromFileUpload && video && processCanvas) {
    const W = video.videoWidth || 1280;
    const H = video.videoHeight || 720;
    processCanvas.width = W;
    processCanvas.height = H;
    const ctx = processCanvas.getContext("2d");
    ctx.drawImage(video, 0, 0, W, H);
  }

  // Ejecutar motor de Visión por Computadora (OpenCV) sobre el lienzo
  const totalQ = activeScanEval.numPreguntas || 20;
  const respuestasLeidas = analizarBurbujasConOpenCV(processCanvas, totalQ);

  // Guardar respuestas detectadas en el estado global
  modalState.mode = "respuesta_estudiante";
  modalState.numPreguntas = totalQ;
  modalState.respuestas = { ...respuestasLeidas };

  const detectedCount = Object.keys(respuestasLeidas).length;

  // Sonido de confirmación con Web Audio API
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.15);
  } catch (e) {}

  const codEst = activeScanCodigo;
  detenerCamaraOMR();

  if (mainStatus) {
    mainStatus.innerHTML = `<span style="color:#166534; font-weight:700;">✅ ¡Cartilla de ${codEst} procesada con OpenCV! (${detectedCount} de ${totalQ} respuestas reconocidas)</span>`;
  }

  // Abrir automáticamente el Pop-Up con las alternativas marcadas por OpenCV
  if (dialogClave) {
    const titleEl = document.getElementById("modal-clave-popup-title");
    if (titleEl) {
      titleEl.innerHTML = `<i class="bi bi-camera-fill"></i> Respuestas OpenCV: ${codEst} (${detectedCount}/${totalQ} Detectadas)`;
    }
    const container = document.getElementById("modal-clave-checklist-container");
    const options = ["A", "B", "C", "D", "E"];

    if (container) {
      let html = "";
      for (let i = 1; i <= totalQ; i++) {
        const curOpt = modalState.respuestas[i] || "";
        html += `
          <div class="checklist-q-row">
            <div class="checklist-q-num">Pregunta ${i}</div>
            <div class="checklist-options-group">
              ${options
                .map(
                  (opt) => `
                <div class="opt-pill ${curOpt === opt ? "selected" : ""}" data-q="${i}" data-opt="${opt}">
                  ${opt}
                </div>
              `
                )
                .join("")}
            </div>
          </div>
        `;
      }
      container.innerHTML = html;

      container.querySelectorAll(".opt-pill").forEach((pill) => {
        pill.addEventListener("click", () => {
          const q = pill.getAttribute("data-q");
          const opt = pill.getAttribute("data-opt");
          if (modalState.respuestas[q] === opt) {
            delete modalState.respuestas[q];
          } else {
            modalState.respuestas[q] = opt;
          }
          pill.parentElement.querySelectorAll(".opt-pill").forEach((p) => p.classList.remove("selected"));
          if (modalState.respuestas[q]) {
            pill.classList.add("selected");
          }
        });
      });
    }
    dialogClave.showModal();
  }
}
