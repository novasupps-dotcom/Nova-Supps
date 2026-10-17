# Configurar vendedores (multiusuario) · Nova Negocio 2.2

> **¿Ya tienes una versión anterior funcionando?** Revisa primero **Actualizar a 2.2** al final.

Tu teléfono sigue siendo **la caja central**: ahí viven inventario, ventas, cuentas y reportes, y tienes todos los permisos (eliminar, cancelar, devolver, aprobar).
Cada vendedor instala **la misma app** en su celular y solo puede vender.

| | Dueño (tu teléfono) | Vendedor (su teléfono) |
|---|---|---|
| Vender | ✅ precio libre, descuentos y crédito | ✅ solo precio de lista y de contado, con las formas de pago que le permitas (tarjeta por omisión) |
| Ver existencias y precios | ✅ con costos y márgenes | ✅ sin costos |
| Clientes | ✅ todo | ✅ dar de alta y buscar (teléfono oculto: •••1234) |
| Sus ventas | ✅ todas | ✅ solo las suyas del día y sus comprobantes |
| Cobrar con tarjeta en la terminal | ✅ | ✅ (la clave de Mercado Pago queda en el servidor) |
| Cierre de caja | ✅ corte general y los cierres de cada vendedor | ✅ su propio cierre (no se puede cambiar) |
| Cancelar, devolver, eliminar, gastos, cuentas, reportes | ✅ | ❌ |

Las ventas del vendedor pasan por una base en línea gratuita (Supabase) y se registran en tu teléfono **cuando abres la app** (se sincroniza sola cada minuto mientras está abierta, o con *Sincronizar ahora*).

---

## 1. Crear la base gratuita (una sola vez, ~10 min, desde la computadora)

1. Entra a **supabase.com** → *Start your project* → crea tu cuenta (puedes usar GitHub o tu correo).
2. **New project**: nombre `nova-negocio`, escribe una contraseña de base de datos (guárdala), región la más cercana (por ejemplo *East US*), plan **Free** → *Create new project*. Espera a que termine (1–2 min).
3. **Tablas y permisos:** menú izquierdo **SQL Editor** → *New query* → abre el archivo `supabase/schema.sql` de esta carpeta, copia **todo** su contenido, pégalo y toca **Run**. Debe decir *Success. No rows returned*. (Se puede volver a ejecutar sin perder datos.)
4. **Registro:** **Authentication** → *Sign In / Providers* → desactiva **Confirm email**. Deja **Allow new users to sign up** encendido solo mientras creas tu cuenta de dueño (paso 2.2); después **apágalo**: los vendedores se dan de alta con código a través del servidor.
5. **Función de cobro con tarjeta** (solo si tus vendedores cobrarán con la terminal):
   1. **Edge Functions** → *Deploy a new function* → **Via Editor**.
   2. Nombre: `cobro-terminal` (exacto).
   3. Borra el ejemplo, abre `supabase/functions/cobro-terminal/index.ts` de esta carpeta, copia todo y pégalo → **Deploy function**.
   4. En los ajustes de la función, si ves **Verify JWT** (o *Enforce JWT verification*), desactívalo: la función revisa por su cuenta que quien llama sea un vendedor aprobado.
   5. **Edge Functions → Secrets** → *Add new secret*: nombre `MP_ACCESS_TOKEN`, valor: tu Access Token de **producción** de Mercado Pago (el mismo `APP_USR-…` que pusiste en la app) → *Save*.
6. **Datos para la app:** **Settings → API Keys** (o el botón **Connect** arriba). Copia:
   - **Project URL** (algo como `https://abcd1234.supabase.co`).
   - **Publishable key** (`sb_publishable_…`). Si tu proyecto solo muestra claves antiguas, usa la **anon public** (`eyJ…`).
   - ⚠️ Nunca uses ni compartas la *secret key* / *service_role*.

## 2. Conectar tu teléfono (dueño)

