# DocConnect MUST run on port 5174 (AyurCare patient uses 5173 only).
$port = 5174
$conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($conn) {
  $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
  $root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
  $doctorRoot = Join-Path $root "ayurcare-ai-main\doctor-portal"
  if (-not $doctorRoot) { $doctorRoot = Join-Path (Split-Path $PSScriptRoot -Parent) "doctor-portal" }
  $cwd = (Get-Location).Path
  if ($proc -and $proc.Path -and $proc.Path -notlike "*doctor-portal*") {
    Write-Host "Port $port is used by another app (PID $($proc.Id)). Stopping it so DocConnect can start..."
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
  }
}

$here = Join-Path $PSScriptRoot "..\doctor-portal"
if (-not (Test-Path $here)) { $here = Join-Path $PSScriptRoot "..\ayurcare-ai-main\doctor-portal" }
Set-Location $here
Write-Host "Starting DocConnect at http://localhost:5174 ..."
npm run dev
