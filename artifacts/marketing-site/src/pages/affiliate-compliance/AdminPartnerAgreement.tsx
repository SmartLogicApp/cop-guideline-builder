import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { useAdminAgreementCurrent, useAdminAgreementPublish, useAdminAgreementV4Draft } from './hooks';
import { agreementPublishSchema, type AgreementPublishFields } from './agreement-publish-schema';

export default function AdminPartnerAgreement() {
  // This endpoint is super-admin only. Never render the authoring form until
  // the server has authorized this session.
  const current = useAdminAgreementCurrent();
  const publish = useAdminAgreementPublish();
  const v4Draft = useAdminAgreementV4Draft();
  const [result, setResult] = useState('');
  const [loadedV4Hash, setLoadedV4Hash] = useState('');
  const [canonicalV4Loaded, setCanonicalV4Loaded] = useState(false);
  const autoLoadRequested = useRef(false);
  const form = useForm<AgreementPublishFields>({
    resolver: zodResolver(agreementPublishSchema),
    defaultValues: { version: '', body: '', confirmedReviewed: false },
  });
  const reviewed = form.watch('confirmedReviewed');

  const loadVersion4 = useCallback(async () => {
    setResult('');
    setCanonicalV4Loaded(false);
    setLoadedV4Hash('');
    form.reset({ version: '', body: '', confirmedReviewed: false });
    form.clearErrors('root');
    try {
      const prepared = await v4Draft.mutateAsync();
      form.setValue('version', prepared.version, { shouldValidate: true, shouldDirty: true });
      form.setValue('body', prepared.body, { shouldValidate: true, shouldDirty: true });
      form.setValue('confirmedReviewed', false, { shouldValidate: true, shouldDirty: true });
      setLoadedV4Hash(prepared.contentSha256);
      setCanonicalV4Loaded(true);
    } catch (error) {
      form.setError('root', { message: error instanceof Error ? error.message : 'Unable to load the prepared Version 4.0 text.' });
    }
  }, [form.clearErrors, form.setError, form.setValue, v4Draft.mutateAsync]);

  // Prepare the immutable source-derived text only after the server has
  // confirmed super-admin access. Nothing is published or acknowledged here.
  useEffect(() => {
    if (!current.isSuccess || autoLoadRequested.current) return;
    autoLoadRequested.current = true;
    void loadVersion4();
  }, [current.isSuccess, loadVersion4]);

  async function onSubmit(fields: AgreementPublishFields) {
    // Keep this check even if the form is submitted programmatically.
    if (!canonicalV4Loaded || fields.confirmedReviewed !== true) return;
    setResult('');
    try {
      const response = await publish.mutateAsync({
        version: fields.version,
        body: fields.body,
        confirmedReviewed: fields.confirmedReviewed,
      });
      setResult(`Published agreement version ${response.version}.`);
      form.reset({ version: '', body: '', confirmedReviewed: false });
      setCanonicalV4Loaded(false);
      setLoadedV4Hash('');
    } catch (error) {
      form.setError('root', { message: error instanceof Error ? error.message : 'Unable to publish agreement.' });
    }
  }

  if (current.isPending) return <p role="status">Checking super-admin access…</p>;
  if (current.isError) return <p role="alert">Super-admin access is required to manage the Partner Agreement.</p>;

  return (
    <section className="max-w-3xl rounded-xl border bg-white p-6 shadow-sm">
      <h2 className="text-xl font-bold text-slate-900">Affiliate Partner Agreement</h2>
      <p className="mt-2 text-sm text-slate-600" data-testid="status-current-agreement">
        {current.data?.version
          ? `Configured reviewed version: ${current.data.version} (${current.data.published ? 'published' : 'not yet published'}).`
          : 'No reviewed version is configured yet.'}
      </p>
      <p className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" role="note">
        Publishing this exact text creates an immutable, binding, publicly-effective agreement version.
        It cannot be edited or withdrawn here; a correction requires a new version and new acceptances.
        Do not publish until the account owner has approved the final text.
      </p>
      <p className="mt-3 text-sm text-slate-600">
        Prepared Version 4.0 loads automatically for your review. Loading it does not publish the agreement.
      </p>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 space-y-5" data-testid="form-publish-agreement">
          <div>
            <label htmlFor="agreement-version" className="block text-sm font-medium text-slate-800">Version string</label>
            <input
              id="agreement-version" data-testid="input-agreement-version" required maxLength={64}
              readOnly={canonicalV4Loaded}
              {...form.register('version')}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 read-only:bg-slate-50"
            />
            {form.formState.errors.version && <p role="alert" className="mt-1 text-sm text-red-700">{form.formState.errors.version.message}</p>}
          </div>
          <div>
            <label htmlFor="agreement-body" className="block text-sm font-medium text-slate-800">Full agreement body text</label>
            <Button type="button" variant="outline" className="mt-2" onClick={loadVersion4} disabled={v4Draft.isPending || publish.isPending}>
              {v4Draft.isPending ? 'Loading prepared agreement…' : 'Load prepared attorney-reviewed Version 4.0'}
            </Button>
            {loadedV4Hash && <p role="status" className="mt-2 break-all text-xs text-slate-600">
              Prepared Version 4.0 text checksum (SHA-256): {loadedV4Hash}. This exact body is read-only.
            </p>}
            <textarea
              id="agreement-body" data-testid="input-agreement-body" required rows={16} maxLength={150_000}
              readOnly={canonicalV4Loaded}
              {...form.register('body')}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm read-only:bg-slate-50"
            />
            {form.formState.errors.body && <p role="alert" className="mt-1 text-sm text-red-700">{form.formState.errors.body.message}</p>}
          </div>
          <label className="flex items-start gap-3 text-sm font-medium text-slate-900">
            <input
              type="checkbox" data-testid="checkbox-review-agreement" required disabled={!canonicalV4Loaded || v4Draft.isPending}
              {...form.register('confirmedReviewed')}
              className="mt-1 h-4 w-4"
            />
            <span>I have personally reviewed this exact text and confirm it is final.</span>
          </label>
          {form.formState.errors.confirmedReviewed && <p role="alert" className="text-sm text-red-700">{form.formState.errors.confirmedReviewed.message}</p>}
          {form.formState.errors.root && <p role="alert" className="text-sm text-red-700">{form.formState.errors.root.message}</p>}
          {result && <p role="status" data-testid="status-agreement-published" className="text-sm text-green-800">{result}</p>}
          <Button type="submit" data-testid="button-publish-agreement" disabled={!canonicalV4Loaded || !reviewed || v4Draft.isPending || publish.isPending || form.formState.isSubmitting}>
            {publish.isPending ? 'Publishing…' : 'Publish reviewed agreement'}
          </Button>
        </form>
      </Form>
    </section>
  );
}