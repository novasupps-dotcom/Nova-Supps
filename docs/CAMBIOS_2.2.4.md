# Cambios de Nova Negocio 2.2.4

Fecha: 12 de octubre de 2026. Versión Android 2.2.4 / 42.

## Lector

- Ventana de confirmación de 2500 ms con código, cuenta regresiva y progreso visibles.
- Repeticiones de fotogramas del mismo código no reinician la cuenta regresiva. UPC/EAN equivalentes se consideran la misma lectura.
- La primera lectura nativa válida basta para completar la ventana; no se exige que el teléfono vuelva a emitir el mismo código.
- Un código diferente reinicia la confirmación. Cierre, botón Atrás y segundo plano cancelan la captura pendiente; desmontar la pantalla limpia los temporizadores.
- Una lectura confirmada ejecuta la identificación una sola vez. Los botones de reintento permiten volver a leer después de un error.
- El lector dentro de Producto abre la resolución completa, incluyendo consulta en línea, en lugar de copiar únicamente el número al borrador.
- Enter en un código/SKU del formulario de Producto abre el mismo flujo. Enter o cámara en Inventario por código no agregan la pausa usada para escribir manualmente dígito por dígito.

## Ficha y precio

- Producto existente: vista con la información local y precio de venta de solo consulta; la consulta pública de foto/datos continúa sin sustituir ese precio.
- Entrada desde escaneo: ficha precargada con foto, nombre, marca, SKU, presentación, sabor, precio y existencias. El producto queda fijo y el guardado comprueba que la entrada corresponde a la ficha escaneada y que sigue activa.
- El alta desde lector comprueba nuevamente la titularidad del código. Si otro paso ya vinculó ese código, se reutiliza la ficha existente y no se crea un duplicado ni se actualiza su precio.
- Los cambios deliberados de precio en Editar producto se mantienen.

## Compatibilidad

Se conservan el paquete com.novasupps.negocio, dueño y proyecto de Expo, configuración de Firebase, aviso local de ventas del dueño, búsqueda y foto verificada del Inferno, carrito, datos locales y firma original. No se modifican SQL, Edge Functions, cobro-terminal ni dependencias de la app.

## Comprobaciones de entrega

- Compilación TypeScript sin errores.
- Configuración Android local válida para 2.2.4 / 42.
- Pruebas automatizadas nuevas: no ejecutadas.
- Lectura y avisos en teléfono físico: pendientes de comprobar en el dispositivo.
- Compilación Android: terminada en Expo, 69d22b35-9329-4252-a1b5-da1f37e6cda6. APK firmado localmente con el certificado original; paquete 2.2.4 / 42, firmas v1/v2/v3 y alineación a 16 KB verificados.

SHA-256 del APK: `0daceee00becf2e02c721e7ca3b1509a6780ef5da7d71a4e40c5dbe76dfc9a5c`.
