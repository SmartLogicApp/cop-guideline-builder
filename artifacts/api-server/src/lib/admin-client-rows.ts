type AccountUserIdentity = { clerkUserId: string; email: string | null; accountId: string | null };
type AffiliateContact = {
  id: string;
  status: string | null;
  clerkUserId: string | null;
  companyName: string | null;
  contactName: string | null;
  email: string;
  phone: string | null;
  createdAt: Date | string | null;
  isTest?: boolean;
};

type AdminClientRow = {
  id: string;
  facilityName: string;
  createdAt: Date | string | null;
  status: string;
  nextBillingDate: Date | string | null;
  contact: { name: string | null; email: string | null; phone: string | null } | undefined;
  referredBy: string | null;
  totalTokens: number;
  thisMonth: { totalTokens: number };
  isClientAccount: boolean;
  isTest?: boolean;
};

/** `includeTest` is explicit and off unless the admin sends `?includeTest=true`. */
export function parseIncludeTest(value: unknown): boolean {
  return value === "true";
}

/** Keep test rows available for authorized review while excluding them by default. */
export function includeTestRows<T extends { isTest?: boolean }>(rows: T[], includeTest = false): T[] {
  return includeTest ? rows : rows.filter((row) => row.isTest !== true);
}

/**
 * Keep each subscription account row (including direct-client accounts) and
 * merge an active affiliate contact into it when account ownership matches by
 * Clerk ID or normalized email. Unmatched active affiliate contacts are added
 * once as affiliate-only rows.
 */
export function includeActiveAffiliateContacts(
  clients: AdminClientRow[],
  users: AccountUserIdentity[],
  affiliates: AffiliateContact[],
  includeTest = false,
): Array<AdminClientRow & {
  type: "Client" | "Affiliate";
  affiliateId: string | null;
  clientIsTest: boolean;
  affiliateIsTest: boolean;
  isTest: boolean;
}> {
  const visibleClients = includeTestRows(clients, includeTest);
  const affiliatesForMatching = includeTest ? affiliates : includeTestRows(affiliates);
  const affiliateByOwner = new Map<string, AffiliateContact>();
  const uniqueActiveAffiliates: AffiliateContact[] = [];
  const seenAffiliateOwners = new Set<string>();
  for (const affiliate of affiliatesForMatching) {
    if (affiliate.status !== "active") continue;
    const emailKey = `email:${affiliate.email.trim().toLowerCase()}`;
    const clerkKey = affiliate.clerkUserId ? `clerk:${affiliate.clerkUserId}` : null;
    if (seenAffiliateOwners.has(emailKey) || (clerkKey && seenAffiliateOwners.has(clerkKey))) continue;
    seenAffiliateOwners.add(emailKey);
    if (clerkKey) seenAffiliateOwners.add(clerkKey);
    uniqueActiveAffiliates.push(affiliate);
    affiliateByOwner.set(emailKey, affiliate);
    if (clerkKey) affiliateByOwner.set(clerkKey, affiliate);
  }

  const affiliateByAccount = new Map<string, AffiliateContact>();
  for (const user of users) {
    if (!user.accountId) continue;
    const affiliate = affiliateByOwner.get(`clerk:${user.clerkUserId}`)
      ?? (user.email ? affiliateByOwner.get(`email:${user.email.trim().toLowerCase()}`) : undefined);
    if (affiliate && !affiliateByAccount.has(user.accountId)) {
      affiliateByAccount.set(user.accountId, affiliate);
    }
  }

  const representedAffiliates = new Set<string>();
  const rows: Array<AdminClientRow & {
    type: "Client" | "Affiliate";
    affiliateId: string | null;
    clientIsTest: boolean;
    affiliateIsTest: boolean;
    isTest: boolean;
  }> = visibleClients.map((client) => {
    const affiliate = affiliateByAccount.get(client.id);
    const clientIsTest = client.isTest === true;
    if (!affiliate) {
      return {
        ...client,
        type: "Client" as const,
        affiliateId: null,
        clientIsTest,
        affiliateIsTest: false,
        isTest: clientIsTest,
      };
    }
    representedAffiliates.add(affiliate.id);
    const affiliateIsTest = affiliate.isTest === true;
    return {
      ...client,
      type: "Affiliate" as const,
      affiliateId: affiliate.id,
      clientIsTest,
      affiliateIsTest,
      isTest: clientIsTest || affiliateIsTest,
      contact: {
        name: affiliate.contactName,
        email: affiliate.email,
        phone: affiliate.phone,
      },
    };
  });

  for (const affiliate of uniqueActiveAffiliates) {
    if (representedAffiliates.has(affiliate.id)) continue;
    rows.push({
      id: `affiliate:${affiliate.id}`,
      affiliateId: affiliate.id,
      facilityName: affiliate.companyName || affiliate.contactName || affiliate.email,
      createdAt: affiliate.createdAt,
      status: "Active",
      nextBillingDate: null,
      contact: {
        name: affiliate.contactName,
        email: affiliate.email,
        phone: affiliate.phone,
      },
      referredBy: null,
      totalTokens: 0,
      thisMonth: { totalTokens: 0 },
      isClientAccount: false,
      clientIsTest: false,
      isTest: affiliate.isTest === true,
      affiliateIsTest: affiliate.isTest === true,
      type: "Affiliate",
    });
  }
  return includeTestRows(rows, includeTest);
}