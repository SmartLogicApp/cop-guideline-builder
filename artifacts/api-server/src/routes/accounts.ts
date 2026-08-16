import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { accounts, accountUsers, adminUsers } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router: IRouter = Router();

// ─── Auth middleware ──────────────────────────────────────────────────────────

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const auth = getAuth(req as any);
  const userId = auth?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  (req as any).clerkUserId = userId;
  (req as any).clerkEmail = (auth as any)?.sessionClaims?.email ?? null;
  next();
}

// ─── CCN lookup via CMS Care Compare API ────────────────────────────────────

const CMS_DATASETS = [
  // Hospitals  (field: facility_id)
  { id: "xubh-q36u", ccnField: "facility_id", nameField: "facility_name",
    stateField: "state", cityField: "city", type: "hospital" },
  // Skilled Nursing Facilities  (field: federal_provider_number)
  { id: "s5hk-2gjn", ccnField: "federal_provider_number", nameField: "provider_name",
    stateField: "provider_state", cityField: "provider_city", type: "snf" },
  // Home Health Agencies  (field: cms_certification_number_ccn)
  { id: "qqw3-t4ie", ccnField: "cms_certification_number_ccn", nameField: "provider_name",
    stateField: "state", cityField: "city", type: "hha" },
  // Hospice  (field: cms_certification_number_ccn)
  { id: "yc7d-nc2q", ccnField: "cms_certification_number_ccn", nameField: "facility_name",
    stateField: "state", cityField: "city", type: "hospice" },
];

async function lookupCCN(ccn: string) {
  for (const ds of CMS_DATASETS) {
    try {
      const resp = await fetch(
        `https://data.cms.gov/provider-data/api/1/datastore/query/${ds.id}/0`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conditions: [{ property: ds.ccnField, value: ccn.toUpperCase(), operator: "=" }],
            limit: 1,
          }),
          signal: AbortSignal.timeout(6_000),
        },
      );
      if (!resp.ok) continue;
      const data = await resp.json();
      const row = data?.results?.[0] ?? data?.data?.[0];
      if (row) {
        return {
          found: true,
          facilityName: row[ds.nameField] ?? null,
          state:        row[ds.stateField] ?? null,
          city:         row[ds.cityField] ?? null,
          facilityType: ds.type,
        };
      }
    } catch {
      // network error or timeout → try next dataset
    }
  }
  return { found: false, facilityName: null, state: null, city: null, facilityType: null };
}

// ─── Routes ──────────────────────────────────────────────────────────────────

// GET /api/accounts/validate-ccn?ccn=XXXXXX
router.get("/validate-ccn", async (req, res) => {
  const ccn = (req.query.ccn as string | undefined)?.trim().toUpperCase();
  if (!ccn || !/^[A-Z0-9]{6}$/.test(ccn)) {
    return res.status(400).json({ error: "CCN must be exactly 6 alphanumeric characters" });
  }

  // Check if already registered
  const existing = await db.select().from(accounts).where(eq(accounts.ccn, ccn)).limit(1);
  if (existing.length) {
    return res.json({
      ccn,
      alreadyRegistered: true,
      facilityName: existing[0].facilityName,
      facilityType: existing[0].facilityType,
      state: existing[0].state,
      city: existing[0].city,
    });
  }

  const info = await lookupCCN(ccn);
  return res.json({ ccn, alreadyRegistered: false, ...info });
});

// GET /api/accounts/whoami — diagnostic: returns clerk ID + super-admin match result
router.get("/whoami", requireAuth, (req, res) => {
  const userId = (req as any).clerkUserId as string;
  const rawEnv = process.env.ADMIN_CLERK_USER_IDS ?? "";
  const ids = rawEnv.split(",").map((s) => s.trim()).filter(Boolean);
  const isSuperAdmin = ids.includes(userId);
  res.json({
    clerkUserId: userId,
    isSuperAdmin,
    adminIdCount: ids.length,
    // Show partial IDs for debugging (first 8 chars of each)
    adminIdPrefixes: ids.map((id) => id.slice(0, 10) + "…"),
    yourIdPrefix: userId.slice(0, 10) + "…",
  });
});

