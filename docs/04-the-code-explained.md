# 4. The Code Explained

This document walks through every important file in the project and explains what each part does in plain English. You don't need to know how to program to follow along — just think of code as very precise instructions.

---

## Project File Map

```
ai-rag-chatbot/
│
├── rag_engine.py      ← The RAG brain: ingestion and querying logic
├── app.py             ← The Flask web server: exposes the API
├── requirements.txt   ← List of Python libraries to install
│
├── frontend/
│   ├── app/page.tsx           ← The main web page (manages shared state)
│   ├── components/Sidebar.tsx ← Left panel: documents + upload
│   ├── components/Chat.tsx    ← Right panel: conversation
│   └── lib/api.ts             ← How the frontend talks to Flask
│
└── scripts/
    ├── setup.sh / setup.ps1   ← Install everything
    └── start.sh / start.ps1   ← Start everything
```

---

## `rag_engine.py` — The Core Logic

This is the most important file. It contains all the AI logic.

### The `RAGEngine` class

A **class** is a blueprint for creating an object. Think of it like a recipe card — the class defines what the cook (the object) knows how to do.

```python
class RAGEngine:
    def __init__(self, chroma_path, llm_model, embedding_model, ...):
```

`__init__` is the setup method — it runs once when the engine is created. It does four things:

**1. Connects to ChromaDB**
```python
self.chroma = chromadb.PersistentClient(path=chroma_path)
```
Opens a connection to the ChromaDB database folder on disk. `Persistent` means data is saved between restarts (as opposed to an in-memory database that disappears when the program closes).

**2. Loads the embedding model**
```python
self.embed_fn = SentenceTransformerEmbeddingFunction(model_name=embedding_model)
```
Loads the `all-MiniLM-L6-v2` model into memory. The first time this runs, it downloads the model from the internet (~90 MB). After that, it uses the cached version.

**3. Stores settings**
```python
self.llm_model = llm_model     # which Ollama model to use
self.chunk_size = chunk_size   # how large each chunk is
self.chunk_overlap = chunk_overlap
self.top_k = top_k             # how many chunks to retrieve per query
```

---

### The `load_pdf_pages()` function

```python
def load_pdf_pages(pdf_path: str) -> list[dict]:
    reader = pypdf.PdfReader(pdf_path)
    pages = []
    for i, page in enumerate(reader.pages):
        text = page.extract_text() or ""
        if text.strip():
            pages.append({"page": i + 1, "text": text})
    return pages
```

Line by line:
- `pypdf.PdfReader(pdf_path)` — opens the PDF file
- `for i, page in enumerate(reader.pages)` — loops through every page (enumerate gives us the page number)
- `page.extract_text()` — reads the text off the page
- `if text.strip()` — skip pages with no text (blank pages, image-only pages)
- We build a list of dictionaries, one per page: `{"page": 1, "text": "..."}`

---

### The `chunk_text()` function

