# Nova Negocio - 2.10.12

**2.10.12 - Renderizado nativo instantáneo de imágenes en todas las pantallas (`Vender`, `Stock`, `Detalle producto`, `Editar producto`, `Carrito`, `Vendedor` y `Catálogo PDF`) con caché en memoria, downsampling nativo (`resizeMethod="resize"`), sin parpadeos (`fadeDuration={0}`) y cero impacto en base de datos (versionCode 74, solo JavaScript).**

App de GGG · Nova Supps para Android e iPhone (Expo / React Native / SQLite): catálogo, inventario por lotes, ventas, caja, clientes y vendedores con su propio teléfono (Supabase). El teléfono del dueño es la caja central; los vendedores venden contra el catálogo y las existencias que el dueño publica.

**2.10.6 · Rediseño minimalista FODA: semáforo FEFO en sabores, venta cruzada «Stacks Nova Supps», tablero de meta en vendedor y jerarquía visual limpia (versionCode 68, solo JavaScript):**

- **Semáforo FEFO en selector de sabores y cuadrícula**: los productos o sabores con lotes que vencen en $\le 45$ días muestran la insignia `Prioridad · vence pronto` y se ordenan primero al abrir la familia de sabores en `Vender`.
- **«Stacks Nova Supps» (venta cruzada 1-toque en carrito)**: al cobrar en `Venta`, sugiere en una píldora compacta un suplemento complementario con existencias (`⚡ Stack sugerido: ＋ ...`) para agregarlo con un toque.
- **Tablero minimalista de meta diaria para el vendedor**: en `Mis ventas` de la app del vendedor se muestra el avance porcentual hacia la meta diaria con barra de progreso, piezas vendidas y ticket promedio.
- **Rediseño minimalista con orden y jerarquía**: eliminación de descripciones largas en `Ajustes`, textos redundantes (`<Note>`) en formularios, `Resumen de ventas`, `Corte de caja`, `Gastos operativos`, `Respaldo` y `Formas de pago`; barra inferior de acciones en `Vender` convertida a botones de texto ligeros; tarjetas de `Stock` y `Detalle producto` agrupadas por jerarquía visual.

**2.10.5 · Aplicación de hallazgos de mercado: calculadora de cambio, descuento directo, venta en espera, recompra automática, días de inventario, Kardex y comparativa de periodo (versionCode 67, solo JavaScript):**

- **Calculadora de cambio rápido en efectivo y descuento directo**: botones rápidos de billete recibido (`Exacto`, `$100`, `$200`, `$500`, `$1,000`) con cálculo instantáneo de cambio al cobrar en efectivo, y chips de descuento directo (`5% desc.`, `10% desc.`, `$50 desc.`, `$100 desc.`) en la hoja de cobro.
- **Venta en espera y recordatorio inteligente de recompra**: botón `Poner en espera` dentro del carrito para pausar una venta y retomarla después en `Vender`; selector rápido de recordatorio de recompra (`Recompra 25d / 45d`, `15 días`, `30 días`) al vender a un cliente.
- **Días de inventario (velocidad 30d), Kardex por producto y comparativa de ventas**: indicador de ritmo de venta de los últimos 30 días y días de cobertura en `Stock`; tarjeta auditable `Kardex · Historial de movimientos` en `Detalle producto`; comparativa porcentual contra el periodo previo (`% vs. periodo previo`) en `Ventas → Resumen de ventas`.

**2.10.4 · Carrito unificado sin barra negra, sabores agotados ocultos en tarjeta, filtros en Ventas, pop-up de seguimientos y diseño responsive (versionCode 66, solo JavaScript):**

- **Carrito unificado sin barra negra inferior**: se elimina por completo la barra negra inferior (`s.cartBar`) en la app del dueño y del vendedor; todo el acceso al carrito y cobro vive unificado en el botón superior del carrito (`CartButton`).
- **Sabores agotados ocultos en ficha de producto**: al abrir un producto con varios sabores en `Vender`, se ocultan los sabores sin existencias disponibles para mostrar únicamente los sabores listos para vender.
- **Limpieza de botones sin uso**: se oculta el botón `i` en productos individuales sin descripción, se oculta `Al carrito` en `Stock` cuando el producto no tiene existencias, y se ocultan acciones de `WhatsApp` / `Catálogo` en clientes sin teléfono válido.
- **Filtros avanzados en Ventas**: nuevos filtros en `Ventas` por `Tipo de suplemento` (categoría), `Marca` y `Producto`, además de búsqueda directa por producto, marca o categoría.
- **Pop-up interactivo de seguimientos**: los seguimientos pendientes se abren en un pop-up con acciones directas (`WhatsApp`, `Vender`, `+7 días`) y botón para eliminar/descartar la notificación individualmente o todas a la vez.
- **Diseño responsive**: cuadrícula adaptable de 1 a 5 columnas según el ancho de pantalla, barra de pestañas centrada con ancho máximo en tablets y tarjetas flexibles en todas las pantallas.

**2.10.3 · Auditoría integral del mini-ERP: motor SQLite perezoso, reportes integrados, cobros nativos y UX intuitiva (versionCode 65, solo JavaScript):**

