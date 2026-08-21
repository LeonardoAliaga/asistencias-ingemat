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
      const statusEl = document.getElementById("eval-respuestas-estudiante-status");

      if (!evalObj) {
        if (statusEl) statusEl.innerHTML = '<span style="color:#dc2626;">⚠️ Selecciona un examen registrado arriba.</span>';
        return;
      }

      modalState.mode = "respuesta_estudiante";
      modalState.numPreguntas = evalObj.numPreguntas;

      document.getElementById("modal-clave-popup-title").innerHTML = `<i class="bi bi-person-check-fill"></i> Registrar Respuestas Alumno: ${evalObj.titulo} (${evalObj.numPreguntas} Preguntas)`;
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
        <button class="btn-delete-eval" data-id="${e.id}" style="background:#fef2f2; border:1px solid #fca5a5; color:#dc2626; padding:4px 8px; border-radius:4px; cursor:pointer;" title="Eliminar Examen"><i class="bi bi-trash"></i></button>
      </div>
    `;
  });
  html += `</div>`;
  container.innerHTML = html;

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
