# Nova Negocio 2.2 · Correcciones y validación

Fecha: 12 de octubre de 2026. Versión de fuente: 2.2.0; Android versionCode 38.

## Correcciones aplicadas

- Se integró el avance 2.2 guardado en `wip_2.2_2026-10-12.tgz` con el proyecto 2.1.
- SecureStore se conecta antes de abrir la base. Las credenciales existentes se migran conservando sus valores. Cada escritura usa piezas nuevas y un índice final para conservar el valor anterior si se interrumpe; las piezas respetan 1800 bytes UTF-8. Una falla de escritura no guarda una credencial nueva en SQLite.
- Los tokens y preferencias de avisos quedan fuera del respaldo y se conservan al restaurar. Desactivar y cerrar sesión retiran el token del servidor; un retiro sin conexión conserva la información necesaria para reintentar.
- Avisos para dueño y vendedor, canales Android, recepción y apertura desde una notificación, sincronización y tarjeta Activar/Desactivar. Los seguimientos locales se programan a las 9:00, sin duplicados, fechas inválidas ni clientes archivados.
- SQL 2.2: registro restringido al teléfono autorizado, retiro del token, cambio de cuenta serializado y aviso al pasar una venta a revisión. Los fallos del envío no interrumpen las ventas.
- Lector con cámara en la cuadrícula de dueño y vendedor y en el código del producto; siete formatos, permiso, linterna, lectura continua y límite de existencias.
- Android permite Fotos, cámara y Archivos; optimiza las imágenes a JPG de máximo 1024 px en el runtime nativo nuevo.
- Actualizaciones al abrir y volver a la app, máximo cada 6 horas. Reinicio explícito con bloqueo durante el cobro o con un cobro pendiente.
- Pantallas del dueño separadas por ventas, inventario, clientes, equipo, cobros y parámetros. Nueva tabla de cobros, abonos y devoluciones por fecha real. Parámetros en cuatro secciones: Cobros, Ventas, Equipo, Datos y seguridad.
- Configuración SDK 55, plugins, ícono de avisos, runtime por appVersion, versión 2.2.0 / 38, canal preview y versiones locales de EAS.
- Script de refirma local con verificación de paquete, versión, certificado, alineación y firmas v1/v2/v3; rechaza sobrescribir un APK.
- Pruebas anteriores ajustadas para Windows: fotos sintéticas reproducibles y ejecutable de Python configurable.
- La comprobación TypeScript se limita a App.tsx, index.ts y src; las carpetas de versiones archivadas no interfieren y se conservan.

## Comprobaciones que pasaron

| Comprobación | Resultado |
| --- | --- |
| TypeScript (`npm run check`) | Correcto |
| Compatibilidad de dependencias Expo SDK 55 | Correcta |
| Pruebas unitarias (`npm test`) | 60 de 60 |
| Suites de interfaz y flujos | Las 16 correctas, incluidas secure, v22 y sql22 |
| Pantallas y formularios anteriores | 37 revisados |
| Función cobro-terminal | 9 pruebas con datos simulados |
| Script de refirma | 3 pruebas; herramientas Android simuladas, sin llave privada real |
| PostgreSQL embebido, instalación nueva y actualización desde 2.1 | Correcto; `net.http_post` simulado, sin avisos reales |
| Preparación nativa Android (`expo prebuild`) | Correcta, con Firebase sintético únicamente en la carpeta temporal |
| Empaquetado Android de JavaScript | Correcto; 810 módulos y 43 recursos |
| Compilación Hermes | Bytecode v96, generado correctamente |

La exportación integrada de Hermes encontró una restricción de escritura en la carpeta temporal de Windows. Se comprobó la misma salida exportando el JavaScript y compilándolo con el ejecutable Hermes del SDK en el espacio de trabajo autorizado. Se generó un bundle de prueba; esto no constituye un APK instalable.

## APK 2.2 generado y firmado

Expo y Firebase están configurados. El proyecto EAS es `832d4228-542d-4cee-a11a-cb304c1fda71`, cuenta `emmgamart`, paquete `com.novasupps.negocio`. La captura del usuario confirma la clave FCM V1 cargada y asignada al paquete. La comprobación local de configuración es correcta.

El usuario confirmó que ejecutó el SQL 2.2 en Supabase. La compilación EAS `911f218c-e48e-4a62-8eff-782e47c468c2` terminó correctamente y generó Android 2.2.0 / 38. El APK se descargó y se firmó localmente con la llave original de Nova.

- Archivo final: `Nova_Negocio_2.2_Android.apk`, 113839789 bytes.
- SHA-256 del APK: `4bd644e5912880e3e0494fdce482a33d33c7a7411b7e3a1b8133660d52e2b9af`.
- Certificado original confirmado y firmas v1, v2 y v3 verificadas.
- Paquete, versión y código verificados directamente en el manifiesto.
- Alineación de bibliotecas a 16 KB verificada después de firmar.

En Windows, zipalign 36 falló al reescribir el APK. Como el archivo de EAS ya pasaba la comprobación de alineación, se conservó esa estructura y se verificó de nuevo al terminar. El script ahora comprueba la alineación antes de reescribir. La comprobación de firmas incluye el rango 23+ para verificar v1; el mínimo real de la app sigue siendo Android API 24.

Pendiente en teléfonos: instalar encima de 2.1 y comprobar los avisos reales, cámara, fotografías y cobro con terminal. El agente no ejecutó SQL en producción ni publicó una función; `cobro-terminal` conservó su código.

El APK 2.1 se conserva. Su SHA-256 corresponde al indicado en el documento original: `a5e944b96d42259a8f88809d19364b67c83ba81adc21454768820191a73d8189`. La huella del certificado extraído de ese APK es `3b71f02d1463b877e7f20dd3141e150e10e5c60e40c2198ba98dadd10207ae94`.

La tarjeta de recompensas requiere definir sus reglas con el usuario; TestFlight requiere su cuenta Apple Developer. No se crearon respaldos adicionales de las carpetas anteriores ni se incluyeron llaves privadas en la fuente.

Guía siguiente: [COMPILAR_ANDROID_EAS.md](COMPILAR_ANDROID_EAS.md).
