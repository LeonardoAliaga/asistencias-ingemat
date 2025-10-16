// src/services/excel.service.js

const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");
const {
  estadoAsistencia,
  normalizarTexto,
  aplicarEstiloCelda,
  getDayAbbreviation,
} = require("../utils/helpers");

const usuariosPath = path.join(__dirname, "../../data/usuarios.json");
const registrosPath = path.join(__dirname, "../../registros");
const ciclosPath = path.join(__dirname, "../../data/ciclos.json"); // 🚀 NUEVO

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

// NUEVO ESTILO para "NO ASISTE"
const estiloNoAsiste = {
  fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFC0C0C0" } }, // Gris
  font: { bold: true, color: { argb: "FF404040" } }, // Gris oscuro para el texto
  alignment: { horizontal: "center", vertical: "middle" },
  border: borderStyle,
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

// Helper para convertir "HH:MM" (24h) a "HH:MM AM/PM" (12h)
function convertTo12Hour(time24h) {
  if (
    !time24h ||
    time24h.toUpperCase() === "FALTA" ||
    time24h.toUpperCase() === "NO ASISTE" ||
    !time24h.includes(":")
  )
    return time24h;

  const [hour, minute] = time24h.split(":").map(Number);
  if (isNaN(hour) || isNaN(minute)) return time24h;

  const date = new Date(2000, 0, 1, hour, minute);

  return date
    .toLocaleTimeString("es-PE", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })
    .replace(/\s/g, "")
    .toUpperCase();
}

// Función para obtener la lista de ciclos (Duplicada para modularidad en el servidor)
function getCiclosList() {
  try {
    const data = JSON.parse(fs.readFileSync(ciclosPath, "utf8"));
    return data.ciclos;
  } catch {
    return ["semestral", "anual", "sabatino", "domingos"];
  }
}

