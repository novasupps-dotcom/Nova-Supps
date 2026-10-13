# Nova Negocio 0.9 → 2.0.1

## 2.0.1 · Vendedor: productos y carrito en pantallas separadas

- En **Vender** del vendedor, la cuadrícula de productos y el carrito ya no se mezclan:
  - **Pantalla de productos:** categorías con fotos. Al elegir, abajo aparece **🛒 Ver carrito · N piezas · $total ›**.
  - **Pantalla del carrito:** solo lo elegido, cliente, forma de pago, subtotal, total y **Cobrar / Registrar venta**. **‹ Agregar más productos** regresa a la cuadrícula sin perder nada.
  - Al registrar la venta, vaciar el carrito, quitar el último producto, tocar la pestaña Vender o el botón atrás de Android, regresa a los productos.
- Sin cambios en Supabase (usa el `schema.sql` de la 2.0). Versión 2.0.1 / código 34.

## 2.0.0 · Recibes tu precio completo y una app más sencilla

- **El cliente absorbe la comisión (4.06%, es un parámetro).** Con cualquier forma de pago (efectivo, transferencia, Mercado Pago o terminal) el cliente paga el total que, después de que Mercado Pago descuenta su comisión, te deja **tu precio exacto**: $499.00 → el cliente paga $520.12 → Mercado Pago −$21.12 → **recibes $499.00**. Es el cálculo de las versiones 1.3–1.6 (sin redondear en tu contra) y ya no existe el interruptor para quitarla.
  - Cada producto se muestra al cliente ya con la comisión ($520.12). El total es la suma de lo que ve (nunca menos de lo necesario para que recibas tu precio).
  - Con precio especial (descuento) escribes lo que quieres recibir y el cliente paga lo necesario para que te quede eso.
  - Cambiar el porcentaje (Parámetros → Comisión → *Cambiar porcentaje*) se publica de inmediato al servidor y a los vendedores. Los precios del catálogo no cambian.
- **Comprobantes y vendedores sin desglose:** solo productos (ya con la comisión), *Subtotal*, *Descuento* si hay y *Total*. La palabra comisión no aparece al cliente ni al vendedor (tampoco en su Caja). Solo tú ves el detalle en el carrito (*Solo lo ves tú*: tu precio, la comisión que absorbe el cliente, lo que descuenta Mercado Pago, lo que recibes y la ganancia), en el detalle de la venta, en el Resumen y en el Excel.
- **Vaciar carrito:** botón **🗑 Vaciar carrito** en Vender y dentro del carrito (dueño y vendedor).
- **App más sencilla:**
  - Cinco pestañas: **🛒 Vender · 🧾 Ventas · 👥 Clientes · 📦 Stock · ⚙️ Parámetros**. La app abre en Vender; ahí arriba salen los avisos (cobro en terminal pendiente, ventas de vendedores por revisar, seguimientos y respaldo).
  - **Ventas:** lo vendido hoy, por cobrar y botones de *Corte de caja*, *Resumen*, *＋ Gasto* y *Excel*.
  - **Clientes:** los seguimientos próximos arriba.
  - **Parámetros:** comisión, terminal, datos de transferencia, vendedores, respaldo y Excel, y **Funciones avanzadas** (interruptor): lotes, paquetes, cuentas, gastos operativos, campañas, oportunidades, compañías, ubicaciones y datos importados. Ocultas no se borra nada.
  - Se quitaron la pantalla Inicio, la página separada de Comisión y textos repetidos.
- **Requiere ejecutar el `schema.sql` 2.0 en Supabase** (el de la 1.9 no sirve con esta versión). Ver *CONFIGURAR_VENDEDORES.md → Actualizar a 2.0*. Versión 2.0.0 / código 33.

## 1.9.0 · Comisión 4.06% que paga el cliente, con cualquier forma de pago

- **Precios originales.** Al abrir la 1.9 en el teléfono del dueño, el catálogo (productos y paquetes) regresa **una sola vez** al precio de antes de la 1.7: $383.98 → $369.00. Reglas:
  - Precio sin cambios desde la 1.7 → el precio anterior exacto que se guardó.
  - Precio que escribiste después en pesos cerrados (ej. $399.00) → se respeta.
  - Cualquier otro con centavos de comisión → precio ÷ 1.0406.
  Queda en la auditoría (*catalog.restore*) con cada precio anterior y nuevo. Restaurar un respaldo de la 1.7/1.8 hace lo mismo; un respaldo anterior queda igual.
- **El cliente paga precio + 4.06%** en efectivo, transferencia, Mercado Pago o terminal: $369.00 + $14.98 = **$383.98**. Lo cobrado en efectivo y transferencia entra completo; con tarjeta, Mercado Pago descuenta su comisión estimada (4.06% de lo cobrado, se concilia con la real).
- **Carrito del dueño:**
  - Interruptor **Sumar comisión 4.06% al cliente**, prendido por defecto. Apágalo en una venta especial y el cliente paga solo el precio.
  - El *Desglose* muestra productos, descuento, precio de venta, **comisión (la paga el cliente)**, total a cobrar y, con tarjeta, lo que descuenta Mercado Pago y lo que recibes; además el costo y la ganancia.
  - La barra del carrito y el botón de la terminal ya muestran el total con comisión.
  - *Más detalles → Precio de venta* es el precio especial **sin comisión**; la comisión se suma encima.
- **Vendedores:** siempre cobran precio + comisión; el servidor la calcula con el mismo porcentaje (*config.fee*) y la guarda en cada venta (subtotal, comisión, %). Su carrito muestra *Productos · Comisión 4.06% · Total a cobrar*, el comprobante lleva el renglón *Comisión 4.06%* y la Caja dice *De ello, comisión cobrada a clientes*.
- **Ventas, comprobantes y reportes:**
  - Cada venta guarda *precio de venta*, *comisión* y *%*. Los renglones de productos van sin comisión.
  - Modificar una venta conserva la comisión sobre el nuevo precio.
  - El comprobante de WhatsApp muestra la comisión aparte.
  - Resumen y Corte de caja muestran *Comisión 4.06% pagada por clientes (incluida)*.
