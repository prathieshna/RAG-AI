# Local RAG Chatbot

A fully local **Retrieval-Augmented Generation (RAG)** system. Upload PDF documents and ask natural-language questions about them — no cloud APIs, no data leaving your machine.

---

## How It Works

```
PDF upload
    │
    ▼
Extract text per page (pypdf)
    │
    ▼
Split into overlapping chunks
    │
    ▼
Embed with sentence-transformers     ← runs locally, ~90 MB model
    │
    ▼
Store in ChromaDB (on disk)
    │
    ▼  At query time:
Embed question → ChromaDB similarity search → top-K relevant chunks
    │
    ▼
Prompt = system instruction + retrieved chunks + question
    │
    ▼
Local Ollama LLM (llama3.2:3b or similar)
    │
    ▼
Answer + source citations (page number + relevance %)
```

### Tech Stack

| Layer | Tool | Notes |
|-------|------|-------|
| Frontend | Next.js 14 + Tailwind CSS | Split sidebar / chat UI |
| API server | Flask (Python) | REST endpoints |
| Vector store | ChromaDB | Persists embeddings on disk |
| Embeddings | sentence-transformers `all-MiniLM-L6-v2` | Local, ~90 MB |
| LLM | Ollama | Runs quantised models on CPU/GPU |

---

## Prerequisites

