# INGEMAT 2.0

Gestión de una academia preuniversitaria: usuarios, recepción, asistencia, biblioteca, tareas, simulacros por cursos y áreas, lectura OMR por lotes y avisos individuales con Baileys en un proceso aislado.

La guía completa está dentro de la dashboard, en **Guía y tutoriales**: 34 tutoriales con buscador, categorías y ayuda contextual. También se puede leer en [docs/GUIA.md](docs/GUIA.md).

## Panel de administración

El menú lateral separa Personas, Académico y Gestión. Resumen contiene indicadores y accesos rápidos; ciclos, horarios, comunicación, cuentas y página pública tienen espacios propios. El perfil superior abre Mi cuenta. En móvil el menú es desplegable.

Los simulacros usan un asistente de cuatro pasos, con cursos plegables, comprobación de cantidades por área y opciones avanzadas opcionales. El examen guardado separa Resultados, Imprimir cartillas e Ingreso manual. Reportes reúne el seguimiento por estudiante, el consolidado semanal y los rankings históricos.

Criterios de diseño, referencias de Carbon/WCAG y alcance de las verificaciones: [docs/DISENO_ADMIN.md](docs/DISENO_ADMIN.md).

## Requisitos

- Node.js **24 LTS o 26 LTS**, npm y un equipo que pueda permanecer encendido durante la jornada.
- Python 3.11 o posterior para OMR; se prueba con 3.12.
- Para escanear lotes: escáner o multifuncional con alimentador automático, preferentemente a 300 ppp. Las fotos PNG/JPG también funcionan con cartillas v2 completas.
- Para avisos: acceso a Internet y el teléfono de WhatsApp de la academia para vincularlo desde Comunicación. La asistencia funciona aunque el transporte esté desconectado.

## Instalar

```sh
npm ci
python -m venv .venv
```

Activa el entorno e instala OMR:

```sh
# Windows PowerShell
.venv\Scripts\Activate.ps1
python -m pip install -r src/omr/requirements.txt

# Linux/macOS
. .venv/bin/activate
python -m pip install -r src/omr/requirements.txt
```

Copia `.env.example` a `.env`. Configura `PYTHON_BIN` con la ruta del Python del entorno; en Windows, por ejemplo `C:/Academia/asistencias/.venv/Scripts/python.exe`. Usa barras `/` en `.env`.

Para la primera cuenta define `ADMIN_INITIAL_PASSWORD` con al menos 12 caracteres. Si se omite, el servidor muestra una contraseña aleatoria una sola vez en su consola. La cuenta inicial es `admin`; cambia la contraseña desde **Mi cuenta**. Las contraseñas de versiones anteriores no se reutilizan como credencial.

```sh
npm start
```

Abre `http://localhost:3001/admin`. La página pública y la recepción están en `/`. Para registrar ingresos, inicia sesión en `/admin` con una cuenta de administración o recepción y abre Asistencias en el mismo navegador.

No es necesario ejecutar Node, el navegador o `start.bat` como administrador del sistema operativo. El script inicia únicamente el proceso `ingemat` y no elimina otros procesos de PM2. Para un servidor con PM2:

```sh
npm install -g pm2
pm2 start ecosystem.config.cjs --only ingemat
pm2 save
pm2 logs ingemat
```

Usa una sola instancia para este despliegue SQLite. En producción configura HTTPS, `NODE_ENV=production` y `TRUST_PROXY=1` **solo** si hay un proxy de confianza que termina HTTPS; las cookies de sesión requieren HTTPS en ese modo.

## Actualizar una instalación anterior

Lee [docs/MIGRACION.md](docs/MIGRACION.md) **antes** de cambiar de rama en el equipo de la academia. Conserva tus directorios locales `data` y `Registros`; en v2 ya no se versionan. Una instalación nueva está vacía, sin los datos personales que antes estaban en Git.

La actualización crea una instantánea previa del SQLite existente. Los JSON heredados se importan una sola vez si las tablas están vacías. No se sobrescriben contraseñas en cada arranque. Los exámenes anteriores conservan notas y se presentan como históricos; crea un examen v2 para nuevos simulacros.