- **Excel:**
  - Columnas *Precio sin comisión* y *Comisión cliente (4.06%)*; las de Mercado Pago se llaman *Comisión Mercado Pago*.
  - El resumen separa la comisión pagada por clientes de la de Mercado Pago.
- **Más → Comisión:** el porcentaje (configurable), con ejemplos de *El cliente paga* y de lo que recibes con tarjeta. Cambiarlo ya no toca precios; aplica a ventas nuevas y a vendedores al sincronizar. Se quitó *Ajustar precios* y el botón ＋% del alta de productos (el precio que escribes es sin comisión).
- **Requiere ejecutar el `schema.sql` 1.9 en Supabase** (ver *CONFIGURAR_VENDEDORES.md → Actualizar a 1.9*). Versión 1.9.0 / código 32.

## 1.8.0 · Carrito de compras y módulo de comisión

- **Carrito de compras.** Elegir productos ya no abre la venta completa:
  - **＋ Registrar venta** (o el botón *＋ Venta*) abre **Vender**: categorías con fotos, y cada toque manda una pieza al carrito.
  - En **Stock**, cada producto tiene **🛒 Al carrito**.
  - Abajo aparece la barra **🛒 Carrito · N piezas · $total · Cobrar ›**.
- **En el carrito** se ve en una sola pantalla:
  - los productos con foto, cantidad (− / ＋) e importe;
  - el **cliente** y la **forma de cobro**;
  - el **Desglose**: productos, descuento, total a cobrar, comisión de tarjeta estimada y lo que recibes (solo con tarjeta), costo de la mercancía y ganancia estimada.

  **＋ Agregar más** regresa a Vender sin perder lo elegido; cerrar el carrito no lo vacía, y se vacía solo al cobrar o con *Vaciar carrito*. Desde Vender también puedes dar de alta un producto nuevo y entra directo al carrito.
- **Clientes → Nueva venta** y **Campañas → Registrar venta** dejan el cliente o la campaña elegidos en el carrito.
- **Más → Comisión de tarjeta** (módulo propio):
  - Muestra el porcentaje (4.06%) con un ejemplo de lo que recibes, y **Cambiar porcentaje**.
  - Si lo cambias, ofrece **Ajustar precios** del catálogo para que incluyan la nueva comisión. Pide confirmación, conserva los precios anteriores y no cambia ventas pasadas.
  - El botón ＋% al dar de alta un producto usa el porcentaje configurado.
- **Vendedor:** el bloque de venta se llama **🛒 Carrito** (piezas y total) y la barra lleva al cobro.
- No requiere cambios en Supabase. Si aún no ejecutas el `schema.sql` de la 1.7, hazlo. Versión 1.8.0 / código 31.


## 1.7.0 · Precio con comisión incluida, Excel de ventas, avisos de seguimiento y venta por categoría

- **Ya no hay meses sin intereses ni tarifas por débito/crédito.** Se quitó el selector de canal / tipo / MSI, la página de Tarifas y los reportes por MSI. Las ventas con tarjeta ya registradas conservan su comisión.
- **Comisión 4.06% incluida en el precio de catálogo.** Al abrir la 1.7 en el teléfono del dueño, todos los precios de productos y paquetes suben **una sola vez** 4.06% (se guardan los precios anteriores y queda en la auditoría). Desde entonces **no se suma nada al cobrar**: el cliente paga lo mismo en efectivo, transferencia, débito o crédito. Con tarjeta, la comisión real de Mercado Pago se sigue registrando como gasto (estimada al 4.06% y conciliada con la real); efectivo y transferencia no generan comisión. Al dar de alta un producto, el botón **＋4.06%** calcula el precio final si tienes el precio sin comisión.
- **Vendedores:** misma regla para todos (ya no existe *Sumar comisión 4.06% al cliente*). El teléfono del dueño apaga esa opción en el servidor al sincronizar, y el vendedor no cobra con tarjeta si el servidor todavía sumara la comisión.
- **Excel de ventas** (Ventas, Resumen de ventas o Más → Respaldo → *📥 Descargar Excel de ventas*): periodo Hoy / Esta semana / Este mes / Mes pasado / Este año / Todo. Hojas:
  - *Resumen*: totales, cobrado, por cobrar, comisiones, ventas con y sin comisión, neto, costo, utilidad, por forma de cobro, por vendedor y por categoría.
  - *Ventas*: una fila por venta con fecha, folio, estado, cliente, vendedor, productos, piezas, total, cobrado, devuelto, por cobrar, forma de cobro, cuenta, **¿generó comisión? Sí/No**, comisión (estimada o real), neto, costo, utilidad, tarjeta y autorización.
  - *Productos vendidos*: cada producto con cantidad, precio, descuento, importe, costo y utilidad.
  - *Cobros y comisiones*: cada movimiento de dinero.
- **Aviso de seguimientos:** al abrir la app (y al volver a ella) aparece un aviso con los clientes cuyo *Próximo contacto* vence en los **próximos 5 días** o ya venció; una vez por día y otra vez si entra uno nuevo. Además: tarjeta 🔔 en Inicio, filtro **Clientes → Próximos 5 días** y la lista en Oportunidades. *(Es un aviso dentro de la app: las notificaciones del sistema requieren una versión nativa nueva.)*
- **Venta por categoría con fotos** (dueño y vendedor): pestañas Creatinas, Proteínas, PWO, Snacks, Vitaminas, Aminoácidos… y cuadrícula con la foto de cada producto; tocar la foto agrega una pieza, con − / ＋ en la misma foto. La búsqueda encuentra en todas las categorías. El vendedor tiene una barra *Ir a cobrar*.
- **Errores de pantalla corregidos:**
  - Las tarjetas de Inicio ahora ocupan dos columnas en teléfonos angostos.
  - En la lista de Ventas, la etiqueta de saldo ya no se sale de la tarjeta.
  - Vender con ubicación ya no se pone lento.
  - Al llegar al máximo de un producto, el aviso sale junto a las fotos, sin que la pantalla brinque.
  - Las pestañas quitan el filtro anterior.
  - Al salir de una pantalla, ya no se quedan abiertos los paneles ni las contraseñas escritas.
  - Un producto dado de alta sin existencias ya no entra a la venta.
  - El título "Renombrar cuenta" se muestra bien.
  - En el vendedor:
    - Los errores se ven junto al botón de cobrar.
    - Un cobro con tarjeta sin confirmar impide iniciar otro.
    - Revisar un cobro ya no borra una venta nueva.
    - "Reintentar" no duplica el cobro en la terminal.
    - El botón Atrás de Android regresa a Vender (y del cambio de contraseña al inicio de sesión).
    - La barra de cobro se oculta con el teclado y durante el cobro.
    - Cerrar sesión limpia los datos del vendedor anterior.
    - La cola sin internet solo la envía la cuenta que hizo la venta.
