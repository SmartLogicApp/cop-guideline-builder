export type ProviderCategoryId =
  | "hospitals-inpatient"
  | "long-term-care"
  | "outpatient-community"
  | "behavioral-health"
  | "home-end-of-life"
  | "renal-specialty"
  | "other-cms-providers";

export type RegulatoryFramework =
  | "CoP"
  | "CfC"
  | "CoverageAndPayment"
  | "ProgramRequirements"
  | "PendingVerification";

export type ContentVerificationStatus =
  | "legacy-supported"
  | "pending-verification"
  | "verified";

export interface RegulatorySource {
  id: string;
  designation: "official" | "application-guidance" | "best-practice";
  agency: string;
  title: string;
  url?: string;
  cfrReference?: string;
  lastVerifiedAt?: string;
  nextReviewAt?: string;
}

export interface CmsRequirement {
  id: string;
  providerTypeId: string;
  framework: RegulatoryFramework;
  conditionCategory: string;
  cfrReference?: string;
  requirement: string;
  plainLanguageInterpretation?: string;
  responsibleDepartments: string[];
  relatedPolicyIds: string[];
  evidenceRequirementIds: string[];
  surveyorFocus?: string;
  staffInterviewConsiderations: string[];
  gapAssessmentQuestionIds: string[];
  correctiveActionRecommendationIds: string[];
  sourceIds: string[];
  verificationStatus: ContentVerificationStatus;
  lastVerifiedAt?: string;
  nextReviewAt?: string;
}

export interface CompliancePolicyRecord {
  id: string;
  providerTypeId: string;
  requirementIds: string[];
  evidenceRequirementIds: string[];
  title: string;
  owner?: string;
  status: "draft" | "active" | "needs-review" | "missing";
}

export interface EvidenceRequirement {
  id: string;
  providerTypeId: string;
  requirementIds: string[];
  label: string;
  description?: string;
  evidenceType:
    | "policy"
    | "record"
    | "log"
    | "audit"
    | "training"
    | "credential"
    | "other";
}

export interface ComplianceGap {
  id: string;
  providerTypeId: string;
  requirementId: string;
  policyIds: string[];
  evidenceRequirementIds: string[];
  description: string;
  status:
    | "compliant"
    | "partially-compliant"
    | "non-compliant"
    | "not-applicable"
    | "needs-review";
  priority: "low" | "medium" | "high" | "critical";
  correctiveActionIds: string[];
}

export interface CorrectiveAction {
  id: string;
  providerTypeId: string;
  requirementId: string;
  gapId: string;
  evidenceRequirementIds: string[];
  action: string;
  owner?: string;
  dueDate?: string;
  status: "open" | "in-progress" | "pending-verification" | "completed" | "overdue";
}

export interface ProviderProfile {
  id: string;
  name: string;
  abbreviation?: string;
  categoryId: ProviderCategoryId;
  framework: RegulatoryFramework;
  frameworkLabel: string;
  displayReference: string;
  cfrReferences: string[];
  topics: string[];
  requirementIds: string[];
  policyIds: string[];
  surveyReadinessItemIds: string[];
  evidenceRequirementIds: string[];
  commonDeficiencyAreaIds: string[];
  correctiveActionCategoryIds: string[];
  contentStatus: ContentVerificationStatus;
  contentStatusLabel: string;
  legacyKey?: string;
  ecfrSource?: {
    title: number;
    part: number;
    label: string;
  };
  ccnLookupStatus: "configured" | "pending";
}

export interface ProviderCategory {
  id: ProviderCategoryId;
  label: string;
  description: string;
}

export const PROVIDER_CATEGORIES: readonly ProviderCategory[] = [
  { id: "hospitals-inpatient", label: "Hospitals & Inpatient", description: "Hospital, inpatient, specialty, and hospital-based programs" },
  { id: "long-term-care", label: "Long-Term Care", description: "Post-acute, nursing, and intermediate care settings" },
  { id: "outpatient-community", label: "Outpatient & Community", description: "Ambulatory and community-based provider settings" },
  { id: "behavioral-health", label: "Behavioral Health", description: "Community and substance-use treatment programs" },
  { id: "home-end-of-life", label: "Home & End-of-Life", description: "Home-based and end-of-life care providers" },
  { id: "renal-specialty", label: "Renal & Specialty", description: "Renal, laboratory, procurement, and specialty suppliers" },
  { id: "other-cms-providers", label: "Other CMS-Certified Providers", description: "Additional CMS programs and provider organizations" },
] as const;

