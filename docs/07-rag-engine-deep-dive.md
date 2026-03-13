# 7. `rag_engine.py` — Deep Dive Notebook

This document reads like a Jupyter notebook. Every block of code from `rag_engine.py` is shown exactly as written, followed by a line-by-line explanation, the reasoning behind each choice, and concrete alternatives you could swap in.

The goal: after reading this, you could rewrite this file yourself from scratch, and you'd know *why* every decision was made.

---

## Table of Contents

1. [The Module Docstring](#1-the-module-docstring)
2. [Imports](#2-imports)
3. [The Logger](#3-the-logger)
4. [Function: `load_pdf_pages()`](#4-function-load_pdf_pages)
5. [Function: `chunk_text()`](#5-function-chunk_text)
6. [Class: `RAGEngine.__init__()`](#6-class-ragengine__init__)
7. [Method: `ingest_pdf()`](#7-method-ingest_pdf)
8. [Method: `query()`](#8-method-query)
9. [Method: `list_documents()`](#9-method-list_documents)
10. [Method: `delete_document()`](#10-method-delete_document)
11. [Method: `_retrieve()`](#11-method-_retrieve)
12. [Utility: `_sanitise_name()`](#12-utility-_sanitise_name)
13. [The Whole Picture](#13-the-whole-picture)

---

## 1. The Module Docstring

```python
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
```

### What this is

The triple-quoted string at the very top of a Python file is called a **module docstring**. It is not a comment — it is a string that Python actually stores and makes accessible at runtime via `rag_engine.__doc__`. Tools like auto-documentation generators (Sphinx, pdoc) read these to produce HTML documentation.

### Why it's here

It gives any developer (including your future self) a 5-second summary of what this file does without reading a single line of code. The numbered flow list is especially useful — it is the mental model you need before reading the implementation.

### Alternatives

You could omit it entirely — the code would work identically. But the convention in professional Python code is to always include one. Some teams enforce this with a linter rule (`pydocstyle`).

---

## 2. Imports

```python
import uuid
import logging
from pathlib import Path
from typing import Optional

import pypdf
import chromadb
from chromadb.utils.embedding_functions import SentenceTransformerEmbeddingFunction
import ollama
```

Imports are instructions that tell Python "load this library and make its functions available to me." There are two groups here, separated by a blank line — this is the PEP 8 convention (Python's official style guide):

- **Standard library imports** (come with Python, no installation needed)
- **Third-party imports** (installed via `pip`)

---

### `import uuid`

**What it is:** `uuid` stands for **Universally Unique Identifier**. It generates random IDs that are statistically guaranteed to be unique across the entire world.

**Why we need it:** ChromaDB requires every stored chunk to have a unique ID. We need to generate one for each chunk.

**What it produces:**
```python
import uuid
uuid.uuid4()
# → UUID('a3f2b1c4-8d9e-4f0a-b2c3-1d2e3f4a5b6c')
str(uuid.uuid4())
# → 'a3f2b1c4-8d9e-4f0a-b2c3-1d2e3f4a5b6c'  (a string)
```

**Alternatives:**

| Option | Example | Pros | Cons |
|--------|---------|------|------|
| `uuid.uuid4()` ✅ used | `"a3f2b1c4-..."` | Globally unique, zero setup | Long string |
| Sequential integers | `"chunk_001"` | Human-readable | Collide if you re-ingest — chunk 1 of doc A and chunk 1 of doc B are both "chunk_001" |
| Hash of content | `hashlib.md5(text)` | Deterministic — same text always same ID | Two identical paragraphs in different docs get the same ID, causing silent overwrites |
| Filename + page + index | `"report_p3_c2"` | Readable and structured | Complex to generate, fragile if naming changes |

`uuid4` is the standard choice because it requires no coordination and is guaranteed unique.

---

### `import logging`

**What it is:** Python's built-in logging framework. Lets you print messages with severity levels (DEBUG, INFO, WARNING, ERROR, CRITICAL) that can be filtered, formatted, and routed to files.

**Why not just `print()`?**

```python
# print() — always outputs, no level, no timestamp, no source info
print("Ingesting PDF")

# logging — controllable, structured, includes timestamp and source
logger.info("Ingesting PDF")
# → 2026-03-13 21:00:01 [INFO] rag_engine – Ingesting PDF
```

With logging you can:
- Turn off all DEBUG messages in production with one line
- Write logs to a file instead of the terminal
- Include timestamps automatically
- Know *which file* the message came from

**Alternatives:**

| Option | When to use |
|--------|------------|
| `logging` ✅ used | Any real application |
| `print()` | Tiny throwaway scripts only |
| `loguru` (third-party) | Cleaner API, coloured output, but needs `pip install` |
| `structlog` (third-party) | Produces JSON logs — great for cloud/production systems |

---

### `from pathlib import Path`

**What it is:** `Path` is Python's modern way of working with file system paths. It treats a path as an object with methods, rather than just a string.

**Why not just use strings?**

```python
# Old way — string manipulation, error-prone, OS-dependent
import os
path = "./uploads" + "/" + "report.pdf"   # breaks on Windows (uses \)
stem = "report.pdf".split(".")[0]         # fragile

# Modern way — Path object
from pathlib import Path
path = Path("./uploads") / "report.pdf"   # works on every OS
stem = Path("report.pdf").stem            # → "report"
exists = path.exists()                    # → True or False
path.mkdir(parents=True, exist_ok=True)   # create directories safely
```

**Key `Path` methods used in this file:**

| Method | What it does | Example |
|--------|-------------|---------|
| `Path(x).exists()` | Does this file/folder exist? | `Path("./uploads").exists()` → `True` |
| `path.stem` | Filename without extension | `Path("report.pdf").stem` → `"report"` |
| `path.name` | Full filename with extension | `Path("./uploads/report.pdf").name` → `"report.pdf"` |
| `path.mkdir(parents=True, exist_ok=True)` | Create directory (and parents) safely | Creates `./uploads/` if it doesn't exist |

**Alternatives:**
- `os.path` — the old way, still works but more verbose
- Plain strings — works but breaks on Windows if you hardcode `/`

---

### `from typing import Optional`

**What it is:** `Optional[str]` is a type hint that means "this can be either a `str` or `None`."

**Why it matters:**

```python
# Without type hints — what can collection_name be?
def ingest_pdf(self, pdf_path, collection_name=None):
    ...

# With type hints — crystal clear
def ingest_pdf(self, pdf_path: str, collection_name: Optional[str] = None) -> dict:
    ...
```

Type hints do not change how the code runs — they are annotations for humans and tools. IDEs like VS Code use them to show autocomplete suggestions and catch type errors before you run the code.

**Note:** In Python 3.10+, you can write `str | None` instead of `Optional[str]`. Both mean the same thing. We use `Optional` here because it is more readable for beginners.

---

### `import pypdf`

**What it is:** `pypdf` is a Python library for reading PDF files. It can extract text, metadata, and page information.

**Why `pypdf` specifically?**

| Library | Notes |
|---------|-------|
| `pypdf` ✅ used | Pure Python, no system dependencies, actively maintained |
| `PyMuPDF` (fitz) | Faster, more accurate text extraction, handles complex layouts better — but requires a compiled C library |
| `pdfminer.six` | Very detailed text extraction with layout info — more complex API |
| `pdfplumber` | Built on pdfminer, great for tables — heavier dependency |
| `Tika` | Uses Apache Tika (Java) — very powerful but requires Java installed |

**The key limitation of all these libraries:** they can only extract text that is *digitally encoded* in the PDF. If the PDF is a scan (a photo of a printed page), there is no text to extract — only pixels. For scanned PDFs you need OCR (Optical Character Recognition), like the `ocrmypdf` tool.

---

### `import chromadb`

**What it is:** ChromaDB is the vector database. This line loads the entire library.

**Alternatives to ChromaDB:**

| Database | Notes |
|----------|-------|
| `chromadb` ✅ used | Simple, local, no server setup, great for development |
| `qdrant` | More production-ready, can run as a separate server, better performance at scale |
| `weaviate` | Full-featured, GraphQL API, cloud/on-prem options |
| `pinecone` | Cloud-only (not local), very scalable, paid service |
| `pgvector` | PostgreSQL extension — uses your existing Postgres database |
| `faiss` | Meta's library — extremely fast but more low-level, no built-in persistence |
| `milvus` | Enterprise-grade, needs separate server, complex setup |

ChromaDB is the right choice here because it runs entirely in-process (no separate server), persists to disk automatically, and has a beginner-friendly API.

---

### `from chromadb.utils.embedding_functions import SentenceTransformerEmbeddingFunction`

**What it is:** This imports ChromaDB's built-in wrapper around the `sentence-transformers` library. When you pass it to a collection, ChromaDB automatically calls it to convert text to embeddings before storing or searching.

**What it does under the hood:**
```
text string → SentenceTransformerEmbeddingFunction → [0.21, -0.54, 0.89, ...]
```

**Why import from `chromadb.utils` instead of importing `sentence_transformers` directly?**

If you imported `sentence_transformers` directly, you'd have to:
1. Manually call the model to embed each chunk
2. Pass the raw numbers to ChromaDB
3. Do the same for every query

ChromaDB's wrapper handles all of that automatically. You just tell the collection which embedding function to use, and it embeds everything behind the scenes.

**Alternatives for embeddings:**

| Option | Model size | Speed | Quality | Notes |
|--------|-----------|-------|---------|-------|
| `all-MiniLM-L6-v2` ✅ used | ~90 MB | Fast | Good | Best balance for local use |
| `all-mpnet-base-v2` | ~420 MB | Slower | Better | Higher quality, larger model |
| `all-MiniLM-L12-v2` | ~120 MB | Medium | Better than L6 | Small quality boost |
| `text-embedding-3-small` | Cloud (OpenAI) | Fast | Excellent | Requires API key, costs money, not private |
| `nomic-embed-text` via Ollama | ~300 MB | Medium | Good | Can run via Ollama for a fully Ollama-based stack |
| `chromadb.utils.embedding_functions.OllamaEmbeddingFunction` | Depends on model | Slower | Varies | Uses Ollama for embeddings too — all-in-one but slower |

---

### `import ollama`

**What it is:** The official Python client for Ollama. It provides a simple function to send messages to a locally running Ollama server and get responses.

**Alternatives for the LLM layer:**

| Option | Notes |
|--------|-------|
| `ollama` ✅ used | Simplest, talks to local Ollama server |
| `llama-cpp-python` | Runs GGUF model files directly in Python — no Ollama needed, but more complex setup |
| `transformers` (HuggingFace) | Run any HuggingFace model directly — very powerful, more memory usage, needs GPU for larger models |
| `openai` | Calls OpenAI's API — not local, costs money, not private |
| `anthropic` | Calls Claude API — not local |
| `langchain` | Abstraction layer over all of the above — useful if you want to swap providers easily |

---

## 3. The Logger

```python
logger = logging.getLogger(__name__)
```

### Line by line

`logging.getLogger(__name__)` — creates (or retrieves) a logger named after the current module. `__name__` is a special Python variable that holds the module's name — in this file it is `"rag_engine"`.

**Why name loggers after the module?**

When your application grows and has multiple files all writing logs, you can instantly see which file produced each log line:

```
2026-03-13 21:00:01 [INFO] rag_engine – Ingesting PDF
2026-03-13 21:00:02 [INFO] app – Saved upload: ./uploads/report.pdf
```

Without module-level naming, all messages would appear to come from the root logger, making it impossible to trace which file produced which message.

**How logging levels work:**

```
DEBUG    → Detailed diagnostic info (disabled in production)
INFO     → Normal operational messages ("PDF ingested successfully")
WARNING  → Something unexpected but recoverable ("Collection not found")
ERROR    → Something failed ("Ollama error: connection refused")
CRITICAL → The program may need to stop
```

Each level includes all levels above it. If you set the level to `INFO`, you see INFO, WARNING, ERROR, and CRITICAL — but not DEBUG.

---

## 4. Function: `load_pdf_pages()`

```python
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
```

### Why this is a standalone function, not a method

It is defined *outside* the `RAGEngine` class because it has no dependency on the engine's state (it doesn't use `self`). In Python, if a function doesn't need `self`, it should not be a method — keeping it standalone makes it easier to test independently and reuse elsewhere.

---

### `def load_pdf_pages(pdf_path: str) -> list[dict]:`

**`pdf_path: str`** — the function expects a string (a file path). If you pass something else, a type-aware IDE will warn you.

**`-> list[dict]`** — the return type annotation. This function returns a list of dictionaries. In Python, `->` denotes the return type. This is purely a hint — Python doesn't enforce it at runtime.

---

### `reader = pypdf.PdfReader(pdf_path)`

`PdfReader` opens the PDF file and parses its internal structure. The resulting `reader` object gives you access to:

- `reader.pages` — list of all pages
- `reader.metadata` — title, author, creation date
- `reader.is_encrypted` — whether the PDF is password-protected

**What if the file doesn't exist?**

`pypdf` will raise a `FileNotFoundError`. We check for this *before* calling this function (in `ingest_pdf()`), so it should never happen in normal flow. But defensive programming is good.

**What if the PDF is password-protected?**

`pypdf` will raise `pypdf.errors.FileDecryptionError`. This is not currently handled — a potential future improvement would be to catch it and return a clear error message.

---

### `pages = []`

An empty list that we will fill with one dictionary per page.

**Alternative data structure:** You could use a generator instead of building a list in memory:

```python
# Generator version — more memory-efficient for very large PDFs
def load_pdf_pages(pdf_path: str):
    reader = pypdf.PdfReader(pdf_path)
    for i, page in enumerate(reader.pages):
        text = page.extract_text() or ""
        if text.strip():
            yield {"page": i + 1, "text": text}
```

A generator doesn't build the whole list at once — it produces one item at a time. For a 5,000-page PDF this could matter. For typical business documents (5–200 pages), the list is fine.

---

### `for i, page in enumerate(reader.pages):`

**`reader.pages`** — a list of `PageObject` instances, one per page.

**`enumerate(...)`** — wraps an iterable and adds a counter. Without `enumerate`:

```python
# Without enumerate — need a manual counter
i = 0
for page in reader.pages:
    # use i and page
    i += 1

# With enumerate — cleaner
for i, page in enumerate(reader.pages):
    # i is the counter (0-based), page is the item
```

`enumerate` starts counting at 0 by default. We add 1 below to make page numbers 1-based (matching what you see in the PDF viewer).

---

### `text = page.extract_text() or ""`

**`page.extract_text()`** — reads the text content off this page. Returns a string if successful, or `None` if no text layer exists.

**`or ""`** — the `or` operator in Python: if the left side is falsy (`None`, `""`, `0`, `[]`), return the right side. So if `extract_text()` returns `None`, we get an empty string instead of `None`. This prevents a `TypeError` on the next line.

**What `extract_text()` cannot do:**
- Read text in images embedded in the PDF
- Read text in unusual fonts stored as paths/curves instead of characters
- Preserve complex multi-column layouts perfectly

**Better alternatives for text extraction quality:**

```python
# Option 1: PyMuPDF (fitz) — much better layout handling
import fitz
doc = fitz.open(pdf_path)
for page in doc:
    text = page.get_text()

# Option 2: pdfplumber — great for tables
import pdfplumber
with pdfplumber.open(pdf_path) as pdf:
    for page in pdf.pages:
        text = page.extract_text()
```

Both require additional `pip install` and (for PyMuPDF) a compiled C library.

---

### `if text.strip():`

**`str.strip()`** — removes all leading and trailing whitespace (spaces, tabs, newlines). Returns the cleaned string.

**Why we need this:** Some PDF pages contain only whitespace characters when extracted — blank separator pages, pages with only images, or pages where pypdf extracted formatting codes. A page with `text = "\n\n\n"` would pass the `or ""` check (it's not None), but `text.strip()` returns `""`, which is falsy — so we skip it.

**What happens if we don't skip empty pages?**

We'd store empty chunks in ChromaDB. These have embeddings that are semantically meaningless noise, which could slightly degrade retrieval quality. More importantly, they waste storage space.

---

### `pages.append({"page": i + 1, "text": text})`

**`i + 1`** — page numbers in PDF viewers start at 1, but Python's `enumerate` starts at 0. Adding 1 makes our page numbers match what the user sees in their PDF viewer.

**`{"page": ..., "text": ...}`** — a Python dictionary (key-value pairs). We store both the page number and the text together so we can attach accurate source citations to each chunk later.

**Alternative: a dataclass**

```python
from dataclasses import dataclass

@dataclass
class PageData:
    page: int
    text: str

# Usage
pages.append(PageData(page=i+1, text=text))
# Access: pages[0].page, pages[0].text
```

Dataclasses are more structured and give you autocomplete. We used plain dicts here to keep the code simpler for beginners.

---

## 5. Function: `chunk_text()`

```python
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
```

### Why chunk at all?

LLMs have a **context window** — a maximum amount of text they can read at once. `llama3.2:3b` has a context window of about 128,000 tokens (~100,000 words). While that sounds large, feeding an entire document into every query would be slow and expensive. Chunking also improves retrieval precision — a 1,000-character chunk about revenue is more specifically matched to a revenue question than a 100-page document.

---

### `chunk_size: int = 1000`

**Default: 1000 characters.** This is a hyperparameter — there is no single "right" value.

**How chunk size affects quality:**

| Chunk size | Effect |
|-----------|--------|
| Very small (100–200 chars) | High precision — each chunk is very focused. But a sentence might be split mid-thought, losing context. Many more chunks to store and retrieve. |
| Medium (500–1000 chars) ✅ used | Good balance. Enough context for the LLM to understand the chunk. |
| Large (2000–5000 chars) | Each chunk contains more context. But retrieval becomes less precise — a chunk about "revenue AND employee count AND strategy" matches many questions vaguely rather than one question precisely. |

**Note:** chunk size is in *characters*, not *words* or *tokens*. 1000 characters is roughly 150–200 words, or 250–300 tokens.

**Alternative — splitting by sentences or paragraphs:**

```python
# Split on sentence boundaries (requires nltk or spacy)
import nltk
sentences = nltk.sent_tokenize(text)
# Then group sentences into chunks of ~N tokens

# Split on paragraph boundaries (double newline)
paragraphs = text.split("\n\n")
```

Sentence-aware splitting produces more semantically coherent chunks. The downside is complexity and an extra dependency.

---

### `overlap: int = 200`

**Default: 200 characters.** The overlap is how many characters at the end of one chunk are repeated at the start of the next.

**Why overlap matters:**

```
Text: "...The CEO announced a profit of $5m. This exceeded expectations by 12%..."
                                          ↑
                               chunk boundary falls here

Without overlap:
  Chunk 1: "...The CEO announced a profit of $5m."
  Chunk 2: "This exceeded expectations by 12%..."
  → If asked "by how much did profit exceed expectations?", neither chunk alone
    has the full answer.

With overlap (200 chars):
  Chunk 1: "...The CEO announced a profit of $5m. This exceeded expectations..."
  Chunk 2: "...profit of $5m. This exceeded expectations by 12%..."
  → Both chunks have the complete information.
```

**Rule of thumb:** overlap should be 15–25% of chunk_size. Our 200/1000 = 20% is within this range.

**Tradeoff:** Overlap means storing the same text twice. With 20% overlap, you use about 20% more storage. For most use cases this is worth it.

---

### `while start < len(text):`

A `while` loop that continues as long as `start` is before the end of the text.

**Why `while` and not `for`?**

A `for` loop iterates over a fixed sequence. Here the step size changes based on `chunk_size - overlap`, and we need the loop to stop exactly at the end of the text. `while` with manual index management is cleaner for sliding windows.

---

### `end = min(start + chunk_size, len(text))`

`start + chunk_size` would be the ideal end position. But if that goes past the end of the text, `text[start:end]` would just stop at the end — no error, but we'd store the same incomplete chunk if we looped again.

`min(...)` ensures `end` never exceeds the text length. If we're near the end, `end = len(text)` and we capture the final fragment.

---

### `chunks.append(text[start:end])`

**`text[start:end]`** is Python string slicing — extracting a substring from index `start` up to (but not including) index `end`.

```python
text = "Hello, World!"
text[0:5]   # → "Hello"
text[7:12]  # → "World"
text[7:]    # → "World!"  (to the end)
text[:5]    # → "Hello"   (from start)
```

---

### `if end == len(text): break`

If `end` reached the last character, we've captured the final chunk and must stop. Without this `break`, `start` would advance to `start + chunk_size - overlap`, which is still less than `len(text)`, so the loop would run again and produce a duplicate small chunk.

---

### `start += chunk_size - overlap`

Move the window forward by `chunk_size - overlap`. With our defaults: `1000 - 200 = 800`. So:

```
Iteration 1: start=0,   end=1000  → chunk covers chars 0–999
Iteration 2: start=800, end=1800  → chunk covers chars 800–1799  (overlap: 800–999)
Iteration 3: start=1600, end=2600 → chunk covers chars 1600–2599 (overlap: 1600–1799)
```

---

### Alternative chunking strategies

```python
# Option 1: LangChain's RecursiveCharacterTextSplitter
# Splits on paragraphs, then sentences, then words — smarter boundaries
from langchain_text_splitters import RecursiveCharacterTextSplitter
splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
chunks = splitter.split_text(text)

# Option 2: Token-based chunking (more accurate for LLM context limits)
# Splits based on actual token count, not character count
import tiktoken
enc = tiktoken.get_encoding("cl100k_base")
tokens = enc.encode(text)
# Then slice tokens into groups of N

# Option 3: Semantic chunking
# Splits where the meaning changes (cosine distance between sentences drops)
# More complex but produces the most coherent chunks
```

Our simple character-based approach is chosen for zero external dependencies and predictable behaviour.

---

## 6. Class: `RAGEngine.__init__()`

```python
class RAGEngine:
    def __init__(
        self,
        chroma_path: str = "./chroma_db",
        llm_model: str = "llama3.2:3b",
        embedding_model: str = "all-MiniLM-L6-v2",
        chunk_size: int = 1000,
        chunk_overlap: int = 200,
        top_k: int = 5,
    ):
        self.llm_model = llm_model
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.top_k = top_k

        # ChromaDB client – data is saved to disk at `chroma_path`
        self.chroma = chromadb.PersistentClient(path=chroma_path)

        # Embedding function – sentence-transformers runs fully locally
        self.embed_fn = SentenceTransformerEmbeddingFunction(
            model_name=embedding_model
        )

        logger.info("RAGEngine ready | LLM: %s | embed: %s", llm_model, embedding_model)
```

### `class RAGEngine:`

Declares a class named `RAGEngine`. A **class** is a blueprint for creating objects. An object bundles data (state) and functions (methods) together. The `RAGEngine` object holds:

- The ChromaDB client
- The embedding function
- Configuration (model names, chunk size, top_k)

And knows how to:
- Ingest a PDF
- Answer a question
- List documents
- Delete a document

**Why use a class instead of plain functions?**

If we used plain functions, we'd have to pass the ChromaDB client and embedding function as arguments to *every* function call. The class stores these once at creation and makes them available to all methods automatically via `self`.

---

### Default parameter values

```python
def __init__(
    self,
    chroma_path: str = "./chroma_db",   # default storage location
    llm_model: str = "llama3.2:3b",     # default Ollama model
    embedding_model: str = "all-MiniLM-L6-v2",
    chunk_size: int = 1000,
    chunk_overlap: int = 200,
    top_k: int = 5,
):
```

Each parameter has a `= value` default. This means you can create a `RAGEngine` with no arguments and get sensible defaults:

```python
rag = RAGEngine()                          # all defaults
rag = RAGEngine(llm_model="llama3.1:8b")  # override just one
rag = RAGEngine(top_k=10, chunk_size=500) # override multiple
```

**Why are the defaults these specific values?**

| Parameter | Default | Why |
|-----------|---------|-----|
| `chroma_path` | `"./chroma_db"` | Relative to where you run the script — keeps data near the code |
| `llm_model` | `"llama3.2:3b"` | Runs on 8 GB RAM, good quality, widely available |
| `embedding_model` | `"all-MiniLM-L6-v2"` | ~90 MB, fast CPU inference, strong performance on semantic similarity |
| `chunk_size` | `1000` | ~150-200 words — enough context per chunk without being too broad |
| `chunk_overlap` | `200` | 20% of chunk_size — good overlap without excessive duplication |
| `top_k` | `5` | 5 chunks × ~1000 chars ≈ 5000 chars of context — fits comfortably in the LLM prompt |

---

### `self.llm_model = llm_model`

`self` is how a method refers to the object it belongs to. Assigning to `self.llm_model` stores the value as an **instance variable** — data that belongs to this specific object and persists for its entire lifetime.

**Why store `llm_model` but not `chroma_path` or `embedding_model`?**

`chroma_path` and `embedding_model` are only needed during `__init__` to set up the ChromaDB client and embedding function. We don't need them later — the client and function are stored instead. `llm_model`, `chunk_size`, `chunk_overlap`, and `top_k` are needed in other methods (`ingest_pdf`, `query`, `_retrieve`), so we store them.

---

### `self.chroma = chromadb.PersistentClient(path=chroma_path)`

**`chromadb.PersistentClient`** — creates a ChromaDB client that saves data to disk.

**The three ChromaDB client types:**

```python
# Option 1: PersistentClient ✅ used
# Data is saved to disk. Survives restarts.
client = chromadb.PersistentClient(path="./chroma_db")

# Option 2: EphemeralClient
# Data lives only in RAM. Disappears when the program exits.
# Useful for testing.
client = chromadb.EphemeralClient()

# Option 3: HttpClient
# Connects to a ChromaDB server running on a separate machine.
# For production deployments where multiple apps share one database.
client = chromadb.HttpClient(host="chroma-server.internal", port=8000)
```

`PersistentClient` is the right choice here: we want data to survive restarts, and we don't need a separate server.

**What does `path=chroma_path` create on disk?**

```
chroma_db/
  ├── chroma.sqlite3          ← metadata about collections
  └── <uuid>/                 ← binary files for one collection's vectors
        ├── data_level0.bin
        ├── header.bin
        ├── length.bin
        └── link_lists.bin
```

The `.sqlite3` file is a standard SQLite database. The binary files are the actual vector index (using a data structure called HNSW — Hierarchical Navigable Small World graphs — which is optimised for nearest-neighbour search).

---

### `self.embed_fn = SentenceTransformerEmbeddingFunction(model_name=embedding_model)`

**What this does:** Creates an object that, when called with a list of strings, returns a list of embedding vectors.

**What happens the first time this runs:**

The `sentence-transformers` library checks if the model file is cached locally. If not, it downloads it from HuggingFace (~90 MB for `all-MiniLM-L6-v2`). After that it uses the cached file.

**Passing `embed_fn` to ChromaDB vs calling it yourself:**

```python
# Option A: Pass to ChromaDB (what we do) ✅
# ChromaDB calls embed_fn automatically when you add or query documents
collection = client.get_or_create_collection(
    name="my_docs",
    embedding_function=embed_fn
)
collection.add(documents=["some text"])  # embed_fn called automatically

# Option B: Call embed_fn yourself and pass raw vectors
embeddings = embed_fn(["some text"])  # → [[0.21, -0.54, ...]]
collection.add(documents=["some text"], embeddings=embeddings)
```

Option A is cleaner. Option B gives more control — useful if you want to pre-compute embeddings in batches.

---

### `logger.info("RAGEngine ready | LLM: %s | embed: %s", llm_model, embedding_model)`

**`%s` formatting** — this is the old-style Python string formatting, but it is the recommended style for the `logging` module specifically.

**Why not f-strings for logging?**

```python
# f-string — always builds the string, even if logging is disabled
logger.debug(f"Processing {len(chunks)} chunks")  # wasteful if DEBUG is off

# % formatting — only builds the string if the message will actually be logged
logger.debug("Processing %d chunks", len(chunks))  # efficient
```

With `%` formatting, if the log level is set to INFO (so DEBUG messages are suppressed), Python never bothers building the debug string. This is a minor but genuine performance optimisation.

---

## 7. Method: `ingest_pdf()`

```python
def ingest_pdf(self, pdf_path: str, collection_name: Optional[str] = None) -> dict:
    path = Path(pdf_path)
    if not path.exists():
        raise FileNotFoundError(f"PDF not found: {pdf_path}")

    if not collection_name:
        collection_name = _sanitise_name(path.stem)

    logger.info("Ingesting '%s' → collection '%s'", path.name, collection_name)

    pages = load_pdf_pages(str(path))
    if not pages:
        raise ValueError("No extractable text found in the PDF (scanned image PDF?).")

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
```

---

### `path = Path(pdf_path)`

Converts the string path to a `Path` object. From this point we use `path` everywhere, giving us access to `.exists()`, `.stem`, `.name` etc.

---

### `if not path.exists(): raise FileNotFoundError(...)`

**`raise`** — throws an exception that stops execution and travels up the call stack until something `catches` it.

**Why raise here instead of returning an error dict?**

The calling code (`app.py`) wraps `ingest_pdf()` in a `try/except` block. By raising exceptions for different error types, we let the caller decide how to handle each case:

```python
# In app.py:
try:
    result = rag.ingest_pdf(save_path)
except FileNotFoundError as e:
    return _err(str(e), 404)   # HTTP 404
except ValueError as e:
    return _err(str(e), 422)   # HTTP 422 Unprocessable Entity
except Exception as e:
    return _err(str(e), 500)   # HTTP 500 Internal Server Error
```

This is the **separation of concerns** principle: `rag_engine.py` raises; `app.py` handles. The RAG engine doesn't need to know anything about HTTP status codes.

---

### `if not collection_name: collection_name = _sanitise_name(path.stem)`

**`path.stem`** — the filename without extension. `Path("annual_report_2024.pdf").stem` → `"annual_report_2024"`.

**`not collection_name`** — True if `collection_name` is `None`, `""`, or any other falsy value. This covers both "not provided" and "provided as empty string" in one check.

**`_sanitise_name()`** — called to clean the stem into a valid ChromaDB collection name. Explained in full in [Section 12](#12-utility-_sanitise_name).

---

### `all_ids, all_docs, all_meta = [], [], []`

**Multiple assignment** — Python lets you assign multiple variables in one line. This is equivalent to:
```python
all_ids  = []
all_docs = []
all_meta = []
```

We build three parallel lists that will be passed to ChromaDB together:
- `all_ids` — unique ID for each chunk
- `all_docs` — the text of each chunk
- `all_meta` — metadata dict for each chunk (source filename, page number)

**Why parallel lists instead of a list of dicts?**

ChromaDB's `.upsert()` method expects separate lists for `ids`, `documents`, and `metadatas`. This is by design — ChromaDB stores them in different internal structures optimised for their different uses.

---

### `for page_data in pages:`

Loops through all extracted pages. For each page, we chunk its text and add the resulting chunks to our three lists.

---

### `chunks = chunk_text(page_data["text"], self.chunk_size, self.chunk_overlap)`

Calls our chunking function with the page text. `self.chunk_size` and `self.chunk_overlap` were set in `__init__` from the constructor arguments (defaulting to 1000 and 200).

---

### `for chunk in chunks:`

For each chunk within a page, we generate its ID and collect its metadata.

---

### `all_ids.append(str(uuid.uuid4()))`

`uuid.uuid4()` generates a UUID object. `str(...)` converts it to a plain string like `"a3f2b1c4-8d9e-4f0a-b2c3-1d2e3f4a5b6c"`. ChromaDB requires string IDs.

---

### `all_meta.append({"source": path.name, "page": page_data["page"]})`

The metadata stored alongside each chunk. This is what powers the source citations in the UI.

**`path.name`** — the full filename including extension: `"annual_report_2024.pdf"`. Used as the "source" label in citations.

**`page_data["page"]`** — the 1-based page number. Used to tell the user which page to look at to verify the answer.

**You could store more metadata:**

```python
all_meta.append({
    "source":    path.name,
    "page":      page_data["page"],
    "chunk_idx": chunk_index,          # which chunk on this page
    "char_start": start_position,      # character position in original text
    "ingested_at": datetime.now().isoformat(),  # timestamp
})
```

More metadata = more filtering options. For example, you could filter by ingestion date, or highlight the exact position in the PDF. We keep it minimal here for simplicity.

---

### `collection = self.chroma.get_or_create_collection(...)`

**`get_or_create_collection`** — atomically either retrieves an existing collection with this name, or creates a new one. This makes re-ingesting the same PDF safe — you won't get duplicate collections.

**The `metadata` parameter:**

```python
metadata={"source_file": path.name, "total_pages": len(pages)}
```

This is **collection-level** metadata (about the whole document), separate from the **chunk-level** metadata stored with each individual chunk. It's what gets returned when you call `GET /documents` — the overall stats.

**What `embedding_function=self.embed_fn` does:**

Tells ChromaDB "whenever you need to embed text in this collection (on add or query), use this function." ChromaDB stores a reference to the embedding function and calls it automatically.

---

### `collection.upsert(ids=all_ids, documents=all_docs, metadatas=all_meta)`

**`upsert`** = update + insert. For each ID:
- If that ID already exists in the collection → update the record
- If it doesn't exist → insert a new record

**Why `upsert` instead of `add`?**

```python
# add() — fails with an error if any ID already exists
collection.add(ids=all_ids, documents=all_docs)   # ← raises DuplicateIDError

# upsert() — safe, idempotent
collection.upsert(ids=all_ids, documents=all_docs)  # ← always works
```

Using `upsert` makes re-uploading the same PDF safe. The old chunks are replaced by the new ones.

**What ChromaDB does internally during upsert:**

1. Calls `self.embed_fn(all_docs)` to get embeddings for all chunks (one batch call — efficient)
2. Stores each `(id, document_text, embedding, metadata)` tuple in its internal data structures
3. Updates the HNSW vector index for fast nearest-neighbour search

---

## 8. Method: `query()`

```python
def query(self, question: str, collection_name: Optional[str] = None) -> dict:
    question = question.strip()

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

    context_parts = [
        f"[Source: {c['source']}, Page {c['page']}]\n{c['text']}"
        for c in chunks
    ]
    context = "\n\n---\n\n".join(context_parts)

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
```

---

### `question = question.strip()`

Removes leading and trailing whitespace from the user's question. This handles accidental spaces or newlines from the UI (e.g., if the user typed a space before their question). A clean question produces better embeddings.

---

### `context_parts = [f"..." for c in chunks]`

This is a **list comprehension** — a concise way to build a list by transforming another list:

```python
# Long form:
context_parts = []
for c in chunks:
    context_parts.append(f"[Source: {c['source']}, Page {c['page']}]\n{c['text']}")

# List comprehension (same result, shorter):
context_parts = [
    f"[Source: {c['source']}, Page {c['page']}]\n{c['text']}"
    for c in chunks
]
```

Each element in `context_parts` is a formatted string containing the source label and the chunk text.

**Why include the source label in the context?**

```
[Source: annual_report.pdf, Page 12]
Revenue for Q3 was $7.3 million...
```

The LLM can see which page each piece of information came from. This means the LLM's generated answer can reference specific pages, and the answer will be more trustworthy because the model is anchored to specific sources.

---

### `context = "\n\n---\n\n".join(context_parts)`

**`str.join(list)`** — joins a list of strings with a separator between each.

```python
parts = ["Part A", "Part B", "Part C"]
"\n\n---\n\n".join(parts)
# → "Part A\n\n---\n\nPart B\n\n---\n\nPart C"
```

The `---` separator is a visual divider that helps the LLM understand where one chunk ends and another begins. Without it, chunks might blur together in the LLM's context.

---

### The prompt

```python
prompt = (
    "You are a helpful assistant that answers questions strictly based on "
    "the document excerpts provided below.\n"
    "If the answer cannot be found in the excerpts, respond with: "
    "\"I don't have enough information in the provided documents to answer this.\"\n\n"
    f"Document excerpts:\n{context}\n\n"
    f"Question: {question}\n\n"
    "Answer:"
)
```

**Prompt engineering** is the art of writing instructions that reliably get the LLM to behave the way you want. Every word matters.

Let's break it down:

| Part | Purpose |
|------|---------|
| `"You are a helpful assistant..."` | Sets the role/persona — LLMs respond better with a clear identity |
| `"...strictly based on the document excerpts"` | Prevents the LLM from using its training knowledge instead of your docs |
| `"If the answer cannot be found..."` | Gives the LLM a graceful way to say "I don't know" rather than hallucinating |
| `f"Document excerpts:\n{context}"` | The actual retrieved content |
| `f"Question: {question}"` | The user's question, clearly labelled |
| `"Answer:"` | The LLM continues from this token — telling it to write the answer immediately without preamble |

**Alternative prompt styles:**

```python
# More structured — uses XML tags (works well with some models)
prompt = f"""<context>
{context}
</context>

<question>{question}</question>

Answer based only on the context above. If unsure, say so."""

# Chain-of-thought — asks the LLM to reason step by step (better for complex questions)
prompt = f"""...(context)...

Question: {question}

Let's think step by step:"""

# Few-shot — includes example Q&A pairs to show the LLM the expected format
prompt = f"""...(context)...

Example:
Q: What is the company name?
A: According to page 1, the company is Acme Corp.

Q: {question}
A:"""
```

Prompt engineering is an active area of research. The right prompt depends on your model and use case.

---

### `response = ollama.chat(model=..., messages=[...])`

**`ollama.chat()`** sends a conversation to the Ollama server running locally.

**`messages`** is a list of conversation turns. Each turn has a `role`:
- `"user"` — something the user said
- `"assistant"` — something the AI said in a previous turn
- `"system"` — background instructions (supported by some models)

We send only one turn (the full prompt as a user message). For a multi-turn chatbot that remembers previous exchanges, you'd append previous messages:

```python
messages = [
    {"role": "user",      "content": "What is the revenue?"},
    {"role": "assistant", "content": "Revenue was $7.3m."},
    {"role": "user",      "content": "What about Q4?"},   # follow-up
]
```

**`response.message.content`** — the generated text. The `response` object from `ollama.chat()` is a Pydantic model (a structured data object), not a plain dictionary. That's why we use dot notation (`.message.content`) rather than `["message"]["content"]`.

---

### `raise RuntimeError(...) from e`

**`raise ... from e`** — the `from e` part creates an **exception chain**. If this `RuntimeError` is ever caught and printed, it will also show the original `Exception e` that caused it. This preserves the full error trail for debugging.

---

## 9. Method: `list_documents()`

```python
def list_documents(self) -> list[dict]:
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
```

### `self.chroma.list_collections()`

Returns all collections in the ChromaDB database. Each item in the returned list has a `.name` and `.metadata` attribute.

### Why call `get_collection()` separately from `list_collections()`?

`list_collections()` returns lightweight collection objects with just the name and metadata. To get the actual count of items, we need to call `get_collection()` which opens a full connection to that collection and lets us call `.count()`.

### `c.count()`

Returns the total number of chunks stored in this collection. The frontend displays this as "87 chunks" under each document name.

### `col.metadata or {}`

`col.metadata` might be `None` if the collection was created without any metadata (e.g., by a different version of this code). The `or {}` ensures we always return a dictionary, never `None`. This prevents a `TypeError` if the frontend tries to access `metadata.source_file`.

### The `try/except` inside the loop

If one collection is corrupted or inaccessible, the loop continues to the next one instead of crashing entirely. A `WARNING` is logged so the issue is visible but the response still returns the healthy collections.

---

## 10. Method: `delete_document()`

```python
def delete_document(self, collection_name: str) -> bool:
    try:
        self.chroma.delete_collection(name=collection_name)
        logger.info("Deleted collection '%s'", collection_name)
        return True
    except Exception as e:
        logger.error("Delete failed for '%s': %s", collection_name, e)
        return False
```

### `return True` / `return False`

This method returns a boolean instead of raising an exception on failure. The caller (`app.py`) checks the return value:

```python
deleted = rag.delete_document(collection_name)
if deleted:
    return jsonify({"message": f"Collection deleted."}), 200
return _err(f"Collection not found.", 404)
```

**Why return bool here but raise exceptions in `ingest_pdf()`?**

Deletion failure is a simple yes/no result — the collection either existed and was deleted, or it didn't exist. There's only one failure mode. `ingest_pdf()` has multiple failure modes (file not found, no text extractable, ChromaDB error) that the caller needs to distinguish between.

### `self.chroma.delete_collection(name=collection_name)`

Permanently removes the collection and all its stored vectors from ChromaDB. This cannot be undone. The uploaded PDF file in `./uploads/` is *not* deleted — only the embeddings and chunks are removed from ChromaDB.

---

## 11. Method: `_retrieve()`

```python
def _retrieve(self, query: str, collection_name: Optional[str]) -> list[dict]:
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
                "distance": (
                    res["distances"][0][i]
                    if "distances" in res else None
                ),
            })

    if results and results[0]["distance"] is not None:
        results.sort(key=lambda x: x["distance"])
    return results[: self.top_k]
```

---

### The leading underscore: `_retrieve`

By convention, a method or function starting with `_` is **private** — it is intended for internal use within the class, not called from outside. Python does not enforce this (you *can* call it from outside), but it signals to other developers "this is an implementation detail, not part of the public API."

---

### Two-path logic: one collection vs. all

```python
if collection_name:
    cols = [self.chroma.get_collection(name=collection_name, ...)]
else:
    cols = [self.chroma.get_collection(name=c.name, ...) for c in self.chroma.list_collections()]
```

- If the user selected a specific document, we search only that one collection.
- If `collection_name` is `None` (user chose "All Documents"), we get every collection and search them all.

**The "All Documents" fan-out pattern:**

When querying across all collections, we loop through each one, query it individually, then merge and re-sort the results. This is called a **scatter-gather** or **fan-out** pattern. An alternative would be to merge all chunks into one giant collection — but that would lose the ability to search a specific document.

---

### `n = min(self.top_k, col.count())`

**Why the `min`?** If a collection has only 3 chunks but `top_k` is 5, ChromaDB would throw an error if we asked for 5 results. `min(5, 3)` = 3, so we ask for at most as many results as exist.

---

### `res = col.query(query_texts=[query], n_results=n)`

**`col.query()`** — the core of the whole system. ChromaDB:
1. Calls `self.embed_fn([query])` to embed the question
2. Searches the HNSW vector index for the `n` nearest vectors
3. Returns the matching documents, metadata, and distances

**Why is `query_texts` a list?** ChromaDB supports batching — you can query multiple texts at once. We only query one at a time, so it's a single-item list: `[query]`.

**The response structure:**

```python
res = {
    "documents": [["chunk text 1", "chunk text 2", ...]],  # ← nested list
    "metadatas": [[{"source": "...", "page": 3}, ...]],    # ← nested list
    "distances": [[0.12, 0.24, ...]],                       # ← nested list
    "ids":       [["uuid1", "uuid2", ...]],                 # ← nested list
}
```

Each value is a **list of lists** because ChromaDB supports batch queries. Since we send one query at a time, we always take `[0]` — the first (and only) result set.

---

### `res["metadatas"][0][i].get("source", "unknown")`

**`.get("source", "unknown")`** — dictionary's `.get()` method. Returns the value for key `"source"` if it exists, or `"unknown"` if the key is missing. This is safer than `["source"]` which would throw a `KeyError` if the key isn't there (e.g., for collections created by old code without metadata).

---

### `"distances" in res`

A safety check — older versions of ChromaDB didn't always return distances. `in` checks whether a key exists in the dictionary.

---

### `results.sort(key=lambda x: x["distance"])`

**`list.sort(key=...)`** — sorts the list in-place (modifies the original list, returns `None`).

**`key=lambda x: x["distance"]`** — the `key` parameter specifies *what to sort by*. `lambda x: x["distance"]` is an **anonymous function** that takes one item `x` and returns `x["distance"]`. Python sorts the list by these values.

```python
# Equivalent non-lambda version
def get_distance(item):
    return item["distance"]

results.sort(key=get_distance)
```

Sorting is ascending by default (lowest distance first), which is what we want — lowest distance = most similar = most relevant.

**Why sort after merging all collections?**

When searching across multiple collections, each collection returns its own top-K results. But "top 5 from collection A" plus "top 5 from collection B" = 10 results, and we need to re-rank them globally to find the overall best 5.

---

### `return results[: self.top_k]`

**Slice notation** — `list[:n]` returns the first `n` items. After the global sort, we take only the top `top_k` most relevant results to send to the LLM.

**Why limit to top_k?** Sending too much context to the LLM:
- Uses more of the context window (limited resource)
- Can confuse the model with loosely relevant information
- Slows down the response

5 high-quality chunks almost always produce a better answer than 20 mediocre ones.

---

## 12. Utility: `_sanitise_name()`

```python
def _sanitise_name(name: str) -> str:
    """
    Make a string safe for use as a ChromaDB collection name.
    ChromaDB requires: 3-63 chars, alphanumeric + hyphens/underscores,
    must start and end with alphanumeric.
    """
    sanitised = "".join(
        c if c.isalnum() or c in "-_" else "_" for c in name.lower()
    )
    if sanitised and not sanitised[0].isalpha():
        sanitised = "doc_" + sanitised
    sanitised = sanitised[:60] or "document"
    return sanitised
```

### Why is this needed?

ChromaDB has strict rules for collection names (similar to variable names or database table names). A PDF could be named anything: `"Q3 Report (Final v2).pdf"` with spaces, parentheses, and dots. These characters are not allowed in collection names.

**ChromaDB collection name rules:**
- 3 to 63 characters long
- Only letters, numbers, hyphens (`-`), and underscores (`_`)
- Must start and end with a letter or number

---

### `"".join(c if c.isalnum() or c in "-_" else "_" for c in name.lower())`

This is a **generator expression** inside `"".join()`.

Breaking it down:

```python
name.lower()
# "Q3 Report (Final v2)" → "q3 report (final v2)"

# For each character c in the lowercased name:
c if c.isalnum() or c in "-_" else "_"
# "q" → "q"   (isalnum = True)
# "3" → "3"   (isalnum = True)
# " " → "_"   (space is not alnum or -_)
# "r" → "r"
# "(" → "_"   (not allowed)
# ...

"".join(...)
# → "q3_report__final_v2_"
```

**`str.isalnum()`** — returns `True` if the character is a letter (a-z, A-Z, any Unicode letter) or a digit (0-9).

**`c in "-_"`** — True if c is a hyphen or underscore (the two non-alphanumeric characters ChromaDB allows).

---

### `if sanitised and not sanitised[0].isalpha(): sanitised = "doc_" + sanitised`

ChromaDB requires the name to start with a letter (not a number or underscore). A PDF named `"2024_report.pdf"` would produce `"2024_report"` which starts with a digit — invalid.

`not sanitised[0].isalpha()` — True if the first character is NOT a letter. In that case, we prepend `"doc_"` to make it valid: `"doc_2024_report"`.

**`sanitised and ...`** — we check `sanitised` is not empty before accessing `[0]`, otherwise we'd get an `IndexError`.

---

### `sanitised = sanitised[:60] or "document"`

`sanitised[:60]` — clamp the name to 60 characters (ChromaDB's maximum is 63; we use 60 to leave room if we ever need to add a suffix).

`or "document"` — if after all sanitisation the string is empty (e.g., the original name was `"!!!"` — all special characters), fall back to the generic name `"document"`.

---

## 13. The Whole Picture

Here is every component of `rag_engine.py` shown together with their relationships:

```
rag_engine.py
│
├── load_pdf_pages(pdf_path)
│     └── pypdf.PdfReader → page text dicts
│
├── chunk_text(text, chunk_size, overlap)
│     └── sliding window → list of overlapping strings
│
├── _sanitise_name(name)
│     └── string cleaning → valid ChromaDB collection name
│
└── class RAGEngine
      │
      ├── __init__(chroma_path, llm_model, embedding_model, chunk_size, chunk_overlap, top_k)
      │     ├── chromadb.PersistentClient     → self.chroma
      │     └── SentenceTransformerEmbeddingFunction → self.embed_fn
      │
      ├── ingest_pdf(pdf_path, collection_name)
      │     ├── calls load_pdf_pages()
      │     ├── calls chunk_text()
      │     ├── generates uuid4 IDs
      │     ├── self.chroma.get_or_create_collection()
      │     └── collection.upsert(ids, documents, metadatas)
      │                             ↑
      │                  embed_fn called automatically by ChromaDB
      │
      ├── query(question, collection_name)
      │     ├── calls self._retrieve()
      │     ├── builds prompt string
      │     ├── ollama.chat(model, messages)
      │     └── returns {answer, sources, model}
      │
      ├── _retrieve(query, collection_name)
      │     ├── gets ChromaDB collection(s)
      │     ├── col.query(query_texts=[query], n_results=n)
      │     │              ↑
      │     │   embed_fn called automatically by ChromaDB
      │     ├── merges results from multiple collections
      │     └── sorts by distance, returns top_k
      │
      ├── list_documents()
      │     └── self.chroma.list_collections() + c.count()
      │
      └── delete_document(collection_name)
            └── self.chroma.delete_collection()
```

### The key design choices summarised

| Choice | What we use | Why | Main alternative |
|--------|------------|-----|-----------------|
| PDF parsing | `pypdf` | Pure Python, simple API | `PyMuPDF` for better quality |
| Chunking | Character-based with overlap | No dependencies, predictable | Sentence-aware (LangChain splitter) |
| Embeddings | `all-MiniLM-L6-v2` | Fast, local, 90 MB | `all-mpnet-base-v2` for quality |
| Vector DB | ChromaDB PersistentClient | No server needed, saves to disk | Qdrant for production |
| LLM | Ollama chat | Simple, local, any model | `llama-cpp-python` (no Ollama server) |
| IDs | `uuid4` | Globally unique | Content hash (but risks collisions) |
| Storage | Three parallel lists | Matches ChromaDB's API | List of dicts |
| Error handling | Raise in ingest, bool in delete | Matches caller's needs | Uniform exception pattern |

---

**[← Back to Docs Index](./README.md)**