1. Instala `Nova_Negocio_1.5.1_Android.apk` encima de tu app (Actualizar; no se pierden datos). Antes, guarda un respaldo (Más → Respaldo).
2. **Más → Equipo y vendedores** → escribe tu nombre, tu correo y una contraseña → **Crear cuenta de dueño** (la app ya trae la URL y la clave de tu base). Si ya la creaste, usa *Entrar*.
3. **Dónde se registran sus cobros:** elige la cuenta para Efectivo, Transferencia y Tarjeta.
4. **Cobro con tarjeta desde el teléfono del vendedor:** activa el interruptor (requiere tu terminal configurada en Más → Terminal Mercado Pago) y toca **Probar función del servidor**. Debe decir *La función responde. Terminal lista para vendedores.*
5. **Código de recuperación:** en *Equipo y vendedores → Código de recuperación del dueño* toca **🔑 Generar código de recuperación** y anótalo en papel (o guárdalo en otro dispositivo). Solo se muestra una vez. Lo necesitarás si cambias o pierdes este teléfono.

## 3. Dar de alta a un vendedor (código de un solo uso)

1. En tu teléfono: **Equipo y vendedores → Invitar vendedor** → escribe su nombre → **🎟️ Crear código de invitación**. Aparece un código como `GNS-7K4P-Q2XM`.
2. Toca **📨 Enviar por WhatsApp** y mándale también el archivo APK.
3. En el teléfono del vendedor: instala el APK → **Soy vendedor** → escribe **a mano** los 8 caracteres del código (el `GNS-` y el guion ya están puestos; no se puede pegar), su nombre, su correo y una contraseña (mínimo 8) → **Crear mi cuenta**. Entra de inmediato.

Reglas de seguridad:
- **Es la única forma de crear una cuenta.** El registro abierto está apagado; sin código válido nadie puede darse de alta.
- **El código sirve una sola vez**, vence en 7 días y puedes **Revocarlo** antes de que lo usen. Después de 20 intentos fallidos desde la misma conexión en una hora, se bloquea.
- **Cada cuenta queda ligada a su teléfono.** Si alguien entra con el mismo correo y contraseña en otro celular, no ve ni puede hacer nada.
- **Cambio de teléfono:** el vendedor instala la app en su teléfono nuevo y entra con su correo y contraseña. Ese teléfono queda como el de su cuenta y el anterior se desconecta solo.
- **Olvidó su contraseña:** en la app toca **¿Olvidaste tu contraseña?**: le llega un correo con un código de 6 dígitos y pone una nueva (requiere el paso “Correos de recuperación”). Si no le llega, en **Equipo → 🔑 Nueva contraseña** le pones una tú.
- Para quitarle el acceso: **Desactivar** (puedes volver a **Activar**).
- **Eliminar usuario** (en cada vendedor y en *Cuentas sin acceso a la tienda*): borra la cuenta con su correo y datos de registro. Sus ventas y cierres de caja se conservan. El correo queda libre para darlo de alta otra vez con un código nuevo.
- **Puede cobrar con:** en cada vendedor eliges Tarjeta (terminal), Efectivo y/o Transferencia. Al vender, la **tarjeta en la terminal viene elegida por omisión**. El servidor rechaza cualquier forma de pago que no le hayas permitido.
- **Datos para transferencia:** en **Ajustes → Formas de pago** capturas tus cuentas (Mercado Pago, Banamex…: titular, CLABE, cuenta o tarjeta). En **Equipo** eliges cuáles ve cada vendedor. Aparecen SOLO cuando se elige *Transferencia* al vender (en tu teléfono y en el del vendedor), con botón para mandárselos al cliente por WhatsApp. Cada dato se liga a una cuenta de la app (*Se registra en la cuenta*); si el vendedor tiene más de una cuenta asignada, al vender elige a cuál le pagaron y la venta cae en esa cuenta. En **Ventas → Forma de cobro** filtras Efectivo, cada banco y Terminal.
- **Comisión de tarjeta:** desde la 1.7 va incluida en el precio de catálogo, igual para todos los vendedores y con cualquier forma de pago (ya no hay opción por vendedor).
- **Cierres de caja:** el vendedor, en la pestaña **Caja**, ve lo que vendió desde su último cierre (productos, unidades, total y por forma de pago) y toca **Cerrar caja**. El cierre queda guardado en el servidor y nadie (ni él ni tú) lo puede cambiar o borrar. Tú los ves en **Equipo → 🧮 Cierres de caja**.

