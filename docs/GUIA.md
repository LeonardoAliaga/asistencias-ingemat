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
7. **Vincula recepción.** En Asistencia abre Vincular un punto de recepción y genera un código para cada equipo. En la página pública usa Vincular punto de asistencia.
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

## Vincular un punto de asistencia

Autoriza un equipo de recepción sin darle acceso a las notas.

1. **Genera el código.** Una cuenta administradora abre Asistencia, despliega Vincular un punto de recepción y pulsa Generar código de recepción.
2. **Abre la página pública en recepción.** Usa el botón Vincular punto de asistencia de la esquina inferior e ingresa el código. El navegador conserva una sesión de ocho horas.
3. **Registra un código de prueba.** Escanea un carnet o escribe su código y comprueba la hora y el estado.
4. **Protege el equipo.** El punto vinculado solo registra asistencias. Las justificaciones requieren una cuenta autorizada.
5. **Renueva cuando corresponda.** Si borras las cookies o expira la sesión, vuelve a vincular. Rotar el código invalida los puntos anteriores.

## Registrar ingresos sin duplicados

Usa código, lector USB o cámara.

1. **Abre el registro.** En la página pública pulsa Asistencias o el lector con cámara. El equipo debe estar vinculado, o debes iniciar sesión con un rol autorizado.
2. **Introduce el código.** Escríbelo o usa un lector USB. El sistema identifica por código, no por nombre.
3. **Comprueba el resultado.** Revisa nombre, ciclo, turno y hora. La fecha y hora se calculan en America/Lima.
4. **Evita registros repetidos.** Una segunda lectura del mismo usuario, fecha y turno informa que ya existe un ingreso.
5. **Continúa aunque falle Internet.** La asistencia se guarda en SQLite. Los avisos quedan en cola y se envían cuando la conexión oficial vuelva a estar disponible.
6. **Consulta la lista.** En Asistencias filtra por fecha y ciclo; exporta el Excel para compartir el registro.

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

1. **Elige fecha y ciclo.** Abre Asistencias y aplica los filtros.
2. **Revisa el listado.** Los nuevos ingresos se leen directamente desde la base de datos.
3. **Descarga Excel.** Usa Exportar Excel. El archivo se genera desde los registros almacenados y no se utiliza como base de datos.
4. **Consulta archivos antiguos.** En Asistencia → Archivos históricos puedes abrir y descargar los Excel que existían antes de actualizar.
5. **Respalda ambos conjuntos.** Incluye la base de datos, las imágenes de lectura y la carpeta Registros en las copias de seguridad.

## Crear un simulacro estándar de 100 preguntas

Sigue cuatro pasos: Datos, Cursos y áreas, Claves y Revisión.

1. **Abre Simulacros.** Pulsa Nuevo examen. En el paso Datos elige Estándar de 100 preguntas. Las opciones avanzadas permanecen plegadas.
2. **Completa los datos.** Indica título, ciclo y fecha. El perfil GENERAL evalúa las 100 preguntas.
3. **Distribuye los cursos.** Pulsa Continuar para abrir Cursos y áreas. Edita el curso General o agrega cursos con rangos sin solapamientos: Matemática 1-20, Física 21-30 y los demás hasta 100. Cada pregunta pertenece a un único curso. El resumen inferior indica huecos, repeticiones y cantidades por área.
4. **Configura puntajes.** Los valores iniciales están en Puntajes del simulacro, dentro de Datos. Abre Puntajes especiales para este curso si un curso necesita valores diferentes. En Ajustes de puntaje para todos los cursos puedes reaplicar los valores generales.
5. **Pega las claves.** Continúa a Claves. Pega una secuencia A B C… o líneas 1,A y 2,C. El contador indica cuántas claves llevas. Las anulaciones, puntajes por alternativa y versiones están en opciones desplegables.
6. **Guarda el borrador.** En Revisión comprueba el resumen. Guardar borrador conserva el trabajo con claves pendientes; después puedes abrir Editar borrador.
7. **Valida el examen.** Si todas las claves o reglas están completas, usa Guardar y validar. También puedes validar un borrador guardado desde Validar y preparar. Después la estructura queda fijada.
8. **Imprime y califica.** El examen tiene pestañas separadas: Resultados, Imprimir cartillas e Ingreso manual. Para lectura por lotes abre Lectura de cartillas. Comprueba las notas antes de publicar.

## Cuadernillo de 120 preguntas con 100 evaluables por área

