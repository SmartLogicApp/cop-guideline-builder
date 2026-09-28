import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/react';
import { useCallback } from 'react';
import { verifyAgreementDraft, type VerifiedAgreementDraft } from './verify-agreement-draft';
import { buildAcknowledgementPayload, type AcknowledgeDocumentInput, type AffiliatePortalData, type AdminAccountAccessData, type AdminAffiliateDetailData, type PayoutSummary, type PayoutStatement, type PaidCommissionRecoveryReview, type RecoveryDecision } from './types';

const API_BASE = '/api/affiliate-compliance';

function useFetchAuth(base = API_BASE) {
  const { getToken } = useAuth();
  return useCallback(
    async (path: string, options?: RequestInit) => {
      const token = await getToken();
      const headers = new Headers(options?.headers);
      if (token) headers.set('Authorization', `Bearer ${token}`);
      if (options?.body && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }

      const res = await fetch(`${base}${path}`, {
        ...options,
        headers,
      });

      if (!res.ok) {
        let err;
        try {
          const body = await res.json();
          err = body.error || body.message || 'An error occurred';
        } catch {
          err = res.statusText;
        }
        throw new Error(err);
      }
      return res.json();
    },
    [getToken, base]
  );
}

// The owner-reviewed Partner Agreement is stored separately from compliance
// document drafts. Both routes require the server's super-admin guard.
export function useAdminAgreementCurrent() {
  const fetchAuth = useFetchAuth('/api/affiliates/agreements');
  return useQuery<{ version: string | null; published: boolean; publishedAt?: string }>({
    queryKey: ['admin-agreement-current'],
    queryFn: () => fetchAuth('/current'),
    retry: false,
  });
}

export function useAdminAgreementV4Draft() {
  const fetchAuth = useFetchAuth('/api/affiliates/agreements');
  return useMutation<VerifiedAgreementDraft, Error, void>({
    mutationFn: async () => verifyAgreementDraft(await fetchAuth('/v4-draft')),
  });
}

export function useAdminAgreementPublish() {
  const fetchAuth = useFetchAuth('/api/affiliates/agreements');
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { version: string; body: string; confirmedReviewed: boolean }) =>
      fetchAuth('/publish', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-agreement-current'] }),
  });
}

// PORTAL HOOKS
export function usePortalPayouts() {
  const fetchAuth = useFetchAuth();
  const { userId, sessionId } = useAuth();
  return useQuery<PayoutSummary[]>({
    queryKey: ['portal-payouts', userId, sessionId],
    queryFn: () => fetchAuth('/portal/payouts'),
    enabled: !!userId && !!sessionId,
    refetchOnMount: 'always',
  });
}

export function usePayoutStatement(scope: 'admin' | 'portal', id: string, expanded: boolean) {
  const fetchAuth = useFetchAuth();
  const { userId, sessionId } = useAuth();
  return useQuery<PayoutStatement>({
    queryKey: ['payout-statement', scope, userId, sessionId, id],
    queryFn: () => fetchAuth(`/${scope}/payouts/${encodeURIComponent(id)}/statement`),
    enabled: expanded && !!id && !!userId && !!sessionId,
    refetchOnMount: 'always',
  });
}

export function useDownloadPayoutStatement(scope: 'admin' | 'portal', id: string) {
  const { getToken } = useAuth();
  return useMutation<void, Error, void>({
    mutationFn: async () => {
      const token = await getToken();
      if (!token) throw new Error('Sign in again to download this statement.');
      const response = await fetch(`${API_BASE}/${scope}/payouts/${encodeURIComponent(id)}/statement?format=csv`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      });
      if (!response.ok) throw new Error(`Statement download failed (${response.status}). Please try again.`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `payout-statement-${id}.csv`;
      try {
        document.body.appendChild(link);
        link.click();
      } finally {
        link.remove();
        URL.revokeObjectURL(url);
      }
    },
  });
}

export function usePortalData() {
  const fetchAuth = useFetchAuth();
  return useQuery<AffiliatePortalData>({
    queryKey: ['affiliate-portal'],
    queryFn: () => fetchAuth('/portal'),
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

export function usePortalRegion() {
  const fetchAuth = useFetchAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { country: string; state: string }) =>
      fetchAuth('/portal/region', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['affiliate-portal'] }),
  });
}

export function useAcknowledge() {
  const fetchAuth = useFetchAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: AcknowledgeDocumentInput) =>
      fetchAuth('/portal/acknowledgements', { method: 'POST', body: JSON.stringify(buildAcknowledgementPayload(data)) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['affiliate-portal'] }),
  });
}

export function useAgreementAcceptance() {
  const fetchAuth = useFetchAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { agreementVersion: string; typedLegalName: string; agreed: boolean }) =>
      fetchAuth('/portal/agreement-accept', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['affiliate-portal'] }),
  });
}

