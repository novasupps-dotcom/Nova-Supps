# Nova Negocio 2.10.0 · 6-nov-2026

Hecho en 2.10.0: Excel de ventas con resumen ejecutivo y un renglón por producto de cada folio; reporte de stock en Excel
desde Stock; botón del carrito junto al engrane con animación al agregar.
Probar en el teléfono: Ventas → Excel (abrir Resumen y Ventas); Stock → «Reporte de stock (Excel)»; Vender → agregar productos
(ver el vuelo al carrito en Android y iPhone).


Hecho en 2.9.0: teclado que acomoda la pantalla al campo; regresar deja la pantalla donde estaba; Vender con ficha del
producto (imagen grande) y botón Agregar; cobro directo a la forma de pago; menos texto en Ventas, Stock, Clientes y Ajustes.
Probar en el teléfono: escribir en campos de abajo (Producto, Conteo, Cobro); Stock → producto → Atrás; Vender → tocar un producto.


Hecho en 2.8.4: cambiar la cantidad. Stock → producto → «Cantidad» (motivo «Se duplicó»: corrige sin merma, quita primero
lo más reciente). Al cargar Excel/PDF se puede cambiar la cantidad antes de aplicar.


Hecho en 2.8.3: punto de control al volver a cargar el mismo Excel o PDF: primero pide confirmar con
«Actualmente tienes X piezas y vas a agregar N piezas más del Pedido #… (archivo.pdf)».


Hecho en 2.8.2: el % de la terminal recalcula precios (comisión incluida); el Excel reconoce productos existentes por
descripción (con imagen reemplaza existencias, sin imagen suma piezas) y deja eliminar los que no vienen; repetidos en Stock.
Probar: Ajustes → Cambiar porcentaje. Ajustes → Actualizar catálogo con tu Excel original. Stock → «N productos repetidos».


Hecho en 2.8.1: eliminar productos en Stock (mantener presionado o desde el detalle); Cargar pedido y Actualizar catálogo
en 3 pasos con poco texto.
Probar: Stock → mantener presionado un producto → Eliminar. Stock → Cargar pedido: 1. Elegir PDF · 2. Revisar · 3. Cargar.

# Nova Negocio 2.8.0 · 4-nov-2026

Hecho en 2.8.0: Stock → Cargar pedido del proveedor (PDF): inventario, costo real, calculadora de precio con % de ganancia +
comisión de la terminal, sabores agrupados (se eligen al vender) y Resumen de ventas → Margen por producto y proyección.
Probar: cargar el PDF del pedido #0639469 → revisar coincidencias (Creatine GAT 1 kg debe sumar piezas), poner el %, elegir la
cuenta del pago → Cargar. En Vender, tocar «Psychotic Black · 60 Servicios» y elegir el sabor.

# Nova Negocio 2.7.1 · 4-nov-2026

Hecho en 2.7.1: ventana emergente y notificación cuando hay versión nueva; Ajustes → Actualizaciones → Buscar actualización ahora.
Probar: Ajustes debe decir 2.7.1; en la tarjeta Actualizaciones, «Buscar actualización ahora» debe decir que ya tienes la más reciente.

# Nova Negocio 2.7.0 · 4-nov-2026

Hecho en 2.7.0: en Actualizar catálogo, Quitar / Modificar / Unificar cada renglón (repetidos por sabor) y Deshacer;
al aplicar pregunta si suma la comisión de la terminal (4.06%) a los precios. Al aceptar, la comisión va dentro del precio y
ya no se suma al cobrar (también en vendedores). Ajustes → comisión permite regresar.
Probar: cargar el archivo, unificar los repetidos, Aplicar → «Sí, sumar y cargar»; revisar un precio en Vender y en un vendedor.

# Nova Negocio 2.6.1 · 4-nov-2026

Hecho en 2.6.1: Actualizar catálogo ya carga la columna Existencias (antes se ignoraba).
Probar: Ajustes → Actualizar catálogo → cargar el archivo de nuevo → la vista previa debe decir «Existencias: X → Y» → Aplicar.

# Nova Negocio 2.6.0 · 4-nov-2026

Actualización de JavaScript sobre el runtime nativo 2.2.4: llega sola a los teléfonos cuando GitHub la publica.

Hecho en 2.6.0:
- Ajustes → Actualizar catálogo: descargar el catálogo en Excel, editarlo y volver a cargarlo (.xlsx o CSV) con vista previa,
  errores por renglón, copia previa de los datos y publicación a vendedores.
- Firma administrada por Expo (docs/FIRMA_EXPO.md) y flujo «Compilar APK» en GitHub.
- «Actualizar teléfonos» vuelve a correr todas las pruebas (solo corría una) y publica solo Android.

PENDIENTE TUYO (una sola vez, ~10 min): docs/FIRMA_EXPO.md
1) Subir signing\nova-release.jks a Expo (eas credentials) y revisar la huella 3B:71:F0:2D…AE:94.
2) Subir google-services.json como variable de archivo GOOGLE_SERVICES_JSON en expo.dev.

Probar en el teléfono del dueño:
1. Ajustes debe decir «Nova Negocio 2.6.0».
2. Ajustes → Actualizar catálogo → Descargar catálogo en Excel. Cambia el precio de un producto y agrega uno nuevo.
3. Elegir archivo → revisa la vista previa → Aplicar. Revisa el precio en Vender y en el teléfono de un vendedor.

# Nova Negocio 2.5.3 · 17-oct-2026