El número impreso y el número evaluado son conceptos diferentes.

1. **Elige formato por áreas.** En Simulacros pulsa Nuevo examen. En Datos elige Por áreas: 120 impresas / 100 evaluables. Continúa a Cursos y áreas; despliega Áreas y cantidad evaluable para ajustar códigos, nombres y cantidades según tu reglamento y pulsa Aplicar perfiles a los cursos.
2. **Asigna cursos.** Abre cada curso para definir su nombre y números; distribuye las 120 preguntas, sin huecos ni repeticiones. Los otros cursos pueden permanecer plegados.
3. **Configura la matriz de áreas.** En cada curso usa Configurar área de postulación para elegir un perfil y define sus preguntas. Cambia de área para completar las demás. Usa rangos como 1-10,15,18-20. Las preguntas no aplicables no se cuentan como blancos.
4. **Comprueba los totales.** El resumen inferior de Cursos y áreas muestra las cantidades asignadas a cada perfil. Su suma debe coincidir exactamente con la cantidad evaluable; corrige las diferencias antes de continuar.
5. **Carga la clave del cuadernillo.** Incluye las 120 claves. La selección por área es independiente de la clave.
6. **Asigna áreas a estudiantes.** En Apoderados y áreas registra el perfil de cada postulante antes de imprimir.
7. **Valida y descarga cartillas.** La cartilla contiene 120 filas aunque la nota de un alumno utilice solo 100.
8. **Revisa por curso y área.** Los resultados muestran aciertos, errores, blancos, anuladas y puntaje por curso. El ranking comparte puesto cuando hay empate.

- Las distribuciones de demostración no representan un reglamento oficial. Configura las reglas reales de tu academia.

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

1. **Sin descuento.** Introduce los números en Preguntas sin penalización. Una respuesta incorrecta conserva cero puntos para esas preguntas.
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

## Reutilizar formatos sin repetir la configuración

Guarda cursos y matriz de áreas como una plantilla.

1. **Prepara el diseño.** Completa perfiles, cursos, puntajes y cantidades.
2. **Guarda una plantilla.** En el editor abre Reutilizar una plantilla o un archivo de configuración. Usa Guardar como plantilla y escribe un nombre identificable. Puedes guardar una estructura con claves pendientes.
3. **Crea el siguiente examen.** Crea un nuevo examen y despliega Reutilizar una plantilla o un archivo de configuración. Selecciona la plantilla, cambia título, ciclo y fecha y pega las nuevas claves.
4. **Revisa las reglas.** No asumas que el formato del examen anterior sigue vigente.
5. **Exporta o importa estructura.** Usa el archivo JSON de estructura para llevar una configuración completa entre instalaciones. El archivo no contiene notas de estudiantes.

## Imprimir cartillas personalizadas

El QR elimina la selección manual de estudiante, área y versión.

1. **Valida el examen.** Solo un examen listo o publicado puede generar cartillas.
2. **Revisa el padrón.** Cada alumno debe pertenecer al ciclo y tener un área válida. Para un examen general no se requiere un perfil adicional.
3. **Elige alcance y versión.** En Simulacros selecciona el examen y abre Imprimir cartillas. Elige todo el ciclo o un estudiante concreto y la versión; pulsa Descargar PDF de cartillas.
4. **Imprime A4 horizontal al 100%.** No recortes las esquinas ni el QR. Usa papel blanco y prueba primero una hoja.
5. **Comprueba identificación.** La hoja muestra alumno, código, área, versión, revisión y número de página.
6. **Explica cómo marcar.** Rellenar una burbuja por pregunta, borrar completamente y no dibujar sobre los marcadores.
7. **Conserva todas las páginas.** Los cuadernillos de más de 120 preguntas generan varias páginas y se agrupan por QR.

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

## Fotografiar cartillas con celular

Alternativa para pocos alumnos o para repetir una hoja problemática.

1. **Usa la cartilla v2.** Las fichas anteriores no tienen los marcadores ni el QR del nuevo lector.
2. **Coloca la hoja plana.** Usa luz uniforme, evita sombras y reflejos y mantén visibles las cuatro esquinas.
3. **Toma una foto nítida.** Incluye toda la hoja. No envíes una captura comprimida de mensajería.
4. **Carga PNG o JPG.** En Lectura de cartillas selecciona las fotos desde el dispositivo.
5. **Revisa el resultado.** Una foto dudosa no debe aceptarse por intuición: repítela o revisa las marcas junto a la imagen.
6. **Compara el tiempo total.** Para varios salones el alimentador automático suele reducir más la manipulación que fotografiar una hoja a la vez.

