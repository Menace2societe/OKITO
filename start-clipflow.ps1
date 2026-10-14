# Starts ClipFlow in production mode and exposes it privately on the tailnet.
#
#   .\start-clipflow.ps1          start backend + frontend + tailscale serve
#   .\start-clipflow.ps1 -Build   rebuild the frontend first (after a code change)
#   .\start-clipflow.ps1 -Stop    stop everything
#
# Both servers listen on 127.0.0.1 only: the app is reachable from this PC
# and, through `tailscale serve`, from your own tailnet devices — never from
# the public internet.

param(
    [switch]$Build,
    [switch]$Stop
)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
$LogDir = Join-Path $Root "logs"
$PidFile = Join-Path $LogDir "clipflow.pids"
$Tailscale = "C:\Program Files\Tailscale\tailscale.exe"

New-Item -ItemType Directory -Force $LogDir | Out-Null

function Stop-ClipFlow {
    if (Test-Path $PidFile) {
        foreach ($procId in Get-Content $PidFile) {
            # /T kills the whole tree (npm -> node, python -> ffmpeg).
            & taskkill.exe /PID $procId /T /F 2>$null | Out-Null
        }
        Remove-Item $PidFile
    }
    Write-Host "ClipFlow arrêté."
}

if ($Stop) {
    Stop-ClipFlow
    & $Tailscale serve --https=443 off 2>$null | Out-Null
    exit 0
}

Stop-ClipFlow  # never run two copies

Set-Location $Root
if ($Build -or -not (Test-Path (Join-Path $Root ".next\BUILD_ID"))) {
    Write-Host "Build du frontend..."
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw "npm run build a échoué" }
}

$backend = Start-Process -PassThru -WindowStyle Hidden `
    -FilePath (Join-Path $Root "venv\Scripts\python.exe") `
    -ArgumentList "-m", "uvicorn", "backend.main:app", "--host", "127.0.0.1", "--port", "8000" `
    -WorkingDirectory $Root `
    -RedirectStandardOutput (Join-Path $LogDir "backend.log") `
    -RedirectStandardError (Join-Path $LogDir "backend.err.log")

$frontend = Start-Process -PassThru -WindowStyle Hidden `
    -FilePath "npm.cmd" `
    -ArgumentList "run", "start", "--", "-H", "127.0.0.1", "-p", "3000" `
    -WorkingDirectory $Root `
    -RedirectStandardOutput (Join-Path $LogDir "frontend.log") `
    -RedirectStandardError (Join-Path $LogDir "frontend.err.log")

Set-Content $PidFile @($backend.Id, $frontend.Id)

# Wait until both answer before announcing the URL.
foreach ($url in "http://127.0.0.1:8000/api/media/usage", "http://127.0.0.1:3000") {
    $ok = $false
    for ($i = 0; $i -lt 60 -and -not $ok; $i++) {
        try { Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 2 | Out-Null; $ok = $true }
        catch { Start-Sleep -Seconds 1 }
    }
    if (-not $ok) { throw "$url ne répond pas — voir le dossier logs\" }
}

# Private HTTPS on the tailnet (persists until `-Stop`).
& $Tailscale serve --bg 3000
$dns = ((& $Tailscale status --json | ConvertFrom-Json).Self.DNSName).TrimEnd(".")

Write-Host ""
Write-Host "ClipFlow est lancé."
Write-Host "  Sur ce PC          : http://localhost:3000"
Write-Host "  Tes appareils      : https://$dns"
Write-Host "  Logs               : $LogDir"
Write-Host "  Arrêter            : .\start-clipflow.ps1 -Stop"
