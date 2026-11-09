// Public/js/admin/evaluaciones-admin.js
/**
 * Módulo Principal de Evaluaciones, Simulacros, Tareas y Reporte por Alumno.
 * Orquesta los submódulos especializados de /admin/evaluaciones/ y utilidades compartidas de /admin/common/.
 */

import { evalState } from "./evaluaciones/eval-state.js";
import { setupStudentAutocomplete } from "./common/autocomplete-utils.js";
import {
  setupSubtabs,
  cargarDatosEvaluaciones,
  setupFormCrearEvaluacion,
  setupModalClavePopup,
} from "./evaluaciones/eval-crud.js";
import { setupFormRegistrarRespuesta } from "./evaluaciones/eval-respuestas.js";
import {
  setupRankingSearch,
  limpiarSeleccionRanking,
} from "./evaluaciones/eval-ranking.js";
import { setupFormTareas } from "./evaluaciones/eval-tareas.js";
import {
  setupBuscadorReporteAlumno,
  buscarYRenderizarReporteAlumno,
} from "./evaluaciones/eval-reporte-alumno.js";
import { setupOMRModule } from "./evaluaciones/eval-omr.js";

export { cargarDatosEvaluaciones };

let isEvaluacionesInitialized = false;

/**
 * Inicializador global del panel de evaluaciones del Administrador.
 */
export function initEvaluacionesAdmin() {
  limpiarSeleccionRanking();

  if (!isEvaluacionesInitialized) {
    setupSubtabs();
    setupModalClavePopup();
    setupFormCrearEvaluacion();
    setupFormRegistrarRespuesta();
    setupRankingSearch();
    setupFormTareas();
    setupBuscadorReporteAlumno();
    setupOMRModule();

    // Autocompletado 1: Respuestas de Examen con filtrado automático por el ciclo del examen
    setupStudentAutocomplete(
      "eval-student-search",
      "eval-codigo-estudiante",
      "eval-student-results",
      () => {
        const evalId = document.getElementById("eval-select-respuesta")?.value;
        const evalObj = evalState.globalEvaluaciones.find(
          (e) => String(e.id) === String(evalId),
        );
        return evalObj ? evalObj.ciclo : null;
      },
      () => evalState.globalUsuarios,
      ({ code, name }) => {
        const evalSelect = document.getElementById("eval-select-respuesta");
        const evalId = evalSelect?.value;
        const evalObj = evalState.globalEvaluaciones.find(
          (e) => String(e.id) === String(evalId),
        );
        const statusEl = document.getElementById(
          "eval-respuestas-estudiante-status",
        );

        if (evalObj && Array.isArray(evalObj.respuestasEstudiantes)) {
          const prevReg = evalObj.respuestasEstudiantes.find(
            (r) =>
              String(r.codigoEstudiante).toUpperCase() ===
              String(code).toUpperCase(),
          );

          if (prevReg && statusEl) {
            statusEl.innerHTML = `<span style="color:#2563eb; font-weight:700;">✏️ ¡El estudiante ${name} ya rindió este examen! (Puntaje: ${prevReg.puntajeTotal} pts). Haz clic en "Abrir Pop-Up Respuestas" para corregir/modificar.</span>`;
          }
        }
      },
    );

    // Autocompletado 2: Registro de Tareas con filtrado por ciclo seleccionado
    setupStudentAutocomplete(
      "tarea-student-search",
      "tarea-codigo-estudiante",
      "tarea-student-results",
      () => document.getElementById("tarea-ciclo-select")?.value,
      () => evalState.globalUsuarios,
    );

    // Autocompletado 3: Buscador de Ficha/Reporte por Alumno
    setupStudentAutocomplete(
      "reporte-student-search",
      "search-reporte-alumno-codigo",
      "reporte-student-results",
      null,
      () => evalState.globalUsuarios,
      ({ code }) => {
        if (code) {
          buscarYRenderizarReporteAlumno(code);
        }
      },
    );

    isEvaluacionesInitialized = true;
  }
}
