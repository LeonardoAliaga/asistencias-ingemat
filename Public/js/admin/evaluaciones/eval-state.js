// Public/js/admin/evaluaciones/eval-state.js

/**
 * Estado reactivo compartido para el módulo de Evaluaciones, Simulacros, Tareas y Reportes.
 */
export const evalState = {
  globalEvaluaciones: [],
  globalCiclos: [],
  globalUsuarios: [],
  keyDraft: {},
  responseDraft: null,

  // Variables de estado del Pop-Up Modal de Registro de Claves
  modalState: {
    mode: "clave", // 'clave' o 'respuesta_estudiante'
    numPreguntas: 0,
    respuestas: {},
    areasPorPregunta: {},
    preguntasSinDescuento: {}, // { [qNum]: true / false }
    mostrarActitudinales: false,
  },

  // Datos temporales en memoria
  currentCartillaData: null,
  currentStudentReportData: null,
};
