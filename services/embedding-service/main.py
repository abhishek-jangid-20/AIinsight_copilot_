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
    chunks = [chunk.model_dump() for chunk in analysis.chunks]
    texts = [_embedding_text(chunk) for chunk in chunks]
    embeddings = embed_texts(texts)
    return upsert_chunks(repository_id, chunks, embeddings)


@app.post("/repositories/{repository_id}/search")
def semantic_search(repository_id: str, request: SearchRequest):
    embedding = embed_texts([request.query])[0]
    results = query_chunks(repository_id, embedding, request.limit)
    return {"results": results}


@app.delete("/repositories/{repository_id}/purge")
def purge_repository(repository_id: str):
    """ENH-001: Delete the ChromaDB collection for a repository (called on repo deletion)."""
    delete_collection(repository_id)
    return {"purged": True, "repositoryId": repository_id}


def _embedding_text(chunk: dict) -> str:
    symbol = chunk.get("symbol") or {}
    return "\n".join(
        [
            f"file: {chunk['filePath']}",
            f"language: {chunk['language']}",
            f"symbol: {symbol.get('name', '')}",
            chunk["content"],
        ]
    )
