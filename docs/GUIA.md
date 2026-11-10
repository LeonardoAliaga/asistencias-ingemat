# Guía completa de INGEMAT 2.0

Este contenido también está integrado en la dashboard, con buscador, categorías y ayuda contextual.

## Primer inicio y recorrido del panel

Prepara una instalación nueva y conoce dónde está cada función.

1. **Accede con tu cuenta.** Abre /admin. La primera cuenta se llama admin. La contraseña inicial está en ADMIN_INITIAL_PASSWORD o se muestra una sola vez en la consola del servidor.
2. **Ubícate en el panel.** Resumen muestra los indicadores y accesos rápidos. El menú lateral separa Principal, Personas, Académico y Gestión. En el celular usa el botón de menú. Cada sección tiene su propia ayuda y el perfil superior abre Mi cuenta.
3. **Cambia la contraseña temporal.** En Mi cuenta (el perfil de la barra superior), completa Contraseña actual y una nueva de al menos 12 caracteres. No compartas tu cuenta entre operadores.
4. **Crea ciclos y horarios.** En Ciclos y horarios registra primero los ciclos; después establece la entrada y tolerancia para mañana y tarde.
5. **Registra usuarios.** En Estudiantes y docentes pulsa Nuevo usuario para crear una ficha. El código debe ser único. Los estudiantes necesitan ciclo y turno.
6. **Completa áreas y contactos.** En Apoderados y áreas asigna el perfil de postulación y los apoderados que recibirán avisos.
7. **Prepara la cuenta de recepción.** Crea una cuenta con rol Recepción en Cuentas y respaldo. Inicia sesión con ella en el navegador que registrará los ingresos.
8. **Prepara un simulacro de prueba.** Usa un alumno ficticio y un examen pequeño antes del primer lote real. Verifica impresión, lecturas y puntajes.

## Crear cuentas y distribuir permisos

Separa administración, corrección, docencia y recepción.

1. **Abre Cuentas y respaldo.** Solo administración puede ver esta sección.
2. **Crea una cuenta por persona.** En Operadores escribe usuario, contraseña temporal y rol. Entrega la contraseña por un canal privado.
3. **Elige el rol apropiado.** Administración configura todo. Corrección administra simulacros y lecturas. Docencia registra tareas y consulta reportes. Recepción registra y justifica asistencias y opera biblioteca.
4. **Cambia claves temporales.** Cada persona debe cambiar su contraseña desde Mi cuenta.
5. **Revoca un acceso.** Desactiva la cuenta cuando alguien deje de operar el sistema. Sus sesiones anteriores quedarán invalidadas.
6. **Consulta la auditoría.** En Cuentas y respaldo abre Actividad y auditoría para revisar quién calificó, corrigió, justificó, publicó o cambió la configuración.

## Ciclos, turnos y horarios

Organiza aulas y define cómo se calcula la puntualidad.

1. **Crea el ciclo.** En Ciclos y horarios, dentro de Ciclos académicos, escribe un nombre claro y único.
2. **Selecciona el ciclo en Horarios.** Configura hora de entrada y fin de tolerancia para cada turno.
3. **Guarda los cambios.** Llegar exactamente a la hora de entrada cuenta como puntual. Después de entrada y hasta la tolerancia cuenta como tolerancia.
4. **Asigna estudiantes.** En Estudiantes y docentes asigna cada estudiante a su ciclo y turno. El ciclo no es el área de postulación.
5. **Revisa antes de eliminar.** No elimines ciclos que siguen en uso. Primero reasigna a los estudiantes y conserva los exámenes históricos.

## Registrar, buscar y editar estudiantes o docentes

Mantén códigos e identidad consistentes.

1. **Abre Estudiantes y docentes.** Busca primero por nombre o código para evitar duplicados. La búsqueda encuentra ambos turnos. Pulsa Nuevo usuario para abrir el formulario sin salir del directorio.
2. **Completa datos.** Ingresa nombre, apellidos, rol y código. Los códigos se guardan en mayúsculas.
3. **Configura asistencia.** Para estudiantes elige ciclo, turno y días programados; para docentes define sus días.
4. **Guarda y comprueba.** Busca el usuario recién creado y verifica su carnet.
5. **Edita con cuidado.** Abre el ciclo y usa el botón de lápiz de la persona. Cambiar un código actualiza las referencias académicas. Los registros conservan sus datos históricos.
6. **Conserva el historial.** Si el usuario tiene notas o asistencias no se permite borrarlo. Cambia el ciclo cuando corresponda y conserva sus resultados.

## Carnets, códigos de barras y QR

Imprime identificaciones para acelerar la recepción.

1. **Abre Estudiantes y docentes.** Busca al estudiante y pulsa su botón de carnet. Para impresión por grupo usa la pestaña Carnets e impresión.
2. **Revisa el código.** El código impreso debe ser el mismo que utiliza la ficha del estudiante.
3. **Imprime el carnet.** Usa la opción de impresión o descarga. Conserva margen alrededor del código.
4. **Prueba el lector.** Un lector USB funciona como teclado: coloca el foco en el campo de código y escanea.
5. **Usa cámara si es necesario.** En la página de asistencia elige el lector con cámara y permite su acceso. Para usar cámara desde otro dispositivo necesitas HTTPS.
6. **No confundas las fichas.** El QR del carnet identifica al usuario; el QR de cartillas identifica un examen, versión, revisión y página.

## Usar una cuenta de recepción

