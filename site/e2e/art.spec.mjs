// The machine art in the real page: what paints over what, where the pile sits, and what stays on the first screen.
import { pullDirect, send } from './chain.mjs';
import {
  addWallet, button, cardById, cardsJson, expect, expectPulled, modal, openMachine, readPeel, test, title, toApprove,
} from './fixtures.mjs';
import { LIVE_URL, PREVIEW_URL, RPC_URL } from './ports.mjs';

const hexToRgb = (hex) => { const n = parseInt(hex.slice(1), 16); return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`; };

// A point of the 400 by 540 machine art, in page coordinates.
const artPoint = (page, x, y) => page.locator('#machine').evaluate((m, [ax, ay]) => {
  const r = m.getBoundingClientRect();
  return { x: r.left + (ax / 400) * r.width, y: r.top + (ay / 540) * r.height };
}, [x, y]);

// Which machine layer is painted on top at a point. The art ignores the pointer, so hit testing is switched on for
// the layers named in css first.
async function topLayer(page, point) {
  return page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    return el?.closest('.gb, #eeFace, #eeTapHint, .m-front, .m-back, #soldStamp, .m-sign')?.className?.baseVal
      ?? el?.closest('.gb, #eeFace, #eeTapHint, .m-front, .m-back, #soldStamp, .m-sign')?.className ?? el?.tagName;
  }, point);
}
// The front art is hit only where one of its shapes is painted, never on the empty parts of its box.
const hitTest = (page) => page.addStyleTag({ content: '.gb{pointer-events:auto!important}.m-front *{pointer-events:visiblePainted!important}' });

// Where every gumball sits, measured against the art: the glass is the circle at (200,180) radius 111 and the
// collar's top edge is at y 264.
const pile = (page) => page.evaluate(() => {
  const m = document.getElementById('machine').getBoundingClientRect(); const u = m.width / 400;
  return [...document.querySelectorAll('#gbGrid .gb')].map((el) => {
    const r = el.getBoundingClientRect();
    const cx = (r.left + r.width / 2 - m.left) / u; const cy = (r.top + r.height / 2 - m.top) / u;
    return { id: Number(el.dataset.id), bottom: (r.bottom - m.top) / u, fromCentre: Math.hypot(cx - 200, cy - 180), radius: r.width / 2 / u };
  });
});
async function expectPileInGlass(page, count) {
  await expect(page.locator('#gbGrid .gb')).toHaveCount(count);
  // Let a gumball that is dropping into a gap come to rest.
  await expect.poll(async () => (await page.evaluate(() => document.getAnimations().filter((a) => a.transitionProperty && a.effect?.target?.matches?.('.gb')).length))).toBe(0);
  for (const b of await pile(page)) {
    expect(b.bottom, `gumball ${b.id} rests on or above the collar's top edge`).toBeLessThanOrEqual(264);
    expect(b.fromCentre, `gumball ${b.id} is inside the round glass`).toBeLessThanOrEqual(111 - b.radius + 4);
  }
}

test('n. the full pile stays behind the glass: the collar, the nameplate and the shine paint over it', async ({ page, problems }) => {
  await openMachine(page);
  await expectPulled(page, 0);
  await expectPileInGlass(page, 100);
  await hitTest(page);
  // On the collar and the nameplate, which reach up into the round glass.
  for (const [x, y] of [[200, 268], [176, 268], [224, 268], [200, 284], [150, 270], [250, 270]]) {
    expect(await topLayer(page, await artPoint(page, x, y)), `front art is on top at ${x},${y}`).toContain('m-front');
  }
  // On the white shine and the cyan rim light, which sit over the pile.
  for (const [x, y] of [[288, 150], [294, 186], [98, 200]]) {
    expect(await topLayer(page, await artPoint(page, x, y)), `shine is on top at ${x},${y}`).toContain('m-front');
  }
  // And the pile is really there under the glass: a point in the middle of it is a gumball.
  expect(await topLayer(page, await artPoint(page, 200, 215))).toContain('gb');
  expect(problems).toEqual([]);
});

test('n. the last gumballs sit in the glass on the collar, every one in view', async ({ page, who }) => {
  test.setTimeout(120_000);
  const gone = [];
  for (let i = 0; i < 95; i++) gone.push(await pullDirect(who.crowd));
  await openMachine(page);
  await expectPulled(page, 95);
  await expectPileInGlass(page, 5);
  // Down to one, read by the page each time, so the pile settles the way it does for a visitor.
  for (let left = 4; left >= 1; left--) {
    gone.push(await pullDirect(who.crowd));
    await page.locator('#retryBtn').dispatchEvent('click');
    await expectPulled(page, 100 - left);
    await expectPileInGlass(page, left);
  }
  const last = cardsJson.cards.find((c) => !gone.includes(c.id));
  await expect(page.locator('#gbGrid .gb')).toHaveAttribute('data-id', String(last.id));
  await expect(page.locator('#soldStamp')).toBeHidden();
});

