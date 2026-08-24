// Public/js/admin/common/date-utils.js

/**
 * Calcula la semana de ciclo académico de Sábado a Viernes para una fecha dada.
 */
export function getSemanaSabadoVieInfo(refDate) {
  let date;
  if (!refDate) {
    date = new Date();
  } else if (typeof refDate === "string") {
    if (refDate.includes("_")) {
      const parts = refDate.split("_");
      date = new Date(parts[0] + "T12:00:00");
    } else {
      date = new Date(refDate.includes("T") ? refDate : refDate + "T12:00:00");
    }
  } else {
    date = new Date(refDate);
  }
  if (isNaN(date.getTime())) date = new Date();

  const day = date.getDay(); // 0: Dom, 1: Lun, ..., 6: Sab
  let diffToSat = 0;
  if (day === 6) diffToSat = 0;
  else diffToSat = -(day + 1);

  const sabado = new Date(date);
  sabado.setDate(date.getDate() + diffToSat);

  const viernes = new Date(sabado);
  viernes.setDate(sabado.getDate() + 6);

  const toYMD = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dayStr = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dayStr}`;
  };

  const toDM = (d) => {
    const dayStr = String(d.getDate()).padStart(2, "0");
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${dayStr}/${m}`;
  };

  const sabYMD = toYMD(sabado);
  const vieYMD = toYMD(viernes);

  return {
    value: `${sabYMD}_${vieYMD}`,
    label: `Semana: ${toDM(sabado)} al ${toDM(viernes)} (${sabado.getFullYear()})`,
    sabadoYMD: sabYMD,
    viernesYMD: vieYMD,
  };
}

/**
 * Extrae y consolida todas las semanas únicas registradas en un historial de evaluaciones y tareas.
 */
export function extraerSemanasRegistradas(evalHist = [], tareaHist = []) {
  const map = new Map();

  const procesarFecha = (fechaStr) => {
    if (!fechaStr) return;
    const info = getSemanaSabadoVieInfo(fechaStr);
    if (!map.has(info.value)) {
      map.set(info.value, {
        value: info.value,
        label: info.label,
        sabadoYMD: info.sabadoYMD,
        viernesYMD: info.viernesYMD,
      });
    }
  };

  evalHist.forEach((e) => procesarFecha(e.fecha));
  tareaHist.forEach((t) => procesarFecha(t.fecha));

  return Array.from(map.values()).sort((a, b) => b.sabadoYMD.localeCompare(a.sabadoYMD));
}

/**
 * Genera una lista de opciones de semanas (Sábado a Viernes) para selects.
 */
export function getSabadoVieOptions(cantSemanasAtras = 8, cantSemanasAdelante = 2) {
  const options = [];
  const hoy = new Date();
  const currentWeek = getSemanaSabadoVieInfo(hoy);

  const refDate = new Date(currentWeek.sabadoYMD + "T12:00:00");
  refDate.setDate(refDate.getDate() + cantSemanasAdelante * 7);

  const totalSemanas = cantSemanasAtras + cantSemanasAdelante + 1;
  for (let i = 0; i < totalSemanas; i++) {
    const wInfo = getSemanaSabadoVieInfo(refDate);
    const isActual = wInfo.value === currentWeek.value;
    options.push({
      value: wInfo.value,
      label: isActual ? `📌 ${wInfo.label} (Actual)` : wInfo.label,
      isActual,
    });
    refDate.setDate(refDate.getDate() - 7);
  }
  return options;
}

/**
 * Formatea fechas individuales (YYYY-MM-DD) o rangos semanales (YYYY-MM-DD_YYYY-MM-DD).
 */
export function formatFechaTarea(fStr) {
  if (!fStr) return "N/A";
  if (fStr.includes("_")) {
    const [ini, fin] = fStr.split("_");
    const fmt = (s) => {
      const p = s.split("-");
      return p.length === 3 ? `${p[2]}/${p[1]}` : s;
    };
    return `Semana ${fmt(ini)} al ${fmt(fin)}`;
  }
  const parts = fStr.split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return fStr;
}

/**
 * Calcula el rango de fechas consolidado de un historial de evaluaciones y tareas.
 */
export function calcularRangoFechas(evalHist = [], tareaHist = []) {
  const fechas = [];

  evalHist.forEach((e) => {
    if (e.fecha) fechas.push(e.fecha);
  });
  tareaHist.forEach((t) => {
    if (t.fecha) {
      if (t.fecha.includes("_")) {
        const [ini, fin] = t.fecha.split("_");
        fechas.push(ini);
        fechas.push(fin);
      } else {
        fechas.push(t.fecha);
      }
    }
  });

  if (fechas.length === 0) return "Sin registros acumulados";

  fechas.sort();

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
