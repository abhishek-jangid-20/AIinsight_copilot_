from __future__ import annotations

import ast
import hashlib
import re
import shutil
import tempfile
import zipfile
from pathlib import Path

from fastapi import FastAPI, HTTPException
from git import Repo
from pydantic import BaseModel

from common.models import CodeChunk, CodeSymbol, DependencyEdge, RepositoryAnalysis, RepositoryFile

app = FastAPI(title="CodeInsight Repository Parser", version="0.1.0")

SUPPORTED = {
    ".js": "JavaScript",
    ".jsx": "JavaScript",
    ".ts": "TypeScript",
    ".tsx": "TypeScript",
    ".py": "Python",
    ".cpp": "C++",
    ".cc": "C++",
    ".hpp": "C++",
    ".h": "C++",
    ".java": "Java",
}
CONFIG_FILES = {"package.json", "requirements.txt", "pyproject.toml", "pom.xml", "build.gradle", "docker-compose.yml", "Dockerfile"}
IGNORE_DIRS = {".git", "node_modules", "dist", "build", ".venv", "venv", "__pycache__", "target", ".next"}

# GitHub URL pattern — only allow standard github.com URLs
GITHUB_URL_RE = re.compile(r"^https?://(?:www\.)?github\.com/([^/]+)/([^/]+)", re.IGNORECASE)


class ParseRequest(BaseModel):
    repositoryId: str
    name: str
    sourceType: str
    sourceUrl: str | None = None
    archivePath: str | None = None


@app.get("/health")
def health():
    return {"ok": True, "service": "repository-parser-service"}


