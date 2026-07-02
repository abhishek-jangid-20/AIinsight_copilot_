import mongoose, { Schema } from "mongoose";

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, index: true },
    name: { type: String, required: true },
    passwordHash: { type: String, required: true }
  },
  { timestamps: true }
);

export const User = mongoose.model("User", userSchema);

const repositorySchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true },
    sourceType: { type: String, enum: ["github", "zip"], required: true },
    sourceUrl: String,
    status: { type: String, default: "queued", index: true },
    lastError: String,
    analysis: Schema.Types.Mixed
  },
  { timestamps: true }
);

export const Repository = mongoose.model("Repository", repositorySchema);

const chatMessageSchema = new Schema(
  {
    role: { type: String, enum: ["user", "assistant", "system"], required: true },
    content: { type: String, required: true },
    citations: [{ filePath: String, startLine: Number, endLine: Number }]
  },
  { timestamps: true }
);

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
