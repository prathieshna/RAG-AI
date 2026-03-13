"""
rag_engine.py
-------------
Core RAG (Retrieval-Augmented Generation) logic.

Flow:
  1. PDF → extract text per page
  2. Text → overlapping chunks
  3. Chunks → embeddings (via sentence-transformers, runs 100% locally)
  4. Embeddings → stored in ChromaDB (persistent on disk)
  5. At query time: embed the question → find top-K similar chunks → feed as
     context to a local Ollama LLM → return the answer + source citations
"""

import uuid
import logging
from pathlib import Path
from typing import Optional

import pypdf
import chromadb
from chromadb.utils.embedding_functions import SentenceTransformerEmbeddingFunction
import ollama

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helper: PDF loading
# ---------------------------------------------------------------------------

def load_pdf_pages(pdf_path: str) -> list[dict]:
    """
    Read a PDF and return a list of page dicts:
      [{"page": 1, "text": "..."}, ...]

    Empty or image-only pages are skipped.
    """
    reader = pypdf.PdfReader(pdf_path)
    pages = []
    for i, page in enumerate(reader.pages):
        text = page.extract_text() or ""
        if text.strip():
            pages.append({"page": i + 1, "text": text})
    return pages


# ---------------------------------------------------------------------------
# Helper: Text chunking
# ---------------------------------------------------------------------------

def chunk_text(text: str, chunk_size: int = 1000, overlap: int = 200) -> list[str]:
    """
    Split a long string into overlapping chunks so that context is not lost
    at chunk boundaries.

    Example with chunk_size=10, overlap=3:
      "0123456789ABCDE" → ["0123456789", "789ABCDE", ...]
    """
    chunks = []
    start = 0
    while start < len(text):
        end = min(start + chunk_size, len(text))
        chunks.append(text[start:end])
        if end == len(text):
            break
        start += chunk_size - overlap
    return chunks


# ---------------------------------------------------------------------------
# RAGEngine class
# ---------------------------------------------------------------------------

