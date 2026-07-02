import "express-async-errors";
import cors from "cors";
import express from "express";
import { env } from "./config/env.js";
import { errorHandler, notFound } from "./middleware/error.js";
import { authRouter } from "./routes/auth.js";
import { repositoriesRouter } from "./routes/repositories.js";
import { minigptRouter } from "./routes/minigpt.js";

export const app = express();

app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "codeinsight-gateway" });
});

app.use("/api/auth", authRouter);
app.use("/api/repositories", repositoriesRouter);

app.use("/api/minigpt", minigptRouter);

app.use(notFound);
app.use(errorHandler);
