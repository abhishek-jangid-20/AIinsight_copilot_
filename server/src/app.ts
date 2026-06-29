import "express-async-errors";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import { env } from "./config/env.js";
import { errorHandler, notFound } from "./middleware/error.js";
import { authRouter } from "./routes/auth.js";
import { repositoriesRouter } from "./routes/repositories.js";
import { minigptRouter } from "./routes/minigpt.js";

export const app = express();

app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
app.use(express.json({ limit: "2mb" }));

// ENH-008: Rate limiting — prevent abuse of expensive operations
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many auth attempts, please try again later." }
});

const importLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many import requests, please wait a moment." }
});

const chatLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many chat requests, please slow down." }
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "codeinsight-gateway" });
});

app.use("/api/auth", authLimiter, authRouter);
app.use("/api/repositories", repositoriesRouter);

// Apply stricter limits to the expensive import and chat endpoints
app.use("/api/repositories/github", importLimiter);
app.use("/api/repositories/zip", importLimiter);
app.use("/api/repositories/:id/chat", chatLimiter);

app.use("/api/minigpt", minigptRouter);

app.use(notFound);
app.use(errorHandler);
