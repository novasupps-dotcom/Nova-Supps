# Instalar Nova Negocio 2.2 en Android

Entrega: 12 de octubre de 2026. Versión 2.2.0, código Android 38.

## Archivo que debes instalar

**Nova_Negocio_2.2_Android.apk** es el APK final firmado con el certificado original de Nova Negocio. Utiliza este archivo para actualizar la app que ya tienes instalada.

## Instalación

1. Transfiere el APK final de esta entrega a tu teléfono Android.
2. Conserva la app 2.1 instalada. Abre el APK y acepta la actualización para mantener los datos de la app.
3. Si Android solicita permiso para instalar desde el navegador o el administrador de archivos, autoriza esa aplicación para esta instalación.
4. Abre Nova Negocio y confirma que aparece la versión 2.2.0.
5. En el dueño y cada vendedor, usa **Sincronizar ahora / Actualizar ahora**.
6. En el dueño, abre **Parámetros**; en el vendedor, abre **Cuenta**. Activa **Avisos en este teléfono** y acepta el permiso de notificaciones.

## Comprobaciones en teléfonos

- Crea una venta desde un vendedor y comprueba que el dueño reciba el aviso. Comprueba también el cierre de caja y una venta rechazada.
- En la búsqueda de productos, abre el lector de cámara. Un código válido debe añadir una pieza, respetar las existencias y evitar lecturas repetidas mientras permanece frente a la cámara.
- En Producto, comprueba la lectura del código y las opciones Fotos, cámara y Archivos.
- Realiza un cobro real con la terminal y comprueba **Ya cobré**.
- Revisa la tabla de cobros: pagos, abonos y devoluciones deben aparecer por su fecha real.

Estas comprobaciones requieren tus teléfonos y terminal. La entrega verifica el archivo Android y las pruebas de código; queda pendiente comprobar su funcionamiento con los dispositivos reales.

## Comprobación del archivo entregado

- Paquete: `com.novasupps.negocio`.
- Versión: `2.2.0`; código Android: `38`.
- Tamaño: 113839789 bytes (aproximadamente 114 MB).
- Firmas v1, v2 y v3: verificadas.
- Certificado: coincide con el APK 2.1 original.
- Alineación a 16 KB: verificada después de firmar.
- SHA-256 del APK: `4bd644e5912880e3e0494fdce482a33d33c7a7411b7e3a1b8133660d52e2b9af`.

Firebase y Expo están configurados, y la clave FCM V1 quedó asignada al paquete. El usuario confirmó que ejecutó el SQL 2.2 en Supabase.
