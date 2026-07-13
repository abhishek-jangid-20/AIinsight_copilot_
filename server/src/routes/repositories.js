/**
 * ---------------------------------------------------------
 * File: repositories.js
 * Location: server/src/routes/repositories.js
 * ---------------------------------------------------------
 *
 * Purpose:
 *   Handles all API endpoints relating to repository management.
 *   Provides routes to list repositories, clone from GitHub, upload ZIPs,
 *   query file structures, execute semantic search, and start RAG chat dialogues.
 *
 * Responsibilities:
 * - Configures disk storage paths and upload size limit checks using Multer.
 * - Authenticates routes ensuring users can only interact with their own datasets.
 * - Spawns asynchronous ingestion background tasks returning 202 Accepted responses instantly.
 * - Interfaces with microservices (embedding, RAG, analysis, documentation services).
 * - Implements Server-Sent Events (SSE) streaming to output token updates during RAG chats.
 * - Handles cascades cleanup on deletions (deleting database records and Chroma collections).
 *
 * Related Files:
 * - server/src/services/pipeline.js (Background ingestion worker)
 * - server/src/models.js (Mongoose Repository & Chat schemas)
 */

import fs from "node:fs";
import path from "node:path";
import { TextDecoder } from "node:util";
import multer from "multer";
import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { requireAuth } from "../middleware/auth.js";
import { HttpError } from "../middleware/error.js";
import { Chat, Repository } from "../models.js";
import { serviceJson } from "../services/http.js";
import { runRepositoryIngestion } from "../services/pipeline.js";

// Initialize local temp directory to store uploaded zip files
const uploadDir = path.resolve(process.cwd(), "uploads");
fs.mkdirSync(uploadDir, { recursive: true });

// Configure Multer middleware limits to protect disk storage space against denial of service attacks.
const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 150 * 1024 * 1024 } // Enforce 150MB file size ceiling
});

export const repositoriesRouter = Router();
repositoriesRouter.use(requireAuth);

/**
 * Route: GET /api/repositories
 * Purpose: Lists all codebases owned by the authenticated user.
 */
repositoriesRouter.get("/", async (req, res) => {
  const repositories = await Repository.find({ ownerId: req.user.id }).sort({ updatedAt: -1 });
  res.json({ repositories });
});

/**
 * Route: POST /api/repositories/github
 * Purpose: Registers and clones a remote GitHub codebase.
 *
 * Process:
 * 1. Validates Git URL parameter formats.
 * 2. Normalizes target links separating names and branches.
 * 3. Creates a placeholder Mongoose Repository document.
 * 4. Schedules the ingestion task asynchronously to avoid holding the connection.
 * 5. Returns a 202 Accepted response containing the queued repository information.
 */
repositoriesRouter.post("/github", async (req, res) => {
  const body = z.object({ url: z.string().url(), name: z.string().min(1).optional() }).parse(req.body);

  let name = body.name;
  let normalizedUrl = body.url.trim().replace(/\/$/, "");

  const githubMatch = normalizedUrl.match(/^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/]+)/i);
  if (githubMatch) {
    const owner = githubMatch[1];
    let repo = githubMatch[2];
    if (repo.toLowerCase().endsWith(".git")) {
      repo = repo.slice(0, -4);
    }
    normalizedUrl = `https://github.com/${owner}/${repo}`;
    if (!name) {
      name = repo;
    }
  } else {
    if (!name) {
      name = normalizedUrl.split("/").pop() ?? "Repository";
    }
  }

  const repository = await Repository.create({
    ownerId: req.user.id,
    name,
    sourceType: "github",
    sourceUrl: normalizedUrl,
    status: "queued"
  });

  // Non-blocking invocation: Spawns the worker in the background while returning 202 instantly
  void runRepositoryIngestion({
    repositoryId: repository.id,
    name,
    sourceType: "github",
    sourceUrl: normalizedUrl
  });

  res.status(202).json({ repository });
});

/**
 * Route: POST /api/repositories/zip
 * Purpose: Accepts a zip codebase upload from Multer and queues ingestion.
 */
