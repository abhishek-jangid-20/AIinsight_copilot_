# CodeInsight AI

CodeInsight AI is a production-oriented repository intelligence platform: upload a GitHub repository or ZIP archive, parse the codebase, generate semantic embeddings, index chunks in ChromaDB, and chat with the repository through a retrieval-augmented AI assistant.

The production assistant uses external LLM providers such as Groq, Gemini, or OpenRouter. The MiniGPT transformer lab is intentionally deferred to Phase 2 and kept separate from the RAG assistant.

## What Is Included

- React, TypeScript, TailwindCSS, Redux Toolkit, React Query, Monaco Editor, React Flow, and Framer Motion frontend
- Node.js and Express API gateway with JWT authentication
- MongoDB persistence for users, repositories, chats, and repository metadata
- FastAPI microservices for repository parsing, embeddings, RAG, documentation, and architecture analysis
- ChromaDB vector storage for repository code chunks
- Docker Compose for the complete local stack

## Architecture

```text
React client
  |
Node/Express API gateway
  |
  |-- repository-parser-service  -> source files, symbols, imports, chunks, dependency edges
  |-- embedding-service          -> CodeBERT/sentence-transformers embeddings + ChromaDB
  |-- rag-service                -> retrieval + streaming LLM responses
  |-- documentation-service      -> README/API/setup/module documentation
  |-- analysis-service           -> React Flow graph data + code explanation payloads
  |
MongoDB + ChromaDB
```

## Quick Start

1. Copy `.env.example` to `.env` and add at least one LLM API key.
2. Run the stack:

```bash
docker compose up --build
```

3. Open `http://localhost:5173`.
4. Sign up, import a GitHub URL or upload a ZIP archive, and wait for status to move from `parsing` to `embedding` to `ready`.

## Local Development

Install JavaScript dependencies:

```bash
npm install
```

Run the gateway and client:

```bash
npm run dev:server
npm run dev:client
```

Run a Python service locally from its service directory:

```bash
cd services/repository-parser-service
set PYTHONPATH=..
pip install -r requirements.txt
uvicorn main:app --reload --port 8101
```

When running outside Docker, start MongoDB and ChromaDB locally or update `.env` with reachable service URLs.

## Phase 1 Scope

Phase 1 focuses on the usable AI developer copilot:

- Repository upload/import
- Source scanning and semantic code chunking
- Symbol, import, API, and dependency extraction
- Vector indexing and semantic search
- Streaming RAG chat
- Documentation generation
- Architecture visualization
- Function/module explanation workflows

## Phase 2 Scope

Phase 2 adds a separate educational MiniGPT transformer lab after the copilot is complete. It should not replace the production RAG assistant. See [docs/PHASE_2_MINIGPT.md](docs/PHASE_2_MINIGPT.md).
