import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export interface JwtUser {
  id: string;
  email: string;
  name: string;
}

export function signToken(user: JwtUser) {
  return jwt.sign(user, env.JWT_SECRET, { expiresIn: "7d" });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;

  if (!token) {
    return res.status(401).json({ message: "Missing authorization token" });
  }

  try {
    req.user = jwt.verify(token, env.JWT_SECRET) as JwtUser;
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}
