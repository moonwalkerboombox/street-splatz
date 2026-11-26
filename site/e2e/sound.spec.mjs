// Sound effects. A test cannot hear, so it reads two things instead:
//   window.__sfxLog  every sound the page asked for (src/sfx.js writes it when window.__SFX_TEST__ is set)
//   window.__audio   what really reached Web Audio: contexts made and sound sources created
import { readFileSync } from 'node:fs';
import { pullDirect, read } from './chain.mjs';
import {
  addWallet, ball, button, cardById, cardsJson, expect, expectPulled, modal, openMachine, pullThroughSite,
  readPeel, setWallet, test, title, toApprove, wallet,
} from './fixtures.mjs';
import { LIVE_URL, PREVIEW_URL } from './ports.mjs';

const TIERS = ['Pavement Card', 'Fresh Drop', 'Block Hitter', 'Street Legend'];
const PULL_SOUNDS = ['coinDrop', 'crankLoop', 'crankLoop:stop', 'chute', 'peel', 'jam', 'soldOut'];

function listen(page) {
  return page.addInitScript(() => {
    window.__SFX_TEST__ = true;
    const seen = window.__audio = { contexts: 0, sources: 0, closed: 0 };
    for (const key of ['AudioContext', 'webkitAudioContext']) {
      const Real = window[key];
      if (!Real) continue;
      window[key] = class extends Real {
        constructor(...args) { super(...args); seen.contexts += 1; }
        close() { seen.closed += 1; return super.close(); }
        createOscillator() { seen.sources += 1; return super.createOscillator(); }
        createBufferSource() { seen.sources += 1; return super.createBufferSource(); }
      };
    }
  });
}
const log = (page) => page.evaluate(() => window.__sfxLog);
const audio = (page) => page.evaluate(() => ({ contexts: window.__audio.contexts, sources: window.__audio.sources }));
const closed = (page) => page.evaluate(() => window.__audio.closed);
// The page's real fonts, from e2e/fonts. Without this the suite runs on fallback fonts, which are narrower.
const FONTS = new URL('./fonts/', import.meta.url);
async function realFonts(page) {
  await page.route(/^https:\/\/fonts\.googleapis\.com\//, (route) => route.fulfill({ status: 200, contentType: 'text/css', body: readFileSync(new URL('fonts.css', FONTS)) }));
  await page.route(/^https:\/\/fonts\.gstatic\.com\//, (route) => route.fulfill({
    status: 200, contentType: 'font/woff2', headers: { 'access-control-allow-origin': '*' },
    body: readFileSync(new URL(route.request().url().split('/').pop(), FONTS)),
  }));
}
const names = async (page) => (await log(page)).map((e) => e.name);
// The sounds of the pull itself, in the order they were asked for. Button taps and rattles come and go between them.
const story = async (page) => (await names(page)).filter((n) => n !== 'tap' && n !== 'rattle');
const count = async (page, name) => (await names(page)).filter((n) => n === name).length;
const one = (entries, name) => {
  const found = entries.filter((e) => e.name === name);
  expect(found, `exactly one ${name}`).toHaveLength(1);
  return found[0];
};
const soundBtn = (page) => page.locator('#soundBtn');

// The browser's own autoplay warning cannot be seen here: headless Chromium does not enforce the rule. The guard
// is the count of contexts, which must stay at zero until a tap. Console warnings are collected all the same.
test('nothing is heard and no AudioContext exists before the first tap', async ({ page, problems }) => {
  const warnings = [];
  page.on('console', (m) => { if (m.type() === 'warning') warnings.push(m.text()); });
  await listen(page);
  await openMachine(page);
  await expectPulled(page, 0);
  await page.mouse.move(400, 400);
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(700);
  expect(await log(page)).toEqual([]);
  expect(await audio(page)).toEqual({ contexts: 0, sources: 0 });

  // The first tap wakes it up.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator('#glass').click();
  await expect.poll(() => names(page)).toEqual(['rattle', 'glass']);
  const after = await audio(page);
  expect(after.contexts).toBe(1);
  expect(after.sources).toBeGreaterThan(0);
  expect(warnings).toEqual([]);
  expect(problems).toEqual([]);
});

