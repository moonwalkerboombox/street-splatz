// The machine page against the real contract on anvil.
import { formatEther, parseEther } from 'viem';
import { cardsOwnedBy, client, machineAddress, pullDirect, read, revertName, send } from './chain.mjs';
import {
  addWallet, ball, button, cardById, cardsJson, expect, expectPulled, modal, oddsRow, openMachine, pad3,
  pullThroughSite, readPeel, setWallet, short, test, title, toApprove, wallet,
} from './fixtures.mjs';
import { LIVE_URL, PREVIEW_URL, RPC_URL } from './ports.mjs';

const TOTAL = cardsJson.cards.length;
const PRICE = parseEther('0.0003');

// Everything the page must show after one card has been pulled by this wallet.
async function expectCardEverywhere(page, peel, buyer, pulledSoFar) {
  const card = cardById.get(peel.id);
  expect(card, `card ${peel.id} is in cards.json`).toBeTruthy();
  expect((await read('ownerOf', [BigInt(peel.id)])).toLowerCase()).toBe(buyer.toLowerCase());
  expect(peel.name).toBe(card.name);
  expect(peel.rarity.toLowerCase()).toBe(card.rarity.toLowerCase());
  expect(peel.src).toBe(`/img/${pad3(peel.id)}.png`);
  expect(peel.src).toBe(card.img);
  expect(peel.stats.map(Number)).toEqual(card.stats);
  expect(await peel.img.evaluate((el) => el.complete && el.naturalWidth > 0), 'card image really loaded').toBe(true);
  await expectPulled(page, pulledSoFar);
  await expect(ball(page, peel.id)).toHaveClass(/pulled/);
  await expect(ball(page, peel.id)).toHaveAttribute('aria-label', new RegExp(card.name));
  await expect(page.locator('#galleryGrid .gball.locked')).toHaveCount(TOTAL - pulledSoFar);
}

test('a. loads with 0 of 100 pulled, 100 locked gumballs and the full odds table', async ({ page, problems, chain }) => {
  await openMachine(page);
  await expectPulled(page, 0);
  await expect(page.locator('#galleryGrid .gball.locked')).toHaveCount(100);
  await expect(page.locator('#galleryGrid .gball.pulled')).toHaveCount(0);
  const rows = await page.locator('#oddsBody tr').evaluateAll((trs) => trs.map((tr) => [...tr.cells].map((c) => c.innerText.trim())));
  expect(rows).toEqual([
    ['Street Legend', '4 of 4', '4.0%'],
    ['Block Hitter', '23 of 23', '23.0%'],
    ['Fresh Drop', '55 of 55', '55.0%'],
    ['Pavement Card', '18 of 18', '18.0%'],
  ]);
  await expect(page.locator('#navPrice')).toHaveText('0.0003 ETH');
  await expect(page.locator('#ctaSub')).toContainText('0 of 100 pulled.');
  await expect(page.locator('#ctaSub')).toContainText('0.0003 ETH a pull, about 50 cents.');
  await expect(page.locator('#fineContract')).toHaveText(chain.address);
  await expect(page.locator('#fineProv')).toHaveText(await read('PROVENANCE'));
  // The page says how the pick works, honestly, in one short line.
  await expect(page.locator('.fine')).toContainText('It is not verifiable randomness.');
  expect(problems).toEqual([]);
});

test('b, c, k. happy path, then crank again for a second card, with a clean console', async ({ page, problems, who }) => {
  await addWallet(page, who.buyer);
  await openMachine(page);
  await expectPulled(page, 0);
  const before = await client.getBalance({ address: who.buyer });

  const first = await pullThroughSite(page);
  expect(await cardsOwnedBy(who.buyer)).toEqual([first.id]);
  await expectCardEverywhere(page, first, who.buyer, 1);
  const tier = cardById.get(first.id).rarity;
  await expect(oddsRow(page, tier)).toHaveText(`${cardsJson.tiers[tier] - 1} of ${cardsJson.tiers[tier]}`);
  for (const other of Object.keys(cardsJson.tiers).filter((t) => t !== tier)) {
    await expect(oddsRow(page, other)).toHaveText(`${cardsJson.tiers[other]} of ${cardsJson.tiers[other]}`);
  }
  await expect(page.locator('#walletNavAddr')).toHaveText(short(who.buyer));
  await expect(page.locator('#dropsList li')).toHaveCount(1);
  await expect(page.locator('#dropsList li')).toContainText(cardById.get(first.id).name);

  // The token's metadata address on chain points at a file this site really serves.
  const uri = await read('tokenURI', [BigInt(first.id)]);
  expect(uri).toBe(`${LIVE_URL}/meta/${first.id}.json`);
  const meta = await (await page.request.get(uri)).json();
  expect(meta.name).toContain(cardById.get(first.id).name);
  expect(new URL(meta.image).pathname).toBe(first.src);
  expect((await page.request.get(await read('contractURI'))).ok()).toBe(true);

  // c. crank again
  const second = await pullThroughSite(page, { connected: true, again: true });
  expect(second.id).not.toBe(first.id);
  expect((await cardsOwnedBy(who.buyer)).sort()).toEqual([first.id, second.id].sort());
  await expectCardEverywhere(page, second, who.buyer, 2);
  await expect(ball(page, first.id)).toHaveClass(/pulled/);

  // Exactly two prices went into the machine and the buyer paid them plus fees.
  expect(await client.getBalance({ address: machineAddress() })).toBe(PRICE * 2n);
  const spent = before - await client.getBalance({ address: who.buyer });
  expect(spent).toBeGreaterThan(PRICE * 2n);
  expect(spent).toBeLessThan(PRICE * 2n + parseEther('0.001'));
  expect((await wallet(page)).sent).toHaveLength(2);

  await button(page, 'Close').click();
  await expect(modal(page)).toBeHidden();
  expect(problems).toEqual([]);
});

