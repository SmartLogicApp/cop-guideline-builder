import { Router, type IRouter } from "express";
import { clerkClient, getAuth } from "@clerk/express";
import {
  db, affiliates, affiliateComplianceStatus, affiliateDocumentVersions,
  affiliateDocumentAcknowledgements, affiliatePaymentAuthorizations,
  affiliateAgreements, affiliateAgreementAcceptances, affiliateAgreementInvitations,
  affiliateComplianceAuditLog, affiliatePayoutHolds, affiliateTaxReviewDecisions,
  affiliateEmailTemplates, affiliatePayoutWorkflow, affiliateCommissions,
  affiliatePayoutWorkflowCommissions,
} from "@workspace/db";
import { and, desc, eq, gte, inArray, isNotNull, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import { requireAnyAdmin, requireSuperAdmin } from "../lib/admin-guards.js";
import { hasReviewedAffiliateAcceptance, reviewedAffiliateAgreementVersion } from "../lib/affiliate-agreement-state.js";
import { isTestExpressRecipient } from "../lib/affiliate-connect-account.js";
import { SAMPLE_AGREEMENT_BODY, SAMPLE_AGREEMENT_VERSION, sampleAgreementAvailable } from "../lib/affiliate-sample-agreement.js";
import { calculateAffiliatePayoutEligibility, auditBlockedPayoutAttempt, PAYOUT_MINIMUM_USD } from "../lib/affiliate-payout-eligibility.js";
import {
  auditCompliance, ensureBaselineDocuments, ensureComplianceRecord,
  containsSensitiveFinancialNumber,
} from "../lib/affiliate-compliance.js";
import { sendViaResend } from "../lib/resend-mailer.js";
import { getStripeConnectTestClient } from "../stripeClient.js";
import { quarterBounds } from "../lib/affiliate-commission.js";
import { eligibleQuarterCommission, sumCommissionCents } from "../lib/affiliate-quarterly-payout.js";
import { createHash, randomUUID } from "node:crypto";

const router: IRouter = Router();
const LEGAL_DOCUMENT_TYPES = new Set(["privacy", "ftc_disclosure", "marketing_guidelines"]);
const PAYMENT_AUTH_DOCUMENT_TYPE = "payment_authorization";
const currentParam = (raw: string | string[] | undefined) => Array.isArray(raw) ? raw[0] : raw ?? "";
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

async function requireAffiliate(req: any, res: any, next: any): Promise<void> {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "A signed-in account with a verified email is required." });
    return;
  }
  try {
    // Clerk JWT session claims do not reliably include a verified email in the
    // default configuration. Resolve the primary address from Clerk itself.
    const clerkUser = await clerkClient.users.getUser(auth.userId);
    const primary = clerkUser.emailAddresses.find((entry) => entry.id === clerkUser.primaryEmailAddressId);
    const email = primary?.verification?.status === "verified"
      ? primary.emailAddress.trim().toLowerCase()
      : "";
    if (!email) {
      res.status(401).json({ error: "A signed-in account with a verified email is required." });
      return;
    }
    let [affiliate] = await db.select().from(affiliates).where(eq(affiliates.clerkUserId, auth.userId)).limit(1);
    if (!affiliate) {
      const candidates = await db.select().from(affiliates)
        .where(eq(sql`lower(${affiliates.email})`, email)).limit(2);
      if (candidates.length > 1) {
        res.status(403).json({ error: "Affiliate portal access is unavailable for this account." });
        return;
      }
      const candidate = candidates[0];
      if (candidate && !candidate.clerkUserId) {
        const [bound] = await db.update(affiliates).set({ clerkUserId: auth.userId, updatedAt: new Date() })
          .where(and(eq(affiliates.id, candidate.id), isNull(affiliates.clerkUserId), eq(sql`lower(${affiliates.email})`, email)))
          .returning();
        affiliate = bound;
      }
    }
    if (!affiliate || affiliate.email.toLowerCase() !== email || affiliate.clerkUserId !== auth.userId) {
      res.status(403).json({ error: "Affiliate portal access is unavailable for this account." });
      return;
    }
    req.affiliateId = affiliate.id;
    req.affiliate = affiliate;
    req.clerkUserId = auth.userId;
    req.clerkEmail = email;
    await ensureComplianceRecord(affiliate.id);
    await next();
  } catch {
    res.status(500).json({ error: "Unable to verify affiliate access." });
  }
}

async function getPublishedDocument(documentType: string) {
  const rows = await db.select().from(affiliateDocumentVersions).where(and(
    eq(affiliateDocumentVersions.documentType, documentType),
    eq(affiliateDocumentVersions.status, "published"),
    lte(affiliateDocumentVersions.effectiveAt, new Date()),
  )).orderBy(desc(affiliateDocumentVersions.effectiveAt), desc(affiliateDocumentVersions.publishedAt));
  return rows[0] ?? null;
}

router.get("/portal", requireAffiliate, async (req: any, res) => {
  await ensureBaselineDocuments();
  const affiliateId = req.affiliateId as string;
  const [status, publishedDocs, acknowledgements, paymentAuth, eligibility] = await Promise.all([
    db.select().from(affiliateComplianceStatus).where(eq(affiliateComplianceStatus.affiliateId, affiliateId)).limit(1),
    db.select().from(affiliateDocumentVersions).where(and(
      eq(affiliateDocumentVersions.status, "published"),
      lte(affiliateDocumentVersions.effectiveAt, new Date()),
    )),
    db.select().from(affiliateDocumentAcknowledgements).where(and(
      eq(affiliateDocumentAcknowledgements.affiliateId, affiliateId),
      eq(affiliateDocumentAcknowledgements.status, "current"),
    )),
    db.select().from(affiliatePaymentAuthorizations).where(and(
      eq(affiliatePaymentAuthorizations.affiliateId, affiliateId),
      eq(affiliatePaymentAuthorizations.status, "current"),
    )).orderBy(desc(affiliatePaymentAuthorizations.acceptedAt)).limit(1),
    calculateAffiliatePayoutEligibility(affiliateId),
  ]);
  const docs = new Map<string, typeof publishedDocs[number]>();
  for (const doc of publishedDocs) {
    const existing = docs.get(doc.documentType);
    if (!existing || (doc.effectiveAt ?? doc.publishedAt ?? doc.createdAt) > (existing.effectiveAt ?? existing.publishedAt ?? existing.createdAt)) docs.set(doc.documentType, doc);
  }
  const accepted = new Map(acknowledgements.map((ack) => [ack.documentType, ack]));
  const paymentAuthorizationDoc = docs.get(PAYMENT_AUTH_DOCUMENT_TYPE);
  const paymentAuthorizationAccepted = Boolean(paymentAuthorizationDoc && paymentAuth[0]
    && paymentAuth[0].authorizationDocumentVersionId === paymentAuthorizationDoc.id
    && paymentAuth[0].authorizationVersion === paymentAuthorizationDoc.version);
  const agreementVersion = reviewedAffiliateAgreementVersion();
  const showSample = !agreementVersion && sampleAgreementAvailable();
  const [agreement, agreementAccepted, sampleAcceptance] = await Promise.all([
    agreementVersion ? db.select({ version: affiliateAgreements.version, body: affiliateAgreements.body })
      .from(affiliateAgreements).where(eq(affiliateAgreements.version, agreementVersion)).limit(1) : Promise.resolve([]),
    hasReviewedAffiliateAcceptance(affiliateId),
    showSample ? db.select({
      acceptedAt: affiliateAgreementAcceptances.acceptedAt,
      agreementVersion: affiliateAgreementAcceptances.agreementVersion,
    }).from(affiliateAgreementAcceptances)
      .where(and(
        eq(affiliateAgreementAcceptances.affiliateId, affiliateId),
        eq(affiliateAgreementAcceptances.agreementVersion, SAMPLE_AGREEMENT_VERSION),
        eq(affiliateAgreementAcceptances.contentSha256, sha256(SAMPLE_AGREEMENT_BODY)),
        eq(affiliateAgreementAcceptances.signerEmail, req.affiliate.email.toLowerCase()),
        eq(affiliateAgreementAcceptances.identityEpoch, req.affiliate.agreementIdentityEpoch),
      )).limit(1) : Promise.resolve([]),
  ]);
  const country = status[0]?.country ?? "US";
  const checklist = [
    { key: "agreement", title: "Affiliate Partner Agreement", status: agreementAccepted ? "Complete" : "Action needed", version: agreementVersion },
    { key: "privacy", title: "Privacy Notice", status: accepted.get("privacy")?.documentVersionId === docs.get("privacy")?.id ? "Complete" : "Action needed", document: docs.get("privacy") ? { ...docs.get("privacy"), url: "/privacy" } : null },
    {
      key: "tax", title: "Tax information (W-9)",
      status: !["US", "USA", "United States"].includes(country) ? "Not eligible"
        : !status[0]?.state ? "Not started"
        : status[0]?.taxStatus === "verified_complete" ? "Complete"
        : status[0]?.taxStatus === "submitted_to_stripe" ? "Submitted" : "Action needed",
      ...(!["US", "USA", "United States"].includes(country) ? { message: "W-9 collection is not requested for international affiliates." }
        : !status[0]?.state ? { message: "Submit your country and state before beginning tax information setup." } : {}),
    },
    {
      key: "payment", title: "Payment setup",
      status: !["US", "USA", "United States"].includes(country) ? "Not eligible"
        : !status[0]?.state ? "Not started"
        : !paymentAuthorizationAccepted ? "Action needed"
        : status[0]?.stripePayoutsEnabled && status[0]?.stripeDetailsSubmitted ? "Complete"
        : status[0]?.stripeConnectedAccountId ? "Submitted" : "Action needed",
      ...(!["US", "USA", "United States"].includes(country) ? { message: "International payment setup is not available yet." }
        : !status[0]?.state ? { message: "Submit your country and state before starting secure payment setup." }
        : !paymentAuthorizationAccepted ? { message: "Review and accept the payment authorization before starting secure payment setup." } : {}),
    },
    { key: "ftc", title: "FTC affiliate disclosure acknowledgement", status: accepted.get("ftc_disclosure")?.documentVersionId === docs.get("ftc_disclosure")?.id ? "Complete" : "Action needed", document: docs.get("ftc_disclosure") ?? null },
    { key: "marketing", title: "Marketing and brand guidelines acknowledgement", status: accepted.get("marketing_guidelines")?.documentVersionId === docs.get("marketing_guidelines")?.id ? "Complete" : "Action needed", document: docs.get("marketing_guidelines") ?? null },
    { key: "admin", title: "Admin approval", status: status[0]?.adminApprovalStatus === "approved" ? "Complete" : "Under review" },
  ];
  res.setHeader("Cache-Control", "private, no-store");
  res.json({
    affiliate: { id: req.affiliate.id, contactName: req.affiliate.contactName, companyName: req.affiliate.companyName, email: req.affiliate.email },
    agreementDocument: agreement[0] ?? (showSample
      ? { version: SAMPLE_AGREEMENT_VERSION, body: SAMPLE_AGREEMENT_BODY, isSample: true }
      : null),
    sampleAgreementAcceptance: sampleAcceptance[0] ?? null,
    checklist,
    overall_status: eligibility.overall_status,
    eligible: eligibility.eligible,
    blocking_reasons: eligibility.blocking_reasons,
    country,
    internationalReviewRequired: !["US", "USA", "United States"].includes(country),
    stripe: { onboardingStatus: status[0]?.stripeOnboardingStatus ?? "not_started", payoutsEnabled: status[0]?.stripePayoutsEnabled ?? false, detailsSubmitted: status[0]?.stripeDetailsSubmitted ?? false, taxStatus: status[0]?.taxStatus ?? "not_started" },
    paymentAuthorizationDocument: paymentAuthorizationDoc ?? null,
    paymentAuthorizationText: paymentAuthorizationDoc?.content ?? null,
    paymentAuthorizationVersion: paymentAuthorizationDoc?.version ?? null,
    paymentAuthorizationAccepted,
  });
});

