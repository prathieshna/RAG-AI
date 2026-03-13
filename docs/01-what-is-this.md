# 1. What Is This Project?

## The Problem

Imagine you have a stack of PDF documents — a company report, a research paper, a legal contract, a user manual. Someone asks you a question about what's inside. You have two options:

1. Read every page yourself to find the answer — slow and tedious.
2. Have a smart assistant who has already read everything and can answer instantly.

This project builds that smart assistant. You upload your PDFs, and then you can have a conversation with them. You ask questions in plain English; it gives you answers and tells you exactly which page the answer came from.

---

## Why "Local"?

When most people think of AI assistants like ChatGPT, those systems run on servers owned by big companies. Your documents are sent over the internet to those servers. That raises two concerns:

1. **Privacy** — If your documents are confidential (medical records, financial data, internal reports), you may not want to upload them to a third party.
2. **Cost** — Cloud AI services often charge per use.

This project runs **entirely on your own computer**. Your PDFs never leave your machine. The AI model runs locally. Nothing is sent to the internet.

---

## The Analogy: A Personal Librarian

Think of this system as hiring a very dedicated librarian:

1. **You hand them your books** (upload PDFs). They read every page and write detailed index cards summarising the meaning of every paragraph. They file those cards in a cabinet (ChromaDB, the vector database).

2. **You ask a question** (type in the chat). The librarian searches the index card cabinet for cards that are relevant to your question. They pull out the most relevant few.

3. **They write you a summary** (the LLM generates an answer) based only on what those index cards say, and tells you which page each card came from.

The librarian never guesses or makes things up — they only tell you what's in the documents you gave them.

---

## What Can You Do With It?

- Upload a 200-page company report and ask: *"What was the revenue in Q3?"*
- Upload a legal contract and ask: *"What are the termination clauses?"*
- Upload a textbook and ask: *"Explain the concept of photosynthesis in simple terms."*
- Upload multiple documents and search across all of them at once.
- Delete documents you no longer need.

---

## The Pieces At a Glance

```
Your Computer
┌─────────────────────────────────────────────────────────┐
│                                                         │
│   Browser (the UI you see)                              │
│   └── Next.js frontend on http://localhost:3000         │
│                                                         │
│   Flask API (the brain, in Python)                      │
│   └── http://localhost:5001                             │
│       ├── Reads PDFs                                    │
│       ├── Creates embeddings                            │
│       ├── Talks to ChromaDB                             │
│       └── Talks to Ollama                               │
│                                                         │
│   ChromaDB (the filing cabinet)                         │
│   └── Saved on disk in ./chroma_db/                     │
│                                                         │
│   Ollama (the AI brain)                                 │
│   └── Runs llama3.2:3b (or another model)               │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

Each of these pieces is explained in detail in the following documents.

---

## What This Project Is NOT

- It is **not** connected to the internet during normal use (only the first run downloads model files).
- It is **not** ChatGPT or any other cloud product.
- It is **not** magic — if a PDF is a scanned image with no text layer, it cannot read it.
- It does **not** make up information from outside your documents — it only uses what you gave it.

---

**Next: [Key Concepts →](./02-key-concepts.md)**
