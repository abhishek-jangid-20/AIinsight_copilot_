"""
---------------------------------------------------------
File: vector_store.py
Location: services/common/vector_store.py
---------------------------------------------------------

Purpose:
  Shared library interfacing with ChromaDB (vector database).
  Saves and retrieves code segment embeddings for semantic matching.

Responsibilities:
- Reuses client connection singletons via cache decorators.
- Manages collection lifecycles (creation, purging).
- Commits vector arrays and code snippets.
- Queries nearest neighbor vectors with safety bounds.
"""

from __future__ import annotations

import os
from functools import lru_cache
from typing import Any

import chromadb
from chromadb.api import ClientAPI


@lru_cache(maxsize=1)
def _get_client() -> ClientAPI:
    """Return a singleton ChromaDB client — created once, reused across all calls."""
    host = os.getenv("CHROMA_HOST")
    
    # Remote Server vs Local file system fallback
    if host:
        port_raw = os.getenv("CHROMA_PORT")
        port = int(port_raw) if port_raw and port_raw.isdigit() else 8000
        return chromadb.HttpClient(host=host, port=port)
    return chromadb.PersistentClient(path=os.getenv("CHROMA_PATH") or "./chroma")


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
        # Graceful ignore if the collection was never successfully populated
        pass


def upsert_chunks(repository_id: str, chunks: list[dict[str, Any]], embeddings: list[Any]):
    """
    Saves text segments and their calculated embedding vectors into the repository's collection.
    """
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
    """
    Queries ChromaDB to locate the nearest neighbor code blocks.
    """
    collection = get_collection(repository_id)
    results = collection.query(query_embeddings=[query_embedding], n_results=limit)
    
    # Empty results guard: Prevents IndexError if Chroma returns empty lists for new or empty databases.
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
