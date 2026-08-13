import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { adminUsers } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "./accounts";
import { getAuth } from "@clerk/express";

const router: IRouter = Router();

// Super-admin IDs come from the env var — only these users can manage the admin list.
function getSuperAdminIds(): string[] {
  return (process.env.ADMIN_CLERK_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  const auth = getAuth(req as any);
  const userId = auth?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  if (!getSuperAdminIds().includes(userId))
    return res.status(403).json({ error: "Super-admin access required" });
  (req as any).clerkUserId = userId;
  next();
}

// GET /api/admin/users — list all platform admins
router.get("/users", requireSuperAdmin, async (_req, res) => {
  const rows = await db
    .select()
    .from(adminUsers)
    .orderBy(adminUsers.addedAt);
  return res.json(rows);
});

// POST /api/admin/users — grant access to a new admin
router.post("/users", requireSuperAdmin, async (req, res) => {
  const addedBy = (req as any).clerkUserId as string;
  const { clerkUserId, email, label } = req.body as {
    clerkUserId: string;
    email: string;
    label?: string;
  };

  if (!clerkUserId || !email)
    return res.status(400).json({ error: "clerkUserId and email are required" });

  const trimmedId = clerkUserId.trim();
  if (!trimmedId.startsWith("user_"))
    return res.status(400).json({ error: "clerkUserId must start with user_" });

  // Upsert — if previously removed, restore and update label
  const existing = await db
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.clerkUserId, trimmedId))
    .limit(1);

  if (existing.length > 0) {
    const [updated] = await db
      .update(adminUsers)
      .set({ email: email.trim(), label: label?.trim() ?? null, isActive: true, addedBy })
      .where(eq(adminUsers.clerkUserId, trimmedId))
      .returning();
    return res.json(updated);
  }

  const [row] = await db
    .insert(adminUsers)
    .values({
      clerkUserId: trimmedId,
      email: email.trim(),
      label: label?.trim() ?? null,
      isActive: true,
      addedBy,
    })
    .returning();
  return res.status(201).json(row);
});

// PATCH /api/admin/users/:id — toggle isActive (revoke or restore)
router.patch("/users/:id", requireSuperAdmin, async (req, res) => {
  const { id } = req.params;
  const { isActive } = req.body as { isActive: boolean };
  if (typeof isActive !== "boolean")
    return res.status(400).json({ error: "isActive (boolean) is required" });

  const [updated] = await db
    .update(adminUsers)
    .set({ isActive })
    .where(eq(adminUsers.id, id))
    .returning();

  if (!updated) return res.status(404).json({ error: "Admin user not found" });
  return res.json(updated);
});

// DELETE /api/admin/users/:id — permanently remove
router.delete("/users/:id", requireSuperAdmin, async (req, res) => {
  const { id } = req.params;
  const deleted = await db
    .delete(adminUsers)
    .where(eq(adminUsers.id, id))
    .returning();
  if (!deleted.length) return res.status(404).json({ error: "Admin user not found" });
  return res.json({ ok: true });
});

export default router;
