export interface CmsDataset {
  id: string;
  ccnField: string;
  nameField: string;
  stateField: string;
  cityField: string;
  type: string;
}

export const CMS_DATASETS: readonly CmsDataset[] = [
  { id: "xubh-q36u", ccnField: "facility_id", nameField: "facility_name",
    stateField: "state", cityField: "city", type: "hospital" },
  { id: "s5hk-2gjn", ccnField: "federal_provider_number", nameField: "provider_name",
    stateField: "provider_state", cityField: "provider_city", type: "snf" },
  { id: "qqw3-t4ie", ccnField: "cms_certification_number_ccn", nameField: "provider_name",
    stateField: "state", cityField: "city", type: "hha" },
  { id: "yc7d-nc2q", ccnField: "cms_certification_number_ccn", nameField: "facility_name",
    stateField: "state", cityField: "city", type: "hospice" },
  { id: "7t8x-u3ir", ccnField: "cms_certification_number_ccn", nameField: "provider_name",
    stateField: "state", cityField: "citytown", type: "irf" },
  { id: "4jcv-atw7", ccnField: "facility_id", nameField: "facility_name",
    stateField: "state", cityField: "citytown", type: "asc" },
  { id: "23ew-n7w9", ccnField: "cms_certification_number_ccn", nameField: "facility_name",
    stateField: "state", cityField: "citytown", type: "esrd" },
] as const;

export const MANUAL_VERIFICATION_TYPES = new Set([
  "fqhc",
  "corf",
  "cmhc",
  "opo",
  "xray",
]);

export const MANUAL_VERIFICATION_MESSAGE =
  "CMS does not publish this provider type in a queryable Care Compare dataset. You can continue with registration and the facility will be reviewed manually.";

const HOSPITAL_DATASET_TYPES = new Set([
  "hospital",
  "cah",
  "psych",
  "ltch",
  "childrens",
]);

export function isValidProviderIdentifier(identifier: string, institutionType?: string): boolean {
  if (institutionType === "asc") return /^[A-Z0-9]{10}$/.test(identifier);
  return /^[A-Z0-9]{6}$/.test(identifier);
}

export function providerIdentifierError(institutionType?: string): string {
  return institutionType === "asc"
    ? "ASC CMS Certification Number must be exactly 10 alphanumeric characters"
    : "CCN must be exactly 6 alphanumeric characters";
}

function datasetsForInstitution(institutionType?: string): readonly CmsDataset[] {
  if (!institutionType) return CMS_DATASETS;
  if (HOSPITAL_DATASET_TYPES.has(institutionType)) {
    return CMS_DATASETS.filter((dataset) => dataset.type === "hospital");
  }
  return CMS_DATASETS.filter((dataset) => dataset.type === institutionType);
}

export async function lookupCCN(
  ccn: string,
  institutionType?: string,
  fetchImpl: typeof fetch = fetch,
) {
  for (const dataset of datasetsForInstitution(institutionType)) {
    try {
      const response = await fetchImpl(
        `https://data.cms.gov/provider-data/api/1/datastore/query/${dataset.id}/0`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conditions: [{ property: dataset.ccnField, value: ccn, operator: "=" }],
            limit: 1,
          }),
          signal: AbortSignal.timeout(6_000),
        },
      );
      if (!response.ok) continue;
      const data = await response.json() as {
        results?: Array<Record<string, unknown>>;
        data?: Array<Record<string, unknown>>;
      };
      const row = data.results?.[0] ?? data.data?.[0];
      if (row) {
        return {
          found: true,
          facilityName: row[dataset.nameField] ?? null,
          state: row[dataset.stateField] ?? null,
          city: row[dataset.cityField] ?? null,
          facilityType: institutionType ?? dataset.type,
        };
      }
    } catch {
      // A failed source must not prevent trying the remaining eligible datasets.
    }
  }
  return { found: false, facilityName: null, state: null, city: null, facilityType: institutionType ?? null };
}