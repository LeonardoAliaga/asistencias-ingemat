// Public/js/admin/common/canvas-utils.js

/**
 * Dibuja un rectángulo con esquinas redondeadas en un contexto Canvas 2D.
 */
export function drawCanvasRoundRect(ctx, x, y, width, height, radius = 5, fillStyle = null, strokeStyle = null, lineWidth = 1) {
  ctx.save();
  ctx.beginPath();
  let r = radius;
  if (typeof radius === "number") {
    r = { tl: radius, tr: radius, br: radius, bl: radius };
  } else {
    r = { tl: 0, tr: 0, br: 0, bl: 0, ...radius };
  }
  ctx.moveTo(x + r.tl, y);
  ctx.lineTo(x + width - r.tr, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r.tr);
  ctx.lineTo(x + width, y + height - r.br);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r.br, y + height);
  ctx.lineTo(x + r.bl, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r.bl);
  ctx.lineTo(x, y + r.tl);
  ctx.quadraticCurveTo(x, y, x + r.tl, y);
  ctx.closePath();

  if (fillStyle) {
    ctx.fillStyle = fillStyle;
    ctx.fill();
  }
  if (strokeStyle) {
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Helper compatible hacia atrás con llamadas estilo legacy roundRect(ctx, x, y, w, h, radius, fill, stroke)
 */
export function roundRect(ctx, x, y, width, height, radius = 5, fill = false, stroke = true) {
  drawCanvasRoundRect(
    ctx,
    x,
    y,
    width,
    height,
    radius,
    fill ? ctx.fillStyle : null,
    stroke ? ctx.strokeStyle : null,
    ctx.lineWidth || 1
  );
}

/**
 * Copia una imagen desde un elemento Canvas al portapapeles usando la API ClipboardItem.
 * Si el portapapeles no está disponible o es bloqueado, se descarga el archivo PNG automáticamente como fallback.
 */
export function copyCanvasToClipboard(canvas, filename = "imagen.png", successMsg = "¡Imagen copiada con éxito al portapapeles!") {
  if (!canvas) return;

  canvas.toBlob(async (blob) => {
    if (!blob) return;
    try {
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        alert(`✅ ${successMsg}\n\nPuedes pegarla directamente (Ctrl + V) en WhatsApp, chats o documentos.`);
      } else {
        const link = document.createElement("a");
        link.download = filename;
        link.href = URL.createObjectURL(blob);
        link.click();
        alert(`✅ Imagen guardada y descargada: ${filename}`);
      }
    } catch (err) {
      console.warn("Clipboard API no disponible o permiso denegado, descargando archivo:", err);
      const link = document.createElement("a");
      link.download = filename;
      link.href = canvas.toDataURL("image/png");
      link.click();
      alert(`✅ Imagen descargada correctamente: ${filename}`);
    }
  }, "image/png");
}