La base de datos es `DATA_DIR/ingemat.db`; el valor predeterminado es `./data`. Si defines `DATA_DIR`, los archivos históricos se buscan en `DATA_DIR/registros` salvo que definas `RECORDS_DIR`. Sin `DATA_DIR`, se conserva la carpeta `./Registros` de la instalación anterior.

## Simulacros

1. En **Simulacros → Nuevo examen**, elige en el único selector **Plantilla**. Con **Simulacro tipo UNMSM**, el recorrido es **Datos → Claves → Revisión**; las bases y Personalizado también muestran **Cursos y áreas**. Los puntajes generales están visibles en Datos.
2. La plantilla predeterminada **Simulacro tipo UNMSM** ya distribuye los 19 cursos y las áreas A–E según los PDF de la academia: 120 impresas y 100 evaluables por área. Consulta [rangos y cantidades](docs/PLANTILLA_REPASO.md). Para crear otra distribución elige una base o Personalizado (configuración limpia). Los exámenes existentes se conservan.
3. Para cada área y curso define preguntas fijas o un conjunto elegible y cupo. La suma tiene que coincidir con el total evaluable del perfil.
4. En **Claves**, selecciona las alternativas con botones A–E: avance automático, progreso por curso, navegación a pendientes y selección de varias respuestas aceptadas. También puedes pegar una secuencia de letras sin números. Las penalizaciones, excepciones y versiones están en opciones desplegables.
5. En Revisión puedes **Guardar borrador** con claves pendientes o **Guardar y validar** cuando esté completo. Después la estructura se conserva.
6. Asigna las áreas a los alumnos. En **Imprimir cartillas** elige cuarto de A4 horizontal a doble cara (cuatro cartillas por hoja) o media A4 horizontal a una cara (dos por hoja), e indica cuántas cartillas necesitas. Incluyen logo, campos de identificación, código de ocho dígitos con círculos y preguntas por curso. Se conserva el formato anterior personalizado. Consulta [impresión e identificación](docs/CARTILLAS.md).
7. En **Lectura de cartillas**, usa **Escanear con NAPS2** para añadir capturas desde el cristal o el alimentador de la PC del servidor; también puedes cargar PDF/imágenes ya escaneadas o importar CSV. Las capturas se conservan por operador y examen y se procesan juntas. Revisa las incidencias y confirma el lote. Consulta [conexión y uso de NAPS2](docs/ESCANER.md).
8. Comprueba resultados, desglose por curso y ranking; publica y, opcionalmente, programa los avisos individuales.

Una marca doble confirmada se califica como incorrecta. Una marca dudosa impide calificar hasta su revisión. Las preguntas fuera del perfil no cuentan como blancos. En «Elegir cupo» no se seleccionan las mejores respuestas si el alumno excede el máximo: se solicita revisión.

Desde **Revisar claves y reglas** puedes corregir claves y excepciones de puntaje después de registrar respuestas. Al confirmar se recalculan notas y ranking en una transacción y se conserva el historial. El orden de las versiones A/B queda fijado al validar. Corregir una nota publicada devuelve el examen a Listo para revisión. Los avisos pendientes de notas anteriores se cancelan; una nueva publicación permite comunicar las notas actualizadas. Las cartillas impresas antes de una corrección de claves siguen siendo legibles porque la estructura no cambia. Si un lote se previsualizó antes de corregir la clave, usa **Actualizar con las claves vigentes** antes de confirmarlo.

## Lectura OMR

Si ya instalaste una versión anterior de esta rama, actualiza también las dependencias de Python dentro de tu entorno virtual:

```sh
python -m pip install -r src/omr/requirements.txt
```

El lector usa Python/OpenCV, marcadores ArUco y una geometría de impresión compartida con el generador PDF. ZXing-C++ decodifica el QR y OpenCV se conserva como alternativa; la firma y la identidad se comprueban en Node. Identifica estudiante, área, versión, página y formato desde un QR firmado. Los PDF se rasterizan con PDFium, sin servicios externos de OCR.

