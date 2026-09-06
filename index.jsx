import { useState, useEffect, useRef } from "react";
import ExcelJS from "exceljs";
import { useAccount } from "@/hooks/useAccount";
import {
  DEFAULT_COMPLIANCE_TOPICS,
  LEGACY_INSTITUTION_TYPES,
  PROVIDER_CATEGORIES,
  getProviderProfile,
  getRegulatorySource,
  getRequirementsForProvider,
  getProviderTopics,
  getProvidersByCategory,
  isProviderContentAvailable,
} from "@workspace/cms-compliance-data";

// Clerk user IDs that get the admin button — covers dev and production environments.
const ADMIN_CLERK_IDS = [
  "user_3HyQAQQh8oexrrANO8yBOIYm2m8", // dev
  "user_3HpG4wWADUbnkJS3D2aGQspgGFP",  // production facility-owner account
  "user_3HxczU4Qjnwl3L2O5a8TssjtfON",  // actual production admin Clerk ID
];

// ─── Constants ───────────────────────────────────────────────────────────────

const INSTITUTION_TYPES = LEGACY_INSTITUTION_TYPES;
const TOPICS = DEFAULT_COMPLIANCE_TOPICS;

// Generic fallback departments (used only if an institution type is not in INSTITUTION_UNITS)
const DEPARTMENTS = [
  "Nursing / Patient Care",
  "Infection Prevention & Control",
  "Quality & Compliance",
  "Medical Records / HIM",
  "Pharmacy",
  "Laboratory",
  "Radiology / Imaging",
  "Surgery / Operating Room",
  "Emergency Department",
  "ICU / Critical Care",
  "Rehabilitation Services",
  "Food & Nutrition",
  "Environmental Services",
  "Maintenance / Facilities",
  "Administration",
  "Human Resources",
];

// Per-institution unit/department + contracted-service lists
// Each entry: { label: string, units: string[], contracted: string[] }
const INSTITUTION_UNITS = {
  hospital: {
    label: "Hospital Unit / Department",
    units: [
      "Medical / Med-Surg",
      "Emergency Department (ED)",
      "Intensive Care Unit (ICU)",
      "Surgery / Operating Room",
      "Labor & Delivery / OB",
      "Pediatrics",
      "Neonatal ICU (NICU)",
      "Psychiatric / Behavioral Health",
      "Oncology",
      "Cardiac / Telemetry",
      "Orthopedics",
      "Neurology / Stroke",
      "Laboratory (Clinical Lab)",
      "Radiology / Imaging",
      "Pharmacy",
      "Rehabilitation / Physical Therapy",
      "Endoscopy / GI Lab",
      "Cardiac Cath Lab",
      "Dialysis / Nephrology",
      "Wound Care / Infusion",
      "Central Sterile Processing (SPD)",
      "Environmental Services (EVS)",
      "Food & Nutrition Services",
      "Case Management / Social Work",
      "Medical Records / HIM",
      "Quality & Compliance",
      "Administration",
    ],
    contracted: [
      "Dietary / Food Services (Contracted)",
      "Environmental / Housekeeping (Contracted)",
      "Security Services (Contracted)",
      "Laboratory Services (Contracted)",
      "Radiology / Imaging (Contracted)",
      "Biomedical / Clinical Engineering (Contracted)",
      "Pharmacy Services (Contracted)",
      "Laundry Services (Contracted)",
      "Staffing / Agency Nursing (Contracted)",
      "Rehabilitation / Therapy Services (Contracted)",
      "Telemedicine / Telehealth Services (Contracted)",
      "Anesthesia Services (Contracted)",
      "Wound Care Services (Contracted)",
      "Dialysis Services (Contracted)",
      "Waste Management (Contracted)",
    ],
  },
  cah: {
    label: "Unit / Department",
    units: [
      "Inpatient Nursing",
      "Emergency Department",
      "Surgery / Operating Room",
      "Swing Bed / Long-Term Care",
      "Laboratory (Clinical Lab)",
      "Radiology / Imaging",
      "Pharmacy",
      "Outpatient / Clinic Services",
      "Rehabilitation Services",
      "Medical Records / HIM",
      "Quality & Compliance",
      "Administration",
    ],
    contracted: [
      "Laboratory Services (Contracted)",
      "Radiology / Imaging (Contracted)",
      "Pharmacy Services (Contracted)",
      "Specialty Physician Services (Contracted)",
      "Dialysis Services (Contracted)",
      "Rehabilitation / Therapy – PT/OT/SLP (Contracted)",
      "Dietary / Food Services (Contracted)",
      "Security Services (Contracted)",
      "Environmental / Housekeeping (Contracted)",
      "Telemedicine / Telehealth (Contracted)",
      "Biomedical Engineering (Contracted)",
    ],
  },
  snf: {
    label: "Unit / Department",
    units: [
      "Short-Term Rehabilitation",
      "Long-Term Care",
      "Memory Care / Dementia Unit",
      "Ventilator / Trach Unit",
      "Wound Care",
      "Sub-Acute / Step-Down",
      "Nursing / Patient Care",
      "Therapy – PT / OT / SLP",
      "Social Services",
      "Dietary / Food Services",
      "Activities / Recreational Therapy",
      "MDS / Clinical Reimbursement",
      "Housekeeping / Laundry",
      "Maintenance / Facilities",
      "Medical Records / HIM",
      "Quality & Compliance",
      "Administration",
    ],
    contracted: [
      "Pharmacy Services (Contracted)",
      "Laboratory Services (Contracted)",
      "Radiology / Imaging (Contracted)",
      "Hospice Services (Contracted)",
      "Dental Services (Contracted)",
      "Podiatry Services (Contracted)",
      "Optometry Services (Contracted)",
      "Mental Health / Behavioral Health (Contracted)",
      "Staffing Agency / Registry (Contracted)",
      "Therapy – PT/OT/SLP (Contracted)",
      "Wound Care Services (Contracted)",
      "Dialysis Services (Contracted)",
    ],
  },
  hha: {
    label: "Service / Department",
    units: [
      "Skilled Nursing",
      "Physical Therapy",
      "Occupational Therapy",
      "Speech Therapy",
      "Medical Social Services",
      "Home Health Aide Services",
      "Telehealth / Remote Monitoring",
      "Intake / Admissions",
      "Billing / Coding",
      "Infection Prevention & Control",
      "Quality & Compliance",
      "Administration",
    ],
    contracted: [
      "Therapy Services – PT/OT/SLP (Contracted)",
      "Home Health Aide Services (Contracted)",
      "Infusion Therapy (Contracted)",
      "Wound Care Services (Contracted)",
      "Medical Equipment / DME (Contracted)",
      "Pharmacy Services (Contracted)",
      "Laboratory Services (Contracted)",
      "Telehealth Services (Contracted)",
      "Interpreter / Translation Services (Contracted)",
      "Personal Care Services (Contracted)",
    ],
  },
  hospice: {
    label: "Program / Service Area",
    units: [
      "Skilled Nursing",
      "Medical Social Services",
      "Chaplaincy / Spiritual Care",
      "Volunteer Services",
      "Bereavement Services",
      "Aide Services",
      "Pharmacy",
      "Medical Director / Physician Services",
      "Home Hospice Care",
      "Inpatient Hospice Unit (GIP)",
      "Continuous Home Care",
      "Respite Care",
      "Quality & Compliance",
      "Administration",
    ],
    contracted: [
      "Inpatient Facility / GIP Services (Contracted)",
      "Pharmacy Services (Contracted)",
      "Laboratory Services (Contracted)",
      "Medical Equipment / DME (Contracted)",
      "Therapy Services – PT/OT/SLP (Contracted)",
      "Interpreter / Translation Services (Contracted)",
      "Mental Health / Counseling Services (Contracted)",
      "Ambulance / Transport Services (Contracted)",
      "Respite Facility Services (Contracted)",
    ],
  },
  asc: {
    label: "Area / Department",
    units: [
      "Pre-Operative / Holding Area",
      "Operating Room",
      "Post-Anesthesia Care Unit (PACU)",
      "Endoscopy / GI Lab",
      "Pain Management",
      "Ophthalmology",
      "Orthopedic / Spine",
      "Plastic / Reconstructive Surgery",
      "Central Sterile Processing (SPD)",
      "Radiology / Imaging",
      "Pharmacy",
      "Medical Records / HIM",
      "Quality & Compliance",
      "Administration",
    ],
    contracted: [
      "Anesthesia Services (Contracted)",
      "Pharmacy Services (Contracted)",
      "Laboratory Services (Contracted)",
      "Radiology / Imaging (Contracted)",
      "Biomedical Engineering (Contracted)",
      "Environmental / Housekeeping (Contracted)",
      "Laundry / Linen Services (Contracted)",
      "Dietary / Catering (Contracted)",
      "Staffing / Agency Staff (Contracted)",
      "Sterilization / SPD Services (Contracted)",
      "Medical Waste Disposal (Contracted)",
    ],
  },
  esrd: {
    label: "Area / Department",
    units: [
      "In-Center Hemodialysis",
      "Peritoneal Dialysis Training",
      "Home Hemodialysis Training",
      "Vascular Access Clinic",
      "Nutrition / Dietitian Services",
      "Social Services",
      "Water Treatment / RO System",
      "Medical Records / HIM",
      "Quality & Compliance",
      "Administration",
    ],
    contracted: [
      "Pharmacy / EPO & Medications (Contracted)",
      "Laboratory Services (Contracted)",
      "Vascular Access Surgery (Contracted)",
      "Water Treatment Maintenance (Contracted)",
      "Biomedical / Equipment Services (Contracted)",
      "Dietitian Services (Contracted)",
      "Social Work Services (Contracted)",
      "Transportation / Logistics (Contracted)",
      "Staffing Agency (Contracted)",
      "Waste Disposal (Contracted)",
    ],
  },
  rhc: {
    label: "Service / Department",
    units: [
      "Primary Care / Family Medicine",
      "Pediatrics",
      "Women's Health / OB-GYN",
      "Behavioral Health",
      "Dental Services",
      "Pharmacy",
      "Laboratory / Point-of-Care Testing",
      "Radiology / Imaging",
      "Care Coordination / Case Management",
      "Chronic Disease Management",
      "Quality & Compliance",
      "Administration",
    ],
    contracted: [
      "Laboratory Services (Contracted)",
      "Radiology / Imaging (Contracted)",
      "Pharmacy Services (Contracted)",
      "Behavioral Health Services (Contracted)",
      "Dental Services (Contracted)",
      "Physical / Occupational Therapy (Contracted)",
      "Specialty Physician Services (Contracted)",
      "Telemedicine / Telehealth (Contracted)",
      "Interpreter / Translation Services (Contracted)",
      "Transportation Services (Contracted)",
    ],
  },
  psych: {
    label: "Unit / Program",
    units: [
      "Inpatient Psychiatric Unit – Adult",
      "Inpatient Psychiatric Unit – Adolescent",
      "Inpatient Psychiatric Unit – Geriatric",
      "Partial Hospitalization Program (PHP)",
      "Electroconvulsive Therapy (ECT)",
      "Seclusion / Restraint Management",
      "Medication Management / Pharmacy",
      "Social Work / Discharge Planning",
      "Therapeutic Recreation / Activities",
      "Dietary Services",
      "Medical / Nursing Services",
      "Medical Records / HIM",
      "Quality & Compliance",
      "Administration",
    ],
    contracted: [
      "Psychiatrist / Physician Services (Contracted)",
      "Psychology / Neuropsychology (Contracted)",
      "Laboratory Services (Contracted)",
      "Pharmacy Services (Contracted)",
      "Dietary / Food Services (Contracted)",
      "Security Services (Contracted)",
      "Environmental / Housekeeping (Contracted)",
      "Interpreter / Translation Services (Contracted)",
      "Medical Equipment (Contracted)",
    ],
  },
  ltch: {
    label: "Unit / Department",
    units: [
      "Complex Medical / General",
      "Pulmonary / Ventilator Weaning",
      "Wound Care / Wound Vac",
      "Infectious Disease / Antibiotic Stewardship",
      "Cardiac Management",
      "Neurology / Stroke Recovery",
      "Rehabilitation – PT / OT / SLP",
      "Pharmacy",
      "Laboratory",
      "Radiology / Imaging",
      "Social Work / Discharge Planning",
      "Dietary Services",
      "Medical Records / HIM",
      "Quality & Compliance",
      "Administration",
    ],
    contracted: [
      "Pharmacy Services (Contracted)",
      "Laboratory Services (Contracted)",
      "Radiology / Imaging (Contracted)",
      "Wound Care Services (Contracted)",
      "Rehabilitation Services – PT/OT/SLP (Contracted)",
      "Dietary / Food Services (Contracted)",
      "Environmental / Housekeeping (Contracted)",
      "Biomedical Engineering (Contracted)",
      "Staffing / Agency Nursing (Contracted)",
      "Telemedicine / Telehealth (Contracted)",
    ],
  },
  childrens: {
    label: "Unit / Department",
    units: [
      "Pediatric Medical / Med-Surg",
      "Pediatric ICU (PICU)",
      "Neonatal ICU (NICU)",
      "Pediatric Emergency Department",
      "Pediatric Surgery / OR",
      "Pediatric Oncology / Hematology",
      "Pediatric Neurology",
      "Pediatric Cardiology",
      "Pediatric Behavioral Health / Psychiatry",
      "Child Life Services",
      "Laboratory",
      "Radiology / Imaging",
      "Pharmacy",
      "Rehabilitation – PT / OT / SLP",
      "Medical Records / HIM",
      "Quality & Compliance",
      "Administration",
    ],
    contracted: [
      "Dietary / Food Services (Contracted)",
      "Laboratory Services (Contracted)",
      "Radiology / Imaging (Contracted)",
      "Pharmacy Services (Contracted)",
      "Environmental / Housekeeping (Contracted)",
      "Security Services (Contracted)",
      "Biomedical Engineering (Contracted)",
      "Anesthesia Services (Contracted)",
      "Staffing / Agency Nursing (Contracted)",
      "Telemedicine / Telehealth Services (Contracted)",
    ],
  },
  irf: {
    label: "Program / Department",
    units: [
      "Stroke / Neurological Rehabilitation",
      "Orthopedic Rehabilitation",
      "Brain Injury Rehabilitation",
      "Spinal Cord Injury Rehabilitation",
      "Cardiac Rehabilitation",
      "Amputee / Prosthetics Rehabilitation",
      "Physical Therapy (PT)",
      "Occupational Therapy (OT)",
      "Speech-Language Pathology (SLP)",
      "Therapeutic Recreation",
      "Nursing / Patient Care",
      "Social Work / Discharge Planning",
      "Pharmacy",
      "Dietary Services",
      "Medical Records / HIM",
      "Quality & Compliance",
      "Administration",
    ],
    contracted: [
      "PT / OT / SLP Services (Contracted)",
      "Pharmacy Services (Contracted)",
      "Laboratory Services (Contracted)",
      "Radiology / Imaging (Contracted)",
      "Dietary / Food Services (Contracted)",
      "Prosthetics / Orthotics (Contracted)",
      "Physician / Medical Director (Contracted)",
      "Environmental Services (Contracted)",
      "Biomedical Engineering (Contracted)",
    ],
  },
  fqhc: {
    label: "Service / Department",
    units: [
      "Primary Care / Family Medicine",
      "Pediatrics",
      "Women's Health / OB-GYN",
      "Behavioral Health / Mental Health",
      "Substance Use Disorder (SUD) Services",
      "Dental Services",
      "Pharmacy / Medication Dispensing",
      "Laboratory / Point-of-Care Testing",
      "Radiology / Imaging",
      "Care Coordination / Case Management",
      "HIV / Infectious Disease Clinic",
      "Chronic Disease Management",
      "Enabling Services (Transportation, Interpretation)",
      "Quality & Compliance",
      "Administration",
    ],
    contracted: [
      "Laboratory Services (Contracted)",
      "Radiology / Imaging (Contracted)",
      "Pharmacy Services (Contracted)",
      "Behavioral Health Services (Contracted)",
      "Dental Services (Contracted)",
      "Specialty Physician Services (Contracted)",
      "Interpreter / Translation Services (Contracted)",
      "Telemedicine Services (Contracted)",
      "Transportation Services (Contracted)",
    ],
  },
  corf: {
    label: "Service / Department",
    units: [
      "Physical Therapy (PT)",
      "Occupational Therapy (OT)",
      "Speech-Language Pathology (SLP)",
      "Respiratory Therapy",
      "Social Work Services",
      "Nursing Services",
      "Physician / Medical Director Services",
      "Prosthetics / Orthotics",
      "Medical Records / HIM",
      "Quality & Compliance",
      "Administration",
    ],
    contracted: [
      "PT / OT / SLP Services (Contracted)",
      "Respiratory Therapy (Contracted)",
      "Physician Services (Contracted)",
      "Prosthetics / Orthotics (Contracted)",
      "Laboratory Services (Contracted)",
      "Radiology / Imaging (Contracted)",
      "Medical Equipment / DME (Contracted)",
      "Transportation Services (Contracted)",
    ],
  },
  cmhc: {
    label: "Program / Service",
    units: [
      "Partial Hospitalization Program (PHP)",
      "Intensive Outpatient Program (IOP)",
      "Crisis Stabilization / Emergency Services",
      "Individual / Group Therapy",
      "Medication Management / Psychiatry",
      "Case Management",
      "Social Work Services",
      "Peer Support Services",
      "Substance Use Disorder (SUD) Services",
      "Medical / Nursing Services",
      "Medical Records / HIM",
      "Quality & Compliance",
      "Administration",
    ],
    contracted: [
      "Psychiatrist / Physician Services (Contracted)",
      "Laboratory Services (Contracted)",
      "Pharmacy Services (Contracted)",
      "Peer Support Services (Contracted)",
      "Transportation Services (Contracted)",
      "Crisis Services (Contracted)",
      "Interpreter / Translation Services (Contracted)",
    ],
  },
  opo: {
    label: "Program / Department",
    units: [
      "Donor Referral & Evaluation",
      "Donor Management / Clinical",
      "Organ Procurement / Recovery",
      "Tissue Recovery",
      "Family Support / Donation Coordinators",
      "Transplant Coordination",
      "Laboratory / Serology",
      "Quality & Compliance",
      "Administration",
    ],
    contracted: [
      "Hospital Referral Partners (Contracted)",
      "Laboratory / Serology Services (Contracted)",
      "Transplant Center Coordination (Contracted)",
      "Medical / Surgical Consultants (Contracted)",
      "Tissue Processing (Contracted)",
      "Transportation / Logistics (Contracted)",
    ],
  },
  xray: {
    label: "Service / Area",
    units: [
      "Radiologic Technology / Field Operations",
      "Quality Control / Equipment Maintenance",
      "Medical Director / Physician Oversight",
      "Scheduling & Dispatch",
      "Medical Records / Reporting",
      "Billing & Compliance",
      "Administration",
    ],
    contracted: [
      "Equipment Maintenance (Contracted)",
      "Radiology Interpretation / Teleradiology (Contracted)",
      "Transportation / Vehicle Services (Contracted)",
      "Film / Image Storage Services (Contracted)",
    ],
  },
};

