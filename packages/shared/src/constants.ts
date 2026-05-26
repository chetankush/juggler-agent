/** Directories/files the repo scanner must never index. */
export const REPO_EXCLUDE_DIRS = [
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  ".next",
  ".turbo",
  "coverage",
] as const;

export const REPO_EXCLUDE_FILES = [".env", ".env.local"] as const;

/** File extensions the scanner indexes (MVP: TS/JS). */
export const REPO_INDEX_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts"] as const;

/**
 * Embedding vector dimension. Must match the OpenRouter embedding model and the
 * pgvector column (`vector(N)`). text-embedding-3-small => 1536.
 */
export const EMBEDDING_DIMENSIONS = 1536;

/** Top-k chunks to retrieve for an "Explain Task" RAG query. */
export const RAG_TOP_K = 6;

/** Default reminder cadence (hours of inactivity before a nudge). */
export const DEFAULT_INACTIVITY_HOURS = 24;

/** Default settings applied to a freshly created workspace. */
export const DEFAULT_WORKSPACE_SETTINGS = {
  reminderCadenceHours: DEFAULT_INACTIVITY_HOURS,
  workingHoursStart: "09:00",
  workingHoursEnd: "18:00",
  defaultModel: "google/gemini-2.5-flash",
} as const;

/** BullMQ queue names. */
export const QUEUES = {
  reminders: "reminders",
  embeddings: "embeddings",
} as const;
