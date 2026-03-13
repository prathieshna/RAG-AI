# 3. How It Works — Step by Step

This document walks through the exact journey of a PDF being uploaded and a question being answered. We trace every step from the moment you click "Upload" to the moment you see the answer.

---

## Phase 1: Uploading a PDF (Ingestion)

This is a one-time process per document. After this phase is complete, the PDF content is permanently stored in ChromaDB and you can ask as many questions as you want without re-uploading.

### Step 1 — You click "Upload PDF" in the browser

The browser sends an HTTP request to the Flask API with the PDF file attached. This is the same kind of request your browser makes when you upload a photo to a website.

```
Browser → POST /upload (with PDF file) → Flask API
```

### Step 2 — Flask saves the file

Flask receives the file and saves it to the `./uploads/` folder on disk. The filename is sanitised first to remove any characters that could cause security problems (e.g., someone trying to send a file named `../../secret.txt`).

```
uploads/
  └── my_report.pdf   ← saved here
```

### Step 3 — Extract text from the PDF

The Python library `pypdf` opens the PDF and reads the text from every page, one page at a time. It returns something like:

```python
[
  {"page": 1, "text": "Executive Summary\nThis report covers..."},
  {"page": 2, "text": "Chapter 1: Introduction\nOur company was founded..."},
  ...
]
```

> **Important limitation:** `pypdf` reads the *text layer* of a PDF. If your PDF was created by scanning a physical document (a photo of a page), there may be no text layer — only an image. In that case, no text will be extracted. The solution is to use a tool called `ocrmypdf` to add a text layer first.

### Step 4 — Split text into chunks

Each page's text is fed through the chunking function, which splits it into overlapping pieces of 1,000 characters with a 200-character overlap.

A 15-page document might become 112 chunks.

```
Page 1 text (2,400 chars)
  → Chunk 1 (chars 1–1000)
  → Chunk 2 (chars 801–1800)   ← 200 char overlap with chunk 1
  → Chunk 3 (chars 1601–2400)  ← 200 char overlap with chunk 2

Page 2 text...
  → Chunk 4 ...
```

Along with each chunk's text, we store **metadata**: which file it came from and which page number.

### Step 5 — Embed each chunk

The `sentence-transformers` library runs each chunk through the `all-MiniLM-L6-v2` model and converts it to a list of 384 numbers (an embedding). This captures the *meaning* of the chunk.

```
Chunk 1: "Executive Summary. This report covers fiscal year 2024..."
    ↓  all-MiniLM-L6-v2
[0.21, -0.54, 0.89, 0.12, -0.33, 0.71, ...]  ← 384 numbers
```

This step runs on your CPU and takes a few seconds for a typical document.

### Step 6 — Store in ChromaDB

Each chunk (its text, its embedding, and its metadata) is stored in ChromaDB in a **collection** named after the PDF file.

```
ChromaDB
  └── collection: "my_report"
        ├── chunk_001: text="Executive Summary...", embedding=[0.21, ...], page=1
        ├── chunk_002: text="Chapter 1 Introduction...", embedding=[0.41, ...], page=2
        └── ...
```

ChromaDB saves everything to the `./chroma_db/` folder on disk. This means the data survives restarts — you don't need to re-upload the PDF next time.

### Step 7 — Flask returns a success response

Flask sends back a JSON response telling you how many pages and chunks were stored.

```json
{
  "message": "PDF ingested successfully.",
  "collection_name": "my_report",
  "pages_extracted": 15,
  "chunks_stored": 112
}
```

The sidebar in the UI updates to show the new document.

---

## Phase 2: Asking a Question (Query)

This happens every time you type a question and press Send.

### Step 1 — You type a question and press Send

The browser sends an HTTP request to Flask with your question as JSON.

```
Browser → POST /query {"question": "What was the Q3 revenue?"} → Flask
```

### Step 2 — Embed the question

Your question is converted to an embedding using the same `all-MiniLM-L6-v2` model. This puts your question in the same "meaning space" as the stored chunks.

```
"What was the Q3 revenue?"
    ↓  all-MiniLM-L6-v2
[0.31, -0.42, 0.71, ...]  ← 384 numbers
```

