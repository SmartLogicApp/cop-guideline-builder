import { Link } from 'wouter';
import React from 'react';

export function AffiliateShell({ children, title, subtitle }: { children: React.ReactNode, title: string, subtitle?: string }) {
  return (
    <div className="min-h-[100dvh] bg-slate-50 flex flex-col">
      <header className="border-b bg-white">
        <div className="container mx-auto px-4 py-4 sm:px-6 lg:px-8 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" className="h-8 w-8" />
            <span className="font-bold text-slate-950">CMS Compliance Suite</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm font-semibold text-slate-600">
            <Link href="/partners/portal" className="hover:text-teal-800 transition-colors">Portal</Link>
            <Link href="/partners/marketing-guidelines" className="hover:text-teal-800 transition-colors">Guidelines</Link>
          </nav>
        </div>
      </header>

      <div className="bg-teal-900 pb-24 pt-10">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl">
          <h1 className="text-3xl font-bold text-white" data-testid={`heading-${title.replace(/\s+/g, '-').toLowerCase()}`}>
            {title}
          </h1>
          {subtitle && <p className="mt-2 text-teal-100">{subtitle}</p>}
        </div>
      </div>

      <main className="-mt-16 container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl pb-12 flex-1">
        {children}
      </main>
    </div>
  );
}

export function AdminShell({ children, title, subtitle }: { children: React.ReactNode, title: string, subtitle?: string }) {
  return (
    <div className="min-h-[100dvh] bg-slate-50 flex flex-col">
      <header className="border-b bg-slate-900 text-white">
        <div className="container mx-auto px-4 py-4 sm:px-6 lg:px-8 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" className="h-8 w-8 opacity-90" />
            <span className="font-bold text-white">Admin Console</span>
          </Link>
          <nav className="flex items-center gap-6 text-sm font-semibold text-slate-300">
            <Link href="/admin/affiliates" className="hover:text-white transition-colors">Affiliates</Link>
            <Link href="/admin/affiliate-compliance" className="hover:text-white transition-colors">Compliance Docs</Link>
            <Link href="/admin/affiliate-payouts" className="hover:text-white transition-colors">Payouts</Link>
          </nav>
        </div>
      </header>

      <div className="bg-white border-b py-8 shadow-sm">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          {subtitle && <p className="mt-1 text-slate-500 text-sm">{subtitle}</p>}
        </div>
      </div>

      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1">
        {children}
      </main>
    </div>
  );
}
