// Public/js/admin/evaluaciones/eval-reporte-alumno.js

import { evalState } from "./eval-state.js";
let reportRequest = 0;
import {
  drawCanvasRoundRect,
  copyCanvasToClipboard,
  formatFechaTarea,
  getTareaEstadoInfo,
  calcularRangoFechas,
  getSemanaSabadoVieInfo,
  extraerSemanasRegistradas,
} from "./eval-utils.js";

// 9. Buscador y Reporte Consolidado por Alumno
export async function buscarYRenderizarReporteAlumno(codigoEstudiante) {
  const dashboardContainer = document.getElementById(
    "alumno-reporte-dashboard",
  );
  const toolbar = document.getElementById("reporte-alumno-toolbar");
  const semanaSelect = document.getElementById("reporte-alumno-semana-select");

  let cod = (codigoEstudiante || "").trim();
  if (!cod) {
    const hiddenInput = document.getElementById("search-reporte-alumno-codigo");
    const textInput = document.getElementById("reporte-student-search");
    cod = (hiddenInput?.value || "").trim();
    if (!cod && textInput?.value) {
      const match = textInput.value.match(/\[([a-zA-Z0-9_-]+)\]/);
      if (match) {
        cod = match[1];
      } else {
        cod = textInput.value.trim();
      }
    }
  }

  if (!cod) return;
  const token = ++reportRequest;
  evalState.currentStudentReportData = null;
  if (toolbar) toolbar.style.display = "none";

  try {
    const res = await fetch(
      `/api/evaluaciones/reporte-estudiante/${encodeURIComponent(cod)}`,
    );
    const data = await res.json();
    if (token !== reportRequest) return;

    if (data.exito) {
      const rawEval = data.historialEvaluaciones || [];
      const rawTarea = data.historialTareas || [];
      const semanas = extraerSemanasRegistradas(rawEval, rawTarea);

      if (semanaSelect) {
        if (semanas.length > 0) {
          semanaSelect.innerHTML = [
            `<option value="TODAS">📅 Todas las Semanas Registradas (${semanas.length})</option>`,
            ...semanas.map(
              (s) => `<option value="${s.value}">${s.label}</option>`,
            ),
          ].join("");
        } else {
          semanaSelect.innerHTML = `<option value="TODAS">📅 Todas las Semanas Registradas</option>`;
        }
        semanaSelect.value = "TODAS";
      }

      evalState.currentStudentReportData = {
        estudiante: data.estudiante,
        rawEvalHist: rawEval,
        rawTareaHist: rawTarea,
        evalHist: rawEval,
        tareaHist: rawTarea,
        selectedSemana: "TODAS",
        selectedSemanaLabel: null,
      };

      if (toolbar) toolbar.style.display = "flex";
      renderDashboardEstudiante(data.estudiante, rawEval, rawTarea, null);
    } else {
      evalState.currentStudentReportData = null;
      if (toolbar) toolbar.style.display = "none";
      if (dashboardContainer) {
        dashboardContainer.innerHTML = `<div class="eval-card-box" style="text-align:center; padding:30px; color:#ef4444; border:1px solid #fecaca; background:#fef2f2;">⚠️ ${data.mensaje}</div>`;
      }
    }
  } catch (err) {
    console.error("Error al buscar estudiante:", err);
  }
}

// Aplicar filtro reactivo según la semana seleccionada
export function aplicarFiltroSemanaReporte() {
  if (!evalState.currentStudentReportData) return;

  const semanaSelect = document.getElementById("reporte-alumno-semana-select");
  const selectedVal = semanaSelect ? semanaSelect.value : "TODAS";
  const { estudiante, rawEvalHist, rawTareaHist } =
    evalState.currentStudentReportData;

  let evalFiltradas = rawEvalHist;
  let tareasFiltradas = rawTareaHist;
  let semanaLabel = null;

  if (selectedVal && selectedVal !== "TODAS") {
    evalFiltradas = rawEvalHist.filter((e) => {
      const info = getSemanaSabadoVieInfo(e.fecha);
      return info.value === selectedVal;
    });
    tareasFiltradas = rawTareaHist.filter((t) => {
      const info = getSemanaSabadoVieInfo(t.fecha);
      return info.value === selectedVal;
    });
    const optText =
      semanaSelect.options[semanaSelect.selectedIndex]?.text || selectedVal;
    semanaLabel = optText;
  }

  evalState.currentStudentReportData.evalHist = evalFiltradas;
  evalState.currentStudentReportData.tareaHist = tareasFiltradas;
  evalState.currentStudentReportData.selectedSemana = selectedVal;
  evalState.currentStudentReportData.selectedSemanaLabel = semanaLabel;

  renderDashboardEstudiante(
    estudiante,
    evalFiltradas,
    tareasFiltradas,
    semanaLabel,
  );
}