Registra ingresos con una cuenta autorizada y permisos limitados.

1. **Crea una cuenta de recepción.** En Cuentas y respaldo, un administrador crea una cuenta individual con rol Recepción para el encargado.
2. **Inicia sesión.** Abre /admin e ingresa el usuario y contraseña de recepción. Cambia la contraseña inicial cuando se solicite.
3. **Abre el registro público.** En el mismo navegador, abre la página principal y pulsa Asistencias. La sesión de la cuenta autoriza el registro de ingresos.
4. **Registra y comprueba.** Escanea el carnet o escribe el código del alumno. Revisa la confirmación, hora y estado; los ingresos duplicados para el mismo turno se rechazan.
5. **Protege la cuenta.** El rol Recepción permite gestionar asistencias y biblioteca, pero no acceder a simulacros. Cierra la sesión al terminar; un administrador puede desactivar la cuenta.

## Registrar ingresos sin duplicados

Usa código, lector USB o cámara.

1. **Abre el registro.** En la página pública pulsa Asistencias o el lector con cámara. Inicia sesión antes con una cuenta de administración o recepción en el mismo navegador.
2. **Introduce el código.** Escríbelo o usa un lector USB. El sistema identifica por código, no por nombre.
3. **Comprueba el resultado.** Revisa nombre, ciclo, turno y hora. La fecha y hora se calculan en America/Lima.
4. **Evita registros repetidos.** Una segunda lectura del mismo usuario, fecha y turno informa que ya existe un ingreso.
5. **Continúa aunque falle Internet.** La asistencia se guarda en SQLite. Los avisos quedan en cola y se envían cuando WhatsApp vuelva a estar disponible.
6. **Consulta la lista.** En Asistencia filtra por fecha, ciclo y turno. Descarga Excel o pulsa Copiar imagen para pegar el reporte PNG con Ctrl+V.

- Un aviso en cola no equivale a un mensaje entregado. Consulta Comunicación para comprobar el estado.

## Justificar una tardanza

Deja un motivo y una persona responsable.

1. **Inicia sesión.** Usa una cuenta de administración o recepción.
2. **Busca el registro.** En Asistencias selecciona la fecha y el ciclo.
3. **Pulsa Justificar.** Escribe un motivo de al menos cinco caracteres y confirma.
4. **Verifica el cambio.** La fila pasa a justificada y conserva la hora original. La auditoría identifica quién hizo el cambio.
5. **Consulta el histórico anterior.** Los Excel de la versión anterior permanecen en Asistencia → Archivos históricos; las justificaciones de esos archivos se manejan en su vista previa.

## Reportes diarios y archivos históricos

Distingue los nuevos registros de los Excel anteriores.

1. **Elige fecha, ciclo y turno.** Abre Asistencia. Los filtros se aplican al listado, al Excel y a la imagen. Puedes usar Consultar para actualizar.
2. **Revisa el listado.** Los nuevos ingresos se leen directamente desde la base de datos.
3. **Descarga Excel.** Usa Descargar Excel. El archivo se genera desde los registros almacenados y no se utiliza como base de datos.
4. **Copia el reporte como imagen.** Pulsa Copiar imagen y pégala con Ctrl+V en el destino que necesites. El PNG conserva el diseño clásico: tres columnas, fuentes originales, encabezados y colores por estado. Si seleccionas varios ciclos o turnos, se muestran en secciones separadas. Incluye los ingresos registrados que corresponden a los filtros.
5. **Consulta archivos antiguos.** En Asistencia → Archivos históricos puedes abrir y descargar los Excel que existían antes de actualizar.
6. **Respalda ambos conjuntos.** Incluye la base de datos, las imágenes de lectura y la carpeta Registros en las copias de seguridad.

- La copia directa necesita un navegador compatible y permiso de portapapeles. Si el navegador la bloquea, la app descarga el PNG y te informa.
- Las imágenes usan los registros guardados; los reportes de archivos anteriores conservan su exportación dentro de Archivos históricos.

## Crear un simulacro estándar de 100 preguntas

Sigue cuatro pasos: Datos, Cursos y áreas, Claves y Revisión.

1. **Abre Simulacros.** Pulsa Nuevo examen. En Datos, el único selector Plantilla reúne las preestablecidas y las que guardaste. Elige Base de 100 preguntas para configurar sus cursos.
2. **Completa los datos.** Indica título, ciclo y fecha. El perfil GENERAL evalúa las 100 preguntas.
3. **Distribuye los cursos.** Pulsa Continuar para abrir Cursos y áreas. Edita el curso General o agrega cursos con rangos sin solapamientos: Matemática 1-20, Física 21-30 y los demás hasta 100. Cada pregunta pertenece a un único curso. El resumen inferior indica huecos, repeticiones y cantidades por área.
4. **Configura puntajes.** Los puntajes generales están visibles en Datos, separados del resto de los campos. En Cursos y áreas puedes ajustar Puntajes especiales para este curso si necesita otros valores. Las reglas se guardan con el examen.
5. **Marca las claves con botones.** Continúa a Claves. Selecciona un curso y pulsa A, B, C, D o E para la pregunta indicada; el editor avanza automáticamente. El contador de cada curso muestra tu progreso. Puedes pulsar un número para corregirlo o Ir a una pendiente. Activa Aceptar varias alternativas si una pregunta admite más de una respuesta; después pulsa Siguiente. También puedes escribir las letras A–E con el foco dentro del editor. Para cargar una lista existente abre Pegar una lista de claves y pega A B C… sin números.
6. **Guarda el borrador.** En Revisión comprueba el resumen. Guardar borrador conserva el trabajo con claves pendientes; después puedes abrir Editar borrador.
7. **Valida el examen.** Si todas las claves o reglas están completas, usa Guardar y validar. También puedes validar un borrador guardado desde Validar y preparar. Después la estructura queda fijada.
8. **Imprime y califica.** El examen tiene pestañas separadas: Resultados, Imprimir cartillas e Ingreso manual. Para lectura por lotes abre Lectura de cartillas. Comprueba las notas antes de publicar.