## Resolver marcas dobles, dudosas y hojas no reconocidas

Corrige la lectura sin perder su evidencia original.

1. **Abre el lote.** Las incidencias se muestran junto al archivo y la página correspondiente.
2. **Abre Revisar.** Compara las alternativas detectadas con la imagen normalizada.
3. **Resuelve cada duda.** Elige A-E, blanco o confirma una marca doble inválida. No conviertas una marca tenue en blanco sin inspeccionarla.
4. **Escribe un motivo.** La revisión conserva las respuestas detectadas inicialmente y registra al operador.
5. **Excluye páginas ilegibles.** Si el QR no se puede reconocer, excluye esa página con motivo y vuelve a escanear la cartilla. No asignes un estudiante por suposición.
6. **Comprueba páginas y duplicados.** No se permite importar dos veces la misma página. Un alumno con varias páginas necesita el conjunto completo.
7. **Confirma cuando esté listo.** Una lectura dudosa pendiente impide cerrar el lote. Las marcas dobles confirmadas se califican conforme a la regla del examen.

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

1. **Abre el examen.** Selecciona Revisar claves.
2. **Carga la clave corregida.** Puedes cambiar alternativas, anular preguntas o configurar puntajes por alternativa.
3. **Escribe un motivo.** Por ejemplo: Corrección de clave oficial en pregunta 42.
4. **Confirma el recálculo.** Se crea una revisión y se recalifican todas las respuestas guardadas en una transacción.
5. **Revisa diferencias.** Comprueba los resultados por alumno y curso. El historial conserva las notas previas.
6. **Publica otra vez.** La revisión vuelve a estado Listo. Publica cuando termines de verificar.
7. **Gestiona avisos anteriores.** Los avisos pendientes de las notas anteriores se cancelan. Los mensajes ya entregados no se pueden retirar. Publica la revisión correcta y genera sus nuevos avisos conscientemente.

## Ranking, publicación y avisos de resultados

Revisa antes de comunicar.

1. **Consulta resultados.** Filtra por área y revisa el desglose por curso.
2. **Interpreta empates.** Dos estudiantes con el mismo puntaje comparten puesto. El orden secundario por código solo facilita la consulta.
3. **Exporta el cuadro.** Usa el Excel de ranking o los reportes individuales de Reportes.
4. **Publica.** Pulsa Publicar cuando hayas comprobado claves y lecturas. Publicar no envía mensajes automáticamente.
5. **Envía avisos si corresponde.** Con WhatsApp configurado y contactos autorizados, pulsa Notificar resultados. El envío queda en cola.
6. **Comprueba entregas.** Comunicación distingue aceptado por Meta, enviado, entregado, leído y fallido.

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

## Configurar WhatsApp Business Platform

Sustituye las sesiones de navegador por una integración oficial.

1. **Prepara la cuenta de Meta.** Necesitas un portafolio empresarial, una WhatsApp Business Account y un número habilitado para Cloud API. Empieza con el número de prueba de Meta.
2. **Configura el servidor.** Completa WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_API_VERSION, WHATSAPP_APP_SECRET y WHATSAPP_VERIFY_TOKEN en .env. El token se queda en el servidor.
3. **Publica el webhook.** Meta debe acceder por HTTPS a /webhooks/whatsapp. Una instalación solo en localhost necesita un endpoint público o un despliegue con HTTPS.
4. **Suscribe eventos de mensajes.** Configura el token de verificación y los eventos de mensajes y estados en Meta. Los POST se validan con la firma del App Secret.
5. **Crea las plantillas.** Asistencia: nombre, fecha, hora, estado. Resultados: nombre, examen, puntaje, área. Solicita su aprobación y usa exactamente el código de idioma aprobado.
6. **Completa Comunicación.** Introduce nombres de plantillas e idioma. Activa los avisos cuando el estado indique credenciales completas.
7. **Registra contactos autorizados.** En Apoderados y áreas agrega teléfonos internacionales y registra su autorización para recibir los avisos.
8. **Haz una prueba controlada.** Registra un ingreso de un alumno de prueba y comprueba el estado real de entrega antes de usarlo con toda la academia.

- La API oficial tiene tarifas y reglas de plantillas. Consulta los costos vigentes para Perú. La aplicación no solicita ni muestra tokens en el navegador.

## Áreas y apoderados que reciben avisos

