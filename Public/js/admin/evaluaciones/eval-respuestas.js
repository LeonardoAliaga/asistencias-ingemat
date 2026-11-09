// Public/js/admin/evaluaciones/eval-respuestas.js

import { evalState } from "./eval-state.js";
import { cargarDatosEvaluaciones } from "./eval-crud.js";

// Registrar Respuestas de Estudiante con Detección Automática de Ciclo y Modalidad
export function setupFormRegistrarRespuesta() {
  const evalSelect = document.getElementById("eval-select-respuesta");
  const form = document.getElementById("form-registrar-respuestas-estudiante");
  const searchInput = document.getElementById("eval-student-search");
  const hiddenCodeInput = document.getElementById("eval-codigo-estudiante");
  const statusEl = document.getElementById("eval-respuestas-estudiante-status");
  const areaWrapper = document.getElementById("eval-area-postulante-wrapper");
  const testWrapper = document.getElementById("eval-modo-test-wrapper");
  const respuestasContainer = document.getElementById("eval-respuestas-estudiante-container");
  const notaDirectaInput = document.getElementById("eval-nota-directa-input");
  const areaSelect = document.getElementById("eval-estudiante-area");

  // Detección automática al cambiar la evaluación seleccionada
  if (evalSelect && searchInput) {
    evalSelect.addEventListener("change", () => {
      const evalId = evalSelect.value;
      const evalObj = evalState.globalEvaluaciones.find((e) => e.id === evalId);

      evalState.responseDraft=null;
      evalState.modalState.respuestas={};
      // Limpiar datos del alumno previamente buscado
      searchInput.value = "";
      if (hiddenCodeInput) hiddenCodeInput.value = "";
      if (notaDirectaInput) notaDirectaInput.value = "";

      if (evalObj) {
        searchInput.placeholder = `🔍 Buscar estudiante del ciclo ${evalObj.ciclo}...`;

        if (evalObj.tipo === "test") {
          if (testWrapper) testWrapper.style.display = "block";
          if (respuestasContainer) respuestasContainer.style.display = "none";
          if (areaWrapper) areaWrapper.style.display = "none";
          if (statusEl) {
            statusEl.innerHTML = `<span style="color:#166534; font-weight:700;">📝 Test / Evaluación Manual: ${evalObj.titulo} | Introduce la nota directa abajo.</span>`;
          }
        } else if (evalObj.tipo === "simulacro_areas") {
          if (testWrapper) testWrapper.style.display = "none";
          if (respuestasContainer) respuestasContainer.style.display = "block";
          if (areaWrapper) areaWrapper.style.display = "block";
          if (statusEl) {
            statusEl.innerHTML = `<span style="color:#0284c7; font-weight:700;">📌 Simulacro por Áreas: ${evalObj.titulo} (${evalObj.totalPreguntasCuadernillo || 120}p) | Ciclo: ${evalObj.ciclo}</span>`;
          }
        } else {
          // simulacro_estandar
          if (testWrapper) testWrapper.style.display = "none";
          if (respuestasContainer) respuestasContainer.style.display = "block";
          if (areaWrapper) areaWrapper.style.display = "none";
          if (statusEl) {
            statusEl.innerHTML = `<span style="color:#0284c7; font-weight:700;">📌 Examen: ${evalObj.titulo} | Ciclo: ${evalObj.ciclo} (${evalObj.numPreguntas} preguntas)</span>`;
          }
        }
      } else {
        if (testWrapper) testWrapper.style.display = "none";
        if (respuestasContainer) respuestasContainer.style.display = "block";
        if (areaWrapper) areaWrapper.style.display = "none";
        searchInput.placeholder = "🔍 Selecciona primero un examen arriba...";
        if (statusEl) {
          statusEl.innerHTML = "⚪ <i>Selecciona un examen y abre el Pop-Up o ingresa la nota.</i>";
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

      const evalObj = evalState.globalEvaluaciones.find((ev) => ev.id === evalId);
      const isTest = evalObj && evalObj.tipo === "test";
      const isAreas = evalObj && evalObj.tipo === "simulacro_areas";

      let requestBody = { codigoEstudiante };

      if (isTest) {
        const notaVal = notaDirectaInput ? notaDirectaInput.value : "";
        if (notaVal === "" || isNaN(parseFloat(notaVal))) {
          msg.innerHTML = '<span style="color:red;">⚠️ Ingresa la nota del estudiante antes de guardar.</span>';
          return;
        }
        requestBody.notaManual = parseFloat(notaVal);
      } else {
        const draft=evalState.responseDraft;
        const respuestas=draft&&draft.evalId===evalId&&draft.codigo===codigoEstudiante.toUpperCase()?draft.respuestas:{};
        requestBody.respuestas = respuestas;
        if (isAreas && areaSelect) {
          requestBody.area = areaSelect.value;
        }
      }

      try {
        const res = await fetch(`/api/evaluaciones/${evalId}/respuesta`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });

        const data = await res.json();
        if (data.exito) {
          const resObj = data.resultado;
          const puestoText =
            resObj.posicion !== undefined && resObj.posicion !== null ? `(Puesto #${resObj.posicion})` : "";
          const areaBadge = resObj.area ? `<span style="background:#e0f2fe; color:#0369a1; padding:2px 6px; border-radius:4px; font-size:0.8rem; font-weight:700;">Área ${resObj.area}</span>` : "";

          let detallesHtml = "";
          if (isTest) {
            detallesHtml = `<span style="font-size:1.15rem; font-weight:800; color:#166534;">Nota Final: ${resObj.puntajeTotal} pts</span> ${puestoText ? `<span style="font-weight:700; color:#1e293b;">${puestoText}</span>` : ""}`;
          } else {
            detallesHtml = `
              <span style="font-size:0.9rem; color:#334155;">✔ Correctas: <b style="color:#166534;">${resObj.correctas}</b> | ❌ Incorrectas: <b style="color:#dc2626;">${resObj.incorrectas}</b> | ⚪ En Blanco: <b>${resObj.enBlanco}</b></span><br/>
              <span style="font-size:1.05rem; font-weight:800; color:#b72107;">Puntaje Total: ${resObj.puntajeTotal} pts</span> ${puestoText ? `<span style="font-weight:700; color:#1e293b;">${puestoText}</span>` : ""} ${areaBadge}
            `;
          }

          msg.innerHTML = `
            <div id="eval-success-alert" style="background:#f0fdf4; border:1px solid #86efac; padding:12px 14px; border-radius:8px; margin-top:10px; transition: opacity 0.5s ease;">
              <b style="color:#166534;">✅ Calificación registrada para ${resObj.nombreEstudiante}:</b><br/>
              ${detallesHtml}
            </div>
          `;
          evalState.modalState.respuestas = {};
          if (notaDirectaInput) notaDirectaInput.value = "";
          await cargarDatosEvaluaciones();

          // Ocultar mensaje automáticamente tras unos segundos con animación suave
          if (window._evalSuccessMsgTimeout) clearTimeout(window._evalSuccessMsgTimeout);
          window._evalSuccessMsgTimeout = setTimeout(() => {
            const alertEl = document.getElementById("eval-success-alert");
            if (alertEl) {
              alertEl.style.opacity = "0";
              setTimeout(() => {
                if (msg) msg.innerHTML = "";
              }, 500);
            }
          }, 4500);
        } else {
          msg.innerHTML = `<span style="color:red;">❌ ${data.mensaje}</span>`;
        }
      } catch (err) {
        msg.innerHTML = '<span style="color:red;">❌ Error al conectar con el servidor.</span>';
      }
    });
  }
}