## Cuadernillo de 120 preguntas con 100 evaluables por área

El número impreso y el número evaluado son conceptos diferentes.

1. **Elige Simulacro tipo UNMSM.** En Simulacros pulsa Nuevo examen. En Plantilla elige Simulacro tipo UNMSM: contiene 120 preguntas impresas, 19 cursos y 100 evaluables para cada área A–E.
2. **Completa los datos.** Indica título, ciclo y fecha. Los puntajes generales están visibles en Datos; las actitudinales solo suman por acierto, sin descuento por errores o blancos.
3. **Usa la configuración establecida.** El asistente omite Cursos y áreas: sigue Datos → Claves → Revisión. La distribución queda precargada. Si deseas cambiarla, selecciona una base o Personalizado (empieza desde cero) y aparecerá ese paso.
4. **Revisa los puntajes.** Puedes ajustar los puntajes generales en Datos. El descuento cero de actitudinales se conserva. No hace falta volver a ingresar rangos ni cantidades por curso.
5. **Carga la clave del cuadernillo.** En Claves marca las alternativas con los botones A–E. El avance automático pasa al siguiente curso cuando completas el actual; usa Curso para saltar a otro y los números para revisar. También puedes abrir Pegar una lista de claves y pegar las 120 alternativas en orden. La clave del cuadernillo es única; el área del alumno determina cuáles se califican.
6. **Asigna áreas a estudiantes.** En Apoderados y áreas registra el perfil de cada postulante antes de imprimir.
7. **Valida y descarga cartillas.** La cartilla contiene 120 filas aunque la nota de un alumno utilice solo 100.
8. **Revisa por curso y área.** Los resultados muestran aciertos, errores, blancos, anuladas y puntaje por curso. El ranking comparte puesto cuando hay empate.

- La plantilla reproduce el material proporcionado por la academia; revisa su vigencia para cada examen. No contiene claves de respuesta.
- Las bases de 100 preguntas, 120 preguntas y por áreas muestran Cursos y áreas para configurar su distribución. Los exámenes que ya estaban guardados conservan sus reglas.

## Preguntas fijas frente a elegir un cupo dentro de un curso

Evita calificar preguntas que no corresponden o seleccionar las mejores respuestas.

1. **Preguntas fijas.** Selecciona Fijas cuando el reglamento indica exactamente qué números debe responder cada área. El cupo coincide con la cantidad seleccionada.
2. **Elección dentro del curso.** Selecciona Elegir cupo cuando el alumno puede responder, por ejemplo, 10 de 15 preguntas elegibles.
3. **Define elegibles y cupo.** Escribe los números elegibles y la cantidad máxima que se evaluará.
4. **Menos respuestas que el cupo.** Los lugares faltantes se cuentan como blancos de ese curso.
5. **Más respuestas que el cupo.** La calificación se detiene. Revisa el reglamento y las marcas antes de continuar. Nunca se seleccionan automáticamente las respuestas más favorables.
6. **Marcas dobles.** Una marca doble confirmada consume un lugar del cupo y se trata como incorrecta con la penalización que corresponda.

## Preguntas sin descuento, anuladas y actitudinales

Aplica excepciones de puntaje de forma explícita.

1. **Sin descuento.** En Simulacro tipo UNMSM, las actitudinales (1–10) ya tienen correcta +20, incorrecta 0 y blanco 0. Para otras excepciones usa Preguntas sin penalización. Después de registrar respuestas, puedes cambiar esas reglas desde Revisar claves y reglas y recalcular automáticamente.
2. **Anular una pregunta.** Indica los números anulados y elige Otorgar puntos o Excluir del puntaje. El resultado registra la anulación por separado.
3. **Puntaje por alternativa.** En el bloque de puntajes por alternativa pega número,A,B,C,D,E; por ejemplo 15,20,15,10,5,0. Esta regla sirve cuando todas las alternativas tienen un valor propio.
4. **Configura el blanco.** El puntaje por blanco pertenece a la regla del curso. Una marca doble sigue siendo inválida.
5. **Valida antes de usar.** Revisa un ejemplo conocido y compara el desglose por pregunta y por curso con el cálculo manual.

## Versiones A/B de un cuadernillo

Relaciona el orden impreso con las preguntas originales.

1. **Crea la versión principal.** A utiliza el orden original, por ejemplo 1-100.
2. **Agrega otra versión.** En Versiones escribe el código y el orden de preguntas originales; por ejemplo B:51-100,1-50.
3. **Incluye todos los números una vez.** Cada versión debe contener todas las preguntas del cuadernillo sin duplicados.
4. **Imprime la versión correcta.** Elige la versión al descargar cartillas. El QR guarda esa selección.
5. **Importa respuestas impresas.** La captura usa los números que ve el estudiante; el motor los transforma al orden original antes de aplicar cursos y claves.

