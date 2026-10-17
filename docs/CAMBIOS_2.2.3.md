# Nova Negocio 2.2.3

- Búsqueda en línea de información y foto, incluso con una ficha local existente.
- Consulta de SKU/modelo para códigos que no sean GTIN; elimina el descarte anticipado de esos códigos.
- Fuente de suplementos por código/SKU y por nombre, marca y sabor, con comprobación de variantes.
- Relación verificada y foto de 850066022962: Venom Inferno, Dragon Pharma, Dragon Lychee.
- Foto de producto centrada sobre fondo blanco y alternativas de imagen si una dirección falla.
- Consulta con caché nueva, control de frecuencia por proveedor, cancelación al salir y reutilización de consultas repetidas.
- Lectura de cámara o teclado con Enter que agrega una pieza al carrito automáticamente en Ventas del dueño y del vendedor.
- Resolución en línea de códigos sin vincular, con asociación clara al producto existente y acceso a alta cuando haga falta.
- Aviso local al registrar una venta del dueño, después de completar la operación, para efectivo, transferencia y tarjeta confirmada.
- Aviso al sincronizar ventas de vendedores si no se había mostrado el aviso remoto.
- Registro de avisos asociado al dispositivo actual; actualización manual del registro desde Parámetros.
- Botón para probar el aviso del teléfono, sin registrar una venta.
- Detección del canal de ventas desactivado en Android y control de avisos duplicados.
- Las preferencias y el historial de avisos quedan vinculados al teléfono al respaldar y restaurar.
- Canal predeterminado Android: ventas.
- Versión 2.2.3, código Android 41. Proyecto Expo y configuración Firebase conservados.

## Estado

TypeScript y configuración Android: correctas.
Compilación Android: terminada en Expo, 74c4e385-d4aa-4b4e-a418-c8e775b324e7. APK firmado localmente con el certificado original; paquete 2.2.3 / 41, firmas v1/v2/v3 y alineación a 16 KB verificados.

SHA-256 del APK: `0d1ad2ddde6662f9566ae27feb014310fb93cf211cf34f28b4a78ea87703e42a`.
La consulta del código 850066022962 y la imagen de su variante se comprobaron en la fuente pública.
No se agregaron ni ejecutaron nuevas pruebas automatizadas.
Comprobación física del lector y de los avisos en el teléfono del usuario: pendiente.