test.describe('on a phone, 375 by 812', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
  test('k. the happy path works and nothing spills off the side', async ({ page, problems, who }) => {
    await addWallet(page, who.buyer);
    await openMachine(page);
    const peel = await pullThroughSite(page);
    await expectCardEverywhere(page, peel, who.buyer, 1);
    await expect(button(page, 'CRANK AGAIN')).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await button(page, 'Close').click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(problems).toEqual([]);
  });
});

test('d. user rejects in the wallet: clear message, retry works, nothing minted', async ({ page, who }) => {
  await addWallet(page, who.buyer, { rejectTx: true });
  await openMachine(page);
  await toApprove(page);
  await button(page, 'DROP THE COIN').click();
  await expect(title(page)).toHaveText('NO COIN DROPPED');
  await expect(modal(page)).toContainText('Nothing was sent and nothing was charged.');
  expect(await read('remaining')).toBe(100n);
  expect(await read('balanceOf', [who.buyer])).toBe(0n);
  await expectPulled(page, 0);

  // The user changes their mind.
  await setWallet(page, { rejectTx: false });
  await button(page, 'TRY AGAIN').click();
  await expect(title(page)).toHaveText('APPROVE IN WALLET');
  await button(page, 'DROP THE COIN').click();
  const peel = await readPeel(page);
  await expectCardEverywhere(page, peel, who.buyer, 1);
});

test('d. user rejects the connection: clear message and a way back', async ({ page, who }) => {
  await addWallet(page, who.buyer, { rejectConnect: true });
  await openMachine(page);
  await page.locator('#coin').click();
  await button(page, 'CONNECT WALLET').click();
  await modal(page).getByRole('button', { name: 'Mock Wallet' }).click();
  await expect(title(page)).toHaveText('NOT CONNECTED');
  await setWallet(page, { rejectConnect: false });
  await button(page, 'TRY AGAIN').click();
  await modal(page).getByRole('button', { name: 'Mock Wallet' }).click();
  await expect(title(page)).toHaveText('APPROVE IN WALLET');
});

test('e. price changed after the page loaded: the page shows the new price before any money moves', async ({ page, who }) => {
  const newPrice = parseEther('0.0005');
  await addWallet(page, who.buyer);
  await openMachine(page);
  await toApprove(page);
  await expect(modal(page)).toContainText('0.0003 ETH');
  await send(who.owner, 'setPrice', [newPrice]);

  await button(page, 'DROP THE COIN').click();
  await expect(title(page)).toHaveText('THE PRICE JUST CHANGED');
  await expect(modal(page)).toContainText('A pull is now 0.0005 ETH. Nothing was charged.');
  expect((await wallet(page)).sent, 'nothing was sent at the old or the new price without asking').toHaveLength(0);

  await button(page, 'CONTINUE').click();
  await expect(title(page)).toHaveText('APPROVE IN WALLET');
  await expect(modal(page)).toContainText('0.0005 ETH');
  await button(page, 'DROP THE COIN').click();
  const peel = await readPeel(page);
  await expectCardEverywhere(page, peel, who.buyer, 1);
  expect(await client.getBalance({ address: machineAddress() })).toBe(newPrice);
});