class RAGEngine:
    """
    Wraps ChromaDB + Ollama to provide:
      - ingest_pdf()      → load, chunk, embed, store a PDF
      - query()           → semantic search + LLM answer generation
      - list_documents()  → list all stored collections
      - delete_document() → remove a collection
    """

    def __init__(
        self,
        chroma_path: str = "./chroma_db",
        llm_model: str = "llama3.2:3b",
        embedding_model: str = "all-MiniLM-L6-v2",
        chunk_size: int = 1000,
        chunk_overlap: int = 200,
        top_k: int = 5,
    ):
        """
        Parameters
        ----------
        chroma_path     : Directory where ChromaDB persists data on disk.
        llm_model       : Ollama model tag to use for answer generation.
                          Must be pulled first: `ollama pull llama3.2:3b`
        embedding_model : sentence-transformers model for creating embeddings.
                          Downloaded automatically on first run (~90 MB).
        chunk_size      : Max characters per chunk sent to the vector store.
        chunk_overlap   : Overlap characters between consecutive chunks.
        top_k           : Number of similar chunks to retrieve per query.
        """
        self.llm_model = llm_model
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.top_k = top_k

        # ChromaDB client – data is saved to disk at `chroma_path`
        self.chroma = chromadb.PersistentClient(path=chroma_path)

        # Embedding function – sentence-transformers runs fully locally,
        # no internet call needed after the first download.
        self.embed_fn = SentenceTransformerEmbeddingFunction(
            model_name=embedding_model
        )

        logger.info("RAGEngine ready | LLM: %s | embed: %s", llm_model, embedding_model)

    # ------------------------------------------------------------------
    # Ingest
    # ------------------------------------------------------------------

    def ingest_pdf(self, pdf_path: str, collection_name: Optional[str] = None) -> dict:
        """
        Load a PDF, split into chunks, embed them, and store in ChromaDB.

        Parameters
        ----------
        pdf_path        : Absolute or relative path to the PDF file.
        collection_name : Name for the ChromaDB collection.
                          Defaults to the sanitised PDF filename stem.

        Returns a dict with ingestion statistics.
        """
        path = Path(pdf_path)
        if not path.exists():
            raise FileNotFoundError(f"PDF not found: {pdf_path}")

        # Derive a safe collection name from the filename if not provided
        if not collection_name:
            collection_name = _sanitise_name(path.stem)

        logger.info("Ingesting '%s' → collection '%s'", path.name, collection_name)

        # 1. Extract text page by page
        pages = load_pdf_pages(str(path))
        if not pages:
            raise ValueError("No extractable text found in the PDF (scanned image PDF?).")

        # 2. Chunk each page and track metadata
        all_ids, all_docs, all_meta = [], [], []
        for page_data in pages:
            chunks = chunk_text(page_data["text"], self.chunk_size, self.chunk_overlap)
            for chunk in chunks:
                all_ids.append(str(uuid.uuid4()))
                all_docs.append(chunk)
                all_meta.append({
                    "source": path.name,
                    "page": page_data["page"],
                })

        logger.info("Split into %d chunks across %d pages", len(all_docs), len(pages))

        # 3. Store in ChromaDB (upsert = safe to re-ingest the same file)
        collection = self.chroma.get_or_create_collection(
            name=collection_name,
            embedding_function=self.embed_fn,
            metadata={"source_file": path.name, "total_pages": len(pages)},
        )
        collection.upsert(ids=all_ids, documents=all_docs, metadatas=all_meta)

        logger.info("Stored %d chunks in collection '%s'", len(all_docs), collection_name)
        return {
            "collection_name": collection_name,
            "filename": path.name,
            "pages_extracted": len(pages),
            "chunks_stored": len(all_docs),
        }

    # ------------------------------------------------------------------
    # Query
    # ------------------------------------------------------------------

    def query(self, question: str, collection_name: Optional[str] = None) -> dict:
        """
        Answer a question using the RAG pipeline.

        1. Embed the question.
        2. Retrieve the top-K most similar chunks from ChromaDB.
        3. Build a prompt with the retrieved context.
        4. Call the local Ollama LLM to generate an answer.

        Parameters
        ----------
        question        : The user's natural-language question.
        collection_name : Limit search to one collection, or None to search all.

        Returns a dict with 'answer', 'sources', and 'model'.
        """
        question = question.strip()

        # Retrieve relevant chunks
        chunks = self._retrieve(question, collection_name)
        if not chunks:
            return {
                "answer": (
                    "No relevant documents found. "
                    "Please upload a PDF first using the /upload endpoint."
                ),
                "sources": [],
                "model": self.llm_model,
            }

        # Build the context block from retrieved chunks
        context_parts = [
            f"[Source: {c['source']}, Page {c['page']}]\n{c['text']}"
            for c in chunks
        ]
        context = "\n\n---\n\n".join(context_parts)

        # Construct the prompt – keep the LLM grounded to the retrieved docs
        prompt = (
            "You are a helpful assistant that answers questions strictly based on "
            "the document excerpts provided below.\n"
            "If the answer cannot be found in the excerpts, respond with: "
            "\"I don't have enough information in the provided documents to answer this.\"\n\n"
            f"Document excerpts:\n{context}\n\n"
            f"Question: {question}\n\n"
            "Answer:"
        )

        logger.info(
            "Calling LLM '%s' with %d context chunks", self.llm_model, len(chunks)
        )

        # Call Ollama – must be running locally (`ollama serve`)
        try:
            response = ollama.chat(
                model=self.llm_model,
                messages=[{"role": "user", "content": prompt}],
            )
            answer = response.message.content
        except Exception as e:
            logger.error("Ollama error: %s", e)
            raise RuntimeError(
                f"Could not reach Ollama. Is it running? (`ollama serve`)\nDetail: {e}"
            ) from e

        return {
            "answer": answer,
            "sources": chunks,
            "model": self.llm_model,
        }

    # ------------------------------------------------------------------
    # Document management
    # ------------------------------------------------------------------

    def list_documents(self) -> list[dict]:
        """Return metadata for every collection stored in ChromaDB."""
        result = []
        for col in self.chroma.list_collections():
            try:
                c = self.chroma.get_collection(
                    name=col.name, embedding_function=self.embed_fn
                )
                result.append({
                    "collection_name": col.name,
                    "chunk_count": c.count(),
                    "metadata": col.metadata or {},
                })
            except Exception as e:
                logger.warning("Could not read collection '%s': %s", col.name, e)
        return result

    def delete_document(self, collection_name: str) -> bool:
        """Delete a collection (and all its embeddings) from ChromaDB."""
        try:
            self.chroma.delete_collection(name=collection_name)
            logger.info("Deleted collection '%s'", collection_name)
            return True
        except Exception as e:
            logger.error("Delete failed for '%s': %s", collection_name, e)
            return False

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _retrieve(self, query: str, collection_name: Optional[str]) -> list[dict]:
        """
        Semantic search in ChromaDB.

        If collection_name is given, search only that collection.
        Otherwise, fan out to all collections and merge results.
        """
        # Collect the ChromaDB Collection objects to search
        if collection_name:
            try:
                cols = [
                    self.chroma.get_collection(
                        name=collection_name, embedding_function=self.embed_fn
                    )
                ]
            except Exception:
                logger.warning("Collection '%s' not found", collection_name)
                return []
        else:
            cols = [
                self.chroma.get_collection(
                    name=c.name, embedding_function=self.embed_fn
                )
                for c in self.chroma.list_collections()
            ]

        if not cols:
            return []

        results = []
        for col in cols:
            n = min(self.top_k, col.count())
            if n == 0:
                continue
            res = col.query(query_texts=[query], n_results=n)
            for i, doc_text in enumerate(res["documents"][0]):
                results.append({
                    "text": doc_text,
                    "source": res["metadatas"][0][i].get("source", "unknown"),
                    "page": res["metadatas"][0][i].get("page", "?"),
                    "collection": col.name,
                    # Lower distance = more similar
                    "distance": (
                        res["distances"][0][i]
                        if "distances" in res else None
                    ),
                })

        # Sort by relevance (ascending distance) and keep top_k overall
        if results and results[0]["distance"] is not None:
            results.sort(key=lambda x: x["distance"])
        return results[: self.top_k]


# ---------------------------------------------------------------------------
# Utility
# ---------------------------------------------------------------------------

def _sanitise_name(name: str) -> str:
    """
    Make a string safe for use as a ChromaDB collection name.
    ChromaDB requires: 3-63 chars, alphanumeric + hyphens/underscores,
    must start and end with alphanumeric.
    """
    sanitised = "".join(
        c if c.isalnum() or c in "-_" else "_" for c in name.lower()
    )
    # Ensure it starts with a letter (prefix if needed)
    if sanitised and not sanitised[0].isalpha():
        sanitised = "doc_" + sanitised
    # Clamp length
    sanitised = sanitised[:60] or "document"
    return sanitised
