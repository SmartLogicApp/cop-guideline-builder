import { useState, useMemo } from 'react';
import { AdminShell } from './shells';
import { useAdminAffiliates } from './hooks';
import { Link } from 'wouter';
import { Loader2, Search, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function AdminAffiliatesList() {
  const { data: affiliates = [], isLoading } = useAdminAffiliates();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All');

  const filtered = useMemo(() => {
    return affiliates.filter((a: any) => {
      const matchSearch = search.length === 0 || 
        a.legalName?.toLowerCase().includes(search.toLowerCase()) || 
        a.email?.toLowerCase().includes(search.toLowerCase());
      
      let matchFilter = true;
      if (filter === 'Eligible') matchFilter = a.payoutEligibility === true;
      if (filter === 'Not Eligible') matchFilter = a.payoutEligibility === false;
      if (filter === 'Missing Tax') matchFilter = a.taxStatus !== 'Verified/complete';
      if (filter === 'Missing Stripe') matchFilter = a.stripeSetup !== 'Complete';
      if (filter === 'International') matchFilter = a.overallStatus === 'International review required';
      
      return matchSearch && matchFilter;
    });
  }, [affiliates, search, filter]);

  if (isLoading) return <AdminShell title="Affiliates"><div className="flex justify-center p-12"><Loader2 className="animate-spin text-slate-800" /></div></AdminShell>;

  return (
    <AdminShell title="Affiliate Compliance Console" subtitle="Manage affiliate payout eligibility and compliance records.">
      <div className="bg-white border rounded-xl shadow-sm mb-6 flex flex-col sm:flex-row gap-4 p-4 items-center justify-between">
        <div className="relative w-full sm:w-96 flex-shrink-0">
          <Search className="w-5 h-5 absolute left-3 top-2.5 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search affiliates by name or email..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 w-full rounded-md border-slate-300 border px-3 py-2 text-sm focus:border-slate-800 focus:ring-slate-800"
          />
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Filter className="w-5 h-5 text-slate-400" />
          <select 
            value={filter} 
            onChange={e => setFilter(e.target.value)}
            className="rounded-md border-slate-300 border px-3 py-2 text-sm focus:border-slate-800 focus:ring-slate-800"
          >
            <option>All</option>
            <option>Eligible</option>
            <option>Not Eligible</option>
            <option>Missing Tax</option>
            <option>Missing Stripe</option>
            <option>International</option>
          </select>
        </div>
      </div>

      <div className="bg-white border rounded-xl shadow-sm overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-600">
          <thead className="bg-slate-50 text-slate-900 border-b">
            <tr>
              <th className="px-4 py-3 font-semibold">Affiliate</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Eligibility</th>
              <th className="px-4 py-3 font-semibold">Tax Status</th>
              <th className="px-4 py-3 font-semibold">Stripe</th>
              <th className="px-4 py-3 font-semibold text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((affiliate: any) => (
              <tr key={affiliate.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-4">
                  <div className="font-semibold text-slate-900">{affiliate.legalName || affiliate.businessName || 'Unnamed'}</div>
                  <div className="text-xs text-slate-500 mt-1">{affiliate.email}</div>
                  <div className="text-xs text-slate-400 mt-1">{affiliate.state} • {affiliate.country}</div>
                </td>
                <td className="px-4 py-4">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${affiliate.status === 'Active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-800'}`}>
                    {affiliate.status}
                  </span>
                </td>
                <td className="px-4 py-4">
                  {affiliate.payoutEligibility ? (
                    <span className="text-emerald-700 font-medium">Eligible</span>
                  ) : (
                    <span className="text-red-600 font-medium">{affiliate.overallStatus || 'Not eligible'}</span>
                  )}
                </td>
                <td className="px-4 py-4">{affiliate.taxStatus || 'Not started'}</td>
                <td className="px-4 py-4">{affiliate.stripeSetup || 'Not started'}</td>
                <td className="px-4 py-4 text-right">
                  <Link href={`/admin/affiliates/${affiliate.id}`} className="inline-flex items-center justify-center rounded-md text-sm font-medium border border-slate-300 bg-white hover:bg-slate-50 px-3 py-1.5 text-slate-700">
                    View & Manage
                  </Link>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                  No affiliates found matching your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