- **Motor y rendimiento**: carga perezosa (`lazy getters`) en `load(b)` para lotes, renglones de ventas, pagos por cuenta y métricas; eliminación de lectura duplicada de metadatos en `saleDetail()`; mapas $O(1)$ (`basketQtyMap` / `cartQtyMap`) para cantidades del carrito; eliminación de estilos muertos y llamadas redundantes a `b.stock()`.
- **Módulos y UX**: indicador de cliente activo en `Vender` al iniciar venta desde `Clientes`; integración de reportes completos (por producto con orden por ` / piezas / ganancia, por vendedor y promociones) directo en `Ventas → Resumen de ventas`; redirección directa de `Catálogo` a `Stock`; filtros en `Lotes` (`Con existencias`, `Próximos 60 días`, `Agotados`, `Todos`); tarjetas de `Clientes` táctiles en toda su área; vista móvil nativa sin desplazamiento horizontal de 930px en `Cobros`; ícono «i» resaltado en productos con descripción; búsqueda sin acentos en `Stock` del vendedor.
- **Textos y microcopia**: reducción de notas redundantes en formularios de producto, corte de caja, ajustes y carrito del vendedor.

**2.10.2 · Píldoras flotantes, cuadrícula directa sin botón «Agregar» inicial y optimización general (versionCode 64, solo JavaScript):**

- **Sin barras horizontales fijas**: la barra inferior del carrito y los avisos pasan a ser píldoras flotantes compactas (los avisos se cierran al tocarlos y duran menos; el carrito flotante solo aparece en Vender y Stock); el aviso de versión nueva se puede ocultar con «Después» o «×».
- **Vender directo al tocar**: se elimina el botón «＋ Agregar» / «＋ Sabor» fijo en las tarjetas de productos; tocar la tarjeta agrega directo al carrito (y muestra «− cantidad +» solo cuando ya llevas piezas), y el ícono «i» (o mantener presionado) abre la ficha del producto.
- **Optimización y limpieza**: se quita el botón flotante redundante «＋ Venta», se memorizan el filtrado y la agrupación de sabores en la cuadrícula y se evita normalizar búsquedas vacías en listas.

**2.10.1 · Sin aviso al registrar la venta y cantidad editable desde Stock (versionCode 63, solo JavaScript):**

- **Venta registrada**: ya no aparece la barra horizontal de aviso al registrar una venta (dueño y vendedor); solo vibra. Si la venta del vendedor queda pendiente de enviar, sí avisa.
- **Stock → cambiar la cantidad**: botón de cajas en cada producto de la lista; abre el ajuste con el motivo «Corrección» (no mueve dinero ni cuenta como merma). Para merma sigue «Conteo».
- **Editar producto**: nuevo campo «Existencias (piezas)»; al guardar corrige la cantidad (sin merma).

**2.10.0 · Reporte financiero ejecutivo, renglón por producto, reporte de stock y animación del carrito (versionCode 62, solo JavaScript):**

- **Excel de ventas · Resumen ejecutivo**: indicadores clave (ventas, utilidad y margen, ticket promedio, piezas, cobrado, por cobrar, canceladas), estado de resultados, flujo de dinero, top 5 productos y participación (%) por forma de cobro, vendedor y categoría, con títulos y secciones en negritas.
- **Excel de ventas · hoja Ventas**: un renglón por producto de cada folio (columna «Renglón», p. ej. «1 de 3») con piezas, precio, importe, costo y utilidad del producto. Lo que es de toda la venta (total, cobros, comisiones, utilidad) va solo en el primer renglón del folio para que los totales cuadren. Se quita la hoja «Productos vendidos» (ya está en Ventas). «Por producto» y «Por vendedor» ahora salen en pesos (antes en centavos).
- **Stock → «Reporte de stock (Excel)»**: resumen (valor a costo y a precio, utilidad potencial, alertas de sin stock / bajo mínimo / caducidad, por categoría, top 10 por valor), hoja Stock por producto (disponibles, apartadas, estado, costo promedio, margen, vendidas en 30 días, días de inventario, caducidad más próxima), «Por reabastecer» y «Lotes» (`src/stockExcel.ts`).
- **Carrito animado**: botón del carrito con contador junto al engrane de Ajustes (y junto a Cuenta en la app del vendedor). Al agregar un producto, el carrito vuela desde donde tocaste hasta el botón, que rebota.

**2.9.0 · Teclado, regresar al mismo lugar, ficha del producto y cobro directo (versionCode 61, solo JavaScript):**

- **Teclado**: en Android (pantalla completa) la pantalla deja el espacio del teclado y se desplaza al campo donde escribes, en las pantallas, formularios y la app del vendedor (`src/keyboard.ts`).
- **Regresar**: al volver a la pantalla anterior queda donde estabas (por ejemplo, en el producto que editaste).
- **Vender**: tocar un producto abre su ficha (imagen grande, sabores, descripción, precio y existencias); el botón «＋ Agregar» agrega sin abrirla; «Cobrar» desde la ficha lleva directo al cobro. La descripción también llega a los vendedores.
- **Cobro directo**: total y forma de pago arriba, productos en compacto, «＋ Cliente y más opciones»; «Recibes / ganas» (solo dueño) detrás de un toque. En la app del vendedor, el mismo orden.
- **Menos texto**: detalle de venta (productos y cobros en corto), tarjetas de Stock (sin «Cliente paga» cuando es igual), Clientes (seguimiento y catálogo en una línea), Ajustes (cobros).

**2.8.4 · Cambiar la cantidad (inventario duplicado) (versionCode 60):**

- **Stock → producto → Cantidad**: escribe cuántas piezas tienes de verdad. Con el motivo «Se duplicó» no es merma: se quitan primero las piezas cargadas más recientemente (las duplicadas), no mueve dinero y no baja tu utilidad (movimiento «correction»). Los demás motivos del Conteo siguen contando como merma.
- **Al cargar**: en el Excel, cada producto que ya existe tiene «Cantidad» para cambiar las piezas antes de aplicar (y «Modificar» ya incluye Agregar piezas). En el PDF, al tocar un producto se puede cambiar la cantidad de cada sabor (0 = no se carga); el costo por pieza no cambia.

**2.8.3 · Punto de control al volver a cargar (versionCode 59):**

- **Punto de control**: si el Excel o el PDF ya se cargó antes (misma huella del archivo o mismo número de pedido), antes de cualquier otra cosa pide confirmar: «Actualmente tienes X piezas y vas a agregar N piezas más del Pedido #… (archivo.pdf)». En la revisión, cada producto existente dice «Tienes X · +N».

**2.8.2 · Comisión que recalcula precios, Excel que reconoce lo que ya tienes y repetidos (versionCode 58):**

- **% de la terminal**: con la comisión dentro del precio, cambiar el % en Ajustes recalcula todos los precios solos (se quita la comisión anterior y se suma la nueva; los precios en pesos cerrados se quedan cerrados) y se publica a los vendedores.
- **Actualizar catálogo**: un renglón sin SKU se reconoce por descripción (marca, tipo de suplemento, presentación y sabor). Lo que ya existe viene confirmado (se puede desmarcar o decir «No es»): con imagen, sus existencias quedan como en el archivo («se reemplazará»); sin imagen, solo se suman las piezas. Sus datos (nombre, precio) no se tocan. Los parecidos preguntan «¿Es tu…?».
- **No vienen**: los productos de la app que no están en el archivo se muestran y se pueden eliminar (uno o todos); con ventas se archivan.
- **Repetidos en Stock**: aviso «N productos repetidos · Revisar»; «Unificar aquí» junta las piezas (con su costo y caducidad, sin contar como merma) y elimina los otros.

**2.8.1 · Eliminar productos y flujos en 3 pasos (versionCode 57):**

- **Eliminar producto** en Stock: mantener presionada la tarjeta, o desde su detalle. Sin ventas se borra por completo (lotes, movimientos, ficha y promociones de ese producto); con ventas se archiva (Stock → Archivados) para no perder el historial. Las compras ya pagadas no cambian. También se quita del catálogo en línea de los vendedores (`publish` borra los que ya no existen).
- **Cargar pedido (PDF)** y **Actualizar catálogo** en 3 pasos con indicador (1 · 2 · 3), mínimo texto: 1) elegir archivo, 2) revisar (un renglón por producto; el detalle de la calculadora queda detrás de un toque), 3) cargar/aplicar (cuenta del pago o si se suma la terminal), sin ventanas de confirmación extra.
- Tarjeta «Margen y proyección» más breve.

**2.8.0 · Cargar pedido del proveedor en PDF (versionCode 56, solo JavaScript sobre el runtime 2.2.4):**

- Stock → **Cargar pedido del proveedor (PDF)** (también en Ajustes → Cargar pedido): se elige el PDF del pedido de Suplementos GYM («Imprimir pedido» → Guardar como PDF). La app lo lee en el teléfono (`src/pdfText.ts`: lector de PDF propio, sin módulos nativos) y obtiene productos, sabores, precio, cantidad, descuento, envío y total; comprueba que la suma cuadre con el Sub-total y las piezas con «Productos Pedidos (N)».
- **Coincidencias:** cada renglón se busca por marca + nombre + presentación (gramos, kilos, libras y servicios normalizados) + sabor. Si existe, solo suma piezas; si hay un parecido dudoso, lo propone y decide el dueño («¿Es este?» / «No es este»). La app recuerda lo que el dueño ligó para el próximo pedido. El mismo número de pedido no se carga dos veces sin confirmarlo.
- **Nuevos con SKU homologado:** `NS-<CAT>-<NNN>-<SABOR>` (por ejemplo `NS-PRE-011-GRA`), categoría deducida (Preentreno, Creatina, Proteína, Carbohidratos…), nombre «Producto · Marca · Presentación · Sabor».
- **Costo real por pieza:** precio del PDF × (Total pagado ÷ Sub-total), o sea con su parte del descuento y del envío. Es interno: los vendedores nunca lo ven.
- **Calculadora de precio:** % de ganancia sobre el costo (se recuerda) + comisión de la terminal (4.06%), redondeado hacia arriba al peso; muestra comisión, lo que te queda y la ganancia real por pieza, y cada precio se puede cambiar. En productos existentes se elige «Mantener precio actual» o «Precio nuevo».
- **Pago:** se pide de qué cuenta salió el pago del pedido (o «No registrar pago»); una sola salida por el total.
- **Sabores:** los sabores del mismo producto quedan agrupados (familia, también publicada a vendedores en `scan_data.family`); en Vender se ve una sola tarjeta y al tocarla se elige el sabor y las piezas.
- **Resumen de ventas → Margen por producto y proyección** (solo dueño): costo, precio al cliente, comisión, ganancia por pieza y ganancia proyectada si se vende todo lo que hay.

**2.7.1 · Aviso de versión nueva (versionCode 55):** cuando una versión se descarga aparece una **ventana emergente** «Nueva versión lista» (Instalar ahora / Después) y una **notificación del teléfono** (canal «Actualizaciones de la app», si las notificaciones están permitidas), una sola vez por versión. La app busca al abrirla, al volver a ella (mínimo cada 5 min) y cada 10 min mientras está abierta. Ajustes (dueño) y Cuenta (vendedor) tienen **Actualizaciones**: versión, «Buscar actualización ahora», última revisión y datos de diagnóstico (canal, runtime, versión del APK o descargada). `app.config.js` omite `google-services.json` cuando no existe (publicación desde GitHub), así la actualización lleva su número de versión.

**2.7.0 · Arreglar renglones y comisión en el precio (versionCode 54, solo JavaScript sobre el runtime 2.2.4):**

- Actualizar catálogo: cada renglón de la vista previa se puede **Quitar** (no se carga), **Modificar** (nombre, SKU, categoría, precio, sabor, existencias, código y costo, desde la app) o, si se repite (por ejemplo, el mismo producto en varios renglones por sabor), **Unificar** con el primero: suma existencias y junta los sabores («Chocolate, Vainilla»). También «Unificar repetidos» y «Quitar errores» para todos, y «Deshacer».
- Comisión de la terminal: al cargar, la app propone sumar el 4.06% a los precios del archivo (interruptor con ejemplo) y lo confirma al aplicar («Sí, sumar y cargar» / «No sumar»). Al aceptar, el precio del catálogo **incluye** la comisión y al cobrar ya no se suma (dueño, vendedores y servidor: se publica `fee.bps = 0`); los productos sin precio en el archivo también suben, para que el cliente pague lo mismo. El gasto de comisión de tarjeta se sigue registrando con la tasa de Mercado Pago. Ajustes → comisión muestra el modo y permite regresar («Sumar la comisión al cobrar»), ajustando los precios. Con la comisión en el precio, el Excel descargado trae «Precio sin comisión». Código: `Business.feeInPrice/upliftBps/setFeeInPrice`.

**2.6.1 (versionCode 53):** en Actualizar catálogo, la columna **Existencias** ahora carga las piezas (antes era solo informativa y se ignoraba): deja ese número como un conteo (sube con el Costo unitario o el último costo, baja por caducidad más próxima, sin mover dinero). Si el número es el mismo que traía el Excel al descargarlo, no se toca, para no deshacer ventas hechas después. También acepta encabezados como «Existencia», «Stock», «Inventario», «Cantidad» o «Piezas».

**2.6.0 · Actualizar catálogo desde Excel y firma en Expo (versionCode 52, solo JavaScript sobre el runtime 2.2.4):**

- Ajustes → **Actualizar catálogo**: descarga tu catálogo en Excel, cámbialo (precios, nombres, categorías, códigos de barras, marca, sabor, presentación, descripción, activo) o agrega productos nuevos, y vuelve a cargarlo (.xlsx o CSV). La app muestra los cambios y los errores por renglón antes de aplicar, guarda una copia de tus datos, aplica todo en una sola transacción y publica el catálogo a los vendedores. «Agregar piezas» suma existencias como lote nuevo sin mover dinero. Nunca cambia ventas, cobros ni costos anteriores. Código: `src/catalogImport.ts` (lector de Excel/CSV sin dependencias nuevas, usa fflate) y `src/screens/CatalogImport.tsx`; pruebas en `tests/catalogImport.test.ts` y `tests/catalogui.cjs`.
- **Firma administrada por Expo:** la llave original se sube una vez a EAS y Expo firma el APK (sin `resign_apk.py`). `eas.json` usa credenciales remotas en preview y production, `app.config.js` toma `google-services.json` de la variable de archivo `GOOGLE_SERVICES_JSON` de EAS y el flujo **Compilar APK** (`.github/workflows/compilar-apk.yml`) compila desde GitHub. Pasos en `docs/FIRMA_EXPO.md`.
- Correcciones: «Actualizar teléfonos» volvía a correr solo `tests/v17.cjs` (sin TypeScript, sin revisar la configuración ni las otras 17 pruebas) porque la primera publicación falló por falta de `openpyxl`; ahora instala `openpyxl`, corre todas las pruebas y publica solo Android. Permisos duplicados en `app.json`. Acciones de GitHub actualizadas (Node 20 ya no se admite) y runner fijo `ubuntu-24.04`.

**2.5.3 · Actualizaciones automáticas (versionCode 51):** cada versión llega sola a los teléfonos. La PC la sube a GitHub (`scripts/windows/`), GitHub Actions corre las pruebas y publica con EAS Update (canal `preview`), y la app la descarga y la aplica al volver a abrirla, nunca a media venta. Configuración única y detalles en `docs/ACTUALIZACIONES_AUTOMATICAS.md`.

**2.5.2 (versionCode 50):** corrige «Property 'Buffer' doesn't exist» al mandar el catálogo con fotos PNG (Hermes no tiene Buffer): toda conversión a JPG pasa por `encodeJpegBytes` de `src/photos.ts`, una foto que falla ya no detiene el catálogo y `tests/hermes.cjs` prueba el envío completo sin Buffer.

**2.5.1 (versionCode 49):** en Ajustes → Formas de pago, el dueño elige qué formas de cobro aparecen en su carrito (por ejemplo, quitar «Transferencias»); las ventas y saldos anteriores no cambian. Se guarda en el ajuste local `hiddenPayAccounts`.

**2.5.0 · Catálogo por WhatsApp y Formas de pago (versionCode 48, solo JavaScript sobre el APK nativo 2.2.4):**

- Catálogo para clientes: se elige al cliente (o se escribe su número) y con un toque se abre su chat de WhatsApp con el enlace al PDF, que la app sube al espacio público `catalogos` de Supabase (`Cloud.uploadPublic`). La app avisa, guarda el envío (`catalogSends`) y lo muestra en la tarjeta del cliente. Sin internet o sin el SQL 2.5, se manda el catálogo en texto.
- **Una sola vez:** correr `supabase/migrations/2.5.0_catalogos.sql` en el SQL Editor de Supabase (crea el bucket público y deja subir solo al dueño). `supabase/schema.sql` ya lo incluye para instalaciones nuevas.
- PDF con el estilo de la app (`src/catalogPdf.ts`, `src/pdf.ts`): Inter incrustada (TrueType), esquinas redondeadas, logo centrado, 3 tarjetas por renglón, compresión Flate y todas las fotos: JPG, PNG con transparencia sobre blanco (`src/png.ts`) y otros formatos con el convertidor del teléfono.
- Ajustes → **Formas de pago**: editar, eliminar y asignar cada cuenta (tú y cada vendedor) y elegir con qué cobra cada vendedor, en una página.

**2.4.1 (versionCode 47):** barra del carrito en una sola línea en teléfonos angostos.

**2.4.0 · UX premium: One UI 7 / iOS 26 (versionCode 46, solo JavaScript sobre el APK nativo 2.2.4):**

- Tipografía Inter (SIL OFL) con espaciado óptico y números tabulares: `src/fontData.ts` (generado por `scripts/make_fonts.py`), `src/fonts.ts` la registra con ExpoFontLoader al abrir (máximo 1.5 s; si falla, letra del sistema) y `src/text.tsx` convierte el peso en la familia de Inter. Los TTF quedan en `assets/fonts/` para la próxima compilación nativa.
- Esquinas grandes (tarjetas 24, botones cápsula), barra de pestañas flotante tipo cápsula con indicador, carrito negro flotante con «Cobrar», logos centrados en encabezado, inicio de sesión y bloqueo.
- Vender y cobrar: carrito en tarjeta con selector − cantidad +, cliente como fila, formas de cobro como botones grandes con ícono, total destacado y un solo botón «Cobrar $…». Vendedor igual.
- Stock: accesos rápidos (Nuevo producto, Escanear, Nueva entrada, Conteo); tarjetas que abren el detalle; detalle con Editar, Entrada y Conteo.
- Clientes: buscador con botón de alta, iniciales, llamar/WhatsApp/editar como íconos y «Nueva venta».
- Ventas: vendido hoy destacado, accesos rápidos (Corte de caja, Resumen, Nuevo gasto, Excel) y detalle de venta con acciones en lista.

**2.3.0 · Rediseño minimalista estilo iOS para Android (versionCode 45, solo JavaScript sobre el APK nativo 2.2.4):**

- Estilo nuevo en `src/theme.ts` y `src/ui.tsx`: fondo gris claro, tarjetas blancas sin bordes, texto negro y un solo acento (el rojo del logo). Botones redondeados, botones chicos con relleno suave, deshabilitados en gris, chips y buscador con relleno, avisos flotantes oscuros.
- Íconos de línea (Lucide, licencia ISC) en lugar de emojis en pestañas, menús, botones y carrito: `src/icons.ts`, generado con `scripts/make_icons.py` como PNG embebidos que se pintan con `tintColor` (no requieren recursos nativos).
- Navegación: cuatro pestañas (Vender, Ventas, Clientes, Stock) con títulos grandes; Ajustes (antes Parámetros) se abre con el engrane de arriba. En el vendedor: Vender, Stock, Mis ventas y Caja; Cuenta se abre con el ícono de persona. Pantallas internas con «‹ Anterior» y título centrado.
- Ajustes como lista agrupada con íconos en cuadritos de color (como Ajustes de iPhone); funciones avanzadas e inicio con huella en la misma lista.
- Formularios como hoja con «Cerrar» en color de acento; tarjetas de estado correcto en blanco (el estado lo dice la etiqueta).
- Componentes nuevos: `Icon`, `IconButton`, `TextButton`, `AppHeader`, `TabBar`, `MenuList`.

**2.2.6 · Rediseño, fase 2 (versionCode 44, JavaScript e imágenes de marca sobre el APK nativo 2.2.4):**

- Ventas más sencilla: resumen compacto (vendido hoy, número de ventas y por cobrar), accesos en una fila (Corte de caja, Resumen, Gasto, Excel), filtros en una sola fila deslizable y cada venta con sus productos en una o dos líneas.
- Parámetros: comisión en una tarjeta corta (tu precio → el cliente paga → recibes), avisos con estado y dos botones, huella o rostro con estado y menús más compactos.
- Textos largos recortados en todas las pantallas; filtros (`Chips row`) en una fila deslizable en Clientes, Cobros, Reportes y Catálogo.
- Vendedor: caja sin fondo verde y sin mensajes repetidos sin internet.
- Ícono de la app, pantalla de inicio e ícono de avisos con el logo GGG · Nova Supps; color de avisos rojo de la marca. Se generan con `scripts/make_brand_icons.py` y se aplican sobre el APK con `native/res_2.2/overrides.json` (mismo nombre y tamaño de imagen, sin compilar).

**2.2.5 · Lector con cámara y rediseño (versionCode 43, solo JavaScript sobre el APK nativo 2.2.4):**

- Lector con cámara: lee al instante (sin la espera de 2.5 s), vibra y muestra el resultado en la misma pantalla. Cada lectura en Vender agrega una pieza; *Quitar una* y *Listo* sin salir. Un código que no está en el catálogo ofrece *Dar de alta o asignar* (se abre al cerrar el lector, sin encimar ventanas). En Producto, el lector llena el campo *Código de barras* y avisa si ya es de otro producto.
- Reconocimiento de códigos (`src/barcodes.ts`): UPC-A = EAN-13 con cero = GTIN-14, UPC-E comprimido, GS1 con datos extra, Code 39 con asteriscos, dígitos con espacios, prefijos del lector y SKU con o sin guiones (solo si no es ambiguo).
- Rediseño con los colores del logo oficial (rojo, dorado, negro y blanco) en `src/theme.ts`; logotipo GGG · Nova Supps en el encabezado, el inicio de sesión y el bloqueo; botones chicos con contorno para no saturar de rojo.
- Se quitaron Campañas, Oportunidades, Compañías, Ubicaciones y Paquetes (pantallas, menús, campos y código). Los datos anteriores se conservan en la base y en los respaldos.
- Limpieza: imports y cálculos sin uso (por ejemplo, seguimientos calculados en cada pantalla), pruebas unitarias que no corrían en Node 22, pruebas 2.2 desactualizadas.

**2.2.0 · Código preparado para compilación nativa (versionCode 38):**

- Lector continuo con cámara, captura de código en Producto y control de existencias.
- Avisos de ventas, revisiones, rechazos, cierres y altas de vendedores; tarjeta Activar/Desactivar en este teléfono y seguimientos locales a las 9:00.
- Sesión y configuración de Mercado Pago en SecureStore, con migración conservando valores y escrituras atómicas de máximo 1800 bytes por pieza. Los tokens del teléfono quedan fuera de los respaldos.
- Actualizaciones cada 6 horas y reinicio explícito protegido durante el cobro.
- Fotos de Android desde Fotos, cámara o Archivos; compresión nativa a JPG de máximo 1024 px.
- Pantallas del dueño separadas en `src/screens/`, tabla de cobros y Parámetros en cuatro secciones.
- Pruebas portables en Windows y SQL probado con PostgreSQL embebido, sin avisos reales.
- Guía: [COMPILAR_ANDROID_EAS.md](docs/COMPILAR_ANDROID_EAS.md). Necesita Expo, Firebase y una compilación nueva para entregar el APK. La llave original se usa localmente con `scripts/resign_apk.py`.

**2.1.0:**

- **Promociones** (Parámetros → Promociones): 2x1/3x2, por volumen o % para todo, una categoría o un producto, con vigencia. Se aplican solas en tu teléfono y en el de tus vendedores (el servidor hace el mismo cálculo), se ven en la foto (🏷️), en el cobro y en el comprobante. Una venta que queda debajo del costo solo por tu promoción se permite (la app te avisa al crearla).
- **Reportes** por producto, por vendedor y de promociones (pantalla, compartir y dos hojas nuevas en el Excel).
- **Catálogo para clientes**: mensaje de WhatsApp por categoría y PDF con fotos, precios y promociones.
- **Respaldo automático en la nube** una vez al día (comprimido, verificado, últimos 10, solo lo ve el dueño) y restauración desde la nube, también al estrenar teléfono.
- **Lector de códigos** USB/Bluetooth (código de barras o SKU + Enter agrega al carrito) para dueño y vendedores.
- Correcciones: los datos de transferencia solo llegan al vendedor que los tiene asignados; las ventas en revisión apartan sus piezas.
- Requiere volver a ejecutar `supabase/schema.sql` (ver `docs/CONFIGURAR_VENDEDORES.md`). La función `cobro-terminal` no cambia.

**2.0.3:** cobro con tarjeta aunque la terminal esté en modo normal (no Punto de Venta): el vendedor o el dueño cobran directo en la terminal, tocan *Ya cobré* y la app busca ese pago en Mercado Pago (aprobado, de terminal, monto exacto, sin usar) y lo liga a la venta con tarjeta, autorización y comisión real. Requiere volver a publicar la función `cobro-terminal` (ver `docs/CONFIGURAR_VENDEDORES.md`).

**2.0.2:** lista para iPhone (se compila con EAS y se instala con TestFlight; guía en `docs/INSTALAR_IPHONE.md`): ícono para iOS, fotos de producto desde Fotos, cámara o Archivos (HEIC y PNG se convierten a JPG), el teclado ya no tapa los campos y el aviso verde del vendedor ya no se borra antes de tiempo.

**2.0.1:** en el teléfono del vendedor, productos y carrito son pantallas separadas (*Ver carrito* / *‹ Agregar más productos*).

**2.0.0:** el cliente absorbe la comisión (4.06%, parámetro) con cualquier forma de pago y tú recibes tu precio exacto ($499 → el cliente paga $520.12 → recibes $499). Comprobantes y vendedores ven solo subtotal, descuento y total. App más sencilla: Vender · Ventas · Clientes · Stock · Parámetros (con funciones avanzadas ocultables) y botón para vaciar el carrito.

**1.9.0:** los precios de catálogo regresan a su precio original y el cliente paga **precio + 4.06%** con cualquier forma de pago (efectivo, transferencia, Mercado Pago, terminal). El dueño la puede quitar en una venta especial; los vendedores siempre la cobran (la calcula el servidor).

**1.8.0:** carrito de compras: los productos se mandan al carrito (desde Vender o Stock) y en el carrito se elige cliente, forma de cobro y se ve el desglose; módulo *Comisión de tarjeta* en Más (porcentaje configurable y ajuste de precios).

**1.7.0:**

- Sin meses sin intereses ni tarifas por tipo de tarjeta.
- La comisión (4.06%) iba incluida en el precio de catálogo (la 1.9 lo revierte).
- Excel de ventas con el detalle completo.
- Aviso de seguimientos 5 días antes.
- Venta por categoría con fotos (dueño y vendedor).
- Corrección de errores de pantalla y limpieza de código.

Historial completo en `docs/ACTUALIZACION_0.9.md`. Configuración y actualización del servidor en `docs/CONFIGURAR_VENDEDORES.md`.

## Compilar Android 2.2

Sigue `docs/COMPILAR_ANDROID_EAS.md`: configurar Expo/Firebase → comprobar → compilar con EAS → refirmar localmente con `scripts/resign_apk.py`.

### Cambios solo de JavaScript sobre el APK nativo 2.2.x (2.2.5 a 2.5.2)

```bash
npm ci
npm run check && npm run test:all
NODE_ENV=production npx expo export:embed --entry-file index.ts --platform android --dev false --bytecode --max-workers 2 --bundle-output build/index.android.bundle --assets-dest build/res
python3 scripts/make_brand_icons.py   # solo si cambia el logo (requiere Pillow)
python3 scripts/package_android_js_native.py /ruta/Nova_Negocio_2.5.1_Android.apk 2.5.2 50   # requiere apksigner, aapt2 y signing/
```

Genera un `app.manifest` nuevo de expo-updates para que el teléfono use este bundle, conserva el runtime nativo `2.2.4` (`runtimeVersion` fijo en `app.json`) y firma con la llave original. También reemplaza ícono, pantalla de inicio e ícono de avisos según `native/res_2.2/overrides.json` (por nombre de recurso, mismo tamaño). Si agregas módulos nativos o imágenes nuevas como archivo, hace falta compilar con EAS. Alternativa sin APK: `eas update --channel preview` (mismo runtime 2.2.4).

## Método anterior: APK solo JS sobre el runtime nativo 0.6

```bash
npm ci
npm run check && npm run test:all
NODE_ENV=production npx expo export:embed --entry-file index.ts --platform android --dev false --bytecode --max-workers 2 --bundle-output build/index.android.bundle --assets-dest build/res
python3 scripts/package_android_js.py /ruta/Nova_Negocio_0.6_Android.apk 2.1.0 37   # requiere apksigner
```

El APK conserva el paquete, el certificado y la base `nova-negocio.db`: se instala encima sin perder datos. `scripts/build_android.py` queda para una compilación nativa completa (Android SDK 36, JDK 17), necesaria solo si se agregan módulos nativos (por ejemplo, notificaciones del sistema).

## iPhone

Se compila en la nube de Expo (EAS) desde tu computadora y se instala con TestFlight: pasos completos en `docs/INSTALAR_IPHONE.md`. `.easignore` evita que se suban la llave de firma, los APK y los respaldos. Los módulos nativos solo de iPhone (`expo-image-picker`, `expo-image-manipulator`) se cargan únicamente en iPhone (`src/iosPhoto.ts`), así el APK de Android sigue siendo solo JS.

## Estructura

| Ruta | Qué es |
| --- | --- |
| `App.tsx` | App del dueño: pantallas, formularios, cobro en terminal, respaldo y Excel |
| `src/business.ts` | Reglas del negocio sobre SQLite (ventas, lotes FEFO, caja, comisiones, migraciones) |
| `src/seller.tsx`, `src/sellerCore.ts` | App del vendedor y su cola sin internet |
| `src/sync.ts`, `src/cloud.ts` | Sincronización con Supabase (publicar catálogo, registrar ventas de vendedores) |
| `src/salesExcel.ts`, `src/xlsx.ts` | Excel de ventas (generador .xlsx propio, sin dependencias) |
| `src/iosPhoto.ts` | Foto del producto en iPhone (solo se carga en iOS) |
| `src/screens/` | Pantallas 2.1: Promociones, Reportes, Catálogo para clientes y Respaldo en la nube; 2.6: Actualizar catálogo |
| `src/catalogImport.ts` | 2.6: lectura de Excel/CSV, vista previa y aplicación de cambios al catálogo, Excel del catálogo |
| `src/reports.ts` | Reporte por producto, por vendedor y de promociones |
| `src/pdf.ts`, `src/catalogPdf.ts`, `src/catalogueThumbs.ts` | PDF propio (sin dependencias) y catálogo para clientes |
| `src/cloudBackup.ts`, `src/sha256.ts` | Respaldo en la nube (gzip con fflate, en partes, verificado con SHA-256) |
| `src/ui.tsx` | Componentes: cuadrícula de venta por categoría, fechas, chips, fotos |
| `src/mercadopago.ts`, `src/receipt.ts` | Terminal Point y comprobantes |
| `supabase/schema.sql` | Base en línea (se puede volver a ejecutar sin perder datos) |
| `supabase/functions/cobro-terminal/` | Función del servidor para cobrar y administrar usuarios |
| `tests/` | Pruebas; `tests/fixtures/` tiene los datos de prueba (la app no trae datos) |

## Repositorio en GitHub (privado)

El código vive en un repositorio **privado** de GitHub. `.gitignore` deja fuera todo lo que no es código o es secreto:

- Nunca se suben: `signing/` (llave de firma), `nova-negocio-firebase-adminsdk-*.json`, `google-services.json`, `.env`, `node_modules/`, `build/`, `deliverables/` (APK), `Claude outputs/` y `_respaldo*/`. Estos se quedan solo en tu computadora: respáldalos aparte.
- `eas build` sigue tomando `google-services.json` de la carpeta (usa `.easignore`, no `.gitignore`).
- Cada versión se sube sola (tarea «Nova Negocio - Subir a GitHub», `scripts/windows/subir_a_github.ps1`) y GitHub la publica a los teléfonos si pasan las pruebas (`.github/workflows/actualizar-telefonos.yml`). Ver `docs/ACTUALIZACIONES_AUTOMATICAS.md`.

## Pruebas

- `npm test`: motor de negocio e importación.
- `npm run test:all`: todo lo anterior más las pruebas de pantallas.
  - `ui`, `forms`, `team`, `lock`, `charge`, `cloud`, `photos`, `receipt`.
  - `terminalnormal`: terminal en modo normal (vendedor y dueño cobran directo y ligan el pago).
  - `v21`: promociones (dueño, vendedor y servidor), lector de códigos, reportes, catálogo para clientes, respaldo en la nube y base en línea anterior a 2.1.
  - `hermes`: catálogo por WhatsApp sin `Buffer` (como en Android con Hermes).
  - `iosphoto`: foto del producto en iPhone (Fotos, cámara, Archivos → JPG de 1024 px).
  - `catalogui` (y `tests/catalogImport.test.ts`): Actualizar catálogo desde Excel/CSV (2.6).
  - `v17`: precios originales, comisión que absorbe el cliente (2.0), Excel, avisos, venta por categoría, carrito y Parámetros.
- `node tests/screens.cjs`: recorre todas las pantallas del dueño y falla si hay textos fuera de `<Text>`, valores rotos (NaN, undefined) o avisos de React.

## Reglas operativas

- Importes en centavos de MXN. Una venta descuenta stock y registra el cobro en una sola transacción.
- Sin stock negativo. Primero salen los lotes que caducan antes, y los vencidos se bloquean.
- Con ubicación elegida, solo se vende de los lotes de esa ubicación.
- Comisión (2.0):
  - El precio de catálogo es tu precio. El cliente paga `grossUp(precio)`: el menor total que, menos la comisión de Mercado Pago (4.06%, Parámetros → Comisión), te deja tu precio completo. Mismo cálculo en el teléfono (`src/business.ts`) y en el servidor (`public.client_price`).
  - Con tarjeta, la comisión de Mercado Pago se registra como gasto (estimada y conciliada con la real); efectivo y transferencia entran completos.
  - El cliente y el vendedor ven precios ya con la comisión, subtotal, descuento y total; el desglose solo lo ve el dueño.
- Cambiar precios no modifica ventas históricas.
- `signing/` es privado: contiene la clave para actualizar el mismo paquete. No se publica ni se comparte.