```python
def chunk_text(text: str, chunk_size: int = 1000, overlap: int = 200) -> list[str]:
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

This is a sliding window over the text:
- Start at position 0
- Cut a chunk from position `start` to `start + 1000`
- Move the starting position forward by `1000 - 200 = 800` (not 1000, so we get a 200-char overlap)
- Repeat until the end of the text
- `text[start:end]` is Python's way of slicing a string — like cutting a strip off a piece of paper

---

### The `ingest_pdf()` method

```python
def ingest_pdf(self, pdf_path: str, collection_name: str = None) -> dict:
```

This is the function that gets called when you upload a PDF. It orchestrates all the steps:

1. **Load pages** — calls `load_pdf_pages()`
2. **Chunk pages** — calls `chunk_text()` on each page's text
3. **Generate unique IDs** — each chunk needs a unique identifier (`uuid.uuid4()` generates a random ID like `a3f2-...`)
4. **Store in ChromaDB** — calls `collection.upsert()` with all the chunks

```python
collection = self.chroma.get_or_create_collection(
    name=collection_name,
    embedding_function=self.embed_fn,
)
collection.upsert(ids=all_ids, documents=all_docs, metadatas=all_meta)
```

`get_or_create_collection` — if a collection with this name already exists, use it; otherwise create a new one. This makes it safe to re-upload the same PDF.

`upsert` — a combination of "update" and "insert". If a record with this ID exists, update it; otherwise insert it. Behind the scenes, ChromaDB calls our embedding function on each document and stores the resulting numbers alongside the text.

---

### The `query()` method

```python
def query(self, question: str, collection_name: str = None) -> dict:
```

1. **Retrieve chunks** — calls `self._retrieve()` to find the top-K most relevant chunks
2. **Build context** — joins the chunks into a single text block with source labels
3. **Build the prompt** — a carefully worded instruction that tells the LLM to answer only using the provided context
4. **Call Ollama**:

```python
response = ollama.chat(
    model=self.llm_model,
    messages=[{"role": "user", "content": prompt}],
)
answer = response.message.content
```

`ollama.chat()` sends a chat message to the Ollama server running on your machine. `messages` is a list of turns in the conversation — here we only have one user turn (the prompt). The response object has a `.message.content` attribute containing the LLM's answer text.

5. **Return** the answer, source chunks, and model name as a dictionary.

---

### The `_retrieve()` method

```python
def _retrieve(self, query: str, collection_name: str = None) -> list[dict]:
```

The underscore at the start (`_retrieve`) is a Python convention meaning "this is an internal helper, not for outside use."

This method:
1. Decides which collections to search (one specific one, or all of them)
2. For each collection, runs:

```python
res = col.query(query_texts=[query], n_results=n)
```

This is where ChromaDB does the semantic search. It:
- Runs the query text through the embedding function to get its vector
- Finds the `n` stored vectors that are mathematically closest
- Returns the matching documents, their metadata, and their distance scores

3. Sorts results by distance (ascending — lower distance = more similar)
4. Returns the top `top_k` results

---

## `app.py` — The Web Server

This file makes the RAG engine accessible over the network via HTTP. It's like a reception desk — it receives incoming requests, passes them to the right department, and sends back the response.

### Startup

```python
rag = RAGEngine(
    chroma_path=CHROMA_DB_PATH,
    llm_model=LLM_MODEL,
    embedding_model=EMBED_MODEL,
)
```

When Flask starts, it creates **one** RAGEngine object that is shared across all requests. This is important — we don't want to reload the embedding model on every request (it would be very slow).

### Route handlers

Each function decorated with `@app.route(...)` handles a different URL path.

**Example — the upload endpoint:**

```python
@app.route("/upload", methods=["POST"])
def upload_pdf():
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files["file"]
    filename = secure_filename(file.filename)  # sanitise the name
    save_path = os.path.join(app.config["UPLOAD_FOLDER"], filename)
    file.save(save_path)

    result = rag.ingest_pdf(save_path, collection_name=...)
    return jsonify({"message": "PDF ingested successfully.", **result}), 200
```

- `request.files["file"]` — gets the uploaded file from the incoming HTTP request
- `secure_filename()` — removes dangerous characters from the filename (prevents path traversal attacks)
- `file.save(save_path)` — writes the file to disk
- `rag.ingest_pdf(save_path)` — calls the RAG engine to process it
- `jsonify(...)` — converts a Python dictionary to JSON format
- The second argument (`200`, `400`, etc.) is the HTTP status code:
  - `200` = OK
  - `400` = Bad Request (client made an error)
  - `500` = Internal Server Error (something went wrong on our side)

### Error handling

Each endpoint wraps its logic in a `try/except` block:

```python
try:
    result = rag.ingest_pdf(save_path)
    return jsonify({...}), 200
except FileNotFoundError as e:
    return jsonify({"error": str(e)}), 404
except Exception as e:
    return jsonify({"error": str(e)}), 500
