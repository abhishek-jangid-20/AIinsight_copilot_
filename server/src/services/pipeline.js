/**
 * ---------------------------------------------------------
 * File: pipeline.js
 * Location: server/src/services/pipeline.js
 * ---------------------------------------------------------
 *
 * Purpose:
 *   Orchestrates the asynchronous code ingestion pipeline for imported repositories.
 *
 * Responsibilities:
 * - Directs codebase processing across backend microservices (Parser and Embedding).
 * - Tracks processing status updates ("parsing", "embedding", "ready", "failed").
 * - Handles extraction and persistence of AST parse analyses payloads in MongoDB.
 * - Triggers vector database indexing.
 * - Cleans up temporary uploaded ZIP archives from local disk.
 *
 * Related Files:
 * - server/src/routes/repositories.js (Spawns runRepositoryIngestion asynchronously)
 * - server/src/services/http.js (Performs HTTP calls to microservices)
 */

import fs from "node:fs";
import { env } from "../config/env.js";
import { Repository } from "../models.js";
import { serviceJson } from "./http.js";

/**
 * Runs the codebase ingestion pipeline, moving through parsing and vector indexing phases.
 *
 * Process:
 * 1. Resolves the target Repository document in MongoDB.
 * 2. Phase 1 (Parsing): Updates state to "parsing" and calls the Python Parser service
 *    to extract folder structures, functions, classes, and file content.
 * 3. Phase 2 (Embedding): Updates state to "embedding" and sends parsed AST nodes
 *    to the Python Embedding service to calculate vector representations and index them in Chroma DB.
 * 4. Completion: Sets state to "ready" and saves.
 * 5. Error Catch: Captures any service issues, sets state to "failed", and saves the error message.
 * 6. Finally: Deletes the uploaded ZIP file to save disk space.
 */
export async function runRepositoryIngestion(request) {
  const repository = await Repository.findById(request.repositoryId);
  if (!repository) return;

  try {
    // ── Phase 1: AST Parsing ──
    repository.status = "parsing";
    await repository.save();

    const analysis = await serviceJson(`${env.PARSER_SERVICE_URL}/parse`, {
      method: "POST",
      body: JSON.stringify(request)
    });

    // ── Phase 2: Vector Indexing ──
    repository.analysis = analysis;
    repository.status = "embedding";
    await repository.save();

    await serviceJson(`${env.EMBEDDING_SERVICE_URL}/repositories/${request.repositoryId}/index`, {
      method: "POST",
      body: JSON.stringify(analysis)
    });

    // Ingestion finished successfully
    repository.status = "ready";
    repository.lastError = undefined;
    await repository.save();
  } catch (error) {
    // Capture and persist errors to allow frontend diagnostics
    repository.status = "failed";
    repository.lastError = error instanceof Error ? error.message : "Unknown ingestion error";
    await repository.save();
  } finally {
    // Disk Cleanup: Delete temporary uploaded ZIP archives to prevent disk exhaustion.
    if (request.archivePath) {
      fs.unlink(request.archivePath, (err) => {
        if (err && err.code !== "ENOENT") {
          console.warn(`[pipeline] Failed to delete uploaded archive ${request.archivePath}:`, err.message);
        }
      });
    }
  }
}