- **Depuración:**
  - Se quitó el código de MSI y tarifas.
  - Se quitaron funciones y pantallas sin uso.
  - Los datos de prueba pasaron a `tests/fixtures/` y se retiraron scripts de 0.8.
  - Nuevas pruebas: `tests/v17.cjs` y `tests/screens.cjs`.
- Requiere volver a ejecutar `supabase/schema.sql` (la función `cobro-terminal` no cambia). Versión 1.7.0 / código 30.

## 1.6.0 · (reemplazada por la 1.7.0) Comisiones Mercado Pago por débito, crédito y meses sin intereses


- **La comisión ya no es un solo 4.06%.** Se calcula con: canal (*Terminal / Point* o *Link de pago*), tipo de tarjeta (*Débito* o *Crédito*), modalidad (*una exhibición* o *3 / 6 / 9 / 12 MSI*) y la tarifa vigente ese día.
- **Al cobrar con tarjeta se eligen 3 pasos:** canal → tipo → modalidad. Con débito solo aparece *Pago normal* (nunca MSI). Crédito en una exhibición no lleva costo de MSI. Sin elegir el tipo no se puede cobrar. La terminal se configura para aceptar solo débito o solo crédito según lo elegido.
- **Tarifas editables** (Más → 💳 Tarifas Mercado Pago). Vienen las publicadas por Mercado Pago México: Point 3.5% + IVA; Link de pago 3.49% + $4 + IVA; MSI 3 / 6 / 9 / 12 = +4.69 / 7.69 / 11.19 / 12.89% + IVA. Revisa que coincidan con tu cuenta. **Cambiar la tarifa no cambia ventas ya registradas:** cada cobro guarda la tarifa con la que se hizo.
- **Cada cobro guarda:** proveedor, canal, tipo, meses, comisión base, costo MSI, IVA, otros cargos, comisión total, bruto, neto estimado, neto real (al conciliar con Mercado Pago o capturarlo) y % efectivo.
- **Detalle de venta:** desglose completo (bruta, proveedor, canal, tipo, modalidad, base, MSI, IVA, comisión total, costo efectivo, neto, costo de mercancía y utilidad real). Botones *Corregir tipo / meses* y *Registrar neto real*.
- **Datos inválidos** (por ejemplo débito con meses) se marcan **“Configuración de pago inválida”** y se piden corregir; el servidor ya no los acepta.
- **Resumen de ventas:** *Comisiones Mercado Pago* por Terminal / Link × Débito / Crédito una exhibición / 3 / 6 / 9 / 12 MSI, y *Reporte por tipo de tarjeta* (bruto, comisión, neto). La suma de los grupos es exactamente el total de comisiones; los gastos operativos siguen aparte.
- **Vendedores:** eligen débito o crédito (y meses) en la terminal; si les sumas la comisión, el cliente paga la que corresponde a ese plan. El servidor hace la misma cuenta.
- Las ventas con tarjeta anteriores quedan como *sin clasificar*; puedes clasificarlas desde su detalle.
- Requiere volver a ejecutar `supabase/schema.sql` y actualizar la función `cobro-terminal`. Versión 1.6.0 / código 29.

## 1.5.1 · “Existencias vendibles insuficientes” con piezas disponibles

- **Las “disponibles” ahora se calculan con la misma regla que usa la venta** (lotes vigentes, menos lo apartado de cada lote). Antes podían no coincidir.
- **Con una ubicación elegida** en *Más detalles* de la venta, solo cuentan las piezas de lotes asignados a esa ubicación: el carrito ya muestra ese número (por ejemplo “Sin existencias: quítalo de la venta”) y avisa abajo de la ubicación. Antes mostraba todo tu inventario y fallaba al cobrar.
- Mensaje más claro: dice cuántas hay y, si es por la ubicación, cómo resolverlo (quitar la ubicación o asignar el lote).
- No requiere cambios en Supabase. Versión 1.5.1 / código 28.

## 1.5.0 · Filtro de ventas por forma de cobro y transferencias por banco

- **Ventas → Forma de cobro:** filtra *Efectivo*, cada cuenta de transferencia por separado (por ejemplo *Mercado Pago* y *Banamex*) y *Terminal (tarjeta)*. Muestra cuántas ventas y cuánto se cobró por ese medio (descuenta devoluciones). Se combina con Activas / Hoy / Por cobrar y con la búsqueda.
- **Cada dato de transferencia se liga a una cuenta de la app** (Más → Datos para transferencia → *Se registra en la cuenta*). Al guardar Mercado Pago o Banamex, si no existe la cuenta se crea sola con ese nombre.
- **El vendedor indica a qué cuenta le transfirieron** (si tiene más de una asignada) y la venta cae en esa cuenta en tu teléfono. El servidor solo acepta cuentas publicadas y asignadas a ese vendedor.
- Las transferencias anteriores siguen en *Transferencias · por conciliar*: aparecen como su propio filtro.
- Requiere volver a ejecutar `supabase/schema.sql`. Versión 1.5.0 / código 27.

## 1.4.0 · Entrar con correo y contraseña, recuperar contraseña y datos de transferencia

