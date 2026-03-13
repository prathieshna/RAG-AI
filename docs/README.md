# Documentation — Local RAG Chatbot

Welcome! This folder explains how the entire project works, from first principles, in plain English. No prior programming or AI knowledge is assumed.

---

## Start Here

If you are completely new, read the documents **in order**. Each one builds on the last.

| # | Document | What it covers |
|---|----------|----------------|
| 1 | [What Is This Project?](./01-what-is-this.md) | The problem we're solving and the big picture |
| 2 | [Key Concepts](./02-key-concepts.md) | AI, LLMs, embeddings, vector databases — explained with analogies |
| 3 | [How It Works](./03-how-it-works.md) | The exact step-by-step journey of a PDF and a question |
| 4 | [The Code Explained](./04-the-code-explained.md) | Every file and function, in plain English |
| 5 | [The API](./05-the-api.md) | What an API is, how Flask serves it, and what each endpoint does |
| 6 | [The Frontend](./06-the-frontend.md) | How the user interface is built with Next.js and React |
| 7 | [rag_engine.py — Deep Dive](./07-rag-engine-deep-dive.md) | Every line of `rag_engine.py` explained with alternatives, notebook style |

---

## Quick Glossary

| Word | Plain English meaning |
|------|-----------------------|
| **LLM** | A program that understands and generates human language |
| **Embedding** | A list of numbers that captures the *meaning* of a piece of text |
| **Vector database** | A database that finds text by *meaning*, not just keywords |
| **RAG** | Giving an LLM relevant facts to read before it answers your question |
| **Ollama** | An app that runs AI models on your own computer |
| **ChromaDB** | The vector database used in this project |
| **Flask** | A Python tool for creating web APIs |
| **Next.js** | A tool for building web user interfaces |
| **API** | A set of rules for how two programs talk to each other |

---

> **Tip:** If you get lost on a word, check the glossary above or look it up in [02-key-concepts.md](./02-key-concepts.md).
