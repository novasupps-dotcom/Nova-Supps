# Actualizaciones automáticas (2.5.3)

Desde la 2.5.3, cada versión nueva llega sola a tu teléfono y a los de tus vendedores. Ya no hay que instalar APK.

```
Claude deja la versión en tu carpeta
  → tu PC la sube sola a GitHub (cada 10 min, tarea «Nova Negocio - Subir a GitHub»)
    → GitHub corre todas las pruebas
      → si pasan, la publica por internet (EAS Update, canal «preview»)
        → cada teléfono la descarga solo y la instala al volver a abrir la app
          (o al regresar a ella después de 15 min). Nunca a media venta o cobro.
```

Si una prueba falla, no se publica nada: los teléfonos siguen con la versión anterior.

## Configuración (una sola vez, unos 10 minutos)

Estos pasos los haces tú porque usan tus cuentas. Claude nunca ve ni escribe tus tokens.

### 1. Token de Expo → GitHub

1. Entra a <https://expo.dev> con tu cuenta **emmgamart**.
2. Ve a **Account settings → Access tokens → Create token**. Ponle de nombre `GitHub Nova Negocio` y copia el token.
3. En GitHub, abre **novasupps-dotcom/Nova-Supps** y ve a **Settings → Secrets and variables → Actions → New repository secret**.
4. En **Name** escribe `EXPO_TOKEN`, en **Secret** pega el token y da **Add secret**.

El token queda guardado en GitHub y no se puede volver a ver. Si un día lo borras en Expo, crea otro y reemplázalo aquí.

### 2. Subida automática desde tu PC

1. Instala **Git para Windows** desde <https://git-scm.com/download/win>. Deja todas las opciones como vienen.
2. En tu carpeta del proyecto, da doble clic en `scripts\windows\instalar_subida_automatica.cmd`.
3. Si se abre el navegador, inicia sesión en GitHub y autoriza. Solo pasa esta vez.
4. Al final debe decir **Listo** en verde.

Con eso, la PC revisa cada 10 minutos (si está encendida y con tu sesión abierta) si hay versión nueva y la sube sola.

## Cómo saber que funcionó

- **En tu PC:** `deliverables\subida_github.log` anota cada subida o el motivo si no pudo.
- **En GitHub:** pestaña **Actions → Actualizar teléfonos**. Palomita verde: se publicó. Tache rojo: falló una prueba o falta el token, y no se mandó nada.
- **En el teléfono:** Ajustes muestra la versión, por ejemplo «Nova Negocio 2.5.3». La primera vez puede tardar hasta un día en llegar, porque la app que hoy tienes instalada revisa cada 6 horas. Desde la 2.5.3 revisa cada 30 minutos.

## Si algo sale mal

- **Regresar a la versión anterior:** en GitHub Desktop, en **History**, da clic derecho en el último commit y elige **Revert changes in commit**, luego **Push origin**. GitHub vuelve a publicar la versión anterior y los teléfonos la reciben solos.
- **Volver a publicar sin cambios:** GitHub → **Actions → Actualizar teléfonos → Run workflow**.
- **Teléfonos nuevos:** instala el último APK de `deliverables`. Al abrir la app se pone al día sola.

## Qué sigue necesitando un APK

Los cambios nativos: permisos nuevos, módulos nativos (cámara, avisos), ícono o pantalla de inicio. Son raros. Cuando haga falta, Claude te avisa y te entrega el APK como antes.

## Detalles técnicos

- **Workflow:** `.github/workflows/actualizar-telefonos.yml`. Corre en cada push a `master` que cambie la app: `npm ci`, `check_android_config.cjs --ota`, `tsc` y `npm run test:all`. Después ejecuta `eas update --channel preview --environment preview --platform android`.
- **Teléfonos:** el APK instalado (runtime `2.2.4`) usa el canal `preview` de `u.expo.dev/832d4228-…`. La app (`src/updates.ts`, `src/screens/UpdateNotice.tsx`) revisa cada 30 minutos, descarga en segundo plano y aplica la versión al volver a la app tras 15 minutos o al abrirla de nuevo, siempre que no haya venta, cobro o formulario abierto.
- **Subida desde la PC:** `scripts/windows/subir_a_github.ps1` solo sube cuando existe `deliverables/LISTO_PARA_SUBIR.txt`, que Claude crea al terminar de entregar y verificar. Si aparece un archivo privado en la lista, no sube nada.
- **Límites gratuitos** (oct-2026): Expo da 1,000 usuarios activos al mes y 100 GiB de descarga. GitHub da 2,000 minutos de Actions al mes en repositorios privados. Cada publicación tarda unos 10 minutos.