- Esta versión cambia el orden de preguntas, no el orden de alternativas A-E dentro de una pregunta.

## Elegir y guardar plantillas de simulacros

Un solo selector Plantilla en Datos; Guardar como plantilla en Revisión.

1. **Elige en Datos.** El selector Plantilla contiene Simulacro tipo UNMSM, las bases y Mis plantillas. UNMSM ya tiene la distribución establecida y omite Cursos y áreas.
2. **Completa o adapta.** Indica título, ciclo y fecha. Para configurar cursos o áreas propios, elige Personalizado o una de las bases. Carga las claves y excepciones.
3. **Guarda en Revisión.** Escribe Nombre de la plantilla y pulsa Guardar como plantilla. Es independiente de Guardar borrador o Guardar y validar. Se admiten claves pendientes.
4. **Reutiliza en otro examen.** Pulsa Nuevo examen y selecciona la plantilla dentro de Mis plantillas. Revisa los datos y reemplaza las claves por las del nuevo cuadernillo. Cargar una plantilla no cambia las notas de otro examen.
5. **Conserva las reglas del examen.** Después de guardar, el simulacro conserva una copia de su configuración. Las actualizaciones de una plantilla no cambian exámenes existentes. Usa Revisar claves y reglas para corregir notas ya registradas con motivo e historial.

## Generar cartillas por curso y elegir tamaño de impresión

Cuarto de A4 a doble cara o media A4 a una cara, siempre con cartillas horizontales.

1. **Valida el examen.** Solo un examen listo o publicado puede generar cartillas. La distribución por cursos y preguntas viene de su configuración.
2. **Elige identificación.** En Simulacros selecciona el examen y abre Imprimir cartillas. La opción El alumno completa sus datos y código deja apellidos, nombres y área para escribir; incluye ocho casillas y ocho columnas de círculos del 0 al 9. Los alumnos necesitan códigos registrados de exactamente ocho dígitos; los ceros iniciales se conservan. Los nombres manuscritos son una referencia visual, no se leen por OCR.
3. **Elige tamaño y cantidad.** Cuarto de A4 horizontal, doble cara coloca cuatro cartillas en una hoja A4 horizontal; frente y reverso se vinculan por QR y su posición se ajusta al borde de volteo elegido. Media A4 horizontal, una cara coloca dos cartillas en una hoja A4 vertical y contiene todas las respuestas en el frente. Indica la cantidad de cartillas, no la cantidad de hojas; los espacios sobrantes quedan vacíos. En media hoja caben las 120 preguntas en esa única cara; cuarto las reparte entre frente y reverso.
4. **Imprime al 100%.** El PDF ya incluye varias cartillas por hoja. No actives dos o cuatro páginas por hoja ni ajustar al papel. Para cuarto usa doble cara, borde corto por defecto; para media desactiva la doble cara. La pantalla indica orientación, hojas y páginas. Las preferencias del PDF son una sugerencia: comprueba el diálogo y haz una impresión de prueba.
5. **Explica cómo completar.** El alumno escribe y marca el mismo código, rellena un círculo por columna y una sola área. Rellena las respuestas según el área del examen. Las preguntas aparecen en pequeños bloques por curso; cont. indica que el mismo curso continúa en otra columna o cara. No dibujes sobre marcadores o QR.
6. **Conserva los QR y revisa la lectura.** Cada cartilla tiene QR único. No fotocopies una sola para varios alumnos; genera la cantidad necesaria. El QR nuevo vincula examen, versión y cara; el alumno se identifica por los círculos del código. Puedes escanear la A4 completa o las cartillas recortadas en el cristal; para cuarto incluye ambas caras en el mismo lote. Un código o área dudoso queda pendiente de revisión, nunca se adivina.

- El formato anterior QR por estudiante permanece disponible para cartillas A4 personalizadas y cuadernillos de más de 120 preguntas. Sus impresiones existentes siguen siendo legibles.
- La disposición compacta admite hasta cinco áreas de un carácter o un único perfil general. Antes de imprimir un salón completo, prueba papel, márgenes y calidad de lectura.

## Escanear un salón completo con alimentador automático

Ruta recomendada para ahorrar trabajo repetitivo.

1. **Prepara el escáner.** Usa alimentador automático (ADF), 300 ppp y PDF multipágina. Empieza con escala de grises y desactiva filtros que borren marcas tenues.
2. **Revisa el papel.** Quita grapas, separa hojas pegadas y comprueba que todas tengan QR y cuatro marcadores.
3. **Escanea el lote.** No es necesario ordenar por estudiante: las cartillas personalizadas se identifican por QR.
4. **Carga los archivos.** En Lectura de cartillas selecciona el examen y carga PDF, PNG o JPG. Se admiten hasta 10 archivos de 20 MB y 100 páginas por lote.
5. **Espera el procesamiento.** El estado pasa de En cola a Procesando, después a Listo o Revisar. Puedes actualizar sin volver a cargar.
6. **Resuelve incidencias.** Revisa marcas dobles, tenues, identificadores desconocidos y páginas faltantes.
7. **Comprueba la previsualización.** Revisa estudiante, área y puntaje antes de confirmar la importación.
8. **Confirma el lote.** Las notas se guardan juntas. Si un error impide calificar, el lote no se importa parcialmente.

## Escanear desde NAPS2

Añade capturas desde el cristal o el alimentador y envíalas juntas al lector OMR.

