/**
 * ---------------------------------------------------------
 * File: http.js
 * Location: server/src/services/http.js
 * ---------------------------------------------------------
 *
 * Purpose:
 *   Provides a unified wrapper for executing outbound HTTP requests to
 *   the backend Python microservices.
 *
 * Responsibilities:
 * - Executes native `fetch` requests with standardized config defaults.
 * - Configures a 5-minute request timeout threshold.
 * - Enforces JSON header properties.
 * - Surfaces remote microservice stack traces within server log catch blocks.
 *
 * Related Files:
 * - server/src/routes/* (Calls serviceJson to proxy queries to microservices)
 */

/**
 * Executes a JSON HTTP request to a backend microservice, returning parsed results.
 *
 * Inputs:
 * - url: Complete endpoint location string.
 * - init: Optional request configuration options (headers, methods, body).
 *
 * Special features:
 * - AbortSignal.timeout(300000): Enforces a 5-minute execution limit. This is necessary
 *   because microservice tasks like parsing long codebases or performing similarity search
 *   can block sockets, leading to memory leaks if left unmanaged.
 */
export async function serviceJson(url, init) {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(300000), // 5-minute timeout threshold
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  // Verify response HTTP status checks
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Service call failed ${response.status}: ${body}`);
  }

  return await response.json();
}
