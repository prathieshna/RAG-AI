# 5. The API

This document explains what an API is, how Flask implements one, and exactly what each endpoint in this project does.

---

## What Is an API?

**API** stands for **Application Programming Interface**.

An interface is a way for two things to talk to each other. The buttons on a TV remote are an interface between you and the TV. An API is the same idea, but between two software programs.

### The restaurant analogy

Imagine a restaurant:
- **You** are the browser (the client)
- **The kitchen** is the Flask server (where the real work happens)
- **The waiter** is the API

You don't walk into the kitchen and cook your own food. You give your order to the waiter in a specific format ("one burger, please"), and the waiter brings back the result. The waiter defines the rules: what orders are accepted, how to place them, and how food comes back.

An API is the same: it defines the rules for what requests are accepted, in what format, and what responses come back.

---

## What Is HTTP?

HTTP (**HyperText Transfer Protocol**) is the language that browsers and servers use to communicate. It's the same language your browser uses to load a web page.

An HTTP request has:
- **A method** — what you want to do:
  - `GET` — retrieve information ("get me the list of documents")
  - `POST` — send data to create or do something ("here is a PDF to process")
  - `DELETE` — remove something ("delete this document")
- **A path** — which resource you want (`/upload`, `/documents`, `/query`)
- **A body** (for POST) — the data you are sending (the PDF file, or a JSON question)

An HTTP response has:
- **A status code** — a number indicating success or failure:
  - `200 OK` — everything worked
  - `400 Bad Request` — you sent something invalid
  - `404 Not Found` — that resource doesn't exist
  - `500 Internal Server Error` — something broke on the server
- **A body** — the data coming back (usually JSON in this project)

---

## What Is JSON?

**JSON** (**JavaScript Object Notation**) is the most common format for sending data between a server and a browser. It looks like this:

```json
{
  "question": "What is the revenue?",
  "collection_name": "annual_report"
}
```

It's just text, organised as key-value pairs inside curly braces. Both Python and JavaScript can easily read and write it.

---

## What Is Flask?

**Flask** is a Python library for building web servers. It lets you write a Python function and say "call this function whenever someone sends a request to this URL".

```python
@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})
```

- `@app.route("/health", methods=["GET"])` — this is a **decorator**, a Python way of attaching metadata to a function. It tells Flask: "when you receive a GET request for the path `/health`, call the `health()` function."
- `jsonify(...)` — converts a Python dictionary to a JSON response

Flask handles all the low-level networking. You just write the functions.

---

## The 5 Endpoints

### 1. `GET /health`

**Purpose:** Check that the Flask server is alive and what model it's using.

**Request:**
```bash
curl http://localhost:5001/health
```
No body needed for GET requests.

**Response (200 OK):**
```json
{
  "status": "ok",
  "llm_model": "llama3.2:3b",
  "embed_model": "all-MiniLM-L6-v2"
}
```

**Used for:** Checking the server is running before making other requests. The frontend could use this to display a connection status indicator.

---

### 2. `POST /upload`

**Purpose:** Upload a PDF file and ingest it into ChromaDB.

**Request format:** `multipart/form-data` — this is the format browsers use to send files. It's different from JSON.

```bash
curl -X POST http://localhost:5001/upload \
  -F "file=@/path/to/my_report.pdf" \
  -F "collection_name=my_report"   # optional
```

- `-F "file=@..."` — sends the file under the field name `"file"`
- `-F "collection_name=..."` — optional custom name for the collection

**What Flask does:**
1. Checks that a file was provided and that it's a `.pdf`
2. Sanitises the filename and saves it to `./uploads/`
3. Calls `rag.ingest_pdf()` to process it
4. Returns the result

**Response (200 OK):**
```json
{
  "message": "PDF ingested successfully.",
  "collection_name": "my_report",
  "filename": "my_report.pdf",
  "pages_extracted": 15,
  "chunks_stored": 112
}
```

