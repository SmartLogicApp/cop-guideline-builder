export function validateProductionClerkCredentials(
  nodeEnv: string | undefined,
  secretKey: string | undefined,
  publishableKey: string | undefined,
): void {
  if (nodeEnv !== "production") return;

  if (!secretKey?.trim()) {
    throw new Error("Production startup blocked: CLERK_SECRET_KEY is required (expected sk_live_).");
  }
  if (secretKey.trim().startsWith("sk_test_")) {
    throw new Error("Production startup blocked: CLERK_SECRET_KEY uses Clerk development credentials (sk_test_). Configure a production secret key (sk_live_).");
  }
  if (!secretKey.trim().startsWith("sk_live_")) {
    throw new Error("Production startup blocked: CLERK_SECRET_KEY must begin with sk_live_.");
  }
  if (!publishableKey?.trim()) {
    throw new Error("Production startup blocked: CLERK_PUBLISHABLE_KEY is required (expected pk_live_).");
  }
  if (publishableKey.trim().startsWith("pk_test_")) {
    throw new Error("Production startup blocked: CLERK_PUBLISHABLE_KEY uses Clerk development credentials (pk_test_). Configure a production publishable key (pk_live_).");
  }
  if (!publishableKey.trim().startsWith("pk_live_")) {
    throw new Error("Production startup blocked: CLERK_PUBLISHABLE_KEY must begin with pk_live_.");
  }
}