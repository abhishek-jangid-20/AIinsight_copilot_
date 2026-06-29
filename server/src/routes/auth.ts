import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { requireAuth, signToken } from "../middleware/auth.js";
import { HttpError } from "../middleware/error.js";
import { User } from "../models.js";

export const authRouter = Router();

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8)
});

authRouter.post("/signup", async (req, res) => {
  const body = credentialsSchema.extend({ name: z.string().trim().min(2) }).parse(req.body);
  const existing = await User.findOne({ email: body.email });
  if (existing) throw new HttpError(409, "An account with this email already exists");

  const user = await User.create({
    email: body.email,
    name: body.name,
    passwordHash: await bcrypt.hash(body.password, 12)
  });

  const payload = { id: user.id, email: user.email, name: user.name };
  res.status(201).json({ token: signToken(payload), user: payload });
});

authRouter.post("/login", async (req, res) => {
  const body = credentialsSchema.parse(req.body);
  const user = await User.findOne({ email: body.email });
  if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
    throw new HttpError(401, "Invalid email or password");
  }

  const payload = { id: user.id, email: user.email, name: user.name };
  res.json({ token: signToken(payload), user: payload });
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});