- Cartillas A4 horizontal; imprimir al 100%, sin recortar QR ni marcadores.
- PDF, PNG o JPG; máximo 10 archivos de 20 MB y 100 páginas por lote.
- Más de 120 preguntas: varias páginas por estudiante, reunidas por QR.
- Los duplicados y páginas faltantes se bloquean antes de registrar notas.
- Original, imagen normalizada, lectura inicial y revisión se conservan en el directorio privado de datos.
- Los umbrales se han probado con imágenes sintéticas, rotación, perspectiva y el PDF real generado. **Antes de usarlo para notas reales, verifica un lote físico del escáner y lápices que utilizará la academia.** La precisión de una impresión/fotografía concreta no se puede deducir de pruebas sintéticas.

Para reducir manipulación, la ruta recomendada es ADF → PDF multipágina → lote → revisión de excepciones. Para pocos alumnos puedes usar fotos. La comparación de herramientas y fuentes está en [docs/INVESTIGACION.md](docs/INVESTIGACION.md).

## WhatsApp con Baileys

La única conexión disponible es **Baileys**, fijada a `7.0.0-rc14` e instalada como dependencia opcional. La biblioteca y su conexión se ejecutan en un proceso hijo: no se importan en el servidor académico. Un error de carga, caída, bloqueo o timeout detiene ese componente y muestra **Revisa el paquete Baileys y su versión**; la app y las operaciones académicas continúan.

```sh
npm ci
npm run whatsapp:doctor
npm start
```

El diagnóstico no vincula cuentas ni envía mensajes. Desde **Comunicación**, guarda los mensajes, pulsa **Conectar / Reintentar** y escanea el QR con WhatsApp → Dispositivos vinculados. Cuando aparezca Conectado, activa los avisos y guarda. No se necesitan credenciales de API de pago ni webhooks públicos. La sesión persiste en `DATA_DIR/whatsapp/baileys-auth.db`, separada de la base académica. Conserva esa carpeta en privado o vuelve a vincular el teléfono tras restaurar.

Los avisos requieren contactos autorizados. Los resultados se notifican mediante una acción explícita después de publicarlos. La cola conserva mensajes y sus textos; un envío incierto no se repite automáticamente. Los estados de entrega se actualizan cuando WhatsApp los comunica. Esta interfaz no automatiza grupos.

La migración retira la configuración y los endpoints de la integración anterior, conserva sus avisos históricos y no los reenvía por Baileys. Las instalaciones anteriores empiezan con los nuevos avisos desactivados hasta vincular el teléfono. La biblioteca no oficial puede requerir mantenimiento; aislarla evita convertir sus fallos en una caída de INGEMAT.

[Uso y recuperación](docs/WHATSAPP.md) · [Arquitectura y responsabilidades](docs/ARQUITECTURA.md). Las pruebas no conectan números reales ni envían mensajes a personas.

## Copias y recuperación

**Cuentas y respaldo → Crear copia de seguridad** crea una instantánea consistente de SQLite. Guarda también `data/imports` y `data/scanner` (capturas pendientes), los Excel históricos y la clave `session-secret.key` (o el `SESSION_SECRET` original) para que los QR ya impresos sigan validándose. Respalda `.env` por separado y en privado.

Restauración: detén la app, conserva una copia del estado actual, restaura la instantánea como `ingemat.db` en un directorio de datos nuevo, restaura sus archivos y secreto, configura `DATA_DIR`/`RECORDS_DIR`, arranca y verifica el historial. No mezcles un `.db` restaurado con archivos `-wal`/`-shm` de otra ejecución: usa un directorio nuevo con la aplicación detenida.

Para recuperar una contraseña desde una terminal del servidor:

```sh
node scripts/reset-password.cjs admin
```

El programa pide la contraseña sin mostrarla y revoca las sesiones anteriores. Las cuentas y cambios quedan en la auditoría.

## Conectar un escáner con NAPS2

Instala NAPS2 y el controlador WIA/TWAIN del escáner en la computadora que ejecuta Node. INGEMAT busca `NAPS2.Console.exe` en las carpetas habituales de Windows. Para una ubicación personalizada configura `NAPS2_BIN` en `.env` y reinicia el proceso. Comprueba los dispositivos sin iniciar una captura:

