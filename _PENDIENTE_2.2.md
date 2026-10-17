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
