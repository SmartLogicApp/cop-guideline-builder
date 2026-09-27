function validateProductionClerkCredentials(env) {
  // The shared key is provisioned for the workspace; the Expo-specific key,
  // when supplied, is what Metro embeds in the client bundle.
  const keys = [
    ['CLERK_PUBLISHABLE_KEY', env.CLERK_PUBLISHABLE_KEY],
    ['EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY', env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY],
  ].filter(([, value]) => value !== undefined && value !== '');

  if (keys.length === 0) {
    throw new Error('Production mobile build blocked: a Clerk publishable key is required (pk_live_).');
  }
  for (const [name, value] of keys) {
    const key = value.trim();
    if (key.startsWith('pk_test_')) {
      throw new Error(`Production mobile build blocked: ${name} uses Clerk development credentials (pk_test_). Configure a production publishable key (pk_live_).`);
    }
    if (!key.startsWith('pk_live_')) {
      throw new Error(`Production mobile build blocked: ${name} must begin with pk_live_.`);
    }
  }
}

module.exports = { validateProductionClerkCredentials };