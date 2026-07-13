"""
---------------------------------------------------------
File: embeddings.py
Location: services/common/embeddings.py
---------------------------------------------------------

Purpose:
  Shared library generating vector embeddings for text chunks.

Responsibilities:
- Loads and caches SentenceTransformer models in memory.
- Computes normalized vector embeddings (float arrays).
- Fallbacks to deterministic text hashing if models are not installed.
"""

from __future__ import annotations

import hashlib
import os
from functools import lru_cache

import numpy as np


# LRU Cache Optimization: Caches the model instance in memory.
# Loading a model takes seconds and significant RAM; caching ensures it happens only once.
@lru_cache(maxsize=1)
def _load_sentence_transformer():
    model_name = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")
    if model_name.lower() == "mock":
        return None
    try:
        from sentence_transformers import SentenceTransformer
        return SentenceTransformer(model_name)
    except Exception:
        # Fallback to local hash mock if package is missing or machine is underpowered
        return None


def embed_texts(texts: list[str]) -> list[list[float]]:
    """
    Translates a list of strings into a list of floating-point vectors.
    """
    model = _load_sentence_transformer()
    if model is not None:
        # normalise_embeddings=True scales vectors to length 1.0 (L2 normalized)
        # so dot product matches cosine similarity.
        vectors = model.encode(texts, normalize_embeddings=True)
        return vectors.tolist()
    return [_hash_embedding(text) for text in texts]


def _hash_embedding(text: str, dimensions: int = 384) -> list[float]:
    """
    Mock Fallback Hashing: Generates deterministic mock vectors from input tokens.
    
    Why?
    * Allows the codebase to run out-of-the-box on local dev machines without needing
      CUDA drivers, heavy PyTorch downloads, or external paid API calls.
    """
    vector = np.zeros(dimensions, dtype=np.float32)
    for token in text.lower().split():
        # Hash each token using SHA256 and modulo wrap the index
        digest = hashlib.sha256(token.encode("utf-8")).digest()
        index = int.from_bytes(digest[:4], "little") % dimensions
        vector[index] += 1.0
    norm = np.linalg.norm(vector)
    if norm > 0:
        vector = vector / norm  # L2 normalization
    return vector.tolist()
