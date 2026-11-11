# WhatsApp con Baileys

Baileys es la única conexión implementada. No se usan API de pago, tokens de proveedor, plantillas aprobadas ni un webhook público. La biblioteca no oficial depende del protocolo de WhatsApp y puede necesitar revisiones; su fallo se aísla del servidor académico.

## Instalar y vincular

1. Detén la app, actualiza la rama y ejecuta `npm ci`. La versión opcional está fijada en el lockfile.
2. Ejecuta `npm run whatsapp:doctor`. Solo carga el paquete en un proceso aparte y comprueba sus contratos básicos; no conecta cuentas. Un fallo devuelve diagnóstico sin impedir `npm start`.
3. Inicia INGEMAT y abre Comunicación con una cuenta de administración. Conserva los mensajes predeterminados o edita las variables indicadas. Guarda con avisos desactivados.
4. Pulsa Conectar / Reintentar. En el teléfono de la academia, WhatsApp → Dispositivos vinculados → Vincular un dispositivo. Escanea el QR del panel. Este QR vincula el teléfono y es distinto al de las cartillas.
5. Comprueba Conectado; entonces activa notificaciones y guarda. Vincular no activa por sí solo los mensajes. Registra únicamente contactos autorizados. Prueba primero con un contacto del personal que haya autorizado la prueba.

El QR de vinculación y las acciones de conexión están restringidos a administradores y requieren sesión; las escrituras conservan CSRF. El QR no se registra en consola ni se incluye en los endpoints generales de estado. Tiene vencimiento y se borra del panel al detener/desconectar.

## Fallos y recuperación

| Situación | Comportamiento | Acción |
|---|---|---|
| Paquete ausente, incompatible o módulo nativo que falla | El proceso hijo se detiene; aparece Revisa el paquete Baileys y su versión | Ejecuta `npm ci`, `npm run whatsapp:doctor` y revisa el código de estado del panel/consola |
| Desconexión transitoria | Hasta cinco reconexiones con espera creciente | Espera el estado conectado; si se agotan, usa Conectar / Reintentar |
| Cierre de sesión desde el teléfono | Se requiere otra vinculación | Volver a vincular → confirmar → Conectar → nuevo QR |
| Proceso caído o bloqueado | El supervisor lo detiene mediante plazos/latidos; no entra en un bucle de reinicios | Revisa el paquete y reconecta manualmente |
| Caída después de solicitar un envío | El aviso queda Por comprobar; no se repite automáticamente | Verifica que no llegó antes de confirmar un reintento |
| Servicio sin conectar | Los avisos siguen pendientes | Restablece la conexión y comprueba que los avisos están activados |
| Módulo de interfaz no disponible | Aviso en dashboard; las otras secciones continúan | Comprueba los archivos de la actualización y recarga el navegador |

Detener conexión desactiva envíos y conserva la sesión. Volver a vincular elimina solo la sesión local; no borra estudiantes, notas, asistencias ni los avisos históricos. El aviso técnico usa códigos controlados; no publica credenciales ni el texto de conversaciones.

## Sesión y cola

La sesión está en `DATA_DIR/whatsapp/baileys-auth.db`, separada de `ingemat.db`. Guarda credenciales, claves Signal con buffers y un máximo de 1000 mensajes para resolver reintentos del protocolo. Los cambios de claves se guardan en transacciones; no se usa el helper de múltiples archivos. La carpeta es privada y no se sirve como contenido web ni se incluye en Git.

La copia SQLite del panel corresponde a la base académica. Conserva la carpeta de WhatsApp en privado con la app detenida si necesitas restaurar la vinculación; también puedes vincular de nuevo. No mezcles archivos WAL/SHM de otra ejecución con una restauración.

La cola de avisos reside en la base académica para conservar el evento junto a la asistencia. Guarda textos, referencias de archivos y confirmaciones; el paquete de red nunca accede a la base académica. Los textos quedan fijados al crear el aviso. Un cambio posterior de plantilla no altera lo que ya estaba en cola. Las autorizaciones revocadas y las notas corregidas invalidan los avisos obsoletos.

Los avisos de asistencia y resultados siguen siendo individuales. Los reportes de alumnos se envían a un apoderado autorizado y los reportes de asistencia al grupo asignado explícitamente al ciclo. Los reportes se envían solo cuando un operador los solicita; no hay una programación diaria automática. Las confirmaciones se muestran cuando WhatsApp las comunica; la aceptación por el componente no equivale a entrega al destinatario.

## Actualización desde la integración anterior

La migración 006 conserva los avisos históricos y retira la configuración de API de pago. Los avisos pendientes anteriores se cancelan y no se reproducen por Baileys. Los resultados inciertos quedan como historial para reconciliar, sin reintento por el nuevo transporte. Los nuevos avisos empiezan desactivados hasta vincular y activar. Las antiguas variables `WHATSAPP_*` ya no son utilizadas.

Las pruebas automatizadas usan contactos ficticios y procesos simulados. El paquete real se comprueba con el diagnóstico sin vincular números ni enviar mensajes. La primera vinculación y prueba de entrega real deben realizarse en la PC de la academia.

