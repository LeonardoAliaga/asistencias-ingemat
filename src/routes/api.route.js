const express = require("express");
const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");
const { guardarRegistro } = require("../services/excel.service");
const { estadoAsistencia } = require("../utils/helpers");

const router = express.Router();
const usuariosPath = path.join(__dirname, "../../data/usuarios.json");
const registrosPath = path.join(__dirname, "../../Registros");
const horariosPath = path.join(__dirname, "../../data/horarios.json");

router.post("/registrar", async (req, res) => {
  const { codigo } = req.body;
  const usuarios = JSON.parse(fs.readFileSync(usuariosPath, "utf8"));
  const usuario = usuarios.find((u) => u.codigo === codigo);

  if (!usuario) {
    return res
      .status(404)
      .json({ exito: false, mensaje: "Código no encontrado" });
  }

  const fecha = new Date();
  const fechaStr = fecha.toLocaleDateString("es-PE");

  // 💡 Generar la hora de registro en formato 24 horas (HH:MM)
  const horaStr = fecha.toLocaleTimeString("es-PE", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false, // Forzamos el formato 24H
  });

  const guardado = await guardarRegistro(usuario, fechaStr, horaStr);

  if (!guardado) {
    return res.status(409).json({
      exito: false,
      mensaje: `${usuario.nombre} ya tiene registro.`,
    });
  }

  // Calcula el estado de asistencia
  let estado = "";
  let ciclo = "";
  let turno = "";

  if (usuario.rol === "estudiante") {
    estado = estadoAsistencia(usuario.turno, horaStr);
    ciclo = usuario.ciclo;
    turno = usuario.turno;
  }

  // Opcional: convertir a 12h solo para mostrar en la respuesta al usuario
  const hora12h = fecha.toLocaleTimeString("es-PE", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  res.json({
    exito: true,
    nombre: usuario.nombre,
    hora: `${fechaStr} ${hora12h}`,
    estado,
    ciclo,
    turno,
    rol: usuario.rol,
  });
});

// Obtener todos los usuarios
router.get("/usuarios", (req, res) => {
  const usuarios = JSON.parse(fs.readFileSync(usuariosPath, "utf8"));
  res.json(usuarios);
});
// Agregar usuario
router.post("/usuarios", (req, res) => {
  const usuarios = JSON.parse(fs.readFileSync(usuariosPath, "utf8"));
  usuarios.push(req.body);
  fs.writeFileSync(usuariosPath, JSON.stringify(usuarios, null, 2));
  res.json({ exito: true });
});
// Eliminar usuario
router.delete("/usuarios/:codigo", (req, res) => {
  let usuarios = JSON.parse(fs.readFileSync(usuariosPath, "utf8"));
  usuarios = usuarios.filter((u) => u.codigo !== req.params.codigo);
  fs.writeFileSync(usuariosPath, JSON.stringify(usuarios, null, 2));
  res.json({ exito: true });
});
// Listar archivos Excel
router.get("/excel", (req, res) => {
  const archivos = fs
    .readdirSync(registrosPath)
    .filter((f) => f.endsWith(".xlsx"));
  res.json(archivos);
});
// Descargar archivo Excel
router.get("/excel/:archivo", (req, res) => {
  const archivo = req.params.archivo;
  const ruta = path.join(registrosPath, archivo);
  res.download(ruta);
});

// Obtener contenido del archivo XLSX para vista previa (usando ExcelJS)
router.get("/excel/preview/:archivo", async (req, res) => {
  const archivo = req.params.archivo;
  const ruta = path.join(registrosPath, archivo);

  if (!fs.existsSync(ruta)) {
    return res.status(404).json({ mensaje: "Archivo no encontrado" });
  }

  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(ruta);
    const worksheet = workbook.getWorksheet("Asistencia");

    if (!worksheet) {
      return res
        .status(404)
        .json({ mensaje: "Hoja 'Asistencia' no encontrada" });
    }

    let csvContent = "";

    // Iteramos sobre las filas para extraer los datos como texto CSV
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      let rowValues = [];

      // 1. Detección de títulos (celdas fusionadas, en Columna 1)
      const firstCell = row.getCell(1);
      const cellValue = firstCell.value;

      if (
        typeof cellValue === "string" &&
        cellValue.startsWith("REGISTRO DE ASISTENCIA")
      ) {
        // Fila de título: enviamos solo el título
        csvContent += cellValue + "\n";
        csvContent += "\n"; // Agregamos una fila vacía de separación visual
        return;
      }

      // 2. Detección de filas de separación completamente vacías (las ignoramos)
      if (!row.values.some((v) => v !== null && v !== undefined && v !== "")) {
        return;
      }

      // 3. Extracción de datos normales/encabezados de tabla
      let rowHasContent = false;

      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        let value = cell.value;
        let finalValue = "";

        if (value !== null && value !== undefined && value !== "") {
          rowHasContent = true;
          if (typeof value === "object") {
            if (value.richText) {
              finalValue = value.richText.map((t) => t.text).join("");
            } else if (value.result) {
              // Es una fórmula
              finalValue = value.result;
            } else if (value.text) {
              // Es un objeto de texto
              finalValue = value.text;
            } else {
              finalValue = String(value);
            }
          } else {
            finalValue = String(value);
          }
        }

        // Usamos las columnas relevantes (2 a 5 o hasta donde haya datos)
        if (colNumber >= 2) {
          rowValues.push(finalValue.trim());
        }
      });

      // 4. Si es una fila de datos o encabezado válido
      if (rowHasContent) {
        // Unir los valores, asegurando que haya suficientes comas para un formato de 4 columnas
        while (rowValues.length < 4) {
          rowValues.push("");
        }
        csvContent += rowValues.join(",") + "\n";
      }
    });

    res.json({ exito: true, content: csvContent.trim() });
  } catch (error) {
    console.error("Error al leer archivo XLSX para previsualización:", error);
    res.status(500).json({
      mensaje:
        "Error al procesar el archivo XLSX (Posible corrupción o formato no estándar).",
      detalle: error.message,
    });
  }
});

// Obtener horarios
router.get("/horarios", (req, res) => {
  let horarios;
  try {
    horarios = JSON.parse(fs.readFileSync(horariosPath, "utf8"));
  } catch {
    // Valores por defecto si no existe el archivo
    horarios = {
      mañana: { entrada: "08:00", tolerancia: "08:15" },
      tarde: { entrada: "14:00", tolerancia: "14:15" },
    };
  }
  res.json(horarios);
});

// Guardar horarios
router.post("/horarios", (req, res) => {
  const horarios = req.body;
  fs.writeFileSync(horariosPath, JSON.stringify(horarios, null, 2));
  res.json({ mensaje: "Horarios actualizados correctamente" });
});

module.exports = router;
