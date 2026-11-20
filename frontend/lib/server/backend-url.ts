/**
 * SERVER ONLY: import this from route handlers / server code, never from a client
 * component (it reads a non-public env var, so it would just be undefined there).
 *
 * Backend base URL, read from SERVER-ONLY env so it never reaches the browser
 * bundle (anything prefixed NEXT_PUBLIC_ is inlined into client JS).
 *
 * `API_URL` is the real setting. `NEXT_PUBLIC_API_URL` is only a transition
 * fallback for deployments that have not set `API_URL` yet; remove it from the
 * build/runtime env once `API_URL` is set.
 */
export function backendBaseUrl(): string | undefined {
  const raw = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL;
  const url = raw?.trim().replace(/\/+$/, "");
  return url || undefined;
}
