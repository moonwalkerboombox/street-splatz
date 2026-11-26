// Free play and the new art: the cent coin, the livelier pile, the jump scare, the handle, knocks, the chute flap,
// the coin carried to the slot by hand, and every card name on The Peel of the smallest phone.
// A test cannot hear, so sounds are read from window.__sfxLog (src/sfx.js writes it when window.__SFX_TEST__ is set).
import { readFileSync } from 'node:fs';
import { pullDirect, send } from './chain.mjs';
import {
  addWallet, button, cardsJson, expect, expectPulled, modal, openMachine, pullThroughSite, readPeel, test, title, wallet,
} from './fixtures.mjs';
import { PREVIEW_URL, RPC_URL } from './ports.mjs';

const listen = (page) => page.addInitScript(() => { window.__SFX_TEST__ = true; });
const names = (page) => page.evaluate(() => window.__sfxLog.map((e) => e.name));
const count = async (page, name) => (await names(page)).filter((n) => n === name).length;
const forget = (page) => page.evaluate(() => { window.__sfxLog.length = 0; });
const classOf = (page, id) => page.locator(`#${id}`).evaluate((el) => el.getAttribute('class') || '');
const centre = async (locator) => { const b = await locator.boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
const slotOf = (page) => centre(page.locator('#machine .m-slot'));

// The page's real fonts, from e2e/fonts. Without this the suite runs on fallback fonts, which are wider here.
const FONTS = new URL('./fonts/', import.meta.url);
async function realFonts(page) {
  await page.route(/^https:\/\/fonts\.googleapis\.com\//, (route) => route.fulfill({ status: 200, contentType: 'text/css', body: readFileSync(new URL('fonts.css', FONTS)) }));
  await page.route(/^https:\/\/fonts\.gstatic\.com\//, (route) => route.fulfill({
    status: 200, contentType: 'font/woff2', headers: { 'access-control-allow-origin': '*' },
    body: readFileSync(new URL(route.request().url().split('/').pop(), FONTS)),
  }));
}

// Carries the coin with the mouse and stops with the button still down.
async function carryCoin(page, to) {
  const from = await centre(page.locator('#coin'));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2 + 30, (from.y + to.y) / 2, { steps: 6 });
  await page.mouse.move(to.x, to.y, { steps: 6 });
}
// One finger on a phone: down at from, across to to, up. Sent as real touch input, so the browser decides
// for itself whether it is a scroll.
// hold: how long the finger rests before it moves. dwell: how long it rests before it lifts.
async function swipe(page, from, to, steps = 10, { hold = 0, dwell = 0 } = {}) {
  const cdp = await page.context().newCDPSession(page);
  const point = (p) => [{ x: Math.round(p.x), y: Math.round(p.y), id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(from) });
  if (hold) await page.waitForTimeout(hold);
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point({ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }) });
    await page.waitForTimeout(16);
  }
  if (dwell) await page.waitForTimeout(dwell);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}
// Writes down, in the page, every change of class on an element and when it happened.
const watchClass = (page, id) => page.evaluate((id) => {
  const el = document.getElementById(id); const seen = (window.__seen ||= {})[id] = [];
  new MutationObserver(() => seen.push({ cls: el.getAttribute('class') || '', t: performance.now() })).observe(el, { attributes: true, attributeFilter: ['class'] });
}, id);
const seenClass = (page, id) => page.evaluate((id) => window.__seen[id], id);
const tenTaps = async (page) => { for (let i = 0; i < 10; i++) await page.locator('#glass').click(); };
// Machine motion that is running right now: CSS animations on the machine, its parts and the coin.
const running = (page) => page.evaluate(() => document.getAnimations()
  .filter((a) => a.playState === 'running' && a.effect?.target?.closest?.('#machine, #coin'))
  .map((a) => a.animationName || a.transitionProperty));
const nothingPulled = async (page) => {
  await expect(modal(page)).toBeHidden();
  const w = await wallet(page);
  expect(w.requests).toEqual([]);
  expect(w.sent).toEqual([]);
};

/* ---------- the art ---------- */

test('p. the padlock is gone, and the coin shows a cent sign drawn as paths, at rest and dimmed', async ({ page, problems, who }) => {
  await openMachine(page);
  await expectPulled(page, 0);
  await expect(page.locator('#machine .m-lock')).toHaveCount(0);
  await expect(page.locator('#coin .c-cent path')).not.toHaveCount(0);
  // No letters anywhere on the coin: the mark is geometry, so it is as crisp at 64 pixels as at 88.
  await expect(page.locator('#coin text')).toHaveCount(0);
  expect(await page.locator('#coin').innerText()).toBe('');
  const mark = await page.locator('#coin .c-cent').boundingBox();
  const face = await page.locator('#coin').boundingBox();
  expect(mark.width).toBeGreaterThan(face.width * 0.3);
  expect(mark.height).toBeGreaterThan(face.height * 0.38);
  expect(Math.abs(mark.x + mark.width / 2 - (face.x + face.width / 2))).toBeLessThan(face.width * 0.06);
  // The same coin, dimmed, on a closed machine.
  await send(who.owner, 'setSaleOpen', [false]);
  await page.locator('#retryBtn').dispatchEvent('click');
  await expect(page.locator('#coin')).toHaveClass(/dim/);
  await expect(page.locator('#coin .c-cent path').first()).toBeVisible();
  expect(problems).toEqual([]);
});

test('p. the pile is a little more alive: about a third of it takes turns to hop, on transform only', async ({ page }) => {
  await openMachine(page);
  await expectPulled(page, 0);
  const idle = await page.evaluate(() => document.getAnimations()
    .filter((a) => /^gbidle/.test(a.animationName || ''))
    .map((a) => ({
      name: a.animationName, period: a.effect.getComputedTiming().duration,
      props: [...new Set(a.effect.getKeyframes().flatMap((k) => Object.keys(k)))].filter((k) => !['offset', 'computedOffset', 'easing', 'composite'].includes(k)),
    })));
  expect(idle.length).toBeGreaterThan(25);
  expect(idle.length).toBeLessThan(45);
  expect([...new Set(idle.map((a) => a.period))].sort()).toEqual([5200, 7400]);
  for (const a of idle) expect(a.props).toEqual(['transform']);
  // Subtle: no gumball ever leaves its place by more than a fifth of its width. (Once the pile has tumbled in.)
  await expect.poll(() => page.evaluate(() => document.getAnimations().filter((a) => a.animationName === 'gbfill' || a.transitionProperty).length)).toBe(0);
  const far = await page.evaluate(async () => {
    const els = [...document.querySelectorAll('#gbGrid .gb')]; let worst = 0;
    const off = document.createElement('style'); off.textContent = '.gb{animation:none!important}'; document.head.append(off);
    const rest = els.map((el) => el.getBoundingClientRect());
    off.remove();
    const until = performance.now() + 1500;
    while (performance.now() < until) {
      els.forEach((el, i) => { const r = el.getBoundingClientRect(); worst = Math.max(worst, Math.hypot(r.left + r.width / 2 - rest[i].left - rest[i].width / 2, r.top + r.height / 2 - rest[i].top - rest[i].height / 2) / rest[i].width); });
      await new Promise((r) => requestAnimationFrame(r));
    }
    return worst;
  });
  expect(far).toBeGreaterThan(0.02);
  expect(far).toBeLessThan(0.2);
});

test('p. an idle page costs the main thread nothing: every idle animation is transform or opacity, and styles are not recalculated', async ({ page }) => {
  await openMachine(page);
  await expectPulled(page, 0);
  await expect.poll(() => page.evaluate(() => document.getAnimations().filter((a) => a.animationName === 'gbfill' || a.transitionProperty).length)).toBe(0);
  const idle = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').map((a) => ({
    name: a.animationName,
    props: [...new Set(a.effect.getKeyframes().flatMap((k) => Object.keys(k)))].filter((k) => !['offset', 'computedOffset', 'easing', 'composite'].includes(k)),
  })));
  expect(idle.length).toBeGreaterThan(25);
  for (const a of idle) for (const prop of a.props) expect(['transform', 'opacity'], `${a.name} animates ${prop}`).toContain(prop);
  // The coin still glows and pulses, on a layer of its own.
  expect(idle.map((a) => a.name)).toContain('cglow');
  expect(await page.locator('#coin').evaluate((el) => [getComputedStyle(el).animationName, getComputedStyle(el, '::after').animationName])).toEqual(['none', 'cglow']);
  // No script runs per frame, and the browser is not asked to work out styles or layout again while nothing happens.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const read = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  await page.mouse.move(3, 3);
  await page.waitForTimeout(500);
  const a = await read();
  await page.waitForTimeout(2000);
  const b = await read();
  await cdp.detach();
  expect(b.RecalcStyleCount - a.RecalcStyleCount, 'style recalculations in two idle seconds').toBeLessThan(12);
  expect(b.LayoutCount - a.LayoutCount, 'layouts in two idle seconds').toBeLessThan(6);
});

