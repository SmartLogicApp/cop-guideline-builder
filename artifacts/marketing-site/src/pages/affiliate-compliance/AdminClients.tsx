import { useMemo, useState } from "react";
import { useAuth } from "@clerk/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminShell } from "./shells";
import { Loader2, Search, Download, ArrowUpDown } from "lucide-react";
import { useAdminAccountAccess, useAdminTestFlag } from "./hooks";
import type { AdminTestRecordType } from "./hooks";

type ClientRow = {
  id: string;
  affiliateId?: string | null;
  type: "Client" | "Affiliate";
  isClientAccount: boolean;
  clientIsTest?: boolean;
  affiliateIsTest?: boolean;
  isTest?: boolean;
  facilityName: string;
  createdAt: string | null;
  status: string;
  nextBillingDate: string | null;
  contact: { name: string | null; email: string | null; phone: string | null };
  referredBy: string | null;
  totalTokens: number;
  thisMonth: { totalTokens: number };
};

const columns = [
  { key: "facilityName", label: "Client name" },
  { key: "type", label: "Type" },
  { key: "id", label: "Unique ID" },
  { key: "contact", label: "Contact (name, email, phone)" },
  { key: "createdAt", label: "Sign-up date" },
  { key: "status", label: "Status" },
  { key: "nextBillingDate", label: "Next billing date" },
  { key: "monthTokens", label: "Tokens this month" },
  { key: "totalTokens", label: "Tokens total" },
  { key: "referredBy", label: "Referred by" },
] as const;

function date(value: string | null) {
  return value ? new Date(value).toLocaleDateString() : "—";
}

function isClientTestRecord(client: ClientRow) {
  return client.isClientAccount && (client.clientIsTest ?? (client.type === "Client" ? client.isTest : false)) === true;
}

function isAffiliateTestRecord(client: ClientRow) {
  return Boolean(client.affiliateId)
    && (client.affiliateIsTest ?? (client.type === "Affiliate" ? client.isTest : false)) === true;
}