Además se verificó una instalación limpia y la ausencia real del paquete en una copia aislada: el componente informó `BAILEYS_PACKAGE_LOAD_ERROR` y el HTTP de la app devolvió 200 con SQLite disponible. Esta comprobación no abrió una conexión a WhatsApp.


## Reportes individuales, por ciclo y archivos

- **Nuevo estudiante:** área de postulación, nombre y teléfono del apoderado son campos del formulario cuando se elige Estudiante. El contacto es opcional; si se completa, nombre y teléfono deben ser válidos. La autorización no se marca automáticamente.
- **Reportes → Por estudiante:** selecciona alumno y semana, pulsa Enviar por WhatsApp, escoge el apoderado autorizado y el formato PNG o PDF. Se conserva el diseño de la ficha integral. El PDF es una instantánea visual en A4 con saltos de página entre filas.
- **Comunicación → Grupos de reportes por ciclo:** selecciona el ciclo, busca por nombre (palabras en cualquier orden, tildes normalizadas y errores pequeños), elige un grupo y guarda. La sesión debe estar conectada y pertenecer al grupo. La consulta solo devuelve identificador, nombre y cantidad de miembros; no publica sus números ni conversaciones.
- **Asistencias:** elige ciclo, fecha y turno. Si el ciclo tiene grupo y hay registros, Enviar reporte del día permite confirmar destino y escoger imagen o PDF. Conserva el diseño clásico del reporte de asistencia. Administración configura los grupos; Administración y Recepción pueden enviar la asistencia. Solo Administración envía fichas académicas individuales.
- **Envío manual y avisos automáticos:** conectar WhatsApp o enviar un reporte no activa los avisos de asistencia/resultados. Los reportes solicitados expresamente se procesan aunque esos avisos automáticos estén desactivados; si no hay conexión, esperan en la cola.
- **Archivos privados:** PNG/PDF se guardan en `DATA_DIR/whatsapp/reports`, fuera de Public, con nombres internos aleatorios y un límite de 10 MB. Incluye esa carpeta en el respaldo para conservar adjuntos y reintentos. Comunicación permite descargar el archivo del envío con una cuenta autorizada. No se admiten rutas ni URLs de archivos del navegador.
- **Reintentos:** cada intento tiene identidad estable y una respuesta perdida no duplica la cola. Si cambia el grupo del ciclo o se revoca el permiso del apoderado, se cancela el aviso pendiente. Un archivo faltante obliga a generar un reporte nuevo. Un envío incierto conserva la revisión manual antes de reenviar.

## Reconexión y avisos de estado

En cada arranque el supervisor intenta conectar Baileys con la sesión guardada, aunque los avisos automáticos estén desactivados. Si no hay sesión válida, la vinculación sigue requiriendo el QR privado de Comunicación. Esto no activa envíos automáticos.

La dashboard consulta un estado mínimo y muestra un aviso temporal en una esquina: conectando, conectado, requiere vinculación o error. El aviso se puede cerrar, desaparece por sí solo y no se repite con cada consulta mientras no cambie el estado. Los errores mantienen la indicación de revisar Baileys; la operación académica continúa.


## Notificación manual de simulacros
Desde **Simulacros**, después de validar y registrar calificaciones, Administración puede pulsar **Notificar resultados a padres** o **Notificar al grupo de WhatsApp** sin un paso previo de publicación. La primera opción avisa a cada contacto autorizado, evitando duplicados de la misma calificación; la segunda comparte solamente estadísticas generales al grupo configurado para el ciclo. Ambas acciones requieren confirmación. Un resumen grupal se puede volver a compartir tras comprobar que el envío anterior terminó; si sigue pendiente o es incierto, se bloquea otro intento. Las órdenes manuales de resultados se procesan aunque estén desactivados los avisos automáticos, sin habilitar estos últimos.


## Diagnósticos de WhatsApp y Python/OMR
Las publicaciones de resúmenes de simulacros usan textos a identificadores de grupo `@g.us`, no números telefónicos individuales. Si hay un error real, la consola del servidor muestra `[WhatsApp] Fallo de envío` y únicamente código, tipo, intento y estado. La pantalla Avisos y entregas conserva la explicación con el código técnico (sin mensajes, QR, números ni credenciales). Los fallos con entrega incierta exigen verificar con el destinatario antes de reintentar. Los mensajes de depuración rutinarios de Python/OMR permanecen silenciados; el comando `npm run omr:doctor` permite revisar su estado y `OMR_DEBUG=1` habilita logs detallados cuando sea necesario.


## Imágenes de ranking por área para grupos
Desde **Simulacros** solo aparece **Enviar ranking por área a WhatsApp**. Por cada área evaluada se genera una imagen PNG independiente (hasta 22 estudiantes por página, con continuación si es necesario). La imagen contiene puesto dentro del área, apellidos y nombres, buenas, malas, vacías y puntaje; no incluye el código del estudiante. Antes de enviar, Administración debe confirmar que el grupo está autorizado para recibir las calificaciones nominales. El envío se registra por imagen en **Avisos y entregas**, con enlace para descargarla; un mismo intento no duplica archivos y solo se puede repetir después de que el anterior termine. Los envíos individuales a padres desde Simulacros han sido retirados; los registros históricos se conservan.