---

## Cómo funciona en el día a día

- **Existencias:** el vendedor ve lo que tu teléfono publicó menos lo que **todos** los vendedores ya vendieron y tú aún no registras (el servidor lo aparta). Tu teléfono publica las existencias cada vez que cambian.
- **Precios y total los pone el servidor:** antes de registrar o cobrar, el teléfono del vendedor confirma precios y existencias. Si una venta sin internet se cobró con un precio que ya cambió, te llega “por revisar” con lo cobrado y lo que da la lista.
- **Sin internet en el teléfono del vendedor:** la venta se guarda y se envía sola cuando vuelve la señal (*Mis ventas* la marca como “Sin enviar”). La tarjeta sí requiere internet.
- **Ventas por revisar:** si una venta del vendedor no se puede registrar (por ejemplo, dos vendedores vendieron la última pieza), aparece en Inicio y en Equipo con el motivo. Corrige (Entrada o Ajuste de inventario) y toca **Reintentar**, o **Descartar** (si fue con tarjeta, puedes devolver el cobro ahí mismo).
- **Cobros con tarjeta del vendedor:** el servidor solo acepta la venta si el cobro lo creó ese vendedor, está aprobado, es por el mismo total y no se usó en otra venta. Además tu teléfono vuelve a confirmar con Mercado Pago y pone la comisión real.
- **Folio:** las ventas de vendedores tienen folio `V-XXXXXX`, el mismo en su comprobante y en tu teléfono, con la leyenda “Vendida por …”.

## Plan gratuito de Supabase

- 500 MB de base de datos, 50,000 usuarios al mes y 500,000 llamadas a funciones: de sobra para la tienda.
- **Pausa por inactividad:** si pasa una semana sin uso, Supabase pausa el proyecto (te avisa por correo). Con uso diario no pasa. Si se pausa, entra a supabase.com → tu proyecto → **Restore project**; los datos se conservan.

## Seguridad

- La clave de Mercado Pago del servidor solo permite crear cobros en tu terminal, consultarlos y cancelarlos antes de pagarse. **No permite devoluciones** ni ver tu saldo.
- Los permisos están en la base (Row Level Security): un vendedor no puede cambiar precios, ver ventas de otros, aprobarse a sí mismo ni hacerse dueño, aunque modifique la app.
- Los vendedores **no** descargan tu lista de clientes: buscan por nombre o últimos 4 dígitos y ven el teléfono oculto (•••1234). El número completo solo se usa para mandar el comprobante de su propia venta de los últimos 2 días.
- Tu cuenta de dueño también queda ligada a tu teléfono.
- **Huella o rostro** (opcional): si el teléfono los tiene, se piden al abrir la app. No hay PIN.
- **El APK no lleva datos de tu negocio y no se puede “empezar de cero” como dueño.** Para usar un teléfono como el del dueño hay que entrar con TU correo y contraseña; solo después se restaura el respaldo. Guarda tus respaldos en un lugar privado: el respaldo sí contiene tu negocio.
- **Una cuenta, un teléfono a la vez:** iniciar sesión en otro teléfono desconecta el anterior. Cuida tu contraseña: es lo que protege tu cuenta.
- **El código de invitación (GNS) se escribe a mano:** el prefijo y el guion los pone la app y no se puede pegar.

## Cambiar el teléfono del dueño

