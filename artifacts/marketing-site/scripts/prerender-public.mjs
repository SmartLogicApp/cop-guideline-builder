import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const outDir = path.resolve(root, process.env.BUILD_OUT_DIR ?? 'dist/public');
const origin = 'https://cmscomplianceguardian.com';
const pages = [
  { route: '/', module: 'landing.tsx', title: 'CMS Compliance Suite | CMS Survey Readiness Software',
    description: 'Prepare for CMS surveys with verified CoP guidance, policy templates, inspection checklists, and AI-powered gap assessment for healthcare facilities.' },
  { route: '/affiliates/', module: 'affiliates.tsx', title: 'Affiliate Partner Program | CMS Compliance Suite',
    description: 'Healthcare compliance consultants and associations can apply to refer facilities to CMS Compliance Suite. Review commissions, eligibility, and terms.' },
  { route: '/terms/', module: 'terms.tsx', title: 'Terms of Service | CMS Compliance Suite',
    description: 'Read the CMS Compliance Suite terms of service, including acceptable use, subscriptions, billing, cancellation, and important compliance limitations.' },
  { route: '/privacy/', module: 'privacy.tsx', title: 'Privacy Policy | CMS Compliance Suite',
    description: 'Read how CMS Compliance Suite handles account information, service data, security, retention, and privacy requests.' },
];

function escapeHtml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
}

function meta(html, name, value, property = false) {
  const key = property ? 'property' : 'name';
  return html.replace(new RegExp(`(<meta ${key}="${name}" content=")[^"]*(" ?/>)`), (_, start, end) =>
    `${start}${escapeHtml(value)}${end}`);
}

const shell = await readFile(path.join(outDir, 'index.html'), 'utf8');
if (!shell.includes('<div id="root"></div>')) throw new Error('Cannot locate prerender root in built HTML');

// Vite resolves the same path aliases and BASE_URL used by the browser build.
// The server is only for loading source modules at build time; it never listens.
const vite = await createServer({
  configFile: path.join(root, 'vite.config.ts'),
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});
try {
  for (const page of pages) {
    const { default: Component } = await vite.ssrLoadModule(`/src/pages/${page.module}`);
    const { Router } = await vite.ssrLoadModule('wouter');
    const content = renderToString(React.createElement(Router, { ssrPath: page.route },
      React.createElement(Component)));
    if (!/<h1\b/.test(content)) throw new Error(`Missing prerendered heading on ${page.route}`);
    const url = `${origin}${page.route}`;
    let html = shell.replace('<div id="root"></div>', `<div id="root">${content}</div>`);
    html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(page.title)}</title>`);
    html = meta(html, 'description', page.description);
    html = meta(html, 'og:title', page.title, true);
    html = meta(html, 'og:description', page.description, true);
    html = meta(html, 'og:url', url, true);
    html = meta(html, 'twitter:url', url);
    html = meta(html, 'twitter:title', page.title);
    html = meta(html, 'twitter:description', page.description);
    html = html.replace(/(<link rel="canonical" href=")[^"]*(" ?\/>)/,
      `$1${url}$2`);
    // Only the homepage describes the software offer in JSON-LD.
    if (page.route !== '/') {
      html = html.replace(/    <script type="application\/ld\+json">[\s\S]*?<\/script>\s*/, '');
    }
    const file = page.route === '/'
      ? path.join(outDir, 'index.html')
      : path.join(outDir, page.route.slice(1), 'index.html');
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, html);
  }
} finally {
  await vite.close();
}