@app.post("/parse", response_model=RepositoryAnalysis)
def parse_repository(request: ParseRequest):
    workdir = Path(tempfile.mkdtemp(prefix="codeinsight-"))
    try:
        root = _materialize_repository(request, workdir)
        files: list[RepositoryFile] = []
        chunks: list[CodeChunk] = []
        symbols: list[CodeSymbol] = []
        dependencies: list[DependencyEdge] = []
        languages: dict[str, int] = {}

        for file_path in _iter_source_files(root):
            relative = file_path.relative_to(root).as_posix()
            language = SUPPORTED.get(file_path.suffix.lower(), "Config")
            content = file_path.read_text(encoding="utf-8", errors="ignore")
            lines = content.splitlines()
            languages[language] = languages.get(language, 0) + 1
            files.append(RepositoryFile(path=relative, language=language, size=len(content), content=content[:200_000]))

            file_symbols = _extract_symbols(relative, language, content)
            imports = _extract_imports(language, content)
            symbols.extend(file_symbols)
            dependencies.extend(DependencyEdge(source=relative, target=dep, kind="imports") for dep in imports)

            for symbol in file_symbols:
                dependencies.append(DependencyEdge(source=relative, target=symbol.name, kind="contains"))

            chunks.extend(_chunk_file(request.repositoryId, relative, language, lines, imports, file_symbols))

        # Deduplicate chunks by ID to prevent ChromaDB DuplicateIDError
        seen_chunk_ids: set[str] = set()
        unique_chunks: list[CodeChunk] = []
        for chunk in chunks:
            if chunk.id not in seen_chunk_ids:
                seen_chunk_ids.add(chunk.id)
                unique_chunks.append(chunk)
        chunks = unique_chunks

        return RepositoryAnalysis(
            repositoryId=request.repositoryId,
            files=files,
            chunks=chunks,
            symbols=symbols,
            dependencies=dependencies,
            summary={
                "languages": languages,
                "fileCount": len(files),
                "chunkCount": len(chunks),
                "symbolCount": len(symbols),
            },
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def _materialize_repository(request: ParseRequest, workdir: Path) -> Path:
    if request.sourceType == "github":
        if not request.sourceUrl:
            raise ValueError("sourceUrl is required for GitHub repositories")
        target = workdir / "repo"

        # Normalize and parse GitHub URL — SEC-004: only allow github.com
        url = request.sourceUrl.strip().rstrip("/")
        match = GITHUB_URL_RE.match(url)
        if not match:
            raise ValueError(
                "Only standard github.com URLs are supported "
                "(e.g. https://github.com/owner/repo). "
                f"Got: {url!r}"
            )

        owner = match.group(1)
        repo = match.group(2)
        if repo.endswith(".git"):
            repo = repo[:-4]

        # FIX-017: Strict allowlist on owner/repo to prevent path traversal or
        # unexpected git behaviour. GitHub itself enforces these rules.
        _SEGMENT_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")
        for segment_name, segment_value in (("owner", owner), ("repo", repo)):
            if not _SEGMENT_RE.match(segment_value) or ".." in segment_value:
                raise ValueError(
                    f"Invalid {segment_name} segment {segment_value!r} in GitHub URL. "
                    "Only alphanumerics, hyphens, underscores and single dots are allowed."
                )

        clone_url = f"https://github.com/{owner}/{repo}.git"

        # Check if there is a branch specified in the tree/blob part
        branch: str | None = None
        path_parts = url.split(f"github.com/{owner}/{repo}/")
        if len(path_parts) > 1:
            rest = path_parts[1]
            if rest.startswith("tree/") or rest.startswith("blob/"):
                rest_parts = rest.split("/", 1)
                if len(rest_parts) > 1:
                    branch_and_path = rest_parts[1]
                    branch = branch_and_path.split("/")[0]

        try:
            if branch:
                Repo.clone_from(clone_url, target, depth=1, branch=branch)
            else:
                Repo.clone_from(clone_url, target, depth=1)
        except Exception as e:
            # Fallback: if cloning with branch failed, try cloning the base repo default branch
            if branch:
                try:
                    Repo.clone_from(clone_url, target, depth=1)
                except Exception as fallback_err:
                    raise ValueError(f"Failed to clone repository: {str(fallback_err)}") from fallback_err
            else:
                raise ValueError(f"Failed to clone repository: {str(e)}") from e

        return target

    if request.sourceType == "zip":
        if not request.archivePath or not Path(request.archivePath).exists():
            raise ValueError("archivePath is required for ZIP repositories")
        target = workdir / "repo"
        target.mkdir()
        with zipfile.ZipFile(request.archivePath) as archive:
            archive.extractall(target)
        children = [child for child in target.iterdir() if child.is_dir()]
        return children[0] if len(children) == 1 else target

    raise ValueError(f"Unsupported sourceType {request.sourceType}")


def _iter_source_files(root: Path):
    for path in root.rglob("*"):
        if any(part in IGNORE_DIRS for part in path.parts):
            continue
        if path.is_file() and (path.suffix.lower() in SUPPORTED or path.name in CONFIG_FILES) and path.stat().st_size <= 1_000_000:
            yield path


def _extract_symbols(file_path: str, language: str, content: str) -> list[CodeSymbol]:
    if language == "Python":
        try:
            return _extract_python_symbols(file_path, content)
        except SyntaxError:
            return []

    symbols: list[CodeSymbol] = []
    patterns = [
        ("class", re.compile(r"^\s*(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_][\w]*)", re.MULTILINE)),
        ("function", re.compile(r"^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_][\w]*)", re.MULTILINE)),
        ("function", re.compile(r"^\s*(?:public|private|protected|static|\s)*[\w<>\[\]]+\s+([A-Za-z_][\w]*)\s*\([^;]*\)\s*\{", re.MULTILINE)),
        ("api", re.compile(r"\b(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*['\"]([^'\"]+)", re.MULTILINE)),
    ]
    lines = content.splitlines()
    for kind, pattern in patterns:
        for match in pattern.finditer(content):
            line_no = content[: match.start()].count("\n") + 1
            name = match.group(2) if kind == "api" and match.lastindex and match.lastindex >= 2 else match.group(1)
            # BUG-007 / LOGIC-001: Use real brace-based block end for C-style languages; shorter window for API routes
            if kind == "api":
                end_line = min(len(lines), line_no + 20)
            else:
                end_line = _find_block_end(lines, line_no)
            symbols.append(CodeSymbol(name=name, kind=kind, filePath=file_path, startLine=line_no, endLine=end_line))
    return symbols


def _extract_python_symbols(file_path: str, content: str) -> list[CodeSymbol]:
    """FIX-006: Correctly label class methods as 'method', not 'function'."""
    symbols: list[CodeSymbol] = []
    tree = ast.parse(content)

    # Collect all ClassDef child function names so we can distinguish methods
    method_nodes: set[int] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef):
            for child in ast.walk(node):
                if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)) and child is not node:
                    method_nodes.add(id(child))

    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef):
            symbols.append(CodeSymbol(
                name=node.name,
                kind="class",
                filePath=file_path,
                startLine=node.lineno,
                endLine=getattr(node, "end_lineno", node.lineno),
            ))
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            kind = "method" if id(node) in method_nodes else "function"
            symbols.append(CodeSymbol(
                name=node.name,
                kind=kind,
                filePath=file_path,
                startLine=node.lineno,
                endLine=getattr(node, "end_lineno", node.lineno),
            ))
    return symbols


