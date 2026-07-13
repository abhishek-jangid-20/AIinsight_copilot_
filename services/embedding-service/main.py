"""
---------------------------------------------------------
File: main.py
Location: services/embedding-service/main.py
---------------------------------------------------------

Purpose:
  FastAPI service coordinating text vectorization and vector database indexes.
  Enables semantic vector queries over repositories.

Responsibilities:
- Translates text segments into float arrays (embeddings) using OpenAI.
- Enriches source snippets with filename and language tags to improve match accuracies.
- Indexes code block vectors into ChromaDB.
- Purges vector collections on repository deletions.

Related Files:
- server/src/routes/repositories.js (Queries /search and /purge endpoints)
- services/common/embeddings.py (Shared embedding API caller)
- services/common/vector_store.py (Chroma DB client interfaces)
"""

from __future__ import annotations

from fastapi import FastAPI

from common.embeddings import embed_texts
from common.models import RepositoryAnalysis, SearchRequest
from common.vector_store import delete_collection, query_chunks, upsert_chunks

app = FastAPI(title="CodeInsight Embedding Service", version="0.1.0")


@app.get("/health")
def health():
    return {"ok": True, "service": "embedding-service"}


@app.post("/repositories/{repository_id}/index")
def index_repository(repository_id: str, analysis: RepositoryAnalysis):
    """
    Computes vector embeddings for code chunks and saves them in the vector database.
    """
    chunks = [chunk.model_dump() for chunk in analysis.chunks]
    
    # Enrich the text with metadata prior to embedding to improve similarity search matches
    texts = [_embedding_text(chunk) for chunk in chunks]
    embeddings = embed_texts(texts)
    
    return upsert_chunks(repository_id, chunks, embeddings)


@app.post("/repositories/{repository_id}/search")
def semantic_search(repository_id: str, request: SearchRequest):
    """
    Converts search query strings to embeddings, performing similarity search queries.
    """
    embedding = embed_texts([request.query])[0]
    results = query_chunks(repository_id, embedding, request.limit)
    return {"results": results}


@app.delete("/repositories/{repository_id}/purge")
def purge_repository(repository_id: str):
    """
    Wipes the repository's ChromaDB vector collection.
    """
    delete_collection(repository_id)
    return {"purged": True, "repositoryId": repository_id}


def _embedding_text(chunk: dict) -> str:
    """
    Formats code chunks, prefixing files and language tags to the content.
    
    Why?
    * Giving the embedding model metadata context like path names and syntax languages
      significantly improves retrieval matching accuracy during searches.
    """
    symbol = chunk.get("symbol") or {}
    return "\n".join(
        [
            f"file: {chunk['filePath']}",
            f"language: {chunk['language']}",
            f"symbol: {symbol.get('name', '')}",
            chunk["content"],
        ]
    )
