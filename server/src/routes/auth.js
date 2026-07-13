/**
 * ---------------------------------------------------------
 * File: auth.js
 * Location: server/src/routes/auth.js
 * ---------------------------------------------------------
 *
 * Purpose:
 *   Registers client authentication API endpoints (/signup, /login, /me).
 *   Coordinates request schemas validations, password hashing, database checks,
 *   and JSON Web Token signatures.
 *
 * Responsibilities:
 * - Validates input parameters (email validation, name checks, password lengths).
 * - Hashes user passwords cryptographically using bcrypt.
 * - Prevents duplicates by enforcing unique email checks.
 * - Signs session JWT tokens on successful logins/signups.
 * - Implements profile retrieval endpoint protected by requireAuth.
 *
 * Related Files:
 * - server/src/models.js (Reads/writes User collections)
 * - server/src/middleware/auth.js (JWT signToken and requireAuth middleware validation)
 */

import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { requireAuth, signToken } from "../middleware/auth.js";
import { HttpError } from "../middleware/error.js";
import { User } from "../models.js";

export const authRouter = Router();

// Zod Schema: Validates standard credentials structure, forcing emails to lowercase and normalising whitespaces.
const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8)
});

/**
 * Route: POST /api/auth/signup
 * Purpose: Registers new user accounts.
 *
 * Process:
 * 1. Extends credentialsSchema to require a name parameter.
 * 2. Checks if a user already exists with this email address. If so, throws 409 Conflict.
 * 3. Hashes the user password using Bcrypt with 12 salt rounds (defense against hardware dictionary attacks).
 * 4. Creates and persists the User document in MongoDB.
 * 5. Returns a 201 Created response containing the user profile payload and JWT token.
 */
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

/**
 * Route: POST /api/auth/login
 * Purpose: Authenticates existing user credentials, issuing a JWT.
 *
 * Process:
 * 1. Parses raw body parameters matching credentials schema.
 * 2. Queries Mongoose for the target email address.
 * 3. Compares the submitted plain password against the stored password hash using `bcrypt.compare`.
 * 4. Throws a 401 Unauthorized error if either check fails.
 *    (Note: Always return a generic validation message like "Invalid email or password" to prevent user enumeration).
 * 5. Signs a new JWT and returns it alongside user profile info.
 */
authRouter.post("/login", async (req, res) => {
  const body = credentialsSchema.parse(req.body);
  const user = await User.findOne({ email: body.email });
  
  if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
    throw new HttpError(401, "Invalid email or password");
  }

  const payload = { id: user.id, email: user.email, name: user.name };
  res.json({ token: signToken(payload), user: payload });
});

/**
 * Route: GET /api/auth/me
 * Purpose: Re-authenticates active sessions and returns user profile details.
 *
 * Protection:
 *   Protected by the `requireAuth` middleware. If the JWT is expired or missing,
 *   the request is intercepted and rejected with a 401 status before reaching this function.
 */
authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});