test('p. the four new sounds, rendered: a short sharp scare of about half a second, all near -6 dBFS and mostly in the band a phone carries', async ({ page }) => {
  const src = readFileSync(new URL('../src/sound.js', import.meta.url), 'utf8');
  await openMachine(page);
  const out = await page.evaluate(async (code) => {
    const m = await import(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
    const SR = 48000; const res = {};
    const render = async (name) => {
      const ctx = new OfflineAudioContext(1, SR * 1.5, SR);
      m.createSound({ context: ctx, storageKey: null }).play(name);
      return (await ctx.startRendering()).getChannelData(0);
    };
    for (const name of ['scare', 'knock', 'flap', 'ratchet']) {
      const x = await render(name); const again = await render(name);
      let peak = 0; let first = -1; let last = -1; let bad = 0; let diff = 0;
      for (let i = 0; i < x.length; i++) { const v = Math.abs(x[i]); if (!Number.isFinite(x[i])) bad += 1; if (v > peak) peak = v; if (v > 0.001) { if (first < 0) first = i; last = i; } diff = Math.max(diff, Math.abs(x[i] - again[i])); }
      // Energy by band, from a plain DFT of every eighth sample pair (enough for three wide bands).
      const N = 8192; const step = Math.max(1, Math.floor((last + 1) / N)); let lo = 0; let mid = 0; let hi = 0;
      const y = Array.from({ length: N }, (_, i) => x[i * step] || 0); const sr = SR / step;
      for (let k = 1; k < N / 2; k += 4) { let re = 0; let im = 0; const w = (2 * Math.PI * k) / N; for (let i = 0; i < N; i++) { re += y[i] * Math.cos(w * i); im -= y[i] * Math.sin(w * i); } const f = (k * sr) / N; const pw = re * re + im * im; if (f < 400) lo += pw; else if (f <= 3000) mid += pw; else hi += pw; }
      res[name] = { db: 20 * Math.log10(peak), ms: ((last - first) / SR) * 1000, bad, diff, mid: mid / (lo + mid + hi), step };
    }
    return res;
  }, src);
  for (const [name, s] of Object.entries(out)) {
    expect(s.bad, `${name} has no broken samples`).toBe(0);
    expect(s.db, `${name} peak`).toBeGreaterThan(-7);
    expect(s.db, `${name} peak`).toBeLessThan(-5);
    expect(s.diff, `${name} is the same every time`).toBeLessThan(1e-4);
  }
  expect(out.scare.ms).toBeGreaterThan(430);
  expect(out.scare.ms).toBeLessThan(560);
  expect(out.knock.ms).toBeLessThan(260);
  expect(out.flap.ms).toBeLessThan(330);
  expect(out.ratchet.ms).toBeLessThan(60);
  for (const name of ['scare', 'knock', 'flap']) expect(out[name].mid, `${name}: share of energy between 400 Hz and 3 kHz`).toBeGreaterThan(0.5);
});

/* ---------- the jump scare ---------- */

test('p. ten taps on the glass: a big face slams against it, holds about a second, drops back, and comes again', async ({ page, problems }) => {
  await listen(page);
  await openMachine(page);
  await expectPulled(page, 0);
  const face = page.locator('#eeFace');
  await watchClass(page, 'machine');
  await watchClass(page, 'eeFace');
  for (let i = 0; i < 9; i++) await page.locator('#glass').click();
  await expect(face).not.toHaveClass(/visible/);
  expect(await count(page, 'scare')).toBe(0);
  await forget(page);
  await page.locator('#glass').click();
  await expect(face).toHaveClass(/visible/);
  await expect(face).toHaveAttribute('data-v', '0');
  // The machine takes the hit. (Read from the page's own record: the jolt is over in half a second.)
  await expect.poll(async () => (await seenClass(page, 'machine')).some((c) => /\bjolt\b/.test(c.cls))).toBe(true);
  expect(await count(page, 'scare')).toBe(1);
  // The tap that brings the face does not also rattle the pile: the face throws it.
  expect(await names(page)).toEqual(['glass', 'scare']);
  // The slam: full size (and a touch over) 120ms in, from almost nothing.
  const slam = await face.evaluate((el) => {
    const a = el.getAnimations().find((x) => x.animationName === 'eeslam');
    const at = (ms) => { a.pause(); a.currentTime = ms; return new DOMMatrix(getComputedStyle(el).transform).a; };
    const sizes = [at(0), at(60), at(120), at(149)];
    a.currentTime = 260; a.play();
    return sizes;
  });
  expect(slam[0]).toBeLessThan(0.15);
  expect(slam[2]).toBeGreaterThan(1.05);
  expect(slam[3]).toBeGreaterThan(0.94);
  // It fills the globe: the drawing is the size of the glass and the head alone covers most of it.
  // (Measured against its own layout box, so the machine's jolt does not come into it.)
  expect(await face.evaluate((el) => el.offsetWidth / el.parentElement.clientWidth)).toBeGreaterThan(0.98);
  await expect.poll(() => face.evaluate((el) => el.getBoundingClientRect().width / document.getElementById('glass').getBoundingClientRect().width)).toBeGreaterThan(0.98);
  const head = await page.evaluate(() => {
    const g = document.getElementById('glass').getBoundingClientRect();
    const eyes = document.querySelector('#eeFace .ee-head').getBoundingClientRect();
    return { w: eyes.width / g.width, h: eyes.height / g.height };
  });
  expect(head.w).toBeGreaterThan(0.7);
  expect(head.h).toBeGreaterThan(0.7);
  // Teeth, eyes, both hands, the crack and the fog are all drawn.
  for (const part of ['.ee-hand', '.ee-crack', '.ee-fog']) await expect(face.locator(part).first()).toBeVisible();
  await expect(face.locator('.ee-hand')).toHaveCount(2);
  // The pile is thrown outward as it lands.
  await expect.poll(() => page.locator('#gbGrid .gb.hop').count()).toBeGreaterThan(30);
  // More taps while it is up do not start another one.
  await page.locator('#glass').click();
  expect(await count(page, 'scare')).toBe(1);
  // Then it drops back into the pile, which rattles, and the hint is back.
  await expect(face).not.toHaveClass(/visible/, { timeout: 3000 });
  await expect(face).toBeHidden();
  await expect(page.locator('#machine')).not.toHaveClass(/jolt/);
  // Held about a second: by the page's own clock the face is up for between 1.3 and 2 seconds, and the jolt
  // is off the machine within 0.6s, so the machine can shake for a coin while the face is still there.
  const faceLog = await seenClass(page, 'eeFace'); const machLog = await seenClass(page, 'machine');
  const up = faceLog.find((c) => /visible/.test(c.cls)).t; const down = faceLog.filter((c) => !/visible/.test(c.cls) && c.t > up)[0].t;
  expect(down - up).toBeGreaterThan(1300);
  expect(down - up).toBeLessThan(2000);
  const joltOn = machLog.find((c) => /\bjolt\b/.test(c.cls)).t; const joltOff = machLog.filter((c) => !/\bjolt\b/.test(c.cls) && c.t > joltOn)[0].t;
  expect(joltOff - joltOn).toBeLessThan(600);
  expect((await names(page)).slice(-1)).toEqual(['rattle']);
  await expect(page.locator('#eeTapHint')).toBeVisible();

  // The drop itself, looked at with the classes put on by hand so nothing races the clock: the face and the hands
  // fall, and the crack stays where it is on the glass and fades.
  const fall = await face.evaluate((el) => {
    el.classList.add('visible', 'drop');
    const parts = [...el.querySelectorAll('.ee-fall')]; const crack = el.querySelector('.ee-crack');
    const fa = parts.map((g) => g.getAnimations().find((x) => x.animationName === 'eedrop')); const ca = crack.getAnimations().find((x) => x.animationName === 'eefade');
    const whole = getComputedStyle(el).transform;
    let out = null;
    if (fa.every(Boolean) && ca) {
      const at = (ms) => { for (const a of [...fa, ca]) { a.pause(); a.currentTime = ms; } return { tops: [...parts, el.querySelector('.ee-hand')].map((g) => g.getBoundingClientRect().top), crack: crack.getBoundingClientRect().top, seen: Number(getComputedStyle(crack).opacity) }; };
      out = [at(0), at(250)];
    }
    el.classList.remove('visible', 'drop');
    return { out, whole, parts: parts.length };
  });
  expect(fall.out, 'the face falls on its own, and the crack fades').not.toBeNull();
  for (let i = 0; i < fall.out[0].tops.length; i++) expect(fall.out[1].tops[i] - fall.out[0].tops[i]).toBeGreaterThan(20);
  expect(Math.abs(fall.out[1].crack - fall.out[0].crack)).toBeLessThan(0.5);
  expect(fall.out[1].seen).toBeLessThan(fall.out[0].seen);
  expect(fall.whole).toBe('none');

  // Again, and again: the three faces take turns, each with its sound.
  for (const [turn, heard] of [['1', 2], ['2', 3], ['0', 4]]) {
    await tenTaps(page);
    await expect(face).toHaveClass(/visible/);
    await expect(face).toHaveAttribute('data-v', turn);
    expect(await count(page, 'scare')).toBe(heard);
    await expect(face).not.toHaveClass(/visible/, { timeout: 3000 });
  }
  // The green one has a third eye and no headband. The pink one sticks its tongue out.
  await face.evaluate((el) => { el.dataset.v = '1'; });
  expect(await face.evaluate((el) => ['.ee-eye3', '.ee-band', '.ee-tongue'].map((s) => getComputedStyle(el.querySelector(s)).display !== 'none'))).toEqual([true, false, false]);
  await face.evaluate((el) => { el.dataset.v = '2'; });
  expect(await face.evaluate((el) => ['.ee-eye3', '.ee-band', '.ee-tongue'].map((s) => getComputedStyle(el.querySelector(s)).display !== 'none'))).toEqual([false, true, true]);
  await nothingPulledWithoutWallet(page);
  expect(problems).toEqual([]);
});
const nothingPulledWithoutWallet = async (page) => { await expect(modal(page)).toBeHidden(); await expect(page.locator('#coin')).not.toHaveClass(/inserted|away/); };

test('p. the glass is a button: the keyboard taps it, and ten presses bring the face', async ({ page }) => {
  await listen(page);
  await openMachine(page);
  await expectPulled(page, 0);
  const glass = page.getByRole('button', { name: 'Tap the glass' });
  await glass.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#glass')).toHaveClass(/rattle/);
  expect(await names(page)).toEqual(['rattle', 'glass']);
  await expect(page.locator('#eeTapHint')).toHaveCSS('opacity', '1');
  for (let i = 0; i < 9; i++) await page.keyboard.press(i % 2 ? 'Enter' : 'Space');
  await expect(page.locator('#eeFace')).toHaveClass(/visible/);
  expect(await count(page, 'scare')).toBe(1);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

/* ---------- the handle, knocks and the flap ---------- */

test('p. the handle: a click gives one ratcheting turn, the pile jiggles and the slot and the coin ask for a coin', async ({ page, problems, who }) => {
  await listen(page);
  await addWallet(page, who.buyer);
  await openMachine(page);
  await expectPulled(page, 0);
  const handle = page.getByRole('button', { name: 'Turn the handle' });
  await handle.click();
  expect(await classOf(page, 'crank')).toContain('ratchet');
  await expect(page.locator('#glass')).toHaveClass(/rattle/);
  await expect(page.locator('#machine')).toHaveClass(/nocoin/);
  await expect(page.locator('#coin')).toHaveClass(/nudge/);
  // The crank sound and the pile. No button click on top, and no coin sound: nothing was put in.
  expect(await names(page)).toEqual(['crank', 'rattle']);
  // The slot really lights up and the handle really goes round.
  expect(await page.locator('#machine .m-slotglow').evaluate((el) => getComputedStyle(el).animationName)).toBe('slotblink');
  const turned = await page.locator('#crank').evaluate((el) => {
    const a = el.getAnimations().find((x) => x.animationName === 'ratchet');
    a.pause(); a.currentTime = 350;
    const m = new DOMMatrix(getComputedStyle(el).transform);
    a.play();
    return Math.abs(Math.atan2(m.b, m.a));
  });
  expect(turned).toBeGreaterThan(1);
  // It ends where it started and the hints go out.
  await expect.poll(() => classOf(page, 'crank')).toBe('m-crank');
  await expect(page.locator('#machine')).not.toHaveClass(/nocoin/);
  await expect(page.locator('#coin')).not.toHaveClass(/nudge/);
  expect(await page.locator('#machine .m-slotglow').evaluate((el) => getComputedStyle(el).opacity)).toBe('0');
  await nothingPulled(page);
  // The coin still does its real job afterwards.
  await page.locator('#coin').click();
  await expect(title(page)).toHaveText('PULL A SPLATZ');
  expect(problems).toEqual([]);
});

test('p. the handle, the lid and the flap work from the keyboard, and each has its own sound', async ({ page, who }) => {
  await listen(page);
  await addWallet(page, who.buyer);
  await openMachine(page);
  await expectPulled(page, 0);
  await page.getByRole('button', { name: 'Turn the handle' }).focus();
  await page.keyboard.press('Enter');
  expect(await classOf(page, 'crank')).toContain('ratchet');
  expect(await names(page)).toEqual(['crank', 'rattle']);
  await expect.poll(() => classOf(page, 'crank')).toBe('m-crank');
  await page.keyboard.press('Space');
  expect(await count(page, 'crank')).toBe(2);
  await forget(page);

  await page.getByRole('button', { name: 'Knock on the machine' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#machine')).toHaveClass(/knock/);
  expect(await names(page)).toEqual(['knock', 'rattle']);
  await forget(page);

  await page.getByRole('button', { name: 'Poke the chute flap' }).focus();
  await page.keyboard.press('Space');
  expect(await page.locator('#machine .m-flap').evaluate((el) => el.getAttribute('class'))).toContain('poke');
  expect(await names(page)).toEqual(['flap']);
  // Every one of them shows where the focus is.
  for (const name of ['Turn the handle', 'Knock on the machine', 'Poke the chute flap', 'Tap the glass']) {
    const b = page.getByRole('button', { name });
    await b.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(b).toBeFocused();
    expect(await b.evaluate((el) => getComputedStyle(el).outlineStyle), name).toBe('solid');
  }
  await nothingPulled(page);
});

test('p. a held key or a burst of clicks is one turn, one knock and one poke at a time', async ({ page, who }) => {
  await listen(page);
  await addWallet(page, who.buyer);
  await openMachine(page);
  await expectPulled(page, 0);
  for (const [name, sound] of [['Turn the handle', 'crank'], ['Knock on the machine', 'knock'], ['Poke the chute flap', 'flap']]) {
    await forget(page);
    await page.getByRole('button', { name }).focus();
    // Enter held down: the browser repeats the key.
    for (let i = 0; i < 12; i++) await page.keyboard.down('Enter');
    await page.keyboard.up('Enter');
    expect(await count(page, sound), `${name}, key held`).toBe(1);
    await page.waitForTimeout(900);
    await forget(page);
    // (Raw clicks: a locator click would politely wait for the wobble to end.)
    const at = await centre(page.getByRole('button', { name }));
    for (let i = 0; i < 6; i++) await page.mouse.click(at.x, at.y);
    expect(await count(page, sound), `${name}, clicked fast`).toBe(1);
    await page.waitForTimeout(900);
    // And it answers again once it has finished.
    await page.getByRole('button', { name }).click();
    expect(await count(page, sound), `${name}, again`).toBe(2);
    await page.waitForTimeout(900);
  }
  await nothingPulled(page);
});

test('p. the handle can be pulled round with the mouse: a tooth clicks every 30 degrees and it never counts as a coin', async ({ page, who }) => {
  await listen(page);
  await addWallet(page, who.buyer);
  await openMachine(page);
  await expectPulled(page, 0);
  const c = await centre(page.locator('#crankBtn'));
  const r = (await page.locator('#crankBtn').boundingBox()).width * 0.33;
  await page.mouse.move(c.x + r, c.y);
  await page.mouse.down();
  for (let a = 10; a <= 200; a += 10) {
    await page.mouse.move(c.x + r * Math.cos((a * Math.PI) / 180), c.y + r * Math.sin((a * Math.PI) / 180));
    await page.waitForTimeout(12);
  }
  // It follows the hand.
  const held = await page.locator('#crank').evaluate((el) => { const m = new DOMMatrix(getComputedStyle(el).transform); return (Math.atan2(m.b, m.a) * 180) / Math.PI; });
  expect(Math.abs(Math.abs(held) - 160)).toBeLessThan(15);
  expect(await count(page, 'ratchet')).toBeGreaterThanOrEqual(5);
  expect(await count(page, 'ratchet')).toBeLessThanOrEqual(7);
  // Pulled back the wrong way it does not move: a ratchet turns one way.
  await page.mouse.move(c.x + r * Math.cos((150 * Math.PI) / 180), c.y + r * Math.sin((150 * Math.PI) / 180));
  expect(await page.locator('#crank').evaluate((el) => el.style.transform)).toMatch(/^rotate\(200(\.0)?deg\)$/);
  await page.mouse.up();
  // More than half a turn asks for a coin too. Letting go is not also a click.
  await expect(page.locator('#machine')).toHaveClass(/nocoin/);
  expect(await count(page, 'crank')).toBe(0);
  await expect.poll(() => page.locator('#crank').evaluate((el) => el.getAttribute('style') || '')).toBe('');
  await expect.poll(() => classOf(page, 'crank')).toBe('m-crank');
  await nothingPulled(page);
});

test('p. a knock on the body or the lid wobbles the machine and rattles the pile, and a poke swings the chute flap', async ({ page, problems, who }) => {
  await listen(page);
  await addWallet(page, who.buyer);
  await openMachine(page);
  await expectPulled(page, 0);
  // On the red body, well clear of the handle and the chute.
  const body = await page.locator('#bodyHit').boundingBox();
  await page.mouse.click(body.x + body.width * 0.12, body.y + body.height * 0.5);
  await expect(page.locator('#machine')).toHaveClass(/knock/);
  await expect(page.locator('#glass')).toHaveClass(/rattle/);
  expect(await names(page)).toEqual(['knock', 'rattle']);
  // A touch, not the big shake a coin gives: the machine never moves more than 3 pixels.
  const moved = await page.locator('#machine').evaluate((el) => {
    const a = el.getAnimations().find((x) => x.animationName === 'mknock');
    a.pause();
    let most = 0;
    for (let t = 0; t <= 340; t += 10) { a.currentTime = t; const m = new DOMMatrix(getComputedStyle(el).transform); most = Math.max(most, Math.hypot(m.e, m.f)); }
    a.play();
    return most;
  });
  expect(moved).toBeGreaterThan(1);
  expect(moved).toBeLessThanOrEqual(3);
  await expect(page.locator('#machine')).not.toHaveClass(/knock/);
  await forget(page);
  await page.locator('#lidHit').click();
  await expect(page.locator('#machine')).toHaveClass(/knock/);
  expect(await names(page)).toEqual(['knock', 'rattle']);
  // The empty space beside the collar is not the machine.
  await forget(page);
  await page.waitForTimeout(400);
  await page.mouse.click(body.x + 2, body.y + 3);
  expect(await names(page)).toEqual([]);

  await page.locator('#flapBtn').click();
  const flap = page.locator('#machine .m-flap');
  expect(await flap.evaluate((el) => el.getAttribute('class'))).toContain('poke');
  expect(await names(page)).toEqual(['flap']);
  const swing = await flap.evaluate((el) => {
    const a = el.getAnimations().find((x) => x.animationName === 'flappoke');
    a.pause(); a.currentTime = 70;
    const d = new DOMMatrix(getComputedStyle(el).transform).d;
    a.play();
    return d;
  });
  expect(swing).toBeLessThan(0.5);
  await expect.poll(() => flap.evaluate((el) => el.getAttribute('class'))).toBe('m-flap');
  await nothingPulled(page);
  expect(problems).toEqual([]);
});

test('p. a tap on the glass: the gumballs nearest the finger hop away from it, further than the pile jiggles', async ({ page }) => {
  await listen(page);
  await openMachine(page);
  await expectPulled(page, 0);
  const glass = await page.locator('#glass').boundingBox();
  const tap = { x: Math.round(glass.x + glass.width * 0.38), y: Math.round(glass.y + glass.height * 0.6) };
  await page.mouse.click(tap.x, tap.y);
  expect(await names(page)).toEqual(['rattle', 'glass']);
  const seen = await page.evaluate(({ x, y }) => {
    // Every gumball's own animation, stopped at its furthest point.
    const peak = (el, name, ms) => {
      const a = el.getAnimations().find((k) => k.animationName === name);
      if (!a) return null;
      a.pause(); a.currentTime = ms;
      const m = new DOMMatrix(getComputedStyle(el).transform);
      return { dx: m.e, dy: m.f };
    };
    return [...document.querySelectorAll('#gbGrid .gb')].map((el) => {
      const hop = el.classList.contains('hop');
      const w = el.offsetWidth;
      // Against the glass, which holds still. The pile may still be tumbling in.
      const g = document.getElementById('glass').getBoundingClientRect();
      const cx = g.left + el.offsetLeft; const cy = g.top + el.offsetTop;
      const p = hop ? peak(el, 'gbhop', 130) : peak(el, 'gbr', el.getAnimations().find((k) => k.animationName === 'gbr')?.effect.getComputedTiming().duration * 0.25 + (el.getAnimations().find((k) => k.animationName === 'gbr')?.effect.getComputedTiming().delay || 0));
      return { hop, w, from: Math.hypot(cx - x, cy - y), ax: cx - x, ay: cy - y, ...(p || { dx: 0, dy: 0 }) };
    });
  }, tap);
  const hopped = seen.filter((b) => b.hop); const rest = seen.filter((b) => !b.hop);
  expect(hopped.length).toBeGreaterThan(8);
  expect(hopped.length).toBeLessThan(60);
  expect(rest.length).toBeGreaterThan(30);
  // Only the near ones, and every one of them moves away from the finger.
  expect(Math.max(...hopped.map((b) => b.from))).toBeLessThan(Math.min(...rest.map((b) => b.from)) + 3);
  for (const b of hopped.filter((k) => k.from > k.w * 0.3 && Math.hypot(k.dx, k.dy) > 1)) expect(b.dx * b.ax + b.dy * b.ay, 'hops away from the tap').toBeGreaterThan(0);
  // The nearest go furthest, and further than anything in the plain rattle.
  const reach = (b) => Math.hypot(b.dx, b.dy) / b.w;
  const near = hopped.sort((p, q) => p.from - q.from).slice(0, 5).map(reach);
  const jiggle = Math.max(...rest.map(reach));
  expect(jiggle).toBeGreaterThan(0.1);
  expect(Math.min(...near)).toBeGreaterThan(jiggle * 1.5);
  expect(Math.max(...near)).toBeLessThanOrEqual(0.95);
  // And they all settle back.
  await expect(page.locator('#gbGrid .gb.hop')).toHaveCount(0);
});

/* ---------- the coin, carried to the slot ---------- */

test('p. the coin can be carried to the slot: the slot lights up, the drop starts exactly one pull', async ({ page, problems, who }) => {
  await listen(page);
  await addWallet(page, who.buyer);
  await openMachine(page);
  await expectPulled(page, 0);
  const slot = await slotOf(page);
  const rest = await page.locator('#coin').boundingBox();
  // Held far from the slot: picked up, heard once, slot dark.
  await carryCoin(page, { x: slot.x + 150, y: slot.y - 40 });
  await expect(page.locator('#coin')).toHaveClass(/held/);
  await expect(page.locator('#machine')).not.toHaveClass(/slot-near/);
  expect(await names(page)).toEqual(['coinPick']);
  const held = await page.locator('#coin').boundingBox();
  expect(Math.abs(held.x + held.width / 2 - (slot.x + 150))).toBeLessThan(12);
  // Near the slot: it lights up, and the coin shrinks to the size that fits.
  await page.mouse.move(slot.x + 4, slot.y + 6, { steps: 6 });
  await expect(page.locator('#machine')).toHaveClass(/slot-near/);
  await expect(page.locator('#coin')).toHaveClass(/aim/);
  expect(await page.locator('#machine .m-slotglow').evaluate((el) => Number(getComputedStyle(el).opacity))).toBeGreaterThan(0.4);
  expect(await page.locator('#machine .m-slotlit').evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
  await nothingPulled(page);
  // Let go: in it goes, from the hand.
  await page.mouse.up();
  await expect(page.locator('#coin')).toHaveClass(/inserted/);
  await expect(page.locator('#coin')).toHaveClass(/dropin/);
  await expect(page.locator('#machine')).not.toHaveClass(/slot-near/);
  await expect(title(page)).toHaveText('PULL A SPLATZ');
  // One pick up (when it was lifted), one coin in the slot.
  expect((await names(page)).filter((n) => n !== 'rattle')).toEqual(['coinPick', 'coinDrop']);
  // The rest is the pull everybody gets.
  await button(page, 'CONNECT WALLET').click();
  await modal(page).getByRole('button', { name: 'Mock Wallet' }).click();
  await expect(title(page)).toHaveText('APPROVE IN WALLET');
  await button(page, 'DROP THE COIN').click();
  await readPeel(page);
  await expectPulled(page, 1);
  expect((await wallet(page)).sent).toHaveLength(1);
  expect(await count(page, 'coinDrop')).toBe(1);
  await button(page, 'Close').click();
  await expect(modal(page)).toBeHidden();
  // The coin is back exactly where it lives, with nothing left over from the carry.
  await expect(page.locator('#coin')).toHaveAttribute('class', 'coin');
  expect(await page.locator('#coin').evaluate((el) => [el.style.getPropertyValue('--dx'), el.style.getPropertyValue('--dy')])).toEqual(['', '']);
  await page.mouse.move(5, 5);
  await expect.poll(async () => { const b = await page.locator('#coin').boundingBox(); return Math.abs(b.x - rest.x) + Math.abs(b.y - rest.y); }).toBeLessThan(1);
  await page.waitForTimeout(500);
  expect((await wallet(page)).sent).toHaveLength(1);
  expect(problems).toEqual([]);
});

test('p. a coin let go anywhere else comes home and nothing is pulled. A plain click still works exactly as before', async ({ page, problems, who }) => {
  await listen(page);
  await addWallet(page, who.buyer);
  await openMachine(page);
  await expectPulled(page, 0);
  const slot = await slotOf(page);
  const rest = await page.locator('#coin').boundingBox();
  // Over the glass, over the chute, and off to the side.
  for (const to of [{ x: slot.x, y: slot.y - 150 }, { x: slot.x, y: slot.y + 115 }, { x: slot.x + 260, y: slot.y }]) {
    await carryCoin(page, to);
    await expect(page.locator('#coin')).toHaveClass(/held/);
    await expect(page.locator('#machine')).not.toHaveClass(/slot-near/);
    await page.mouse.up();
    await expect(page.locator('#coin')).not.toHaveClass(/held|inserted/);
    await page.mouse.move(5, 5);
    await expect.poll(async () => { const b = await page.locator('#coin').boundingBox(); return Math.abs(b.x - rest.x) + Math.abs(b.y - rest.y); }).toBeLessThan(1);
    await expect(page.locator('#coin')).toHaveAttribute('class', 'coin');
  }
  await page.waitForTimeout(900);
  await nothingPulled(page);
  expect(await names(page)).toEqual(['coinPick', 'coinPick', 'coinPick']);
  // Pressed on the coin, slid a little way off it and let go: not a click on the coin either.
  await page.mouse.move(rest.x + rest.width / 2, rest.y + rest.height - 3);
  await page.mouse.down();
  await page.mouse.move(rest.x + rest.width / 2, rest.y + rest.height + 4);
  await page.mouse.up();
  await page.waitForTimeout(300);
  await nothingPulled(page);
  await forget(page);

  // A click with a wobble is a click, however sloppy, as long as it never leaves the coin: the coin flies from its
  // resting spot as it always did, with the same sounds.
  for (const [dx, dy] of [[3, 2], [9, 0], [0, 14], [20, -12]]) {
    await page.mouse.move(rest.x + rest.width / 2, rest.y + rest.height / 2);
    await page.mouse.down();
    await page.mouse.move(rest.x + rest.width / 2 + dx, rest.y + rest.height / 2 + dy, { steps: 3 });
    await page.mouse.up();
    await expect(page.locator('#coin'), `a click that moved ${dx},${dy}`).toHaveClass(/inserted/);
    await expect(page.locator('#coin')).not.toHaveClass(/dropin|held/);
    expect(await page.locator('#coin').evaluate((el) => getComputedStyle(el).animationName)).toBe('cinsert');
    await expect(modal(page)).toBeVisible();
    await expect(title(page)).toHaveText('PULL A SPLATZ');
    expect(await names(page)).toEqual(['coinPick', 'coinDrop', 'rattle']);
    await page.keyboard.press('Escape');
    await expect(modal(page)).toBeHidden();
    await expect(page.locator('#coin')).toHaveAttribute('class', 'coin');
    await forget(page);
  }
  // And from the keyboard.
  await page.locator('#coin').focus();
  await page.keyboard.press('Enter');
  await expect(modal(page)).toBeVisible();
  await expect(title(page)).toHaveText('PULL A SPLATZ');
  expect(await names(page)).toEqual(['coinPick', 'coinDrop', 'rattle']);
  expect((await wallet(page)).sent).toEqual([]);
  expect(problems).toEqual([]);
});

test('p. the handle is not the slot, Escape puts a carried coin back, and a coin that loses its pointer comes home', async ({ page, problems, who }) => {
  await listen(page);
  await addWallet(page, who.buyer);
  await openMachine(page);
  await expectPulled(page, 0);
  const rest = await page.locator('#coin').boundingBox();
  const atHome = () => expect.poll(async () => { const b = await page.locator('#coin').boundingBox(); return Math.abs(b.x - rest.x) + Math.abs(b.y - rest.y); }).toBeLessThan(1);
  // Let go on the handle, right under the slot: that is not in the slot.
  const handle = await centre(page.locator('#crankBtn'));
  await carryCoin(page, handle);
  await expect(page.locator('#coin')).toHaveClass(/held/);
  await expect(page.locator('#machine')).not.toHaveClass(/slot-near/);
  await page.mouse.up();
  await page.mouse.move(5, 5);
  await atHome();
  await page.waitForTimeout(900);
  await nothingPulled(page);
  // Nor did letting go there turn the handle.
  expect(await names(page)).toEqual(['coinPick']);

  // Escape while the coin is over the slot: it goes home, and letting go afterwards drops nothing.
  await carryCoin(page, await slotOf(page));
  await expect(page.locator('#machine')).toHaveClass(/slot-near/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#coin')).not.toHaveClass(/held|aim/);
  await expect(page.locator('#machine')).not.toHaveClass(/slot-near/);
  await page.mouse.up();
  await page.mouse.move(5, 5);
  await atHome();
  await page.waitForTimeout(900);
  await nothingPulled(page);

  // The coin loses its hold on the pointer mid carry: it comes home by itself and still works.
  await carryCoin(page, { x: handle.x + 170, y: handle.y - 60 });
  await expect(page.locator('#coin')).toHaveClass(/held/);
  await page.evaluate(() => { const c = document.getElementById('coin'); for (let id = 0; id < 4; id++) if (c.hasPointerCapture(id)) c.releasePointerCapture(id); });
  await page.mouse.move(handle.x + 180, handle.y - 60);
  await expect(page.locator('#coin')).not.toHaveClass(/held/);
  await page.mouse.up();
  await page.mouse.move(5, 5);
  await atHome();
  await expect(page.locator('#coin')).toHaveAttribute('class', 'coin');
  await page.waitForTimeout(400);
  await nothingPulled(page);

  // The page is scrolled with the wheel while the coin is in the hand: the coin stays under the pointer.
  const to = { x: handle.x + 170, y: handle.y - 60 };
  await carryCoin(page, to);
  await page.mouse.wheel(0, 120);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(60);
  await expect.poll(async () => { const c = await centre(page.locator('#coin')); return Math.hypot(c.x - to.x, c.y - to.y); }).toBeLessThan(14);
  await page.mouse.up();
  await expect(page.locator('#coin')).not.toHaveClass(/held/);
  await page.waitForTimeout(600);
  await nothingPulled(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await forget(page);
  await page.locator('#coin').click();
  await expect(title(page)).toHaveText('PULL A SPLATZ');
  expect(await names(page)).toEqual(['coinPick', 'coinDrop', 'rattle']);
  expect(problems).toEqual([]);
});

test('p. a coin dropped while the face is up still shakes the machine', async ({ page, who }) => {
  await listen(page);
  await addWallet(page, who.buyer);
  await openMachine(page);
  await expectPulled(page, 0);
  await page.evaluate(() => {
    const m = document.getElementById('machine'); window.__shakes = [];
    new MutationObserver(() => { if (m.classList.contains('shake')) window.__shakes.push({ cls: m.className, name: getComputedStyle(m).animationName }); }).observe(m, { attributes: true, attributeFilter: ['class'] });
  });
  await tenTaps(page);
  await expect(page.locator('#eeFace')).toHaveClass(/visible/);
  await page.locator('#coin').click();
  await expect(title(page)).toHaveText('PULL A SPLATZ');
  // The face was still up when the coin went in.
  const shakes = await page.evaluate(() => window.__shakes);
  expect(shakes.length).toBeGreaterThan(0);
  for (const s of shakes) expect(s.name, s.cls).toBe('mshake');
});

/* ---------- when free play waits ---------- */

test('p. while a pull is in flight the handle, the knocks, the flap and a carried coin all wait, and one pull lands', async ({ page, problems, who }) => {
  await listen(page);
  await addWallet(page, who.buyer, { holdTx: true });
  await openMachine(page);
  await expectPulled(page, 0);
  // The coin is in the air: the handle is not for playing with.
  for (let i = 0; i < 9; i++) await page.locator('#glass').click();
  await forget(page);
  await page.locator('#coin').click();
  await page.locator('#crankBtn').click({ force: true });
  await page.locator('#lidHit').click({ force: true });
  // Nor does a tenth tap on the glass bring the face while the coin is in the air.
  await page.locator('#glass').click({ force: true });
  expect((await names(page)).filter((n) => n !== 'rattle')).toEqual(['coinPick', 'coinDrop', 'glass']);
  await expect(page.locator('#eeFace')).not.toHaveClass(/visible/);
  expect(await classOf(page, 'crank')).toBe('m-crank');
  await expect(title(page)).toHaveText('PULL A SPLATZ');
  await button(page, 'CONNECT WALLET').click();
  await modal(page).getByRole('button', { name: 'Mock Wallet' }).click();
  await expect(title(page)).toHaveText('APPROVE IN WALLET');
  await button(page, 'DROP THE COIN').click();
  await expect(title(page)).toHaveText('THE MACHINE IS CRANKING');
  await page.keyboard.press('Escape');
  await expect(modal(page)).toBeHidden();
  await expect(page.locator('#crank')).toHaveClass(/spin/);
  // The crank sound stops with the view.
  await expect.poll(() => names(page)).toContain('crankLoop:stop');
  await forget(page);

  await page.locator('#crankBtn').click();
  await page.locator('#flapBtn').click();
  await page.locator('#lidHit').click();
  const body = await page.locator('#bodyHit').boundingBox();
  await page.mouse.click(body.x + body.width * 0.12, body.y + body.height * 0.5);
  // Pulling the handle round does nothing either: it is busy turning.
  const c = await centre(page.locator('#crankBtn'));
  await page.mouse.move(c.x + 25, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x, c.y + 25, { steps: 4 });
  await page.mouse.move(c.x - 25, c.y, { steps: 4 });
  await page.mouse.up();
  expect(await classOf(page, 'crank')).toBe('m-crank spin');
  expect(await page.locator('#crank').evaluate((el) => el.getAttribute('style') || '')).toBe('');
  expect(await classOf(page, 'machine')).toBe('mach');
  expect(await page.locator('#machine .m-flap').evaluate((el) => el.getAttribute('class'))).toBe('m-flap');
  // A coin carried to the slot is not a second coin.
  await carryCoin(page, await slotOf(page));
  await expect(page.locator('#coin')).not.toHaveClass(/held/);
  await expect(page.locator('#machine')).not.toHaveClass(/slot-near/);
  await page.mouse.up();
  await page.waitForTimeout(400);
  await expect(modal(page)).toBeHidden();
  await expect(page.locator('#coin')).toHaveAttribute('class', 'coin');
  expect(await names(page)).toEqual([]);
  // The glass is harmless, so it still answers. The jump scare waits: nothing jolts the machine during a pull.
  await page.locator('#glass').click();
  expect(await names(page)).toEqual(['rattle', 'glass']);
  for (let i = 0; i < 12; i++) await page.locator('#glass').click();
  expect(await count(page, 'scare')).toBe(0);
  expect(await count(page, 'glass')).toBe(13);
  await expect(page.locator('#eeFace')).not.toHaveClass(/visible/);
  expect(await classOf(page, 'machine')).toBe('mach');
  expect((await wallet(page)).sent).toEqual([]);

  // The wallet answers: exactly one pull lands, and free play is back when The Peel is closed.
  await page.evaluate(() => { window.__mockWallet.holdTx = false; });
  await readPeel(page);
  await expectPulled(page, 1);
  expect((await wallet(page)).sent).toHaveLength(1);
  await button(page, 'Close').click();
  await expect(modal(page)).toBeHidden();
  await forget(page);
  await page.locator('#crankBtn').click();
  expect(await names(page)).toEqual(['crank', 'rattle']);
  expect(problems).toEqual([]);
});

test('p. a closed machine can be played with but asks for no coin, and a coin dropped in it is turned away', async ({ page, who }) => {
  await send(who.owner, 'setSaleOpen', [false]);
  await listen(page);
  await addWallet(page, who.buyer);
  await openMachine(page);
  await expect(page.locator('#machine')).toHaveClass(/closed/);
  await page.locator('#crankBtn').click();
  await page.locator('#flapBtn').click();
  await page.locator('#lidHit').click();
  expect(await names(page)).toEqual(['crank', 'rattle', 'flap', 'knock', 'rattle']);
  // No "needs a coin": this machine is not taking any.
  await expect(page.locator('#machine')).not.toHaveClass(/nocoin/);
  await expect(page.locator('#coin')).not.toHaveClass(/nudge/);
  // The glass answers, but no face comes up behind the CLOSED sign, which would hide it.
  await tenTaps(page);
  await page.locator('#glass').click();
  expect(await count(page, 'glass')).toBe(11);
  expect(await count(page, 'scare')).toBe(0);
  await expect(page.locator('#eeFace')).not.toHaveClass(/visible/);
  await page.waitForTimeout(800);
  await forget(page);
  // Carrying the dim coin to the slot does what a tap on it does: the machine says it is closed.
  await carryCoin(page, await slotOf(page));
  await page.mouse.up();
  await expect(title(page)).toHaveText('CLOSED FOR NOW');
  expect((await names(page)).filter((n) => n !== 'rattle')).toEqual(['coinPick', 'coinDrop', 'jam']);
  const w = await wallet(page);
  expect(w.requests).toEqual([]);
});

test('p. the chain cannot be reached: the machine can still be played with and the coin stays put', async ({ page }) => {
  await listen(page);
  await page.route(`${RPC_URL}/**`, (route) => route.abort());
  await openMachine(page);
  await expect(page.locator('#notice')).toBeVisible();
  await expect(page.locator('#coin')).toHaveClass(/dim/);
  await page.locator('#crankBtn').click();
  // The glass is empty, so there is no pile to hear, and no coin to ask for.
  expect(await names(page)).toEqual(['crank']);
  await expect(page.locator('#machine')).not.toHaveClass(/nocoin/);
  await page.locator('#flapBtn').click();
  await page.locator('#lidHit').click();
  expect(await names(page)).toEqual(['crank', 'flap', 'knock']);
  // The coin cannot be carried, and trying is not a click on it.
  await forget(page);
  await carryCoin(page, await slotOf(page));
  await expect(page.locator('#coin')).not.toHaveClass(/held/);
  await page.mouse.up();
  await page.waitForTimeout(300);
  await expect(modal(page)).toBeHidden();
  expect(await names(page)).toEqual([]);
  await expect(page.locator('#coin')).toHaveAttribute('class', 'coin dim');
});

test('p. a sold out machine can be played with, and nothing in it starts a pull', async ({ page, who }) => {
  test.setTimeout(120_000);
  for (let i = 0; i < 100; i++) await pullDirect(who.crowd);
  await listen(page);
  await addWallet(page, who.buyer);
  await openMachine(page);
  await expectPulled(page, 100);
  await expect(page.locator('#soldStamp')).toBeVisible();
  await expect(page.locator('#coin')).toBeHidden();
  await page.locator('#crankBtn').click();
  await page.locator('#flapBtn').click();
  await page.locator('#lidHit').click();
  await page.locator('#glass').click();
  expect(await names(page)).toEqual(['crank', 'flap', 'knock', 'glass']);
  await expect(page.locator('#machine')).not.toHaveClass(/nocoin/);
  // The glass is empty and the SOLD OUT stamp is across it: no face comes up behind the stamp.
  for (let i = 0; i < 11; i++) await page.locator('#glass').click();
  expect(await count(page, 'glass')).toBe(12);
  expect(await count(page, 'scare')).toBe(0);
  await expect(page.locator('#eeFace')).not.toHaveClass(/visible/);
  await page.waitForTimeout(600);
  await nothingPulled(page);
});

test('p. the preview build allows all of it, and a carried coin gets the same "opens soon" a tap does', async ({ page, problems }) => {
  await listen(page);
  await openMachine(page, PREVIEW_URL);
  await expect(page.locator('#gbGrid .gb')).toHaveCount(100);
  await page.locator('#crankBtn').click();
  await expect(page.locator('#machine')).toHaveClass(/nocoin/);
  await expect(page.locator('#coin')).toHaveClass(/nudge/);
  await page.locator('#flapBtn').click();
  await page.locator('#lidHit').click();
  await page.locator('#glass').click();
  expect(await names(page)).toEqual(['crank', 'rattle', 'flap', 'knock', 'rattle', 'rattle', 'glass']);
  await expect(page.locator('#gbGrid .gb.hop').first()).toBeVisible();
  await tenTaps(page);
  await expect(page.locator('#eeFace')).toHaveClass(/visible/);
  await expect(page.locator('#eeFace')).not.toHaveClass(/visible/, { timeout: 3000 });
  await page.waitForTimeout(700);
  await forget(page);
  await carryCoin(page, await slotOf(page));
  await expect(page.locator('#machine')).toHaveClass(/slot-near/);
  await page.mouse.up();
  await expect(title(page)).toHaveText('THE MACHINE OPENS SOON');
  // Nothing is pulled in the preview, so there is no slot sound, as with a tap.
  expect(await names(page)).toEqual(['coinPick']);
  await page.keyboard.press('Escape');
  await expect(page.locator('#coin')).toHaveAttribute('class', 'coin');
  expect(problems).toEqual([]);
});

/* ---------- reduced motion ---------- */

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('p. nothing moves: the face is simply there, the pile holds still, and free play answers with sound and light', async ({ page, problems, who }) => {
    await listen(page);
    await addWallet(page, who.buyer);
    await openMachine(page);
    await expectPulled(page, 0);
    // No idle life at all.
    expect(await running(page)).toEqual([]);
    expect(await page.locator('#gbGrid .gb').evaluateAll((els) => [...new Set(els.map((el) => getComputedStyle(el).animationName))])).toEqual(['none']);

    // The handle: heard, the slot lights up without blinking, nothing animates and the pile is not heard.
    await page.locator('#crankBtn').click();
    expect(await names(page)).toEqual(['crank']);
    await expect(page.locator('#machine')).toHaveClass(/nocoin/);
    expect(await page.locator('#machine .m-slotglow').evaluate((el) => [getComputedStyle(el).opacity, getComputedStyle(el).animationName])).toEqual(['1', 'none']);
    expect(await running(page)).toEqual([]);
    await expect(page.locator('#machine')).not.toHaveClass(/nocoin/);
    await page.locator('#lidHit').click();
    await page.locator('#flapBtn').click();
    expect(await names(page)).toEqual(['crank', 'knock', 'flap']);
    expect(await page.locator('#machine').evaluate((el) => getComputedStyle(el).transform)).toBe('none');
    expect(await running(page)).toEqual([]);

    // The glass: no hop, no rattle.
    await forget(page);
    await page.locator('#glass').click();
    expect(await names(page)).toEqual(['glass']);
    await expect(page.locator('#gbGrid .gb.hop')).toHaveCount(0);

    // The jump scare appears without the slam or the jolt, with its sound, and goes again.
    for (let i = 0; i < 9; i++) await page.locator('#glass').click();
    const face = page.locator('#eeFace');
    await expect(face).toHaveClass(/visible/);
    await expect(face).toBeVisible();
    expect(await count(page, 'scare')).toBe(1);
    await expect(page.locator('#machine')).not.toHaveClass(/jolt/);
    expect(await face.evaluate((el) => [getComputedStyle(el).animationName, getComputedStyle(el).transform])).toEqual(['none', 'none']);
    expect(await face.locator('.ee-hand').first().evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
    expect(await running(page)).toEqual([]);
    await expect(page.locator('#gbGrid .gb.hop')).toHaveCount(0);
    await expect(face).not.toHaveClass(/visible/, { timeout: 3000 });
    await expect(face).toBeHidden();
    await tenTaps(page);
    await expect(face).toHaveClass(/visible/);
    await expect(face).toHaveAttribute('data-v', '1');
    await expect(face).not.toHaveClass(/visible/, { timeout: 3000 });

    // The coin can still be carried: it follows the hand, and the drop starts one pull with no flight.
    await forget(page);
    await carryCoin(page, await slotOf(page));
    await expect(page.locator('#machine')).toHaveClass(/slot-near/);
    await page.mouse.up();
    await expect(title(page)).toHaveText('PULL A SPLATZ');
    await expect(page.locator('#coin')).toHaveCSS('opacity', '0');
    expect(await names(page)).toEqual(['coinPick', 'coinDrop']);
    expect(await running(page)).toEqual([]);
    expect((await wallet(page)).sent).toEqual([]);
    expect(problems).toEqual([]);
  });
});

/* ---------- a phone ---------- */

test.describe('on a phone, 375 by 812, by touch', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

  test('p. a swipe that starts on the machine scrolls the page, taps play, and a tap on the coin is still a coin', async ({ page, problems, who }) => {
    await listen(page);
    await addWallet(page, who.buyer);
    await openMachine(page);
    await expectPulled(page, 0);
    const y = () => page.evaluate(() => window.scrollY);
    // Starting on the handle, the body, the lid, the flap and the glass: every one lets the page scroll.
    for (const id of ['crankBtn', 'bodyHit', 'lidHit', 'flapBtn', 'glass']) {
      await page.evaluate(() => window.scrollTo(0, 0));
      const from = await centre(page.locator(`#${id}`));
      if (id === 'bodyHit') from.x -= 90;
      await swipe(page, from, { x: from.x, y: from.y - 220 });
      await expect.poll(y, `a swipe from #${id} scrolls`).toBeGreaterThan(100);
    }
    // A swipe is not a tap: nothing was played with on the way.
    expect(await names(page)).toEqual([]);
    expect(await classOf(page, 'crank')).toBe('m-crank');
    // Nothing on the page keeps the finger for itself, the coin included (see the next test).
    for (const id of ['crankBtn', 'bodyHit', 'lidHit', 'flapBtn', 'glass', 'machine', 'coin']) expect(await page.locator(`#${id}`).evaluate((el) => getComputedStyle(el).touchAction), id).not.toBe('none');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);

    // Taps.
    await page.locator('#crankBtn').tap();
    expect(await classOf(page, 'crank')).toContain('ratchet');
    await page.locator('#flapBtn').tap();
    await page.locator('#lidHit').tap();
    await page.locator('#glass').tap();
    expect(await names(page)).toEqual(['crank', 'rattle', 'flap', 'knock', 'rattle', 'rattle', 'glass']);
    await expect(page.locator('#gbGrid .gb.hop').first()).toBeVisible();
    // Every one of them is big enough for a thumb.
    for (const id of ['crankBtn', 'flapBtn', 'lidHit']) {
      const b = await page.locator(`#${id}`).boundingBox();
      expect(b.width, id).toBeGreaterThanOrEqual(44);
      expect(b.height, id).toBeGreaterThanOrEqual(36);
    }
    await nothingPulled(page);
    await page.waitForTimeout(800);
    await forget(page);
    await page.locator('#coin').tap();
    await expect(page.locator('#coin')).toHaveClass(/inserted/);
    await expect(page.locator('#coin')).not.toHaveClass(/dropin/);
    await expect(title(page)).toHaveText('PULL A SPLATZ');
    expect(await names(page)).toEqual(['coinPick', 'coinDrop', 'rattle']);
    expect(problems).toEqual([]);
  });

  test('p. a swipe that starts on the coin scrolls the page and drops no coin, however far it goes', async ({ page, problems, who }) => {
    await listen(page);
    await addWallet(page, who.buyer);
    await openMachine(page);
    await expectPulled(page, 0);
    await page.evaluate(() => { window.__shown = 0; const sm = HTMLDialogElement.prototype.showModal; HTMLDialogElement.prototype.showModal = function show(...a) { window.__shown += 1; return sm.apply(this, a); }; });
    const coin = await centre(page.locator('#coin')); const box = await page.locator('#coin').boundingBox();
    // The slot is straight above the coin, so a thumb swiping up to scroll passes right over it. Swipes that
    // end short of the slot, on it and past it, quick and slow, and one that starts at the very top of the coin.
    const tries = [100, 150, 180, 200, 220, 260, 320].map((d) => [coin, d, 10]);
    tries.push([{ x: coin.x, y: box.y + 5 }, 200, 10], [coin, 200, 4], [coin, 200, 24]);
    for (const [from, d, steps] of tries) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(120);
      await swipe(page, from, { x: from.x, y: from.y - d }, steps);
      await expect.poll(() => page.evaluate(() => window.scrollY), `a ${d}px swipe from the coin scrolls`).toBeGreaterThan(d * 0.4);
      await expect(page.locator('#coin')).not.toHaveClass(/held|inserted/);
    }
    await page.waitForTimeout(900);
    expect(await page.evaluate(() => window.__shown)).toBe(0);
    await nothingPulled(page);
    expect(await names(page)).toEqual([]);
    await expect(page.locator('#coin')).toHaveAttribute('class', 'coin');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);

    // A tap with a wobbly thumb is still a tap: one coin, flying from its resting spot.
    for (const to of [{ x: coin.x + 12, y: coin.y }, { x: coin.x - 6, y: coin.y + 9 }]) {
      await forget(page);
      await swipe(page, coin, to, 2);
      await expect(page.locator('#coin'), 'a wobbly tap').toHaveClass(/inserted/);
      await expect(page.locator('#coin')).not.toHaveClass(/dropin/);
      await expect(modal(page)).toBeVisible();
      await expect(title(page)).toHaveText('PULL A SPLATZ');
      expect(await names(page)).toEqual(['coinPick', 'coinDrop', 'rattle']);
      await page.keyboard.press('Escape');
      await expect(modal(page)).toBeHidden();
      await expect(page.locator('#coin')).toHaveAttribute('class', 'coin');
    }
    // So is a slow press that never leaves the coin, though the coin lifts under the thumb meanwhile.
    await forget(page);
    await swipe(page, coin, { x: coin.x + 5, y: coin.y - 4 }, 2, { hold: 260 });
    await expect(modal(page)).toBeVisible();
    await expect(title(page)).toHaveText('PULL A SPLATZ');
    expect(await names(page)).toEqual(['coinPick', 'coinDrop', 'rattle']);
    expect(await page.evaluate(() => window.__shown)).toBe(3);
    expect((await wallet(page)).sent).toEqual([]);
    expect(problems).toEqual([]);
  });

  test('p. a finger that rests on the coin picks it up: the page holds still, a miss comes home, a drop on the slot pulls once', async ({ page, problems, who }) => {
    await listen(page);
    await addWallet(page, who.buyer);
    await openMachine(page);
    await expectPulled(page, 0);
    const coin = await centre(page.locator('#coin'));
    // The coin lifts under a resting finger.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: Math.round(coin.x), y: Math.round(coin.y), id: 1 }] });
    await expect(page.locator('#coin')).toHaveClass(/held/);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await cdp.detach();
    await expect(page.locator('#coin')).toHaveAttribute('class', 'coin');
    await page.waitForTimeout(400);
    await nothingPulled(page);
    // Up and off to the side: carried, not scrolled, and no pull.
    await swipe(page, coin, { x: coin.x + 120, y: coin.y - 260 }, 10, { hold: 300, dwell: 200 });
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await expect(page.locator('#coin')).toHaveAttribute('class', 'coin');
    await page.waitForTimeout(700);
    await nothingPulled(page);
    expect(await names(page)).toEqual(['coinPick']);
    // Carried over the slot and let go without stopping there: a throw past the slot is not a coin in it.
    await swipe(page, coin, await slotOf(page), 6, { hold: 300 });
    await expect(page.locator('#coin')).toHaveAttribute('class', 'coin');
    await page.waitForTimeout(900);
    await nothingPulled(page);
    await forget(page);
    await swipe(page, coin, { x: coin.x + 120, y: coin.y - 260 }, 10, { hold: 300 });
    await page.waitForTimeout(400);
    // Onto the slot, and held there for a moment.
    await swipe(page, coin, await slotOf(page), 14, { hold: 300, dwell: 250 });
    await expect(page.locator('#coin')).toHaveClass(/inserted/);
    await expect(title(page)).toHaveText('PULL A SPLATZ');
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    expect((await names(page)).filter((n) => n !== 'rattle')).toEqual(['coinPick', 'coinPick', 'coinDrop']);
    await button(page, 'CONNECT WALLET').click();
    await modal(page).getByRole('button', { name: 'Mock Wallet' }).click();
    await button(page, 'DROP THE COIN').click();
    await readPeel(page);
    await expectPulled(page, 1);
    expect((await wallet(page)).sent).toHaveLength(1);
    expect(problems).toEqual([]);
  });
});

/* ---------- every card name on The Peel ---------- */

for (const fonts of ['the page\'s own fonts', 'fallback fonts']) {
  test.describe(`The Peel on the smallest phone, 320 by 568, with ${fonts}`, () => {
    test.use({ viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true });
    test('p. every one of the 100 card names fits: one line, inside the view, with every button still on screen', async ({ page, who }) => {
      if (fonts !== 'fallback fonts') await realFonts(page);
      await addWallet(page, who.buyer);
      await openMachine(page);
      await pullThroughSite(page);
      await page.evaluate(() => document.fonts.ready);
      // The view has stopped popping in.
      await expect.poll(() => page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.target?.closest?.('#modal')).length)).toBe(0);
      if (fonts !== 'fallback fonts') expect(await page.evaluate(() => document.fonts.check('24px Bangers'))).toBe(true);
      // The real view, shown each card in turn.
      const report = await page.evaluate((cards) => {
        const d = document.getElementById('modal'); const m = d.querySelector('.modal'); const body = document.getElementById('modalBody');
        const [num, name, tier] = ['.rnum', '.rname', '.rrar'].map((s) => d.querySelector(s));
        const close = [...body.querySelectorAll('button')].pop();
        const inner = (() => { const r = body.getBoundingClientRect(); const cs = getComputedStyle(body); return { left: r.left + parseFloat(cs.paddingLeft), right: r.right - parseFloat(cs.paddingRight) }; })();
        return cards.map((c) => {
          num.textContent = `#${String(c.id).padStart(3, '0')}`; name.textContent = c.name; tier.textContent = c.rarity;
          const range = document.createRange(); range.selectNodeContents(name);
          const ink = range.getBoundingClientRect(); const lines = new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
          const t = tier.getBoundingClientRect(); const n = num.getBoundingClientRect(); const b = close.getBoundingClientRect();
          return {
            id: c.id, name: c.name, lines,
            past: Math.max(ink.right - inner.right, inner.left - ink.left, t.right - inner.right, inner.left - n.left, name.scrollWidth - name.clientWidth),
            scroll: Math.max(m.scrollHeight - m.clientHeight, m.scrollWidth - m.clientWidth),
            closeBelow: b.bottom - window.innerHeight,
          };
        });
      }, cardsJson.cards);
      expect(report).toHaveLength(100);
      const wrong = report.filter((r) => r.lines !== 1 || r.past > 0.5 || r.scroll > 1 || r.closeBelow > 0);
      expect(wrong, 'card names that do not fit The Peel at 320 by 568').toEqual([]);
    });
  });
}
