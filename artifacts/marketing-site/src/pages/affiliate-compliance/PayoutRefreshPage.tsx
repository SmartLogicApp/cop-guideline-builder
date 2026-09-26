import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useStripeSync } from './hooks';
import { AffiliateShell } from './shells';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function PayoutRefreshPage() {
  const sync = useStripeSync();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    // A refresh link means the previous onboarding link expired or was interrupted.
    // Reconcile any completed steps before offering a new link in the portal.
    sync.mutateAsync()
      .then(() => setLocation('/partners/portal'))
      .catch((error) => {
        toast({
          variant: 'destructive',
          title: 'Payment setup could not be checked',
          description: error instanceof Error ? error.message : 'Please try again from the portal.',
        });
        setLocation('/partners/portal');
      });
  }, []);

  return (
    <AffiliateShell title="Checking payment setup">
      <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl shadow-sm border mt-8">
        <Loader2 className="w-10 h-10 animate-spin text-teal-800 mb-4" />
        <p className="text-slate-500">Checking your payment setup with Stripe...</p>
      </div>
    </AffiliateShell>
  );
}
