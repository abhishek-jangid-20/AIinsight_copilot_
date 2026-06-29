from __future__ import annotations

from typing import Literal
from pydantic import BaseModel, Field


class CodeSymbol(BaseModel):
    name: str
    kind: Literal["function", "class", "method", "api", "import"]
    filePath: str
    startLine: int
    endLine: int
    signature: str | None = None


class CodeChunk(BaseModel):
    id: str
    repositoryId: str
    filePath: str
    language: str
    startLine: int
    endLine: int
    content: str
    symbol: CodeSymbol | None = None
    imports: list[str] = Field(default_factory=list)


class DependencyEdge(BaseModel):
    source: str
    target: str
    kind: Literal["imports", "calls", "contains", "api"]


class RepositoryFile(BaseModel):
    path: str
    language: str
    size: int
    content: str | None = None


class RepositoryAnalysis(BaseModel):
    repositoryId: str
    files: list[RepositoryFile]
    chunks: list[CodeChunk]
    symbols: list[CodeSymbol]
    dependencies: list[DependencyEdge]
    summary: dict


class SearchRequest(BaseModel):
    query: str
    limit: int = 8


class RagRequest(BaseModel):
    query: str
    chatId: str | None = None
