-- Runs once on first container init (empty data dir).
-- Enables pgvector so the repo_embeddings.embedding column works.
CREATE EXTENSION IF NOT EXISTS vector;