def _extract_imports(language: str, content: str) -> list[str]:
    imports: set[str] = set()
    if language == "Python":
        try:
            tree = ast.parse(content)
        except SyntaxError:
            return []
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                imports.update(alias.name for alias in node.names)
            elif isinstance(node, ast.ImportFrom) and node.module:
                imports.add(node.module)
    else:
        for pattern in [r"import\s+.*?\s+from\s+['\"]([^'\"]+)", r"import\s+['\"]([^'\"]+)", r"#include\s+[<\"]([^>\"]+)"]:
            imports.update(re.findall(pattern, content))
    return sorted(imports)


def _chunk_file(repository_id: str, file_path: str, language: str, lines: list[str], imports: list[str], symbols: list[CodeSymbol]) -> list[CodeChunk]:
    chunks: list[CodeChunk] = []
    symbol_ranges = sorted(symbols, key=lambda item: item.startLine)

    # Build a set of covered line numbers from symbols
    covered_lines: set[int] = set()
    for symbol in symbol_ranges:
        content = "\n".join(lines[symbol.startLine - 1 : symbol.endLine])
        if content.strip():
            chunks.append(_chunk(repository_id, file_path, language, symbol.startLine, symbol.endLine, content, imports, symbol))
            covered_lines.update(range(symbol.startLine, symbol.endLine + 1))

    # FIX-012: Only generate sliding-window chunks for lines NOT already fully covered by
    # symbols. Partial coverage (< 80% overlap) still emits a window to catch file-level code.
    window = 120
    for start in range(1, len(lines) + 1, window):
        end = min(start + window - 1, len(lines))
        window_lines = set(range(start, end + 1))
        overlap = len(window_lines & covered_lines)
        # Skip if >= 80% of this window is already covered by a symbol chunk
        if covered_lines and overlap / len(window_lines) >= 0.8:
            continue
        content = "\n".join(lines[start - 1 : end])
        if content.strip():
            chunks.append(_chunk(repository_id, file_path, language, start, end, content, imports, None))

    return chunks


def _chunk(repository_id: str, file_path: str, language: str, start: int, end: int, content: str, imports: list[str], symbol: CodeSymbol | None):
    digest = hashlib.sha1(f"{file_path}:{start}:{end}:{content[:80]}".encode()).hexdigest()[:12]
    return CodeChunk(id=f"{repository_id}:{digest}", repositoryId=repository_id, filePath=file_path, language=language, startLine=start, endLine=end, content=content[:12000], symbol=symbol, imports=imports)


def _find_block_end(lines: list[str], start_line: int) -> int:
    """
    FIX-005: Find the real end of a code block for C-style languages (JS/TS/Java/C++)
    by counting brace depth, correctly skipping brace characters inside string literals
    (single-quote, double-quote, backtick) and single-line // comments.
    Falls back to start + 80 if no balanced braces are found.
    """
    total = len(lines)
    depth = 0
    found_open = False

    for i in range(start_line - 1, min(start_line + 300, total)):
        line = lines[i]
        in_string: str | None = None  # tracks the opening quote character
        j = 0
        while j < len(line):
            ch = line[j]

            # Detect start / end of a string literal
            if in_string is None:
                # Single-line comment: skip the rest of the line
                if ch == "/" and j + 1 < len(line) and line[j + 1] == "/":
                    break
                if ch in ('"', "'", "`"):
                    in_string = ch
            else:
                # Escaped character inside a string — skip next char
                if ch == "\\":
                    j += 2
                    continue
                if ch == in_string:
                    in_string = None
                j += 1
                continue

            if ch == "{":
                depth += 1
                found_open = True
            elif ch == "}":
                depth -= 1
                if found_open and depth <= 0:
                    return i + 1  # 1-indexed
            j += 1

    # Fallback: cap at start + 80 if no balanced braces found
    return min(total, start_line + 80)
