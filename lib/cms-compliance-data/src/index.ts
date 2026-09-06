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

const HOSPITAL_REQUIREMENT_SEEDS = [
  { section: "482.11", subpart: "B", category: "Administration", title: "Condition of participation: Compliance with Federal, State and local laws." },
  { section: "482.12", subpart: "B", category: "Administration", title: "Condition of participation: Governing body." },
  { section: "482.13", subpart: "B", category: "Patient Rights", title: "Condition of participation: Patient's rights." },
  { section: "482.15", subpart: "B", category: "Emergency Preparedness", title: "Condition of participation: Emergency preparedness." },
  { section: "482.21", subpart: "C", category: "Quality", title: "Condition of participation: Quality assessment and performance improvement program." },
  { section: "482.22", subpart: "C", category: "Clinical Services", title: "Condition of participation: Medical staff." },
  { section: "482.23", subpart: "C", category: "Clinical Services", title: "Condition of participation: Nursing services." },
  { section: "482.24", subpart: "C", category: "Health Information", title: "Condition of participation: Medical record services." },
  { section: "482.25", subpart: "C", category: "Clinical Services", title: "Condition of participation: Pharmaceutical services." },
  { section: "482.26", subpart: "C", category: "Clinical Services", title: "Condition of participation: Radiologic services." },
  { section: "482.27", subpart: "C", category: "Clinical Services", title: "Condition of participation: Laboratory services." },
  { section: "482.28", subpart: "C", category: "Support Services", title: "Condition of participation: Food and dietetic services." },
  { section: "482.30", subpart: "C", category: "Utilization Review", title: "Condition of participation: Utilization review." },
  { section: "482.41", subpart: "C", category: "Environment of Care", title: "Condition of participation: Physical environment." },
  { section: "482.42", subpart: "C", category: "Infection Prevention", title: "Condition of participation: Infection prevention and control and antibiotic stewardship programs." },
  { section: "482.43", subpart: "C", category: "Care Transitions", title: "Condition of participation: Discharge planning." },
  { section: "482.45", subpart: "C", category: "Organ Procurement", title: "Condition of participation: Organ, tissue, and eye procurement." },
  { section: "482.51", subpart: "D", category: "Optional Hospital Services", title: "Condition of participation: Surgical services." },
  { section: "482.52", subpart: "D", category: "Optional Hospital Services", title: "Condition of participation: Anesthesia services." },
  { section: "482.53", subpart: "D", category: "Optional Hospital Services", title: "Condition of participation: Nuclear medicine services." },
  { section: "482.54", subpart: "D", category: "Optional Hospital Services", title: "Condition of participation: Outpatient services." },
  { section: "482.55", subpart: "D", category: "Optional Hospital Services", title: "Condition of participation: Emergency services." },
  { section: "482.56", subpart: "D", category: "Optional Hospital Services", title: "Condition of participation: Rehabilitation services." },
  { section: "482.57", subpart: "D", category: "Optional Hospital Services", title: "Condition of participation: Respiratory care services." },
  { section: "482.58", subpart: "D", category: "Optional Hospital Services", title: "Special requirements for hospital providers of long-term care services (\"swing-beds\")." },
] as const;

const HOSPITAL_REQUIREMENT_IDS = HOSPITAL_REQUIREMENT_SEEDS.map(
  ({ section }) => `hospital-cfr-${section.replace(".", "-")}`,
);

const CAH_REQUIREMENT_SEEDS = [
  { section: "485.601", category: "Program Foundation", title: "Basis and scope." },
  { section: "485.603", category: "Network Requirements", title: "Rural health network." },
  { section: "485.604", category: "Personnel", title: "Personnel qualifications." },
  { section: "485.606", category: "Certification", title: "Designation and certification of CAHs." },
  { section: "485.608", category: "Administration", title: "Condition of participation: Compliance with Federal, State, and local laws and regulations." },
  { section: "485.610", category: "Certification", title: "Condition of participation: Status and location." },
  { section: "485.612", category: "Certification", title: "Condition of participation: Compliance with hospital requirements at the time of application." },
  { section: "485.614", category: "Patient Rights", title: "Condition of participation: Patient's rights." },
  { section: "485.616", category: "Network Requirements", title: "Condition of participation: Agreements." },
  { section: "485.618", category: "Clinical Services", title: "Condition of participation: Emergency services." },
  { section: "485.620", category: "Certification", title: "Condition of participation: Number of beds and length of stay." },
  { section: "485.623", category: "Environment of Care", title: "Condition of participation: Physical plant and environment." },
  { section: "485.625", category: "Emergency Preparedness", title: "Condition of participation: Emergency preparedness." },
  { section: "485.627", category: "Administration", title: "Condition of participation: Organizational structure." },
  { section: "485.631", category: "Personnel", title: "Condition of participation: Staffing and staff responsibilities." },
  { section: "485.635", category: "Clinical Services", title: "Condition of participation: Provision of services." },
  { section: "485.638", category: "Health Information", title: "Conditions of participation: Clinical records." },
  { section: "485.639", category: "Clinical Services", title: "Condition of participation: Surgical services." },
  { section: "485.640", category: "Infection Prevention", title: "Condition of participation: Infection prevention and control and antibiotic stewardship programs." },
  { section: "485.641", category: "Quality", title: "Condition of participation: Quality assessment and performance improvement program." },
  { section: "485.642", category: "Care Transitions", title: "Condition of participation: Discharge planning." },
  { section: "485.643", category: "Organ Procurement", title: "Condition of participation: Organ, tissue, and eye procurement." },
  { section: "485.645", category: "Special Services", title: "Special requirements for CAH providers of long-term care services (“swing-beds”)." },
  { section: "485.647", category: "Special Services", title: "Condition of participation: Psychiatric and rehabilitation distinct part units." },
  { section: "485.649", category: "Special Services", title: "Condition of participation: Obstetrical services." },
] as const;

const CAH_REQUIREMENT_IDS = CAH_REQUIREMENT_SEEDS.map(
  ({ section }) => `cah-cfr-${section.replace(".", "-")}`,
);

const REH_REQUIREMENT_SEEDS = [
  { section: "485.500", category: "Program Foundation", title: "Basis and scope." },
  { section: "485.502", category: "Program Foundation", title: "Definitions." },
  { section: "485.504", category: "Certification", title: "Basic requirements." },
  { section: "485.506", category: "Certification", title: "Designation and certification of REHs." },
  { section: "485.508", category: "Administration", title: "Condition of participation: Compliance with Federal, state, and local laws and regulations." },
  { section: "485.510", category: "Administration", title: "Condition of participation: Governing body and organizational structure of the REH." },
  { section: "485.512", category: "Clinical Services", title: "Condition of participation: Medical staff." },
  { section: "485.514", category: "Clinical Services", title: "Condition of participation: Provision of services." },
  { section: "485.516", category: "Clinical Services", title: "Condition of participation: Emergency services." },
  { section: "485.518", category: "Clinical Services", title: "Condition of participation: Laboratory services." },
  { section: "485.520", category: "Clinical Services", title: "Condition of participation: Radiologic services." },
  { section: "485.522", category: "Clinical Services", title: "Condition of participation: Pharmaceutical services." },
  { section: "485.524", category: "Clinical Services", title: "Condition of participation: Additional outpatient medical and health services." },
  { section: "485.526", category: "Infection Prevention", title: "Condition of participation: Infection prevention and control and antibiotic stewardship programs." },
  { section: "485.528", category: "Personnel", title: "Condition of participation: Staffing and staff responsibilities." },
  { section: "485.530", category: "Clinical Services", title: "Condition of participation: Nursing services." },
  { section: "485.532", category: "Care Transitions", title: "Condition of participation: Discharge planning." },
  { section: "485.534", category: "Patient Rights", title: "Condition of participation: Patient's rights." },
  { section: "485.536", category: "Quality", title: "Condition of participation: Quality assessment and performance improvement program." },
  { section: "485.538", category: "Network Requirements", title: "Condition of participation: Agreements." },
  { section: "485.540", category: "Health Information", title: "Condition of participation: Medical records." },
  { section: "485.542", category: "Emergency Preparedness", title: "Condition of participation: Emergency preparedness." },
  { section: "485.544", category: "Environment of Care", title: "Condition of participation: Physical environment." },
  { section: "485.546", category: "Special Services", title: "Condition of participation: Skilled nursing facility distinct part unit." },
] as const;

const REH_REQUIREMENT_IDS = REH_REQUIREMENT_SEEDS.map(
  ({ section }) => `reh-cfr-${section.replace(".", "-")}`,
);

const PSYCHIATRIC_HOSPITAL_REQUIREMENT_SEEDS = [
  { section: "482.60", category: "Specialty Hospital Requirements", title: "Special provisions applying to psychiatric hospitals." },
  { section: "482.61", category: "Health Information", title: "Condition of participation: Special medical record requirements for psychiatric hospitals." },
  { section: "482.62", category: "Personnel", title: "Condition of participation: Special staff requirements for psychiatric hospitals." },
] as const;

const PSYCHIATRIC_HOSPITAL_REQUIREMENT_IDS = PSYCHIATRIC_HOSPITAL_REQUIREMENT_SEEDS.map(
  ({ section }) => `psych-cfr-${section.replace(".", "-")}`,
);

const LTCH_REQUIREMENT_ID = "ltch-cfr-412-23-e";
const CHILDRENS_HOSPITAL_REQUIREMENT_ID = "childrens-cfr-412-23-d";
const SWING_BED_REQUIREMENT_SEEDS = [
  {
    section: "483.10",
    subpart: "B",
    reference: "42 CFR § 483.10(b)(7), (c)(1), (c)(2)(iii), (c)(6), (d), (e)(2), (e)(4), (f)(4)(ii), (f)(4)(iii), (f)(4)(h), (g)(8), (g)(17), and (g)(18)",
    category: "Resident Rights",
    title: "Resident rights.",
  },
  {
    section: "483.5",
    subpart: "B",
    reference: "42 CFR § 483.5 (definition of transfer and discharge)",
    category: "Transfers & Discharges",
    title: "Definition of transfer and discharge.",
  },
  {
    section: "483.15",
    subpart: "B",
    reference: "42 CFR § 483.15(c)(1), (c)(2)(i), (c)(2)(ii), (c)(3), (c)(4), (c)(5), and (c)(7)",
    category: "Transfers & Discharges",
    title: "Admission, transfer, and discharge rights.",
  },
  {
    section: "483.12",
    subpart: "B",
    reference: "42 CFR § 483.12(a)(1), (a)(2), (a)(3)(i), (a)(3)(ii), (a)(4), (b)(1), (b)(2), and (c)",
    category: "Abuse Prevention",
    title: "Freedom from abuse, neglect, and exploitation.",
  },
  {
    section: "483.40",
    subpart: "B",
    reference: "42 CFR § 483.40(d)",
    category: "Social Services",
    title: "Social services.",
  },
  {
    section: "483.20",
    subpart: "B",
    reference: "42 CFR § 483.20(l)",
    category: "Discharge Planning",
    title: "Discharge summary.",
  },
  {
    section: "483.65",
    subpart: "B",
    reference: "42 CFR § 483.65",
    category: "Rehabilitation Services",
    title: "Specialized rehabilitative services.",
  },
  {
    section: "483.55",
    subpart: "B",
    reference: "42 CFR § 483.55(a)(2) through (a)(5) and (b)",
    category: "Dental Services",
    title: "Dental services.",
  },
] as const;

const SWING_BED_REQUIREMENT_IDS = SWING_BED_REQUIREMENT_SEEDS.map(
  ({ section }) => `hospital-swing-bed-cfr-${section.replace(".", "-")}`,
);

const TRANSPLANT_PROGRAM_REQUIREMENT_SEEDS = [
  { section: "482.68", category: "Program Approval", title: "Special requirement for transplant programs." },
  { section: "482.70", category: "Program Foundation", title: "Definitions." },
  { section: "482.72", category: "Program Approval", title: "Condition of participation: OPTN membership." },
  { section: "482.74", category: "Program Administration", title: "Condition of participation: Notification to CMS." },
  { section: "482.76", category: "Pediatric Transplants", title: "Condition of participation: Pediatric Transplants." },
  { section: "482.78", category: "Emergency Preparedness", title: "Condition of participation: Emergency preparedness for transplant programs." },
  { section: "482.80", category: "Data and Outcomes", title: "Condition of participation: Data submission, clinical experience, and outcome requirements for initial approval of transplant programs." },
  { section: "482.90", category: "Clinical Operations", title: "Condition of participation: Patient and living donor selection." },
  { section: "482.92", category: "Clinical Operations", title: "Condition of participation: Organ recovery and receipt." },
  { section: "482.94", category: "Clinical Operations", title: "Condition of participation: Patient and living donor management." },
  { section: "482.96", category: "Quality", title: "Condition of participation: Quality assessment and performance improvement (QAPI)." },
  { section: "482.98", category: "Personnel", title: "Condition of participation: Human resources." },
  { section: "482.100", category: "Organ Procurement", title: "Condition of participation: Organ procurement." },
  { section: "482.102", category: "Patient Rights", title: "Condition of participation: Patient and living donor rights." },
  { section: "482.104", category: "Kidney Transplants", title: "Condition of participation: Additional requirements for kidney transplant programs." },
] as const;

const TRANSPLANT_PROGRAM_REQUIREMENT_IDS = TRANSPLANT_PROGRAM_REQUIREMENT_SEEDS.map(
  ({ section }) => `transplant-program-cfr-${section.replace(".", "-")}`,
);

const SNF_REQUIREMENT_SEEDS = [
  { section: "483.1", category: "Program Foundation", title: "Basis and scope." },
  { section: "483.5", category: "Program Foundation", title: "Definitions." },
  { section: "483.10", category: "Resident Rights", title: "Resident rights." },
  { section: "483.12", category: "Abuse Prevention", title: "Freedom from abuse, neglect, and exploitation." },
  { section: "483.15", category: "Transfers & Discharges", title: "Admission, transfer, and discharge rights." },
  { section: "483.20", category: "Resident Assessment", title: "Resident assessment." },
  { section: "483.21", category: "Care Planning", title: "Comprehensive person-centered care planning." },
  { section: "483.24", category: "Quality of Life", title: "Quality of life." },
  { section: "483.25", category: "Quality of Care", title: "Quality of care." },
  { section: "483.30", category: "Physician Services", title: "Physician services." },
  { section: "483.35", category: "Nursing Services", title: "Nursing services." },
  { section: "483.40", category: "Behavioral Health", title: "Behavioral health services." },
  { section: "483.45", category: "Pharmacy Services", title: "Pharmacy services." },
  { section: "483.50", category: "Diagnostic Services", title: "Laboratory, radiology, and other diagnostic services." },
  { section: "483.55", category: "Dental Services", title: "Dental services." },
  { section: "483.60", category: "Food & Nutrition", title: "Food and nutrition services." },
  { section: "483.65", category: "Rehabilitation Services", title: "Specialized rehabilitative services." },
  { section: "483.70", category: "Administration", title: "Administration." },
  { section: "483.71", category: "Facility Assessment", title: "Facility assessment." },
  { section: "483.73", category: "Emergency Preparedness", title: "Emergency preparedness." },
  { section: "483.75", category: "Quality", title: "Quality assurance and performance improvement." },
  { section: "483.80", category: "Infection Prevention", title: "Infection control." },
  { section: "483.85", category: "Compliance", title: "Compliance and ethics program." },
  { section: "483.90", category: "Environment of Care", title: "Physical environment." },
  { section: "483.95", category: "Training", title: "Training requirements." },
] as const;

const SNF_REQUIREMENT_IDS = SNF_REQUIREMENT_SEEDS.map(
  ({ section }) => `snf-cfr-${section.replace(".", "-")}`,
);

const ICF_IID_REQUIREMENT_SEEDS = [
  { section: "483.400", category: "Program Foundation", title: "Basis and purpose." },
  { section: "483.405", category: "Regulatory Compliance", title: "Relationship to other HHS regulations." },
  { section: "483.410", category: "Administration", title: "Condition of participation: Governing body and management." },
  { section: "483.420", category: "Client Protections", title: "Condition of participation: Client protections." },
  { section: "483.430", category: "Personnel", title: "Condition of participation: Facility staffing." },
  { section: "483.440", category: "Active Treatment", title: "Condition of participation: Active treatment services." },
  { section: "483.450", category: "Client Protections", title: "Condition of participation: Client behavior and facility practices." },
  { section: "483.460", category: "Health Care Services", title: "Condition of participation: Health care services." },
  { section: "483.470", category: "Environment of Care", title: "Condition of participation: Physical environment." },
  { section: "483.475", category: "Emergency Preparedness", title: "Condition of participation: Emergency preparedness." },
  { section: "483.480", category: "Dietetic Services", title: "Condition of participation: Dietetic services." },
] as const;

