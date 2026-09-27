export type VerifiedAgreementDraft = {
  version: string;
  body: string;
  contentSha256: string;
};

const INTEGRITY_ERROR = 'Prepared agreement integrity check failed. The text cannot be reviewed or published. Please reload the draft.';

export async function verifyAgreementDraft(response: unknown): Promise<VerifiedAgreementDraft> {
  if (!response || typeof response !== 'object') throw new Error(INTEGRITY_ERROR);
  const { version, body, contentSha256 } = response as Record<string, unknown>;
  if (typeof version !== 'string' || typeof body !== 'string' ||
      typeof contentSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(contentSha256)) {
    throw new Error(INTEGRITY_ERROR);
  }

  // Hash the exact UTF-8 body returned by the server, not a trimmed or displayed copy.
  if (!globalThis.crypto?.subtle) throw new Error(INTEGRITY_ERROR);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
  const actual = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  if (actual !== contentSha256) throw new Error(INTEGRITY_ERROR);

  return { version, body, contentSha256 };
}