test('the happy path is heard in order, each sound timed to its animation, with the peel of the card pulled', async ({ page, problems, who }) => {
  await listen(page);
  await addWallet(page, who.buyer);
  await openMachine(page);
  await expectPulled(page, 0);

  // The coin: picked up on the press, and in the slot 80% of the way into its flight.
  await page.locator('#coin').click();
  const flight = await page.locator('#coin').evaluate((el) => parseFloat(getComputedStyle(el).animationDuration));
  expect(flight).toBeCloseTo(0.66, 2);
  await expect(title(page)).toHaveText('PULL A SPLATZ');
  let entries = await log(page);
  expect(entries.map((e) => e.name)).toEqual(['coinPick', 'coinDrop', 'rattle']);
  expect(entries[1].delay).toBeCloseTo(flight * 0.8, 1);
  expect(entries[1].t - entries[0].t).toBeLessThan(50);
  // The rattle is asked for when the machine shakes, 460ms in.
  expect(entries[2].t - entries[0].t).toBeGreaterThan(400);
  expect(entries[2].delay).toBe(0);

  await button(page, 'CONNECT WALLET').click();
  await modal(page).getByRole('button', { name: 'Mock Wallet' }).click();
  await expect(title(page)).toHaveText('APPROVE IN WALLET');
  await button(page, 'DROP THE COIN').click();
  const peel = await readPeel(page);
  const card = cardById.get(peel.id);

  expect(await story(page)).toEqual(['coinPick', 'coinDrop', 'crankLoop', 'crankLoop:stop', 'chute', 'peel']);
  entries = await log(page);
  expect(one(entries, 'peel').tier).toBe(TIERS.indexOf(card.rarity));
  expect(TIERS).toContain(card.rarity);

  // The gumball: it shows .35s in and lands 45% into its fall. The chute sound lands .44s after it starts.
  const fall = await page.locator('#dgb').evaluate((el) => {
    const cs = getComputedStyle(el);
    return parseFloat(cs.animationDelay) + 0.45 * parseFloat(cs.animationDuration);
  });
  const chute = one(entries, 'chute');
  expect(chute.delay + 0.44).toBeCloseTo(fall, 1);
  // The crank stops on the confirmation, the gumball drops after the Confirmed step, The Peel opens after the drop.
  const stop = one(entries, 'crankLoop:stop');
  const start = one(entries, 'crankLoop');
  expect(stop.t).toBeGreaterThan(start.t);
  expect(chute.t - stop.t).toBeGreaterThan(650);
  expect(one(entries, 'peel').t - chute.t).toBeGreaterThan(1300);
  // The machine shook as the gumball dropped.
  const rattles = entries.filter((e) => e.name === 'rattle');
  expect(rattles).toHaveLength(2);
  expect(Math.abs(rattles[1].t - chute.t)).toBeLessThan(50);
  // Buttons click.
  expect(await count(page, 'tap')).toBe(3);

  // It was really played, through one context, and nothing was muted.
  expect(entries.every((e) => e.muted === false)).toBe(true);
  const heard = await audio(page);
  expect(heard.contexts).toBe(1);
  expect(heard.sources).toBeGreaterThan(20);

  // Closing The Peel is a button tap and nothing more.
  await button(page, 'Close').click();
  await expect(modal(page)).toBeHidden();
  expect((await names(page)).slice(entries.length)).toEqual(['tap']);
  expect(problems).toEqual([]);
});

test('a rejected transaction: the crank stops and the machine jams', async ({ page, who }) => {
  await listen(page);
  await addWallet(page, who.buyer, { rejectTx: true });
  await openMachine(page);
  await toApprove(page);
  await button(page, 'DROP THE COIN').click();
  await expect(title(page)).toHaveText('NO COIN DROPPED');
  expect(await story(page)).toEqual(['coinPick', 'coinDrop', 'crankLoop', 'crankLoop:stop', 'jam']);
  expect(await read('remaining')).toBe(100n);

  // The retry is heard from the crank on, and ends on the peel.
  await setWallet(page, { rejectTx: false });
  await button(page, 'TRY AGAIN').click();
  await button(page, 'DROP THE COIN').click();
  await readPeel(page);
  expect((await story(page)).slice(5)).toEqual(['crankLoop', 'crankLoop:stop', 'chute', 'peel']);
});

test('a rejected connection jams too, with no crank', async ({ page, who }) => {
  await listen(page);
  await addWallet(page, who.buyer, { rejectConnect: true });
  await openMachine(page);
  await page.locator('#coin').click();
  await button(page, 'CONNECT WALLET').click();
  await modal(page).getByRole('button', { name: 'Mock Wallet' }).click();
  await expect(title(page)).toHaveText('NOT CONNECTED');
  expect(await story(page)).toEqual(['coinPick', 'coinDrop', 'jam']);
});

