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
    embedding = embed_texts([request.query])[0]
    contexts = query_chunks(repository_id, embedding, 8)
    prompt = _build_prompt(request.query, contexts)

    async def events():
        async for token in stream_complete(prompt):
            escaped_token = token.replace("\n", "\\n")
            yield f"data: {escaped_token}\n\n"
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
