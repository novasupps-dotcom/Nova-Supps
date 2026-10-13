# Validación 0.5

30 de septiembre de 2026. `npm run check` sin errores; `npm test` aprobó 24 pruebas, incluida la actualización idempotente del catálogo y transacciones históricas sin sobrescribir cambios locales. La interfaz guarda pantalla, navegación, carrito y borradores en SQLite.

La conciliación de fuentes comparó los 40 SKU del Excel con inventario, los 41 precios de lista del PDF y 43 imágenes extraídas. Carga inicial: 169 unidades, 16 vendidas y 153 restantes; 9 ventas, 12 renglones, 8 clientes, $5,257.00 vendidos y cobrados. Se incluye el gasto publicitario IL002 por $600.00. La glutamina de 1 kg no tiene cantidad ni costo confirmados.

VNS0009 se registra el 30/09 con entrega fechada el 29/09; la venta queda conciliada por renglón: NS-VIT-001 a $369 y NS-CAF-001 a $669, con total $1,038.00. Se conservan el folio y las fechas del Excel.

La comprobación estática del proyecto pasó TypeScript y las 24 pruebas de negocio. Se generó el APK firmado 0.5.0 para `com.novasupps.negocio` con Android SDK 36/JDK 17; `aapt` confirmó `versionCode 5` y `apksigner` confirmó la firma v2 con el certificado de Nova Supps. No se ejecutó biometría en teléfono físico ni simulador.
