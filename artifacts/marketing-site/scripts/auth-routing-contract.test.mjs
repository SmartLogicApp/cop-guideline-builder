import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const landingSource = await readFile(new URL('../src/pages/landing.tsx', import.meta.url), 'utf8');

function componentBody(source, functionName) {
  const start = source.indexOf(`function ${functionName}(`);
  assert.notEqual(start, -1, `Expected ${functionName} to exist`);

  const nextFunction = source.indexOf('\nfunction ', start + 1);
  return source.slice(start, nextFunction === -1 ? source.length : nextFunction);
}

test('auth, app, and legal paths are registered before the 404 fallback', () => {
  const router = componentBody(appSource, 'Router');
  const expectedRoutes = [
    '<Route path="/" component={HomePage} />',
    '<Route path="/sign-in/*?" component={SignInPage} />',
    '<Route path="/sign-up/*?" component={SignUpPage} />',
    '<Route path="/app" component={ComplianceWorkspace} />',
    '<Route path="/terms" component={TermsPage} />',
    '<Route path="/privacy" component={PrivacyPage} />',
  ];

  let previousIndex = -1;
  for (const route of expectedRoutes) {
    const routeIndex = router.indexOf(route);
    assert.ok(routeIndex > previousIndex, `Expected routed page before the 404 fallback: ${route}`);
    previousIndex = routeIndex;
  }

  assert.ok(
    router.indexOf('<Route component={NotFound} />') > previousIndex,
    'Expected the 404 route to remain last',
  );
});

test('Clerk path routing keeps callback subpaths and post-auth app redirects valid', () => {
  const signInPage = componentBody(appSource, 'SignInPage');
  const signUpPage = componentBody(appSource, 'SignUpPage');

  assert.match(signInPage, /path=\{`\$\{basePath\}\/sign-in`\}/);
  assert.match(signInPage, /signUpUrl=\{`\$\{basePath\}\/sign-up`\}/);
  assert.match(signInPage, /forceRedirectUrl=\{`\$\{basePath\}\/app`\}/);
  assert.match(signUpPage, /path=\{`\$\{basePath\}\/sign-up`\}/);
  assert.match(signUpPage, /signInUrl=\{`\$\{basePath\}\/sign-in`\}/);
  assert.match(signUpPage, /forceRedirectUrl=\{`\$\{basePath\}\/app`\}/);
});

test('signed-out visitors to the protected app are sent to sign-in', () => {
  const workspace = componentBody(appSource, 'ComplianceWorkspace');
  assert.match(
    workspace,
    /<Show when="signed-out"><RedirectToSignIn \/><\/Show>/,
    'Expected signed-out /app visitors to use Clerk sign-in redirection',
  );
});

test('homepage sign-in and free-trial CTAs target the registered auth routes', () => {
  assert.match(landingSource, /const SIGN_IN_URL = siteUrl\(["']\/sign-in["']\);/);
  assert.match(landingSource, /const SIGN_UP_URL = siteUrl\(["']\/sign-up["']\);/);
  assert.match(
    landingSource,
    /<a href=\{SIGN_IN_URL\}[^>]*>\s*Sign In\s*<\/a>/,
    'Expected the homepage Sign In CTA to target /sign-in',
  );
  assert.match(
    landingSource,
    /<a href=\{SIGN_UP_URL\}>Free Trial<\/a>/,
    'Expected the homepage Free Trial CTA to target /sign-up',
  );
});

test('homepage links preserve the configured site base path', () => {
  assert.match(
    landingSource,
    /const siteUrl = \(path: string\) =>\s*`\$\{import\.meta\.env\.BASE_URL\}\$\{path\.replace\(/,
  );
  assert.match(landingSource, /const TERMS_URL = siteUrl\(["']\/terms["']\);/);
  assert.match(landingSource, /const PRIVACY_URL = siteUrl\(["']\/privacy["']\);/);
  assert.match(landingSource, /<a href=\{TERMS_URL\}[^>]*>Terms of Service<\/a>/);
  assert.match(landingSource, /<a href=\{PRIVACY_URL\}[^>]*>Privacy Policy<\/a>/);
});