repositoriesRouter.post("/zip", upload.single("project"), async (req, res) => {
  if (!req.file) throw new HttpError(400, "Upload a ZIP archive in the project field");

  const repository = await Repository.create({
    ownerId: req.user.id,
    name: req.body.name || req.file.originalname.replace(/\.zip$/i, ""),
    sourceType: "zip",
    status: "queued"
  });

  // Spawns the ingestion task, passing the Multer temp disk path
  void runRepositoryIngestion({
    repositoryId: repository.id,
    name: repository.name,
    sourceType: "zip",
    archivePath: req.file.path
  });

  res.status(202).json({ repository });
});

/**
 * Route: GET /api/repositories/:id
 * Purpose: Returns metadata details for a specific repository.
 */
repositoriesRouter.get("/:id", async (req, res) => {
  const repository = await loadOwnedRepository(req.params.id, req.user.id);
  res.json({ repository });
});

/**
 * Route: GET /api/repositories/:id/files
 * Purpose: Returns the files array parsed from code AST analysis.
 */
repositoriesRouter.get("/:id/files", async (req, res) => {
  const repository = await loadOwnedRepository(req.params.id, req.user.id);
  const analysis = repository.analysis;
  res.json({ files: analysis?.files ?? [] });
});

/**
 * Route: POST /api/repositories/:id/search
 * Purpose: Performs a vector search over the codebase.
 */
repositoriesRouter.post("/:id/search", async (req, res) => {
  await loadOwnedRepository(req.params.id, req.user.id);
  const body = z.object({ query: z.string().min(2), limit: z.number().min(1).max(20).default(8) }).parse(req.body);
  
  const results = await serviceJson(`${env.EMBEDDING_SERVICE_URL}/repositories/${req.params.id}/search`, {
    method: "POST",
    body: JSON.stringify(body)
  });
  res.json(results);
});

/**
 * Route: POST /api/repositories/:id/chat
 * Purpose: Executes an AI assistant chat thread, streaming responses back via Server-Sent Events (SSE).
 *
 * Process:
 * 1. Checks repository ownership.
 * 2. Fetches or initializes a Chat thread document in MongoDB.
 * 3. Appends the user's prompt message to the thread history.
 * 4. Calls the RAG microservice using fetch, forwarding user identity headers.
 * 5. Configures SSE headers on the client response to allow chunked streaming.
 * 6. Progressively decodes incoming microservice bytes, writes them to the client, and appends them to a local string buffer.
 * 7. When the stream concludes, saves the compiled assistant response content to the database.
 */
repositoriesRouter.post("/:id/chat", async (req, res) => {
  const repository = await loadOwnedRepository(req.params.id, req.user.id);
  const body = z.object({ message: z.string().min(1), chatId: z.string().optional() }).parse(req.body);
  const chat =
    (body.chatId ? await Chat.findOne({ _id: body.chatId, ownerId: req.user.id }) : null) ??
    (await Chat.create({ ownerId: req.user.id, repositoryId: repository.id, messages: [] }));

  chat.messages.push({ role: "user", content: body.message });
  await chat.save();

  const response = await fetch(`${env.RAG_SERVICE_URL}/repositories/${req.params.id}/chat/stream`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-user-id": req.user.id,
    },
    body: JSON.stringify({ query: body.message, chatId: chat.id })
  });

  if (!response.ok || !response.body) {
    throw new Error(`RAG service failed: ${response.status} ${await response.text()}`);
  }

  // Setup Server-Sent Events headers enabling progressive stream delivery
  res.setHeader("content-type", "text/event-stream");
  res.setHeader("cache-control", "no-cache");
  res.setHeader("x-chat-id", chat.id);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let assistantContent = "";
  let eventBuffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      eventBuffer += text;
      
      const events = eventBuffer.split("\n\n");
      eventBuffer = events.pop() ?? "";
      
      // Decodes chunk tokens for final DB persistence while keeping raw stream passing intact
      assistantContent += events.map(extractMessagePayload).join("");
      res.write(text);
    }
  } finally {
    // When the stream closes, commit the full assistant response to Mongoose history
    if (assistantContent.trim()) {
      chat.messages.push({ role: "assistant", content: assistantContent });
      await chat.save();
    }
    res.end();
  }
});

/**
 * Route: POST /api/repositories/:id/docs
 * Purpose: Generates README templates using the AI Documentation microservice.
 */