- **Inicio de sesión:** en un teléfono nuevo la app abre en *Inicia sesión*: dueño o vendedor entran solo con correo y contraseña; la app sabe qué eres. Sin códigos REC ni CAM. Iniciar sesión vuelve ese teléfono el de la cuenta y el anterior se desconecta solo (avisa “se abrió en otro teléfono”).
- **Vendedor nuevo:** sigue entrando con su código de invitación (GNS), tecleado a mano.
- **¿Olvidaste tu contraseña?** (inicio de sesión y pantalla del vendedor): llega un correo con un código de 6 dígitos y se pone una contraseña nueva en la app. Requiere configurar el correo de salida en Supabase (guía). Además, el dueño puede ponerle una contraseña nueva a un vendedor (**Equipo → 🔑 Nueva contraseña**).
- **Dueño en otro teléfono:** el teléfono anterior muestra el aviso y, con tu contraseña, puedes volver a usarlo como dueño.
- **Datos para transferencia** (Más → Datos para transferencia): capturas Mercado Pago, Banamex u otras (titular, CLABE validada, cuenta, tarjeta, nota). Se asignan por vendedor en Equipo y se muestran **solo cuando se elige transferencia**, con botón para mandarlos al cliente por WhatsApp. En tu teléfono aparecen al elegir una cuenta de transferencia en la venta.
- Requiere volver a ejecutar `supabase/schema.sql` y actualizar la función. Versión 1.4.0 / código 26.

## 1.3.1 · Comisión de tarjeta en las ventas del vendedor

- **Por vendedor** (Equipo → *Sumar comisión 4.06% al cliente con tarjeta*): si está activo, cuando el vendedor cobra con la terminal el cliente paga precio de lista + comisión, igual que en tu teléfono, y a ti te queda el precio de lista completo. Viene **activo** para todos; lo puedes quitar a quien quieras.
- El servidor hace la misma cuenta que tu teléfono (probado con cientos de importes): la terminal cobra el total con comisión y la venta solo se acepta por ese total.
- El vendedor ve el desglose (productos + comisión) antes de cobrar; el comprobante y su cierre de caja muestran la comisión cobrada. En tu teléfono la venta queda con “comisión trasladada”.
- Requiere volver a ejecutar `supabase/schema.sql`. La función del servidor no cambia. Versión 1.3.1 / código 25.

## 1.3.0 · Dueño solo registrado, cierre de caja, formas de pago por vendedor y baja de usuarios

- **Ya no se puede “empezar de cero” como dueño.** En un teléfono nuevo, el modo dueño pide tu correo, contraseña y tu código de recuperación (REC) tecleado a mano; después restauras tu respaldo. Si el código se perdió: `select public.nuevo_codigo_recuperacion();` en el SQL Editor.
- **Sin PIN.** Se quitó el PIN de la 1.2; queda la huella o el rostro opcional (como en la 1.1.1).
- **Códigos que se escriben a mano:** campo con el prefijo (GNS, CAM, REC) y el guion ya puestos, solo 8 caracteres, sin menú de pegar y rechaza texto pegado o sugerido.
- **Cierre de caja del vendedor** (pestaña **Caja**): lo vendido desde el último cierre (productos, unidades, total y por forma de pago). Al cerrar, el corte se guarda en el servidor y nadie lo puede cambiar ni borrar. El dueño los ve en Equipo → 🧮 Cierres de caja.
- **Formas de pago por vendedor** (Equipo → *Puede cobrar con*); la **tarjeta en la terminal viene elegida por omisión**. El servidor y la función de cobro respetan lo permitido.
- **Eliminar usuarios desde la app:** borra la cuenta con su correo y datos de registro (también las *Cuentas sin acceso*). Ventas, clientes, cobros y cierres se conservan. Equipo muestra el correo de cada vendedor.
- **Correcciones de pantallas:**
  - Cancelar un cobro mientras se revisa o envía a la terminal ya no deja un cobro tardío ni una venta doble (dueño y vendedor).
  - La ventana de cobro ya no se queda atorada sin internet: **Cerrar y revisar después** (queda en Inicio / Vender para revisarlo).
  - El botón Atrás de Android ya no mueve pantallas detrás de la ventana de cobro.
  - Avisos viejos ya no se quedan pegados en Equipo y Terminal.
  - El aviso de cobro pendiente en Inicio se actualiza al devolver o al marcar “No se aprobó”.
  - El vendedor ya no queda con “Tarjeta” elegida cuando la terminal se apaga.
  - Un producto archivado sale de la venta en curso con aviso.
  - El calendario sigue a la fecha elegida.
- Requiere volver a ejecutar `supabase/schema.sql` y actualizar la función (guía, “Actualizar a 1.3”). Versión 1.3.0 / código 24.

## 1.2.0 · Seguridad: dueño protegido, PIN y ventas validadas por el servidor

**Teléfono y app**
- **El APK ya no trae datos del negocio.** Antes, quien instalaba la app y elegía “dueño” veía el catálogo, costos, clientes y ventas de origen. Ahora elegir “dueño” en un teléfono nuevo solo ofrece **Restaurar mi respaldo** (tu archivo) o **Empezar una tienda nueva** (vacía, sin acceso a nada tuyo).
- **PIN de 6 números obligatorio** en el teléfono del dueño y en el de cada vendedor (se crea al abrir la 1.2). Rechaza PIN obvios (111111, 123456…). Tras 5 errores hay espera que se duplica (30 s, 1 min, 2 min… hasta 1 h). Huella o rostro son opcionales y el PIN siempre funciona.
- **Bloqueo automático** al volver después de 5 minutos fuera de la app; **Bloquear ahora** y **Cambiar PIN** en Más → Seguridad.
- **PIN olvidado:** con huella/rostro, o entrando con la cuenta en línea ligada a ese mismo teléfono. Sin ninguna de las dos no hay atajo (reinstalar y restaurar respaldo).
- El PIN, la sesión y el rol del teléfono no viajan en los respaldos, y un archivo de respaldo no puede imponerlos.

