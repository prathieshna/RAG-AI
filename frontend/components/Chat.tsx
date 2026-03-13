/**
 * components/Chat.tsx
 * -------------------
 * The right-hand chat panel. Manages the message history and sends queries
 * to the Flask /api/query endpoint via the Next.js rewrite proxy.
 *
 * Each assistant message includes a collapsible "Sources" section that shows
 * which PDF pages the answer was drawn from.
 */

"use client";

import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { queryDocuments, type Source } from "@/lib/api";

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

type Role = "user" | "assistant";

interface Message {
  id: number;
  role: Role;
  content: string;
  model?: string;        // only on assistant messages
  sources?: Source[];    // only on assistant messages
}

// --------------------------------------------------------------------------
// Sub-components
// --------------------------------------------------------------------------

/** Collapsible source citations shown below each assistant answer. */
function SourceCitations({ sources }: { sources: Source[] }) {
  const [open, setOpen] = useState(false);

  if (sources.length === 0) return null;

  return (
    <div className="mt-3 text-sm">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
      >
        {/* Chevron icon, rotates when open */}
        <svg
          className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-90" : ""}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
            clipRule="evenodd"
          />
        </svg>
        {sources.length} source{sources.length !== 1 ? "s" : ""} used
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {sources.map((src, i) => {
            // Convert distance (0–2 cosine range) to a 0–100% relevance score
            const relevance =
              src.distance != null
                ? Math.max(0, Math.round((1 - src.distance / 2) * 100))
                : null;

            return (
              <div key={i} className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                {/* Source header: filename + page + relevance */}
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-gray-700">
                    {src.source} — page {src.page}
                  </span>
                  {relevance != null && (
                    <span className="text-xs text-gray-400">{relevance}% match</span>
                  )}
                </div>
                {/* Excerpt */}
                <p className="text-xs text-gray-600 leading-relaxed line-clamp-4">
                  {src.text}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** A single chat message bubble. */
function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[80%] ${isUser ? "order-1" : ""}`}>
        {/* Bubble */}
        <div
          className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
            isUser
              ? "bg-indigo-600 text-white rounded-tr-sm"
              : "bg-gray-100 text-gray-900 rounded-tl-sm"
          }`}
        >
          {msg.content}
        </div>

        {/* Model label + sources for assistant messages */}
        {!isUser && (
          <div className="px-1">
            {msg.model && (
              <p className="mt-1 text-xs text-gray-400">{msg.model}</p>
            )}
            {msg.sources && <SourceCitations sources={msg.sources} />}
          </div>
        )}
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// Main Chat component
// --------------------------------------------------------------------------

interface Props {
  selectedDoc: string | null; // null = query all documents
}

export default function Chat({ selectedDoc }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-scroll to the latest message
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Unique ID counter for messages
  const nextId = useRef(1);

  async function sendMessage() {
    const question = input.trim();
    if (!question || isLoading) return;

    setInput("");
    setError(null);

    // Immediately show the user's message (optimistic)
    const userMsg: Message = { id: nextId.current++, role: "user", content: question };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const result = await queryDocuments(question, selectedDoc);
      const assistantMsg: Message = {
        id: nextId.current++,
        role: "assistant",
        content: result.answer,
        model: result.model,
        sources: result.sources,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Query failed. Is Ollama running?");
    } finally {
      setIsLoading(false);
    }
  }

  // Submit on Enter, allow Shift+Enter for newlines
  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  // Label shown above the input when a specific doc is selected
  const scopeLabel = selectedDoc
    ? `Asking about: ${selectedDoc}`
    : "Asking across all documents";

  return (
    <main className="flex flex-col flex-1 h-full overflow-hidden">
      {/* ---------------------------------------------------------------- */}
      {/* Message list                                                      */}
      {/* ---------------------------------------------------------------- */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">

        {/* Empty state */}
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 gap-3">
            {/* Document icon */}
            <svg className="w-12 h-12 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            <div>
              <p className="font-medium text-gray-500">Ask a question about your documents</p>
              <p className="text-sm mt-1">Upload a PDF using the sidebar, then type below.</p>
            </div>
          </div>
        )}

        {/* Messages */}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}

        {/* Loading indicator while waiting for the LLM */}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-3">
              <span className="flex gap-1 items-center">
                {[0, 150, 300].map((delay) => (
                  <span
                    key={delay}
                    className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                    style={{ animationDelay: `${delay}ms` }}
                  />
                ))}
              </span>
            </div>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="flex justify-center">
            <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
              {error}
            </p>
          </div>
        )}

        {/* Anchor div — scrolled into view after new messages */}
        <div ref={bottomRef} />
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Input area (sticky at bottom)                                    */}
      {/* ---------------------------------------------------------------- */}
      <div className="border-t border-gray-200 bg-white px-6 py-4">
        {/* Scope indicator */}
        <p className="text-xs text-gray-400 mb-2">{scopeLabel}</p>

        <div className="flex gap-3 items-end">
          {/* Auto-growing textarea */}
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            placeholder="Ask a question… (Enter to send, Shift+Enter for new line)"
            rows={1}
            className="flex-1 resize-none rounded-xl border border-gray-300 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50 disabled:bg-gray-50 leading-relaxed"
            style={{ maxHeight: "8rem", overflowY: "auto" }}
            // Auto-resize the textarea as content grows
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = `${el.scrollHeight}px`;
            }}
          />

          {/* Send button */}
          <button
            onClick={sendMessage}
            disabled={isLoading || !input.trim()}
            className="flex-shrink-0 w-11 h-11 flex items-center justify-center rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
            title="Send (Enter)"
          >
            {isLoading ? (
              // Spinner while waiting
              <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            ) : (
              // Send arrow icon
              <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925A1.5 1.5 0 005.135 9.25h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95 28.896 28.896 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.289z" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </main>
  );
}
