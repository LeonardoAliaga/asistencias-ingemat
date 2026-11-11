# Decisiones de lectura y mensajería

Revisión de fuentes: 10 de noviembre de 2026. Las restricciones de servicios externos pueden cambiar; comprueba la documentación del proveedor al configurar una cuenta.

## Capturar cartillas

Para una academia con simulacros recurrentes, se recomienda escaneo con alimentador automático, PDF multipágina a 300 ppp y revisión de excepciones. El objetivo operativo es reducir la manipulación de hojas y la introducción repetitiva de códigos; no prometer una precisión universal del reconocimiento.

La documentación del fabricante [Remark: escáneres](https://remarksoftware.com/support/remark-office-omr-support/scanner-information/) describe ADF, importación de imágenes/PDF y resoluciones de 200–300 ppp. Elegir 300 ppp y conservar grises es el punto de partida de **este** lector, que debe probarse con la impresora, papel y lápices de la academia.

| Recurso                                                                       | Uso que encaja                                                            | Consideración                                                                                                                 |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| [OpenCV](https://docs.opencv.org/4.x/d5/dae/tutorial_aruco_detection.html)    | Reconocimiento integrado con plantilla propia y marcadores identificables | Es una biblioteca, necesita controles, pruebas y revisión humana                                                              |
| [OMRChecker](https://github.com/Udayraj123/OMRChecker)                        | Base abierta para plantillas personalizadas y extracción de respuestas    | Licencia MIT; requiere configuración y validación de la plantilla; no se usan sus cifras promocionales como garantía          |
| [Auto Multiple Choice](https://www.auto-multiple-choice.net/doc/usage/)       | Flujo completo de creación y captura con AMC-TXT/LaTeX                    | Impone su propio proceso de autoría y preparación de documentos                                                               |
| [Remark Office OMR](https://remarksoftware.com/products/office-omr/features/) | Operación con herramienta comercial, revisión y exportación CSV           | Hay licencia; puede alimentar a INGEMAT por CSV en lugar de imponer su cálculo final                                          |
| [ZipGrade](https://www.zipgrade.com/forms/)                                   | Captura móvil y exámenes compatibles con sus formularios                  | Sus formas estándar documentadas son 20/50/100; no se presume compatibilidad de un cuadernillo de 120 sin una prueba concreta |

La implementación v2 usa OpenCV con un formato de impresión compartido entre el PDF y el lector. Esa decisión permite imprimir 120 preguntas completas, vincular cartilla, examen, cara y versión mediante QR; el código y el área marcados identifican al alumno y su perfil y aplicar las reglas de la academia en un motor independiente. Otros lectores pueden integrarse exportando respuestas a CSV.

La identificación QR utiliza [ZXing-C++ y sus bindings Python](https://github.com/zxing-cpp/zxing-cpp/blob/master/wrappers/python/README.md), con OpenCV como alternativa de lectura. Se incorporó un decodificador independiente después de observar un fallo intermitente de OpenCV en un PDF generado sin marcas. El lector no cambia las reglas académicas: Node sigue validando la firma y la ficha registrada antes de aceptar una lectura.

La plantilla usa cuatro marcadores ArUco distintos para corregir orientación y perspectiva. Las marcas se clasifican como única, blanco, múltiple o dudosa. Una decisión incierta pasa a revisión; no se convierte automáticamente en blanco ni se selecciona la burbuja más conveniente para la nota.

**Validación realizada:** imágenes sintéticas de 120 preguntas, dobles marcas, marca tenue, perspectiva, giro, falta o duplicación de marcadores, segunda página de 200 preguntas y 32 cartillas en PDF realmente generado por Node, cubriendo los ocho patrones de máscara del QR, y la alternativa de lectura con OpenCV. También se probó el recorrido PDF personalizado → lector Python → lote → recálculo por revisión → importación atómica. Falta la calibración con un lote físico de la academia, que no estuvo disponible durante el desarrollo.

## WhatsApp: decisión implementada

La academia eligió [Baileys / WhiskeySockets](https://github.com/WhiskeySockets/Baileys), biblioteca abierta sin navegador, como único transporte. Se fija `@whiskeysockets/baileys` a `7.0.0-rc14`; la [página de releases](https://github.com/WhiskeySockets/Baileys/releases) la identifica como RC. No se promete inmunidad a cambios del protocolo ni a restricciones de WhatsApp. La integración de API de pago fue retirada del código, la interfaz y las instrucciones de operación.

El paquete se carga únicamente en un proceso hijo, con heap JS acotado, plazos, latidos, reconexión limitada y apertura de circuito ante fallos. El servidor académico no importa la biblioteca. La persistencia SQL guarda credenciales y claves Signal, de acuerdo con la [recomendación de sesión](https://github.com/WhiskeySockets/docs/blob/main/authentication/session-management.mdx), en una base separada de las notas. No se usa el helper de múltiples archivos en producción.

La cola académica conserva la autorización de contactos, textos y eventos idempotentes. Los IDs de mensaje estables permiten correlacionar confirmaciones tempranas. Una caída después de solicitar el envío se trata como resultado incierto y exige revisión, sin reenviar a ciegas. La [documentación de reconexión](https://github.com/WhiskeySockets/docs/blob/main/advanced/troubleshooting.mdx) explica que la aplicación debe gestionarla; tras un cierre de sesión se solicita volver a vincular.

Se añadieron pruebas de paquete ausente, caída real de un hijo con HTTP vivo, timeout, latidos, persistencia de buffers/claves, cola, credenciales y datos históricos, autorización, QR privado, funcionamiento académico con el servicio caído y módulo de interfaz no disponible. El diagnóstico `npm run whatsapp:doctor` carga la versión instalada sin conectar una cuenta. No hubo envíos reales durante el desarrollo.

Detalles: [operación y recuperación](WHATSAPP.md) y [arquitectura](ARQUITECTURA.md).

## QR y selección del simulacro: propuesta para debatir

Hoy el selector Examen listo determina la definición y la bandeja de capturas antes de procesar; el QR firmado verifica después que cada hoja pertenece realmente a ese examen. Por eso el selector es un filtro previo en la implementación actual, no la fuente de identidad. La selección manual puede eliminarse de la experiencia de escaneo si se incorpora una fase previa de identificación.

Flujo propuesto: capturar sin examen → detectar y validar los QR contra la base de esta instalación → recuperar definición, versión y revisión → agrupar cada cartilla y sus caras por identificador → separar los simulacros en lotes → leer círculos y mostrar el simulacro detectado para revisión. Un QR inválido o de otra instalación queda como incidencia; no se adjudica por suposición. En una A4 pueden coexistir varias cartillas y deben inspeccionarse todas. La firma y el registro de la cartilla siguen impidiendo confusiones y páginas repetidas.

CSV no contiene esos QR: conserva selección explícita. La carga manual de PDF/imágenes puede adoptar el mismo flujo automático que NAPS2. El selector podría quedar como filtro opcional para quien prepara lotes de un solo examen. Esta sección es una propuesta; el flujo de captura de esta entrega mantiene la selección actual, a la espera de acordar ese cambio de uso.
