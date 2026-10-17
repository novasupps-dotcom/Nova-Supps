# Nova Negocio · 2.5.3

App de GGG · Nova Supps para Android e iPhone (Expo / React Native / SQLite): catálogo, inventario por lotes, ventas, caja, clientes y vendedores con su propio teléfono (Supabase). El teléfono del dueño es la caja central; los vendedores venden contra el catálogo y las existencias que el dueño publica.

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
| `src/screens/` | Pantallas 2.1: Promociones, Reportes, Catálogo para clientes y Respaldo en la nube |
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
