# Nova Negocio · Configura la subida automática a GitHub (se corre una sola vez).
# 1) Revisa que esté Git para Windows.  2) Inicia sesión en GitHub (una vez, en el navegador).
# 3) Crea la tarea "Nova Negocio - Subir a GitHub" que revisa cada 10 minutos si hay versión nueva.
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Write-Host ''
Write-Host 'Nova Negocio · Subida automática a GitHub' -ForegroundColor Cyan
Write-Host "Carpeta: $repo"
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Host ''
  Write-Host 'Falta Git para Windows. Se abrirá la página de descarga: instálalo con las opciones que trae y vuelve a dar doble clic en este archivo.' -ForegroundColor Yellow
  Start-Process 'https://git-scm.com/download/win'
  exit 1
}
Set-Location $repo
$origin = (git remote get-url origin 2>$null)
if (-not $origin) { Write-Host 'Esta carpeta todavía no está publicada en GitHub (falta "Publish repository" en GitHub Desktop).' -ForegroundColor Red; exit 1 }
Write-Host "Repositorio: $origin"
$email = (git config user.email 2>$null)
if (-not $email) { Write-Host 'Falta tu correo de Git: en GitHub Desktop ve a File → Options → Git y guárdalo.' -ForegroundColor Red; exit 1 }
Write-Host ''
Write-Host 'Conectando con GitHub. Si se abre el navegador, inicia sesión con tu cuenta y autoriza (solo esta vez)...'
$ErrorActionPreference = 'Continue'
git fetch origin 2>&1 | Out-Host
if ($LASTEXITCODE -ne 0) { Write-Host 'No se pudo conectar con GitHub. Revisa tu internet y vuelve a intentarlo.' -ForegroundColor Red; exit 1 }
$ErrorActionPreference = 'Stop'
$vbs = Join-Path $PSScriptRoot 'subir_a_github.vbs'
$action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument ('"{0}"' -f $vbs)
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 10) -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName 'Nova Negocio - Subir a GitHub' -Action $action -Trigger $trigger -Settings $settings -Description 'Sube a GitHub cada versión nueva de Nova Negocio que Claude deja lista (deliverables\LISTO_PARA_SUBIR.txt).' -Force | Out-Null
Start-ScheduledTask -TaskName 'Nova Negocio - Subir a GitHub'
Write-Host ''
Write-Host 'Listo. Desde ahora cada versión nueva se sube sola a GitHub (revisa cada 10 minutos con la computadora encendida).' -ForegroundColor Green
Write-Host 'GitHub corre las pruebas y, si pasan, la manda a los teléfonos. Registro: deliverables\subida_github.log'
