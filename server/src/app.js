/**
 * ---------------------------------------------------------
 * File: app.js
 * Location: server/src/app.js
 * ---------------------------------------------------------
 *
 * Purpose:
 *   Configures and instantiates the Express application instance, setting up
 *   global middlewares, API route groupings, and error interception filters.
 *
 * Responsibilities:
 * - Initializes Express application gateway.
 * - Restricts Cross-Origin Resource Sharing (CORS) rules to approved client origins.
 * - Restricts JSON payloads sizes (up to 2MB).
 * - Exposes server health endpoints.
 * - Mounts sub-routers: Authentication, Repositories, and MiniGPT Lab.
 * - Registers global fallback middleware capturing 404s and unhandled errors.
 *
 * Related Files:
 * - server/src/routes/* (Mounted API route subfolders)
 * - server/src/middleware/error.js (Global error/NotFound endpoints interceptors)
 */

import "express-async-errors"; // Intercepts asynchronous route errors and forwards them to the global error middleware automatically.
import cors from "cors";
import express from "express";
import { env } from "./config/env.js";
import { errorHandler, notFound } from "./middleware/error.js";
import { authRouter } from "./routes/auth.js";
import { repositoriesRouter } from "./routes/repositories.js";
import { minigptRouter } from "./routes/minigpt.js";

export const app = express();

// Middleware: CORS authorization (permits cookie exchanges and restricts access to trusted CLIENT_ORIGIN)
app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));

// Middleware: Built-in body parser converting incoming JSON raw payloads into req.body objects
app.use(express.json({ limit: "2mb" }));

// Endpoint: Simple health check ping verifying Gateway status
app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "codeinsight-gateway" });
});

// Mounting Sub-Routers
app.use("/api/auth", authRouter);
app.use("/api/repositories", repositoriesRouter);
app.use("/api/minigpt", minigptRouter);

// Middleware Fallbacks: Triggered when requests do not match any defined routes above
app.use(notFound);      // Catches and formats 404 errors
app.use(errorHandler);  // Captures and logs all 500 error stack traces safely
