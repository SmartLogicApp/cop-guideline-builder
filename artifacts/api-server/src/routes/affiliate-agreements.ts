import { createHash, randomBytes } from "node:crypto";
import { Router, type IRouter } from "express";
import { rateLimit } from "express-rate-limit";
import { db, affiliates, affiliateAgreements, affiliateAgreementInvitations, affiliateAgreementAcceptances } from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";
import { requireSuperAdmin } from "../lib/admin-guards.js";
import { hasReviewedAffiliateAcceptance, reviewedAffiliateAgreementVersion } from "../lib/affiliate-agreement-state.js";
import { sendViaResend } from "../lib/resend-mailer.js";
import { getReturnBase } from "../lib/return-base.js";

const router: IRouter = Router();
const publicLimit = rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false });
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
const tokenHash = (token: unknown) =>
  typeof token === "string" && /^[a-f0-9]{64}$/.test(token) ? sha256(token) : null;

// Only a super-admin can publish the exact owner-reviewed text. Versions are
// immutable: a correction requires a new version and fresh acceptance.
router.post("/publish", requireSuperAdmin, async (req, res) => {
  const version = typeof req.body?.version === "string" ? req.body.version.trim() : "";
  const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(version)
      || body.length < 100 || body.length > 150_000
      || req.body?.confirmedReviewed !== true) {
    return res.status(400).json({ error: "Provide a version and the full reviewed agreement, then confirm owner review." });
  }
  try {
    const [created] = await db.insert(affiliateAgreements).values({
      version, body, contentSha256: sha256(body),
      publishedBy: (req as any).clerkUserId,
    }).onConflictDoNothing().returning({ version: affiliateAgreements.version });
    if (!created) return res.status(409).json({ error: "This agreement version is already published and cannot be changed." });
    return res.status(201).json({ version, published: true });
  } catch {
    return res.status(500).json({ error: "Unable to publish affiliate agreement." });
  }
});

router.get("/current", requireSuperAdmin, async (_req, res) => {
  const version = reviewedAffiliateAgreementVersion();
  if (!version) return res.json({ version: null, published: false });
  const [agreement] = await db.select({
    version: affiliateAgreements.version,
    publishedAt: affiliateAgreements.publishedAt,
  }).from(affiliateAgreements).where(eq(affiliateAgreements.version, version)).limit(1);
  return res.json(agreement
    ? { ...agreement, published: true }
    : { version, published: false });
});

