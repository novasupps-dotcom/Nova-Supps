# Nova Negocio 2.2.3 · Android con Expo y Firebase

La 2.2 añade lector con cámara, avisos, almacén seguro y actualizaciones. Necesita una compilación nativa nueva. El APK 2.1 es el instalable anterior y no contiene esos módulos.

## 1. Crear y conectar Expo

Crea tu cuenta en [Expo](https://expo.dev/signup). Abre PowerShell en `C:\Users\EmmanuelMartinez\Downloads\Nova_Negocio_Proyecto_0.8` y ejecuta:

```powershell
npm ci
npm i -g eas-cli
eas login
eas init
eas update:configure
```

Introduce tú mismo las credenciales y códigos que solicite Expo. Conserva `extra.eas.projectId` y `owner` en `app.json`.

Después de configurar actualizaciones, comprueba que la app conserve versión **2.2.3**, `android.versionCode` **41**, `android.googleServicesFile` **./google-services.json**, `runtimeVersion: { policy: "appVersion" }`, `updates.checkAutomatically: "NEVER"` y `updates.fallbackToCacheTimeout: 0`. La URL de actualizaciones debe ser `https://u.expo.dev/` seguida del identificador real de tu proyecto.

`eas.json` ya usa `appVersionSource: local`, perfil APK `preview`, canal `preview` y credenciales de firma de Expo.

## 2. Crear Firebase para los avisos

1. Entra en [Firebase Console](https://console.firebase.google.com/) y crea un proyecto.
2. Agrega una app Android con el paquete exacto **com.novasupps.negocio**.
3. Descarga **google-services.json** y colócalo en la raíz del proyecto, junto a `app.json`.
4. Sigue la [guía oficial de FCM V1](https://docs.expo.dev/push-notifications/fcm-credentials/) para obtener la cuenta de servicio de Firebase y habilitar el servicio cuando corresponda.
5. Ejecuta `eas credentials`, elige Android y configura la clave de **Firebase Cloud Messaging V1**. Selecciona y sube esa clave tú mismo desde tu equipo.

Guarda la cuenta de servicio fuera del proyecto; es privada y no debe enviarse por chat ni incluirse en archivos de fuente. `google-services.json` es la configuración Android que necesita el compilador. No lo reemplaces por el archivo de cuenta de servicio.

Los avisos pasan por Expo y Firebase e incluyen nombre del vendedor, monto, tipo de evento e identificadores de venta o cierre. No incluyen el Access Token de Mercado Pago ni la sesión del negocio.

## 3. Actualizar la base en línea

`supabase/schema.sql` incluye la instalación completa y las actualizaciones 2.1, 2.2 y 2.2.3. Abre tu proyecto en Supabase → SQL Editor y carga el archivo completo. **Tú das Run**. Es repetible y conserva los registros existentes. Los avisos necesitan `pg_net`; si no está disponible, el SQL lo indica y las ventas siguen funcionando.

La función `cobro-terminal` conserva el flujo anterior; estas correcciones no requieren publicarla de nuevo.

## 4. Comprobar la configuración

```powershell
npm run android:config
npm run check
```

La comprobación local revisa Expo, URL de actualizaciones, Firebase, paquete, versión y canal. Revisa también que la clave FCM V1 esté cargada en `eas credentials`.


## 5. Compilar en EAS

```powershell
eas build -p android --profile preview
```

Permite que Expo genere o use **su propia llave de compilación**. La llave original de Nova está en `signing/` y debe permanecer en tu PC. No la importes a EAS. `.easignore` excluye firma, credenciales, APK, fuentes archivadas y cuentas de servicio.

Descarga el APK con otro nombre, por ejemplo **Nova_2.2.3_EAS.apk**. Aún tiene la firma de Expo y debe refirmarse antes de instalarlo encima de la app actual.

## 6. Refirmar con la llave original

Instala Android SDK Build Tools recientes (`zipalign`, `aapt`, `apksigner`) y un JDK. Define `ANDROID_HOME` y `JAVA_HOME` o indica las rutas con las opciones del script.

```powershell
python scripts/resign_apk.py 'C:\ruta\Nova_2.2.3_EAS.apk'
```

El script lee localmente `signing/credentials.json` y `signing/nova-release.jks`. Verifica el APK 2.1 de referencia, paquete, versión, código 41, alineación a 16 KB y firmas v1, v2 y v3. El certificado final debe ser:

`3b71f02d1463b877e7f20dd3141e150e10e5c60e40c2198ba98dadd10207ae94`

Guarda el resultado como **deliverables/Nova_Negocio_2.2.3_Android.apk** e informa su SHA-256. Si el nombre ya existe, se detiene: elige otro con `--out`. Nunca sobrescribe un APK anterior ni imprime contraseñas.

## 7. Instalar y probar en teléfonos

1. Instala el APK refirmado **encima de la 2.1** para conservar los datos.
2. En dueño y vendedores, toca **Sincronizar ahora / Actualizar ahora**.
3. Activa **Avisos en este teléfono** en Parámetros del dueño y Cuenta del vendedor. Da el permiso de Android.
4. Comprueba los avisos con una venta del vendedor, un cierre de caja y una venta rechazada.
5. Lee un código con 📷. En Stock, la cámara se cierra y abre la vista previa. En Vender, un código reconocido agrega una pieza al carrito automáticamente y muestra el producto. Si el código del fabricante no está vinculado, se consulta en línea; la asociación automática exige una coincidencia clara.
6. En Producto → Más detalles, prueba guardar el código y **Tomar foto**; comprueba la imagen guardada.
7. Prueba un cobro real en la terminal en modo normal y **Ya cobré**. Esta comprobación necesita teléfono, terminal y cuenta real.

## 8. Cambios posteriores de JavaScript

Cuando la 2.2 nativa esté instalada, publica cambios compatibles en el mismo canal:

```powershell
eas update --channel preview --message 'Corrección de Nova Negocio'
```

Conserva el runtime compatible. Con política `appVersion`, cambiar `expo.version` crea otro runtime. Si cambias módulos nativos, vuelve a compilar y refirmar el APK.

La app consulta al abrir y volver a primer plano, como máximo cada 6 horas. Descarga el cambio y muestra **Actualización lista · Reiniciar**. El botón espera a terminar los cobros y cerrar formularios; en el vendedor también espera a terminar el carrito.

`package_android_js.py` corresponde al runtime legado 0.6. Para la primera 2.2 usa EAS Build y `resign_apk.py`; para cambios compatibles posteriores, usa EAS Update.

## Pendientes que necesitan tu cuenta o teléfono

La entrega 2.2 ya tiene Expo/Firebase configurados, FCM V1 cargado, SQL 2.2 ejecutado según confirmó el usuario y APK generado y firmado localmente. Pendiente: instalar y probar en teléfonos. Ver INSTALAR_ANDROID_2.2.md. La tarjeta de recompensas necesita definir sus reglas contigo; TestFlight sigue pendiente de Apple Developer.

Referencias: [Expo Notifications](https://docs.expo.dev/versions/v55.0.0/sdk/notifications/), [runtime de EAS Update](https://docs.expo.dev/eas-update/runtime-versions/), [apksigner](https://developer.android.com/tools/apksigner).

Guía de avisos y alta por código de esta actualización: [AVISOS_Y_LECTOR_2.2.3.md](AVISOS_Y_LECTOR_2.2.3.md).

Lector automático de esta entrega: [LECTOR_AUTOMATICO_2.2.3.md](LECTOR_AUTOMATICO_2.2.3.md). Para vendedores sobre una base 2.2 existente, ejecutar solamente `supabase/migrations/2.2.2_lector.sql` y sincronizar. El usuario pulsa Run.

Guía actual de código, foto, carrito y avisos del dueño: [LECTOR_Y_AVISOS_2.2.3.md](LECTOR_Y_AVISOS_2.2.3.md). Los avisos de ventas del dueño se solicitan localmente al completar la operación.
