# 6. The Frontend

This document explains how the user interface is built — what React and Next.js are, how components work, and how the pieces of the UI fit together.

---

## What Is a Frontend?

A **frontend** is everything the user sees and interacts with in their browser — the buttons, the text boxes, the chat bubbles, the document list. It is distinct from the **backend** (Flask, ChromaDB, Ollama), which does the heavy processing but has no visual interface.

The frontend in this project is a web page that runs in your browser at `http://localhost:3000`.

---

## What Is React?

**React** is a JavaScript library made by Meta (Facebook) for building user interfaces.

Before React, web pages were mostly static. Updating content meant reloading the whole page. React introduced a different idea: the UI is made up of **components**, and when data changes, only the affected components re-draw themselves automatically.

### The LEGO analogy

Think of React components like LEGO bricks. Each brick is a self-contained piece with its own shape and colour. You snap bricks together to build complex structures. You can reuse the same brick in multiple places.

In this project:
- The `Sidebar` component is one brick
- The `Chat` component is another brick
- The main `page.tsx` snaps them together into the full layout

### The key idea: state

A component's **state** is data that can change over time. When state changes, React re-renders the component to show the new data.

```
State: messages = []
  → Component renders: empty chat

User sends a question.
State: messages = [{role: "user", content: "What is revenue?"}]
  → Component re-renders: chat shows the question

Answer comes back from API.
State: messages = [{...}, {role: "assistant", content: "Revenue was $7.3m"}]
  → Component re-renders: chat shows the question and answer
```

You never manually update the HTML. You just update the state, and React handles the rest.

---

## What Is Next.js?

**Next.js** is a framework built on top of React that adds extra features:

1. **File-based routing** — the file `app/page.tsx` automatically becomes the page at `/`. If you created `app/about/page.tsx`, it would become the `/about` page. No routing configuration needed.

2. **Server-side rendering** — Next.js can render pages on the server before sending them to the browser, making them load faster.

3. **API proxying** — the `rewrites` feature in `next.config.mjs` lets us silently forward requests to Flask (explained in [The API](./05-the-api.md)).

4. **TypeScript support** — built-in support for TypeScript, a version of JavaScript with strict type checking.

---

## What Is TypeScript?

**TypeScript** is JavaScript with added type annotations. A **type** tells you what kind of data a variable holds.

```typescript
// JavaScript (no types — what is "name"? a string? a number?)
function greet(name) {
  return "Hello, " + name;
}

// TypeScript (clear — name must be a string)
function greet(name: string): string {
  return "Hello, " + name;
}
```

If you try to call `greet(42)`, TypeScript will refuse to compile the code and show you an error immediately. This catches bugs before they happen.

In this project, all frontend files use TypeScript (`.tsx` extension).

---

## What Is Tailwind CSS?

**CSS** is what makes web pages look the way they do — colours, fonts, spacing, layout.

**Tailwind CSS** is a library of CSS utility classes. Instead of writing a separate CSS file with custom styles, you apply small, purpose-built classes directly in your HTML:

```tsx
<button className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-500">
  Upload PDF
</button>
```

Each class does one thing:
- `bg-indigo-600` — indigo background colour
- `text-white` — white text
- `px-4` — horizontal padding
- `py-2` — vertical padding
- `rounded-lg` — rounded corners
- `hover:bg-indigo-500` — lighter background on mouse hover

No CSS file needed. Everything is readable inline.

---

## The Component Tree

```
app/page.tsx  (root — manages shared state)
│
├── components/Sidebar.tsx  (left panel)
│   ├── "All Documents" button
│   ├── List of DocumentItem rows
│   └── Upload button + hidden file input
│
└── components/Chat.tsx  (right panel)
    ├── MessageList
    │   ├── MessageBubble (user)
    │   ├── MessageBubble (assistant)
    │   │   └── SourceCitations (collapsible)
    │   └── Loading indicator (bouncing dots)
    └── Input area (textarea + send button)
```

---

## How Data Flows

This is the most important concept to understand about the frontend architecture.

### The page is in charge

`page.tsx` is the parent component. It owns the **shared state** — data that both the Sidebar and Chat need to know about.

```typescript
// In page.tsx:
const [documents, setDocuments] = useState<DocumentMeta[]>([]);
const [selectedDoc, setSelectedDoc] = useState<string | null>(null);
```

- `documents` — the list of all uploaded PDFs (displayed in the Sidebar)
- `selectedDoc` — which document is currently selected (null = all documents)

### Props pass data down

The parent passes data **down** to children as **props** (properties):

```tsx
// page.tsx passes props down to its children
<Sidebar
  documents={documents}      // the list to display
  selectedDoc={selectedDoc}  // which one is highlighted
  onSelectDoc={setSelectedDoc}  // function to call when user clicks a doc
  onRefresh={fetchDocuments}    // function to call after upload/delete
/>
<Chat
  selectedDoc={selectedDoc}  // which doc to query (or null for all)
/>
```

### Events pass data up

When the user does something in a child component, the child calls the function that was passed down to it:

