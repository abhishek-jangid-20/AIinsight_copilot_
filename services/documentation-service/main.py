"""
---------------------------------------------------------
File: main.py
Location: services/documentation-service/main.py
---------------------------------------------------------

Purpose:
  FastAPI service coordinating codebase documentation generation.
  Uses OpenAI/LLM models to write README documentation and aggregates
  setup guidelines and module structural details.

Responsibilities:
- Formats repository inventory parameters into structured prompts.
- Invokes AI chat completion models to generate markdown documents.
- Evaluates file structures to recommend development setup scripts.
- Groups file distributions into module summaries.

Related Files:
- server/src/routes/repositories.js (Triggers documentation generation proxies)
- services/common/llm.py (Shared OpenAI API completion libraries)
"""

from __future__ import annotations

from fastapi import FastAPI

from common.llm import complete
from common.models import RepositoryAnalysis

app = FastAPI(title="CodeInsight Documentation Service", version="0.1.0")


@app.get("/health")
def health():
    return {"ok": True, "service": "documentation-service"}


@app.post("/repositories/{repository_id}/generate")
async def generate_docs(repository_id: str, analysis: RepositoryAnalysis):
    """
    Generates developer documentation (README) and aggregates codebase structures.
    """
    overview = _overview(analysis)
    
    # Prompt Construction: Feed the LLM a structured inventory of the codebase to ground the model and prevent hallucinations.
    prompt = f"""Generate production-quality developer documentation for this repository.
Include README, API notes, architecture summary, setup guide, and module explanations.
Keep it concrete and grounded in the supplied repository inventory.

Repository inventory:
{overview}
"""
    # Call the LLM completion service with a system prompt setting context instructions
    generated = await complete(prompt, system="You write concise, accurate engineering documentation from code analysis.")
    
    return {
        "repositoryId": repository_id,
        "readme": generated,
        "architecture": _architecture_summary(analysis),
        "setup": _setup_guide(analysis),
        "modules": _module_summaries(analysis),
    }


def _overview(analysis: RepositoryAnalysis) -> str:
    """
    Truncates files (first 80) and symbols (first 120) to fit within LLM context windows and control token costs.
    """
    top_files = "\n".join(f"- {file.path} ({file.language})" for file in analysis.files[:80])
    symbols = "\n".join(f"- {symbol.kind}: {symbol.name} in {symbol.filePath}:{symbol.startLine}" for symbol in analysis.symbols[:120])
    return f"Summary: {analysis.summary}\n\nFiles:\n{top_files}\n\nSymbols:\n{symbols}"


def _architecture_summary(analysis: RepositoryAnalysis) -> str:
    """
    Summarizes core languages and file distribution details.
    """
    languages = ", ".join(f"{name}: {count}" for name, count in analysis.summary.get("languages", {}).items())
    return f"This repository contains {analysis.summary.get('fileCount', 0)} source files across {languages}."


def _setup_guide(analysis: RepositoryAnalysis) -> str:
    """
    Inspects files list checking for environment markers to recommend setup commands.
    e.g. package.json suggests npm, while requirements.txt suggests pip.
    """
    paths = {file.path.lower() for file in analysis.files}
    commands = []
    
    if "package.json" in paths:
        commands += ["npm install", "npm run dev"]
    if "requirements.txt" in paths or "pyproject.toml" in paths:
        commands += ["python -m venv .venv", "pip install -r requirements.txt", "uvicorn main:app --reload"]
        
    if not commands:
        commands.append("Inspect project-specific setup files and run the language-appropriate build/test commands.")
        
    return "\n".join(f"- `{command}`" for command in commands)


def _module_summaries(analysis: RepositoryAnalysis):
    """
    Groups file counts and languages by top-level project directories.
    """
    modules: dict[str, dict] = {}
    for file in analysis.files:
        root = file.path.split("/")[0]
        modules.setdefault(root, {"files": 0, "languages": set()})
        modules[root]["files"] += 1
        modules[root]["languages"].add(file.language)
    return [
        {"module": name, "files": data["files"], "languages": sorted(data["languages"])}
        for name, data in sorted(modules.items())
    ]
