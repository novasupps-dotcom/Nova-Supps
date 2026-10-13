# Nova Negocio en iPhone

A diferencia de Android, en iPhone no se puede instalar un archivo como el APK. Apple exige que toda app esté firmada con una cuenta de desarrollador de pago y que llegue por **TestFlight** (la app oficial de Apple para probar apps) o por la App Store.

El código ya está listo para iPhone desde la versión 2.0.2. Solo falta compilarlo y subirlo con **tus** cuentas.

- **No hace falta una Mac.** La app se compila en la nube de Expo (EAS) y tú lo ordenas desde tu computadora con Windows.
- **Tus contraseñas las escribes solo tú.** No las compartas con nadie, tampoco en el chat: la de Apple, el código de verificación de 6 dígitos y la de Expo.

| Qué | Costo | Para qué |
| --- | --- | --- |
| Apple Developer Program | 99 USD al año | Firmar la app y usar TestFlight |
| Cuenta de Expo (plan gratis) | $0 | Compilar en la nube: 15 compilaciones de iPhone en el plan gratis (fila de baja prioridad; en horas pico puede tardar más de 90 min en empezar) |
| Node.js LTS | Gratis | Correr los comandos en tu computadora |

---

## 1. Una sola vez: cuentas y programas

1. **Inscríbete en Apple Developer Program** en developer.apple.com/programs/enroll con tu Apple ID. Necesitas tener activada la verificación en dos pasos.
   - **Persona física:** es lo más rápido. En TestFlight aparecerá tu nombre como desarrollador.
   - **Empresa:** aparece el nombre de tu negocio, pero necesitas el número D-U-N-S de la empresa y el trámite tarda más.
   - Apple puede tardar de unas horas a un par de días en aprobarte. Espera el correo de bienvenida antes de seguir.
2. **Crea tu cuenta de Expo** gratis en expo.dev/signup.
3. **Instala Node.js** en tu computadora: entra a nodejs.org, descarga la versión **LTS** e instálala con las opciones por omisión.
4. **Abre la terminal en la carpeta del proyecto:**
   1. Abre en el Explorador de Windows la carpeta `Nova_Negocio_Proyecto_0.8`.
   2. Haz clic en la barra de dirección (arriba, donde dice la ruta).
   3. Escribe `cmd` y presiona Enter. Se abre el *Símbolo del sistema* ya ubicado en esa carpeta.
5. **Instala lo necesario.** Copia y pega cada línea y presiona Enter; espera a que termine antes de pegar la siguiente:

   ```
   npm ci
   npm install -g eas-cli
   eas login
   ```

   - `npm ci` instala las piezas de la app y tarda unos minutos.
   - `eas login` te pide tu correo y contraseña de Expo.
6. **Liga el proyecto con tu cuenta de Expo:**

   ```
   set EAS_NO_VCS=1
   eas init
   ```

   - Responde **Y** (sí) a lo que pregunte. Esto agrega a `app.json` una línea `projectId`.
   - **No la borres.** En cada actualización que te mande, esa línea se conserva.

> **Si después cierras la ventana:** cada vez que abras una terminal nueva, vuelve a escribir `set EAS_NO_VCS=1` antes de cualquier comando `eas`.
>
> Con ese ajuste verás avisos amarillos como *Using EAS CLI without version control system…* o *Failed to get Git root path…*. Son normales: Expo toma esta carpeta como la del proyecto.
>
> Ese ajuste le dice a Expo que esta carpeta no usa Git. Lo que **no** se sube a Expo lo decide el archivo `.easignore`: tu llave de firma de Android (`signing`), los APK, los respaldos y las carpetas `_respaldo…` nunca salen de tu computadora.

---

## 2. Compilar y subir a TestFlight

En la terminal, dentro de la carpeta del proyecto:

```
set EAS_NO_VCS=1
eas build -p ios --profile production --auto-submit
```

La primera vez te hace varias preguntas. Responde así:

| Pregunta (en inglés) | Respuesta |
| --- | --- |
| *Do you want to log in to your Apple account?* | **Y**. Escribe tu Apple ID, tu contraseña y el código de 6 dígitos que te llega al iPhone. |
| *Select a team* (si tienes varios) | El de tu cuenta de desarrollador |
| *Generate a new Apple Distribution Certificate?* | **Y** |
| *Generate a new Apple Provisioning Profile?* | **Y** |
| *Generate a new App Store Connect API Key?* (o *Reuse…*) | **Y** |
| *App name* o aviso de que el nombre ya existe en la App Store | Pon otro nombre, por ejemplo **Nova Negocio GNS**. En el iPhone el ícono sigue diciendo "Nova Negocio". |

- Expo guarda los certificados de forma segura. Tú no tienes que manejar archivos de Apple.
- La terminal muestra un enlace para ver el avance. La compilación tarda unos 20–40 min, más la espera en fila del plan gratis.
- Al terminar, se sube sola a **App Store Connect** (appstoreconnect.apple.com). Apple tarda de 5 a 15 min en procesarla.
- Si te llega un correo de Apple por "Missing Compliance": la app ya declara que solo usa el cifrado estándar (HTTPS). Si aun así lo pide en App Store Connect, elige **None of the algorithms mentioned above**, que significa que no usa cifrado propio.

---

## 3. Instalarla en tu iPhone (tú, el dueño)