export const DEFAULT_COMPLIANCE_TOPICS = [
  "Infection Control & Prevention",
  "Patient Rights & Grievances",
  "Quality Assessment & Performance Improvement",
  "Nursing Services",
  "Medical Staff",
  "Medication Management",
  "Medical Records",
  "Emergency Preparedness",
  "Physical Environment & Safety",
  "Discharge Planning",
  "Surgical Services",
  "Anesthesia Services",
  "Governing Body Oversight",
  "Staff Competency & Training",
  "Patient Safety & Fall Prevention",
  "Restraint & Seclusion",
  "Laboratory Services",
] as const;

const HOSPITAL_TOPICS = [
  "Governing Body Oversight", "Medical Staff", "Nursing Services",
  "Patient Rights & Grievances", "Quality Assessment & Performance Improvement",
  "Infection Control & Prevention", "Pharmaceutical Services", "Medical Records",
  "Emergency Services", "Surgical Services", "Anesthesia Services",
  "Laboratory Services", "Radiology Services", "Discharge Planning",
  "Utilization Review", "Emergency Preparedness", "Physical Environment & Safety",
  "Restraint & Seclusion",
];

const LONG_TERM_CARE_TOPICS = [
  "Resident Rights", "Resident Assessment", "Comprehensive Care Plan",
  "Nursing Services", "Physician Services", "Pharmacy Services",
  "Dietary Services", "Infection Control & Prevention",
  "Quality Assurance & Performance Improvement", "Behavioral Health",
  "Activities", "Transfers & Discharges", "Abuse & Neglect Prevention",
  "Emergency Preparedness", "Physical Environment & Safety",
];

const HOME_HEALTH_TOPICS = [
  "Patient Rights & Grievances", "Comprehensive Assessment", "Plan of Care",
  "Skilled Services", "Coordination of Care", "Clinical Records",
  "Infection Control & Prevention", "Emergency Preparedness",
  "Quality Assessment & Performance Improvement", "Personnel & Competency",
];

const HOSPICE_TOPICS = [
  "Patient & Family Rights", "Initial & Comprehensive Assessment", "Plan of Care",
  "Interdisciplinary Group", "Clinical Records", "Pharmaceutical Services",
  "Infection Control & Prevention", "Bereavement", "Volunteer Services",
  "Quality Assessment & Performance Improvement",
];

const OUTPATIENT_TOPICS = [
  "Governing Body Oversight", "Patient Rights & Grievances",
  "Quality Assessment & Performance Improvement", "Infection Control & Prevention",
  "Medical Records", "Pharmaceutical Services", "Emergency Preparedness",
  "Transfer & Emergency Procedures", "Physical Environment & Safety",
  "Staff Competency & Training",
];

const BEHAVIORAL_TOPICS = [
  "Patient Rights & Grievances", "Assessment & Treatment Planning",
  "Behavioral Health Services", "Medication Management", "Clinical Records",
  "Staff Competency & Training", "Quality Assessment & Performance Improvement",
  "Emergency Preparedness", "Infection Control & Prevention",
];

const SPECIALTY_TOPICS = [
  "Governing Body Oversight", "Quality Management", "Patient Safety",
  "Infection Control & Prevention", "Clinical Records",
  "Staff Competency & Training", "Emergency Preparedness",
  "Physical Environment & Safety",
];

type ProfileSeed = Omit<
  ProviderProfile,
  | "requirementIds"
  | "policyIds"
  | "surveyReadinessItemIds"
  | "evidenceRequirementIds"
  | "commonDeficiencyAreaIds"
  | "correctiveActionCategoryIds"
  | "contentStatusLabel"
  | "ccnLookupStatus"
>;