router.post("/portal/agreement-accept", requireAffiliate, async (req: any, res) => {
  const reviewedVersion = reviewedAffiliateAgreementVersion();
  const isSample = !reviewedVersion && sampleAgreementAvailable();
  const currentVersion = reviewedVersion ?? (isSample ? SAMPLE_AGREEMENT_VERSION : null);
  const requestedVersion = typeof req.body?.agreementVersion === "string" ? req.body.agreementVersion : "";
  const signerName = typeof req.body?.typedLegalName === "string" ? req.body.typedLegalName.trim() : "";
  if (req.body?.agreed !== true || signerName.length < 2 || signerName.length > 200
      || containsSensitiveFinancialNumber(signerName) || !currentVersion || requestedVersion !== currentVersion) {
    res.status(400).json({ error: "Review the current agreement, enter your legal name, and confirm acceptance." }); return;
  }
  if (isSample) {
    await db.insert(affiliateAgreements).values({
      version: SAMPLE_AGREEMENT_VERSION,
      body: SAMPLE_AGREEMENT_BODY,
      contentSha256: sha256(SAMPLE_AGREEMENT_BODY),
      publishedBy: "development-sample-not-reviewed",
    }).onConflictDoNothing();
  }
  const [agreement] = await db.select().from(affiliateAgreements)
    .where(eq(affiliateAgreements.version, currentVersion)).limit(1);
  if (!agreement || sha256(agreement.body) !== agreement.contentSha256
      || (isSample && agreement.body !== SAMPLE_AGREEMENT_BODY)) {
    res.status(409).json({ error: "The agreement version is unavailable or failed its integrity check." }); return;
  }
  const result = await db.transaction(async (tx) => {
    const [affiliate] = await tx.select().from(affiliates)
      .where(eq(affiliates.id, req.affiliateId)).for("update").limit(1);
    if (!affiliate || affiliate.status !== "active" || affiliate.clerkUserId !== req.clerkUserId
        || affiliate.email.toLowerCase() !== req.clerkEmail) return "identity_changed";
    const [alreadyAccepted] = await tx.select({ id: affiliateAgreements.version })
      .from(affiliateAgreements)
      .innerJoin(affiliateAgreementAcceptances, and(
        eq(affiliateAgreementAcceptances.agreementVersion, affiliateAgreements.version),
        eq(affiliateAgreementAcceptances.contentSha256, affiliateAgreements.contentSha256),
        eq(affiliateAgreementAcceptances.affiliateId, affiliate.id),
        eq(affiliateAgreementAcceptances.signerEmail, sql`lower(${affiliate.email})`),
        eq(affiliateAgreementAcceptances.identityEpoch, affiliate.agreementIdentityEpoch),
      )).where(eq(affiliateAgreements.version, currentVersion)).limit(1);
    if (alreadyAccepted) return "already_accepted";
    const now = new Date();
    const [invitation] = await tx.insert(affiliateAgreementInvitations).values({
      affiliateId: affiliate.id,
      agreementVersion: agreement.version,
      tokenSha256: sha256(randomUUID()),
      recipientEmail: affiliate.email.toLowerCase(),
      identityEpoch: affiliate.agreementIdentityEpoch,
      expiresAt: now,
      consumedAt: now,
    }).returning({ id: affiliateAgreementInvitations.id });
    await tx.insert(affiliateAgreementAcceptances).values({
      affiliateId: affiliate.id,
      invitationId: invitation.id,
      agreementVersion: agreement.version,
      contentSha256: agreement.contentSha256,
      signerName,
      signerEmail: affiliate.email.toLowerCase(),
      identityEpoch: affiliate.agreementIdentityEpoch,
      acceptedAt: now,
    });
    await tx.insert(affiliateComplianceAuditLog).values({
      affiliateId: affiliate.id, actorType: "affiliate", actorId: req.clerkUserId,
      eventType: isSample ? "sample_agreement_accepted" : "agreement_reaccepted",
      newValue: { agreementVersion: agreement.version, isSample },
      metadata: { agreementVersion: agreement.version, contentSha256: agreement.contentSha256, isSample },
    });
    return { acceptedAt: now, version: agreement.version };
  });
  if (result === "identity_changed") {
    res.status(409).json({ error: "Affiliate identity changed. Refresh and sign in again before accepting." }); return;
  }
  if (result === "already_accepted") {
    res.status(409).json({ error: "The current agreement has already been accepted." }); return;
  }
  res.status(201).json({
    accepted: true,
    agreementVersion: result.version,
    acceptedAt: result.acceptedAt.toISOString(),
    isSample,
  });
});

router.post("/portal/region", requireAffiliate, async (req: any, res) => {
  const country = typeof req.body?.country === "string" ? req.body.country.trim() : "";
  const state = typeof req.body?.state === "string" ? req.body.state.trim() : "";
  if (!country || country.length > 100 || !state || state.length > 100
      || containsSensitiveFinancialNumber(country) || containsSensitiveFinancialNumber(state)) {
    res.status(400).json({ error: "Provide your country and state or province." }); return;
  }
  const storedCountry = ["US", "USA", "United States"].includes(country) ? "US" : country;
  await db.transaction(async (tx) => {
    await tx.select({ id: affiliates.id }).from(affiliates).where(eq(affiliates.id, req.affiliateId)).for("update").limit(1);
    const [status] = await tx.select().from(affiliateComplianceStatus)
      .where(eq(affiliateComplianceStatus.affiliateId, req.affiliateId)).for("update").limit(1);
    const isUs = storedCountry === "US";
    await tx.update(affiliateComplianceStatus).set({
      country: storedCountry, state,
      taxStatus: isUs ? (status?.taxStatus === "not_applicable" ? "not_started" : status?.taxStatus ?? "not_started") : "not_applicable",
      stripeTaxFormStatus: isUs ? (status?.stripeTaxFormStatus === "not_applicable" ? "not_started" : status?.stripeTaxFormStatus ?? "not_started") : "not_applicable",
      updatedAt: new Date(),
    })
      .where(eq(affiliateComplianceStatus.affiliateId, req.affiliateId));
  });
  await auditCompliance(req.affiliateId, "affiliate", req.clerkUserId, "region_submitted", undefined, undefined, { country: storedCountry, state });
  res.json({
    saved: true, country: storedCountry, state,
    internationalReviewRequired: !["US", "USA", "United States"].includes(storedCountry),
  });
});

