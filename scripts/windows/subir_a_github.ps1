# Nova Negocio · Sube a GitHub la versión que Claude dejó lista en esta carpeta.
# Lo ejecuta solo, cada 10 minutos, la tarea "Nova Negocio - Subir a GitHub" (ver instalar_subida_automatica.ps1).
# Solo sube cuando existe deliverables\LISTO_PARA_SUBIR.txt (Claude lo crea al terminar de entregar y verificar).
# Nunca sube archivos privados: si aparece alguno, no sube nada y lo anota en deliverables\subida_github.log.
$ErrorActionPreference = 'Continue'
$env:GCM_INTERACTIVE = 'never'      # sin ventanas: si hay que volver a iniciar sesión, se anota en el registro
$env:GIT_TERMINAL_PROMPT = '0'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$marker = Join-Path $repo 'deliverables\LISTO_PARA_SUBIR.txt'
$log = Join-Path $repo 'deliverables\subida_github.log'
function Write-Log([string]$text) {
  Add-Content -Path $log -Value ('{0:yyyy-MM-dd HH:mm}  {1}' -f (Get-Date), $text) -Encoding UTF8
}
if (-not (Test-Path $marker)) { exit 0 }
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Write-Log 'No se encontró Git para Windows. Instálalo y vuelve a correr instalar_subida_automatica.cmd.'; exit 1 }
Set-Location $repo
if (Test-Path (Join-Path $repo '.git\index.lock')) { Write-Log 'GitHub Desktop está trabajando en el repositorio; se reintenta en 10 minutos.'; exit 0 }
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
if ($branch -ne 'master') { Write-Log "La rama actual es '$branch'; solo se sube desde master."; exit 1 }

git add -A 2>&1 | Out-Null
$staged = @(git diff --cached --name-only)
$private = '(^|/)(signing|deliverables|Claude outputs|node_modules|build|_respaldo[^/]*)/|adminsdk|service-account|google-services\.json|credentials\.json|(^|/)\.env|\.(apk|aab|jks|keystore|p12|p8|mobileprovision)$'
$bad = @($staged | Where-Object { $_ -match $private })
if ($bad.Count -gt 0) {
  git reset -q 2>&1 | Out-Null
  Write-Log ('NO se subió nada: hay archivos privados en la lista: ' + ($bad -join ', '))
  exit 1
}
$version = (Get-Content (Join-Path $repo 'app.json') -Raw -Encoding UTF8 | ConvertFrom-Json).expo.version
if ($staged.Count -gt 0) {
  git commit -q -m "Nova Negocio $version" 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { Write-Log 'No se pudo hacer el commit (revisa tu nombre y correo en GitHub Desktop → Options → Git).'; exit 1 }
}
$out = git push -q origin master 2>&1
if ($LASTEXITCODE -ne 0) {
  # Alguien subió algo antes (por ejemplo desde GitHub Desktop): se trae y se vuelve a intentar.
  git pull -q --rebase origin master 2>&1 | Out-Null
  $out = git push -q origin master 2>&1
}
if ($LASTEXITCODE -ne 0) {
  Write-Log ("No se pudo subir a GitHub: $out  →  Si dice que falta iniciar sesión, da doble clic en scripts\windows\instalar_subida_automatica.cmd.")
  exit 1
}
Remove-Item $marker -Force
$files = if ($staged.Count -eq 1) { '1 archivo' } else { "$($staged.Count) archivos" }
Write-Log "Subida Nova Negocio $version ($files). GitHub corre las pruebas y la manda a los teléfonos."
