"""
---------------------------------------------------------
Folder: services/
Location: client/src/../services/
---------------------------------------------------------

Folder Purpose:
  The `services` folder houses the Python microservices that execute CPU-intensive
  tasks like AST parsing, OpenAI embeddings computation, Chroma vector DB storage,
  and AI documentation generation.

---------------------------------------------------------
File: main.py
Location: services/analysis-service/main.py
---------------------------------------------------------

Purpose:
  FastAPI service responsible for generating codebase dependency graphs
  and computing structural code explanations.

Responsibilities:
- Maps files and AST relationships into nodes and edges for visualization.
- Extracts and formats structural summaries of file objects.
- Parses code docstrings to fetch file purpose summaries if structural symbols are absent.

Related Files:
- server/src/routes/repositories.js (Invokes /graph and /explain gateway proxies)
- services/common/models.py (Provides RepositoryAnalysis schemas)
"""

from __future__ import annotations

from fastapi import FastAPI
from pydantic import BaseModel

from common.models import RepositoryAnalysis

app = FastAPI(title="CodeInsight Analysis Service", version="0.1.0")


# Pydantic Model: Defines validation schemas for incoming file explanation requests
class ExplainRequest(BaseModel):
    filePath: str
    symbolName: str | None = None
    analysis: RepositoryAnalysis


@app.get("/health")
def health():
    return {"ok": True, "service": "analysis-service"}


@app.post("/repositories/{repository_id}/graph")
def graph(repository_id: str, analysis: RepositoryAnalysis):
    """
    Constructs a visual graph representation of the codebase using files and symbols.
    
    Optimization Constraints:
    - Symbols are capped at 250 and dependencies at 500 to keep the resulting graph
      lightweight for client-side rendering.
    """
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
    """
    Queries code symbols and imports to output a file-level analysis summary.
    """
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
    Generates a concise textual description of a file based on its structural properties.
    
    Process:
    1. Check for files metadata. If none, exit.
    2. Group symbols by type (classes, functions, api routes).
    3. If symbols exist, format a summary string showing exports.
    4. Fallback: Parse the first 30 lines of code content looking for comments or docstrings.
       Return the first 3 lines of comments as a fallback description.
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

    # Fallback: Parse the first 30 lines of code content looking for comments or docstrings.
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
