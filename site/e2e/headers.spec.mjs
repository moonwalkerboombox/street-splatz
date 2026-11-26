// The response headers Cloudflare will send, checked on Cloudflare's own local server (wrangler dev).
// It serves the site build the other tests use, with the real wrangler.jsonc and the real _headers file.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { HEADERS_PORT } from './ports.mjs';

const site = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(site, '..');
const wranglerBin = join(repo, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const BASE = `http://127.0.0.1:${HEADERS_PORT}`;

// "npm run setup" does not install wrangler. "npm ci" at the repo root does, and CI always runs that.
test.skip(!existsSync(wranglerBin) && !process.env.CI, 'wrangler is not installed. Run "npm ci" at the repo root to include these tests.');

let server;
let log = '';
test.beforeAll(async () => {
  const env = { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1' };
  server = spawn(process.execPath, [wranglerBin, 'dev', '--assets', join('site', '.e2e', 'live'), '--ip', '127.0.0.1', '--port', String(HEADERS_PORT)], {
    cwd: repo, env, stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (d) => { log += d; });
  server.stderr.on('data', (d) => { log += d; });
  for (let i = 0; i < 300; i++) {
    try { if ((await fetch(`${BASE}/cards.json`)).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`wrangler dev did not start on port ${HEADERS_PORT}:\n${log}`);
});
test.afterAll(async () => {
  if (!server || server.exitCode != null) return;
  const gone = new Promise((r) => server.once('exit', r));
  server.kill('SIGTERM');
  await Promise.race([gone, new Promise((r) => setTimeout(r, 5_000))]);
  if (server.exitCode == null) server.kill('SIGKILL');
});

const get = (path) => fetch(`${BASE}${path}`, { redirect: 'manual' });

test('card metadata is served as JSON, open to other sites', async () => {
  for (const path of ['/meta/1.json', '/meta/100.json', '/meta/collection.json']) {
    const res = await get(path);
    expect(res.status, path).toBe(200);
    expect(res.headers.get('content-type'), path).toMatch(/^application\/json/);
    expect(res.headers.get('access-control-allow-origin'), path).toBe('*');
    expect(res.headers.get('cache-control'), path).toBe('public, max-age=3600');
    expect(typeof (await res.json()).name, path).toBe('string');
  }
});

test('a card that does not exist is a 404 that is not labeled as JSON', async () => {
  for (const path of ['/meta/101.json', '/meta/0.json', '/meta/nope.json']) {
    const res = await get(path);
    expect(res.status, path).toBe(404);
    // The body is the HTML "not found" page. A marketplace must not be told it is JSON.
    expect(res.headers.get('content-type'), path).toMatch(/^text\/html/);
    expect(await res.text(), path).toContain('<html');
  }
});

test('card art is served as an image, and a missing image is not', async () => {
  const ok = await get('/img/001.png');
  expect(ok.status).toBe(200);
  expect(ok.headers.get('content-type')).toBe('image/png');
  expect(ok.headers.get('access-control-allow-origin')).toBe('*');
  // The lighter copy the page shows.
  const web = await get('/img/001.webp');
  expect(web.status).toBe(200);
  expect(web.headers.get('content-type')).toBe('image/webp');
  expect(web.headers.get('access-control-allow-origin')).toBe('*');
  const missing = await get('/img/999.png');
  expect(missing.status).toBe(404);
  expect(missing.headers.get('content-type')).toMatch(/^text\/html/);
});

test('no rule in _headers forces a Content-Type', async () => {
  // A forced type also lands on the "not found" page for that folder. Cloudflare picks the type from the file name.
  const res = await get('/_headers');
  expect(res.status, 'the _headers file itself is not published').toBe(404);
  const { readFileSync } = await import('node:fs');
  const rules = readFileSync(join(site, 'public', '_headers'), 'utf8').split('\n').filter((l) => /^\s+\S/.test(l));
  expect(rules.filter((l) => /^\s*content-type\s*:/i.test(l))).toEqual([]);
});

test('pages are never cached and the owner page stays out of search engines', async () => {
  const home = await get('/');
  expect(home.status).toBe(200);
  expect(home.headers.get('content-type')).toMatch(/^text\/html/);
  expect(home.headers.get('cache-control')).toMatch(/max-age=0/);
  const admin = await get('/admin');
  expect(admin.status).toBe(200);
  expect(admin.headers.get('x-robots-tag')).toBe('noindex, nofollow');
});