function profile(seed: ProfileSeed): ProviderProfile {
  const pending = seed.contentStatus === "pending-verification";
  return {
    ...seed,
    requirementIds: [],
    policyIds: [],
    surveyReadinessItemIds: [],
    evidenceRequirementIds: [],
    commonDeficiencyAreaIds: [],
    correctiveActionCategoryIds: [],
    contentStatusLabel: pending ? "Content Pending Verification" : "Legacy Content Available",
    ccnLookupStatus: ["hospital", "snf", "hha", "hospice"].includes(seed.id) ? "configured" : "pending",
  };
}

function pending(
  id: string,
  name: string,
  abbreviation: string | undefined,
  categoryId: ProviderCategoryId,
  topics: string[],
): ProviderProfile {
  return profile({
    id, name, abbreviation, categoryId,
    framework: "PendingVerification",
    frameworkLabel: "Regulatory framework pending verification",
    displayReference: "Content Pending Verification",
    cfrReferences: [],
    topics,
    contentStatus: "pending-verification",
  });
}

export const PROVIDER_PROFILES: readonly ProviderProfile[] = [
  profile({ id: "hospital", legacyKey: "hospital", name: "Acute Care Hospital", abbreviation: "ACH", categoryId: "hospitals-inpatient", framework: "CoP", frameworkLabel: "Conditions of Participation", displayReference: "42 CFR 482", cfrReferences: ["42 CFR 482"], topics: HOSPITAL_TOPICS, contentStatus: "legacy-supported", ecfrSource: { title: 42, part: 482, label: "42 CFR 482 – Conditions of Participation: Hospitals" } }),
  profile({ id: "cah", legacyKey: "cah", name: "Critical Access Hospital", abbreviation: "CAH", categoryId: "hospitals-inpatient", framework: "CoP", frameworkLabel: "Conditions of Participation", displayReference: "42 CFR 485 Subpart F", cfrReferences: ["42 CFR 485 Subpart F"], topics: HOSPITAL_TOPICS, contentStatus: "legacy-supported", ecfrSource: { title: 42, part: 485, label: "42 CFR 485 – Conditions of Participation: Critical Access Hospitals" } }),
  pending("reh", "Rural Emergency Hospital", "REH", "hospitals-inpatient", HOSPITAL_TOPICS),
  profile({ id: "psych", legacyKey: "psych", name: "Psychiatric Hospital", abbreviation: "PH", categoryId: "hospitals-inpatient", framework: "CoP", frameworkLabel: "Conditions of Participation", displayReference: "42 CFR 482 Subpart E", cfrReferences: ["42 CFR 482 Subpart E"], topics: BEHAVIORAL_TOPICS, contentStatus: "legacy-supported" }),
  profile({ id: "ltch", legacyKey: "ltch", name: "Long-Term Care Hospital", abbreviation: "LTCH", categoryId: "hospitals-inpatient", framework: "CoP", frameworkLabel: "Conditions of Participation", displayReference: "42 CFR 482", cfrReferences: ["42 CFR 482"], topics: HOSPITAL_TOPICS, contentStatus: "legacy-supported" }),
  profile({ id: "irf", legacyKey: "irf", name: "Inpatient Rehabilitation Facility", abbreviation: "IRF", categoryId: "hospitals-inpatient", framework: "CoverageAndPayment", frameworkLabel: "Coverage and payment requirements", displayReference: "42 CFR 412 Subpart P", cfrReferences: ["42 CFR 412 Subpart P"], topics: HOSPITAL_TOPICS, contentStatus: "legacy-supported" }),
  profile({ id: "childrens", legacyKey: "childrens", name: "Children's Hospital", abbreviation: "CH", categoryId: "hospitals-inpatient", framework: "CoP", frameworkLabel: "Conditions of Participation", displayReference: "42 CFR 482", cfrReferences: ["42 CFR 482"], topics: HOSPITAL_TOPICS, contentStatus: "legacy-supported" }),
  pending("hospital-swing-bed", "Hospital Swing Bed", undefined, "hospitals-inpatient", [...HOSPITAL_TOPICS, ...LONG_TERM_CARE_TOPICS]),
  pending("transplant-program", "Transplant Program / Transplant Center", undefined, "hospitals-inpatient", HOSPITAL_TOPICS),

  profile({ id: "snf", legacyKey: "snf", name: "Skilled Nursing Facility", abbreviation: "SNF", categoryId: "long-term-care", framework: "CoP", frameworkLabel: "Conditions of Participation", displayReference: "42 CFR 483 Subpart B", cfrReferences: ["42 CFR 483 Subpart B"], topics: LONG_TERM_CARE_TOPICS, contentStatus: "legacy-supported", ecfrSource: { title: 42, part: 483, label: "42 CFR 483 – Requirements for States and Long Term Care Facilities" } }),
  pending("nursing-facility", "Nursing Facility", "NF", "long-term-care", LONG_TERM_CARE_TOPICS),
  pending("icf-iid", "Intermediate Care Facility for Individuals with Intellectual Disabilities", "ICF/IID", "long-term-care", LONG_TERM_CARE_TOPICS),

  profile({ id: "asc", legacyKey: "asc", name: "Ambulatory Surgical Center", abbreviation: "ASC", categoryId: "outpatient-community", framework: "CfC", frameworkLabel: "Conditions for Coverage", displayReference: "42 CFR 416", cfrReferences: ["42 CFR 416"], topics: [...OUTPATIENT_TOPICS, "Surgical Services", "Anesthesia Services"], contentStatus: "legacy-supported", ecfrSource: { title: 42, part: 416, label: "42 CFR 416 – Conditions for Coverage: Ambulatory Surgical Centers" } }),
  profile({ id: "rhc", legacyKey: "rhc", name: "Rural Health Clinic", abbreviation: "RHC", categoryId: "outpatient-community", framework: "CfC", frameworkLabel: "Conditions for Coverage", displayReference: "42 CFR 491", cfrReferences: ["42 CFR 491"], topics: OUTPATIENT_TOPICS, contentStatus: "legacy-supported", ecfrSource: { title: 42, part: 491, label: "42 CFR 491 – Conditions for Certification: Rural Health Clinics" } }),
  profile({ id: "fqhc", legacyKey: "fqhc", name: "Federally Qualified Health Center", abbreviation: "FQHC", categoryId: "outpatient-community", framework: "CoverageAndPayment", frameworkLabel: "Coverage and payment requirements", displayReference: "42 CFR 405 Subpart X", cfrReferences: ["42 CFR 405 Subpart X"], topics: OUTPATIENT_TOPICS, contentStatus: "legacy-supported" }),
  profile({ id: "corf", legacyKey: "corf", name: "Comprehensive Outpatient Rehabilitation Facility", abbreviation: "CORF", categoryId: "outpatient-community", framework: "CfC", frameworkLabel: "Conditions of Participation / coverage framework", displayReference: "42 CFR 485 Subpart B", cfrReferences: ["42 CFR 485 Subpart B"], topics: OUTPATIENT_TOPICS, contentStatus: "legacy-supported" }),
  pending("opt", "Outpatient Physical Therapy", "OPT", "outpatient-community", OUTPATIENT_TOPICS),
  pending("oot", "Outpatient Occupational Therapy", "OOT", "outpatient-community", OUTPATIENT_TOPICS),
  pending("oslp", "Outpatient Speech-Language Pathology", "OSLP", "outpatient-community", OUTPATIENT_TOPICS),

  profile({ id: "cmhc", legacyKey: "cmhc", name: "Community Mental Health Center", abbreviation: "CMHC", categoryId: "behavioral-health", framework: "CoP", frameworkLabel: "Conditions of Participation", displayReference: "42 CFR 485 Subpart H", cfrReferences: ["42 CFR 485 Subpart H"], topics: BEHAVIORAL_TOPICS, contentStatus: "legacy-supported" }),
  pending("otp", "Opioid Treatment Program", "OTP", "behavioral-health", BEHAVIORAL_TOPICS),

  profile({ id: "hha", legacyKey: "hha", name: "Home Health Agency", abbreviation: "HHA", categoryId: "home-end-of-life", framework: "CoP", frameworkLabel: "Conditions of Participation", displayReference: "42 CFR 484", cfrReferences: ["42 CFR 484"], topics: HOME_HEALTH_TOPICS, contentStatus: "legacy-supported", ecfrSource: { title: 42, part: 484, label: "42 CFR 484 – Conditions of Participation: Home Health Services" } }),
  profile({ id: "hospice", legacyKey: "hospice", name: "Hospice", categoryId: "home-end-of-life", framework: "CoP", frameworkLabel: "Conditions of Participation", displayReference: "42 CFR 418", cfrReferences: ["42 CFR 418"], topics: HOSPICE_TOPICS, contentStatus: "legacy-supported", ecfrSource: { title: 42, part: 418, label: "42 CFR 418 – Conditions of Participation: Hospice Care" } }),

  profile({ id: "esrd", legacyKey: "esrd", name: "ESRD Facility", abbreviation: "ESRD", categoryId: "renal-specialty", framework: "CfC", frameworkLabel: "Conditions for Coverage", displayReference: "42 CFR 494", cfrReferences: ["42 CFR 494"], topics: SPECIALTY_TOPICS, contentStatus: "legacy-supported", ecfrSource: { title: 42, part: 494, label: "42 CFR 494 – Conditions for Coverage: End-Stage Renal Disease Facilities" } }),
  profile({ id: "opo", legacyKey: "opo", name: "Organ Procurement Organization", abbreviation: "OPO", categoryId: "renal-specialty", framework: "CfC", frameworkLabel: "Conditions for Coverage", displayReference: "42 CFR 486 Subpart G", cfrReferences: ["42 CFR 486 Subpart G"], topics: SPECIALTY_TOPICS, contentStatus: "legacy-supported" }),
  pending("histocompatibility-lab", "Histocompatibility Laboratory", undefined, "renal-specialty", SPECIALTY_TOPICS),
  profile({ id: "xray", legacyKey: "xray", name: "Portable X-Ray Supplier", categoryId: "renal-specialty", framework: "CfC", frameworkLabel: "Conditions for Coverage", displayReference: "42 CFR 486 Subpart B", cfrReferences: ["42 CFR 486 Subpart B"], topics: SPECIALTY_TOPICS, contentStatus: "legacy-supported" }),

  pending("rnhci", "Religious Nonmedical Health Care Institution", "RNHCI", "other-cms-providers", SPECIALTY_TOPICS),
  pending("ihs-facility", "Indian Health Service Facility", "IHS", "other-cms-providers", SPECIALTY_TOPICS),
  pending("pace", "PACE Organization", "PACE", "other-cms-providers", SPECIALTY_TOPICS),
] as const;

