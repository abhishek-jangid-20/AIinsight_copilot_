"""
---------------------------------------------------------
File: models.py
Location: services/common/models.py
---------------------------------------------------------

Purpose:
  Defines the shared data schemas (Pydantic models) used across
  all Python microservices for validation and serialization.

Responsibilities:
- Declares the structure of AST artifacts (symbols, chunks, files).
- Enforces data validation rules during inter-service JSON exchanges.
- Standardizes incoming REST payloads (SearchRequest, RagRequest).
"""

from __future__ import annotations

from typing import Literal
from pydantic import BaseModel, Field


class CodeSymbol(BaseModel):
    """
    Represents an extracted code symbol block (e.g., class, function, method).
    """
    name: str
    kind: Literal["function", "class", "method", "api", "import"]
    filePath: str
    startLine: int
    endLine: int
    signature: str | None = None


class CodeChunk(BaseModel):
    """
    Represents a code snippet stored in the vector database.
    """
    id: str
    repositoryId: str
    filePath: str
    language: str
    startLine: int
    endLine: int
    content: str
    symbol: CodeSymbol | None = None
    # default_factory=list ensures a fresh list is created for every instance
    imports: list[str] = Field(default_factory=list)


class DependencyEdge(BaseModel):
    """
    Represents a dependency relationship between code files and symbols.
    """
    source: str
    target: str
    kind: Literal["imports", "calls", "contains", "api"]


class RepositoryFile(BaseModel):
    """
    Represents a file parsed from a codebase.
    """
    path: str
    language: str
    size: int
    content: str | None = None


class RepositoryAnalysis(BaseModel):
    """
    Represents the output payload of a codebase analysis run.
    """
    repositoryId: str
    files: list[RepositoryFile]
    chunks: list[CodeChunk]
    symbols: list[CodeSymbol]
    dependencies: list[DependencyEdge]
    summary: dict


class SearchRequest(BaseModel):
    """
    Represents a semantic vector search query.
    """
    query: str
    limit: int = 8


class RagRequest(BaseModel):
    """
    Represents a RAG-grounded chat completion query.
    """
    query: str
    chatId: str | None = None