1. **Instala y prueba el escáner.** En la computadora que ejecuta INGEMAT instala NAPS2 y el controlador de escáner Brother. Comprueba una captura desde NAPS2. Si la instalación está fuera de las carpetas habituales, define NAPS2_BIN con la ruta de NAPS2.Console.exe y reinicia INGEMAT. El comando npm run scanner:doctor busca equipos sin iniciar un escaneo.
2. **Conecta y selecciona.** Abre Lectura de cartillas y selecciona un examen listo. Pulsa Buscar escáneres. Se usa WIA inicialmente; si el equipo no aparece, selecciona TWAIN y vuelve a buscar. El escáner debe estar accesible desde la PC del servidor, aunque abras el panel desde otro dispositivo.
3. **Prepara el papel.** Para Brother MFC-T920DW usa Cristal con los cuartos recortados; su alimentador requiere al menos 148 × 148 mm. Elige A4 para el área completa del cristal o A5 para media hoja. El alimentador admite hasta 20 hojas y escanea una cara; para los cuartos debes voltear manualmente y capturar ambos lados. Se fija 300 ppp en escala de grises.
4. **Escanea y añade.** Pulsa Escanear y añadir y espera a que aparezca Lista para procesar. Abre Ver PDF para comprobar que están el QR y los cuatro marcadores. Cambia o voltea el papel y repite; la bandeja conserva hasta diez capturas listas por examen y operador, incluso al recargar. Puedes cancelar un escaneo o quitar una captura terminada.
5. **Recupera una conexión interrumpida.** Si se pierde la respuesta, pulsa Verificar captura pendiente o Verificar envío pendiente. Se reutiliza el mismo identificador y no se repite una orden ya recibida. Si se reinicia el servidor durante la captura se marca Fallida; comprueba el escáner y solicita una nueva captura manualmente.
6. **Procesa y confirma.** Pulsa Procesar capturas para crear un único lote OMR. Su estado aparece debajo del escáner, antes del historial. Corrige las incidencias y confirma la importación. Los archivos originales del lote se conservan; las notas solo se guardan tras esa confirmación.

- Una sesión individual de NAPS2 genera un PDF de hasta 20 MB. Divide las pilas grandes; el lector admite hasta 100 caras de cartilla por lote.
- También puedes cargar PDF, PNG o JPG escaneados previamente desde el apartado de archivos.
- Lotes recientes usa un selector compacto. Limpiar finalizados oculta de tu lista los lotes importados o fallidos; Restaurar lista los vuelve a mostrar. Los pendientes permanecen visibles y no se borran archivos, notas ni auditoría.
- Limpiar intentos fallidos retira capturas fallidas o canceladas de tu examen y usuario. Conserva las capturas listas y las solicitudes activas. Los apartados Cargar PDF o imágenes e Importar CSV están al final de la sección.

## Resolver marcas dobles, dudosas y hojas no reconocidas

Corrige la lectura sin perder su evidencia original.

1. **Abre el lote.** Las incidencias se muestran junto al archivo y la página correspondiente.
2. **Abre Revisar.** Compara las alternativas detectadas con la imagen normalizada.
3. **Resuelve cada duda.** Elige A-E, blanco o confirma una marca doble inválida. No conviertas una marca tenue en blanco sin inspeccionarla.
4. **Escribe un motivo.** La revisión conserva las respuestas detectadas inicialmente y registra al operador.
5. **Excluye páginas ilegibles.** Si el QR no se puede reconocer, excluye esa página con motivo y vuelve a escanear la cartilla. No asignes un estudiante por suposición.
6. **Comprueba páginas y duplicados.** No se permite importar dos veces la misma página. Un alumno con varias páginas necesita el conjunto completo.
7. **Confirma cuando esté listo.** Una lectura dudosa pendiente impide cerrar el lote. Las marcas dobles confirmadas se califican conforme a la regla del examen.

- En una cartilla con código marcado, revisa también la identificación: las ocho casillas muestran lo leído por columna. Un ? indica Sin marca, Revisar o Varias marcas. El lector busca relleno interior y separa los números y letras impresos, tanto en el código como en el área. La lectura original del área indica la opción reconocida, Sin marca, Revisar marca tenue o incompleta o Varias marcas. El código debe existir en el padrón y el área debe ser válida. El lote y la revisión muestran los apellidos, nombres y código del estudiante encontrado en el padrón del examen, incluso si falta resolver el área o el reverso. Mostrar un nombre no habilita la importación si hay incidencias. Si editas el código, el nuevo estudiante se verifica al confirmar la revisión. Si corriges a mano el código o el área, compara con la imagen, indica el motivo y confirma la revisión. El lector original y sus densidades se conservan.
- Las respuestas usan una lectura más estricta del relleno interior: los puntos pequeños no se consideran una alternativa ni crean una falsa marca doble. Una marca parcial significativa o muy tenue pasa a revisión. Rellena los círculos de forma uniforme; el código y el área conservan su lectura independiente. Procesa un lote nuevo para aplicar este análisis a un escaneo anterior.

## Importar respuestas desde CSV u otro lector OMR

Aprovecha lectores externos conservando el motor de calificación de INGEMAT.

1. **Descarga la plantilla.** Selecciona el examen y pulsa Plantilla CSV.
2. **Conserva las columnas.** Usa codigo,area,version y todas las preguntas 1,2,... hasta el final del cuadernillo.
3. **Completa respuestas.** Cada celda contiene A-E. Un blanco se deja vacío. Una marca doble usa A B o A/B según el formato exportado que adaptes.
4. **Exporta UTF-8.** El separador es coma. Si tu programa usa punto y coma, conviértelo antes de cargarlo.
5. **Carga y previsualiza.** El sistema verifica alumnos, ciclos, áreas, versiones y códigos repetidos.
6. **Confirma la importación.** No se toma la nota de otro programa: INGEMAT recalcula desde las respuestas para aplicar sus reglas por área.

