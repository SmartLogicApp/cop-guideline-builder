// Simple fetch wrapper. Auth is cookie-based via Clerk — no manual token handling.
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any)?.error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}
