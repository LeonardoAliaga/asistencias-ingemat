# Cartillas horizontales con identificación

Las cartillas nuevas incluyen el logo extraído del primer PDF de ejemplo de la academia, campos manuscritos para apellidos, nombres y área y ocho casillas para escribir el código. Debajo hay ocho columnas de diez círculos numerados del 0 al 9. El código debe existir como una cadena de exactamente ocho dígitos en el padrón; no se eliminan ceros iniciales ni se rellenan códigos cortos automáticamente.

| Formato | Cartillas por hoja | Hoja física | Caras | Impresión |
|---|---:|---|---:|---|
| Cuarto de A4 horizontal | 4 | A4 horizontal | 2 por cartilla | Doble cara, borde corto por defecto |
| Media A4 horizontal | 2 | A4 vertical | 1 por cartilla | Una sola cara |

Ambas cartillas son horizontales. En media hoja, la hoja A4 completa es vertical y contiene una cartilla horizontal arriba y otra abajo. El PDF ya hace la imposición: imprime al 100%, sin ajustar y sin volver a activar varias páginas por hoja. La cantidad solicitada es de cartillas. Las posiciones sobrantes quedan vacías en frente y reverso.

Para cuarto se intercalan frente y reverso de cada grupo de cuatro. Borde corto refleja las columnas del reverso; borde largo refleja las filas, por ser una A4 horizontal. El PDF declara preferencias Duplex y PrintScaling, pero los controladores pueden ignorarlas: verifica el diálogo y prueba primero una hoja. Las líneas discontinuas son guías de corte; conserva los cuatro marcadores de cada cartilla. Los marcadores exteriores quedan a más de 5 mm del borde físico.

## Cursos y espacio

El generador coloca las preguntas en bloques con el nombre de su curso. Si un bloque continúa en otra columna o cara lo señala con «cont.». Evita fragmentos finales de una o dos preguntas cuando puede redistribuir el bloque. La misma definición usa el motor de calificación; el papel no cambia las reglas por área.

En la plantilla de repaso, cuarto distribuye 45 preguntas al frente y 75 al reverso; media contiene las 120 en una sola cara. Estas cantidades dependen de cursos y nombres, no son cuotas por área. Cada alumno sigue evaluándose sobre las 100 que le corresponden. Ambos formatos compactos admiten hasta 120 preguntas y hasta cinco áreas de un carácter, o un único perfil general. Si una configuración excepcional no cabe, el generador la rechaza en vez de recortar contenido.

## Qué identifica cada elemento

- **Código marcado:** identifica al estudiante. Se exige exactamente una marca clara en cada columna. Las marcas dobles, dudosas o vacías no se adivinan.
- **Área marcada:** selecciona el perfil del examen. Debe existir y coincidir con el perfil registrado si ya está asignado. Un único perfil general no requiere marcar un área.
- **Nombres y área manuscritos:** permiten cotejar físicamente la hoja. No se usa OCR para interpretar escritura a mano.
- **QR firmado:** contiene versión del formato, un identificador aleatorio de cartilla, cara y firma. Vincula ambas caras al examen, versión del cuadernillo y revisión registrados en el servidor. No contiene nombres ni el código manuscrito. No es un enlace para abrir una página.
- **Marcadores:** permiten reconocer y corregir perspectiva y rotación; no son respuestas.

Cada cartilla es única. No fotocopies una sola para diferentes alumnos: sus QR iguales se detectarían como duplicados. Genera la cantidad requerida desde la aplicación.

## Lectura y revisión

Puedes cargar PDF de A4 completas con cuatro o dos cartillas, o fotografías de las cartillas ya recortadas. El lector separa los rectángulos por sus marcadores antes de normalizarlos, sin mezclar las esquinas entre alumnos. Una parte incompleta queda como incidencia. La bandeja de NAPS2 permite reunir hasta diez capturas; el lector admite hasta cien caras de cartilla por lote.

En cuarto, incluye frente y reverso en el mismo lote. Se agrupan por identificador único, sin depender del orden del archivo ni del nombre escrito. Si falta una cara, se solicita revisión y no se importa parcialmente el alumno.

Un código desconocido, incompleto o con varias marcas, un área inexistente o incompatible y las lecturas dudosas impiden confirmar el lote. La revisión permite cotejar la imagen y corregir código/área con motivo. Se conservan las lecturas originales, sus densidades y la corrección auditada. Las notas solo se guardan al confirmar el lote. La firma, el examen, la versión y la protección frente a páginas ya importadas se comprueban en el servidor.

