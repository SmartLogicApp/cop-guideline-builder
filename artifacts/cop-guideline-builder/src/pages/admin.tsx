import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiClient";
import { useAccount } from "@/hooks/useAccount";
import { useLocation } from "wouter";

interface AdminUser {
  id: string;
  clerkUserId: string;
  email: string;
  label: string | null;
  isActive: boolean;
  addedBy: string;
  addedAt: string | null;
}

const S = {
  page: {
    minHeight: "100dvh", background: "#F8FAFC",
    fontFamily: "system-ui, -apple-system, sans-serif", color: "#1E293B",
  } as React.CSSProperties,
  header: {
    background: "#0D5C6B", color: "#fff", padding: "16px 32px",
    display: "flex", alignItems: "center", gap: "16px",
  } as React.CSSProperties,
  container: {
    maxWidth: "820px", margin: "0 auto", padding: "32px 24px",
  } as React.CSSProperties,
  card: {
    background: "#fff", border: "1px solid #E2E8F0", borderRadius: "10px",
    padding: "24px", marginBottom: "24px",
  } as React.CSSProperties,
  label: { fontSize: "12px", fontWeight: 600, color: "#64748B", marginBottom: "4px", display: "block" } as React.CSSProperties,
  input: {
    width: "100%", padding: "9px 12px", border: "1px solid #CBD5E1", borderRadius: "7px",
    fontSize: "13px", color: "#1E293B", background: "#fff", boxSizing: "border-box" as const,
  } as React.CSSProperties,
  btn: (variant: "primary" | "danger" | "ghost") => ({
    padding: "7px 14px", borderRadius: "7px", fontSize: "13px", fontWeight: 600,
    border: "none", cursor: "pointer",
    background: variant === "primary" ? "#0D5C6B" : variant === "danger" ? "#FEE2E2" : "#F1F5F9",
    color: variant === "primary" ? "#fff" : variant === "danger" ? "#DC2626" : "#475569",
  }) as React.CSSProperties,
};