// 🏆 FUNCIÓN PRINCIPAL DE REGISTRO
async function guardarRegistro(usuario, fechaStr, horaStr) {
  try {
    const fecha = new Date();
    const diaAbbr = getDayAbbreviation(fecha);

    console.log(`\n📘 Registrando: ${usuario.nombre} (${usuario.rol})`);
    console.log(`🕒 Hora: ${horaStr}`);

    const diaSemana = fecha
      .toLocaleDateString("es-PE", { weekday: "long" })
      .toUpperCase();
    const diaNumero = fecha.getDate().toString().padStart(2, "0");
    const nombreColumna = `${diaSemana} ${diaNumero}`;

    const nombreArchivo = `${fechaStr.replace(/\//g, "-")}.xlsx`;
    const rutaArchivo = path.join(registrosPath, nombreArchivo);

    const workbook = new ExcelJS.Workbook();
    let hoja;

    const todosLosUsuarios = JSON.parse(fs.readFileSync(usuariosPath, "utf8"));

    // OBTENEMOS TODOS LOS ESTUDIANTES Y DOCENTES (sin filtrar)
    const estudiantes = todosLosUsuarios
      .filter((u) => u.rol === "estudiante")
      .sort((a, b) =>
        a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" })
      );

    const docentes = todosLosUsuarios
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
      // --- LÓGICA DE CREACIÓN DE ARCHIVO (CON DOBLE AGRUPACIÓN Y COLUMNA DÍAS) ---
      hoja = workbook.addWorksheet("Asistencia");

      let fila = 1;
      const ciclos = getCiclosList(); // 🚀 LISTA DINÁMICA
      const turnos = ["mañana", "tarde"];

      for (const ciclo of ciclos) {
        for (const turno of turnos) {
          // Filtramos estudiantes por CICLO Y TURNO
          const grupo = estudiantes.filter(
            (e) => e.ciclo === ciclo && e.turno === turno
          );
          if (grupo.length === 0) continue;

          // TÍTULO: CICLO - TURNO
          hoja.getCell(
            `A${fila}`
          ).value = `REGISTRO DE ASISTENCIA - ${ciclo.toUpperCase()} - ${turno.toUpperCase()}`;
          hoja.mergeCells(`A${fila}:E${fila}`);
          hoja.getCell(`A${fila}`).font = { bold: true, size: 14 };
          hoja.getCell(`A${fila}`).alignment = { horizontal: "center" };
          fila++;

          // ENCABEZADO DE COLUMNAS (5 columnas)
          hoja.getRow(fila).values = [
            "N°",
            "ALUMNO",
            "TURNO",
            "DÍAS ASISTENCIA",
            nombreColumna,
          ];
          hoja.getRow(fila).eachCell((cell, colIndex) => {
            const fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FF404040" },
            };
            aplicarEstiloCelda(cell, { ...estiloEncabezado, fill });
          });
          fila++;

          grupo.forEach((est, i) => {
            // LÓGICA CLAVE: Determinar estado inicial
            const isScheduled =
              est.dias_asistencia && est.dias_asistencia.includes(diaAbbr);
            const initialStatus = isScheduled ? "FALTA" : "NO ASISTE";
            const diasAsistenciaStr = est.dias_asistencia
              ? est.dias_asistencia.join(", ")
              : "";

            const row = hoja.addRow([
              i + 1,
              est.nombre,
              est.turno ? est.turno.toUpperCase() : "",
              diasAsistenciaStr,
              initialStatus,
            ]);

            // Aplicar estilo a las 4 primeras columnas (N°, ALUMNO, TURNO, DÍAS)
            [1, 2, 3, 4].forEach((col) => {
              aplicarEstiloCelda(row.getCell(col), estiloDatos);
            });
            aplicarEstiloCelda(row.getCell(1), {
              ...estiloDatos,
              alignment: { horizontal: "center", vertical: "middle" },
            });
            aplicarEstiloCelda(row.getCell(4), {
              ...estiloDatos,
              alignment: { horizontal: "center", vertical: "middle" },
            });

            // Aplicar estilo condicional a la quinta columna (REGISTRO)
            if (!isScheduled) {
              aplicarEstiloCelda(row.getCell(5), estiloNoAsiste);
            } else {
              aplicarEstiloCelda(row.getCell(5), estiloFalta);
            }

            fila++;
          });

          fila += 2; // Espacio de separación entre cuadros (turnos)
        }
      }

      // Sección Docentes (APLICAMOS LÓGICA DE DÍAS Y NO ASISTE)
      hoja.getCell(`A${fila}`).value = "REGISTRO DE ASISTENCIA - DOCENTES";
      hoja.mergeCells(`A${fila}:E${fila}`);
      hoja.getCell(`A${fila}`).font = { bold: true, size: 14 };
      hoja.getCell(`A${fila}`).alignment = { horizontal: "center" };
      fila++;

      // ENCABEZADO DOCENTES (5 columnas)
      hoja.getRow(fila).values = [
        "N°",
        "DOCENTE",
        "TURNO",
        "DÍAS ASISTENCIA",
        nombreColumna,
      ];
      hoja.getRow(fila).eachCell((cell, colIndex) => {
        const fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF1F4E78" },
        };
        aplicarEstiloCelda(cell, { ...estiloEncabezado, fill });
      });
      fila++;

      docentes.forEach((doc, i) => {
        // LÓGICA CLAVE: Determinar estado inicial para docentes
        const isScheduled =
          doc.dias_asistencia && doc.dias_asistencia.includes(diaAbbr);
        const initialStatus = isScheduled ? "FALTA" : "NO ASISTE";
        const diasAsistenciaStr = doc.dias_asistencia
          ? doc.dias_asistencia.join(", ")
          : "";

        // Los docentes no tienen turno, pero sí días
        const row = hoja.addRow([
          i + 1,
          doc.nombre,
          "", // TURNO vacío
          diasAsistenciaStr, // DÍAS ASISTENCIA
          initialStatus,
        ]);

        // Aplicar estilo a las 4 primeras columnas (N°, ALUMNO, TURNO, DÍAS)
        [1, 2, 3, 4].forEach((col) => {
          aplicarEstiloCelda(row.getCell(col), estiloDatos);
        });
        aplicarEstiloCelda(row.getCell(1), {
          ...estiloDatos,
          alignment: { horizontal: "center", vertical: "middle" },
        });
        aplicarEstiloCelda(row.getCell(4), {
          ...estiloDatos,
          alignment: { horizontal: "center", vertical: "middle" },
        });

        // Aplicar estilo condicional a la quinta columna (REGISTRO)
        if (!isScheduled) {
          aplicarEstiloCelda(row.getCell(5), estiloNoAsiste);
        } else {
          aplicarEstiloCelda(row.getCell(5), estiloFalta);
        }
      });

      // Ajuste de anchos de columna (incluyendo la nueva columna 4)
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

    // --- MANEJO DEL REGISTRO DE HORA ---
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
      console.log(`❌ No se encontró a ${usuario.nombre} en la lista del día.`);
      return false;
    }

    // EL REGISTRO DE HORA AHORA ES LA QUINTA COLUMNA (CELL 5)
    const celdaHora = filaEncontrada.getCell(5);
    const valorCelda = (celdaHora.value || "").toString().trim().toUpperCase();

    // LÓGICA DE VALIDACIÓN: Solo rechazar si ya existe una hora registrada (no FALTA ni NO ASISTE).
    if (
      valorCelda !== "" &&
      valorCelda !== "FALTA" &&
      valorCelda !== "NO ASISTE"
    ) {
      console.log(
        `⚠️ ${usuario.nombre} ya tiene registro de hora: ${valorCelda}. Registro rechazado.`
      );
      return false;
    }

    // 🚀 LÓGICA CLAVE: CONVERTIMOS LA HORA A 12H ANTES DE ESCRIBIR EN EL EXCEL
    const hora12h = convertTo12Hour(horaStr);

    // --- Lógica de Estilo por Asistencia ---
    let nuevoEstiloColumnaE = {
      // Columna E (5)
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
      nuevoEstiloColumnaE.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: bg },
      };
      nuevoEstiloColumnaE.font.color.argb = fg;
    } else {
      // Estilo para docentes (registrados)
      nuevoEstiloColumnaE.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFBDD7EE" },
      };
    }

    // 2. Definir los valores de la nueva fila y reemplazar
    const valoresFilaOriginal = filaEncontrada.values;
    const [_, num, nombre, turno, dias, __] = valoresFilaOriginal;

    // Escribimos la hora ya convertida a 12h
    const nuevaFilaValores = [num, nombre, turno, dias, hora12h];
    hoja.spliceRows(numFila, 1, nuevaFilaValores);

    // 3. Aplicar estilos
    const nuevaFila = hoja.getRow(numFila);

    // Aplicamos estilos a las 4 primeras columnas (N°, ALUMNO, TURNO, DÍAS)
    [1, 2, 3, 4].forEach((col) => {
      aplicarEstiloCelda(nuevaFila.getCell(col), estiloDatos);
    });
    aplicarEstiloCelda(nuevaFila.getCell(1), {
      ...estiloDatos,
      alignment: { horizontal: "center", vertical: "middle" },
    });
    aplicarEstiloCelda(nuevaFila.getCell(4), {
      ...estiloDatos,
      alignment: { horizontal: "center", vertical: "middle" },
    });

    // Aplicamos estilo al REGISTRO (Columna 5)
    aplicarEstiloCelda(nuevaFila.getCell(5), nuevoEstiloColumnaE);

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
