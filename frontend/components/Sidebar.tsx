/**
 * components/Sidebar.tsx
 * ----------------------
 * Dark left sidebar that shows:
 *  - "All Documents" selector (queries across every collection)
 *  - List of ingested PDF collections with chunk count
 *  - Per-document delete button
 *  - PDF upload button with loading state
 */

"use client";

import { useRef, useState } from "react";
import { uploadPdf, deleteDocument, type DocumentMeta } from "@/lib/api";

interface Props {
  documents: DocumentMeta[];
  selectedDoc: string | null;     // null = "All Documents"
  onSelectDoc: (name: string | null) => void;
  onRefresh: () => Promise<void>; // called after upload or delete to reload the list
}

export default function Sidebar({ documents, selectedDoc, onSelectDoc, onRefresh }: Props) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Hidden file input — triggered by the styled upload button
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle file selection and upload
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset file input so the same file can be re-uploaded if needed
    e.target.value = "";

    setUploadError(null);
    setIsUploading(true);
    try {
      await uploadPdf(file);
      await onRefresh(); // Reload document list after successful upload
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setIsUploading(false);
    }
  }

  // Delete a collection after a simple confirmation
  async function handleDelete(collectionName: string, e: React.MouseEvent) {
    // Stop the click from also selecting the document row
    e.stopPropagation();
    if (!confirm(`Delete "${collectionName}"? This cannot be undone.`)) return;

    setDeleteError(null);
    try {
      await deleteDocument(collectionName);
      // If the deleted doc was selected, fall back to "All Documents"
      if (selectedDoc === collectionName) onSelectDoc(null);
      await onRefresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed.");
    }
  }

  return (
    <aside className="flex flex-col w-72 min-w-[18rem] h-full bg-gray-900 text-gray-100 border-r border-gray-800">
      {/* Header */}
      <div className="px-5 py-5 border-b border-gray-800">
        <h1 className="text-lg font-semibold tracking-tight">RAG Chatbot</h1>
        <p className="text-xs text-gray-400 mt-0.5">Powered by Ollama + ChromaDB</p>
      </div>

      {/* Document list (scrollable) */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {/* "All Documents" option — always pinned at top */}
        <button
          onClick={() => onSelectDoc(null)}
          className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
            selectedDoc === null
              ? "bg-indigo-600 text-white"
              : "text-gray-300 hover:bg-gray-800"
          }`}
        >
          <span className="font-medium">All Documents</span>
          <span className="block text-xs opacity-70 mt-0.5">
            Search across {documents.length} collection{documents.length !== 1 ? "s" : ""}
          </span>
        </button>

        {/* Divider */}
        {documents.length > 0 && (
          <p className="px-3 pt-3 pb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
            Documents
          </p>
        )}

        {/* Individual document rows */}
        {documents.map((doc) => {
          const isSelected = selectedDoc === doc.collection_name;
          // Human-readable name: prefer source_file, fall back to collection_name
          const displayName = doc.metadata?.source_file ?? doc.collection_name;

          return (
            <div
              key={doc.collection_name}
              onClick={() => onSelectDoc(doc.collection_name)}
              className={`group flex items-start justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                isSelected
                  ? "bg-indigo-600 text-white"
                  : "text-gray-300 hover:bg-gray-800"
              }`}
            >
              {/* Doc info */}
              <div className="flex-1 min-w-0 pr-2">
                <p className="text-sm font-medium truncate">{displayName}</p>
                <p className={`text-xs mt-0.5 ${isSelected ? "text-indigo-200" : "text-gray-500"}`}>
                  {doc.chunk_count} chunks
                  {doc.metadata?.total_pages != null &&
                    ` · ${doc.metadata.total_pages} pages`}
                </p>
              </div>

              {/* Delete button — visible on hover */}
              <button
                onClick={(e) => handleDelete(doc.collection_name, e)}
                title="Delete document"
                className={`flex-shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity ${
                  isSelected
                    ? "hover:bg-indigo-500 text-indigo-200 hover:text-white"
                    : "hover:bg-gray-700 text-gray-500 hover:text-red-400"
                }`}
              >
                {/* Trash icon */}
                <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>
          );
        })}

        {/* Empty state */}
        {documents.length === 0 && (
          <p className="px-3 py-4 text-xs text-gray-500 text-center">
            No documents yet. Upload a PDF below.
          </p>
        )}

        {/* Delete error */}
        {deleteError && (
          <p className="px-3 text-xs text-red-400 mt-2">{deleteError}</p>
        )}
      </nav>

      {/* Upload section — pinned at bottom */}
      <div className="px-4 py-4 border-t border-gray-800">
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Styled upload button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
        >
          {isUploading ? (
            <>
              {/* Spinner */}
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Uploading…
            </>
          ) : (
            <>
              {/* Upload icon */}
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M9.25 13.25a.75.75 0 001.5 0V4.636l2.955 3.129a.75.75 0 001.09-1.03l-4.25-4.5a.75.75 0 00-1.09 0l-4.25 4.5a.75.75 0 101.09 1.03L9.25 4.636v8.614z" />
                <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
              </svg>
              Upload PDF
            </>
          )}
        </button>

        {/* Upload error */}
        {uploadError && (
          <p className="mt-2 text-xs text-red-400 text-center">{uploadError}</p>
        )}
      </div>
    </aside>
  );
}