const ICF_IID_REQUIREMENT_IDS = ICF_IID_REQUIREMENT_SEEDS.map(
  ({ section }) => `icf-iid-cfr-${section.replace(".", "-")}`,
);

const ASC_REQUIREMENT_SEEDS = [
  { section: "416.40", category: "Licensure", title: "Condition for coverage—Compliance with State licensure law." },
  { section: "416.41", category: "Administration", title: "Condition for coverage—Governing body and management." },
  { section: "416.42", category: "Surgical Services", title: "Condition for coverage—Surgical services." },
  { section: "416.43", category: "Quality", title: "Conditions for coverage—Quality assessment and performance improvement." },
  { section: "416.44", category: "Environment of Care", title: "Condition for coverage—Environment." },
  { section: "416.45", category: "Medical Staff", title: "Condition for coverage—Medical staff." },
  { section: "416.46", category: "Nursing Services", title: "Condition for coverage—Nursing services." },
  { section: "416.47", category: "Health Information", title: "Condition for coverage—Medical records." },
  { section: "416.48", category: "Pharmaceutical Services", title: "Condition for coverage—Pharmaceutical services." },
  { section: "416.49", category: "Diagnostic Services", title: "Condition for coverage—Laboratory and radiologic services." },
  { section: "416.50", category: "Patient Rights", title: "Condition for coverage—Patient rights." },
  { section: "416.51", category: "Infection Prevention", title: "Conditions for coverage—Infection control." },
  { section: "416.52", category: "Patient Care", title: "Conditions for coverage—Patient admission, assessment and discharge." },
  { section: "416.54", category: "Emergency Preparedness", title: "Condition for coverage—Emergency preparedness." },
] as const;

const ASC_REQUIREMENT_IDS = ASC_REQUIREMENT_SEEDS.map(
  ({ section }) => `asc-cfr-${section.replace(".", "-")}`,
);

const RHC_REQUIREMENT_SEEDS = [
  { section: "491.1", category: "Program Foundation", title: "Purpose and scope." },
  { section: "491.2", category: "Program Foundation", title: "Definitions." },
  { section: "491.3", category: "Certification", title: "Certification procedures." },
  { section: "491.4", category: "Regulatory Compliance", title: "Compliance with Federal, State and local laws." },
  { section: "491.5", category: "Location", title: "Location of clinic." },
  { section: "491.6", category: "Environment of Care", title: "Physical plant and environment." },
  { section: "491.7", category: "Administration", title: "Organizational structure." },
  { section: "491.8", category: "Personnel", title: "Staffing and staff responsibilities." },
  { section: "491.9", category: "Clinical Services", title: "Provision of services." },
  { section: "491.10", category: "Health Information", title: "Patient health records." },
  { section: "491.11", category: "Quality", title: "Program evaluation." },
  { section: "491.12", category: "Emergency Preparedness", title: "Emergency preparedness." },
] as const;

const RHC_REQUIREMENT_IDS = RHC_REQUIREMENT_SEEDS.map(
  ({ section }) => `rhc-cfr-${section.replace(".", "-")}`,
);

const FQHC_REQUIREMENT_SEEDS = [
  { section: "405.2430", title: "Basic requirements." },
  { section: "405.2434", title: "Content and terms of the agreement." },
  { section: "405.2436", title: "Termination of agreement." },
  { section: "405.2440", title: "Conditions for reinstatement after termination by CMS." },
  { section: "405.2442", title: "Notice to the public." },
  { section: "405.2444", title: "Change of ownership." },
  { section: "405.2446", title: "Scope of services." },
  { section: "405.2448", title: "Preventive primary services." },
  { section: "405.2449", title: "Preventive services." },
  { section: "405.2450", title: "Clinical psychologist, clinical social worker, marriage and family therapist, and mental health counselor services." },
  { section: "405.2452", title: "Services and supplies incident to clinical psychologist, clinical social worker, marriage and family therapist, and mental health counselor services." },
  { section: "405.2460", title: "Applicability of general payment exclusions." },
  { section: "405.2462", title: "Payment for RHC and FQHC services." },
  { section: "405.2463", title: "What constitutes a visit." },
  { section: "405.2466", title: "Annual reconciliation." },
  { section: "405.2467", title: "Requirements of the FQHC PPS." },
  { section: "405.2468", title: "Allowable costs." },
  { section: "405.2469", title: "FQHC supplemental payments." },
  { section: "405.2470", title: "Reports and maintenance of records." },
  { section: "405.2472", title: "Beneficiary appeals." },
] as const;
const FQHC_REQUIREMENT_IDS = FQHC_REQUIREMENT_SEEDS.map(({ section }) => `fqhc-cfr-${section.replace(".", "-")}`);
const CORF_REQUIREMENT_SEEDS = [
  { section: "485.50", title: "Basis and scope." }, { section: "485.51", title: "Definition." },
  { section: "485.54", title: "Condition of participation: Compliance with State and local laws." },
  { section: "485.56", title: "Condition of participation: Governing body and administration." },
  { section: "485.58", title: "Condition of participation: Comprehensive rehabilitation program." },
  { section: "485.60", title: "Condition of participation: Clinical records." },
  { section: "485.62", title: "Condition of participation: Physical environment." },
  { section: "485.66", title: "Condition of participation: Utilization review plan." },
  { section: "485.68", title: "Condition of participation: Emergency preparedness." },
  { section: "485.70", title: "Personnel qualifications." }, { section: "485.74", title: "Appeal rights." },
] as const;
const CORF_REQUIREMENT_IDS = CORF_REQUIREMENT_SEEDS.map(({ section }) => `corf-cfr-${section.replace(".", "-")}`);
const OPT_REQUIREMENT_SEEDS = [
  { section: "485.701", title: "Basis and scope." }, { section: "485.703", title: "Definitions." },
  { section: "485.705", title: "Personnel qualifications." }, { section: "485.707", title: "Condition of participation: Compliance with Federal, State, and local laws." },
  { section: "485.709", title: "Condition of participation: Administrative management." }, { section: "485.711", title: "Condition of participation: Plan of care and physician involvement." },
  { section: "485.713", title: "Condition of participation: Physical therapy services." }, { section: "485.715", title: "Condition of participation: Speech pathology services." },
  { section: "485.717", title: "Condition of participation: Rehabilitation program." }, { section: "485.719", title: "Condition of participation: Arrangements for physical therapy and speech pathology services to be performed by other than salaried organization personnel." },
  { section: "485.721", title: "Condition of participation: Clinical records." }, { section: "485.723", title: "Condition of participation: Physical environment." },
  { section: "485.725", title: "Condition of participation: Infection control." }, { section: "485.727", title: "Condition of participation: Emergency preparedness." },
  { section: "485.729", title: "Condition of participation: Program evaluation." },
] as const;
const OPT_REQUIREMENT_IDS = OPT_REQUIREMENT_SEEDS.map(({ section }) => `opt-cfr-${section.replace(".", "-")}`);
const CMHC_REQUIREMENT_SEEDS = [
  { section: "485.900", title: "Basis and scope." }, { section: "485.902", title: "Definitions." },
  { section: "485.904", title: "Condition of participation: Personnel qualifications." }, { section: "485.910", title: "Condition of participation: Client rights." },
  { section: "485.914", title: "Condition of participation: Admission, initial evaluation, comprehensive assessment, and discharge or transfer of the client." },
  { section: "485.916", title: "Condition of participation: Treatment team, person-centered active treatment plan, and coordination of services." },
  { section: "485.917", title: "Condition of participation: Quality assessment and performance improvement." },
  { section: "485.918", title: "Condition of participation: Organization, governance, administration of services, partial hospitalization services, and intensive outpatient services." },
  { section: "485.920", title: "Condition of participation: Emergency preparedness." },
] as const;
const CMHC_REQUIREMENT_IDS = CMHC_REQUIREMENT_SEEDS.map(({ section }) => `cmhc-cfr-${section.replace(".", "-")}`);
const OTP_REQUIREMENT_SEEDS = [
  { section: "8.11", title: "Opioid Treatment Program certification." },
  { section: "8.12", title: "Federal Opioid Use Disorder treatment standards." },
  { section: "8.13", title: "Revocation of accreditation and Accreditation Body approval." },
  { section: "8.14", title: "Suspension or revocation of certification." },
  { section: "8.15", title: "Forms." },
] as const;
const OTP_REQUIREMENT_IDS = OTP_REQUIREMENT_SEEDS.map(({ section }) => `otp-cfr-${section.replace(".", "-")}`);
const HHA_REQUIREMENT_SEEDS = [
  { section: "484.40", subpart: "B", title: "Condition of participation: Release of patient identifiable OASIS information." }, { section: "484.45", subpart: "B", title: "Condition of participation: Reporting OASIS information." }, { section: "484.50", subpart: "B", title: "Condition of participation: Patient rights." }, { section: "484.55", subpart: "B", title: "Condition of participation: Comprehensive assessment of patients." }, { section: "484.58", subpart: "B", title: "Condition of participation: Discharge planning." }, { section: "484.60", subpart: "B", title: "Condition of participation: Care planning, coordination of services, and quality of care." }, { section: "484.65", subpart: "B", title: "Condition of participation: Quality assessment and performance improvement (QAPI)." }, { section: "484.70", subpart: "B", title: "Condition of participation: Infection prevention and control." }, { section: "484.75", subpart: "B", title: "Condition of participation: Skilled professional services." }, { section: "484.80", subpart: "B", title: "Condition of participation: Home health aide services." },
  { section: "484.100", subpart: "C", title: "Condition of participation: Compliance with Federal, State, and local laws and regulations related to the health and safety of patients." }, { section: "484.102", subpart: "C", title: "Condition of participation: Emergency preparedness." }, { section: "484.105", subpart: "C", title: "Condition of participation: Organization and administration of services." }, { section: "484.110", subpart: "C", title: "Condition of participation: Clinical records." }, { section: "484.115", subpart: "C", title: "Condition of participation: Personnel qualifications." },
] as const;
const HHA_REQUIREMENT_IDS = HHA_REQUIREMENT_SEEDS.map(({ section }) => `hha-cfr-${section.replace(".", "-")}`);
const HOSPICE_REQUIREMENT_SEEDS = [
  ["418.52","C","Condition of participation: Patient's rights."],["418.54","C","Condition of participation: Initial and comprehensive assessment of the patient."],["418.56","C","Condition of participation: Interdisciplinary group, care planning, and coordination of services."],["418.58","C","Condition of participation: Quality assessment and performance improvement."],["418.60","C","Condition of participation: Infection control."],["418.62","C","Condition of participation: Licensed professional services."],["418.64","C","Condition of participation: Core services."],["418.66","C","Condition of participation: Nursing services—Waiver of requirement that substantially all nursing services be routinely provided directly by a hospice."],["418.70","C","Condition of participation: Furnishing of non-core services."],["418.72","C","Condition of participation: Physical therapy, occupational therapy, and speech-language pathology."],["418.74","C","Waiver of requirement—Physical therapy, occupational therapy, speech-language pathology, and dietary counseling."],["418.76","C","Condition of participation: Hospice aide and homemaker services."],["418.78","C","Conditions of participation—Volunteers."],["418.100","D","Condition of Participation: Organization and administration of services."],["418.102","D","Condition of participation: Medical director."],["418.104","D","Condition of participation: Clinical records."],["418.106","D","Condition of participation: Drugs and biologicals, medical supplies, and durable medical equipment."],["418.108","D","Condition of participation: Short-term inpatient care."],["418.110","D","Condition of participation: Hospices that provide inpatient care directly."],["418.112","D","Condition of participation: Hospices that provide hospice care to residents of a SNF/NF or ICF/IID."],["418.113","D","Condition of participation: Emergency preparedness."],["418.114","D","Condition of participation: Personnel qualifications."],["418.116","D","Condition of participation: Compliance with Federal, State, and local laws and regulations related to the health and safety of patients."]
] as const;
const HOSPICE_REQUIREMENT_IDS=HOSPICE_REQUIREMENT_SEEDS.map(([s])=>`hospice-cfr-${s.replace(".","-")}`);
const ESRD_REQUIREMENT_SEEDS = [
  { section: "494.1", subpart: "A", category: "General Provisions", title: "Basis and scope." },
  { section: "494.10", subpart: "A", category: "General Provisions", title: "Definitions." },
  { section: "494.20", subpart: "A", category: "General Provisions", title: "Condition: Compliance with Federal, State, and local laws and regulations." },
  { section: "494.30", subpart: "B", category: "Patient Safety", title: "Condition: Infection control." },
  { section: "494.40", subpart: "B", category: "Patient Safety", title: "Condition: Water and dialysate quality." },
  { section: "494.50", subpart: "B", category: "Patient Safety", title: "Condition: Reuse of hemodialyzers and bloodlines." },
  { section: "494.60", subpart: "B", category: "Patient Safety", title: "Condition: Physical environment." },
  { section: "494.62", subpart: "B", category: "Patient Safety", title: "Condition of participation: Emergency preparedness." },
  { section: "494.70", subpart: "C", category: "Patient Care", title: "Condition: Patients' rights." },
  { section: "494.80", subpart: "C", category: "Patient Care", title: "Condition: Patient assessment." },
  { section: "494.90", subpart: "C", category: "Patient Care", title: "Condition: Patient plan of care." },
  { section: "494.100", subpart: "C", category: "Patient Care", title: "Condition: Care at home." },
  { section: "494.110", subpart: "C", category: "Patient Care", title: "Condition: Quality assessment and performance improvement." },
  { section: "494.120", subpart: "C", category: "Patient Care", title: "Condition: Special purpose renal dialysis facilities." },
  { section: "494.130", subpart: "C", category: "Patient Care", title: "Condition: Laboratory services." },
  { section: "494.140", subpart: "D", category: "Administration", title: "Condition: Personnel qualifications." },
  { section: "494.150", subpart: "D", category: "Administration", title: "Condition: Responsibilities of the medical director." },
  { section: "494.160", subpart: "D", category: "Administration", title: "[Reserved]" },
  { section: "494.170", subpart: "D", category: "Administration", title: "Condition: Medical records." },
  { section: "494.180", subpart: "D", category: "Administration", title: "Condition: Governance." },
] as const;
const ESRD_REQUIREMENT_IDS = ESRD_REQUIREMENT_SEEDS.map(({ section }) => `esrd-cfr-${section.replace(".", "-")}`);
const PORTABLE_XRAY_REQUIREMENT_SEEDS = [
  { section: "486.100", category: "Compliance with Laws and Regulations", title: "Condition for coverage: Compliance with Federal, State, and local laws and regulations." },
  { section: "486.102", category: "Physician Supervision", title: "Condition for coverage: Supervision by a qualified physician." },
  { section: "486.104", category: "Technical Personnel", title: "Condition for coverage: Qualifications, orientation and health of technical personnel." },
  { section: "486.106", category: "Referral and Records", title: "Condition for coverage: Referral for service and preservation of records." },
  { section: "486.108", category: "Safety Standards", title: "Condition for coverage: Safety standards." },
  { section: "486.110", category: "Equipment Inspection", title: "Condition for coverage: Inspection of equipment." },
] as const;
const PORTABLE_XRAY_REQUIREMENT_IDS = PORTABLE_XRAY_REQUIREMENT_SEEDS.map(
  ({ section }) => `portable-xray-cfr-${section.replace(".", "-")}`,
);
const OPO_REQUIREMENT_SEEDS = [
  { section: "486.301", category: "Program Foundation", title: "Basis and scope." },
  { section: "486.302", category: "Program Foundation", title: "Definitions." },
  { section: "486.303", category: "Certification", title: "Requirements for certification." },
  { section: "486.304", category: "Designation", title: "Requirements for designation." },
  { section: "486.306", category: "Designation", title: "OPO service area size designation and documentation requirements." },
  { section: "486.308", category: "Designation", title: "Designation of one OPO for each service area." },
  { section: "486.309", category: "Certification", title: "Re-certification from August 1, 2006 through July 31, 2010." },
  { section: "486.310", category: "Certification", title: "Changes in control or ownership or service area." },
  { section: "486.312", category: "Certification", title: "De-certification." },
  { section: "486.314", category: "Appeals", title: "Appeals." },
  { section: "486.316", category: "Certification", title: "Re-certification and competition processes." },
  { section: "486.318", category: "Outcome Measures", title: "Condition: Outcome measures." },
  { section: "486.320", category: "Organ Procurement and Transplantation Network", title: "Condition: Participation in Organ Procurement and Transplantation Network." },
  { section: "486.322", category: "Hospital and Tissue Bank Relationships", title: "Condition: Relationships with hospitals, critical access hospitals, and tissue banks." },
  { section: "486.324", category: "Administration and Governing Body", title: "Condition: Administration and governing body." },
  { section: "486.326", category: "Human Resources", title: "Condition: Human resources." },
  { section: "486.328", category: "Data Reporting", title: "Condition: Reporting of data." },
  { section: "486.330", category: "Information Management", title: "Condition: Information management." },
  { section: "486.342", category: "Consent", title: "Condition: Requesting consent." },
  { section: "486.344", category: "Donor Management and Organ Recovery", title: "Condition: Evaluation and management of potential donors and organ placement and recovery." },
  { section: "486.346", category: "Organ Preparation and Transport", title: "Condition: Organ preparation and transport." },
  { section: "486.348", category: "Quality Assessment and Performance Improvement", title: "Condition: Quality assessment and performance improvement (QAPI)." },
  { section: "486.360", category: "Emergency Preparedness", title: "Condition for Coverage: Emergency preparedness." },
] as const;
const OPO_REQUIREMENT_IDS = OPO_REQUIREMENT_SEEDS.map(({ section }) => `opo-cfr-${section.replace(".", "-")}`);
// Histocompatibility laboratories are CLIA laboratories, not Medicare-certified
// transplant programs. These are the two CLIA sections specific to
// histocompatibility; the laboratory's other CLIA obligations vary by its testing.
const HISTOCOMPATIBILITY_LAB_REQUIREMENT_SEEDS = [
  { section: "493.1227", category: "CLIA Analytic Systems", title: "Condition: Histocompatibility." },
  { section: "493.1278", category: "CLIA Analytic Systems", title: "Standard: Histocompatibility." },
] as const;
const HISTOCOMPATIBILITY_LAB_REQUIREMENT_IDS = HISTOCOMPATIBILITY_LAB_REQUIREMENT_SEEDS.map(
  ({ section }) => `histocompatibility-lab-cfr-${section.replace(".", "-")}`,
);
const IRF_REQUIREMENT_SEEDS = [
  { section: "412.600", category: "Program Foundation", title: "Basis and scope of subpart." },
  { section: "412.602", category: "Program Foundation", title: "Definitions." },
  { section: "412.604", category: "Payment Eligibility", title: "Conditions for payment under the prospective payment system for inpatient rehabilitation facilities." },
  { section: "412.606", category: "Patient Assessment", title: "Patient assessments." },
  { section: "412.608", category: "Patient Rights", title: "Patients' rights regarding the collection of patient assessment data." },
  { section: "412.610", category: "Patient Assessment", title: "Assessment schedule." },
  { section: "412.612", category: "Patient Assessment", title: "Coordination of the collection of patient assessment data." },
  { section: "412.614", category: "Patient Assessment", title: "Transmission of patient assessment data." },
  { section: "412.616", category: "Patient Assessment", title: "Release of information collected using the patient assessment instrument." },
  { section: "412.618", category: "Patient Assessment", title: "Assessment process for interrupted stays." },
  { section: "412.620", category: "Payment Classification", title: "Patient classification system." },
  { section: "412.622", category: "Payment", title: "Basis of payment." },
  { section: "412.624", category: "Payment", title: "Methodology for calculating the Federal prospective payment rates." },
  { section: "412.626", category: "Payment", title: "Transition period." },
  { section: "412.628", category: "Payment", title: "Publication of the Federal prospective payment rates." },
  { section: "412.630", category: "Payment", title: "Limitation on review." },
  { section: "412.632", category: "Payment", title: "Method of payment under the inpatient rehabilitation facility prospective payment system." },
  { section: "412.634", category: "Quality Reporting", title: "Requirements under the Inpatient Rehabilitation Facility (IRF) Quality Reporting Program (QRP)." },
] as const;

