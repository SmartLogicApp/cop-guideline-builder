import { useMemo, useState } from "react";
import { useAuth } from "@clerk/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AdminShell } from "./shells";
import { ArrowUpDown, Download, Loader2, Search } from "lucide-react";

type ReferredClient = {
  id: string;
  name: string;
  createdAt: string | null;
  status: string;
  tokensThisMonth: number;
  tokensTotal: number;
};
type AffiliateReport = {
  id: string;
  name: string;
  companyName: string;
  contact: { email: string; phone: string | null; company: string };
  referralCode: string;
  currentRate: number;
  nextRateChangeDate: string | null;
  newRate: number | null;
  restorationDeadline: string | null;
  activeClients: number;
  canceledClients: number;
  workspaceAccessStatus: string;
  workspaceAccessEndDate: string | null;
  clients: ReferredClient[];
};

const headers = [
  { key: "name", label: "Name" },
  { key: "contact", label: "Contact (email, phone, company)" },
  { key: "referralCode", label: "Referral code" },
  { key: "currentRate", label: "Current rate" },
  { key: "nextRateChangeDate", label: "Next rate change date and new rate" },
  { key: "restorationDeadline", label: "Restoration deadline if at 0%" },
  { key: "activeClients", label: "Clients active/canceled" },
  { key: "workspaceAccessStatus", label: "Workspace access status + end date" },
] as const;

const date = (value: string | null) => value ? new Date(value).toLocaleDateString() : "—";