// Key regulatory citations per unit/service — shown instantly when a unit is selected in Inspection tab
const UNIT_CITATIONS = {
  // Hospital clinical units
  "Medical / Med-Surg":            ["§482.23 – Nursing Services","§482.13 – Patient Rights","§482.25 – Pharmaceutical Services","§482.41 – Physical Environment"],
  "Emergency Department (ED)":     ["§482.55 – Emergency Services","§482.13 – Patient Rights","§482.42 – Infection Control","§482.41 – Physical Environment"],
  "Intensive Care Unit (ICU)":     ["§482.23 – Nursing Services","§482.13(e) – Restraint & Seclusion","§482.25 – Pharmaceutical Services","§482.41 – Physical Environment"],
  "Surgery / Operating Room":      ["§482.51 – Surgical Services","§482.52 – Anesthesia Services","§482.42 – Infection Control","§482.41 – Physical Environment"],
  "Labor & Delivery / OB":         ["§482.57 – Obstetric Services","§482.23 – Nursing Services","§482.13 – Patient Rights","§482.42 – Infection Control"],
  "Pediatrics":                    ["§482.23 – Nursing Services","§482.13 – Patient Rights","§482.25 – Pharmaceutical Services","§482.42 – Infection Control"],
  "Neonatal ICU (NICU)":           ["§482.23 – Nursing Services","§482.13 – Patient Rights","§482.42 – Infection Control","§482.41 – Physical Environment"],
  "Psychiatric / Behavioral Health":["§482.13(e) – Restraint & Seclusion","§482.13 – Patient Rights","§482.62 – Psychiatric Distinct Part","§482.23 – Nursing Services"],
  "Oncology":                      ["§482.23 – Nursing Services","§482.25 – Pharmaceutical Services","§482.42 – Infection Control","§482.43 – Discharge Planning"],
  "Cardiac / Telemetry":           ["§482.23 – Nursing Services","§482.41 – Physical Environment","§482.25 – Pharmaceutical Services","§482.21 – QAPI"],
  "Orthopedics":                   ["§482.23 – Nursing Services","§482.51 – Surgical Services","§482.25 – Pharmaceutical Services","§482.42 – Infection Control"],
  "Neurology / Stroke":            ["§482.23 – Nursing Services","§482.13 – Patient Rights","§482.43 – Discharge Planning","§482.25 – Pharmaceutical Services"],
  "Laboratory (Clinical Lab)":     ["§482.27 – Laboratory Services","42 CFR 493 – CLIA","§482.42 – Infection Control","§482.21 – QAPI"],
  "Radiology / Imaging":           ["§482.26 – Radiologic Services","§482.42 – Infection Control","§482.41 – Physical Environment","§482.21 – QAPI"],
  "Pharmacy":                      ["§482.25 – Pharmaceutical Services","§482.42 – Infection Control","§482.21 – QAPI","§482.12 – Governing Body Oversight"],
  "Rehabilitation / Physical Therapy":["§482.56 – Rehabilitation Services","§482.23 – Nursing Services","§482.43 – Discharge Planning","§482.21 – QAPI"],
  "Endoscopy / GI Lab":            ["§482.42 – Infection Control","§482.51 – Surgical Services","§482.41 – Physical Environment","§482.21 – QAPI"],
  "Cardiac Cath Lab":              ["§482.51 – Surgical Services","§482.52 – Anesthesia Services","§482.41 – Physical Environment","§482.42 – Infection Control"],
  "Dialysis / Nephrology":         ["42 CFR 494 – ESRD Conditions","§482.41 – Physical Environment","§482.25 – Pharmaceutical Services","§482.42 – Infection Control"],
  "Wound Care / Infusion":         ["§482.23 – Nursing Services","§482.42 – Infection Control","§482.25 – Pharmaceutical Services","§482.21 – QAPI"],
  "Central Sterile Processing (SPD)":["§482.42 – Infection Control","§482.51 – Surgical Services","§482.41 – Physical Environment","§482.21 – QAPI"],
  "Environmental Services (EVS)":  ["§482.42 – Infection Control","§482.41 – Physical Environment","§482.11 – Federal, State & Local Laws"],
  "Food & Nutrition Services":     ["§482.28 – Food and Dietetic Services","§482.42 – Infection Control","§482.41 – Physical Environment"],
  "Case Management / Social Work": ["§482.43 – Discharge Planning","§482.13 – Patient Rights","§482.21 – QAPI"],
  "Medical Records / HIM":         ["§482.24 – Medical Record Services","§482.13 – Patient Rights","§482.21 – QAPI"],
  "Quality & Compliance":          ["§482.21 – QAPI","§482.13 – Patient Rights","§482.12 – Governing Body","§482.11 – Compliance"],
  "Administration":                ["§482.12 – Governing Body","§482.21 – QAPI","§482.11 – Compliance","§482.13 – Patient Rights"],
  // Hospital contracted services
  "Dietary / Food Services (Contracted)":           ["§482.12(e) – Contracted Services Oversight","§482.28 – Food and Dietetic Services","§482.42 – Infection Control"],
  "Environmental / Housekeeping (Contracted)":      ["§482.12(e) – Contracted Services Oversight","§482.42 – Infection Control","§482.41 – Physical Environment"],
  "Security Services (Contracted)":                 ["§482.12(e) – Contracted Services Oversight","§482.13 – Patient Rights","§482.41 – Physical Environment"],
  "Laboratory Services (Contracted)":               ["§482.12(e) – Contracted Services Oversight","§482.27 – Laboratory Services","42 CFR 493 – CLIA"],
  "Radiology / Imaging (Contracted)":               ["§482.12(e) – Contracted Services Oversight","§482.26 – Radiologic Services"],
  "Biomedical / Clinical Engineering (Contracted)": ["§482.12(e) – Contracted Services Oversight","§482.41 – Physical Environment"],
  "Pharmacy Services (Contracted)":                 ["§482.12(e) – Contracted Services Oversight","§482.25 – Pharmaceutical Services"],
  "Laundry Services (Contracted)":                  ["§482.12(e) – Contracted Services Oversight","§482.42 – Infection Control"],
  "Staffing / Agency Nursing (Contracted)":         ["§482.12(e) – Contracted Services Oversight","§482.23 – Nursing Services","§482.13 – Patient Rights"],
  "Rehabilitation / Therapy Services (Contracted)": ["§482.12(e) – Contracted Services Oversight","§482.56 – Rehabilitation Services"],
  "Telemedicine / Telehealth Services (Contracted)":["§482.12(e) – Contracted Services Oversight","§482.13 – Patient Rights"],
  "Anesthesia Services (Contracted)":               ["§482.12(e) – Contracted Services Oversight","§482.52 – Anesthesia Services"],
  "Wound Care Services (Contracted)":               ["§482.12(e) – Contracted Services Oversight","§482.23 – Nursing","§482.42 – Infection Control"],
  "Dialysis Services (Contracted)":                 ["§482.12(e) – Contracted Services Oversight","42 CFR 494 – ESRD"],
  "Waste Management (Contracted)":                  ["§482.12(e) – Contracted Services Oversight","§482.41 – Physical Environment"],
  // CAH contracted
  "Specialty Physician Services (Contracted)":      ["§485.635(c) – Contracted Services","§485.641 – Medical Staff"],
  "Rehabilitation / Therapy – PT/OT/SLP (Contracted)":["§485.635(c) – Contracted Services","§485.638 – Clinical Records"],
  "Biomedical Engineering (Contracted)":            ["§485.635(c) – Contracted Services","§485.623 – Physical Environment"],
  // SNF units
  "Short-Term Rehabilitation":     ["§483.25 – Quality of Care","§483.30 – Nursing Services","§483.45 – Pharmacy Services","§483.35 – Dietary Services"],
  "Long-Term Care":                ["§483.25 – Quality of Care","§483.10 – Resident Rights","§483.21 – Comprehensive Care Plans","§483.30 – Nursing Services"],
  "Memory Care / Dementia Unit":   ["§483.25(b) – Pain Management","§483.12 – Freedom from Abuse","§483.21 – Care Plans","§483.10 – Resident Rights"],
  "Ventilator / Trach Unit":       ["§483.25 – Quality of Care","§483.30 – Nursing Services","§483.45 – Pharmacy","§483.80 – Infection Control"],
  "Wound Care":                    ["§483.25(b) – Pressure Ulcer Prevention","§483.30 – Nursing Services","§483.80 – Infection Control"],
  "Sub-Acute / Step-Down":         ["§483.25 – Quality of Care","§483.30 – Nursing Services","§483.45 – Pharmacy"],
  "Therapy – PT / OT / SLP":       ["§483.25 – Quality of Care","§483.21 – Comprehensive Care Plans","§483.30 – Nursing Services"],
  "Social Services":               ["§483.40 – Behavioral Health","§483.10 – Resident Rights","§483.21 – Care Planning"],
  "Dietary / Food Services":       ["§483.35 – Food and Nutrition Services","§483.80 – Infection Control","§483.25 – Quality of Care"],
  "Activities / Recreational Therapy":["§483.24 – Quality of Life","§483.10 – Resident Rights"],
  "MDS / Clinical Reimbursement":  ["§483.20 – Resident Assessment","§483.21 – Comprehensive Care Plans"],
  // SNF contracted (Pharmacy Services key omitted here — see INST_UNIT_CITATIONS override)
  "Hospice Services (Contracted)": ["§483.12(e) – Contracted Services","42 CFR 418 – Hospice CoP"],
  "Dental Services (Contracted)":  ["§483.12(e) – Contracted Services","§483.55 – Dental Services"],
  "Podiatry Services (Contracted)":["§483.12(e) – Contracted Services","§483.25 – Quality of Care"],
  "Therapy – PT/OT/SLP (Contracted)":["§483.12(e) – Contracted Services","§483.25 – Quality of Care"],
  // HHA units
  "Skilled Nursing":               ["§484.75 – Skilled Nursing","§484.60 – Care Planning","§484.70 – Coordination of Care","§484.105 – Emergency Preparedness"],
  "Physical Therapy":              ["§484.75 – Skilled Services","§484.60 – Care Planning"],
  "Occupational Therapy":          ["§484.75 – Skilled Services","§484.60 – Care Planning"],
  "Speech Therapy":                ["§484.75 – Skilled Services","§484.60 – Care Planning"],
  "Medical Social Services":       ["§484.75 – Skilled Services","§484.60 – Care Planning","§484.80 – Home Health Aide"],
  "Home Health Aide Services":     ["§484.80 – Home Health Aide Services","§484.60 – Care Planning","§484.36 – Condition of Participation"],
  "Telehealth / Remote Monitoring":["§484.75 – Skilled Services","§484.60 – Care Planning"],
  // HHA contracted
  "Therapy Services – PT/OT/SLP (Contracted)":["§484.105 – Emergency Preparedness","§484.75 – Skilled Services"],
  "Home Health Aide Services (Contracted)":   ["§484.80 – Home Health Aide","§484.60 – Care Planning"],
  "Infusion Therapy (Contracted)":            ["§484.75 – Skilled Services","§484.60 – Care Planning"],
  // Hospice units
  "Medical Director / Physician Services":["§418.62 – Medical Director","§418.56 – IDG Care Planning","§418.52 – Patient Rights"],
  "Home Hospice Care":             ["§418.64 – Core Services","§418.52 – Patient Rights","§418.56 – IDG Care Planning"],
  "Inpatient Hospice Unit (GIP)":  ["§418.108 – Inpatient Care","§418.64 – Core Services","§418.56 – IDG Care Planning"],
  "Continuous Home Care":          ["§418.64 – Core Services","§418.56 – IDG","§418.52 – Patient Rights"],
  "Respite Care":                  ["§418.108 – Inpatient Respite","§418.52 – Patient Rights"],
  "Chaplaincy / Spiritual Care":   ["§418.64(d) – Spiritual Care","§418.52 – Patient Rights"],
  "Volunteer Services":            ["§418.64(g) – Volunteer Services","§418.56 – IDG"],
  "Bereavement Services":          ["§418.64(b) – Bereavement Counseling","§418.56 – IDG Care Planning"],
  // ASC units (use "Endoscopy / GI Lab – ASC" key to avoid duplicate with hospital key)
  "Pre-Operative / Holding Area":  ["§416.42 – Anesthesia Services","§416.52 – Patient Rights","§416.44 – Environment"],
  "Operating Room":                ["§416.42 – Surgical Services","§416.44 – Environment","§416.45 – Medical Staff"],
  "Post-Anesthesia Care Unit (PACU)":["§416.42 – Anesthesia","§416.44 – Environment","§416.52 – Patient Rights"],
  "Endoscopy / GI Lab – ASC":      ["§416.44 – Environment / Infection Control","§416.42 – Surgical Services"],
  // ESRD units
  "In-Center Hemodialysis":        ["§494.30 – Patient Rights","§494.80 – Patient Assessment","§494.90 – Care Planning","§494.100 – QAPI"],
  "Peritoneal Dialysis Training":  ["§494.80 – Patient Assessment","§494.90 – Care Planning","§494.30 – Patient Rights"],
  "Home Hemodialysis Training":    ["§494.80 – Assessment","§494.90 – Care Planning","§494.60 – Physical Environment"],
  "Water Treatment / RO System":   ["§494.40 – Water Treatment","§494.60 – Physical Environment"],
  "Vascular Access Clinic":        ["§494.80 – Patient Assessment","§494.90 – Care Planning"],
  // Generic shared units (used across multiple institution types; institution-specific overrides in INST_UNIT_CITATIONS)
  "Laboratory":                         ["§482.27 – Laboratory Services","42 CFR 493 – CLIA","§482.42 – Infection Control"],
  "Dietary Services":                   ["§482.28 – Food and Dietetic Services","§482.42 – Infection Control","§482.41 – Physical Environment"],
  "Nursing / Patient Care":             ["§482.23 – Nursing Services","§482.13 – Patient Rights","§482.25 – Pharmaceutical Services"],
  "Social Work / Discharge Planning":   ["§482.43 – Discharge Planning","§482.13 – Patient Rights","§482.21 – QAPI"],
  "Laboratory / Point-of-Care Testing": ["§491.9 – Clinical Records","§491.11 – Infection Control","42 CFR 493 – CLIA"],
  "Dental Services":                    ["§491.9 – Clinical Records","§491.10 – Patient Rights"],
  "Pharmacy / Medication Dispensing":   ["§405.2428 – FQHC Services","§405.2415 – Staffing"],
  "Case Management":                    ["§485.906 – CMHC Services","§485.910 – Patient Rights"],
  "Medical / Nursing Services":         ["§485.906 – CMHC Services","§485.904 – CMHC Conditions","§485.910 – Patient Rights"],
  // RHC units
  "Primary Care / Family Medicine":["§491.9 – Clinical Records","§491.10 – Patient Rights","§491.11 – Infection Control","§491.7 – Staffing"],
  "Women's Health / OB-GYN":       ["§491.9 – Clinical Records","§491.10 – Patient Rights","§491.11 – Infection Control"],
  "Behavioral Health":             ["§491.9 – Clinical Records","§491.10 – Patient Rights"],
  "Chronic Disease Management":    ["§491.9 – Clinical Records","§491.10 – Patient Rights","§491.7 – Staffing"],
  "Care Coordination / Case Management":["§491.9 – Clinical Records","§491.10 – Patient Rights"],
  // Psychiatric Hospital units
  "Inpatient Psychiatric Unit – Adult":     ["§482.60 – Psych Distinct Part","§482.61 – Condition of Participation","§482.13(e) – Restraint & Seclusion","§482.62 – Medical Staff"],
  "Inpatient Psychiatric Unit – Adolescent":["§482.60 – Psych Distinct Part","§482.61 – Condition of Participation","§482.13(e) – Restraint & Seclusion","§482.13 – Patient Rights"],
  "Inpatient Psychiatric Unit – Geriatric": ["§482.60 – Psych Distinct Part","§482.61 – Condition of Participation","§482.13 – Patient Rights","§482.62 – Medical Staff"],
  "Partial Hospitalization Program (PHP)":  ["§482.60 – Psych Distinct Part","§482.61 – Condition of Participation","§482.13 – Patient Rights"],
  "Electroconvulsive Therapy (ECT)":        ["§482.13(e) – Restraint & Seclusion","§482.62 – Medical Staff","§482.60 – Special Medical Record Requirements"],
  "Seclusion / Restraint Management":       ["§482.13(e) – Restraint & Seclusion","§482.62 – Medical Staff","§482.60 – Psych Distinct Part"],
  "Medication Management / Pharmacy":       ["§482.61 – Condition of Participation","§482.62 – Medical Staff","§482.25 – Pharmaceutical Services"],
  "Therapeutic Recreation / Activities":    ["§482.60 – Psych Distinct Part","§482.61 – Condition of Participation"],
  // LTCH units
  "Complex Medical / General":              ["§482.23 – Nursing Services","§482.25 – Pharmaceutical Services","§482.21 – QAPI","§482.42 – Infection Control"],
  "Pulmonary / Ventilator Weaning":         ["§482.23 – Nursing Services","§482.25 – Pharmaceutical Services","§482.42 – Infection Control","§482.41 – Physical Environment"],
  "Wound Care / Wound Vac":                 ["§482.23 – Nursing Services","§482.42 – Infection Control","§482.25 – Pharmaceutical Services","§482.21 – QAPI"],
  "Infectious Disease / Antibiotic Stewardship":["§482.42 – Infection Control","§482.25 – Pharmaceutical Services","§482.21 – QAPI","§482.23 – Nursing Services"],
  "Cardiac Management":                     ["§482.23 – Nursing Services","§482.25 – Pharmaceutical Services","§482.21 – QAPI","§482.41 – Physical Environment"],
  "Neurology / Stroke Recovery":            ["§482.23 – Nursing Services","§482.43 – Discharge Planning","§482.25 – Pharmaceutical Services","§482.21 – QAPI"],
  "Rehabilitation – PT / OT / SLP":        ["§482.56 – Rehabilitation Services","§482.23 – Nursing Services","§482.43 – Discharge Planning","§482.21 – QAPI"],
  // Children's Hospital units
  "Pediatric Medical / Med-Surg":           ["§482.23 – Nursing Services","§482.13 – Patient Rights","§482.25 – Pharmaceutical Services","§482.42 – Infection Control"],
  "Pediatric ICU (PICU)":                   ["§482.23 – Nursing Services","§482.13(e) – Restraint & Seclusion","§482.25 – Pharmaceutical Services","§482.42 – Infection Control"],
  "Pediatric Emergency Department":         ["§482.55 – Emergency Services","§482.13 – Patient Rights","§482.42 – Infection Control","§482.41 – Physical Environment"],
  "Pediatric Surgery / OR":                 ["§482.51 – Surgical Services","§482.52 – Anesthesia Services","§482.42 – Infection Control","§482.41 – Physical Environment"],
  "Pediatric Oncology / Hematology":        ["§482.23 – Nursing Services","§482.25 – Pharmaceutical Services","§482.42 – Infection Control","§482.43 – Discharge Planning"],
  "Pediatric Neurology":                    ["§482.23 – Nursing Services","§482.13 – Patient Rights","§482.43 – Discharge Planning","§482.25 – Pharmaceutical Services"],
  "Pediatric Cardiology":                   ["§482.23 – Nursing Services","§482.41 – Physical Environment","§482.25 – Pharmaceutical Services","§482.21 – QAPI"],
  "Pediatric Behavioral Health / Psychiatry":["§482.13(e) – Restraint & Seclusion","§482.62 – Psychiatric Distinct Part","§482.13 – Patient Rights","§482.23 – Nursing Services"],
  "Child Life Services":                    ["§482.13 – Patient Rights","§482.23 – Nursing Services","§482.21 – QAPI"],
  // IRF units
  "Stroke / Neurological Rehabilitation":   ["§412.622 – IRF Coverage Criteria","§412.604 – Conditions of Participation","§412.29 – Physician Requirements","§412.622(a)(3) – Rehabilitation Intensity"],
  "Orthopedic Rehabilitation":              ["§412.622 – IRF Coverage Criteria","§412.604 – IRF CoP","§412.29 – Physician Requirements"],
  "Brain Injury Rehabilitation":            ["§412.622 – IRF Coverage Criteria","§412.604 – IRF CoP","§412.622(a)(3) – Rehabilitation Intensity"],
  "Spinal Cord Injury Rehabilitation":      ["§412.622 – IRF Coverage Criteria","§412.604 – IRF CoP","§412.29 – Physician Requirements"],
  "Cardiac Rehabilitation":                 ["§412.622 – IRF Coverage Criteria","§412.604 – IRF CoP","§412.29 – Physician Requirements"],
  "Amputee / Prosthetics Rehabilitation":   ["§412.622 – IRF Coverage Criteria","§412.604 – IRF CoP","§412.622(a)(3) – Rehabilitation Intensity"],
  "Physical Therapy (PT)":                  ["§412.622 – IRF Coverage Criteria","§412.604 – IRF CoP","§485.70 – CORF PT Services"],
  "Occupational Therapy (OT)":              ["§412.622 – IRF Coverage Criteria","§412.604 – IRF CoP","§485.70 – CORF OT Services"],
  "Speech-Language Pathology (SLP)":        ["§412.622 – IRF Coverage Criteria","§412.604 – IRF CoP","§485.70 – CORF SLP Services"],
  "Therapeutic Recreation":                 ["§412.604 – IRF CoP","§412.622 – Coverage Criteria"],
  // FQHC units
  "Behavioral Health / Mental Health":      ["§405.2428 – FQHC Services","§405.2415 – Staffing","§405.2462 – Patient Rights"],
  "Substance Use Disorder (SUD) Services":  ["§405.2428 – FQHC Services","§405.2415 – Staffing","§405.2462 – Patient Rights"],
  "HIV / Infectious Disease Clinic":        ["§405.2428 – FQHC Services","§405.2462 – Patient Rights","§405.2415 – Staffing"],
  "Enabling Services (Transportation, Interpretation)":["§405.2428 – FQHC Services","§405.2462 – Patient Rights"],
  // CORF units
  "Respiratory Therapy":                    ["§485.58 – CORF Conditions","§485.70 – Personnel Qualifications","§485.60 – Patient Rights"],
  "Social Work Services":                   ["§485.58 – CORF Conditions","§485.70 – Personnel Qualifications","§485.60 – Patient Rights"],
  "Nursing Services":                       ["§485.58 – CORF Conditions","§485.60 – Patient Rights","§485.70 – Personnel"],
  "Physician / Medical Director Services":  ["§485.58 – CORF Conditions","§485.56 – Compliance with Federal, State & Local Laws"],
  "Prosthetics / Orthotics":               ["§485.58 – CORF Conditions","§485.70 – Personnel Qualifications"],
  // CMHC units
  "Partial Hospitalization Program (PHP) – CMHC":["§485.904 – CMHC PHP","§485.906 – Services","§485.918 – Quality Assessment & PI","§485.910 – Patient Rights"],
  "Intensive Outpatient Program (IOP)":     ["§485.904 – CMHC Conditions","§485.906 – Services","§485.910 – Patient Rights"],
  "Crisis Stabilization / Emergency Services":["§485.904 – CMHC Conditions","§485.910 – Patient Rights","§485.918 – QAPI"],
  "Individual / Group Therapy":             ["§485.906 – Services","§485.910 – Patient Rights","§485.904 – CMHC Conditions"],
  "Medication Management / Psychiatry":     ["§485.906 – Services","§485.904 – CMHC Conditions","§485.910 – Patient Rights"],
  "Peer Support Services":                  ["§485.906 – Services","§485.910 – Patient Rights"],
  // OPO units
  "Donor Referral & Evaluation":            ["§486.322 – Donor Suitability","§486.324 – Procurement & Allocation","§486.344 – QAPI"],
  "Donor Management / Clinical":            ["§486.322 – Donor Suitability","§486.330 – Organ Procurement","§486.344 – QAPI"],
  "Organ Procurement / Recovery":           ["§486.330 – Organ Procurement","§486.342 – Transplant Program Relationships","§486.344 – QAPI"],
  "Tissue Recovery":                        ["§486.330 – Organ Procurement","§486.344 – QAPI","§486.322 – Donor Suitability"],
  "Family Support / Donation Coordinators": ["§486.322 – Donor Suitability","§486.316 – Administrative Requirements","§486.344 – QAPI"],
  "Transplant Coordination":                ["§486.342 – Transplant Program Relationships","§486.344 – QAPI","§486.330 – Organ Procurement"],
  "Laboratory / Serology":                  ["§486.322 – Donor Suitability","§486.344 – QAPI","42 CFR 493 – CLIA"],
  // Portable X-Ray units
  "Radiologic Technology / Field Operations":["§486.106 – Standards for Radiologic Technology","§486.110 – Conditions for Suppliers","§486.100 – Basis and Purpose"],
  "Quality Control / Equipment Maintenance": ["§486.106 – Standards for Radiologic Technology","§486.110 – Conditions for Suppliers"],
  "Medical Director / Physician Oversight":  ["§486.106 – Standards for Radiologic Technology","§486.110 – Conditions for Suppliers"],
  "Scheduling & Dispatch":                   ["§486.110 – Conditions for Suppliers","§486.106 – Standards"],
  "Medical Records / Reporting":             ["§486.106 – Standards for Radiologic Technology","§486.110 – Conditions for Suppliers"],
  "Billing & Compliance":                    ["§486.110 – Conditions for Suppliers","§486.100 – Basis and Purpose"],
};