Actualización de JavaScript sobre el APK nativo 2.2.4 (mismo runtime de expo-updates 2.2.4).
APK de respaldo: deliverables/Nova_Negocio_2.5.3_Android.apk · versión 2.5.3 / versionCode 51 · firma original 3b71f02d…ae94.
Se generó sobre la 2.5.2 con scripts/package_android_js_native.py. Desde la 2.5.3 las versiones llegan solas a los teléfonos (docs/ACTUALIZACIONES_AUTOMATICAS.md).

PASO ÚNICO EN SUPABASE (lo corres tú): SQL Editor → pega supabase/migrations/2.5.0_catalogos.sql → Run.
Crea el espacio público "catalogos" para los PDF. Sin esto, el catálogo se manda en texto y la app dice que falta.

CONFIGURACIÓN ÚNICA PARA ACTUALIZACIONES AUTOMÁTICAS (la haces tú, ~10 min): docs/ACTUALIZACIONES_AUTOMATICAS.md
1) Token de Expo como secreto EXPO_TOKEN en GitHub.  2) Git para Windows + doble clic en scripts\windows\instalar_subida_automatica.cmd.

Hecho en 2.5.3: actualizaciones automáticas (GitHub Actions + EAS Update); la app revisa cada 30 min y aplica la versión nueva al
volver a abrirla o tras 15 min fuera, nunca a media venta.

Hecho en 2.5.2: corregido «Property 'Buffer' doesn't exist» al enviar el catálogo o crear el PDF con fotos PNG.

Hecho en 2.5.1: Ajustes → Formas de pago → «Tú (dueño) · en tu carrito»: tocar una forma (p. ej. Transferencias) la quita
o la pone al cobrar. Siempre queda al menos una. Las ventas y saldos anteriores no cambian.

Hecho en 2.5.0:
- Catálogo para clientes: eliges al cliente (o escribes su número) y con un toque se abre su chat de WhatsApp con el
  enlace al PDF. La app avisa «Catálogo enviado a …», lo guarda en «Últimos envíos» y en la tarjeta del cliente.
  Atajo en Clientes (ícono de libro). Sin internet o sin el SQL 2.5: se manda el catálogo en texto.
- PDF con el estilo de la app: letra Inter, logo centrado, tarjetas redondeadas, 3 por renglón, todas las fotos
  (JPG, PNG con fondo transparente sobre blanco, WebP con el convertidor del teléfono) y agotados marcados.
- Ajustes → Formas de pago (antes «Datos para transferencia»): editar y eliminar cada cuenta, elegir quién la usa
  (tú y cada vendedor) y con qué cobra cada vendedor (efectivo, tarjeta, transferencia), todo en una página.

Hecho en 2.4.1: barra del carrito en una sola línea.

Hecho en 2.4.0 (UX premium, One UI 7 / iOS 26):
- Letra Inter, esquinas grandes, barra de pestañas flotante y logos centrados.
- Vender y cobrar en menos pasos (carrito, cliente, forma de cobro con botones grandes, «Cobrar $…»).
- Stock, Clientes y Ventas con accesos rápidos y tarjetas más limpias; detalle de venta con acciones en lista.

Hecho en 2.3.0 (rediseño minimalista estilo iOS):
- Fondo gris claro, tarjetas blancas, texto negro y el rojo del logo como único acento.
- Íconos de línea en lugar de emojis (src/icons.ts, scripts/make_icons.py).
- Cuatro pestañas con títulos grandes; Ajustes con el engrane de arriba (vendedor: Cuenta con el ícono de persona).
- Ajustes como lista agrupada con íconos; formularios como hoja con «Cerrar».


Hecho en 2.2.6 (fase 2 del rediseño):
- Ventas: resumen compacto, accesos en una fila, filtros deslizables y productos de cada venta a la vista.
- Parámetros: comisión, avisos y huella en tarjetas cortas; menús más compactos.
- Textos largos recortados; filtros en una sola fila en Clientes, Cobros, Reportes y Catálogo.
- Vendedor: caja más limpia y sin mensajes repetidos sin internet.
- Ícono, pantalla de inicio e ícono de avisos con el logo GGG · Nova Supps (scripts/make_brand_icons.py).

Hecho en 2.2.5:
- Lector con cámara rápido y claro (sin espera de 2.5 s, resultado y acciones en el lector, alta sin encimar ventanas).
- Reconocimiento de códigos: UPC-E, EAN/UPC/GTIN-14, GS1, Code 39, espacios y SKU sin guiones (src/barcodes.ts).
- Rediseño minimalista con los colores del logo oficial (src/theme.ts) y logotipo GGG · Nova Supps (src/brand.ts).
- Se quitaron Campañas, Oportunidades, Compañías, Ubicaciones y Paquetes (los datos viejos se conservan).

Pendiente en teléfonos:
1. Correr el SQL 2.5 (arriba). Instalar la 2.5.2 encima de la 2.5.1 y revisar que Ajustes (engrane) diga "Nova Negocio 2.5.2".
2. Mandar el catálogo a un cliente de prueba (tu propio número): debe abrir su chat con el enlace y el PDF debe abrir con fotos.
3. En Ajustes → Formas de pago, quitar/poner una cuenta a un vendedor y revisar que la vea (o no) al elegir Transferencia.
4. Probar el lector en Vender (cada lectura agrega una pieza), en Stock → Escanear producto y en Producto → Leer código.
5. Pendientes anteriores: cobro real con Ya cobré en modo normal; avisos en dueño y vendedores.
6. Confirmar el nombre de la tienda en comprobantes y catálogo: "GGG · Nova Supps".

En la próxima compilación nativa con EAS, app.json ya usa assets/logo/icono_app.png, native/splash.png y el color de avisos #D9252F.