```typescript
// In Sidebar.tsx, when user clicks a document:
onClick={() => onSelectDoc(doc.collection_name)}
//                ↑ this was passed down from page.tsx
//                  calling it updates page.tsx's state
```

This pattern — data flows down via props, events flow up via function calls — is fundamental to React.

---

## The Layout: CSS Flexbox

The split sidebar/chat layout is achieved with a single CSS class: `flex`.

```tsx
// page.tsx
<div className="flex h-screen overflow-hidden bg-white">
  <Sidebar ... />   {/* fixed width: w-72 (18rem) */}
  <Chat ... />      {/* flex-1 = takes all remaining space */}
</div>
```

`flex` makes the container a **flexbox** — its children are arranged in a row by default. `h-screen` makes it fill the full height of the viewport. `overflow-hidden` prevents scrollbars from appearing on the outer container (scrolling happens inside the Chat panel instead).

---

## The Upload Flow in Detail

```
1. User clicks "Upload PDF" button
   → button onClick triggers fileInputRef.current.click()
   → this programmatically opens the hidden <input type="file">

2. User selects a file in the OS file picker dialog
   → onChange event fires with the selected file

3. handleFileChange() runs:
   → sets isUploading = true  (spinner appears on button)
   → calls uploadPdf(file) from lib/api.ts
   → uploadPdf() sends a multipart/form-data POST to /api/upload
   → Next.js proxy forwards it to Flask

4. Flask ingests the PDF (takes a few seconds)
   → returns {"message": "PDF ingested successfully.", ...}

5. handleFileChange() receives the response:
   → calls onRefresh() to reload the document list from /api/documents
   → sets isUploading = false  (spinner disappears)
   → new document appears in the sidebar list
```

---

## The Query Flow in Detail

```
1. User types a question and presses Enter (or clicks the send button)

2. sendMessage() runs:
   → checks the input is not empty
   → immediately adds the user's message to the messages array
     (the message bubble appears instantly)
   → sets isLoading = true  (bouncing dots appear)
   → sets input = ""  (clears the text box)

3. queryDocuments(question, selectedDoc) runs:
   → sends a POST to /api/query with the question and (optional) collection name
   → Next.js proxy forwards it to Flask
   → Flask embeds the question, queries ChromaDB, calls Ollama
   → (this takes a few seconds)

4. Response arrives:
   → adds the assistant message to the messages array
     (the answer bubble appears with the model name and sources)
   → sets isLoading = false  (bouncing dots disappear)

5. The useEffect watching [messages] fires:
   → scrolls the chat to the bottom smoothly
```

---

## The Source Citations Component

When an assistant message arrives, it has a `sources` array attached. The `SourceCitations` component renders these as collapsible cards:

```typescript
const [open, setOpen] = useState(false);  // collapsed by default

// Toggle open/closed when the chevron is clicked
<button onClick={() => setOpen((o) => !o)}>
  {sources.length} source{sources.length !== 1 ? "s" : ""} used
</button>

{open && (
  // Only rendered when open is true
  <div>
    {sources.map((src, i) => (
      <div key={i}>
        <span>{src.source} — page {src.page}</span>
        <span>{relevancePercent}% match</span>
        <p>{src.text}</p>
      </div>
    ))}
  </div>
)}
```

The relevance percentage is calculated from the `distance` score:
```typescript
const relevance = Math.max(0, Math.round((1 - src.distance / 2) * 100));
```

ChromaDB returns cosine distances between 0 and 2. Distance 0 = identical meaning. Distance 2 = completely opposite meaning. We convert: a distance of 0 becomes 100%, distance of 1 becomes 50%, distance of 2 becomes 0%.

---

## The `"use client"` Directive

You'll see `"use client";` at the top of both `Sidebar.tsx` and `Chat.tsx` and `page.tsx`.

In Next.js App Router, components are **Server Components** by default — they render on the server and send static HTML to the browser. Server Components are fast but cannot use:
- `useState` (managing changing data)
- `useEffect` (running code after render)
- Event handlers like `onClick`

All three of those are needed for our interactive UI, so we mark these components as **Client Components** with `"use client"`. This tells Next.js: "render this in the browser, where JavaScript can run and respond to user interactions."

---

## Summary

| Technology | Role | Why used |
|------------|------|----------|
| Next.js | Web framework | File-based routing, API proxy, TypeScript support |
| React | UI library | Component-based, reactive state management |
| TypeScript | Programming language | Catches type errors at compile time |
| Tailwind CSS | Styling | Utility classes, no separate CSS files needed |
| `lib/api.ts` | API client | Single place where all Flask calls are made |

---

**You've read all the docs! Here's a one-sentence summary of everything:**

> The frontend (Next.js) lets you upload PDFs and ask questions; those requests go to Flask (via a proxy); Flask uses the `RAGEngine` to extract PDF text, chunk it, embed it with sentence-transformers, store it in ChromaDB, and at query time retrieve the most relevant chunks, build a prompt, and send it to Ollama; the local LLM reads the chunks and writes a grounded answer that gets displayed back in the UI with source citations.

---

**[← Back to Docs Index](./README.md)**
