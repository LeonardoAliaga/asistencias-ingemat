# Cambios

## 2.0.0

- Simulacros versionados: cursos, áreas, totales impresos/evaluables, cupos, versiones, penalizaciones y preguntas especiales.
- Cartillas PDF personalizadas con QR firmado y marcadores ArUco. Captura OMR en lotes con Python/OpenCV y revisión de excepciones.
- Importación CSV y guardado atómico; protección frente a duplicados, perfiles inválidos y notas reemplazadas sin motivo.
- Historial de calificaciones, recálculo por revisión de claves, padrón por examen y empates de ranking.
- Asistencia canónica SQLite, exportación diaria, justificaciones auditadas y vinculación de recepción.
- WhatsApp Business Platform directo: contactos autorizados, plantillas, cola persistente y estados de entrega con webhooks firmados.
- Cuentas y roles, contraseñas scrypt, sesiones persistentes, CSRF, copias consistentes y recuperación local de acceso.
- Dashboard responsive, recursos locales y guía contextual con 34 tutoriales buscables.
- Actualización de dependencias, pruebas de dominio/API/OMR/navegador y CI.

### Cambios de operación

Los datos de trabajo y secretos dejan de estar versionados. Respalda `data` y `Registros` antes de cambiar el checkout; consulta MIGRACION.md. WhatsApp Web y sus grupos tradicionales no se trasladan al transporte oficial. Las cartillas antiguas no son compatibles con la plantilla v2; sus notas y archivos se conservan como históricos.