router.post("/:affiliateId/invite", requireSuperAdmin, async (req, res) => {
  const version = reviewedAffiliateAgreementVersion();
  if (!version) return res.status(409).json({ error: "Set the reviewed agreement version before inviting applicants." });
  const [[agreement], [affiliate]] = await Promise.all([
    db.select().from(affiliateAgreements).where(eq(affiliateAgreements.version, version)).limit(1),
    db.select().from(affiliates).where(eq(affiliates.id, String(req.params.affiliateId))).limit(1),
  ]);
  if (!agreement) return res.status(409).json({ error: "Publish the owner-reviewed agreement before inviting applicants." });
  if (!affiliate || affiliate.status !== "pending") {
    return res.status(409).json({ error: "Only pending applicants can receive an agreement invitation." });
  }
  if (await hasReviewedAffiliateAcceptance(affiliate.id)) {
    return res.status(409).json({ error: "This applicant already accepted the current agreement." });
  }
  const token = randomBytes(32).toString("hex");
  const now = new Date();
  const returnUrl = new URL(getReturnBase(req));
  // PUBLIC_APP_URL may itself include the marketing mount path. For a
  // separately mounted preview, configure AFFILIATE_MARKETING_BASE_PATH.
  const marketingPrefix = (process.env.AFFILIATE_MARKETING_BASE_PATH ?? returnUrl.pathname)
    .replace(/\/+$/, "");
  if (marketingPrefix && !/^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(marketingPrefix)) {
    return res.status(500).json({ error: "Marketing site base path is not configured safely." });
  }
  const link = `${returnUrl.origin}${marketingPrefix}/affiliate-agreement#token=${token}`;
  // Serialize invitations for one applicant on the affiliate row. Resending
  // revokes the preceding link even when two admins click at the same time.
  const invitation = await db.transaction(async (tx) => {
    const [locked] = await tx.select().from(affiliates)
      .where(eq(affiliates.id, affiliate.id)).for("update").limit(1);
    if (!locked || locked.status !== "pending") return null;
    const [accepted] = await tx.select({ id: affiliateAgreementAcceptances.id })
      .from(affiliateAgreementAcceptances).where(and(
        eq(affiliateAgreementAcceptances.affiliateId, locked.id),
        eq(affiliateAgreementAcceptances.agreementVersion, version),
        eq(affiliateAgreementAcceptances.signerEmail, locked.email.toLowerCase()),
        eq(affiliateAgreementAcceptances.identityEpoch, locked.agreementIdentityEpoch),
      )).limit(1);
    if (accepted) return null;
    await tx.update(affiliateAgreementInvitations).set({ revokedAt: now })
      .where(and(
        eq(affiliateAgreementInvitations.affiliateId, locked.id),
        isNull(affiliateAgreementInvitations.consumedAt),
        isNull(affiliateAgreementInvitations.revokedAt),
      ));
    const [created] = await tx.insert(affiliateAgreementInvitations).values({
      affiliateId: locked.id,
      agreementVersion: version,
      tokenSha256: sha256(token),
      recipientEmail: locked.email.toLowerCase(),
      identityEpoch: locked.agreementIdentityEpoch,
      expiresAt: new Date(now.getTime() + 7 * 86_400_000),
    }).returning({ id: affiliateAgreementInvitations.id, recipientEmail: affiliateAgreementInvitations.recipientEmail });
    return created;
  });
  if (!invitation) return res.status(409).json({ error: "Applicant status or acceptance changed. Refresh the application." });
  // The fragment is not sent to the web server in an HTTP request or referrer.
  const result = await sendViaResend({
    to: invitation.recipientEmail,
    subject: "Review your CMS Compliance Suite affiliate agreement",
    text: `Please review and accept the affiliate agreement using this private link (expires in 7 days): ${link}`,
    html: `<p>Please review and accept the affiliate agreement using this private link (expires in 7 days): <a href="${link}">Review agreement</a></p>`,
  });
  if (!result.sent) {
    await db.update(affiliateAgreementInvitations).set({ revokedAt: new Date() })
      .where(eq(affiliateAgreementInvitations.id, invitation.id));
    return res.status(502).json({ error: "The invitation could not be sent. Please retry." });
  }
  await db.update(affiliateAgreementInvitations).set({ sentAt: new Date() })
    .where(eq(affiliateAgreementInvitations.id, invitation.id));
  return res.json({ sent: true, version, expiresAt: new Date(now.getTime() + 7 * 86_400_000) });
});

const invitationFields = {
  id: affiliateAgreementInvitations.id,
  affiliateId: affiliateAgreementInvitations.affiliateId,
  agreementVersion: affiliateAgreementInvitations.agreementVersion,
  recipientEmail: affiliateAgreementInvitations.recipientEmail,
  identityEpoch: affiliateAgreementInvitations.identityEpoch,
  expiresAt: affiliateAgreementInvitations.expiresAt,
  revokedAt: affiliateAgreementInvitations.revokedAt,
  consumedAt: affiliateAgreementInvitations.consumedAt,
  sentAt: affiliateAgreementInvitations.sentAt,
  body: affiliateAgreements.body,
  contentSha256: affiliateAgreements.contentSha256,
  companyName: affiliates.companyName,
  contactName: affiliates.contactName,
  currentEmail: affiliates.email,
  currentEpoch: affiliates.agreementIdentityEpoch,
  affiliateStatus: affiliates.status,
};

