# setup.ps1 — One-time setup for Windows
# Run with: powershell -ExecutionPolicy Bypass -File scripts\setup.ps1

$ErrorActionPreference = "Stop"

function Info    { Write-Host "[setup] $args" -ForegroundColor White }
function Success { Write-Host "[OK]    $args" -ForegroundColor Green }
function Warn    { Write-Host "[!]     $args" -ForegroundColor Yellow }
function Fail    { Write-Host "[ERR]   $args" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   RAG Chatbot - Setup (Windows)        " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ── 1. Check Python 3.10+ ─────────────────────────────────────────────────────
Info "Checking Python..."
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Fail "Python not found. Install from https://python.org (check 'Add to PATH') and re-run."
}
$pyVer = python -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"
$pyMajor, $pyMinor = $pyVer -split "\." | Select-Object -First 2
if ([int]$pyMajor -lt 3 -or ([int]$pyMajor -eq 3 -and [int]$pyMinor -lt 10)) {
    Fail "Python 3.10+ required (found $pyVer). Upgrade at https://python.org"
}
Success "Python $pyVer"

# ── 2. Check Node.js 18+ ──────────────────────────────────────────────────────
Info "Checking Node.js..."
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Fail "Node.js not found. Install from https://nodejs.org and re-run."
}
$nodeVer = (node -v).TrimStart('v').Split('.')[0]
if ([int]$nodeVer -lt 18) {
    Fail "Node.js 18+ required. Upgrade at https://nodejs.org"
}
Success "Node.js $(node -v)"

# ── 3. Check Ollama ───────────────────────────────────────────────────────────
Info "Checking Ollama..."
if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
    Warn "Ollama not found."
    Write-Host ""
    Write-Host "  Please download and install Ollama for Windows:" -ForegroundColor Yellow
    Write-Host "  https://ollama.com/download/windows" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  After installing, re-run this script." -ForegroundColor Yellow
    Start-Process "https://ollama.com/download/windows"
    exit 1
}
Success "Ollama found"

# ── 4. Python virtual environment ─────────────────────────────────────────────
Info "Setting up Python virtual environment..."
if (-not (Test-Path ".venv")) {
    python -m venv .venv
    Success "Created .venv"
} else {
    Success ".venv already exists"
}

# ── 5. Python dependencies ────────────────────────────────────────────────────
Info "Installing Python dependencies..."
& .\.venv\Scripts\python.exe -m pip install --upgrade pip --quiet
& .\.venv\Scripts\pip.exe install -r requirements.txt --quiet
Success "Python dependencies installed"

# ── 6. Node.js dependencies ───────────────────────────────────────────────────
Info "Installing Node.js dependencies..."
Push-Location frontend
npm install --silent
Pop-Location
Success "Node.js dependencies installed"

# ── 7. Pull Ollama LLM model ──────────────────────────────────────────────────
$model = if ($env:LLM_MODEL) { $env:LLM_MODEL } else { "llama3.2:3b" }
Info "Pulling Ollama model '$model' (this may take a few minutes)..."

# Start ollama serve temporarily if not already running
$ollamaRunning = Get-Process -Name "ollama" -ErrorAction SilentlyContinue
if (-not $ollamaRunning) {
    $ollamaProc = Start-Process ollama -ArgumentList "serve" -PassThru -WindowStyle Hidden
    Start-Sleep -Seconds 3
}
ollama pull $model
if (-not $ollamaRunning -and $ollamaProc) {
    Stop-Process -Id $ollamaProc.Id -Force -ErrorAction SilentlyContinue
}
Success "Model '$model' ready"

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "   Setup complete!                      " -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Run 'powershell -ExecutionPolicy Bypass -File scripts\start.ps1'" -ForegroundColor White
Write-Host "  to launch all services." -ForegroundColor White
Write-Host ""