// Institution-specific citation overrides (used when the same unit name maps to different CFR sections)
const INST_UNIT_CITATIONS = {
  snf: {
    "Pharmacy Services (Contracted)": ["§483.12(e) – Contracted Services","§483.45 – Pharmacy Services"],
    "Wound Care": ["§483.25(b) – Pressure Ulcer Prevention","§483.30 – Nursing Services","§483.80 – Infection Control"],
    "Dietary / Food Services": ["§483.35 – Food and Nutrition Services","§483.80 – Infection Control","§483.25 – Quality of Care"],
  },
  asc: {
    "Endoscopy / GI Lab": ["§416.44 – Environment / Infection Control","§416.42 – Surgical Services"],
    "Central Sterile Processing (SPD)": ["§416.44 – Environment (Infection Control)","§416.42 – Surgical Services"],
    "Pharmacy": ["§416.42 – Drug Handling","§416.44 – Environment"],
  },
  cah: {
    "Pharmacy": ["§485.635(c)(3) – Drugs & Biologicals","§485.623 – Physical Environment"],
    "Laboratory (Clinical Lab)": ["§485.635(b) – Laboratory","42 CFR 493 – CLIA"],
  },
  corf: {
    "Physical Therapy (PT)":         ["§485.58 – CORF Conditions","§485.70 – Personnel Qualifications","§485.60 – Patient Rights"],
    "Occupational Therapy (OT)":     ["§485.58 – CORF Conditions","§485.70 – Personnel Qualifications","§485.60 – Patient Rights"],
    "Speech-Language Pathology (SLP)":["§485.58 – CORF Conditions","§485.70 – Personnel Qualifications","§485.60 – Patient Rights"],
    "Social Work Services":          ["§485.58 – CORF Conditions","§485.70 – Personnel Qualifications","§485.60 – Patient Rights"],
    "Nursing Services":              ["§485.58 – CORF Conditions","§485.60 – Patient Rights","§485.70 – Personnel"],
    "Physician / Medical Director Services":["§485.58 – CORF Conditions","§485.56 – Compliance with Federal, State & Local Laws"],
    "Prosthetics / Orthotics":       ["§485.58 – CORF Conditions","§485.70 – Personnel Qualifications"],
    "Respiratory Therapy":           ["§485.58 – CORF Conditions","§485.70 – Personnel Qualifications","§485.60 – Patient Rights"],
    "Dietary Services":              ["§485.58 – CORF Conditions","§485.60 – Patient Rights"],
    "Laboratory":                    ["§485.58 – CORF Conditions","42 CFR 493 – CLIA"],
  },
  cmhc: {
    "Partial Hospitalization Program (PHP)": ["§485.904 – CMHC Conditions","§485.906 – Services","§485.918 – Quality Assessment & PI","§485.910 – Patient Rights"],
    "Social Work Services":          ["§485.906 – CMHC Services","§485.910 – Patient Rights","§485.904 – CMHC Conditions"],
    "Substance Use Disorder (SUD) Services":["§485.906 – CMHC Services","§485.904 – CMHC Conditions","§485.910 – Patient Rights"],
    "Dietary Services":              ["§485.906 – CMHC Services","§485.910 – Patient Rights"],
    "Laboratory":                    ["§485.906 – CMHC Services","42 CFR 493 – CLIA"],
    "Nursing / Patient Care":        ["§485.906 – CMHC Services","§485.904 – CMHC Conditions","§485.910 – Patient Rights"],
  },
  fqhc: {
    "Primary Care / Family Medicine":["§405.2428 – FQHC Services","§405.2415 – Staffing","§405.2462 – Patient Rights"],
    "Women's Health / OB-GYN":       ["§405.2428 – FQHC Services","§405.2415 – Staffing","§405.2462 – Patient Rights"],
    "Pediatrics":                    ["§405.2428 – FQHC Services","§405.2415 – Staffing","§405.2462 – Patient Rights"],
    "Dental Services":               ["§405.2428 – FQHC Services","§405.2415 – Staffing"],
    "Chronic Disease Management":    ["§405.2428 – FQHC Services","§405.2462 – Patient Rights","§405.2415 – Staffing"],
    "Care Coordination / Case Management":["§405.2428 – FQHC Services","§405.2462 – Patient Rights"],
    "Behavioral Health":             ["§405.2428 – FQHC Services","§405.2415 – Staffing","§405.2462 – Patient Rights"],
    "Laboratory / Point-of-Care Testing":["§405.2428 – FQHC Services","42 CFR 493 – CLIA","§405.2415 – Staffing"],
    "Laboratory":                    ["§405.2428 – FQHC Services","42 CFR 493 – CLIA"],
    "Dietary Services":              ["§405.2428 – FQHC Services","§405.2415 – Staffing"],
    "Nursing / Patient Care":        ["§405.2428 – FQHC Services","§405.2415 – Staffing","§405.2462 – Patient Rights"],
    "Social Work / Discharge Planning":["§405.2428 – FQHC Services","§405.2462 – Patient Rights"],
  },
  irf: {
    "Dietary Services":              ["§482.28 – Food and Dietetic Services","§412.604 – IRF CoP","§482.42 – Infection Control"],
    "Nursing / Patient Care":        ["§412.604 – IRF CoP","§412.622 – Coverage Criteria","§482.23 – Nursing Services"],
    "Social Work / Discharge Planning":["§412.622(b) – Discharge Planning","§412.604 – IRF CoP","§482.43 – Discharge Planning"],
    "Laboratory":                    ["§482.27 – Laboratory Services","42 CFR 493 – CLIA","§412.604 – IRF CoP"],
    "Pharmacy":                      ["§412.604 – IRF CoP","§482.25 – Pharmaceutical Services"],
  },
  psych: {
    "Pharmacy":                      ["§482.61 – Condition of Participation","§482.62 – Medical Staff","§482.25 – Pharmaceutical Services"],
    "Dietary Services":              ["§482.61 – Condition of Participation","§482.60 – Medical Record Requirements","§482.28 – Food Services"],
    "Social Work / Discharge Planning":["§482.61 – Condition of Participation","§482.60 – Psych Distinct Part","§482.13 – Patient Rights"],
    "Medical Records / HIM":         ["§482.61 – Condition of Participation","§482.60 – Special Medical Record Requirements","§482.24 – Medical Record Services"],
    "Quality & Compliance":          ["§482.60 – Psych Distinct Part","§482.61 – Condition of Participation","§482.21 – QAPI"],
    "Administration":                ["§482.60 – Psych Distinct Part","§482.61 – Condition of Participation","§482.12 – Governing Body"],
    "Laboratory":                    ["§482.61 – Condition of Participation","§482.27 – Laboratory Services","42 CFR 493 – CLIA"],
    "Nursing / Patient Care":        ["§482.61 – Condition of Participation","§482.23 – Nursing Services","§482.13 – Patient Rights","§482.13(e) – Restraint & Seclusion"],
  },
  ltch: {
    "Laboratory":                    ["§482.27 – Laboratory Services","42 CFR 493 – CLIA","§482.42 – Infection Control"],
    "Dietary Services":              ["§482.28 – Food and Dietetic Services","§482.42 – Infection Control","§482.41 – Physical Environment"],
    "Social Work / Discharge Planning":["§482.43 – Discharge Planning","§482.13 – Patient Rights","§482.21 – QAPI"],
    "Nursing / Patient Care":        ["§482.23 – Nursing Services","§482.13 – Patient Rights","§482.25 – Pharmaceutical Services"],
  },
  childrens: {
    "Laboratory":                    ["§482.27 – Laboratory Services","42 CFR 493 – CLIA","§482.42 – Infection Control"],
    "Dietary Services":              ["§482.28 – Food and Dietetic Services","§482.42 – Infection Control","§482.13 – Patient Rights"],
    "Nursing / Patient Care":        ["§482.23 – Nursing Services","§482.13 – Patient Rights","§482.25 – Pharmaceutical Services"],
    "Social Work / Discharge Planning":["§482.43 – Discharge Planning","§482.13 – Patient Rights","§482.21 – QAPI"],
  },
  xray: {
    "Dietary Services":              ["§486.110 – Conditions for Suppliers"],
    "Laboratory":                    ["§486.106 – Standards","42 CFR 493 – CLIA"],
  },
};

function getUnitCitations(institution, unit) {
  return INST_UNIT_CITATIONS[institution]?.[unit] || UNIT_CITATIONS[unit] || [];
}

// Regulatory body display config
const BODIES = [
  { key: "cms",  label: "CMS Conditions of Participation", color: "#1E40AF", bg: "#EFF6FF" },
  { key: "tjc",  label: "Joint Commission",                color: "#5B21B6", bg: "#F5F3FF" },
  { key: "dnv",  label: "DNV NIAHO",                       color: "#065F46", bg: "#ECFDF5" },
  { key: "iso",  label: "ISO 9001:2015",                   color: "#92400E", bg: "#FFFBEB" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function repairJson(raw) {
  const s = raw.replace(/```json\n?|```/g, "").trim();
  try { return JSON.parse(s); } catch {}

  const stack = [];
  let inStr = false, esc = false, lastSafe = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (esc) { esc = false; continue; }
    if (c === "\\" && inStr) { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === "{" || c === "[") stack.push(c === "{" ? "}" : "]");
    else if (c === "}" || c === "]") { stack.pop(); if (!stack.length) lastSafe = i + 1; }
  }

  const close = stack.slice().reverse().join("");
  const stripped = s
    .replace(/,\s*"[^"]*"\s*:\s*(?:"[^"]*)?$/, "")
    .replace(/,\s*"[^"]*"\s*:?\s*$/, "");
  try { return JSON.parse(stripped + close); } catch {}
  if (lastSafe > 0) { try { return JSON.parse(s.slice(0, lastSafe)); } catch {} }
  throw new Error("Response was not valid JSON — please try again");
}

async function callApi(systemPrompt, userContent, maxTokens) {
  const startRes = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ systemPrompt, userContent, maxTokens }),
  });
  if (!startRes.ok) {
    const err = await startRes.json().catch(() => ({}));
    throw new Error(err.error || `Server error (${startRes.status})`);
  }
  const { jobId } = await startRes.json();
  if (!jobId) throw new Error("Server did not return a job ID");

  for (let i = 0; i < 90; i++) {
    await sleep(2000);
    const poll = await fetch(`/api/generate/result?jobId=${jobId}`);
    const job = await poll.json();
    if (job.status === "error") throw new Error(job.error);
    if (job.status === "done") return job.content?.[0]?.text ?? "";
  }
  throw new Error("Request timed out — please try again");
}

/** Like callApi but passes institutionValue so the server can pre-fetch live eCFR text.
 *  Returns { text, dataSource } where dataSource is { kind: "ecfr", fetchDate } or { kind: "ai" }. */
async function callApiWithSource(systemPrompt, userContent, maxTokens, institutionValue) {
  const startRes = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ systemPrompt, userContent, maxTokens, institutionValue }),
  });
  if (!startRes.ok) {
    const err = await startRes.json().catch(() => ({}));
    throw new Error(err.error || `Server error (${startRes.status})`);
  }
  const { jobId } = await startRes.json();
  if (!jobId) throw new Error("Server did not return a job ID");

  for (let i = 0; i < 90; i++) {
    await sleep(2000);
    const poll = await fetch(`/api/generate/result?jobId=${jobId}`);
    const job = await poll.json();
    if (job.status === "error") throw new Error(job.error);
    if (job.status === "done") {
      return {
        text: job.content?.[0]?.text ?? "",
        dataSource: job.dataSource ?? { kind: "ai" },
      };
    }
  }
  throw new Error("Request timed out — please try again");
}

// ─── Excel helpers ────────────────────────────────────────────────────────────

