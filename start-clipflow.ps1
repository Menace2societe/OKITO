# Starts ClipFlow in production mode and exposes it privately on the tailnet.
#
#   .\start-clipflow.ps1          start backend + frontend + tailscale serve
#   .\start-clipflow.ps1 -Build   rebuild the frontend first (after a code change)
#   .\start-clipflow.ps1 -Stop    stop everything
#
# Both servers listen on 127.0.0.1 only: the app is reachable from this PC
# and, through `tailscale serve`, from your own tailnet devices.
#
# Online mode: when .env.local defines CLIPFLOW_ACCESS_CODE, the backend
# (and only the backend) is also published on the internet with
# `tailscale funnel` on port 8443, so the online ClipFlow site can send
# YouTube links to this PC. Every request must then carry the code; the local
# frontend adds it itself (middleware.ts, lib/backend-proxy.ts).

param(
    [switch]$Build,
    [switch]$Stop
)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
$LogDir = Join-Path $Root "logs"
$PidFile = Join-Path $LogDir "clipflow.pids"
$Tailscale = "C:\Program Files\Tailscale\tailscale.exe"
$FunnelPort = 8443

New-Item -ItemType Directory -Force $LogDir | Out-Null

# Next.js reads .env.local by itself; the backend gets the CLIPFLOW_* values
# through the environment it inherits from this script.
$EnvFile = Join-Path $Root ".env.local"
if (Test-Path $EnvFile) {
    foreach ($line in Get-Content $EnvFile) {
        if ($line -match '^\s*(CLIPFLOW_[A-Z_]+)\s*=\s*(.*?)\s*$') {
            Set-Item "env:$($Matches[1])" $Matches[2].Trim('"')
        }
    }
}
$Online = [bool]$env:CLIPFLOW_ACCESS_CODE

# Runs a command whose failure is expected and harmless (killing a process
# that already exited, turning off a serve/funnel that isn't on). In Windows
# PowerShell, a native command writing to stderr is a terminating error under
# $ErrorActionPreference = "Stop", even with 2>$null.
function Invoke-Quietly([scriptblock]$Command) {
    $previous = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try { & $Command 2>$null | Out-Null } catch { }
    finally { $ErrorActionPreference = $previous }
}

# Turns off what tailscale serves on $Port, if anything. Only when it is on:
# `tailscale funnel ... off` blocks forever, waiting for the user to enable
# Funnel, on a tailnet where Funnel was never enabled.
function Disable-TailscalePort([int]$Port) {
    $config = & $Tailscale serve status --json | ConvertFrom-Json
    if ($config.TCP -and ($config.TCP.PSObject.Properties.Name -contains "$Port")) {
        Invoke-Quietly { & $Tailscale serve "--https=$Port" off }
    }
}

function Stop-ClipFlow {
    if (Test-Path $PidFile) {
        foreach ($procId in Get-Content $PidFile) {
            # /T kills the whole tree (npm -> node, python -> ffmpeg). The PID
            # may be gone already (crash, reboot).
            Invoke-Quietly { taskkill.exe /PID $procId /T /F }
        }
        Remove-Item $PidFile
    }
    Write-Host "ClipFlow arrêté."
}

if ($Stop) {
    Stop-ClipFlow
    Disable-TailscalePort 443
    Disable-TailscalePort $FunnelPort
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
foreach ($url in "http://127.0.0.1:8000/api/health", "http://127.0.0.1:3000") {
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

# Public backend for the online site, only behind an access code.
if ($Online) {
    Write-Host "Publication du backend avec Tailscale Funnel..."
    Write-Host "(si un lien login.tailscale.com s'affiche, ouvre-le et autorise Funnel : le script reprend tout seul)"
    & $Tailscale funnel --bg "--https=$FunnelPort" http://127.0.0.1:8000
    if ($LASTEXITCODE -ne 0) { throw "tailscale funnel a échoué — Funnel est-il activé pour ce PC ?" }
} else {
    Disable-TailscalePort $FunnelPort
}

Write-Host ""
Write-Host "ClipFlow est lancé."
Write-Host "  Sur ce PC          : http://localhost:3000"
Write-Host "  Tes appareils      : https://$dns"
if ($Online) {
    Write-Host "  Backend public     : https://${dns}:$FunnelPort (code d'accès exigé)"
}
Write-Host "  Logs               : $LogDir"
Write-Host "  Arrêter            : .\start-clipflow.ps1 -Stop"