```

This ensures that if something goes wrong, the server returns a clear error message instead of crashing.

---

## `frontend/lib/api.ts` — The Frontend's Messenger

This TypeScript file is the only place where the frontend code communicates with the Flask API. All five Flask endpoints have a matching function here.

### TypeScript interfaces

Before the functions, the file defines the "shape" of the data:

```typescript
export interface DocumentMeta {
  collection_name: string;
  chunk_count: number;
  metadata: {
    source_file?: string;
    total_pages?: number;
  };
}
```

An **interface** is like a form template. It says "any DocumentMeta object must have a `collection_name` field that is text, a `chunk_count` that is a number, and so on." The `?` means the field is optional.

### A fetch function

```typescript
export async function queryDocuments(
  question: string,
  collectionName?: string | null
): Promise<QueryResponse> {
  const body: Record<string, string> = { question };
  if (collectionName) body.collection_name = collectionName;

  const res = await fetch("/api/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  await throwOnError(res);
  return res.json();
}
```

- `async` / `await` — these deal with waiting for network requests to complete. A network request takes time, and `await` pauses this function until the response comes back, without freezing the whole page.
- `fetch("/api/query", ...)` — makes an HTTP POST request to `/api/query`. The URL `/api/query` gets proxied by Next.js to `http://localhost:5001/query` (thanks to `next.config.mjs`).
- `JSON.stringify(body)` — converts a JavaScript object to a JSON text string for sending
- `res.json()` — parses the JSON text of the response back into a JavaScript object

---

## `frontend/components/Sidebar.tsx` — The Document List

This React component renders everything in the left panel.

### State

```typescript
const [isUploading, setIsUploading] = useState(false);
const [uploadError, setUploadError] = useState<string | null>(null);
```

**State** is data that belongs to a component and can change over time. When state changes, React automatically re-renders the component to reflect the new data.

Here we track:
- `isUploading` — is a file currently uploading? (shows spinner when true)
- `uploadError` — did the last upload fail? (shows error message when not null)

### The hidden file input trick

The standard browser file picker (`<input type="file">`) is ugly and hard to style. The trick is to hide it and trigger it programmatically:

```typescript
const fileInputRef = useRef<HTMLInputElement>(null);
// ...
<input ref={fileInputRef} type="file" accept=".pdf" className="hidden" />
<button onClick={() => fileInputRef.current?.click()}>Upload PDF</button>
```

`useRef` creates a reference to a DOM element. Clicking our custom button triggers a click on the hidden input, opening the file picker with our custom styling.

### Document selection

```typescript
<button onClick={() => onSelectDoc(doc.collection_name)} ...>
```

When you click a document, it calls `onSelectDoc` — a function passed down from the parent page. The parent stores which document is selected and passes it to the Chat component, which includes it in query requests.

---

## `frontend/components/Chat.tsx` — The Conversation

This component manages the message list and the input area.

### The message list

```typescript
const [messages, setMessages] = useState<Message[]>([]);
```

Messages are stored as an array of objects, each with a role (`"user"` or `"assistant"`) and content (the text).

### Sending a message

```typescript
async function sendMessage() {
  const question = input.trim();
  if (!question || isLoading) return;

  // 1. Show user's message immediately (optimistic update)
  const userMsg = { id: nextId.current++, role: "user", content: question };
  setMessages((prev) => [...prev, userMsg]);
  setIsLoading(true);

  // 2. Call the API
  const result = await queryDocuments(question, selectedDoc);

  // 3. Add assistant's response
  setMessages((prev) => [...prev, {
    id: nextId.current++,
    role: "assistant",
    content: result.answer,
    sources: result.sources,
  }]);
  setIsLoading(false);
}
```

An **optimistic update** means we show the user's message in the UI immediately, before we even get a response from the server. This makes the app feel faster.

### Auto-scrolling

```typescript
const bottomRef = useRef<HTMLDivElement>(null);
useEffect(() => {
  bottomRef.current?.scrollIntoView({ behavior: "smooth" });
}, [messages, isLoading]);
```

`useEffect` runs code after the component renders. Whenever the `messages` array changes (a new message was added), this code smoothly scrolls to the `bottomRef` element — an invisible `<div>` placed at the very end of the message list.

### The bouncing dots loading indicator

```typescript
{[0, 150, 300].map((delay) => (
  <span
    key={delay}
    className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
    style={{ animationDelay: `${delay}ms` }}
  />
))}
```

Three small circles, each with a different animation delay (0ms, 150ms, 300ms), creating the cascading bounce effect you see while the LLM is thinking.

---

## `next.config.mjs` — The Proxy

This tiny configuration file is one of the most important in the frontend:

```javascript
async rewrites() {
  const flaskUrl = process.env.FLASK_API_URL ?? "http://localhost:5001";
  return [
    {
      source: "/api/:path*",
      destination: `${flaskUrl}/:path*`,
    },
  ];
}
```

A **rewrite** is a URL redirect that happens on the server, invisibly to the browser. When the Next.js server receives a request to `/api/upload`, it silently forwards it to `http://localhost:5001/upload`.

This is important because of **CORS** (Cross-Origin Resource Sharing). Browsers block JavaScript from making requests to a different domain or port than the page is loaded from. Without this proxy, the browser would refuse to connect to `localhost:5001` while the page is on `localhost:3000`. The proxy makes everything appear to come from the same origin.

---

**Next: [The API →](./05-the-api.md)**
