/**
 * ---------------------------------------------------------
 * Folder: lib/
 * Location: client/src/lib/
 * ---------------------------------------------------------
 *
 * Folder Purpose:
 *   The `lib` folder stores reusable modules, configurations, helper libraries,
 *   and API wrappers that are shared across various React components.
 *
 * ---------------------------------------------------------
 * File: api.js
 * Location: client/src/lib/api.js
 * ---------------------------------------------------------
 *
 * Purpose:
 *   Acts as the central API communication layer (the HTTP service layer)
 *   providing clean, asynchronous functions for interacting with the backend server.
 *
 * Responsibilities:
 * - Manages authorization tokens in localStorage.
 * - Wraps native `fetch` requests with JSON headers and Authorization bearer tokens.
 * - Handles unauthorized 401 session expirations dynamically via registered callback hooks.
 * - Decodes Server-Sent Events (SSE) streams for real-time chat responses.
 *
 * Related Files:
 * - client/src/app/store.js (Dispatches signedOut actions when auto-logout occurs)
 * - client/src/App.jsx (Executes repository listing mutations and user queries)
 */

// Reads API base URL from Vite environment variables (supports fallback to relative paths)
const API_BASE = import.meta.env.VITE_API_BASE ?? "";

/**
 * Retrieves the authentication token from localStorage.
 *
 * Why?
 *   JWT authentication is stateless. The client must store the token locally and attach
 *   it to every subsequent HTTP request's headers.
 *
 * Output:
 *   - string | null: JWT token string if found, otherwise null.
 */
export function getToken() {
  return localStorage.getItem("codeinsight_token");
}

/**
 * Stores or deletes the authentication token in localStorage.
 *
 * Inputs:
 *   - token (string | null): The JWT string to save, or null to remove it.
 */
export function setToken(token) {
  if (token) localStorage.setItem("codeinsight_token", token);
  else localStorage.removeItem("codeinsight_token");
}

// Registry callback for global 401 interception (auto-logout)
let _onUnauthorized = null;

/**
 * Registers a callback function to run when the API encounters a 401 Unauthorized response.
 *
 * Why?
 *   Avoids circular dependencies. Instead of api.js directly importing the Redux store
 *   to dispatch actions, the App component registers a store dispatcher action here,
 *   maintaining clean separation of concerns.
 *
 * Inputs:
 *   - handler (function): The callback function (usually `() => dispatch(signedOut())`).
 */
export function setUnauthorizedHandler(handler) {
  _onUnauthorized = handler;
}

/**
 * Core wrapper for HTTP requests using the native Fetch API.
 *
 * Why?
 *   Standardizes content-types, authorization headers, error parsing, and session
 *   invalidations globally so that individual functions do not repeat boilerplate code.
 *
 * Inputs:
 *   - path (string): The API endpoint path (e.g. "/api/auth/me").
 *   - init (object): Optional fetch options (method, body, headers, etc.).
 *
 * Outputs:
 *   - Promise<any>: Decoded JSON response.
 *
 * Side Effects:
 *   - Clears session/token if a 401 response status is returned.
 *
 * References:
 * - https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch
 */
export async function api(path, init = {}) {
  const token = getToken();
  
  // Make the network request
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      // Auto-set application/json unless the user is uploading multipart files (like ZIP)
      ...(init.body instanceof FormData ? {} : { "content-type": "application/json" }),
      // Inject Authorization Bearer header if user is authenticated
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      // Apply any ad-hoc override headers passed as arguments
      ...(init.headers ?? {})
    }
  });

  // ENH-009: Detect expired or invalid JWT sessions
  if (response.status === 401) {
    _onUnauthorized?.();
    throw new Error("Your session has expired. Please sign in again.");
  }

  // Handle standard HTTP failure responses
  if (!response.ok) throw new Error(await response.text());
  
  // Decodes JSON payloads asynchronously
  return await response.json();
}

/**
 * Authenticates a user credentials.
 * Endpoint: POST /api/auth/login
 */
export async function login(email, password) {
  return api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
}

/**
 * Registers a new user account.
 * Endpoint: POST /api/auth/signup
 */
export async function signup(name, email, password) {
  return api("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({ name, email, password })
  });
}

/**
 * Re-authenticates / retrieves the current user profile using JWT authorization headers.
 * Endpoint: GET /api/auth/me
 */
export async function currentUser() {
  return api("/api/auth/me");
}

/**
 * Fetches all ingested repositories for the current user.
 * Endpoint: GET /api/repositories
 */
export async function listRepositories() {
  return api("/api/repositories");
}