## Registrar o corregir respuestas manualmente

También sirve como alternativa cuando una hoja no se puede escanear.

1. **Selecciona el examen y estudiante.** En Simulacros selecciona un examen listo y abre la pestaña Ingreso manual. Selecciona al estudiante por nombre o código.
2. **Confirma área y versión.** Estos datos determinan qué preguntas se evalúan.
3. **Pega las respuestas.** Puedes escribir una secuencia o líneas 1,A; 2,-; 3,A/B. El guion representa blanco.
4. **Guarda y comprueba.** Pulsa Calificar y guardar. Abre Resultados y consulta Cursos e historial para comprobar el desglose antes de publicar.
5. **Corrige un registro existente.** En Ingreso manual despliega Corregir una calificación anterior, activa Corregir una calificación existente y explica el motivo. El registro anterior queda en el historial. Si ya estaba publicado, vuelve a Listo. Comprueba y publica de nuevo; los avisos pendientes de la nota anterior se cancelan.
6. **Consulta la trazabilidad.** La revisión de claves, el operador, la fecha y el origen de la captura acompañan la nota.

## Corregir una clave y recalcular todas las notas

Las revisiones no borran el resultado anterior.

1. **Abre el examen.** Selecciona un simulacro listo o publicado y pulsa Revisar claves y reglas. Los borradores se editan con Editar borrador.
2. **Carga la clave corregida.** Puedes corregir las alternativas, preguntas sin penalización, anulaciones y puntajes por alternativa. El selector Conservar reglas actuales mantiene las políticas de anulación existentes; evita sustituir una exclusión por puntos sin querer.
3. **Escribe un motivo.** Por ejemplo: Corrección de clave oficial en pregunta 42.
4. **Confirma el recálculo.** Se crea una revisión y se recalifican todas las respuestas guardadas en una transacción.
5. **Revisa diferencias.** Comprueba los resultados por alumno y curso. El historial conserva las notas previas.
6. **Publica otra vez.** La revisión vuelve a estado Listo. Publica cuando termines de verificar.
7. **Gestiona avisos anteriores.** Los avisos pendientes de las notas anteriores se cancelan. Los mensajes ya entregados no se pueden retirar. Publica la revisión correcta y genera sus nuevos avisos conscientemente.

- Al confirmar, se recalculan todas las respuestas registradas, también las ingresadas manualmente, y se actualiza el ranking. Se conserva el historial; un examen publicado vuelve a Listo para revisar y publicar nuevamente.
- Las versiones A/B son órdenes de preguntas, no revisiones de notas. En B:51-100,1-50, la pregunta 1 impresa usa la clave original 51. El orden queda fijado al validar; para cambiarlo crea otro simulacro. Las cartillas ya impresas siguen usando su versión original.

## Ranking, publicación y avisos de resultados

Revisa antes de comunicar.

1. **Consulta resultados.** Filtra por área y revisa el desglose por curso.
2. **Interpreta empates.** Dos estudiantes con el mismo puntaje comparten puesto. El orden secundario por código solo facilita la consulta.
3. **Exporta el cuadro.** Usa el Excel de ranking o los reportes individuales de Reportes.
4. **Publica.** Pulsa Publicar cuando hayas comprobado claves y lecturas. Publicar no envía mensajes automáticamente.
5. **Envía avisos si corresponde.** Con WhatsApp configurado y contactos autorizados, pulsa Notificar resultados. El envío queda en cola.
6. **Comprueba entregas.** Comunicación distingue aceptado por WhatsApp, enviado, entregado, leído y fallido.

## Registrar tareas, notas vigesimales y entregas

Consolida el trabajo semanal por curso.

1. **Abre Tareas.** Esta sección contiene el registro y la lista de tareas; los consolidados están en Reportes.
2. **Elige curso y ciclo.** Indica la semana académica de sábado a viernes y el tipo de evaluación.
3. **Agrega estudiantes.** Usa la búsqueda por nombre o código y registra nota o estado de entrega.
4. **Verifica la lista.** Revisa antes de guardar. No uses una nota cero para representar un registro que aún no has evaluado.
5. **Guarda el grupo.** El sistema conserva los registros por curso, ciclo y semana.
6. **Exporta el consolidado.** En Reportes → Consolidado semanal selecciona ciclo y semana para descargar el resumen. Revisa los NO PRESENTÓ, que incluyen alumnos sin registro individual.

## Reporte individual y consolidado semanal

Consulta simulacros y tareas de un alumno.

1. **Abre Reporte por alumno.** En Reportes, pestaña Por estudiante, usa el buscador.
2. **Selecciona al estudiante.** El sistema usa su código para recuperar historial.
3. **Filtra la semana.** La semana académica se cuenta de sábado a viernes.
4. **Comprueba el contexto.** No compares puntajes brutos entre exámenes con reglas o cantidades diferentes sin revisar sus escalas.
5. **Exporta o imprime.** Usa los botones disponibles para imagen, documento o impresión del reporte.
6. **Comparte con cuidado.** Elige el contacto autorizado. No publiques notas individuales en un grupo general por defecto.

