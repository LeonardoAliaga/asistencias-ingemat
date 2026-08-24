// Public/js/admin/evaluaciones/eval-ranking.js

import { evalState } from "./eval-state.js";
import { copyCanvasToClipboard } from "./eval-utils.js";

// Función para limpiar/resetear la vista del ranking
export function limpiarSeleccionRanking() {
  const inputSearch = document.getElementById("eval-ranking-search-input");
  const resultsContainer = document.getElementById("eval-ranking-search-results");
  const evalSelect = document.getElementById("eval-select-ranking");
  const filtroAreaSelect = document.getElementById("eval-ranking-filtro-area");
  const noSelectionBox = document.getElementById("eval-ranking-no-selection");
  const contentBox = document.getElementById("eval-ranking-content");
  const actionsBox = document.getElementById("eval-ranking-actions");

  if (inputSearch) inputSearch.value = "";
  if (evalSelect) evalSelect.value = "";
  if (filtroAreaSelect) {
    filtroAreaSelect.value = "TODOS";
    filtroAreaSelect.style.display = "none";
  }
  if (resultsContainer) resultsContainer.style.display = "none";
  if (noSelectionBox) noSelectionBox.style.display = "block";
  if (contentBox) contentBox.style.display = "none";
  if (actionsBox) actionsBox.style.display = "none";
}

// Ranking y Podio Top 3 con Buscador Inteligente
export function setupRankingSearch() {
  const inputSearch = document.getElementById("eval-ranking-search-input");
  const resultsContainer = document.getElementById("eval-ranking-search-results");
  const evalSelect = document.getElementById("eval-select-ranking");
  const filtroAreaSelect = document.getElementById("eval-ranking-filtro-area");
  const noSelectionBox = document.getElementById("eval-ranking-no-selection");
  const contentBox = document.getElementById("eval-ranking-content");
  const actionsBox = document.getElementById("eval-ranking-actions");

  let currentRankingEvalId = null;

  async function cargarExamenSeleccionado(evalId, areaFiltro = "TODOS") {
    if (!evalId) {
      limpiarSeleccionRanking();
      return;
    }
    currentRankingEvalId = evalId;

    try {
      const url = areaFiltro && areaFiltro !== "TODOS" 
        ? `/api/evaluaciones/${evalId}/ranking?area=${areaFiltro}` 
        : `/api/evaluaciones/${evalId}/ranking`;

      const res = await fetch(url);
      const data = await res.json();
      if (data.exito) {
        if (noSelectionBox) noSelectionBox.style.display = "none";
        if (contentBox) contentBox.style.display = "block";
        if (actionsBox) actionsBox.style.display = "flex";

        if (filtroAreaSelect) {
          if (data.evaluacion.tipo === "simulacro_areas") {
            filtroAreaSelect.style.display = "inline-block";
          } else {
            filtroAreaSelect.style.display = "none";
          }
        }

        renderRankingView(data.evaluacion, data.ranking, areaFiltro);
      }
    } catch (err) {
      console.error("Error al cargar ranking:", err);
    }
  }

  if (filtroAreaSelect) {
    filtroAreaSelect.addEventListener("change", () => {
      if (currentRankingEvalId) {
        cargarExamenSeleccionado(currentRankingEvalId, filtroAreaSelect.value);
      }
    });
  }

  if (evalSelect) {
    evalSelect.addEventListener("change", () => {
      const evalId = evalSelect.value;
      if (evalId) {
        const found = evalState.globalEvaluaciones.find((e) => String(e.id) === String(evalId));
        if (found && inputSearch) {
          inputSearch.value = `${found.titulo} (${found.ciclo}) - ${found.fecha}`;
        }
        if (filtroAreaSelect) filtroAreaSelect.value = "TODOS";
        cargarExamenSeleccionado(evalId);
      } else {
        limpiarSeleccionRanking();
      }
    });
  }

  if (inputSearch && resultsContainer) {
    inputSearch.addEventListener("input", () => {
      const query = inputSearch.value.trim().toLowerCase();
      if (!query || evalState.globalEvaluaciones.length === 0) {
        resultsContainer.style.display = "none";
        return;
      }

      const matches = evalState.globalEvaluaciones.filter((e) => {
        const tit = (e.titulo || "").toLowerCase();
        const cic = (e.ciclo || "").toLowerCase();
        const fec = (e.fecha || "").toLowerCase();
        return tit.includes(query) || cic.includes(query) || fec.includes(query);
      });

      if (matches.length === 0) {
        resultsContainer.innerHTML =
          '<div style="padding:10px 12px; color:#64748b; font-size:0.85rem;"><i>No se encontraron exámenes con ese criterio</i></div>';
        resultsContainer.style.display = "block";
        return;
      }

      resultsContainer.innerHTML = matches
        .map((e) => {
          let badge = `<span style="background:#e0f2fe; color:#0369a1; padding:2px 7px; border-radius:4px; font-size:0.75rem; font-weight:700;">${e.numPreguntas} preg.</span>`;
          if (e.tipo === "test") badge = `<span style="background:#dcfce7; color:#166534; padding:2px 7px; border-radius:4px; font-size:0.75rem; font-weight:700;">Test Manual</span>`;
          else if (e.tipo === "simulacro_areas") badge = `<span style="background:#fef3c7; color:#b45309; padding:2px 7px; border-radius:4px; font-size:0.75rem; font-weight:700;">Áreas A-E</span>`;

          return `
            <div class="student-autocomplete-item" data-id="${e.id}" style="padding:8px 12px; cursor:pointer; border-bottom:1px solid #f1f5f9; display:flex; justify-content:space-between; align-items:center;">
              <div>
                <b style="color:#0f172a; font-size:0.88rem;">${e.titulo}</b>
                <span style="font-size:0.78rem; color:#64748b; display:block;">Ciclo: ${e.ciclo} | Fecha: ${e.fecha}</span>
              </div>
              ${badge}
            </div>
          `;
        })
        .join("");
      resultsContainer.style.display = "block";

      resultsContainer.querySelectorAll(".student-autocomplete-item").forEach((item) => {
        item.addEventListener("click", () => {
          const evalId = item.getAttribute("data-id");
          const found = evalState.globalEvaluaciones.find((e) => String(e.id) === String(evalId));
          if (found) {
            inputSearch.value = `${found.titulo} (${found.ciclo}) - ${found.fecha}`;
            if (evalSelect) evalSelect.value = evalId;
            if (filtroAreaSelect) filtroAreaSelect.value = "TODOS";
            resultsContainer.style.display = "none";
            cargarExamenSeleccionado(evalId);
          }
        });
      });
    });

    document.addEventListener("click", (e) => {
      if (!inputSearch.contains(e.target) && !resultsContainer.contains(e.target)) {
        resultsContainer.style.display = "none";
      }
    });
  }
}

