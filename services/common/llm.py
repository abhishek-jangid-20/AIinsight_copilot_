"""
---------------------------------------------------------
File: llm.py
Location: services/common/llm.py
---------------------------------------------------------

Purpose:
  Shared library abstraction managing connections to LLM providers
  (Groq, OpenRouter, Gemini, and offline mocks).

Responsibilities:
- Directs prompt parameters across multiple AI provider SDK APIs.
- Streams responses back token-by-token.
- Formats payloads conforming to OpenAI compatible or Gemini API conventions.
- Exposes offline mock fallbacks for testing.
"""

from __future__ import annotations

import json
import os
from typing import AsyncIterator

import httpx


async def complete(prompt: str, system: str = "You are a precise repository intelligence assistant.") -> str:
    """
    Synchronous-like wrapper returning the fully concatenated token completion.
    """
    chunks = []
    async for chunk in stream_complete(prompt, system):
        chunks.append(chunk)
    return "".join(chunks)


async def stream_complete(prompt: str, system: str = "You are a precise repository intelligence assistant.") -> AsyncIterator[str]:
    """
    Asynchronous token stream generator.
    Routes queries based on LLM_PROVIDER environmental variables.
    """
    provider = os.getenv("LLM_PROVIDER", "mock").lower()
    
    # ── Option A: Groq Cloud API ──
    if provider == "groq" and os.getenv("GROQ_API_KEY"):
        async for token in _stream_openai_compatible(
            "https://api.groq.com/openai/v1/chat/completions",
            os.environ["GROQ_API_KEY"],
            os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
            prompt,
            system,
        ):
            yield token
        return
        
    # ── Option B: OpenRouter API ──
    if provider == "openrouter" and os.getenv("OPENROUTER_API_KEY"):
        async for token in _stream_openai_compatible(
            "https://openrouter.ai/api/v1/chat/completions",
            os.environ["OPENROUTER_API_KEY"],
            os.getenv("OPENROUTER_MODEL", "anthropic/claude-3.5-sonnet"),
            prompt,
            system,
        ):
            yield token
        return
        
    # ── Option C: Google Gemini API ──
    if provider == "gemini" and os.getenv("GEMINI_API_KEY"):
        yield await _complete_gemini(prompt, system)
        return

    # ── Option D: Offline Mode (No APIs configured) ──
    yield _offline_answer(prompt)


async def _stream_openai_compatible(url: str, api_key: str, model: str, prompt: str, system: str) -> AsyncIterator[str]:
    """
    Streams content from OpenAI-compatible Server-Sent Event (SSE) endpoints.
    """
    payload = {
        "model": model,
        "stream": True,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}],
    }
    # Using 60-second timeouts to prevent API locks if model queries take long to answer.
    async with httpx.AsyncClient(timeout=60) as client:
        async with client.stream("POST", url, headers={"authorization": f"Bearer {api_key}"}, json=payload) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                # Parse lines starting with "data: " and skip the termination packet "data: [DONE]"
                if not line.startswith("data: ") or line == "data: [DONE]":
                    continue
                data = line[6:]
                try:
                    token = json.loads(data)["choices"][0]["delta"].get("content")
                    if token:
                        yield token
                except Exception:
                    continue


async def _complete_gemini(prompt: str, system: str) -> str:
    """
    Queries Google Gemini API endpoints.
    """
    key = os.environ["GEMINI_API_KEY"]
    model = os.getenv("GEMINI_MODEL", "gemini-1.5-pro")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"
    
    # Formulate Gemini-specific systemInstruction payload structures
    payload = {"systemInstruction": {"parts": [{"text": system}]}, "contents": [{"parts": [{"text": prompt}]}]}
    
    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.post(url, json=payload)
        response.raise_for_status()
        data = response.json()
        return data["candidates"][0]["content"]["parts"][0]["text"]


def _offline_answer(prompt: str) -> str:
    """
    Fallback offline echo method.
    
    Why?
    * Prevents runtime exceptions if API keys are missing.
    """
    return (
        "LLM provider is not configured, so this offline response summarizes the retrieved repository context.\n\n"
        + prompt[:3000]
    )