router.post("/portal/acknowledgements", requireAffiliate, async (req: any, res) => {
  const { documentVersionId, typedLegalName, agreed } = req.body ?? {};
  const name = typeof typedLegalName === "string" ? typedLegalName.trim() : "";
  if (typeof documentVersionId !== "string" || name.length < 2 || name.length > 200 || containsSensitiveFinancialNumber(name) || agreed !== true) {
    res.status(400).json({ error: "Review the document, enter your legal name, and confirm your agreement." }); return;
  }
  const [document] = await db.select().from(affiliateDocumentVersions).where(and(
    eq(affiliateDocumentVersions.id, documentVersionId), eq(affiliateDocumentVersions.status, "published"),
  )).limit(1);
  if (!document || !LEGAL_DOCUMENT_TYPES.has(document.documentType)) {
    res.status(404).json({ error: "Current document was not found." }); return;
  }
  const current = await getPublishedDocument(document.documentType);
  if (current?.id !== document.id) { res.status(409).json({ error: "The document changed. Refresh and review the current version." }); return; }
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.select({ id: affiliates.id }).from(affiliates).where(eq(affiliates.id, req.affiliateId)).for("update").limit(1);
    await tx.update(affiliateDocumentAcknowledgements).set({ status: "superseded", updatedAt: now })
      .where(and(eq(affiliateDocumentAcknowledgements.affiliateId, req.affiliateId), eq(affiliateDocumentAcknowledgements.documentType, document.documentType), eq(affiliateDocumentAcknowledgements.status, "current")));
    await tx.insert(affiliateDocumentAcknowledgements).values({
      affiliateId: req.affiliateId, documentVersionId: document.id, documentType: document.documentType,
      documentVersion: document.version, documentTitle: document.title, typedLegalName: name,
      acceptedAt: now, acceptanceMethod: "checkbox_typed_legal_name",
      documentUrl: document.documentType === "privacy" ? "/privacy" : null,
      // Optional request fingerprint fields are omitted: proxy/user-agent data
      // is not necessary for the acceptance proof and might contain sensitive values.
      ipAddress: null,
      userAgent: null,
      status: "current",
    });
  });
  await auditCompliance(req.affiliateId, "affiliate", req.clerkUserId, "document_acknowledged", undefined, undefined, { version: document.version }, { documentType: document.documentType, documentVersionId: document.id });
  res.status(201).json({ accepted: true, acceptedAt: now.toISOString(), documentVersion: document.version });
});

router.post("/portal/payment-authorization", requireAffiliate, async (req: any, res) => {
  const name = typeof req.body?.typedLegalName === "string" ? req.body.typedLegalName.trim() : "";
  if (name.length < 2 || name.length > 200 || containsSensitiveFinancialNumber(name) || req.body?.agreed !== true) {
    res.status(400).json({ error: "Enter your legal name and confirm the payment authorization." }); return;
  }
  await ensureBaselineDocuments();
  const authorizationDoc = await getPublishedDocument(PAYMENT_AUTH_DOCUMENT_TYPE);
  if (!authorizationDoc) {
    res.status(409).json({ error: "No current published payment authorization is available." }); return;
  }
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.select({ id: affiliates.id }).from(affiliates).where(eq(affiliates.id, req.affiliateId)).for("update").limit(1);
    await tx.update(affiliatePaymentAuthorizations).set({ status: "superseded", updatedAt: now })
      .where(and(eq(affiliatePaymentAuthorizations.affiliateId, req.affiliateId), eq(affiliatePaymentAuthorizations.status, "current")));
    await tx.insert(affiliatePaymentAuthorizations).values({
      affiliateId: req.affiliateId, authorizationVersion: authorizationDoc.version,
      authorizationDocumentVersionId: authorizationDoc.id, typedLegalName: name, acceptedAt: now, status: "current",
    });
    await tx.update(affiliateComplianceStatus).set({
      paymentAuthorizationStatus: "complete", paymentAuthorizationVersion: authorizationDoc.version, updatedAt: now,
    }).where(eq(affiliateComplianceStatus.affiliateId, req.affiliateId));
  });
  await auditCompliance(req.affiliateId, "affiliate", req.clerkUserId, "payment_authorization_accepted", undefined, undefined, { version: authorizationDoc.version });
  res.status(201).json({ accepted: true, acceptedAt: now.toISOString(), authorizationVersion: authorizationDoc.version });
});

function secureApplicationOrigin(): string {
  const configured = process.env.PUBLIC_APP_URL?.trim();
  if (!configured) throw new Error("PUBLIC_APP_URL must be configured for secure Stripe return URLs.");
  const parsed = new URL(configured);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error("PUBLIC_APP_URL must be a secure HTTPS application URL.");
  return parsed.origin;
}