test('n. the glass is empty until the chain has been read, then holds exactly the cards left', async ({ page, who }) => {
  const early = [await pullDirect(who.crowd), await pullDirect(who.crowd)];
  let release;
  const held = new Promise((r) => { release = r; });
  await page.route(`${RPC_URL}/**`, async (route) => { await held; await route.continue(); });
  await openMachine(page);
  await expect(page.locator('#ctaSub')).toHaveText('Checking The Machine');
  await expect(page.locator('#navPulled')).toHaveText('...');
  await expect(page.locator('#gbGrid .gb')).toHaveCount(0);
  await expect(page.locator('#soldStamp')).toBeHidden();
  release();
  await expectPulled(page, 2);
  await expect(page.locator('#gbGrid .gb')).toHaveCount(98);
  for (const id of early) await expect(page.locator(`#gbGrid .gb[data-id="${id}"]`)).toHaveCount(0);
});

test('n. the preview build shows all 100 gumballs', async ({ page }) => {
  await openMachine(page, PREVIEW_URL);
  await expectPileInGlass(page, 100);
});

for (const viewport of [{ width: 1280, height: 720 }, { width: 1024, height: 768 }, { width: 375, height: 667 }, { width: 360, height: 640 }, { width: 320, height: 568 }]) {
  test.describe(`chain unreachable on a ${viewport.width} by ${viewport.height} screen`, () => {
    test.use({ viewport });
    test('the notice and Retry are on the first screen with the coin, and the glass shows no gumballs', async ({ page }) => {
      let down = true;
      await page.route(`${RPC_URL}/**`, (route) => (down ? route.abort() : route.continue()));
      await openMachine(page);
      await expect(page.locator('#notice')).toBeVisible();
      await expect(page.locator('#noticeText')).toHaveText('Could not reach Anvil.');
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
      await expect(page.locator('#notice')).toBeInViewport({ ratio: 1 });
      await expect(page.locator('#retryBtn')).toBeInViewport({ ratio: 1 });
      await expect(page.locator('#coin')).toBeInViewport({ ratio: 1 });
      await expect(page.locator('#ctaLabel')).toBeInViewport({ ratio: 1 });
      await expect(page.locator('#machine')).toBeInViewport({ ratio: 1 });
      await expect(page.locator('#coin')).toHaveClass(/dim/);
      await expect(page.locator('#gbGrid .gb')).toHaveCount(0);
      // Retry works, and the machine gets its full size back.
      const small = (await page.locator('#machine').boundingBox()).height;
      down = false;
      await page.locator('#retryBtn').click();
      await expectPulled(page, 0);
      await expect(page.locator('#notice')).toBeHidden();
      await expect(page.locator('#gbGrid .gb')).toHaveCount(100);
      expect((await page.locator('#machine').boundingBox()).height).toBeGreaterThanOrEqual(small);
      await expect(page.locator('#coin')).toBeInViewport({ ratio: 1 });
      await expect(page.locator('#ctaLabel')).toBeInViewport({ ratio: 1 });
    });
  });
}

// The words of the hint, the bandage and the padlock, as boxes on the page.
const hintAndDecor = (page) => page.evaluate(() => {
  const box = (r) => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
  const range = document.createRange();
  range.selectNodeContents(document.getElementById('eeTapHint'));
  return {
    words: [...range.getClientRects()].map(box),
    patch: box(document.querySelector('#machine .m-front .m-patch').getBoundingClientRect()),
    lock: box(document.querySelector('#machine .m-front .m-lock').getBoundingClientRect()),
    glass: box(document.getElementById('glass').getBoundingClientRect()),
  };
});
const overlap = (p, q) => p.left < q.right && q.left < p.right && p.top < q.bottom && q.top < p.bottom;

