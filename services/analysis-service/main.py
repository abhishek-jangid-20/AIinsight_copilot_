from __future__ import annotations

from fastapi import FastAPI
from pydantic import BaseModel

from common.models import RepositoryAnalysis

app = FastAPI(title="CodeInsight Analysis Service", version="0.1.0")


class ExplainRequest(BaseModel):
    filePath: str
    symbolName: str | None = None
    analysis: RepositoryAnalysis


@app.get("/health")
def health():
    return {"ok": True, "service": "analysis-service"}


@app.post("/repositories/{repository_id}/graph")
def graph(repository_id: str, analysis: RepositoryAnalysis):
    file_nodes = [{"id": file.path, "type": "file", "label": file.path, "language": file.language} for file in analysis.files]
    symbol_nodes = [
        {"id": f"{symbol.filePath}:{symbol.name}", "type": symbol.kind, "label": symbol.name, "filePath": symbol.filePath}
        for symbol in analysis.symbols[:250]
    ]
    edges = []
    for edge in analysis.dependencies[:500]:
        target = edge.target
        if edge.kind == "contains":
            target = f"{edge.source}:{edge.target}"
        edges.append({"id": f"{edge.source}->{target}:{edge.kind}", "source": edge.source, "target": target, "label": edge.kind})
    return {"repositoryId": repository_id, "nodes": file_nodes + symbol_nodes, "edges": edges}


@app.post("/repositories/{repository_id}/explain")
def explain(repository_id: str, request: ExplainRequest):
    candidates = [
        symbol for symbol in request.analysis.symbols
        if symbol.filePath == request.filePath and (request.symbolName is None or symbol.name == request.symbolName)
    ]
    related_edges = [edge for edge in request.analysis.dependencies if edge.source == request.filePath or edge.target == request.filePath]
    file_info = next((file for file in request.analysis.files if file.path == request.filePath), None)

    return {
        "repositoryId": repository_id,
        "filePath": request.filePath,
        "symbols": candidates,
        "dependencies": related_edges,
        "purpose": _purpose(file_info, candidates),
    }


def _purpose(file_info, symbols: list) -> str:
    """
    LOGIC-010: Generate a meaningful purpose description for a file.
    Describes the module's role based on its symbols and structural position,
    rather than returning raw source code.
    """
    if not file_info:
        return "No source information available for this module."

    names = [s.name for s in symbols[:8]]
    kinds: dict[str, list[str]] = {}
    for sym in symbols[:8]:
        kinds.setdefault(sym.kind, []).append(sym.name)

    parts: list[str] = []

    if kinds.get("class"):
        parts.append(f"Defines classes: {', '.join(kinds['class'])}")
    if kinds.get("function"):
        parts.append(f"Exports functions: {', '.join(kinds['function'])}")
    if kinds.get("api"):
        parts.append(f"Exposes API routes: {', '.join(kinds['api'])}")

    lang = file_info.language
    path = file_info.path
    size_kb = round(file_info.size / 1024, 1)

    header = f"{path} ({lang}, {size_kb} KB)"

    if parts:
        return f"{header} — " + "; ".join(parts) + "."

    # Fallback: summarize the first meaningful comment or docstring lines
    content = file_info.content or ""
    comment_lines = []
    for line in content.splitlines()[:30]:
        stripped = line.strip()
        if stripped.startswith(("//", "#", "/*", "*", '"""', "'''")):
            cleaned = stripped.lstrip("/*#\"'").strip()
            if cleaned:
                comment_lines.append(cleaned)
        if len(comment_lines) >= 3:
            break

    if comment_lines:
        return f"{header} — " + " ".join(comment_lines[:3])

    return f"{header} — No documented purpose found. Review the source for context."