router.post("/portal/connect", requireAffiliate, async (req: any, res) => {
  let stage = "prerequisites";
  try {
    const status = await ensureComplianceRecord(req.affiliateId);
    if (!status.state) {
      res.status(409).json({ error: "Submit your country and state before starting secure payment setup." }); return;
    }
    if (status.country && !["US", "USA", "United States"].includes(status.country)) {
      res.status(409).json({ error: "Stripe payment setup is not available for international affiliates yet." }); return;
    }
    const authorizationDoc = await getPublishedDocument(PAYMENT_AUTH_DOCUMENT_TYPE);
    const authorization = await db.select({
      id: affiliatePaymentAuthorizations.id,
      version: affiliatePaymentAuthorizations.authorizationVersion,
      documentVersionId: affiliatePaymentAuthorizations.authorizationDocumentVersionId,
    }).from(affiliatePaymentAuthorizations)
      .where(and(eq(affiliatePaymentAuthorizations.affiliateId, req.affiliateId), eq(affiliatePaymentAuthorizations.status, "current"))).limit(1);
    if (!authorizationDoc || !authorization[0]
        || authorization[0].documentVersionId !== authorizationDoc.id
        || authorization[0].version !== authorizationDoc.version) {
      res.status(409).json({ error: "Accept the current payment authorization before starting payment setup." }); return;
    }
    const stripe = getStripeConnectTestClient();
    let accountId = status.stripeConnectedAccountId;
    if (!accountId) {
      stage = "account_create";
      const account = await stripe.v2.core.accounts.create({
        contact_email: req.affiliate.email,
        display_name: req.affiliate.companyName || req.affiliate.contactName,
        dashboard: "express",
        defaults: { responsibilities: { fees_collector: "application", losses_collector: "application" } },
        identity: { country: "us" },
        configuration: {
          recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } },
        },
        metadata: { affiliateId: req.affiliateId },
      }, { idempotencyKey: `affiliate-connect-v2-${req.affiliateId}` });
      accountId = account.id;
      await db.update(affiliateComplianceStatus).set({
        stripeConnectedAccountId: accountId, stripeAccountType: "express", stripeOnboardingStatus: "started",
        stripeOnboardingStartedAt: new Date(), updatedAt: new Date(),
      }).where(eq(affiliateComplianceStatus.affiliateId, req.affiliateId));
    }
    stage = "return_url";
    const origin = secureApplicationOrigin();
    stage = "account_link";
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${origin}/partners/portal/payout-refresh`,
      return_url: `${origin}/partners/portal/payout-return`,
      type: "account_onboarding",
      collection_options: { fields: "eventually_due" },
    });
    await auditCompliance(req.affiliateId, "affiliate", req.clerkUserId, "stripe_onboarding_link_created");
    res.json({ url: accountLink.url });
  } catch (error: any) {
    const diagnostic = typeof error?.message === "string" ? error.message
      .replace(/(?:sk|pk)_(?:test|live)_[A-Za-z0-9]+|whsec_[A-Za-z0-9]+/g, "[credential]")
      .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]")
      .replace(/\b(?:acct|tr|evt)_[A-Za-z0-9]+\b/g, "[stripe-id]")
      .slice(0, 300) : undefined;
    req.log?.warn({
      stage, stripeCode: typeof error?.code === "string" ? error.code : undefined,
      stripeType: typeof error?.type === "string" ? error.type : undefined,
      httpStatus: typeof error?.statusCode === "number" ? error.statusCode : undefined,
      stripeParam: typeof error?.param === "string" ? error.param : undefined,
      diagnostic,
    }, "Affiliate Connect test setup failed");
    res.status(503).json({ error: "Secure payment setup is temporarily unavailable." });
  }
});

async function synchronizeStripeAccount(affiliateId: string) {
  const [status] = await db.select().from(affiliateComplianceStatus).where(eq(affiliateComplianceStatus.affiliateId, affiliateId)).limit(1);
  if (!status?.stripeConnectedAccountId) throw new Error("No connected account");
  const stripe = getStripeConnectTestClient();
  const account = await stripe.accounts.retrieve(status.stripeConnectedAccountId);
  if ("deleted" in account && account.deleted) throw new Error("Connected account unavailable");
  if (!(await isTestExpressRecipient(stripe, account))) throw new Error("Connected account is not a Test-mode Express recipient");
  const due = [...(account.requirements?.currently_due ?? []), ...(account.requirements?.past_due ?? [])].filter((v): v is string => typeof v === "string").slice(0, 50);
  const detailsSubmitted = Boolean(account.details_submitted);
  const payoutsEnabled = Boolean(account.payouts_enabled);
  const now = new Date();
  const onboardingComplete = detailsSubmitted && payoutsEnabled && due.length === 0;
  await db.transaction(async (tx) => {
    await tx.select({ id: affiliates.id }).from(affiliates).where(eq(affiliates.id, affiliateId)).for("update").limit(1);
    await tx.update(affiliateComplianceStatus).set({
      stripeAccountType: "express", stripeDetailsSubmitted: detailsSubmitted, stripePayoutsEnabled: payoutsEnabled,
      stripeChargesEnabled: Boolean(account.charges_enabled), stripeRequirementsDue: due,
      stripeOnboardingStatus: onboardingComplete ? "complete" : "action_required",
      stripeOnboardingCompletedAt: onboardingComplete ? (status.stripeOnboardingCompletedAt ?? now) : null,
      stripeAccountLastSyncedAt: now,
      // No inference from account existence: only an explicit verified Stripe tax evidence state may pass.
      updatedAt: now,
    }).where(eq(affiliateComplianceStatus.affiliateId, affiliateId));
  });
  await auditCompliance(affiliateId, "system", null, "stripe_account_synced", undefined, undefined,
    { detailsSubmitted: status.stripeDetailsSubmitted, payoutsEnabled: status.stripePayoutsEnabled },
    { detailsSubmitted, payoutsEnabled, onboardingComplete });
  return { detailsSubmitted, payoutsEnabled, onboardingComplete, requirementsDue: due };
}

router.post("/portal/connect/sync", requireAffiliate, async (req: any, res) => {
  try {
    res.json(await synchronizeStripeAccount(req.affiliateId));
  } catch {
    res.status(409).json({ error: "Payment setup status could not be confirmed. Please retry from the portal." });
  }
});

router.get("/admin", requireAnyAdmin, async (req, res) => {
  const rows = await db.select().from(affiliates).orderBy(desc(affiliates.createdAt));
  const output = await Promise.all(rows.map(async (affiliate) => ({
    id: affiliate.id, legalName: affiliate.contactName, businessName: affiliate.companyName, email: affiliate.email,
    status: affiliate.status, referralCode: affiliate.referralCode,
    eligibility: await calculateAffiliatePayoutEligibility(affiliate.id),
    compliance: (await db.select().from(affiliateComplianceStatus).where(eq(affiliateComplianceStatus.affiliateId, affiliate.id)).limit(1))[0] ?? null,
  })));
  const search = typeof req.query.search === "string" ? req.query.search.trim().toLowerCase() : "";
  const filter = typeof req.query.filter === "string" ? req.query.filter : "";
  const filtered = output.filter((row) => {
    const snapshot = row.eligibility.compliance_status as Record<string, any>;
    const matchesSearch = !search || [row.legalName, row.businessName, row.email, row.referralCode, row.compliance?.state, row.compliance?.country]
      .some((value) => typeof value === "string" && value.toLowerCase().includes(search));
    const matchesEligibility = req.query.eligible == null
      || String(req.query.eligible) === String(row.eligibility.eligible);
    const matchesFilter = !filter
      || (filter === "missing_tax" && snapshot.taxStatus !== "verified_complete")
      || (filter === "stripe_incomplete" && (!snapshot.stripe?.payoutsEnabled || !snapshot.stripe?.detailsSubmitted))
      || (filter === "missing_payment_authorization" && !snapshot.paymentAuthorization)
      || (filter === "missing_ftc" && !snapshot.documents?.ftc_disclosure)
      || (filter === "missing_marketing" && !snapshot.documents?.marketing_guidelines)
      || (filter === "under_review" && snapshot.adminApprovalStatus !== "approved")
      || (filter === "admin_hold" && Number(snapshot.activeHolds) > 0)
      || (filter === "international" && row.eligibility.overall_status === "international_review_required")
      || (filter === "inactive" && ["suspended", "terminated"].includes(row.status))
      || (filter === "eligible" && row.eligibility.eligible)
      || (filter === "not_eligible" && !row.eligibility.eligible);
    return matchesSearch && matchesEligibility && matchesFilter;
  });
  res.json(filtered);
});

router.get("/admin/documents", requireAnyAdmin, async (_req, res) => {
  await ensureBaselineDocuments();
  res.json(await db.select().from(affiliateDocumentVersions).orderBy(desc(affiliateDocumentVersions.createdAt)));
});

router.get("/admin/payouts", requireAnyAdmin, async (_req, res) => {
  const payouts = await db.select().from(affiliatePayoutWorkflow).orderBy(desc(affiliatePayoutWorkflow.createdAt));
  res.json(await Promise.all(payouts.map(async (payout) => ({
    ...payout, eligibility: await calculateAffiliatePayoutEligibility(payout.affiliateId),
  }))));
});

router.get("/admin/email-templates", requireAnyAdmin, async (_req, res) => {
  await ensureBaselineDocuments();
  res.json(await db.select().from(affiliateEmailTemplates).orderBy(affiliateEmailTemplates.templateKey));
});

router.get("/admin/:id", requireAnyAdmin, async (req, res) => {
  const id = currentParam(req.params.id);
  const [affiliate] = await db.select().from(affiliates).where(eq(affiliates.id, id)).limit(1);
  if (!affiliate) { res.status(404).json({ error: "Affiliate not found." }); return; }
  await ensureComplianceRecord(id);
  const [[status], acknowledgements, authorizations, holds, auditLog, commissions, payouts] = await Promise.all([
    db.select().from(affiliateComplianceStatus).where(eq(affiliateComplianceStatus.affiliateId, id)).limit(1),
    db.select().from(affiliateDocumentAcknowledgements).where(eq(affiliateDocumentAcknowledgements.affiliateId, id)).orderBy(desc(affiliateDocumentAcknowledgements.acceptedAt)),
    db.select().from(affiliatePaymentAuthorizations).where(eq(affiliatePaymentAuthorizations.affiliateId, id)).orderBy(desc(affiliatePaymentAuthorizations.acceptedAt)),
    db.select().from(affiliatePayoutHolds).where(eq(affiliatePayoutHolds.affiliateId, id)).orderBy(desc(affiliatePayoutHolds.createdAt)),
    db.select().from(affiliateComplianceAuditLog).where(eq(affiliateComplianceAuditLog.affiliateId, id)).orderBy(desc(affiliateComplianceAuditLog.createdAt)).limit(500),
    db.select({
      id: affiliateCommissions.id, commissionUsd: affiliateCommissions.commissionUsd,
      status: affiliateCommissions.status, accruedAt: affiliateCommissions.accruedAt,
      payableAt: affiliateCommissions.payableAt, paidAt: affiliateCommissions.paidAt,
      payoutId: affiliateCommissions.payoutId,
    }).from(affiliateCommissions).where(eq(affiliateCommissions.affiliateId, id)).orderBy(desc(affiliateCommissions.accruedAt)).limit(500),
    db.select().from(affiliatePayoutWorkflow).where(eq(affiliatePayoutWorkflow.affiliateId, id)).orderBy(desc(affiliatePayoutWorkflow.createdAt)),
  ]);
  res.json({
    affiliate, compliance: status ?? null, acknowledgements, paymentAuthorizations: authorizations,
    holds, auditLog, commissions, payouts, eligibility: await calculateAffiliatePayoutEligibility(id),
  });
});

router.post("/admin/:id/action", requireSuperAdmin, async (req: any, res) => {
  const id = currentParam(req.params.id);
  const { action } = req.body ?? {};
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (!["approve", "reject", "suspend", "terminate", "reactivate", "place_hold", "release_hold", "verify_tax", "tax_needs_correction", "tax_submitted", "tax_manual_review", "tax_not_applicable", "set_region"].includes(action)
      || reason.length < 5 || reason.length > 2000 || containsSensitiveFinancialNumber(reason)) {
    res.status(400).json({ error: "Choose a supported action and provide a review reason." }); return;
  }
  const [affiliate] = await db.select().from(affiliates).where(eq(affiliates.id, id)).limit(1);
  if (!affiliate) { res.status(404).json({ error: "Affiliate not found." }); return; }
  await ensureComplianceRecord(id);
  if (action === "reactivate") { res.status(409).json({ error: "Reactivation must use the reviewed affiliate activation workflow." }); return; }
  const newCountry = typeof req.body?.country === "string" ? req.body.country.trim() : "";
  const newState = typeof req.body?.state === "string" ? req.body.state.trim() : "";
  if (action === "set_region" && (!newCountry || newCountry.length > 100 || newState.length > 100
      || containsSensitiveFinancialNumber(newCountry) || containsSensitiveFinancialNumber(newState))) {
    res.status(400).json({ error: "Provide a country and state or province." }); return;
  }
  const now = new Date();
  let internationalTaxBlocked = false;
  let regionTaxBlocked = false;
  const before = await db.transaction(async (tx) => {
    const [lockedAffiliate] = await tx.select().from(affiliates).where(eq(affiliates.id, id)).for("update").limit(1);
    if (!lockedAffiliate) return null;
    const [status] = await tx.select().from(affiliateComplianceStatus).where(eq(affiliateComplianceStatus.affiliateId, id)).for("update").limit(1);
    const previousApproval = status?.adminApprovalStatus ?? "pending";
    if (action === "approve") {
      if (lockedAffiliate.status !== "active") return null;
      await tx.update(affiliateComplianceStatus).set({ adminApprovalStatus: "approved", updatedAt: now }).where(eq(affiliateComplianceStatus.affiliateId, id));
    } else if (action === "reject") {
      await tx.update(affiliateComplianceStatus).set({ adminApprovalStatus: "rejected", updatedAt: now }).where(eq(affiliateComplianceStatus.affiliateId, id));
    } else if (action === "suspend" || action === "terminate") {
      await tx.update(affiliates).set({ status: action === "suspend" ? "suspended" : "terminated", updatedAt: now }).where(eq(affiliates.id, id));
      if (action === "suspend") await tx.update(affiliateComplianceStatus).set({ adminApprovalStatus: "suspended", updatedAt: now }).where(eq(affiliateComplianceStatus.affiliateId, id));
    } else if (action === "place_hold") {
      const holdType = typeof req.body?.holdType === "string" && ["compliance", "fraud", "tax", "payout"].includes(req.body.holdType) ? req.body.holdType : "compliance";
      await tx.insert(affiliatePayoutHolds).values({ affiliateId: id, holdType, reason, createdByAdminId: req.clerkUserId });
      await tx.update(affiliateComplianceStatus).set({ adminHoldStatus: "active", adminHoldReason: reason, updatedAt: now }).where(eq(affiliateComplianceStatus.affiliateId, id));
    } else if (action === "release_hold") {
      await tx.update(affiliatePayoutHolds).set({ status: "released", releasedByAdminId: req.clerkUserId, releasedAt: now }).where(and(eq(affiliatePayoutHolds.affiliateId, id), eq(affiliatePayoutHolds.status, "active")));
      await tx.update(affiliateComplianceStatus).set({ adminHoldStatus: "none", adminHoldReason: null, updatedAt: now }).where(eq(affiliateComplianceStatus.affiliateId, id));
    } else if (action === "set_region") {
      const isUs = ["US", "USA", "United States"].includes(newCountry);
      await tx.update(affiliateComplianceStatus).set({
        country: isUs ? "US" : newCountry,
        state: newState || null, updatedAt: now,
        taxStatus: isUs ? (status?.taxStatus === "not_applicable" ? "not_started" : status?.taxStatus ?? "not_started") : "not_applicable",
        stripeTaxFormStatus: isUs ? (status?.stripeTaxFormStatus === "not_applicable" ? "not_started" : status?.stripeTaxFormStatus ?? "not_started") : "not_applicable",
      }).where(eq(affiliateComplianceStatus.affiliateId, id));
    } else {
      if (action.startsWith("tax_") || action === "verify_tax") {
        if (status?.country && !["US", "USA", "United States"].includes(status.country)) {
          internationalTaxBlocked = true;
          return null;
        }
        if (!status?.state) {
          regionTaxBlocked = true;
          return null;
        }
      }
      const taxStatus = action === "verify_tax" ? "verified_complete"
        : action === "tax_needs_correction" ? "needs_correction"
        : action === "tax_manual_review" ? "manual_review_required"
        : action === "tax_not_applicable" ? "not_applicable"
        : "submitted_to_stripe";
      await tx.insert(affiliateTaxReviewDecisions).values({ affiliateId: id, taxStatus, decisionType: action === "verify_tax" ? "manual_admin_verification" : action, reason, reviewedByAdminId: req.clerkUserId });
      await tx.update(affiliateComplianceStatus).set({ taxStatus, updatedAt: now }).where(eq(affiliateComplianceStatus.affiliateId, id));
    }
    await tx.insert(affiliateComplianceAuditLog).values({
      affiliateId: id, actorType: "admin", actorId: req.clerkUserId, eventType: `admin_${action}`, reason,
      priorValue: { approvalStatus: previousApproval }, newValue: { action },
    });
    return previousApproval;
  });
  if (before === null) {
    res.status(409).json({ error: internationalTaxBlocked
      ? "Tax information is not requested for international affiliates."
      : regionTaxBlocked ? "Confirm the affiliate's U.S. state and country before recording tax status."
      : "Use the reviewed affiliate approval workflow before approving payout eligibility." });
    return;
  }
  res.json({ updated: true, eligibility: await calculateAffiliatePayoutEligibility(id) });
});

router.post("/admin/:id/recheck", requireSuperAdmin, async (req, res) => {
  res.json(await calculateAffiliatePayoutEligibility(currentParam(req.params.id)));
});

router.post("/admin/documents", requireSuperAdmin, async (req: any, res) => {
  const { documentType, version, title, content } = req.body ?? {};
  if (!["privacy", "ftc_disclosure", "marketing_guidelines", PAYMENT_AUTH_DOCUMENT_TYPE].includes(documentType) || typeof version !== "string"
      || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(version)
      || typeof title !== "string" || title.trim().length < 2 || title.length > 200
      || typeof content !== "string" || content.trim().length < 20 || content.length > 150_000) {
    res.status(400).json({ error: "Provide a valid document type, immutable version, title, and document content." }); return;
  }
  if (containsSensitiveFinancialNumber(content) || containsSensitiveFinancialNumber(title)) {
    res.status(400).json({ error: "Document text cannot contain tax or payment account numbers." }); return;
  }
  try {
    const [created] = await db.insert(affiliateDocumentVersions).values({
      documentType, version, title: title.trim(), content, status: "draft",
    }).returning();
    res.status(201).json(created);
  } catch {
    res.status(409).json({ error: "That document version already exists and cannot be changed." });
  }
});

router.patch("/admin/documents/:id", requireSuperAdmin, async (req, res) => {
  const id = currentParam(req.params.id);
  const [document] = await db.select().from(affiliateDocumentVersions).where(eq(affiliateDocumentVersions.id, id)).limit(1);
  if (!document || document.status !== "draft") { res.status(409).json({ error: "Only a draft document can be edited." }); return; }
  const title = typeof req.body?.title === "string" ? req.body.title.trim() : document.title;
  const content = typeof req.body?.content === "string" ? req.body.content : document.content;
  if (title.length < 2 || title.length > 200 || content.trim().length < 20 || content.length > 150_000
      || containsSensitiveFinancialNumber(title) || containsSensitiveFinancialNumber(content)) {
    res.status(400).json({ error: "Provide safe document text within the allowed length." }); return;
  }
  const [updated] = await db.update(affiliateDocumentVersions).set({ title, content, updatedAt: new Date() })
    .where(and(eq(affiliateDocumentVersions.id, id), eq(affiliateDocumentVersions.status, "draft"))).returning();
  if (!updated) { res.status(409).json({ error: "Draft document changed; reload and try again." }); return; }
  res.json(updated);
});

router.post("/admin/documents/:id/publish", requireSuperAdmin, async (req: any, res) => {
  const id = currentParam(req.params.id);
  const effectiveAt = req.body?.effectiveAt ? new Date(req.body.effectiveAt) : new Date();
  if (!Number.isFinite(effectiveAt.getTime())) { res.status(400).json({ error: "Provide a valid effective date." }); return; }
  const [document] = await db.select().from(affiliateDocumentVersions).where(eq(affiliateDocumentVersions.id, id)).limit(1);
  if (!document || document.status !== "draft") { res.status(404).json({ error: "Draft document not found." }); return; }
  if (document.documentType === "privacy" && req.body?.confirmedReviewed !== true) {
    res.status(409).json({ error: "Confirm that this is the exact owner-approved current Privacy Notice before publishing." }); return;
  }
  const now = new Date();
  const impacted = await db.select({ affiliateId: affiliateDocumentAcknowledgements.affiliateId })
    .from(affiliateDocumentAcknowledgements).where(and(eq(affiliateDocumentAcknowledgements.documentType, document.documentType), eq(affiliateDocumentAcknowledgements.status, "current")));
  await db.transaction(async (tx) => {
    // Serialize a document-version gate change against payouts for every
    // affiliate. No transfer may cross a version publish race.
    await tx.select({ id: affiliates.id }).from(affiliates).for("update");
    await tx.update(affiliateDocumentVersions).set({ status: "retired", updatedAt: now })
      .where(and(eq(affiliateDocumentVersions.documentType, document.documentType), eq(affiliateDocumentVersions.status, "published")));
    await tx.update(affiliateDocumentVersions).set({
      status: "published", effectiveAt, publishedAt: now, publishedByAdminId: req.clerkUserId, updatedAt: now,
    }).where(and(eq(affiliateDocumentVersions.id, id), eq(affiliateDocumentVersions.status, "draft")));
    await tx.update(affiliateDocumentAcknowledgements).set({ status: "superseded", updatedAt: now })
      .where(and(eq(affiliateDocumentAcknowledgements.documentType, document.documentType), eq(affiliateDocumentAcknowledgements.status, "current")));
  });
  for (const row of impacted) {
    await auditCompliance(row.affiliateId, "admin", req.clerkUserId, "document_version_published", `Published ${document.documentType} version ${document.version}.`, undefined, { previousVersion: true }, { documentType: document.documentType, documentVersion: document.version });
  }
  res.json({ published: true, documentVersion: document.version, affectedAffiliateCount: impacted.length });
});

router.patch("/admin/email-templates/:id", requireSuperAdmin, async (req: any, res) => {
  const id = currentParam(req.params.id);
  const patch: Record<string, unknown> = { updatedAt: new Date(), updatedByAdminId: req.clerkUserId };
  if (typeof req.body?.subject === "string" && req.body.subject.length <= 200) patch.subject = req.body.subject;
  if (typeof req.body?.body === "string" && req.body.body.length <= 20_000) patch.body = req.body.body;
  if (typeof req.body?.enabled === "boolean") patch.enabled = req.body.enabled;
  if (Object.keys(patch).length <= 2) { res.status(400).json({ error: "Provide a valid template update." }); return; }
  if (containsSensitiveFinancialNumber(String(patch.subject ?? "")) || containsSensitiveFinancialNumber(String(patch.body ?? ""))) {
    res.status(400).json({ error: "Email templates cannot contain tax or payment account numbers." }); return;
  }
  const [updated] = await db.update(affiliateEmailTemplates).set(patch).where(eq(affiliateEmailTemplates.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Email template not found." }); return; }
  res.json(updated);
});

router.post("/admin/email-templates", requireSuperAdmin, async (req: any, res) => {
  const { templateKey, subject, body } = req.body ?? {};
  if (typeof templateKey !== "string" || !/^[a-z][a-z0-9_]{2,63}$/.test(templateKey)
      || typeof subject !== "string" || subject.trim().length < 3 || subject.length > 200
      || typeof body !== "string" || body.trim().length < 10 || body.length > 20_000
      || containsSensitiveFinancialNumber(subject) || containsSensitiveFinancialNumber(body)) {
    res.status(400).json({ error: "Provide a safe template key, subject, and email body." }); return;
  }
  try {
    const [created] = await db.insert(affiliateEmailTemplates).values({
      templateKey, subject: subject.trim(), body, updatedByAdminId: req.clerkUserId,
    }).returning();
    res.status(201).json(created);
  } catch {
    res.status(409).json({ error: "That email template key already exists." });
  }
});

router.post("/admin/:id/remind", requireSuperAdmin, async (req: any, res) => {
  const affiliateId = currentParam(req.params.id);
  const [affiliate] = await db.select().from(affiliates).where(eq(affiliates.id, affiliateId)).limit(1);
  if (!affiliate) { res.status(404).json({ error: "Affiliate not found." }); return; }
  const eligibility = await calculateAffiliatePayoutEligibility(affiliateId);
  if (eligibility.eligible) { res.status(409).json({ error: "No incomplete payout setup tasks remain." }); return; }
  const key = typeof req.body?.templateKey === "string" ? req.body.templateKey : "complete_payout_setup";
  const snapshot = eligibility.compliance_status as Record<string, any>;
  if (key === "tax_information_action" && (!["US", "USA", "United States"].includes(String(snapshot.country ?? "")) || !snapshot.state)) {
    res.status(409).json({ error: "Tax setup reminders are not available until U.S. country and state are confirmed." }); return;
  }
  const [template] = await db.select().from(affiliateEmailTemplates).where(eq(affiliateEmailTemplates.templateKey, key)).limit(1);
  if (template && !template.enabled) { res.status(409).json({ error: "This email template is disabled." }); return; }
  const templateText = template?.body ?? "Hello {{name}},\n\nPlease visit {{portalUrl}}. Incomplete items: {{incompleteItems}}.\nPayment is not guaranteed and remains subject to eligibility and approval.";
  const origin = secureApplicationOrigin();
  const portalUrl = `${origin}/partners/portal`;
  const name = affiliate.contactName || affiliate.companyName;
  const incomplete = eligibility.blocking_reasons.join("\n- ");
  const render = (value: string) => value
    .replaceAll("{{name}}", name).replaceAll("{{affiliate_name}}", name)
    .replaceAll("{{portalUrl}}", portalUrl).replaceAll("{{portal_url}}", portalUrl)
    .replaceAll("{{incompleteItems}}", `Incomplete items:\n- ${incomplete}`)
    .replaceAll("{{incomplete_items}}", incomplete);
  const escapeHtml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
  const renderedText = render(templateText);
  const result = await sendViaResend({
    to: affiliate.email,
    subject: (template?.subject ?? "Complete your payout setup").replaceAll("{{name}}", name).replaceAll("{{affiliate_name}}", name),
    text: renderedText,
    html: `<p>${escapeHtml(renderedText).replaceAll("\n", "<br>")}</p>`,
  });
  if (!result.sent) { res.status(502).json({ error: "Reminder could not be sent. Please retry." }); return; }
  await auditCompliance(affiliateId, "admin", req.clerkUserId, "reminder_email_sent", undefined, undefined, undefined, { templateKey: key });
  res.json({ sent: true });
});

function stripeTestPayoutGuard(): void {
  const key = process.env.STRIPE_TEST_SECRET_KEY?.trim() ?? "";
  if (process.env.NODE_ENV === "production" || !key.startsWith("sk_test_")) throw new Error("Test-mode payout sending is disabled.");
}

// A single draft path serves both manual and quarterly runs. The affiliate lock
// serializes the two paths with each other and with send/void.
async function createReviewedDraft(affiliateId: string, start: Date, end: Date, quarterly: boolean) {
  const blocked: string[] = [];
  const created = await db.transaction(async (tx) => {
    await tx.select({ id: affiliates.id }).from(affiliates).where(eq(affiliates.id, affiliateId)).for("update").limit(1);
    const eligibility = await calculateAffiliatePayoutEligibility(affiliateId, tx);
    if (!eligibility.eligible) { blocked.push(...eligibility.blocking_reasons); return null; }
    const existingDrafts = await tx.select({ id: affiliatePayoutWorkflow.id }).from(affiliatePayoutWorkflow)
      .where(and(
        eq(affiliatePayoutWorkflow.affiliateId, affiliateId),
        eq(affiliatePayoutWorkflow.payoutPeriodStart, start),
        eq(affiliatePayoutWorkflow.payoutPeriodEnd, end),
        // A transferred/reversed workflow still owns its historical period.
        ne(affiliatePayoutWorkflow.payoutStatus, "voided"),
      )).limit(1);
    const activeDrafts = await tx.select({ id: affiliatePayoutWorkflow.id }).from(affiliatePayoutWorkflow)
      .where(and(eq(affiliatePayoutWorkflow.affiliateId, affiliateId), inArray(affiliatePayoutWorkflow.payoutStatus, ["payable_pending_admin_approval", "approved_for_payout", "payout_processing"]))).limit(1);
    if (existingDrafts.length || activeDrafts.length) { blocked.push("A payout already exists for this period or another payout is awaiting settlement."); return null; }
    const periodCommissions = await tx.select({
      id: affiliateCommissions.id, amount: affiliateCommissions.commissionUsd,
      payableAt: affiliateCommissions.payableAt, accruedAt: affiliateCommissions.accruedAt,
      payoutId: affiliateCommissions.payoutId, status: affiliateCommissions.status,
    }).from(affiliateCommissions).where(and(
      eq(affiliateCommissions.affiliateId, affiliateId),
      eq(affiliateCommissions.status, "payable"),
      isNull(affiliateCommissions.payoutId),
      quarterly ? lt(affiliateCommissions.payableAt, end) : and(
        gte(affiliateCommissions.accruedAt, start),
        lte(affiliateCommissions.accruedAt, end),
      ),
       lte(affiliateCommissions.payableAt, new Date()),
    )).for("update");
    const existingClaims = periodCommissions.length
      ? await tx.select({ commissionId: affiliatePayoutWorkflowCommissions.commissionId })
        .from(affiliatePayoutWorkflowCommissions)
        .innerJoin(affiliatePayoutWorkflow, eq(affiliatePayoutWorkflow.id, affiliatePayoutWorkflowCommissions.payoutWorkflowId))
        .where(and(
          inArray(affiliatePayoutWorkflowCommissions.commissionId, periodCommissions.map((row) => row.id)),
          or(inArray(affiliatePayoutWorkflowCommissions.status, ["claimed", "paid"]),
            isNotNull(affiliatePayoutWorkflow.stripeTransferId)),
        ))
      : [];
    const claimedIds = new Set(existingClaims.map((claim) => claim.commissionId));
    const availableCommissions = periodCommissions.filter((row) =>
      eligibleQuarterCommission(row, claimedIds, end, new Date(), quarterly));
    const amountCents = sumCommissionCents(availableCommissions);
    if (amountCents < Math.round(PAYOUT_MINIMUM_USD * 100)) {
      blocked.push("Unclaimed payable commissions in this payout period must meet the minimum payout amount.");
      return null;
    }
    const amount = amountCents / 100;
    const key = randomUUID();
    const [payout] = await tx.insert(affiliatePayoutWorkflow).values({
      affiliateId, payoutPeriodStart: start, payoutPeriodEnd: end,
      grossCommissionAmount: amount.toFixed(2), adjustmentsAmount: "0.00", netPayoutAmount: amount.toFixed(2),
      currency: "usd", payoutStatus: "payable_pending_admin_approval", idempotencyKey: key,
    }).returning();
    await tx.insert(affiliatePayoutWorkflowCommissions).values(availableCommissions.map((row) => ({
      payoutWorkflowId: payout.id,
      commissionId: row.id,
      affiliateId,
      commissionAmount: (Math.round(Number(row.amount) * 100) / 100).toFixed(2),
      status: "claimed",
    })));
    return payout;
  });
  return { created, blocked };
}

function completedQuarter(value: unknown) {
  if (typeof value !== "string") return null;
  const bounds = quarterBounds(value);
  return bounds && bounds.end <= new Date() ? bounds : null;
}

async function quarterlyCandidates(end: Date) {
  // Include an already-created period so a repeat run explicitly reports it,
  // even when its commissions are no longer payable.
  const [due, existing] = await Promise.all([
    db.select({ affiliateId: affiliateCommissions.affiliateId }).from(affiliateCommissions)
      .where(and(eq(affiliateCommissions.status, "payable"), isNull(affiliateCommissions.payoutId),
        lt(affiliateCommissions.payableAt, end), lte(affiliateCommissions.payableAt, new Date()))),
    db.select({ affiliateId: affiliatePayoutWorkflow.affiliateId }).from(affiliatePayoutWorkflow)
      .where(eq(affiliatePayoutWorkflow.payoutPeriodEnd, end)),
  ]);
  return [...new Set([...due, ...existing].map((row) => row.affiliateId))].sort();
}

router.get("/admin/payouts/quarterly-preview", requireAnyAdmin, async (req, res) => {
  const bounds = completedQuarter(req.query.quarter);
  if (!bounds) { res.status(400).json({ error: "Choose a completed quarter like 2026-Q1." }); return; }
  const ids = await quarterlyCandidates(bounds.end);
  const rows = await Promise.all(ids.map(async (affiliateId) => {
    const [[affiliate], eligibility, claims, existing, active] = await Promise.all([
      db.select({ contactName: affiliates.contactName, companyName: affiliates.companyName, email: affiliates.email })
        .from(affiliates).where(eq(affiliates.id, affiliateId)).limit(1),
      calculateAffiliatePayoutEligibility(affiliateId),
      db.select({ id: affiliateCommissions.id, amount: affiliateCommissions.commissionUsd,
        payableAt: affiliateCommissions.payableAt, accruedAt: affiliateCommissions.accruedAt,
        payoutId: affiliateCommissions.payoutId, status: affiliateCommissions.status })
        .from(affiliateCommissions).where(and(eq(affiliateCommissions.affiliateId, affiliateId),
          eq(affiliateCommissions.status, "payable"), isNull(affiliateCommissions.payoutId),
          lt(affiliateCommissions.payableAt, bounds.end), lte(affiliateCommissions.payableAt, new Date()))),
      db.select({ id: affiliatePayoutWorkflow.id }).from(affiliatePayoutWorkflow)
        .where(and(eq(affiliatePayoutWorkflow.affiliateId, affiliateId),
          eq(affiliatePayoutWorkflow.payoutPeriodStart, bounds.start),
          eq(affiliatePayoutWorkflow.payoutPeriodEnd, bounds.end),
          ne(affiliatePayoutWorkflow.payoutStatus, "voided"))).limit(1),
      db.select({ id: affiliatePayoutWorkflow.id }).from(affiliatePayoutWorkflow)
        .where(and(eq(affiliatePayoutWorkflow.affiliateId, affiliateId),
          inArray(affiliatePayoutWorkflow.payoutStatus,
            ["payable_pending_admin_approval", "approved_for_payout", "payout_processing"]))).limit(1),
    ]);
    const reserved = claims.length ? await db.select({ commissionId: affiliatePayoutWorkflowCommissions.commissionId })
      .from(affiliatePayoutWorkflowCommissions)
      .innerJoin(affiliatePayoutWorkflow, eq(affiliatePayoutWorkflow.id, affiliatePayoutWorkflowCommissions.payoutWorkflowId))
      .where(and(inArray(affiliatePayoutWorkflowCommissions.commissionId, claims.map((row) => row.id)),
        or(inArray(affiliatePayoutWorkflowCommissions.status, ["claimed", "paid"]),
          isNotNull(affiliatePayoutWorkflow.stripeTransferId)))) : [];
    const available = claims.filter((row) => eligibleQuarterCommission(row,
      new Set(reserved.map((r) => r.commissionId)), bounds.end, new Date(), true));
    const amountCents = sumCommissionCents(available);
    const reasons = [...eligibility.blocking_reasons];
    if (existing.length) reasons.push("A payout already exists for this quarter.");
    else if (active.length) reasons.push("Another payout is awaiting settlement.");
    if (!available.length) reasons.push("No unclaimed payable commissions are available for this quarter.");
    else if (amountCents < PAYOUT_MINIMUM_USD * 100) reasons.push("Unclaimed payable commissions are below the minimum payout amount.");
    return { affiliateId, affiliateName: affiliate?.contactName || affiliate?.companyName || affiliate?.email || affiliateId,
      commissionCount: available.length, amountUsd: (amountCents / 100).toFixed(2),
      eligible: reasons.length === 0, blocking_reasons: reasons };
  }));
  res.setHeader("Cache-Control", "private, no-store");
  res.json({ quarter: bounds.label, rows });
});

router.post("/admin/payouts/quarterly-run", requireSuperAdmin, async (req: any, res) => {
  try { stripeTestPayoutGuard(); } catch {
    res.status(403).json({ error: "Payout workflows are restricted to Stripe test mode." }); return;
  }
  const bounds = completedQuarter(req.body?.quarter);
  if (!bounds || req.body?.confirmed !== true) {
    res.status(400).json({ error: "Confirm a completed quarter before preparing payout drafts." }); return;
  }
  const rows = [];
  for (const affiliateId of await quarterlyCandidates(bounds.end)) {
    const [affiliate] = await db.select({ contactName: affiliates.contactName, companyName: affiliates.companyName,
      email: affiliates.email }).from(affiliates).where(eq(affiliates.id, affiliateId)).limit(1);
    const affiliateName = affiliate?.contactName || affiliate?.companyName || affiliate?.email || affiliateId;
    try {
      const { created, blocked } = await createReviewedDraft(affiliateId, bounds.start, bounds.end, true);
      if (!created) await auditBlockedPayoutAttempt(affiliateId, req.clerkUserId, "quarterly_draft", blocked);
      rows.push({ affiliateId, affiliateName, status: created ? "drafted" : "held",
        payoutId: created?.id ?? null, blocking_reasons: blocked });
    } catch {
      req.log?.error({ affiliateId }, "Quarterly draft preparation failed");
      // The transaction may have committed before a later audit failed.
      // Do not assert that the affiliate was held or suggest an unsafe retry.
      rows.push({ affiliateId, affiliateName, status: "error", payoutId: null,
        blocking_reasons: ["Could not confirm this result. Refresh the preview and review payouts before retrying."] });
    }
  }
  res.json({ quarter: bounds.label, rows, drafted: rows.filter((row) => row.status === "drafted").length,
    held: rows.filter((row) => row.status === "held").length,
    errors: rows.filter((row) => row.status === "error").length });
});

router.post("/admin/payouts/draft", requireSuperAdmin, async (req: any, res) => {
  try { stripeTestPayoutGuard(); } catch {
    res.status(403).json({ error: "Payout workflows are restricted to Stripe test mode." }); return;
  }
  const affiliateId = typeof req.body?.affiliateId === "string" ? req.body.affiliateId : "";
  const start = new Date(req.body?.payoutPeriodStart);
  const end = new Date(req.body?.payoutPeriodEnd);
  if (!affiliateId || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start) {
    res.status(400).json({ error: "Provide an affiliate and valid payout period." }); return;
  }
  const [affiliateExists] = await db.select({ id: affiliates.id }).from(affiliates).where(eq(affiliates.id, affiliateId)).limit(1);
  if (!affiliateExists) { res.status(404).json({ error: "Affiliate not found." }); return; }
  const { created, blocked } = await createReviewedDraft(affiliateId, start, end, false);
  if (!created) {
    if (blocked.length) await auditBlockedPayoutAttempt(affiliateId, req.clerkUserId, "draft", blocked);
    res.status(409).json({ error: "Payout draft blocked.", blocking_reasons: blocked }); return;
  }
  res.status(201).json(created);
});

router.post("/admin/payouts/:id/approve", requireSuperAdmin, async (req: any, res) => {
  try { stripeTestPayoutGuard(); } catch {
    res.status(403).json({ error: "Payout workflows are restricted to Stripe test mode." }); return;
  }
  const id = currentParam(req.params.id);
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (reason.length < 5 || containsSensitiveFinancialNumber(reason)) { res.status(400).json({ error: "Provide a safe Admin payout approval reason." }); return; }
  const [payout] = await db.select().from(affiliatePayoutWorkflow).where(eq(affiliatePayoutWorkflow.id, id)).limit(1);
  if (!payout) { res.status(404).json({ error: "Payout not found." }); return; }
  const blocked: string[] = [];
  const approved = await db.transaction(async (tx) => {
    await tx.select({ id: affiliates.id }).from(affiliates).where(eq(affiliates.id, payout.affiliateId)).for("update").limit(1);
    const eligibility = await calculateAffiliatePayoutEligibility(payout.affiliateId, tx);
    if (!eligibility.eligible) { blocked.push(...eligibility.blocking_reasons); return null; }
    const [updated] = await tx.update(affiliatePayoutWorkflow).set({
      payoutStatus: "approved_for_payout", approvedByAdminId: req.clerkUserId, approvedAt: new Date(), updatedAt: new Date(),
    }).where(and(eq(affiliatePayoutWorkflow.id, id), eq(affiliatePayoutWorkflow.payoutStatus, "payable_pending_admin_approval"))).returning();
    return updated;
  });
  if (!approved) {
    if (blocked.length) await auditBlockedPayoutAttempt(payout.affiliateId, req.clerkUserId, "approve", blocked);
    res.status(409).json({ error: "Payout approval blocked or payout is not awaiting approval.", blocking_reasons: blocked }); return;
  }
  await auditCompliance(payout.affiliateId, "admin", req.clerkUserId, "payout_approved", reason, { status: payout.payoutStatus }, { status: approved.payoutStatus, payoutId: id });
  res.json(approved);
});

router.post("/admin/payouts/:id/void", requireSuperAdmin, async (req: any, res) => {
  try { stripeTestPayoutGuard(); } catch {
    res.status(403).json({ error: "Payout workflows are restricted to Stripe test mode." }); return;
  }
  const id = currentParam(req.params.id);
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (reason.length < 5 || containsSensitiveFinancialNumber(reason)) { res.status(400).json({ error: "Provide a safe reason for voiding this payout." }); return; }
  const [payout] = await db.select().from(affiliatePayoutWorkflow).where(eq(affiliatePayoutWorkflow.id, id)).limit(1);
  if (!payout) { res.status(404).json({ error: "Payout not found." }); return; }
  const voided = await db.transaction(async (tx) => {
    await tx.select({ id: affiliates.id }).from(affiliates).where(eq(affiliates.id, payout.affiliateId)).for("update").limit(1);
    const [locked] = await tx.select().from(affiliatePayoutWorkflow).where(eq(affiliatePayoutWorkflow.id, id)).for("update").limit(1);
      if (!locked || locked.stripeTransferId || !["payable_pending_admin_approval", "approved_for_payout"].includes(locked.payoutStatus)) return null;
    const [updated] = await tx.update(affiliatePayoutWorkflow).set({
      payoutStatus: "voided", failureReason: null, updatedAt: new Date(),
    }).where(and(eq(affiliatePayoutWorkflow.id, id), inArray(affiliatePayoutWorkflow.payoutStatus, ["payable_pending_admin_approval", "approved_for_payout"]))).returning();
    if (updated) {
      await tx.update(affiliatePayoutWorkflowCommissions).set({ status: "released", updatedAt: new Date() })
        .where(and(eq(affiliatePayoutWorkflowCommissions.payoutWorkflowId, id), eq(affiliatePayoutWorkflowCommissions.status, "claimed")));
    }
    return updated ?? null;
  });
  if (!voided) { res.status(409).json({ error: "Payout changed; reload before voiding." }); return; }
  await auditCompliance(payout.affiliateId, "admin", req.clerkUserId, "payout_voided", reason, { status: payout.payoutStatus }, { status: "voided", payoutId: id });
  res.json(voided);
});

router.post("/admin/payouts/:id/send", requireSuperAdmin, async (req: any, res) => {
  const id = currentParam(req.params.id);
  const confirmationReason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (req.body?.confirmed !== true || confirmationReason.length < 5 || containsSensitiveFinancialNumber(confirmationReason)) {
    res.status(400).json({ error: "Confirm the payout authorization and provide a reason before sending." }); return;
  }
  try { stripeTestPayoutGuard(); } catch {
    res.status(403).json({ error: "Payout sending is restricted to Stripe test mode." }); return;
  }
  const [payout] = await db.select().from(affiliatePayoutWorkflow).where(eq(affiliatePayoutWorkflow.id, id)).limit(1);
  if (!payout) { res.status(404).json({ error: "Payout not found." }); return; }
  const blocked: string[] = [];
  // Commit the attempt before calling Stripe. A lost Stripe response must not
  // leave a voidable draft whose claims could be released and transferred again.
  const attemptStarted = await db.transaction(async (tx) => {
    await tx.select({ id: affiliates.id }).from(affiliates).where(eq(affiliates.id, payout.affiliateId)).for("update").limit(1);
    const [current] = await tx.select().from(affiliatePayoutWorkflow).where(eq(affiliatePayoutWorkflow.id, id)).for("update").limit(1);
    if (!current || current.stripeTransferId || current.payoutStatus !== "approved_for_payout") return false;
    const eligibility = await calculateAffiliatePayoutEligibility(payout.affiliateId, tx);
    if (!eligibility.eligible) { blocked.push(...eligibility.blocking_reasons); return false; }
    await tx.update(affiliatePayoutWorkflow).set({
      payoutStatus: "payout_processing",
      failureReason: "Transfer attempt in progress. Do not void or retry without reconciliation.",
      updatedAt: new Date(),
    }).where(and(eq(affiliatePayoutWorkflow.id, id), eq(affiliatePayoutWorkflow.payoutStatus, "approved_for_payout")));
    return true;
  });
  if (!attemptStarted) {
    if (blocked.length) await auditBlockedPayoutAttempt(payout.affiliateId, req.clerkUserId, "send", blocked);
    res.status(409).json({ error: "Payout is ineligible, already sent, or awaiting transfer reconciliation.", blocking_reasons: blocked }); return;
  }
  try {
    // Recheck under the affiliate lock just before the external test transfer.
    // On any uncertainty the durable processing state continues reserving claims.
    const result = await db.transaction(async (tx) => {
      await tx.select({ id: affiliates.id }).from(affiliates).where(eq(affiliates.id, payout.affiliateId)).for("update").limit(1);
      const [locked] = await tx.select().from(affiliatePayoutWorkflow).where(eq(affiliatePayoutWorkflow.id, id)).for("update").limit(1);
      if (!locked || locked.stripeTransferId || locked.affiliateId !== payout.affiliateId
          || locked.payoutStatus !== "payout_processing") return null;
      const eligibility = await calculateAffiliatePayoutEligibility(payout.affiliateId, tx);
      if (!eligibility.eligible) { blocked.push(...eligibility.blocking_reasons); return null; }
      const [status] = await tx.select().from(affiliateComplianceStatus)
        .where(eq(affiliateComplianceStatus.affiliateId, payout.affiliateId)).for("update").limit(1);
      if (!status?.stripeConnectedAccountId || status.stripeAccountType !== "express" || !status.stripePayoutsEnabled) {
        blocked.push("Stripe Express payout account is not verified and enabled.");
        return null;
      }
      const claims = await tx.select().from(affiliatePayoutWorkflowCommissions).where(and(
        eq(affiliatePayoutWorkflowCommissions.payoutWorkflowId, locked.id),
        eq(affiliatePayoutWorkflowCommissions.affiliateId, locked.affiliateId),
        eq(affiliatePayoutWorkflowCommissions.status, "claimed"),
      )).for("update");
      const payable = claims.length ? await tx.select({
        id: affiliateCommissions.id, affiliateId: affiliateCommissions.affiliateId,
        amount: affiliateCommissions.commissionUsd, status: affiliateCommissions.status,
        payoutId: affiliateCommissions.payoutId,
      }).from(affiliateCommissions).where(and(
        inArray(affiliateCommissions.id, claims.map((claim) => claim.commissionId)),
        eq(affiliateCommissions.affiliateId, locked.affiliateId),
        eq(affiliateCommissions.status, "payable"),
      )).for("update") : [];
      const payableById = new Map(payable.map((row) => [row.id, row]));
      const transferredClaims = claims.length ? await tx.select({ id: affiliatePayoutWorkflowCommissions.id })
        .from(affiliatePayoutWorkflowCommissions)
        .innerJoin(affiliatePayoutWorkflow, eq(affiliatePayoutWorkflow.id, affiliatePayoutWorkflowCommissions.payoutWorkflowId))
        .where(and(inArray(affiliatePayoutWorkflowCommissions.commissionId, claims.map((claim) => claim.commissionId)),
          isNotNull(affiliatePayoutWorkflow.stripeTransferId),
          ne(affiliatePayoutWorkflow.id, locked.id))).limit(1) : [];
      const claimsMatchLedger = claims.length > 0 && payable.length === claims.length
        && claims.every((claim) => {
          const row = payableById.get(claim.commissionId);
          return row && row.payoutId == null && Math.round(Number(row.amount) * 100) === Math.round(Number(claim.commissionAmount) * 100);
        });
      const selectedAmountCents = claims.reduce((sum, claim) => sum + Math.round(Number(claim.commissionAmount) * 100), 0);
      if (transferredClaims.length || !claimsMatchLedger || selectedAmountCents !== Math.round(Number(locked.netPayoutAmount) * 100)
          || locked.currency.toLowerCase() !== "usd") {
        blocked.push("Payable commissions changed after this payout was drafted; void it and create a new draft.");
        return null;
      }
      await tx.update(affiliatePayoutWorkflow).set({ payoutStatus: "payout_processing", failureReason: null, updatedAt: new Date() })
        .where(eq(affiliatePayoutWorkflow.id, payout.id));
      const stripe = getStripeConnectTestClient();
      const transfer = await stripe.transfers.create({
        amount: Math.round(Number(locked.netPayoutAmount) * 100), currency: "usd",
        destination: status.stripeConnectedAccountId,
        transfer_group: `affiliate-payout-${locked.id}`,
        metadata: { affiliatePayoutWorkflowId: locked.id, affiliateId: locked.affiliateId },
      }, { idempotencyKey: locked.idempotencyKey });
      const destinationId = typeof transfer.destination === "string" ? transfer.destination : transfer.destination?.id;
      if (transfer.amount !== selectedAmountCents || transfer.currency.toLowerCase() !== "usd"
          || destinationId !== status.stripeConnectedAccountId
          || transfer.metadata?.affiliatePayoutWorkflowId !== locked.id
          || transfer.metadata?.affiliateId !== locked.affiliateId) {
        throw new Error("Stripe returned a transfer that does not match the locked payout and commission claims.");
      }
      const now = new Date();
      const [finalized] = await tx.update(affiliatePayoutWorkflow).set({
        stripeTransferId: transfer.id, payoutStatus: "paid", paidAt: now, updatedAt: now,
      }).where(eq(affiliatePayoutWorkflow.id, locked.id)).returning();
      const settled = await tx.update(affiliateCommissions).set({ status: "paid", paidAt: now, payoutId: locked.id })
        .where(and(inArray(affiliateCommissions.id, claims.map((claim) => claim.commissionId)), eq(affiliateCommissions.status, "payable")))
        .returning({ id: affiliateCommissions.id });
      if (settled.length !== claims.length) throw new Error("The commission ledger changed during payout settlement.");
      await tx.update(affiliatePayoutWorkflowCommissions).set({ status: "paid", updatedAt: now })
        .where(and(eq(affiliatePayoutWorkflowCommissions.payoutWorkflowId, locked.id), eq(affiliatePayoutWorkflowCommissions.status, "claimed")));
      return { updated: finalized, transferId: transfer.id };
    });
    if (!result) {
      if (blocked.length) await auditBlockedPayoutAttempt(payout.affiliateId, req.clerkUserId, "send", blocked);
      res.status(409).json({ error: "Payout send blocked; review and reconcile this processing attempt before any retry.", blocking_reasons: blocked }); return;
    }
    await auditCompliance(payout.affiliateId, "admin", req.clerkUserId, "test_mode_transfer_created", confirmationReason, { payoutId: payout.id }, { transferId: result.transferId });
    res.json({ payout: result.updated, transferId: result.transferId, testMode: true });
  } catch {
    // Even a failed response can mean Stripe accepted the transfer. Never
    // release the claims or automatically repeat this send.
    await db.update(affiliatePayoutWorkflow).set({
      failureReason: "Stripe test transfer outcome is uncertain. Reconcile the transfer before any retry or release.",
      updatedAt: new Date(),
    }).where(and(eq(affiliatePayoutWorkflow.id, payout.id), isNull(affiliatePayoutWorkflow.stripeTransferId)));
    await auditCompliance(payout.affiliateId, "admin", req.clerkUserId, "test_transfer_attempt_uncertain", confirmationReason,
      { payoutStatus: payout.payoutStatus }, { outcome: "pending_reconciliation", payoutId: payout.id });
    res.status(502).json({ error: "Stripe test transfer failed." });
  }
});

export default router;