const IRF_REQUIREMENT_IDS = IRF_REQUIREMENT_SEEDS.map(
  ({ section }) => `irf-cfr-${section.replace(".", "-")}`,
);

const RNHCI_REQUIREMENT_SEEDS = [
  { section: "403.700", category: "Program Foundation", title: "Basis and purpose." },
  { section: "403.702", category: "Program Foundation", title: "Definitions and terms." },
  { section: "403.720", category: "Conditions for Coverage", title: "Conditions for coverage." },
  { section: "403.724", category: "Beneficiary Election", title: "Valid election requirements." },
  { section: "403.730", category: "Patient Rights", title: "Condition of participation: Patient rights." },
  { section: "403.732", category: "Quality", title: "Condition of participation: Quality assessment and performance improvement." },
  { section: "403.734", category: "Food Services", title: "Condition of participation: Food services." },
  { section: "403.736", category: "Discharge Planning", title: "Condition of participation: Discharge planning." },
  { section: "403.738", category: "Administration", title: "Condition of participation: Administration." },
  { section: "403.740", category: "Staffing", title: "Condition of participation: Staffing." },
  { section: "403.742", category: "Environment of Care", title: "Condition of participation: Physical environment." },
  { section: "403.744", category: "Life Safety", title: "Condition of participation: Life safety from fire." },
  { section: "403.745", category: "Building Safety", title: "Condition of participation: Building safety." },
  { section: "403.746", category: "Utilization Review", title: "Condition of participation: Utilization review." },
  { section: "403.748", category: "Emergency Preparedness", title: "Condition of participation: Emergency preparedness." },
] as const;

const RNHCI_REQUIREMENT_IDS = RNHCI_REQUIREMENT_SEEDS.map(
  ({ section }) => `rnhci-cfr-${section.replace(".", "-")}`,
);

// Current eCFR table of contents for 42 CFR part 460. Reserved sections
// (§§ 460.14 and 460.16) are deliberately not represented as requirements.
const PACE_REQUIREMENT_SEEDS = [
  { section: "460.2", subpart: "A", category: "Basis, Scope, and Definitions", title: "Basis." },
  { section: "460.3", subpart: "A", category: "Basis, Scope, and Definitions", title: "Part D program requirements." },
  { section: "460.4", subpart: "A", category: "Basis, Scope, and Definitions", title: "Scope and purpose." },
  { section: "460.6", subpart: "A", category: "Basis, Scope, and Definitions", title: "Definitions." },
  { section: "460.10", subpart: "B", category: "Application and Waivers", title: "Purpose." },
  { section: "460.12", subpart: "B", category: "Application and Waivers", title: "Application requirements." },
  { section: "460.18", subpart: "B", category: "Application and Waivers", title: "CMS evaluation of applications." },
  { section: "460.19", subpart: "B", category: "Application and Waivers", title: "Issuance of compliance actions for failure to comply with the terms of the PACE program agreement." },
  { section: "460.20", subpart: "B", category: "Application and Waivers", title: "Notice of CMS determination." },
  { section: "460.24", subpart: "B", category: "Application and Waivers", title: "Limit on number of PACE program agreements." },
  { section: "460.26", subpart: "B", category: "Application and Waivers", title: "Submission and evaluation of waiver requests." },
  { section: "460.28", subpart: "B", category: "Application and Waivers", title: "Notice of CMS determination on waiver requests." },
  { section: "460.30", subpart: "C", category: "Program Agreement", title: "Program agreement requirement." },
  { section: "460.32", subpart: "C", category: "Program Agreement", title: "Content and terms of PACE program agreement." },
  { section: "460.34", subpart: "C", category: "Program Agreement", title: "Duration of PACE program agreement." },
  { section: "460.40", subpart: "D", category: "Sanctions and Termination", title: "Violations for which CMS may impose sanctions." },
  { section: "460.42", subpart: "D", category: "Sanctions and Termination", title: "Suspension of enrollment or payment by CMS." },
  { section: "460.46", subpart: "D", category: "Sanctions and Termination", title: "Civil money penalties." },
  { section: "460.48", subpart: "D", category: "Sanctions and Termination", title: "Additional actions by CMS or the State." },
  { section: "460.50", subpart: "D", category: "Sanctions and Termination", title: "Termination of PACE program agreement." },
  { section: "460.52", subpart: "D", category: "Sanctions and Termination", title: "Transitional care during termination." },
  { section: "460.54", subpart: "D", category: "Sanctions and Termination", title: "Termination procedures." },
  { section: "460.56", subpart: "D", category: "Sanctions and Termination", title: "Procedures for imposing sanctions and civil money penalties." },
  { section: "460.60", subpart: "E", category: "Administrative Requirements", title: "PACE organizational structure." },
  { section: "460.62", subpart: "E", category: "Administrative Requirements", title: "Governing body." },
  { section: "460.63", subpart: "E", category: "Administrative Requirements", title: "Compliance oversight requirements." },
  { section: "460.64", subpart: "E", category: "Administrative Requirements", title: "Personnel qualifications for staff with direct participant contact." },
  { section: "460.66", subpart: "E", category: "Administrative Requirements", title: "Training." },
  { section: "460.68", subpart: "E", category: "Administrative Requirements", title: "Program integrity." },
  { section: "460.70", subpart: "E", category: "Administrative Requirements", title: "Contracted services." },
  { section: "460.71", subpart: "E", category: "Administrative Requirements", title: "Oversight of direct participant care." },
  { section: "460.72", subpart: "E", category: "Administrative Requirements", title: "Physical environment." },
  { section: "460.74", subpart: "E", category: "Administrative Requirements", title: "Infection control." },
  { section: "460.76", subpart: "E", category: "Administrative Requirements", title: "Transportation services." },
  { section: "460.78", subpart: "E", category: "Administrative Requirements", title: "Dietary services." },
  { section: "460.80", subpart: "E", category: "Administrative Requirements", title: "Fiscal soundness." },
  { section: "460.82", subpart: "E", category: "Administrative Requirements", title: "Marketing." },
  { section: "460.84", subpart: "E", category: "Administrative Requirements", title: "Emergency preparedness." },
  { section: "460.86", subpart: "E", category: "Administrative Requirements", title: "Payment to individuals and entities excluded by the OIG or included on the preclusion list." },
  { section: "460.90", subpart: "F", category: "PACE Services", title: "PACE benefits under Medicare and Medicaid." },
  { section: "460.92", subpart: "F", category: "PACE Services", title: "Required services." },
  { section: "460.94", subpart: "F", category: "PACE Services", title: "Required services for Medicare participants." },
  { section: "460.96", subpart: "F", category: "PACE Services", title: "Excluded services." },
  { section: "460.98", subpart: "F", category: "PACE Services", title: "Service delivery." },
  { section: "460.100", subpart: "F", category: "PACE Services", title: "Emergency care." },
  { section: "460.102", subpart: "F", category: "PACE Services", title: "Interdisciplinary team." },
  { section: "460.104", subpart: "F", category: "PACE Services", title: "Participant assessment." },
  { section: "460.106", subpart: "F", category: "PACE Services", title: "Plan of care." },
  { section: "460.110", subpart: "G", category: "Participant Rights", title: "Bill of rights." },
  { section: "460.112", subpart: "G", category: "Participant Rights", title: "Specific rights to which a participant is entitled." },
  { section: "460.114", subpart: "G", category: "Participant Rights", title: "Restraints." },
  { section: "460.116", subpart: "G", category: "Participant Rights", title: "Explanation of rights." },
  { section: "460.118", subpart: "G", category: "Participant Rights", title: "Violation of rights." },
  { section: "460.119", subpart: "G", category: "Participant Rights", title: "Resolution of complaints in the complaints tracking module." },
  { section: "460.120", subpart: "G", category: "Participant Rights", title: "Grievance process." },
  { section: "460.121", subpart: "G", category: "Participant Rights", title: "Service determination process." },
  { section: "460.122", subpart: "G", category: "Participant Rights", title: "PACE organization's appeals process." },
  { section: "460.124", subpart: "G", category: "Participant Rights", title: "Additional appeal rights under Medicare or Medicaid." },
  { section: "460.130", subpart: "H", category: "Quality Improvement", title: "General rule." },
  { section: "460.132", subpart: "H", category: "Quality Improvement", title: "Quality improvement plan." },
  { section: "460.134", subpart: "H", category: "Quality Improvement", title: "Minimum requirements for quality improvement program." },
  { section: "460.136", subpart: "H", category: "Quality Improvement", title: "Internal quality improvement activities." },
  { section: "460.138", subpart: "H", category: "Quality Improvement", title: "Committees with community input." },
  { section: "460.150", subpart: "I", category: "Enrollment and Disenrollment", title: "Eligibility to enroll in a PACE program." },
  { section: "460.152", subpart: "I", category: "Enrollment and Disenrollment", title: "Enrollment process." },
  { section: "460.154", subpart: "I", category: "Enrollment and Disenrollment", title: "Enrollment agreement." },
  { section: "460.156", subpart: "I", category: "Enrollment and Disenrollment", title: "Other enrollment procedures." },
  { section: "460.158", subpart: "I", category: "Enrollment and Disenrollment", title: "Effective date of enrollment." },
  { section: "460.160", subpart: "I", category: "Enrollment and Disenrollment", title: "Continuation of enrollment." },
  { section: "460.162", subpart: "I", category: "Enrollment and Disenrollment", title: "Voluntary disenrollment." },
  { section: "460.164", subpart: "I", category: "Enrollment and Disenrollment", title: "Involuntary disenrollment." },
  { section: "460.166", subpart: "I", category: "Enrollment and Disenrollment", title: "Disenrollment responsibilities." },
  { section: "460.168", subpart: "I", category: "Enrollment and Disenrollment", title: "Reinstatement in other Medicare and Medicaid programs." },
  { section: "460.170", subpart: "I", category: "Enrollment and Disenrollment", title: "Reinstatement in PACE." },
  { section: "460.172", subpart: "I", category: "Enrollment and Disenrollment", title: "Documentation of disenrollment." },
  { section: "460.180", subpart: "J", category: "Payment", title: "Medicare payment to PACE organizations." },
  { section: "460.182", subpart: "J", category: "Payment", title: "Medicaid payment." },
  { section: "460.184", subpart: "J", category: "Payment", title: "Post-eligibility treatment of income." },
  { section: "460.186", subpart: "J", category: "Payment", title: "PACE premiums." },
  { section: "460.190", subpart: "K", category: "Federal/State Monitoring", title: "Monitoring during trial period." },
  { section: "460.192", subpart: "K", category: "Federal/State Monitoring", title: "Ongoing monitoring after trial period." },
  { section: "460.194", subpart: "K", category: "Federal/State Monitoring", title: "Corrective action." },
  { section: "460.196", subpart: "K", category: "Federal/State Monitoring", title: "Disclosure of review results." },
  { section: "460.198", subpart: "K", category: "Federal/State Monitoring", title: "Disclosure of compliance deficiencies." },
  { section: "460.200", subpart: "L", category: "Data Collection, Record Maintenance, and Reporting", title: "Maintenance of records and reporting of data." },
  { section: "460.202", subpart: "L", category: "Data Collection, Record Maintenance, and Reporting", title: "Participant health outcomes data." },
  { section: "460.204", subpart: "L", category: "Data Collection, Record Maintenance, and Reporting", title: "Financial recordkeeping and reporting requirements." },
  { section: "460.208", subpart: "L", category: "Data Collection, Record Maintenance, and Reporting", title: "Financial statements." },
  { section: "460.210", subpart: "L", category: "Data Collection, Record Maintenance, and Reporting", title: "Medical records." },
] as const;
const PACE_REQUIREMENT_IDS = PACE_REQUIREMENT_SEEDS.map(({ section }) => `pace-cfr-${section.replace(".", "-")}`);

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
  const verified = seed.contentStatus === "verified";
  return {
    ...seed,
    requirementIds: seed.id === "hospital"
      ? [...HOSPITAL_REQUIREMENT_IDS]
      : seed.id === "cah"
        ? [...CAH_REQUIREMENT_IDS]
        : seed.id === "reh"
          ? [...REH_REQUIREMENT_IDS]
          : seed.id === "psych"
            ? [...HOSPITAL_REQUIREMENT_IDS, ...PSYCHIATRIC_HOSPITAL_REQUIREMENT_IDS]
            : seed.id === "ltch"
              ? [...HOSPITAL_REQUIREMENT_IDS, LTCH_REQUIREMENT_ID]
              : seed.id === "irf"
                ? [...HOSPITAL_REQUIREMENT_IDS, ...IRF_REQUIREMENT_IDS]
                : seed.id === "childrens"
                  ? [...HOSPITAL_REQUIREMENT_IDS, CHILDRENS_HOSPITAL_REQUIREMENT_ID]
                  : seed.id === "hospital-swing-bed"
                    ? [...HOSPITAL_REQUIREMENT_IDS, ...SWING_BED_REQUIREMENT_IDS]
                    : seed.id === "transplant-program"
                      ? [
                        ...HOSPITAL_REQUIREMENT_IDS.filter(
                          (id) => id !== "hospital-cfr-482-15" && id !== "hospital-cfr-482-58",
                        ),
                        ...TRANSPLANT_PROGRAM_REQUIREMENT_IDS,
                      ]
                      : seed.id === "snf"
                        ? [...SNF_REQUIREMENT_IDS]
                        : seed.id === "nursing-facility"
                          ? [...SNF_REQUIREMENT_IDS]
                          : seed.id === "icf-iid"
                            ? [...ICF_IID_REQUIREMENT_IDS]
                            : seed.id === "asc"
                              ? [...ASC_REQUIREMENT_IDS]
                              : seed.id === "rhc"
                                ? [...RHC_REQUIREMENT_IDS]
                                : seed.id === "fqhc"
                                  ? [...RHC_REQUIREMENT_IDS, ...FQHC_REQUIREMENT_IDS]
                                  : seed.id === "corf"
                                    ? [...CORF_REQUIREMENT_IDS]
                                    : seed.id === "opt"
                                      ? [...OPT_REQUIREMENT_IDS]
                                      : seed.id === "oslp"
                                        ? [...OPT_REQUIREMENT_IDS]
                                        : seed.id === "cmhc"
                                          ? [...CMHC_REQUIREMENT_IDS]
                                          : seed.id === "otp"
                                            ? [...OTP_REQUIREMENT_IDS]
                                            : seed.id === "hha"
                                              ? [...HHA_REQUIREMENT_IDS]
                                               : seed.id === "hospice" ? [...HOSPICE_REQUIREMENT_IDS]
                                               : seed.id === "esrd" ? [...ESRD_REQUIREMENT_IDS]
                                                : seed.id === "opo" ? [...OPO_REQUIREMENT_IDS]
                                                  : seed.id === "xray" ? [...PORTABLE_XRAY_REQUIREMENT_IDS]
                                                  : seed.id === "histocompatibility-lab" ? [...HISTOCOMPATIBILITY_LAB_REQUIREMENT_IDS]
                                                  : seed.id === "rnhci" ? [...RNHCI_REQUIREMENT_IDS]
                                                   : seed.id === "pace" ? [...PACE_REQUIREMENT_IDS]
              : [],
    policyIds: [],
    surveyReadinessItemIds: [],
    evidenceRequirementIds: [],
    commonDeficiencyAreaIds: [],
    correctiveActionCategoryIds: [],
    contentStatusLabel: pending
      ? "Content Pending Verification"
      : verified
        ? "Verified Regulatory Content"
        : "Legacy Content Available",
    ccnLookupStatus: ["hospital", "snf", "hha", "hospice"].includes(seed.id) ? "configured" : "pending",
  };
}