test.describe('the crank while the wallet request is open', () => {
  const toHeldWalletRequest = async (page, who) => {
    await listen(page);
    await addWallet(page, who.buyer, { holdTx: true });
    await openMachine(page);
    await toApprove(page);
    await button(page, 'DROP THE COIN').click();
    await expect(title(page)).toHaveText('THE MACHINE IS CRANKING');
    await expect.poll(async () => (await wallet(page)).requests).toContain('eth_sendTransaction');
    expect((await story(page)).slice(-1)).toEqual(['crankLoop']);
  };

  test('STOP WAITING stops it, and it stays stopped when the wallet answers late', async ({ page, who }) => {
    await toHeldWalletRequest(page, who);
    await button(page, 'STOP WAITING').click();
    await expect(title(page)).toHaveText('STOPPED WAITING');
    expect((await story(page)).slice(-2)).toEqual(['crankLoop', 'crankLoop:stop']);

    // The buyer rejects the old request in the wallet. The page already let go: no jam, no second stop.
    const before = (await log(page)).length;
    // The page writes one console line when the old pull ends. Wait for that, not for a guessed time.
    const ended = page.waitForEvent('console', (m) => m.text().includes('pull failed'));
    await setWallet(page, { rejectTx: true });
    await setWallet(page, { holdTx: false });
    await ended;
    await page.waitForTimeout(100);
    expect((await log(page)).length).toBe(before);
  });

  test('closing the Cranking view stops it, the coin brings it back, and the pull ends it', async ({ page, who }) => {
    await toHeldWalletRequest(page, who);
    await page.keyboard.press('Escape');
    await expect(modal(page)).toBeHidden();
    await expect.poll(() => story(page)).toEqual(['coinPick', 'coinDrop', 'crankLoop', 'crankLoop:stop']);

    // A tap on the coin reopens the view. It is a plain tap, not a second coin.
    await page.locator('#coin').click();
    await expect(title(page)).toHaveText('THE MACHINE IS CRANKING');
    expect(await story(page)).toEqual(['coinPick', 'coinDrop', 'crankLoop', 'crankLoop:stop', 'crankLoop']);
    expect((await names(page)).slice(-2)).toEqual(['tap', 'crankLoop']);

    await setWallet(page, { holdTx: false });
    await readPeel(page);
    expect(await story(page)).toEqual(['coinPick', 'coinDrop', 'crankLoop', 'crankLoop:stop', 'crankLoop', 'crankLoop:stop', 'chute', 'peel']);
  });

  test('with the view closed the pull lands without the crank starting again', async ({ page, who }) => {
    await toHeldWalletRequest(page, who);
    await page.locator('#modalClose').click();
    await expect(modal(page)).toBeHidden();
    await setWallet(page, { holdTx: false });
    await readPeel(page);
    expect(await story(page)).toEqual(['coinPick', 'coinDrop', 'crankLoop', 'crankLoop:stop', 'chute', 'peel']);
  });
});

