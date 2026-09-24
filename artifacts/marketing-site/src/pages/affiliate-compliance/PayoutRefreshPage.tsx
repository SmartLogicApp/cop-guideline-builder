import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useStripeSync } from './hooks';
import { AffiliateShell } from './shells';
import { Loader2 } from 'lucide-react';

export default function PayoutRefreshPage() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    // Stripe onboarding was interrupted or timed out. Just send back to portal to let them restart.
    setLocation('/partners/portal');
  }, []);

  return (
    <AffiliateShell title="Redirecting">
      <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl shadow-sm border mt-8">
        <Loader2 className="w-10 h-10 animate-spin text-teal-800 mb-4" />
        <p className="text-slate-500">Returning to portal...</p>
      </div>
    </AffiliateShell>
  );
}
