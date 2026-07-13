/**
 * ---------------------------------------------------------
 * File: models.js
 * Location: server/src/models.js
 * ---------------------------------------------------------
 *
 * Purpose:
 *   Defines the MongoDB database schema structures and models using Mongoose ODM.
 *   Ensures data integrity, typings, index configurations, and structural relationships
 *   between users, code repositories, and assistant dialogue threads.
 *
 * Responsibilities:
 * - Creates User model for user profiles.
 * - Creates Repository model to track cloned repos, parser states, and code metadata.
 * - Creates Chat model (with nested ChatMessage sub-document arrays) to persist AI thread exchanges.
 * - Configures database indexes on foreign keys to accelerate query performances.
 *
 * Related Files:
 * - server/src/routes/* (Performs CRUD operations on these models)
 * - server/src/index.js (Connects to MongoDB using these schemas)
 */

import mongoose, { Schema } from "mongoose";

/**
 * =============================================================================
 * MONGOOSE SCHEMA: User
 * =============================================================================
 * Fields:
 * - email: Unique, normalized lowercase string used as account identifier. Indexed for login queries.
 * - name: Display name of the user.
 * - passwordHash: Secure bcrypt password hash (never store plain-text passwords!).
 *
 * Configuration:
 * - timestamps: true (Automatically injects and maintains createdAt/updatedAt fields)
 */
const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, index: true },
    name: { type: String, required: true },
    passwordHash: { type: String, required: true }
  },
  { timestamps: true }
);

export const User = mongoose.model("User", userSchema);

/**
 * =============================================================================
 * MONGOOSE SCHEMA: Repository
 * =============================================================================
 * Fields:
 * - ownerId: ObjectId reference to the User model owning the codebase.
 * - name: Project name.
 * - sourceType: clone source format identifier ("github" or "zip").
 * - sourceUrl: Remote GitHub repository HTTPS URL (if imported from github).
 * - status: Ingestion parsing states ("queued", "parsing", "embedding", "ready", "failed").
 * - lastError: Diagnostic logs captured if ingestion processes fail.
 * - analysis: Mixed data type storing AST symbol nodes, file stats, and graph references.
 */
const repositorySchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true },
    sourceType: { type: String, enum: ["github", "zip"], required: true },
    sourceUrl: String,
    status: { type: String, default: "queued", index: true },
    lastError: String,
    // Schema.Types.Mixed: Instructs Mongoose to bypass schema checks, permitting arbitrary JSON structures (needed for complex code AST graphs).
    analysis: Schema.Types.Mixed
  },
  { timestamps: true }
);

export const Repository = mongoose.model("Repository", repositorySchema);

/**
 * =============================================================================
 * MONGOOSE SUB-SCHEMA: ChatMessage
 * =============================================================================
 * Purpose:
 *   Represents individual message instances within a chat dialogue thread.
 *   Embedded as an array inside the parent Chat schema to ensure fast, atomical
 *   retrievals of message lists.
 */
const chatMessageSchema = new Schema(
  {
    role: { type: String, enum: ["user", "assistant", "system"], required: true },
    content: { type: String, required: true },
    // citations: Tracks which source files and lines the AI referenced to answer queries.
    citations: [{ filePath: String, startLine: Number, endLine: Number }]
  },
  { timestamps: true }
);

/**
 * =============================================================================
 * MONGOOSE SCHEMA: Chat
 * =============================================================================
 * Fields:
 * - ownerId: ObjectId reference to the User model executing the chat.
 * - repositoryId: ObjectId reference to the target Repository model being queried.
 * - title: Custom display name for the dialogue thread.
 * - messages: Array of nested ChatMessage sub-documents containing the dialogue log.
 */
const chatSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    repositoryId: { type: Schema.Types.ObjectId, ref: "Repository", required: true, index: true },
    title: { type: String, default: "Repository chat" },
    messages: [chatMessageSchema]
  },
  { timestamps: true }
);

export const Chat = mongoose.model("Chat", chatSchema);
