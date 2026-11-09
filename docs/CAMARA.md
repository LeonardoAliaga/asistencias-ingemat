# Capturar cartillas con cámara

En Lectura de cartillas selecciona un examen listo y pulsa **Usar cámara**. La app solicita solo video, con preferencia por la cámara trasera y resolución alta. Permite elegir otra cámara y encender la linterna si el dispositivo expone esa capacidad.

1. Mantén visibles toda la hoja, los cuatro marcadores y el QR. El marco es una guía; no se recorta la foto por ese marco.
2. Pulsa Capturar cartilla. Puedes repetirlo hasta reunir 10 fotos, revisar las miniaturas, guardar fotos localmente o quitar las que no sirvan.
3. Pulsa Procesar capturas. Se envían juntas al lector existente; la revisión y confirmación del lote guardan las notas.
4. Si se pierde la respuesta del servidor, reintenta el mismo envío. El identificador persistente por operador impide crear otro lote para esa petición. La bandeja queda bloqueada ante un envío incierto para conservar exactamente el mismo grupo.
5. Apaga la cámara al terminar. Salir de la vista, ocultar la pestaña o cambiar de aplicación detiene las pistas. Las fotos pendientes siguen en memoria; recargar/cerrar descarta esa memoria. Hay un aviso antes de salir y un enlace para guardar cada foto.

## Acceso desde el celular

La cámara web requiere **HTTPS y permiso del navegador**. La excepción de `localhost` solo se aplica al propio equipo: acceder desde el teléfono a `http://192.168.x.x:3001` no cumple ese requisito. Publica mediante un dominio HTTPS y un proxy de confianza. Configura `APP_URL` y, si corresponde, `TRUST_PROXY` como explica la instalación. No expongas el puerto del servidor sin configurar sus accesos.

La alternativa **Tomar foto con la cámara del dispositivo** utiliza el selector nativo con `capture="environment"`; el navegador puede mostrar la cámara o un selector de archivos. La foto se abre y normaliza en el navegador. Si el formato del teléfono no es decodificable, guarda JPG/PNG o usa la carga de archivos.

## Calidad y compatibilidad

- Se intenta una foto con `ImageCapture.takePhoto`; si no está disponible o falla, se captura el fotograma del video. Ninguna de las dos rutas inventa detalle que la cámara no entregue.
- Se normaliza a JPEG de calidad 0.95, conservando la orientación y la hoja completa, con un máximo de 4096 píxeles en el lado largo y 20 MB. No se aplican filtros de limpieza que puedan borrar marcas tenues.
- Se avisa de resolución baja, oscuridad, poco contraste y posible desenfoque. Son comprobaciones orientativas de la foto; no reconocen una hoja en vivo ni certifican legibilidad. Por eso no hay disparo automático basado en supuestas detecciones.
- La perspectiva, QR firmado, marcadores, duplicados y marcas dudosas se verifican en el lector del servidor. Una captura manual o un reintento no confirma calificaciones automáticamente.
- La deduplicación por SHA-256 detecta la misma imagen normalizada en la bandeja cuando el navegador dispone de Web Crypto. La identidad de las cartillas sigue validándose en el servidor.
- La linterna, enfoque continuo y resolución dependen de cámara y navegador. El permiso tardío después de cancelar se descarta y sus pistas se detienen.

## Referencias y verificación

Documentación primaria: [getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia), [takePhoto](https://developer.mozilla.org/en-US/docs/Web/API/ImageCapture/takePhoto), [capacidades y restricciones](https://developer.mozilla.org/en-US/docs/Web/API/Media_Capture_and_Streams_API/Constraints).

Las pruebas automatizadas usan un flujo de video real generado desde canvas, fotos sintéticas y peticiones HTTP multipart; cubren permisos denegados/tardíos, cámara/linterna, cierre de pistas, navegación, fotos nativas, duplicados exactos, reintentos con respuesta perdida y accesibilidad móvil. No sustituyen un piloto con el celular, papel e iluminación de la academia.
