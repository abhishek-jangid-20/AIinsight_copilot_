/**
 * ---------------------------------------------------------
 * Folder: server/
 * Location: client/src/../server/
 * ---------------------------------------------------------
 *
 * Folder Purpose:
 *   The `server` directory contains the main Node.js/Express API Gateway server.
 *   It serves client requests, manages user authentication/sessions, maintains
 *   metadata in MongoDB, and coordinates tasks with the backend Python microservices.
 *
 * ---------------------------------------------------------
 * File: index.js
 * Location: server/src/index.js
 * ---------------------------------------------------------
 *
 * Purpose:
 *   The startup bootstrap script of the API gateway. Responsible for connecting
 *   to the database, running bootstrap seeders, and starting the Express server.
 *
 * Responsibilities:
 * - Initiates the connection to MongoDB using Mongoose.
 * - Seeds the local database with a default development user for immediate testing.
 * - Starts the Express application listener on the configured port.
 *
 * Related Files:
 * - server/src/app.js (Configures routes and middleware mappings)
 * - server/src/config/env.js (Validates environment variables)
 * - server/src/services/devUser.js (Seeds the development user profile)
 */

import mongoose from "mongoose";
import { app } from "./app.js";
import { env } from "./config/env.js";
import { ensureDevelopmentUser } from "./services/devUser.js";

// Top-level await: Establishes a database connection before accepting any incoming client requests.
await mongoose.connect(env.MONGODB_URI);

// Bootstrap step: Checks if a default development user exists, seeding one if absent.
await ensureDevelopmentUser();

// Start the Express HTTP listener
app.listen(env.PORT, () => {
  console.log(`CodeInsight gateway listening on ${env.PORT}`);
});
