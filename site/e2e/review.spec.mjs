// Tests for problems found in review. Each group failed before its fix, except "not enough ETH":
// that finding did not reproduce, and its tests are here to keep it that way.
import { parseEther } from 'viem';
import { client, machineAddress, pullDirect, read, rpc, send } from './chain.mjs';
import {
  addWallet, button, cardsJson, expect, expectPulled, modal, openMachine, pullThroughSite, readPeel, setWallet, short,
  test, title, toApprove, wallet,
} from './fixtures.mjs';
import { RPC_URL } from './ports.mjs';

const TOTAL = cardsJson.cards.length;
const PRICE = parseEther('0.0003');
// All lower case on purpose. A mixed case address must carry a valid checksum or viem refuses it outright.
const EMPTY_WALLET = '0x00000000000000000000000000000000000000aa';

const emitAccounts = (page, accounts) => page.evaluate((list) => {
  if (list[0]) window.__mockWallet.account = list[0];
  window.__mockWallet.emit('accountsChanged', list);
}, accounts);

// The page already told an empty wallet NOT ENOUGH ETH. These pin that down for an empty wallet, a wallet
// just short of the price, one with nothing for the fee, and the wording the public Base RPC uses.
test.describe('not enough ETH', () => {
  test('an empty wallet gets the NOT ENOUGH ETH message and the wallet is never asked to pay', async ({ page, problems }) => {
    await addWallet(page, EMPTY_WALLET);
    await openMachine(page);
    await toApprove(page);
    await expect(modal(page).locator('.warn')).toContainText('almost no ETH');
    await button(page, 'DROP THE COIN').click();
    await expect(title(page)).toHaveText('NOT ENOUGH ETH');
    await expect(modal(page)).toContainText('does not have enough ETH');
    await expect(modal(page)).not.toContainText('JAMMED');
    await expect(button(page, 'TRY AGAIN')).toBeVisible();
    const w = await wallet(page);
    expect(w.requests).not.toContain('eth_sendTransaction');
    expect(w.sent).toHaveLength(0);
    expect(await read('remaining')).toBe(BigInt(TOTAL));
    expect(problems).toEqual([]);
  });

  test('an empty wallet when the balance cannot be read first: the failed dry run is still understood', async ({ page }) => {
    const cors = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    await page.route(`${RPC_URL}/**`, async (route) => {
      const req = route.request();
      const body = req.method() === 'POST' ? req.postDataJSON() : null;
      if (body?.method !== 'eth_getBalance') return route.continue();
      return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ jsonrpc: '2.0', id: body.id, error: { code: -32000, message: 'balance lookup is down' } }) });
    });
    await addWallet(page, EMPTY_WALLET);
    await openMachine(page);
    await toApprove(page);
    await button(page, 'DROP THE COIN').click();
    await expect(title(page)).toHaveText('NOT ENOUGH ETH');
    expect((await wallet(page)).requests).not.toContain('eth_sendTransaction');
  });

  test('a wallet that holds less than the price gets the same message', async ({ page, who }) => {
    await rpc('anvil_setBalance', [who.buyer, '0x' + (PRICE - 1n).toString(16)]);
    await addWallet(page, who.buyer);
    await openMachine(page);
    await toApprove(page);
    await button(page, 'DROP THE COIN').click();
    await expect(title(page)).toHaveText('NOT ENOUGH ETH');
    expect((await wallet(page)).sent).toHaveLength(0);
  });

  test('the price but nothing for the network fee: the node refuses and the page still says NOT ENOUGH ETH', async ({ page, who }) => {
    await rpc('anvil_setBalance', [who.buyer, '0x' + PRICE.toString(16)]);
    await addWallet(page, who.buyer);
    await openMachine(page);
    await toApprove(page);
    await button(page, 'DROP THE COIN').click();
    await expect(title(page)).toHaveText('NOT ENOUGH ETH');
    expect(await read('remaining')).toBe(BigInt(TOTAL));
  });

  test('the way the public Base RPC words it (EVM error: OutOfFunds) is understood too', async ({ page, who }) => {
    // The balance read fails and the dry run comes back the way https://mainnet.base.org answers for an empty wallet.
    const cors = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    await page.route(`${RPC_URL}/**`, async (route) => {
      const req = route.request();
      if (req.method() !== 'POST') return route.continue();
      const body = req.postDataJSON();
      const reply = (error) => route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ jsonrpc: '2.0', id: body.id, error }) });
      if (body.method === 'eth_getBalance') return reply({ code: -32000, message: 'balance lookup is down' });
      if (body.method === 'eth_call' && body.params?.[0]?.value && BigInt(body.params[0].value) > 0n) {
        return reply({ code: -32003, message: 'EVM error: OutOfFunds' });
      }
      return route.continue();
    });
    await addWallet(page, who.buyer);
    await openMachine(page);
    await toApprove(page);
    await button(page, 'DROP THE COIN').click();
    await expect(title(page)).toHaveText('NOT ENOUGH ETH');
    expect((await wallet(page)).sent).toHaveLength(0);
  });
});