export function renderRankingView(evalObj, ranking, areaFiltro = "TODOS") {
  const summaryHeader = document.getElementById("eval-ranking-summary-header");
  const podiumContainer = document.getElementById("eval-top-podium");
  const tbody = document.getElementById("tabla-ranking-body");
  const btnExcel = document.getElementById("btn-export-eval-excel");
  const btnCopyCanvas = document.getElementById("btn-copy-eval-canvas");

  if (btnExcel) {
    btnExcel.onclick = () => {
      const url = areaFiltro && areaFiltro !== "TODOS" 
        ? `/api/evaluaciones/${evalObj.id}/excel?area=${areaFiltro}` 
        : `/api/evaluaciones/${evalObj.id}/excel`;
      window.location.href = url;
    };
  }

  if (btnCopyCanvas) {
    btnCopyCanvas.onclick = () => {
      copiarRankingAlPortapapeles(evalObj, ranking, areaFiltro);
    };
  }

  if (summaryHeader) {
    let subFiltroTexto = "";
    if (areaFiltro && areaFiltro !== "TODOS") {
      subFiltroTexto = ` &nbsp;|&nbsp; <span style="background:#0284c7; color:#fff; padding:2px 8px; border-radius:4px; font-weight:700; font-size:0.8rem;">Área ${areaFiltro}</span>`;
    }

    summaryHeader.innerHTML = `
      <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px; padding:12px 16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
        <div>
          <b style="color:#0f172a; font-size:1.05rem;">📌 ${evalObj.titulo}</b> 
          <span style="background:#f1f5f9; padding:2px 8px; border-radius:4px; font-size:0.8rem; font-weight:700; color:#475569;">Ciclo: ${evalObj.ciclo}</span>
          ${subFiltroTexto}
        </div>
        <div style="font-size:0.88rem; color:#64748b;">
          <span>📅 Fecha: <b>${evalObj.fecha}</b></span> &nbsp;|&nbsp; 
          <span>📊 ${evalObj.tipo === 'test' ? 'Calificación directa' : `Preguntas: <b>${evalObj.numPreguntas}</b>`}</span> &nbsp;|&nbsp; 
          <span>👥 Participantes: <b style="color:#b72107;">${ranking.length}</b></span>
        </div>
      </div>
    `;
  }

  // Cuadritos de Mérito Top 3
  if (podiumContainer) {
    if (ranking.length === 0) {
      podiumContainer.innerHTML =
        '<p class="text-center" style="grid-column:1/-1;"><i>Aún no hay respuestas registradas para esta evaluación.</i></p>';
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

  // Tabla General Completa
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

        const areaBadge = r.area ? `<span style="background:#e0f2fe; color:#0369a1; padding:2px 6px; border-radius:4px; font-size:0.75rem; font-weight:700; margin-left:6px;">Área ${r.area}</span>` : "";

        html += `
          <tr ${bgStyle}>
            <td class="text-center">${badge}</td>
            <td class="text-left" style="font-weight:600; color:#0f172a;">${r.nombreEstudiante} ${areaBadge}</td>
            <td class="text-center" style="color:#166534; font-weight:700;">${evalObj.tipo === 'test' ? '-' : r.correctas}</td>
            <td class="text-center" style="color:#dc2626; font-weight:700;">${evalObj.tipo === 'test' ? '-' : r.incorrectas}</td>
            <td class="text-center" style="color:#64748b;">${evalObj.tipo === 'test' ? '-' : r.enBlanco}</td>
            <td class="text-center" style="font-weight:800; color:#b72107; font-size:1.05rem;">${r.puntajeTotal} pts</td>
          </tr>
        `;
      });
      tbody.innerHTML = html;
    }
  }
}

