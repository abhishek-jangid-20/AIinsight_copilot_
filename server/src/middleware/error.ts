import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function notFound(req: Request, res: Response) {
  res.status(404).json({ message: `No route for ${req.method} ${req.path}` });
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof ZodError) {
    return res.status(400).json({ message: "Invalid request", issues: error.issues });
  }

  if (error instanceof HttpError) {
    return res.status(error.status).json({ message: error.message });
  }

  const message = error instanceof Error ? error.message : "Unexpected server error";
  console.error(error);
  return res.status(500).json({ message });
}
