import { AffiliateShell } from './shells';
import { usePortalData } from './hooks';

export default function MarketingGuidelinesPage() {
  const { data: portalData } = usePortalData();
  const doc = portalData?.checklist?.find((c: any) => c.key === 'marketing')?.document;

  return (
    <AffiliateShell title="Marketing & Brand Guidelines" subtitle="Rules and expectations for our affiliate partners">
      <div className="bg-white rounded-2xl shadow-sm border p-8 max-w-4xl mx-auto mt-8">
        {doc ? (
          <>
            <div className="flex justify-between items-center mb-6 pb-4 border-b">
              <h2 className="text-2xl font-bold text-slate-900">{doc.title}</h2>
              <span className="text-sm font-medium bg-slate-100 text-slate-600 px-3 py-1 rounded-full">Version {doc.version}</span>
            </div>
            <div className="prose prose-slate max-w-none whitespace-pre-wrap">
              {doc.content}
            </div>
          </>
        ) : (
          <p className="text-slate-500 text-center py-10">Guidelines are currently unavailable.</p>
        )}
      </div>
    </AffiliateShell>
  );
}
