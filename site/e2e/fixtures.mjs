// Shared test helpers: a clean chain for every test, wallet injection and the steps of one pull.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test as base, expect } from '@playwright/test';
import { getAddress } from 'viem';
import { readState, rewind } from './chain.mjs';
import { installMockWallet } from './mock-wallet.mjs';
import { CHAIN_ID, LIVE_URL, RPC_URL } from './ports.mjs';

const here = dirname(fileURLToPath(import.meta.url));
// The same file the page reads. Tests never hardcode card names, colors or art.
export const cardsJson = JSON.parse(readFileSync(join(here, '..', 'public', 'cards.json'), 'utf8'));
export const cardById = new Map(cardsJson.cards.map((c) => [c.id, c]));
export const pad3 = (n) => String(n).padStart(3, '0');
export const short = (a) => `${a.slice(0, 6)}...${a.slice(-4)}`;

export const test = base.extend({
  // Every test starts from "sale open, 0 of 100 pulled".
  chain: [async ({}, use) => { await rewind(); const s = readState(); await use({ ...s, address: getAddress(s.address) }); }, { auto: true }],
  // Anvil accounts by role. The deployer is not the owner.
  who: async ({ chain }, use) => {
    const [deployer, owner, buyer, stranger, crowd] = chain.accounts;
    await use({ deployer, owner, buyer, stranger, crowd });
  },
  // Keep the run offline and quiet: the page's web fonts are swapped for empty files.
  page: async ({ page }, use) => {
    await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await use(page);
  },
  // Collects anything that would count as a broken page.
  problems: async ({ page }, use) => {
    const problems = [];
    page.on('console', (m) => { if (m.type() === 'error') problems.push(`console error: ${m.text()}`); });
    page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
    page.on('requestfailed', (r) => problems.push(`request failed: ${r.url()} ${r.failure()?.errorText}`));
    page.on('response', (r) => { if (r.status() >= 400) problems.push(`HTTP ${r.status()}: ${r.url()}`); });
    await use(problems);
  },
});
export { expect };

export const addWallet = (page, account, options = {}) =>
  page.addInitScript(installMockWallet, { rpcUrl: RPC_URL, chainId: CHAIN_ID, account, ...options });
export const wallet = (page) => page.evaluate(() => {
  const { requests, sent, chainId, connected } = window.__mockWallet;
  return { requests, sent, chainId, connected };
});
export const setWallet = (page, patch) => page.evaluate((p) => Object.assign(window.__mockWallet, p), patch);

export const title = (page) => page.locator('#modalTitle');
export const modal = (page) => page.locator('#modal');
// Buttons in the body of the dialog. The X in its corner is not one of these.
export const button = (page, name) => page.locator('#modalBody').getByRole('button', { name, exact: true });

export async function openMachine(page, url = LIVE_URL) {
  await page.goto(url);
  await expect(page.locator('#galleryGrid .gball')).toHaveCount(cardsJson.cards.length);
}

// Waits until the page has read the machine and shows this many pulled.
export const expectPulled = (page, n) => expect(page.locator('#navPulled')).toHaveText(`${n}/${cardsJson.cards.length}`);

// Coin, connect, and stop on the Approve view.
// again: true starts from the CRANK AGAIN button on The Peel instead of the coin.
export async function toApprove(page, { connected = false, again = false, walletName = 'Mock Wallet' } = {}) {
  await (again ? button(page, 'CRANK AGAIN') : page.locator('#coin')).click();
  await expect(title(page)).toHaveText('PULL A SPLATZ');
  if (connected) {
    await button(page, 'CONTINUE').click();
  } else {
    await button(page, 'CONNECT WALLET').click();
    await expect(title(page)).toHaveText('CONNECT WALLET');
    await modal(page).getByRole('button', { name: walletName }).click();
  }
  await expect(title(page)).toHaveText('APPROVE IN WALLET');
}

// Reads what The Peel shows.
export async function readPeel(page) {
  await expect(title(page)).toHaveText('THE PEEL', { timeout: 30_000 });
  const img = modal(page).locator('img.rimg');
  await expect(img).toBeVisible();
  return {
    id: Number((await modal(page).locator('.rnum').innerText()).replace('#', '')),
    name: await modal(page).locator('.rname').innerText(),
    rarity: await modal(page).locator('.rrar').innerText(),
    src: new URL(await img.getAttribute('src'), page.url()).pathname,
    stats: await modal(page).locator('.rsv').allInnerTexts(),
    img,
  };
}

// The whole pull from the coin to The Peel.
export async function pullThroughSite(page, options) {
  await toApprove(page, options);
  await button(page, 'DROP THE COIN').click();
  return readPeel(page);
}

export const oddsRow = (page, tier) => page.locator('#oddsBody tr').filter({ hasText: tier }).locator('td').first();
export const ball = (page, id) => page.locator('#galleryGrid .gball').nth(cardsJson.cards.findIndex((c) => c.id === id));
