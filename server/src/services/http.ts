export async function serviceJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(300000), // 5 minutes timeout for intensive tasks like embedding
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Service call failed ${response.status}: ${body}`);
  }

  return (await response.json()) as T;
}
