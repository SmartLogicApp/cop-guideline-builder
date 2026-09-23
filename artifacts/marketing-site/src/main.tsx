import { createRoot, hydrateRoot } from 'react-dom/client';

import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';

import './index.css';

const root = document.getElementById('root')!;
const app = <ErrorBoundary><App /></ErrorBoundary>;
const options = {
  // Keeps caught errors off reportError(), which would raise the dev overlay.
  onCaughtError: (error: unknown, errorInfo: { componentStack?: string }) => {
    console.error(error, errorInfo.componentStack);
  },
};
if (root.hasChildNodes()) {
  hydrateRoot(root, app, options);
} else {
  createRoot(root, options).render(app);
}