**Servidor (Supabase)**
- **El vendedor ya no escribe ventas directo:** usa `submit_sale`, donde el servidor pone **precios, total y hora**, revisa existencias y aparta las unidades para todos los vendedores (`seller_catalog` ya descuenta lo apartado).
- **Tarjeta:** el servidor registra quién creó cada cobro; solo esa persona (o el dueño) puede consultarlo o cancelarlo, y la venta solo se acepta si el cobro está **aprobado, es por el mismo total y no se usó antes**. El teléfono del dueño también rechaza un cobro repetido.
- **Antes de cobrar**, el teléfono del vendedor confirma con el servidor precios y existencias (`check_sale`). Si una venta sin internet se cobró con un precio viejo, llega al dueño “por revisar”.
- **Privacidad de clientes:** el vendedor ya no descarga la lista de clientes; busca por nombre o últimos 4 dígitos y ve el teléfono enmascarado (•••1234). El número completo solo se entrega para mandar el comprobante de su propia venta reciente.
- **Cambio de teléfono con código** `CAM-XXXX-XXXX` (un solo uso, 2 días, solo para esa cuenta). Ya no hay “ventana” abierta en la que cualquiera con la contraseña entraba.
- **Código de recuperación del dueño** `REC-XXXX-XXXX` (Equipo y vendedores): para pasar tu cuenta de dueño a un teléfono nuevo sin entrar a Supabase.
- El límite de intentos del alta ya no usa un contador compartido cuando no se conoce la dirección de internet (nadie puede bloquear el alta de todos).
- Equipo y vendedores registra el teléfono del dueño antes de mostrar la lista.
- Requiere volver a ejecutar `supabase/schema.sql` y actualizar la función (guía, “Actualizar a 1.2”). Versión 1.2.0 / código 23. Pruebas nuevas: `npm run test:lock`.

## 1.1.1 · Seguridad del equipo: código de un solo uso y cuenta ligada al teléfono

- **Códigos cortos registrados** (`GNS-XXXX-XXXX`) en lugar del texto largo: el dueño los crea por vendedor en Equipo y vendedores, los manda por WhatsApp, ve si están vigentes, usados, vencidos o revocados, y puede revocarlos.
- **Un solo uso y alta solo por el servidor:** la función `cobro-terminal` (acción `alta`) valida el código, lo marca como usado y crea la cuenta. El registro abierto de Supabase se apaga: sin código nadie puede crear cuenta. 20 intentos fallidos por hora desde la misma conexión bloquean.
- **Cuenta ligada a un teléfono** (dueño y vendedores): las reglas de la base exigen el identificador del teléfono registrado; la misma cuenta en otro celular no ve ni hace nada (tampoco cobrar en la terminal). El cambio de teléfono lo autoriza el dueño (*Cambiar de teléfono*); el del dueño se libera desde Supabase (ver guía).
- La app trae la base de la tienda: el vendedor solo escribe su código, nombre, correo y contraseña (mínimo 8).
- Requiere volver a ejecutar `supabase/schema.sql`, actualizar la función y apagar *Allow new users to sign up* (guía, sección “Actualizar a 1.1.1”). La 1.1.0 deja de conectarse.
- Versión 1.1.1 / código 22.

## 1.1.0 · Multiusuario: vendedores con su propio teléfono

Guía de configuración paso a paso: `docs/CONFIGURAR_VENDEDORES.md`.

- **Mismo APK para todos.** En un teléfono nuevo la app pregunta si es el del dueño o el de un vendedor. Tu teléfono (con datos) se queda como dueño automáticamente.
- **Dueño = caja central** con todos los permisos. Nuevo **Más → Equipo y vendedores**: conectar la base en línea gratuita (Supabase), invitar vendedores con un código, aprobarlos o desactivarlos, elegir en qué cuentas caen sus cobros, habilitar la terminal para ellos y revisar ventas con problema (Reintentar / Descartar / Devolver).
- **Vendedor = solo vende:** precio de lista y de contado (sin descuentos ni crédito), tope de existencias, alta de clientes, cobro en efectivo, transferencia o tarjeta en la terminal, comprobante por WhatsApp y *Mis ventas* del día. No ve costos, gastos, cuentas, reportes ni ventas de otros, y no puede cancelar, devolver ni eliminar.
- **Tarjeta sin compartir tu clave:** los cobros del vendedor pasan por la función `cobro-terminal` en tu servidor, que guarda el Access Token y solo permite cobrar en tu terminal (no devoluciones). Tu teléfono confirma con Mercado Pago cada cobro antes de registrarlo y aplica la comisión real.
- **Sincronización:** al abrir la app, cada minuto y al volver a ella, tu teléfono registra las ventas de vendedores (con su fecha y hora, folio `V-…` y “Vendida por …”), da de alta sus clientes y publica existencias, precios, clientes y comisión. Cada venta se registra una sola vez.
- **Sin internet:** el vendedor puede seguir vendiendo en efectivo o transferencia; las ventas se envían solas al volver la señal.
- **Permisos en el servidor** (Row Level Security, `supabase/schema.sql`): probados en una base Postgres real.
- Versión 1.1.0 / código 21. Pruebas nuevas: `npm run test:cloud`, `npm run test:team` y la función en Deno (`supabase/functions/cobro-terminal/index_test.ts`).

## 1.0.3 · Comprobante de cobro con tarjeta por WhatsApp

- Al aprobarse un cobro en la terminal (venta o abono), la ventana de pago ofrece **📲 Enviar comprobante por WhatsApp**.
- En Detalle venta, cada cobro hecho en la terminal muestra tarjeta, autorización y número de operación, con el botón **📲 Comprobante de tarjeta** para enviarlo cuando quieras. También funciona con ventas cobradas en versiones anteriores.
- El comprobante lo emite tu negocio (GNS · Nova Supps) con los datos reales del pago que reporta Mercado Pago: monto, tarjeta (marca, crédito/débito, últimos 4 dígitos), meses, autorización, número de operación de Mercado Pago, fecha y hora, productos o saldo.
- Si el cliente tiene teléfono guardado, se abre WhatsApp directo a su chat. Si no, la app pide el número (con vista previa del mensaje), permite guardarlo en el cliente o compartir con otra app. El comprobante general de la venta funciona igual.
- La API de Mercado Pago no entrega el ticket oficial de la terminal; para ese, la terminal y la app de Mercado Pago siguen ofreciendo sus propias opciones.
- Versión 1.0.3 / código 20.