function pending(
  id: string,
  name: string,
  abbreviation: string | undefined,
  categoryId: ProviderCategoryId,
  topics: string[],
  frameworkLabel = "Regulatory framework pending verification",
): ProviderProfile {
  return profile({
    id, name, abbreviation, categoryId,
    framework: "PendingVerification",
    frameworkLabel,
    displayReference: "Content Pending Verification",
    cfrReferences: [],
    topics,
    contentStatus: "pending-verification",
  });
}

export const PROVIDER_PROFILES: readonly ProviderProfile[] = [
  profile({ id: "hospital", legacyKey: "hospital", name: "Acute Care Hospital", abbreviation: "ACH", categoryId: "hospitals-inpatient", framework: "CoP", frameworkLabel: "Conditions of Participation", displayReference: "42 CFR 482", cfrReferences: ["42 CFR 482"], topics: HOSPITAL_TOPICS, contentStatus: "verified", ecfrSource: { title: 42, part: 482, label: "42 CFR 482 – Conditions of Participation: Hospitals" } }),
  profile({ id: "cah", legacyKey: "cah", name: "Critical Access Hospital", abbreviation: "CAH", categoryId: "hospitals-inpatient", framework: "CoP", frameworkLabel: "Conditions of Participation", displayReference: "42 CFR 485 Subpart F", cfrReferences: ["42 CFR 485 Subpart F"], topics: HOSPITAL_TOPICS, contentStatus: "verified", ecfrSource: { title: 42, part: 485, label: "42 CFR 485 Subpart F – Conditions of Participation: Critical Access Hospitals" } }),
  profile({ id: "reh", name: "Rural Emergency Hospital", abbreviation: "REH", categoryId: "hospitals-inpatient", framework: "CoP", frameworkLabel: "Conditions of Participation", displayReference: "42 CFR 485 Subpart E", cfrReferences: ["42 CFR 485 Subpart E"], topics: HOSPITAL_TOPICS, contentStatus: "verified", ecfrSource: { title: 42, part: 485, label: "42 CFR 485 Subpart E – Conditions of Participation: Rural Emergency Hospitals" } }),
  profile({ id: "psych", legacyKey: "psych", name: "Psychiatric Hospital", abbreviation: "PH", categoryId: "hospitals-inpatient", framework: "CoP", frameworkLabel: "Conditions of Participation", displayReference: "42 CFR 482 and 42 CFR 482 Subpart E", cfrReferences: ["42 CFR 482", "42 CFR 482.60–482.62"], topics: BEHAVIORAL_TOPICS, contentStatus: "verified", ecfrSource: { title: 42, part: 482, label: "42 CFR 482 – Hospital CoPs and Psychiatric Hospital Special Requirements" } }),
  profile({ id: "ltch", legacyKey: "ltch", name: "Long-Term Care Hospital", abbreviation: "LTCH", categoryId: "hospitals-inpatient", framework: "CoP", frameworkLabel: "Hospital Conditions of Participation and LTCH classification requirements", displayReference: "42 CFR 482; 42 CFR 412.23(e)", cfrReferences: ["42 CFR 482", "42 CFR 412.23(e)"], topics: HOSPITAL_TOPICS, contentStatus: "verified", ecfrSource: { title: 42, part: 482, label: "42 CFR 482 – Conditions of Participation for Hospitals" } }),
  profile({ id: "irf", legacyKey: "irf", name: "Inpatient Rehabilitation Facility", abbreviation: "IRF", categoryId: "hospitals-inpatient", framework: "CoverageAndPayment", frameworkLabel: "Hospital Conditions of Participation and IRF prospective payment requirements", displayReference: "42 CFR 482; 42 CFR 412 Subpart P", cfrReferences: ["42 CFR 482", "42 CFR 412 Subpart P"], topics: HOSPITAL_TOPICS, contentStatus: "verified", ecfrSource: { title: 42, part: 412, label: "42 CFR 412 Subpart P – Prospective Payment for Inpatient Rehabilitation Hospitals and Rehabilitation Units" } }),
  profile({ id: "childrens", legacyKey: "childrens", name: "Children's Hospital", abbreviation: "CH", categoryId: "hospitals-inpatient", framework: "CoP", frameworkLabel: "Hospital Conditions of Participation and children's hospital classification requirements", displayReference: "42 CFR 482; 42 CFR 412.23(d)", cfrReferences: ["42 CFR 482", "42 CFR 412.23(d)"], topics: HOSPITAL_TOPICS, contentStatus: "verified", ecfrSource: { title: 42, part: 482, label: "42 CFR 482 – Conditions of Participation for Hospitals" } }),
  profile({ id: "hospital-swing-bed", name: "Hospital Swing Bed", categoryId: "hospitals-inpatient", framework: "CoP", frameworkLabel: "Hospital Conditions of Participation and swing-bed requirements", displayReference: "42 CFR 482; 42 CFR 482.58; 42 CFR 483.5, 483.10, 483.12, 483.15, 483.20, 483.40, 483.55, and 483.65", cfrReferences: ["42 CFR 482", "42 CFR 482.58", "42 CFR 483.5", "42 CFR 483.10", "42 CFR 483.12", "42 CFR 483.15", "42 CFR 483.20", "42 CFR 483.40", "42 CFR 483.55", "42 CFR 483.65"], topics: [...HOSPITAL_TOPICS, ...LONG_TERM_CARE_TOPICS], contentStatus: "verified", ecfrSource: { title: 42, part: 482, label: "42 CFR 482.58 – Special requirements for hospital providers of long-term care services (swing-beds)" } }),
  profile({ id: "transplant-program", name: "Transplant Program / Transplant Center", categoryId: "hospitals-inpatient", framework: "CoP", frameworkLabel: "Hospital Conditions of Participation and transplant-program requirements", displayReference: "42 CFR 482.1–482.57 (except § 482.15); 42 CFR 482.68–482.104", cfrReferences: ["42 CFR 482.1–482.57 (except § 482.15)", "42 CFR 482.68–482.104"], topics: HOSPITAL_TOPICS, contentStatus: "verified", ecfrSource: { title: 42, part: 482, label: "42 CFR 482 Subpart E – Transplant Program Requirements" } }),

  profile({ id: "snf", legacyKey: "snf", name: "Skilled Nursing Facility", abbreviation: "SNF", categoryId: "long-term-care", framework: "CoP", frameworkLabel: "Requirements for Long Term Care Facilities", displayReference: "42 CFR 483 Subpart B", cfrReferences: ["42 CFR 483 Subpart B"], topics: LONG_TERM_CARE_TOPICS, contentStatus: "verified", ecfrSource: { title: 42, part: 483, label: "42 CFR 483 Subpart B – Requirements for Long Term Care Facilities" } }),
  profile({ id: "nursing-facility", name: "Nursing Facility", abbreviation: "NF", categoryId: "long-term-care", framework: "CoP", frameworkLabel: "Requirements for Long Term Care Facilities", displayReference: "42 CFR 483 Subpart B", cfrReferences: ["42 CFR 483 Subpart B"], topics: LONG_TERM_CARE_TOPICS, contentStatus: "verified", ecfrSource: { title: 42, part: 483, label: "42 CFR 483 Subpart B – Requirements for Long Term Care Facilities" } }),
  profile({ id: "icf-iid", name: "Intermediate Care Facility for Individuals with Intellectual Disabilities", abbreviation: "ICF/IID", categoryId: "long-term-care", framework: "CoP", frameworkLabel: "Conditions of Participation", displayReference: "42 CFR 483 Subpart I", cfrReferences: ["42 CFR 483 Subpart I"], topics: LONG_TERM_CARE_TOPICS, contentStatus: "verified", ecfrSource: { title: 42, part: 483, label: "42 CFR 483 Subpart I – Conditions of Participation for ICFs/IID" } }),

  profile({ id: "asc", legacyKey: "asc", name: "Ambulatory Surgical Center", abbreviation: "ASC", categoryId: "outpatient-community", framework: "CfC", frameworkLabel: "Conditions for Coverage", displayReference: "42 CFR 416 Subpart C", cfrReferences: ["42 CFR 416 Subpart C"], topics: [...OUTPATIENT_TOPICS, "Surgical Services", "Anesthesia Services"], contentStatus: "verified", ecfrSource: { title: 42, part: 416, label: "42 CFR 416 Subpart C – Specific Conditions for Coverage" } }),
  profile({ id: "rhc", legacyKey: "rhc", name: "Rural Health Clinic", abbreviation: "RHC", categoryId: "outpatient-community", framework: "CfC", frameworkLabel: "Conditions for Certification", displayReference: "42 CFR 491 Subpart A", cfrReferences: ["42 CFR 491 Subpart A"], topics: OUTPATIENT_TOPICS, contentStatus: "verified", ecfrSource: { title: 42, part: 491, label: "42 CFR 491 Subpart A – Rural Health Clinics Conditions for Certification" } }),
  profile({ id: "fqhc", legacyKey: "fqhc", name: "Federally Qualified Health Center", abbreviation: "FQHC", categoryId: "outpatient-community", framework: "CoverageAndPayment", frameworkLabel: "Conditions for Coverage and payment requirements", displayReference: "42 CFR 491 Subpart A; 42 CFR 405 Subpart X", cfrReferences: ["42 CFR 491 Subpart A", "42 CFR 405 Subpart X"], topics: OUTPATIENT_TOPICS, contentStatus: "verified", ecfrSource: { title: 42, part: 405, label: "42 CFR 405 Subpart X – Rural Health Clinic and Federally Qualified Health Center Services" } }),
  profile({ id: "corf", legacyKey: "corf", name: "Comprehensive Outpatient Rehabilitation Facility", abbreviation: "CORF", categoryId: "outpatient-community", framework: "CfC", frameworkLabel: "Conditions of Participation", displayReference: "42 CFR 485 Subpart B", cfrReferences: ["42 CFR 485 Subpart B"], topics: OUTPATIENT_TOPICS, contentStatus: "verified", ecfrSource: { title: 42, part: 485, label: "42 CFR 485 Subpart B – Conditions of Participation for CORFs" } }),
  profile({ id: "opt", name: "Outpatient Physical Therapy", abbreviation: "OPT", categoryId: "outpatient-community", framework: "CoP", frameworkLabel: "Conditions of Participation", displayReference: "42 CFR 485 Subpart H", cfrReferences: ["42 CFR 485 Subpart H"], topics: OUTPATIENT_TOPICS, contentStatus: "verified", ecfrSource: { title: 42, part: 485, label: "42 CFR 485 Subpart H – Outpatient Physical Therapy and Speech-Language Pathology Services" } }),
  pending("oot", "Outpatient Occupational Therapy", "OOT", "outpatient-community", OUTPATIENT_TOPICS),
  profile({ id: "oslp", name: "Outpatient Speech-Language Pathology", abbreviation: "OSLP", categoryId: "outpatient-community", framework: "CoP", frameworkLabel: "Conditions of Participation", displayReference: "42 CFR 485 Subpart H", cfrReferences: ["42 CFR 485 Subpart H"], topics: OUTPATIENT_TOPICS, contentStatus: "verified", ecfrSource: { title: 42, part: 485, label: "42 CFR 485 Subpart H – Outpatient Physical Therapy and Speech-Language Pathology Services" } }),

  profile({ id: "cmhc", legacyKey: "cmhc", name: "Community Mental Health Center", abbreviation: "CMHC", categoryId: "behavioral-health", framework: "CoP", frameworkLabel: "Conditions of Participation", displayReference: "42 CFR 485 Subpart J", cfrReferences: ["42 CFR 485 Subpart J"], topics: BEHAVIORAL_TOPICS, contentStatus: "verified", ecfrSource: { title: 42, part: 485, label: "42 CFR 485 Subpart J – Conditions of Participation: Community Mental Health Centers" } }),
  profile({ id: "otp", name: "Opioid Treatment Program", abbreviation: "OTP", categoryId: "behavioral-health", framework: "ProgramRequirements", frameworkLabel: "Federal opioid treatment program certification requirements", displayReference: "42 CFR 8 Subpart C", cfrReferences: ["42 CFR 8 Subpart C"], topics: BEHAVIORAL_TOPICS, contentStatus: "verified", ecfrSource: { title: 42, part: 8, label: "42 CFR 8 Subpart C – Certification and Treatment Standards for Opioid Treatment Programs" } }),

  profile({ id: "hha", legacyKey: "hha", name: "Home Health Agency", abbreviation: "HHA", categoryId: "home-end-of-life", framework: "CoP", frameworkLabel: "Conditions of Participation", displayReference: "42 CFR 484 Subparts B and C", cfrReferences: ["42 CFR 484 Subpart B", "42 CFR 484 Subpart C"], topics: HOME_HEALTH_TOPICS, contentStatus: "verified", ecfrSource: { title: 42, part: 484, label: "42 CFR 484 – Conditions of Participation: Home Health Agencies" } }),
  profile({ id: "hospice", legacyKey: "hospice", name: "Hospice", categoryId: "home-end-of-life", framework: "CoP", frameworkLabel: "Conditions of Participation", displayReference: "42 CFR 418 Subparts C and D", cfrReferences: ["42 CFR 418 Subpart C","42 CFR 418 Subpart D"], topics: HOSPICE_TOPICS, contentStatus: "verified", ecfrSource: { title: 42, part: 418, label: "42 CFR 418 – Hospice Conditions of Participation" } }),

  profile({ id: "esrd", legacyKey: "esrd", name: "ESRD Facility", abbreviation: "ESRD", categoryId: "renal-specialty", framework: "CfC", frameworkLabel: "Conditions for Coverage", displayReference: "42 CFR Part 494", cfrReferences: ["42 CFR Part 494"], topics: SPECIALTY_TOPICS, contentStatus: "verified", ecfrSource: { title: 42, part: 494, label: "42 CFR Part 494 – Conditions for Coverage for End-Stage Renal Disease Facilities" } }),
  profile({ id: "opo", legacyKey: "opo", name: "Organ Procurement Organization", abbreviation: "OPO", categoryId: "renal-specialty", framework: "CfC", frameworkLabel: "Conditions for Coverage", displayReference: "42 CFR 486 Subpart G", cfrReferences: ["42 CFR 486 Subpart G"], topics: SPECIALTY_TOPICS, contentStatus: "verified", ecfrSource: { title: 42, part: 486, label: "42 CFR 486 Subpart G – Requirements for Certification and Designation and Conditions for Coverage: Organ Procurement Organizations" } }),
  profile({ id: "histocompatibility-lab", name: "Histocompatibility Laboratory", categoryId: "renal-specialty", framework: "ProgramRequirements", frameworkLabel: "CLIA laboratory requirements", displayReference: "42 CFR §§ 493.1227 and 493.1278", cfrReferences: ["42 CFR § 493.1227", "42 CFR § 493.1278"], topics: ["Laboratory Services", "Quality Management", "Staff Competency & Training"], contentStatus: "verified", ecfrSource: { title: 42, part: 493, label: "42 CFR Part 493 – Laboratory Requirements" } }),
  profile({ id: "xray", legacyKey: "xray", name: "Portable X-Ray Supplier", categoryId: "renal-specialty", framework: "CfC", frameworkLabel: "Conditions for Coverage", displayReference: "42 CFR 486 Subpart C", cfrReferences: ["42 CFR 486 Subpart C"], topics: SPECIALTY_TOPICS, contentStatus: "verified", ecfrSource: { title: 42, part: 486, label: "42 CFR 486 Subpart C – Conditions for Coverage: Portable X-Ray Services" } }),

  profile({ id: "rnhci", name: "Religious Nonmedical Health Care Institution", abbreviation: "RNHCI", categoryId: "other-cms-providers", framework: "CoverageAndPayment", frameworkLabel: "Conditions for Coverage and Conditions of Participation", displayReference: "42 CFR 403 Subpart G (§§ 403.700, 403.702, 403.720, 403.724, and 403.730–403.748)", cfrReferences: ["42 CFR 403 Subpart G", "42 CFR § 403.700", "42 CFR § 403.702", "42 CFR § 403.720", "42 CFR § 403.724", "42 CFR §§ 403.730–403.748"], topics: ["Patient Rights & Grievances", "Quality Assessment & Performance Improvement", "Food Services", "Discharge Planning", "Governing Body Oversight", "Staff Competency & Training", "Physical Environment & Safety", "Life Safety", "Utilization Review", "Emergency Preparedness"], contentStatus: "verified", ecfrSource: { title: 42, part: 403, label: "42 CFR 403 Subpart G – Religious Nonmedical Health Care Institutions—Benefits, Conditions of Participation, and Payment" } }),
  pending(
    "ihs-facility",
    "Indian Health Service Facility",
    "IHS",
    "other-cms-providers",
    SPECIALTY_TOPICS,
    "Pending: no distinct CMS-certified IHS facility category or complete section-level CMS framework verified; classify by the facility's underlying certified provider type.",
  ),
  profile({ id: "pace", name: "PACE Organization", abbreviation: "PACE", categoryId: "other-cms-providers", framework: "ProgramRequirements", frameworkLabel: "Programs of All-Inclusive Care for the Elderly (PACE) requirements", displayReference: "42 CFR Part 460", cfrReferences: ["42 CFR Part 460"], topics: ["Governing Body Oversight", "Compliance Oversight", "Staff Competency & Training", "Contracted Services", "Physical Environment & Safety", "Infection Control & Prevention", "Emergency Preparedness", "Interdisciplinary Care", "Participant Rights & Grievances", "Quality Improvement", "Enrollment & Disenrollment", "Medical Records"], contentStatus: "verified", ecfrSource: { title: 42, part: 460, label: "42 CFR Part 460 – Programs of All-Inclusive Care for the Elderly (PACE)" } }),
] as const;

