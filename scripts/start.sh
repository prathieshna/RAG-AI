#!/usr/bin/env bash
# start.sh — Start all services (Ollama + Flask + Next.js) for macOS and Linux
set -e

BOLD="\033[1m"
GREEN="\033[0;32m"
CYAN="\033[0;36m"
YELLOW="\033[0;33m"
RED="\033[0;31m"
RESET="\033[0m"

info()    { echo -e "${BOLD}[start]${RESET} $1"; }
success() { echo -e "${GREEN}[✓]${RESET} $1"; }
warn()    { echo -e "${YELLOW}[!]${RESET} $1"; }

# Change to the repo root (so the script works from any directory)
cd "$(dirname "$0")/.."

# ── Guard: check setup has been run ──────────────────────────────────────────
if [ ! -d ".venv" ]; then
  echo -e "${RED}[✗]${RESET} .venv not found. Run './scripts/setup.sh' first."
  exit 1
fi
if [ ! -d "frontend/node_modules" ]; then
  echo -e "${RED}[✗]${RESET} frontend/node_modules not found. Run './scripts/setup.sh' first."
  exit 1
fi

echo ""
echo -e "${BOLD}========================================${RESET}"
echo -e "${BOLD}   RAG Chatbot — Starting Services      ${RESET}"
echo -e "${BOLD}========================================${RESET}"
echo ""

# ── 1. Ollama ─────────────────────────────────────────────────────────────────
STARTED_OLLAMA=false
if pgrep -x "ollama" &>/dev/null; then
  success "Ollama already running"
else
  info "Starting Ollama..."
  ollama serve > /tmp/ollama.log 2>&1 &
  OLLAMA_PID=$!
  STARTED_OLLAMA=true
  sleep 2
  success "Ollama started (pid $OLLAMA_PID)"
fi

# ── 2. Flask API ──────────────────────────────────────────────────────────────
info "Starting Flask API..."
source .venv/bin/activate
python app.py > /tmp/flask.log 2>&1 &
FLASK_PID=$!
sleep 3  # Allow the embedding model to load

# Verify Flask actually started
if ! kill -0 "$FLASK_PID" 2>/dev/null; then
  echo -e "${RED}[✗]${RESET} Flask failed to start. Check /tmp/flask.log for details."
  exit 1
fi
success "Flask API started (pid $FLASK_PID) — http://localhost:5001"

# ── 3. Next.js frontend ───────────────────────────────────────────────────────
info "Starting Next.js frontend..."
cd frontend && npm run dev > /tmp/nextjs.log 2>&1 &
NEXT_PID=$!
cd ..
sleep 3
success "Next.js started (pid $NEXT_PID) — http://localhost:3000"

echo ""
echo -e "${GREEN}${BOLD}========================================${RESET}"
echo -e "${GREEN}${BOLD}   All services running!                ${RESET}"
echo -e "${GREEN}${BOLD}========================================${RESET}"
echo ""
echo -e "  ${CYAN}Frontend  :${RESET}  http://localhost:3000"
echo -e "  ${CYAN}Flask API :${RESET}  http://localhost:5001"
echo ""
echo -e "  Logs:"
echo -e "    Flask  → /tmp/flask.log"
echo -e "    Next.js → /tmp/nextjs.log"
[ "$STARTED_OLLAMA" = true ] && echo -e "    Ollama → /tmp/ollama.log"
echo ""
echo -e "  Press ${BOLD}Ctrl+C${RESET} to stop all services."
echo ""

# ── Cleanup on Ctrl+C ─────────────────────────────────────────────────────────
cleanup() {
  echo ""
  info "Shutting down..."
  kill "$FLASK_PID" 2>/dev/null && echo -e "  ${GREEN}[✓]${RESET} Flask stopped"
  kill "$NEXT_PID"  2>/dev/null && echo -e "  ${GREEN}[✓]${RESET} Next.js stopped"
  if [ "$STARTED_OLLAMA" = true ]; then
    kill "$OLLAMA_PID" 2>/dev/null && echo -e "  ${GREEN}[✓]${RESET} Ollama stopped"
  fi
  echo ""
}

trap cleanup INT TERM

# Keep the script alive so Ctrl+C works
wait
