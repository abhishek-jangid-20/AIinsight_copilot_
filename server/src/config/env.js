import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

// SEC-001: JWT_SECRET must be explicitly configured. The default fallback is only
// permitted in development mode. In production, a missing or weak secret causes startup failure.
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

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // In development, automatically apply the default secret with a loud warning
  if (process.env.NODE_ENV !== "production") {
    console.warn(
      "\n⚠️  [SEC-001] JWT_SECRET is not set. Using insecure default for development.\n" +
      "   Set JWT_SECRET in your .env file before deploying to production!\n"
    );
    process.env.JWT_SECRET = "development-secret-change-me-32chars";
  } else {
    console.error("\n❌ [SEC-001] JWT_SECRET must be explicitly set in production. Refusing to start.\n");
    process.exit(1);
  }
}

export const env = envSchema.parse(process.env);
