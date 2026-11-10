# Revisión y cambios aplicados

Base inspeccionada: `be777fabb46e41df984302c9a3ebde8685c77b81` de `main`. Se revisaron estructura, rutas, esquema, migración, calificación, OMR, interfaz, exportación y transporte de WhatsApp. Se reprodujeron fallos con datos ficticios y luego se añadieron pruebas de regresión para los flujos nuevos.

| Hallazgo anterior | Tratamiento en v2 |
|---|---|
| Evaluaciones y biblioteca montadas como rutas públicas | Sesión y permisos en las APIs de consulta y escritura |
| Contraseña sin hash y secreto de sesión fijo | Cuentas scrypt, secreto fuera del código y sesiones persistentes |
| El importador restauraba la contraseña del JSON en cada arranque | Importación idempotente sin credenciales heredadas |
| Datos nominales, SQLite, WAL/SHM y logs seguidos por Git | Retirados del seguimiento en esta rama, sin reescribir la historia de main |
| Asistencia escrita directamente en Excel y búsqueda por nombre | SQLite por identidad estable; Excel es exportación; archivos anteriores se conservan |
| Riesgo de perder registros por escrituras concurrentes del mismo Excel | Ingreso transaccional y restricción por usuario, fecha y turno |
| Cuadernillo de 120 imprimía solo 100 cuando se evaluaban 100 | Geometría compartida basada en el total físico del cuadernillo |
| Algunos QR podían fallar incluso en PDF nuevo | Zona compartida, margen y tamaño de QR ajustados; lectura en recorte y prueba de sus ocho patrones de máscara |
| Coordenadas distintas entre generador y lector | Una única definición de posiciones y transformación por marcadores identificables |
| Marca doble podía aceptarse por la condición de predominancia | Estados explícitos: única, blanco, múltiple y dudosa; revisión antes de confirmar |
| Área desconocida caía a una clave general | Rechazo de perfiles no definidos |
| Clave incompleta permitía evaluar menos preguntas sin avisar | Validación completa y comprobación de totales por curso y perfil |
| Reglas sin entidad de curso ni cupos | Cursos, selección fija o por cupo, excepciones y desglose |
| Notas reemplazadas sin conservar su versión anterior | Historial y motivo obligatorio para correcciones |
| Ranking asignaba puestos distintos a puntajes iguales | Empates con puesto compartido y orden secundario por código |
| Estado compartido entre clave y respuestas de alumnos | Borradores separados y motor único para las nuevas capturas |
| WhatsApp Web dependía de HTML/versiones y navegador | Baileys en proceso hijo supervisado, cola persistente y confirmaciones de entrega |
| Una nota corregida podía reutilizar el evento de un aviso anterior | Identidad por calificación, cancelación de pendientes obsoletos y nueva publicación |
| Estado booleano de envío sin confirmación de entrega | Estados separados y protección frente a duplicación/reintentos inciertos |
| Configuración de WhatsApp leída de JSON y guardada en SQLite | Configuración Baileys en SQLite; sesión y claves Signal en una base privada separada |
| Recursos de la dashboard dependían de varios CDNs | Librerías, iconos y scripts servidos localmente desde dependencias bloqueadas |
| Estilos móviles aumentaban fuentes a tamaños excesivos | Reglas responsive, foco visible, contención de tablas y controles táctiles |
| Estilos globales rompían los pasos de los tutoriales | Componentes nuevos aislados de reglas heredadas |
| La inicialización tardía podía devolver al usuario a Inicio | Se respeta la navegación elegida durante la carga |
| Scripts de arranque mataban todos los procesos PM2 y exigían administrador | Arranque de una sola aplicación sin borrado global de procesos |
| Cambiar Default no alteraba el horario aplicado como respaldo | Se respeta el horario general y se validan horas y tolerancias |
| Reabrir Biblioteca podía duplicar los controladores de sus formularios | Inicialización única y prueba de navegación repetida |
| Devolución por código podía seleccionar un alumno entre varios préstamos | Selección explícita del préstamo; conservación de libros/ciclos con historial |
| Justificación histórica elegía una fila ante homónimos | Se bloquea la operación ambigua para revisión manual del archivo |
| Sin guía, pruebas ni CI | 34 tutoriales, pruebas de dominio/API/migración/OMR/cola/navegador y workflow |

Se conserva el frontend anterior para usuarios, biblioteca, tareas y reportes mientras las nuevas herramientas se integran en la misma dashboard. Los exámenes v2 usan la nueva capa de dominio. La reestructuración evita una reescritura de framework que habría añadido riesgo sin resolver las reglas académicas.

La auditoría inicial de `package-lock.json` señaló 21 dependencias afectadas (incluyendo desarrollo y dependencias transitivas). Tras retirar el transporte de navegador y actualizar paquetes/lockfile, la comprobación local de npm quedó sin alertas. ExcelJS usa una sustitución acotada de su dependencia UUID; el uso de `v4` mantiene compatibilidad y las exportaciones se prueban.

No se ha verificado un despliegue existente ni un lote físico de cartillas. No se conectó WhatsApp a una cuenta real. Esos dos puntos necesitan el equipo/material y el teléfono de WhatsApp de la academia; el código, documentación y verificaciones reproducibles quedan en esta rama.

Se verificó además la migración sobre una copia del SQLite existente: se conservaron las cantidades de usuarios, ciclos, evaluaciones, respuestas, tareas, registros de tarea, libros y préstamos. La comprobación de integridad devolvió `ok` y se creó el respaldo previo. La base original no fue modificada.

La instalación limpia con `npm ci` se comprobó por separado y pudo abrir SQLite. Se corrigieron los metadatos heredados del lockfile de `better-sqlite3` para respetar `gypfile: false` y utilizar los binarios distribuidos por el paquete, sin intentar una compilación innecesaria.

La instalación de Baileys regeneró el lockfile y eliminó ese metadato; se restauró tras reproducir la compilación accidental con una instalación limpia y sin Python de compilación disponible. Se añadió `install:doctor` para comprobar el lockfile y cargar el binario incluido mediante una prueba de escritura, transacción y rollback en memoria. CI verifica el lockfile antes de instalar y añade instalaciones Windows x64 con Node 24.22.1 y npm 11.9/11.16, impidiendo expresamente que node-gyp use Python para que las herramientas del runner no oculten esta regresión. El Python del lector OMR es independiente.