**Error responses:**
- `400` — no file, wrong format
- `422` — file has no extractable text
- `500` — something went wrong during ingestion

---

### 3. `POST /query`

**Purpose:** Ask a question and get an answer from the RAG pipeline.

**Request format:** JSON

```bash
curl -X POST http://localhost:5001/query \
  -H "Content-Type: application/json" \
  -d '{
    "question": "What were the main findings?",
    "collection_name": "my_report"
  }'
```

- `"question"` — required; your natural-language question
- `"collection_name"` — optional; if omitted, searches across all uploaded documents

**What Flask does:**
1. Validates the request has a `question` field
2. Calls `rag.query(question, collection_name)`
3. Returns the answer

**Response (200 OK):**
```json
{
  "answer": "According to the document, the main findings were...",
  "model": "llama3.2:3b",
  "sources": [
    {
      "text": "The study found that 73% of participants...",
      "source": "my_report.pdf",
      "page": 7,
      "collection": "my_report",
      "distance": 0.18
    },
    {
      "text": "Further analysis revealed...",
      "source": "my_report.pdf",
      "page": 8,
      "collection": "my_report",
      "distance": 0.24
    }
  ]
}
```

The `distance` field is the mathematical similarity score. Lower = more similar to the question. The frontend converts this to a percentage: `(1 - distance/2) × 100`.

**Error responses:**
- `400` — no question provided
- `503` — Ollama is not running

---

### 4. `GET /documents`

**Purpose:** List all document collections currently stored in ChromaDB.

**Request:**
```bash
curl http://localhost:5001/documents
```

**Response (200 OK):**
```json
{
  "documents": [
    {
      "collection_name": "my_report",
      "chunk_count": 112,
      "metadata": {
        "source_file": "my_report.pdf",
        "total_pages": 15
      }
    },
    {
      "collection_name": "annual_2024",
      "chunk_count": 87,
      "metadata": {
        "source_file": "annual_2024.pdf",
        "total_pages": 10
      }
    }
  ]
}
```

**Used for:** Populating the sidebar in the UI with the list of available documents.

---

### 5. `DELETE /documents/<collection_name>`

**Purpose:** Remove a document collection (and all its embeddings) from ChromaDB.

```bash
curl -X DELETE http://localhost:5001/documents/my_report
```

The `<collection_name>` is part of the URL itself (not in the body). Flask extracts it as a parameter:

```python
@app.route("/documents/<collection_name>", methods=["DELETE"])
def delete_document(collection_name: str):
    ...
```

**Response (200 OK):**
```json
{
  "message": "Collection 'my_report' deleted."
}
```

**Response (404 Not Found):**
```json
{
  "error": "Collection 'my_report' not found."
}
```

---

## How the Frontend Connects to Flask

The browser runs on `http://localhost:3000` (Next.js). Flask runs on `http://localhost:5001`. These are different ports, so the browser's security rules would normally block direct connections between them.

The solution is the **proxy** in `next.config.mjs`:

```
Browser sends:  POST http://localhost:3000/api/query
                    ↓ (Next.js server intercepts this internally)
Next.js forwards: POST http://localhost:5001/query
                    ↓
Flask handles it and sends back a response
                    ↓
Next.js passes the response back to the browser
```

The browser never knows Flask exists — it only ever talks to the Next.js server. This is called a **reverse proxy**.

---

## Trying the API Yourself

You can test each endpoint directly using `curl` (built into macOS and Linux, available on Windows via PowerShell or Git Bash). This is useful for debugging.

```bash
# Is the server up?
curl http://localhost:5001/health

# What documents do I have?
curl http://localhost:5001/documents

# Upload a PDF
curl -X POST http://localhost:5001/upload -F "file=@report.pdf"

# Ask a question
curl -X POST http://localhost:5001/query \
  -H "Content-Type: application/json" \
  -d '{"question": "What is the conclusion?"}'

# Delete a document
curl -X DELETE http://localhost:5001/documents/report
```

---

**Next: [The Frontend →](./06-the-frontend.md)**