## Catálogo, secciones, préstamos y devoluciones

Administra ejemplares sin perder trazabilidad.

1. **Crea las secciones.** En Biblioteca, Gestionar libros y secciones, añade categorías.
2. **Registra el libro.** Asigna código único, título, sección y editorial.
3. **Busca en el estante.** Filtra por título o código y comprueba disponibilidad.
4. **Presta el ejemplar.** En Control de préstamos ingresa el código del libro y del estudiante.
5. **Registra devolución.** Busca el préstamo activo y confirma el retorno.
6. **Comprueba disponibilidad.** El estado vuelve a disponible cuando corresponde. No borres un libro con préstamo activo.
7. **Corrige el catálogo.** Usa Editar para corregir título, editorial o sección sin crear códigos duplicados.

## Actualizar ciclos visuales e imágenes de ingresantes

Mantén la información pública desde el panel.

1. **Abre Página pública.** Estas opciones requieren administración.
2. **Gestiona los ciclos visibles.** Edita los títulos, descripciones y datos del ciclo público.
3. **Prepara las imágenes.** El cargador de ingresantes espera PNG o JPG, en el tamaño indicado en pantalla.
4. **Previsualiza y sube.** Usa nombres sencillos sin datos personales innecesarios.
5. **Comprueba la portada.** Abre la página pública y revisa el orden, legibilidad y recorte en celular.
6. **Retira material antiguo.** Elimina únicamente los elementos que ya no deben mostrarse.

## Vincular WhatsApp con Baileys

Vincula el teléfono; los fallos de WhatsApp quedan aislados de la operación académica.

1. **Instala el paquete.** Actualiza la rama y ejecuta npm ci. Baileys es una dependencia opcional fijada a una versión probada. npm run whatsapp:doctor comprueba que carga sin conectar una cuenta. Si falla, la app puede iniciar y mostrará Revisa el paquete Baileys y su versión.
2. **Abre Comunicación.** Inicia sesión como administrador. La única conexión disponible es Baileys. No se necesitan tokens, cuenta de API de pago, plantillas aprobadas ni webhook público.
3. **Personaliza los mensajes.** Edita los mensajes de asistencia y resultados. Conserva {nombre} y usa las variables indicadas debajo de cada campo. Guarda con los avisos desactivados mientras vinculas el teléfono.
4. **Conecta y escanea el QR.** Pulsa Conectar / Reintentar. En el teléfono de la academia abre WhatsApp → Dispositivos vinculados → Vincular un dispositivo. Escanea el QR privado del panel antes de que caduque. Este QR vincula el teléfono; es distinto al QR de las cartillas.
5. **Activa cuando esté conectado.** Comprueba el estado Conectado, marca Activar notificaciones y guarda. Vincular el teléfono no activa los avisos automáticamente. Las asistencias generan avisos para contactos autorizados; los resultados se notifican cuando lo solicitas tras publicarlos.
6. **Recupera una falla.** Si el paquete, la conexión o el proceso fallan, aparece un aviso para revisar Baileys. La app, la asistencia y las notas continúan; los avisos sin enviar se conservan. Ejecuta npm run whatsapp:doctor, revisa la versión y pulsa Conectar / Reintentar. Un envío incierto necesita comprobar la entrega antes de reenviarlo.
7. **Detén o vuelve a vincular.** Detener conexión desactiva los avisos y conserva la sesión. Volver a vincular, tras confirmar, elimina solo la sesión local de WhatsApp; después conecta y escanea otro QR. No borra asistencias, estudiantes ni calificaciones.

- Baileys se ejecuta en un proceso separado con tiempos de espera, latidos de supervisión y límite de heap. La sesión está en DATA_DIR/whatsapp/baileys-auth.db, separada de la base académica.
- Es una biblioteca no oficial sujeta a cambios de WhatsApp. La aplicación no instala actualizaciones arbitrarias ni reinicia indefinidamente un proceso que falla. Consulta docs/WHATSAPP.md y docs/ARQUITECTURA.md.

## Áreas y apoderados que reciben avisos

Cada alumno puede tener varios contactos autorizados.

1. **Busca al estudiante.** Abre Apoderados y áreas.
2. **Asigna su área.** Debe coincidir con el código configurado en el examen. Guarda antes de imprimir cartillas.
3. **Agrega un contacto.** Indica nombre del apoderado y teléfono internacional, por ejemplo +51900111222.
4. **Registra autorización.** Activa Autorizó recibir avisos únicamente cuando tengas esa autorización.
5. **Revisa destinatarios.** Un contacto sin autorización o desactivado no recibe mensajes.
6. **Revoca cuando se solicite.** Usa Revocar. El contacto deja de participar en los siguientes avisos.

## Reintentos, mensajes fallidos y entrega

La cola conserva avisos y distingue entrega confirmada de un resultado incierto.

1. **Consulta la cola.** En Comunicación, Avisos y entregas muestra destinatario, tipo, estado y detalle. Actualizar refresca la tabla sin reenviar.
2. **Pendiente.** El aviso espera a que WhatsApp esté conectado y los envíos activados. No depende de que la asistencia o la calificación vuelvan a guardarse.
3. **Aceptado y enviado.** El componente de WhatsApp aceptó el mensaje o confirmó su envío al servidor. Esto no equivale a entrega al teléfono.
4. **Entregado y leído.** Se muestran cuando WhatsApp comunica las confirmaciones disponibles. Los eventos repetidos o fuera de orden no hacen retroceder un estado confirmado.
5. **Fallido o por comprobar.** Revisa el detalle y el aviso del paquete. Si el proceso cayó después de intentar enviar, el estado es Por comprobar. Verifica con el destinatario que no llegó antes de confirmar un reintento.
6. **Avisos históricos.** Los avisos de la integración anterior se conservan solo para consulta y no se reproducen automáticamente por Baileys. La actualización desactiva aquella configuración; los nuevos envíos se activan tras vincular el teléfono.