test('the mute button: on by default, says its state, mutes every one shot sound and remembers the choice', async ({ page, problems }) => {
  await listen(page);
  await openMachine(page);
  await expectPulled(page, 0);
  const b = soundBtn(page);
  await expect(b).toBeVisible();
  await expect(b).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', { name: 'Mute sound. Sound is on', pressed: false })).toHaveCount(1);
  const box = await b.boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  // The speaker shows its waves, not the cross.
  await expect(b.locator('.snd-on')).toBeVisible();
  await expect(b.locator('.snd-off')).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('splatz-sound'))).toBe(null);

  // Mute. No blip, and from here on nothing reaches Web Audio.
  await b.click();
  await expect(b).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Mute sound. Sound is off', pressed: true })).toHaveCount(1);
  await expect(b.locator('.snd-on')).toBeHidden();
  await expect(b.locator('.snd-off')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('splatz-sound'))).toBe('off');
  expect(await log(page)).toEqual([]);
  const quiet = (await audio(page)).sources;
  expect(quiet).toBe(0);

  await page.locator('#glass').click();
  await page.locator('#glass').click();
  await ball(page, 1).click();
  await page.locator('#coin').click();
  await expect(title(page)).toHaveText('PULL A SPLATZ');
  await page.locator('#modalClose').click();
  await expect(modal(page)).toBeHidden();
  const asked = await log(page);
  expect(asked.map((e) => e.name)).toEqual(['rattle', 'glass', 'rattle', 'glass', 'tap', 'coinPick', 'coinDrop', 'rattle', 'tap']);
  expect(asked.every((e) => e.muted === true)).toBe(true);
  await page.waitForTimeout(300);
  expect((await audio(page)).sources).toBe(quiet);

  // The choice survives a reload.
  await page.reload();
  await expectPulled(page, 0);
  await expect(soundBtn(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(soundBtn(page)).toHaveAttribute('aria-label', 'Mute sound. Sound is off');
  await page.locator('#glass').click();
  await page.waitForTimeout(200);
  expect((await audio(page)).sources).toBe(0);

  // Sound back on: the button answers with the blip, and sounds are real again.
  await soundBtn(page).click();
  await expect(soundBtn(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(soundBtn(page)).toHaveAttribute('aria-label', 'Mute sound. Sound is on');
  expect((await log(page)).slice(-1)).toMatchObject([{ name: 'toggle', muted: false }]);
  expect(await page.evaluate(() => localStorage.getItem('splatz-sound'))).toBe('on');
  await expect.poll(async () => (await audio(page)).sources).toBeGreaterThan(0);
  const loud = (await audio(page)).sources;
  await page.locator('#glass').click();
  await expect.poll(async () => (await audio(page)).sources).toBeGreaterThan(loud);

  await page.reload();
  await expectPulled(page, 0);
  await expect(soundBtn(page)).toHaveAttribute('aria-pressed', 'false');
  expect(problems).toEqual([]);
});

test('the mute button works from the keyboard and shows where the focus is', async ({ page }) => {
  await listen(page);
  await openMachine(page);
  await soundBtn(page).focus();
  await page.keyboard.press('Enter');
  await expect(soundBtn(page)).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Space');
  await expect(soundBtn(page)).toHaveAttribute('aria-pressed', 'false');
  expect(await names(page)).toEqual(['toggle']);
  expect(await soundBtn(page).evaluate((el) => {
    const cs = getComputedStyle(el);
    return { ring: el.matches(':focus-visible'), style: cs.outlineStyle, width: parseFloat(cs.outlineWidth) };
  })).toEqual({ ring: true, style: 'solid', width: 3 });
});

for (const size of [{ width: 1280, height: 900 }, { width: 375, height: 812 }, { width: 360, height: 640 }, { width: 320, height: 568 }]) {
  test.describe(`the nav at ${size.width} by ${size.height}`, () => {
    test.use({ viewport: size });
    // Measured with the real fonts, at the start and at the widest the counters get: sold out, and a longer price.
    for (const [pulled, price] of [['0/100', null], ['100/100', '0.00035 ETH']]) {
      test(`the mute button fits beside the counters and nothing spills or is cut off, at ${pulled}`, async ({ page }) => {
        await realFonts(page);
        await openMachine(page);
        await expectPulled(page, 0);
        await page.evaluate(() => document.fonts.ready);
        expect(await page.evaluate(() => document.fonts.check('32px Bangers') && document.fonts.check('16px Boogaloo'))).toBe(true);
        await page.evaluate(([n, p]) => {
          document.getElementById('navPulled').textContent = n;
          if (p) document.getElementById('navPrice').textContent = p;
        }, [pulled, price]);
        const boxes = await page.locator('nav .logo, nav .nav-r > *:not([hidden])').evaluateAll((els) => els
          .filter((el) => getComputedStyle(el).display !== 'none')
          .map((el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; }));
        expect(boxes).toHaveLength(4);
        // Left to right with air between them: the logo, the two counters, the button.
        for (let i = 1; i < boxes.length; i++) expect(boxes[i].left - boxes[i - 1].right, `gap before item ${i}`).toBeGreaterThanOrEqual(8);
        expect(boxes[3].right).toBeLessThanOrEqual(size.width - 8);
        // The logo's box can shrink, so measure its letters: every one of them is inside the box and clear of the counters.
        const logo = await page.locator('nav .logo').evaluate((el) => {
          const range = document.createRange();
          range.selectNodeContents(el.firstChild);
          return { letters: range.getBoundingClientRect().right, box: el.getBoundingClientRect().right, scroll: el.scrollWidth, client: el.clientWidth };
        });
        expect(logo.letters, 'the logo is not cut off').toBeLessThanOrEqual(logo.box);
        expect(logo.scroll).toBeLessThanOrEqual(logo.client);
        expect(boxes[1].left - logo.letters, 'air after the logo').toBeGreaterThanOrEqual(8);
        const btn = await soundBtn(page).boundingBox();
        expect(btn.width).toBeGreaterThanOrEqual(44);
        expect(btn.height).toBeGreaterThanOrEqual(44);
        const nav = await page.locator('nav').boundingBox();
        expect(btn.y).toBeGreaterThanOrEqual(nav.y);
        expect(btn.y + btn.height).toBeLessThanOrEqual(nav.y + nav.height);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      });
    }
  });
}

test('tapping the glass: the pitch climbs with the count and the pile is heard', async ({ page }) => {
  await listen(page);
  await openMachine(page);
  await expectPulled(page, 0);
  for (let i = 0; i < 3; i++) await page.locator('#glass').click();
  const entries = await log(page);
  expect(entries.map((e) => e.name)).toEqual(['rattle', 'glass', 'rattle', 'glass', 'rattle', 'glass']);
  expect(entries.filter((e) => e.name === 'glass').map((e) => e.n)).toEqual([0, 1, 2]);
  // Gallery gumballs and the other buttons click.
  await ball(page, 7).click();
  expect((await names(page)).slice(-1)).toEqual(['tap']);
});

test('sold out is heard once, when The Peel of the last card closes, and never on a reload', async ({ page, who }) => {
  test.setTimeout(120_000);
  for (let i = 0; i < 99; i++) await pullDirect(who.crowd);
  await listen(page);
  await addWallet(page, who.buyer);
  await openMachine(page);
  await expectPulled(page, 99);
  await pullThroughSite(page);
  await expectPulled(page, 100);
  await expect(page.locator('#soldStamp')).toBeVisible();
  // The Peel has the floor. The stamp is behind it.
  expect(await story(page)).toEqual(['coinPick', 'coinDrop', 'crankLoop', 'crankLoop:stop', 'chute', 'peel']);
  await button(page, 'Close').click();
  await expect(modal(page)).toBeHidden();
  await expect.poll(() => count(page, 'soldOut')).toBe(1);

  // Later readings of the empty machine say nothing more.
  await page.evaluate(() => document.getElementById('retryBtn').click());
  await page.waitForTimeout(500);
  expect(await count(page, 'soldOut')).toBe(1);

  await page.reload();
  await expectPulled(page, 100);
  await expect(page.locator('#soldStamp')).toBeVisible();
  await page.locator('#glass').click();
  await ball(page, 3).click();
  await page.waitForTimeout(500);
  expect(await names(page)).toEqual(['glass', 'tap']);
});

test('the last card goes to someone else: the SOLD OUT message is heard once as sold out, not as a jam', async ({ page, who }) => {
  test.setTimeout(120_000);
  for (let i = 0; i < 99; i++) await pullDirect(who.crowd);
  await listen(page);
  await addWallet(page, who.buyer);
  await openMachine(page);
  await toApprove(page);
  await pullDirect(who.stranger);
  await button(page, 'DROP THE COIN').click();
  await expect(title(page)).toHaveText('SOLD OUT');
  await expect.poll(() => story(page)).toEqual(['coinPick', 'coinDrop', 'crankLoop', 'soldOut', 'crankLoop:stop']);
  await button(page, 'Close').click();
  await page.waitForTimeout(300);
  expect(await count(page, 'soldOut')).toBe(1);
  expect(await count(page, 'jam')).toBe(0);
});

test('preview build: the coin is picked up and the glass answers, but no pull sound plays', async ({ page, problems }) => {
  await listen(page);
  await openMachine(page, PREVIEW_URL);
  await page.locator('#coin').click();
  await expect(title(page)).toHaveText('THE MACHINE OPENS SOON');
  await button(page, 'Close').click();
  await expect(modal(page)).toBeHidden();
  await page.locator('#glass').click();
  await page.waitForTimeout(800);
  const heard = await names(page);
  expect(heard).toEqual(['coinPick', 'tap', 'rattle', 'glass']);
  for (const name of PULL_SOUNDS) expect(heard).not.toContain(name);
  await expect(soundBtn(page)).toBeVisible();
  expect(problems).toEqual([]);
});

test('a browser with no Web Audio: the pull still completes, quietly, and there is no mute button', async ({ page, problems, who }) => {
  await page.addInitScript(() => {
    window.__SFX_TEST__ = true;
    delete window.AudioContext;
    delete window.webkitAudioContext;
  });
  await addWallet(page, who.buyer);
  await openMachine(page);
  expect(await page.evaluate(() => 'AudioContext' in window || 'webkitAudioContext' in window)).toBe(false);
  await expect(soundBtn(page)).toBeHidden();
  await page.locator('#glass').click();
  const peel = await pullThroughSite(page);
  expect((await read('ownerOf', [BigInt(peel.id)])).toLowerCase()).toBe(who.buyer.toLowerCase());
  await expectPulled(page, 1);
  // The page asked for every sound as usual. Nothing came of it and nothing broke.
  expect(await story(page)).toEqual(['glass', 'coinPick', 'coinDrop', 'crankLoop', 'crankLoop:stop', 'chute', 'peel']);
  await button(page, 'Close').click();
  await expect(modal(page)).toBeHidden();
  expect(problems).toEqual([]);
});

test('a browser whose Web Audio throws: the pull still completes', async ({ page, problems, who }) => {
  await page.addInitScript(() => {
    window.__SFX_TEST__ = true;
    window.AudioContext = window.webkitAudioContext = class { constructor() { throw new Error('no audio device'); } };
  });
  await addWallet(page, who.buyer);
  await openMachine(page);
  // Until a tap the page cannot know. The first tap finds out, and the button for a sound that cannot play goes away.
  await expect(soundBtn(page)).toBeVisible();
  await page.locator('#glass').click();
  await expect(soundBtn(page)).toBeHidden();
  const peel = await pullThroughSite(page);
  expect((await read('ownerOf', [BigInt(peel.id)])).toLowerCase()).toBe(who.buyer.toLowerCase());
  await button(page, 'CRANK AGAIN').click();
  await expect(title(page)).toHaveText('PULL A SPLATZ');
  expect(problems).toEqual([]);
});

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('every sound still plays, on the shortened sequence', async ({ page, problems, who }) => {
    await listen(page);
    await addWallet(page, who.buyer);
    await openMachine(page);
    await expectPulled(page, 0);

    // The glass still answers, but the pile holds still, so no rattle.
    await page.locator('#glass').click();
    expect(await names(page)).toEqual(['glass']);

    // The coin does not fly. The view opens at once and the slot sound follows the pick up with no flight to wait for.
    await page.locator('#coin').click();
    await expect(title(page)).toHaveText('PULL A SPLATZ');
    // The machine does not shake either, so nothing rattles.
    expect(await page.evaluate(() => document.getAnimations().filter((a) => a.effect?.target?.closest?.('#machine, #coin')).length)).toBe(0);
    let entries = (await log(page)).slice(1);
    expect(entries.map((e) => e.name)).toEqual(['coinPick', 'coinDrop']);
    expect(entries[1].delay).toBeLessThanOrEqual(0.15);

    await button(page, 'CONNECT WALLET').click();
    await modal(page).getByRole('button', { name: 'Mock Wallet' }).click();
    await expect(title(page)).toHaveText('APPROVE IN WALLET');
    await button(page, 'DROP THE COIN').click();
    const peel = await readPeel(page);

    expect((await story(page)).slice(1)).toEqual(['coinPick', 'coinDrop', 'crankLoop', 'crankLoop:stop', 'chute', 'peel']);
    entries = await log(page);
    const stop = one(entries, 'crankLoop:stop');
    const chute = one(entries, 'chute');
    const peelSound = one(entries, 'peel');
    expect(peelSound.tier).toBe(TIERS.indexOf(cardById.get(peel.id).rarity));
    // No Confirmed pause and no fall to wait for: the gumball is in the tray at once and so is its sound.
    // (With motion on, the Confirmed step alone holds the gumball back 700ms.)
    expect(chute.delay).toBe(0);
    expect(chute.t - stop.t).toBeLessThan(500);
    // The Peel waits for the chute sound to finish (0.6s), not for the 1.35s fall, so the two never play on top
    // of each other. Its sound is asked for as it opens.
    expect(peelSound.delay ?? 0).toBe(0);
    expect(peelSound.t - chute.t).toBeGreaterThanOrEqual(600);
    expect(peelSound.t - chute.t).toBeLessThan(1300);
    // Nothing shook from the first tap to The Peel, so nothing rattled.
    expect(await count(page, 'rattle')).toBe(0);
    expect(problems).toEqual([]);
  });
});

