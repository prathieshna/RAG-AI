"""
app.py
------
Flask API server for the local RAG chatbot.

Endpoints:
  GET  /health                     – liveness check
  POST /upload                     – upload & ingest a PDF
  POST /query                      – ask a question
  GET  /documents                  – list all ingested document collections
  DELETE /documents/<collection>   – delete a document collection
"""

import os
import logging
from pathlib import Path

from flask import Flask, request, jsonify
from werkzeug.utils import secure_filename

from rag_engine import RAGEngine

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s – %(message)s",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration  (override any value via environment variables)
# ---------------------------------------------------------------------------
UPLOAD_FOLDER = os.getenv("UPLOAD_FOLDER", "./uploads")
CHROMA_DB_PATH = os.getenv("CHROMA_DB_PATH", "./chroma_db")
LLM_MODEL = os.getenv("LLM_MODEL", "llama3.2:3b")          # Ollama model tag
EMBED_MODEL = os.getenv("EMBED_MODEL", "all-MiniLM-L6-v2") # sentence-transformers model
MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "50"))

ALLOWED_EXTENSIONS = {"pdf"}

# Create upload directory if it doesn't exist yet
Path(UPLOAD_FOLDER).mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# Flask app
# ---------------------------------------------------------------------------
app = Flask(__name__)
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_MB * 1024 * 1024

# ---------------------------------------------------------------------------
# Shared RAG engine instance (initialised once at startup)
# ---------------------------------------------------------------------------
logger.info("Initialising RAG engine …")
rag = RAGEngine(
    chroma_path=CHROMA_DB_PATH,
    llm_model=LLM_MODEL,
    embedding_model=EMBED_MODEL,
)
logger.info("RAG engine ready.")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _allowed(filename: str) -> bool:
    """Return True if the uploaded file has an allowed extension."""
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def _err(message: str, code: int = 400):
    """Shorthand for error JSON responses."""
    return jsonify({"error": message}), code


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/health", methods=["GET"])
def health():
    """
    Health check – confirm the server is running and show active config.

    Response 200:
      { "status": "ok", "llm_model": "...", "embed_model": "..." }
    """
    return jsonify({
        "status": "ok",
        "llm_model": LLM_MODEL,
        "embed_model": EMBED_MODEL,
    })


@app.route("/upload", methods=["POST"])
def upload_pdf():
    """
    Upload a PDF and ingest it into ChromaDB.

    Request  : multipart/form-data
      - file            (required) – the PDF file
      - collection_name (optional) – custom name for this document's collection;
                                     defaults to the sanitised filename stem

    Response 200:
      {
        "message": "PDF ingested successfully.",
        "collection_name": "my_report",
        "filename": "my_report.pdf",
        "pages_extracted": 12,
        "chunks_stored": 87
      }
    """
    # Validate that a file was sent
    if "file" not in request.files:
        return _err("No file provided. Send a PDF via the 'file' form field.")

    file = request.files["file"]
    if file.filename == "":
        return _err("No file selected.")
    if not _allowed(file.filename):
        return _err("Only PDF files (.pdf) are accepted.")

    # secure_filename strips path components – prevents directory traversal
    filename = secure_filename(file.filename)
    save_path = os.path.join(app.config["UPLOAD_FOLDER"], filename)
    file.save(save_path)
    logger.info("Saved upload: %s", save_path)

    # Optional custom collection name from form data
    collection_name = request.form.get("collection_name") or None

    try:
        result = rag.ingest_pdf(save_path, collection_name=collection_name)
        return jsonify({"message": "PDF ingested successfully.", **result}), 200
    except FileNotFoundError as e:
        return _err(str(e), 404)
    except ValueError as e:
        return _err(str(e), 422)
    except Exception as e:
        logger.exception("Ingest failed")
        return _err(f"Ingestion error: {e}", 500)


@app.route("/query", methods=["POST"])
def query():
    """
    Ask a question and get an answer grounded in the ingested documents.

    Request  : application/json
      {
        "question":        "What are the key findings?",  (required)
        "collection_name": "my_report"                    (optional, searches all if omitted)
      }

    Response 200:
      {
        "answer":  "The key findings are …",
        "model":   "llama3.2:3b",
        "sources": [
          { "text": "…", "source": "report.pdf", "page": 3,
            "collection": "my_report", "distance": 0.21 },
          …
        ]
      }
    """
    body = request.get_json(silent=True)
    if not body or "question" not in body:
        return _err("JSON body must include a 'question' field.")

    question = body["question"].strip()
    if not question:
        return _err("'question' cannot be empty.")

    collection_name = body.get("collection_name") or None

    try:
        result = rag.query(question, collection_name=collection_name)
        return jsonify(result), 200
    except RuntimeError as e:
        # Ollama not reachable
        return _err(str(e), 503)
    except Exception as e:
        logger.exception("Query failed")
        return _err(f"Query error: {e}", 500)


@app.route("/documents", methods=["GET"])
def list_documents():
    """
    List every document collection currently stored in ChromaDB.

    Response 200:
      {
        "documents": [
          {
            "collection_name": "annual_report_2024",
            "chunk_count": 143,
            "metadata": { "source_file": "annual_report_2024.pdf", "total_pages": 20 }
          },
          …
        ]
      }
    """
    try:
        docs = rag.list_documents()
        return jsonify({"documents": docs}), 200
    except Exception as e:
        logger.exception("List failed")
        return _err(f"List error: {e}", 500)


@app.route("/documents/<collection_name>", methods=["DELETE"])
def delete_document(collection_name: str):
    """
    Delete a document collection (removes all its embeddings from ChromaDB).

    Path param: collection_name – the name returned by GET /documents

    Response 200 : { "message": "Collection '…' deleted." }
    Response 404 : { "error": "Collection '…' not found." }
    """
    try:
        deleted = rag.delete_document(collection_name)
        if deleted:
            return jsonify({"message": f"Collection '{collection_name}' deleted."}), 200
        return _err(f"Collection '{collection_name}' not found.", 404)
    except Exception as e:
        logger.exception("Delete failed")
        return _err(f"Delete error: {e}", 500)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    # Use host="0.0.0.0" so the API is reachable from other machines on the LAN.
    # Set debug=False in production.
    port = int(os.getenv("PORT", 5001))  # 5000 is used by macOS AirPlay Receiver
    app.run(host="0.0.0.0", port=port, debug=False)