repositoriesRouter.post("/:id/docs", async (req, res) => {
  const repository = await loadOwnedRepository(req.params.id, req.user.id);
  
  if (!repository.analysis) {
    res.json({ readme: "", architecture: "", setup: "", modules: [] });
    return;
  }
  const docs = await serviceJson(`${env.DOCUMENTATION_SERVICE_URL}/repositories/${req.params.id}/generate`, {
    method: "POST",
    body: JSON.stringify(repository.analysis)
  });
  res.json(docs);
});

/**
 * Route: GET /api/repositories/:id/graph
 * Purpose: Retrieves codebase AST import dependency graph relationships.
 */
repositoriesRouter.get("/:id/graph", async (req, res) => {
  const repository = await loadOwnedRepository(req.params.id, req.user.id);
  
  if (!repository.analysis) {
    res.json({ repositoryId: req.params.id, nodes: [], edges: [] });
    return;
  }
  const graph = await serviceJson(`${env.ANALYSIS_SERVICE_URL}/repositories/${req.params.id}/graph`, {
    method: "POST",
    body: JSON.stringify(repository.analysis)
  });
  res.json(graph);
});

/**
 * Route: POST /api/repositories/:id/explain
 * Purpose: Explains codebase file purposes and symbol mappings.
 */
repositoriesRouter.post("/:id/explain", async (req, res) => {
  const repository = await loadOwnedRepository(req.params.id, req.user.id);
  const body = z.object({ filePath: z.string(), symbolName: z.string().optional() }).parse(req.body);
  
  if (!repository.analysis) {
    res.json({ repositoryId: req.params.id, filePath: body.filePath, symbols: [], dependencies: [], purpose: "Analysis not yet available for this repository." });
    return;
  }
  const explanation = await serviceJson(`${env.ANALYSIS_SERVICE_URL}/repositories/${req.params.id}/explain`, {
    method: "POST",
    body: JSON.stringify({ ...body, analysis: repository.analysis })
  });
  res.json(explanation);
});

/**
 * Route: DELETE /api/repositories/:id
 * Purpose: Deletes a codebase and performs cascade purges on all associated data.
 *
 * Process:
 * 1. Checks repository ownership.
 * 2. Sends a best-effort delete request to the Embedding service to wipe Chroma vector DB collections.
 * 3. Deletes all associated Chat conversation logs.
 * 4. Removes the Repository document itself from MongoDB.
 */
repositoriesRouter.delete("/:id", async (req, res) => {
  const repository = await loadOwnedRepository(req.params.id, req.user.id);

  // Best-effort: Purge the ChromaDB collection via the embedding service
  try {
    await serviceJson(`${env.EMBEDDING_SERVICE_URL}/repositories/${req.params.id}/purge`, {
      method: "DELETE"
    });
  } catch {
    // Non-fatal: Vector store collection may not exist if indexing failed/interrupted
  }

  // Remove all chats for this repository
  await Chat.deleteMany({ repositoryId: repository.id });

  // Remove the repository document itself
  await repository.deleteOne();

  res.status(200).json({ deleted: true, id: req.params.id });
});

/**
 * Route: GET /api/repositories/:id/chats
 * Purpose: Returns the most recent 10 conversations.
 */
repositoriesRouter.get("/:id/chats", async (req, res) => {
  await loadOwnedRepository(req.params.id, req.user.id);
  const chats = await Chat.find({
    repositoryId: req.params.id,
    ownerId: req.user.id
  }).sort({ updatedAt: -1 }).limit(10);
  res.json({ chats });
});

/**
 * Helper: Validates repository ownership to protect against IDOR (Insecure Direct Object Reference) exploits.
 *
 * Inputs:
 * - id: Repository document ID.
 * - ownerId: Verified User ID parsed from the JWT request payload.
 *
 * Outputs:
 * - Mongoose Repository document object, or throws a 404 HttpError if the repository is not found or owned.
 */
async function loadOwnedRepository(id, ownerId) {
  const repository = await Repository.findOne({ _id: id, ownerId });
  if (!repository) throw new HttpError(404, "Repository not found");
  return repository;
}

/**
 * Helper: Decodes individual SSE event structures to extract text data payloads.
 */
function extractMessagePayload(eventText) {
  if (eventText.split("\n").some((line) => line === "event: citations" || line === "event: done")) {
    return "";
  }
  return eventText
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => line.slice(6).replaceAll("\\n", "\n"))
    .join("");
}
