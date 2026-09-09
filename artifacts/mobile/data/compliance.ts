export type Institution = {
  id: string;
  name: string;
  short: string;
  ecfr: string;
  contentStatus: 'verified' | 'pending-verification';
};
export type Guideline = { id: string; title: string; summary: string; focus: string[] };
export type ChecklistItem = { id: string; title: string; detail: string; category: string };

export const institutions: Institution[] = [
  { id:'hospital', name:'Acute Care Hospital', short:'ACH', ecfr:'42 CFR 482', contentStatus:'verified' },
  { id:'cah', name:'Critical Access Hospital', short:'CAH', ecfr:'42 CFR 485 Subpart F', contentStatus:'verified' },
  { id:'reh', name:'Rural Emergency Hospital', short:'REH', ecfr:'42 CFR 485 Subpart E', contentStatus:'verified' },
  { id:'psych', name:'Psychiatric Hospital', short:'PH', ecfr:'42 CFR 482 and 42 CFR 482 Subpart E', contentStatus:'verified' },
  { id:'ltch', name:'Long-Term Care Hospital', short:'LTCH', ecfr:'42 CFR 482; 42 CFR 412.23(e)', contentStatus:'verified' },
  { id:'irf', name:'Inpatient Rehabilitation Facility', short:'IRF', ecfr:'42 CFR 482; 42 CFR 412 Subpart P', contentStatus:'verified' },
  { id:'childrens', name:"Children's Hospital", short:'CH', ecfr:'42 CFR 482; 42 CFR 412.23(d)', contentStatus:'verified' },
  { id:'hospital-swing-bed', name:'Hospital Swing Bed', short:'Hospital Swing Bed', ecfr:'42 CFR 482; 42 CFR 482.58; selected 42 CFR 483 requirements', contentStatus:'verified' },
  { id:'transplant-program', name:'Transplant Program / Transplant Center', short:'Transplant Program', ecfr:'42 CFR 482.1–482.57 and 482.68–482.104', contentStatus:'verified' },
  { id:'snf', name:'Skilled Nursing Facility', short:'SNF', ecfr:'42 CFR 483 Subpart B', contentStatus:'verified' },
  { id:'nursing-facility', name:'Nursing Facility', short:'NF', ecfr:'42 CFR 483 Subpart B', contentStatus:'verified' },
  { id:'icf-iid', name:'Intermediate Care Facility for Individuals with Intellectual Disabilities', short:'ICF/IID', ecfr:'42 CFR 483 Subpart I', contentStatus:'verified' },
  { id:'asc', name:'Ambulatory Surgical Center', short:'ASC', ecfr:'42 CFR 416 Subpart C', contentStatus:'verified' },
  { id:'rhc', name:'Rural Health Clinic', short:'RHC', ecfr:'42 CFR 491 Subpart A', contentStatus:'verified' },
  { id:'fqhc', name:'Federally Qualified Health Center', short:'FQHC', ecfr:'42 CFR 491 Subpart A; 42 CFR 405 Subpart X', contentStatus:'verified' },
  { id:'corf', name:'Comprehensive Outpatient Rehabilitation Facility', short:'CORF', ecfr:'42 CFR 485 Subpart B', contentStatus:'verified' },
  { id:'opt', name:'Outpatient Physical Therapy', short:'OPT', ecfr:'42 CFR 485 Subpart H', contentStatus:'verified' },
  { id:'oot', name:'Outpatient Occupational Therapy', short:'OOT', ecfr:'Content Pending Verification', contentStatus:'pending-verification' },
  { id:'oslp', name:'Outpatient Speech-Language Pathology', short:'OSLP', ecfr:'42 CFR 485 Subpart H', contentStatus:'verified' },
  { id:'cmhc', name:'Community Mental Health Center', short:'CMHC', ecfr:'42 CFR 485 Subpart J', contentStatus:'verified' },
  { id:'otp', name:'Opioid Treatment Program', short:'OTP', ecfr:'42 CFR 8 Subpart C', contentStatus:'verified' },
  { id:'hha', name:'Home Health Agency', short:'HHA', ecfr:'42 CFR 484 Subparts B and C', contentStatus:'verified' },
  { id:'hospice', name:'Hospice', short:'Hospice', ecfr:'42 CFR 418 Subparts C and D', contentStatus:'verified' },
  { id:'esrd', name:'ESRD Facility', short:'ESRD', ecfr:'42 CFR Part 494', contentStatus:'verified' },
  { id:'opo', name:'Organ Procurement Organization', short:'OPO', ecfr:'42 CFR 486 Subpart G', contentStatus:'verified' },
  { id:'histocompatibility-lab', name:'Histocompatibility Laboratory', short:'Histocompatibility Laboratory', ecfr:'42 CFR §§ 493.1227 and 493.1278', contentStatus:'verified' },
  { id:'xray', name:'Portable X-Ray Supplier', short:'Portable X-Ray Supplier', ecfr:'42 CFR 486 Subpart C', contentStatus:'verified' },
  { id:'rnhci', name:'Religious Nonmedical Health Care Institution', short:'RNHCI', ecfr:'42 CFR 403 Subpart G', contentStatus:'verified' },
  { id:'ihs-facility', name:'Indian Health Service Facility', short:'IHS', ecfr:'Content Pending Verification', contentStatus:'pending-verification' },
  { id:'pace', name:'PACE Organization', short:'PACE', ecfr:'42 CFR Part 460', contentStatus:'verified' },
];