test('e. price changed while the wallet request was open: the page says why it failed, then a retry works', async ({ page, who }) => {
  const newPrice = parseEther('0.0004');
  await addWallet(page, who.buyer, { holdTx: true });
  await openMachine(page);
  await toApprove(page);
  await button(page, 'DROP THE COIN').click();
  await expect.poll(async () => (await wallet(page)).requests).toContain('eth_sendTransaction');
  await send(who.owner, 'setPrice', [newPrice]);
  await setWallet(page, { holdTx: false });

  // The old price was already on its way, so the contract turned it down. No card, no payment.
  await expect(title(page)).toHaveText('THE PULL DID NOT GO THROUGH');
  await expect(modal(page)).toContainText('no card was pulled');
  await expect(modal(page)).toContainText(`The price changed while your wallet was open. A pull is now ${formatEther(newPrice)} ETH.`);
  expect((await wallet(page)).sent).toHaveLength(1);
  expect(await read('remaining')).toBe(100n);
  expect(await client.getBalance({ address: machineAddress() })).toBe(0n);

  await button(page, 'TRY AGAIN').click();
  await expect(title(page)).toHaveText('APPROVE IN WALLET');
  await expect(modal(page)).toContainText('0.0004 ETH');
  await button(page, 'DROP THE COIN').click();
  const peel = await readPeel(page);
  await expectCardEverywhere(page, peel, who.buyer, 1);
  expect(await client.getBalance({ address: machineAddress() })).toBe(newPrice);
});

test('f. sale closed: the page says so and never asks the wallet for anything', async ({ page, who }) => {
  await send(who.owner, 'setSaleOpen', [false]);
  await addWallet(page, who.buyer);
  await openMachine(page);
  await expect(page.locator('#ctaLabel')).toHaveText('The Machine is closed for now.');
  await expect(page.locator('#coin')).toHaveClass(/dim/);
  await expectPulled(page, 0);
  await page.locator('#coin').click();
  await expect(title(page)).toHaveText('CLOSED FOR NOW');
  await expect(button(page, 'CONNECT WALLET')).toHaveCount(0);
  expect((await wallet(page)).requests).toEqual([]);
  expect(await revertName(who.buyer, 'pull', [], PRICE)).toBe('SaleClosed');
});

test('f. sale closed while the visitor was at the machine: nothing is sent', async ({ page, who }) => {
  await addWallet(page, who.buyer);
  await openMachine(page);
  await toApprove(page);
  await send(who.owner, 'setSaleOpen', [false]);
  await button(page, 'DROP THE COIN').click();
  await expect(title(page)).toHaveText('CLOSED FOR NOW');
  expect((await wallet(page)).sent).toHaveLength(0);
  await button(page, 'Close').click();
  await expect(page.locator('#ctaLabel')).toHaveText('The Machine is closed for now.');
});

test('g. no wallet: the page offers the wallet app links', async ({ page }) => {
  await openMachine(page);
  await page.locator('#coin').click();
  await button(page, 'CONNECT WALLET').click();
  await expect(title(page)).toHaveText('OPEN IN YOUR WALLET APP');
  const links = await modal(page).locator('a.mbtn').evaluateAll((as) => as.map((a) => [a.innerText, a.href]));
  const here = new URL(LIVE_URL);
  expect(links).toEqual([
    ['Open in Coinbase Wallet', `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(`${LIVE_URL}/`)}`],
    ['Open in MetaMask', `https://metamask.app.link/dapp/${here.host}/`],
  ]);
});

test('wrong chain at connect: the page asks the wallet to switch, then the pull works', async ({ page, who }) => {
  await addWallet(page, who.buyer, { wrongChain: true });
  await openMachine(page);
  const peel = await pullThroughSite(page);
  expect((await wallet(page)).requests).toContain('wallet_switchEthereumChain');
  await expectCardEverywhere(page, peel, who.buyer, 1);
});

test('wrong chain the wallet has never heard of: the page offers to add it, then the pull works', async ({ page, who }) => {
  await addWallet(page, who.buyer, { wrongChain: true, onSwitch: 'unknown' });
  await openMachine(page);
  const peel = await pullThroughSite(page);
  expect((await wallet(page)).requests).toContain('wallet_addEthereumChain');
  await expectCardEverywhere(page, peel, who.buyer, 1);
});

test('wrong chain and the user refuses to switch: clear message, nothing sent', async ({ page, who }) => {
  await addWallet(page, who.buyer, { wrongChain: true, onSwitch: 'reject' });
  await openMachine(page);
  await page.locator('#coin').click();
  await button(page, 'CONNECT WALLET').click();
  await modal(page).getByRole('button', { name: 'Mock Wallet' }).click();
  await expect(title(page)).toHaveText('NOT CONNECTED');
  await expect(button(page, 'TRY AGAIN')).toBeVisible();
  expect((await wallet(page)).sent).toHaveLength(0);
  expect(await read('remaining')).toBe(100n);
});

test('an old style wallet with only window.ethereum still works', async ({ page, who }) => {
  await addWallet(page, who.buyer, { legacy: true });
  await openMachine(page);
  const peel = await pullThroughSite(page, { walletName: 'Browser wallet' });
  await expectCardEverywhere(page, peel, who.buyer, 1);
});

