// The only place the API base URL is resolved. Every page reads through these helpers, so
// there is one definition of what a failed request means.

export const API = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:4000/api';

export async function fetchJson<T = unknown>(path: string): Promise<T> {
  const response = await fetch(`${API}${path}`);
  if (!response.ok) throw new Error(`API ${path} returned ${response.status}`);
  return response.json() as Promise<T>;
}

/** POST a JSON body and surface the server's `message` when it rejects the request. */
export async function postJson<T = unknown>(path: string, body: unknown, method = 'POST'): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const payload = await response
    .json()
    .catch(() => ({ message: 'The server returned an invalid response' }));
  if (!response.ok) {
    const message = (payload as { message?: string }).message;
    throw new Error(message || `Request failed with status ${response.status}`);
  }
  return payload as T;
}
