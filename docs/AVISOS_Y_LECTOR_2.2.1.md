# Nova Negocio 2.2.1 · Avisos y lector de inventario

## Activar y entender los avisos

1. En el teléfono del dueño, abre **Parámetros → Avisos en este teléfono**.
2. En cada teléfono de vendedor, abre **Cuenta → Avisos en este teléfono**.
3. Pulsa **Activar avisos**, acepta el permiso de Android y confirma el estado **Activos en este teléfono**.

La cuenta debe estar conectada y el teléfono autorizado. El registro corresponde al teléfono actual de cada cuenta. Al tocar un aviso, Nova abre y sincroniza los datos del negocio.

| Evento | Quién recibe el aviso |
|---|---|
| Una venta de vendedor llega a la base en línea | Dueño |
| Una venta pasa a revisión | Dueño |
| Un vendedor registra un cierre de caja | Dueño |
| Se crea una cuenta de vendedor | Dueño |
| El dueño rechaza una venta de un vendedor | Ese vendedor |
| Llega la fecha de próximo contacto de un cliente | Dueño, a las 9:00 |

Los avisos de ventas, cierres y cuentas pasan por internet. Si el vendedor trabaja sin conexión, el evento se produce cuando sincroniza la información con la base en línea.

Los seguimientos son recordatorios programados en el teléfono para las fechas futuras de los próximos 30 días; se programan hasta 40 recordatorios. Abre la app después de cambiar fechas para actualizar la programación.

Con la app en segundo plano, Android puede mostrar los avisos en la barra de notificaciones. El comportamiento de entrega depende de los permisos y la conexión. [Recepción de avisos en Android](https://firebase.google.com/docs/cloud-messaging/android/receive-messages).

## Escanear para dar de alta o agregar al stock

1. Abre **Stock → Alta / stock por código → Escanear código de barras**.
2. Apunta al código impreso en el empaque.
3. Elige la acción que corresponde:

| Resultado del escaneo | Acción |
|---|---|
| Producto registrado | Muestra nombre, imagen y existencias. Pulsa **Agregar al stock**. |
| Código nuevo | Pulsa **Dar de alta producto** para abrir la ficha con el código capturado. |
| Producto que ya existe con otro identificador | Elígelo y pulsa **Vincular código al producto**. |
| Producto archivado | Pulsa **Restaurar producto** antes de registrar una entrada. |

Para registrar una entrada, confirma **cantidad**, **costo por unidad** y **tipo de entrada**. **Inventario inicial** registra existencias sin mover dinero; **Compra pagada** descuenta el importe de la cuenta elegida. Las existencias se agregan al guardar.

Si eliges un producto que ya tiene otro código, la app muestra ambos códigos y pide confirmar **Reemplazar código y vincular**.

En la ficha del producto, el **código de barras del empaque** está visible en los campos principales. El SKU interno puede generarse automáticamente. El vínculo entre código y producto se guarda una vez; luego el lector reconoce esa ficha. Para un código nuevo, completa nombre, precio y demás datos de la ficha.

## Lector durante una venta

El lector junto al buscador de **Vender** agrega una pieza al carrito cuando hay existencias. Si el producto tiene cero piezas, ofrece **Agregar existencias a este producto**. Si el código es nuevo, ofrece **Dar de alta o vincular producto**.

La captura de Venom Inferno mostraba que la cámara sí leyó el código y encontró el producto; el aviso correspondía a la falta de existencias. La versión 2.2.1 añade las acciones de inventario desde ese resultado.

## Instalar la actualización

Instala **Nova_Negocio_2.2.1_Android.apk** sobre la app actual y acepta **Actualizar**. Mantén la app instalada para conservar sus datos. La versión nueva es **2.2.1**, código Android **39**, con el certificado original de Nova.

Después de instalar, sincroniza dueño y vendedores y realiza un escaneo en **Stock**. También puedes comprobar los avisos con una venta enviada desde un vendedor y un cierre de caja.
