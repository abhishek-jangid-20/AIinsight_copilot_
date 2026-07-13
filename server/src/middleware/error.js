/**
 * ---------------------------------------------------------
 * File: error.js
 * Location: server/src/middleware/error.js
 * ---------------------------------------------------------
 *
 * Purpose:
 *   Centralizes HTTP error responses and fallback routing.
 *   Catches syntax mismatches, invalid inputs, custom exceptions, and unhandled rejections.
 *
 * Responsibilities:
 * - Declares the custom `HttpError` class with status attributes.
 * - Handles 404 responses for requests to unregistered API routes.
 * - Formats Zod schema validation errors into readable 400 Bad Request responses.
 * - Intercepts unhandled exceptions, returning a clean 500 error instead of crashing the process.
 *
 * Related Files:
 * - server/src/app.js (Registers these error middleware handlers at the end of the chain)
 */

import { ZodError } from "zod";

/**
 * Custom Error class designed to carry specific HTTP status codes.
 * Extends the native JavaScript `Error` object.
 *
 * Example: `throw new HttpError(403, "Forbidden resource");`
 */
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * Express route handler fallback capturing all unmatched paths, returning a 404 status.
 */
export function notFound(req, res) {
  res.status(404).json({ message: `No route for ${req.method} ${req.path}` });
}

/**
 * Global Express Error Handling Middleware.
 *
 * Why 4 arguments `(error, req, res, next)`?
 *   Express matches middleware signatures. If a function declares exactly 4 arguments,
 *   Express classifies it as an "Error Handling Middleware". Instead of processing it
 *   sequentially, Express skips standard routes and jumps here whenever a route throws
 *   an error or calls `next(err)`.
 *
 * References:
 * - https://expressjs.com/en/guide/error-handling.html
 */
export function errorHandler(error, _req, res, _next) {
  // Check 1: If it's a Zod schema input validation error, format and return a 400 Bad Request
  if (error instanceof ZodError) {
    return res.status(400).json({ message: "Invalid request", issues: error.issues });
  }

  // Check 2: If it's a manually thrown custom HttpError, return its designated status code
  if (error instanceof HttpError) {
    return res.status(error.status).json({ message: error.message });
  }

  // Fallback Check 3: Treat as an unhandled 500 Internal Server Error
  const message = error instanceof Error ? error.message : "Unexpected server error";
  console.error(error); // Logs stack trace locally for developers to inspect
  return res.status(500).json({ message });
}