export const CMS_REQUIREMENTS: readonly CmsRequirement[] = [];
export const REGULATORY_SOURCES: readonly RegulatorySource[] = [];
export const COMPLIANCE_POLICIES: readonly CompliancePolicyRecord[] = [];
export const EVIDENCE_REQUIREMENTS: readonly EvidenceRequirement[] = [];
export const COMPLIANCE_GAPS: readonly ComplianceGap[] = [];
export const CORRECTIVE_ACTIONS: readonly CorrectiveAction[] = [];

const PROFILE_BY_ID = new Map(PROVIDER_PROFILES.map((provider) => [provider.id, provider]));

export function getProviderProfile(providerTypeId: string): ProviderProfile | undefined {
  return PROFILE_BY_ID.get(providerTypeId);
}

export function getProviderTopics(providerTypeId: string): readonly string[] {
  return getProviderProfile(providerTypeId)?.topics ?? DEFAULT_COMPLIANCE_TOPICS;
}

export function getProvidersByCategory(categoryId: ProviderCategoryId): readonly ProviderProfile[] {
  return PROVIDER_PROFILES.filter((provider) => provider.categoryId === categoryId);
}

export function isProviderContentAvailable(providerTypeId: string): boolean {
  return getProviderProfile(providerTypeId)?.contentStatus !== "pending-verification";
}

export function getEcfrSource(providerTypeId: string): ProviderProfile["ecfrSource"] {
  return getProviderProfile(providerTypeId)?.ecfrSource;
}

export const LEGACY_INSTITUTION_TYPES = PROVIDER_PROFILES.map((provider) => ({
  value: provider.id,
  label: provider.abbreviation && !provider.name.includes(provider.abbreviation)
    ? `${provider.name} (${provider.abbreviation})`
    : provider.name,
  cfr: provider.displayReference,
  categoryId: provider.categoryId,
  contentStatus: provider.contentStatus,
}));