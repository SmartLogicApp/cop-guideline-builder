export type ApplicationAgreement = { version: string; body: string; contentSha256: string };

export function canSubmitApplication(
  agreement: ApplicationAgreement | null,
  agreed: boolean,
  agreementLoading: boolean,
): boolean {
  return agreement !== null && agreed === true && !agreementLoading;
}