1. En App Store Connect, entra a **Apps → Nova Negocio → TestFlight**.
2. En **Internal Testing**, presiona **+** para crear un grupo (por ejemplo, "Dueño") y agrégate tú.
3. En tu iPhone, instala **TestFlight** desde la App Store y entra con el mismo Apple ID.
4. Te llega un correo. Ábrelo en el iPhone, toca **View in TestFlight** y luego **Instalar**.

### Pasar tu negocio del Android al iPhone

1. **En el Android:** ve a *Parámetros → Respaldo y Excel → Guardar / compartir respaldo*. Mándate el archivo `Nova-respaldo-….json` por WhatsApp o por correo.
2. **En el iPhone:** abre el archivo que te mandaste, toca compartir y elige **Guardar en Archivos**.
3. **En Nova Negocio en el iPhone:** entra con tu correo y contraseña de dueño. En la pantalla *Restaura tu negocio*, toca **📂 Elegir mi respaldo** y elige el archivo.
4. **Vuelve a capturar lo que por seguridad no viaja en el respaldo:**
   - el Access Token de Mercado Pago (*Parámetros → Terminal Mercado Pago*);
   - tu PIN o Face ID.

Al iniciar sesión, el iPhone queda como el teléfono del dueño y el Android se desconecta solo. Es la misma regla de siempre: una cuenta, un teléfono.

---

## 4. Vendedores con iPhone

Los vendedores pueden tener Android (APK) o iPhone; todos trabajan contra la misma tienda. Para los de iPhone hay dos caminos:

**A) Prueba externa (recomendada para vendedores).** El vendedor no necesita acceso a tu cuenta de Apple.

1. En *TestFlight → External Testing*, presiona **+** y crea el grupo "Vendedores". Apple pide crear antes un grupo interno, que ya hiciste en el paso 3.
2. Agrega la compilación al grupo y llena lo que pide:
   - una descripción corta;
   - un correo de contacto;
   - en *Sign-in information*, aclara que se puede entrar como **Dueño** sin cuenta para revisar la app.
3. Apple revisa la **primera** compilación de cada versión (*Beta App Review*), normalmente en uno o dos días. Las siguientes compilaciones de la misma versión pasan directo.
4. Activa el **enlace público** del grupo y mándalo por WhatsApp. El vendedor:
   1. instala TestFlight;
   2. abre el enlace;
   3. instala Nova Negocio;
   4. entra con su código de invitación o con su correo y contraseña.

**B) Prueba interna.** Es inmediata y no tiene revisión, pero cada vendedor debe ser usuario de tu App Store Connect.

1. Entra a *Users and Access → +* y registra a cada vendedor con un rol limitado, por ejemplo **Marketing**. El vendedor acepta la invitación que le llega por correo.
2. Agrégalo a tu grupo interno. Si no aparece en la lista para agregarlo, cámbiale el rol (por ejemplo, a *Developer*).

En total puedes tener hasta 100 probadores internos y hasta 10,000 externos.

---

## 5. Actualizaciones y vencimiento

- **Las compilaciones de TestFlight vencen a los 90 días.** Antes de que pasen, vuelve a correr el comando del paso 2, aunque no haya cambios. La nueva compilación reemplaza a la anterior y los datos del teléfono no se pierden.
- **Cuando te mande una versión nueva:**
  1. Actualiza la carpeta del proyecto como siempre.
  2. Corre de nuevo `npm ci`.
  3. Corre el comando del paso 2.
  4. En TestFlight, todos ven el botón **Actualizar**, o se actualiza sola si activan *Actualizaciones automáticas*.
- El número de compilación sube solo. No hace falta editar nada.

---

## Otra opción: instalación directa (ad hoc), sin TestFlight

Sirve para pocos iPhones conocidos (máximo 100 por año). No vence a los 90 días, pero cada iPhone nuevo obliga a volver a firmar la app.

1. Registra cada iPhone:

   ```
   set EAS_NO_VCS=1
   eas device:create
   ```

   Comparte el enlace o QR. Cada persona lo abre en Safari, instala el perfil (en *Ajustes → Perfil descargado → Instalar*) y su iPhone queda registrado.
2. Compila:

   ```
   eas build -p ios --profile preview
   ```

   Al terminar, comparte el enlace o QR de instalación.
3. Si iOS lo pide al abrir la app, activa **Modo de desarrollador** en *Ajustes → Privacidad y seguridad* y reinicia el iPhone.
4. Cuando agregues un iPhone nuevo, regístralo y corre `eas build:resign`, o compila otra vez.

---

## Si algo falla

| Mensaje | Qué hacer |
| --- | --- |
| `'eas' no se reconoce como un comando…` | Cierra la terminal y ábrela de nuevo; si sigue, repite `npm install -g eas-cli`. |
| `git command not found` o pregunta por Git | Te faltó `set EAS_NO_VCS=1` en esta terminal. |
| `npm ci` marca error de versiones | Borra la carpeta `node_modules` del proyecto y repite `npm ci`. |
| *You have no team associated with your Apple account* | Apple aún no aprueba tu inscripción al programa de desarrollador. |
| La compilación falla en la nube | Copia el enlace de la compilación o el texto del error y mándamelo. No mandes contraseñas ni códigos. |

Qué cambió en la app para iPhone (2.0.2):

- **Ícono:** propio para iOS, sin transparencias.
- **Fotos del producto:** se eligen desde Fotos, la cámara o Archivos. HEIC y PNG se convierten a JPG de 1024 px.
- **Teclado:** ya no tapa los campos.
- **Permisos:** los avisos de cámara, fotos y Face ID están en español.
- **Respaldos y Excel:** se comparten con el tipo de archivo correcto para la app Archivos.
