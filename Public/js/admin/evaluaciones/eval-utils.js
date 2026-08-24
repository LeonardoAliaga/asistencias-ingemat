// Public/js/admin/evaluaciones/eval-utils.js

export {
  drawCanvasRoundRect,
  copyCanvasToClipboard,
  roundRect,
} from "../common/canvas-utils.js";

export {
  getSemanaSabadoVieInfo,
  extraerSemanasRegistradas,
  getSabadoVieOptions,
  formatFechaTarea,
  calcularRangoFechas,
} from "../common/date-utils.js";

export { setupStudentAutocomplete } from "../common/autocomplete-utils.js";

/**
 * Determina el estado, badge y entregabilidad de una tarea registrada.
 */
export function getTareaEstadoInfo(t) {
  const isBinario = String(t.tipoEvaluacion || "").toLowerCase() === "binario";
  const stUpper = String(t.estado || "").toUpperCase().trim();

  if (isBinario) {
    if (
      stUpper === "PRESENTÓ" ||
      stUpper === "PRESENTO" ||
      stUpper === "ENTREGÓ" ||
      stUpper === "ENTREGO" ||
      stUpper === "ENTREGADO" ||
      stUpper === "SI"
    ) {
      return {
        entregado: true,
        label: "🟢 PRESENTÓ",
        shortLabel: "PRESENTÓ",
        badgeBg: "#DCFCE7",
        badgeText: "#166534",
        badgeBorder: "#86EFAC",
      };
    } else {
      return {
        entregado: false,
        label: "🔴 NO PRESENTÓ",
        shortLabel: "NO PRESENTÓ",
        badgeBg: "#FEE2E2",
        badgeText: "#991B1B",
        badgeBorder: "#FCA5A5",
      };
    }
  } else {
    if (t.nota !== null && t.nota !== undefined && !isNaN(Number(t.nota))) {
      const notaNum = Number(t.nota);
      const isAprobado = notaNum >= 11;
      return {
        entregado: true,
        label: `NOTA: ${notaNum % 1 === 0 ? notaNum : notaNum.toFixed(1)} / 20`,
        shortLabel: `${notaNum % 1 === 0 ? notaNum : notaNum.toFixed(1)} / 20`,
        badgeBg: isAprobado ? "#DCFCE7" : "#FEF3C7",
        badgeText: isAprobado ? "#166534" : "#B45309",
        badgeBorder: isAprobado ? "#86EFAC" : "#FDE68A",
      };
    } else if (
      stUpper === "NO PRESENTÓ" ||
      stUpper === "NO PRESENTO" ||
      stUpper === "NO ENTREGÓ" ||
      stUpper === "NO ENTREGO" ||
      stUpper === "NO"
    ) {
      return {
        entregado: false,
        label: "🔴 NO PRESENTÓ",
        shortLabel: "NO PRESENTÓ",
        badgeBg: "#FEE2E2",
        badgeText: "#991B1B",
        badgeBorder: "#FCA5A5",
      };
    } else {
      return {
        entregado: true,
        label: t.estado || "EVALUADO",
        shortLabel: t.estado || "EVALUADO",
        badgeBg: "#F1F5F9",
        badgeText: "#334155",
        badgeBorder: "#CBD5E1",
      };
    }
  }
}
