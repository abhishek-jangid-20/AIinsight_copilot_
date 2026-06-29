from __future__ import annotations

import hashlib
import os
from functools import lru_cache

import numpy as np


@lru_cache(maxsize=1)
def _load_sentence_transformer():
    model_name = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")
    if model_name.lower() == "mock":
        return None
    try:
        from sentence_transformers import SentenceTransformer
        return SentenceTransformer(model_name)
    except Exception:
        return None


def embed_texts(texts: list[str]) -> list[list[float]]:
    model = _load_sentence_transformer()
    if model is not None:
        vectors = model.encode(texts, normalize_embeddings=True)
        return vectors.tolist()
    return [_hash_embedding(text) for text in texts]


def _hash_embedding(text: str, dimensions: int = 384) -> list[float]:
    vector = np.zeros(dimensions, dtype=np.float32)
    for token in text.lower().split():
        digest = hashlib.sha256(token.encode("utf-8")).digest()
        index = int.from_bytes(digest[:4], "little") % dimensions
        vector[index] += 1.0
    norm = np.linalg.norm(vector)
    if norm > 0:
        vector = vector / norm
    return vector.tolist()