export function AdminClientsTable() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"All" | "Client" | "Affiliate">("All");
  const [includeTest, setIncludeTest] = useState(false);
  const [sort, setSort] = useState<{ key: string; desc: boolean }>({ key: "createdAt", desc: true });
  const [error, setError] = useState("");
  const adminAccess = useAdminAccountAccess(true);
  const testFlagMutation = useAdminTestFlag();
  const isSuperAdmin = !adminAccess.isLoading && !adminAccess.isFetching
    && !adminAccess.isError && adminAccess.data?.isSuperAdmin === true;

  const clientsQuery = useQuery<ClientRow[]>({
    queryKey: ["admin-clients", includeTest],
    queryFn: async () => {
      const token = await getToken();
      const response = await fetch(`/api/admin/clients${includeTest ? "?includeTest=true" : ""}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error((await response.json()).error ?? "Unable to load clients");
      return response.json();
    },
    refetchOnMount: "always",
  });

  const removeMutation = useMutation({
    mutationFn: async (client: ClientRow) => {
      const token = await getToken();
      if (!token) throw new Error("Your admin session has expired. Please sign in again.");
      const response = await fetch(`/api/billing/admin/accounts/${encodeURIComponent(client.id)}/remove`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        let message = "Unable to remove client";
        try { message = (await response.json()).error ?? message; } catch { /* preserve explicit default */ }
        throw new Error(message);
      }
      return client.id;
    },
    onSuccess: (id) => {
      setError("");
      queryClient.setQueryData<ClientRow[]>(["admin-clients"], (rows) =>
        rows?.map((row) => row.id === id ? { ...row, status: "Removed" } : row));
      queryClient.invalidateQueries({ queryKey: ["admin-clients"] });
    },
    onError: (reason: Error) => setError(reason.message),
  });

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return [...(clientsQuery.data ?? [])]
      .filter((client) => !query || [
        client.facilityName, client.type, client.id, client.contact?.name, client.contact?.email,
        client.contact?.phone, client.status, client.referredBy,
        !client.contact?.email ? "No email on file" : null,
      ].some((value) => value?.toLocaleLowerCase().includes(query)))
      .filter((client) => includeTest || (!isClientTestRecord(client) && !isAffiliateTestRecord(client)))
      .filter((client) => typeFilter === "All" || client.type === typeFilter)
      .sort((a, b) => {
        const value = (client: ClientRow): string | number => {
          if (sort.key === "contact") return `${client.contact.name ?? ""} ${client.contact.email ?? ""}`;
          if (sort.key === "monthTokens") return client.thisMonth.totalTokens;
          const row = client as unknown as Record<string, unknown>;
          return typeof row[sort.key] === "number" || typeof row[sort.key] === "string"
            ? row[sort.key] as string | number : "";
        };
        const left = value(a);
        const right = value(b);
        const result = typeof left === "number" && typeof right === "number"
          ? left - right : String(left).localeCompare(String(right), undefined, { numeric: true });
        return sort.desc ? -result : result;
      });
  }, [clientsQuery.data, includeTest, search, sort, typeFilter]);

  const setTestFlag = async (client: ClientRow, recordType: AdminTestRecordType, id: string, currentlyTest: boolean) => {
    if (!isSuperAdmin) return;
    const isTest = !currentlyTest;
    const recordLabel = recordType === "affiliate" ? "affiliate" : "client account";
    const nextLabel = isTest ? `mark this ${recordLabel} as test` : `restore this ${recordLabel} to live`;
    const confirmation = isTest
      ? `Mark ${client.facilityName}'s ${recordLabel} as a test record? It will be omitted from admin counts and payout selection. Its data and history will be preserved.`
      : `Restore ${client.facilityName}'s ${recordLabel} to live records? It will again be included in admin counts and payout selection. Its data and history will be preserved.`;
    if (!window.confirm(confirmation)) return;

    const reason = window.prompt(`Required: explain why you want to ${nextLabel} (at least 10 characters).`);
    if (reason === null) return;
    if (reason.trim().length < 10) {
      setError("Enter a written reason of at least 10 characters. No changes were made.");
      return;
    }

    setError("");
    try {
      await testFlagMutation.mutateAsync({
        recordType,
        id,
        isTest,
        reason: reason.trim(),
      });
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Unable to update the test flag.");
    }
  };

  const downloadCsv = async () => {
    const token = await getToken();
    const response = await fetch(`/api/admin/clients/download${includeTest ? "?includeTest=true" : ""}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) {
      setError("Unable to download the clients CSV.");
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "admin-clients.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
       <div className="mb-4 flex flex-col gap-3 rounded-lg border bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
         <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
           <label className="relative w-full sm:max-w-md">
             <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
             <input value={search} onChange={(event) => setSearch(event.target.value)}
               placeholder="Search by client, contact, status, or referrer"
               className="w-full rounded-md border py-2 pl-9 pr-3 text-sm" />
           </label>
           <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
             Type
             <select aria-label="Filter by type" value={typeFilter}
               onChange={(event) => setTypeFilter(event.target.value as typeof typeFilter)}
               className="rounded-md border bg-white px-3 py-2">
               <option value="All">All</option>
               <option value="Client">Client</option>
               <option value="Affiliate">Affiliate</option>
             </select>
           </label>
           <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
             <input type="checkbox" checked={includeTest} onChange={(event) => setIncludeTest(event.target.checked)}
               className="rounded border-slate-300" data-testid="toggle-show-test-clients" />
             Show test records
           </label>
         </div>
        <button onClick={downloadCsv} className="inline-flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold hover:bg-slate-50">
          <Download className="h-4 w-4" /> Download CSV
        </button>
      </div>
      {error && <p role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
       {includeTest && <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
         Review mode: test records are included in this table. They remain excluded from normal admin counts and payout selection.
       </p>}
       {clientsQuery.isLoading ? <div className="flex justify-center p-12"><Loader2 className="animate-spin" /></div>
        : clientsQuery.isError ? <p role="alert" className="rounded-md bg-red-50 p-4 text-red-800">{clientsQuery.error.message}</p>
        : <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full min-w-[1500px] border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-slate-900"><tr>
              {columns.map((column) => <th key={column.key} className="whitespace-normal px-3 py-3 font-semibold">
                <button className="inline-flex items-center gap-1 text-left" onClick={() =>
                  setSort((current) => ({ key: column.key, desc: current.key === column.key ? !current.desc : false }))}>
                  {column.label}<ArrowUpDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                </button>
              </th>)}
              <th className="px-3 py-3">Action</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((client) => <tr key={client.id} className="align-top hover:bg-slate-50">
                <td className="whitespace-normal px-3 py-3 font-semibold text-slate-900">
                  {client.facilityName}
                  {isClientTestRecord(client) && <span className="ml-2 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900" data-testid={`badge-test-client-${client.id}`}>Test client</span>}
                  {isAffiliateTestRecord(client) && <span className="ml-2 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900" data-testid={`badge-test-affiliate-${client.affiliateId}`}>Test affiliate</span>}
                </td>
                <td className="px-3 py-3">{client.type}</td>
                <td className="break-all px-3 py-3 font-mono text-xs">{client.affiliateId && !client.isClientAccount ? client.affiliateId : client.id}</td>
                <td className="whitespace-normal px-3 py-3">
                  {[client.contact?.name, client.contact?.email, client.contact?.phone].filter(Boolean).join(" · ")}
                  {!client.contact?.email && <span className="inline-block rounded bg-amber-50 px-2 py-0.5 font-semibold text-amber-800">No email on file</span>}
                </td>
                <td className="whitespace-nowrap px-3 py-3">{date(client.createdAt)}</td>
                <td className="min-w-[180px] whitespace-normal break-words px-3 py-3 font-medium">{client.status}</td>
                <td className="whitespace-nowrap px-3 py-3">{date(client.nextBillingDate)}</td>
                <td className="px-3 py-3">{(client.thisMonth?.totalTokens ?? 0).toLocaleString()}</td>
                <td className="px-3 py-3">{(client.totalTokens ?? 0).toLocaleString()}</td>
                <td className="whitespace-normal px-3 py-3">{client.referredBy || "—"}</td>
                <td className="px-3 py-3">
                  {isSuperAdmin && client.affiliateId && <button type="button" disabled={testFlagMutation.isPending}
                    onClick={() => void setTestFlag(client, "affiliate", client.affiliateId!, isAffiliateTestRecord(client))}
                    className="mb-2 block whitespace-nowrap rounded border border-amber-300 px-2.5 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-50 disabled:opacity-50"
                    data-testid={`button-test-flag-affiliate-${client.affiliateId}`}>
                    {testFlagMutation.isPending ? "Saving…" : isAffiliateTestRecord(client) ? "Restore affiliate to live" : "Mark affiliate as test"}
                  </button>}
                  {isSuperAdmin && client.isClientAccount && <button type="button" disabled={testFlagMutation.isPending}
                    onClick={() => void setTestFlag(client, "client", client.id, isClientTestRecord(client))}
                    className="mb-2 block whitespace-nowrap rounded border border-amber-300 px-2.5 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-50 disabled:opacity-50"
                    data-testid={`button-test-flag-client-${client.id}`}>
                    {testFlagMutation.isPending ? "Saving…" : isClientTestRecord(client) ? "Restore client account to live" : "Mark client account as test"}
                  </button>}
                  {client.isClientAccount ? client.status === "Removed" ? <span className="font-semibold text-slate-500">Removed</span> :
                    <button disabled={removeMutation.isPending} onClick={() => {
                      if (window.confirm(`Remove ${client.facilityName}? Their subscription will be canceled immediately without a refund, and access will end immediately.`)) {
                        removeMutation.mutate(client);
                      }
                    }} className="whitespace-nowrap rounded border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">
                      Remove client
                    </button> : <span className="font-semibold text-slate-500">—</span>}
                </td>
              </tr>)}
              {filtered.length === 0 && <tr><td colSpan={11} className="p-10 text-center text-slate-500">No clients found.</td></tr>}
            </tbody>
          </table>
        </div>}
    </>
  );
}

export default function AdminClients() {
  return <AdminShell title="Clients" subtitle="Search, sort, export, and manage client subscription access.">
    <AdminClientsTable />
  </AdminShell>;
}