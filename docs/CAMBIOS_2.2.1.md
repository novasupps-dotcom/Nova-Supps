# Nova Negocio 2.2.1 · Alta y stock por código

Fecha: 12 de octubre de 2026. Versión 2.2.1 / Android 39.

## Cambios

- Nuevo formulario **Inventario por código**, disponible en Stock y Catálogo.
- Producto conocido: muestra ficha y existencias, y abre Entrada con el producto identificado.
- Código nuevo: permite crear una ficha con el código capturado o vincularlo a un producto existente.
- Producto archivado: permite restaurarlo antes de registrar existencias.
- Lector de ventas del dueño: ofrece una acción de alta o entrada cuando falta el producto o sus existencias.
- Código de barras visible en los campos principales del producto. El SKU interno conserva su generación automática.
- Compatibilidad entre UPC-A y EAN-13 con cero inicial cuando el identificador tiene un dígito de control válido.
- La validación evita asignar un mismo identificador a dos productos, incluidos identificadores heredados del SKU.
- Vincular el código y registrar la entrada ocurre en una transacción; una entrada fallida revierte el vínculo nuevo.
- La entrada requiere cantidad entera positiva y un costo explícito. La app permite escribir 0 para existencias recibidas sin costo.
- El producto de una entrada abierta desde un escaneo queda seleccionado para ese código.
- La tarjeta de avisos explica los eventos y los destinatarios según dueño o vendedor.

## Comprobaciones de esta actualización

La comprobación TypeScript y la configuración Android terminaron correctamente. Expo terminó la compilación f1a701cc-94d8-44d5-9651-ff0e8f8f5b81 con versión 2.2.1 / 39. El APK fue firmado localmente con el certificado original y pasó la verificación de paquete, versión, firmas v1/v2/v3 y alineación a 16 KB.

Archivo: Nova_Negocio_2.2.1_Android.apk. SHA-256: `bb29b51eaa79883f0287c46a11a402d3be75edc1a9615c9e34a9812dffff6d58`.

La comprobación en teléfonos queda a cargo del usuario: alta por código, vínculo con una ficha existente, entrada de stock, venta y recepción real de avisos. En esta actualización no se añadieron ni ejecutaron pruebas automatizadas nuevas.

Guía de uso: [AVISOS_Y_LECTOR_2.2.1.md](AVISOS_Y_LECTOR_2.2.1.md).
