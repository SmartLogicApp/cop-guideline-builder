import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const sitemap = await readFile(new URL('public/sitemap.xml', root), 'utf8');
const robots = await readFile(new URL('public/robots.txt', root), 'utf8');
const shell = await readFile(new URL('index.html', root), 'utf8');
const prerender = await readFile(new URL('scripts/prerender-public.mjs', root), 'utf8');
const artifact = await readFile(new URL('.replit-artifact/artifact.toml', root), 'utf8');

const publicMarketingRoutes = ['/', '/affiliates/', '/terms/', '/privacy/'];

test('sitemap contains only public marketing URLs on the canonical host', () => {
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  assert.deepEqual(locations, publicMarketingRoutes.map((route) =>
    `https://cmscomplianceguardian.com${route}`));
  assert.match(sitemap, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(sitemap, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.doesNotMatch(sitemap, /sign-in|sign-up|\/app|\/billing|affiliate-agreement/);
});

test('robots allows public crawling and declares the canonical sitemap', () => {
  assert.match(robots, /^User-agent: \*\nAllow: \//);
  assert.match(robots, /Sitemap: https:\/\/cmscomplianceguardian\.com\/sitemap\.xml/);
});

test('shell and prerendered marketing pages use canonical-host page URLs', () => {
  assert.match(shell, /<link rel="canonical" href="https:\/\/cmscomplianceguardian\.com\/" \/>/);
  assert.match(shell, /<meta property="og:url" content="https:\/\/cmscomplianceguardian\.com\/" \/>/);
  assert.match(shell, /<meta name="twitter:url" content="https:\/\/cmscomplianceguardian\.com\/" \/>/);
  assert.doesNotMatch(shell, /replit\.app/i);
  for (const route of publicMarketingRoutes) {
    assert.ok(prerender.includes(`route: '${route}'`), `Expected ${route} to be prerendered`);
  }
  assert.match(prerender, /meta\(html, 'og:url', url, true\)/);
  assert.match(prerender, /meta\(html, 'twitter:url', url\)/);
  assert.match(prerender, /rel="canonical"/);
  assert.doesNotMatch(prerender, /replit\.app/i);
});

test('SEO files and canonical public route rewrites bypass the SPA fallback', () => {
  const fallbackIndex = artifact.indexOf('from = "/*"');
  for (const path of ['/sitemap.xml', '/robots.txt', '/affiliates/', '/terms/', '/privacy/']) {
    const index = artifact.indexOf(`from = "${path}"`);
    assert.ok(index >= 0 && index < fallbackIndex, `Expected explicit rewrite for ${path} before SPA fallback`);
  }
  assert.match(artifact, /from = "\/sitemap\.xml"\nto = "\/sitemap\.xml"/);
});