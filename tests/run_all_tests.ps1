# AyurCare AI — Master Test Runner (PowerShell)
# ==============================================
# Runs all 5 test groups from the single `tests/` folder.
# Usage:
#   cd tests
#   .\run_all_tests.ps1
#   .\run_all_tests.ps1 -GroupFilter unit   # run only unit tests
#   .\run_all_tests.ps1 -SkipPerf          # skip performance/locust tests

param(
    [string]$GroupFilter = "all",   # all | unit | integration | api | frontend | perf
    [switch]$SkipPerf,              # skip Group 5 (Locust)
    [string]$MongoUri = "mongodb://localhost:27017/ayurcare_test",
    [string]$JwtSecret = "doctor_portal_secret_key_123",
    [string]$BotBrainHost = "http://localhost:5002",
    [string]$DoctorPortalHost = "http://localhost:5001"
)

$ErrorActionPreference = "Continue"
$PASS = "[PASS]"
$FAIL = "[FAIL]"
$SKIP = "[SKIP]"
$results = @{}

function Write-Section($title) {
    Write-Host "`n$('═' * 60)" -ForegroundColor Cyan
    Write-Host "  $title" -ForegroundColor Cyan
    Write-Host "$('═' * 60)" -ForegroundColor Cyan
}

function Run-And-Record($name, $command, $workdir = $PSScriptRoot) {
    Push-Location $workdir
    Write-Host "`n>>> $name" -ForegroundColor Yellow
    Invoke-Expression $command
    $exitCode = $LASTEXITCODE
    Pop-Location
    if ($exitCode -eq 0) {
        $results[$name] = $PASS
        Write-Host "$PASS $name" -ForegroundColor Green
    } else {
        $results[$name] = "$FAIL (exit $exitCode)"
        Write-Host "$FAIL $name (exit code $exitCode)" -ForegroundColor Red
    }
    return $exitCode
}

# ── GROUP 1 & 2: Python Tests ─────────────────────────────────────────────────
if ($GroupFilter -in @("all", "unit")) {
    Write-Section "GROUP 1 — Unit Tests (Python/pytest)"
    $env:PYTHONPATH = (Resolve-Path "../ayurveda-app/bot-brain").Path
    Run-And-Record "G1-Dosha Scoring"     "python -m pytest unit/test_dosha_scoring.py -v --tb=short"     $PSScriptRoot
    Run-And-Record "G1-Ingestion Pipeline" "python -m pytest unit/test_ingestion_pipeline.py -v --tb=short -m 'not slow'" $PSScriptRoot
}

if ($GroupFilter -in @("all", "integration")) {
    Write-Section "GROUP 2 — Integration Tests (Python/pytest)"
    Run-And-Record "G2-Retrieval Agent"  "python -m pytest integration/test_retrieval_agent.py -v --tb=short"   $PSScriptRoot
    Run-And-Record "G2-Gemini Client"    "python -m pytest integration/test_gemini_client.py -v --tb=short -k 'not live'" $PSScriptRoot
    Run-And-Record "G2-E2E Chat Flow"    "python -m pytest integration/test_e2e_chat_flow.py -v --tb=short"     $PSScriptRoot
}

# ── GROUP 3: Node.js API Tests ────────────────────────────────────────────────
if ($GroupFilter -in @("all", "api")) {
    Write-Section "GROUP 3 — API Security & Persistence (Jest/Supertest)"
    $env:MONGODB_TEST_URI = $MongoUri
    $env:JWT_SECRET       = $JwtSecret
    $env:NODE_ENV         = "test"
    Run-And-Record "G3-Security"    "npx jest api/test_doctor_portal_security.test.js --forceExit --verbose" $PSScriptRoot
    Run-And-Record "G3-Persistence" "npx jest api/test_report_persistence.test.js --forceExit --verbose"     $PSScriptRoot
}

# ── GROUP 4: Frontend Tests ───────────────────────────────────────────────────
if ($GroupFilter -in @("all", "frontend")) {
    Write-Section "GROUP 4 — Frontend Component Tests (Jest/RTL)"
    Run-And-Record "G4-ReportRenderer" "npx jest frontend/ReportRenderer.test.jsx --forceExit --verbose" $PSScriptRoot
}

# ── GROUP 5: Performance Tests ────────────────────────────────────────────────
if (-not $SkipPerf -and $GroupFilter -in @("all", "perf")) {
    Write-Section "GROUP 5 — Performance Smoke Tests (Locust)"
    $env:BOT_BRAIN_HOST = $BotBrainHost
    Run-And-Record "G5-Load Test" "python performance/run_load_test.py" $PSScriptRoot
} elseif ($SkipPerf) {
    $results["G5-Performance"] = $SKIP
    Write-Host "$SKIP G5-Performance (use -SkipPerf to skip)" -ForegroundColor DarkGray
}

# ── Summary ───────────────────────────────────────────────────────────────────
Write-Section "TEST SUMMARY"
$passed = 0; $failed = 0; $skipped = 0
foreach ($key in $results.Keys) {
    $val = $results[$key]
    if ($val -eq $PASS) {
        Write-Host "  $PASS  $key" -ForegroundColor Green; $passed++
    } elseif ($val -eq $SKIP) {
        Write-Host "  $SKIP  $key" -ForegroundColor DarkGray; $skipped++
    } else {
        Write-Host "  $val  $key" -ForegroundColor Red; $failed++
    }
}
Write-Host "`n  Passed: $passed  Failed: $failed  Skipped: $skipped" -ForegroundColor White

if ($failed -gt 0) { exit 1 } else { exit 0 }
