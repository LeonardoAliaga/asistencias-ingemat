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

## WhatsApp consistente

La solución implementada es [WhatsApp Business Platform / Cloud API](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api), con HTTP versionado. El panel no depende de un navegador conectado a WhatsApp Web.

[Twilio](https://www.twilio.com/docs/whatsapp/api) y [360dialog](https://docs.360dialog.com/) son alternativas de proveedor si se necesita soporte y administración adicional; tienen sus propios costos y condiciones. Esta versión implementa el transporte directo de Meta, con una cola interna independiente.

El antiguo [SDK oficial de WhatsApp para Node](https://github.com/WhatsApp/WhatsApp-Nodejs-SDK) está archivado. No se incorpora una dependencia archivada para sustituir otra frágil: la pequeña capa HTTP es explícita, configurable y está probada con respuestas simuladas.

Para mensajería iniciada por la academia se usan plantillas aprobadas. La [documentación de Twilio](https://www.twilio.com/docs/whatsapp/api) detalla la ventana de atención de 24 horas y los mensajes con plantilla fuera de esa ventana. La [tarificación oficial](https://business.whatsapp.com/products/platform-pricing) varía por país, categoría y condiciones aplicables. No se fija un precio que dependa de la cuenta o del volumen real.

### El requisito de grupos

La [documentación actual de Groups API de 360dialog](https://docs.360dialog.com/docs/messaging/groups) exige Official Business Account y describe un máximo de ocho participantes, además de exclusiones para coexistencia. Esa API no es un reemplazo general de los grupos de alumnos de un salón.

Por eso v2 configura contactos individuales autorizados por estudiante. Los reportes administrativos se pueden descargar y compartir manualmente en grupos ya existentes. Cambiar a otra biblioteca que controle WhatsApp Web no ofrece la misma estabilidad de un contrato de API oficial.

### Entrega y fallos

La cola distingue aceptación del proveedor y entrega al destinatario. Guarda el identificador de Meta, correlaciona los webhooks, evita reenvíos del mismo evento y aplica espera creciente a errores transitorios. Una respuesta incierta exige comprobación antes de reenviar. Las firmas HMAC del webhook se validan y los eventos repetidos o desordenados no hacen retroceder estados de entrega.

No se conectó una cuenta real ni se enviaron mensajes durante el desarrollo. Las pruebas usan un transporte simulado. La habilitación empresarial, el número, los secretos y la aprobación de plantillas corresponden a la cuenta de la academia.

## Costo y alternativas gratuitas de WhatsApp — revisión del 10/11/2026

La integración oficial de esta rama **no es una promesa de mensajería gratuita**. La [página de precios de Meta](https://business.whatsapp.com/products/platform-pricing) publica cobros por mensajes entregados, según destino y categoría. Debe comprobarse la facturación vigente de la cuenta. No se presuponen franquicias o exenciones y no se publica aquí una tarifa peruana sin conocer el caso concreto. La pantalla de Comunicación y la guía ahora lo indican antes de habilitar avisos.

| Recurso | Estado observado en su fuente primaria | Arquitectura y costo | Encaje para INGEMAT |
|---|---|---|---|
| [Baileys / WhiskeySockets](https://github.com/WhiskeySockets/Baileys) | [Releases](https://github.com/WhiskeySockets/Baileys/releases): v7.0.0-rc14 y línea v6.7.24; la versión 7 introduce cambios incompatibles y sigue etiquetada RC | Código abierto MIT; conexión WebSocket, sin Chromium ni tarifa de Cloud API por mensaje. La PC/servidor y mantenimiento siguen teniendo costo operativo | Primera candidata para evaluar automatización gratuita con menos procesos de navegador. Esto es una decisión de arquitectura, no una medición de rendimiento ni una garantía de entrega |
| [WPPConnect](https://wppconnect.io/wppconnect/) | [v2.3.6, 23/10/2026](https://github.com/wppconnect-team/wppconnect/releases/tag/v2.3.6), con correcciones recientes de sesión y navegador | Biblioteca LGPL; usa Puppeteer y WhatsApp Web. Autohospedada sin tarifa de Cloud API por mensaje | Alternativa con actividad reciente, pero mantiene la dependencia de un navegador y sus cambios |
| [whatsapp-web.js](https://wwebjs.dev/) | [Releases](https://github.com/wwebjs/whatsapp-web.js/releases) consultadas: v1.34.7 | Biblioteca abierta que controla WhatsApp Web en navegador | Sigue disponible y actualizada, pero volver a ella no elimina el origen del mantenimiento que motivó la migración |
| [Enlace oficial wa.me](https://faq.whatsapp.com/5913398998672934) | Ayuda oficial de WhatsApp para click-to-chat y texto preparado | Abre un chat con el mensaje preparado; una persona pulsa Enviar en su aplicación | Alternativa sin automatización de sesión ni tarifa de Cloud API. No ofrece confirmación automática de entrega ni envíos desatendidos |

**Propuesta técnica:** si la prioridad es automatizar sin pagar Cloud API, evaluar Baileys como adaptador de transporte aislado del sistema académico. Mantener la cola SQLite, consentimiento de contactos, correlación de eventos y reconciliación de resultados inciertos. Usar persistencia transaccional de credenciales y claves Signal; la [documentación de sesión](https://github.com/WhiskeySockets/docs/blob/main/authentication/session-management.mdx) desaconseja el helper de múltiples archivos en producción. La [reconexión](https://github.com/WhiskeySockets/docs/blob/main/advanced/troubleshooting.mdx) debe implementarse expresamente; una sesión cerrada requiere nueva vinculación. Fijar una versión concreta, probarla con un número de ensayo y actualizar con pruebas, sin descargar arbitrariamente la rama de desarrollo en cada arranque.

Ninguna biblioteca no oficial ofrece inmunidad ante cambios de protocolo, desconexiones o restricciones de WhatsApp; el [README de Baileys](https://raw.githubusercontent.com/WhiskeySockets/Baileys/master/README.md) explicita su independencia y límites. Una biblioteca gratuita no equivale a un proveedor soportado por WhatsApp. Esta revisión no instala ni activa un transporte nuevo, ni conecta números ni envía mensajes.

## QR y selección del simulacro: propuesta para debatir

Hoy el selector Examen listo determina la definición y la bandeja de capturas antes de procesar; el QR firmado verifica después que cada hoja pertenece realmente a ese examen. Por eso el selector es un filtro previo en la implementación actual, no la fuente de identidad. La selección manual puede eliminarse de la experiencia de escaneo si se incorpora una fase previa de identificación.

Flujo propuesto: capturar sin examen → detectar y validar los QR contra la base de esta instalación → recuperar definición, versión y revisión → agrupar cada cartilla y sus caras por identificador → separar los simulacros en lotes → leer círculos y mostrar el simulacro detectado para revisión. Un QR inválido o de otra instalación queda como incidencia; no se adjudica por suposición. En una A4 pueden coexistir varias cartillas y deben inspeccionarse todas. La firma y el registro de la cartilla siguen impidiendo confusiones y páginas repetidas.

CSV no contiene esos QR: conserva selección explícita. La carga manual de PDF/imágenes puede adoptar el mismo flujo automático que NAPS2. El selector podría quedar como filtro opcional para quien prepara lotes de un solo examen. Esta sección es una propuesta; el flujo de captura de esta entrega mantiene la selección actual, a la espera de acordar ese cambio de uso.