| Requirement | Minimum version | Check |
|-------------|----------------|-------|
| Python | 3.10 | `python --version` |
| Node.js | 18 | `node -v` |
| Ollama | latest | [ollama.com](https://ollama.com) |
| Free disk | ~3 GB | For `llama3.2:3b` + embedding model |

---

## Quick Start

### macOS / Linux

```bash
# 1. Clone the repo
git clone <repo-url> ai-rag-chatbot
cd ai-rag-chatbot

# 2. Run setup (creates venv, installs deps, pulls LLM model)
./scripts/setup.sh

# 3. Start everything (Ollama + Flask + Next.js)
./scripts/start.sh
```

Open **http://localhost:3000** in your browser.

### Windows

```powershell
# 1. Clone the repo
git clone <repo-url> ai-rag-chatbot
cd ai-rag-chatbot

# 2. Run setup
powershell -ExecutionPolicy Bypass -File scripts\setup.ps1

# 3. Start everything
powershell -ExecutionPolicy Bypass -File scripts\start.ps1
```

Open **http://localhost:3000** in your browser.

> **Windows note:** The start script opens each service in its own PowerShell window. Close those windows to stop the services.

---

## Manual Setup

Follow these steps if you prefer not to use the setup scripts.

### 1. Install Ollama

<details>
<summary><strong>macOS</strong></summary>

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

Or download the macOS app from [ollama.com](https://ollama.com/download/mac).
</details>

<details>
<summary><strong>Linux</strong></summary>

```bash
curl -fsSL https://ollama.com/install.sh | sh
```
</details>

<details>
<summary><strong>Windows</strong></summary>

Download and run the installer from [ollama.com/download/windows](https://ollama.com/download/windows).
</details>

---

### 2. Pull a Local LLM

```bash
# Lightweight and fast (~2 GB RAM) — recommended to start
ollama pull llama3.2:3b

# Better quality (~5 GB RAM)
ollama pull llama3.1:8b

# Very small for low-memory machines (~1.5 GB RAM)
ollama pull phi3:mini
```

---

### 3. Python Environment

<details>
<summary><strong>macOS / Linux</strong></summary>

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```
</details>

<details>
<summary><strong>Windows (PowerShell)</strong></summary>

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

> If you get an execution policy error, run:
> `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`
</details>

---

### 4. Frontend Dependencies

```bash
cd frontend
npm install
cd ..
```

---

### 5. Start Services Manually

You need **three** terminal windows:

**Terminal 1 — Ollama:**
```bash
ollama serve
```

**Terminal 2 — Flask API:**

macOS / Linux:
```bash
source .venv/bin/activate
python app.py
```

Windows (PowerShell):
```powershell
.\.venv\Scripts\Activate.ps1
python app.py
```

**Terminal 3 — Next.js frontend:**
```bash
cd frontend
npm run dev
```

Open **http://localhost:3000**.

---

## API Reference

All endpoints are on `http://localhost:5001`.

### `GET /health`
```bash
curl http://localhost:5001/health
```
```json
{ "status": "ok", "llm_model": "llama3.2:3b", "embed_model": "all-MiniLM-L6-v2" }
```

### `POST /upload`
Upload a PDF and ingest it into ChromaDB.
```bash
curl -X POST http://localhost:5001/upload \
  -F "file=@/path/to/document.pdf"
```
```json
{
  "message": "PDF ingested successfully.",
  "collection_name": "document",
  "filename": "document.pdf",
  "pages_extracted": 15,
  "chunks_stored": 112
}
```

### `POST /query`
Ask a question. Omit `collection_name` to search all documents.
```bash
curl -X POST http://localhost:5001/query \
  -H "Content-Type: application/json" \
  -d '{"question": "What are the main conclusions?"}'
```
```json
{
  "answer": "According to the document...",
  "model": "llama3.2:3b",
  "sources": [
    { "text": "...", "source": "document.pdf", "page": 7, "distance": 0.18 }
  ]
}
```

### `GET /documents`
```bash
curl http://localhost:5001/documents
```

### `DELETE /documents/<collection_name>`
```bash
curl -X DELETE http://localhost:5001/documents/document
```

---

## Configuration

Override defaults with environment variables (create a `.env` file in the root).

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_MODEL` | `llama3.2:3b` | Ollama model tag |
| `EMBED_MODEL` | `all-MiniLM-L6-v2` | sentence-transformers model |
| `PORT` | `5001` | Flask server port |
| `UPLOAD_FOLDER` | `./uploads` | Where uploaded PDFs are saved |
| `CHROMA_DB_PATH` | `./chroma_db` | ChromaDB persistence directory |
| `MAX_UPLOAD_MB` | `50` | Max upload size |

For the frontend, create `frontend/.env.local`:
```
FLASK_API_URL=http://localhost:5001
```

---

## Project Structure

```
ai-rag-chatbot/
├── app.py                  # Flask API server
├── rag_engine.py           # RAG core: ingest, retrieve, generate
├── requirements.txt        # Python dependencies
├── .env.example            # Backend config template
│
├── frontend/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx        # Root page (document selection state)
│   │   └── globals.css
│   ├── components/
│   │   ├── Sidebar.tsx     # Document list, upload, delete
│   │   └── Chat.tsx        # Chat messages, sources, input
│   ├── lib/
│   │   └── api.ts          # Typed API client
│   ├── next.config.mjs     # Proxies /api/* → Flask (no CORS)
│   └── .env.local.example  # Frontend config template
│
├── scripts/
│   ├── setup.sh            # Setup script (macOS / Linux)
│   ├── start.sh            # Start script (macOS / Linux)
│   ├── setup.ps1           # Setup script (Windows)
│   └── start.ps1           # Start script (Windows)
│
├── uploads/                # Created at runtime — uploaded PDFs
├── chroma_db/              # Created at runtime — ChromaDB data
└── .gitignore
```

---

## Recommended Models by Hardware

| Available RAM | Model | Pull command |
|---------------|-------|-------------|
| 4 GB | `phi3:mini` | `ollama pull phi3:mini` |
| 8 GB | `llama3.2:3b` | `ollama pull llama3.2:3b` |
| 16 GB | `llama3.1:8b` | `ollama pull llama3.1:8b` |
| 32 GB+ | `llama3.1:70b` | `ollama pull llama3.1:70b` |

To switch models, set `LLM_MODEL` in your `.env` file and restart Flask.

---

## Troubleshooting

### All platforms

| Problem | Solution |
|---------|----------|
| `503 Could not reach Ollama` | Run `ollama serve` in a terminal |
| Empty / poor answers | Use a larger model: `LLM_MODEL=llama3.1:8b` |
| PDF has no text extracted | The PDF may be scanned images — use `ocrmypdf` to add a text layer first |

### macOS

| Problem | Solution |
|---------|----------|
| `Port 5001 already in use` | Change `PORT=5002` in `.env` and update `FLASK_API_URL` in `frontend/.env.local` |
| `Port 5000 already in use` | macOS AirPlay Receiver uses 5000 — the app defaults to 5001 to avoid this |
| Script blocked: `zsh: permission denied` | Run `chmod +x scripts/setup.sh scripts/start.sh` |

### Linux

| Problem | Solution |
|---------|----------|
| `ollama: command not found` after install | Restart your shell or run `source ~/.bashrc` |
| Permission denied on scripts | Run `chmod +x scripts/setup.sh scripts/start.sh` |

### Windows

| Problem | Solution |
|---------|----------|
| `cannot be loaded because running scripts is disabled` | Run `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser` |
| `python` not found | Reinstall Python and check **"Add Python to PATH"** during setup |
| Ollama not found after install | Restart PowerShell so the new PATH is loaded |
| Antivirus blocks `ollama.exe` | Add an exception for the Ollama install folder |