export function setupBuscadorReporteAlumno() {
  const textInput = document.getElementById("reporte-student-search");
  const btnSearch = document.getElementById("btn-buscar-reporte-alumno");
  const btnPrint = document.getElementById("btn-imprimir-reporte-alumno");
  const btnCopyTareasImg = document.getElementById("btn-copiar-imagen-tareas");
  const btnCopyReporteImg = document.getElementById(
    "btn-copiar-imagen-reporte",
  );
  const semanaSelect = document.getElementById("reporte-alumno-semana-select");
  const sendWhatsApp = document.getElementById("btn-whatsapp-reporte-alumno");
  window.ingematSession.then((session) => {
    sendWhatsApp.hidden = session.usuario?.role !== "admin";
  });
  sendWhatsApp.onclick = async () => {
    const errorMessage = document.getElementById("student-report-wa-message");
    errorMessage.hidden = true;
    sendWhatsApp.disabled = true;
    try {
      const report = structuredClone(evalState.currentStudentReportData);
      if (!report) throw new Error("Selecciona primero un estudiante.");
      if (report.evalHist.length + report.tareaHist.length > 500)
        throw new Error(
          "Selecciona una semana para reducir el tamaño del reporte.",
        );
      const { openStudentReport } = await import("../report-whatsapp.js");
      const canvas = crearCanvasReporteCompleto(
        report.estudiante,
        report.evalHist,
        report.tareaHist,
        report.selectedSemanaLabel,
      );
      await openStudentReport({ report, canvas });
    } catch (error) {
      errorMessage.textContent = error.message;
      errorMessage.hidden = false;
    } finally {
      sendWhatsApp.disabled = false;
    }
  };

  if (semanaSelect) {
    semanaSelect.onchange = () => {
      aplicarFiltroSemanaReporte();
    };
  }

  if (btnPrint) {
    btnPrint.onclick = () => {
      if (evalState.currentStudentReportData) {
        generarFichaAlumnoPDF(
          evalState.currentStudentReportData.estudiante,
          evalState.currentStudentReportData.evalHist,
          evalState.currentStudentReportData.tareaHist,
          evalState.currentStudentReportData.selectedSemanaLabel,
        );
      } else {
        window.print();
      }
    };
  }

  if (btnCopyTareasImg) {
    btnCopyTareasImg.onclick = () => {
      if (evalState.currentStudentReportData) {
        copiarReporteTareasImagen(
          evalState.currentStudentReportData.estudiante,
          evalState.currentStudentReportData.tareaHist,
          evalState.currentStudentReportData.selectedSemanaLabel,
        );
      } else {
        alert(
          "⚠️ Seleccione primero un estudiante para generar el reporte de tareas.",
        );
      }
    };
  }

  if (btnCopyReporteImg) {
    btnCopyReporteImg.onclick = () => {
      if (evalState.currentStudentReportData) {
        copiarReporteCompletoImagen(
          evalState.currentStudentReportData.estudiante,
          evalState.currentStudentReportData.evalHist,
          evalState.currentStudentReportData.tareaHist,
          evalState.currentStudentReportData.selectedSemanaLabel,
        );
      } else {
        alert(
          "⚠️ Seleccione primero un estudiante para generar la ficha integral.",
        );
      }
    };
  }

  if (btnSearch) {
    btnSearch.onclick = () => buscarYRenderizarReporteAlumno();
  }

  if (textInput) {
    textInput.onkeydown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        buscarYRenderizarReporteAlumno();
      }
    };
  }
}