## 1.0.2 · Carrito limitado al inventario

- Al vender ya no se pueden poner más unidades de las disponibles: el botón ＋ se detiene en el máximo, el buscador avisa cuando ya agregaste todas o cuando el producto no tiene existencias, y cada renglón muestra cuántas hay ("3 disponibles" / "Máximo disponible").
- *Vender paquete* y los accesos rápidos ajustan las cantidades a lo disponible y avisan qué se recortó.
- Al modificar una venta, el máximo incluye las unidades que esa venta ya tenía.
- Los paquetes (definir un combo) no tienen límite, porque no descuentan inventario al crearlos.
- Versión 1.0.2 / código 19. Incluye todo lo de la 1.0.1.

## 1.0.1 · Correcciones posteriores a la apertura

Respaldo de la 1.0 (código y APK) en `_respaldo_1.0/`. Las versiones 0.9.x quedaron en `deliverables/_versiones_anteriores/`.

**Números y dinero**
- **Comisión de tarjeta configurable** (Más → *Comisión de tarjeta*). Antes estaba fija en 4.06% y el ajuste no hacía nada. La tasa aplica a cobros nuevos; cada comisión ya registrada conserva la suya. Todas las pantallas y la casilla "cobrar comisión al cliente" usan la tasa vigente.
- **Comisión real de Mercado Pago:** en cada cobro aprobado en la terminal (venta o abono), la app consulta el pago y reemplaza la comisión estimada por la que Mercado Pago descontó. Si aún no la reporta, se conserva la estimada y en Detalle venta aparece *Consultar*.
- **Corte de caja:** el efectivo ahora muestra caja al abrir, ventas cobradas en efectivo, gastos y compras pagados en efectivo, aportaciones/retiros/traspasos por separado y la **caja esperada al cierre de ese día**. Antes "efectivo del día" mezclaba todo y el saldo era el de hoy aunque eligieras otra fecha.
- **Mermas en la utilidad:** los ajustes de inventario a la baja (caducado, dañado, regalo, faltante) se valúan a su costo y se restan de la **Utilidad estimada** (Inicio y Resumen de ventas). No cambian el Disponible porque no mueven dinero.

**Ventas**
- **Devolver productos / modificar venta** (Detalle venta): quita, reduce o agrega productos y ajusta el total. Las unidades devueltas regresan a su lote, el costo se recalcula y, si se cobró de más, se registra la devolución en la cuenta elegida. Si la venta se cobró en la terminal, puedes devolver **también en Mercado Pago** (devolución parcial) y la venta solo se modifica si Mercado Pago la acepta. Folio, fecha y cliente se conservan.
- **Abonos con tarjeta en la terminal:** el formulario de abono ofrece *💳 Cobrar abono en la terminal* (o *Ya lo cobré*), con los mismos avisos de modo Punto de Venta.

**Rendimiento y datos**
- **Fotos fuera de la base:** se guardan como archivos dentro de la app; las JPG de cualquier tamaño se reducen a 1024 px y se enderezan según la cámara (EXIF). Las fotos que ya tenías se mueven solas al abrir. Los respaldos siguen incluyendo las fotos.
- Se eliminó la copia interna completa que la 0.8 guardaba dentro de la base y se compacta la base una vez.
- Consultas agregadas en Ventas (pagado), Campañas, Paquetes y apartados de lotes: una consulta por pantalla en lugar de una por renglón.
- La actualización de datos del Excel ya no vuelve a fijar la comisión en 4.06% ni a crear la copia interna.

**Terminal**
- Si quedó un cobro sin confirmar (la app se cerró), se revisa solo al abrir.
- Si falla solo la consulta de terminales (red lenta), se intenta el cobro de todos modos; si la clave es rechazada, se avisa.

**Otros**
- Los selectores avisan cuando hay más de 150 opciones ("escribe para encontrar el resto").
- *Datos importados* muestra las cifras de la carga inicial desde los datos guardados, sin textos fijos.
- Versión 1.0.1 / código 18. Pruebas: `npm test` (51), `npm run test:ui`, `npm run test:forms`, `npm run test:photos`.

**Pendiente (no se puede resolver solo con la app):**
- La clave de Mercado Pago sigue en la base del teléfono sin cifrar: el runtime actual no incluye almacenamiento seguro. Protección actual: bloqueo con huella y la clave nunca sale en respaldos. Se resuelve en la fase 2 (servidor).
- Webhooks de Mercado Pago, varios teléfonos y Android de 32 bits requieren servidor o una compilación nativa nueva.
- Si Mercado Pago te reintegra la comisión al devolver un pago, la app no la reintegra sola: la comisión original queda como gasto (criterio conservador).

## 1.0.0 · Versión de apertura

**Bugs corregidos (sanity-check de todos los botones Guardar, `npm run test:forms`):**
- **Cliente o producto creado desde una venta:** al volver a la venta, el botón *Cobrar y confirmar venta* quedaba sin respuesta (el candado anti-doble-toque no se liberaba). Ahora se libera al cambiar de formulario, sin perder la protección contra doble toque.
- **Editar seguimiento de una venta:** el borrador copiaba también listas internas (renglones y cobros); ahora solo copia datos simples.
- Las cifras en cero ya no se muestran como "−$0.00".

