import { useState } from 'react';
import { AdminShell } from './shells';
import { useAdminDocuments, useAdminDocumentDraft, useAdminDocumentPublish, useAdminEmailTemplates, useAdminEmailTemplateUpdate } from './hooks';
import { Loader2, Plus, Edit2, CheckCircle2, FileText, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

export default function AdminCompliance() {
  const [activeTab, setActiveTab] = useState<'documents' | 'emails'>('documents');
  
  return (
    <AdminShell title="Compliance Content" subtitle="Manage versioned legal documents and email templates">
      <div className="flex gap-4 border-b mb-6">
        <button 
          className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${activeTab === 'documents' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          onClick={() => setActiveTab('documents')}
        >
          <FileText className="w-4 h-4 inline mr-2" /> Documents
        </button>
        <button 
          className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${activeTab === 'emails' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          onClick={() => setActiveTab('emails')}
        >
          <Mail className="w-4 h-4 inline mr-2" /> Email Templates
        </button>
      </div>

      {activeTab === 'documents' ? <DocumentsTab /> : <EmailsTab />}
    </AdminShell>
  );
}

function DocumentsTab() {
  const { data: docs = [], isLoading } = useAdminDocuments();
  const draftDoc = useAdminDocumentDraft();
  const publishDoc = useAdminDocumentPublish();
  const { toast } = useToast();
  
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ documentType: 'marketing_guidelines', title: 'Marketing and Brand Guidelines', content: '', version: '1.1' });

  if (isLoading) return <div className="flex justify-center p-12"><Loader2 className="animate-spin text-slate-800" /></div>;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await draftDoc.mutateAsync(form);
      toast({ title: "Draft saved", description: "Document draft created successfully." });
      setEditing(false);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    }
  };

  const handlePublish = async (id: string) => {
    try {
      await publishDoc.mutateAsync(id);
      toast({ title: "Document published", description: "Affiliates will now need to acknowledge the new version." });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    }
  };

  return (
    <div className="space-y-6">
      {editing ? (
        <form onSubmit={handleSave} className="bg-white border rounded-xl shadow-sm p-6">
          <h3 className="font-bold text-lg mb-4">Create Document Draft</h3>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <label className="block text-sm font-medium text-slate-700">
                Document Type
                <select 
                  className="mt-1 block w-full rounded-md border-slate-300 border px-3 py-2 shadow-sm focus:border-slate-800 focus:ring-slate-800 sm:text-sm"
                  value={form.documentType} onChange={e => setForm({...form, documentType: e.target.value})}
                >
                  <option value="marketing_guidelines">Marketing Guidelines</option>
                  <option value="agreement">Partner Agreement</option>
                  <option value="privacy">Privacy Notice</option>
                  <option value="ftc_disclosure">FTC Disclosure</option>
                  <option value="payment_authorization">Payment Authorization</option>
                </select>
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Version Number
                <input 
                  type="text" required
                  className="mt-1 block w-full rounded-md border-slate-300 border px-3 py-2 shadow-sm focus:border-slate-800 focus:ring-slate-800 sm:text-sm"
                  value={form.version} onChange={e => setForm({...form, version: e.target.value})}
                />
              </label>
            </div>
            <label className="block text-sm font-medium text-slate-700">
              Title
              <input 
                type="text" required
                className="mt-1 block w-full rounded-md border-slate-300 border px-3 py-2 shadow-sm focus:border-slate-800 focus:ring-slate-800 sm:text-sm"
                value={form.title} onChange={e => setForm({...form, title: e.target.value})}
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Content (Markdown/Text)
              <textarea 
                required rows={10}
                className="mt-1 block w-full rounded-md border-slate-300 border px-3 py-2 shadow-sm focus:border-slate-800 focus:ring-slate-800 sm:text-sm font-mono"
                value={form.content} onChange={e => setForm({...form, content: e.target.value})}
              />
            </label>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
              <Button type="submit" disabled={draftDoc.isPending} className="bg-slate-900 hover:bg-slate-800 text-white">Save Draft</Button>
            </div>
          </div>
        </form>
      ) : (
        <div className="flex justify-end">
          <Button onClick={() => setEditing(true)} className="bg-slate-900 hover:bg-slate-800 text-white">
            <Plus className="w-4 h-4 mr-2" /> New Document Draft
          </Button>
        </div>
      )}

      <div className="bg-white border rounded-xl shadow-sm overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-600">
          <thead className="bg-slate-50 text-slate-900 border-b">
            <tr>
              <th className="px-4 py-3 font-semibold">Type</th>
              <th className="px-4 py-3 font-semibold">Title</th>
              <th className="px-4 py-3 font-semibold">Version</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {docs.map((doc: any) => (
              <tr key={doc.id} className="hover:bg-slate-50">
                <td className="px-4 py-4 capitalize">{doc.documentType}</td>
                <td className="px-4 py-4 font-medium text-slate-900">{doc.title}</td>
                <td className="px-4 py-4">{doc.version}</td>
                <td className="px-4 py-4">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${doc.status === 'published' ? 'bg-emerald-100 text-emerald-800' : doc.status === 'draft' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-800'}`}>
                    {doc.status}
                  </span>
                </td>
                <td className="px-4 py-4 text-right">
                  {doc.status === 'draft' && (
                    <Button variant="outline" size="sm" onClick={() => handlePublish(doc.id)} disabled={publishDoc.isPending}>
                      Publish
                    </Button>
                  )}
                  {doc.status === 'published' && (
                    <span className="text-slate-400 text-xs flex items-center justify-end"><CheckCircle2 className="w-3 h-3 mr-1" /> Active</span>
                  )}
                </td>
              </tr>
            ))}
            {docs.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-slate-500">No documents found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EmailsTab() {
  const { data: templates = [], isLoading } = useAdminEmailTemplates();
  const updateTemplate = useAdminEmailTemplateUpdate();
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ subject: '', body: '' });

  if (isLoading) return <div className="flex justify-center p-12"><Loader2 className="animate-spin text-slate-800" /></div>;

  const handleEdit = (t: any) => {
    setEditingId(t.id);
    setForm({ subject: t.subject || '', body: t.body || '' });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    try {
      await updateTemplate.mutateAsync({ id: editingId, data: form });
      toast({ title: "Template saved", description: "Email template updated successfully." });
      setEditingId(null);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 space-y-2">
          {templates.map((t: any) => (
            <button 
              key={t.id}
              onClick={() => handleEdit(t)}
              className={`w-full text-left px-4 py-3 rounded-lg border text-sm font-medium transition-colors ${editingId === t.id ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'}`}
            >
              {t.name}
            </button>
          ))}
          {templates.length === 0 && <p className="text-slate-500 text-sm">No templates available.</p>}
        </div>

        <div className="md:col-span-2">
          {editingId ? (
            <form onSubmit={handleSave} className="bg-white border rounded-xl shadow-sm p-6">
              <h3 className="font-bold text-lg mb-4">Edit Template</h3>
              <div className="space-y-4">
                <label className="block text-sm font-medium text-slate-700">
                  Subject Line
                  <input 
                    type="text" required
                    className="mt-1 block w-full rounded-md border-slate-300 border px-3 py-2 shadow-sm focus:border-slate-800 focus:ring-slate-800 sm:text-sm"
                    value={form.subject} onChange={e => setForm({...form, subject: e.target.value})}
                  />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Email Body (Text/HTML)
                  <textarea 
                    required rows={8}
                    className="mt-1 block w-full rounded-md border-slate-300 border px-3 py-2 shadow-sm focus:border-slate-800 focus:ring-slate-800 sm:text-sm"
                    value={form.body} onChange={e => setForm({...form, body: e.target.value})}
                  />
                </label>
                <div className="bg-slate-50 p-4 rounded text-xs text-slate-600 border">
                  <strong>Available variables:</strong> {"{{affiliateName}}"}, {"{{portalLink}}"}, {"{{missingItemsList}}"}
                </div>
                <div className="flex justify-end gap-3 pt-4 border-t">
                  <Button type="button" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                  <Button type="submit" disabled={updateTemplate.isPending} className="bg-slate-900 hover:bg-slate-800 text-white">Save Template</Button>
                </div>
              </div>
            </form>
          ) : (
            <div className="bg-slate-50 border rounded-xl border-dashed h-full min-h-[300px] flex items-center justify-center text-slate-500 text-sm">
              Select a template to edit
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
