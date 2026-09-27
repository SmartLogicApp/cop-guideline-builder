import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const authenticatedAppSource = await readFile(new URL('../src/AuthenticatedApp.tsx', import.meta.url), 'utf8');
const globalStyles = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');
const authStyles = await readFile(new URL('../src/auth.css', import.meta.url), 'utf8');
const landingSource = await readFile(new URL('../src/pages/landing.tsx', import.meta.url), 'utf8');
const billingSource = await readFile(new URL('../src/pages/billing.tsx', import.meta.url), 'utf8');
const registerSource = await readFile(new URL('../src/pages/register.tsx', import.meta.url), 'utf8');
const acceptTermsSource = await readFile(new URL('../src/pages/accept-terms.tsx', import.meta.url), 'utf8');
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

test('billing is authenticated and gates Stripe actions on server availability', () => {
  const routeBoundary = componentBody(appSource, 'RouteBoundary');
  const billing = componentBody(authenticatedAppSource, 'Billing');

  assert.match(routeBoundary, /normalizedLocation === ['"]\/billing['"]/);
  assert.match(billing, /<Show when="signed-in">[\s\S]*<BillingPage key=\{user\.id\} \/>/);
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
  assert.match(billingSource, /subscription\?\.status === ['"]pending_payment['"]/);
  assert.match(billingSource, /Start 30-day free trial/);
  assert.match(billingSource, /const hasActiveStripeSubscription = \[['"]active['"], ['"]trialing['"]\]/);
  assert.match(
    billingSource,
    /const hasRecoverableStripeSubscription = \[['"]past_due['"], ['"]unpaid['"], ['"]incomplete['"], ['"]paused['"]\]/,
  );
  const recoverableStatuses = billingSource.match(
    /const hasRecoverableStripeSubscription = \[([^\]]+)\]/,
  )?.[1];
  assert.ok(recoverableStatuses);
  assert.doesNotMatch(recoverableStatuses, /canceled|incomplete_expired|pending_payment/);
  assert.match(billingSource, /hasManageableStripeSubscription/);
  assert.match(billingSource, /LOCAL_TRIAL_STILL_ACTIVE/);
  assert.match(billingSource, /Checkout will be available after your no-card trial ends/);
  assert.match(billingSource, /Your consultant trial remains active until/);
  assert.match(billingSource, /Contact support/);
  const planActionsStart = billingSource.indexOf('{hasManageableStripeSubscription ? (');
  const planActionsEnd = billingSource.indexOf(
    'Secure checkout and subscription management are provided by Stripe.',
    planActionsStart,
  );
  assert.ok(planActionsStart >= 0 && planActionsEnd > planActionsStart);
  const planActions = billingSource.slice(planActionsStart, planActionsEnd);
  const checkoutBranchStart = planActions.lastIndexOf(') : (');
  assert.match(
    planActions.slice(checkoutBranchStart),
    /openStripe\(['"]checkout['"]\)/,
    'Expected checkout to remain available when no active/trialing Stripe subscription exists',
  );
  assert.match(planActions, /openStripe\(['"]portal['"]\)/);
  assert.match(billingSource, /endpoint: ['"]checkout['"] \| ['"]portal['"]/);
  assert.match(billingSource, /`\/api\/billing\/\$\{endpoint\}`/);
  assert.match(billingSource, /paymentAcceptanceEnabled \?/);
  assert.match(billingSource, /disabled=\{actionLoading !== null\}/);
  assert.doesNotMatch(workspaceSource, /href=\{`\$\{basePath\}\/admin`\}/);
  assert.doesNotMatch(workspaceSource, /Continue for \$299\/month/);
  assert.match(workspaceSource, /View billing and access options/);
});

test('registration is routed, authenticated, and reachable from the workspace', () => {
  // Registration is the only path that creates an account. Before it existed,
  // POST /api/accounts/register had no caller and a new customer landed on a
  // dead end. These four assertions are the wiring that keeps it reachable.
  const routeBoundary = componentBody(appSource, 'RouteBoundary');
  const register = componentBody(authenticatedAppSource, 'Register');
  const registerPageSource = readFileSync(
    new URL('../src/pages/register.tsx', import.meta.url),
    'utf8',
  );

  // A route registered in AuthenticatedApp but missing from the RouteBoundary
  // allowlist renders the PUBLIC router instead, and 404s for a signed-in user.
  assert.match(
    routeBoundary,
    /normalizedLocation === ['"]\/register['"]/,
    'Expected /register in the authenticated path allowlist in App.tsx',
  );
  assert.match(
    authenticatedAppSource,
    /<Route path="\/register" component=\{Register\} \/>/,
    'Expected /register to be registered in the authenticated route table',
  );
  assert.match(register, /<Show when="signed-in">\s*<RegisterPage \/>/);
  assert.match(register, /<Show when="signed-out"><RedirectToSignIn \/><\/Show>/);
  assert.match(registerPageSource, /identifierType === ['"]consultant['"]/);
  assert.match(registerPageSource, /Approved, active affiliates can create a consultant account/);
  assert.match(registerPageSource, /\/accept-terms\?registration=direct/);
  assert.match(registerPageSource, /Your subscription will be charged on\s+day 31/);

  // A signed-in user with no account row must be sent to registration, not to
  // the trial-ended screen. Getting this wrong tells a customer on their first
  // visit that a trial they never had has expired.
  assert.match(
    workspaceSource,
    /NeedsRegistrationScreen registerUrl=\{`\$\{basePath\}\/register`\}/,
    'Expected the workspace to route unregistered users to /register',
  );
  // The isActive half of the guard keeps admins, who have access without an
  // account row, out of the registration screen.
  assert.match(
    workspaceSource,
    /!accountData\?\.account && !accountData\?\.isActive/,
    'Expected the registration guard to consider access as well as account',
  );
});

test('new accounts record explicit acceptance after registration and show the receipt in billing', () => {
  assert.match(registerSource, /<TermsDocument version=\{termsVersion\} \/>/);
  assert.match(registerSource, /termsVersion !== null && termsChecked && termsScrolled/);
  assert.match(registerSource, /const acceptedAt = new Date\(\)\.toISOString\(\)/);
  assert.ok(registerSource.indexOf("fetch('/api/accounts/register'") < registerSource.indexOf("fetch('/api/accounts/terms-acceptance'"));
  assert.match(registerSource, /acceptance\.status === 409 && attempt < 2/);
  assert.match(registerSource, /if \(!accepted\) \{[\s\S]*?setLocation\([\s\S]*?'\/accept-terms/);
  assert.match(registerSource, /invalidateQueries\(\{ queryKey: \['\/api\/accounts\/me'\] \}\)/);
  assert.match(acceptTermsSource, /invalidateQueries\(\{ queryKey: \['\/api\/accounts\/me'\] \}\)/);
  assert.match(billingSource, /fetch\('\/api\/accounts\/me'/);
  assert.match(billingSource, /accountQuery\.data\.account\.termsVersion/);
  assert.match(billingSource, /accountQuery\.data\.account\.termsAcceptedAt/);
});

test('terms acceptance is reachable from registration and from the checkout refusal', () => {
  // /accept-terms had no inbound link anywhere in the codebase, while checkout
  // refused to proceed without it. Both ends are asserted here.
  const acceptTermsSource = readFileSync(
    new URL('../src/pages/accept-terms.tsx', import.meta.url),
    'utf8',
  );
  assert.match(
    acceptTermsSource,
    /href=\{`\$\{basePath\}\/register`\}/,
    'Expected the unregistered state on /accept-terms to link to /register',
  );
  assert.match(acceptTermsSource, /registration['"]\) === ['"]direct['"]/);
  assert.match(acceptTermsSource, /Go to billing to start your trial/);
  assert.match(acceptTermsSource, /href=\{`\$\{basePath\}\/billing`\}/);
  assert.match(
    billingSource,
    /TERMS_ACCEPTANCE_REQUIRED/,
    'Expected billing to recognise the checkout terms refusal',
  );
  assert.match(
    billingSource,
    /window\.location\.assign\(`\$\{basePath\}\/accept-terms`\)/,
    'Expected the terms refusal to send the customer to /accept-terms',
  );
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
test('the affiliate programme page is public and reachable from the site footer', () => {
  // An affiliate is not a customer. Putting the programme behind sign-in would
  // exclude exactly the consultants and associations it exists to reach — and
  // the failure is invisible, because the page still "works" for anyone already
  // logged in, which is everyone who tests it.
  const router = componentBody(appSource, 'PublicRouter');
  assert.match(
    router,
    /<Route path="\/affiliates" component=\{AffiliatesPage\} \/>/,
    'affiliates must be registered in the PUBLIC router',
  );

  // The needsAuth allowlist gates the authenticated shell. /affiliates must not
  // appear there, unlike /register.
  const needsAuthBlock = appSource.slice(
    appSource.indexOf('const needsAuth'),
    appSource.indexOf('return needsAuth'),
  );
  assert.doesNotMatch(
    needsAuthBlock,
    /'\/affiliates'/,
    'the affiliate page must not require authentication',
  );

  // A program nobody can find recruits nobody.
  assert.match(landingSource, /const AFFILIATES_URL = siteUrl\("\/affiliates"\)/);
  assert.match(landingSource, /href=\{AFFILIATES_URL\}/);
});

test('the affiliate application posts to the public apply endpoint', async () => {
  const affiliatesPage = await readFile(new URL('../src/pages/affiliates.tsx', import.meta.url), 'utf8');
  assert.match(affiliatesPage, /api\/affiliates\/apply/);
  assert.match(affiliatesPage, /method:\s*'POST'/);
  assert.match(affiliatesPage, /crypto\.randomUUID\(\)/);
  assert.match(affiliatesPage, /'X-Application-Reference': attemptReference/);
  assert.match(affiliatesPage, /response\.headers\.get\('X-Application-Reference'\)/);
  assert.match(affiliatesPage, /if \(!response\.ok\) throw/);
  assert.match(affiliatesPage, /Attempt reference:/);
  assert.match(affiliatesPage, /Reference for support:/);

  // The applicant must not be asked to choose a referral code — the server
  // assigns it at approval. A field here would make the form lie about what
  // happens, and invite squatting on official-looking codes.
  assert.doesNotMatch(
    affiliatesPage,
    /id="referralCode"|name="referralCode"/,
    'the application form must not collect a referral code',
  );

  // Commercial terms are still under review; the application must not
  // promise or display rates, payout timing, or affiliate agreement clauses.
  assert.doesNotMatch(affiliatesPage, /\b\d+(?:\.\d+)?\s*%|payouts?|holdback|grace period|affiliate program agreement/i);
  assert.match(affiliatesPage, /commission details provided upon approval/i);
  for (const key of ['contactName', 'companyName', 'email', 'phone', 'about']) {
    assert.match(affiliatesPage, new RegExp(`\\b${key}\\b`), `missing application field ${key}`);
  }
});

test('pending applications have a separate admin review view with approval gated on reviewed terms', () => {
  const review = componentBody(workspaceSource, 'AffiliateApplicationsSection');
  assert.match(review, /load\("\/api\/affiliates"\)/);
  assert.match(review, /row\.status === "pending"/);
  assert.match(review, /row\.phone/);
  assert.match(review, /row\.referralPlan/);
  assert.match(review, /setActivationEnabled\(stats\.activationEnabled === true\)/);
  assert.match(review, /isSuperAdmin && activationEnabled && agreementStatus\?\.published && row\.agreementAcceptance && !row\.applicationHeldAt && <>/);
  assert.match(review, /\/approve`/);
  assert.match(review, /Paid partner approvals are paused/);
  assert.doesNotMatch(review, /holdback|grace period/i);
  assert.match(componentBody(workspaceSource, 'AdminQuickPanel'), /id: "applications"/);
});
