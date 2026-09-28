import './workspace.css';
import { AdminClientsTable } from './pages/affiliate-compliance/AdminClients';
import { AdminAffiliatesTable } from './pages/affiliate-compliance/AdminAffiliatesList';

// @ts-expect-error The legacy compliance workspace is a JavaScript component.
import CoPGuidelineBuilder from '../../../index.jsx';

type WorkspaceProps = {
  clerkUserId?: string;
  getToken: () => Promise<string | null>;
  onSignOut: () => void;
};

export default function WorkspaceEntry(props: WorkspaceProps) {
  return <CoPGuidelineBuilder {...props}
    AdminClientsTable={AdminClientsTable}
    AdminAffiliatesTable={AdminAffiliatesTable} />;
}