**Nuevo:**
- **Corte de caja** (Más → Finanzas, o Inicio → Captura rápida): ventas del día por forma de pago (tarjeta con su 4.06%), ventas netas, gastos, resultado del día, efectivo del día y saldo en efectivo, canceladas y productos vendidos; elegir Hoy/Ayer u otra fecha; *Compartir corte* por WhatsApp y *Guardar respaldo del día*.
- **Ajuste de inventario** (Stock → *Ajustar conteo* o Detalle producto → *Ajustar existencias*): escribe las unidades contadas y el motivo (Conteo físico, Merma o caducado, Regalo o muestra, Dañado, Otro). Para bajar descuenta primero los lotes que caducan antes y respeta apartados; para subir crea un lote "Ajuste" con el último costo. No mueve dinero; queda en bitácora.
- **Renombrar cuentas** (Cuentas → *Renombrar*): cambia el nombre visible; el tipo y el historial se conservan.
- **Comprobante** (Detalle venta → *📲 Enviar comprobante*): por WhatsApp al teléfono del cliente o con el menú de compartir.
- **Terminal:** antes de cada cobro la app revisa que la Point esté en modo Punto de Venta; si no, avisa y ofrece *Ya lo cobré · registrar sin terminal* o *Enviar de todos modos*. Tras activar el modo, la lista indica "reinicia la terminal para aplicarlo".
- Versión 1.0.0 / código 17.

## 0.9.7 · Prueba de conexión con Mercado Pago

- *Guardar y probar conexión* valida la clave contra la lista de terminales (el mismo permiso que usa Point) en vez de `/users/me`, que algunas cuentas bloquean con `403 PA_UNAUTHORIZED_RESULT_FROM_POLICIES`. El nombre de la cuenta se muestra solo si Mercado Pago lo permite.
- Si la clave se rechaza por políticas (403), la app explica la causa habitual: Access Token de prueba o credenciales de producción sin activar. Las claves `TEST-…` se rechazan antes de enviarlas.
- Al conectar, se muestran de una vez las terminales encontradas.
- Versión 0.9.7 / código 16.

## 0.9.6 · Terminal Mercado Pago (Point Smart 2)

Conexión directa (opción A): la app habla con la API de Orders de Mercado Pago; el Access Token vive solo en el teléfono (base local), se pide la huella para guardarlo y **nunca** se incluye en los respaldos (se conserva al restaurar). Código en `src/mercadopago.ts`.

**Configurar (Más → Terminal Mercado Pago):**
1. Pega el Access Token de **producción** (Mercado Pago Developers → tu aplicación → Credenciales de producción) y toca *Guardar y probar conexión*.
2. Vincula la Point Smart 2 a una sucursal y caja con la app de Mercado Pago (en la terminal: "Soy responsable del negocio" → escanear QR).
3. *Buscar mis terminales* → *Activar modo Punto de Venta* → reinicia la terminal y confirma en Más opciones → Ajustes → Modo de vinculación: "Punto de Venta (PDV)".
4. *Usar esta* para elegirla. El interruptor *Enviar a la terminal los cobros con tarjeta* queda activo.
5. *Cobro de prueba de $10.00*: págalo con tu tarjeta y usa *Devolver* para reembolsarlo. No se registra como venta.

**Vender:** con una cuenta de tipo Tarjeta aparece *💳 Cobrar $X en la terminal*. La app valida stock y cliente, envía el monto (vence en 5 min), consulta el estado cada 3 s y registra la venta **solo si el pago queda aprobado** (order `processed`, pago `accredited`); guarda `mpOrderId`/`mpPaymentId` en la venta. Rechazado, cancelado o vencido: no se registra nada y se puede *Reintentar*. Si Mercado Pago pide confirmar en la terminal (`action_required`), la app pregunta si se aprobó. Si la app se cierra durante el cobro, Inicio muestra *Cobro en terminal sin confirmar* para revisarlo. *Ya lo cobré · registrar sin enviar a la terminal* conserva el registro manual.

**Cancelar una venta cobrada en terminal:** *Devolver en Mercado Pago y cancelar* (reembolso total vía API, hasta 90 días) o *Solo cancelar en la app*.

Límites: los abonos con tarjeta aún no se envían a la terminal; la consulta del estado es por sondeo (Mercado Pago recomienda webhooks, que requieren servidor: fase 2). Versión 0.9.6 / código 15.

## 0.9.5 · Cobrar la comisión al cliente

- En **Nueva venta**, al elegir una cuenta de tipo Tarjeta aparece la casilla **Cobrar la comisión al cliente (+4.06%)** (apagada por omisión, se decide en cada venta).
- Encendida, el total se calcula para que después del 4.06% recibas el precio completo: total = precio ÷ (1 − 0.0406), redondeado al centavo que lo garantiza. Ej.: precio $469.00 → cobras $488.85 → comisión $19.85 → recibes $469.00. (Sumar solo 4.06% daría $488.04 y te quedarían $468.23.)
- El resumen muestra Precio, ＋ Comisión de tarjeta y Total a cobrar; el detalle de la venta indica cuánto se cobró de comisión al cliente.
- La venta se registra por el total cobrado (cuenta en Ventas totales) y el 4.06% se descuenta como siempre, solo en tarjeta.
- Versión 0.9.5 / código 14.

## 0.9.4 · Logo GNS

- **Ícono de la app:** opción A (mosaico crema, G dorada, N roja, S negra y barra verde/lima), en versión cuadrada y redonda para todas las densidades.
- **Pantalla de arranque (splash):** marca GNS sobre fondo blanco.
- **Pantalla de inicio:** el encabezado usa el logotipo horizontal (opción C); también aparece al abrir la app y en el bloqueo con huella.
- El ícono y el splash reemplazan las imágenes del APK con el mismo nombre y formato (`native/res_overrides.json`), sin cambiar recursos ni firma. Fuentes en `assets/logo/` y `native/`; `app.json` ya apunta al ícono y splash para una compilación nativa futura.
- Versión 0.9.4 / código 13.

## 0.9.3 · Ventas canceladas

- **Ocultar:** Ventas abre en el filtro **Activas**; las canceladas no aparecen en Activas, Hoy ni Por cobrar, y la lista indica cuántas están ocultas. Se consultan en **Canceladas (N)**.
- **Eliminar:** desde el filtro Canceladas (una por una o todas) o desde el detalle de una venta cancelada. Elimina la venta por completo: renglones, lotes asignados, cobro, devolución y la comisión de tarjeta, como si no se hubiera registrado. Solo procede si la venta está cancelada y su inventario y cobro ya están en cero. Queda constancia en la bitácora (`sale.delete`).
- Versión 0.9.3 / código 12.