function validInvitation(row: {
  expiresAt: Date; revokedAt: Date | null; consumedAt: Date | null; sentAt: Date | null;
  agreementVersion: string; recipientEmail: string; currentEmail: string; affiliateStatus: string;
  identityEpoch: number; currentEpoch: number;
} | undefined): boolean {
  return Boolean(row && row.expiresAt > new Date() && !row.revokedAt && !row.consumedAt
    && row.sentAt && row.affiliateStatus === "pending"
    && row.recipientEmail === row.currentEmail.toLowerCase()
    && row.identityEpoch === row.currentEpoch
    && row.agreementVersion === reviewedAffiliateAgreementVersion());
}

router.post("/preview", publicLimit, async (req, res) => {
  const hash = tokenHash(req.body?.token);
  if (!hash) return res.status(404).json({ error: "This invitation is invalid or expired." });
  const [row] = await db.select(invitationFields).from(affiliateAgreementInvitations)
    .innerJoin(affiliateAgreements, eq(affiliateAgreementInvitations.agreementVersion, affiliateAgreements.version))
    .innerJoin(affiliates, eq(affiliateAgreementInvitations.affiliateId, affiliates.id))
    .where(eq(affiliateAgreementInvitations.tokenSha256, hash)).limit(1);
  if (!validInvitation(row)) return res.status(404).json({ error: "This invitation is invalid or expired." });
  return res.json({
    version: row!.agreementVersion, body: row!.body,
    companyName: row!.companyName, suggestedSigner: row!.contactName ?? "",
  });
});

router.post("/accept", publicLimit, async (req, res) => {
  const hash = tokenHash(req.body?.token);
  const signerName = typeof req.body?.signerName === "string" ? req.body.signerName.trim() : "";
  if (!hash || signerName.length < 2 || signerName.length > 200 || req.body?.agreed !== true) {
    return res.status(400).json({ error: "Enter your name and explicitly accept the agreement." });
  }
  try {
    const accepted = await db.transaction(async (tx) => {
      const [candidate] = await tx.select({ affiliateId: affiliateAgreementInvitations.affiliateId })
        .from(affiliateAgreementInvitations).where(eq(affiliateAgreementInvitations.tokenSha256, hash)).limit(1);
      if (!candidate) return false;
      await tx.select({ id: affiliates.id }).from(affiliates)
        .where(eq(affiliates.id, candidate.affiliateId)).for("update").limit(1);
      const [row] = await tx.select(invitationFields).from(affiliateAgreementInvitations)
        .innerJoin(affiliateAgreements, eq(affiliateAgreementInvitations.agreementVersion, affiliateAgreements.version))
        .innerJoin(affiliates, eq(affiliateAgreementInvitations.affiliateId, affiliates.id))
        .where(eq(affiliateAgreementInvitations.tokenSha256, hash)).limit(1);
      if (!validInvitation(row)) return false;
      const now = new Date();
      const [claimed] = await tx.update(affiliateAgreementInvitations)
        .set({ consumedAt: now })
        .where(and(
          eq(affiliateAgreementInvitations.id, row!.id),
          isNull(affiliateAgreementInvitations.consumedAt),
          isNull(affiliateAgreementInvitations.revokedAt),
        )).returning({ id: affiliateAgreementInvitations.id });
      if (!claimed) return false;
      await tx.insert(affiliateAgreementAcceptances).values({
        affiliateId: row!.affiliateId,
        invitationId: row!.id,
        agreementVersion: row!.agreementVersion,
        contentSha256: row!.contentSha256,
        signerName,
        signerEmail: row!.recipientEmail,
        identityEpoch: row!.identityEpoch,
        acceptedAt: now,
      });
      return true;
    });
    if (!accepted) return res.status(409).json({ error: "This invitation is invalid, expired, or already used." });
    return res.json({ accepted: true, message: "Agreement recorded. An administrator will review your application." });
  } catch {
    return res.status(500).json({ error: "Unable to record acceptance. Please try again." });
  }
});

export default router;