/**
 * Triggers repository ingestion by importing from a remote GitHub URL.
 * Endpoint: POST /api/repositories/github
 */
export async function importGithub(url) {
  return api("/api/repositories/github", {
    method: "POST",
    body: JSON.stringify({ url })
  });
}

/**
 * Uploads a local project repository packed inside a ZIP file.
 * Endpoint: POST /api/repositories/zip
 *
 * Why FormData?
 *   File uploads require binary transfers. We use the browser's native `FormData`
 *   to automatically construct multipart/form-data content bounds.
 */
export async function uploadZip(file, name) {
  const form = new FormData();
  form.append("project", file);
  if (name) form.append("name", name);
  return api("/api/repositories/zip", { method: "POST", body: form });
}

/**
 * Deletes a repository record and its parsed Vector database index.
 * Endpoint: DELETE /api/repositories/:id
 */
export async function deleteRepository(repositoryId) {
  return api(`/api/repositories/${repositoryId}`, {
    method: "DELETE"
  });
}

/**
 * Queries the vector database index of a repository using semantic vector similarity.
 * Endpoint: POST /api/repositories/:id/search
 */
export async function semanticSearch(repositoryId, query) {
  return api(
    `/api/repositories/${repositoryId}/search`,
    { method: "POST", body: JSON.stringify({ query, limit: 8 }) }
  );
}

/**
 * Fetches the dependency relationship graph mapping codebase structure.
 * Endpoint: GET /api/repositories/:id/graph
 */
export async function repositoryGraph(repositoryId) {
  // FIX-011: Include repositoryId in the return type — the analysis service returns it
  return api(`/api/repositories/${repositoryId}/graph`);
}

/**
 * Triggers complete AI documentation generations for files inside a repository.
 * Endpoint: POST /api/repositories/:id/docs
 */
export async function generateDocs(repositoryId) {
  return api(`/api/repositories/${repositoryId}/docs`, {
    method: "POST"
  });
}

/**
 * Explains code blocks and functions inside a specific file.
 * Endpoint: POST /api/repositories/:id/explain
 */
export async function explainFile(repositoryId, filePath, symbolName) {
  return api(`/api/repositories/${repositoryId}/explain`, {
    method: "POST",
    body: JSON.stringify({ filePath, symbolName })
  });
}

/**
 * Retrieves the history of chat threads for a repository.
 * Endpoint: GET /api/repositories/:id/chats
 */
export async function listChats(repositoryId) {
  return api(`/api/repositories/${repositoryId}/chats`);
}

/**
 * Streams chat response tokens from the AI assistant in real-time.
 * Endpoint: POST /api/repositories/:id/chat
 *
 * Why a separate stream function?
 *   A standard JSON fetch waits for the entire assistant output, which takes seconds.
 *   This uses ReadableStream streams to output tokens immediately as they are generated,
 *   creating a responsive AI chat experience.
 *
 * Process:
 * 1. POST message parameters.
 * 2. Get reader from the response body stream.
 * 3. Loop and decode chunks of byte arrays using TextDecoder.
 * 4. Parse incoming Server-Sent Events (SSE) "data:" rows.
 * 5. Call onToken callback with parsed words.
 *
 * References:
 * - https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream
 * - https://developer.mozilla.org/en-US/docs/Web/API/TextDecoder
 */
export async function streamChat(repositoryId, message, onToken, chatId) {
  const token = getToken();
  const response = await fetch(`${API_BASE}/api/repositories/${repositoryId}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ message, ...(chatId ? { chatId } : {}) })
  });

  // Handle unauthorized expirations on streaming
  if (response.status === 401) {
    _onUnauthorized?.();
    throw new Error("Your session has expired. Please sign in again.");
  }

  if (!response.ok || !response.body) throw new Error(await response.text());

  // Extract the custom header containing the created/updated chat session ID
  const returnedChatId = response.headers.get("x-chat-id");

  // Read the binary stream of tokens chunk-by-chunk
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    
    // Convert byte array chunk to text string
    buffer += decoder.decode(value, { stream: true });
    
    // Server-Sent Events are separated by double newlines
    const events = buffer.split("\n\n");
    // Preserve any partial trailing string for the next iteration
    buffer = events.pop() ?? "";
    
    for (const event of events) {
      const lines = event.split("\n");
      // Skip meta SSE event headers
      if (lines.some((l) => l.startsWith("event: "))) continue;
      // Search for the line containing event data
      const line = lines.find((item) => item.startsWith("data: "));
      if (line) {
        // Slice off "data: " prefix and unescape carriage returns
        onToken(line.slice(6).replaceAll("\\n", "\n"));
      }
    }
  }

  return { chatId: returnedChatId };
}
