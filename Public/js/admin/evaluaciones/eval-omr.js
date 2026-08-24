// Public/js/admin/evaluaciones/eval-omr.js

import { evalState } from "./eval-state.js";
import { roundRect } from "./eval-utils.js";

let omrVideoStream = null;
let activeScanEval = null;
let activeScanCodigo = null;
let omrAutoScanTimer = null;
let omrScanCooldown = false;

// =========================================================
// MÓDULO OMR: Generador de Cartillas de Respuesta y Escáner por Cámara Web
// =========================================================

export function setupOMRModule() {
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
      const titulo = document.getElementById("eval-titulo-input")?.value?.trim() || "EXAMEN DE SIMULACRO";
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
      if (evalState.currentCartillaData) descargarCartillaPNG(evalState.currentCartillaData);
    });
  }

  if (btnDownloadPdf) {
    btnDownloadPdf.addEventListener("click", () => {
      if (evalState.currentCartillaData) descargarCartillaPDFA4(evalState.currentCartillaData);
    });
  }

  // 3. Abrir Escáner de Cámara Web
  if (btnCameraScan && dialogScanner) {
    btnCameraScan.addEventListener("click", () => {
      const evalId = document.getElementById("eval-select-respuesta")?.value;
      const evalObj = evalState.globalEvaluaciones.find((e) => e.id === evalId);
      const codigoEst = (document.getElementById("eval-codigo-estudiante")?.value || "").trim().toUpperCase();
      const statusEl = document.getElementById("eval-respuestas-estudiante-status");

      if (!evalObj) {
        if (statusEl) statusEl.innerHTML = '<span style="color:#dc2626;">⚠️ Selecciona un examen registrado primero.</span>';
        return;
      }
      if (!codigoEst) {
        if (statusEl)
          statusEl.innerHTML =
            '<span style="color:#dc2626;">⚠️ Selecciona al estudiante primero antes de escanear su cartilla.</span>';
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

  window._abrirPrevisualizacionCartilla = abrirPrevisualizacionCartilla;
}

// Abrir Modal con Previsualización de Cartilla en Canvas
export function abrirPrevisualizacionCartilla(evalData) {
  evalState.currentCartillaData = evalData;
  const dialog = document.getElementById("modal-preview-cartilla");
  const canvas = document.getElementById("cartilla-preview-canvas");
  const titleEl = document.getElementById("modal-preview-cartilla-title");
  const infoBanner = document.getElementById("cartilla-info-banner");

  if (!dialog || !canvas) return;

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

  const formatoLabel = isCompact ? "Hoja de Respuesta Oficial INGEMAT (Vertical)" : "Ficha Óptica Admisión (Horizontal)";

  if (titleEl) titleEl.innerHTML = `<i class="bi bi-file-earmark-pdf-fill"></i> Hoja de Respuesta OMR: ${evalData.titulo}`;
  if (infoBanner) {
    infoBanner.innerHTML = `📌 <b>${evalData.titulo}</b> (${evalData.ciclo || ""}) | <b>${numP} Preguntas</b> | Formato: <b>${formatoLabel}</b>`;
  }

  dibujarCartillaOMREnCanvas(canvas, evalData);
  dialog.showModal();
}

// Router Principal de Dibujado de Cartilla
export function dibujarCartillaOMREnCanvas(canvas, evalData) {
  if (!canvas) return;
  const totalQ = evalData.numPreguntas || 20;

  if (totalQ <= 40) {
    dibujarCartillaVerticalIngemat(canvas, evalData);
  } else {
    dibujarCartillaHorizontalAdmision(canvas, evalData);
  }
}

// 1. HOJA DE RESPUESTA VERTICAL OFICIAL INGEMAT (<= 40 PREGUNTAS)
function dibujarCartillaVerticalIngemat(canvas, evalData) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width; // 650
  const H = canvas.height; // 920
  const totalQ = evalData.numPreguntas || 20;

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, W, H);

  // Marcadores de Calibración
  const markerSize = 32;
  const marginOffset = 14;
  const drawTargetMarker = (x, y) => {
    ctx.fillStyle = "#000000";
    ctx.fillRect(x, y, markerSize, markerSize);
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(x + (markerSize - 10) / 2, y + (markerSize - 10) / 2, 10, 10);
  };

  drawTargetMarker(marginOffset, marginOffset);
  drawTargetMarker(W - marginOffset - markerSize, marginOffset);
  drawTargetMarker(marginOffset, H - marginOffset - markerSize);
  drawTargetMarker(W - marginOffset - markerSize, H - marginOffset - markerSize);

  // Encabezado
  const startX = 50;
  const contentW = W - 100;

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

  ctx.fillStyle = "#0A2240";
  ctx.font = "bold 24px 'Segoe UI', Arial, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("HOJA DE RESPUESTA", startX + contentW, 48);

  ctx.fillStyle = "#B72107";
  ctx.font = "bold 17px 'Segoe UI', Arial, sans-serif";
  ctx.fillText((evalData.titulo || "HABILIDADES").toUpperCase(), startX + contentW, 70);

  // Recuadro de datos manuscritos
  const boxY = 86;
  const boxH = 50;
  const cicloW = 140;

  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(startX, boxY, contentW, boxH);

  ctx.beginPath();
  ctx.moveTo(startX + cicloW, boxY);
  ctx.lineTo(startX + cicloW, boxY + boxH);
  ctx.stroke();

  ctx.fillStyle = "#0F172A";
  ctx.font = "bold 10px Arial";
  ctx.textAlign = "left";
  ctx.fillText("CICLO:", startX + 10, boxY + 18);
  ctx.fillText("APELLIDOS Y NOMBRES:", startX + cicloW + 12, boxY + 18);

  // Instrucciones
  const instY = 152;

  ctx.fillStyle = "#334155";
  ctx.font = "bold 9.5px Arial";
  ctx.textAlign = "left";
  ctx.fillText("MARCAS CORRECTAS", startX, instY);

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

  const pencilW = 225;
  const pencilX = startX + contentW - pencilW;
  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 1.2;
  roundRect(ctx, pencilX, instY - 10, pencilW, 26, 4, false, true);

  ctx.fillStyle = "#0F172A";
  ctx.font = "bold 10px Arial";
  ctx.textAlign = "center";
  ctx.fillText("✏️ USE SOLO LÁPIZ 2B O LAPICERO", pencilX + pencilW / 2, instY + 7);

  // Contenedor principal de respuestas
  const gridBoxY = 188;
  const gridBoxH = 690;

  ctx.strokeStyle = "#0F172A";
  ctx.lineWidth = 2;
  roundRect(ctx, startX, gridBoxY, contentW, gridBoxH, 12, false, true);

  const maxRowsPerCol = 20;
  const numCols = totalQ > 20 ? 2 : 1;
  const colWidth = numCols === 2 ? (contentW - 20) / 2 : contentW;
  const options = ["A", "B", "C", "D", "E"];

  if (numCols === 2) {
    const dividerX = startX + contentW / 2;
    ctx.strokeStyle = "#64748B";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(dividerX, gridBoxY + 10);
    ctx.lineTo(dividerX, gridBoxY + gridBoxH - 10);
    ctx.stroke();
  }

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

  const rowHeight = numCols === 1 && totalQ <= 15 ? 42 : totalQ > 30 ? 29.5 : 32.5;
  const bubbleRadius = numCols === 1 && totalQ <= 15 ? 14 : totalQ > 30 ? 11.5 : 12.5;
  const numFont = totalQ > 30 ? "bold 13px Arial" : "bold 14px Arial";
  const startTopPadding = 42;

  for (let q = 1; q <= totalQ; q++) {
    const colIndex = Math.floor((q - 1) / maxRowsPerCol);
    const rowIndex = (q - 1) % maxRowsPerCol;

    const colStartX = startX + (colIndex === 1 ? colWidth + 20 : 10);
    const baseY = gridBoxY + startTopPadding + rowIndex * rowHeight;

    if (rowIndex % 2 === 0) {
      ctx.fillStyle = "#F8FAFC";
      ctx.fillRect(colStartX + 2, baseY - Math.round(rowHeight / 2) + 3, colWidth - 14, rowHeight - 2);
    }

    ctx.fillStyle = "#0A2240";
    ctx.font = numFont;
    ctx.textAlign = "right";
    ctx.fillText(`${q}.`, colStartX + (numCols === 1 ? 40 : 28), baseY + 4.5);

    const bubbleAreaStart = colStartX + (numCols === 1 ? 65 : 44);
    const bubbleAreaWidth = colWidth - (numCols === 1 ? 90 : 54);
    const bubbleStep = bubbleAreaWidth / 5;

    options.forEach((opt, optIdx) => {
      const bX = bubbleAreaStart + optIdx * bubbleStep + bubbleStep / 2;
      const bY = baseY;

      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(bX, bY, bubbleRadius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = "#94A3B8";
      ctx.font = "bold 9px Arial";
      ctx.textAlign = "center";
      ctx.fillText(opt, bX, bY + 3);
    });
  }
}

// 2. FICHA ÓPTICA HORIZONTAL DE ADMISIÓN (> 40 PREGUNTAS)
function dibujarCartillaHorizontalAdmision(canvas, evalData) {
  const ctx = canvas.getContext("2d");
  const totalQ = evalData.numPreguntas || 50;

  const maxPerCol = 25;
  const totalCols = Math.max(1, Math.ceil(totalQ / maxPerCol));
  const colsForWidth = Math.max(3, totalCols);
  const W = 360 + colsForWidth * 175 + 40;
  const H = 760;
  canvas.width = W;
  canvas.height = H;

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, W, H);

  const primaryBlue = "#0284C7";
  const softBg = "#F0F9FF";

  const markerSize = 32;
  const marginOffset = 14;
  const drawTargetMarker = (x, y) => {
    ctx.fillStyle = "#000000";
    ctx.fillRect(x, y, markerSize, markerSize);
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(x + (markerSize - 10) / 2, y + (markerSize - 10) / 2, 10, 10);
  };

  drawTargetMarker(marginOffset, marginOffset);
  drawTargetMarker(W - marginOffset - markerSize, marginOffset);
  drawTargetMarker(marginOffset, H - marginOffset - markerSize);
  drawTargetMarker(W - marginOffset - markerSize, H - marginOffset - markerSize);

  // Panel Izquierdo
  const leftSectionW = 340;
  const leftW = 280;
  const leftX = Math.round((leftSectionW - leftW) / 2) + 10;

  const totalBlockH = 580;
  let currentY = Math.round((H - totalBlockH) / 2) + 10;

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

  ctx.strokeStyle = primaryBlue;
  ctx.lineWidth = 1.5;
  roundRect(ctx, leftX, currentY, leftW, 26, 6, false, true);

  ctx.fillStyle = primaryBlue;
  ctx.font = "bold 12px Arial";
  ctx.textAlign = "center";
  ctx.fillText("SECCIÓN DE IDENTIFICACIÓN", leftX + leftW / 2, currentY + 18);
  currentY += 34;

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

  // Línea Central Divisoria
  const divX = leftSectionW + 15;
  ctx.strokeStyle = "#CBD5E1";
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(divX, 30);
  ctx.lineTo(divX, H - 30);
  ctx.stroke();
  ctx.setLineDash([]);

  // Panel Derecho
  const rightX = divX + 20;
  const rightW = W - rightX - 25;

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

  ctx.fillStyle = "#475569";
  ctx.font = "bold 8.5px Arial";
  ctx.fillText("CORRECTO: [ ● ]   INCORRECTO: [ ✕ ] [ ∅ ]", instX + instW / 2, instY + 68);

  const gridY = 120;
  const gridColW = 165;
  const options = ["A", "B", "C", "D", "E"];

  const totalGridColsWidth = totalCols * gridColW + (totalCols - 1) * 10;
  const gridStartX = rightX + Math.max(0, Math.round((rightW - totalGridColsWidth) / 2));

  for (let c = 0; c < totalCols; c++) {
    const colStartX = gridStartX + c * (gridColW + 10);
    const startQ = c * maxPerCol + 1;

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
          ctx.lineWidth = 1.7;
          ctx.beginPath();
          ctx.arc(bX, bY, 8, 0, Math.PI * 2);
          ctx.stroke();

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

// Descargar Imagen PNG Individual
export function descargarCartillaPNG(evalData) {
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
export function descargarCartillaPDFA4(evalData) {
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
        ${
          isCompact
            ? `<div><img src="${imgData}" /></div><div><img src="${imgData}" /></div>`
            : `<img src="${imgData}" />`
        }
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
// ESCÁNER OMR CON CÁMARA WEB
// ---------------------------------------------------------

export async function iniciarCamaraOMR(evalObj, codigoEst) {
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

export function detenerCamaraOMR() {
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

  const cv = window.cv;
  if (cv && cv.Mat) {
    let src = null;
    let gray = null;
    let thresh = null;
    try {
      src = cv.imread(processCanvas);
      gray = new cv.Mat();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);

      const nitidez = medirNitidezOMR(cv, gray);
      if (nitidez !== null && nitidez < 35) {
        if (statusEl) {
          statusEl.innerHTML = `<span style="color:#fbbf24;">📷 Imagen borrosa, sostén el celular firme...</span>`;
        }
        return;
      }

      thresh = new cv.Mat();
      cv.threshold(gray, thresh, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);
      const marcadores = detectarMarcadoresOMR(cv, thresh, src.cols, src.rows);

      if (marcadores) {
        if (statusEl) {
          statusEl.innerHTML = `<b style="color:#38bdf8;">⚡ ¡Cartilla detectada! Procesando respuestas...</b>`;
        }
        omrScanCooldown = true;
        setTimeout(() => {
          procesarCapturaOMR();
        }, 200);
      } else if (statusEl) {
        statusEl.innerHTML = `<span>Enfoca los 4 recuadros de las esquinas dentro del cuadro...</span>`;
      }
    } catch (e) {
    } finally {
      if (src) src.delete();
      if (gray) gray.delete();
      if (thresh) thresh.delete();
    }
    return;
  }

  // Respaldo sin OpenCV
  const imgData = ctx.getImageData(0, 0, W, H);
  const data = imgData.data;

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

  if (darkRatio > 0.04 && darkRatio < 0.4) {
    if (statusEl) {
      statusEl.innerHTML = `<b style="color:#38bdf8;">⚡ ¡Cartilla detectada! Procesando respuestas...</b>`;
    }
    omrScanCooldown = true;
    setTimeout(() => {
      procesarCapturaOMR();
    }, 200);
  }
}

function medirNitidezOMR(cv, gray) {
  let lap = null;
  let mean = null;
  let stddev = null;
  try {
    lap = new cv.Mat();
    cv.Laplacian(gray, lap, cv.CV_64F);
    mean = new cv.Mat();
    stddev = new cv.Mat();
    cv.meanStdDev(lap, mean, stddev);
    const sd = stddev.data64F[0];
    return sd * sd;
  } catch (e) {
    return null;
  } finally {
    if (lap) lap.delete();
    if (mean) mean.delete();
    if (stddev) stddev.delete();
  }
}

function detectarMarcadoresOMR(cv, threshBin, cols, rows) {
  let contours = null;
  let hierarchy = null;
  try {
    contours = new cv.MatVector();
    hierarchy = new cv.Mat();
    cv.findContours(threshBin, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_SIMPLE);

    const area = cols * rows;
    const minArea = area * 0.0006;
    const maxArea = area * 0.02;
    const candidates = [];

    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      const cArea = cv.contourArea(cnt);
      if (cArea > minArea && cArea < maxArea) {
        const rect = cv.boundingRect(cnt);
        const aspect = rect.width / rect.height;
        if (aspect > 0.65 && aspect < 1.35) {
          const h = hierarchy.intPtr(0, i);
          const hasChild = h && h[2] !== -1;
          if (hasChild) {
            candidates.push({
              cx: rect.x + rect.width / 2,
              cy: rect.y + rect.height / 2,
            });
          }
        }
      }
      cnt.delete();
    }

    if (candidates.length < 4) return null;

    const expectedCorners = [
      { x: 0, y: 0 },
      { x: cols, y: 0 },
      { x: cols, y: rows },
      { x: 0, y: rows },
    ];

    const usedIdx = new Set();
    const picked = [];
    const maxDist = Math.max(cols, rows) * 0.35;

    for (const corner of expectedCorners) {
      let bestIdx = -1;
      let bestDist = Infinity;
      candidates.forEach((c, idx) => {
        if (usedIdx.has(idx)) return;
        const d = Math.hypot(c.cx - corner.x, c.cy - corner.y);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = idx;
        }
      });
      if (bestIdx === -1 || bestDist > maxDist) return null;
      usedIdx.add(bestIdx);
      picked.push(candidates[bestIdx]);
    }

    return picked.map((p) => [p.cx, p.cy]);
  } catch (err) {
    console.error("Error detectando marcadores OMR:", err);
    return null;
  } finally {
    if (contours) contours.delete();
    if (hierarchy) hierarchy.delete();
  }
}

function analizarBurbujasConOpenCV(processCanvas, totalQ) {
  const cv = window.cv;
  if (!cv || !cv.Mat) {
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
  let warpedGray = null;

  try {
    src = cv.imread(processCanvas);
    gray = new cv.Mat();
    blurred = new cv.Mat();
    thresh = new cv.Mat();

    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
    cv.threshold(blurred, thresh, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);

    let srcCorners = detectarMarcadoresOMR(cv, thresh, src.cols, src.rows);

    if (!srcCorners) {
      let contours = new cv.MatVector();
      let hierarchy = new cv.Mat();
      cv.findContours(thresh, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

      let docContour = null;
      let maxArea = 0;
      const minDocArea = src.cols * src.rows * 0.2;

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

      if (docContour && docContour.rows === 4) {
        const pts = [];
        for (let i = 0; i < 4; i++) {
          pts.push({ x: docContour.data32S[i * 2], y: docContour.data32S[i * 2 + 1] });
        }
        pts.sort((a, b) => a.y - b.y);
        const topPts = pts.slice(0, 2).sort((a, b) => a.x - b.x);
        const bottomPts = pts.slice(2, 4).sort((a, b) => a.x - b.x);
        srcCorners = [
          [topPts[0].x, topPts[0].y],
          [topPts[1].x, topPts[1].y],
          [bottomPts[1].x, bottomPts[1].y],
          [bottomPts[0].x, bottomPts[0].y],
        ];
        docContour.delete();
      }
    }

    let workingThresh = thresh;

    if (srcCorners) {
      const srcCoords = [
        srcCorners[0][0],
        srcCorners[0][1],
        srcCorners[1][0],
        srcCorners[1][1],
        srcCorners[2][0],
        srcCorners[2][1],
        srcCorners[3][0],
        srcCorners[3][1],
      ];

      const dstCoords = [0, 0, targetW, 0, targetW, targetH, 0, targetH];

      let srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, srcCoords);
      let dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, dstCoords);
      M = cv.getPerspectiveTransform(srcTri, dstTri);

      let dsize = new cv.Size(targetW, targetH);

      warpedGray = new cv.Mat();
      cv.warpPerspective(blurred, warpedGray, M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(255));

      warped = new cv.Mat();
      const blockSize = Math.max(15, Math.round(targetW / 22) | 1);
      cv.adaptiveThreshold(
        warpedGray,
        warped,
        255,
        cv.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv.THRESH_BINARY_INV,
        blockSize,
        12
      );

      workingThresh = warped;
      srcTri.delete();
      dstTri.delete();
    }

    const curW = workingThresh.cols;
    const curH = workingThresh.rows;

    if (isVertical) {
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
        const bubbleAreaStart = colStartX + colWidth * 0.2;
        const bubbleAreaWidth = colWidth * 0.76;
        const bubbleStep = bubbleAreaWidth / 5;
        const radius = Math.max(5, Math.min(9, Math.round(rowHeight * 0.24)));

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
        const avgScore =
          (scores[0].density + scores[1].density + scores[2].density + scores[3].density + scores[4].density) / 5;

        if (
          maxScore.density > 0.32 &&
          (maxScore.density - secondScore.density > 0.12 || maxScore.density > avgScore * 1.5)
        ) {
          respuestas[q] = maxScore.opt;
        }
      }
    } else {
      const maxPerCol = 25;
      const totalCols = Math.ceil(totalQ / maxPerCol);
      const gridTop = curH * 0.18;
      const gridBottom = curH * 0.94;
      const gridLeft = curW * 0.38;
      const gridRight = curW * 0.95;
      const gridWidth = gridRight - gridLeft;
      const colWidth = gridWidth / totalCols;
      const rowHeight = (gridBottom - gridTop) / maxPerCol;
      const radius = Math.max(4, Math.min(6, Math.round(rowHeight * 0.2)));

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
        const avgScore =
          (scores[0].density + scores[1].density + scores[2].density + scores[3].density + scores[4].density) / 5;

        if (
          maxScore.density > 0.3 &&
          (maxScore.density - secondScore.density > 0.1 || maxScore.density > avgScore * 1.45)
        ) {
          respuestas[q] = maxScore.opt;
        }
      }
    }
  } catch (err) {
    console.error("Error procesando OMR con OpenCV:", err);
  } finally {
    if (src) src.delete();
    if (gray) gray.delete();
    if (blurred) blurred.delete();
    if (thresh) thresh.delete();
    if (warped) warped.delete();
    if (warpedGray) warpedGray.delete();
    if (M) M.delete();
  }

  return respuestas;
}

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
          darkSum += 255 - b;
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
    const colWidth = numCols === 2 ? (gridRight - gridLeft) / 2 : gridRight - gridLeft;
    const rowHeight = (gridBottom - gridTop) / (totalQ <= 15 ? 15 : maxRows);

    for (let q = 1; q <= totalQ; q++) {
      const colIdx = Math.floor((q - 1) / maxRows);
      const rowIdx = (q - 1) % maxRows;
      const colStartX = gridLeft + colIdx * colWidth;
      const rowCenterY = gridTop + (rowIdx + 0.5) * rowHeight;
      const bubbleAreaStart = colStartX + colWidth * 0.2;
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
      const avgScore =
        (scores[0].darkness + scores[1].darkness + scores[2].darkness + scores[3].darkness + scores[4].darkness) / 5;

      if (
        maxScore.darkness > 50 &&
        (maxScore.darkness - secondScore.darkness > 10 || maxScore.darkness > avgScore * 1.25)
      ) {
        respuestas[q] = maxScore.opt;
      }
    }
  }

  return respuestas;
}

export function procesarCapturaOMR(fromFileUpload = false) {
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

  const totalQ = activeScanEval.numPreguntas || 20;
  const respuestasLeidas = analizarBurbujasConOpenCV(processCanvas, totalQ);

  evalState.modalState.mode = "respuesta_estudiante";
  evalState.modalState.numPreguntas = totalQ;
  evalState.modalState.respuestas = { ...respuestasLeidas };

  const detectedCount = Object.keys(respuestasLeidas).length;

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
        const curOpt = evalState.modalState.respuestas[i] || "";
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
          if (evalState.modalState.respuestas[q] === opt) {
            delete evalState.modalState.respuestas[q];
          } else {
            evalState.modalState.respuestas[q] = opt;
          }
          pill.parentElement.querySelectorAll(".opt-pill").forEach((p) => p.classList.remove("selected"));
          if (evalState.modalState.respuestas[q]) {
            pill.classList.add("selected");
          }
        });
      });
    }
    dialogClave.showModal();
  }
}
