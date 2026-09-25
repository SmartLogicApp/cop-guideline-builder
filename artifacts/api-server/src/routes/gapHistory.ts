import { createHash } from "node:crypto";
import { Router, type IRouter, type Request } from "express";
import rateLimit from "express-rate-limit";
import { getAuth } from "@clerk/express";
import { and, desc, eq, inArray, isNull, lt } from "drizzle-orm";
import { db, gapHistory } from "@workspace/db";
import { containsSensitiveFinancialData, redactSensitiveFinancialData } from "../lib/sensitive-financial-text.js";

const router: IRouter = Router();
const MAX_HISTORY = 10;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;
const MAX_RESULT_BYTES = 500_000;
const ANONYMOUS_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

type GapResult = {
  score?: number | null;
  summary?: string;
  met?: unknown[];
  weak?: unknown[];
  missing?: unknown[];
};

type GapEntryInput = {
  id?: unknown;
  institution?: unknown;
  institutionLabel?: unknown;
  topic?: unknown;
  score?: unknown;
  timestamp?: unknown;
  result?: unknown;
};

function getOwner(req: Request) {
  const userId = getAuth(req as any)?.userId ?? null;
  const assertedOwner = req.header("x-gap-history-owner") ?? "";
  if (userId) {
    if (assertedOwner !== userId) return null;
    return { userId, tokenHash: null };
  }
  if (assertedOwner !== "anonymous") return null;

  const rawToken = req.header("x-gap-session-token") ?? "";
  if (!TOKEN_PATTERN.test(rawToken)) return null;
  return {
    userId: null,
    tokenHash: createHash("sha256").update(rawToken).digest("hex"),
  };
}

function ownerWhere(owner: NonNullable<ReturnType<typeof getOwner>>) {
  return owner.userId
    ? eq(gapHistory.clerkUserId, owner.userId)
    : eq(gapHistory.sessionTokenHash, owner.tokenHash!);
}

async function pruneExpiredAnonymousHistory() {
  await db.delete(gapHistory).where(
    and(
      isNull(gapHistory.clerkUserId),
      lt(gapHistory.createdAt, new Date(Date.now() - ANONYMOUS_RETENTION_MS)),
    ),
  );
}

function serializeEntry(row: typeof gapHistory.$inferSelect) {
  return redactSensitiveFinancialData({
    id: row.id,
    institution: row.institution,
    institutionLabel: row.institutionLabel,
    topic: row.topic,
    score: row.score,
    timestamp: row.scannedAt.toISOString(),
    result: row.result,
  });
}

function parseEntry(body: GapEntryInput) {
  if (
    typeof body.id !== "string" ||
    body.id.length < 1 ||
    body.id.length > 100 ||
    typeof body.institution !== "string" ||
    body.institution.length < 1 ||
    body.institution.length > 100 ||
    typeof body.institutionLabel !== "string" ||
    body.institutionLabel.length < 1 ||
    body.institutionLabel.length > 200 ||
    typeof body.topic !== "string" ||
    body.topic.length < 1 ||
    body.topic.length > 300 ||
    (body.score !== null && body.score !== undefined &&
      (!Number.isInteger(body.score) || Number(body.score) < 0 || Number(body.score) > 100)) ||
    typeof body.timestamp !== "string" ||
    Number.isNaN(Date.parse(body.timestamp)) ||
    !body.result ||
    typeof body.result !== "object" ||
    Array.isArray(body.result) ||
    containsSensitiveFinancialData({
      id: body.id, institution: body.institution, institutionLabel: body.institutionLabel,
      topic: body.topic, result: body.result,
    })
  ) {
    return null;
  }

  const result = body.result as GapResult;
  if (Buffer.byteLength(JSON.stringify(result), "utf8") > MAX_RESULT_BYTES) {
    return null;
  }
  if (
    (result.score != null && (!Number.isInteger(result.score) || result.score < 0 || result.score > 100)) ||
    (result.summary != null && typeof result.summary !== "string") ||
    (result.met != null && !Array.isArray(result.met)) ||
    (result.weak != null && !Array.isArray(result.weak)) ||
    (result.missing != null && !Array.isArray(result.missing))
  ) {
    return null;
  }

  return {
    id: body.id,
    institution: body.institution,
    institutionLabel: body.institutionLabel,
    topic: body.topic,
    score: body.score == null ? null : Number(body.score),
    scannedAt: new Date(body.timestamp),
    result,
  };
}

router.use(
  "/gap-history",
  rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many history requests — please try again shortly." },
  }),
);

router.get("/gap-history", async (req, res): Promise<void> => {
  await pruneExpiredAnonymousHistory();
  const owner = getOwner(req);
  if (!owner) {
    res.status(401).json({ error: "A valid history session token is required" });
    return;
  }

  const rows = await db
    .select()
    .from(gapHistory)
    .where(ownerWhere(owner))
    .orderBy(desc(gapHistory.scannedAt))
    .limit(MAX_HISTORY);

  res.setHeader("Cache-Control", "no-store");
  res.json(rows.map(serializeEntry));
});

router.post("/gap-history", async (req, res): Promise<void> => {
  await pruneExpiredAnonymousHistory();
  const owner = getOwner(req);
  if (!owner) {
    res.status(401).json({ error: "A valid history session token is required" });
    return;
  }

  const entry = parseEntry(req.body as GapEntryInput);
  if (!entry) {
    res.status(400).json({ error: "Invalid gap history entry" });
    return;
  }

  const saved = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(gapHistory)
      .values({
        ...entry,
        clerkUserId: owner.userId,
        sessionTokenHash: owner.tokenHash,
      })
      .onConflictDoNothing()
      .returning();
    if (inserted) return inserted;

    const [updated] = await tx
      .update(gapHistory)
      .set({
        institution: entry.institution,
        institutionLabel: entry.institutionLabel,
        topic: entry.topic,
        score: entry.score,
        scannedAt: entry.scannedAt,
        result: entry.result,
      })
      .where(and(eq(gapHistory.id, entry.id), ownerWhere(owner)))
      .returning();
    return updated ?? null;
  });
  if (!saved) {
    res.status(409).json({ error: "History entry ID is already in use" });
    return;
  }

  const rows = await db
    .select({ id: gapHistory.id })
    .from(gapHistory)
    .where(ownerWhere(owner))
    .orderBy(desc(gapHistory.scannedAt));
  const staleIds = rows.slice(MAX_HISTORY).map((row) => row.id);
  if (staleIds.length) {
    await db.delete(gapHistory).where(and(ownerWhere(owner), inArray(gapHistory.id, staleIds)));
  }

  res.status(201).json({
    id: entry.id,
    institution: entry.institution,
    institutionLabel: entry.institutionLabel,
    topic: entry.topic,
    score: entry.score,
    timestamp: entry.scannedAt.toISOString(),
    result: entry.result,
  });
});

router.delete("/gap-history/:id", async (req, res): Promise<void> => {
  await pruneExpiredAnonymousHistory();
  const owner = getOwner(req);
  if (!owner) {
    res.status(401).json({ error: "A valid history session token is required" });
    return;
  }
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!rawId || rawId.length > 100) {
    res.status(400).json({ error: "Invalid history entry ID" });
    return;
  }

  await db.delete(gapHistory).where(and(ownerWhere(owner), eq(gapHistory.id, rawId)));
  res.sendStatus(204);
});

export default router;