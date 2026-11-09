# Decisiones de lectura y mensajería

Revisión de fuentes: 9 de noviembre de 2026. Las restricciones de servicios externos pueden cambiar; comprueba la documentación del proveedor al configurar una cuenta.

## Capturar cartillas

Para una academia con simulacros recurrentes, se recomienda escaneo con alimentador automático, PDF multipágina a 300 ppp y revisión de excepciones. El objetivo operativo es reducir la manipulación de hojas y la introducción repetitiva de códigos; no prometer una precisión universal del reconocimiento.

La documentación del fabricante [Remark: escáneres](https://remarksoftware.com/support/remark-office-omr-support/scanner-information/) describe ADF, importación de imágenes/PDF y resoluciones de 200–300 ppp. Elegir 300 ppp y conservar grises es el punto de partida de **este** lector, que debe probarse con la impresora, papel y lápices de la academia.

| Recurso | Uso que encaja | Consideración |
|---|---|---|
| [OpenCV](https://docs.opencv.org/4.x/d5/dae/tutorial_aruco_detection.html) | Reconocimiento integrado con plantilla propia y marcadores identificables | Es una biblioteca, necesita controles, pruebas y revisión humana |
| [OMRChecker](https://github.com/Udayraj123/OMRChecker) | Base abierta para plantillas personalizadas y extracción de respuestas | Licencia MIT; requiere configuración y validación de la plantilla; no se usan sus cifras promocionales como garantía |
| [Auto Multiple Choice](https://www.auto-multiple-choice.net/doc/usage/) | Flujo completo de creación y captura con AMC-TXT/LaTeX | Impone su propio proceso de autoría y preparación de documentos |
| [Remark Office OMR](https://remarksoftware.com/products/office-omr/features/) | Operación con herramienta comercial, revisión y exportación CSV | Hay licencia; puede alimentar a INGEMAT por CSV en lugar de imponer su cálculo final |
| [ZipGrade](https://www.zipgrade.com/forms/) | Captura móvil y exámenes compatibles con sus formularios | Sus formas estándar documentadas son 20/50/100; no se presume compatibilidad de un cuadernillo de 120 sin una prueba concreta |

La implementación v2 usa OpenCV con un formato de impresión compartido entre el PDF y el lector. Esa decisión permite imprimir 120 preguntas completas, asociar alumno/área/versión mediante QR y aplicar las reglas de la academia en un motor independiente. Otros lectores pueden integrarse exportando respuestas a CSV.

La plantilla usa cuatro marcadores ArUco distintos para corregir orientación y perspectiva. Las marcas se clasifican como única, blanco, múltiple o dudosa. Una decisión incierta pasa a revisión; no se convierte automáticamente en blanco ni se selecciona la burbuja más conveniente para la nota.

**Validación realizada:** imágenes sintéticas de 120 preguntas, dobles marcas, marca tenue, perspectiva, giro, falta o duplicación de marcadores, segunda página de 200 preguntas y PDF realmente generado por Node con los ocho patrones de máscara del QR. También se probó el recorrido PDF personalizado → lector Python → lote → recálculo por revisión → importación atómica. Falta la calibración con un lote físico de la academia, que no estuvo disponible durante el desarrollo.

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
