import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const authenticatedAppSource = await readFile(new URL('../src/AuthenticatedApp.tsx', import.meta.url), 'utf8');
const globalStyles = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');
const authStyles = await readFile(new URL('../src/auth.css', import.meta.url), 'utf8');
const landingSource = await readFile(new URL('../src/pages/landing.tsx', import.meta.url), 'utf8');
const billingSource = await readFile(new URL('../src/pages/billing.tsx', import.meta.url), 'utf8');
const workspaceSource = await readFile(new URL('../../../index.jsx', import.meta.url), 'utf8');

function componentBody(source, functionName) {
  const start = source.indexOf(`function ${functionName}(`);
  assert.notEqual(start, -1, `Expected ${functionName} to exist`);

  const nextFunction = source.indexOf('\nfunction ', start + 1);
  return source.slice(start, nextFunction === -1 ? source.length : nextFunction);
}

test('public paths are registered before the public 404 fallback', () => {
  const router = componentBody(appSource, 'PublicRouter');
  const expectedRoutes = [
    '<Route path="/" component={LandingPage} />',
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

test('Clerk and authenticated routes stay behind a dynamic import', () => {
  const routeBoundary = componentBody(appSource, 'RouteBoundary');

  assert.match(appSource, /lazy\(\(\) => import\(['"]\.\/AuthenticatedApp['"]\)\)/);
  assert.doesNotMatch(appSource, /from ['"]@clerk\//);
  assert.doesNotMatch(appSource, /components\/ui\/(?:toaster|tooltip)/);
  assert.match(routeBoundary, /const \[location\] = useLocation\(\)/);
  assert.doesNotMatch(routeBoundary, /window\.location/);
  assert.match(routeBoundary, /location\.replace\(\/\\\/\+\$\/, ['"]{2}\)/);
  assert.match(componentBody(appSource, 'AppWithRouter'), /<WouterRouter base=\{basePath\}>\s*<RouteBoundary \/>/);
  assert.match(authenticatedAppSource, /<Route path="\/sign-in\/\*\?" component=\{SignInPage\} \/>/);
  assert.match(authenticatedAppSource, /<Route path="\/sign-up\/\*\?" component=\{SignUpPage\} \/>/);
  assert.match(authenticatedAppSource, /<Route path="\/app" component=\{ComplianceWorkspace\} \/>/);
  assert.match(authenticatedAppSource, /<Route path="\/billing" component=\{Billing\} \/>/);
  assert.match(authenticatedAppSource, /<ClerkLoading>\s*<ClerkLoadingState \/>/);
  assert.match(authenticatedAppSource, /<ClerkLoaded>\s*<QueryClientProvider/);
  assert.doesNotMatch(globalStyles, /@clerk\/themes/);
  assert.match(authStyles, /@clerk\/themes\/shadcn\.css/);
  assert.match(authenticatedAppSource, /import ['"]\.\/auth\.css['"]/);
});

test('billing is an authenticated route with an honest pre-launch state', () => {
  const routeBoundary = componentBody(appSource, 'RouteBoundary');
  const billing = componentBody(authenticatedAppSource, 'Billing');

  assert.match(routeBoundary, /normalizedLocation === ['"]\/billing['"]/);
  assert.match(billing, /<Show when="signed-in">\s*<BillingPage \/>/);
  assert.match(billing, /<Show when="signed-out"><RedirectToSignIn \/><\/Show>/);
  assert.match(billingSource, /\/api\/billing\/subscription/);
  assert.match(billingSource, /\/api\/billing\/token-usage/);
  assert.match(billingSource, /Paid billing is not active yet/);
  assert.match(
    billingSource,
    /subscription\?\.paymentAcceptanceEnabled === true/,
  );
  assert.match(billingSource, /data-payment-acceptance=/);
  assert.match(billingSource, /Payment acceptance not enabled/);
  assert.doesNotMatch(billingSource, /\/api\/billing\/checkout/);
  assert.doesNotMatch(billingSource, /\/api\/billing\/portal/);
  assert.doesNotMatch(workspaceSource, /href=\{`\$\{basePath\}\/admin`\}/);
  assert.doesNotMatch(workspaceSource, /Continue for \$299\/month/);
  assert.match(workspaceSource, /View billing and access options/);
});

test('Clerk path routing keeps callback subpaths and post-auth app redirects valid', () => {
  const signInPage = componentBody(authenticatedAppSource, 'SignInPage');
  const signUpPage = componentBody(authenticatedAppSource, 'SignUpPage');

  assert.match(signInPage, /path=\{`\$\{basePath\}\/sign-in`\}/);
  assert.match(signInPage, /signUpUrl=\{`\$\{basePath\}\/sign-up`\}/);
  assert.match(signInPage, /forceRedirectUrl=\{`\$\{basePath\}\/app`\}/);
  assert.match(signUpPage, /path=\{`\$\{basePath\}\/sign-up`\}/);
  assert.match(signUpPage, /signInUrl=\{`\$\{basePath\}\/sign-in`\}/);
  assert.match(signUpPage, /forceRedirectUrl=\{`\$\{basePath\}\/app`\}/);
});

test('signed-out visitors to the protected app are sent to sign-in', () => {
  const workspace = componentBody(authenticatedAppSource, 'ComplianceWorkspace');
  assert.match(
    workspace,
    /<Show when="signed-out"><RedirectToSignIn \/><\/Show>/,
    'Expected signed-out /app visitors to use Clerk sign-in redirection',
  );
});

test('the private workspace is lazy-loaded behind clear loading and error states', () => {
  assert.match(
    authenticatedAppSource,
    /const CoPGuidelineBuilder = lazy\(\(\) =>\s*import\(['"]\.\/workspace-entry['"]\)\)/,
    'Expected the legacy workspace and its styles to use a private dynamic entry',
  );
  assert.doesNotMatch(
    authenticatedAppSource,
    /import CoPGuidelineBuilder from ['"]\.\.\/\.\.\/\.\.\/index\.jsx['"]/,
    'Expected no eager workspace import in the public entry',
  );

  const workspace = componentBody(authenticatedAppSource, 'ComplianceWorkspace');
  assert.match(workspace, /FallbackComponent=\{WorkspaceLoadError\}/);
  assert.match(workspace, /<Suspense fallback=\{<WorkspaceLoading \/>\}>/);
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