// GET /api/accounts/me — get the current user's account + subscription status
router.get("/me", requireAuth, async (req, res) => {
  // Never cache — admin/subscription status can change at any time.
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  const userId = (req as any).clerkUserId as string;

  // Check super-admin and DB-admin FIRST — before any account-lookup early returns,
  // so admins without a registered facility still get isSuperAdmin/isAdminUser: true.
  // HARDCODED fallback ensures access survives secret/DB issues across environments.
  const HARDCODED_SUPER_ADMINS = [
    "user_3HyQAQQh8oexrrANO8yBOIYm2m8", // dev Clerk ID
    "user_3HpG4wWADUbnkJS3D2aGQspgGFP",  // production facility-owner account
    "user_3HxczU4Qjnwl3L2O5a8TssjtfON",  // actual production admin Clerk ID
  ];
  const superAdminIds = [
    ...HARDCODED_SUPER_ADMINS,
    ...(process.env.ADMIN_CLERK_USER_IDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.startsWith("user_")),
  ];
  const isSuperAdmin = superAdminIds.includes(userId);

  const [dbAdminRow] = await db
    .select()
    .from(adminUsers)
    .where(and(eq(adminUsers.clerkUserId, userId), eq(adminUsers.isActive, true)))
    .limit(1);
  const isDbAdmin = !!dbAdminRow;
  const isAdminUser = isSuperAdmin || isDbAdmin;

  const [au] = await db.select().from(accountUsers).where(eq(accountUsers.clerkUserId, userId)).limit(1);
  if (!au?.accountId) return res.json({ account: null, accountUser: null, isActive: isAdminUser, isAdminUser, isSuperAdmin });

  const [account] = await db.select().from(accounts).where(eq(accounts.id, au.accountId)).limit(1);
  if (!account) return res.json({ account: null, accountUser: null, isActive: isAdminUser, isAdminUser, isSuperAdmin });

  const now = new Date();
  const isActive =
    isAdminUser ||
    account.subscriptionStatus === "active" ||
    (account.subscriptionStatus === "trial" &&
      account.trialEndsAt != null &&
      account.trialEndsAt > now);

  return res.json({ account, accountUser: au, isActive, isAdminUser, isSuperAdmin });
});

// POST /api/accounts/register — register a CCN account and link the current user
router.post("/register", requireAuth, async (req, res) => {
  const userId = (req as any).clerkUserId as string;
  const email  = (req as any).clerkEmail as string | null;
  const { ccn, facilityName, facilityType, state, city } = req.body as {
    ccn: string; facilityName: string; facilityType?: string; state?: string; city?: string;
  };

  if (!ccn || !facilityName) {
    return res.status(400).json({ error: "ccn and facilityName are required" });
  }

  const normalCCN = ccn.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(normalCCN)) {
    return res.status(400).json({ error: "CCN must be exactly 6 alphanumeric characters" });
  }

  // Check if this user already has an account
  const [existingAU] = await db.select().from(accountUsers)
    .where(eq(accountUsers.clerkUserId, userId)).limit(1);
  if (existingAU) {
    return res.status(409).json({ error: "You are already linked to a facility account" });
  }

  // Get or create the CCN account
  let [account] = await db.select().from(accounts).where(eq(accounts.ccn, normalCCN)).limit(1);
  const isFirstUser = !account;

  if (!account) {
    const trialEnds = new Date();
    trialEnds.setDate(trialEnds.getDate() + 30);

    [account] = await db.insert(accounts).values({
      ccn:              normalCCN,
      facilityName:     facilityName.trim(),
      facilityType:     facilityType ?? null,
      state:            state ?? null,
      city:             city ?? null,
      subscriptionStatus: "trial",
      trialEndsAt:      trialEnds,
    }).returning();
  }

  // Link this user to the account
  const [accountUser] = await db.insert(accountUsers).values({
    clerkUserId: userId,
    accountId:   account.id,
    role:        isFirstUser ? "admin" : "member",
    email:       email ?? null,
  }).returning();

  return res.status(201).json({ account, accountUser });
});

export default router;