test('h. preview build with no contract address renders and prompts nothing', async ({ page, problems, who }) => {
  const outside = [];
  page.on('request', (r) => { if (!r.url().startsWith(PREVIEW_URL) && !r.url().startsWith('https://fonts.')) outside.push(r.url()); });
  await addWallet(page, who.buyer);
  await openMachine(page, PREVIEW_URL);
  await expectPulled(page, 0);
  await expect(page.locator('#galleryGrid .gball.locked')).toHaveCount(100);
  await expect(page.locator('#ctaSub')).toHaveText('The Machine opens soon.');
  await expect(page.locator('#navPrice')).toHaveText('Soon');
  await expect(oddsRow(page, 'Street Legend')).toHaveText('4 of 4');
  await page.locator('#coin').click();
  await expect(title(page)).toHaveText('THE MACHINE OPENS SOON');
  await expect(button(page, 'CONNECT WALLET')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(modal(page)).toBeHidden();
  expect((await wallet(page)).requests, 'the wallet was never asked for anything').toEqual([]);
  expect(outside.filter((u) => u.startsWith(RPC_URL)), 'the chain was never asked for anything').toEqual([]);
  expect(outside).toEqual([]);
  expect(problems).toEqual([]);
});

test('i. sold out: SOLD OUT stamp, OpenSea link in place of the coin, no way to pull card 101', async ({ page, problems, who, chain }) => {
  test.setTimeout(120_000);
  // Leave one card, load the page, then let the site sell the very last one.
  for (let i = 0; i < 99; i++) await pullDirect(who.crowd);
  await addWallet(page, who.buyer);
  await openMachine(page);
  await expectPulled(page, 99);
  await expect(page.locator('#galleryGrid .gball.locked')).toHaveCount(1);
  const last = await pullThroughSite(page);
  expect(await cardsOwnedBy(who.buyer)).toEqual([last.id]);
  await expect(button(page, 'CRANK AGAIN')).toHaveCount(0);
  await button(page, 'Close').click();

  const expectSoldOut = async () => {
    await expectPulled(page, 100);
    await expect(page.locator('#soldStamp')).toBeVisible();
    await expect(page.locator('#soldStamp')).toHaveText('SOLD OUT');
    await expect(page.locator('#coin')).toBeHidden();
    await expect(page.locator('#soldLink')).toBeVisible();
    await expect(page.locator('#soldLink')).toHaveText('View on OpenSea');
    await expect(page.locator('#soldLink')).toHaveAttribute('href', `https://opensea.io/assets/base/${chain.address}`);
    await expect(page.locator('#ctaLabel')).toHaveText('Sold out. All 100 pulled.');
    await expect(page.locator('#galleryGrid .gball.pulled')).toHaveCount(100);
    await expect(page.locator('#galleryGrid .gball.locked')).toHaveCount(0);
    for (const tier of Object.keys(cardsJson.tiers)) await expect(oddsRow(page, tier)).toHaveText(`0 of ${cardsJson.tiers[tier]}`);
    await expect(page.locator('#oddsBody')).toContainText('None left');
  };
  await expectSoldOut();
  await page.reload();
  await expectSoldOut();

  // Nothing on the page can start a pull, and the contract refuses one anyway.
  await expect(page.getByRole('button', { name: /coin|pull|crank/i })).toHaveCount(0);
  const requestsBefore = (await wallet(page)).requests.length;
  await page.locator('#coin').dispatchEvent('click');
  await page.waitForTimeout(1000);
  await expect(modal(page)).toBeHidden();
  expect((await wallet(page)).requests.length).toBe(requestsBefore);
  expect(await revertName(who.buyer, 'pull', [], PRICE)).toBe('SoldOut');
  expect(await read('remaining')).toBe(0n);

  // All 100 cards are out, each exactly once.
  const [, , , bitmap] = await read('machineState');
  expect(bitmap).toBe(((1n << 100n) - 1n) << 1n);
  expect((await read('balanceOf', [who.crowd])) + (await read('balanceOf', [who.buyer]))).toBe(100n);
  expect(problems).toEqual([]);
});

test('i. the last card goes to someone else while the visitor is at the machine: nothing is sent', async ({ page, who }) => {
  test.setTimeout(120_000);
  for (let i = 0; i < 99; i++) await pullDirect(who.crowd);
  await addWallet(page, who.buyer);
  await openMachine(page);
  await toApprove(page);
  await pullDirect(who.stranger);
  await button(page, 'DROP THE COIN').click();
  await expect(title(page)).toHaveText('SOLD OUT');
  await expect(modal(page)).toContainText('Nothing was charged.');
  expect((await wallet(page)).sent).toHaveLength(0);
  await button(page, 'Close').click();
  await expect(page.locator('#soldStamp')).toBeVisible();
  await expect(page.locator('#coin')).toBeHidden();
});