1. En el teléfono nuevo instala la app y en **Inicia sesión** escribe tu correo y contraseña de dueño → **Entrar**. Tu cuenta pasa a este teléfono y el anterior deja de ser dueño.
2. **📂 Elegir mi respaldo** (tu archivo más reciente). Si cierras la app antes de este paso, al volver te lleva directo aquí.
3. ¿Olvidaste tu contraseña? Toca **¿Olvidaste tu contraseña?** en la misma pantalla.

## Correos de recuperación de contraseña (una sola vez)

Supabase, sin configurar, **solo manda correos a los integrantes de tu cuenta de Supabase** y máximo 2 por hora. Para que les lleguen a tus vendedores:

1. **Correo de salida (SMTP).** supabase.com → tu proyecto → **Authentication → Emails → SMTP Settings** → *Enable custom SMTP*. Con Gmail:
   - Host `smtp.gmail.com`, puerto `587`, usuario: tu Gmail, contraseña: una **contraseña de aplicación** (cuenta de Google → Seguridad → Verificación en 2 pasos → Contraseñas de aplicaciones).
   - Sender email: tu Gmail · Sender name: `GNS · Nova Supps` → **Save**.
2. **Plantilla con código.** **Authentication → Emails → Templates → Reset password**. Asunto: `Tu código para cambiar la contraseña`. Cuerpo (reemplaza todo):
   ```html
   <h2>GNS · Nova Supps</h2>
   <p>Tu código para poner una contraseña nueva en Nova Negocio es:</p>
   <h1>{{ .Token }}</h1>
   <p>Escríbelo en la app. Si no lo pediste, ignora este correo.</p>
   ```
   → **Save**. (La app usa el código; no hace falta ningún enlace.)
3. Prueba: en la app toca **¿Olvidaste tu contraseña?** con tu correo.

Mientras no lo configures, puedes ponerle una contraseña nueva a un vendedor desde **Equipo → 🔑 Nueva contraseña**.

---

## Actualizar a 1.1.1 (seguridad)

Si ya tenías la 1.1.0 funcionando:
1. **SQL Editor** → *New query* → pega de nuevo **todo** `supabase/schema.sql` (versión nueva) → **Run** → *Run this query* si pregunta. Debe decir *Success*.
2. **Edge Functions → cobro-terminal → Code** → reemplaza todo el código por el nuevo `supabase/functions/cobro-terminal/index.ts` → **Deploy**. (Verify JWT debe seguir apagado.)
3. **Authentication → Sign In / Providers** → **apaga “Allow new users to sign up”** → *Save changes*. Las cuentas nuevas ya solo se crean con código.
4. Instala la **1.1.1** en tu teléfono **y en el de cada vendedor** (la 1.1.0 deja de conectarse). Al abrirla, cada teléfono queda registrado a su cuenta.
5. Los vendedores que ya tenías siguen igual; solo deben abrir la app 1.1.1 en **su** teléfono.
- La sesión en línea no se incluye en los respaldos.

---

## Actualizar a 1.2 (seguridad)

Si ya tenías la 1.1.0 o 1.1.1 funcionando:
1. **Antes que nada:** en tu teléfono, **Más → Respaldo → Guardar respaldo**, y guárdalo fuera del teléfono.
2. **SQL Editor** → *New query* → pega de nuevo **todo** `supabase/schema.sql` (versión 1.2) → **Run** → *Run this query* si pregunta. Debe decir *Success*.
3. **Edge Functions → cobro-terminal → Code** → reemplaza todo por el nuevo `supabase/functions/cobro-terminal/index.ts` → **Deploy**. (Verify JWT sigue apagado.)
4. Instala la **1.2** en tu teléfono **y en el de cada vendedor** el mismo día: con el servidor 1.2, la 1.1 ya no puede enviar ventas (se quedan guardadas en su teléfono hasta que actualice; no se pierden).
5. (En la 1.3 ya no hay PIN.)
6. En tu teléfono: **Equipo y vendedores → 🔑 Generar código de recuperación** y anótalo.
7. **Borra los APK anteriores** (1.1.1 y previos) de los chats de WhatsApp, Drive y de los teléfonos de los vendedores: esos archivos llevaban dentro los datos iniciales del negocio (catálogo, costos, clientes y ventas de septiembre). Comparte solo el de la 1.2.

