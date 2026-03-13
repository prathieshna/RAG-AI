# 2. Key Concepts

This document explains the fundamental ideas behind the project. Each concept is explained from scratch — no prior knowledge needed.

---

## 1. What Is a Language Model (LLM)?

**LLM** stands for **Large Language Model**.

Think of it as a program that has read an enormous amount of text — billions of web pages, books, and articles. Through that reading, it learned the patterns of human language so well that it can:

- Answer questions
- Summarise text
- Translate languages
- Continue a story
- Explain complex topics

It does not "know" things the way a database does. It's more like a person who has read a lot and can discuss almost any topic. But — crucially — it can forget details, confuse facts, or fill in gaps with plausible-sounding but wrong information. This is why we use the **RAG** technique (explained below) to keep it grounded in your actual documents.

### The model used in this project: `llama3.2:3b`

- Made by Meta (the Facebook company)
- "3b" means 3 billion parameters (think of parameters as the "neurons" of the AI)
- It runs on a normal laptop without a gaming GPU
- It's free and open-source

---

## 2. What Is Ollama?

Running an AI model on your computer sounds complicated. You'd normally need to write a lot of code just to load the model file and talk to it.

**Ollama** solves this. It's a simple application (like having VLC for videos, but for AI models) that:

1. Downloads AI model files to your computer
2. Runs them efficiently
3. Gives you a simple way to talk to them (like a chat app, or via code)

When this project's Python code wants an answer from the AI, it just sends a message to Ollama — which is running quietly in the background — and gets the answer back.

```
Python code → "What is X?" → Ollama → AI model → answer → Python code
```

---

## 3. What Are Embeddings?

This is the most important concept to understand.

### The problem with keywords

Traditional search engines match words. If you search for "car" and a document says "automobile", it won't find it. Words can mean the same thing (synonyms) or different things depending on context.

### The idea of meaning as numbers

Embeddings solve this. An **embedding** is a list of numbers (usually hundreds of numbers) that represents the *meaning* of a piece of text.

**Example:**

```
"The car broke down"      →  [0.21, -0.54, 0.89, 0.12, ...]  (384 numbers)
"The vehicle stopped"     →  [0.22, -0.51, 0.87, 0.14, ...]  (very similar!)
"I like pizza"            →  [-0.83, 0.21, -0.14, 0.77, ...]  (very different)
```

Sentences with similar meanings produce similar lists of numbers. Sentences with different meanings produce very different lists of numbers.

### The compass analogy

Imagine meaning as a location on a map. "Dog" and "cat" would be close together on this map (both are small domestic animals). "Dog" and "skyscraper" would be far apart. Embeddings are like the GPS coordinates of meaning.

### The model used for embeddings: `all-MiniLM-L6-v2`

- Made by a research group called sentence-transformers
- Turns any text into a list of 384 numbers
- Runs entirely on your CPU — no GPU needed
- Downloads automatically on first run (~90 MB)
- It does **not** generate text — it only converts text to numbers

---

## 4. What Is a Vector Database?

A **vector** is just another word for "a list of numbers". An embedding is a vector. A **vector database** is a database designed to store and search through millions of these vectors extremely fast.

### Normal database vs. vector database

| Normal database | Vector database |
|----------------|-----------------|
| Finds exact matches ("WHERE name = 'John'") | Finds similar meanings ("find chunks most similar to this question") |
| Great for structured data | Great for unstructured text, images, audio |
| Uses indexes like B-trees | Uses special indexes for multi-dimensional space |

### How it finds similar vectors

When you ask a question, the system converts your question into a vector. Then the vector database finds the stored vectors that are closest to your question's vector — like finding the nearest neighbours on a map.

```
Your question: "What is the annual profit?"
   ↓ convert to vector
[0.31, -0.42, 0.71, ...]

Stored chunk A: "The annual profit was $5.2 million" → distance: 0.12  ✓ very close
Stored chunk B: "We hired 50 new employees"           → distance: 1.43  ✗ far away
Stored chunk C: "Net income for the year reached..."  → distance: 0.18  ✓ close
```

The database returns chunks A and C because they are semantically nearest to your question.

### ChromaDB

**ChromaDB** is the vector database used in this project. It is:
- Free and open source
- Runs entirely on your computer
- Saves data to a folder on disk (`./chroma_db/`) so it persists between restarts
- Talks directly to Python code — no separate server to manage

---

## 5. What Is RAG?

**RAG** stands for **Retrieval-Augmented Generation**.

It's a technique that combines the two things we just learned about:

1. **Retrieval** — finding the relevant chunks from your documents using vector search
2. **Generation** — using an LLM to write a good answer *based on those chunks*

### Why not just ask the LLM directly?

If you ask an LLM "What was the revenue in our Q3 report?", it doesn't know — your report wasn't in its training data. It might make something up (this is called **hallucination**).

RAG solves this by feeding the answer into the prompt:

```
❌ Without RAG:
   Prompt: "What was the revenue in Q3?"
   LLM: (makes something up) "Approximately $4 million." ← wrong!

✓ With RAG:
   Prompt: "Using only the following text:
            [PAGE 12] Revenue for Q3 was $7.3 million, up 12%...
            Answer: What was the revenue in Q3?"
   LLM: "According to the document, Q3 revenue was $7.3 million,
         which represents a 12% increase." ← correct!
```

The LLM is now just a clever summariser and formatter — the actual facts come from your documents.

### The sandwich analogy

Imagine you're helping a friend write an email. Instead of asking them to recall everything from memory, you hand them the relevant printout and say "write a reply based only on this". That's RAG. The printout is the retrieved context, and your friend writing the email is the LLM.

---

## 6. What Is Chunking?

PDFs can be hundreds of pages long. We cannot feed an entire 200-page PDF into the LLM at once — there's a limit to how much text it can process at a time (called the **context window**).

The solution is to split the PDF into small, manageable pieces called **chunks**. Each chunk is typically 1,000 characters long.

### The overlap trick

When we split text into chunks, we add an **overlap** — the last 200 characters of chunk 1 appear again at the beginning of chunk 2. This prevents important information from being split at a chunk boundary and lost.

```
Original text: "...The annual profit was $5.2 million. This represents a 12%
               increase over the previous year. The main driver was..."

Chunk 1: "...The annual profit was $5.2 million. This represents a 12%
          increase over the previous year."
                                       ↑
                              [200 char overlap]
                                       ↓
Chunk 2: "This represents a 12% increase over the previous year.
          The main driver was..."
```

---

## 7. Putting It All Together

Here is how all the concepts connect:

```
PDF
 │
 ▼
Extract text (page by page)
 │
 ▼
Split into chunks (1000 chars, 200 overlap)
 │
 ▼
Convert each chunk to an embedding (384 numbers)
 │              ↑
 │    sentence-transformers model does this
 ▼
Store (chunk text + its embedding) in ChromaDB
 │
 ├──────────────────────────────────────────────────
 │  (later, when you ask a question)
 ▼
Convert your question to an embedding
 │
 ▼
ChromaDB finds the 5 most similar chunk embeddings
 │
 ▼
Build a prompt: "Using these chunks, answer: <your question>"
 │
 ▼
Send prompt to Ollama (the local LLM)
 │
 ▼
Get back a natural-language answer + source citations
```

---

**Next: [How It Works →](./03-how-it-works.md)**