export const CMS_REQUIREMENTS: readonly CmsRequirement[] = [
  ...HOSPITAL_REQUIREMENT_SEEDS.map(({ section, category, title }): CmsRequirement => ({
    id: `hospital-cfr-${section.replace(".", "-")}`,
    providerTypeId: "hospital",
    framework: "CoP" as const,
    conditionCategory: category,
    cfrReference: `42 CFR § ${section}`,
    requirement: title,
    responsibleDepartments: [],
    relatedPolicyIds: [],
    evidenceRequirementIds: [],
    staffInterviewConsiderations: [],
    gapAssessmentQuestionIds: [],
    correctiveActionRecommendationIds: [],
    sourceIds: [`ecfr-42-cfr-${section}`, "cms-som-appendix-a-hospitals"],
    verificationStatus: "verified" as const,
    lastVerifiedAt: "2026-09-06",
    nextReviewAt: "2026-12-06",
  })),
  ...CAH_REQUIREMENT_SEEDS.map(({ section, category, title }): CmsRequirement => ({
    id: `cah-cfr-${section.replace(".", "-")}`,
    providerTypeId: "cah",
    framework: "CoP" as const,
    conditionCategory: category,
    cfrReference: `42 CFR § ${section}`,
    requirement: title,
    responsibleDepartments: [],
    relatedPolicyIds: [],
    evidenceRequirementIds: [],
    staffInterviewConsiderations: [],
    gapAssessmentQuestionIds: [],
    correctiveActionRecommendationIds: [],
    sourceIds: [`ecfr-42-cfr-${section}`, "cms-som-appendix-w-cah"],
    verificationStatus: "verified" as const,
    lastVerifiedAt: "2026-09-06",
    nextReviewAt: "2026-12-06",
  })),
  ...REH_REQUIREMENT_SEEDS.map(({ section, category, title }): CmsRequirement => ({
    id: `reh-cfr-${section.replace(".", "-")}`,
    providerTypeId: "reh",
    framework: "CoP",
    conditionCategory: category,
    cfrReference: `42 CFR § ${section}`,
    requirement: title,
    responsibleDepartments: [],
    relatedPolicyIds: [],
    evidenceRequirementIds: [],
    staffInterviewConsiderations: [],
    gapAssessmentQuestionIds: [],
    correctiveActionRecommendationIds: [],
    sourceIds: [`ecfr-42-cfr-${section}`, "cms-qso-24-20-reh"],
    verificationStatus: "verified",
    lastVerifiedAt: "2026-09-06",
    nextReviewAt: "2026-12-06",
  })),
  ...PSYCHIATRIC_HOSPITAL_REQUIREMENT_SEEDS.map(({ section, category, title }): CmsRequirement => ({
    id: `psych-cfr-${section.replace(".", "-")}`,
    providerTypeId: "psych",
    framework: "CoP",
    conditionCategory: category,
    cfrReference: `42 CFR § ${section}`,
    requirement: title,
    responsibleDepartments: [],
    relatedPolicyIds: [],
    evidenceRequirementIds: [],
    staffInterviewConsiderations: [],
    gapAssessmentQuestionIds: [],
    correctiveActionRecommendationIds: [],
    sourceIds: [`ecfr-42-cfr-${section}`, "cms-som-appendix-a-hospitals"],
    verificationStatus: "verified",
    lastVerifiedAt: "2026-09-06",
    nextReviewAt: "2026-12-06",
  })),
  {
    id: LTCH_REQUIREMENT_ID,
    providerTypeId: "ltch",
    framework: "CoverageAndPayment",
    conditionCategory: "Provider Classification",
    cfrReference: "42 CFR § 412.23(e)",
    requirement: "Long-term care hospitals.",
    responsibleDepartments: [],
    relatedPolicyIds: [],
    evidenceRequirementIds: [],
    staffInterviewConsiderations: [],
    gapAssessmentQuestionIds: [],
    correctiveActionRecommendationIds: [],
    sourceIds: ["ecfr-42-cfr-412-23-e", "cms-ltch-pps"],
    verificationStatus: "verified",
    lastVerifiedAt: "2026-09-06",
    nextReviewAt: "2026-12-06",
  },
  {
    id: CHILDRENS_HOSPITAL_REQUIREMENT_ID,
    providerTypeId: "childrens",
    framework: "CoP",
    conditionCategory: "Provider Classification",
    cfrReference: "42 CFR § 412.23(d)",
    requirement: "Children's hospitals.",
    responsibleDepartments: [],
    relatedPolicyIds: [],
    evidenceRequirementIds: [],
    staffInterviewConsiderations: [],
    gapAssessmentQuestionIds: [],
    correctiveActionRecommendationIds: [],
    sourceIds: ["ecfr-42-cfr-412-23-d", "cms-som-appendix-a-hospitals"],
    verificationStatus: "verified",
    lastVerifiedAt: "2026-09-06",
    nextReviewAt: "2026-12-06",
  },
  ...SWING_BED_REQUIREMENT_SEEDS.map(({ section, reference, category, title }): CmsRequirement => ({
    id: `hospital-swing-bed-cfr-${section.replace(".", "-")}`,
    providerTypeId: "hospital-swing-bed",
    framework: "CoP",
    conditionCategory: category,
    cfrReference: reference,
    requirement: title,
    responsibleDepartments: [],
    relatedPolicyIds: [],
    evidenceRequirementIds: [],
    staffInterviewConsiderations: [],
    gapAssessmentQuestionIds: [],
    correctiveActionRecommendationIds: [],
    sourceIds: [`ecfr-42-cfr-${section}`, "cms-som-appendix-pp-ltcf", "cms-qso-18-26-swing-bed"],
    verificationStatus: "verified",
    lastVerifiedAt: "2026-09-06",
    nextReviewAt: "2026-12-06",
  })),
  ...TRANSPLANT_PROGRAM_REQUIREMENT_SEEDS.map(({ section, category, title }): CmsRequirement => ({
    id: `transplant-program-cfr-${section.replace(".", "-")}`,
    providerTypeId: "transplant-program",
    framework: "CoP",
    conditionCategory: category,
    cfrReference: `42 CFR § ${section}`,
    requirement: title,
    responsibleDepartments: [],
    relatedPolicyIds: [],
    evidenceRequirementIds: [],
    staffInterviewConsiderations: [],
    gapAssessmentQuestionIds: [],
    correctiveActionRecommendationIds: [],
    sourceIds: [`ecfr-42-cfr-${section}`, "cms-organ-transplant-program", "cms-som-appendix-x-transplant", "cms-qso-19-11-transplant"],
    verificationStatus: "verified",
    lastVerifiedAt: "2026-09-06",
    nextReviewAt: "2026-12-06",
  })),
  ...SNF_REQUIREMENT_SEEDS.map(({ section, category, title }): CmsRequirement => ({
    id: `snf-cfr-${section.replace(".", "-")}`,
    providerTypeId: "snf",
    framework: "CoP",
    conditionCategory: category,
    cfrReference: `42 CFR § ${section}`,
    requirement: title,
    responsibleDepartments: [],
    relatedPolicyIds: [],
    evidenceRequirementIds: [],
    staffInterviewConsiderations: [],
    gapAssessmentQuestionIds: [],
    correctiveActionRecommendationIds: [],
    sourceIds: [`ecfr-42-cfr-${section}`, "cms-nursing-homes-certification", "cms-som-appendix-pp-ltcf"],
    verificationStatus: "verified",
    lastVerifiedAt: "2026-09-06",
    nextReviewAt: "2026-12-06",
  })),
  ...ICF_IID_REQUIREMENT_SEEDS.map(({ section, category, title }): CmsRequirement => ({
    id: `icf-iid-cfr-${section.replace(".", "-")}`,
    providerTypeId: "icf-iid",
    framework: "CoP",
    conditionCategory: category,
    cfrReference: `42 CFR § ${section}`,
    requirement: title,
    responsibleDepartments: [],
    relatedPolicyIds: [],
    evidenceRequirementIds: [],
    staffInterviewConsiderations: [],
    gapAssessmentQuestionIds: [],
    correctiveActionRecommendationIds: [],
    sourceIds: [`ecfr-42-cfr-${section}`, "cms-icf-iid-conditions", "cms-icf-iid-surveyor-guidelines"],
    verificationStatus: "verified",
    lastVerifiedAt: "2026-09-06",
    nextReviewAt: "2026-12-06",
  })),
  ...ASC_REQUIREMENT_SEEDS.map(({ section, category, title }): CmsRequirement => ({
    id: `asc-cfr-${section.replace(".", "-")}`,
    providerTypeId: "asc",
    framework: "CfC",
    conditionCategory: category,
    cfrReference: `42 CFR § ${section}`,
    requirement: title,
    responsibleDepartments: [],
    relatedPolicyIds: [],
    evidenceRequirementIds: [],
    staffInterviewConsiderations: [],
    gapAssessmentQuestionIds: [],
    correctiveActionRecommendationIds: [],
    sourceIds: [`ecfr-42-cfr-${section}`, "cms-asc-certification", "cms-som-appendix-l-asc"],
    verificationStatus: "verified",
    lastVerifiedAt: "2026-09-06",
    nextReviewAt: "2026-12-06",
  })),
  ...RHC_REQUIREMENT_SEEDS.map(({ section, category, title }): CmsRequirement => ({
    id: `rhc-cfr-${section.replace(".", "-")}`,
    providerTypeId: "rhc",
    framework: "CfC",
    conditionCategory: category,
    cfrReference: `42 CFR § ${section}`,
    requirement: title,
    responsibleDepartments: [],
    relatedPolicyIds: [],
    evidenceRequirementIds: [],
    staffInterviewConsiderations: [],
    gapAssessmentQuestionIds: [],
    correctiveActionRecommendationIds: [],
    sourceIds: [`ecfr-42-cfr-${section}`, "cms-rhc-certification", "cms-som-appendix-g-rhc", "cms-qso-25-27-rhc"],
    verificationStatus: "verified",
    lastVerifiedAt: "2026-09-06",
    nextReviewAt: "2026-12-06",
  })),
  ...FQHC_REQUIREMENT_SEEDS.map(({ section, title }): CmsRequirement => ({
    id: `fqhc-cfr-${section.replace(".", "-")}`, providerTypeId: "fqhc", framework: "CoverageAndPayment",
    conditionCategory: "Coverage and Payment", cfrReference: `42 CFR § ${section}`, requirement: title,
    responsibleDepartments: [], relatedPolicyIds: [], evidenceRequirementIds: [], staffInterviewConsiderations: [],
    gapAssessmentQuestionIds: [], correctiveActionRecommendationIds: [],
    sourceIds: [`ecfr-42-cfr-${section}`, "cms-rhc-fqhc-conditions", "cms-fqhc-information-center", "cms-som-appendix-g-rhc"],
    verificationStatus: "verified", lastVerifiedAt: "2026-09-06", nextReviewAt: "2026-12-06",
  })),
  ...CORF_REQUIREMENT_SEEDS.map(({ section, title }): CmsRequirement => ({
    id: `corf-cfr-${section.replace(".", "-")}`, providerTypeId: "corf", framework: "CfC", conditionCategory: "Conditions of Participation",
    cfrReference: `42 CFR § ${section}`, requirement: title, responsibleDepartments: [], relatedPolicyIds: [], evidenceRequirementIds: [],
    staffInterviewConsiderations: [], gapAssessmentQuestionIds: [], correctiveActionRecommendationIds: [],
    sourceIds: [`ecfr-42-cfr-${section}`, "cms-som-appendix-k-corf"], verificationStatus: "verified", lastVerifiedAt: "2026-09-06", nextReviewAt: "2026-12-06",
  })),
  ...OPT_REQUIREMENT_SEEDS.map(({ section, title }): CmsRequirement => ({
    id: `opt-cfr-${section.replace(".", "-")}`, providerTypeId: "opt", framework: "CoP", conditionCategory: "Conditions of Participation",
    cfrReference: `42 CFR § ${section}`, requirement: title, responsibleDepartments: [], relatedPolicyIds: [], evidenceRequirementIds: [],
    staffInterviewConsiderations: [], gapAssessmentQuestionIds: [], correctiveActionRecommendationIds: [],
    sourceIds: [`ecfr-42-cfr-${section}`, "cms-opt-certification", "cms-som-appendix-e-opt", "cms-qso-24-18-opt"],
    verificationStatus: "verified", lastVerifiedAt: "2026-09-06", nextReviewAt: "2026-12-06",
  })),
  ...CMHC_REQUIREMENT_SEEDS.map(({ section, title }): CmsRequirement => ({
    id: `cmhc-cfr-${section.replace(".", "-")}`, providerTypeId: "cmhc", framework: "CoP", conditionCategory: "Conditions of Participation",
    cfrReference: `42 CFR § ${section}`, requirement: title, responsibleDepartments: [], relatedPolicyIds: [], evidenceRequirementIds: [],
    staffInterviewConsiderations: [], gapAssessmentQuestionIds: [], correctiveActionRecommendationIds: [],
    sourceIds: [`ecfr-42-cfr-${section}`, "cms-cmhc-certification", "cms-qso-22-07-cmhc"], verificationStatus: "verified", lastVerifiedAt: "2026-09-06", nextReviewAt: "2026-12-06",
  })),
  ...OTP_REQUIREMENT_SEEDS.map(({ section, title }): CmsRequirement => ({
    id: `otp-cfr-${section.replace(".", "-")}`, providerTypeId: "otp", framework: "ProgramRequirements", conditionCategory: "OTP Certification",
    cfrReference: `42 CFR § ${section}`, requirement: title, responsibleDepartments: [], relatedPolicyIds: [], evidenceRequirementIds: [],
    staffInterviewConsiderations: [], gapAssessmentQuestionIds: [], correctiveActionRecommendationIds: [],
    sourceIds: [`ecfr-42-cfr-${section}`, "cms-otp-enrollment", "cms-otp-benefit-policy-manual"],
    verificationStatus: "verified", lastVerifiedAt: "2026-09-06", nextReviewAt: "2026-12-06",
  })),
  ...HHA_REQUIREMENT_SEEDS.map(({ section, title }): CmsRequirement => ({
    id: `hha-cfr-${section.replace(".", "-")}`, providerTypeId: "hha", framework: "CoP", conditionCategory: "Conditions of Participation", cfrReference: `42 CFR § ${section}`, requirement: title, responsibleDepartments: [], relatedPolicyIds: [], evidenceRequirementIds: [], staffInterviewConsiderations: [], gapAssessmentQuestionIds: [], correctiveActionRecommendationIds: [], sourceIds: [`ecfr-42-cfr-${section}`, "cms-hha-certification", "cms-som-appendix-b-hha"], verificationStatus: "verified", lastVerifiedAt: "2026-09-06", nextReviewAt: "2026-12-06",
  })),
  ...HOSPICE_REQUIREMENT_SEEDS.map(([section,,title]): CmsRequirement => ({id:`hospice-cfr-${section.replace(".","-")}`,providerTypeId:"hospice",framework:"CoP",conditionCategory:"Conditions of Participation",cfrReference:`42 CFR § ${section}`,requirement:title,responsibleDepartments:[],relatedPolicyIds:[],evidenceRequirementIds:[],staffInterviewConsiderations:[],gapAssessmentQuestionIds:[],correctiveActionRecommendationIds:[],sourceIds:[`ecfr-42-cfr-${section}`,"cms-hospice-certification","cms-som-appendix-m-hospice"],verificationStatus:"verified",lastVerifiedAt:"2026-09-06",nextReviewAt:"2026-12-06"})),
  ...ESRD_REQUIREMENT_SEEDS.map(({ section, category, title }): CmsRequirement => ({
    id: `esrd-cfr-${section.replace(".", "-")}`, providerTypeId: "esrd", framework: "CfC", conditionCategory: category,
    cfrReference: `42 CFR § ${section}`, requirement: title, responsibleDepartments: [], relatedPolicyIds: [], evidenceRequirementIds: [],
    staffInterviewConsiderations: [], gapAssessmentQuestionIds: [], correctiveActionRecommendationIds: [],
    sourceIds: [`ecfr-42-cfr-${section}`, "cms-esrd-certification-compliance", "cms-esrd-conditions-for-coverage", "cms-som-appendix-h-esrd"],
    verificationStatus: "verified", lastVerifiedAt: "2026-09-06", nextReviewAt: "2026-12-06",
  })),
  ...PORTABLE_XRAY_REQUIREMENT_SEEDS.map(({ section, category, title }): CmsRequirement => ({
    id: `portable-xray-cfr-${section.replace(".", "-")}`,
    providerTypeId: "xray",
    framework: "CfC",
    conditionCategory: category,
    cfrReference: `42 CFR § ${section}`,
    requirement: title,
    responsibleDepartments: [],
    relatedPolicyIds: [],
    evidenceRequirementIds: [],
    staffInterviewConsiderations: [],
    gapAssessmentQuestionIds: [],
    correctiveActionRecommendationIds: [],
    sourceIds: [`ecfr-42-cfr-${section}`, "cms-portable-xray-survey-report", "cms-som-appendix-d-portable-xray"],
    verificationStatus: "verified",
    lastVerifiedAt: "2026-09-06",
    nextReviewAt: "2026-12-06",
  })),
  ...OPO_REQUIREMENT_SEEDS.map(({ section, category, title }): CmsRequirement => ({
    id: `opo-cfr-${section.replace(".", "-")}`, providerTypeId: "opo", framework: "CfC", conditionCategory: category,
    cfrReference: `42 CFR § ${section}`, requirement: title, responsibleDepartments: [], relatedPolicyIds: [], evidenceRequirementIds: [],
    staffInterviewConsiderations: [], gapAssessmentQuestionIds: [], correctiveActionRecommendationIds: [],
    sourceIds: [`ecfr-42-cfr-${section}`, "cms-opo-certification", "cms-som-appendix-y-opo", "cms-qso-26-06-opo"],
    verificationStatus: "verified", lastVerifiedAt: "2026-09-06", nextReviewAt: "2026-12-06",
  })),
  ...HISTOCOMPATIBILITY_LAB_REQUIREMENT_SEEDS.map(({ section, category, title }): CmsRequirement => ({
    id: `histocompatibility-lab-cfr-${section.replace(".", "-")}`,
    providerTypeId: "histocompatibility-lab",
    framework: "ProgramRequirements",
    conditionCategory: category,
    cfrReference: `42 CFR § ${section}`,
    requirement: title,
    responsibleDepartments: [],
    relatedPolicyIds: [],
    evidenceRequirementIds: [],
    staffInterviewConsiderations: [],
    gapAssessmentQuestionIds: [],
    correctiveActionRecommendationIds: [],
    sourceIds: [`ecfr-42-cfr-${section}`, "cms-clia-regulations-compliance"],
    verificationStatus: "verified",
    lastVerifiedAt: "2026-09-06",
    nextReviewAt: "2026-12-06",
  })),
  ...IRF_REQUIREMENT_SEEDS.map(({ section, category, title }): CmsRequirement => ({
    id: `irf-cfr-${section.replace(".", "-")}`,
    providerTypeId: "irf",
    framework: "CoverageAndPayment",
    conditionCategory: category,
    cfrReference: `42 CFR § ${section}`,
    requirement: title,
    responsibleDepartments: [],
    relatedPolicyIds: [],
    evidenceRequirementIds: [],
    staffInterviewConsiderations: [],
    gapAssessmentQuestionIds: [],
    correctiveActionRecommendationIds: [],
    sourceIds: [`ecfr-42-cfr-${section}`, "cms-irf-certification"],
    verificationStatus: "verified",
    lastVerifiedAt: "2026-09-06",
    nextReviewAt: "2026-12-06",
  })),
  ...RNHCI_REQUIREMENT_SEEDS.map(({ section, category, title }): CmsRequirement => ({
    id: `rnhci-cfr-${section.replace(".", "-")}`,
    providerTypeId: "rnhci",
    framework: "CoverageAndPayment",
    conditionCategory: category,
    cfrReference: `42 CFR § ${section}`,
    requirement: title,
    responsibleDepartments: [],
    relatedPolicyIds: [],
    evidenceRequirementIds: [],
    staffInterviewConsiderations: [],
    gapAssessmentQuestionIds: [],
    correctiveActionRecommendationIds: [],
    sourceIds: [`ecfr-42-cfr-${section}`, "cms-rnhci-certification-compliance", "cms-som-appendix-u-rnhci"],
    verificationStatus: "verified",
    lastVerifiedAt: "2026-09-06",
    nextReviewAt: "2026-12-06",
  })),
  ...PACE_REQUIREMENT_SEEDS.map(({ section, category, title }): CmsRequirement => ({
    id: `pace-cfr-${section.replace(".", "-")}`,
    providerTypeId: "pace",
    framework: "ProgramRequirements",
    conditionCategory: category,
    cfrReference: `42 CFR § ${section}`,
    requirement: title,
    responsibleDepartments: [],
    relatedPolicyIds: [],
    evidenceRequirementIds: [],
    staffInterviewConsiderations: [],
    gapAssessmentQuestionIds: [],
    correctiveActionRecommendationIds: [],
    sourceIds: [`ecfr-42-cfr-${section}`, "cms-pace-manual", "cms-pace-audits"],
    verificationStatus: "verified",
    lastVerifiedAt: "2026-09-06",
    nextReviewAt: "2026-12-06",
  })),
];