---

## Actualizar a 1.3

1. Guarda un respaldo de tu teléfono (Más → Respaldo).
2. **SQL Editor** → pega de nuevo **todo** `supabase/schema.sql` (versión 1.3) → **Run**. Debe decir *Success*.
3. **Edge Functions → cobro-terminal → Code** → reemplaza todo por el nuevo `supabase/functions/cobro-terminal/index.ts` → **Deploy** (Verify JWT apagado).
4. Instala la **1.3.1** en tu teléfono y en el de cada vendedor.
5. Revisa en **Equipo y vendedores → Puede cobrar con** las formas de pago de cada vendedor (por omisión: las tres, con tarjeta elegida).
6. Si aún no lo tienes, genera tu **código de recuperación** y anótalo en papel: sin él no se puede pasar el negocio a otro teléfono.

### Actualizar a 1.3.1 (comisión de tarjeta del vendedor)

1. **SQL Editor** → pega de nuevo **todo** `supabase/schema.sql` → **Run**.
2. Instala la **1.3.1** en tu teléfono y en el de cada vendedor (la función del servidor no cambia).
3. En **Equipo y vendedores**, revisa en cada vendedor *Sumar comisión 4.06% al cliente con tarjeta*.

---

## Actualizar a 1.4

1. **SQL Editor** → pega de nuevo **todo** `supabase/schema.sql` → **Run**.
2. **Edge Functions → cobro-terminal → Code** → reemplaza todo por el nuevo `index.ts` → **Deploy** (Verify JWT apagado).
3. Configura los **Correos de recuperación de contraseña** (sección de arriba).
4. Instala la **1.4.0** en tu teléfono y en el de cada vendedor.
5. Captura tus cuentas en **Ajustes → Formas de pago** y elige ahí quién usa cada una (tú y cada vendedor).

### Actualizar a 1.5

1. **SQL Editor** → pega de nuevo **todo** `supabase/schema.sql` → **Run**.
2. Instala la **1.5.1** en tu teléfono y en el de cada vendedor.
3. En **Ajustes → Formas de pago**, abre cada dato (Mercado Pago, Banamex) → *Editar* → revisa *Se registra en la cuenta* → **Guardar datos**.

### Actualizar a 1.6 (débito, crédito y MSI · reemplazada por la 1.7: sáltala)

1. **SQL Editor** → pega de nuevo **todo** `supabase/schema.sql` → **Run**.
2. **Edge Functions → cobro-terminal → Code** → reemplaza todo por el nuevo `index.ts` → **Deploy** (Verify JWT apagado).
3. Instala la **1.6.0** en tu teléfono y en el de cada vendedor (los vendedores con versiones anteriores ya no pueden cobrar con tarjeta: el servidor pide el tipo de tarjeta).
4. En tu teléfono: **Más → 💳 Tarifas Mercado Pago** → revisa que las tarifas coincidan con las de tu cuenta de Mercado Pago (si no, *Editar tarifas* → **Guardar tarifa nueva**). Después **Sincronizar ahora** para que los vendedores las reciban.

### Actualizar a 1.7 (precio con comisión incluida)

1. **SQL Editor** → pega de nuevo **todo** `supabase/schema.sql` → **Run**. Supabase avisa *Potential issue detected* porque el script borra y vuelve a crear funciones y políticas: no borra datos → **Run query**.
2. La función **cobro-terminal no cambia** (si ya tenías la de la 1.5 o la 1.6, sirve igual).
3. Instala la **1.7.0** primero en tu teléfono: al abrirla, los precios suben 4.06% una sola vez y se publican a los vendedores. Después instálala en el teléfono de cada vendedor.
4. Revisa en **Stock** que los precios queden como quieres (por ejemplo $369.00 → $383.98). Si quieres redondear alguno, edítalo; ya no se vuelve a subir.

### Actualizar a 1.8

