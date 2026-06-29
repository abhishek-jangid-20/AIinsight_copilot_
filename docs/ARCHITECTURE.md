# CodeInsight AI Architecture

## Ingestion

1. The gateway creates a repository record in MongoDB.
2. The parser service clones the GitHub repository or extracts a ZIP archive.
3. Source files are scanned for JavaScript, TypeScript, Python, C++, and Java.
4. The parser extracts symbols, imports, API routes, dependency edges, and semantic chunks.
5. The embedding service embeds chunks with sentence-transformers or CodeBERT-compatible models.
6. Chunks, metadata, and vectors are stored in ChromaDB.

## Querying

1. The user submits a repository question.
2. The RAG service embeds the query.
3. ChromaDB returns the most relevant code chunks.
4. The service builds a grounded prompt with file and line citations.
5. The selected provider streams the final answer back through the gateway.

## Providers

The LLM abstraction currently supports:

- Groq via OpenAI-compatible streaming
- OpenRouter via OpenAI-compatible streaming
- Gemini via `generateContent`
- Offline fallback for local demos without an API key
