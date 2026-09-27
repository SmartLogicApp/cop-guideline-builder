/**
 * Authenticate workspace requests with Clerk's current session token. A
 * short-lived token can expire while a native prompt holds the browser thread;
 * retry one 401 with a freshly minted token, but never grant access on failure.
 */
export async function fetchWithClerkToken(url, options, getToken, request = fetch) {
  if (typeof getToken !== "function") throw new Error("Sign in again to continue.");
  const token = await getToken();
  if (!token) throw new Error("Sign in again to continue.");
  const headers = new Headers(options?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  const config = { ...options, credentials: "include", headers };
  const response = await request(url, config);
  if (response.status !== 401) return response;

  const refreshedToken = await getToken({ skipCache: true });
  if (!refreshedToken) return response;
  headers.set("Authorization", `Bearer ${refreshedToken}`);
  return request(url, { ...config, headers });
}