export const REGULATORY_SOURCES: readonly RegulatorySource[] = [
  ...PACE_REQUIREMENT_SEEDS.map(({ section, subpart, title }) => ({
    id: `ecfr-42-cfr-${section}`,
    designation: "official" as const,
    agency: "Centers for Medicare & Medicaid Services, Department of Health and Human Services",
    title: `42 CFR § ${section} — ${title}`,
    url: `https://www.ecfr.gov/current/title-42/chapter-IV/subchapter-E/part-460/subpart-${subpart.toLowerCase()}/section-${section}`,
    cfrReference: `42 CFR § ${section}`,
    lastVerifiedAt: "2026-09-06",
    nextReviewAt: "2026-12-06",
  })),
  {
    id: "cms-pace-manual",
    designation: "application-guidance",
    agency: "Centers for Medicare & Medicaid Services",
    title: "Pub. 100-11 Programs of All-Inclusive Care for the Elderly (PACE) Manual",
    url: "https://www.cms.gov/regulations-and-guidance/guidance/manuals/internet-only-manuals-ioms-items/cms019036",
    cfrReference: "42 CFR Part 460",
    lastVerifiedAt: "2026-09-06",
    nextReviewAt: "2026-12-06",
  },
  {
    id: "cms-pace-audits",
    designation: "application-guidance",
    agency: "Centers for Medicare & Medicaid Services",
    title: "PACE Audits",
    url: "https://www.cms.gov/medicare/audits-compliance/part-c-d/pace-audits",
    cfrReference: "42 CFR Part 460",
    lastVerifiedAt: "2026-09-06",
    nextReviewAt: "2026-12-06",
  },
  ...RNHCI_REQUIREMENT_SEEDS.map(({ section, title }) => ({
    id: `ecfr-42-cfr-${section}`,
    designation: "official" as const,
    agency: "Centers for Medicare & Medicaid Services, Department of Health and Human Services",
    title: `42 CFR § ${section} — ${title}`,
    url: `https://www.ecfr.gov/current/title-42/chapter-IV/subchapter-A/part-403/subpart-G/section-${section}`,
    cfrReference: `42 CFR § ${section}`,
    lastVerifiedAt: "2026-09-06",
    nextReviewAt: "2026-12-06",
  })),
  {
    id: "cms-rnhci-certification-compliance",
    designation: "application-guidance",
    agency: "Centers for Medicare & Medicaid Services",
    title: "Religious Nonmedical Health Care Institutions",
    url: "https://www.cms.gov/medicare/health-safety-standards/certification-compliance/religious-nonmedical-health-care-institutions",
    cfrReference: "42 CFR Part 403 Subpart G",
    lastVerifiedAt: "2026-09-06",
    nextReviewAt: "2026-12-06",
  },
  {
    id: "cms-som-appendix-u-rnhci",
    designation: "application-guidance",
    agency: "Centers for Medicare & Medicaid Services",
    title: "State Operations Manual Appendix U — Survey Procedures and Interpretive Guidelines for Responsibilities of Medicare Participating Religious Nonmedical Healthcare Institution",
    url: "https://www.cms.gov/files/document/appendix-u-state-operations-manual",
    cfrReference: "42 CFR Part 403 Subpart G",
    lastVerifiedAt: "2026-09-06",
    nextReviewAt: "2026-12-06",
  },
  ...PORTABLE_XRAY_REQUIREMENT_SEEDS.map(({ section, title }) => ({
    id: `ecfr-42-cfr-${section}`,
    designation: "official" as const,
    agency: "Centers for Medicare & Medicaid Services, Department of Health and Human Services",
    title: `42 CFR § ${section} — ${title}`,
    url: `https://www.ecfr.gov/current/title-42/chapter-IV/subchapter-G/part-486/subpart-C#${section}`,
    cfrReference: `42 CFR § ${section}`,
    lastVerifiedAt: "2026-09-06",
    nextReviewAt: "2026-12-06",
  })),
  {
    id: "cms-portable-xray-survey-report",
    designation: "official",
    agency: "Centers for Medicare & Medicaid Services",
    title: "CMS 1882 — PORTABLE XRAY SURVEY REPORT",
    url: "https://www.cms.gov/medicare/cms-forms/cms-forms/cms-forms-items/cms012220",
    cfrReference: "42 CFR Part 486 Subpart C",
    lastVerifiedAt: "2026-09-06",
    nextReviewAt: "2026-12-06",
  },
  {
    id: "cms-som-appendix-d-portable-xray",
    designation: "application-guidance",
    agency: "Centers for Medicare & Medicaid Services",
    title: "State Operations Manual Appendix D - Guidance to Surveyors: Portable X-Ray Services",
    url: "https://www.cms.gov/Regulations-and-Guidance/Guidance/Manuals/downloads/som107ap_d_xray.pdf",
    cfrReference: "42 CFR Part 486 Subpart C",
    lastVerifiedAt: "2026-09-06",
    nextReviewAt: "2026-12-06",
  },
  ...HISTOCOMPATIBILITY_LAB_REQUIREMENT_SEEDS.map(({ section, title }) => ({
    id: `ecfr-42-cfr-${section}`,
    designation: "official" as const,
    agency: "Centers for Medicare & Medicaid Services, Department of Health and Human Services",
    title: `42 CFR § ${section} — ${title}`,
    url: `https://www.ecfr.gov/current/title-42/chapter-IV/subchapter-G/part-493/subpart-K/section-${section}`,
    cfrReference: `42 CFR § ${section}`,
    lastVerifiedAt: "2026-09-06",
    nextReviewAt: "2026-12-06",
  })),
  {
    id: "cms-clia-regulations-compliance",
    designation: "application-guidance",
    agency: "Centers for Medicare & Medicaid Services",
    title: "CLIA Regulations & Compliance",
    url: "https://www.cms.gov/medicare/health-safety-standards/clinical-laboratory-improvement-amendments-clia/clia-regulations-compliance",
    cfrReference: "42 CFR Part 493",
    lastVerifiedAt: "2026-09-06",
    nextReviewAt: "2026-12-06",
  },
  ...OPO_REQUIREMENT_SEEDS.map(({ section, title }) => ({
    id: `ecfr-42-cfr-${section}`,
    designation: "official" as const,
    agency: "Centers for Medicare & Medicaid Services, Department of Health and Human Services",
    title: `42 CFR § ${section} — ${title}`,
    url: `https://www.ecfr.gov/current/title-42/section-${section}`,
    cfrReference: `42 CFR § ${section}`,
    lastVerifiedAt: "2026-09-06",
    nextReviewAt: "2026-12-06",
  })),
  {
    id: "cms-opo-certification",
    designation: "official",
    agency: "Centers for Medicare & Medicaid Services",
    title: "Organ Procurement Organizations (OPOs)",
    url: "https://www.cms.gov/medicare/health-safety-standards/conditions-coverage-participation/organ-procurement-organizations-opo",
    cfrReference: "42 CFR Part 486 Subpart G",
    lastVerifiedAt: "2026-09-06",
    nextReviewAt: "2026-12-06",
  },
  {
    id: "cms-som-appendix-y-opo",
    designation: "application-guidance",
    agency: "Centers for Medicare & Medicaid Services",
    title: "State Operations Manual Appendix Y - Organ Procurement Organization (OPO) Interpretive Guidance",
    url: "https://www.cms.gov/Regulations-and-Guidance/Guidance/Manuals/downloads/som107ap_y_opo.pdf",
    cfrReference: "42 CFR Part 486 Subpart G",
    lastVerifiedAt: "2026-09-06",
    nextReviewAt: "2026-12-06",
  },
  {
    id: "cms-qso-26-06-opo",
    designation: "application-guidance",
    agency: "Centers for Medicare & Medicaid Services",
    title: "Revisions to the Organ Procurement Organization (OPO) Interpretive Guidance – State Operations Manual Appendix Y (Advance Copy)",
    url: "https://www.cms.gov/files/document/qso-26-06-opo-original-release-date-2026-03-11.pdf",
    cfrReference: "42 CFR Part 486 Subpart G",
    lastVerifiedAt: "2026-09-06",
    nextReviewAt: "2026-12-06",
  },
  ...HOSPITAL_REQUIREMENT_SEEDS.map(({ section, subpart, title }) => ({
    id: `ecfr-42-cfr-${section}`,
    designation: "official" as const,
    agency: "Centers for Medicare & Medicaid Services, Department of Health and Human Services",
    title: `42 CFR § ${section} — ${title}`,
    url: `https://www.ecfr.gov/current/title-42/chapter-IV/subchapter-G/part-482/subpart-${subpart.toLowerCase()}/section-${section}`,
    cfrReference: `42 CFR § ${section}`,
    lastVerifiedAt: "2026-09-06",
    nextReviewAt: "2026-12-06",
  })),
  ...CAH_REQUIREMENT_SEEDS.map(({ section, title }) => ({
    id: `ecfr-42-cfr-${section}`,
    designation: "official" as const,
    agency: "Centers for Medicare & Medicaid Services, Department of Health and Human Services",
    title: `42 CFR § ${section} — ${title}`,
    url: `https://www.ecfr.gov/current/title-42/chapter-IV/subchapter-G/part-485/subpart-f/section-${section}`,
    cfrReference: `42 CFR § ${section}`,
    lastVerifiedAt: "2026-09-06",
    nextReviewAt: "2026-12-06",
  })),
  ...REH_REQUIREMENT_SEEDS.map(({ section, title }) => ({
    id: `ecfr-42-cfr-${section}`,
    designation: "official" as const,
    agency: "Centers for Medicare & Medicaid Services, Department of Health and Human Services",
    title: `42 CFR § ${section} — ${title}`,
    url: `https://www.ecfr.gov/current/title-42/chapter-IV/subchapter-G/part-485/subpart-e/section-${section}`,
    cfrReference: `42 CFR § ${section}`,
    lastVerifiedAt: "2026-09-06",
    nextReviewAt: "2026-12-06",
  })),
  ...PSYCHIATRIC_HOSPITAL_REQUIREMENT_SEEDS.map(({ section, title }) => ({
    id: `ecfr-42-cfr-${section}`,
    designation: "official" as const,
    agency: "Centers for Medicare & Medicaid Services, Department of Health and Human Services",
    title: `42 CFR § ${section} — ${title}`,
    url: `https://www.ecfr.gov/current/title-42/chapter-IV/subchapter-G/part-482/subpart-e/section-${section}`,
    cfrReference: `42 CFR § ${section}`,
    lastVerifiedAt: "2026-09-06",
    nextReviewAt: "2026-12-06",
  })),
  {
    id: "ecfr-42-cfr-412-23-e",
    designation: "official",
    agency: "Centers for Medicare & Medicaid Services, Department of Health and Human Services",
    title: "42 CFR § 412.23(e) — Long-term care hospitals",
    url: "https://www.ecfr.gov/current/title-42/chapter-IV/subchapter-B/part-412/subpart-B/section-412.23#p-412.23(e)",
    cfrReference: "42 CFR § 412.23(e)",
    lastVerifiedAt: "2026-09-06",
    nextReviewAt: "2026-12-06",
  },
  {
    id: "ecfr-42-cfr-412-23-d",
    designation: "official",
    agency: "Centers for Medicare & Medicaid Services, Department of Health and Human Services",
    title: "42 CFR § 412.23(d) — Children's hospitals",
    url: "https://www.ecfr.gov/current/title-42/chapter-IV/subchapter-B/part-412/subpart-B/section-412.23#p-412.23(d)",
    cfrReference: "42 CFR § 412.23(d)",
    lastVerifiedAt: "2026-09-06",
    nextReviewAt: "2026-12-06",
  },
  ...IRF_REQUIREMENT_SEEDS.map(({ section, title }) => ({
    id: `ecfr-42-cfr-${section}`,
    designation: "official" as const,
    agency: "Centers for Medicare & Medicaid Services, Department of Health and Human Services",
    title: `42 CFR § ${section} — ${title}`,
    url: `https://www.ecfr.gov/current/title-42/chapter-IV/subchapter-B/part-412/subpart-P/section-${section}`,
    cfrReference: `42 CFR § ${section}`,
    lastVerifiedAt: "2026-09-06",
    nextReviewAt: "2026-12-06",
  })),
  ...SWING_BED_REQUIREMENT_SEEDS.map(({ section, subpart, title }) => ({
    id: `ecfr-42-cfr-${section}`,
    designation: "official" as const,
    agency: "Centers for Medicare & Medicaid Services, Department of Health and Human Services",
    title: `42 CFR § ${section} — ${title}`,
    url: `https://www.ecfr.gov/current/title-42/chapter-IV/subchapter-G/part-483/subpart-${subpart.toLowerCase()}/section-${section}`,
    cfrReference: `42 CFR § ${section}`,
    lastVerifiedAt: "2026-09-06",
    nextReviewAt: "2026-12-06",
  })),
  ...TRANSPLANT_PROGRAM_REQUIREMENT_SEEDS.map(({ section, title }) => ({
    id: `ecfr-42-cfr-${section}`,
    designation: "official" as const,
    agency: "Centers for Medicare & Medicaid Services, Department of Health and Human Services",
    title: `42 CFR § ${section} — ${title}`,
    url: `https://www.ecfr.gov/current/title-42/section-${section}`,
    cfrReference: `42 CFR § ${section}`,
    lastVerifiedAt: "2026-09-06",
    nextReviewAt: "2026-12-06",
  })),
  ...SNF_REQUIREMENT_SEEDS
    .filter(({ section }) => !SWING_BED_REQUIREMENT_SEEDS.some((swingBed) => swingBed.section === section))
    .map(({ section, title }) => ({
      id: `ecfr-42-cfr-${section}`,
      designation: "official" as const,
      agency: "Centers for Medicare & Medicaid Services, Department of Health and Human Services",
      title: `42 CFR § ${section} — ${title}`,
      url: `https://www.ecfr.gov/current/title-42/chapter-IV/subchapter-G/part-483/subpart-B/section-${section}`,
      cfrReference: `42 CFR § ${section}`,
      lastVerifiedAt: "2026-09-06",
      nextReviewAt: "2026-12-06",
    })),
  ...ICF_IID_REQUIREMENT_SEEDS.map(({ section, title }) => ({
    id: `ecfr-42-cfr-${section}`,
    designation: "official" as const,
    agency: "Centers for Medicare & Medicaid Services, Department of Health and Human Services",
    title: `42 CFR § ${section} — ${title}`,
    url: `https://www.ecfr.gov/current/title-42/chapter-IV/subchapter-G/part-483/subpart-I/section-${section}`,
    cfrReference: `42 CFR § ${section}`,
    lastVerifiedAt: "2026-09-06",
    nextReviewAt: "2026-12-06",
  })),
  ...ASC_REQUIREMENT_SEEDS.map(({ section, title }) => ({
    id: `ecfr-42-cfr-${section}`,
    designation: "official" as const,
    agency: "Centers for Medicare & Medicaid Services, Department of Health and Human Services",
    title: `42 CFR § ${section} — ${title}`,
    url: `https://www.ecfr.gov/current/title-42/chapter-IV/subchapter-B/part-416/subpart-C/section-${section}`,
    cfrReference: `42 CFR § ${section}`,
    lastVerifiedAt: "2026-09-06",
    nextReviewAt: "2026-12-06",
  })),
  ...RHC_REQUIREMENT_SEEDS.map(({ section, title }) => ({
    id: `ecfr-42-cfr-${section}`,
    designation: "official" as const,
    agency: "Centers for Medicare & Medicaid Services, Department of Health and Human Services",
    title: `42 CFR § ${section} — ${title}`,
    url: `https://www.ecfr.gov/current/title-42/chapter-IV/subchapter-G/part-491/subpart-A/section-${section}`,
    cfrReference: `42 CFR § ${section}`,
    lastVerifiedAt: "2026-09-06",
    nextReviewAt: "2026-12-06",
  })),
  ...FQHC_REQUIREMENT_SEEDS.map(({ section, title }) => ({
    id: `ecfr-42-cfr-${section}`, designation: "official" as const,
    agency: "Centers for Medicare & Medicaid Services, Department of Health and Human Services",
    title: `42 CFR § ${section} — ${title}`,
    url: `https://www.ecfr.gov/current/title-42/section-${section}`,
    cfrReference: `42 CFR § ${section}`, lastVerifiedAt: "2026-09-06", nextReviewAt: "2026-12-06",
  })),
  ...CORF_REQUIREMENT_SEEDS.map(({ section, title }) => ({
    id: `ecfr-42-cfr-${section}`, designation: "official" as const,
    agency: "Centers for Medicare & Medicaid Services, Department of Health and Human Services",
    title: `42 CFR § ${section} — ${title}`,
    url: `https://www.ecfr.gov/current/title-42/chapter-IV/subchapter-G/part-485/subpart-B/section-${section}`,
    cfrReference: `42 CFR § ${section}`, lastVerifiedAt: "2026-09-06", nextReviewAt: "2026-12-06",
  })),
  ...OPT_REQUIREMENT_SEEDS.map(({ section, title }) => ({
    id: `ecfr-42-cfr-${section}`, designation: "official" as const,
    agency: "Centers for Medicare & Medicaid Services, Department of Health and Human Services",
    title: `42 CFR § ${section} — ${title}`, url: `https://www.ecfr.gov/current/title-42/chapter-IV/subchapter-G/part-485/subpart-H/section-${section}`,
    cfrReference: `42 CFR § ${section}`, lastVerifiedAt: "2026-09-06", nextReviewAt: "2026-12-06",
  })),
  ...CMHC_REQUIREMENT_SEEDS.map(({ section, title }) => ({
    id: `ecfr-42-cfr-${section}`, designation: "official" as const, agency: "Centers for Medicare & Medicaid Services, Department of Health and Human Services",
    title: `42 CFR § ${section} — ${title}`, url: `https://www.ecfr.gov/current/title-42/chapter-IV/subchapter-G/part-485/subpart-J/section-${section}`,
    cfrReference: `42 CFR § ${section}`, lastVerifiedAt: "2026-09-06", nextReviewAt: "2026-12-06",
  })),
  ...OTP_REQUIREMENT_SEEDS.map(({ section, title }) => ({
    id: `ecfr-42-cfr-${section}`, designation: "official" as const, agency: "Substance Abuse and Mental Health Services Administration, Department of Health and Human Services",
    title: `42 CFR § ${section} — ${title}`, url: `https://www.ecfr.gov/current/title-42/chapter-I/subchapter-A/part-8/subpart-C/section-${section}`,
    cfrReference: `42 CFR § ${section}`, lastVerifiedAt: "2026-09-06", nextReviewAt: "2026-12-06",
  })),
  ...HHA_REQUIREMENT_SEEDS.map(({ section, subpart, title }) => ({
    id: `ecfr-42-cfr-${section}`, designation: "official" as const, agency: "Centers for Medicare & Medicaid Services, Department of Health and Human Services", title: `42 CFR § ${section} — ${title}`, url: `https://www.ecfr.gov/current/title-42/chapter-IV/subchapter-G/part-484/subpart-${subpart.toLowerCase()}/section-${section}`, cfrReference: `42 CFR § ${section}`, lastVerifiedAt: "2026-09-06", nextReviewAt: "2026-12-06",
  })),
  ...HOSPICE_REQUIREMENT_SEEDS.map(([section,subpart,title]) => ({
    id:`ecfr-42-cfr-${section}`,designation:"official" as const,agency:"Centers for Medicare & Medicaid Services, Department of Health and Human Services",title:`42 CFR § ${section} — ${title}`,url:`https://www.ecfr.gov/current/title-42/chapter-IV/subchapter-B/part-418/subpart-${subpart.toLowerCase()}/section-${section}`,cfrReference:`42 CFR § ${section}`,lastVerifiedAt:"2026-09-06",nextReviewAt:"2026-12-06",
  })),
  ...ESRD_REQUIREMENT_SEEDS.map(({ section, subpart, title }) => ({
    id: `ecfr-42-cfr-${section}`, designation: "official" as const,
    agency: "Centers for Medicare & Medicaid Services, Department of Health and Human Services",
    title: `42 CFR § ${section} — ${title}`,
    url: `https://www.ecfr.gov/current/title-42/chapter-IV/subchapter-G/part-494/subpart-${subpart.toLowerCase()}/section-${section}`,
    cfrReference: `42 CFR § ${section}`, lastVerifiedAt: "2026-09-06", nextReviewAt: "2026-12-06",
  })),
  {
    id: "cms-esrd-certification-compliance",
    designation: "application-guidance",
    agency: "Centers for Medicare & Medicaid Services",
    title: "End Stage Renal Disease Facility Providers",
    url: "https://www.cms.gov/medicare/health-safety-standards/certification-compliance/end-stage-renal-disease",
    cfrReference: "42 CFR Part 494",
    lastVerifiedAt: "2026-09-06",
    nextReviewAt: "2026-12-06",
  },
  {
    id: "cms-esrd-conditions-for-coverage",
    designation: "application-guidance",
    agency: "Centers for Medicare & Medicaid Services",
    title: "End-Stage Renal Disease Facilities",
    url: "https://www.cms.gov/medicare/health-safety-standards/conditions-coverage-participation/end-stage-renal-disease-facilities",
    cfrReference: "42 CFR Part 494",
    lastVerifiedAt: "2026-09-06",
    nextReviewAt: "2026-12-06",
  },
  {
    id: "cms-som-appendix-h-esrd",
    designation: "application-guidance",
    agency: "Centers for Medicare & Medicaid Services",
    title: "State Operations Manual Appendix H - Guidance to Surveyors: End-Stage Renal Disease Facilities",
    url: "https://www.cms.gov/regulations-and-guidance/guidance/manuals/downloads/som107ap_h_esrdpdf",
    cfrReference: "42 CFR Part 494",
    lastVerifiedAt: "2026-09-06",
    nextReviewAt: "2026-12-06",
  },
  {
    id: "cms-ltch-pps",
    designation: "application-guidance",
    agency: "Centers for Medicare & Medicaid Services",
    title: "Long-Term Care Hospital Prospective Payment System",
    url: "https://www.cms.gov/medicare/payment/prospective-payment-systems/long-term-care-hospital",
    cfrReference: "42 CFR Part 412",
    lastVerifiedAt: "2026-09-06",
    nextReviewAt: "2026-12-06",
  },
  {
    id: "cms-som-appendix-pp-ltcf",
    designation: "application-guidance",
    agency: "Centers for Medicare & Medicaid Services",
    title: "State Operations Manual Appendix PP — Guidance to Surveyors for Long Term Care Facilities",
    url: "https://www.cms.gov/regulations-and-guidance/guidance/manuals/downloads/som107ap_pp_guidelines_ltcf.pdf",
    cfrReference: "42 CFR Part 483 Subpart B",
    lastVerifiedAt: "2026-09-06",
    nextReviewAt: "2026-12-06",
  },
  {
    id: "cms-nursing-homes-certification",
    designation: "application-guidance",
    agency: "Centers for Medicare & Medicaid Services",
    title: "Nursing Homes — Certification and Compliance",
    url: "https://www.cms.gov/medicare/health-safety-standards/certification-compliance/nursing-homes",
    cfrReference: "42 CFR Part 483 Subpart B",
    lastVerifiedAt: "2026-09-06",
    nextReviewAt: "2026-12-06",
  },
  {
    id: "cms-icf-iid-conditions",
    designation: "application-guidance",
    agency: "Centers for Medicare & Medicaid Services",
    title: "Intermediate Care Facilities for Individuals with Intellectual Disabilities (ICF/IID)",
    url: "https://www.cms.gov/medicare/health-safety-standards/conditions-coverage-participation/immediate-care-facilities",
    cfrReference: "42 CFR Part 483 Subpart I",
    lastVerifiedAt: "2026-09-06",
    nextReviewAt: "2026-12-06",
  },
  {
    id: "cms-icf-iid-surveyor-guidelines",
    designation: "application-guidance",
    agency: "Centers for Medicare & Medicaid Services",
    title: "State Operations Manual Appendix J — Guidance to Surveyors: ICF/IID",
    url: "https://www.cms.gov/files/document/surveyor-guidelines",
    cfrReference: "42 CFR Part 483 Subpart I",
    lastVerifiedAt: "2026-09-06",
    nextReviewAt: "2026-12-06",
  },
  {
    id: "cms-asc-certification",
    designation: "application-guidance",
    agency: "Centers for Medicare & Medicaid Services",
    title: "Ambulatory Surgical Centers — Certification and Compliance",
    url: "https://www.cms.gov/medicare/health-safety-standards/certification-compliance/ambulatory-surgery-centers",
    cfrReference: "42 CFR Part 416 Subpart C",
    lastVerifiedAt: "2026-09-06",
    nextReviewAt: "2026-12-06",
  },
  {
    id: "cms-rhc-certification",
    designation: "application-guidance",
    agency: "Centers for Medicare & Medicaid Services",
    title: "Rural Health Clinics — Certification and Compliance",
    url: "https://www.cms.gov/medicare/health-safety-standards/certification-compliance/rural-health-clinics",
    cfrReference: "42 CFR Part 491 Subpart A",
    lastVerifiedAt: "2026-09-06",
    nextReviewAt: "2026-12-06",
  },
  {
    id: "cms-rhc-fqhc-conditions", designation: "application-guidance", agency: "Centers for Medicare & Medicaid Services",
    title: "Rural Health Clinic/Federally Qualified Health Center", url: "https://www.cms.gov/medicare/health-safety-standards/conditions-coverage-participation/rural-health-clinic-federally-qualified-health-center",
    cfrReference: "42 CFR Parts 405 and 491", lastVerifiedAt: "2026-09-06", nextReviewAt: "2026-12-06",
  },
  {
    id: "cms-fqhc-information-center", designation: "application-guidance", agency: "Centers for Medicare & Medicaid Services",
    title: "FQHC Information Center", url: "https://www.cms.gov/fqhc-information-center",
    cfrReference: "42 CFR Part 405 Subpart X", lastVerifiedAt: "2026-09-06", nextReviewAt: "2026-12-06",
  },
  {
    id: "cms-som-appendix-k-corf", designation: "application-guidance", agency: "Centers for Medicare & Medicaid Services",
    title: "State Operations Manual Appendix K — Guidance to Surveyors: Comprehensive Outpatient Rehabilitation Facilities",
    url: "https://www.cms.gov/regulations-and-guidance/guidance/manuals/downloads/som107ap_k_corf.pdf",
    cfrReference: "42 CFR Part 485 Subpart B", lastVerifiedAt: "2026-09-06", nextReviewAt: "2026-12-06",
  },
  {
    id: "cms-opt-certification", designation: "application-guidance", agency: "Centers for Medicare & Medicaid Services",
    title: "Outpatient Rehabilitation Providers — Certification and Compliance", url: "https://www.cms.gov/medicare/health-safety-standards/certification-compliance/outpatient-rehabilitation-providers",
    cfrReference: "42 CFR Part 485 Subpart H", lastVerifiedAt: "2026-09-06", nextReviewAt: "2026-12-06",
  },
  {
    id: "cms-som-appendix-e-opt", designation: "application-guidance", agency: "Centers for Medicare & Medicaid Services",
    title: "State Operations Manual Appendix E — Guidance to Surveyors: Outpatient Physical Therapy or Speech Pathology Services",
    url: "https://www.cms.gov/regulations-and-guidance/guidance/manuals/downloads/som107ap_e_opt.pdf",
    cfrReference: "42 CFR Part 485 Subpart H", lastVerifiedAt: "2026-09-06", nextReviewAt: "2026-12-06",
  },
  {
    id: "cms-qso-24-18-opt", designation: "application-guidance", agency: "Centers for Medicare & Medicaid Services",
    title: "QSO-24-18-OPT — Revisions and clarifications for survey and certification activities for the OPT/SLP Programs",
    url: "https://www.cms.gov/files/document/qso-24-18-opt.pdf",
    cfrReference: "42 CFR Part 485 Subpart H", lastVerifiedAt: "2026-09-06", nextReviewAt: "2026-12-06",
  },
  {
    id: "cms-cmhc-certification", designation: "application-guidance", agency: "Centers for Medicare & Medicaid Services",
    title: "Community Mental Health Centers — Certification and Compliance", url: "https://www.cms.gov/medicare/health-safety-standards/certification-compliance/community-mental-health-centers",
    cfrReference: "42 CFR Part 485 Subpart J", lastVerifiedAt: "2026-09-06", nextReviewAt: "2026-12-06",
  },
  {
    id: "cms-qso-22-07-cmhc", designation: "application-guidance", agency: "Centers for Medicare & Medicaid Services",
    title: "QSO-22-07-ALL — Community Mental Health Centers (CMHC) Attachment K", url: "https://www.cms.gov/files/document/qso-22-07-all-attachment-k-cmhc.pdf",
    cfrReference: "42 CFR Part 485 Subpart J", lastVerifiedAt: "2026-09-06", nextReviewAt: "2026-12-06",
  },
  {
    id: "cms-otp-enrollment", designation: "application-guidance", agency: "Centers for Medicare & Medicaid Services",
    title: "OTP Enrollment", url: "https://www.cms.gov/medicare/payment/opioid-treatment-program/enrollment",
    cfrReference: "42 CFR Part 8 Subpart C", lastVerifiedAt: "2026-09-06", nextReviewAt: "2026-12-06",
  },
  {
    id: "cms-hha-certification", designation: "application-guidance", agency: "Centers for Medicare & Medicaid Services", title: "Home Health Agencies — Certification and Compliance", url: "https://www.cms.gov/medicare/health-safety-standards/certification-compliance/home-health-agencies", cfrReference: "42 CFR Part 484", lastVerifiedAt: "2026-09-06", nextReviewAt: "2026-12-06",
  },
  {
    id:"cms-hospice-certification",designation:"application-guidance",agency:"Centers for Medicare & Medicaid Services",title:"Hospices — Certification and Compliance",url:"https://www.cms.gov/medicare/health-safety-standards/certification-compliance/hospices",cfrReference:"42 CFR Part 418",lastVerifiedAt:"2026-09-06",nextReviewAt:"2026-12-06",
  },
  {
    id:"cms-som-appendix-m-hospice",designation:"application-guidance",agency:"Centers for Medicare & Medicaid Services",title:"State Operations Manual Appendix M — Guidance to Surveyors: Hospice",url:"https://www.cms.gov/regulations-and-guidance/guidance/manuals/downloads/som107ap_m_hospice.pdf",cfrReference:"42 CFR Part 418",lastVerifiedAt:"2026-09-06",nextReviewAt:"2026-12-06",
  },
  {
    id: "cms-som-appendix-b-hha", designation: "application-guidance", agency: "Centers for Medicare & Medicaid Services", title: "State Operations Manual Appendix B — Guidance to Surveyors: Home Health Agencies", url: "https://www.cms.gov/regulations-and-guidance/guidance/manuals/downloads/som107ap_b_hha.pdf", cfrReference: "42 CFR Part 484", lastVerifiedAt: "2026-09-06", nextReviewAt: "2026-12-06",
  },
  {
    id: "cms-otp-benefit-policy-manual", designation: "application-guidance", agency: "Centers for Medicare & Medicaid Services",
    title: "Medicare Benefit Policy Manual Chapter 17 — Opioid Treatment Programs (OTPs)",
    url: "https://www.cms.gov/files/document/chapter-17-opioid-treatment-programs-otps.pdf",
    cfrReference: "42 CFR Part 8 Subpart C", lastVerifiedAt: "2026-09-06", nextReviewAt: "2026-12-06",
  },
  {
    id: "cms-som-appendix-g-rhc",
    designation: "application-guidance",
    agency: "Centers for Medicare & Medicaid Services",
    title: "State Operations Manual Appendix G — Rural Health Clinics",
    url: "https://www.cms.gov/files/document/appendix-g-state-operations-manual",
    cfrReference: "42 CFR Part 491 Subpart A",
    lastVerifiedAt: "2026-09-06",
    nextReviewAt: "2026-12-06",
  },
  {
    id: "cms-qso-25-27-rhc",
    designation: "application-guidance",
    agency: "Centers for Medicare & Medicaid Services",
    title: "QSO-25-27-RHC — Rural Health Clinic Changes in Regulations for Primary Care Services and Laboratory Requirements",
    url: "https://www.cms.gov/medicare/health-safety-standards/quality-safety-oversight-general-information/policy-memos/policy-memos-states-and-cms-locations/rural-health-clinic-rhc-changes-regulations-primary-care-services-laboratory-requirements",
    cfrReference: "42 CFR § 491.9",
    lastVerifiedAt: "2026-09-06",
    nextReviewAt: "2026-12-06",
  },
  {
    id: "cms-som-appendix-l-asc",
    designation: "application-guidance",
    agency: "Centers for Medicare & Medicaid Services",
    title: "State Operations Manual Appendix L — Guidance to Surveyors: Ambulatory Surgical Centers",
    url: "https://www.cms.gov/regulations-and-guidance/guidance/manuals/downloads/som107ap_l_ambulatory.pdf",
    cfrReference: "42 CFR Part 416 Subpart C",
    lastVerifiedAt: "2026-09-06",
    nextReviewAt: "2026-12-06",
  },
  {
    id: "cms-qso-18-26-swing-bed",
    designation: "application-guidance",
    agency: "Centers for Medicare & Medicaid Services",
    title: "QSO-18-26-Hospital/CAH — Guidance to Hospitals and Critical Access Hospital Surveyors Addressing Revisions to Swing-Bed Requirements",
    url: "https://www.cms.gov/medicare/provider-enrollment-and-certification/surveycertificationgeninfo/downloads/qso18-26-hospital-cah.pdf",
    cfrReference: "42 CFR § 482.58",
    lastVerifiedAt: "2026-09-06",
    nextReviewAt: "2026-12-06",
  },
  {
    id: "cms-organ-transplant-program",
    designation: "application-guidance",
    agency: "Centers for Medicare & Medicaid Services",
    title: "Organ Transplant Program — Certification and Compliance",
    url: "https://www.cms.gov/medicare/health-safety-standards/certification-compliance/organ-transplant-program",
    cfrReference: "42 CFR §§ 482.68–482.104",
    lastVerifiedAt: "2026-09-06",
    nextReviewAt: "2026-12-06",
  },
  {
    id: "cms-som-appendix-x-transplant",
    designation: "application-guidance",
    agency: "Centers for Medicare & Medicaid Services",
    title: "State Operations Manual Appendix X — Guidance to Surveyors: Organ Transplant Programs",
    url: "https://www.cms.gov/regulations-and-guidance/guidance/manuals/downloads/som107ap_x_otp.pdf",
    cfrReference: "42 CFR §§ 482.68–482.104",
    lastVerifiedAt: "2026-09-06",
    nextReviewAt: "2026-12-06",
  },
  {
    id: "cms-qso-19-11-transplant",
    designation: "application-guidance",
    agency: "Centers for Medicare & Medicaid Services",
    title: "QSO-19-11-Transplant — Transplant Program Quality Review",
    url: "https://www.cms.gov/Medicare/Provider-Enrollment-and-Certification/SurveyCertificationGenInfo/Downloads/QSO-19-11-Transplant.pdf",
    cfrReference: "42 CFR §§ 482.80 and 482.96",
    lastVerifiedAt: "2026-09-06",
    nextReviewAt: "2026-12-06",
  },
  {
    id: "cms-irf-certification",
    designation: "application-guidance",
    agency: "Centers for Medicare & Medicaid Services",
    title: "Inpatient Rehabilitation Facilities — Certification and Compliance",
    url: "https://www.cms.gov/medicare/health-safety-standards/certification-compliance/inpatient-rehabilitation-facilities",
    cfrReference: "42 CFR Part 412 Subpart P; 42 CFR Part 482",
    lastVerifiedAt: "2026-09-06",
    nextReviewAt: "2026-12-06",
  },
  {
    id: "cms-som-appendix-a-hospitals",
    designation: "application-guidance",
    agency: "Centers for Medicare & Medicaid Services",
    title: "State Operations Manual Appendix A — Survey Protocol, Regulations and Interpretive Guidelines for Hospitals",
    url: "https://www.cms.gov/regulations-and-guidance/guidance/manuals/downloads/som107ap_a_hospitals.pdf",
    cfrReference: "42 CFR Part 482",
    lastVerifiedAt: "2026-09-06",
    nextReviewAt: "2026-12-06",
  },
  {
    id: "cms-som-appendix-w-cah",
    designation: "application-guidance",
    agency: "Centers for Medicare & Medicaid Services",
    title: "State Operations Manual Appendix W — Survey Protocol, Regulations and Interpretive Guidelines for Critical Access Hospitals",
    url: "https://www.cms.gov/regulations-and-guidance/guidance/manuals/downloads/som107ap_w_cah.pdf",
    cfrReference: "42 CFR Part 485 Subpart F",
    lastVerifiedAt: "2026-09-06",
    nextReviewAt: "2026-12-06",
  },
  {
    id: "cms-qso-24-20-reh",
    designation: "application-guidance",
    agency: "Centers for Medicare & Medicaid Services",
    title: "QSO-24-20-REH — Revised Guidance for Rural Emergency Hospital Provisions, Conversion Process and Conditions of Participation",
    url: "https://www.cms.gov/files/document/qso-24-20-reh-revised-2024-09-06.pdf",
    cfrReference: "42 CFR Part 485 Subpart E",
    lastVerifiedAt: "2026-09-06",
    nextReviewAt: "2026-12-06",
  },
];
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