async function downloadXlsx(sheets, filename) {
  const workbook = new ExcelJS.Workbook();

  sheets.forEach(({ name, rows }) => {
    const worksheet = workbook.addWorksheet(name.slice(0, 31));
    const keys = Object.keys(rows[0] || {});
    worksheet.columns = keys.map((key) => ({
      header: key,
      key,
      width: Math.max(key.length, ...rows.map((row) => String(row[key] ?? "").length)) + 2,
    }));
    worksheet.addRows(rows);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function exportGuidelinesXlsx(result, inst, topic) {
  const rows = [];
  result.sources?.forEach((src) => {
    src.standards?.forEach((std) => {
      rows.push({
        "Regulatory Body": src.body,
        "CFR / Reference": src.cfr || "",
        "Standard Code": std.code || "",
        "Tag": std.tag || "",
        "Title": std.title || "",
        "Requirement": std.requirement || "",
        "Surveyor Focus": std.surveyorFocus || "",
      });
    });
  });
  const overview = [{ "Overview": result.overview || "" }];
  downloadXlsx(
    [{ name: "Standards", rows }, { name: "Overview", rows: overview }],
    `${inst.label.replace(/\s+/g, "_")}_${topic.replace(/\s+/g, "_")}_Guidelines.xlsx`,
  );
}

function exportPolicyXlsx(text, inst, topic) {
  // Split the policy text into sections by all-caps headings
  const lines = text.split("\n");
  const rows = lines.map((line) => ({ "Policy Content": line }));
  downloadXlsx(
    [{ name: "Policy Template", rows }],
    `${inst.label.replace(/\s+/g, "_")}_${topic.replace(/\s+/g, "_")}_Policy.xlsx`,
  );
}

function exportInspectionXlsx(items, responses, inst, dept, notes = {}, flags = {}) {
  const rows = items.map((item) => ({
    "#": item.id,
    "Flagged": flags[item.id] ? "🚩 Yes" : "",
    "Risk Level": item.riskLevel || "",
    "Area": item.area || "",
    "Surveyor Question": item.question || "",
    "Regulatory Basis": item.regulatoryBasis || "",
    "Common Deficiency": item.commonDeficiency || "",
    "Recommendation": item.recommendation || "",
    "Self-Assessment": responses[item.id] === "yes" ? "Ready" : responses[item.id] === "no" ? "Gap" : responses[item.id] === "na" ? "N/A" : "Not Assessed",
    "Notes": notes[item.id] || "",
  }));
  downloadXlsx(
    [{ name: "Checklist", rows }],
    `${inst.label.replace(/\s+/g, "_")}_${dept.replace(/\s+/g, "_")}_Inspection.xlsx`,
  );
}

// Plain-text summary of inspection checklist for clipboard
function inspectionToText(items, responses, inst, dept, notes = {}, flags = {}) {
  const lines = [
    `INSPECTION READINESS CHECKLIST`,
    `Institution: ${inst.label} (${inst.cfr})`,
    `Department: ${dept}`,
    `Generated: ${new Date().toLocaleDateString()}`,
    "",
  ];
  items.forEach((item, i) => {
    const flagged = flags[item.id] ? " 🚩 FLAGGED FOR FOLLOW-UP" : "";
    lines.push(`${i + 1}. [${item.riskLevel} Risk] ${item.area}${flagged}`);
    lines.push(`   Q: ${item.question}`);
    lines.push(`   Regulatory Basis: ${item.regulatoryBasis || "—"}`);
    lines.push(`   Common Deficiency: ${item.commonDeficiency || "—"}`);
    lines.push(`   Recommendation: ${item.recommendation || "—"}`);
    const resp = responses[item.id];
    if (resp) lines.push(`   Self-Assessment: ${resp === "yes" ? "Ready" : resp === "no" ? "Gap" : "N/A"}`);
    if (notes[item.id]) lines.push(`   Notes: ${notes[item.id]}`);
    lines.push("");
  });
  return lines.join("\n");
}

// ─── PDF.js loader (CDN, no extra package needed) ────────────────────────────

async function extractTextFromPdf(file) {
  const pdfjsLib = await new Promise((resolve, reject) => {
    if (window.pdfjsLib) { resolve(window.pdfjsLib); return; }
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    script.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      resolve(window.pdfjsLib);
    };
    script.onerror = () => reject(new Error("Failed to load PDF.js"));
    document.head.appendChild(script);
  });

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    pages.push(content.items.map((i) => i.str).join(" "));
  }
  return pages.join("\n");
}

async function extractTextFromFile(file) {
  if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
    return extractTextFromPdf(file);
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

// ─── Long-document chunking helpers ──────────────────────────────────────────

const CHUNK_SIZE = 28000; // chars per chunk (~7k tokens); covers most single policies
const MAX_CHUNKS = 4;     // cap at 4 chunks (~112k chars total)

function chunkText(text) {
  if (text.length <= CHUNK_SIZE) return [text];
  const chunks = [];
  let start = 0;
  while (start < text.length && chunks.length < MAX_CHUNKS) {
    let end = start + CHUNK_SIZE;
    if (end < text.length) {
      // Prefer splitting at a paragraph break so context isn't mid-sentence
      const lastPara = text.lastIndexOf("\n\n", end);
      const lastLine = text.lastIndexOf("\n", end);
      if (lastPara > start + CHUNK_SIZE * 0.5) end = lastPara;
      else if (lastLine > start + CHUNK_SIZE * 0.5) end = lastLine;
    }
    chunks.push(text.slice(start, end).trim());
    start = end;
  }
  return chunks;
}

function mergeGapResults(results) {
  const scores = results.map((r) => r.score).filter((s) => s != null);
  const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

  const parts = results.map((r, i) => `Section ${i + 1}: ${r.summary}`).join(" | ");
  const summary = results.length === 1 ? results[0].summary : parts;

  function dedup(key) {
    const seen = new Set();
    return results.flatMap((r) => r[key] || []).filter((item) => {
      if (seen.has(item.code)) return false;
      seen.add(item.code);
      return true;
    });
  }

  return { score: avgScore, summary, met: dedup("met"), weak: dedup("weak"), missing: dedup("missing") };
}

// ─── Ephemeral policy-analysis session ────────────────────────────────────────

const LEGACY_GAP_HISTORY_KEY = "cop_gap_analysis_history";
const GAP_SESSION_KEY = "cms_ephemeral_policy_session";
const GAP_SESSION_OWNER_KEY = "cms_ephemeral_policy_session_owner";
const ACTIVE_WORKSPACE_TAB_KEY = "cms_active_workspace_tab";
const GAP_SESSION_TTL_MS = 30 * 60 * 1000;
const GAP_HISTORY_MAX = 10;

function loadGapSession() {
  try {
    // Remove results created by older releases that used permanent browser storage.
    localStorage.removeItem(LEGACY_GAP_HISTORY_KEY);
    const raw = sessionStorage.getItem(GAP_SESSION_KEY);
    if (!raw) return {};
    const session = JSON.parse(raw);
    if (!session.expiresAt || session.expiresAt <= Date.now()) {
      sessionStorage.removeItem(GAP_SESSION_KEY);
      return {};
    }
    return session;
  } catch {
    try { sessionStorage.removeItem(GAP_SESSION_KEY); } catch {}
    return {};
  }
}

function saveGapSession(patch) {
  try {
    const current = loadGapSession();
    const next = { ...current, ...patch, expiresAt: Date.now() + GAP_SESSION_TTL_MS };
    sessionStorage.setItem(GAP_SESSION_KEY, JSON.stringify(next));
    return next;
  } catch {
    return {};
  }
}

function loadGapHistory() {
  const history = loadGapSession().history;
  return Array.isArray(history) ? history : [];
}

function saveGapEntry(entry) {
  try {
    const existing = loadGapHistory();
    const updated = [entry, ...existing].slice(0, GAP_HISTORY_MAX);
    saveGapSession({ history: updated });
    return updated;
  } catch {
    return [];
  }
}

function deleteGapEntry(id) {
  try {
    const existing = loadGapHistory();
    const updated = existing.filter((e) => e.id !== id);
    saveGapSession({ history: updated });
    return updated;
  } catch {
    return [];
  }
}

export async function purgeEphemeralPolicySession() {
  try {
    sessionStorage.removeItem(GAP_SESSION_KEY);
    sessionStorage.removeItem(GAP_SESSION_OWNER_KEY);
    sessionStorage.removeItem(ACTIVE_WORKSPACE_TAB_KEY);
    localStorage.removeItem(LEGACY_GAP_HISTORY_KEY);
  } catch {
    // Storage may be unavailable in restricted browser contexts.
  }
  try {
    await fetch("/api/generate/session", { method: "DELETE", credentials: "include" });
  } catch {
    // Server-side jobs also have an automatic expiry safety limit.
  }
}

export function bindEphemeralPolicySessionToUser(ownerId) {
  if (!ownerId) return;
  try {
    const existingOwnerId = sessionStorage.getItem(GAP_SESSION_OWNER_KEY);
    if (existingOwnerId !== ownerId) {
      sessionStorage.removeItem(GAP_SESSION_KEY);
      sessionStorage.removeItem(ACTIVE_WORKSPACE_TAB_KEY);
      localStorage.removeItem(LEGACY_GAP_HISTORY_KEY);
    }
    sessionStorage.setItem(GAP_SESSION_OWNER_KEY, ownerId);
  } catch {
    // Storage may be unavailable in restricted browser contexts.
  }
}

// ─── Gap Scanner helpers ──────────────────────────────────────────────────────

function exportGapXlsx(result, inst, topic) {
  const rows = [];
  const statusMap = { met: "✅ Met", weak: "⚠️ Weak/Partial", missing: "❌ Missing" };
  ["met", "weak", "missing"].forEach((status) => {
    (result[status] || []).forEach((item) => {
      rows.push({
        "Status": statusMap[status],
        "Regulatory Body": item.body || "",
        "Code / Reference": item.code || "",
        "Requirement Title": item.title || "",
        "Finding": item.finding || "",
        "Recommended Fix": item.recommendation || "",
      });
    });
  });
  downloadXlsx(
    [{ name: "Gap Analysis", rows }],
    `${inst.label.replace(/\s+/g, "_")}_${(topic || "Policy").replace(/\s+/g, "_")}_GapAnalysis.xlsx`,
  );
}

function gapToText(result, inst, topic) {
  const lines = [
    `POLICY COMPLIANCE GAP ANALYSIS`,
    `Institution: ${inst.label} (${inst.cfr})`,
    `Topic: ${topic || "General Policy"}`,
    `Generated: ${new Date().toLocaleDateString()}`,
    "",
    result.summary || "",
    "",
    "── ✅ MET REQUIREMENTS ──",
  ];
  (result.met || []).forEach((item) => {
    lines.push(`  [${item.code}] ${item.title} — ${item.finding}`);
  });
  lines.push("", "── ⚠️ WEAK / PARTIAL COVERAGE ──");
  (result.weak || []).forEach((item) => {
    lines.push(`  [${item.code}] ${item.title}`);
    lines.push(`  Finding: ${item.finding}`);
    lines.push(`  Fix: ${item.recommendation}`);
    lines.push("");
  });
  lines.push("── ❌ MISSING REQUIREMENTS ──");
  (result.missing || []).forEach((item) => {
    lines.push(`  [${item.code}] ${item.title}`);
    lines.push(`  Gap: ${item.finding}`);
    lines.push(`  Fix: ${item.recommendation}`);
    lines.push("");
  });
  return lines.join("\n");
}

// ─── Action Plan helpers ──────────────────────────────────────────────────────

function actionPlanToText(actions, inst, topic) {
  const lines = [
    `REMEDIATION ACTION PLAN`,
    `Institution: ${inst.label} (${inst.cfr})`,
    `Topic: ${topic || "General Policy"}`,
    `Generated: ${new Date().toLocaleDateString()}`,
    "",
    `${"Priority".padEnd(8)}  ${"Requirement".padEnd(32)}  ${"Responsible Role".padEnd(28)}  ${"Deadline".padEnd(12)}  Action Steps`,
    "─".repeat(120),
  ];
  ["High", "Medium", "Low"].forEach((p) => {
    actions.filter((a) => a.priority === p).forEach((a) => {
      lines.push(`${p.padEnd(8)}  ${`[${a.code}] ${a.requirement}`.slice(0, 32).padEnd(32)}  ${(a.responsibleRole || "").slice(0, 28).padEnd(28)}  ${(a.suggestedDeadline || "").slice(0, 12).padEnd(12)}  ${a.actionSteps || ""}`);
    });
  });
  return lines.join("\n");
}

function exportActionPlanXlsx(actions, inst, topic) {
  const rows = actions.map((a) => ({
    "Priority": a.priority || "",
    "Regulatory Body": a.body || "",
    "Code / Reference": a.code || "",
    "Requirement": a.requirement || "",
    "Responsible Role": a.responsibleRole || "",
    "Suggested Deadline": a.suggestedDeadline || "",
    "Action Steps": a.actionSteps || "",
  }));
  downloadXlsx(
    [{ name: "Action Plan", rows }],
    `${inst.label.replace(/\s+/g, "_")}_${(topic || "Policy").replace(/\s+/g, "_")}_ActionPlan.xlsx`,
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const S = {
  page: { minHeight: "100vh", background: "#F4F7FA", fontFamily: "system-ui, -apple-system, sans-serif", color: "#1A2332" },
  header: { background: "#0D5C6B", color: "#fff", padding: "16px clamp(12px, 4vw, 32px)" },
  headerTitle: { margin: 0, fontSize: "22px", fontWeight: 700, letterSpacing: "-0.3px" },
  headerSub: { margin: "4px 0 0", fontSize: "13px", opacity: 0.75 },
  disclaimer: { background: "#FEF3C7", border: "1px solid #F59E0B", borderRadius: "6px", padding: "10px 14px", marginTop: "14px", fontSize: "11.5px", color: "#78350F", lineHeight: 1.5 },
  container: { maxWidth: "960px", margin: "0 auto", padding: "24px 24px 48px" },
  card: { background: "#fff", border: "1px solid #E2E8F0", borderRadius: "10px", padding: "20px", marginBottom: "16px" },
  label: { display: "block", fontSize: "11px", fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" },
  select: { width: "100%", padding: "9px 12px", fontSize: "13px", border: "1px solid #CBD5E1", borderRadius: "6px", background: "#fff", boxSizing: "border-box", color: "#1A2332" },
  input: { width: "100%", padding: "9px 12px", fontSize: "13px", border: "1px solid #CBD5E1", borderRadius: "6px", boxSizing: "border-box", color: "#1A2332" },
  row: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" },
  row3: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", marginBottom: "16px" },
  btnPrimary: (loading) => ({ width: "100%", padding: "12px", background: loading ? "#64748B" : "#0D5C6B", color: "#fff", border: "none", borderRadius: "7px", fontSize: "14px", fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", marginTop: "4px" }),
  btnSm: { padding: "6px 12px", fontSize: "12px", fontWeight: 600, border: "1px solid #CBD5E1", borderRadius: "5px", background: "#fff", cursor: "pointer", color: "#475569" },
  btnSmGreen: { padding: "6px 12px", fontSize: "12px", fontWeight: 600, border: "1px solid #A7F3D0", borderRadius: "5px", background: "#ECFDF5", cursor: "pointer", color: "#065F46" },
  error: { color: "#DC2626", fontSize: "13px", marginTop: "10px", padding: "10px 12px", background: "#FEF2F2", border: "1px solid #FCA5A5", borderRadius: "6px" },
  tabs: { display: "flex", gap: "4px", marginBottom: "20px", overflowX: "auto", paddingBottom: "4px" },
  tag: (color, bg) => ({ display: "inline-block", padding: "2px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 700, color, background: bg }),
  riskBadge: (level) => ({
    display: "inline-block", padding: "2px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 700,
    color: level === "High" ? "#991B1B" : level === "Medium" ? "#92400E" : "#065F46",
    background: level === "High" ? "#FEE2E2" : level === "Medium" ? "#FEF3C7" : "#D1FAE5",
  }),
  sectionHead: (color, bg) => ({ background: bg, borderLeft: `4px solid ${color}`, padding: "10px 14px", borderRadius: "0 6px 6px 0", marginBottom: "10px" }),
  sectionTitle: (color) => ({ margin: 0, fontSize: "13px", fontWeight: 700, color }),
  standardCard: { border: "1px solid #E2E8F0", borderRadius: "7px", padding: "12px 14px", marginBottom: "8px", background: "#FAFAFA" },
  fieldLabel: { fontSize: "10.5px", fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "2px" },
  fieldValue: { fontSize: "13px", color: "#1A2332", lineHeight: 1.55 },
  pre: { whiteSpace: "pre-wrap", fontFamily: "system-ui, -apple-system, sans-serif", fontSize: "13px", lineHeight: 1.65, color: "#1A2332", margin: 0 },
  divider: { border: "none", borderTop: "1px solid #E2E8F0", margin: "12px 0" },
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function Tab({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: "9px 18px", fontSize: "13px", fontWeight: 600, border: "none", borderRadius: "7px", cursor: "pointer",
      background: active ? "#0D5C6B" : "#E2E8F0", color: active ? "#fff" : "#475569",
      transition: "all 0.15s",
    }}>{label}</button>
  );
}

function LoadingSpinner({ message }) {
  return (
    <div style={{ textAlign: "center", padding: "40px 20px" }}>
      <div style={{ width: "36px", height: "36px", border: "3px solid #E2E8F0", borderTop: "3px solid #0D5C6B", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 14px" }} />
      <p style={{ color: "#64748B", fontSize: "13px", margin: 0 }}>{message}</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function CopyButton({ text, label = "Copy" }) {
  const [copied, setCopied] = useState(false);
  return (
    <button style={{ ...S.btnSm, color: copied ? "#065F46" : "#475569", borderColor: copied ? "#A7F3D0" : "#CBD5E1", background: copied ? "#ECFDF5" : "#fff" }}
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}>
      {copied ? "✓ Copied" : label}
    </button>
  );
}

function ExcelButton({ onClick, label = "↓ Excel" }) {
  return (
    <button style={S.btnSmGreen} onClick={onClick}>{label}</button>
  );
}

// ─── AI Disclosure Banner ─────────────────────────────────────────────────────
function AiDisclosureBanner() {
  return (
    <div style={{ marginTop: "16px", padding: "9px 13px", background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: "6px", fontSize: "11.5px", color: "#64748B", display: "flex", alignItems: "flex-start", gap: "7px", lineHeight: 1.5 }}>
      <span style={{ flexShrink: 0 }}>🤖</span>
      <span><strong style={{ color: "#475569" }}>AI-generated content.</strong> Verify all regulatory citations against official sources (eCFR.gov, accreditor websites) before implementation. This output does not constitute legal or regulatory advice.</span>
    </div>
  );
}

// ─── Onboarding Banner ────────────────────────────────────────────────────────
function OnboardingBanner() {
  const [visible, setVisible] = useState(() => !localStorage.getItem("cop-suite-onboarded"));
  if (!visible) return null;
  const steps = [
    { icon: "1️⃣", text: "Select your institution type from the grid at the top." },
    { icon: "2️⃣", text: "Pick a tool tab: Guidelines, Policy Templates, Inspection, or Gap Scanner." },
    { icon: "3️⃣", text: "Choose a department/unit and policy topic, then generate." },
    { icon: "4️⃣", text: "Export to Excel, copy to clipboard, or use the side-by-side view (Gap Scanner)." },
  ];
  return (
    <div style={{ background: "linear-gradient(135deg, #E8F4F5 0%, #F0F9FF 100%)", border: "1.5px solid #B2D8DD", borderRadius: "10px", padding: "18px 20px", marginBottom: "20px", position: "relative" }}>
      <button
        onClick={() => { localStorage.setItem("cop-suite-onboarded", "1"); setVisible(false); }}
        style={{ position: "absolute", top: "12px", right: "14px", background: "none", border: "none", fontSize: "18px", cursor: "pointer", color: "#64748B", lineHeight: 1 }}
        aria-label="Dismiss"
      >×</button>
      <div style={{ fontWeight: 700, fontSize: "14px", color: "#0D5C6B", marginBottom: "12px" }}>👋 Welcome to CMS Compliance Suite</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "10px" }}>
        {steps.map((s) => (
          <div key={s.icon} style={{ background: "#fff", borderRadius: "7px", padding: "10px 13px", fontSize: "12.5px", color: "#334155", lineHeight: 1.5, border: "1px solid #E2E8F0" }}>
            <span style={{ fontWeight: 700 }}>{s.icon}</span> {s.text}
          </div>
        ))}
      </div>
      <button
        onClick={() => { localStorage.setItem("cop-suite-onboarded", "1"); setVisible(false); }}
        style={{ marginTop: "14px", padding: "8px 20px", background: "#0D5C6B", color: "#fff", border: "none", borderRadius: "7px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}
      >
        Got it, let's start →
      </button>
    </div>
  );
}

// ─── Guidelines Tab ──────────────────────────────────────────────────────────

function GuidelinesTab({ institution }) {
  const topics = getProviderTopics(institution);
  const verifiedRequirements = getRequirementsForProvider(institution);
  const [topic, setTopic] = useState(() => topics[0] ?? TOPICS[0]);
  const [customTopic, setCustomTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [dataSource, setDataSource] = useState(null); // { kind: "ecfr", fetchDate } | { kind: "ai" } | null

  const inst = INSTITUTION_TYPES.find((i) => i.value === institution);

  useEffect(() => {
    setTopic(getProviderTopics(institution)[0] ?? TOPICS[0]);
    setCustomTopic("");
    setResult(null);
    setDataSource(null);
  }, [institution]);

  async function generate() {
    const topicFinal = customTopic.trim() || topic;
    setLoading(true); setError(null); setResult(null); setDataSource(null);

    const systemPrompt = `You are a healthcare regulatory compliance expert with deep knowledge of CMS Conditions of Participation, Joint Commission, DNV NIAHO, and ISO 9001:2015.

Output ONLY valid JSON with this exact structure:
{
  "overview": "2-3 sentence summary of the regulatory landscape for this topic",
  "sources": [
    {
      "key": "cms",
      "body": "CMS Conditions of Participation",
      "cfr": "${inst.cfr}",
      "standards": [
        {
          "code": "§482.XX",
          "tag": "A-XXXX",
          "title": "Standard title",
          "requirement": "Core requirement in 1-2 sentences",
          "surveyorFocus": "What surveyors look for in 1 sentence"
        }
      ]
    },
    {
      "key": "tjc",
      "body": "Joint Commission",
      "standards": [
        {
          "code": "IC.01.01.01",
          "title": "Standard title",
          "requirement": "Core requirement in 1-2 sentences",
          "surveyorFocus": "What reviewers look for in 1 sentence"
        }
      ]
    },
    {
      "key": "dnv",
      "body": "DNV NIAHO",
      "standards": [
        {
          "code": "IC.1",
          "title": "Standard title",
          "requirement": "Core requirement in 1-2 sentences",
          "surveyorFocus": "What reviewers look for in 1 sentence"
        }
      ]
    },
    {
      "key": "iso",
      "body": "ISO 9001:2015",
      "standards": [
        {
          "code": "Clause 8.5",
          "title": "Clause title",
          "requirement": "How this clause applies to healthcare compliance in 1-2 sentences",
          "surveyorFocus": "Key evidence/documentation required in 1 sentence"
        }
      ]
    }
  ]
}

Include 3-4 standards per source. Use real, accurate regulatory codes and citations. Be concise but specific.`;

    const userContent = `Institution: ${inst.label} (${inst.cfr})\nCompliance Topic: ${topicFinal}`;

    try {
      const { text, dataSource: ds } = await callApiWithSource(systemPrompt, userContent, 3000, institution);
      setResult(repairJson(text));
      setDataSource(ds);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const topicFinal = customTopic.trim() || topic;

  // Build plain-text copy string
  function buildCopyText() {
    const lines = [
      `COMPLIANCE GUIDELINES — ${inst.label} (${inst.cfr})`,
      `Topic: ${topicFinal}`,
      "",
      result.overview,
      "",
    ];
    result.sources?.forEach((src) => {
      lines.push(`── ${src.body} ${src.cfr ? `(${src.cfr})` : ""} ──`);
      src.standards?.forEach((std) => {
        lines.push(`  ${std.code}${std.tag ? ` [${std.tag}]` : ""} — ${std.title}`);
        lines.push(`  Requirement: ${std.requirement}`);
        if (std.surveyorFocus) lines.push(`  Surveyor Focus: ${std.surveyorFocus}`);
        lines.push("");
      });
    });
    return lines.join("\n");
  }

  return (
    <div>
      {verifiedRequirements.length > 0 && (
        <details style={{ ...S.card, borderLeft: "4px solid #0D5C6B" }}>
          <summary style={{ cursor: "pointer", fontWeight: 800, color: "#0D5C6B", fontSize: "15px" }}>
            Verified {inst.label} CMS Citation Library ({verifiedRequirements.length})
          </summary>
          <p style={{ fontSize: "12px", color: "#64748B", lineHeight: 1.6, margin: "10px 0 14px" }}>
            Section-level index from {inst.cfr}. Open the official eCFR link to review all standards and sub-requirements before relying on a citation.
          </p>
          <div style={{ display: "grid", gap: "8px" }}>
            {verifiedRequirements.map((requirement) => {
              const source = getRegulatorySource(requirement.sourceIds[0]);
              return (
                <div key={requirement.id} style={{ border: "1px solid #D8E4E8", borderRadius: "8px", padding: "10px 12px", background: "#F8FBFC" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start", flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: "11px", color: "#64748B", fontWeight: 700 }}>{requirement.conditionCategory}</div>
                      <div style={{ fontSize: "13px", color: "#1E293B", fontWeight: 600, marginTop: "2px" }}>{requirement.requirement}</div>
                    </div>
                    {source?.url && (
                      <a href={source.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: "12px", color: "#0D5C6B", fontWeight: 800, whiteSpace: "nowrap" }}>
                        {requirement.cfrReference} ↗
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: "11px", color: "#64748B", marginTop: "12px" }}>
            Verified September 6, 2026 · Scheduled review December 6, 2026
            {getRegulatorySource(verifiedRequirements[0]?.sourceIds[1])?.url && (
              <> · Survey guidance:{" "}
                <a href={getRegulatorySource(verifiedRequirements[0].sourceIds[1]).url} target="_blank" rel="noopener noreferrer" style={{ color: "#0D5C6B", fontWeight: 700 }}>
                  {institution === "cah" ? "CMS State Operations Manual Appendix W" : "CMS State Operations Manual Appendix A"} ↗
                </a>
              </>
            )}
          </div>
        </details>
      )}

      {/* Form */}
      <div style={S.card}>
        <div style={S.row}>
          <div>
            <label style={S.label}>Topic Preset</label>
            <select style={S.select} value={topic} onChange={(e) => { setTopic(e.target.value); setCustomTopic(""); }}>
              {topics.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label style={S.label}>Custom Topic (overrides preset)</label>
            <input style={S.input} type="text" value={customTopic} onChange={(e) => setCustomTopic(e.target.value)} placeholder="e.g. Hand Hygiene Compliance" />
          </div>
        </div>
        <button style={S.btnPrimary(loading)} onClick={generate} disabled={loading}>
          {loading ? "Generating…" : "Generate Compliance Guidelines"}
        </button>
        {error && <div style={S.error}>⚠️ {error}</div>}
      </div>

      {/* Loading */}
      {loading && <div style={S.card}><LoadingSpinner message="Fetching live regulatory data and compiling standards…" /></div>}

      {/* Results */}
      {result && !loading && (
        <div>
          {/* Overview + action buttons */}
          <div style={{ ...S.card, borderLeft: "4px solid #0D5C6B" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
              <div>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#0D5C6B", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  {inst.label} · {topicFinal}
                </div>
                <div style={{ fontSize: "11px", color: "#64748B", marginTop: "2px" }}>{inst.cfr}</div>
                {/* Data source badge */}
                <div style={{ marginTop: "6px" }}>
                  {dataSource?.kind === "ecfr" ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 700, background: "#ECFDF5", color: "#065F46", border: "1px solid #6EE7B7" }}>
                      📡 Live eCFR · {dataSource.fetchDate}
                    </span>
                  ) : (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 700, background: "#F1F5F9", color: "#475569", border: "1px solid #CBD5E1" }}>
                      🤖 AI Knowledge
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <CopyButton text={buildCopyText()} />
                <ExcelButton onClick={() => exportGuidelinesXlsx(result, inst, topicFinal)} />
              </div>
            </div>
            <p style={{ margin: 0, fontSize: "14px", color: "#334155", lineHeight: 1.6 }}>{result.overview}</p>
          </div>

          {/* Standards by body */}
          {result.sources?.map((src) => {
            const bodyConfig = BODIES.find((b) => b.key === src.key) || BODIES[0];
            // CMS uses live eCFR when available; JC/DNV/ISO always use AI knowledge (copyrighted)
            const srcBadge = (src.key === "cms" && dataSource?.kind === "ecfr")
              ? { label: `📡 Live eCFR · ${dataSource.fetchDate}`, bg: "#ECFDF5", color: "#065F46", border: "#6EE7B7" }
              : { label: "🤖 AI Knowledge", bg: "#F1F5F9", color: "#475569", border: "#CBD5E1" };
            return (
              <div key={src.key} style={S.card}>
                <div style={S.sectionHead(bodyConfig.color, bodyConfig.bg)}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                    <div>
                      <h3 style={{ ...S.sectionTitle(bodyConfig.color), fontSize: "14px" }}>{src.body}</h3>
                      {src.cfr && <div style={{ fontSize: "11px", color: bodyConfig.color, opacity: 0.75, marginTop: "2px" }}>{src.cfr}</div>}
                    </div>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <span style={{ padding: "2px 7px", borderRadius: "4px", fontSize: "10.5px", fontWeight: 700, background: srcBadge.bg, color: srcBadge.color, border: `1px solid ${srcBadge.border}` }}>
                        {srcBadge.label}
                      </span>
                      <span style={S.tag(bodyConfig.color, bodyConfig.bg)}>{src.standards?.length || 0} standards</span>
                    </div>
                  </div>
                </div>

                {src.standards?.map((std, idx) => (
                  <div key={idx} style={S.standardCard}>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "8px", flexWrap: "wrap" }}>
                      <span style={{ fontFamily: "monospace", fontSize: "12px", fontWeight: 700, color: bodyConfig.color }}>{std.code}</span>
                      {std.tag && <span style={S.tag(bodyConfig.color, bodyConfig.bg)}>{std.tag}</span>}
                      <span style={{ fontSize: "13px", fontWeight: 600, color: "#1A2332" }}>{std.title}</span>
                    </div>
                    <div style={{ marginBottom: "6px" }}>
                      <div style={S.fieldLabel}>Requirement</div>
                      <div style={S.fieldValue}>{std.requirement}</div>
                    </div>
                    {std.surveyorFocus && (
                      <div>
                        <div style={S.fieldLabel}>Surveyor Focus</div>
                        <div style={{ ...S.fieldValue, color: "#475569" }}>🔍 {std.surveyorFocus}</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
          <AiDisclosureBanner />
        </div>
      )}
    </div>
  );
}

// ─── Policy Tab ──────────────────────────────────────────────────────────────

function PolicyTab({ institution }) {
  const instUnits = INSTITUTION_UNITS[institution] || null;
  const topics = getProviderTopics(institution);
  const [unit, setUnit] = useState(() => instUnits ? instUnits.units[0] : DEPARTMENTS[0]);
  const [topic, setTopic] = useState(() => topics[0] ?? TOPICS[0]);
  const [customTopic, setCustomTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [dataSource, setDataSource] = useState(null); // { kind: "ecfr", fetchDate } | { kind: "ai" } | null

  useEffect(() => {
    const iu = INSTITUTION_UNITS[institution] || null;
    setUnit(iu ? iu.units[0] : DEPARTMENTS[0]);
    setTopic(getProviderTopics(institution)[0] ?? TOPICS[0]);
    setCustomTopic("");
    setResult(null);
    setDataSource(null);
  }, [institution]);

  const inst = INSTITUTION_TYPES.find((i) => i.value === institution);
  const isContractedUnit = unit.endsWith("(Contracted)");

  async function generate() {
    const topicFinal = customTopic.trim() || topic;
    setLoading(true); setError(null); setResult(null); setDataSource(null);

    const systemPrompt = `You are a healthcare compliance policy expert. Generate a complete, professional policy template that a ${inst.label} can immediately adopt and customize.

Use [BRACKETED PLACEHOLDERS IN CAPS] where the institution must enter specific information.

Structure the policy as follows:
POLICY TITLE
Policy Number: [POLICY-XXX] | Effective Date: [DATE] | Review Date: [DATE] | Approved By: [TITLE]

PURPOSE
Cite the regulatory basis (CMS §, Joint Commission, DNV NIAHO, ISO 9001:2015).

SCOPE
Define who and what this policy covers.

POLICY STATEMENT
The core policy commitment.

DEFINITIONS
Key terms.

PROCEDURE
Numbered step-by-step procedures.

ROLES AND RESPONSIBILITIES
Bullet list by role/title.

MONITORING AND COMPLIANCE
How compliance will be measured and reported.

REFERENCES
Exact regulatory citations: CMS CFR, Joint Commission standard codes, DNV NIAHO codes, ISO 9001:2015 clauses.

DOCUMENT HISTORY
Version table.

Output as plain text only (no JSON, no markdown headers with #).`;

    const unitLine = instUnits ? `${instUnits.label}: ${unit}` : `Department: ${unit}`;
    const contractedNote = isContractedUnit
      ? `\nThis policy must address the facility's OVERSIGHT of this contracted service per §482.12(e) (or equivalent CoP section for this institution type): contract requirements, vendor credentialing, performance monitoring, and the service-specific regulatory standards.`
      : "";
    const userContent = `Institution: ${inst.label} (${inst.cfr})\n${unitLine}\nPolicy Topic: ${topicFinal}${contractedNote}`;

    try {
      const { text, dataSource: ds } = await callApiWithSource(systemPrompt, userContent, 4000, institution);
      setResult(text.replace(/```[\w]*\n?|```/g, "").trim());
      setDataSource(ds);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const topicFinal = customTopic.trim() || topic;

  function downloadTxt() {
    const blob = new Blob([result], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${inst.label.replace(/\s+/g, "_")}_${topicFinal.replace(/\s+/g, "_")}_Policy.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div style={S.card}>
        <div style={S.row}>
          {instUnits && (
            <div>
              <label style={S.label}>{instUnits.label}</label>
              <select style={S.select} value={unit} onChange={(e) => { setUnit(e.target.value); setResult(null); }}>
                <optgroup label="Units / Departments">
                  {instUnits.units.map((d) => <option key={d} value={d}>{d}</option>)}
                </optgroup>
                <optgroup label="Contracted Services">
                  {instUnits.contracted.map((d) => <option key={d} value={d}>{d}</option>)}
                </optgroup>
              </select>
            </div>
          )}
          <div>
            <label style={S.label}>Topic Preset</label>
            <select style={S.select} value={topic} onChange={(e) => { setTopic(e.target.value); setCustomTopic(""); }}>
              {topics.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label style={S.label}>Custom Topic (overrides preset)</label>
            <input style={S.input} type="text" value={customTopic} onChange={(e) => setCustomTopic(e.target.value)} placeholder="e.g. Sharps Safety Program" />
          </div>
        </div>
        <button style={S.btnPrimary(loading)} onClick={generate} disabled={loading}>
          {loading ? "Generating…" : "Generate Policy Template"}
        </button>
        {error && <div style={S.error}>⚠️ {error}</div>}
      </div>

      {loading && <div style={S.card}><LoadingSpinner message="Drafting policy template with regulatory references…" /></div>}

      {result && !loading && (
        <div style={S.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px" }}>
            <div>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "#0D5C6B" }}>Policy Template</div>
              <div style={{ fontSize: "11px", color: "#64748B" }}>{inst.label} · {topicFinal}</div>
              {/* Data source badge */}
              <div style={{ marginTop: "6px" }}>
                {dataSource?.kind === "ecfr" ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 700, background: "#ECFDF5", color: "#065F46", border: "1px solid #6EE7B7" }}>
                    📡 Live eCFR · {dataSource.fetchDate}
                  </span>
                ) : (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 700, background: "#F1F5F9", color: "#475569", border: "1px solid #CBD5E1" }}>
                    🤖 AI Knowledge
                  </span>
                )}
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <CopyButton text={result} />
              <button style={S.btnSm} onClick={downloadTxt}>↓ .txt</button>
              <ExcelButton onClick={() => exportPolicyXlsx(result, inst, topicFinal)} />
            </div>
          </div>
          <hr style={S.divider} />
          <pre style={S.pre}>{result}</pre>
          <AiDisclosureBanner />
        </div>
      )}
    </div>
  );
}

// ─── Inspection Tab ──────────────────────────────────────────────────────────

function InspectionTab({ institution }) {
  const instUnits = INSTITUTION_UNITS[institution] || null;
  const firstDept = instUnits ? instUnits.units[0] : DEPARTMENTS[0];

  const [dept, setDept] = useState(firstDept);
  const [govBodies, setGovBodies] = useState({ cms: true, tjc: false, dnv: false });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [responses, setResponses] = useState({});
  const [notes, setNotes] = useState({});       // itemId → string
  const [flags, setFlags] = useState({});       // itemId → bool
  const [openNote, setOpenNote] = useState(null); // itemId whose note box is expanded
  const [dataSource, setDataSource] = useState(null); // { kind: "ecfr", fetchDate } | { kind: "ai" } | null

  // Reset selection whenever institution type changes
  useEffect(() => {
    const iu = INSTITUTION_UNITS[institution] || null;
    setDept(iu ? iu.units[0] : DEPARTMENTS[0]);
    setResult(null);
    setResponses({});
    setNotes({});
    setFlags({});
    setOpenNote(null);
    setDataSource(null);
  }, [institution]);

  const inst = INSTITUTION_TYPES.find((i) => i.value === institution);
  const selectedBodies = Object.entries(govBodies).filter(([, v]) => v).map(([k]) => k.toUpperCase());
  const isContracted = dept.endsWith("(Contracted)");

  async function generate() {
    setLoading(true); setError(null); setResult(null); setResponses({}); setDataSource(null);

    const systemPrompt = `You are a healthcare inspection readiness expert. Generate a practical inspection readiness checklist.

Output ONLY valid JSON:
{
  "items": [
    {
      "id": "1",
      "area": "Documentation",
      "question": "Specific question a surveyor will ask or verify",
      "riskLevel": "High",
      "regulatoryBasis": "§482.42(a) / IC.01.01.01",
      "commonDeficiency": "What typically fails during surveys",
      "recommendation": "Specific action to prepare"
    }
  ]
}

Generate exactly 12 items. Cover these areas proportionally: Documentation, Policies & Procedures, Staff Training & Competency, Physical Environment, Patient Safety, and Ongoing Monitoring. Include a mix of High (4), Medium (5), and Low (3) risk items. Use real regulatory codes from the selected governing bodies.`;

    const bodies = selectedBodies.length ? selectedBodies.join(", ") : "CMS";
    const deptLine = instUnits ? `${instUnits.label}: ${dept}` : `Department: ${dept}`;
    const contractedNote = isContracted
      ? `\nThis is a CONTRACTED service. Focus the checklist on: (1) the governing body's requirements for oversight of contracted services, (2) contract/agreement review, (3) how the facility monitors contractor performance, (4) staff competency and credentialing of contractor staff, and (5) any service-specific regulatory standards. Include questions a surveyor would ask the facility about how they manage and oversee this contracted vendor.`
      : `\nFocus the checklist specifically on the ${dept} area — unit-specific surveyor questions, common deficiencies found there, and the most applicable regulatory standards.`;
    const userContent = `Institution: ${inst.label} (${inst.cfr})\n${deptLine}\nGoverning Bodies: ${bodies}${contractedNote}`;

    try {
      const instValue = govBodies.cms ? institution : undefined;
      const { text: raw, dataSource: ds } = await callApiWithSource(systemPrompt, userContent, 3000, instValue);
      const data = repairJson(raw);
      setResult(data.items || data);
      setDataSource(ds);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const riskOrder = { High: 0, Medium: 1, Low: 2 };
  const sorted = result ? [...result].sort((a, b) => {
    const fa = flags[a.id] ? 0 : 1, fb = flags[b.id] ? 0 : 1;
    if (fa !== fb) return fa - fb;
    return (riskOrder[a.riskLevel] ?? 3) - (riskOrder[b.riskLevel] ?? 3);
  }) : [];

  const score = sorted.length
    ? Math.round((Object.values(responses).filter((v) => v === "yes").length / sorted.length) * 100)
    : null;

  const unitCitations = getUnitCitations(institution, dept);

  return (
    <div>
      <div style={S.card}>
        <div style={S.row}>
          <div style={{ flex: 1 }}>
            <label style={S.label}>{instUnits ? instUnits.label : "Department / Service Area"}</label>
            <select style={S.select} value={dept} onChange={(e) => { setDept(e.target.value); setResult(null); setResponses({}); setNotes({}); setFlags({}); setOpenNote(null); }}>
              {instUnits ? (
                <>
                  <optgroup label="Units / Departments">
                    {instUnits.units.map((d) => <option key={d} value={d}>{d}</option>)}
                  </optgroup>
                  <optgroup label="Contracted Services">
                    {instUnits.contracted.map((d) => <option key={d} value={d}>{d}</option>)}
                  </optgroup>
                </>
              ) : (
                DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)
              )}
            </select>
            {/* Key Standards — instant, no generation needed */}
            {unitCitations.length > 0 && (
              <div style={{ marginTop: "8px", padding: "8px 10px", background: "#EFF6FF", borderRadius: "6px", border: "1px solid #BFDBFE" }}>
                <div style={{ fontSize: "10px", fontWeight: 700, color: "#1E40AF", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "5px" }}>Key Standards for this Area</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
                  {unitCitations.map((c) => (
                    <span key={c} style={{ fontSize: "10.5px", fontFamily: "monospace", background: "#DBEAFE", color: "#1E40AF", padding: "2px 7px", borderRadius: "4px", border: "1px solid #BFDBFE" }}>{c}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div>
            <label style={S.label}>Governing Bodies</label>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", paddingTop: "6px" }}>
              {[["cms", "CMS"], ["tjc", "Joint Commission"], ["dnv", "DNV NIAHO"]].map(([key, lbl]) => (
                <label key={key} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", cursor: "pointer" }}>
                  <input type="checkbox" checked={govBodies[key]} onChange={(e) => setGovBodies({ ...govBodies, [key]: e.target.checked })} />
                  {lbl}
                </label>
              ))}
            </div>
          </div>
        </div>
        <button style={S.btnPrimary(loading)} onClick={generate} disabled={loading}>
          {loading ? "Generating…" : "Generate Inspection Readiness Checklist"}
        </button>
        {error && <div style={S.error}>⚠️ {error}</div>}
      </div>

      {loading && <div style={S.card}><LoadingSpinner message="Building inspection readiness checklist…" /></div>}

      {sorted.length > 0 && !loading && (
        <div>
          {/* Score bar */}
          <div style={{ ...S.card, borderLeft: "4px solid #0D5C6B" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: Object.keys(responses).length > 0 ? "8px" : 0 }}>
              <div>
                <span style={{ fontSize: "13px", fontWeight: 600 }}>Inspection Readiness Checklist</span>
                <div style={{ fontSize: "11px", color: "#64748B", marginTop: "2px" }}>{inst.label} · {dept}</div>
                {/* Data source badge */}
                <div style={{ marginTop: "6px" }}>
                  {dataSource?.kind === "ecfr" ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 700, background: "#ECFDF5", color: "#065F46", border: "1px solid #6EE7B7" }}>
                      📡 Live eCFR · {dataSource.fetchDate}
                    </span>
                  ) : (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 700, background: "#F1F5F9", color: "#475569", border: "1px solid #CBD5E1" }}>
                      🤖 AI Knowledge
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                {Object.keys(responses).length > 0 && (
                  <span style={{ fontSize: "20px", fontWeight: 700, color: score >= 80 ? "#065F46" : score >= 60 ? "#92400E" : "#991B1B" }}>{score}%</span>
                )}
                <CopyButton text={inspectionToText(sorted, responses, inst, dept, notes, flags)} label="Copy" />
                <ExcelButton onClick={() => exportInspectionXlsx(sorted, responses, inst, dept, notes, flags)} />
              </div>
            </div>
            {Object.keys(responses).length > 0 && (
              <>
                <div style={{ background: "#E2E8F0", borderRadius: "4px", height: "8px" }}>
                  <div style={{ background: score >= 80 ? "#10B981" : score >= 60 ? "#F59E0B" : "#EF4444", borderRadius: "4px", height: "8px", width: `${score}%`, transition: "width 0.4s" }} />
                </div>
                <div style={{ fontSize: "11px", color: "#64748B", marginTop: "6px" }}>
                  {Object.values(responses).filter((v) => v === "yes").length} of {sorted.length} items ready
                </div>
              </>
            )}
            <AiDisclosureBanner />
          </div>

          {/* Checklist items */}
          {sorted.map((item) => {
            const isFlagged = !!flags[item.id];
            const noteOpen = openNote === item.id;
            return (
              <div key={item.id} style={{ ...S.card, borderLeft: `4px solid ${isFlagged ? "#7C3AED" : item.riskLevel === "High" ? "#DC2626" : item.riskLevel === "Medium" ? "#F59E0B" : "#10B981"}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", marginBottom: "6px" }}>
                      {isFlagged && <span style={{ fontSize: "11px", fontWeight: 700, color: "#7C3AED", background: "#EDE9FE", border: "1px solid #C4B5FD", borderRadius: "4px", padding: "1px 7px" }}>🚩 Follow-Up</span>}
                      <span style={S.riskBadge(item.riskLevel)}>{item.riskLevel} Risk</span>
                      <span style={{ fontSize: "11px", fontWeight: 600, color: "#64748B" }}>{item.area}</span>
                      {item.regulatoryBasis && <span style={{ fontSize: "11px", color: "#94A3B8", fontFamily: "monospace" }}>{item.regulatoryBasis}</span>}
                    </div>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: "#1A2332", marginBottom: "10px" }}>{item.question}</div>

                    {item.commonDeficiency && (
                      <div style={{ marginBottom: "6px" }}>
                        <span style={{ fontSize: "11px", fontWeight: 700, color: "#DC2626" }}>⚠ Common Deficiency: </span>
                        <span style={{ fontSize: "12px", color: "#475569" }}>{item.commonDeficiency}</span>
                      </div>
                    )}
                    {item.recommendation && (
                      <div style={{ marginBottom: "8px" }}>
                        <span style={{ fontSize: "11px", fontWeight: 700, color: "#065F46" }}>✓ Recommendation: </span>
                        <span style={{ fontSize: "12px", color: "#475569" }}>{item.recommendation}</span>
                      </div>
                    )}

                    {/* Notes toggle + textarea */}
                    <div>
                      <button onClick={() => setOpenNote(noteOpen ? null : item.id)}
                        style={{ fontSize: "11px", color: notes[item.id] ? "#7C3AED" : "#64748B", background: "none", border: "none", cursor: "pointer", padding: 0, fontWeight: notes[item.id] ? 700 : 400 }}>
                        {noteOpen ? "▾ Notes" : "▸ Notes"}{notes[item.id] ? " ✎" : ""}
                      </button>
                      {noteOpen && (
                        <textarea
                          value={notes[item.id] || ""}
                          onChange={(e) => setNotes({ ...notes, [item.id]: e.target.value })}
                          placeholder="Add internal notes, owner, deadline…"
                          style={{ display: "block", width: "100%", marginTop: "6px", padding: "7px 9px", fontSize: "12px", borderRadius: "5px", border: "1px solid #CBD5E1", resize: "vertical", minHeight: "60px", fontFamily: "inherit", color: "#1A2332", background: "#FAFAFA" }}
                        />
                      )}
                    </div>
                  </div>

                  {/* Response buttons + flag */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", flexShrink: 0, alignItems: "flex-end" }}>
                    {[["yes", "✓ Ready", "#065F46", "#D1FAE5"], ["no", "✗ Gap", "#991B1B", "#FEE2E2"], ["na", "N/A", "#475569", "#F1F5F9"]].map(([val, lbl, color, bg]) => (
                      <button key={val} onClick={() => setResponses({ ...responses, [item.id]: val })}
                        style={{ padding: "5px 10px", fontSize: "11px", fontWeight: 700, border: `1px solid ${responses[item.id] === val ? color : "#CBD5E1"}`, borderRadius: "5px", cursor: "pointer", background: responses[item.id] === val ? bg : "#fff", color: responses[item.id] === val ? color : "#475569", minWidth: "70px" }}>
                        {lbl}
                      </button>
                    ))}
                    <button onClick={() => setFlags({ ...flags, [item.id]: !isFlagged })}
                      title={isFlagged ? "Remove flag" : "Flag for follow-up"}
                      style={{ padding: "5px 10px", fontSize: "11px", fontWeight: 700, border: `1px solid ${isFlagged ? "#7C3AED" : "#CBD5E1"}`, borderRadius: "5px", cursor: "pointer", background: isFlagged ? "#EDE9FE" : "#fff", color: isFlagged ? "#7C3AED" : "#94A3B8", minWidth: "70px" }}>
                      🚩 Flag
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Gap Scanner Tab ─────────────────────────────────────────────────────────

function GapScannerTab({ institution }) {
  const instUnits = INSTITUTION_UNITS[institution] || null;
  const topics = getProviderTopics(institution);
  const [initialSession] = useState(() => loadGapSession());
  const hasRestoredSession = initialSession.institution === institution;
  const skipInitialProviderReset = useRef(hasRestoredSession);
  const [unit, setUnit] = useState(() => hasRestoredSession ? initialSession.unit : (instUnits ? instUnits.units[0] : DEPARTMENTS[0]));
  const [topic, setTopic] = useState(() => hasRestoredSession ? initialSession.topic : (topics[0] ?? TOPICS[0]));
  const [customTopic, setCustomTopic] = useState(() => hasRestoredSession ? (initialSession.customTopic ?? "") : "");
  const [policyText, setPolicyText] = useState(() => hasRestoredSession ? (initialSession.policyText ?? "") : "");
  const [fileName, setFileName] = useState(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("Comparing policy against CMS, Joint Commission, DNV, and ISO 9001 standards…");
  const [sideBySide, setSideBySide] = useState(() => typeof window !== "undefined" && window.innerWidth >= 960);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(() => hasRestoredSession ? (initialSession.result ?? null) : null);
  const [resultMeta, setResultMeta] = useState(() => hasRestoredSession ? (initialSession.resultMeta ?? null) : null); // { institution, topic, timestamp }
  const [actionPlan, setActionPlan] = useState(() => hasRestoredSession ? (initialSession.actionPlan ?? null) : null);
  const [actionPlanLoading, setActionPlanLoading] = useState(false);
  const [actionPlanError, setActionPlanError] = useState(null);
  const [history, setHistory] = useState(() => loadGapHistory());
  const [showHistory, setShowHistory] = useState(false);
  const [loadedEntryId, setLoadedEntryId] = useState(null); // which history entry is currently shown

  // Reset unit when institution changes
  useEffect(() => {
    if (skipInitialProviderReset.current) {
      skipInitialProviderReset.current = false;
      return;
    }
    const iu = INSTITUTION_UNITS[institution] || null;
    setUnit(iu ? iu.units[0] : DEPARTMENTS[0]);
    setTopic(getProviderTopics(institution)[0] ?? TOPICS[0]);
    setCustomTopic("");
    setPolicyText("");
    setFileName(null);
    setResult(null); setResultMeta(null); setActionPlan(null); setLoadedEntryId(null);
  }, [institution]);

  useEffect(() => {
    saveGapSession({
      institution,
      unit,
      topic,
      customTopic,
      policyText,
      result,
      resultMeta,
      actionPlan,
      history,
    });
  }, [institution, unit, topic, customTopic, policyText, result, resultMeta, actionPlan, history]);

  useEffect(() => {
    const expiryTimer = window.setTimeout(() => {
      void clearSessionData();
    }, GAP_SESSION_TTL_MS);
    return () => window.clearTimeout(expiryTimer);
  }, [policyText, result, actionPlan, history]);

  const inst = INSTITUTION_TYPES.find((i) => i.value === institution);
  const topicFinal = customTopic.trim() || topic;
  const isContractedUnit = unit.endsWith("(Contracted)");

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileError(null);
    setFileLoading(true);
    setFileName(file.name);
    try {
      const text = await extractTextFromFile(file);
      setPolicyText(text);
    } catch (err) {
      setFileError(err.message);
      setFileName(null);
      setPolicyText("");
    } finally {
      setFileLoading(false);
    }
    // Reset input so same file can be re-selected
    e.target.value = "";
  }

  async function generateActionPlan() {
    if (!result) return;
    setActionPlanLoading(true); setActionPlanError(null); setActionPlan(null);

    const gaps = [
      ...(result.weak    || []).map((i) => ({ ...i, status: "Weak/Partial" })),
      ...(result.missing || []).map((i) => ({ ...i, status: "Missing" })),
    ];

    if (gaps.length === 0) {
      setActionPlanError("No weak or missing requirements found — nothing to remediate.");
      setActionPlanLoading(false);
      return;
    }

    const systemPrompt = `You are a healthcare compliance remediation expert. Given a list of regulatory gaps, produce a concise, prioritized one-page remediation action plan that a compliance team can execute immediately.

Output ONLY valid JSON with this exact structure:
{
  "actions": [
    {
      "priority": "High",
      "body": "CMS",
      "code": "§482.42(b)",
      "requirement": "Short requirement title (≤8 words)",
      "responsibleRole": "Infection Preventionist / CMO",
      "suggestedDeadline": "30 days",
      "actionSteps": "1. Convene ASP committee. 2. Draft stewardship policy. 3. Implement prescribing audit."
    }
  ]
}

Rules:
- "priority" must be exactly "High", "Medium", or "Low".
  • High  = Missing requirement OR weak item with direct patient-safety / CMS enforcement risk
  • Medium = Weak partial coverage needing moderate rework
  • Low   = Minor documentation or process gaps
- "responsibleRole" should be a realistic job title or committee, not a department.
- "suggestedDeadline" should be a realistic timeframe: "7 days", "30 days", "60 days", or "90 days".
- "actionSteps" must be numbered, concrete steps (2-4 steps). Be specific — cite policy sections to add, forms to create, trainings to schedule.
- Sort actions: High first, then Medium, then Low.
- Include one action per gap. Do not merge multiple gaps into one action.
- Do NOT fabricate new gaps. Only address the gaps listed.`;

    const gapLines = gaps.map((g, i) =>
      `${i + 1}. [${g.status}] [${g.body}] ${g.code} — ${g.title}\n   Finding: ${g.finding}\n   Recommendation: ${g.recommendation || "Not specified"}`
    ).join("\n\n");

    const userContent = `Institution: ${effectiveInst.label} (${effectiveInst.cfr})\nTopic: ${effectiveTopic}\n\nGAPS TO REMEDIATE:\n${gapLines}`;

    try {
      const raw = await callApi(systemPrompt, userContent, 3000);
      const parsed = repairJson(raw);
      setActionPlan(parsed.actions || parsed);
    } catch (e) {
      setActionPlanError(e.message);
    } finally {
      setActionPlanLoading(false);
    }
  }

  async function analyze() {
    if (!policyText.trim()) {
      setError("Please paste policy text or upload a document before analyzing.");
      return;
    }
    setLoading(true); setError(null); setResult(null); setActionPlan(null); setActionPlanError(null);

    const systemPrompt = `You are a senior healthcare regulatory compliance auditor with expert knowledge of CMS Conditions of Participation, Joint Commission, DNV NIAHO, and ISO 9001:2015.

A user will provide an existing policy document (or a section of one). Your job is to identify compliance gaps against the regulatory standards that apply to the given institution type and policy topic.

Output ONLY valid JSON with this exact structure:
{
  "summary": "2-3 sentence executive summary of overall compliance posture",
  "score": 72,
  "met": [
    {
      "body": "CMS",
      "code": "§482.42(a)(1)",
      "title": "Requirement title",
      "finding": "Brief note on how the policy meets this requirement"
    }
  ],
  "weak": [
    {
      "body": "Joint Commission",
      "code": "IC.02.02.01",
      "title": "Requirement title",
      "finding": "Specific weakness or gap in the existing text",
      "recommendation": "Concrete action to strengthen coverage"
    }
  ],
  "missing": [
    {
      "body": "CMS",
      "code": "§482.42(b)",
      "title": "Requirement title",
      "finding": "Why this requirement is absent or completely unaddressed",
      "recommendation": "Specific language or section to add"
    }
  ]
}

Rules:
- "score" is an integer 0-100 representing overall compliance (0=nothing met, 100=fully compliant).
- Include 2-5 items per category (met/weak/missing), covering multiple regulatory bodies.
- Use real, accurate regulatory codes — CMS CFR section numbers, Joint Commission standard codes (e.g. IC.01.01.01), DNV NIAHO codes, ISO 9001:2015 clause numbers.
- "finding" should cite specific phrases or the absence of content from the uploaded policy.
- "recommendation" should be actionable — what exact language or element is needed.
- Do NOT fabricate citations. If a standard clearly does not apply, omit it.`;

    const unitLine = instUnits ? `${instUnits.label}: ${unit}` : `Department: ${unit}`;
    const contractedNote = isContractedUnit
      ? `\nThis is a CONTRACTED service. Evaluate the policy specifically for compliance with contracted-service oversight requirements (e.g. §482.12(e) for hospitals, or the equivalent section for this institution type): contract documentation, vendor credentialing, performance monitoring, and service-specific regulatory standards.`
      : "";
    const header = `Institution Type: ${inst.label} (${inst.cfr})\n${unitLine}\nPolicy Topic: ${topicFinal}${contractedNote}\n\nPOLICY TEXT TO ANALYZE:\n`;

    const chunks = chunkText(policyText.trim());

    try {
      const chunkResults = [];
      for (let i = 0; i < chunks.length; i++) {
        setLoadingMsg(
          chunks.length === 1
            ? "Comparing policy against CMS, Joint Commission, DNV, and ISO 9001 standards…"
            : `Analyzing section ${i + 1} of ${chunks.length}…`
        );
        const sectionNote = chunks.length > 1
          ? `\n[This is section ${i + 1} of ${chunks.length} of the full policy document.]`
          : "";
        const raw = await callApi(systemPrompt, header + chunks[i] + sectionNote, 4000);
        chunkResults.push(repairJson(raw));
      }

      const parsed = chunks.length === 1 ? chunkResults[0] : mergeGapResults(chunkResults);
      setResult(parsed);
      const meta = { institution, topic: topicFinal };
      setResultMeta(meta);
      setLoadedEntryId(null);
      const entry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        institution,
        institutionLabel: inst.label,
        topic: topicFinal,
        score: parsed.score ?? null,
        timestamp: new Date().toISOString(),
        result: parsed,
      };
      const updated = saveGapEntry(entry);
      setHistory(updated);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setLoadingMsg("Comparing policy against CMS, Joint Commission, DNV, and ISO 9001 standards…");
    }
  }

  function loadHistoryEntry(entry) {
    setResult(entry.result);
    setResultMeta({ institution: entry.institution, topic: entry.topic });
    setLoadedEntryId(entry.id);
    setShowHistory(false);
    setActionPlan(null);
    setActionPlanError(null);
    // Sync selectors to match the loaded entry
    const matchedTopic = topics.includes(entry.topic) ? entry.topic : topics[0] ?? TOPICS[0];
    setTopic(matchedTopic);
    setCustomTopic(topics.includes(entry.topic) ? "" : entry.topic);
    setError(null);
  }

  function handleDeleteEntry(e, id) {
    e.stopPropagation();
    const updated = deleteGapEntry(id);
    setHistory(updated);
    if (loadedEntryId === id) {
      setResult(null);
      setResultMeta(null);
      setLoadedEntryId(null);
    }
  }

  async function clearSessionData() {
    await purgeEphemeralPolicySession();
    setPolicyText("");
    setFileName(null);
    setResult(null);
    setResultMeta(null);
    setActionPlan(null);
    setHistory([]);
    setShowHistory(false);
    setLoadedEntryId(null);
    setError(null);
  }

  const metCount    = result?.met?.length     || 0;
  const weakCount   = result?.weak?.length    || 0;
  const missingCount = result?.missing?.length || 0;
  const score       = result?.score           ?? null;

  const scoreColor = score === null ? "#64748B" : score >= 75 ? "#065F46" : score >= 50 ? "#92400E" : "#991B1B";
  const scoreBg    = score === null ? "#F1F5F9"  : score >= 75 ? "#D1FAE5"  : score >= 50 ? "#FEF3C7"  : "#FEE2E2";

  // Resolve institution + topic from saved metadata (used for display, copy, and export)
  // so that loading a historical entry from a different institution produces correct labels.
  const effectiveInst = resultMeta
    ? (INSTITUTION_TYPES.find((i) => i.value === resultMeta.institution) || inst)
    : inst;
  const effectiveTopic = resultMeta?.topic || topicFinal;

  const GapItem = ({ item, status }) => {
    const colors = {
      met:     { icon: "✅", color: "#065F46", bg: "#D1FAE5", border: "#6EE7B7" },
      weak:    { icon: "⚠️", color: "#92400E", bg: "#FEF3C7", border: "#FCD34D" },
      missing: { icon: "❌", color: "#991B1B", bg: "#FEE2E2", border: "#FCA5A5" },
    }[status];

    return (
      <div style={{ border: `1px solid ${colors.border}`, borderLeft: `4px solid ${colors.color === "#065F46" ? "#10B981" : colors.color === "#92400E" ? "#F59E0B" : "#EF4444"}`, borderRadius: "7px", padding: "12px 14px", marginBottom: "8px", background: "#FAFAFA" }}>
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", marginBottom: "6px" }}>
          <span style={{ fontSize: "14px" }}>{colors.icon}</span>
          <span style={{ fontFamily: "monospace", fontSize: "11.5px", fontWeight: 700, color: "#475569", background: "#F1F5F9", padding: "1px 6px", borderRadius: "3px" }}>{item.code}</span>
          <span style={{ fontSize: "11px", fontWeight: 700, color: "#64748B", background: "#F1F5F9", padding: "1px 8px", borderRadius: "10px" }}>{item.body}</span>
          <span style={{ fontSize: "13px", fontWeight: 600, color: "#1A2332" }}>{item.title}</span>
        </div>
        <div style={{ marginBottom: status === "met" ? 0 : "6px" }}>
          <span style={{ fontSize: "11px", fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.4px" }}>Finding: </span>
          <span style={{ fontSize: "12.5px", color: "#334155" }}>{item.finding}</span>
        </div>
        {item.recommendation && (
          <div style={{ marginTop: "6px", padding: "7px 10px", background: "#F0FDF4", borderRadius: "5px", borderLeft: "3px solid #10B981" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, color: "#065F46" }}>RECOMMENDED FIX: </span>
            <span style={{ fontSize: "12.5px", color: "#1A2332" }}>{item.recommendation}</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      {/* Input form */}
      <div style={S.card}>
        <div style={S.row}>
          {instUnits && (
            <div>
              <label style={S.label}>{instUnits.label}</label>
              <select style={S.select} value={unit} onChange={(e) => { setUnit(e.target.value); setResult(null); setResultMeta(null); setActionPlan(null); }}>
                <optgroup label="Units / Departments">
                  {instUnits.units.map((d) => <option key={d} value={d}>{d}</option>)}
                </optgroup>
                <optgroup label="Contracted Services">
                  {instUnits.contracted.map((d) => <option key={d} value={d}>{d}</option>)}
                </optgroup>
              </select>
            </div>
          )}
          <div>
            <label style={S.label}>Policy Topic</label>
            <select style={S.select} value={topic} onChange={(e) => { setTopic(e.target.value); setCustomTopic(""); }}>
              {topics.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label style={S.label}>Custom Topic (overrides preset)</label>
            <input style={S.input} type="text" value={customTopic} onChange={(e) => setCustomTopic(e.target.value)} placeholder="e.g. Hand Hygiene Compliance" />
          </div>
        </div>

        {/* PHI Warning */}
        <div style={{ background: "#FEF3C7", border: "1px solid #F59E0B", borderRadius: "7px", padding: "10px 14px", marginBottom: "14px", fontSize: "12px", color: "#92400E", display: "flex", alignItems: "flex-start", gap: "8px", lineHeight: 1.5 }}>
          <span style={{ flexShrink: 0, fontWeight: 700 }}>⚠</span>
          <span><strong>Do not upload documents containing Protected Health Information (PHI).</strong> This Service is not HIPAA-compliant. Policy documents must not include patient names, medical record numbers, dates of service, or any other individually identifiable health information. Ensure all documents are de-identified before upload.</span>
        </div>

        <div style={{ background: "#EFF6FF", border: "1px solid #93C5FD", borderRadius: "7px", padding: "11px 14px", marginBottom: "14px", fontSize: "12px", color: "#1E3A8A", lineHeight: 1.55 }}>
          <strong>Temporary policy processing.</strong> Your policy is parsed in your browser and sent to Anthropic's API only to perform the analysis you request.
          CMS Compliance Suite does not store the uploaded policy, extracted text, or proprietary analysis in its permanent database or file storage.
          This browser session expires after 30 minutes and is cleared on logout. Download results before the session ends.
          Third-party processing is governed by Anthropic's API data-handling terms.
        </div>

        {/* Upload area */}
        <div style={{ marginBottom: "12px" }}>
          <label style={S.label}>Upload Policy Document (PDF, TXT, DOC, DOCX)</label>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <label style={{ ...S.btnSm, display: "inline-block", cursor: "pointer", padding: "8px 14px", background: "#F8FAFC", borderStyle: "dashed" }}>
              {fileLoading ? "Reading…" : "📎 Choose File"}
              <input type="file" accept=".pdf,.txt,.doc,.docx,text/plain,application/pdf" style={{ display: "none" }} onChange={handleFile} disabled={fileLoading} />
            </label>
            {fileName && !fileLoading && (
              <span style={{ fontSize: "12px", color: "#065F46", fontWeight: 600 }}>✓ {fileName}</span>
            )}
            {fileLoading && <span style={{ fontSize: "12px", color: "#64748B" }}>Extracting text…</span>}
            {fileError && <span style={{ fontSize: "12px", color: "#DC2626" }}>⚠ {fileError}</span>}
          </div>
          <div style={{ fontSize: "11px", color: "#94A3B8", marginTop: "5px" }}>
            Upload one policy document at a time. Long documents are automatically analyzed in sections — no need to shorten them first.
          </div>
        </div>

        {/* Text area */}
        <div style={{ marginBottom: "14px" }}>
          <label style={S.label}>Or Paste Policy Text Directly</label>
          <textarea
            style={{ ...S.input, minHeight: "160px", resize: "vertical", lineHeight: 1.55, fontFamily: "system-ui, -apple-system, sans-serif" }}
            value={policyText}
            onChange={(e) => { setPolicyText(e.target.value); if (e.target.value !== policyText) setFileName(null); }}
            placeholder="Paste your existing policy document here…"
          />
          {policyText.length > 0 && (() => {
            const chunks = chunkText(policyText.trim());
            const sectionLabel = chunks.length > 1 ? ` — will be analyzed in ${chunks.length} sections` : "";
            return (
              <div style={{ fontSize: "11px", color: "#94A3B8", marginTop: "4px", textAlign: "right" }}>
                {policyText.length.toLocaleString()} characters{sectionLabel}
              </div>
            );
          })()}
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          <button style={{ ...S.btnPrimary(loading || fileLoading), flex: 1, minWidth: "230px", marginTop: 0 }} onClick={analyze} disabled={loading || fileLoading}>
            {loading ? "Analyzing…" : "🔍 Scan for Compliance Gaps"}
          </button>
          <button
            style={{ padding: "12px 16px", fontSize: "13px", fontWeight: 600, border: "1px solid #CBD5E1", borderRadius: "7px", background: showHistory ? "#0D5C6B" : "#fff", color: showHistory ? "#fff" : "#475569", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}
            onClick={() => setShowHistory((v) => !v)}
          >
            🕒 Session Results{history.length > 0 ? ` (${history.length})` : ""}
          </button>
          <button
            style={{ padding: "12px 14px", fontSize: "12px", fontWeight: 600, border: "1px solid #FCA5A5", borderRadius: "7px", background: "#FEF2F2", color: "#B91C1C", cursor: "pointer", whiteSpace: "nowrap" }}
            onClick={clearSessionData}
          >
            Clear Session Data
          </button>
        </div>
        {error && <div style={S.error}>⚠️ {error}</div>}
      </div>

      {/* History panel */}
      {showHistory && (
        <div style={S.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <div style={{ fontSize: "13px", fontWeight: 700, color: "#1A2332" }}>Temporary Session Results</div>
            <div style={{ fontSize: "11px", color: "#94A3B8" }}>Available only during this browser session</div>
          </div>
          {history.length === 0 ? (
            <div style={{ color: "#94A3B8", fontSize: "13px", textAlign: "center", padding: "20px 0" }}>No temporary results yet. Run a scan to begin this session.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {history.map((entry) => {
                const scoreColor = entry.score === null ? "#64748B" : entry.score >= 75 ? "#065F46" : entry.score >= 50 ? "#92400E" : "#991B1B";
                const scoreBg   = entry.score === null ? "#F1F5F9"  : entry.score >= 75 ? "#D1FAE5"  : entry.score >= 50 ? "#FEF3C7"  : "#FEE2E2";
                const isLoaded  = loadedEntryId === entry.id;
                const instLabel = INSTITUTION_TYPES.find((i) => i.value === entry.institution)?.label || entry.institutionLabel || entry.institution;
                const date = new Date(entry.timestamp);
                const dateStr = date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
                const timeStr = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
                return (
                  <div
                    key={entry.id}
                    onClick={() => loadHistoryEntry(entry)}
                    style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", borderRadius: "7px", border: `1px solid ${isLoaded ? "#0D5C6B" : "#E2E8F0"}`, background: isLoaded ? "#E8F4F5" : "#FAFAFA", cursor: "pointer", transition: "border-color 0.15s" }}
                  >
                    {entry.score !== null && (
                      <div style={{ padding: "4px 10px", borderRadius: "6px", background: scoreBg, color: scoreColor, fontWeight: 700, fontSize: "15px", flexShrink: 0, minWidth: "52px", textAlign: "center" }}>
                        {entry.score}%
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "#1A2332", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.topic}</div>
                      <div style={{ fontSize: "11px", color: "#64748B", marginTop: "2px" }}>{instLabel}</div>
                    </div>
                    <div style={{ fontSize: "11px", color: "#94A3B8", flexShrink: 0, textAlign: "right" }}>
                      <div>{dateStr}</div>
                      <div>{timeStr}</div>
                    </div>
                    {isLoaded && <span style={{ fontSize: "11px", fontWeight: 700, color: "#0D5C6B", background: "#E8F4F5", padding: "2px 7px", borderRadius: "4px", border: "1px solid #0D5C6B", flexShrink: 0 }}>Loaded</span>}
                    <button
                      onClick={(e) => handleDeleteEntry(e, entry.id)}
                      style={{ padding: "3px 7px", fontSize: "11px", border: "1px solid #FCA5A5", borderRadius: "4px", background: "#FEF2F2", color: "#DC2626", cursor: "pointer", flexShrink: 0 }}
                      title="Delete this entry"
                    >✕</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {loading && <div style={S.card}><LoadingSpinner message={loadingMsg} /></div>}

      {result && !loading && (
        <div>
          {/* Side-by-side toggle — only shown when there is policy text to display */}
          {policyText.trim() && (
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "8px" }}>
              <button
                onClick={() => setSideBySide((v) => !v)}
                style={{ padding: "6px 14px", fontSize: "12px", fontWeight: 600, border: "1px solid #CBD5E1", borderRadius: "7px", background: sideBySide ? "#0D5C6B" : "#fff", color: sideBySide ? "#fff" : "#475569", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}
              >
                <span style={{ fontSize: "14px" }}>{sideBySide ? "⬛" : "⬜"}</span>
                {sideBySide ? "Side-by-Side On" : "Side-by-Side Off"}
              </button>
            </div>
          )}

          <div style={{ display: sideBySide && policyText.trim() ? "grid" : "block", gridTemplateColumns: "1fr 1fr", gap: "16px", alignItems: "start" }}>

          {/* Left pane — policy document (only in side-by-side mode) */}
          {sideBySide && policyText.trim() && (
            <div style={{ position: "sticky", top: "80px", maxHeight: "82vh", overflowY: "auto", background: "#fff", border: "1px solid #E2E8F0", borderRadius: "10px", padding: "16px" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#0D5C6B", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>📄 Policy Document</span>
                {fileName && <span style={{ fontSize: "11px", color: "#64748B", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>{fileName}</span>}
              </div>
              <pre style={{ fontSize: "12px", lineHeight: 1.7, color: "#334155", whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0, fontFamily: "system-ui, -apple-system, sans-serif" }}>{policyText}</pre>
            </div>
          )}

          {/* Right pane — results */}
          <div>
          {/* History banner when viewing a loaded entry */}
          {loadedEntryId && (() => {
            const entry = history.find((e) => e.id === loadedEntryId);
            if (!entry) return null;
            const date = new Date(entry.timestamp);
            const dateStr = date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
            const timeStr = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
            return (
              <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: "7px", padding: "10px 14px", marginBottom: "12px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                <span style={{ fontSize: "12.5px", color: "#1E40AF", fontWeight: 600 }}>
                  📂 Viewing saved result from {dateStr} at {timeStr}
                </span>
                <button
                  onClick={() => { setResult(null); setResultMeta(null); setLoadedEntryId(null); }}
                  style={{ padding: "4px 10px", fontSize: "12px", fontWeight: 600, border: "1px solid #93C5FD", borderRadius: "5px", background: "#DBEAFE", color: "#1E40AF", cursor: "pointer" }}
                >
                  Clear
                </button>
              </div>
            );
          })()}

          {/* Score summary */}
          <div style={{ ...S.card, borderLeft: "4px solid #0D5C6B" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
              <div>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#0D5C6B", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Gap Analysis — {effectiveInst.label} · {effectiveTopic}
                </div>
                <div style={{ fontSize: "11px", color: "#64748B", marginTop: "2px" }}>{effectiveInst.cfr}</div>
              </div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <CopyButton text={gapToText(result, effectiveInst, effectiveTopic)} />
                <ExcelButton onClick={() => exportGapXlsx(result, effectiveInst, effectiveTopic)} />
              </div>
            </div>

            {/* Scorecard row */}
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "12px" }}>
              {score !== null && (
                <div style={{ padding: "8px 16px", borderRadius: "8px", background: scoreBg, color: scoreColor, fontWeight: 700, fontSize: "22px", minWidth: "80px", textAlign: "center" }}>
                  {score}%
                  <div style={{ fontSize: "10px", fontWeight: 600, opacity: 0.8, marginTop: "2px" }}>Compliance Score</div>
                </div>
              )}
              {[["✅", metCount, "Met", "#D1FAE5", "#065F46"], ["⚠️", weakCount, "Weak", "#FEF3C7", "#92400E"], ["❌", missingCount, "Missing", "#FEE2E2", "#991B1B"]].map(([icon, count, label, bg, color]) => (
                <div key={label} style={{ padding: "8px 16px", borderRadius: "8px", background: bg, color, fontWeight: 700, fontSize: "18px", minWidth: "70px", textAlign: "center" }}>
                  {icon} {count}
                  <div style={{ fontSize: "10px", fontWeight: 600, opacity: 0.8, marginTop: "2px" }}>{label}</div>
                </div>
              ))}
            </div>

            {/* Progress bar */}
            {score !== null && (
              <div style={{ background: "#E2E8F0", borderRadius: "4px", height: "8px", marginBottom: "10px" }}>
                <div style={{ background: score >= 75 ? "#10B981" : score >= 50 ? "#F59E0B" : "#EF4444", borderRadius: "4px", height: "8px", width: `${score}%`, transition: "width 0.5s" }} />
              </div>
            )}

            <p style={{ margin: 0, fontSize: "13.5px", color: "#334155", lineHeight: 1.6 }}>{result.summary}</p>
            <AiDisclosureBanner />
          </div>

          {/* Met requirements */}
          {result.met?.length > 0 && (
            <div style={S.card}>
              <div style={{ ...S.sectionHead("#065F46", "#D1FAE5"), marginBottom: "12px" }}>
                <h3 style={{ ...S.sectionTitle("#065F46"), fontSize: "13px" }}>✅ Requirements Met ({metCount})</h3>
              </div>
              {result.met.map((item, idx) => <GapItem key={idx} item={item} status="met" />)}
            </div>
          )}

          {/* Weak coverage */}
          {result.weak?.length > 0 && (
            <div style={S.card}>
              <div style={{ ...S.sectionHead("#92400E", "#FEF3C7"), marginBottom: "12px" }}>
                <h3 style={{ ...S.sectionTitle("#92400E"), fontSize: "13px" }}>⚠️ Weak / Partial Coverage ({weakCount})</h3>
              </div>
              {result.weak.map((item, idx) => <GapItem key={idx} item={item} status="weak" />)}
            </div>
          )}

          {/* Missing requirements */}
          {result.missing?.length > 0 && (
            <div style={S.card}>
              <div style={{ ...S.sectionHead("#991B1B", "#FEE2E2"), marginBottom: "12px" }}>
                <h3 style={{ ...S.sectionTitle("#991B1B"), fontSize: "13px" }}>❌ Missing Requirements ({missingCount})</h3>
              </div>
              {result.missing.map((item, idx) => <GapItem key={idx} item={item} status="missing" />)}
            </div>
          )}

          {/* Action Plan section */}
          {(weakCount + missingCount) > 0 && !actionPlan && !actionPlanLoading && (
            <div style={{ textAlign: "center", padding: "8px 0 4px" }}>
              <button
                style={{ padding: "12px 28px", fontSize: "14px", fontWeight: 700, border: "none", borderRadius: "8px", background: "#7C3AED", color: "#fff", cursor: "pointer", boxShadow: "0 2px 8px rgba(124,58,237,0.25)" }}
                onClick={generateActionPlan}
              >
                📋 Generate Remediation Action Plan
              </button>
              <div style={{ fontSize: "11px", color: "#94A3B8", marginTop: "6px" }}>
                Produces a prioritized to-do table with owners, deadlines, and action steps
              </div>
            </div>
          )}

          {actionPlanLoading && (
            <div style={S.card}><LoadingSpinner message="Building your prioritized remediation action plan…" /></div>
          )}

          {actionPlanError && !actionPlanLoading && (
            <div style={S.error}>⚠️ {actionPlanError}</div>
          )}

          {actionPlan && !actionPlanLoading && (
            <div style={{ ...S.card, borderLeft: "4px solid #7C3AED" }}>
              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
                <div>
                  <div style={{ fontSize: "14px", fontWeight: 700, color: "#7C3AED" }}>📋 Remediation Action Plan</div>
                  <div style={{ fontSize: "11px", color: "#64748B", marginTop: "2px" }}>
                    {effectiveInst.label} · {effectiveTopic} · {actionPlan.length} action{actionPlan.length !== 1 ? "s" : ""}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <CopyButton text={actionPlanToText(actionPlan, effectiveInst, effectiveTopic)} label="Copy Plan" />
                  <ExcelButton onClick={() => exportActionPlanXlsx(actionPlan, effectiveInst, effectiveTopic)} label="↓ Excel" />
                  <button
                    style={{ ...S.btnSm }}
                    onClick={() => { setActionPlan(null); setActionPlanError(null); }}
                    title="Dismiss action plan"
                  >✕ Dismiss</button>
                </div>
              </div>

              {/* Table */}
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px" }}>
                  <thead>
                    <tr style={{ background: "#F8F4FF" }}>
                      {["Priority", "Requirement", "Responsible Role", "Deadline", "Action Steps"].map((h) => (
                        <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "#7C3AED", textTransform: "uppercase", letterSpacing: "0.4px", borderBottom: "2px solid #DDD6FE", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {actionPlan.map((action, idx) => {
                      const priColor = action.priority === "High" ? { color: "#991B1B", bg: "#FEE2E2" } : action.priority === "Medium" ? { color: "#92400E", bg: "#FEF3C7" } : { color: "#065F46", bg: "#D1FAE5" };
                      return (
                        <tr key={idx} style={{ borderBottom: "1px solid #EDE9FE", background: idx % 2 === 0 ? "#FAFAFA" : "#fff" }}>
                          <td style={{ padding: "10px 12px", verticalAlign: "top" }}>
                            <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: "10px", fontWeight: 700, fontSize: "11.5px", background: priColor.bg, color: priColor.color, whiteSpace: "nowrap" }}>
                              {action.priority}
                            </span>
                          </td>
                          <td style={{ padding: "10px 12px", verticalAlign: "top", minWidth: "180px" }}>
                            <div style={{ fontWeight: 600, color: "#1A2332", lineHeight: 1.45 }}>{action.requirement}</div>
                            {action.code && (
                              <div style={{ fontSize: "11px", fontFamily: "monospace", color: "#64748B", marginTop: "2px" }}>
                                {action.body && <span style={{ marginRight: "4px", fontFamily: "system-ui" }}>{action.body}</span>}
                                {action.code}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: "10px 12px", verticalAlign: "top", minWidth: "160px", color: "#334155", lineHeight: 1.45 }}>{action.responsibleRole}</td>
                          <td style={{ padding: "10px 12px", verticalAlign: "top", whiteSpace: "nowrap", color: "#334155" }}>{action.suggestedDeadline}</td>
                          <td style={{ padding: "10px 12px", verticalAlign: "top", minWidth: "220px", color: "#334155", lineHeight: 1.55 }}>{action.actionSteps}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          </div> {/* /right pane */}
          </div> {/* /side-by-side grid */}
        </div>
      )}
    </div>
  );
}

// ─── Legal Content ────────────────────────────────────────────────────────────

const TERMS = `TERMS OF SERVICE
Last updated: August 13, 2026

1. ACCEPTANCE OF TERMS
By accessing or using the CMS Compliance Suite ("the Service"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, do not access or use the Service.

2. DEFINITIONS
As used in these Terms:

"Facility" means a single, distinct physical location or CMS-certified site operated under one CMS Certification Number (CCN) or equivalent regulatory identifier.

"Organization" means a legal entity (e.g., a health system or management company) that may own or operate one or more Facilities.

"Subscription" means an active, paid plan that licenses access to the Service for one Facility.

"Authorized User" means an individual employed by, or acting on behalf of, a single licensed Facility who has been granted access credentials under that Facility's Subscription.

3. ACCOUNT USE AND LOGIN RESTRICTIONS

3.1 One Subscription, One Facility. Login credentials issued under a Subscription are licensed for use in connection with the single Facility to which that Subscription applies. Credentials may not be shared, distributed, or otherwise made available for use by, or on behalf of, any other Facility, location, or entity — including other Facilities within the same Organization — without a corresponding, separately paid Subscription for that Facility.

3.2 Authorized Users. A Facility may designate multiple individual users to access its Subscription (e.g., compliance officer, administrator, department heads), provided all such users are acting on behalf of the single licensed Facility. This section does not limit the number of individual staff members at one Facility who may use the Service; it limits use to that one Facility.

3.3 Monitoring for Compliance. CMS Compliance Suite may monitor account usage patterns, including login timestamps, IP addresses, and approximate geographic location, for the purpose of verifying compliance with this Section 3. This monitoring is used solely to enforce these Terms and is not shared for any other purpose except as required by law.

3.4 Suspected Violations. If CMS Compliance Suite reasonably believes that login credentials issued under a single Facility Subscription are being used by, or on behalf of, more than one Facility, CMS Compliance Suite may: (a) request written confirmation from the Organization regarding account usage; (b) require the Organization to purchase additional Subscriptions to bring usage into compliance; and/or (c) suspend or terminate the Subscription without refund if the Organization fails to remedy the violation within fifteen (15) days of written notice.

3.5 No Waiver by Inaction. CMS Compliance Suite's failure to enforce this Section 3 in any instance does not waive its right to enforce it in any other instance.

For multi-facility or enterprise pricing inquiries, contact: HectorSamlut@outlook.com

4. SUBSCRIPTION AND PAYMENT TERMS

4.1 Billing. Subscriptions are billed on a monthly, per-Facility basis. Payment is due at the start of each billing period. By subscribing, you authorize CMS Compliance Suite (or its payment processor) to charge the payment method on file for recurring monthly fees.

4.2 No Refunds. All Subscription fees are non-refundable. Upon cancellation or termination, you retain full access to the Service through the end of the current paid billing period. No partial-month refunds or credits are issued under any circumstances, including early cancellation or termination for a Terms violation.

4.3 Price Changes. CMS Compliance Suite reserves the right to change Subscription pricing at any time. You will receive notice of price changes at least thirty (30) days before they take effect. Continued use of the Service after the effective date of a price change constitutes acceptance of the new pricing.

4.4 Non-Payment. If payment is not received by the due date, access to the Service may be suspended until payment is made current. CMS Compliance Suite is not liable for any loss, damages, or business interruption resulting from suspension due to non-payment.

5. DESCRIPTION OF SERVICE
The Service is an AI-assisted tool designed to help healthcare institutions prepare compliance guidelines, policy templates, inspection readiness checklists, and policy gap analyses based on CMS Conditions of Participation, Joint Commission standards, DNV NIAHO, and ISO 9001:2015.

6. HIPAA AND PROTECTED HEALTH INFORMATION

6.1 Not a HIPAA-Covered Service. This Service is not designed, intended, or configured as a HIPAA-covered service. CMS Compliance Suite does not execute a Business Associate Agreement (BAA) with Subscribers, and no BAA is offered in connection with any Subscription tier.

6.2 No PHI Permitted. You must not submit, upload, paste, or otherwise transmit any Protected Health Information (PHI) through the Service, as that term is defined under the Health Insurance Portability and Accountability Act of 1996 (HIPAA) and its implementing regulations. PHI includes, but is not limited to, patient names, medical record numbers, dates of service, dates of birth, Social Security numbers, geographic identifiers smaller than a state, and any other information that could reasonably be used to identify an individual patient.

6.3 Compliance Documents Only. The Service is intended solely for use with compliance policy documents, regulatory templates, and self-assessment materials. All documents submitted must be de-identified and free of any patient-specific or individually identifiable health information before upload or submission.

6.4 Your Responsibility. If you submit PHI through the Service in violation of this Section 6, you assume full and exclusive liability for any resulting HIPAA violations, breach notification obligations, civil or criminal penalties, or other consequences under federal or state law. CMS Compliance Suite shall bear no liability for PHI submitted in violation of these Terms.

7. NOT LEGAL OR REGULATORY ADVICE
All content generated by the Service is for educational and preparation purposes only. It does not constitute legal advice, regulatory guidance, or a guarantee of survey compliance. All output must be reviewed by qualified compliance counsel and verified against current official regulatory sources before implementation. Regulatory citations should be independently confirmed. User assumes all liability for decisions made based on Service output.

8. ACCURACY OF INFORMATION
The Service uses AI-generated content and live data from publicly available sources (including the Electronic Code of Federal Regulations at eCFR.gov). While we strive for accuracy, we make no warranties that the content is complete, current, or free of error. Regulatory requirements change frequently; users are responsible for verifying all information against official sources.

9. ACCEPTABLE USE
You agree not to:
- Use the Service to generate content intended to deceive regulators or surveyors
- Attempt to circumvent rate limits or access controls
- Reverse-engineer, copy, or redistribute the Service or its underlying prompts and logic
- Use the Service for any unlawful purpose

10. RATE LIMITS
To ensure fair access, the Service enforces request limits per IP address. Excessive automated use is prohibited.

11. INTELLECTUAL PROPERTY
The Service, including its design, prompts, and logic, is proprietary. Generated output documents belong to the user. Joint Commission, DNV NIAHO, and ISO 9001:2015 standards are copyrighted by their respective organizations; the Service does not reproduce or distribute their full text.

12. TERMINATION

12.1 By You. You may cancel your Subscription at any time through your account settings or by contacting HectorSamlut@outlook.com. Cancellation takes effect at the end of the current billing period; no refunds are issued for any unused portion of the period.

12.2 By Us. CMS Compliance Suite may suspend or terminate your account immediately, without prior notice or refund, if you breach these Terms (including Section 3), provide false information at registration, or engage in conduct that CMS Compliance Suite reasonably determines to be harmful to other users, the Service, or third parties.

12.3 Effect of Termination. Upon termination, your right to access the Service ceases immediately. Data stored in your browser's local storage (e.g., gap analysis history) remains accessible locally but cannot be recovered from our servers after account deletion. To request permanent deletion of your account data, contact HectorSamlut@outlook.com.

13. DISCLAIMER OF WARRANTIES
THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT. CMS COP COMPLIANCE SUITE DOES NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR SECURE.

14. LIMITATION OF LIABILITY
TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, CMS COP COMPLIANCE SUITE AND ITS OPERATORS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, OR CONSEQUENTIAL DAMAGES ARISING FROM USE OF THE SERVICE, INCLUDING SURVEY DEFICIENCIES, CERTIFICATION ACTIONS, OR REGULATORY PENALTIES. IN NO EVENT SHALL OUR TOTAL LIABILITY TO YOU FOR ANY CLAIM ARISING UNDER THESE TERMS EXCEED THE TOTAL AMOUNT YOU PAID FOR THE SERVICE IN THE THREE (3) MONTHS IMMEDIATELY PRECEDING THE CLAIM.

15. INDEMNIFICATION
You agree to indemnify, defend, and hold harmless CMS Compliance Suite and its operators from and against any and all claims, damages, losses, costs, and expenses (including reasonable attorneys' fees) arising out of or relating to: (a) your use of the Service in violation of these Terms; (b) your violation of any applicable law or regulation; or (c) your infringement of any third-party right.

16. GOVERNING LAW AND JURISDICTION
These Terms are governed by and construed in accordance with the laws of the State of Florida, without regard to its conflict-of-law principles. Any legal action or proceeding arising under or relating to these Terms shall be brought exclusively in the state or federal courts located in the State of Florida, and you hereby irrevocably consent to the personal jurisdiction and venue of such courts.

17. SEVERABILITY AND ENTIRE AGREEMENT
If any provision of these Terms is found by a court of competent jurisdiction to be unenforceable or invalid, that provision shall be limited or eliminated to the minimum extent necessary such that the remaining Terms shall continue in full force and effect. These Terms, together with the Privacy Policy, constitute the entire agreement between you and CMS Compliance Suite with respect to your use of the Service and supersede all prior or contemporaneous agreements and understandings.

18. PRIVACY POLICY
Your use of the Service is also governed by our Privacy Policy, incorporated herein by reference. By using the Service, you confirm that you have read and understood the Privacy Policy.

19. MODIFICATIONS
We reserve the right to modify these Terms at any time. We will provide notice of material changes by updating the "Last Updated" date at the top of this document. Continued use of the Service after the effective date of any change constitutes acceptance of the revised Terms.

20. CONTACT
Questions about these Terms may be directed to: HectorSamlut@outlook.com`;

const PRIVACY = `PRIVACY POLICY
Last updated: September 6, 2026

1. OVERVIEW
This Privacy Policy explains how the CMS Compliance Suite ("the Service") handles your information. We are committed to collecting only what is necessary to operate the Service and to keeping your data secure.

2. ACCOUNT INFORMATION
The Service requires you to create an account to access its features. Account registration and authentication are handled by Clerk (clerk.com), a third-party identity platform. When you register, Clerk collects and stores:
- Your email address
- Your name (if provided)
- Hashed password credentials
- Authentication tokens and session metadata

We receive a user identifier from Clerk to associate your account with your facility record and subscription. We do not have access to your plaintext password. Clerk's Privacy Policy (clerk.com/privacy) governs how Clerk processes your authentication data.

3. FACILITY AND SUBSCRIPTION DATA
To support per-facility subscriptions, we store the following on our servers:
- Your account identifier and email (as provided by Clerk)
- Your facility name and CMS Certification Number (CCN), if you provide them during registration
- Your subscription status and billing tier
- Login event logs (timestamp, IP address, approximate region) retained for 90 days for security and license compliance purposes

4. TEMPORARY POLICY AND ANALYSIS DATA
Uploaded policy files are parsed in your browser. The extracted policy text, organization-specific analysis, and generated recommendations are held only in temporary browser session storage so an active analysis can survive a page refresh. This temporary session expires after 30 minutes, is cleared when you log out, and normally ends when the browser tab closes.

The Service does not place uploaded policies, extracted policy text, organization-specific analysis, generated policy documents, or proprietary recommendations into its permanent application database or permanent file/object storage. Results must be downloaded before the temporary session ends. Older gap-analysis data created by prior releases in permanent browser local storage is removed when the updated scanner opens.

5. FEEDBACK EMAILS
If you use the "Share Feedback" button, your email client will open a pre-addressed message to HectorSamlut@outlook.com. We receive only what you choose to write. We do not use third-party email tracking.

6. AI PROCESSING
Text you submit for analysis (policy documents, compliance topics, provider type, and department/unit) is sent to Anthropic's API only to perform the analysis or generation you request. CMS Compliance Suite does not use that content to train its own models. Anthropic's handling of API data is governed by Anthropic's applicable API terms and privacy documentation. Do not submit PHI or content you are not authorized to process.

Generated AI responses are held briefly in server memory while your browser retrieves them. A completed result is deleted after retrieval; unclaimed jobs expire automatically within 10 minutes. Technical usage records contain token counts and costs, not policy text or generated content.

7. LIVE REGULATORY DATA
The Service fetches publicly available regulatory text from the Electronic Code of Federal Regulations (eCFR.gov). No personal data is transmitted in these requests.

8. COOKIES AND TRACKING
The Service uses session cookies set by Clerk solely for authentication. We do not use advertising cookies, tracking pixels, or third-party analytics. The hosting platform (Replit) may set technical cookies necessary for operation; please see Replit's Privacy Policy for details.

9. DATA SECURITY
Account data is transmitted over HTTPS. Login events are logged for license compliance and security auditing (see Section 3). We do not expose server credentials or API keys to the browser.

10. CHILDREN'S PRIVACY
The Service is intended for healthcare compliance professionals and is not directed at children under 13. We do not knowingly collect information from children.

11. CALIFORNIA PRIVACY RIGHTS (CCPA)
If you are a California resident, you have the following rights under the California Consumer Privacy Act (CCPA): (a) the right to know what personal information we collect, use, and disclose about you; (b) the right to request deletion of your personal information, subject to certain exceptions; and (c) the right to opt out of the sale of your personal information — we do not sell personal information. To exercise these rights, contact us at HectorSamlut@outlook.com with the subject line "CCPA Privacy Request." We will respond within 45 days. Note that certain information may be retained as required by law or to complete transactions you have requested (e.g., billing records during or after an active Subscription period). We will not discriminate against you for exercising any of your CCPA rights.

12. CHANGES TO THIS POLICY
We may update this Privacy Policy from time to time. The "last updated" date at the top will reflect any changes. Continued use of the Service after changes constitutes acceptance of the updated Policy.

13. CONTACT
For privacy questions or concerns, contact: HectorSamlut@outlook.com`;

// ─── Legal Modal ──────────────────────────────────────────────────────────────

function LegalModal({ title, content, onClose }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}
      onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: "12px", maxWidth: "720px", width: "100%", maxHeight: "80vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}
        onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 24px", borderBottom: "1px solid #E2E8F0" }}>
          <div style={{ fontSize: "16px", fontWeight: 700, color: "#0D5C6B" }}>{title}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "#64748B", lineHeight: 1 }}>×</button>
        </div>
        {/* Body */}
        <div style={{ overflowY: "auto", padding: "20px 24px" }}>
          <pre style={{ whiteSpace: "pre-wrap", fontFamily: "system-ui, -apple-system, sans-serif", fontSize: "12.5px", lineHeight: 1.75, color: "#334155", margin: 0 }}>{content}</pre>
        </div>
        {/* Footer */}
        <div style={{ padding: "14px 24px", borderTop: "1px solid #E2E8F0", textAlign: "right" }}>
          <button onClick={onClose} style={{ padding: "8px 20px", background: "#0D5C6B", color: "#fff", border: "none", borderRadius: "6px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function Footer({ onTerms, onPrivacy }) {
  return (
    <div style={{ borderTop: "1px solid #E2E8F0", marginTop: "40px", padding: "20px 32px", background: "#F8FAFC", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
      <div style={{ fontSize: "12px", color: "#94A3B8" }}>
        © {new Date().getFullYear()} CMS Compliance Suite. AI-generated content is not legal advice.
      </div>
      <div style={{ display: "flex", gap: "16px" }}>
        <button onClick={onTerms} style={{ background: "none", border: "none", fontSize: "12px", color: "#64748B", cursor: "pointer", textDecoration: "underline", padding: 0 }}>Terms of Service</button>
        <button onClick={onPrivacy} style={{ background: "none", border: "none", fontSize: "12px", color: "#64748B", cursor: "pointer", textDecoration: "underline", padding: 0 }}>Privacy Policy</button>
        <a href="mailto:HectorSamlut@outlook.com" style={{ fontSize: "12px", color: "#64748B", textDecoration: "underline" }}>Contact</a>
      </div>
    </div>
  );
}

// ─── Admin Quick Panel (super-admin only, embedded in main page) ──────────────

function AdminQuickPanel({ basePath, onClose }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  useEffect(() => {
    fetch(`${basePath}/api/admin/stats?month=${month}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => { setStats(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [basePath, month]);

  function dl(type) {
    window.open(`${basePath}/api/admin/reports/download?type=${type}&month=${encodeURIComponent(month)}`, "_blank");
  }

  const fN = (n) => (n != null ? Number(n).toLocaleString("en-US") : "—");
  const fD = (n) => (n != null ? "$" + Number(n).toFixed(2) : "—");

  return (
    <div style={{ background: "#0B1F3A", borderBottom: "2px solid rgba(245,197,66,0.35)", padding: "18px 32px" }}>
      <div style={{ maxWidth: "960px", margin: "0 auto" }}>

        {/* Panel header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
          <div>
            <div style={{ color: "#F5C542", fontWeight: 800, fontSize: "15px", letterSpacing: "-0.2px" }}>⚙ Admin Quick Access</div>
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "11px", marginTop: "2px" }}>
              {loading ? "Loading…" : `${stats?.monthLabel ?? month} · Platform overview`}
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <a href={`${basePath}/admin`} style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "7px 16px", background: "#F5C542", borderRadius: "6px", color: "#0B1F3A", fontWeight: 700, fontSize: "12px", textDecoration: "none", whiteSpace: "nowrap" }}>
              Full Dashboard →
            </a>
            <button onClick={onClose} style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "6px", color: "rgba(255,255,255,0.55)", fontSize: "16px", lineHeight: 1, padding: "4px 11px", cursor: "pointer" }}>×</button>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px", marginBottom: "14px" }}>
          {[
            { label: "Total Facilities", value: fN(stats?.totalFacilities), color: "#60A5FA" },
            { label: "Active Subscriptions", value: fN(stats?.activeSubscriptions), color: "#34D399" },
            { label: "Trial Accounts", value: fN(stats?.trialAccounts), color: "#FBBF24" },
            { label: "Token Revenue (month)", value: fD(stats?.thisMonth?.totalChargeUsd), color: "#C4B5FD" },
          ].map((s) => (
            <div key={s.label} style={{ background: "rgba(255,255,255,0.05)", borderRadius: "8px", padding: "11px 14px", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.38)", fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", marginBottom: "5px" }}>{s.label}</div>
              <div style={{ fontSize: "22px", fontWeight: 900, color: s.color, lineHeight: 1 }}>{loading ? "…" : s.value}</div>
            </div>
          ))}
        </div>

        {/* Reports row */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
          <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.35)", fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", marginRight: "4px" }}>Download Reports:</span>
          {[
            { id: "clients", label: "📋 Client List" },
            { id: "tokens",  label: "⚡ Token Usage" },
            { id: "revenue", label: "💰 Revenue Summary" },
          ].map((r) => (
            <button key={r.id} onClick={() => dl(r.id)} style={{ padding: "6px 14px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "6px", color: "#fff", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
              {r.label}
            </button>
          ))}
          <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.22)", margin: "0 2px" }}>·</span>
          <a href={`${basePath}/admin`} style={{ fontSize: "12px", color: "rgba(255,255,255,0.45)", textDecoration: "none", fontWeight: 600 }}>Manage clients · Team access · Email reports →</a>
        </div>

      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function CoPGuidelineBuilder({ onSignOut, clerkUserId }) {
  const [tab, setTab] = useState(() => {
    try {
      const savedTab = sessionStorage.getItem(ACTIVE_WORKSPACE_TAB_KEY);
      return ["guidelines", "policy", "inspection", "gap"].includes(savedTab) ? savedTab : "guidelines";
    } catch {
      return "guidelines";
    }
  });
  const [institution, setInstitution] = useState(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("cms-compliance-provider-type") : null;
    return saved && getProviderProfile(saved) ? saved : "hospital";
  });
  const [legal, setLegal] = useState(null); // "terms" | "privacy" | null
  const [adminOpen, setAdminOpen] = useState(false);
  const { data: accountData } = useAccount();
  // Check Clerk user ID directly (no API/cache dependency) + fall back to server flags
  const isAdmin = ADMIN_CLERK_IDS.includes(clerkUserId ?? "")
    || accountData?.isSuperAdmin
    || accountData?.isAdminUser;
  const basePath = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
  const selectedProvider = getProviderProfile(institution);
  const providerContentAvailable = isProviderContentAvailable(institution);

  useEffect(() => {
    localStorage.setItem("cms-compliance-provider-type", institution);
  }, [institution]);

  useEffect(() => {
    try { sessionStorage.setItem(ACTIVE_WORKSPACE_TAB_KEY, tab); } catch {}
  }, [tab]);

  return (
    <div style={S.page}>
      {legal === "terms"   && <LegalModal title="Terms of Service" content={TERMS}   onClose={() => setLegal(null)} />}
      {legal === "privacy" && <LegalModal title="Privacy Policy"   content={PRIVACY} onClose={() => setLegal(null)} />}
      {/* Header */}
      <div style={S.header}>
        <div style={{ maxWidth: "960px", margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <h1 style={S.headerTitle}>CMS Compliance Suite</h1>
            <span style={{ fontSize: "11px", fontWeight: 700, background: "#F59E0B", color: "#78350F", padding: "2px 8px", borderRadius: "10px", letterSpacing: "0.5px" }}>BETA</span>
          </div>
          <p style={S.headerSub}>CoP & CfC Compliance + Survey Readiness</p>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
            <div style={{ ...S.disclaimer, flex: 1, marginTop: "14px" }}>
              <strong>⚠ Important Disclaimer:</strong> This tool generates AI-assisted content for educational and preparation purposes only.
              Output is <strong>not legal advice</strong> and must be reviewed by qualified compliance counsel before implementation.
              Regulatory citations should be verified against current official sources. User assumes all liability.
            </div>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", marginTop: "14px", flexShrink: 0, overflowX: "auto", maxWidth: "100%", paddingBottom: "4px" }}>
              {/* ⚙ Admin button — super-admin only, very prominent amber */}
              {isAdmin && (
                <button
                  onClick={() => setAdminOpen((o) => !o)}
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 16px", background: adminOpen ? "#F5C542" : "rgba(245,197,66,0.22)", border: "2px solid #F5C542", borderRadius: "7px", color: adminOpen ? "#0B1F3A" : "#F5C542", fontSize: "13px", fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap", letterSpacing: "-0.2px" }}>
                  ⚙ Admin
                </button>
              )}
              <a href={`${basePath}/billing`}
                style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "8px 14px", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.25)", borderRadius: "6px", color: "#fff", fontSize: "12px", fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap" }}>
                💳 Billing
              </a>
              <a href="mailto:HectorSamlut@outlook.com?subject=CMS Compliance Suite Feedback&body=Provider type tested:%0ATabs used:%0AWhat worked well:%0AWhat could be improved:%0AOther suggestions:"
                style={{ display: "inline-block", padding: "8px 14px", background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", borderRadius: "6px", color: "#fff", fontSize: "12px", fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap" }}>
                ✉ Share Feedback
              </a>
              <button
                onClick={() => onSignOut?.()}
                style={{ padding: "8px 14px", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.25)", borderRadius: "6px", color: "#fff", fontSize: "12px", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Admin quick panel — toggles open when ⚙ Admin button is clicked */}
      {isAdmin && adminOpen && <AdminQuickPanel basePath={basePath} onClose={() => setAdminOpen(false)} />}

      <div style={S.container}>
        <OnboardingBanner />
        {/* Provider selector */}
        <div style={{ ...S.card, marginBottom: "20px" }}>
          <label style={S.label}>Select Your Provider Type</label>
          <p style={{ margin: "-3px 0 14px", color: "#64748B", fontSize: "12px" }}>
            Provider Category → Provider Type → Compliance Workspace
          </p>
          <div style={{ display: "grid", gap: "16px" }}>
            {PROVIDER_CATEGORIES.map((category) => {
              const providers = getProvidersByCategory(category.id);
              return (
                <section key={category.id}>
                  <div style={{ fontSize: "11px", fontWeight: 800, letterSpacing: "0.7px", textTransform: "uppercase", color: "#0D5C6B", marginBottom: "7px" }}>
                    {category.label}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "8px" }}>
                    {providers.map((provider) => (
                      <button key={provider.id} onClick={() => setInstitution(provider.id)} style={{
                        padding: "10px 12px", fontSize: "12px", fontWeight: 600, textAlign: "left",
                        border: `2px solid ${institution === provider.id ? "#0D5C6B" : "#E2E8F0"}`,
                        borderRadius: "7px", cursor: "pointer",
                        background: institution === provider.id ? "#E8F4F5" : "#fff",
                        color: institution === provider.id ? "#0D5C6B" : "#475569",
                      }}>
                        <div>{provider.name}{provider.abbreviation ? ` (${provider.abbreviation})` : ""}</div>
                        <div style={{ fontSize: "10px", fontWeight: 500, marginTop: "3px", color: provider.contentStatus === "pending-verification" ? "#B45309" : "inherit", opacity: 0.82 }}>
                          {provider.displayReference}
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </div>

        {/* Tabs */}
        <div style={S.tabs}>
          <Tab label="📋 Compliance Guidelines" active={tab === "guidelines"} onClick={() => setTab("guidelines")} />
          <Tab label="📄 Policy Templates" active={tab === "policy"} onClick={() => setTab("policy")} />
          <Tab label="🔍 Inspection Readiness" active={tab === "inspection"} onClick={() => setTab("inspection")} />
          <Tab label="🩺 Policy Gap Scanner" active={tab === "gap"} onClick={() => setTab("gap")} />
        </div>

        {/* Tab content */}
        {!providerContentAvailable ? (
          <div style={{ ...S.card, borderLeft: "4px solid #F59E0B", background: "#FFFBEB" }}>
            <div style={{ fontSize: "14px", fontWeight: 800, color: "#92400E", marginBottom: "6px" }}>
              Content Pending Verification
            </div>
            <div style={{ fontSize: "13px", lineHeight: 1.65, color: "#78350F" }}>
              The compliance workspace for <strong>{selectedProvider?.name}</strong> is architected and ready for content,
              but its official CMS requirements and CFR references have not yet been verified. Generation tools are
              intentionally unavailable for this provider until sourced regulatory content is added.
            </div>
          </div>
        ) : (
          <>
            {tab === "guidelines" && <GuidelinesTab institution={institution} />}
            {tab === "policy"     && <PolicyTab     institution={institution} />}
            {tab === "inspection" && <InspectionTab institution={institution} />}
            {tab === "gap"        && <GapScannerTab institution={institution} />}
          </>
        )}
      </div>
      <Footer onTerms={() => setLegal("terms")} onPrivacy={() => setLegal("privacy")} />
    </div>
  );
}
