$base = "c:\Users\Hutech\Downloads\ayurcare-ai-main\ayurcare-ai-main"

# Kill existing backend processes on 5001 and 5002
Write-Host "Stopping existing backends..."
$pids5001 = (netstat -ano | Select-String "5001" | Where-Object { $_ -match "LISTENING" } | ForEach-Object { ($_ -split "\s+")[-1] })
$pids5002 = (netstat -ano | Select-String "5002" | Where-Object { $_ -match "LISTENING" } | ForEach-Object { ($_ -split "\s+")[-1] })

foreach ($p in ($pids5001 + $pids5002) | Where-Object { $_ -match '^\d+$' } | Select-Object -Unique) {
    try { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue; Write-Host "Killed PID $p" } catch {}
}

Start-Sleep -Seconds 2

# Start doctor portal Node API (port 5001)
Write-Host "Starting Node API on port 5001..."
Start-Process -FilePath "cmd.exe" `
    -ArgumentList "/c node index.js > `"$base\doctor-portal\server\server-5001.log`" 2>&1" `
    -WorkingDirectory "$base\doctor-portal\server" `
    -WindowStyle Hidden

# Start bot-brain FastAPI (port 5002)
Write-Host "Starting bot-brain on port 5002..."
Start-Process -FilePath "cmd.exe" `
    -ArgumentList "/c uvicorn api_server:app --host 0.0.0.0 --port 5002 > `"$base\ayurveda-app\bot-brain\bot-brain-5002.log`" 2>&1" `
    -WorkingDirectory "$base\ayurveda-app\bot-brain" `
    -WindowStyle Hidden

Start-Sleep -Seconds 10

# Verify
Write-Host "`nPort status:"
netstat -ano | Select-String "5001|5002" | Where-Object { $_ -match "LISTENING" }

# Quick health checks
try {
    $r1 = Invoke-WebRequest "http://localhost:5001/" -UseBasicParsing -TimeoutSec 5
    Write-Host "5001 (Node API): HTTP $($r1.StatusCode) OK"
} catch { Write-Host "5001 (Node API): not responding" }

try {
    $r2 = Invoke-WebRequest "http://localhost:5002/" -UseBasicParsing -TimeoutSec 5
    Write-Host "5002 (bot-brain): HTTP $($r2.StatusCode) OK"
} catch { Write-Host "5002 (bot-brain): not responding" }

Write-Host "`nDone. Check server-5001.log and bot-brain-5002.log for MongoDB connection status."
