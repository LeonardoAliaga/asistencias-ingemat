// src/services/excel/excel.updater.js
const ExcelJS = require("exceljs");
const {
  estiloFalta,
  estiloNoAsiste,
  estiloDocenteRegistrado,
  estilosEstadoEstudiante,
  estiloTardanzaJustificada,
  borderStyle,
  estiloDatosBase,
  centerAlignment,
  leftAlignment,
} = require("./excel.constants");
const {
  getDayAbbreviation,
  normalizarTexto,
  convertTo12Hour,
  estadoAsistencia,
  getFullName,
} = require("../../utils/helpers");
const { applyBaseDataRowStyles } = require("./excel.helpers.js");

/**
 * Función principal para actualizar o insertar el registro de asistencia.
 */
function updateAttendanceRecord(hoja, usuario, horaStr, isJustified = false) {
  let filaEncontrada = null;
  let numFila = -1;

  // 1. Intentar buscar al usuario en la hoja
  hoja.eachRow((row, rowNumber) => {
    const celdaNombre = row.getCell(2);
    if (!celdaNombre || !celdaNombre.value) return;

    let nombreCelda = celdaNombre.value;
    // Manejo de RichText si Excel lo parsea así
    if (typeof nombreCelda === "object" && nombreCelda && nombreCelda.richText) {
      nombreCelda = nombreCelda.richText.map((t) => t.text).join("");
    } else if (typeof nombreCelda === "object" && nombreCelda && nombreCelda.text) {
      nombreCelda = nombreCelda.text;
    }

    // Normalizar para comparar
    const cellNorm = normalizarTexto(String(nombreCelda));
    const preferredNorm = normalizarTexto(getFullName(usuario));

    if (cellNorm === preferredNorm) {
      filaEncontrada = row;
      numFila = rowNumber;
      // return false en eachRow detiene la iteración (equivalente a break)
      return false; 
    }
  });

  // 2. LÓGICA DE AUTO-INSERCIÓN
  if (!filaEncontrada) {
    console.log(
      `⚠️ Usuario nuevo detectado en pleno registro: ${getFullName(usuario)}. Insertando en Excel...`
    );

    // Determinar dónde insertar y con qué número correlativo
    const datosInsercion = encontrarPosicionInsercion(hoja, usuario);
    numFila = datosInsercion.fila;
    const nuevoNumero = datosInsercion.numero;

    // Preparar datos de la nueva fila
    const diasAsistencia = usuario.dias_asistencia ? usuario.dias_asistencia.join(", ") : "";
    const rowData = [
        nuevoNumero, 
        getFullName(usuario), 
        usuario.turno || "", 
        diasAsistencia, 
        "" // Hora vacía por ahora, se llena más abajo
    ];

    // Insertar la fila desplazando las de abajo (spliceRows)
    hoja.spliceRows(numFila, 0, rowData);
    
    // Obtener la referencia a la nueva fila creada
    filaEncontrada = hoja.getRow(numFila);

    // Aplicar estilos base (bordes, alineación) a la nueva fila
    applyBaseDataRowStyles(
      filaEncontrada,
      estiloDatosBase,
      centerAlignment,
      leftAlignment
    );
  }

  // 3. Validar si ya tenía asistencia (para no sobrescribir asistencias previas)
  // Nota: Si acabamos de crear la fila, esto estará vacío y pasará sin problemas.
  const celdaHora = filaEncontrada.getCell(5);
  const valorCelda = (celdaHora.value || "").toString().trim().toUpperCase();

  if (
    valorCelda !== "" &&
    valorCelda !== "FALTA" &&
    valorCelda !== "NO ASISTE" &&
    valorCelda !== "F. JUSTIFICADA" &&
    !valorCelda.endsWith("(J)")
  ) {
    console.log(
      `⚠️ ${getFullName(usuario)} ya tiene registro: ${valorCelda}. Rechazado.`
    );
    return false;
  }

  // 4. Calcular estilo y valor de la hora
  const hora12h = convertTo12Hour(horaStr);
  let valorHoraParaExcel = hora12h;
  let estiloCeldaHora;

  if (usuario.rol === "estudiante") {
    const estado = estadoAsistencia(usuario.ciclo, usuario.turno, horaStr);

    if (isJustified && (estado === "tarde" || estado === "tolerancia")) {
      valorHoraParaExcel = `${hora12h} (J)`;
      estiloCeldaHora = estiloTardanzaJustificada;
    } else {
      estiloCeldaHora = estilosEstadoEstudiante[estado] || estilosEstadoEstudiante.tarde;
    }
  } else {
    // Docente
    if (isJustified) {
      valorHoraParaExcel = `${hora12h} (J)`;
    }
    estiloCeldaHora = estiloDocenteRegistrado;
  }

  // 5. Escribir el valor de la hora
  // Usamos el valor directo de la celda en lugar de reemplazar toda la fila para preservar estilos vecinos si hubiera
  celdaHora.value = valorHoraParaExcel;

  // 6. Aplicar estilo específico a la celda de hora (colores, fondo)
  celdaHora.style = {
    fill: { ...estiloCeldaHora.fill },
    font: { ...estiloCeldaHora.font },
    alignment: { ...estiloCeldaHora.alignment },
    border: { ...estiloCeldaHora.border },
  };

  // Re-confirmar estilos base en la fila por seguridad (si hubo splice)
  applyBaseDataRowStyles(
    filaEncontrada,
    estiloDatosBase,
    centerAlignment,
    leftAlignment
  );

  console.log(
    `✅ Registro actualizado/creado para ${getFullName(usuario)} a ${valorHoraParaExcel}.`
  );
  return true;
}