for (const viewport of [{ width: 1280, height: 900 }, { width: 1280, height: 720 }, { width: 375, height: 812 }, { width: 320, height: 568 }]) {
  test.describe(`tap the glass hint on a ${viewport.width} by ${viewport.height} screen`, () => {
    test.use({ viewport });
    test('the hint is clear of the bandage and the padlock', async ({ page }) => {
      await openMachine(page);
      await expectPulled(page, 0);
      await expect(page.locator('#eeTapHint')).toBeVisible();
      const { words, patch, lock, glass } = await hintAndDecor(page);
      expect(words.length).toBeGreaterThan(0);
      for (const w of words) {
        expect(overlap(w, patch), 'the hint does not touch the bandage').toBe(false);
        expect(overlap(w, lock), 'the hint does not touch the padlock').toBe(false);
        expect(w.left).toBeGreaterThan(glass.left);
        expect(w.right).toBeLessThan(glass.right);
        expect(w.bottom - w.top, 'the hint is big enough to read').toBeGreaterThanOrEqual(9);
      }
    });
  });
}

test('n. a closed machine shows no tap hint under its CLOSED sign, and the glass still answers a tap', async ({ page, who }) => {
  await send(who.owner, 'setSaleOpen', [false]);
  await openMachine(page);
  await expect(page.locator('#machine')).toHaveClass(/closed/);
  await expect(page.locator('#eeTapHint')).toBeHidden();
  await page.locator('#glass').click();
  await expect(page.locator('#glass')).toHaveClass(/rattle/);
});