test('the owner page makes no sound and never touches Web Audio', async ({ page, problems }) => {
  await listen(page);
  await page.goto(`${LIVE_URL}/admin`);
  await expect(page.locator('#adLeft')).toHaveText(`${cardsJson.cards.length}`);
  await page.locator('#adRefresh').click();
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__sfxLog)).toBeUndefined();
  expect(await audio(page)).toEqual({ contexts: 0, sources: 0 });
  await expect(soundBtn(page)).toHaveCount(0);
  expect(problems).toEqual([]);
});

/* ---------- found in review ---------- */

test('the crank is still heard after a long wait for the wallet', async ({ page, who }) => {
  // The page's clock is stood in for, so half a minute can pass at once. Web Audio keeps its own real time.
  await page.clock.install();
  await listen(page);
  await addWallet(page, who.buyer, { holdTx: true });
  await openMachine(page);
  await toApprove(page);
  await button(page, 'DROP THE COIN').click();
  await expect(title(page)).toHaveText('THE MACHINE IS CRANKING');
  await expect.poll(async () => (await wallet(page)).requests).toContain('eth_sendTransaction');
  await page.clock.fastForward(30_000);
  await expect(title(page)).toHaveText('THE MACHINE IS CRANKING');
  await expect(page.locator('#crank')).toHaveClass(/spin/);
  // A crank that is still going keeps adding teeth, ten a second.
  const before = (await audio(page)).sources;
  await expect.poll(async () => (await audio(page)).sources - before, { timeout: 5000 }).toBeGreaterThan(20);
  expect(await story(page)).toEqual(['coinPick', 'coinDrop', 'crankLoop']);

  // And it still stops with the pull.
  await setWallet(page, { holdTx: false });
  await readPeel(page);
  expect(await story(page)).toEqual(['coinPick', 'coinDrop', 'crankLoop', 'crankLoop:stop', 'chute', 'peel']);
});

