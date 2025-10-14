// src/services/excel.service.js

const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");
const {
  estadoAsistencia,
  normalizarTexto,
  aplicarEstiloCelda,
} = require("../utils/helpers");

const usuariosPath = path.join(__dirname, "../../data/usuarios.json");
const registrosPath = path.join(__dirname, "../../registros");
// --- Definición de Estilos (Mover fuera de la función principal es más limpio)
const borderStyle = {
  top: { style: "thin" },
  bottom: { style: "thin" },
  left: { style: "thin" },
  right: { style: "thin" },
};

const estiloFalta = {
  fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } },
  font: { bold: true, color: { argb: "FF000000" } },
  alignment: { horizontal: "center", vertical: "middle" },
};

const estiloDatos = {
  font: { bold: false, color: { argb: "FF000000" } },
  alignment: { horizontal: "left", vertical: "middle" },
  border: borderStyle,
};

const estiloEncabezado = {
  font: { bold: true, color: { argb: "FFFFFFFF" } },
  alignment: { horizontal: "center", vertical: "middle" },
  border: borderStyle,
};
// --- FIN DE DEFINICIÓN DE ESTILOS

// 🏆 FUNCIÓN PRINCIPAL DE REGISTRO
async function guardarRegistro(usuario, fechaStr, horaStr) {
  try {
    console.log(`\n📘 Registrando: ${usuario.nombre} (${usuario.rol})`);
    console.log(`🕒 Hora: ${horaStr}`);

    const fecha = new Date();
    const diaSemana = fecha
      .toLocaleDateString("es-PE", { weekday: "long" })
      .toUpperCase();
    const diaNumero = fecha.getDate().toString().padStart(2, "0");
    const nombreColumna = `${diaSemana} ${diaNumero}`;

    const nombreArchivo = `${fechaStr.replace(/\//g, "-")}.xlsx`;
    const rutaArchivo = path.join(registrosPath, nombreArchivo);

    const workbook = new ExcelJS.Workbook();
    let hoja;

    const usuarios = JSON.parse(fs.readFileSync(usuariosPath, "utf8"));
    const estudiantes = usuarios
      .filter((u) => u.rol === "estudiante")
      .sort((a, b) =>
        a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" })
      );
    const docentes = usuarios
      .filter((u) => u.rol === "docente")
      .sort((a, b) =>
        a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" })
      );

    // --- Crear o leer archivo ---
    if (fs.existsSync(rutaArchivo)) {
      await workbook.xlsx.readFile(rutaArchivo);
      hoja = workbook.getWorksheet("Asistencia");
      console.log("📗 Archivo existente cargado.");
    } else {
      hoja = workbook.addWorksheet("Asistencia");

      let fila = 1;
      const ciclos = ["semestral", "anual", "sabatino"]; // Mantenemos "domingos" fuera si no hay datos

      for (const ciclo of ciclos) {
        const grupo = estudiantes.filter((e) => e.ciclo === ciclo);
        if (grupo.length === 0) continue;

        hoja.getCell(
          `A${fila}`
        ).value = `REGISTRO DE ASISTENCIA - ${ciclo.toUpperCase()}`;
        hoja.mergeCells(`A${fila}:D${fila}`);
        hoja.getCell(`A${fila}`).font = { bold: true, size: 14 };
        hoja.getCell(`A${fila}`).alignment = { horizontal: "center" };
        fila++;

        hoja.getRow(fila).values = ["N°", "ALUMNO", "TURNO", nombreColumna];
        hoja.getRow(fila).eachCell(() => {
          aplicarEstiloCelda(hoja.getRow(fila).getCell(1), {
            ...estiloEncabezado,
            fill: {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FF404040" },
            },
          });
          aplicarEstiloCelda(hoja.getRow(fila).getCell(2), {
            ...estiloEncabezado,
            fill: {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FF404040" },
            },
          });
          aplicarEstiloCelda(hoja.getRow(fila).getCell(3), {
            ...estiloEncabezado,
            fill: {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FF404040" },
            },
          });
          aplicarEstiloCelda(hoja.getRow(fila).getCell(4), {
            ...estiloEncabezado,
            fill: {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FF404040" },
            },
          });
        });
        fila++;

        grupo.forEach((est, i) => {
          const row = hoja.addRow([
            i + 1,
            est.nombre,
            est.turno ? est.turno.toUpperCase() : "",
            "FALTA",
          ]);

          aplicarEstiloCelda(row.getCell(1), {
            ...estiloDatos,
            alignment: { horizontal: "center", vertical: "middle" },
          });
          aplicarEstiloCelda(row.getCell(2), estiloDatos);
          aplicarEstiloCelda(row.getCell(3), estiloDatos);

          aplicarEstiloCelda(row.getCell(4), estiloFalta);
          fila++;
        });

        fila += 2;
      }

      // Sección Docentes
      hoja.getCell(`A${fila}`).value = "REGISTRO DE ASISTENCIA - DOCENTES";
      hoja.mergeCells(`A${fila}:D${fila}`);
      hoja.getCell(`A${fila}`).font = { bold: true, size: 14 };
      hoja.getCell(`A${fila}`).alignment = { horizontal: "center" };
      fila++;

      hoja.getRow(fila).values = ["N°", "DOCENTE", "TURNO", nombreColumna];
      hoja.getRow(fila).eachCell(() => {
        aplicarEstiloCelda(hoja.getRow(fila).getCell(1), {
          ...estiloEncabezado,
          fill: {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FF1F4E78" },
          },
        });
        aplicarEstiloCelda(hoja.getRow(fila).getCell(2), {
          ...estiloEncabezado,
          fill: {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FF1F4E78" },
          },
        });
        aplicarEstiloCelda(hoja.getRow(fila).getCell(3), {
          ...estiloEncabezado,
          fill: {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FF1F4E78" },
          },
        });
        aplicarEstiloCelda(hoja.getRow(fila).getCell(4), {
          ...estiloEncabezado,
          fill: {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FF1F4E78" },
          },
        });
      });
      fila++;

      docentes.forEach((doc, i) => {
        const row = hoja.addRow([i + 1, doc.nombre, "", "FALTA"]);

        aplicarEstiloCelda(row.getCell(1), {
          ...estiloDatos,
          alignment: { horizontal: "center", vertical: "middle" },
        });
        aplicarEstiloCelda(row.getCell(2), estiloDatos);
        aplicarEstiloCelda(row.getCell(3), estiloDatos);

        aplicarEstiloCelda(row.getCell(4), estiloFalta);
      });

      hoja.columns.forEach((col) => {
        let maxLength = 0;
        col.eachCell({ includeEmpty: true }, (cell) => {
          if (cell.isMerged) return;
          const value = cell.value ? cell.value.toString() : "";
          if (value.length > maxLength) maxLength = value.length;
        });
        col.width = Math.min(Math.max(maxLength * 1.3, 10), 40);
      });

      await workbook.xlsx.writeFile(rutaArchivo);
      console.log("💾 Archivo creado con éxito.");
    }

    // --- REGISTRAR HORA ---
    let filaEncontrada = null;
    let numFila = -1;
    hoja.eachRow((row) => {
      const celdaNombre = row.getCell(2);
      if (!celdaNombre || !celdaNombre.value) return;

      let nombreCelda = celdaNombre.value;
      if (typeof nombreCelda === "object") {
        if (nombreCelda.richText)
          nombreCelda = nombreCelda.richText.map((t) => t.text).join("");
        else if (nombreCelda.text) nombreCelda = nombreCelda.text;
      }

      if (normalizarTexto(nombreCelda) === normalizarTexto(usuario.nombre)) {
        filaEncontrada = row;
        numFila = row.number;
        return false;
      }
    });

    if (!filaEncontrada) {
      console.log(`❌ No se encontró a ${usuario.nombre}`);
      return false;
    }

    const celdaHora = filaEncontrada.getCell(4);
    const valorCelda = (celdaHora.value || "").toString().trim().toUpperCase();
    if (valorCelda !== "" && valorCelda !== "FALTA") {
      console.log(`⚠️ ${usuario.nombre} ya tiene registro.`);
      return false;
    }

    const valoresFilaOriginal = filaEncontrada.values;
    const [_, num, nombre, turno, __] = valoresFilaOriginal;

    // --- Lógica de Estilo por Asistencia ---
    let nuevoEstiloColumnaD = {
      alignment: { horizontal: "center", vertical: "middle" },
      font: { bold: true, color: { argb: "FF000000" } },
      fill: null,
    };

    if (usuario.rol === "estudiante") {
      const estado = estadoAsistencia(usuario.turno, horaStr);
      const colores = {
        puntual: { bg: "FFC6EFCE", fg: "FF006100" }, // VERDE (Puntual)
        tolerancia: { bg: "FFFFE699", fg: "FF9C6500" }, // NARANJA (Tolerancia)
        tarde: { bg: "FFFFC7CE", fg: "FF9C0006" }, // ROJO (Tarde)
      };
      const { bg, fg } = colores[estado];
      nuevoEstiloColumnaD.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: bg },
      };
      nuevoEstiloColumnaD.font.color.argb = fg;
    } else {
      nuevoEstiloColumnaD.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFBDD7EE" },
      };
    }

    // 2. Definir los valores de la nueva fila y reemplazar
    const nuevaFilaValores = [num, nombre, turno, horaStr];
    hoja.spliceRows(numFila, 1, nuevaFilaValores);

    // 3. Aplicar estilos
    const nuevaFila = hoja.getRow(numFila);
    aplicarEstiloCelda(nuevaFila.getCell(1), {
      ...estiloDatos,
      alignment: { horizontal: "center", vertical: "middle" },
    });
    aplicarEstiloCelda(nuevaFila.getCell(2), estiloDatos);
    aplicarEstiloCelda(nuevaFila.getCell(3), estiloDatos);

    aplicarEstiloCelda(nuevaFila.getCell(4), nuevoEstiloColumnaD);

    await workbook.xlsx.writeFile(rutaArchivo);
    return true;
  } catch (err) {
    console.error("❌ ERROR GUARDANDO REGISTRO:");
    console.error(err);
    return false;
  }
}

module.exports = {
  guardarRegistro,
};
