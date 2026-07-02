import fs from "node:fs";
import { env } from "../config/env.js";
import { Repository } from "../models.js";
import { serviceJson } from "./http.js";

export async function runRepositoryIngestion(request) {
  const repository = await Repository.findById(request.repositoryId);
  if (!repository) return;

  try {
    repository.status = "parsing";
    await repository.save();

    const analysis = await serviceJson(`${env.PARSER_SERVICE_URL}/parse`, {
      method: "POST",
      body: JSON.stringify(request)
    });

    repository.analysis = analysis;
    repository.status = "embedding";
    await repository.save();

    await serviceJson(`${env.EMBEDDING_SERVICE_URL}/repositories/${request.repositoryId}/index`, {
      method: "POST",
      body: JSON.stringify(analysis)
    });

    // BUG-004: Removed duplicate `repository.analysis = analysis` assignment
    repository.status = "ready";
    repository.lastError = undefined;
    await repository.save();
  } catch (error) {
    repository.status = "failed";
    repository.lastError = error instanceof Error ? error.message : "Unknown ingestion error";
    await repository.save();
  } finally {
    // FIX-001: Best-effort cleanup of the uploaded ZIP archive.
    if (request.archivePath) {
      fs.unlink(request.archivePath, (err) => {
        if (err && err.code !== "ENOENT") {
          console.warn(`[pipeline] Failed to delete uploaded archive ${request.archivePath}:`, err.message);
        }
      });
    }
  }
}