test.describe('the peel sound and the card art', () => {
  // Writes down when the art on The Peel loaded or failed, on the same clock as the sound log.
  const watchArt = (page) => page.addInitScript(() => {
    for (const type of ['load', 'error']) {
      document.addEventListener(type, (e) => { if (e.target?.classList?.contains('rimg')) window.__art ??= { type, t: performance.now() }; }, true);
    }
  });

  test('slow art: the sound waits for the art, and the art was asked for before The Peel opened', async ({ page, who }) => {
    await listen(page);
    await watchArt(page);
    let asked = null;
    await page.route('**/img/*.png', async (route) => {
      asked ??= Date.now();
      await new Promise((r) => setTimeout(r, 3500));
      await route.continue();
    });
    await addWallet(page, who.buyer);
    await openMachine(page);
    await toApprove(page);
    await button(page, 'DROP THE COIN').click();
    await expect(title(page)).toHaveText('THE PEEL', { timeout: 30_000 });
    const opened = Date.now();
    // The card art is on its way from the moment the card is known, a good second before The Peel opens.
    expect(asked).not.toBeNull();
    expect(opened - asked).toBeGreaterThan(1000);
    // The Peel is open, the art is not there yet, and the sound holds its breath.
    expect(await page.evaluate(() => window.__art)).toBeUndefined();
    expect(await count(page, 'peel')).toBe(0);
    await expect.poll(() => page.evaluate(() => window.__art?.type)).toBe('load');
    await expect.poll(() => count(page, 'peel')).toBe(1);
    const art = await page.evaluate(() => window.__art);
    const sound = one(await log(page), 'peel');
    expect(sound.t - art.t).toBeGreaterThanOrEqual(0);
    expect(sound.t - art.t).toBeLessThan(250);
    // Once. Closing says nothing more.
    await button(page, 'Close').click();
    await expect(modal(page)).toBeHidden();
    expect(await count(page, 'peel')).toBe(1);
  });

  test('art that never loads: the sound plays once, with the card named instead', async ({ page, who }) => {
    await listen(page);
    await page.route(/\/img\/\d+\.png/, (route) => route.abort());
    await addWallet(page, who.buyer);
    await openMachine(page);
    await toApprove(page);
    await button(page, 'DROP THE COIN').click();
    await expect(title(page)).toHaveText('THE PEEL', { timeout: 30_000 });
    await expect(modal(page).locator('.rfail')).toBeVisible();
    await expect.poll(() => count(page, 'peel')).toBe(1);
    await modal(page).getByRole('button', { name: 'Retry' }).click();
    await expect(modal(page).locator('.rfail')).toBeVisible();
    expect(await count(page, 'peel')).toBe(1);
  });

  test('art that hangs: the sound does not wait for ever, and does not play after The Peel is closed', async ({ page, who }) => {
    await listen(page);
    await page.route('**/img/*.png', () => { /* never answered */ });
    await addWallet(page, who.buyer);
    await openMachine(page);
    await toApprove(page);
    await button(page, 'DROP THE COIN').click();
    await expect(title(page)).toHaveText('THE PEEL', { timeout: 30_000 });
    expect(await count(page, 'peel')).toBe(0);
    await expect.poll(() => count(page, 'peel'), { timeout: 5000 }).toBe(1);

    // Again, and this time the visitor closes The Peel before the sound was due.
    await button(page, 'CRANK AGAIN').click();
    await expect(title(page)).toHaveText('PULL A SPLATZ');
    await button(page, 'CONTINUE').click();
    await button(page, 'DROP THE COIN').click();
    await expect(title(page)).toHaveText('THE PEEL', { timeout: 30_000 });
    await button(page, 'Close').click();
    await expect(modal(page)).toBeHidden();
    await page.waitForTimeout(2500);
    expect(await count(page, 'peel')).toBe(1);
  });
});

