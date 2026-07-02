import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { requireAuth } from "../middleware/auth.js";
import { serviceJson } from "../services/http.js";

export const minigptRouter = Router();

// Apply auth middleware to all lab endpoints
minigptRouter.use(requireAuth);

/** Forward the authenticated user's ID to the MiniGPT service for per-user session isolation (LOGIC-005) */
function userHeaders(req) {
  return { "x-user-id": req.user.id };
}

minigptRouter.post("/init", async (req, res) => {
  const schema = z.object({
    text: z.string().optional(),
    n_layer: z.number().int().min(1).max(4).default(2),
    n_head: z.number().int().min(1).max(8).default(4),
    n_embd: z.number().int().min(8).max(128).default(64),
    block_size: z.number().int().min(8).max(64).default(32),
  });

  const parsed = schema.parse(req.body);
  const result = await serviceJson(`${env.MINIGPT_SERVICE_URL}/lab/init`, {
    method: "POST",
    headers: userHeaders(req),
    body: JSON.stringify(parsed)
  });

  res.json(result);
});

minigptRouter.post("/train-step", async (req, res) => {
  const schema = z.object({
    lr: z.number().min(1e-5).max(1e-1).default(1e-3),
    batch_size: z.number().int().min(1).max(128).default(16),
    steps: z.number().int().min(1).max(100).default(5)
  });

  const parsed = schema.parse(req.body);
  const result = await serviceJson(`${env.MINIGPT_SERVICE_URL}/lab/train-step`, {
    method: "POST",
    headers: userHeaders(req),
    body: JSON.stringify(parsed)
  });

  res.json(result);
});

minigptRouter.post("/generate", async (req, res) => {
  const schema = z.object({
    seed: z.string().default(" "),
    max_new_tokens: z.number().int().min(1).max(500).default(50),
    temperature: z.number().min(0.0).max(2.0).default(1.0),
    top_k: z.number().int().min(1).max(100).default(10)
  });

  const parsed = schema.parse(req.body);
  const result = await serviceJson(`${env.MINIGPT_SERVICE_URL}/lab/generate`, {
    method: "POST",
    headers: userHeaders(req),
    body: JSON.stringify(parsed)
  });

  res.json(result);
});

minigptRouter.get("/state", async (req, res) => {
  const result = await serviceJson(`${env.MINIGPT_SERVICE_URL}/lab/state`, {
    method: "GET",
    headers: userHeaders(req),
  });

  res.json(result);
});

minigptRouter.get("/wikitext", async (_req, res) => {
  const result = await serviceJson(`${env.MINIGPT_SERVICE_URL}/lab/wikitext`, {
    method: "GET"
  });

  res.json(result);
});