Sin cambios en Supabase (si no ejecutaste el `schema.sql` de la 1.7, hazlo primero). Instala la **1.8.0** en tu teléfono y en el de cada vendedor.

### Actualizar a 2.1 (promociones, reportes, catálogo para clientes, respaldo en la nube y lector)

Qué cambia en el servidor: promociones calculadas igual que en la app, categoría de venta y código de barras en el catálogo, respaldo en la nube (solo lo lee y escribe el dueño desde su teléfono registrado), los datos de transferencia solo llegan al vendedor que los tiene asignados y las ventas en revisión apartan sus piezas.

Pasos (en este orden):

1. **SQL Editor** → pega de nuevo **todo** `supabase/schema.sql` → **Run** (si avisa *Potential issue detected* → **Run query**; no borra datos).
2. La función **cobro-terminal no cambia** (es la de la 2.0.3).
3. Instala la **2.1.0** en tu teléfono y toca **Sincronizar ahora** (Parámetros → Invitar, formas de pago y sincronizar). Se publican la categoría y el código de barras de cada producto, y se hace el primer respaldo en la nube.
4. Instala la **2.1.0** en el teléfono de cada vendedor **antes de crear promociones**. Un vendedor con la 2.0.x no conoce las promociones: el servidor le cobra con descuento y su venta queda *en revisión* (con tarjeta, no le cuadra el monto).
5. Crea tus promociones en Parámetros → Promociones. Se publican al sincronizar.

Si te saltas el paso 1, la app no se detiene: sincroniza sin las columnas nuevas y te muestra el aviso *Tu base en línea es de una versión anterior*; los vendedores no pueden cobrar con promoción (*El servidor aún no tiene las promociones*) y el respaldo en la nube te pide actualizar la base. Al ejecutar el SQL todo se corrige solo en la siguiente sincronización.

Lector de códigos: cualquier lector USB o Bluetooth que funcione como teclado. Captura el código de barras en el producto (Stock → *Editar* → *＋ Más detalles* → *Código de barras*; puedes leerlo con el mismo lector); en Vender, lee el código en el buscador y el producto se agrega al carrito. También acepta el SKU.

### Actualizar a 2.0.3 (cobrar con la terminal en modo normal)

Con la terminal en **modo Punto de Venta** la app le manda el cobro, como antes. En **modo normal** Mercado Pago no le deja recibir cobros de ninguna app; desde la 2.0.3 eso ya no detiene a nadie:

- El vendedor toca *Cobrar en la terminal* y la app le avisa que la terminal está en modo normal. Cobra el total directamente en la terminal y, cuando diga *Aprobado*, toca **✅ Ya cobré en la terminal**.
- El servidor busca en tu Mercado Pago ese pago (aprobado, cobrado en la terminal, por el monto exacto, de las últimas horas y que no esté ligado a otra venta) y lo liga a la venta. Si hay varios pagos por el mismo monto, el vendedor elige el suyo por hora y últimos 4 dígitos. Un mismo pago nunca se liga dos veces.
- Tú haces lo mismo en tu teléfono: **✅ Ya cobré en la terminal · buscar el pago** (queda con tarjeta, autorización y comisión real). *Registrar sin datos del pago* sigue disponible.
- Si la terminal está en Punto de Venta pero el cobro no le llega (por ejemplo, aún no se reinicia después de cambiar el modo), aparece **¿No llega a la terminal? Cobrar ahí directo**.

Pasos:

1. **Edge Functions → cobro-terminal → Code** → reemplaza todo por el nuevo `supabase/functions/cobro-terminal/index.ts` → **Deploy** (Verify JWT apagado). **Sin este paso los vendedores no pueden ligar el pago.**
2. Opcional: **SQL Editor** → pega de nuevo **todo** `supabase/schema.sql` → **Run** (agrega un candado para que un pago no se use dos veces; la función ya lo evita).
3. Instala la **2.0.3** en tu teléfono y en el de cada vendedor.
4. Prueba: con la terminal en modo normal haz una venta de prueba con tarjeta desde un vendedor, cóbrala en la terminal y toca *Ya cobré*. Si dice que *no viene de la terminal*, avísame: Mercado Pago marcó el pago distinto y hay que ajustar la búsqueda.

