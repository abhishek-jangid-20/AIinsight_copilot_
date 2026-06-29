import type { Repository } from "../types";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export function getToken() {
  return localStorage.getItem("codeinsight_token");
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem("codeinsight_token", token);
  else localStorage.removeItem("codeinsight_token");
}

// ENH-009: Callback to trigger auto-logout on 401 responses anywhere in the app
let _onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(handler: () => void) {
  _onUnauthorized = handler;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
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
  return (await response.json()) as T;
}

export async function login(email: string, password: string) {
  return api<{ token: string; user: AuthUser }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
}

export async function signup(name: string, email: string, password: string) {
  return api<{ token: string; user: AuthUser }>("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({ name, email, password })
  });
}

export async function currentUser() {
  return api<{ user: AuthUser }>("/api/auth/me");
}

export async function listRepositories() {
  return api<{ repositories: Repository[] }>("/api/repositories");
}

export async function importGithub(url: string) {
  return api<{ repository: Repository }>("/api/repositories/github", {
    method: "POST",
    body: JSON.stringify({ url })
  });
}

export async function uploadZip(file: File, name?: string) {
  const form = new FormData();
  form.append("project", file);
  if (name) form.append("name", name);
  return api<{ repository: Repository }>("/api/repositories/zip", { method: "POST", body: form });
}

export async function deleteRepository(repositoryId: string) {
  return api<{ deleted: boolean; id: string }>(`/api/repositories/${repositoryId}`, {
    method: "DELETE"
  });
}

export async function semanticSearch(repositoryId: string, query: string) {
  return api<{ results: Array<{ content: string; metadata: Record<string, unknown>; distance: number }> }>(
    `/api/repositories/${repositoryId}/search`,
    { method: "POST", body: JSON.stringify({ query, limit: 8 }) }
  );
}

export async function repositoryGraph(repositoryId: string) {
  // FIX-011: Include repositoryId in the return type — the analysis service returns it
  return api<{ repositoryId: string; nodes: Array<{ id: string; label: string; type: string }>; edges: Array<{ id: string; source: string; target: string; label: string }> }>(
    `/api/repositories/${repositoryId}/graph`
  );
}

export async function generateDocs(repositoryId: string) {
  return api<{ readme: string; architecture: string; setup: string; modules: unknown[] }>(`/api/repositories/${repositoryId}/docs`, {
    method: "POST"
  });
}

export async function explainFile(repositoryId: string, filePath: string, symbolName?: string) {
  return api<{
    repositoryId: string;
    filePath: string;
    symbols: Array<{ name: string; kind: string; startLine: number; endLine: number }>;
    dependencies: Array<{ source: string; target: string; kind: string }>;
    purpose: string;
  }>(`/api/repositories/${repositoryId}/explain`, {
    method: "POST",
    body: JSON.stringify({ filePath, symbolName })
  });
}

export async function listChats(repositoryId: string) {
  return api<{
    chats: Array<{
      _id: string;
      title: string;
      messages: Array<{ role: string; content: string }>;
      updatedAt: string;
    }>
  }>(`/api/repositories/${repositoryId}/chats`);
}

export async function streamChat(
  repositoryId: string,
  message: string,
  onToken: (token: string) => void,
  chatId?: string
): Promise<{ chatId: string | null }> {
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
