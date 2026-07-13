/**
 * ---------------------------------------------------------
 * File: minigpt.js
 * Location: server/src/routes/minigpt.js
 * ---------------------------------------------------------
 *
 * Purpose:
 *   Handles routing logic for the MiniGPT Sandbox Laboratory.
 *   Acts as an API proxy forwarding client request configurations directly
 *   to the Python MiniGPT training microservice.
 *
 * Responsibilities:
 * - Secures all lab endpoints using standard user authorization checks.
 * - Extracts user IDs and forwards them inside `x-user-id` headers to keep session models isolated.
 * - Validates hyperparameter inputs (n_layer, n_head, n_embd) using Zod.
 * - Interacts with WikiText datasets retrieval controllers.
 *
 * Related Files:
 * - server/src/services/http.js (Provides serviceJson API client wrappers)
 * - services/minigpt-service/main.py (Processes these forwarded requests)
 */

import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { requireAuth } from "../middleware/auth.js";
import { serviceJson } from "../services/http.js";

export const minigptRouter = Router();

// Apply authorization checks globally to all nested routes in this sub-router
minigptRouter.use(requireAuth);

/**
 * Helper: Appends session attributes mapping multi-tenant model isolation.
 *
 * Why?
 *   The Python microservice is stateless and does not check database credentials.
 *   By passing the verified `x-user-id` header from the gateway, the microservice
 *   knows which model instance to load, train, or sample.
 */
function userHeaders(req) {
  return { "x-user-id": req.user.id };
}

/**
 * Route: POST /api/minigpt/init
 * Purpose: Compiles a new model architecture and vocabulary map.
 *
 * Inputs:
 * - text (optional): The data corpus to analyze.
 * - n_layer (1-4): Transformer block depth.
 * - n_head (1-8): Self-attention head splits.
 * - n_embd (8-128): Vector embeddings dimension.
 * - block_size (8-64): Maximum sequence context length.
 */
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

/**
 * Route: POST /api/minigpt/train-step
 * Purpose: Performs a configured batch of backpropagation steps.
 */
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

/**
 * Route: POST /api/minigpt/generate
 * Purpose: Runs autoregressive text sampling from the model.
 */
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

/**
 * Route: GET /api/minigpt/state
 * Purpose: Returns the model's active compilation status and training history.
 */
minigptRouter.get("/state", async (req, res) => {
  const result = await serviceJson(`${env.MINIGPT_SERVICE_URL}/lab/state`, {
    method: "GET",
    headers: userHeaders(req),
  });

  res.json(result);
});

/**
 * Route: GET /api/minigpt/wikitext
 * Purpose: Retrieves public WikiText data samples (does not require session isolation).
 */
minigptRouter.get("/wikitext", async (_req, res) => {
  const result = await serviceJson(`${env.MINIGPT_SERVICE_URL}/lab/wikitext`, {
    method: "GET"
  });

  res.json(result);
});
