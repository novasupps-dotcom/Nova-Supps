# Nova Negocio 2.2.2

- Cámara con una sola lectura: cierra automáticamente y abre la vista previa en Stock y Vender.
- Entrada directa a la cámara desde Stock y Catálogo.
- Lectura de SKU interno y código de barras del fabricante, también mediante lector que escriba el código y Enter.
- Vista previa con foto disponible, nombre, marca, SKU, presentación, sabor, precio y existencias.
- Consulta automática por GTIN válido a UPCitemdb, con Open Food Facts como segunda fuente.
- Caché local, consultas compartidas, cancelación al salir, frecuencia limitada y tiempo máximo de respuesta.
- Asociación automática a la ficha existente cuando la identidad coincide claramente; selección de coincidencias cuando hay variantes o dudas.
- Alta con nombre, marca, presentación, descripción y foto disponibles de la consulta en línea.
- Códigos adicionales por producto, sin reemplazar el principal ni el SKU. Los vínculos se auditan y se pueden retirar desde el detalle.
- Sincronización de los códigos adicionales y datos de vista previa para vendedores mediante una migración pequeña después del SQL 2.2.
- El servidor anterior sigue admitiendo sincronización con los campos que ya tiene; el dueño ve un aviso para habilitar los nuevos datos en vendedores.
- Conserva el proyecto Expo, Firebase, el sistema de avisos y la firma original.
- Versión 2.2.2, código Android 40. No requiere nuevas dependencias nativas.

## Estado de entrega

Comprobación TypeScript y configuración Android: correctas.
Compilación Android: terminada en Expo, 7c810a4c-a7f5-44c4-bcb6-50bfad07b451. APK firmado localmente con el certificado original; paquete 2.2.2 / 40, firmas v1/v2/v3 y alineación a 16 KB verificados.

SHA-256 del APK: `3beda890c9050a05a5e17c85482ce2b1ddbac76928bba75d3dc5b77253b0f4f8`.
No se agregaron ni ejecutaron nuevas pruebas automatizadas en esta actualización.
La actualización SQL de producción y la comprobación física en teléfonos están pendientes del usuario.
