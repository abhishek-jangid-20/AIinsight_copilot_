/**
 * ---------------------------------------------------------
 * File: auth.js
 * Location: server/src/middleware/auth.js
 * ---------------------------------------------------------
 *
 * Purpose:
 *   Handles JSON Web Token (JWT) cryptographic generation and verification.
 *   Provides authentication middleware protecting routes from unauthorized clients.
 *
 * Responsibilities:
 * - Issues signed tokens containing user identity payloads.
 * - Extracts and verifies token signatures from client Authorization headers.
 * - Attaches decrypted user sessions to request contexts.
 * - Interrupts requests with 401 statuses if signatures are invalid or missing.
 *
 * Related Files:
 * - server/src/routes/auth.js (Invokes signToken during login/signup flows)
 * - server/src/routes/repositories.js (Uses requireAuth to secure ingestion endpoints)
 */

import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

/**
 * Creates and cryptographically signs a JWT session token.
 *
 * Inputs:
 * - user: User record attributes (e.g. { id, email }) to encrypt into the payload.
 *
 * Outputs:
 * - A cryptographically signed token string valid for 7 days.
 */
export function signToken(user) {
  return jwt.sign(user, env.JWT_SECRET, { expiresIn: "7d" });
}

/**
 * Express Middleware protecting endpoint routes, requiring valid JWT auth headers.
 *
 * Process:
 * 1. Checks for the presence of the HTTP "Authorization" header.
 * 2. Strips off the standard "Bearer " prefix to isolate the raw JWT string.
 * 3. Verifies the token using `jwt.verify` and the server's private `JWT_SECRET`.
 * 4. Attaches the decoded user identity payload to the `req.user` context.
 * 5. Calls `next()` to proceed to the target handler, or returns a 401 Unauthorized response.
 *
 * References:
 * - https://expressjs.com/en/guide/writing-middleware.html
 * - https://github.com/auth0/node-jsonwebtoken
 */
export function requireAuth(req, res, next) {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;

  if (!token) {
    return res.status(401).json({ message: "Missing authorization token" });
  }

  try {
    // Cryptographically verify the token. Attach the decoded payload to req.user for use by downstream handlers.
    req.user = jwt.verify(token, env.JWT_SECRET);
    return next(); // Continues request lifecycle to next middleware handler
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}
