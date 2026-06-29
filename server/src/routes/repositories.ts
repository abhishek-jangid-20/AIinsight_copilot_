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

const uploadDir = path.resolve(process.cwd(), "uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 150 * 1024 * 1024 }
});

export const repositoriesRouter = Router();
repositoriesRouter.use(requireAuth);

repositoriesRouter.get("/", async (req, res) => {
  const repositories = await Repository.find({ ownerId: req.user!.id }).sort({ updatedAt: -1 });
  res.json({ repositories });
});

repositoriesRouter.post("/github", async (req, res) => {
  const body = z.object({ url: z.string().url(), name: z.string().min(1).optional() }).parse(req.body);

  let name = body.name;
  let normalizedUrl = body.url.trim().replace(/\/$/, "");

  const githubMatch = normalizedUrl.match(/^https?:\/\/(?:www\.)?github\.com\/([^\/]+)\/([^\/]+)/i);
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
    ownerId: req.user!.id,
    name,
    sourceType: "github",
    sourceUrl: normalizedUrl,
    status: "queued"
  });

  void runRepositoryIngestion({
    repositoryId: repository.id,
    name,
    sourceType: "github",
    sourceUrl: normalizedUrl
  });

  res.status(202).json({ repository });
});

repositoriesRouter.post("/zip", upload.single("project"), async (req, res) => {
  if (!req.file) throw new HttpError(400, "Upload a ZIP archive in the project field");

  const repository = await Repository.create({
    ownerId: req.user!.id,
    name: req.body.name || req.file.originalname.replace(/\.zip$/i, ""),
    sourceType: "zip",
    status: "queued"
  });

  // BUG-006: Pass the archive path to the pipeline, which will clean it up after parsing
  void runRepositoryIngestion({
    repositoryId: repository.id,
    name: repository.name,
    sourceType: "zip",
    archivePath: req.file.path
  });

  res.status(202).json({ repository });
});

repositoriesRouter.get("/:id", async (req, res) => {
  const repository = await loadOwnedRepository(req.params.id, req.user!.id);
  res.json({ repository });
});

repositoriesRouter.get("/:id/files", async (req, res) => {
  const repository = await loadOwnedRepository(req.params.id, req.user!.id);
  const analysis = repository.analysis as { files?: unknown[] } | undefined;
  res.json({ files: analysis?.files ?? [] });
});

repositoriesRouter.post("/:id/search", async (req, res) => {
  await loadOwnedRepository(req.params.id, req.user!.id);
  const body = z.object({ query: z.string().min(2), limit: z.number().min(1).max(20).default(8) }).parse(req.body);
  const results = await serviceJson(`${env.EMBEDDING_SERVICE_URL}/repositories/${req.params.id}/search`, {
    method: "POST",
    body: JSON.stringify(body)
  });
  res.json(results);
});

repositoriesRouter.post("/:id/chat", async (req, res) => {
  const repository = await loadOwnedRepository(req.params.id, req.user!.id);
  const body = z.object({ message: z.string().min(1), chatId: z.string().optional() }).parse(req.body);
  const chat =
    (body.chatId ? await Chat.findOne({ _id: body.chatId, ownerId: req.user!.id }) : null) ??
    (await Chat.create({ ownerId: req.user!.id, repositoryId: repository.id, messages: [] }));

  chat.messages.push({ role: "user", content: body.message });
  await chat.save();

  const response = await fetch(`${env.RAG_SERVICE_URL}/repositories/${req.params.id}/chat/stream`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      // LOGIC-005: Forward user identity to MiniGPT and other services
      "x-user-id": req.user!.id,
    },
    body: JSON.stringify({ query: body.message, chatId: chat.id })
  });

  if (!response.ok || !response.body) {
    throw new Error(`RAG service failed: ${response.status} ${await response.text()}`);
  }

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
      assistantContent += events.map(extractMessagePayload).join("");
      res.write(text);
    }
  } finally {
    if (assistantContent.trim()) {
      chat.messages.push({ role: "assistant", content: assistantContent });
      await chat.save();
    }
    res.end();
  }
});

repositoriesRouter.post("/:id/docs", async (req, res) => {
  const repository = await loadOwnedRepository(req.params.id, req.user!.id);
  // FIX-003: Guard against null analysis — microservice requires a valid RepositoryAnalysis body
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

repositoriesRouter.get("/:id/graph", async (req, res) => {
  const repository = await loadOwnedRepository(req.params.id, req.user!.id);
  // FIX-002: Guard against null analysis — microservice requires a valid RepositoryAnalysis body
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

repositoriesRouter.post("/:id/explain", async (req, res) => {
  const repository = await loadOwnedRepository(req.params.id, req.user!.id);
  const body = z.object({ filePath: z.string(), symbolName: z.string().optional() }).parse(req.body);
  // FIX-002: Guard against null analysis for explain endpoint as well
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

// ENH-001: Repository deletion — removes MongoDB doc and ChromaDB collection
repositoriesRouter.delete("/:id", async (req, res) => {
  const repository = await loadOwnedRepository(req.params.id, req.user!.id);

  // Best-effort: purge the ChromaDB collection via the embedding service
  try {
    await serviceJson(`${env.EMBEDDING_SERVICE_URL}/repositories/${req.params.id}/purge`, {
      method: "DELETE"
    });
  } catch {
    // Non-fatal: collection may not exist if indexing never completed
  }

  // Remove all chats for this repository
  await Chat.deleteMany({ repositoryId: repository.id });

  // Remove the repository document itself
  await repository.deleteOne();

  res.status(200).json({ deleted: true, id: req.params.id });
});

// ENH-003: Load chat history for a repository
repositoriesRouter.get("/:id/chats", async (req, res) => {
  await loadOwnedRepository(req.params.id, req.user!.id);
  const chats = await Chat.find({
    repositoryId: req.params.id,
    ownerId: req.user!.id
  }).sort({ updatedAt: -1 }).limit(10);
  res.json({ chats });
});

async function loadOwnedRepository(id: string, ownerId: string) {
  const repository = await Repository.findOne({ _id: id, ownerId });
  if (!repository) throw new HttpError(404, "Repository not found");
  return repository;
}

function extractMessagePayload(eventText: string) {
  if (eventText.split("\n").some((line) => line === "event: citations" || line === "event: done")) {
    return "";
  }
  return eventText
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => line.slice(6).replaceAll("\\n", "\n"))
    .join("");
}