### Step 3 — Semantic search in ChromaDB

ChromaDB compares your question's embedding to every stored chunk embedding and finds the 5 most similar chunks (the ones with the smallest mathematical distance between their vectors).

```
Question embedding: [0.31, -0.42, 0.71, ...]

Distance to chunk_045 "Revenue for Q3 was $7.3m...":  0.12  ← very similar ✓
Distance to chunk_088 "We hired 50 new employees...":  1.43  ← very different ✗
Distance to chunk_003 "Net income for fiscal Q3...":   0.18  ← quite similar ✓
```

The top 5 most similar chunks are retrieved.

### Step 4 — Build the prompt

The 5 retrieved chunks are assembled into a context block, and a structured prompt is built:

```
You are a helpful assistant that answers questions strictly based on
the document excerpts provided below.
If the answer cannot be found, say "I don't have enough information."

Document excerpts:
[Source: my_report.pdf, Page 12]
Revenue for Q3 was $7.3 million, representing a 12% increase...

---

[Source: my_report.pdf, Page 13]
Net income for fiscal Q3 reached a record high of $2.1 million...

---
... (3 more chunks)

Question: What was the Q3 revenue?

Answer:
```

The key instruction is: **answer only using the provided excerpts**. This prevents the LLM from guessing or hallucinating.

### Step 5 — Send the prompt to Ollama

The Python `ollama` library sends this prompt to the Ollama application running in the background on your machine. Ollama loads the `llama3.2:3b` model and processes the prompt.

```
Python code → Ollama (running locally) → llama3.2:3b model → answer text
```

This is the step that takes the most time — a few seconds depending on your hardware. The model is reading the context and writing a response.

### Step 6 — Return the answer

Flask packages the answer text and the source chunks into a JSON response and sends it back to the browser.

```json
{
  "answer": "According to the document, Q3 revenue was $7.3 million, which represents a 12% increase over the previous period.",
  "model": "llama3.2:3b",
  "sources": [
    {
      "text": "Revenue for Q3 was $7.3 million...",
      "source": "my_report.pdf",
      "page": 12,
      "distance": 0.12
    },
    ...
  ]
}
```

### Step 7 — Display in the UI

The Next.js frontend receives the response and:
1. Shows the answer in a chat bubble
2. Shows a collapsible "Sources" section below the answer listing the page numbers and excerpts that were used

---

## The Complete Flow in One Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  INGESTION (once per PDF)                                       │
│                                                                 │
│  PDF file → pypdf → page text → chunker → 1000-char chunks     │
│                                               │                 │
│                                    sentence-transformers        │
│                                               │                 │
│                                    384-number embeddings        │
│                                               │                 │
│                                          ChromaDB               │
│                                    (saved to ./chroma_db/)      │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  QUERYING (every question)                                      │
│                                                                 │
│  Question text → sentence-transformers → question embedding     │
│                                               │                 │
│                              ChromaDB similarity search         │
│                                               │                 │
│                              top 5 most relevant chunks         │
│                                               │                 │
│                        Prompt = instruction + chunks + question │
│                                               │                 │
│                              Ollama (local LLM)                 │
│                                               │                 │
│                              Answer text + source citations     │
│                                               │                 │
│                              Displayed in the browser UI        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Why Does This Work So Well?

The magic comes from the combination:

1. **Embeddings** ensure that the right chunks are found even if the question uses different words than the document.
2. **The LLM** can understand the context of the retrieved chunks and synthesise a clear, fluent answer — it doesn't just copy-paste the raw text.
3. **The prompt instruction** ("answer only from the provided text") keeps the LLM honest and prevents it from inventing information.
4. **Source citations** let you verify the answer by checking the original page.

---

## What Happens When You Delete a Document?

Deleting a document removes its entire ChromaDB collection — all the stored chunks and embeddings for that PDF. The uploaded PDF file in `./uploads/` is not deleted (you might want to re-ingest it later), but nothing from it can be found in future queries.

---

**Next: [The Code Explained →](./04-the-code-explained.md)**
