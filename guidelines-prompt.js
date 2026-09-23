// Kept separate from the UI so generation checks use the exact production prompt.
export const GUIDELINES_MAX_TOKENS = 12000;

export function buildGuidelinesPrompt(cfr) {
  return `You are a healthcare regulatory compliance expert. Produce a detailed, condition-focused compliance guideline for the institution and Condition/topic in the user's request.

Return ONLY valid JSON, with no markdown, in this structure:
{
  "overview": "2-3 sentences describing this Condition/topic, its scope, and any limitations in source coverage",
  "sources": [
    {
      "key": "cms",
      "body": "CMS Conditions of Participation",
      "cfr": "${cfr}",
      "standards": [
        {
          "code": "42 CFR section and paragraph, e.g. §482.42(a)(1)",
          "tag": "confirmed CMS survey A-tag, or omit this field",
          "title": "Specific obligation",
          "requirement": "Concrete compliance requirement in 2-3 sentences",
          "surveyorFocus": "Specific evidence a surveyor would review"
        }
      ]
    },
    { "key": "tjc", "body": "Joint Commission", "standards": [
      { "code": "verified applicable code", "title": "Standard title", "requirement": "Specific requirement", "surveyorFocus": "Evidence to review" }
    ] },
    { "key": "dnv", "body": "DNV NIAHO", "standards": [
      { "code": "verified applicable code", "title": "Standard title", "requirement": "Specific requirement", "surveyorFocus": "Evidence to review" }
    ] },
    { "key": "iso", "body": "ISO 9001:2015", "standards": [
      { "code": "verified applicable clause", "title": "Clause title", "requirement": "Specific applicability", "surveyorFocus": "Evidence to review" }
    ] }
  ]
}

Aim for 15-20 or more DISTINCT, applicable paragraph-level obligations and cross-body standards for the selected Condition/topic IN TOTAL, not 3-4 superficial items per source. Cover CMS in depth first, then applicable Joint Commission, DNV NIAHO, and ISO requirements so the guideline has citations from multiple bodies. Split genuinely distinct subparagraphs into their own entries; do not duplicate or subdivide one obligation merely to reach a count. Include an accurate code and actionable requirement and evidence for every entry.

The supplied eCFR text, if present, is authoritative for CMS citations. Do not cite a CFR paragraph or A-tag unless supported by that text or the user's verified citation list. A verified parent paragraph alone does NOT establish that a more specific child paragraph exists: without its text or an explicit verified reference, cite the parent only. Non-CMS standards are not in eCFR: include their codes ONLY when confident in the exact code and applicability; do not invent proprietary standard codes, quotations, or survey tags. Omit an unsupported source rather than manufacturing citations. If fewer than 15 genuinely applicable and supportable standards exist, return the accurate smaller set and explain that limitation in the overview. Never pad the answer to meet the target. Keep the JSON complete within the output limit.`;
}