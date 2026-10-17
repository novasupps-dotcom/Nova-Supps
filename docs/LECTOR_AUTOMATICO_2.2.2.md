# Nova Negocio 2.2.2 · Lector automático y vista previa

## Instalar

Instala **Nova_Negocio_2.2.2_Android.apk** sobre tu versión actual. El APK de esta entrega conserva la firma original de Nova Negocio y permite actualizar sin desinstalar la aplicación.

## Leer con la cámara

1. Entra a **Stock** o **Catálogo** y toca **📷 Escanear producto**. La cámara se abre directamente.
2. Apunta al código de barras del fabricante o a tu etiqueta con SKU.
3. Con una lectura válida, la cámara se cierra automáticamente.
4. Aparece la vista previa: foto disponible, nombre, marca, SKU, presentación, sabor, precio y existencias.
5. Usa **Agregar al stock** para registrar cantidad y costo, **Agregar una pieza al carrito** para vender, o **Ver detalle completo** para revisar la ficha.

Desde **Vender**, el botón de cámara también cierra el lector y abre una vista previa. La pieza entra al carrito al tocar **Agregar una pieza al carrito**.

Si el producto tiene cero existencias, su ficha sigue apareciendo y el dueño puede registrar una entrada. Si está archivado, aparece la opción de restaurarlo.

## Leer con un escáner USB o Bluetooth

Usa un lector configurado como teclado, con **Enter** al final de cada lectura.

- En la pantalla del lector, toca el campo **Código de barras o SKU interno**. El escáner escribe el código y el producto se identifica.
- En **Vender**, toca **Buscar producto**, lee la etiqueta y envía Enter. Se abre la misma vista previa.
- Se conservan ceros iniciales y códigos como texto. Un UPC y su EAN equivalente con cero inicial reconocen la misma ficha.
- Un lector de una dimensión puede leer las etiquetas de barras; la lectura de QR requiere un lector de dos dimensiones o la cámara.

## Cómo se identifica

| Situación | Resultado |
|---|---|
| El código de barras ya está guardado | Abre la ficha local inmediatamente. |
| El SKU interno coincide con una ficha | Abre ese producto inmediatamente. |
| El producto tiene un código adicional vinculado | Abre la misma ficha, conservando su código principal y su SKU. |
| Es un código del fabricante válido que aún no está vinculado | Consulta UPCitemdb; si hace falta, consulta Open Food Facts. |
| La ficha en línea coincide claramente con un producto existente | Guarda automáticamente la asociación y muestra el producto de tu catálogo. |
| Hay dudas de presentación, sabor o varias fichas posibles | Muestra coincidencias para confirmar la correcta una vez. |
| Se encuentra en línea y aún no existe en el catálogo | Muestra la vista previa y **Dar de alta con estos datos**. |
| No hay ficha en línea, falla la conexión o se alcanza el límite del proveedor | Permite buscar por nombre en tu catálogo, vincularlo una vez o crear la ficha. |

La asociación automática exige coincidencia de nombre, marca y los datos de presentación y sabor que existan en tu catálogo. El código leído se verifica contra el código devuelto por el proveedor.

Un SKU interno que aún no está guardado no tiene una relación pública universal con un producto. Se busca primero en tu catálogo; si hace falta vincularlo por nombre, esa relación queda guardada para las próximas lecturas.

**No todos los códigos del fabricante están publicados en las fuentes consultadas.** La aplicación usa la información disponible; no puede obtener el nombre de todos los productos solo a partir de los números de un código.

## Búsqueda más rápida

- Los códigos ya vinculados se reconocen localmente, también sin internet.
- Los resultados en línea se conservan hasta siete días; las búsquedas sin resultado, seis horas.
- Se conserva un máximo de 150 consultas recientes.
- Una pausa breve al escribir evita consultar por cada dígito.
- Las lecturas repetidas comparten la consulta y se limita su frecuencia.
- Cada proveedor tiene un tiempo máximo de respuesta; puedes volver a consultar desde la ficha.
- Los precios de venta y los costos se toman de tu negocio o los introduces al dar de alta. La consulta en línea aporta identidad y foto cuando están disponibles.

UPCitemdb ofrece consultas sin registro, con límites de uso. Su plan gratuito publica actualmente 100 solicitudes diarias combinadas y seis consultas de código por minuto. [Límites oficiales de UPCitemdb](https://www.upcitemdb.com/wp/docs/main/development/plan/).

Open Food Facts publica información aportada por su comunidad. En las fichas que usan esta fuente se muestra atribución y un enlace al producto. [Documentación de Open Food Facts](https://openfoodfacts.github.io/openfoodfacts-server/api/).

## Compartir con los vendedores

El lector del teléfono del dueño funciona al instalar este APK.

Para que los vendedores reciban **los códigos adicionales, presentación, sabor y fotos con dirección pública en línea**, realiza una sola actualización:

1. Abre el editor SQL de tu proyecto Supabase.
2. Pega el contenido de **Nova_Negocio_2.2.2_Lector_SQL.sql**.
3. Pulsa **Run**. Este archivo se aplica después del SQL 2.2 que ya ejecutaste.
4. Sincroniza desde el teléfono del dueño.
5. Instala 2.2.2 en los teléfonos de los vendedores y sincroniza su catálogo.

La actualización añade información de lectura al catálogo y conserva las ventas, existencias y permisos existentes. El vendedor puede reconocer productos y agregarlos a su carrito; el dueño administra altas, vínculos y entradas de inventario.

## Corregir una asociación

En **Ver detalle completo**, los códigos adicionales se muestran con **Quitar este código adicional**. El código principal se puede editar en la ficha del producto. Vincular un código conserva los demás códigos de esa ficha y evita usar un mismo código en productos diferentes.

## Comprobaciones de esta entrega

El código y la configuración Android compilaron correctamente. La verificación del APK final se registra en **Nova_Negocio_2.2.2_Verificacion.json**.

La lectura física con tu teléfono o lector USB/Bluetooth y la cobertura de tus productos en las fuentes externas deben comprobarse al usar la actualización. La actualización SQL se entrega para que tú pulses Run en Supabase.
