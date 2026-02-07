---
name: build-rag-stack
description: Build or refresh RAG pipeline using chroma/faiss/qdrant/pinecone with sentence-transformers embeddings.
allowed-tools:
  - Read
  - Write
  - Grep
  - Glob
  - Bash
---

1. Ingest documents.
2. Embed with selected sentence-transformers model.
3. Index in chosen vector store.
4. Run retrieval smoke tests and write `artifacts/ai/rag/validation.json`.
