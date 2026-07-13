"""
---------------------------------------------------------
File: main.py
Location: services/minigpt-service/main.py
---------------------------------------------------------

Purpose:
  FastAPI service exposing API routes to configure, train, and generate text
  from a custom toy GPT model in real-time.

Responsibilities:
- Implements multi-tenant session isolation so multiple users can train separate models.
- Parses dataset corpuses (Shakespeare, Finance, WikiText).
- Exposes routes to initialize models, run backpropagation steps, and sample generated text.
- Serves cached WikiText datasets.

Related Files:
- server/src/routes/minigpt.js (Gateway proxy router)
- services/minigpt-service/model.py (GPT model class)
"""

from __future__ import annotations
from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel
from typing import Any

try:
    from service.model import LabSession
except ImportError:
    from model import LabSession

app = FastAPI(title="CodeInsight MiniGPT Service", version="0.1.0")

import os

# Multi-tenant state: Keyed by user_id to ensure separate training scopes
_sessions: dict[str, LabSession] = {}

# Try to load custom sample text, otherwise fallback to hardcoded string
sample_path = os.path.join(os.path.dirname(__file__), "sample_dataset.txt")
if os.path.exists(sample_path):
    with open(sample_path, "r", encoding="utf-8") as f:
        DEFAULT_CORPUS = f.read()
else:
    DEFAULT_CORPUS = (
        "SYSTEM: Hello Creator. I am now active.\n"
        "CREATOR: Hello. Can you hear me clearly?\n"
        "SYSTEM: Yes. Signals stabilized.\n"
    )


def _get_user_id(request: Request) -> str:
    """Extract user identifier from X-User-Id header (set by the gateway from JWT claims)."""
    user_id = request.headers.get("x-user-id", "anonymous")
    return user_id


class InitRequest(BaseModel):
    text: str | None = None
    n_layer: int = 2
    n_head: int = 4
    n_embd: int = 64
    block_size: int = 32

class TrainRequest(BaseModel):
    lr: float = 1e-3
    batch_size: int = 16
    steps: int = 5

class GenerateRequest(BaseModel):
    seed: str = " "
    max_new_tokens: int = 50
    temperature: float = 1.0
    top_k: int = 10


@app.get("/health")
def health():
    return {"ok": True, "service": "minigpt-service"}


@app.post("/lab/init")
def init_lab(req: InitRequest, request: Request):
    """
    Spawns a new model architecture instance for the requesting user, resetting their logs.
    """
    user_id = _get_user_id(request)
    text = req.text if (req.text and req.text.strip()) else DEFAULT_CORPUS

    try:
        session = LabSession(
            text=text,
            n_layer=req.n_layer,
            n_head=req.n_head,
            n_embd=req.n_embd,
            block_size=req.block_size
        )
        _sessions[user_id] = session
        return {
            "initialized": True,
            "vocabSize": session.tokenizer.vocab_size,
            "chars": session.tokenizer.chars,
            "corpusLength": len(text),
            "hyperparameters": {
                "n_layer": session.n_layer,
                "n_head": session.n_head,
                "n_embd": session.n_embd,
                "block_size": session.block_size
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to initialize lab: {str(e)}")


@app.post("/lab/train-step")
def train_step(req: TrainRequest, request: Request):
    """
    Executes a configured number of backpropagation training iterations on the user's model.
    """
    user_id = _get_user_id(request)
    session = _sessions.get(user_id)
    if session is None:
        raise HTTPException(status_code=400, detail="Lab session is not initialized. Call /lab/init first.")

    try:
        result = session.train_step(
            lr=req.lr,
            batch_size=req.batch_size,
            steps=req.steps
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Training step failed: {str(e)}")


@app.post("/lab/generate")
def generate_text(req: GenerateRequest, request: Request):
    """
    Samples text autoregressively from the user's model weights.
    """
    user_id = _get_user_id(request)
    session = _sessions.get(user_id)
    if session is None:
        raise HTTPException(status_code=400, detail="Lab session is not initialized. Call /lab/init first.")

    try:
        result = session.generate(
            seed=req.seed,
            max_new_tokens=req.max_new_tokens,
            temperature=req.temperature,
            top_k=req.top_k
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Text generation failed: {str(e)}")


@app.get("/lab/state")
def get_state(request: Request):
    """
    Returns the user's model parameters, step counts, and historical training logs.
    """
    user_id = _get_user_id(request)
    session = _sessions.get(user_id)
    if session is None:
        return {"initialized": False}

    return {
        "initialized": True,
        "vocabSize": session.tokenizer.vocab_size,
        "corpusLength": len(session.text),
        "step": session.step_counter,
        "lossHistory": session.loss_history,
        "hyperparameters": {
            "n_layer": session.n_layer,
            "n_head": session.n_head,
            "n_embd": session.n_embd,
            "block_size": session.block_size
        }
    }


@app.get("/lab/wikitext")
def get_wikitext():
    """
    Loads and returns the public Wikitext corpus file.
    """
    path = os.path.join(os.path.dirname(__file__), "wikitext_dataset.txt")
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return {"text": f.read()}
    raise HTTPException(status_code=404, detail="Wikitext file not found")
