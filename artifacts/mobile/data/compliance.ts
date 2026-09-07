export type Institution = { id: string; name: string; short: string; ecfr: string };
export type Guideline = { id: string; title: string; summary: string; focus: string[] };
export type ChecklistItem = { id: string; title: string; detail: string; category: string };

export const institutions: Institution[] = [
  ['hospital','Hospital','Hospital','42 CFR Part 482'], ['cah','Critical Access Hospital','CAH','42 CFR Part 485, Subpart F'],
  ['asc','Ambulatory Surgical Center','ASC','42 CFR Part 416'], ['hha','Home Health Agency','HHA','42 CFR Part 484'],
  ['hospice','Hospice','Hospice','42 CFR Part 418'], ['snf','Skilled Nursing Facility','SNF','42 CFR Part 483, Subpart B'],
  ['ltch','Long-Term Care Hospital','LTCH','42 CFR Part 482'], ['irf','Inpatient Rehabilitation Facility','IRF','42 CFR Part 412, Subpart B'],
  ['cmhc','Community Mental Health Center','CMHC','42 CFR Part 485, Subpart J'], ['corf','Comprehensive Outpatient Rehabilitation Facility','CORF','42 CFR Part 485, Subpart B'],
  ['rhc','Rural Health Clinic','RHC','42 CFR Part 491'], ['fqhc','Federally Qualified Health Center','FQHC','42 CFR Part 491'],
  ['esrd','End-Stage Renal Disease Facility','ESRD','42 CFR Part 494'], ['clia','Clinical Laboratory','CLIA','42 CFR Part 493'],
  ['otp','Opioid Treatment Program','OTP','42 CFR Part 8'], ['opo','Organ Procurement Organization','OPO','42 CFR Part 486, Subpart G'],
  ['prtf','Psychiatric Residential Treatment Facility','PRTF','42 CFR Part 483, Subpart G'],
].map(([id,name,short,ecfr]) => ({ id, name, short, ecfr }));

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
