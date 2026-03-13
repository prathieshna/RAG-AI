/**
 * app/page.tsx
 * -----------
 * Root page — renders the split layout (sidebar + chat panel).
 * State for which document is currently selected lives here so both
 * child components can read and update it.
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import Sidebar from "@/components/Sidebar";
import Chat from "@/components/Chat";
import { getDocuments, type DocumentMeta } from "@/lib/api";

export default function Home() {
  // All ingested document collections fetched from Flask
  const [documents, setDocuments] = useState<DocumentMeta[]>([]);
  // The collection_name the user has focused on, or null = search all docs
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null);

  // Fetch document list. Wrapped in useCallback so it can be passed down
  // as a stable reference to child components that trigger a refresh.
  const fetchDocuments = useCallback(async () => {
    try {
      const docs = await getDocuments();
      setDocuments(docs);
    } catch (err) {
      console.error("Failed to load documents:", err);
    }
  }, []);

  // Load documents on mount
  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  return (
    // Full-screen flex row: sidebar on left, chat on right
    <div className="flex h-screen overflow-hidden bg-white">
      <Sidebar
        documents={documents}
        selectedDoc={selectedDoc}
        onSelectDoc={setSelectedDoc}
        onRefresh={fetchDocuments}
      />
      <Chat selectedDoc={selectedDoc} />
    </div>
  );
}