### Actualizar a 2.0 (el cliente absorbe la comisión · recibes tu precio exacto)

Reemplaza a la 1.9: si no ejecutaste el SQL de la 1.9, sáltalo y usa directo este.

1. **SQL Editor** → pega de nuevo **todo** `supabase/schema.sql` → **Run** (si avisa *Potential issue detected* → **Run query**; no borra datos).
2. La función **cobro-terminal no cambia**.
3. Instala la **2.0.0** en tu teléfono (si venías de la 1.7/1.8, al abrirla los precios regresan a tu precio original) y toca **Sincronizar ahora** en Parámetros → Vendedores.
4. Instala la **2.0.0** en el teléfono de cada vendedor. Un vendedor con versión anterior no puede cobrar con tarjeta (el monto no cuadra) y sus ventas en efectivo quedan en revisión; uno con la 2.0 y el servidor sin actualizar ve *El servidor aún no tiene la comisión 2.0* y no cobra.
5. Para cambiar el porcentaje: Parámetros → Comisión → *Cambiar porcentaje*. Se envía solo al servidor y a los vendedores.

### Actualizar a 1.9 (reemplazada por la 2.0: sáltala)

1. **SQL Editor** → pega de nuevo **todo** `supabase/schema.sql` → **Run** (si avisa *Potential issue detected* → **Run query**; no borra datos). Desde aquí el servidor suma la comisión al precio en todas las ventas de vendedores.
2. La función **cobro-terminal no cambia**.
3. Instala la **1.9.0** primero en tu teléfono: al abrirla, los precios regresan **una sola vez** a su precio original (por ejemplo $383.98 → $369.00) y se publican a los vendedores al sincronizar.
4. Instala la **1.9.0** en el teléfono de cada vendedor. Mientras un vendedor tenga la 1.8, el servidor no le acepta cobros con tarjeta (el monto no cuadra) y sus ventas en efectivo quedan *en revisión*; un vendedor con la 1.9 y el servidor sin actualizar ve el aviso *El servidor aún no suma la comisión* y no cobra.
5. Revisa en **Stock** los precios. Los que escribiste en pesos cerrados después de la 1.7 (por ejemplo $399.00) se respetan como precio sin comisión.


## Actualizar a 2.2

1. Abre Supabase → SQL Editor y carga TODO `supabase/schema.sql`. El dueño revisa y da **Run**. Incluye 2.1 y 2.2 y conserva los registros existentes.
2. Sigue [COMPILAR_ANDROID_EAS.md](COMPILAR_ANDROID_EAS.md) para crear Expo/Firebase, configurar FCM V1, compilar Android y refirmar el APK localmente con la llave original.
3. Instala el APK refirmado encima de la versión anterior en dueño y vendedores; luego **Sincronizar ahora / Actualizar ahora**.
4. En el dueño: Parámetros → Equipo → **Avisos en este teléfono**. En el vendedor: Cuenta → **Avisos en este teléfono**. Activa el permiso de Android.
5. Comprueba una venta, cierre de caja, rechazo, lector y foto con los teléfonos reales.

Cada cuenta registra únicamente el teléfono autorizado. Un teléfono anterior o vendedor desactivado deja de recibir avisos. Desactivar sin internet muestra que falta retirar el registro; la app vuelve a intentarlo al sincronizar y conserva el identificador hasta confirmar el retiro.

El almacén seguro migra la sesión y configuración de Mercado Pago conservando los valores. Los datos y tokens del teléfono quedan fuera del respaldo. Una compilación antigua sin SecureStore requerirá volver a entrar después de esa migración.

La prueba real de **Ya cobré** en la terminal en modo normal sigue pendiente del usuario. La función publicada `cobro-terminal` no se cambió para la 2.2.

