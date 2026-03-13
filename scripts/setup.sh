#!/usr/bin/env bash
# setup.sh — One-time setup for macOS and Linux
set -e

BOLD="\033[1m"
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
RED="\033[0;31m"
RESET="\033[0m"

info()    { echo -e "${BOLD}[setup]${RESET} $1"; }
success() { echo -e "${GREEN}[✓]${RESET} $1"; }
warn()    { echo -e "${YELLOW}[!]${RESET} $1"; }
error()   { echo -e "${RED}[✗]${RESET} $1"; exit 1; }

echo ""
echo -e "${BOLD}========================================${RESET}"
echo -e "${BOLD}   RAG Chatbot — Setup (macOS / Linux)  ${RESET}"
echo -e "${BOLD}========================================${RESET}"
echo ""

# ── 1. Check Python 3.10+ ─────────────────────────────────────────────────────
info "Checking Python..."
if ! command -v python3 &>/dev/null; then
  error "Python 3 not found. Install it from https://python.org and re-run."
fi
PY_VERSION=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
PY_MAJOR=$(echo "$PY_VERSION" | cut -d. -f1)
PY_MINOR=$(echo "$PY_VERSION" | cut -d. -f2)
if [ "$PY_MAJOR" -lt 3 ] || { [ "$PY_MAJOR" -eq 3 ] && [ "$PY_MINOR" -lt 10 ]; }; then
  error "Python 3.10+ required (found $PY_VERSION). Upgrade at https://python.org"
fi
success "Python $PY_VERSION"

# ── 2. Check Node.js 18+ ──────────────────────────────────────────────────────
info "Checking Node.js..."
if ! command -v node &>/dev/null; then
  error "Node.js not found. Install it from https://nodejs.org and re-run."
fi
NODE_VERSION=$(node -v | tr -d 'v' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  error "Node.js 18+ required. Upgrade at https://nodejs.org"
fi
success "Node.js $(node -v)"

# ── 3. Install Ollama if missing ──────────────────────────────────────────────
info "Checking Ollama..."
if ! command -v ollama &>/dev/null; then
  warn "Ollama not found — installing now..."
  curl -fsSL https://ollama.com/install.sh | sh
  success "Ollama installed"
else
  success "Ollama $(ollama --version 2>/dev/null | head -1)"
fi

# ── 4. Python virtual environment ─────────────────────────────────────────────
info "Setting up Python virtual environment..."
if [ ! -d ".venv" ]; then
  python3 -m venv .venv
  success "Created .venv"
else
  success ".venv already exists"
fi

# ── 5. Python dependencies ────────────────────────────────────────────────────
info "Installing Python dependencies..."
source .venv/bin/activate
pip install --upgrade pip --quiet
pip install -r requirements.txt --quiet
success "Python dependencies installed"

# ── 6. Node.js dependencies ───────────────────────────────────────────────────
info "Installing Node.js dependencies..."
cd frontend && npm install --silent && cd ..
success "Node.js dependencies installed"

# ── 7. Pull Ollama LLM model ──────────────────────────────────────────────────
MODEL="${LLM_MODEL:-llama3.2:3b}"
info "Pulling Ollama model '$MODEL' (this may take a few minutes)..."
# Start ollama serve temporarily just to pull if it isn't running
if ! pgrep -x "ollama" &>/dev/null; then
  ollama serve &>/dev/null &
  OLLAMA_TEMP=$!
  sleep 3
fi
ollama pull "$MODEL"
[ -n "$OLLAMA_TEMP" ] && kill "$OLLAMA_TEMP" 2>/dev/null || true
success "Model '$MODEL' ready"

echo ""
echo -e "${GREEN}${BOLD}========================================${RESET}"
echo -e "${GREEN}${BOLD}   Setup complete!                      ${RESET}"
echo -e "${GREEN}${BOLD}========================================${RESET}"
echo ""
echo -e "  Run ${BOLD}./scripts/start.sh${RESET} to launch all services."
echo ""
