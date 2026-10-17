# Nova Negocio 2.2.3 · Código, foto, carrito y avisos del dueño

## Instalar y activar

1. Instala **Nova_Negocio_2.2.3_Android.apk** sobre tu aplicación actual.
2. Entra a **Parámetros → Avisos en este teléfono**.
3. Toca **Actualizar registro de este teléfono** o **Activar avisos**. Acepta el permiso de Android si lo solicita.
4. Toca **Probar aviso en este teléfono**. Debe aparecer una notificación de Nova Negocio; esta acción no registra una venta.
5. Sincroniza el catálogo desde el dueño y desde los vendedores que usen la actualización.

Si el panel indica que Android desactivó los avisos, abre **Ajustes → Nova Negocio → Notificaciones** y habilita el canal **Ventas y vendedores**. El panel distingue el permiso del teléfono y el registro de avisos de la cuenta.

## Tu código 850066022962

La fuente pública consultada relaciona este código con **Venom Inferno de Dragon Pharma, sabor Dragon Lychee**.

- UPCitemdb respondió sin productos para ese código.
- Open Food Facts no tiene una ficha para ese código.
- Se encontró el código y la imagen en la ficha de Suplementos Mty.
- La nueva versión consulta también esta fuente y lleva incorporadas la relación verificada y su imagen de producto, para mostrarla cuando la tienda no responda.
- La imagen se presenta centrada sobre fondo blanco en la ficha y en el resultado del escaneo.
- La fuente publica **40/20 porciones**. Si tu ficha conserva **30 servicios**, la vista muestra ambas referencias para que puedas revisar la presentación. La foto y el código identifican el producto; las cantidades y los costos se registran en tu inventario.

Fuente: [Venom Inferno en Suplementos Mty](https://suplementosmty.com/products/venom-inferno-40-20-porciones). La relación de código y sabor se comprobó el 12-oct-2026.

## Stock y catálogo

En **Stock → Escanear producto**, la cámara se abre directamente. Tras leer un código, se cierra y aparece la ficha.

La consulta de información y foto en línea también se realiza cuando el producto ya está registrado. El botón **Buscar información y foto en línea** permite actualizar la consulta.

Se pueden leer códigos de barras del fabricante y SKU internos. Para los SKU que aún no coinciden localmente, se consulta por SKU/modelo; si hay una ficha local, también se aprovechan su nombre, marca y sabor. Una relación clara se puede guardar automáticamente. Las variantes que no puedan distinguirse se muestran para confirmar.

La búsqueda usa fuentes de códigos y fuentes comerciales de suplementos. Guarda resultados, comparte consultas repetidas, respeta límites de uso y conserva una referencia verificada para el Inferno indicado. Las tiendas pueden restringir su API; la aplicación respeta esa respuesta y utiliza las otras fuentes o la información verificada disponible.

Un SKU privado que no está relacionado con un producto y que no está publicado en las fuentes externas necesita una asociación inicial. La aplicación muestra el resultado de la consulta y permite elegir la ficha de tu catálogo.

## Ventas: agregar automáticamente

En **Vender**, una lectura de un código reconocido:

1. Identifica el producto.
2. Agrega **una pieza al carrito automáticamente**.
3. Cierra la cámara.
4. Muestra el producto agregado, su imagen disponible y las piezas que lleva el carrito.

Con un lector USB o Bluetooth configurado como teclado, toca **Buscar producto** y lee el código con **Enter** al final.

Al escanear otro producto se repite el flujo. Al abrir nuevamente la cámara y leer el mismo producto, se agrega otra pieza si hay disponibilidad.

Las lecturas respetan las existencias y las piezas ya agregadas al carrito. Un producto con cero disponibles muestra su ficha y permite al dueño registrar stock. Si la búsqueda en línea identifica un producto que todavía no está en tu catálogo, puedes darlo de alta con nombre, marca, sabor, presentación y foto disponibles, y confirmar precio y existencias.

## Avisos del dueño

Ahora hay un aviso de Android **al terminar de guardar una venta realizada por el dueño**, con el monto y la forma de pago. Este aviso se muestra en ese teléfono, también cuando la venta se guarda sin internet.

La venta debe quedar registrada correctamente para solicitar el aviso. Los cobros pendientes de la terminal se notifican cuando se confirma y registra la venta.

Para ventas enviadas por vendedores:

- Continúa el envío de la tienda al teléfono registrado del dueño mediante Expo y Firebase.
- La actualización vuelve a registrar el identificador del teléfono con su dispositivo actual.
- Al sincronizar una venta del vendedor, se puede mostrar un aviso local si no se había mostrado el aviso remoto.
- Se guarda un control de avisos ya mostrados para reducir duplicados.

Los permisos, la desactivación del usuario y el canal de Android se respetan. Los errores al mostrar un aviso no deshacen una venta registrada.

Los avisos de las ventas del dueño se incorporan en el APK. Para avisos remotos se utiliza la configuración de Firebase y el SQL 2.2 de la tienda. Los datos adicionales del catálogo de vendedores usan la actualización SQL del lector 2.2.2 que se entregó anteriormente.

## Comprobaciones

La comprobación de compilación TypeScript y la configuración Android terminaron correctamente. La consulta pública del código indicado y su imagen se revisaron. El resultado de la compilación y de la firma final se registra en **Nova_Negocio_2.2.3_Verificacion.json**.

La lectura física y la presentación de las notificaciones en tu teléfono requieren comprobarse al instalar y usar esta actualización. El botón de prueba permite revisar la notificación del sistema sin crear una operación comercial.
