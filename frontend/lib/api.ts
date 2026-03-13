/**
 * lib/api.ts
 * ----------
 * Typed wrappers around the Flask RAG API.
 *
 * All fetch calls go to /api/* which Next.js proxies to Flask via the rewrite
 * rule in next.config.ts — no CORS issues, no API URL in client-side code.
 */

// ---------------------------------------------------------------------------
// Response types (matching Flask response shapes)
// ---------------------------------------------------------------------------

export interface DocumentMeta {
  collection_name: string;
  chunk_count: number;
  metadata: {
    source_file?: string;
    total_pages?: number;
  };
}

export interface UploadResponse {
  message: string;
  collection_name: string;
  filename: string;
  pages_extracted: number;
  chunks_stored: number;
}

export interface Source {
  text: string;
  source: string;
  page: number | string;
  collection: string;
  distance: number | null;
}

export interface QueryResponse {
  answer: string;
  model: string;
  sources: Source[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse a Flask error response and throw a descriptive Error. */
async function throwOnError(res: Response): Promise<void> {
  if (res.ok) return;
  let message = `HTTP ${res.status}`;
  try {
    const body = await res.json();
    if (body.error) message = body.error;
  } catch {
    // ignore JSON parse error, use the HTTP status message
  }
  throw new Error(message);
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

/** Fetch the list of all ingested document collections. */
export async function getDocuments(): Promise<DocumentMeta[]> {
  const res = await fetch("/api/documents");
  await throwOnError(res);
  const data = await res.json();
  return data.documents as DocumentMeta[];
}

/**
 * Upload a PDF file and ingest it into ChromaDB.
 *
 * @param file           The PDF File object from a file input element.
 * @param collectionName Optional custom collection name (defaults to filename stem).
 */
export async function uploadPdf(
  file: File,
  collectionName?: string
): Promise<UploadResponse> {
  const form = new FormData();
  form.append("file", file);
  if (collectionName) form.append("collection_name", collectionName);

  const res = await fetch("/api/upload", { method: "POST", body: form });
  await throwOnError(res);
  return res.json() as Promise<UploadResponse>;
}

/**
 * Ask a question and get an answer from the RAG pipeline.
 *
 * @param question       The user's natural-language question.
 * @param collectionName Limit search to one collection, or null to search all.
 */
export async function queryDocuments(
  question: string,
  collectionName?: string | null
): Promise<QueryResponse> {
  const body: Record<string, string> = { question };
  // Omit collection_name entirely when null/undefined (Flask treats absence as "all")
  if (collectionName) body.collection_name = collectionName;

  const res = await fetch("/api/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  await throwOnError(res);
  return res.json() as Promise<QueryResponse>;
}

/**
 * Delete a document collection from ChromaDB.
 *
 * @param collectionName The collection_name returned by getDocuments().
 */
export async function deleteDocument(collectionName: string): Promise<void> {
  const res = await fetch(`/api/documents/${encodeURIComponent(collectionName)}`, {
    method: "DELETE",
  });
  await throwOnError(res);
}
