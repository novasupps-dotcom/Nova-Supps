# Firma administrada por Expo (2.6.0)

Desde la 2.6.0 la llave de firma del APK de Android la guarda **Expo (EAS)**, no tu PC. Expo compila y firma el APK en la nube; ya no hace falta `scripts/resign_apk.py`, Android SDK ni JDK en tu computadora.

> **Importante:** sube a Expo **la misma llave que ya usas** (`signing/nova-release.jks`). Así el APK nuevo se instala **encima** de la app actual y no se pierde nada. Si Expo generara una llave nueva, Android no dejaría instalarlo encima: habría que desinstalar la app en cada teléfono.

Huella SHA-256 de la llave original (debe coincidir):

```
3B:71:F0:2D:14:63:B8:77:E7:F2:0D:D3:14:1E:15:0E:10:E5:C6:0E:40:C2:19:8B:A9:8D:AD:D1:02:07:AE:94
```

## Configuración (una sola vez, unos 10 minutos, en tu PC)

Lo haces tú porque usa tus contraseñas. Claude nunca las ve.

### 1. Subir la llave a Expo

1. Abre PowerShell en la carpeta del proyecto (donde está `signing\`).
2. Inicia sesión con tu cuenta **emmgamart**:

   ```powershell
   npx eas-cli@latest login
   ```

3. Abre el administrador de credenciales:

   ```powershell
   npx eas-cli@latest credentials -p android
   ```

4. Elige el perfil **preview** → **Keystore: Manage everything needed to build your project** → **Set up a new keystore**.
5. Cuando pregunte **Generate a new Android Keystore?** contesta **No** (n). Así eliges subir la tuya.
6. Escribe lo que pide. Los datos están en `signing\credentials.json` (ábrelo con el Bloc de notas):
   - Ruta del keystore: `signing\nova-release.jks`
   - Keystore password: el valor de `password`
   - Key alias: el valor de `alias`
   - Key password: el valor de `keyPassword` (si no existe, el mismo de `password`)
7. Al terminar, Expo muestra la llave. Revisa que **SHA256 Fingerprint** sea la de arriba (empieza con `3B:71:F0:2D` y termina con `AE:94`).
8. Repite los pasos 3–7 con el perfil **production** y elige **usar la misma llave** que ya subiste (Expo la ofrece en la lista).

Si la huella no coincide, **no compiles**: borra esa llave en el mismo menú (**Delete your keystore**) y vuelve a subir `signing\nova-release.jks`.

### 2. Subir `google-services.json` (avisos) a Expo

Este archivo es privado y no está en GitHub. Expo lo necesita para compilar:

1. Entra a <https://expo.dev> → proyecto **nova-negocio** → **Environment variables** → **Add variable**.
2. Name: `GOOGLE_SERVICES_JSON` · Type: **File** · sube tu `google-services.json` · Visibility: **Secret** · Environments: **preview** y **production** → **Save**.

`app.config.js` usa esa variable al compilar en la nube; en tu PC sigue tomando `./google-services.json`.

### 3. Guarda la carpeta `signing\` aparte

Aunque Expo ya tenga la llave, conserva una copia de `signing\` en un lugar seguro (USB o tu nube personal). Si un día cambias de cuenta de Expo, la vas a necesitar.

## Compilar un APK nuevo

Solo hace falta cuando cambia algo nativo (permisos, módulos, ícono). Los cambios normales llegan solos a los teléfonos (ver `ACTUALIZACIONES_AUTOMATICAS.md`).

- **Desde GitHub:** Actions → **Compilar APK** → **Run workflow** → perfil `preview`. Corre todas las pruebas y manda la compilación a Expo; el resumen trae el enlace para descargar el APK (10–20 min).
- **Desde tu PC:** `npx eas-cli@latest build -p android --profile preview`

El APK ya viene firmado con tu llave: se instala encima de la versión anterior sin desinstalar. Puedes comprobarlo en expo.dev → **Builds** → la compilación → **Fingerprint SHA-256**.

Si Expo no tiene la llave, la compilación desde GitHub se detiene con un error (en modo automático Expo nunca crea una llave nueva). Así nunca llega por error un APK con otra firma.

## Si de verdad quieres una llave nueva

Solo si perdiste la carpeta `signing\`. Cada teléfono tendrá que desinstalar la app:

1. En cada teléfono: Ajustes → **Respaldo y Excel** → **Guardar / compartir respaldo** (y en el del dueño, también el respaldo en la nube).
2. `npx eas-cli@latest credentials -p android` → preview → **Set up a new keystore** → **Generate a new Android Keystore? Sí**.
3. Compila, desinstala la app vieja, instala el APK nuevo y restaura el respaldo. Los vendedores solo vuelven a iniciar sesión.
