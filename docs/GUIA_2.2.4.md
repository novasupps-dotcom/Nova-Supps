# Nova Negocio 2.2.4 — lector y ficha precargada

Fecha de preparación: 12 de octubre de 2026. Android: versión 2.2.4, código 42.

## Instalar

Instala `Nova_Negocio_2.2.4_Android.apk` sobre tu instalación actual. El instalador se firma localmente con el certificado original de Nova Negocio. Conserva la instalación existente y sus datos.

## Leer con la cámara

1. Abre **Escanear producto**, o el lector dentro de **Dar de alta** o **Vender**.
2. Apunta a un solo código de barras del empaque o etiqueta con SKU interno.
3. Cuando la cámara decodifique el código, verás el número, una barra de progreso y una confirmación de **2.5 segundos**. No hace falta retirar el producto ni escanearlo otra vez durante esa confirmación.
4. Las detecciones repetidas del mismo código, incluyendo UPC y EAN equivalentes, no reinician el reloj ni generan otra operación. Si se detecta un código diferente durante la confirmación, comienza una nueva ventana para ese código.
5. Al terminar, la cámara se cierra y se resuelve el producto. En **Vender**, un producto con existencias se agrega una sola vez al carrito por cada lectura confirmada. Para agregar otra pieza con la cámara, abre de nuevo el lector.

La ventana empieza con la primera lectura correcta que entrega la cámara. El tiempo de la consulta en línea depende de la conexión y de las fuentes disponibles. Si no aparece un número, acerca o aleja un poco el producto, evita reflejos y usa la linterna si es necesario.

Cerrar el lector o pasar la app a segundo plano cancela una captura que todavía está en la cuenta regresiva. Una venta o entrada ya confirmada se conserva.

## Producto que ya tienes

- Se abre inmediatamente su ficha guardada: foto disponible, nombre, marca, SKU, presentación, sabor, precio y existencias.
- El código puede ser el principal, un código adicional vinculado o el SKU interno. Se reutiliza la misma ficha.
- El precio de venta se muestra como **solo consulta** en este flujo. Los datos de una tienda en línea no sustituyen tu precio.
- **Agregar al stock** abre una entrada con la ficha precargada y su precio registrado. Captura cantidad, costo de compra, ubicación y caducidad según corresponda. La entrada suma existencias sin modificar el precio de venta.
- **Agregar una pieza al carrito** usa el precio del catálogo y la configuración habitual de comisiones. El lector no modifica la lista de precios.
- Los cambios deliberados de precio siguen disponibles en **Catálogo → Editar producto**.

## Producto nuevo

Si el código no está vinculado, la app consulta las fuentes disponibles en línea. Una coincidencia clara con un producto de tu catálogo permite asociar el código a esa ficha. Cuando hay varias presentaciones posibles, se muestran para elegir la correcta.

Solo un producto nuevo llega al formulario de alta con los datos públicos encontrados. En ese caso introduces su precio de venta y, si aplica, stock inicial y costo. Si el código ya se vinculó mientras estabas preparando el alta, se abre la ficha existente para conservar el producto y su precio.

## Lector USB o Bluetooth

El lector debe enviar el código como texto y terminar con **Enter**. En **Inventario por código** y en los campos de código/SKU del formulario de producto, Enter abre el mismo flujo de identificación. El lector externo no espera los 2.5 segundos de confirmación de la cámara.

## Notificaciones

Esta actualización conserva los avisos de ventas y la opción **Probar aviso en este teléfono** de la versión 2.2.3. Activa los avisos desde la tarjeta de notificaciones y permite las notificaciones de Nova Negocio en Android.

No hay una nueva migración de base de datos para la 2.2.4. Los avisos remotos usan la configuración 2.2 existente; la sincronización de códigos y datos del lector entre dueño y vendedores usa la actualización SQL 2.2.2 ya entregada. Si no la has ejecutado, ese paso sigue pendiente.

## Revisión en tu teléfono

Después de instalar, puedes comprobar la lectura del Inferno `850066022962`, un SKU interno ya registrado, su ficha y precio, una entrada de stock y una lectura desde Ventas. La respuesta óptica de tu teléfono queda pendiente de comprobar en el equipo físico.

## Referencias

La cámara usa el evento de lectura nativa documentado por [Expo Camera SDK 55](https://docs.expo.dev/versions/v55.0.0/sdk/camera/); la ventana de confirmación de 2.5 segundos pertenece a Nova Negocio.