/**
 * Helper auxiliar para encontrar dónde meter al alumno nuevo sin romper el orden.
 */
function encontrarPosicionInsercion(hoja, usuario) {
    let insertRowIdx = hoja.rowCount + 1; // Por defecto al final
    let nuevoNumero = 1;

    if (usuario.rol === 'estudiante' && usuario.ciclo) {
        // Buscar el encabezado del ciclo específico
        const tituloCiclo = `REGISTRO DE ASISTENCIA - ${usuario.ciclo.toUpperCase()} - ${usuario.turno.toUpperCase()}`;
        let filaTitulo = -1;
        
        hoja.eachRow((row, rIdx) => {
            const val = row.getCell(1).value;
            if (val && val.toString().trim() === tituloCiclo) {
                filaTitulo = rIdx;
            }
        });

        if (filaTitulo !== -1) {
            // Ciclo encontrado. Buscar dónde termina la lista de alumnos de este ciclo.
            // (Iteramos desde el encabezado hacia abajo)
            let r = filaTitulo + 2; // +1 encabezados, +2 primer alumno potencial
            let ultimoNumero = 0;
            
            // Buscamos hasta encontrar una fila vacía o el inicio de otro bloque
            while(r <= hoja.rowCount + 1) { 
                const row = hoja.getRow(r);
                const valNro = row.getCell(1).value;
                const valNombre = row.getCell(2).value; // Chequear nombre también por si acaso

                // Si la celda N° está vacía o empieza un nuevo título "REGISTRO...", ahí termina este bloque
                if (!valNro || (typeof valNro === 'string' && valNro.startsWith('REGISTRO'))) {
                    insertRowIdx = r;
                    break;
                }
                
                // Si es un número, lo guardamos para calcular el siguiente correlativo
                if (typeof valNro === 'number') {
                    ultimoNumero = valNro;
                }
                
                r++;
            }
            // Si llegamos al final del loop, insertRowIdx será r
            insertRowIdx = r;
            nuevoNumero = ultimoNumero + 1;
        } else {
            // Caso raro: El ciclo no existe en la hoja (ej. primer alumno de un ciclo nuevo creado hoy).
            // Lo agregamos al final para no perder el dato.
            insertRowIdx = hoja.rowCount + 1;
            nuevoNumero = 1; 
        }
    } else {
        // Docentes: Buscar el último número correlativo en toda la hoja
        let ultimoNumero = 0;
         hoja.eachRow((row) => {
            const val = row.getCell(1).value;
             if (typeof val === 'number') ultimoNumero = val;
         });
         nuevoNumero = ultimoNumero + 1;
         insertRowIdx = hoja.rowCount + 1;
    }

    return { fila: insertRowIdx, numero: nuevoNumero };
}

module.exports = {
  updateAttendanceRecord,
};