El formato A4 anterior personalizado sigue disponible y sus cartillas impresas siguen siendo válidas. Los nuevos diseños usan versiones geométricas independientes (cuarto v3, media v4); no se reinterpretan las coordenadas de las cartillas v2.

## Estudiante identificado en pantalla

El lote, la previsualización de notas y la ventana Revisar muestran los apellidos, nombres y código del estudiante encontrado en el padrón del examen. El nombre se obtiene del código exacto leído o de una corrección confirmada; no de los nombres manuscritos ni de una coincidencia aproximada. Se conserva el nombre registrado al validar el examen cuando existe esa referencia histórica.

El estudiante puede identificarse aunque el área siga pendiente o falte el reverso. Ambas caras se relacionan por el QR firmado de la misma cartilla, no por el orden del escaneo. Mostrar el nombre no resuelve esas incidencias ni habilita la importación. Un código incompleto, desconocido o ajeno al examen queda sin estudiante identificado. Si editas el código, la pantalla retira el nombre anterior hasta confirmar la revisión y verificar el nuevo código.

Los nombres se consultan al abrir el lote, sin alterar sus lecturas originales ni crear notas. Esta visualización también está disponible para lotes anteriores y cartillas personalizadas.

## Lectura del código y revisión por columna

El código de ocho dígitos se reconoce por separado de las respuestas. Se mide el relleno interior en escala de grises con una referencia de papel local; una apertura morfológica separa los trazos finos del número impreso y del borde. La lectura anterior del anillo exterior podía perder rellenos centrados. Una segunda medida sensible a trazos tenues solo genera una incidencia, nunca elige un dígito.

Se exige una única marca clara en cada una de las ocho columnas. Se conservan ceros iniciales, lecturas originales y densidades. No se completa un código por parecido con el padrón. En Revisar se muestran ocho casillas con el dígito leído o `?`, indicando Sin marca, Revisar o Varias marcas; coteja las dudas con la cartilla y registra un motivo para cualquier corrección.

Las coordenadas, QR y plantillas de cuarto/media hoja no cambian, de modo que se pueden seguir utilizando las cartillas ya impresas. El nuevo análisis se aplica al procesar archivos de nuevo; los lotes anteriores conservan sus lecturas registradas. Mantén 300 ppp en grises y rellena un círculo por columna con presión uniforme. La letra manuscrita en los recuadros no sustituye los círculos.

## Lectura del área

Los círculos del área usan el mismo análisis de relleno interior que los del código, con contraste local y separación de los trazos impresos. Antes se leía solo una franja del borde, lo que podía omitir una marca centrada. El cambio es del lector: no modifica tamaño, coordenadas ni QR y permite utilizar cartillas ya impresas de cuarto y media hoja.

Marca una sola área con relleno uniforme. Las letras o dígitos impresos no cuentan como selección. La pantalla de revisión muestra la lectura original del área o Sin marca, Revisar marca tenue o incompleta o Varias marcas. Si no existe una única marca clara, el área queda pendiente de cotejo; no se deduce del código ni se elige por la opción más oscura. Un examen con un único perfil sigue asignándolo sin pedir una marca.

Procesa un lote nuevo para aplicar el análisis a archivos ya escaneados; los lotes guardados mantienen su lectura anterior. Una corrección manual conserva el resultado original y requiere motivo.

## Verificación y piloto

Las pruebas generan y rasterizan los PDF del generador, verifican los QR de cada posición del anverso/reverso, leen hojas completas, rellenan códigos con ceros iniciales y áreas, generan fotos JPEG con giro y perspectiva y recorren lector → revisión de identidad → confirmación de notas. También comprueban la carga anterior. Las regresiones de identificación rasterizan los dos formatos reales, prueban los diez dígitos en las ocho posiciones, rellenos interiores, lápiz gris, pequeños desplazamientos, JPEG, variación de papel e impresión y códigos con ceros iniciales. Las regresiones del área cubren las cinco letras y perfiles numéricos en los dos PDF, relleno centrado, lápiz gris, desplazamiento/JPEG, variación de papel e impresión, marcas dobles y tenues y el perfil único sin marca. Las marcas dobles o tenues y las columnas o áreas vacías bloquean la identificación automática.

Haz una prueba física antes de usar el formato compacto para un salón completo. La legibilidad real depende de impresora, papel, marcas y teléfono. Para grandes lotes sigue siendo preferible el escáner a 300 ppp; no actives filtros que borren trazos tenues.
