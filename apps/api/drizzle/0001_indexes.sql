-- pgvector ANN index on repo_embeddings.embedding.
-- Uses HNSW with cosine distance (vector_cosine_ops) for fast similarity search.
-- Drizzle's index() API cannot express custom access methods + operator classes,
-- so this DDL must be applied manually (after the base migration creates the table).
--
-- Apply with: psql $DATABASE_URL -f apps/api/drizzle/0001_indexes.sql

CREATE INDEX IF NOT EXISTS repo_embeddings_embedding_hnsw_idx
  ON repo_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
