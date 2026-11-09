# Diseño del panel de administración

El panel organiza el trabajo por propósito. Resumen contiene indicadores y accesos frecuentes; los formularios de configuración se encuentran en sus secciones. Un solo menú lateral y una cabecera de página permiten reconocer dónde se está trabajando.

## Mapa de navegación

| Espacio                | Contenido                                                                         |
| ---------------------- | --------------------------------------------------------------------------------- |
| Resumen                | Indicadores, accesos rápidos y acceso a los tutoriales                            |
| Asistencia             | Fecha, ciclo, registros, justificaciones, exportación y vinculación de recepción  |
| Archivos históricos    | Excel anteriores, accesibles desde Asistencia                                     |
| Estudiantes y docentes | Directorio con búsqueda por nombre/código, altas, edición y carnets               |
| Apoderados y áreas     | Área de postulación y contactos autorizados                                       |
| Simulacros             | Asistente de diseño y pestañas de Resultados, Imprimir cartillas e Ingreso manual |
| Lectura de cartillas   | Carga de lotes, revisión OMR e importación CSV                                    |
| Tests y prácticas      | Creación y calificación con nota directa                                          |
| Tareas                 | Registro por curso, ciclo y semana; historial de entregas                         |
| Reportes               | Por estudiante, consolidado semanal y ranking histórico                           |
| Biblioteca             | Estantería, catálogo y préstamos/devoluciones                                     |
| Comunicación           | WhatsApp oficial, configuración y seguimiento de entregas                         |
| Ciclos y horarios      | Ciclos académicos, entrada y tolerancia por turno                                 |
| Página pública         | Ciclos visibles e imágenes de ingresantes                                         |
| Cuentas y respaldo     | Operadores, copias de seguridad y actividad/auditoría                             |
| Mi cuenta              | Cambio de contraseña, accesible desde el perfil superior                          |
| Guía y tutoriales      | 34 tutoriales, búsqueda, categorías y ayuda contextual                            |

El menú y las acciones respetan los roles existentes. La autorización de las operaciones sigue comprobándose en el servidor.

## Configuración progresiva de simulacros

1. **Datos:** título, ciclo, fecha y formato. Los puntajes generales permanecen plegados.
2. **Cursos y áreas:** cursos desplegables, rangos y un selector para editar un perfil a la vez. El resumen muestra preguntas sin asignar, repeticiones y diferencias en los cupos. Para un solo perfil con preguntas fijas se reutiliza el rango del curso.
3. **Claves:** entrada de alternativas con contador. Anulaciones, puntajes por alternativa y versiones están dentro de opciones avanzadas.
4. **Revisión:** cantidades por área y cobertura de la clave. Se distingue guardar un borrador con claves pendientes de guardar y validar un examen completo.

El asistente conserva los campos al avanzar y retroceder. Un cambio de formato con cursos o claves existentes muestra la opción de aplicar el nuevo diseño o conservar la configuración. Las plantillas y los archivos de estructura están en un desplegable propio.

En un examen guardado, las tareas de consultar resultados, imprimir y cargar respuestas manualmente tienen pestañas propias. La corrección de una nota requiere activar esa opción y escribir un motivo.

## Composición y espaciado

- Escala base de 4, 8, 12, 16, 24 y 32 px; separaciones mayores para contenedores y menores para elementos relacionados.
- Márgenes del área principal de 32 px en escritorio y 16 px en móvil; tarjetas de 24 y 20 px de relleno, respectivamente.
- Panel lateral de 252 px en escritorio y menú superpuesto en pantallas de hasta 960 px.
- Tipografía del sistema, jerarquía de títulos y textos secundarios; rojo de INGEMAT para selección y acciones destacadas, azul oscuro para acciones académicas.
- Tablas con desplazamiento dentro de su propio contenedor; formularios que pasan a una columna cuando falta espacio.
- Acciones de estudiantes siempre visibles y accesibles con teclado; no dependen del hover.
- Foco visible, Escape y restauración de foco en ventanas y menú; etiquetas asociadas a controles y nombres para los botones de iconos.
- Dos hojas de estilo activas para el panel: `admin.css` define la base y `v2.css` sus componentes. Las hojas antiguas ya no se acumulan en la página de administración.

## Referencias consultadas

WCAG establece criterios de accesibilidad. Carbon y Material son sistemas de diseño, empleados como referencias de organización y coherencia visual; no son una norma obligatoria para dashboards.

| Fuente primaria                                                                                                                                                                                                                      | Criterio aplicado                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Carbon: navegación global](https://www.carbondesignsystem.com/building-blocks/core/patterns/global-header) y [panel lateral](https://www.carbondesignsystem.com/building-blocks/core/components/ui-shell-left-panel/specifications) | Separación de navegación global, contenido de la sección y estados de selección/foco                                                                             |
| [Carbon: espaciado](https://www.carbondesignsystem.com/building-blocks/foundations/spacing/overview)                                                                                                                                 | Escala consistente de separación y relleno                                                                                                                       |
| [Carbon: tablas de datos](https://www.carbondesignsystem.com/building-blocks/core/components/data-table/guidelines)                                                                                                                  | Filtros y acciones próximos a los registros que afectan                                                                                                          |
| [Material 3: fundamentos](https://m3.material.io/foundations/)                                                                                                                                                                       | Jerarquía, composición y consistencia de componentes                                                                                                             |
| [WCAG 2.2: reflow, 1.4.10](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)                                                                                                                                                  | Adaptación a 320 px CSS; tablas con desplazamiento propio                                                                                                        |
| [WCAG 2.2: contraste, 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)                                                                                                                                      | Contraste de texto normal de al menos 4.5:1; corrección de textos secundarios detectados                                                                         |
| [WCAG 2.2: foco no oculto, 2.4.11](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html)                                                                                                                      | Foco visible, margen de desplazamiento bajo la cabecera y gestión de ventanas                                                                                    |
| [WCAG 2.2: tamaño de objetivos, 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)                                                                                                                         | Objetivos de interacción con espacio suficiente; controles principales de 42–44 px. El mínimo AA es 24 px con las excepciones descritas en el criterio, no 44 px |

## Verificación y límites

Las pruebas de navegador usan una base de datos temporal con información ficticia. Incluyen creación y calificación de un examen de 100 preguntas; diseño por cursos, áreas y cupos de un cuadernillo de 120; altas y edición en biblioteca; búsqueda entre turnos; navegación por rol; y adaptación a 320, 390, 768, 1024 y 1440 px.

Se ejecutan comprobaciones automáticas con axe-core para criterios WCAG A/AA en las pantallas y ventanas cubiertas. Se revisan visualmente estados vacíos y con registros, formularios, tablas y ventanas. Estas comprobaciones no constituyen una certificación completa de accesibilidad: sigue siendo útil probar con los operadores de la academia, lectores de pantalla y navegadores/dispositivos reales.

La reorganización no cambia el modelo de calificación ni el formato de las cartillas. La lectura OMR sigue necesitando el piloto físico descrito en el README; WhatsApp requiere configurar las credenciales y plantillas reales.
