import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useStripeSync } from './hooks';
import { AffiliateShell } from './shells';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function PayoutReturnPage() {
  const sync = useStripeSync();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    sync.mutateAsync()
      .then(() => {
        toast({ title: "Setup saved", description: "Your payment setup status has been updated." });
        setLocation('/partners/portal');
      })
      .catch((err) => {
        toast({ variant: "destructive", title: "Error", description: err.message });
        setLocation('/partners/portal');
      });
  }, []);

  return (
    <AffiliateShell title="Processing Setup">
      <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl shadow-sm border mt-8">
        <Loader2 className="w-10 h-10 animate-spin text-teal-800 mb-4" />
        <h2 className="text-xl font-semibold text-slate-900">Verifying your payment setup...</h2>
        <p className="text-slate-500 mt-2">Please wait while we update your status from Stripe.</p>
      </div>
    </AffiliateShell>
  );
}