```sh
npm run scanner:doctor
npm run scanner:doctor -- twain
```

El panel permite elegir WIA/TWAIN, dispositivo, cristal/alimentador y área A4/A5. Usa 300 ppp en grises, sin OCR. La Brother MFC-T920DW escanea una cara y admite hasta 20 hojas en el alimentador; los cuartos recortados quedan fuera de su tamaño mínimo y se colocan sobre el cristal. La integración controla el escáner instalado en el servidor, no un equipo conectado a otro navegador. Véase [guía de escáner](docs/ESCANER.md).

La captura de cartillas con cámara se retiró. Para actualizar esa instalación, `git pull --ff-only` elimina los archivos retirados y `npm prune` limpia paquetes ajenos al manifiesto. Conserva `.venv`, Python y `src/omr/requirements.txt`: el lector sigue reconociendo los archivos de NAPS2. El lector de carnets de recepción se mantiene.

## Diagnosticar Python y OMR

Al iniciar con `npm start`, la consola muestra un diagnóstico `[OMR]` con el ejecutable efectivo, versión y arquitectura de Python, entorno virtual y estado de OpenCV/ArUco, NumPy, PDFium, Pillow y ZXing. También puedes ejecutarlo por separado:

```sh
npm run omr:doctor
```

El diagnóstico usa el mismo `PYTHON_BIN` que la cola de lectura. Una variable de entorno del sistema tiene prioridad sobre el valor del `.env`; revisa la ruta efectiva que muestra el registro. No basta con instalar paquetes en otro Python del equipo.

En cada lote se registran su identificador, comando, carpeta de trabajo, duración y código/señal de salida. Si Python no arranca se conserva el error real (por ejemplo, `ENOENT` o `EACCES`); si falla el lector se muestra su traceback en `stderr`, hasta los últimos 65 536 caracteres. Los errores de lectura de cada cartilla se muestran por número de página. Las respuestas y el contenido del `.env` no se imprimen.

Mira la terminal donde ejecutaste `npm start`. Con PM2 utiliza `pm2 logs ingemat --lines 200`. Tras modificar el `.env` reinicia el proceso; si cambias variables de entorno de PM2 usa `pm2 restart ingemat --update-env`.

## Verificar

```sh
npm run check
npm test
npm run test:omr
npx playwright install chromium
npm run test:ui
npm audit --omit=dev
```

Los tests usan directorios temporales y datos ficticios; no usan los registros de la academia ni hacen envíos reales. Las pruebas del backend incluyen HTTP, permisos, migración, importación atómica, versiones, cuotas, duplicados y la cola de Baileys y el aislamiento del proceso. Las pruebas OMR incluyen PDF real, 120 preguntas, marcas dobles/tenues, perspectiva y segunda página. Las pruebas de navegador cubren creación y calificación, guía, pantalla móvil, formularios heredados, acceso de recepción mediante cuentas y sanitización.

## Organización

- `src/services/grading.service.js`: reglas y cálculo independiente de captura.
- `src/services/evaluations.service.js`: exámenes, revisiones e historial.
- `src/services/imports.service.js`, `src/omr/`: lotes y reconocimiento de marcas.
- `src/services/attendance.service.js`: registros canónicos y exportación.
- `src/services/notifications.service.js`: cola y reglas de los avisos.
- `src/services/baileys.service.js`, `src/whatsapp/`: supervisor, proceso y sesión privada.
- `src/routes/notifications.route.js`, `Public/js/admin/notifications.js`: HTTP e interfaz de Comunicación.
- `src/database/migrations/`: esquema y actualización.
- `Public/js/admin/v2.js`, `Public/pages/v2-panel.html`: herramientas del panel.
- `src/content/guide.json`: contenido único de los 34 tutoriales.

El plan aplicado y la puesta en marcha están en [docs/PLAN_VERSION.md](docs/PLAN_VERSION.md).

Consulta [CHANGELOG.md](CHANGELOG.md), [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) y [docs/REVISION.md](docs/REVISION.md).
