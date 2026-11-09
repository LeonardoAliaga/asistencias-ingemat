import { evalState } from "./eval-state.js";
import { limpiarSeleccionRanking } from "./eval-ranking.js";

// 1. Manejo de Sub-Pestañas Internas
export function setupSubtabs() {
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

      // Limpiar automáticamente la selección anterior de ranking
      limpiarSeleccionRanking();

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
      evalState.globalEvaluaciones = dataEval.evaluaciones || [];
      populateSelectsEvaluaciones(evalState.globalEvaluaciones);
      renderListaEvaluaciones(evalState.globalEvaluaciones);
    }

    const listCiclos =
      dataCiclos.ciclos || (Array.isArray(dataCiclos) ? dataCiclos : []);
    if (listCiclos.length > 0) {
      evalState.globalCiclos = listCiclos;
      populateSelectsCiclos(evalState.globalCiclos);
    }

    if (resUsers.ok) {
      const dataUsers = await resUsers.json();
      evalState.globalUsuarios = Array.isArray(dataUsers)
        ? dataUsers
        : dataUsers.usuarios || [];
    }
  } catch (err) {
    console.error("Error al cargar datos de evaluaciones:", err);
  }
}

export function populateSelectsCiclos(ciclos) {
  const selects = [
    "eval-ciclo-select",
    "tarea-ciclo-select",
    "excel-tareas-ciclo-select",
  ];

  selects.forEach((id) => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const prevVal = sel.value;
    sel.innerHTML =
      '<option value="">-- Seleccionar Ciclo / Salón --</option>' +
      ciclos
        .map((c) => {
          const val = typeof c === "object" ? c.nombre : c;
          return `<option value="${val}">${val}</option>`;
        })
        .join("");
    if (prevVal) sel.value = prevVal;
  });

  const excelCicloSel = document.getElementById("excel-tareas-ciclo-select");
  if (
    excelCicloSel &&
    excelCicloSel.value &&
    window._cargarSemanasExcelConsolidado
  ) {
    window._cargarSemanasExcelConsolidado(excelCicloSel.value);
  }
}

export function populateSelectsEvaluaciones(evals) {
  const selects = ["eval-select-respuesta", "eval-select-ranking"];

  selects.forEach((id) => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const available =
      id === "eval-select-respuesta"
        ? evals.filter((e) => e.tipo === "test")
        : evals;
    if (available.length === 0) {
      sel.innerHTML =
        '<option value="">No hay evaluaciones registradas</option>';
      return;
    }
    sel.innerHTML =
      '<option value="">-- Seleccionar Evaluación --</option>' +
      available
        .map((e) => {
          let badge = "";
          if (e.tipo === "test") badge = " [TEST]";
          else if (e.tipo === "simulacro_areas") badge = " [ÁREAS A-E]";
          return `<option value="${e.id}">${e.titulo}${badge} (${e.ciclo}) - ${e.fecha}</option>`;
        })
        .join("");
  });
}

