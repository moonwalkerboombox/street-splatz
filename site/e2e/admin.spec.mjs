// The owner page against the real contract on anvil.
import { parseEther } from 'viem';
import { client, machineAddress, pullDirect, read } from './chain.mjs';
import { addWallet, expect, test, wallet } from './fixtures.mjs';
import { LIVE_URL } from './ports.mjs';

const CONTROLS = ['#adOpen', '#adClose', '#adPriceInput', '#adSetPrice', '#adWithdraw'];

async function openAdmin(page, account) {
  page.on('dialog', (d) => d.accept());
  await addWallet(page, account);
  await page.goto(`${LIVE_URL}/admin`);
  await expect(page.locator('#adSale')).toHaveText('Open');
  await page.locator('#adConnect').click();
  await expect(page.locator('#adAccount')).toContainText(account, { ignoreCase: true });
}

test('j. the owner can close and open the sale, set the price and withdraw', async ({ page, problems, who, chain }) => {
  await pullDirect(who.crowd);
  await pullDirect(who.crowd);
  await openAdmin(page, who.owner);
  await expect(page.locator('#adAccount')).toContainText('is the owner.');
  await expect(page.locator('#adOwner')).toHaveText(who.owner, { ignoreCase: true });
  await expect(page.locator('#adContract')).toHaveText(chain.address);
  await expect(page.locator('#adBalance')).toHaveText('0.0006 ETH');
  await expect(page.locator('#adLeft')).toHaveText('98');

  await page.locator('#adClose').click();
  await expect(page.locator('#adSale')).toHaveText('Closed');
  expect(await read('saleOpen')).toBe(false);
  await expect(page.locator('#adClose')).toBeDisabled();

  await page.locator('#adOpen').click();
  await expect(page.locator('#adSale')).toHaveText('Open');
  expect(await read('saleOpen')).toBe(true);

  await page.locator('#adPriceInput').fill('0.0005');
  await page.locator('#adSetPrice').click();
  await expect(page.locator('#adPrice')).toHaveText('0.0005 ETH');
  expect(await read('price')).toBe(parseEther('0.0005'));

  const before = await client.getBalance({ address: who.owner });
  await page.locator('#adWithdraw').click();
  await expect(page.locator('#adBalance')).toHaveText('0 ETH');
  expect(await client.getBalance({ address: machineAddress() })).toBe(0n);
  const gained = await client.getBalance({ address: who.owner }) - before;
  expect(gained).toBeGreaterThan(parseEther('0.0005'));
  expect(gained).toBeLessThanOrEqual(parseEther('0.0006'));
  await expect(page.locator('#adWithdraw')).toBeDisabled();

  await expect(page.locator('#adLog')).toContainText('Withdrawn to the owner wallet.');
  expect((await wallet(page)).sent).toHaveLength(4);
  expect(problems).toEqual([]);
});

test('j. a wallet that is not the owner sees locked controls', async ({ page, who }) => {
  await pullDirect(who.crowd);
  await openAdmin(page, who.stranger);
  await expect(page.locator('#adAccount')).toContainText('is not the owner. The controls stay locked.');
  for (const sel of CONTROLS) await expect(page.locator(sel)).toBeDisabled();
  // Even a forced click does nothing.
  await page.locator('#adWithdraw').dispatchEvent('click');
  await page.locator('#adClose').dispatchEvent('click');
  await page.waitForTimeout(500);
  expect((await wallet(page)).sent).toHaveLength(0);
  expect(await read('saleOpen')).toBe(true);
  expect(await client.getBalance({ address: machineAddress() })).toBe(parseEther('0.0003'));
});

test('j. with no wallet connected every control is locked', async ({ page }) => {
  await page.goto(`${LIVE_URL}/admin`);
  await expect(page.locator('#adSale')).toHaveText('Open');
  for (const sel of CONTROLS) await expect(page.locator(sel)).toBeDisabled();
});
