# start.ps1 — Start all services (Ollama + Flask + Next.js) on Windows
# Run with: powershell -ExecutionPolicy Bypass -File scripts\start.ps1

$ErrorActionPreference = "Stop"

function Info    { Write-Host "[start] $args" -ForegroundColor White }
function Success { Write-Host "[OK]    $args" -ForegroundColor Green }
function Fail    { Write-Host "[ERR]   $args" -ForegroundColor Red; exit 1 }

# Change to repo root so relative paths work
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

# ── Guard: check setup has been run ──────────────────────────────────────────
if (-not (Test-Path ".venv")) {
    Fail ".venv not found. Run 'powershell -ExecutionPolicy Bypass -File scripts\setup.ps1' first."
}
if (-not (Test-Path "frontend\node_modules")) {
    Fail "frontend\node_modules not found. Run setup.ps1 first."
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   RAG Chatbot - Starting Services      " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ── 1. Ollama ─────────────────────────────────────────────────────────────────
$ollamaRunning = Get-Process -Name "ollama" -ErrorAction SilentlyContinue
if ($ollamaRunning) {
    Success "Ollama already running"
} else {
    Info "Starting Ollama (new window)..."
    Start-Process ollama -ArgumentList "serve" -WindowStyle Minimized
    Start-Sleep -Seconds 2
    Success "Ollama started"
}

# ── 2. Flask API ──────────────────────────────────────────────────────────────
Info "Starting Flask API (new window)..."
$flaskCmd = "& '$repoRoot\.venv\Scripts\python.exe' '$repoRoot\app.py'"
$flask = Start-Process powershell -ArgumentList "-NoExit", "-Command", $flaskCmd `
    -PassThru -WorkingDirectory $repoRoot
Start-Sleep -Seconds 4
if ($flask.HasExited) {
    Fail "Flask failed to start. Check the Flask window for errors."
}
Success "Flask API running — http://localhost:5001"

# ── 3. Next.js frontend ───────────────────────────────────────────────────────
Info "Starting Next.js frontend (new window)..."
$nextCmd = "Set-Location '$repoRoot\frontend'; npm run dev"
$nextjs = Start-Process powershell -ArgumentList "-NoExit", "-Command", $nextCmd `
    -PassThru -WorkingDirectory "$repoRoot\frontend"
Start-Sleep -Seconds 3
Success "Next.js frontend running — http://localhost:3000"

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "   All services running!                " -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Frontend  :  http://localhost:3000" -ForegroundColor Cyan
Write-Host "  Flask API :  http://localhost:5001" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Each service runs in its own PowerShell window." -ForegroundColor Yellow
Write-Host "  Close those windows to stop the services."       -ForegroundColor Yellow
Write-Host ""
