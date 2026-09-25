import {
  db, affiliateComplianceStatus, affiliateDocumentVersions,
  affiliateComplianceAuditLog, affiliateEmailTemplates,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { PRIVACY_V2_EFFECTIVE_AT, PRIVACY_V2_VERSION, privacyV2 } from "@workspace/db";
import { redactSensitiveFinancialData } from "./sensitive-financial-text.js";
export { containsSensitiveFinancialNumber } from "./sensitive-financial-text.js";

export const PAYMENT_AUTHORIZATION_VERSION = "1.0";
export const PAYMENT_AUTHORIZATION_TEXT = "By selecting Continue to secure payment setup, I authorize CMS Compliance Guardian LLC to send approved affiliate commission payments to the payout account that I securely establish and maintain through Stripe. I confirm that I am authorized to receive payments to that account, that the payee information I provide is accurate, and that CMS Compliance Guardian LLC may correct, reverse, offset, or recover a payment when required because of an error, refund, chargeback, fraud, duplicate payment, or violation of the Affiliate Partner Agreement. This authorization does not guarantee payment and is subject to the Affiliate Partner Agreement and payout eligibility rules.";

export const FTC_ACKNOWLEDGEMENT = `I understand that I may receive commissions when someone subscribes to CMS Compliance Guardian through my affiliate referral link or referral code. I agree to clearly and conspicuously disclose this financial relationship whenever I endorse, recommend, review, promote, or link to CMS Compliance Guardian, including in social media posts, videos, blogs, emails, presentations, advertisements, and other promotional communications.

I will place the disclosure close to the endorsement or referral link, use clear language that an ordinary person can understand, and will not hide the disclosure in a profile, footer, hashtag group, terms page, or 'more' link.

An example disclosure is: 'I may earn a commission if you subscribe through my link or use my referral code.'

I understand that I may not make false, misleading, unsubstantiated, or guaranteed claims about CMS Compliance Guardian, survey outcomes, accreditation, regulatory compliance, CMS, The Joint Commission, DNV, or any healthcare organization.`;

export const MARKETING_GUIDELINES = `CMS Compliance Guardian Affiliate Marketing and Brand Guidelines

1. Affiliate relationship and disclosure
You must clearly disclose that you may earn a commission when promoting CMS Compliance Guardian. Place the disclosure close to the recommendation, referral link, or referral code.

2. Accurate claims only
You may accurately describe approved CMS Compliance Guardian features and your honest experience. You may not make false, misleading, deceptive, or unsubstantiated statements.

3. No guarantees or official affiliation claims
Do not state or imply that CMS Compliance Guardian:
- guarantees survey readiness, compliance, accreditation, certification, reimbursement, or a successful survey result
- replaces legal, clinical, accreditation, or professional judgment
- is endorsed by, affiliated with, approved by, or acting on behalf of CMS, The Joint Commission, DNV, or any government agency, unless CMS Compliance Guardian provides express written authorization
- provides official legal, regulatory, accreditation, or clinical advice

4. Approved product positioning
You may describe CMS Compliance Guardian as a compliance-support and workflow platform intended to help consultants and healthcare organizations organize survey-readiness work, research standards and expectations, develop policies and documentation, and support preparation activities.

5. Healthcare referral restriction
You may not use the affiliate program to solicit, reward, induce, influence, or compensate patient referrals, admissions, clinical referrals, federally reimbursable healthcare business, or any other activity prohibited by applicable healthcare fraud-and-abuse, anti-kickback, patient-brokering, fee-splitting, or similar laws.

6. No unauthorized promises or contracting
You may not bind CMS Compliance Guardian to a contract, change pricing, make custom offers, collect payment, issue refunds, negotiate terms on behalf of CMS Compliance Guardian, or represent that you have authority to act for CMS Compliance Guardian.

7. Brand and intellectual-property use
Use only current logos, screenshots, product descriptions, links, names, and marketing assets supplied or approved by CMS Compliance Guardian. Do not modify logos, create confusingly similar names, register domains or social-media handles using CMS Compliance Guardian trademarks, or claim ownership of CMS Compliance Guardian content.

8. Communications and privacy
Do not send spam, use purchased contact lists, make unlawful robocalls, send unlawful text messages, or violate email, text-message, advertising, privacy, or platform rules. Do not submit, disclose, upload, or transmit patient information, protected health information, customer credentials, or confidential customer information through the affiliate program.

9. Review and enforcement
CMS Compliance Guardian may request edits, removal of content, suspension of referral links, withholding of unpaid commissions where permitted by the Affiliate Partner Agreement, or termination from the program for a violation of these guidelines.`;

const defaultDocuments = [
  {
    documentType: "privacy", version: PRIVACY_V2_VERSION, title: "CMS Compliance Guardian Privacy Policy",
    content: privacyV2, effectiveAt: new Date(PRIVACY_V2_EFFECTIVE_AT),
  },
  { documentType: "ftc_disclosure", version: "1.0", title: "FTC Affiliate Disclosure Acknowledgement", content: FTC_ACKNOWLEDGEMENT },
  { documentType: "marketing_guidelines", version: "1.0", title: "CMS Compliance Guardian Affiliate Marketing and Brand Guidelines", content: MARKETING_GUIDELINES },
  {
    documentType: "payment_authorization", version: PAYMENT_AUTHORIZATION_VERSION,
    title: "Affiliate payment authorization", content: PAYMENT_AUTHORIZATION_TEXT,
  },
];

/** Installs only fixed public baseline document rows; this is data seeding, not DDL. */
export async function ensureBaselineDocuments(): Promise<void> {
  for (const document of defaultDocuments) {
    const effectiveAt = document.documentType === "privacy" ? document.effectiveAt ?? new Date() : new Date();
    if (effectiveAt > new Date()) continue;
    const [existing] = await db.select({
      id: affiliateDocumentVersions.id, content: affiliateDocumentVersions.content,
    }).from(affiliateDocumentVersions)
      .where(and(eq(affiliateDocumentVersions.documentType, document.documentType), eq(affiliateDocumentVersions.version, document.version))).limit(1);
    if (document.documentType === "privacy" && existing && existing.content !== privacyV2) {
      throw new Error("Published Privacy Policy version 2.0 differs from the owner-approved canonical text.");
    }
    if (!existing) {
      await db.insert(affiliateDocumentVersions).values({
        ...document, status: "published", effectiveAt, publishedAt: new Date(),
        publishedByAdminId: document.documentType === "privacy" ? "system:approved-privacy-v2-baseline" : "system:baseline",
      }).onConflictDoNothing();
    }
  }
  for (const [templateKey, subject] of EMAIL_TEMPLATE_DEFAULTS) {
    await db.insert(affiliateEmailTemplates).values({
      templateKey,
      subject,
      body: "Hello {{name}},\n\nPlease visit {{portalUrl}} to review your affiliate payout setup. {{incompleteItems}}\n\nPayment is not guaranteed and remains subject to eligibility and approval.",
    }).onConflictDoNothing();
  }
}

export async function ensureComplianceRecord(affiliateId: string) {
  const [existing] = await db.select().from(affiliateComplianceStatus)
    .where(eq(affiliateComplianceStatus.affiliateId, affiliateId)).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(affiliateComplianceStatus).values({ affiliateId, country: "US" })
    .onConflictDoNothing().returning();
  if (created) return created;
  const [raced] = await db.select().from(affiliateComplianceStatus)
    .where(eq(affiliateComplianceStatus.affiliateId, affiliateId)).limit(1);
  return raced!;
}

export async function auditCompliance(
  affiliateId: string, actorType: "affiliate" | "admin" | "system" | "stripe_webhook",
  actorId: string | null, eventType: string, reason?: string,
  priorValue?: unknown, newValue?: unknown, metadata?: Record<string, unknown>,
): Promise<void> {
  await db.insert(affiliateComplianceAuditLog).values({
    affiliateId, actorType, actorId, eventType, reason: redactSensitiveFinancialData(reason ?? null),
    priorValue: redactSensitiveFinancialData(priorValue ?? null),
    newValue: redactSensitiveFinancialData(newValue ?? null),
    metadata: redactSensitiveFinancialData(metadata ?? null),
  });
}

export const EMAIL_TEMPLATE_DEFAULTS = [
  ["complete_payout_setup", "Complete your payout setup"],
  ["tax_information_action", "Action required: complete W-9/tax information"],
  ["stripe_payment_setup_action", "Action required: complete Stripe payment setup"],
  ["ftc_acknowledgement_action", "Action required: accept FTC disclosure acknowledgement"],
  ["marketing_acknowledgement_action", "Action required: accept marketing and brand guidelines"],
  ["payout_setup_complete", "Your payout setup is complete"],
  ["payout_eligibility_paused", "Payout eligibility paused"],
  ["updated_document_acknowledgement", "Updated affiliate document requires your acknowledgement"],
] as const;