// 3. Crear Evaluación y Guardar Clave
export function setupFormCrearEvaluacion() {
  const form = document.getElementById("form-crear-evaluacion");
  const tipoSelect = document.getElementById("eval-tipo-select");
  const fechaInput = document.getElementById("eval-fecha-input");
  const areasCuadernilloRow = document.getElementById(
    "eval-areas-cuadernillo-row",
  );
  const estandarPreguntasRow = document.getElementById(
    "eval-estandar-preguntas-row",
  );
  const configPuntajesWrapper = document.getElementById(
    "eval-config-puntajes-wrapper",
  );
  const configTestWrapper = document.getElementById("eval-config-test-wrapper");
  const configClavesWrapper = document.getElementById(
    "eval-config-claves-wrapper",
  );

  // Establecer fecha por defecto (hoy)
  if (fechaInput && !fechaInput.value) {
    fechaInput.value = window.ingematToday();
  }

  const actualizarCamposPorTipo = () => {
    const tipo = tipoSelect ? tipoSelect.value : "simulacro_estandar";

    const setVisibility = (el, visible, flexDisplay = false) => {
      if (!el) return;
      if (visible) {
        el.style.display = flexDisplay ? "flex" : "block";
        el.classList.remove("is-hidden");
        el.removeAttribute("hidden");
      } else {
        el.style.display = "none";
        el.classList.add("is-hidden");
        el.setAttribute("hidden", "true");
      }
    };

    if (tipo === "test") {
      setVisibility(areasCuadernilloRow, false);
      setVisibility(estandarPreguntasRow, false);
      setVisibility(configPuntajesWrapper, false);
      setVisibility(configTestWrapper, true);
      setVisibility(configClavesWrapper, false);
    } else if (tipo === "simulacro_areas") {
      setVisibility(areasCuadernilloRow, true, true);
      setVisibility(estandarPreguntasRow, false);
      setVisibility(configPuntajesWrapper, true, true);
      setVisibility(configTestWrapper, false);
      setVisibility(configClavesWrapper, true);
    } else {
      // simulacro_estandar
      setVisibility(areasCuadernilloRow, false);
      setVisibility(estandarPreguntasRow, true);
      setVisibility(configPuntajesWrapper, true, true);
      setVisibility(configTestWrapper, false);
      setVisibility(configClavesWrapper, true);
    }
  };

  if (tipoSelect) {
    tipoSelect.addEventListener("change", actualizarCamposPorTipo);
    actualizarCamposPorTipo();
  }

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const msg = document.getElementById("msg-crear-evaluacion");

      const titulo = document.getElementById("eval-titulo-input").value.trim();
      const ciclo = document.getElementById("eval-ciclo-select").value;
      const tipo = tipoSelect ? tipoSelect.value : "simulacro_estandar";
      const fecha = fechaInput ? fechaInput.value : window.ingematToday();

      let numPreguntas = 100;
      let totalPreguntasCuadernillo = 100;
      let puntajeCorrecta = 20;
      let puntajeIncorrecta = 1.125;

      if (tipo === "test") {
        numPreguntas = 20;
        totalPreguntasCuadernillo = 20;
        puntajeCorrecta = 20;
        puntajeIncorrecta = 0;
      } else if (tipo === "simulacro_areas") {
        totalPreguntasCuadernillo =
          parseInt(
            document.getElementById("eval-total-preguntas-areas")?.value,
            10,
          ) || 120;
        numPreguntas =
          parseInt(
            document.getElementById("eval-num-preguntas-areas")?.value,
            10,
          ) || 100;
        puntajeCorrecta =
          parseFloat(document.getElementById("eval-pts-correcta")?.value) || 20;
        puntajeIncorrecta = Number(
          document.getElementById("eval-pts-incorrecta")?.value ?? 1.125,
        );
      } else {
        // simulacro_estandar: Lee el input de preguntas a responder
        numPreguntas =
          parseInt(document.getElementById("eval-num-preguntas")?.value, 10) ||
          100;
        totalPreguntasCuadernillo = numPreguntas;
        puntajeCorrecta =
          parseFloat(document.getElementById("eval-pts-correcta")?.value) || 20;
        puntajeIncorrecta = Number(
          document.getElementById("eval-pts-incorrecta")?.value ?? 1.125,
        );
      }

      let claveRespuestas = {};
      let preguntasPorArea = {};

      if (tipo !== "test") {
        claveRespuestas = evalState.keyDraft || {};

        if (tipo === "simulacro_areas") {
          const areasConfig = evalState.modalState.areasPorPregunta || {};
          preguntasPorArea = { A: {}, B: {}, C: {}, D: {}, E: {} };

          for (let i = 1; i <= totalPreguntasCuadernillo; i++) {
            const qKey = String(i);
            const ans = claveRespuestas[qKey] || "";
            const areasForQ = areasConfig[qKey] || ["A", "B", "C", "D", "E"];

            if (ans) {
              areasForQ.forEach((areaCode) => {
                if (preguntasPorArea[areaCode]) {
                  preguntasPorArea[areaCode][qKey] = ans;
                }
              });
            }
          }

          if (Object.keys(claveRespuestas).length === 0) {
            msg.innerHTML =
              '<span style="color:red;">⚠️ Abre el Pop-Up y configura las claves del simulacro.</span>';
            return;
          }
        } else {
          if (Object.keys(claveRespuestas).length === 0) {
            msg.innerHTML =
              '<span style="color:red;">⚠️ Abre el Pop-Up y configura al menos una respuesta clave.</span>';
            return;
          }
        }
      }

      try {
        const res = await fetch("/api/evaluaciones", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            titulo,
            ciclo,
            fecha,
            tipo,
            numPreguntas,
            totalPreguntasCuadernillo,
            puntajeCorrecta,
            puntajeIncorrecta,
            claveRespuestas,
            preguntasPorArea,
            preguntasSinDescuento:
              evalState.modalState.preguntasSinDescuento || {},
          }),
        });

        const data = await res.json();
        if (data.exito) {
          msg.innerHTML = `<span style="color:green;">✅ ${data.mensaje}</span>`;
          form.reset();
          if (fechaInput) fechaInput.value = window.ingematToday();
          evalState.modalState.respuestas = {};
          evalState.keyDraft = {};
          evalState.modalState.areasPorPregunta = {};
          evalState.modalState.preguntasSinDescuento = {};
          evalState.modalState.mostrarActitudinales = false;
          actualizarCamposPorTipo();
          const statusEl = document.getElementById("eval-clave-resumen-status");
          if (statusEl)
            statusEl.innerHTML =
              "⚪ <i>Ingresa la cantidad de preguntas y abre el Pop-Up.</i>";
          await cargarDatosEvaluaciones();
        } else {
          msg.innerHTML = `<span style="color:red;">❌ ${data.mensaje}</span>`;
        }
      } catch (err) {
        msg.innerHTML =
          '<span style="color:red;">❌ Error al conectar con el servidor.</span>';
      }
    });
  }
}