// Generador de Imagen de Tabla General de Ranking para Copiar al Portapapeles
export function copiarRankingAlPortapapeles(evalObj, ranking, areaFiltro = "TODOS") {
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

  // Fondo Hueso
  ctx.fillStyle = "#FDFBF7";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Barra de Acento Superior
  ctx.fillStyle = "#B72107";
  ctx.fillRect(0, 0, 1100, 12);

  // Encabezado Institucional
  ctx.fillStyle = "#0F172A";
  ctx.font = "bold 34px 'Segoe UI', Tahoma, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("ACADEMIA PREUNIVERSITARIA INGEMAT", 550, 62);

  let tituloRanking = "CUADRO GENERAL DE MÉRITO Y RANKING";
  if (areaFiltro && areaFiltro !== "TODOS") {
    tituloRanking = `CUADRO DE MÉRITO - ÁREA ${areaFiltro}`;
  }

  ctx.fillStyle = "#B72107";
  ctx.font = "bold 23px 'Segoe UI', Tahoma, sans-serif";
  ctx.fillText(tituloRanking, 550, 100);

  ctx.fillStyle = "#475569";
  ctx.font = "17px 'Segoe UI', Tahoma, sans-serif";
  ctx.fillText(
    `Examen: ${evalObj.titulo.toUpperCase()} | Ciclo: ${evalObj.ciclo} | Fecha: ${evalObj.fecha} | Total Evaluados: ${ranking.length}`,
    550,
    138
  );

  // Tabla - Fila de Encabezado
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

  // Render Filas
  let currentY = startY + headerRowHeight;

  ranking.forEach((r, idx) => {
    const isEven = idx % 2 === 0;
    let bgRow = isEven ? "#FFFFFF" : "#F8FAFC";

    if (r.posicion === 1) {
      bgRow = "#FEF9C3";
    } else if (r.posicion === 2) {
      bgRow = "#F1F5F9";
    } else if (r.posicion === 3) {
      bgRow = "#FFEDD5";
    }

    ctx.fillStyle = bgRow;
    ctx.fillRect(startX, currentY, tableWidth, rowHeight);

    ctx.strokeStyle = "#CBD5E1";
    ctx.lineWidth = 1;
    ctx.strokeRect(startX, currentY, tableWidth, rowHeight);

    // Divisores verticales
    ctx.beginPath();
    [140, 590, 710, 830, 950].forEach((x) => {
      ctx.moveTo(x, currentY);
      ctx.lineTo(x, currentY + rowHeight);
    });
    ctx.stroke();

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
    const areaText = r.area ? ` [Área ${r.area}]` : "";
    ctx.fillText(`${r.nombreEstudiante}${areaText}`, 160, currentY + 26);

    ctx.textAlign = "center";
    ctx.fillStyle = "#166534";
    ctx.font = "bold 15px 'Segoe UI', sans-serif";
    ctx.fillText(evalObj.tipo === "test" ? "-" : String(r.correctas), 650, currentY + 26);

    ctx.fillStyle = "#DC2626";
    ctx.font = "bold 15px 'Segoe UI', sans-serif";
    ctx.fillText(evalObj.tipo === "test" ? "-" : String(r.incorrectas), 770, currentY + 26);

    ctx.fillStyle = "#64748B";
    ctx.font = "15px 'Segoe UI', sans-serif";
    ctx.fillText(evalObj.tipo === "test" ? "-" : String(r.enBlanco), 890, currentY + 26);

    ctx.fillStyle = "#B72107";
    ctx.font = "bold 16px 'Segoe UI', sans-serif";
    ctx.fillText(`${r.puntajeTotal} pts`, 1010, currentY + 26);

    currentY += rowHeight;
  });

  // Pie de Página
  ctx.fillStyle = "#64748B";
  ctx.font = "15px 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(
    "¡Felicitaciones a nuestros estudiantes! • INGEMAT La Mejor Preparación Preuniversitaria",
    550,
    currentY + 40
  );

  const sufijo = areaFiltro && areaFiltro !== "TODOS" ? `_Area_${areaFiltro}` : "";
  const filename = `Ranking_${evalObj.titulo.replace(/[^a-zA-Z0-9]/g, "_")}${sufijo}.png`;
  copyCanvasToClipboard(
    canvas,
    filename,
    `¡Imagen del Ranking (${areaFiltro && areaFiltro !== "TODOS" ? 'Área ' + areaFiltro : 'General'}) de "${evalObj.titulo}" copiada con éxito al portapapeles!`
  );
}