test('the coin pressed twice from the keyboard is one coin', async ({ page }) => {
  await listen(page);
  await openMachine(page);
  await expectPulled(page, 0);
  await page.locator('#coin').focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  await page.keyboard.press('Enter');
  await expect(title(page)).toHaveText('PULL A SPLATZ');
  // Long enough for a second coin to have reached the slot, had there been one.
  await page.waitForTimeout(900);
  expect(await names(page)).toEqual(['coinPick', 'coinDrop', 'rattle']);
  // The coin works again after the view is closed.
  await page.keyboard.press('Escape');
  await expect(modal(page)).toBeHidden();
  await page.locator('#coin').click();
  await expect(title(page)).toHaveText('PULL A SPLATZ');
  await expect.poll(() => names(page)).toEqual(['coinPick', 'coinDrop', 'rattle', 'coinPick', 'coinDrop', 'rattle']);
});

test('the last card goes to someone else while the wallet is open: sold out is heard, without a jam on top', async ({ page, who }) => {
  test.setTimeout(120_000);
  for (let i = 0; i < 99; i++) await pullDirect(who.crowd);
  await listen(page);
  await addWallet(page, who.buyer, { holdTx: true });
  await openMachine(page);
  await toApprove(page);
  await button(page, 'DROP THE COIN').click();
  await expect.poll(async () => (await wallet(page)).requests).toContain('eth_sendTransaction');
  await pullDirect(who.stranger);
  await setWallet(page, { holdTx: false });
  await expect(title(page)).toHaveText('THE PULL DID NOT GO THROUGH', { timeout: 30_000 });
  await expect(page.locator('#soldStamp')).toBeVisible();
  expect(await story(page)).toEqual(['coinPick', 'coinDrop', 'crankLoop', 'crankLoop:stop', 'soldOut']);
  await button(page, 'Close').click();
  await expect(modal(page)).toBeHidden();
  expect(await count(page, 'soldOut')).toBe(1);
  expect(await count(page, 'jam')).toBe(0);
});

