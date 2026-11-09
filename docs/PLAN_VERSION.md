# Plan de versión y puesta en marcha

La revisión aconseja conservar Express/SQLite y separar las reglas académicas, la captura y la comunicación. Cambiar todo el frontend de framework no resuelve el problema principal y haría más difícil conservar la operación existente. Esta rama aplica una versión mayor sobre la misma aplicación.

| Etapa | Cambio aplicado | Resultado verificable |
|---|---|---|
| 1. Proteger y conservar | Cuentas, permisos, scrypt, CSRF, sesiones persistentes, respaldo previo y datos fuera de Git | El acceso privado requiere sesión y la migración mantiene los registros existentes |
| 2. Modelar el simulacro | Cursos, áreas, cantidad física y evaluable, reglas fijas/cupos, versiones y puntuación | 120 preguntas impresas pueden producir 100 evaluables diferentes por área, sin caer a una clave general |
| 3. Calificar y corregir | Motor único, validación completa, revisiones de claves, notas anteriores y empates | La misma respuesta produce el mismo resultado por captura manual, CSV y OMR |
| 4. Capturar lotes | PDF personalizado, QR, ArUco, lector Python/OpenCV, revisión y confirmación atómica | Se detectan cartillas repetidas, páginas faltantes, marcas dobles y dudas; las incidencias bloquean el lote |
| 5. Estabilizar comunicación | Cloud API oficial, contactos autorizados, plantillas, cola persistente y webhooks firmados | Los fallos de conexión no bloquean ingresos y una entrega incierta requiere comprobación |
| 6. Facilitar el trabajo | Dashboard adaptable, recursos locales, formularios corregidos y 34 tutoriales | Flujos de escritorio/móvil y pantallas heredadas comprobados en navegador |
| 7. Mantener | Dependencias actualizadas, pruebas reproducibles, CI y documentación de recuperación | Los cambios futuros pueden comprobarse antes de incorporarlos |

## Activación en la academia

1. **Respaldo y migración.** Sigue [MIGRACION.md](MIGRACION.md). Conserva la instalación anterior completa antes de cambiar de rama. Comprueba usuarios, notas, tareas y archivos históricos en la copia actualizada.
2. **Configuración académica real.** Crea una plantilla por modalidad de examen. Define la distribución oficial de cursos y cupos de cada área. Las distribuciones de ejemplo no se presentan como reglas de una universidad.
3. **Piloto de cartillas.** Usa al menos un grupo de hojas con la impresora, papel, lápices y escáner habituales. Incluye blancos, borrados, dobles marcas, marcas débiles, hojas giradas y páginas faltantes. Guarda una transcripción comprobada manualmente y compara todas las respuestas detectadas, además de las notas. Si hay discrepancias no señaladas como duda, ajusta/calibra el lector antes de usarlo para calificaciones reales.
4. **Prueba operativa.** Imprime desde la app al 100%, captura un PDF a 300 ppp, revisa las excepciones, confirma y contrasta los resultados. Prueba también el caso de 120 impresas/100 evaluables, dos áreas, un cupo excedido y una clave corregida después de la impresión.
5. **WhatsApp empresarial.** Configura el número y credenciales de Meta, aprueba las dos plantillas de cuerpo, publica el webhook HTTPS y verifica su firma/estados. Con autorización, prueba primero con un contacto del personal. Luego habilita los contactos de los apoderados. Esta fase requiere los recursos externos de la academia y no se ejecutó con una cuenta real durante el desarrollo.
6. **Recepción y permisos.** Crea cuentas individuales, cambia la contraseña inicial e inicia sesión con una cuenta de recepción para registrar asistencia. Verifica ingreso duplicado, horario general/por ciclo y acceso de recepción/docencia/corrección.
7. **Recuperación.** Crea una copia desde el panel y prueba la restauración en una instalación separada. Incluye imports, archivos históricos y el secreto original que valida los QR.

## Siguientes mejoras, según el uso real

- Ajustar los umbrales y perfiles de escaneo a partir del piloto físico; mantener muestras anonimizadas de errores como regresiones.
- Añadir un adaptador Twilio/360dialog si el soporte o administración que ofrecen compensa su costo. El transporte directo ya está aislado del dominio académico.
- Evolucionar las pantallas heredadas hacia componentes compartidos cuando haya datos de uso; mantener la captura por código y la navegación por teclado.
- Añadir retención configurable de imágenes, cifrado de las copias y un destino externo de respaldo según la política de la academia.
- Pasar de una instancia SQLite a PostgreSQL y trabajadores separados si la concurrencia y volumen reales lo justifican. Para la instalación actual, una instancia evita introducir infraestructura innecesaria.

No se ha fusionado la rama con `main` ni desplegado sobre el equipo de la academia. El piloto físico y la activación empresarial son validaciones de puesta en marcha, no resultados que puedan certificarse sin las hojas/equipos y credenciales correspondientes.
