-- Ethos requires pgvector for storage and similarity search
-- of OpenAI text-embedding-3-small embeddings (1536 dimensions).
--
-- This extension must be enabled before the Ethos embedding
-- table/vector column is created.
--
-- Safe to run more than once.

CREATE EXTENSION IF NOT EXISTS vector;