export function getRequirementsForProvider(providerTypeId: string): readonly CmsRequirement[] {
  if (providerTypeId === "psych") {
    return CMS_REQUIREMENTS.filter(
      (requirement) => requirement.providerTypeId === "hospital" || requirement.providerTypeId === "psych",
    );
  }
  if (providerTypeId === "ltch") {
    return CMS_REQUIREMENTS.filter(
      (requirement) => requirement.providerTypeId === "hospital" || requirement.providerTypeId === "ltch",
    );
  }
  if (providerTypeId === "irf") {
    return CMS_REQUIREMENTS.filter(
      (requirement) => requirement.providerTypeId === "hospital" || requirement.providerTypeId === "irf",
    );
  }
  if (providerTypeId === "childrens") {
    return CMS_REQUIREMENTS.filter(
      (requirement) => requirement.providerTypeId === "hospital" || requirement.providerTypeId === "childrens",
    );
  }
  if (providerTypeId === "hospital-swing-bed") {
    return CMS_REQUIREMENTS.filter(
      (requirement) => requirement.providerTypeId === "hospital" || requirement.providerTypeId === "hospital-swing-bed",
    );
  }
  if (providerTypeId === "transplant-program") {
    return CMS_REQUIREMENTS.filter(
      (requirement) => (
        (requirement.providerTypeId === "hospital" &&
          requirement.id !== "hospital-cfr-482-15" &&
          requirement.id !== "hospital-cfr-482-58") ||
        requirement.providerTypeId === "transplant-program"
      ),
    );
  }
  if (providerTypeId === "nursing-facility") {
    return CMS_REQUIREMENTS.filter((requirement) => requirement.providerTypeId === "snf");
  }
  if (providerTypeId === "fqhc") {
    return CMS_REQUIREMENTS.filter(
      (requirement) => requirement.providerTypeId === "rhc" || requirement.providerTypeId === "fqhc",
    );
  }
  if (providerTypeId === "oslp") {
    return CMS_REQUIREMENTS.filter((requirement) => requirement.providerTypeId === "opt");
  }
  return CMS_REQUIREMENTS.filter((requirement) => requirement.providerTypeId === providerTypeId);
}

export function getRegulatorySource(sourceId: string): RegulatorySource | undefined {
  return REGULATORY_SOURCES.find((source) => source.id === sourceId);
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