# Escanear cartillas con NAPS2

Instala [NAPS2](https://www.naps2.com/) y los controladores de escáner Brother WIA/TWAIN en la PC que ejecuta INGEMAT. Comprueba primero que puedas obtener un PDF desde NAPS2. Una cola de impresión que aparece como Lista en Windows no confirma la disponibilidad del escáner.

INGEMAT detecta NAPS2.Console.exe en Program Files, Program Files (x86) o LocalAppData/Programs. Para la versión portátil u otra carpeta, añade en `.env` y reinicia:

```dotenv
NAPS2_BIN=C:/Program Files/NAPS2/NAPS2.Console.exe
```

Diagnóstico sin accionar el escáner:

```powershell
npm run scanner:doctor
npm run scanner:doctor -- twain
```

En Lectura de cartillas selecciona el examen listo y pulsa Buscar escáneres. Prueba WIA y, si es necesario, TWAIN. Elige equipo, origen y área. Escanear y añadir crea una captura en segundo plano; al terminar puedes abrir su PDF, quitarla, cambiar el papel o voltearlo y añadir otra. Cancelar escaneo solicita detener el proceso; comprueba el papel antes de repetir.

## Brother MFC-T920DW

| Papel | Flujo |
|---|---|
| Cuarto de A4 recortado | Cristal, área A4; captura frente y reverso manualmente |
| Media A4 recortada | Cristal o alimentador, área A5 |
| A4 completa con cartillas | Cristal o alimentador, área A4 |

El alimentador admite hasta 20 hojas, entre 148–215,9 mm de ancho y 148–355,6 mm de largo. Un cuarto de A4 (148,5 × 105 mm) queda fuera de ese rango. El escaneo es por una cara: el dúplex automático del equipo es de impresión. Mantén visibles el QR y los cuatro marcadores. La integración usa 300 ppp, grises y OCR desactivado; no aplica eliminación de fondo ni marcas. El tamaño físico y la legibilidad deben comprobarse con un lote real.

Referencias oficiales: [documentos admitidos en el ADF](https://support.brother.com/g/s/id/htmldoc/mfc/cv_dcp520/mexlts/html/GUID-62AE4D6F-E2F9-414E-9D25-36D90072091A_34.html), [controlador WIA](https://support.brother.com/g/s/id/htmldoc/mfc/cv_dcp520/mexlts/html/GUID-15D8D1B3-9EC5-4649-A046-73333418D7F1_78.html) y [CLI NAPS2](https://www.naps2.com/doc/command-line).

## Lotes y recuperación

- Las capturas y sus estados se guardan en SQLite y `data/scanner`, por operador y examen. Cambiar de sección o recargar no borra las capturas terminadas.
- Un solo proceso NAPS2 puede operar el escáner a la vez en esta instancia. Mantén una sola instancia de INGEMAT, como requiere el despliegue SQLite.
- Se conservan hasta diez capturas listas por examen y operador; cada PDF admite 20 MB. Un uso del alimentador puede producir varias páginas en un PDF. El lector admite hasta 100 caras de cartilla por lote.
- Ante una respuesta perdida, Verificar reutiliza el identificador original. Las consultas de estado no repiten órdenes físicas ni importaciones. El servidor interrumpido marca el escaneo fallido; solicita una nueva captura de forma manual.
- Procesar capturas copia los PDF a un lote OMR normal y conserva los originales si falla la importación. Al recibirse el lote se retiran de la bandeja. Revisa y confirma el lote para guardar las notas.
- Incluye ambas caras de cada cartilla de cuarto en el mismo lote; los QR las asocian. Quedan disponibles la carga de PDF/PNG/JPG previamente escaneados y la importación CSV.
- Los errores y códigos del proceso aparecen en la consola del servidor con el prefijo `[NAPS2]`. `npm run omr:doctor` comprueba por separado el Python y las dependencias que reconocen las marcas.

La app debe ejecutarse con la cuenta de Windows que pueda acceder al escáner. Si la web se aloja en otro servidor, esta integración controla los dispositivos de ese servidor; para controlar una PC distinta haría falta un agente local.

## Actualizar y limpiar la captura con cámara

La cámara de cartillas usaba APIs del navegador y archivos del proyecto. No instalaba una aplicación de cámara adicional. Actualiza la rama y limpia paquetes no declarados:

```powershell
git switch feat/ingemat-v2
git pull --ff-only
npm prune
```

Conserva Python, el entorno `.venv`, OpenCV, NumPy, PDFium, Pillow y ZXing: todos se utilizan para leer las cartillas del escáner. El lector de carnets de recepción mantiene su funcionalidad independiente.

## Verificación

Las pruebas automatizadas simulan el proceso de captura y comprueban permisos, órdenes fijas, concurrencia, cancelación, reinicio, PDFs, reintentos y entrega al lector OMR. No se ha controlado una impresora física durante el desarrollo. La prueba real con el controlador Brother instalado es necesaria antes de usar el flujo en la academia.
