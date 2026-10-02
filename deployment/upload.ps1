param(
    [string]$Server = 'laoz@192.168.1.210',
    [ValidateRange(1, 65535)][int]$SshPort = 22,
    [ValidateRange(1024, 65535)][int]$AppPort = 5000
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$archive = Join-Path $PSScriptRoot 'flexbox-chess.tar.gz'
$deployScript = Join-Path $PSScriptRoot 'deploy.sh'
if ($Server -notmatch '^[a-zA-Z0-9_.-]+@[a-zA-Z0-9.-]+$') {
    throw 'Server debe tener el formato usuario@servidor.'
}
foreach ($tool in @('ssh', 'scp', 'tar')) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "Falta $tool." }
}

# Regenerate from the current working files; do not upload local credentials or databases.
Push-Location $projectRoot
try {
    & tar -czf $archive package.json package-lock.json server.js api app assets scripts docs README.md data/initial.json
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo generar el paquete.' }
} finally { Pop-Location }

$remoteStage = '/tmp/flexbox-chess-' + [guid]::NewGuid().ToString('N')
Write-Host 'Creando carpeta temporal en el servidor. SSH puede pedir tu contraseña.'
& ssh -p $SshPort $Server "umask 077; mkdir '$remoteStage'"
if ($LASTEXITCODE -ne 0) { throw 'Falló la conexión SSH.' }
Write-Host 'Cargando proyecto y script...'
& scp -P $SshPort $archive $deployScript "${Server}:$remoteStage/"
if ($LASTEXITCODE -ne 0) { throw "Falló la copia. Carpeta remota: $remoteStage" }
Write-Host 'Instalando y arrancando el servicio. sudo puede pedir tu contraseña en el servidor.'
& ssh -t -p $SshPort $Server "PORT=$AppPort bash '$remoteStage/deploy.sh' '$remoteStage/flexbox-chess.tar.gz'"
if ($LASTEXITCODE -ne 0) { throw "Falló el despliegue. Los archivos están en $remoteStage para revisar o reintentar." }
Write-Host "Listo: http://192.168.1.210:$AppPort"