export default function AdminAffiliatesList() {
  const { getToken } = useAuth();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: string; desc: boolean }>({ key: "name", desc: false });
  const [csvError, setCsvError] = useState("");
  const report = useQuery<AffiliateReport[]>({
    queryKey: ["admin-affiliate-report"],
    queryFn: async () => {
      const token = await getToken();
      const response = await fetch("/api/admin/affiliates", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error((await response.json()).error ?? "Unable to load affiliate report");
      return response.json();
    },
  });
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return [...(report.data ?? [])]
      .filter((affiliate) => !query || [
        affiliate.name, affiliate.companyName, affiliate.contact.email, affiliate.contact.phone,
        affiliate.referralCode, affiliate.workspaceAccessStatus,
      ].some((value) => value?.toLocaleLowerCase().includes(query)))
      .sort((a, b) => {
        const read = (item: AffiliateReport): string | number => {
          if (sort.key === "contact") return `${item.contact.email} ${item.contact.phone ?? ""} ${item.companyName}`;
          if (sort.key === "activeClients") return item.activeClients + item.canceledClients;
          const value = (item as unknown as Record<string, unknown>)[sort.key];
          return typeof value === "number" || typeof value === "string" ? value : "";
        };
        const left = read(a);
        const right = read(b);
        const order = typeof left === "number" && typeof right === "number"
          ? left - right : String(left).localeCompare(String(right), undefined, { numeric: true });
        return sort.desc ? -order : order;
      });
  }, [report.data, search, sort]);

  const download = async (type: "affiliates" | "clients") => {
    setCsvError("");
    const token = await getToken();
    const response = await fetch(`/api/admin/affiliates/download?type=${type}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) {
      setCsvError("Unable to download this CSV.");
      return;
    }
    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = type === "clients" ? "affiliate-clients.csv" : "admin-affiliates.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AdminShell title="Affiliates" subtitle="Affiliate enrollment, commission rates, referred clients, and workspace access.">
      <div className="mb-4 flex flex-col gap-3 rounded-lg border bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative w-full sm:max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input value={search} onChange={(event) => setSearch(event.target.value)}
            placeholder="Search affiliates by name, company, email, or code"
            className="w-full rounded-md border py-2 pl-9 pr-3 text-sm" />
        </label>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => download("affiliates")} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold hover:bg-slate-50">
            <Download className="h-4 w-4" /> Affiliates CSV
          </button>
          <button onClick={() => download("clients")} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold hover:bg-slate-50">
            <Download className="h-4 w-4" /> Affiliate clients CSV
          </button>
        </div>
      </div>
      {csvError && <p role="alert" className="mb-3 text-sm text-red-700">{csvError}</p>}
      {report.isLoading ? <div className="flex justify-center p-12"><Loader2 className="animate-spin" /></div>
        : report.isError ? <p role="alert" className="rounded-md bg-red-50 p-4 text-red-800">{report.error.message}</p>
        : <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full min-w-[1450px] border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-slate-900"><tr>
              {headers.map((column) => <th key={column.key} className="whitespace-normal px-3 py-3 font-semibold">
                <button className="inline-flex items-center gap-1 text-left" onClick={() =>
                  setSort((current) => ({ key: column.key, desc: current.key === column.key ? !current.desc : false }))}>
                  {column.label}<ArrowUpDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                </button>
              </th>)}
              <th className="px-3 py-3">Manage</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((affiliate) => <tr key={affiliate.id} className="align-top hover:bg-slate-50">
                <td className="whitespace-normal px-3 py-3 font-semibold text-slate-900">
                  {affiliate.name}<div className="mt-1 text-xs font-normal text-slate-500">{affiliate.companyName}</div>
                </td>
                <td className="whitespace-normal px-3 py-3">{[affiliate.contact.email, affiliate.contact.phone, affiliate.contact.company].filter(Boolean).join(" · ")}</td>
                <td className="whitespace-nowrap px-3 py-3 font-mono">{affiliate.referralCode}</td>
                <td className="whitespace-nowrap px-3 py-3">{affiliate.currentRate}%</td>
                <td className="min-w-[220px] whitespace-normal px-3 py-3">
                  {affiliate.nextRateChangeDate && affiliate.newRate !== null
                    ? `${date(affiliate.nextRateChangeDate)} → ${affiliate.newRate}%` : "No scheduled change"}
                </td>
                <td className="whitespace-nowrap px-3 py-3">{affiliate.restorationDeadline ? date(affiliate.restorationDeadline) : "—"}</td>
                <td className="whitespace-nowrap px-3 py-3">{affiliate.activeClients} active / {affiliate.canceledClients} canceled</td>
                <td className="min-w-[190px] whitespace-normal break-words px-3 py-3">
                  {affiliate.workspaceAccessStatus}{affiliate.workspaceAccessEndDate ? ` · ends ${date(affiliate.workspaceAccessEndDate)}` : ""}
                </td>
                <td className="whitespace-nowrap px-3 py-3">
                  <Link href={`/admin/affiliates/${affiliate.id}`} className="rounded-md border px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">View</Link>
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs font-semibold text-slate-700">Referred clients ({affiliate.clients.length})</summary>
                    <div className="mt-2 max-h-[65vh] w-[min(800px,70vw)] overflow-auto rounded-md border bg-white p-3 shadow-sm">
                      {(["Active", "Canceled"] as const).map((group) => {
                        const groupClients = affiliate.clients.filter((client) =>
                          group === "Active" ? ["Active", "Trial"].includes(client.status) : /cancel|removed|expired/i.test(client.status));
                        return <section key={group} className="mb-4 last:mb-0">
                          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-600">{group} ({groupClients.length})</h3>
                          {groupClients.length ? <div className="overflow-x-auto">
                            <table className="w-full min-w-[620px] text-left text-xs">
                              <thead><tr className="border-b text-slate-500">
                                <th className="p-2">Client name</th><th className="p-2">Signup date</th>
                                <th className="min-w-[170px] whitespace-normal p-2">Status</th>
                                <th className="p-2">Tokens this month</th><th className="p-2">Tokens total</th>
                              </tr></thead>
                              <tbody>{groupClients.map((client) => <tr key={client.id} className="border-b last:border-0">
                                <td className="p-2">{client.name}</td><td className="whitespace-nowrap p-2">{date(client.createdAt)}</td>
                                <td className="min-w-[170px] whitespace-normal break-words p-2">{client.status}</td>
                                <td className="p-2">{client.tokensThisMonth.toLocaleString()}</td>
                                <td className="p-2">{client.tokensTotal.toLocaleString()}</td>
                              </tr>)}</tbody>
                            </table>
                          </div> : <p className="text-xs text-slate-500">No {group.toLowerCase()} referred clients.</p>}
                        </section>;
                      })}
                    </div>
                  </details>
                </td>
              </tr>)}
              {filtered.length === 0 && <tr><td colSpan={9} className="p-10 text-center text-slate-500">No affiliates found.</td></tr>}
            </tbody>
          </table>
        </div>}
    </AdminShell>
  );
}