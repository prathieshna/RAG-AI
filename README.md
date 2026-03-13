# Local RAG Chatbot

A lightweight, fully local **Retrieval-Augmented Generation (RAG)** system that lets you upload PDF documents and ask natural-language questions about them — no cloud APIs, no data leaving your machine.

---

## How It Works

```
PDF upload
    │
    ▼
Extract text (pypdf)
    │
    ▼
Split into overlapping chunks
    │
    ▼
Embed with sentence-transformers          ← runs locally, ~90 MB model
    │
    ▼
Store in ChromaDB (on disk)
    │
    ▼
──────────────────────────────────────────
At query time:

User question
    │
    ▼
Embed question  →  ChromaDB similarity search  →  top-K relevant chunks
    │
    ▼
Build prompt  =  system instruction + retrieved context + question
    │
    ▼
Local Ollama LLM (llama3.2:3b or similar)
    │
    ▼
Answer + source citations
```

### Tech Stack

| Component | Library | Purpose |
|-----------|---------|---------|
| API server | Flask | Exposes REST endpoints |
| PDF parsing | pypdf | Extracts text per page |
| Vector store | ChromaDB | Persists and searches embeddings |
| Embeddings | sentence-transformers | `all-MiniLM-L6-v2` (local, fast) |
| LLM | Ollama | Runs quantised LLMs on your CPU/GPU |

---

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| **Python 3.10+** | Check: `python --version` |
| **Ollama** | Download from [ollama.com](https://ollama.com) |
| ~3 GB free disk | For the default `llama3.2:3b` model |
| ~500 MB free disk | For the sentence-transformers embedding model |

---

## Setup Guide

### 1. Install Ollama

**macOS / Linux:**
```bash
curl -fsSL https://ollama.com/install.sh | sh
```

**Windows:** Download the installer from [https://ollama.com](https://ollama.com/download/windows).

### 2. Pull a Local LLM

```bash
# Lightweight and fast (~2 GB) — recommended to start
ollama pull llama3.2:3b

# Better quality but needs more RAM (~5 GB)
ollama pull llama3.1:8b

# Very small, runs on low-memory machines (~1.5 GB)
ollama pull phi3:mini
```

### 3. Clone / Download This Project

```bash
git clone <repo-url> ai-rag-chatbot
cd ai-rag-chatbot
```

### 4. Create a Python Virtual Environment

```bash
python -m venv .venv

# Activate (macOS / Linux)
source .venv/bin/activate

# Activate (Windows)
.venv\Scripts\activate
```

### 5. Install Python Dependencies

```bash
pip install -r requirements.txt
```

> **Note:** The first run will download the `all-MiniLM-L6-v2` embedding model (~90 MB) automatically.

### 6. (Optional) Configure Environment Variables

```bash
cp .env.example .env
# Edit .env with your preferred model or paths
```

The app works with its defaults without any `.env` file.

### 7. Start Ollama (if not already running)

```bash
ollama serve
```

Leave this running in a separate terminal.

### 8. Start the Flask Server

```bash
python app.py
```

You should see:

```
INFO – RAG engine ready.
 * Running on http://0.0.0.0:5000
```

---

## API Reference

### `GET /health`

Check that the server is running.

```bash
curl http://localhost:5000/health
```

```json
{
  "status": "ok",
  "llm_model": "llama3.2:3b",
  "embed_model": "all-MiniLM-L6-v2"
}
```

---

### `POST /upload`

Upload a PDF and ingest it into the vector store.

```bash
curl -X POST http://localhost:5000/upload \
  -F "file=@/path/to/your/document.pdf"
```

With an optional custom collection name:

```bash
curl -X POST http://localhost:5000/upload \
  -F "file=@report.pdf" \
  -F "collection_name=q3_report"
```

**Response:**

```json
{
  "message": "PDF ingested successfully.",
  "collection_name": "report",
  "filename": "report.pdf",
  "pages_extracted": 15,
  "chunks_stored": 112
}
```

---

### `POST /query`

Ask a question. Searches all ingested documents by default.

```bash
curl -X POST http://localhost:5000/query \
  -H "Content-Type: application/json" \
  -d '{"question": "What are the main conclusions?"}'
```

Limit the search to one document:

```bash
curl -X POST http://localhost:5000/query \
  -H "Content-Type: application/json" \
  -d '{"question": "What is the revenue?", "collection_name": "q3_report"}'
```

**Response:**

```json
{
  "answer": "According to the document, the main conclusions are …",
  "model": "llama3.2:3b",
  "sources": [
    {
      "text": "… extracted chunk text …",
      "source": "report.pdf",
      "page": 7,
      "collection": "report",
      "distance": 0.18
    }
  ]
}
```

---

### `GET /documents`

List all ingested document collections.

```bash
curl http://localhost:5000/documents
```

**Response:**

```json
{
  "documents": [
    {
      "collection_name": "report",
      "chunk_count": 112,
      "metadata": {
        "source_file": "report.pdf",
        "total_pages": 15
      }
    }
  ]
}
```

---

### `DELETE /documents/<collection_name>`

Remove a document and all its embeddings from the vector store.

```bash
curl -X DELETE http://localhost:5000/documents/report
```

**Response:**

```json
{
  "message": "Collection 'report' deleted."
}
```

---

## Configuration

All settings can be overridden with environment variables (or via a `.env` file):

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_MODEL` | `llama3.2:3b` | Ollama model tag |
| `EMBED_MODEL` | `all-MiniLM-L6-v2` | sentence-transformers model |
| `UPLOAD_FOLDER` | `./uploads` | Where uploaded PDFs are saved |
| `CHROMA_DB_PATH` | `./chroma_db` | ChromaDB persistence directory |
| `MAX_UPLOAD_MB` | `50` | Max PDF upload size |

---

## Project Structure

```
ai-rag-chatbot/
├── app.py            # Flask server – API routes and startup
├── rag_engine.py     # RAG core – ingest, retrieve, generate
├── requirements.txt  # Python dependencies
├── .env.example      # Environment variable template
├── README.md         # This file
├── uploads/          # Created at runtime – stores uploaded PDFs
└── chroma_db/        # Created at runtime – ChromaDB persistent data
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `503 Could not reach Ollama` | Run `ollama serve` in a separate terminal |
| `ollama pull` is slow | Normal – models are 2–5 GB; run once and they're cached |
| Empty answer / poor quality | Try a larger model: `LLM_MODEL=llama3.1:8b` |
| PDF has no text extracted | The PDF may be scanned images; use an OCR tool first (e.g. `ocrmypdf`) |
| `chromadb` install fails | Try `pip install chromadb --no-binary :all:` or upgrade pip first |
| Port 5000 already in use | `PORT=8080 python app.py` (add `port=int(os.getenv("PORT", 5000))` to `app.run`) |

---

## Recommended Models by Hardware

| RAM available | Recommended model | Pull command |
|---------------|------------------|--------------|
| 4 GB | `phi3:mini` | `ollama pull phi3:mini` |
| 8 GB | `llama3.2:3b` | `ollama pull llama3.2:3b` |
| 16 GB | `llama3.1:8b` | `ollama pull llama3.1:8b` |
| 32 GB+ | `llama3.1:70b` (quantised) | `ollama pull llama3.1:70b` |
