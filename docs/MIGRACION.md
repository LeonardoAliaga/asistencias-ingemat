# Actualizar INGEMAT a v2

Este cambio es una versión mayor. La rama de trabajo es `feat/ingemat-v2`; `main` conserva la versión anterior.

## Antes de cambiar el código

1. Detén INGEMAT, comprueba que no quede un proceso Node/PM2 escribiendo y conserva una copia completa del directorio de instalación.
2. Copia **data** y **Registros** a un destino privado fuera del checkout. En la versión anterior esos archivos estaban seguidos por Git; cambiar a una rama que los retira puede eliminarlos del directorio de trabajo. Restaurarlos desde tu copia forma parte de este procedimiento.
3. Conserva también los recursos públicos personalizados y cualquier configuración de arranque del equipo. No subas copias con datos personales a un repositorio.
4. Cambia de rama, instala `npm ci` y los requisitos de Python. No reutilices `node_modules` de la versión anterior.
5. Restaura la carpeta de datos a su ubicación final. Usa `DATA_DIR` y `RECORDS_DIR` si se ubican fuera del proyecto.

## Primer arranque

1. Define `ADMIN_INITIAL_PASSWORD` en `.env`, con al menos 12 caracteres, antes de arrancar por primera vez v2.
2. Arranca con `npm start`. Si ya existe `ingemat.db`, se crea una instantánea consistente `data/backups/pre-v2-*.db` antes de modificar el esquema.
3. Los registros existentes se conservan. El importador de JSON se ejecuta una vez, sin sobrescribir tablas ya pobladas ni contraseñas. Un JSON inválido detiene el proceso para que se corrija; no se marca como importado silenciosamente.
4. Accede con `admin`, cambia la contraseña temporal y crea cuentas individuales.
5. Revisa número de usuarios, calificaciones y tareas. Los antiguos simulacros quedan como históricos, con sus resultados disponibles. Las reglas por curso no se inventan para recalificarlos.
6. Los ingresos nuevos se guardan en SQLite. Los Excel antiguos se consultan desde Inicio. No se convierten automáticamente en registros nominales porque el formato anterior identifica filas por nombre y puede haber homónimos; permanecen disponibles como archivos históricos.
7. Genera un código de recepción y vincula los navegadores que registrarán asistencia. Rotarlo desvincula los equipos anteriores.
8. Completa áreas y contactos. Crea un examen pequeño, imprime una hoja y comprueba el ciclo completo antes de una evaluación real.

## Cambios de WhatsApp

Las sesiones de navegador anteriores ya no se usan. No necesitas instalar Chrome para WhatsApp ni conservar LocalAuth como dependencia de operación. Configura Cloud API, sus plantillas y webhooks. Se envían avisos a contactos individuales autorizados; los grupos tradicionales no se trasladan.

La API tiene costos y requisitos propios. Activar la opción del panel no crea una cuenta empresarial, no aprueba plantillas ni configura por sí solo un número de Meta.

## Revertir una actualización

Si una validación falla, detén v2 y conserva sus datos antes de volver atrás. Usa una instalación separada de la versión anterior y su **copia previa** de datos; no ejecutes el código anterior contra el esquema v2 esperando compatibilidad inversa. Una copia de la aplicación no sustituye el respaldo de la información.

## Datos en Git

Esta rama retira SQLite, WAL/SHM, JSON de operación, registros Excel y logs del seguimiento de Git. Los archivos del historial anterior siguen existiendo en la historia del repositorio; no se ha reescrito `main` ni su historial. Las credenciales nuevas se generan fuera del código y no reutilizan las contraseñas públicas antiguas.
