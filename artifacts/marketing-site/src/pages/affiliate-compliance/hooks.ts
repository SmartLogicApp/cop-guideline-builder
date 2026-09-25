import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/react';
import { useCallback } from 'react';

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
export function usePortalData() {
  const fetchAuth = useFetchAuth();
  return useQuery({
    queryKey: ['affiliate-portal'],
    queryFn: () => fetchAuth('/portal'),
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
    mutationFn: (data: { documentVersionId: string; typedLegalName: string; agreed: boolean }) =>
      fetchAuth('/portal/acknowledgements', { method: 'POST', body: JSON.stringify(data) }),
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
export function useAdminAffiliates() {
  const fetchAuth = useFetchAuth();
  return useQuery({
    queryKey: ['admin-affiliates'],
    queryFn: () => fetchAuth('/admin'),
  });
}

export function useAdminAffiliateDetail(id: string) {
  const fetchAuth = useFetchAuth();
  return useQuery({
    queryKey: ['admin-affiliate', id],
    queryFn: () => fetchAuth(`/admin/${id}`),
    enabled: !!id,
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

export function useAdminPayouts() {
  const fetchAuth = useFetchAuth();
  return useQuery({
    queryKey: ['admin-payouts'],
    queryFn: () => fetchAuth('/admin/payouts'),
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
