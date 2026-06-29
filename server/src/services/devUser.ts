import bcrypt from "bcryptjs";
import { env } from "../config/env.js";
import { User } from "../models.js";

export async function ensureDevelopmentUser() {
  if (env.NODE_ENV !== "development") return;

  const email = "engineer@codeinsight.local";
  const existing = await User.findOne({ email });
  if (existing) return;

  await User.create({
    email,
    name: "AI Engineer",
    passwordHash: await bcrypt.hash("codeinsight123", 12)
  });

  // SEC-002: Log a visible warning when the dev seed user is created
  console.warn(
    "\n⚠️  [SEC-002] Development seed user created:\n" +
    `   Email:    ${email}\n` +
    "   Password: codeinsight123\n" +
    "   This user is for local development only. Do NOT use in production.\n"
  );
}