// 4. Renderizar Lista de Evaluaciones Creadas
const escapeEval = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function renderListaEvaluaciones(evals) {
  const container = document.getElementById("evaluaciones-list-container");
  if (!container) return;
  const tests = evals.filter((e) => e.tipo === "test");
  container.innerHTML = tests.length
    ? `<div class="test-list">${tests.map((e) => `<article class="test-list-card"><div><strong>${escapeEval(e.titulo)}</strong><p>${escapeEval(e.ciclo)} · ${escapeEval(e.fecha)}</p><p>Nota directa · ${(e.respuestasEstudiantes || []).length} evaluados</p></div><button type="button" class="btn-delete-eval" data-id="${escapeEval(e.id)}" aria-label="Eliminar ${escapeEval(e.titulo)}"><i class="bi bi-trash" aria-hidden="true"></i></button></article>`).join("")}</div>`
    : '<div class="v2-empty">Todavía no hay tests o prácticas con nota directa.</div>';
  for (const button of container.querySelectorAll(".btn-delete-eval"))
    button.onclick = async () => {
      if (!confirm("¿Eliminar esta práctica?")) return;
      const response = await fetch(
        `/api/evaluaciones/${encodeURIComponent(button.dataset.id)}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        const error = await response.json();
        alert(error.mensaje || "No se pudo eliminar la práctica.");
        return;
      }
      await cargarDatosEvaluaciones();
    };
}

// 5. Pop-Up Modal de Registro de Claves y Respuestas
export function setupModalClavePopup() {
  const dialog = document.getElementById("modal-clave-popup");
  const btnAbrirClave = document.getElementById("btn-abrir-modal-clave");
  const btnAbrirRespEstudiante = document.getElementById(
    "btn-abrir-modal-respuestas-estudiante",
  );
  const btnCerrar = document.getElementById("btn-cerrar-modal-clave");
  const btnGuardar = document.getElementById("btn-guardar-modal-clave");
  const btnClear = document.getElementById("btn-quick-clear");
  const btnQuickAllAreas = document.getElementById("btn-quick-all-areas");
  const btnToggleActitudinal = document.getElementById(
    "btn-toggle-modo-actitudinal",
  );
  const quickFillBtns = document.querySelectorAll(".btn-quick-fill");
  const checklistContainer = document.getElementById(
    "modal-clave-checklist-container",
  );

  if (!dialog) return;

  if (!evalState.modalState.areasPorPregunta) {
    evalState.modalState.areasPorPregunta = {};
  }
  if (!evalState.modalState.preguntasSinDescuento) {
    evalState.modalState.preguntasSinDescuento = {};
  }

  const updateToggleBtnState = () => {
    if (!btnToggleActitudinal) return;
    const isActive = !!evalState.modalState.mostrarActitudinales;
    btnToggleActitudinal.classList.toggle("active", isActive);
    btnToggleActitudinal.innerHTML = isActive
      ? '<i class="bi bi-shield-fill-check"></i> Actitudinales: Visibles (ON)'
      : '<i class="bi bi-shield"></i> Preguntas Actitudinales (Sin Descuento)';
  };

  if (btnToggleActitudinal) {
    btnToggleActitudinal.onclick = () => {
      evalState.modalState.mostrarActitudinales =
        !evalState.modalState.mostrarActitudinales;
      updateToggleBtnState();
      renderModalChecklist();
    };
  }

  if (btnQuickAllAreas) {
    btnQuickAllAreas.onclick = () => {
      for (let i = 1; i <= evalState.modalState.numPreguntas; i++) {
        evalState.modalState.areasPorPregunta[String(i)] = [
          "A",
          "B",
          "C",
          "D",
          "E",
        ];
      }
      renderModalChecklist();
    };
  }

  if (btnAbrirClave) {
    btnAbrirClave.addEventListener("click", () => {
      const tipo =
        document.getElementById("eval-tipo-select")?.value ||
        "simulacro_estandar";
      let numPreg = 100;

      if (tipo === "simulacro_areas") {
        numPreg =
          parseInt(
            document.getElementById("eval-total-preguntas-areas")?.value,
            10,
          ) || 120;
        evalState.modalState.isAreasMode = true;
        if (btnQuickAllAreas) btnQuickAllAreas.style.display = "inline-block";
      } else {
        numPreg =
          parseInt(document.getElementById("eval-num-preguntas")?.value, 10) ||
          100;
        evalState.modalState.isAreasMode = false;
        if (btnQuickAllAreas) btnQuickAllAreas.style.display = "none";
      }

      if (btnToggleActitudinal) {
        btnToggleActitudinal.style.display = "inline-flex";
        updateToggleBtnState();
      }

      const statusEl = document.getElementById("eval-clave-resumen-status");

      if (numPreg <= 0) {
        if (statusEl)
          statusEl.innerHTML =
            '<span style="color:#dc2626;">⚠️ Por favor ingresa el N° de preguntas antes de abrir el Pop-Up.</span>';
        return;
      }

      evalState.modalState.mode = "clave";
      evalState.modalState.respuestas = structuredClone(
        evalState.keyDraft || {},
      );
      evalState.modalState.numPreguntas = numPreg;

      // Inicializar áreas por defecto si no existen
      if (!evalState.modalState.areasPorPregunta)
        evalState.modalState.areasPorPregunta = {};
      for (let i = 1; i <= numPreg; i++) {
        if (!evalState.modalState.areasPorPregunta[String(i)]) {
          evalState.modalState.areasPorPregunta[String(i)] = [
            "A",
            "B",
            "C",
            "D",
            "E",
          ];
        }
      }

      if (!evalState.modalState.preguntasSinDescuento) {
        evalState.modalState.preguntasSinDescuento = {};
      }

      document.getElementById("modal-clave-popup-title").innerHTML =
        `<i class="bi bi-ui-checks-grid"></i> Configurar Claves Oficiales (${numPreg} Preguntas Totales)`;
      renderModalChecklist();
      dialog.showModal();
    });
  }

  if (btnAbrirRespEstudiante) {
    btnAbrirRespEstudiante.addEventListener("click", () => {
      const evalSelect = document.getElementById("eval-select-respuesta");
      const evalId = evalSelect?.value;
      const evalObj = evalState.globalEvaluaciones.find((e) => e.id === evalId);
      const codigoEst = (
        document.getElementById("eval-codigo-estudiante")?.value || ""
      )
        .trim()
        .toUpperCase();
      const statusEl = document.getElementById(
        "eval-respuestas-estudiante-status",
      );

      if (!evalObj) {
        if (statusEl)
          statusEl.innerHTML =
            '<span style="color:#dc2626;">⚠️ Selecciona un examen registrado arriba.</span>';
        return;
      }

      if (btnQuickAllAreas) btnQuickAllAreas.style.display = "none";
      if (btnToggleActitudinal) btnToggleActitudinal.style.display = "none";

      evalState.modalState.mode = "respuesta_estudiante";
      evalState.modalState.isAreasMode = false;
      evalState.modalState.numPreguntas =
        evalObj.totalPreguntasCuadernillo || evalObj.numPreguntas;

      const draft = evalState.responseDraft;
      const hasScannedAnswers = !!(
        draft &&
        draft.evalId === evalId &&
        draft.codigo === codigoEst
      );
      evalState.modalState.respuestas = hasScannedAnswers
        ? structuredClone(draft.respuestas)
        : {};

      let prevReg = null;
      if (codigoEst && Array.isArray(evalObj.respuestasEstudiantes)) {
        prevReg = evalObj.respuestasEstudiantes.find(
          (r) => String(r.codigoEstudiante).toUpperCase() === codigoEst,
        );
      }

      if (!hasScannedAnswers) {
        if (prevReg && prevReg.respuestas) {
          evalState.modalState.respuestas = { ...prevReg.respuestas };
        } else {
          evalState.modalState.respuestas = {};
        }
      }

      const count = Object.keys(evalState.modalState.respuestas).filter(
        (k) => evalState.modalState.respuestas[k],
      ).length;

      if (hasScannedAnswers) {
        document.getElementById("modal-clave-popup-title").innerHTML =
          `<i class="bi bi-camera-fill"></i> Respuestas Escaneadas: ${codigoEst} (${count}/${evalState.modalState.numPreguntas})`;
      } else if (prevReg && prevReg.respuestas) {
        document.getElementById("modal-clave-popup-title").innerHTML =
          `<i class="bi bi-pencil-square"></i> Modificar Respuestas: ${prevReg.nombreEstudiante || codigoEst} (${evalState.modalState.numPreguntas} Preguntas)`;
      } else {
        document.getElementById("modal-clave-popup-title").innerHTML =
          `<i class="bi bi-person-check-fill"></i> Registrar Respuestas Alumno: ${evalObj.titulo} (${evalState.modalState.numPreguntas} Preguntas)`;
      }

      renderModalChecklist();
      dialog.showModal();
    });
  }

  if (btnCerrar) {
    btnCerrar.onclick = () => dialog.close();
  }

  quickFillBtns.forEach((btn) => {
    btn.onclick = () => {
      const opt = btn.getAttribute("data-option");
      if (!opt) return;
      for (let i = 1; i <= evalState.modalState.numPreguntas; i++) {
        evalState.modalState.respuestas[i] = opt;
      }
      renderModalChecklist();
    };
  });

  if (btnClear) {
    btnClear.onclick = () => {
      evalState.modalState.respuestas = {};
      renderModalChecklist();
    };
  }

  if (btnGuardar) {
    btnGuardar.onclick = () => {
      const count = Object.keys(evalState.modalState.respuestas).filter(
        (k) => evalState.modalState.respuestas[k],
      ).length;

      if (evalState.modalState.mode === "clave") {
        evalState.keyDraft = structuredClone(evalState.modalState.respuestas);
        const statusEl = document.getElementById("eval-clave-resumen-status");
        const countSinDesc = Object.keys(
          evalState.modalState.preguntasSinDescuento || {},
        ).filter((k) => evalState.modalState.preguntasSinDescuento[k]).length;
        if (statusEl) {
          const actitudinalText =
            countSinDesc > 0
              ? ` (${countSinDesc} actitudinales sin descuento)`
              : "";
          statusEl.innerHTML = `<b style="color:#166534;">✅ Clave configurada: ${count} de ${evalState.modalState.numPreguntas} respuestas marcadas en el Pop-Up${actitudinalText}.</b>`;
        }
      } else {
        evalState.responseDraft = {
          evalId: document.getElementById("eval-select-respuesta").value,
          codigo: document
            .getElementById("eval-codigo-estudiante")
            .value.trim()
            .toUpperCase(),
          respuestas: structuredClone(evalState.modalState.respuestas),
        };
        const statusEl = document.getElementById(
          "eval-respuestas-estudiante-status",
        );
        if (statusEl) {
          statusEl.innerHTML = `<b style="color:#166534;">✅ Respuestas del estudiante: ${count} de ${evalState.modalState.numPreguntas} alternativas marcadas en el Pop-Up.</b>`;
        }
      }

      dialog.close();
    };
  }

  function renderModalChecklist() {
    if (!checklistContainer) return;

    let html = "";
    const options = ["A", "B", "C", "D", "E"];
    const allAreas = ["A", "B", "C", "D", "E"];
    const isClaveMode = evalState.modalState.mode === "clave";
    const isClaveAreas = isClaveMode && evalState.modalState.isAreasMode;
    const showActitudinalCol =
      isClaveMode && !!evalState.modalState.mostrarActitudinales;

    for (let i = 1; i <= evalState.modalState.numPreguntas; i++) {
      const qStr = String(i);
      const currentSelected = evalState.modalState.respuestas[i] || "";
      const currentAreas =
        evalState.modalState.areasPorPregunta?.[qStr] || allAreas;
      const isSinDescuento =
        isClaveMode && !!evalState.modalState.preguntasSinDescuento?.[qStr];

      let areasHtml = "";
      if (isClaveAreas) {
        areasHtml = `
          <div class="checklist-areas-group">
            <span style="font-size:0.75rem; font-weight:700; color:#64748b; margin-right:4px;">Áreas:</span>
            ${allAreas
              .map(
                (a) => `
              <label class="checklist-area-label">
                <input type="checkbox" class="chk-area-opt" data-q="${i}" data-area="${a}" ${currentAreas.includes(a) ? "checked" : ""} />
                ${a}
              </label>
            `,
              )
              .join("")}
          </div>
        `;
      }

      let actitudinalHtml = "";
      if (showActitudinalCol) {
        actitudinalHtml = `
          <label class="checklist-no-descuento-label ${isSinDescuento ? "active" : ""}" title="Si se marca, las respuestas incorrectas en esta pregunta no restarán puntaje (Pregunta Actitudinal)">
            <input type="checkbox" class="chk-no-descuento-opt" data-q="${i}" ${isSinDescuento ? "checked" : ""} />
            <span>🛡️ Sin Descuento</span>
          </label>
        `;
      }

      html += `
        <div class="checklist-q-row ${isSinDescuento ? "is-actitudinal" : ""}">
          <div class="checklist-q-num">Pregunta ${i}</div>
          <div class="checklist-options-group">
            ${options
              .map(
                (opt) => `
              <div class="opt-pill ${currentSelected === opt ? "selected" : ""}" data-q="${i}" data-opt="${opt}">
                ${opt}
              </div>
            `,
              )
              .join("")}
          </div>
          ${areasHtml}
          ${actitudinalHtml}
        </div>
      `;
    }

    checklistContainer.innerHTML = html;

    // Listeners de alternativas A-E
    checklistContainer.querySelectorAll(".opt-pill").forEach((pill) => {
      pill.onclick = () => {
        const q = pill.getAttribute("data-q");
        const opt = pill.getAttribute("data-opt");

        if (evalState.modalState.respuestas[q] === opt) {
          delete evalState.modalState.respuestas[q];
        } else {
          evalState.modalState.respuestas[q] = opt;
        }

        renderModalChecklist();
      };
    });

    // Listeners de checkboxes de áreas
    if (isClaveAreas) {
      checklistContainer.querySelectorAll(".chk-area-opt").forEach((chk) => {
        chk.onchange = () => {
          const q = chk.getAttribute("data-q");
          const area = chk.getAttribute("data-area");
          if (!evalState.modalState.areasPorPregunta[q]) {
            evalState.modalState.areasPorPregunta[q] = [
              "A",
              "B",
              "C",
              "D",
              "E",
            ];
          }

          let arr = evalState.modalState.areasPorPregunta[q];
          if (chk.checked) {
            if (!arr.includes(area)) arr.push(area);
          } else {
            arr = arr.filter((x) => x !== area);
          }
          evalState.modalState.areasPorPregunta[q] = arr;
        };
      });
    }

    // Listeners de checkboxes de actitudinal (sin descuento)
    if (showActitudinalCol) {
      checklistContainer
        .querySelectorAll(".chk-no-descuento-opt")
        .forEach((chk) => {
          chk.onchange = () => {
            const q = chk.getAttribute("data-q");
            if (!evalState.modalState.preguntasSinDescuento) {
              evalState.modalState.preguntasSinDescuento = {};
            }
            if (chk.checked) {
              evalState.modalState.preguntasSinDescuento[q] = true;
            } else {
              delete evalState.modalState.preguntasSinDescuento[q];
            }
            renderModalChecklist();
          };
        });
    }

    const counterEl = document.getElementById("modal-clave-counter-status");
    const count = Object.keys(evalState.modalState.respuestas).filter(
      (k) => evalState.modalState.respuestas[k],
    ).length;
    const countSinDesc = Object.keys(
      evalState.modalState.preguntasSinDescuento || {},
    ).filter((k) => evalState.modalState.preguntasSinDescuento[k]).length;
    if (counterEl) {
      if (isClaveMode && countSinDesc > 0) {
        counterEl.textContent = `${count} de ${evalState.modalState.numPreguntas} preguntas marcadas (${countSinDesc} actitudinales sin descuento)`;
      } else {
        counterEl.textContent = `${count} de ${evalState.modalState.numPreguntas} preguntas marcadas`;
      }
    }
  }
}
