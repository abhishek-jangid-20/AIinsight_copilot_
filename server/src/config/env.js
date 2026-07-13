/**
 * ---------------------------------------------------------
 * File: env.js
 * Location: server/src/config/env.js
 * ---------------------------------------------------------
 *
 * Purpose:
 *   Loads, parses, and validates all environment variables needed by the server.
 *   Prevents the application from running in an invalid configuration state.
 *
 * Responsibilities:
 * - Reads variables from `.env` files.
 * - Uses Zod schema validator to enforce variable types (e.g., coercing PORT to a number).
 * - Enforces security policies (e.g., checks for minimum JWT_SECRET length).
 * - Halts server startup with descriptive error messages if any validation checks fail.
 *
 * Related Files:
 * - server/src/index.js (Uses validated env properties)
 */

import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

// Load configuration variables from .env files
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), "../.env") });

/**
 * =============================================================================
 * ENVIRONMENT SCHEMA (Zod Validation)
 * =============================================================================
 * Enforces strict typing, defaults, and formats at boot.
 * - NODE_ENV: Application running environment ("production", "development").
 * - PORT: Coerced into a number, defaulting to 8080.
 * - JWT_SECRET: Enforces a minimum length of 16 characters to prevent brute-force attacks.
 * - URL fields: Microservice endpoints locations.
 */
const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(8080),
  CLIENT_ORIGIN: z.string().default("http://localhost:5173"),
  JWT_SECRET: z.string().min(16),
  MONGODB_URI: z.string().default("mongodb://localhost:27017/codeinsight"),
  PARSER_SERVICE_URL: z.string().default("http://localhost:8101"),
  EMBEDDING_SERVICE_URL: z.string().default("http://localhost:8102"),
  RAG_SERVICE_URL: z.string().default("http://localhost:8103"),
  DOCUMENTATION_SERVICE_URL: z.string().default("http://localhost:8104"),
  ANALYSIS_SERVICE_URL: z.string().default("http://localhost:8105"),
  MINIGPT_SERVICE_URL: z.string().default("http://localhost:8106")
});

// Perform validation on the raw process.env object
const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // In development, automatically apply a default secret with a loud warning
  if (process.env.NODE_ENV !== "production") {
    console.warn(
      "\n⚠️  [SEC-001] JWT_SECRET is not set. Using insecure default for development.\n" +
      "   Set JWT_SECRET in your .env file before deploying to production!\n"
    );
    process.env.JWT_SECRET = "development-secret-change-me-32chars";
  } else {
    // Fail-fast behavior: Production environments must fail immediately if secrets are missing or weak
    console.error("\n❌ [SEC-001] JWT_SECRET must be explicitly set in production. Refusing to start.\n");
    process.exit(1);
  }
}

// Final parsing: Guarantees that the exported object matches the validated schema
export const env = envSchema.parse(process.env);