test.describe('the Cranking view while the wallet request is open', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

  const toHeldWalletRequest = async (page, who) => {
    await addWallet(page, who.buyer, { holdTx: true });
    await openMachine(page);
    await toApprove(page);
    await button(page, 'DROP THE COIN').click();
    await expect(title(page)).toHaveText('THE MACHINE IS CRANKING');
    await expect.poll(async () => (await wallet(page)).requests).toContain('eth_sendTransaction');
  };

  test('closing it puts the coin back, a tap on the coin reopens it, and the pull still lands', async ({ page, who, problems }) => {
    await toHeldWalletRequest(page, who);
    await expect(modal(page)).toContainText('Open your wallet to approve the pull.');
    await page.keyboard.press('Escape');
    await expect(modal(page)).toBeHidden();
    await expect(page.locator('#coin')).not.toHaveClass(/inserted/);

    await page.locator('#coin').click({ timeout: 5_000 });
    await expect(title(page)).toHaveText('THE MACHINE IS CRANKING');
    // It is the same pull. The wallet was not asked a second time.
    expect((await wallet(page)).requests.filter((m) => m === 'eth_sendTransaction')).toHaveLength(1);

    await page.keyboard.press('Escape');
    await setWallet(page, { holdTx: false });
    const peel = await readPeel(page);
    expect((await read('ownerOf', [BigInt(peel.id)])).toLowerCase()).toBe(who.buyer.toLowerCase());
    expect((await wallet(page)).sent).toHaveLength(1);
    expect(problems).toEqual([]);
  });

  test('a wallet that never answers: STOP WAITING frees the page with no reload, and a new pull works', async ({ page, who, problems }) => {
    await toHeldWalletRequest(page, who);
    await button(page, 'STOP WAITING').click();
    await expect(title(page)).toHaveText('STOPPED WAITING');
    await expect(modal(page)).toContainText('Nothing was sent from this page.');

    // The buyer rejects the old request in the wallet, as the message asks. The page does not jump.
    await setWallet(page, { rejectTx: true });
    await setWallet(page, { holdTx: false });
    await page.waitForTimeout(500);
    await expect(title(page)).toHaveText('STOPPED WAITING');
    await setWallet(page, { rejectTx: false });

    await button(page, 'TRY AGAIN').click();
    await expect(title(page)).toHaveText('APPROVE IN WALLET');
    await button(page, 'DROP THE COIN').click();
    const peel = await readPeel(page);
    expect((await read('ownerOf', [BigInt(peel.id)])).toLowerCase()).toBe(who.buyer.toLowerCase());
    expect(await read('remaining')).toBe(BigInt(TOTAL - 1));
    expect((await wallet(page)).sent).toHaveLength(1);
    expect(problems).toEqual([]);
  });

  test('stopped waiting, then approved in the wallet after all: the page picks the pull back up', async ({ page, who }) => {
    await toHeldWalletRequest(page, who);
    await button(page, 'STOP WAITING').click();
    await expect(title(page)).toHaveText('STOPPED WAITING');
    await button(page, 'Close').click();
    await expect(modal(page)).toBeHidden();

    await setWallet(page, { holdTx: false });
    const peel = await readPeel(page);
    expect((await read('ownerOf', [BigInt(peel.id)])).toLowerCase()).toBe(who.buyer.toLowerCase());
    await expectPulled(page, 1);
    expect(await client.getBalance({ address: machineAddress() })).toBe(PRICE);
  });
});

