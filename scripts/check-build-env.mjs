// Runs before "npm run build". Stops the build when the settings would publish a broken site,
// for example a live contract whose card metadata still points at localhost.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// The site build also reads these files, so look in them for anything not set in the environment.
const fromFiles = {};
for (const name of ['.env', '.env.local', '.env.production', '.env.production.local']) {
  const file = join(root, 'site', name);
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m) fromFiles[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const get = (name) => (process.env[name] ?? fromFiles[name] ?? '').trim();

const chain = get('VITE_CHAIN') || 'base';
const address = get('VITE_CONTRACT_ADDRESS');
const siteUrl = (process.env.SITE_URL || '').trim();
const problems = [];

if (!['base', 'baseSepolia', 'anvil'].includes(chain)) problems.push(`VITE_CHAIN is "${chain}". It must be base, baseSepolia or anvil.`);
if (address && !/^0x[0-9a-fA-F]{40}$/.test(address)) problems.push(`VITE_CONTRACT_ADDRESS is "${address}". That is not a contract address.`);
if (siteUrl && !/^https?:\/\/[^/]+$/.test(siteUrl.replace(/\/+$/, ''))) problems.push(`SITE_URL is "${siteUrl}". It must look like https://example.com with no path.`);
if (address && chain !== 'anvil' && !/^https:\/\//.test(siteUrl)) {
  problems.push('VITE_CONTRACT_ADDRESS is set but SITE_URL is not an https address. The card metadata would point at the wrong place. Set SITE_URL to the public site address, such as https://example.com.');
}

const fiftyCents = get('VITE_FIFTY_CENT_PRICE_ETH');
if (fiftyCents && !(/^\d*\.?\d+$/.test(fiftyCents) && Number(fiftyCents) > 0)) {
  problems.push(`VITE_FIFTY_CENT_PRICE_ETH is "${fiftyCents}". It must be an amount in ETH, such as 0.0003.`);
}

if (problems.length) {
  console.error(`Build stopped:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log(`Building Street Splatz. Network: ${chain}. Contract: ${address || 'none (preview mode)'}. Site address: ${siteUrl || 'not set (metadata will point at http://localhost:5173)'}.`);