export const providerCoverage = {
  cataloged: institutions.length,
  verified: institutions.filter((institution) => institution.contentStatus === 'verified').length,
  pending: institutions.filter((institution) => institution.contentStatus === 'pending-verification').length,
} as const;

const commonGuidelines: Guideline[] = [
 { id:'governance', title:'Governance & accountability', summary:'Confirm leaders can show active oversight of quality, safety, staffing, and corrective actions.', focus:['Meeting evidence','Assigned accountability','Issue escalation'] },
 { id:'quality', title:'Quality assessment & performance', summary:'Trace a current improvement project from identified risk through measurement, intervention, and sustained results.', focus:['Current indicators','Data review','Documented follow-through'] },
 { id:'rights', title:'Patient rights & communication', summary:'Observe whether rights, privacy, informed decisions, grievances, and communication needs are handled consistently.', focus:['Accessible notices','Consent workflow','Grievance response'] },
 { id:'emergency', title:'Emergency preparedness', summary:'Verify the emergency plan reflects facility risks and that staff can explain their role during disruptions.', focus:['Risk assessment','Training records','Continuity procedures'] },
 { id:'records', title:'Clinical records', summary:'Sample records for completeness, authentication, timely entries, care coordination, and secure availability.', focus:['Timely entries','Authentication','Confidentiality'] },
 { id:'infection', title:'Infection prevention', summary:'Walk the care environment for surveillance, hand hygiene, cleaning, isolation, and staff competency evidence.', focus:['Observed practice','Surveillance logs','Competency checks'] },
];
export const guidelinesFor = (institution: Institution) => commonGuidelines.map((g, i) => i === 0 ? {...g, summary: g.summary + ' Apply the selected ' + institution.short + ' regulatory framework.'} : g);

export const checklist: ChecklistItem[] = [
 {id:'entrance',category:'Entrance readiness',title:'Survey entrance materials are current',detail:'Leadership contacts, licenses, census, organizational chart, and requested records are ready.'},
 {id:'leadership',category:'Leadership',title:'Leaders can describe top compliance risks',detail:'Ask two leaders to name current risks, ownership, mitigation, and monitoring.'},
 {id:'qapi',category:'Quality',title:'A QAPI project traces end to end',detail:'Evidence connects the problem, baseline, intervention, measurement, and sustainment.'},
 {id:'environment',category:'Environment',title:'Care areas are clean, safe, and controlled',detail:'Check storage, expired supplies, emergency access, privacy, and equipment condition.'},
 {id:'infection',category:'Infection prevention',title:'Observed practice matches policy',detail:'Observe hand hygiene, PPE, cleaning, and isolation workflow during the round.'},
 {id:'medications',category:'Medication safety',title:'Medication controls are consistently followed',detail:'Review security, labeling, temperatures, expiration, reconciliation, and high-alert safeguards.'},
 {id:'records',category:'Records',title:'Sample records are complete and timely',detail:'Check orders, assessments, plans, signatures, reassessments, and discharge documentation.'},
 {id:'staffing',category:'Workforce',title:'Staff files support assigned duties',detail:'Confirm credentials, orientation, competencies, evaluations, and required training.'},
 {id:'rights',category:'Patient rights',title:'Rights are visible in daily operations',detail:'Check privacy, language access, consent, complaint handling, and respectful care.'},
 {id:'emergency',category:'Emergency readiness',title:'Staff can explain emergency roles',detail:'Spot-check knowledge, communication routes, utilities response, and recent exercise follow-up.'},
];
