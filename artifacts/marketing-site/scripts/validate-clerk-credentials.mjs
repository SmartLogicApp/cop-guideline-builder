const DEVELOPMENT_KEY_PREFIX = 'pk_test_';
const PRODUCTION_KEY_PREFIX = 'pk_live_';

export function validateProductionClerkCredentials(publishableKey) {
  if (!publishableKey) {
    throw new Error(
      'Production build blocked: VITE_CLERK_PUBLISHABLE_KEY is required.',
    );
  }

  if (publishableKey.startsWith(DEVELOPMENT_KEY_PREFIX)) {
    throw new Error(
      'Production build blocked: VITE_CLERK_PUBLISHABLE_KEY uses Clerk development credentials (pk_test_). Configure a Clerk production publishable key (pk_live_) before publishing.',
    );
  }

  if (!publishableKey.startsWith(PRODUCTION_KEY_PREFIX)) {
    throw new Error(
      'Production build blocked: VITE_CLERK_PUBLISHABLE_KEY is not a recognized Clerk production publishable key. Expected a key beginning with pk_live_.',
    );
  }
}