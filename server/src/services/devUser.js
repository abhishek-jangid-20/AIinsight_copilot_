/**
 * ---------------------------------------------------------
 * Folder: server/src/services/
 * Location: server/src/services/
 * ---------------------------------------------------------
 *
 * Folder Purpose:
 *   Contains core business logic helper scripts, client request wrappers,
 *   and background worker schedulers that orchestrate tasks outside Express route layers.
 *
 * ---------------------------------------------------------
 * File: devUser.js
 * Location: server/src/services/devUser.js
 * ---------------------------------------------------------
 *
 * Purpose:
 *   Seeds a default developer profile on server startup when running locally.
 *
 * Responsibilities:
 * - Automatically checks if a default developer record exists.
 * - Seeds the database using hashed passwords.
 * - Bypasses seeding entirely in production environments to prevent security backdoors.
 *
 * Related Files:
 * - server/src/index.js (Triggers ensureDevelopmentUser on startup)
 * - server/src/models.js (Creates User models)
 */

import bcrypt from "bcryptjs";
import { env } from "../config/env.js";
import { User } from "../models.js";

/**
 * Checks and creates a default developer profile to speed up local setup testing.
 *
 * Process:
 * 1. Checks NODE_ENV context. If not "development", exits immediately.
 * 2. Searches for a user with the default address `engineer@codeinsight.local`.
 * 3. Hashes the default password `codeinsight123` using 12 bcrypt salt rounds.
 * 4. Persists the user record to Mongoose and prints a credential warning.
 */
export async function ensureDevelopmentUser() {
  // Security Guard: Prevent default backdoor credentials from being created in production environments.
  if (env.NODE_ENV !== "development") return;

  const email = "engineer@codeinsight.local";
  const existing = await User.findOne({ email });
  if (existing) return; // Exit if the user was already seeded on a previous run

  await User.create({
    email,
    name: "AI Engineer",
    passwordHash: await bcrypt.hash("codeinsight123", 12)
  });

  // Print credentials warning banner to the system logs
  console.warn(
    "\n⚠️  [SEC-002] Development seed user created:\n" +
    `   Email:    ${email}\n` +
    "   Password: codeinsight123\n" +
    "   This user is for local development only. Do NOT use in production.\n"
  );
}