- Una autorización revocada cancela avisos pendientes. Corregir una nota cancela los avisos obsoletos y requiere volver a publicar antes de notificar.

## Avisos individuales y reportes para grupos

Esta interfaz envía avisos a contactos individuales autorizados.

1. **Identifica el destinatario.** Los avisos automáticos de esta versión utilizan los contactos individuales registrados por estudiante.
2. **Prepara el reporte del grupo.** Descarga el reporte o la imagen de asistencia con los filtros correctos.
3. **Comparte desde WhatsApp.** Abre el grupo correspondiente en tu teléfono o WhatsApp y adjunta el archivo manualmente.
4. **Conserva la privacidad.** Comprueba que el grupo y el contenido correspondan al salón antes de compartir los resultados.
5. **Comprueba el envío.** La app no recibe confirmaciones de un archivo que compartes manualmente en un grupo. Comprueba el chat y evita adjuntar el mismo reporte varias veces.

- Baileys admite más capacidades, pero esta implementación no incorpora selección ni automatización de grupos.

## Crear y comprobar copias de seguridad

Protege la información y prueba una restauración antes de necesitarla.

1. **Crea una copia consistente.** En Cuentas y respaldo abre Copias de seguridad y pulsa Crear copia de seguridad. Se utiliza una instantánea de SQLite compatible con WAL.
2. **Descarga la copia.** Guárdala en un destino protegido fuera del equipo de recepción.
3. **Incluye archivos asociados.** Copia también data/imports y data/scanner (capturas pendientes), los Excel históricos de Registros y session-secret.key. Esta clave permite validar los QR ya impresos.
4. **Guarda la configuración en privado.** Respalda .env por un canal seguro. Nunca lo subas a GitHub.
5. **Prueba en una instalación separada.** Detén esa copia de prueba, restaura el respaldo y comprueba usuarios, notas, asistencias e imágenes.
6. **No sobrescribas una app activa.** Para restaurar la instalación real sigue el procedimiento del README y conserva primero la versión que vas a reemplazar.

## Actualizar una instalación existente a v2

Mantén los datos de trabajo fuera del código fuente.

1. **Respalda antes de cambiar.** Copia data y Registros con la app detenida o usa el mecanismo de respaldo apropiado.
2. **Instala los requisitos.** Usa Node 24 LTS o Node 26 LTS, npm ci y Python con src/omr/requirements.txt. En Windows PYTHON_BIN puede apuntar al ejecutable del entorno virtual.
3. **Configura el primer administrador.** Define ADMIN_INITIAL_PASSWORD antes del primer arranque v2; la contraseña anterior en JSON ya no se importa como credencial.
4. **Arranca una sola instancia.** La aplicación crea una copia previa a la migración y aplica cambios de esquema. No ejecutes varios procesos de PM2 para esta instalación SQLite.
5. **Comprueba el histórico.** Los usuarios, notas y archivos existentes se conservan localmente. Los exámenes anteriores se consultan como históricos y no se recalifican sin estructura v2.
6. **Prueba funciones.** Verifica acceso, asistencia, un simulacro pequeño, impresión y lectura antes de comenzar la jornada.
7. **Configura WhatsApp de nuevo.** Las sesiones LocalAuth anteriores no se utilizan. Vincula el teléfono con Baileys en Comunicación y revisa los contactos autorizados.

## Resolver problemas frecuentes

Pistas para recuperar el flujo sin perder datos.

1. **No puedo iniciar sesión.** Comprueba usuario, contraseña y que la cuenta esté activa. Tras muchos intentos espera 15 minutos. La recuperación administrativa está documentada en el README.
2. **No puedo registrar un ingreso.** Inicia sesión con una cuenta de administración o recepción. Revisa el código y si ya existe un registro para el turno.
3. **El examen no valida.** Comprueba claves faltantes, cursos solapados, huecos y suma de preguntas por cada área.
4. **El lector no inicia.** Ejecuta npm run omr:doctor en la carpeta del proyecto. Muestra el Python efectivo y comprueba cada dependencia, incluida ArUco. Revisa las líneas [OMR] de la consola donde arrancaste la app; al procesar un lote muestran el error original, stderr y código de salida. Tras cambiar el .env reinicia la app.
5. **No reconoce la hoja.** Usa una cartilla v2 completa, 300 ppp, cuatro marcadores visibles y QR nítido. Los formatos antiguos no se leen con la nueva plantilla.
6. **El lote tiene incidencias.** Abre Revisar. Resuelve las marcas dudosas, páginas repetidas o faltantes antes de confirmar.
7. **No llegan avisos.** Comprueba contactos autorizados, mensajes guardados, conexión del teléfono y avisos activados. Si aparece Revisa el paquete Baileys y su versión, ejecuta npm run whatsapp:doctor y reintenta la conexión. Las asistencias y notas se conservan.
8. **La sesión cambió.** Actualiza la página e inicia sesión de nuevo. Un cambio de contraseña, desactivación de la cuenta puede invalidarla.