// Generador de Ficha de Alumno en Documento PDF Limpio y Organizado
export function generarFichaAlumnoPDF(
  est,
  evalHist,
  tareaHist,
  semanaLabel = null,
) {
  const hoyStr = new Date().toLocaleDateString("es-PE", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const rangoFechas = semanaLabel
    ? semanaLabel.replace(/^📅\s*/, "")
    : calcularRangoFechas(evalHist, tareaHist);
  const tagReporte = semanaLabel
    ? "FICHA SEMANAL PDF"
    : "FICHA CONSOLIDADA PDF";

  let evalRows = "";
  if (evalHist.length === 0) {
    evalRows = `<tr><td colspan="7" style="text-align:center; padding:14px; color:#64748b;">${semanaLabel ? "Sin evaluaciones registradas en la semana seleccionada" : "Sin evaluaciones registradas"}</td></tr>`;
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
    tareaRows = `<tr><td colspan="4" style="text-align:center; padding:14px; color:#64748b;">${semanaLabel ? "Sin tareas registradas en la semana seleccionada" : "Sin tareas registradas"}</td></tr>`;
  } else {
    tareaHist.forEach((t) => {
      const stInfo = getTareaEstadoInfo(t);
      const calif = `<span style="background:${stInfo.badgeBg}; color:${stInfo.badgeText}; border:1px solid ${stInfo.badgeBorder}; padding:2px 8px; border-radius:4px; font-weight:700;">${stInfo.label}</span>`;
      tareaRows += `
        <tr>
          <td style="padding:9px 12px; border-bottom:1px solid #e2e8f0; font-weight:700; color:#0f172a;">${t.curso}</td>
          <td style="padding:9px 12px; border-bottom:1px solid #e2e8f0; text-align:center;">${formatFechaTarea(t.fecha)}</td>
          <td style="padding:9px 12px; border-bottom:1px solid #e2e8f0; text-align:center;">${t.ciclo}</td>
          <td style="padding:9px 12px; border-bottom:1px solid #e2e8f0; text-align:center;">${calif}</td>
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
        <div class="report-tag">${tagReporte}</div>
      </div>

      <div class="student-box">
        <div class="student-info">
          <h2>${est.nombre}</h2>
          <p><b>Código de Estudiante:</b> ${est.codigo} &nbsp;|&nbsp; <b>Ciclo / Salón:</b> ${est.ciclo}</p>
          <p><b>Turno:</b> ${est.turno} &nbsp;|&nbsp; <b>${semanaLabel ? "Semana Evaluada" : "Periodo Evaluado"}:</b> <span style="color:#b72107; font-weight:700;">${rangoFechas}</span></p>
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
          <div class="metric-lbl">${semanaLabel ? "Semana Evaluada" : "Periodo Evaluado"}</div>
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

// Generador de Imagen de Reporte Exclusivo de Tareas (Entregadas y No Entregadas) para Copiar al Portapapeles
export function copiarReporteTareasImagen(
  est,
  tareaHist = [],
  semanaLabel = null,
) {
  const canvas = document.createElement("canvas");
  const canvasWidth = 1000;
  const rowHeight = 38;
  const headerHeight = 225;
  const tableHeaderHeight = 38;
  const footerHeight = 70;
  const numRows = Math.max(tareaHist.length, 1);

  canvas.width = canvasWidth;
  canvas.height =
    headerHeight + tableHeaderHeight + numRows * rowHeight + footerHeight;
  const ctx = canvas.getContext("2d");

  // Fondo Hueso
  ctx.fillStyle = "#FDFBF7";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Barra de Acento Superior
  ctx.fillStyle = "#B72107";
  ctx.fillRect(0, 0, canvasWidth, 12);

  // Encabezado Institucional
  ctx.fillStyle = "#0F172A";
  ctx.font = "bold 28px 'Segoe UI', Tahoma, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("ACADEMIA PREUNIVERSITARIA INGEMAT", canvasWidth / 2, 48);

  ctx.fillStyle = "#B72107";
  ctx.font = "bold 18px 'Segoe UI', Tahoma, sans-serif";
  ctx.fillText(
    semanaLabel
      ? "CONTROL SEMANAL DE ENTREGA DE TAREAS"
      : "CONTROL Y REPORTE DE ENTREGA DE TAREAS",
    canvasWidth / 2,
    75,
  );

  const hoyStr = new Date().toLocaleDateString("es-PE", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const rangoFechas = semanaLabel
    ? semanaLabel.replace(/^📅\s*/, "")
    : calcularRangoFechas([], tareaHist);

  // Tarjeta de Información del Estudiante
  const startX = 40;
  const tableWidth = 920;
  drawCanvasRoundRect(
    ctx,
    startX,
    92,
    tableWidth,
    62,
    8,
    "#FFFFFF",
    "#CBD5E1",
    1,
  );

  ctx.fillStyle = "#0F172A";
  ctx.font = "bold 16px 'Segoe UI', Tahoma, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`Estudiante: ${est.nombre || "Estudiante"}`, startX + 16, 116);

  ctx.fillStyle = "#475569";
  ctx.font = "13px 'Segoe UI', Tahoma, sans-serif";
  ctx.fillText(
    `Código: ${est.codigo}   |   Salón / Ciclo: ${est.ciclo || "N/A"}   |   Turno: ${est.turno || "MAÑANA"}`,
    startX + 16,
    138,
  );

  ctx.textAlign = "right";
  ctx.fillStyle = "#B72107";
  ctx.font = "bold 13px 'Segoe UI', Tahoma, sans-serif";
  ctx.fillText(
    `${semanaLabel ? "Semana" : "Periodo"}: ${rangoFechas}`,
    startX + tableWidth - 16,
    116,
  );

  ctx.fillStyle = "#64748B";
  ctx.font = "12.5px 'Segoe UI', Tahoma, sans-serif";
  ctx.fillText(`Emisión: ${hoyStr}`, startX + tableWidth - 16, 138);

  // Tarjetas Resumen / KPIs
  let entCount = 0;
  let noEntCount = 0;
  tareaHist.forEach((t) => {
    const info = getTareaEstadoInfo(t);
    if (info.entregado) entCount++;
    else noEntCount++;
  });
  const totalT = tareaHist.length;
  const pctCumplimiento =
    totalT > 0 ? Math.round((entCount / totalT) * 100) : 0;

  const kpiY = 164;
  const kpiH = 46;
  const kpiW = (tableWidth - 30) / 4;

  // 1. Total
  drawCanvasRoundRect(
    ctx,
    startX,
    kpiY,
    kpiW,
    kpiH,
    6,
    "#FFFFFF",
    "#CBD5E1",
    1,
  );
  ctx.textAlign = "center";
  ctx.fillStyle = "#64748B";
  ctx.font = "bold 11px 'Segoe UI', sans-serif";
  ctx.fillText("TOTAL TAREAS", startX + kpiW / 2, kpiY + 18);
  ctx.fillStyle = "#0F172A";
  ctx.font = "bold 18px 'Segoe UI', sans-serif";
  ctx.fillText(String(totalT), startX + kpiW / 2, kpiY + 38);

  // 2. Entregadas
  const kpi2X = startX + kpiW + 10;
  drawCanvasRoundRect(ctx, kpi2X, kpiY, kpiW, kpiH, 6, "#F0FDF4", "#86EFAC", 1);
  ctx.fillStyle = "#166534";
  ctx.font = "bold 11px 'Segoe UI', sans-serif";
  ctx.fillText("🟢 ENTREGADAS", kpi2X + kpiW / 2, kpiY + 18);
  ctx.font = "bold 18px 'Segoe UI', sans-serif";
  ctx.fillText(String(entCount), kpi2X + kpiW / 2, kpiY + 38);

  // 3. No Entregadas
  const kpi3X = kpi2X + kpiW + 10;
  drawCanvasRoundRect(ctx, kpi3X, kpiY, kpiW, kpiH, 6, "#FEF2F2", "#FECACA", 1);
  ctx.fillStyle = "#DC2626";
  ctx.font = "bold 11px 'Segoe UI', sans-serif";
  ctx.fillText("🔴 NO ENTREGADAS", kpi3X + kpiW / 2, kpiY + 18);
  ctx.font = "bold 18px 'Segoe UI', sans-serif";
  ctx.fillText(String(noEntCount), kpi3X + kpiW / 2, kpiY + 38);

  // 4. Cumplimiento
  const kpi4X = kpi3X + kpiW + 10;
  drawCanvasRoundRect(ctx, kpi4X, kpiY, kpiW, kpiH, 6, "#EFF6FF", "#BFDBFE", 1);
  ctx.fillStyle = "#1D4ED8";
  ctx.font = "bold 11px 'Segoe UI', sans-serif";
  ctx.fillText("📊 CUMPLIMIENTO", kpi4X + kpiW / 2, kpiY + 18);
  ctx.font = "bold 18px 'Segoe UI', sans-serif";
  ctx.fillText(`${pctCumplimiento}%`, kpi4X + kpiW / 2, kpiY + 38);

  // Encabezado de la Tabla
  const tableStartY = 222;
  ctx.fillStyle = "#B72107";
  ctx.fillRect(startX, tableStartY, tableWidth, tableHeaderHeight);
  ctx.strokeStyle = "#991B1B";
  ctx.lineWidth = 1;
  ctx.strokeRect(startX, tableStartY, tableWidth, tableHeaderHeight);

  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 14px 'Segoe UI', sans-serif";

  ctx.textAlign = "center";
  ctx.fillText("N°", startX + 30, tableStartY + 24);
  ctx.textAlign = "left";
  ctx.fillText("CURSO / ASIGNATURA", startX + 75, tableStartY + 24);
  ctx.textAlign = "center";
  ctx.fillText("SEMANA / FECHA", startX + 460, tableStartY + 24);
  ctx.fillText("SALÓN / CICLO", startX + 660, tableStartY + 24);
  ctx.fillText("ESTADO / CALIFICACIÓN", startX + 805, tableStartY + 24);

  // Filas de la Tabla
  let currentY = tableStartY + tableHeaderHeight;

  if (tareaHist.length === 0) {
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(startX, currentY, tableWidth, rowHeight);
    ctx.strokeStyle = "#CBD5E1";
    ctx.strokeRect(startX, currentY, tableWidth, rowHeight);

    ctx.fillStyle = "#64748B";
    ctx.font = "italic 14px 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(
      semanaLabel
        ? "Sin tareas registradas en la semana seleccionada."
        : "El estudiante no cuenta con registros de tareas.",
      startX + tableWidth / 2,
      currentY + 24,
    );
    currentY += rowHeight;
  } else {
    tareaHist.forEach((t, idx) => {
      const isEven = idx % 2 === 0;
      const bgRow = isEven ? "#FFFFFF" : "#F8FAFC";

      ctx.fillStyle = bgRow;
      ctx.fillRect(startX, currentY, tableWidth, rowHeight);

      ctx.strokeStyle = "#E2E8F0";
      ctx.lineWidth = 1;
      ctx.strokeRect(startX, currentY, tableWidth, rowHeight);

      // Divisores verticales
      ctx.beginPath();
      [startX + 60, startX + 360, startX + 570, startX + 740].forEach((x) => {
        ctx.moveTo(x, currentY);
        ctx.lineTo(x, currentY + rowHeight);
      });
      ctx.stroke();

      // N°
      ctx.fillStyle = "#64748B";
      ctx.textAlign = "center";
      ctx.font = "bold 13.5px 'Segoe UI', sans-serif";
      ctx.fillText(String(idx + 1), startX + 30, currentY + 24);

      // Curso
      ctx.textAlign = "left";
      ctx.fillStyle = "#0F172A";
      ctx.font = "bold 14px 'Segoe UI', sans-serif";
      ctx.fillText(t.curso || "N/A", startX + 75, currentY + 24);

      // Fecha
      ctx.textAlign = "center";
      ctx.fillStyle = "#334155";
      ctx.font = "13px 'Segoe UI', sans-serif";
      ctx.fillText(formatFechaTarea(t.fecha), startX + 465, currentY + 24);

      // Ciclo
      ctx.fillStyle = "#475569";
      ctx.font = "12.5px 'Segoe UI', sans-serif";
      ctx.fillText(t.ciclo || est.ciclo || "N/A", startX + 655, currentY + 24);

      // Estado / Calificación
      const stInfo = getTareaEstadoInfo(t);
      const badgeW = 145;
      const badgeH = 26;
      const badgeX = startX + 740 + (tableWidth - 740 - badgeW) / 2;
      const badgeY = currentY + (rowHeight - badgeH) / 2;

      drawCanvasRoundRect(
        ctx,
        badgeX,
        badgeY,
        badgeW,
        badgeH,
        13,
        stInfo.badgeBg,
        stInfo.badgeBorder,
        1,
      );
      ctx.textAlign = "center";
      ctx.fillStyle = stInfo.badgeText;
      ctx.font = "bold 12.5px 'Segoe UI', sans-serif";
      ctx.fillText(stInfo.label, badgeX + badgeW / 2, badgeY + 18);

      currentY += rowHeight;
    });
  }

  // Pie de Página
  ctx.fillStyle = "#64748B";
  ctx.font = "13.5px 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(
    "¡Constancia y disciplina para alcanzar el ingreso universitario! • INGEMAT",
    canvasWidth / 2,
    currentY + 40,
  );

  const sufijo = semanaLabel
    ? `_${semanaLabel.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 25)}`
    : "";
  const filename = `Tareas_${(est.nombre || "Estudiante").replace(/[^a-zA-Z0-9]/g, "_")}_${est.codigo}${sufijo}.png`;
  copyCanvasToClipboard(
    canvas,
    filename,
    `¡Imagen de Tareas ${semanaLabel ? `(${semanaLabel})` : ""} de "${est.nombre}" copiada con éxito al portapapeles!`,
  );
}

// Generador de Imagen de Reporte Consolidado Completo (Evaluaciones + Tareas) para Copiar al Portapapeles
export function crearCanvasReporteCompleto(
  est,
  evalHist = [],
  tareaHist = [],
  semanaLabel = null,
) {
  const canvas = document.createElement("canvas");
  const canvasWidth = 1100;
  canvas.reportPageBreaks = [];
  const rowHeight = 38;
  const sectionTitleHeight = 36;
  const tableHeaderHeight = 36;

  const hoyStr = new Date().toLocaleDateString("es-PE", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const rangoFechas = semanaLabel
    ? semanaLabel.replace(/^📅\s*/, "")
    : calcularRangoFechas(evalHist, tareaHist);

  const numEvalRows = Math.max(evalHist.length, 1);
  const numTareaRows = Math.max(tareaHist.length, 1);

  // Dimensiones dinámicas
  const headerBlockHeight = 175;
  const kpiBlockHeight = 56;
  const evalSectionHeight =
    sectionTitleHeight + tableHeaderHeight + numEvalRows * rowHeight + 16;
  const tareaSectionHeight =
    sectionTitleHeight + tableHeaderHeight + numTareaRows * rowHeight + 16;
  const footerBlockHeight = 110;

  canvas.width = canvasWidth;
  canvas.height =
    headerBlockHeight +
    kpiBlockHeight +
    evalSectionHeight +
    tareaSectionHeight +
    footerBlockHeight;
  const ctx = canvas.getContext("2d");

  // Fondo Hueso
  ctx.fillStyle = "#FDFBF7";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Barra de Acento Superior
  ctx.fillStyle = "#B72107";
  ctx.fillRect(0, 0, canvasWidth, 12);

  // Encabezado Institucional
  ctx.fillStyle = "#0F172A";
  ctx.font = "bold 30px 'Segoe UI', Tahoma, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("ACADEMIA PREUNIVERSITARIA INGEMAT", canvasWidth / 2, 48);

  ctx.fillStyle = "#B72107";
  ctx.font = "bold 19px 'Segoe UI', Tahoma, sans-serif";
  ctx.fillText(
    semanaLabel
      ? "FICHA SEMANAL INTEGRAL DE DESEMPEÑO"
      : "FICHA CONSOLIDADA INTEGRAL DE DESEMPEÑO",
    canvasWidth / 2,
    76,
  );

  // Tarjeta de Información del Estudiante
  const startX = 40;
  const tableWidth = 1020;
  drawCanvasRoundRect(
    ctx,
    startX,
    94,
    tableWidth,
    64,
    8,
    "#FFFFFF",
    "#CBD5E1",
    1,
  );

  ctx.fillStyle = "#0F172A";
  ctx.font = "bold 17px 'Segoe UI', Tahoma, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`Estudiante: ${est.nombre || "Estudiante"}`, startX + 18, 120);

  ctx.fillStyle = "#475569";
  ctx.font = "13.5px 'Segoe UI', Tahoma, sans-serif";
  ctx.fillText(
    `Código: ${est.codigo}   |   Ciclo: ${est.ciclo || "N/A"}   |   Turno: ${est.turno || "MAÑANA"}`,
    startX + 18,
    143,
  );

  ctx.textAlign = "right";
  ctx.fillStyle = "#B72107";
  ctx.font = "bold 13.5px 'Segoe UI', Tahoma, sans-serif";
  ctx.fillText(
    `${semanaLabel ? "Semana" : "Periodo"}: ${rangoFechas}`,
    startX + tableWidth - 18,
    120,
  );

  ctx.fillStyle = "#64748B";
  ctx.font = "12.5px 'Segoe UI', Tahoma, sans-serif";
  ctx.fillText(`Emisión: ${hoyStr}`, startX + tableWidth - 18, 143);

  // Indicadores Rápidos / KPIs
  let entCount = 0;
  tareaHist.forEach((t) => {
    if (getTareaEstadoInfo(t).entregado) entCount++;
  });
  const totalT = tareaHist.length;
  const pctCumplimiento =
    totalT > 0 ? Math.round((entCount / totalT) * 100) : 0;

  let totalPts = 0;
  evalHist.forEach((e) => {
    totalPts += Number(e.puntajeTotal || 0);
  });
  const promPts =
    evalHist.length > 0 ? (totalPts / evalHist.length).toFixed(1) : "0";

  const kpiY = 168;
  const kpiH = 46;
  const kpiW = (tableWidth - 30) / 4;

  // KPI 1: Examenes Rendidos
  drawCanvasRoundRect(
    ctx,
    startX,
    kpiY,
    kpiW,
    kpiH,
    6,
    "#FFFFFF",
    "#CBD5E1",
    1,
  );
  ctx.textAlign = "center";
  ctx.fillStyle = "#64748B";
  ctx.font = "bold 10.5px 'Segoe UI', sans-serif";
  ctx.fillText("EXÁMENES RENDIDOS", startX + kpiW / 2, kpiY + 17);
  ctx.fillStyle = "#B72107";
  ctx.font = "bold 18px 'Segoe UI', sans-serif";
  ctx.fillText(String(evalHist.length), startX + kpiW / 2, kpiY + 38);

  // KPI 2: Promedio de Puntaje
  const k2X = startX + kpiW + 10;
  drawCanvasRoundRect(ctx, k2X, kpiY, kpiW, kpiH, 6, "#FFFFFF", "#CBD5E1", 1);
  ctx.fillStyle = "#64748B";
  ctx.font = "bold 10.5px 'Segoe UI', sans-serif";
  ctx.fillText("PROMEDIO PUNTAJE", k2X + kpiW / 2, kpiY + 17);
  ctx.fillStyle = "#0F172A";
  ctx.font = "bold 18px 'Segoe UI', sans-serif";
  ctx.fillText(`${promPts} pts`, k2X + kpiW / 2, kpiY + 38);

  // KPI 3: Tareas Entregadas
  const k3X = k2X + kpiW + 10;
  drawCanvasRoundRect(ctx, k3X, kpiY, kpiW, kpiH, 6, "#F0FDF4", "#86EFAC", 1);
  ctx.fillStyle = "#166534";
  ctx.font = "bold 10.5px 'Segoe UI', sans-serif";
  ctx.fillText("TAREAS ENTREGADAS", k3X + kpiW / 2, kpiY + 17);
  ctx.font = "bold 18px 'Segoe UI', sans-serif";
  ctx.fillText(`${entCount} / ${totalT}`, k3X + kpiW / 2, kpiY + 38);

  // KPI 4: % Cumplimiento Tareas
  const k4X = k3X + kpiW + 10;
  drawCanvasRoundRect(ctx, k4X, kpiY, kpiW, kpiH, 6, "#EFF6FF", "#BFDBFE", 1);
  ctx.fillStyle = "#1D4ED8";
  ctx.font = "bold 10.5px 'Segoe UI', sans-serif";
  ctx.fillText("CUMPLIMIENTO TAREAS", k4X + kpiW / 2, kpiY + 17);
  ctx.font = "bold 18px 'Segoe UI', sans-serif";
  ctx.fillText(`${pctCumplimiento}%`, k4X + kpiW / 2, kpiY + 38);

  let currentY = kpiY + kpiH + 18;

  // SECCIÓN 1: HISTORIAL DE EVALUACIONES
  ctx.fillStyle = "#B72107";
  ctx.fillRect(startX, currentY, 5, 20);

  ctx.fillStyle = "#0F172A";
  ctx.font = "bold 15px 'Segoe UI', sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(
    "HISTORIAL DE EVALUACIONES Y SIMULACROS",
    startX + 14,
    currentY + 16,
  );

  currentY += 26;

  ctx.fillStyle = "#0F172A";
  ctx.fillRect(startX, currentY, tableWidth, tableHeaderHeight);
  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 1;
  ctx.strokeRect(startX, currentY, tableWidth, tableHeaderHeight);

  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 13.5px 'Segoe UI', sans-serif";

  ctx.textAlign = "center";
  ctx.fillText("PUESTO", startX + 45, currentY + 23);
  ctx.textAlign = "left";
  ctx.fillText("EVALUACIÓN / EXAMEN", startX + 110, currentY + 23);
  ctx.textAlign = "center";
  ctx.fillText("FECHA", startX + 570, currentY + 23);
  ctx.fillText("CORRECTAS", startX + 680, currentY + 23);
  ctx.fillText("INCORRECTAS", startX + 785, currentY + 23);
  ctx.fillText("EN BLANCO", startX + 880, currentY + 23);
  ctx.fillText("PUNTAJE", startX + 965, currentY + 23);

  currentY += tableHeaderHeight;

  if (evalHist.length === 0) {
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(startX, currentY, tableWidth, rowHeight);
    ctx.strokeStyle = "#CBD5E1";
    ctx.strokeRect(startX, currentY, tableWidth, rowHeight);

    ctx.fillStyle = "#64748B";
    ctx.font = "italic 13.5px 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(
      semanaLabel
        ? "Sin simulacros o exámenes registrados en la semana seleccionada."
        : "El estudiante no cuenta con simulacros o exámenes registrados.",
      startX + tableWidth / 2,
      currentY + 24,
    );
    currentY += rowHeight + 14;
    canvas.reportPageBreaks.push(currentY - 14);
  } else {
    evalHist.forEach((e, idx) => {
      let bgRow = idx % 2 === 0 ? "#FFFFFF" : "#F8FAFC";
      if (e.posicion === 1) bgRow = "#FEF9C3";
      else if (e.posicion === 2) bgRow = "#F1F5F9";
      else if (e.posicion === 3) bgRow = "#FFEDD5";

      ctx.fillStyle = bgRow;
      ctx.fillRect(startX, currentY, tableWidth, rowHeight);

      ctx.strokeStyle = "#E2E8F0";
      ctx.lineWidth = 1;
      ctx.strokeRect(startX, currentY, tableWidth, rowHeight);

      ctx.beginPath();
      [
        startX + 90,
        startX + 510,
        startX + 630,
        startX + 735,
        startX + 835,
        startX + 920,
      ].forEach((x) => {
        ctx.moveTo(x, currentY);
        ctx.lineTo(x, currentY + rowHeight);
      });
      ctx.stroke();

      let posText = `#${e.posicion || "-"}`;
      if (e.posicion === 1) posText = "🥇 1°";
      else if (e.posicion === 2) posText = "🥈 2°";
      else if (e.posicion === 3) posText = "🥉 3°";

      ctx.fillStyle = "#0F172A";
      ctx.textAlign = "center";
      ctx.font = "bold 13.5px 'Segoe UI', sans-serif";
      ctx.fillText(posText, startX + 45, currentY + 24);

      ctx.textAlign = "left";
      ctx.font = "bold 13.5px 'Segoe UI', sans-serif";
      ctx.fillText(e.titulo || "Evaluación", startX + 105, currentY + 24);

      ctx.textAlign = "center";
      ctx.font = "13px 'Segoe UI', sans-serif";
      ctx.fillStyle = "#475569";
      ctx.fillText(e.fecha || "-", startX + 570, currentY + 24);

      ctx.fillStyle = "#166534";
      ctx.font = "bold 13.5px 'Segoe UI', sans-serif";
      ctx.fillText(String(e.correctas || 0), startX + 680, currentY + 24);

      ctx.fillStyle = "#DC2626";
      ctx.font = "bold 13.5px 'Segoe UI', sans-serif";
      ctx.fillText(String(e.incorrectas || 0), startX + 785, currentY + 24);

      ctx.fillStyle = "#64748B";
      ctx.font = "13px 'Segoe UI', sans-serif";
      ctx.fillText(String(e.enBlanco || 0), startX + 880, currentY + 24);

      ctx.fillStyle = "#B72107";
      ctx.font = "bold 14px 'Segoe UI', sans-serif";
      ctx.fillText(`${e.puntajeTotal} pts`, startX + 965, currentY + 24);

      currentY += rowHeight;
      canvas.reportPageBreaks.push(currentY);
    });
    currentY += 14;
  }

  // SECCIÓN 2: HISTORIAL DE TAREAS
  ctx.fillStyle = "#B72107";
  ctx.fillRect(startX, currentY, 5, 20);

  ctx.fillStyle = "#0F172A";
  ctx.font = "bold 15px 'Segoe UI', sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(
    "CONTROL Y REPORTE DE TAREAS POR CURSO",
    startX + 14,
    currentY + 16,
  );

  currentY += 26;

  ctx.fillStyle = "#B72107";
  ctx.fillRect(startX, currentY, tableWidth, tableHeaderHeight);
  ctx.strokeStyle = "#991B1B";
  ctx.lineWidth = 1;
  ctx.strokeRect(startX, currentY, tableWidth, tableHeaderHeight);

  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 13.5px 'Segoe UI', sans-serif";

  ctx.textAlign = "center";
  ctx.fillText("N°", startX + 35, currentY + 23);
  ctx.textAlign = "left";
  ctx.fillText("CURSO / ASIGNATURA", startX + 85, currentY + 23);
  ctx.textAlign = "center";
  ctx.fillText("SEMANA / FECHA", startX + 510, currentY + 23);
  ctx.fillText("SALÓN / CICLO", startX + 735, currentY + 23);
  ctx.fillText("ESTADO / CALIFICACIÓN", startX + 895, currentY + 23);

  currentY += tableHeaderHeight;

  if (tareaHist.length === 0) {
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(startX, currentY, tableWidth, rowHeight);
    ctx.strokeStyle = "#CBD5E1";
    ctx.strokeRect(startX, currentY, tableWidth, rowHeight);

    ctx.fillStyle = "#64748B";
    ctx.font = "italic 13.5px 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(
      semanaLabel
        ? "Sin tareas registradas en la semana seleccionada."
        : "El estudiante no cuenta con registros de tareas.",
      startX + tableWidth / 2,
      currentY + 24,
    );
    currentY += rowHeight + 14;
    canvas.reportPageBreaks.push(currentY - 14);
  } else {
    tareaHist.forEach((t, idx) => {
      const isEven = idx % 2 === 0;
      const bgRow = isEven ? "#FFFFFF" : "#F8FAFC";

      ctx.fillStyle = bgRow;
      ctx.fillRect(startX, currentY, tableWidth, rowHeight);

      ctx.strokeStyle = "#E2E8F0";
      ctx.lineWidth = 1;
      ctx.strokeRect(startX, currentY, tableWidth, rowHeight);

      ctx.beginPath();
      [startX + 70, startX + 410, startX + 640, startX + 805].forEach((x) => {
        ctx.moveTo(x, currentY);
        ctx.lineTo(x, currentY + rowHeight);
      });
      ctx.stroke();

      ctx.fillStyle = "#64748B";
      ctx.textAlign = "center";
      ctx.font = "bold 13px 'Segoe UI', sans-serif";
      ctx.fillText(String(idx + 1), startX + 35, currentY + 24);

      ctx.textAlign = "left";
      ctx.fillStyle = "#0F172A";
      ctx.font = "bold 13.5px 'Segoe UI', sans-serif";
      ctx.fillText(t.curso || "N/A", startX + 85, currentY + 24);

      ctx.textAlign = "center";
      ctx.fillStyle = "#334155";
      ctx.font = "12.5px 'Segoe UI', sans-serif";
      ctx.fillText(formatFechaTarea(t.fecha), startX + 525, currentY + 24);

      ctx.fillStyle = "#475569";
      ctx.font = "12.5px 'Segoe UI', sans-serif";
      ctx.fillText(t.ciclo || est.ciclo || "N/A", startX + 725, currentY + 24);

      const stInfo = getTareaEstadoInfo(t);
      const badgeW = 150;
      const badgeH = 26;
      const badgeX = startX + 805 + (tableWidth - 805 - badgeW) / 2;
      const badgeY = currentY + (rowHeight - badgeH) / 2;

      drawCanvasRoundRect(
        ctx,
        badgeX,
        badgeY,
        badgeW,
        badgeH,
        13,
        stInfo.badgeBg,
        stInfo.badgeBorder,
        1,
      );
      ctx.textAlign = "center";
      ctx.fillStyle = stInfo.badgeText;
      ctx.font = "bold 12px 'Segoe UI', sans-serif";
      ctx.fillText(stInfo.label, badgeX + badgeW / 2, badgeY + 18);

      currentY += rowHeight;
      canvas.reportPageBreaks.push(currentY);
    });
    currentY += 14;
  }

  // Tarjeta de Agradecimiento
  drawCanvasRoundRect(
    ctx,
    startX,
    currentY + 6,
    tableWidth,
    68,
    8,
    "#FFFFFF",
    "#CBD5E1",
    1,
  );

  ctx.fillStyle = "#B72107";
  ctx.font = "bold 13px 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(
    "🎓 ¡AGRADECIMIENTO ESPECIAL POR SU CONFIANZA!",
    canvasWidth / 2,
    currentY + 28,
  );

  ctx.fillStyle = "#334155";
  ctx.font = "12px 'Segoe UI', sans-serif";
  ctx.fillText(
    `Expresamos nuestro sincero agradecimiento a la familia de ${est.nombre || "el estudiante"} por su compromiso y confianza en la Academia INGEMAT.`,
    canvasWidth / 2,
    currentY + 46,
  );
  ctx.fillText(
    "Reafirmamos nuestra dedicación hacia la excelencia formativa y el éxito en el ingreso universitario.",
    canvasWidth / 2,
    currentY + 62,
  );

  return canvas;
}