// The whole card and every button must be on screen when The Peel opens, with nothing scrolled away.
for (const [name, viewport] of [['a short phone, 360 by 640', { width: 360, height: 640 }], ['a small phone, 320 by 568', { width: 320, height: 568 }], ['a phone with the browser bars showing, 375 by 667', { width: 375, height: 667 }]]) {
  test.describe(`The Peel on ${name}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });
    test('opens at the top with the whole card and every button in view', async ({ page, who, problems }) => {
      await addWallet(page, who.buyer);
      await openMachine(page);
      const peel = await pullThroughSite(page);
      expect(await page.locator('#modal .modal').evaluate((el) => el.scrollTop)).toBe(0);
      await expect(peel.img).toBeInViewport({ ratio: 1 });
      await expect(modal(page).locator('.rname')).toBeInViewport({ ratio: 1 });
      await expect(button(page, 'CRANK AGAIN')).toBeInViewport({ ratio: 1 });
      await expect(button(page, 'Close')).toBeInViewport({ ratio: 1 });
      // Nothing to scroll to.
      expect(await page.locator('#modal .modal').evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
      expect(problems).toEqual([]);
    });
  });
}

test.describe('The Peel on a phone held sideways, 812 by 375', () => {
  test.use({ viewport: { width: 812, height: 375 }, hasTouch: true, isMobile: true });
  test('opens at the top with the whole card in view', async ({ page, who }) => {
    await addWallet(page, who.buyer);
    await openMachine(page);
    const peel = await pullThroughSite(page);
    expect(await page.locator('#modal .modal').evaluate((el) => el.scrollTop)).toBe(0);
    await expect(peel.img).toBeInViewport({ ratio: 1 });
    await expect(button(page, 'CRANK AGAIN')).toBeInViewport({ ratio: 1 });
  });
});

// Laptops and tablets: every button is on screen with nothing to scroll, and the card is bigger than the
// old 230 wide wherever there is room. Under 950 tall the stat bars give way (the stats are printed on the
// card), on taller screens they stay.
for (const [name, viewport, minWidth, stats] of [['a laptop, 1280 by 800', { width: 1280, height: 800 }, 250, false], ['a laptop, 1280 by 900', { width: 1280, height: 900 }, 280, false], ['a tablet, 768 by 1024', { width: 768, height: 1024 }, 250, true], ['a desktop, 1920 by 1080', { width: 1920, height: 1080 }, 280, true]]) {
  test.describe(`The Peel on ${name}`, () => {
    test.use({ viewport });
    test('shows a big card and every button with nothing to scroll', async ({ page, who, problems }) => {
      await addWallet(page, who.buyer);
      await openMachine(page);
      const peel = await pullThroughSite(page);
      await expect(peel.img).toBeInViewport({ ratio: 1 });
      if (stats) await expect(modal(page).locator('.rstats')).toBeInViewport({ ratio: 1 });
      else await expect(modal(page).locator('.rstats')).toBeHidden();
      await expect(button(page, 'CRANK AGAIN')).toBeInViewport({ ratio: 1 });
      await expect(button(page, 'Close')).toBeInViewport({ ratio: 1 });
      expect(await page.locator('#modal .modal').evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
      expect(await modal(page).locator('.rcard').evaluate((el) => el.offsetWidth)).toBeGreaterThanOrEqual(minWidth);
      expect(problems).toEqual([]);
    });
  });
}

test.describe('The Peel on a tall phone, 375 by 812', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
  test('shows the card, the stats and every button with nothing below the fold', async ({ page, who }) => {
    await addWallet(page, who.buyer);
    await openMachine(page);
    const peel = await pullThroughSite(page);
    await expect(peel.img).toBeInViewport({ ratio: 1 });
    await expect(modal(page).locator('.rstats')).toBeInViewport({ ratio: 1 });
    await expect(button(page, 'Close')).toBeInViewport({ ratio: 1 });
  });
});

test.describe('the dollar note follows the price', () => {
  test('at any other price the page shows the ETH price alone, with no dollar figure anywhere', async ({ page, who }) => {
    await send(who.owner, 'setPrice', [parseEther('0.002')]);
    await addWallet(page, who.buyer);
    await openMachine(page);
    await expectPulled(page, 0);
    await expect(page.locator('#ctaSub')).toContainText('0.002 ETH a pull.');
    await expect(page.locator('#ex1')).toContainText('Put in 0.002 ETH on Anvil.');
    await expect(page.locator('main')).not.toContainText(/cents/i);
    await page.locator('#coin').click();
    await expect(title(page)).toHaveText('PULL A SPLATZ');
    await expect(modal(page)).toContainText('0.002 ETH');
    await expect(modal(page)).not.toContainText(/cents/i);
  });

  test('at the launch price the note is there, and the explainer names the network the build is on', async ({ page, who }) => {
    await addWallet(page, who.buyer);
    await openMachine(page);
    await expectPulled(page, 0);
    await expect(page.locator('#ctaSub')).toContainText('0.0003 ETH a pull, about 50 cents.');
    await expect(page.locator('#ex1')).toContainText('about 50 cents worth of ETH on Anvil.');
    await expect(page.locator('#ex3')).toContainText('yours on Anvil.');
    await expect(page.locator('.ex-sect')).not.toContainText('on Base');
    await page.locator('#coin').click();
    await expect(modal(page)).toContainText('about 50 cents');
  });
});

test.describe('the wallet account changes while the Approve view is open', () => {
  test('the view follows the new account and the pull goes to it', async ({ page, who, problems }) => {
    await addWallet(page, who.buyer);
    await openMachine(page);
    await toApprove(page);
    await expect(modal(page).locator('.waddr')).toContainText(short(who.buyer));

    await emitAccounts(page, [who.stranger]);
    await expect(title(page)).toHaveText('APPROVE IN WALLET');
    await expect(modal(page).locator('.waddr')).toContainText(short(who.stranger));
    await expect(page.locator('#walletNavAddr')).toHaveText(short(who.stranger));

    await button(page, 'DROP THE COIN').click();
    const peel = await readPeel(page);
    expect((await read('ownerOf', [BigInt(peel.id)])).toLowerCase()).toBe(who.stranger.toLowerCase());
    expect(await read('balanceOf', [who.buyer])).toBe(0n);
    expect(problems).toEqual([]);
  });

  test('the wallet disconnects: the page asks to connect again and nothing breaks', async ({ page, who, problems }) => {
    await addWallet(page, who.buyer);
    await openMachine(page);
    await toApprove(page);
    await emitAccounts(page, []);
    await expect(title(page)).toHaveText('PULL A SPLATZ');
    await expect(button(page, 'CONNECT WALLET')).toBeVisible();
    await expect(page.locator('#walletNav')).toBeHidden();

    await button(page, 'CONNECT WALLET').click();
    await modal(page).getByRole('button', { name: 'Mock Wallet' }).click();
    await expect(title(page)).toHaveText('APPROVE IN WALLET');
    await button(page, 'DROP THE COIN').click();
    await readPeel(page);
    expect(problems).toEqual([]);
  });

  test('the account changes on an error message: TRY AGAIN still works', async ({ page, who, problems }) => {
    await addWallet(page, who.buyer, { rejectTx: true });
    await openMachine(page);
    await toApprove(page);
    await button(page, 'DROP THE COIN').click();
    await expect(title(page)).toHaveText('NO COIN DROPPED');
    await emitAccounts(page, []);
    await setWallet(page, { rejectTx: false });
    await button(page, 'TRY AGAIN').click();
    await expect(title(page)).toHaveText('CONNECT WALLET');
    await modal(page).getByRole('button', { name: 'Mock Wallet' }).click();
    await expect(title(page)).toHaveText('APPROVE IN WALLET');
    expect(problems).toEqual([]);
  });
});

test.describe('an open view after the 30 second refresh', () => {
  // The page clock is ours, so the test can jump to the next refresh instead of waiting for it.
  test.beforeEach(async ({ page }) => { await page.clock.install(); });

  test('PULL A SPLATZ shows the new price and the new count, the same as the page behind it', async ({ page, who }) => {
    await addWallet(page, who.buyer);
    await openMachine(page);
    await expectPulled(page, 0);
    await page.locator('#coin').click();
    await expect(title(page)).toHaveText('PULL A SPLATZ');
    await expect(modal(page)).toContainText(`${TOTAL} of ${TOTAL}`);

    for (let i = 0; i < 3; i++) await pullDirect(who.crowd);
    await send(who.owner, 'setPrice', [parseEther('0.0009')]);
    await page.clock.fastForward(31_000);

    await expectPulled(page, 3);
    await expect(page.locator('#navPrice')).toHaveText('0.0009 ETH');
    await expect(title(page)).toHaveText('PULL A SPLATZ');
    await expect(modal(page)).toContainText('0.0009 ETH');
    await expect(modal(page)).not.toContainText('0.0003 ETH');
    await expect(modal(page)).not.toContainText(/cents/i);
    await expect(modal(page)).toContainText(`${TOTAL - 3} of ${TOTAL}`);
  });

  test('APPROVE IN WALLET shows the new price and says it changed, and the pull pays the new price', async ({ page, who }) => {
    const newPrice = parseEther('0.0009');
    await addWallet(page, who.buyer);
    await openMachine(page);
    await toApprove(page);
    await expect(modal(page)).toContainText('0.0003 ETH');

    await send(who.owner, 'setPrice', [newPrice]);
    await page.clock.fastForward(31_000);

    await expect(page.locator('#navPrice')).toHaveText('0.0009 ETH');
    await expect(title(page)).toHaveText('APPROVE IN WALLET');
    await expect(modal(page).locator('.warn')).toContainText('The price changed. A pull is now 0.0009 ETH.');
    await expect(modal(page).locator('.pv.go')).toHaveText('0.0009 ETH');
    await button(page, 'DROP THE COIN').click();
    await readPeel(page);
    expect(await client.getBalance({ address: machineAddress() })).toBe(newPrice);
  });

  test('the sale closes while PULL A SPLATZ is open: the view says so', async ({ page, who }) => {
    await addWallet(page, who.buyer);
    await openMachine(page);
    await page.locator('#coin').click();
    await expect(title(page)).toHaveText('PULL A SPLATZ');
    await send(who.owner, 'setSaleOpen', [false]);
    await page.clock.fastForward(31_000);
    await expect(title(page)).toHaveText('CLOSED FOR NOW');
    await expect(button(page, 'CONNECT WALLET')).toHaveCount(0);
  });
});

for (const viewport of [{ width: 375, height: 667 }, { width: 320, height: 568 }, { width: 360, height: 640 }]) {
  test.describe(`first screen on a ${viewport.width} by ${viewport.height} phone`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });
    test('the coin and the Drop a Coin headline are above the fold', async ({ page, problems }) => {
      await openMachine(page);
      await expectPulled(page, 0);
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
      await expect(page.locator('#coin')).toBeInViewport({ ratio: 1 });
      await expect(page.locator('#ctaLabel')).toBeInViewport({ ratio: 1 });
      // The machine is still whole and still on screen above the coin.
      await expect(page.locator('#machine')).toBeInViewport({ ratio: 1 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      expect(problems).toEqual([]);
    });
  });
}