export default function AdminPage() {
  const [, setLocation] = useLocation();
  const { data: accountData, isLoading: accountLoading } = useAccount();
  const qc = useQueryClient();

  const [form, setForm] = useState({ clerkUserId: "", email: "", label: "" });
  const [formError, setFormError] = useState("");

  // Guard: only super-admins can access this page
  if (accountLoading) {
    return <div style={{ padding: "40px", textAlign: "center", color: "#64748B" }}>Loading…</div>;
  }
  if (!accountData?.isSuperAdmin) {
    return (
      <div style={{ padding: "40px", textAlign: "center" }}>
        <div style={{ fontSize: "32px", marginBottom: "12px" }}>🔒</div>
        <div style={{ fontWeight: 700, color: "#1E293B" }}>Access Denied</div>
        <p style={{ color: "#64748B" }}>This page is only accessible to super-admins.</p>
        <button onClick={() => setLocation("/")} style={S.btn("primary")}>Go Home</button>
      </div>
    );
  }

  // Fetch admin list
  const { data: admins = [], isLoading } = useQuery<AdminUser[]>({
    queryKey: ["admin", "users"],
    queryFn: () => apiFetch<AdminUser[]>("/api/admin/users"),
    staleTime: 30_000,
  });

  const addMutation = useMutation({
    mutationFn: (body: { clerkUserId: string; email: string; label?: string }) =>
      apiFetch<AdminUser>("/api/admin/users", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin", "users"] }); setForm({ clerkUserId: "", email: "", label: "" }); setFormError(""); },
    onError: (e: any) => setFormError(e.message ?? "Failed to add admin"),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiFetch<AdminUser>(`/api/admin/users/${id}`, { method: "PATCH", body: JSON.stringify({ isActive }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "users"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/admin/users/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "users"] }),
  });

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    const { clerkUserId, email, label } = form;
    if (!clerkUserId.trim() || !email.trim()) { setFormError("Clerk user ID and email are required"); return; }
    addMutation.mutate({ clerkUserId: clerkUserId.trim(), email: email.trim(), label: label.trim() || undefined });
  }

  const activeAdmins  = admins.filter((a) => a.isActive);
  const revokedAdmins = admins.filter((a) => !a.isActive);

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <button onClick={() => setLocation("/")} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.7)", cursor: "pointer", fontSize: "20px", padding: 0 }}>←</button>
        <div>
          <div style={{ fontWeight: 800, fontSize: "17px" }}>Admin Access Manager</div>
          <div style={{ fontSize: "12px", opacity: 0.7 }}>Grant or revoke platform-level access without a subscription</div>
        </div>
      </div>

      <div style={S.container}>
        {/* Add new admin */}
        <div style={S.card}>
          <div style={{ fontWeight: 700, fontSize: "15px", marginBottom: "16px" }}>Grant Access to a New User</div>
          <p style={{ fontSize: "13px", color: "#64748B", margin: "0 0 16px", lineHeight: 1.6 }}>
            The person must first create a Clerk account via the sign-up page. Find their Clerk user ID at{" "}
            <a href="https://dashboard.clerk.com" target="_blank" rel="noopener noreferrer" style={{ color: "#0D5C6B" }}>dashboard.clerk.com</a>{" "}
            → Users. It starts with <code>user_</code>.
          </p>
          <form onSubmit={handleAdd} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: "12px", alignItems: "end" }}>
            <div>
              <label style={S.label}>Clerk User ID *</label>
              <input
                style={S.input} placeholder="user_abc123…"
                value={form.clerkUserId}
                onChange={(e) => setForm((f) => ({ ...f, clerkUserId: e.target.value }))}
              />
            </div>
            <div>
              <label style={S.label}>Email *</label>
              <input
                style={S.input} type="email" placeholder="name@facility.org"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div>
              <label style={S.label}>Label / Note</label>
              <input
                style={S.input} placeholder="e.g. Compliance Director"
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              />
            </div>
            <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: "12px" }}>
              <button type="submit" style={S.btn("primary")} disabled={addMutation.isPending}>
                {addMutation.isPending ? "Granting…" : "Grant Access"}
              </button>
              {formError && <span style={{ fontSize: "13px", color: "#DC2626" }}>{formError}</span>}
              {addMutation.isSuccess && <span style={{ fontSize: "13px", color: "#10B981" }}>✓ Access granted</span>}
            </div>
          </form>
        </div>

        {/* Active admins */}
        <div style={S.card}>
          <div style={{ fontWeight: 700, fontSize: "15px", marginBottom: "4px" }}>
            Active Admins{activeAdmins.length > 0 && <span style={{ fontWeight: 400, color: "#64748B", fontSize: "13px" }}> — {activeAdmins.length}</span>}
          </div>
          <p style={{ fontSize: "12px", color: "#94A3B8", margin: "0 0 16px" }}>These users have full access regardless of subscription status.</p>

          {isLoading && <div style={{ color: "#94A3B8", fontSize: "13px" }}>Loading…</div>}
          {!isLoading && activeAdmins.length === 0 && (
            <div style={{ color: "#94A3B8", fontSize: "13px" }}>No database-managed admins yet. Add one above.</div>
          )}
          {activeAdmins.map((admin) => (
            <AdminRow
              key={admin.id}
              admin={admin}
              onToggle={(isActive) => toggleMutation.mutate({ id: admin.id, isActive })}
              onDelete={() => deleteMutation.mutate(admin.id)}
              isPending={toggleMutation.isPending || deleteMutation.isPending}
            />
          ))}
        </div>

        {/* Revoked admins */}
        {revokedAdmins.length > 0 && (
          <div style={S.card}>
            <div style={{ fontWeight: 700, fontSize: "15px", marginBottom: "4px", color: "#94A3B8" }}>
              Revoked — {revokedAdmins.length}
            </div>
            <p style={{ fontSize: "12px", color: "#94A3B8", margin: "0 0 16px" }}>Access has been removed. You can restore or permanently delete these records.</p>
            {revokedAdmins.map((admin) => (
              <AdminRow
                key={admin.id}
                admin={admin}
                onToggle={(isActive) => toggleMutation.mutate({ id: admin.id, isActive })}
                onDelete={() => deleteMutation.mutate(admin.id)}
                isPending={toggleMutation.isPending || deleteMutation.isPending}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AdminRow({
  admin,
  onToggle,
  onDelete,
  isPending,
}: {
  admin: AdminUser;
  onToggle: (active: boolean) => void;
  onDelete: () => void;
  isPending: boolean;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const added = admin.addedAt ? new Date(admin.addedAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "—";

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "12px", padding: "12px 14px",
      background: admin.isActive ? "#F8FAFC" : "#FEF2F2",
      border: `1px solid ${admin.isActive ? "#E2E8F0" : "#FECACA"}`,
      borderRadius: "8px", marginBottom: "8px", flexWrap: "wrap",
    }}>
      {/* Status dot */}
      <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: admin.isActive ? "#10B981" : "#EF4444", flexShrink: 0 }} />

      {/* Info */}
      <div style={{ flex: 1, minWidth: "180px" }}>
        <div style={{ fontWeight: 600, fontSize: "13px", color: "#1E293B" }}>
          {admin.label || admin.email}
        </div>
        <div style={{ fontSize: "11px", color: "#64748B" }}>
          {admin.label ? admin.email + " · " : ""}{admin.clerkUserId} · Added {added}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        {admin.isActive ? (
          <button
            onClick={() => onToggle(false)}
            disabled={isPending}
            style={{ padding: "5px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: 600,
              background: "#FEF3C7", color: "#92400E", border: "1px solid #FDE68A", cursor: "pointer" }}
          >
            Revoke
          </button>
        ) : (
          <button
            onClick={() => onToggle(true)}
            disabled={isPending}
            style={{ padding: "5px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: 600,
              background: "#D1FAE5", color: "#065F46", border: "1px solid #A7F3D0", cursor: "pointer" }}
          >
            Restore
          </button>
        )}

        {confirmDelete ? (
          <>
            <button
              onClick={() => { onDelete(); setConfirmDelete(false); }}
              disabled={isPending}
              style={{ padding: "5px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: 700,
                background: "#DC2626", color: "#fff", border: "none", cursor: "pointer" }}
            >
              Confirm Delete
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              style={{ padding: "5px 10px", borderRadius: "6px", fontSize: "12px",
                background: "none", color: "#64748B", border: "1px solid #CBD5E1", cursor: "pointer" }}
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            style={{ padding: "5px 10px", borderRadius: "6px", fontSize: "12px",
              background: "none", color: "#94A3B8", border: "1px solid #E2E8F0", cursor: "pointer" }}
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}