test('n. the coin stays in the machine while the gumball drops, and comes back when The Peel is closed', async ({ page, problems, who }) => {
  await addWallet(page, who.buyer);
  await openMachine(page);
  await toApprove(page);
  // Every frame from here on: is the dialog open, has the gumball been let go, can the coin be seen.
  await page.evaluate(() => {
    window.__frames = [];
    const coin = document.getElementById('coin');
    const tick = () => {
      window.__frames.push({
        open: document.getElementById('modal').open, title: document.getElementById('modalTitle').textContent,
        drop: document.getElementById('dgb').classList.contains('drop'), coin: Number(getComputedStyle(coin).opacity),
      });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await button(page, 'DROP THE COIN').click();
  const peel = await readPeel(page);
  const frames = await page.evaluate(() => window.__frames);
  const dropping = frames.filter((f) => f.drop && !f.open);
  expect(dropping.length, 'the drop was watched with the dialog out of the way').toBeGreaterThan(10);
  expect(dropping.filter((f) => f.coin > 0.05).length, 'frames of the drop with the coin back under the machine').toBe(0);
  // Still away behind The Peel.
  await expect(page.locator('#coin')).toHaveCSS('opacity', '0');
  // The chute shows the pulled card's color, as painted.
  const fill = await page.locator('#dgb circle').nth(1).evaluate((el) => getComputedStyle(el).fill);
  expect(fill).toBe(hexToRgb(cardById.get(peel.id).color));
  await button(page, 'Close').click();
  await expect(modal(page)).toBeHidden();
  await expect(page.locator('#coin')).not.toHaveClass(/inserted|away/);
  await expect(page.locator('#coin')).toHaveCSS('opacity', '1');
  await expect(page.locator('#dgb')).not.toHaveClass(/drop/);
  // And it works again.
  await page.locator('#coin').click();
  await expect(title(page)).toHaveText('PULL A SPLATZ');
  expect(problems).toEqual([]);
});

test('n. closing the Cranking view puts the coin back at once, and it goes away again when the pull lands', async ({ page, who }) => {
  await addWallet(page, who.buyer, { holdTx: true });
  await openMachine(page);
  await toApprove(page);
  await button(page, 'DROP THE COIN').click();
  await expect(title(page)).toHaveText('THE MACHINE IS CRANKING');
  await page.keyboard.press('Escape');
  await expect(modal(page)).toBeHidden();
  await expect(page.locator('#coin')).not.toHaveClass(/inserted|away/);
  await expect(page.locator('#crank')).toHaveClass(/spin/);
  await page.evaluate(() => { window.__mockWallet.holdTx = false; });
  await expect(page.locator('#dgb')).toHaveClass(/drop/, { timeout: 30_000 });
  await expect(page.locator('#coin')).toHaveClass(/away/);
  await readPeel(page);
  await button(page, 'Close').click();
  await expect(page.locator('#coin')).not.toHaveClass(/inserted|away/);
});

test('n. the coin is aimed from where it rests, not from where a hover lifted it', async ({ page }) => {
  await openMachine(page);
  await expectPulled(page, 0);
  const coin = page.locator('#coin');
  await coin.hover();
  // The hover lift has finished.
  await expect.poll(() => coin.evaluate((el) => getComputedStyle(el).transform)).not.toBe('none');
  await page.waitForTimeout(250);
  await page.mouse.down();
  await page.mouse.up();
  await expect(coin).toHaveClass(/inserted/);
  const aim = await page.evaluate(() => {
    const c = document.getElementById('coin');
    const ix = parseFloat(c.style.getPropertyValue('--ix')); const iy = parseFloat(c.style.getPropertyValue('--iy'));
    // The resting box: no flight, no hover.
    c.classList.remove('inserted'); c.style.transform = 'none'; c.style.transition = 'none';
    const r = c.getBoundingClientRect(); const s = document.querySelector('#machine .m-slot').getBoundingClientRect();
    c.style.transform = ''; c.style.transition = ''; c.classList.add('inserted');
    return { dx: ix - (s.left + s.width / 2 - r.left - r.width / 2), dy: iy - (s.top + s.height / 2 - r.top - r.height / 2), slot: s.height };
  });
  expect(Math.abs(aim.dx)).toBeLessThan(1);
  expect(Math.abs(aim.dy)).toBeLessThan(1);
});

test.describe('a browser without color-mix', () => {
  test('the gumballs still show their flavor color, in the glass, in the chute and in the gallery', async ({ page, who }) => {
    await page.addInitScript(() => {
      const real = CSS.supports.bind(CSS);
      CSS.supports = (...args) => (args.join(' ').includes('color-mix') ? false : real(...args));
    });
    // The stylesheet as such a browser reads it: every color-mix value is unknown to it.
    await page.route(/\/assets\/.*\.css$/, async (route) => {
      const res = await route.fetch();
      await route.fulfill({ response: res, body: (await res.text()).replaceAll('color-mix(', 'color-nix(') });
    });
    await pullDirect(who.crowd);
    await addWallet(page, who.buyer);
    await openMachine(page);
    await expectPulled(page, 1);
    const painted = await page.locator('#gbGrid .gb').evaluateAll((els) => els.map((el) => [Number(el.dataset.id), getComputedStyle(el).backgroundColor]));
    expect(painted).toHaveLength(99);
    for (const [id, color] of painted) expect(color, `gumball ${id}`).toBe(hexToRgb(cardById.get(id).color));
    const border = await page.locator('#galleryGrid .gball.pulled').first().evaluate((el) => getComputedStyle(el).borderTopStyle);
    expect(border).toBe('solid');
    await toApprove(page);
    await button(page, 'DROP THE COIN').click();
    const peel = await readPeel(page);
    const fills = await page.locator('#dgb circle').evaluateAll((els) => els.slice(0, 2).map((el) => getComputedStyle(el).fill));
    expect(fills).toEqual([hexToRgb(cardById.get(peel.id).color), hexToRgb(cardById.get(peel.id).color)]);
  });
});

// Short and sideways screens: the machine, the coin and the headline all fit on the first screen.
const firstScreen = async (page) => {
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.locator('#coin')).toBeInViewport({ ratio: 1 });
  await expect(page.locator('#ctaLabel')).toBeInViewport({ ratio: 1 });
  await expect(page.locator('#machine')).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
};
for (const viewport of [{ width: 1280, height: 600 }, { width: 1366, height: 650 }, { width: 812, height: 375 }, { width: 667, height: 375 }]) {
  test.describe(`first screen at ${viewport.width} by ${viewport.height}`, () => {
    test.use({ viewport, ...(viewport.height < 400 ? { hasTouch: true, isMobile: true } : {}) });
    test('the coin and the headline are above the fold, open and closed', async ({ page, problems, who }) => {
      await openMachine(page);
      await expectPulled(page, 0);
      await firstScreen(page);
      // The coin still finds the slot in this layout.
      await page.locator('#coin').click();
      await expect(title(page)).toHaveText('PULL A SPLATZ');
      await page.keyboard.press('Escape');
      await send(who.owner, 'setSaleOpen', [false]);
      await page.locator('#retryBtn').dispatchEvent('click');
      await expect(page.locator('#ctaLabel')).toHaveText('The Machine is closed for now.');
      await firstScreen(page);
      expect(problems).toEqual([]);
    });
    test('the preview build fits too', async ({ page }) => {
      await openMachine(page, PREVIEW_URL);
      await firstScreen(page);
    });
  });
}

test.describe('the smallest phone, 320 by 568', () => {
  test.use({ viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true });
  test('the coin is at least 64 pixels each way', async ({ page }) => {
    await openMachine(page);
    await expectPulled(page, 0);
    const box = await page.locator('#coin').boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(64);
    expect(box.height).toBeGreaterThanOrEqual(64);
  });
});