export function usePaymentAuth() {
  const fetchAuth = useFetchAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { typedLegalName: string; agreed: boolean }) =>
      fetchAuth('/portal/payment-authorization', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['affiliate-portal'] }),
  });
}

export function useStripeConnect() {
  const fetchAuth = useFetchAuth();
  return useMutation({
    mutationFn: () => fetchAuth('/portal/connect', { method: 'POST' }),
  });
}

export function useStripeSync() {
  const fetchAuth = useFetchAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => fetchAuth('/portal/connect/sync', { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['affiliate-portal'] }),
  });
}

// ADMIN HOOKS
export function useAdminAffiliates(includeTest = false) {
  const fetchAuth = useFetchAuth();
  return useQuery({
    queryKey: ['admin-affiliates', includeTest],
    queryFn: () => fetchAuth(`/admin${includeTest ? '?includeTest=true' : ''}`),
  });
}

export function useAdminAffiliateDetail(id: string) {
  const fetchAuth = useFetchAuth();
  return useQuery<AdminAffiliateDetailData>({
    queryKey: ['admin-affiliate', id],
    queryFn: () => fetchAuth(`/admin/${id}`),
    enabled: !!id,
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

export function useAdminAccountAccess(enabled: boolean) {
  const fetchAuth = useFetchAuth('/api/accounts');
  const { userId } = useAuth();
  return useQuery<AdminAccountAccessData>({
    queryKey: ['admin-account-access', userId],
    queryFn: () => fetchAuth('/me', { cache: 'no-store' }),
    enabled: enabled && !!userId,
    staleTime: 0,
    refetchOnMount: 'always',
    retry: false,
  });
}

export function useAdminAction(id: string) {
  const fetchAuth = useFetchAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { action: string; reason: string; holdType?: string; country?: string; state?: string }) =>
      fetchAuth(`/admin/${id}/action`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-affiliate', id] });
      queryClient.invalidateQueries({ queryKey: ['admin-affiliates'] });
    },
  });
}

export function useAdminApplicationDecision(id: string) {
  const fetchAuth = useFetchAuth('/api/affiliates');
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (decision:
      | { action: 'approve'; commissionRatePct: number }
      | { action: 'reject' | 'hold'; reason: string }
      | { action: 'release-hold' }) =>
      fetchAuth(`/${encodeURIComponent(id)}/${decision.action}`, {
        method: 'POST', body: JSON.stringify(decision.action === 'approve'
          ? { commissionRatePct: decision.commissionRatePct }
          : decision.action === 'release-hold' ? {} : { reason: decision.reason }),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-affiliate', id] }),
        queryClient.invalidateQueries({ queryKey: ['admin-affiliates'] }),
      ]);
    },
  });
}

export function useAdminRecheck(id: string) {
  const fetchAuth = useFetchAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => fetchAuth(`/admin/${id}/recheck`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-affiliate', id] });
      queryClient.invalidateQueries({ queryKey: ['admin-affiliates'] });
    },
  });
}

export function useAdminRemind(id: string) {
  const fetchAuth = useFetchAuth();
  return useMutation({
    mutationFn: () => fetchAuth(`/admin/${id}/remind`, { method: 'POST' }),
  });
}

export function useAdminDocuments() {
  const fetchAuth = useFetchAuth();
  return useQuery({
    queryKey: ['admin-documents'],
    queryFn: () => fetchAuth('/admin/documents'),
  });
}

export function useAdminDocumentDraft() {
  const fetchAuth = useFetchAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { documentType: string; title: string; content: string; version: string }) =>
      fetchAuth('/admin/documents', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-documents'] }),
  });
}

export function useAdminDocumentPublish() {
  const fetchAuth = useFetchAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fetchAuth(`/admin/documents/${id}/publish`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-documents'] }),
  });
}

export function useAdminPayouts(includeTest = false) {
  const fetchAuth = useFetchAuth();
  const { userId, sessionId } = useAuth();
  return useQuery<PayoutSummary[]>({
    queryKey: ['admin-payouts', userId, sessionId, includeTest],
    queryFn: () => fetchAuth(`/admin/payouts${includeTest ? '?includeTest=true' : ''}`),
    enabled: !!userId && !!sessionId,
    refetchOnMount: 'always',
  });
}

export type AdminTestRecordType = 'client' | 'affiliate';

