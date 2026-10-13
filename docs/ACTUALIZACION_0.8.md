# Nova Negocio 0.8

## Instalación

Guarda un respaldo desde Más → Respaldo. Abre Nova_Negocio_0.8_Android.apk y elige Actualizar encima de la instalación existente. No desinstales ni borres sus datos. La migración guarda una copia interna previa y conserva cancelaciones, fotos propias y borradores. Si detecta un folio o cobro local incompatible, conserva la operación y muestra el pendiente en Datos importados.

## Conciliación del Excel revisado

| Concepto | MXN |
| --- | ---: |
| 11 ventas brutas | 5,409.00 |
| Efectivo | 1,116.00 |
| Transferencia | 3,374.00 |
| Tarjeta bruta | 919.00 |
| Comisión tarjeta | 37.30 |
| Tarjeta neta | 881.70 |
| Ventas netas | 5,371.70 |
| Costo vendido | 4,131.25 |
| Ganancia bruta | 1,277.75 |
| Ganancia después de comisión | 1,240.45 |
| Inversión local | 1,099.00 |

Comisión por cobro = redondear(importe × 4.06%, 2 decimales). Efectivo y transferencia no generan comisión. Es una deducción del cobro; no se añade automáticamente un recargo al precio del cliente. Cada abono con tarjeta genera solo su propia comisión. El margen bruto se calcula sobre venta bruta menos compra, antes de comisión y egresos.

Match por folio, SKU y fila del Excel. Los cobros se toman de P:R; S24/S25 conservan importes invertidos en la fuente, pero P:R y el total de VNS0009 cuadran: D3 + K2 $369, Coffee Fit $669, total $1,038. VNS0010 contiene una barra y una muestra; VNS0011 dos barras. Son 20 unidades entregadas y 149 restantes. El archivo fuente se leyó sin modificar sus fórmulas.

## Cambios y comprobación

Inicio abre Resumen de ventas; egresos abre Control Operativo. Stock y Detalle producto abren un carrito precargado. La comisión y el cobro neto aparecen antes de confirmar. Los precios por renglón de nuevas ventas quedan guardados. Las fotos originales están incluidas y se usan como respaldo si una foto local falla.

Pasan 29 pruebas de negocio, importación y rollback; prueba de interfaz con SQLite que recorre resumen, gastos, carrito, comisión visible, borrador tras reinicio y doble clic sin doble cobro. APK firmado con el certificado original, versión 8 / 0.8.0, arm64, Android 7 o posterior. No se realizó una instalación física en el teléfono durante esta entrega.

## Reproducir el APK con el runtime 0.6

Instalar dependencias con npm ci. Ejecutar:

```bash
NODE_ENV=production npx expo export:embed --entry-file index.ts --platform android --dev false --bytecode --max-workers 2 --bundle-output build08/index.android.bundle --assets-dest build08/res
python3 scripts/package_android.py /ruta/Nova_Negocio_0.6_Android.apk /ruta/build-tools/36.0.0
```

El paquete conserva las clases y bibliotecas nativas de 0.6; cambia el bundle, la configuración Expo y la versión del manifiesto. La firma privada del propietario está en signing, como en el proyecto entregado anteriormente; mantener el proyecto privado.