export function copiarReporteCompletoImagen(
  est,
  evalHist = [],
  tareaHist = [],
  semanaLabel = null,
) {
  const canvas = crearCanvasReporteCompleto(
    est,
    evalHist,
    tareaHist,
    semanaLabel,
  );
  const sufijo = semanaLabel
    ? `_${semanaLabel.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 25)}`
    : "";
  const filename = `ReporteCompleto_${(est.nombre || "Estudiante").replace(/[^a-zA-Z0-9]/g, "_")}_${est.codigo}${sufijo}.png`;
  copyCanvasToClipboard(
    canvas,
    filename,
    `¡Ficha Integral ${semanaLabel ? `(${semanaLabel})` : ""} de "${est.nombre}" copiada con éxito al portapapeles!`,
  );
}

const escapeReport = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
function reportTable(headers, rows) {
  return `<div class="table-scroll" tabindex="0" role="region" aria-label="Tabla del historial"><table><thead><tr>${headers.map((h) => `<th scope="col">${escapeReport(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
export function renderDashboardEstudiante(
  est,
  evalHist,
  tareaHist,
  semanaLabel = null,
) {
  const container = document.getElementById("alumno-reporte-dashboard"),
    toolbar = document.getElementById("reporte-alumno-toolbar");
  if (!container) return;
  if (toolbar) toolbar.style.display = "flex";
  const range = semanaLabel
    ? semanaLabel.replace(/^📅\s*/, "")
    : calcularRangoFechas(evalHist, tareaHist);
  const delivered = tareaHist.filter(
    (t) => getTareaEstadoInfo(t).entregado,
  ).length;
  const examRows = evalHist.map((e) => [
    `<strong>${escapeReport(e.titulo)}</strong>${e.area ? `<br><span class="v2-badge">Área ${escapeReport(e.area)}</span>` : ""}`,
    escapeReport(e.fecha),
    ...[e.correctas, e.incorrectas, e.enBlanco].map((n) =>
      e.tipo === "test" ? "—" : escapeReport(n),
    ),
    `<strong>${escapeReport(e.puntajeTotal)} pts</strong>`,
    `#${escapeReport(e.posicion)}${e.totalParticipantes ? ` / ${escapeReport(e.totalParticipantes)}` : ""}`,
  ]);
  const taskRows = tareaHist.map((t) => {
    const info = getTareaEstadoInfo(t);
    return [
      `<strong>${escapeReport(t.curso)}</strong>`,
      escapeReport(formatFechaTarea(t.fecha)),
      escapeReport(t.ciclo),
      `<span class="v2-badge ${info.entregado ? "good" : "warn"}">${escapeReport(info.label)}</span>`,
    ];
  });
  container.className = "student-report stack";
  container.innerHTML = `
    <div class="card student-profile"><div class="student-avatar"><i class="bi bi-person" aria-hidden="true"></i></div><div><h3>${escapeReport(est.nombre)}</h3><p>Código: ${escapeReport(est.codigo)} · Ciclo: ${escapeReport(est.ciclo)} · Turno: ${escapeReport(est.turno)}</p><p>${semanaLabel ? "Semana seleccionada" : "Periodo evaluado"}: ${escapeReport(range)}</p></div></div>
    <div class="student-metrics"><div class="stat-card"><strong>${evalHist.length}</strong><span>Evaluaciones rendidas</span></div><div class="stat-card"><strong>${delivered} / ${tareaHist.length}</strong><span>Tareas entregadas</span></div><div class="stat-card"><p>${escapeReport(range)}</p><span>Periodo de registros</span></div></div>
    <div class="card"><div class="card-heading"><h3>Evaluaciones y simulacros</h3></div>${examRows.length ? reportTable(["Evaluación", "Fecha", "Correctas", "Incorrectas", "En blanco", "Puntaje", "Puesto"], examRows) : '<p class="v2-empty">No hay evaluaciones en este periodo.</p>'}</div>
    <div class="card"><div class="card-heading"><h3>Tareas por curso</h3><button type="button" id="btn-card-copiar-tareas" class="button secondary"><i class="bi bi-clipboard" aria-hidden="true"></i> Copiar imagen</button></div>${taskRows.length ? reportTable(["Curso", "Semana / fecha", "Ciclo", "Calificación / estado"], taskRows) : '<p class="v2-empty">No hay tareas en este periodo.</p>'}</div>`;
  document.getElementById("btn-card-copiar-tareas").onclick = () =>
    copiarReporteTareasImagen(est, tareaHist, semanaLabel);
}
