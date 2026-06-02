# Start AyurCare full stack (frontends + APIs)
$ErrorActionPreference = "Continue"
$root = Split-Path $PSScriptRoot -Parent
if (-not (Test-Path (Join-Path $root "portal-hub"))) {
  $root = Join-Path $root "ayurcare-ai-main"
}

function Free-Port($port) {
  $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($conn) {
    $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
    Write-Host "Port $port in use by $($proc.ProcessName) (PID $($conn.OwningProcess)) — stopping..."
    Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
  }
}

Write-Host "`n=== AyurCare / DocConnect — starting services ===`n" -ForegroundColor Cyan
Write-Host "Root: $root`n"

Free-Port 5002
Free-Port 5001
# Do not kill 5173/5174 if already running dev servers unless user wants fresh start

$jobs = @(
  @{ Name = "bot-brain (5002)"; Dir = Join-Path $root "ayurveda-app\bot-brain"; Cmd = "python api_server.py" },
  @{ Name = "doctor API (5001)"; Dir = Join-Path $root "doctor-portal\server"; Cmd = "npm run dev" },
  @{ Name = "portal hub (8080)"; Dir = Join-Path $root "portal-hub"; Cmd = "npm run dev" },
  @{ Name = "AyurCare patient (5173)"; Dir = Join-Path $root "ayurveda-app\frontend_chat"; Cmd = "npm run dev" },
  @{ Name = "DocConnect doctor (5174)"; Dir = Join-Path $root "doctor-portal"; Cmd = "npm run dev" }
)

foreach ($j in $jobs) {
  if (-not (Test-Path $j.Dir)) {
    Write-Host "SKIP $($j.Name) — path not found: $($j.Dir)" -ForegroundColor Yellow
    continue
  }
  Write-Host "Starting $($j.Name)..."
  Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "Set-Location '$($j.Dir)'; Write-Host '>>> $($j.Name)' -ForegroundColor Green; $($j.Cmd)"
  ) -WindowStyle Normal
  Start-Sleep -Milliseconds 800
}

Write-Host "`nReady when all windows show 'ready':" -ForegroundColor Green
Write-Host "  Landing  → http://localhost:8080"
Write-Host "  Patient  → http://localhost:5173"
Write-Host "  Doctor   → http://localhost:5174"
Write-Host "  APIs     → http://localhost:5002 (AI) · http://localhost:5001 (data)`n"
