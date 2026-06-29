from __future__ import annotations

import os
from functools import lru_cache
from typing import Any

import chromadb


@lru_cache(maxsize=1)
def _get_client() -> chromadb.Client:
    """Return a singleton ChromaDB client — created once, reused across all calls."""
    host = os.getenv("CHROMA_HOST")
    port = int(os.getenv("CHROMA_PORT", "8000"))
    if host:
        return chromadb.HttpClient(host=host, port=port)
    return chromadb.PersistentClient(path=os.getenv("CHROMA_PATH", "/data/chroma"))


def get_collection(repository_id: str):
    """Get or create the ChromaDB collection for a repository."""
    client = _get_client()
    return client.get_or_create_collection(name=f"repo_{repository_id}")


def delete_collection(repository_id: str) -> None:
    """Delete the ChromaDB collection for a repository (called on repo deletion)."""
    client = _get_client()
    try:
        client.delete_collection(name=f"repo_{repository_id}")
    except Exception:
        pass  # Collection may not exist yet if indexing never completed


def upsert_chunks(repository_id: str, chunks: list[dict[str, Any]], embeddings: list[list[float]]):
    collection = get_collection(repository_id)
    if not chunks:
        return {"indexed": 0}

    collection.upsert(
        ids=[chunk["id"] for chunk in chunks],
        documents=[chunk["content"] for chunk in chunks],
        embeddings=embeddings,
        metadatas=[
            {
                "filePath": chunk["filePath"],
                "language": chunk["language"],
                "startLine": chunk["startLine"],
                "endLine": chunk["endLine"],
                "symbol": (chunk.get("symbol") or {}).get("name", ""),
            }
            for chunk in chunks
        ],
    )
    return {"indexed": len(chunks)}


def query_chunks(repository_id: str, query_embedding: list[float], limit: int):
    collection = get_collection(repository_id)
    results = collection.query(query_embeddings=[query_embedding], n_results=limit)
    # FIX-004: Guard against empty results — ChromaDB may return [] for ids when the
    # collection has no documents; indexing into [] with [0] raises IndexError.
    ids_list = (results.get("ids") or [[]])[0]
    documents_list = (results.get("documents") or [[]])[0]
    distances_list = (results.get("distances") or [[]])[0]
    metadatas_list = (results.get("metadatas") or [[]])[0]
    rows = []
    for index, chunk_id in enumerate(ids_list):
        metadata = metadatas_list[index] if index < len(metadatas_list) else {}
        rows.append(
            {
                "id": chunk_id,
                "content": documents_list[index] if index < len(documents_list) else "",
                "distance": distances_list[index] if index < len(distances_list) else 0.0,
                "metadata": metadata or {},
            }
        )
    return rows
