"""
---------------------------------------------------------
File: main.py
Location: services/rag-service/main.py
---------------------------------------------------------

Purpose:
  FastAPI service implementing Retrieval-Augmented Generation (RAG) code chat.
  Finds relevant code segments for user queries and streams AI answers.

Responsibilities:
- Generates query embeddings and queries ChromaDB for top similarity matches.
- Compiles context-grounded prompts for LLMs.
- Streams responses back to API gateway using Server-Sent Events (SSE).
- Appends symbol citations tracking source files and line ranges.

Related Files:
- server/src/routes/repositories.js (Proxies client chats to chat/stream)
- services/common/embeddings.py (Computes query vectors)
- services/common/vector_store.py (Queries ChromaDB collections)
"""

from __future__ import annotations

import json

from fastapi import FastAPI
from fastapi.responses import StreamingResponse

from common.embeddings import embed_texts
from common.llm import stream_complete
from common.models import RagRequest
from common.vector_store import query_chunks

app = FastAPI(title="CodeInsight RAG Service", version="0.1.0")


@app.get("/health")
def health():
    return {"ok": True, "service": "rag-service"}


@app.post("/repositories/{repository_id}/chat/stream")
async def chat_stream(repository_id: str, request: RagRequest):
    """
    RAG Chat Stream Endpoint.
    
    Process:
    1. Vectorizes the user's question.
    2. Queries ChromaDB for the 8 most similar code blocks.
    3. Builds a grounded prompt injecting these code blocks as context.
    4. Streams the LLM output token-by-token using an async generator.
    5. Appends citation metadata at the end of the stream.
    """
    embedding = embed_texts([request.query])[0]
    contexts = query_chunks(repository_id, embedding, 8)
    prompt = _build_prompt(request.query, contexts)

    # Async Generator: progressively yields data chunks to client
    async def events():
        async for token in stream_complete(prompt):
            # Escape literal newlines: The SSE protocol relies on double newlines (\n\n)
            # to separate packets. Unescaped newlines in token chunks would break the SSE parser.
            escaped_token = token.replace("\n", "\\n")
            yield f"data: {escaped_token}\n\n"
            
        # Append Citations metadata
        citations = [
            {
                "filePath": item["metadata"].get("filePath"),
                "startLine": item["metadata"].get("startLine"),
                "endLine": item["metadata"].get("endLine"),
            }
            for item in contexts
        ]
        yield f"event: citations\ndata: {json.dumps(citations)}\n\n"
        yield "event: done\ndata: {}\n\n"

    return StreamingResponse(events(), media_type="text/event-stream")


def _build_prompt(query: str, contexts: list[dict]) -> str:
    """
    Grounds the LLM prompt with the retrieved code segments, asking it to cite source locations.
    """
    context_text = "\n\n".join(
        f"[{idx + 1}] {item['metadata'].get('filePath')}:{item['metadata'].get('startLine')}-{item['metadata'].get('endLine')}\n{item['content']}"
        for idx, item in enumerate(contexts)
    )
    return f"""Answer the developer's repository question using only the retrieved code context.
Be specific, cite file paths and line ranges, and call out uncertainty.

Question:
{query}

Retrieved context:
{context_text}
"""
