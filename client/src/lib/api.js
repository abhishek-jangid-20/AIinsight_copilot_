import type { Repository } from "../types";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

export function getToken() {
  return localStorage.getItem("codeinsight_token");
}

export function setToken(token) {
  if (token) localStorage.setItem("codeinsight_token", token);
  else localStorage.removeItem("codeinsight_token");
}

// ENH-009: Callback to trigger auto-logout on 401 responses anywhere in the app
let _onUnauthorized = null;
export function setUnauthorizedHandler(handler) {
  _onUnauthorized = handler;
}

export async function api(path, init = {}) {
  const token = getToken();
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init.body instanceof FormData ? {} : { "content-type": "application/json" }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {})
    }
  });

  // ENH-009: Auto-logout on token expiry / invalid token
  if (response.status === 401) {
    _onUnauthorized?.();
    throw new Error("Your session has expired. Please sign in again.");
  }

  if (!response.ok) throw new Error(await response.text());
  return await response.json();
}

export async function login(email, password) {
  return api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
}

export async function signup(name, email, password) {
  return api("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({ name, email, password })
  });
}

export async function currentUser() {
  return api("/api/auth/me");
}

export async function listRepositories() {
  return api("/api/repositories");
}

export async function importGithub(url) {
  return api("/api/repositories/github", {
    method: "POST",
    body: JSON.stringify({ url })
  });
}

export async function uploadZip(file, name) {
  const form = new FormData();
  form.append("project", file);
  if (name) form.append("name", name);
  return api("/api/repositories/zip", { method: "POST", body: form });
}

export async function deleteRepository(repositoryId) {
  return api(`/api/repositories/${repositoryId}`, {
    method: "DELETE"
  });
}

export async function semanticSearch(repositoryId, query) {
  return api(
    `/api/repositories/${repositoryId}/search`,
    { method: "POST", body: JSON.stringify({ query, limit: 8 }) }
  );
}

export async function repositoryGraph(repositoryId) {
  // FIX-011: Include repositoryId in the return type — the analysis service returns it
  return api(`/api/repositories/${repositoryId}/graph`);
}

export async function generateDocs(repositoryId) {
  return api(`/api/repositories/${repositoryId}/docs`, {
    method: "POST"
  });
}

export async function explainFile(repositoryId, filePath, symbolName) {
  return api(`/api/repositories/${repositoryId}/explain`, {
    method: "POST",
    body: JSON.stringify({ filePath, symbolName })
  });
}

export async function listChats(repositoryId) {
  return api(`/api/repositories/${repositoryId}/chats`);
}

export async function streamChat(repositoryId, message, onToken, chatId) {
  const token = getToken();
  const response = await fetch(`${API_BASE}/api/repositories/${repositoryId}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ message, ...(chatId ? { chatId } : {}) })
  });

  // ENH-009: Handle 401 for streaming endpoint
  if (response.status === 401) {
    _onUnauthorized?.();
    throw new Error("Your session has expired. Please sign in again.");
  }

  if (!response.ok || !response.body) throw new Error(await response.text());

  // Read the chatId returned by the server so follow-up messages continue the same session
  const returnedChatId = response.headers.get("x-chat-id");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const event of events) {
      const lines = event.split("\n");
      if (lines.some((l) => l.startsWith("event: "))) continue;
      const line = lines.find((item) => item.startsWith("data: "));
      if (line) onToken(line.slice(6).replaceAll("\\n", "\n"));
    }
  }

  return { chatId: returnedChatId };
}