## 0.9.1 / 0.9.2 · Cifras de ventas

Inicio y Resumen de ventas presentan las cifras así (carga conciliada del Excel):

| Concepto | MXN |
| --- | ---: |
| **Ventas totales** | **5,409.00** |
| Transferencia | 3,374.00 |
| Tarjeta | 919.00 |
| − Comisión 4.06% (solo tarjeta) | −37.30 |
| = Tarjeta neta | 881.70 |
| Efectivo | 1,116.00 |
| **Ventas netas** (transferencia + tarjeta neta + efectivo) | **5,371.70** |
| − Gastos operativos (terminal 499 + publicidad 600) | −1,099.00 |
| **Disponible** (ventas netas − gastos operativos = saldo en cuentas) | **4,272.70** |

0.9.2: la comisión de 4.06% aparece únicamente en la línea de tarjeta; transferencia y efectivo no pagan comisión. El cálculo sin comisión (5,409.00 − 1,099.00 = 4,310.00) se muestra solo como nota de referencia.

El tablero principal muestra ventas totales; las ventas netas y el resultado aparecen desglosados debajo y respetan el periodo elegido (Hoy, 7 días, Mes, Todo). "Saldo registrado" se renombró a "Saldo en cuentas" y "Egresos operativos" a "Gastos operativos". Versión 0.9.1 / código 10.

## Instalación

1. En la versión actual: **Más → Respaldo → Guardar / compartir respaldo** y guarda el archivo en Drive, OneDrive o WhatsApp.
2. Abre `Nova_Negocio_1.1.1_Android.apk` y elige **Actualizar** encima de la app instalada. No desinstales ni borres datos.
3. Mismo paquete (`com.novasupps.negocio`), mismo certificado (Nova Supps, SHA-256 `3b71f02d…ae94`) y misma base de datos: no hay migración de esquema.

## Bugs corregidos

| # | Antes | Ahora |
|---|---|---|
| 1 | Cada tecla redibujaba toda la app y releía 9 consultas de la base. | Los datos se leen una vez por cambio guardado; escribir no toca la base (probado en `tests/ui.cjs`). |
| 2 | `stock()`, `sales()`, `customers()` y `campaigns()` hacían una consulta por renglón (N+1) y leían la foto de cada producto dos veces. | Una consulta por tipo de dato (`settingsMap`, `relationsMap`, `saleLinesBySale`). |
| 3 | La sesión se escribía en SQLite con cada tecla; con foto nueva, ~1.4 MB por tecla. Al editar un producto con foto, la foto se copiaba al borrador. | Guardado con pausa (700 ms) y al salir de la app; la foto guardada ya no se copia al borrador. |
| 4 | Detalle de venta y egresos mostraban la fecha UTC: después de las 6 pm aparecía el día siguiente. | Todas las fechas se muestran en hora local (`localDay`). |
| 5 | Los respaldos y copias "antes de restaurar" se acumulaban sin límite. Cada respaldo incluía la sesión y la copia interna previa a 0.8. | Se conservan las últimas 3 copias internas; el respaldo excluye `uiSession` y `beforeRelease08`. |
| 6 | La autorización "vender debajo del costo" se restauraba al reabrir la app. | Vale solo para la venta en curso. |
| 7 | Las etapas "Frecuente" e "Inactivo" del formulario de cliente fallaban con "Etapa inválida". | Etapas unificadas: Prospecto, Interesado, Cliente, Frecuente, Seguimiento, Inactivo. |
| 8 | Listas de stock, ventas y clientes dibujaban todos los elementos. | Listas virtualizadas (`FlatList`). |

## Mejoras de experiencia

- Barra inferior con íconos y botón flotante **＋ Venta** en Ventas, Stock y Clientes.
- Inicio: periodo **Hoy / 7 días / Mes / Todo** (se recuerda), ticket promedio, valor del inventario, seguimiento con accesos directos y aviso de respaldo pendiente.
- Venta: buscar y agregar con un toque, cantidades con − / ＋, cuentas como botones, resumen de total, cobro y crédito antes de confirmar.
- Importes flexibles: `1250`, `1,250.50`, `$1 250` o `1250,5`, con vista previa del monto.
- Fechas con atajos (Hoy, Mañana, En 1 semana; 6 meses o 1 año para caducidad) y calendario.
- Errores dentro del formulario, sin ventanas emergentes; avisos breves al guardar.
- Clientes: llamar o abrir WhatsApp con un toque; filtros Por contactar y Archivados.
- Archivar productos y clientes sin perder historial.
- Filtros: Stock (Bajo mínimo, Sin stock, Archivados) y Ventas (Hoy, Por cobrar, Canceladas).
- Menú Más agrupado por Inventario, Finanzas, Comercial y Datos.
- Caducidades próximas o vencidas resaltadas en Lotes.
- En tablet, el contenido se centra y las métricas usan 4 columnas.

## Validación

- `npm run check`: sin errores de TypeScript.
- `npm test`: 32 pruebas de negocio, importación y conciliación.
- `npm run test:ui`: recorrido de interfaz con SQLite real (resumen, egresos, stock → venta con tarjeta, borrador tras reinicio, doble toque sin doble cobro, sin relecturas al escribir, fecha rápida, WhatsApp, importe flexible y error en formulario).
- APK verificado con `apksigner verify` (v2/v3) y alineación de 16 KiB en bibliotecas nativas.
- Revisión visual con capturas en vista web. No se probó en un teléfono físico: valida venta, biometría, respaldo y fotos antes de usarla en toda la operación.

## Límites

Sin cambios nativos: no hay cámara directa ni compresión de fotos (se mantiene el límite de 1 MB) y no hay modo oscuro. Las devoluciones parciales siguen pendientes. La sincronización en línea queda para la segunda fase.