Cada alumno puede tener varios contactos autorizados.

1. **Busca al estudiante.** Abre Apoderados y áreas.
2. **Asigna su área.** Debe coincidir con el código configurado en el examen. Guarda antes de imprimir cartillas.
3. **Agrega un contacto.** Indica nombre del apoderado y teléfono internacional, por ejemplo +51900111222.
4. **Registra autorización.** Activa Autorizó recibir avisos únicamente cuando tengas esa autorización.
5. **Revisa destinatarios.** Un contacto sin autorización o desactivado no recibe mensajes.
6. **Revoca cuando se solicite.** Usa Revocar. El contacto deja de participar en los siguientes avisos.

## Reintentos, mensajes fallidos y entrega

La asistencia y la mensajería tienen estados independientes.

1. **Abre Comunicación.** La tabla muestra los últimos avisos y su estado.
2. **Pendiente / reintento.** El mensaje está en cola. Los errores transitorios reintentan con espera creciente.
3. **Aceptado / enviado.** Meta aceptó la solicitud o informó su envío. Todavía no significa que el teléfono lo haya recibido.
4. **Entregado / leído.** El webhook confirmó estos estados cuando están disponibles.
5. **Fallido.** Revisa error, número, plantilla aprobada, idioma, credenciales y límites del proveedor.
6. **Estado desconocido.** Un corte pudo ocurrir después de que Meta aceptara el mensaje. Comprueba que no se entregó antes de reenviar para evitar duplicados.
7. **Reintenta conscientemente.** Usa Reintentar después de corregir la causa. Los avisos entregados no se vuelven a enviar desde ese botón.

## Qué cambia si antes enviabas a grupos

La migración oficial no conserva automáticamente los grupos del salón.

1. **Distingue los productos.** Un grupo normal de WhatsApp Web no es un destinatario individual de Cloud API.
2. **Revisa los límites vigentes.** La documentación de Groups API consultada exige Official Business Account y limita los grupos a ocho participantes; no sustituye un salón grande.
3. **Usa avisos individuales.** La nueva integración se orienta a apoderados y estudiantes con autorización.
4. **Conserva el reporte administrativo.** Descarga el consolidado si necesitas compartirlo manualmente en un grupo existente.
5. **Evalúa otro canal si el grupo es obligatorio.** Un canal grupal con API oficial puede estudiarse por separado. No vuelvas a introducir una sesión de navegador pensando que tendrá la estabilidad de Cloud API.

## Crear y comprobar copias de seguridad

Protege la información y prueba una restauración antes de necesitarla.

1. **Crea una copia consistente.** En Cuentas y respaldo abre Copias de seguridad y pulsa Crear copia de seguridad. Se utiliza una instantánea de SQLite compatible con WAL.
2. **Descarga la copia.** Guárdala en un destino protegido fuera del equipo de recepción.
3. **Incluye archivos asociados.** Copia también data/imports, los Excel históricos de Registros y session-secret.key. Esta clave permite validar los QR ya impresos.
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
7. **Configura WhatsApp de nuevo.** Las sesiones LocalAuth anteriores no se utilizan. Completa Cloud API y los contactos autorizados.

## Resolver problemas frecuentes

Pistas para recuperar el flujo sin perder datos.

1. **No puedo iniciar sesión.** Comprueba usuario, contraseña y que la cuenta esté activa. Tras muchos intentos espera 15 minutos. La recuperación administrativa está documentada en el README.
2. **No puedo registrar un ingreso.** Vincula el punto de asistencia o inicia sesión con permisos. Revisa el código y si ya existe un registro para el turno.
3. **El examen no valida.** Comprueba claves faltantes, cursos solapados, huecos y suma de preguntas por cada área.
4. **El lector no inicia.** Comprueba Python, PYTHON_BIN y los paquetes de requirements.txt. Prueba el comando npm run test:omr.
5. **No reconoce la hoja.** Usa una cartilla v2 completa, 300 ppp, cuatro marcadores visibles y QR nítido. Los formatos antiguos no se leen con la nueva plantilla.
6. **El lote tiene incidencias.** Abre Revisar. Resuelve las marcas dudosas, páginas repetidas o faltantes antes de confirmar.
7. **No llegan avisos.** Comprueba contactos autorizados, idioma y plantillas aprobadas, estado de credenciales, Internet y webhooks.
8. **La sesión cambió.** Actualiza la página e inicia sesión de nuevo. Un cambio de contraseña, desactivación o rotación de recepción puede invalidarla.