test('a page in the background keeps quiet when the pull lands', async ({ page, who }) => {
  await listen(page);
  await addWallet(page, who.buyer, { holdTx: true });
  await openMachine(page);
  await toApprove(page);
  await button(page, 'DROP THE COIN').click();
  await expect.poll(async () => (await wallet(page)).requests).toContain('eth_sendTransaction');
  expect(await story(page)).toEqual(['coinPick', 'coinDrop', 'crankLoop']);
  const before = (await names(page)).length;
  // The visitor goes to another tab and approves there. (A test cannot hide a real tab, so the page is told it is hidden.)
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await setWallet(page, { holdTx: false });
  await readPeel(page);
  await page.waitForTimeout(300);
  const heard = (await names(page)).slice(before);
  expect(heard).toEqual(['crankLoop:stop']);
  // Back in front, the page answers again.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await button(page, 'Close').click();
  expect((await names(page)).slice(-1)).toEqual(['tap']);
});

test('a visitor who muted last time: no AudioContext is made until the sound is turned back on', async ({ page, who }) => {
  await listen(page);
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('splatz-sound', 'off'); } });
  await addWallet(page, who.buyer);
  await openMachine(page);
  await expectPulled(page, 0);
  await expect(soundBtn(page)).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#glass').click();
  await page.keyboard.press('Tab');
  // A whole pull, crank and all.
  await pullThroughSite(page);
  await button(page, 'Close').click();
  await expect(modal(page)).toBeHidden();
  expect(await story(page)).toEqual(['glass', 'coinPick', 'coinDrop', 'crankLoop', 'crankLoop:stop', 'chute', 'peel']);
  expect(await audio(page)).toEqual({ contexts: 0, sources: 0 });

  // Sound on: now there is one, and the blip is really played.
  await soundBtn(page).click();
  await expect(soundBtn(page)).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(async () => (await audio(page)).sources).toBeGreaterThan(0);
  expect((await audio(page)).contexts).toBe(1);
});

test('a browser whose Web Audio cannot be set up: one try, cleaned up, and the mute button goes away', async ({ page, problems, who }) => {
  await listen(page);
  await page.addInitScript(() => { BaseAudioContext.prototype.createWaveShaper = () => { throw new Error('no shaper'); }; });
  await addWallet(page, who.buyer);
  await openMachine(page);
  await expectPulled(page, 0);
  await expect(soundBtn(page)).toBeVisible();
  for (let i = 0; i < 12; i++) await page.locator('#glass').click();
  // One context was tried and closed again. The other eleven taps did not try.
  expect((await audio(page)).contexts).toBe(1);
  expect(await closed(page)).toBe(1);
  await expect(soundBtn(page)).toBeHidden();
  const peel = await pullThroughSite(page);
  expect((await read('ownerOf', [BigInt(peel.id)])).toLowerCase()).toBe(who.buyer.toLowerCase());
  expect(await audio(page)).toEqual({ contexts: 1, sources: 0 });
  expect(problems).toEqual([]);
});