export function useAdminTestFlag() {
  const fetchAuth = useFetchAuth('/api/admin');
  const queryClient = useQueryClient();

  return useMutation<unknown, Error, {
    recordType: AdminTestRecordType;
    id: string;
    isTest: boolean;
    reason: string;
  }>({
    mutationFn: ({ recordType, id, isTest, reason }) => {
      const collection = recordType === 'client' ? 'clients' : 'affiliates';
      return fetchAuth(`/${collection}/${encodeURIComponent(id)}/test`, {
        method: 'PATCH',
        body: JSON.stringify({ isTest, reason: reason.trim() }),
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-clients'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-affiliate-report'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-affiliates'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-affiliate'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-stats'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-payouts'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-quarterly-preview'] }),
        queryClient.invalidateQueries({ queryKey: ['payout-statement'] }),
        queryClient.invalidateQueries({ queryKey: ['portal-payouts'] }),
        queryClient.invalidateQueries({ queryKey: ['affiliate-portal'] }),
      ]);
    },
  });
}

export function useAdminRecoveryReviews() {
  const fetchAuth = useFetchAuth();
  const { userId, sessionId } = useAuth();
  return useQuery<PaidCommissionRecoveryReview[]>({
    queryKey: ['admin-recovery-reviews', userId, sessionId],
    queryFn: () => fetchAuth('/admin/payouts/recovery-reviews'),
    enabled: !!userId && !!sessionId,
    refetchOnMount: 'always',
  });
}

export function useResolveRecoveryReview() {
  const fetchAuth = useFetchAuth();
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, { invoiceId: string; decision: RecoveryDecision; reason: string }>({
    mutationFn: ({ invoiceId, decision, reason }) =>
      fetchAuth(`/admin/payouts/recovery-reviews/${encodeURIComponent(invoiceId)}/resolve`, {
        method: 'POST', body: JSON.stringify({ decision, reason: reason.trim() }),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-recovery-reviews'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-affiliates'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-affiliate'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-payouts'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-quarterly-preview'] }),
        queryClient.invalidateQueries({ queryKey: ['payout-statement'] }),
        queryClient.invalidateQueries({ queryKey: ['portal-payouts'] }),
        queryClient.invalidateQueries({ queryKey: ['affiliate-portal'] }),
      ]);
    },
  });
}

export function useAdminQuarterlyPreview(quarter: string) {
  const fetchAuth = useFetchAuth();
  return useQuery({
    queryKey: ['admin-quarterly-preview', quarter],
    queryFn: () => fetchAuth(`/admin/payouts/quarterly-preview?quarter=${encodeURIComponent(quarter)}`),
    enabled: /^\d{4}-Q[1-4]$/.test(quarter),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

export function useAdminQuarterlyRun() {
  const fetchAuth = useFetchAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (quarter: string) => fetchAuth('/admin/payouts/quarterly-run',
      { method: 'POST', body: JSON.stringify({ quarter, confirmed: true }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-payouts'] });
      queryClient.invalidateQueries({ queryKey: ['payout-statement', 'admin'] });
      queryClient.invalidateQueries({ queryKey: ['admin-affiliates'] });
      queryClient.invalidateQueries({ queryKey: ['admin-quarterly-preview'] });
    },
  });
}

export function useAdminPayoutDraft() {
  const fetchAuth = useFetchAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { affiliateId: string; payoutPeriodStart: string; payoutPeriodEnd: string }) =>
      fetchAuth('/admin/payouts/draft', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-payouts'] });
      queryClient.invalidateQueries({ queryKey: ['payout-statement', 'admin'] });
      queryClient.invalidateQueries({ queryKey: ['admin-affiliates'] });
    },
  });
}

export function useAdminPayoutApprove(id: string) {
  const fetchAuth = useFetchAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { reason: string }) =>
      fetchAuth(`/admin/payouts/${id}/approve`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-payouts'] });
      queryClient.invalidateQueries({ queryKey: ['payout-statement', 'admin'] });
      queryClient.invalidateQueries({ queryKey: ['admin-affiliates'] });
    },
  });
}

export function useAdminPayoutSend(id: string) {
  const fetchAuth = useFetchAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { reason: string; confirmed: boolean }) =>
      fetchAuth(`/admin/payouts/${id}/send`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-payouts'] });
      queryClient.invalidateQueries({ queryKey: ['payout-statement', 'admin'] });
      queryClient.invalidateQueries({ queryKey: ['admin-affiliates'] });
    },
  });
}

export function useAdminPayoutVoid(id: string) {
  const fetchAuth = useFetchAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { reason: string }) =>
      fetchAuth(`/admin/payouts/${id}/void`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-payouts'] });
      queryClient.invalidateQueries({ queryKey: ['payout-statement', 'admin'] });
      queryClient.invalidateQueries({ queryKey: ['admin-affiliates'] });
    },
  });
}

export function useAdminEmailTemplates() {
  const fetchAuth = useFetchAuth();
  return useQuery({
    queryKey: ['admin-email-templates'],
    queryFn: () => fetchAuth('/admin/email-templates'),
  });
}

export function useAdminEmailTemplateUpdate() {
  const fetchAuth = useFetchAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      fetchAuth(`/admin/email-templates/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-email-templates'] }),
  });
}
