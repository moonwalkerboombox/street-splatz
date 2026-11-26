// Rendering and modals. No chain calls in here. main.js hands this file plain data.
import { formatEther } from 'viem';

export const $ = (id) => document.getElementById(id);
export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export const wait = (ms) => new Promise((r) => setTimeout(r, reducedMotion() ? 0 : ms));
export const pad3 = (n) => String(n).padStart(3, '0');
export const eth = (wei) => `${formatEther(wei)} ETH`;

// Tiny element builder. Text always goes in as text, never as HTML.
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  el.append(...kids.flat().filter((k) => k != null && k !== false));
  return el;
}

// Tier colors from the approved mockup. Unknown tiers fall back to grey.
const TIER_COLORS = {
  'Street Legend': 'linear-gradient(135deg,#FFD200,#FF7A00)',
  'Block Hitter': 'linear-gradient(135deg,#B14BFF,#6A1FE0)',
  'Fresh Drop': 'linear-gradient(135deg,#33C2FF,#1A56FF)',
  'Pavement Card': 'linear-gradient(135deg,#9AA0A6,#5F6368)',
};
export const tierColor = (tier) => TIER_COLORS[tier] || TIER_COLORS['Pavement Card'];

// Sound cues. The machine page plugs its player in here (main.js). The admin page does not, so it is silent.
// A cue is asked for at the moment its animation starts, with the delay that animation needs.
let cue = () => {};
export const onCue = (fn) => { cue = fn; };
// For play.js, which has sounds of its own to ask for.
export const playCue = (name, opts) => cue(name, opts);

/* ---------- the machine ---------- */

// The pile behind the glass: one gumball for every card still in The Machine, in that card's flavor color.
const rng = (s) => () => (s = Math.imul(s ^ s >>> 15, 2246822507) ^ Math.imul(s ^ s >>> 13, 3266489909), ((s ^= s >>> 16) >>> 0) / 4294967296);
// Pile slots inside the round glass, in percent of the glass box, bottom row first. About 110 of them.
// The bottom row rests on the collar's top edge (86% down the glass box), so the last few gumballs stay in view.
const SLOTS = (() => {
  const r = rng(7); const out = []; const D = 9.8; const SP = 8.5; const RH = 6.5; const R = 50 - D / 2 + 1;
  for (let y = 80, row = 0; y > 6; y -= RH, row++) {
    const half = Math.sqrt(Math.max(0, R * R - (y - 50) * (y - 50))); const line = [];
    for (let k = -7; k <= 7; k++) {
      const x = (k + (row % 2 ? 0.5 : 0)) * SP;
      if (Math.abs(x) <= half) line.push({ row, x: 50 + x + (r() - 0.5) * 1.6, y: y + (r() - 0.5) * 1.6, d: D * (0.9 + r() * 0.2), k: Math.abs(x) + r() * 18 });
    }
    line.sort((p, q) => p.k - q.k);
    out.push(...line);
  }
  return out;
})();
// The darker side of a gumball. A browser without color-mix gets the plain color, as the CSS does.
const canMix = () => window.CSS?.supports?.('color', 'color-mix(in srgb,red,blue)');
export const gumballShade = (color) => (canMix() ? `color-mix(in srgb,${color} 52%,#3B1F7A)` : color);

// Cards in the order they sit in the pile. Shuffled once, the same way on every visit, so flavors mix.
let pileOrder = null;
function pileOf(cards) {
  if (pileOrder && pileOrder.length === cards.length) return pileOrder;
  const r = rng(99);
  pileOrder = cards.map((c) => [r(), c]).sort((p, q) => p[0] - q[0]).map((p) => p[1]);
  return pileOrder;
}

// cards is every card in cards.json. pulledIds is the set of ids that have left The Machine.
// A pulled card's own gumball is taken out and the ones above it drop down a row to fill the gap.
const balls = new Map(); // card id -> { el, slot }
const seat = []; // slot index -> card id, or undefined for an empty slot
function place(id, slot) {
  const b = balls.get(id); const s = SLOTS[slot];
  b.slot = slot; seat[slot] = id;
  b.el.style.left = `${s.x.toFixed(1)}%`;
  b.el.style.top = `${s.y.toFixed(1)}%`;
  b.el.style.width = `${s.d.toFixed(1)}%`;
  // Higher rows paint over lower ones, as they do in the art. #gbGrid keeps these numbers to itself, so the
  // machine's front art, the hint and the easter egg face all paint over the whole pile.
  b.el.style.zIndex = String(slot);
  // Idle life (style.css): --wx and --wy place the gumball in the ripples that cross the pile, and --jx, --jy
  // point its little hop toward the middle of the glass, so a moving gumball never leaves the glass.
  b.el.style.setProperty('--wx', (s.x / 100).toFixed(2));
  b.el.style.setProperty('--wy', (s.y / 100).toFixed(2));
  b.el.style.setProperty('--jx', ((50 - s.x) / 100).toFixed(2));
  b.el.style.setProperty('--jy', s.y >= 50 ? '-1' : '.6');
  // Only a gumball well inside the glass also rocks. One against the rim or on the collar keeps its box square.
  b.el.style.setProperty('--jr', Math.hypot(s.x - 50, s.y - 50) < 34 && s.y < 74 ? '1' : '0');
}
function settle(slot) {
  for (;;) {
    let best = -1;
    SLOTS.forEach((s, i) => {
      if (s.row !== SLOTS[slot].row + 1 || seat[i] == null) return;
      if (best < 0 || Math.abs(s.x - SLOTS[slot].x) < Math.abs(SLOTS[best].x - SLOTS[slot].x)) best = i;
    });
    if (best < 0) return;
    const id = seat[best];
    seat[best] = undefined;
    place(id, slot);
    slot = best;
  }
}
// known is false until the chain has been read once. Until then the glass is empty: no gumball is shown
// for a card the page cannot vouch for, and no SOLD OUT stamp either.
export function renderGlass(cards, pulledIds, known = true) {
  const grid = $('gbGrid');
  if (!known) {
    balls.clear(); seat.length = 0;
    grid.replaceChildren();
    $('soldStamp').hidden = true;
    $('eeTapHint').hidden = false;
    return;
  }
  const left = pileOf(cards).filter((c) => !pulledIds.has(c.id));
  $('soldStamp').hidden = left.length !== 0;
  $('eeTapHint').hidden = left.length === 0;
  // First drawing (or a card came back, which only a test chain can do): lay the pile out from the bottom.
  if (!balls.size || left.some((c) => !balls.has(c.id))) {
    balls.clear(); seat.length = 0;
    grid.replaceChildren(...left.map((c, i) => {
      const el = h('div', { class: 'gb', 'data-id': String(c.id) });
      el.style.setProperty('--c', c.color);
      balls.set(c.id, { el, slot: -1 });
      place(c.id, i % SLOTS.length);
      return el;
    }));
    // The pile tumbles in.
    grid.classList.remove('fill');
    void grid.offsetWidth;
    if (left.length) grid.classList.add('fill');
    return;
  }
  const keep = new Set(left.map((c) => c.id));
  for (const [id, b] of balls) {
    if (keep.has(id)) continue;
    b.el.remove(); balls.delete(id); seat[b.slot] = undefined;
    settle(b.slot);
  }
}

// The whole pile jumps and settles. It is heard only when gumballs really move: some are left and motion is on.
export function rattlePile() {
  const glass = $('glass');
  // Only a rattle that is still going needs the layout read that starts it over.
  if (glass.classList.contains('rattle')) {
    glass.classList.remove('rattle');
    void glass.offsetWidth;
  }
  glass.classList.add('rattle');
  clearTimeout(rattlePile.t);
  rattlePile.t = setTimeout(() => glass.classList.remove('rattle'), 600);
  const heard = balls.size > 0 && !reducedMotion();
  if (heard) cue('rattle');
  return heard;
}

// The gumballs near a point of the page hop away from it, the nearest ones furthest. reach is how far the push
// is felt, as a share of the glass, and push is the longest hop in gumball widths. Returns how many hopped.
// delay (ms) holds the hop back, so a caller can set it up ahead of the moment it is for.
// One style pass and one animation each, on transform only. Nothing moves with reduced motion.
let hopTimer = null;
export function scatterPile(x, y, { reach = 0.26, push = 0.85, delay = 0 } = {}) {
  // Measured on the glass, which the pile fills: the pile itself may still be tumbling in.
  const grid = $('gbGrid'); const g = $('glass').getBoundingClientRect();
  if (reducedMotion() || !balls.size || !g.width) return 0;
  const px = ((x - g.left) / g.width) * 100; const py = ((y - g.top) / g.height) * 100; const far = reach * 100;
  const moved = []; let again = false;
  grid.style.setProperty('--hd', `${delay}ms`);
  for (const b of balls.values()) {
    const s = SLOTS[b.slot]; const dx = s.x - px; const dy = s.y - py; const d = Math.hypot(dx, dy);
    if (b.el.classList.contains('hop')) { again = true; b.el.classList.remove('hop'); }
    if (d > far) continue;
    const k = (1 - d / far) ** 0.7 * push * 100;
    // A gumball right under the finger has no direction to go, so it jumps up.
    const ux = d > 1 ? dx / d : 0; const uy = d > 1 ? dy / d : -1;
    b.el.style.setProperty('--hx', `${(ux * k).toFixed(0)}%`);
    b.el.style.setProperty('--hy', `${(uy * k).toFixed(0)}%`);
    b.el.style.setProperty('--hr', `${(ux * k * 0.4).toFixed(0)}deg`);
    moved.push(b.el);
  }
  // Only gumballs that were still hopping need the layout read that starts them over.
  if (again) void grid.offsetWidth;
  for (const el of moved) el.classList.add('hop');
  clearTimeout(hopTimer);
  hopTimer = setTimeout(() => { for (const b of balls.values()) b.el.classList.remove('hop'); }, 560 + delay);
  return moved.length;
}

// Points the coin's flight at the slot on the machine, wherever the layout has put the two.
// The coin is measured where it rests, not where a hover or a press has nudged it, because the flight
// starts from the resting spot.
function aimCoin() {
  const coin = $('coin'); const from = coin.offsetParent;
  const s = $('machine').querySelector('.m-slot').getBoundingClientRect();
  if (!from || !coin.offsetWidth || !s.width) return;
  const f = from.getBoundingClientRect();
  const cx = f.left + from.clientLeft + coin.offsetLeft + coin.offsetWidth / 2;
  const cy = f.top + from.clientTop + coin.offsetTop + coin.offsetHeight / 2;
  coin.style.setProperty('--ix', `${s.left + s.width / 2 - cx}px`);
  coin.style.setProperty('--iy', `${s.top + s.height / 2 - cy}px`);
  coin.style.setProperty('--is', (s.width * 0.92 / coin.offsetWidth).toFixed(3));
}

// sound: false flies the coin without the slot and shake sounds (the preview build, where nothing is pulled).
// held: the visitor carried the coin to the slot and let go (play.js). It goes in from where it was dropped,
// which is --dx, --dy away from its resting spot, instead of flying up from under the machine.
export async function coinInsert(sound = true, held = false) {
  clearGumball();
  aimCoin();
  $('coin').classList.toggle('dropin', held);
  $('coin').classList.add('inserted');
  // The coin reaches the slot 80% of the way into its .66s flight, or 60% into the .34s it takes from the hand.
  // With reduced motion there is no flight: the coin is in at once, so the slot sound only waits for the pick up
  // sound (0.12s) to get out of its way.
  if (sound) cue('coinDrop', { delay: reducedMotion() ? 0.12 : held ? 0.2 : 0.53 });
  await wait(held ? 250 : 460);
  shake(sound && { delay: 0 });
  await wait(260);
}
// The coin stays in the machine (out of sight) from the moment the pull lands until The Peel is closed.
export const coinAway = () => $('coin').classList.add('away');
export function coinReset() {
  const coin = $('coin');
  coin.classList.remove('inserted', 'away', 'dropin');
  coin.style.removeProperty('--dx');
  coin.style.removeProperty('--dy');
}

// sound: the options for the rattle that goes with the shake, or false for a silent one.
// With reduced motion the machine holds still, so there is nothing to hear.
export function shake(sound = {}) {
  const m = $('machine');
  if (sound && !reducedMotion()) cue('rattle', sound);
  // The shake outranks a knock or the jump scare's jolt that is still on the machine.
  m.classList.remove('shake', 'jolt', 'knock');
  void m.offsetWidth;
  m.classList.add('shake');
  setTimeout(() => m.classList.remove('shake'), 600);
}
// The handle keeps turning while a pull is in flight.
export const crankHandle = (on) => $('crank').classList.toggle('spin', on);

// One last turn of the handle, then the gumball lands in the chute in the color of the card that was pulled.
// It stays in the tray until clearGumball.
export async function dropGumball(color) {
  const b = $('dgb'); const crank = $('crank');
  b.style.setProperty('--gc', color);
  b.style.setProperty('--gs', gumballShade(color));
  b.classList.remove('drop');
  crank.classList.remove('turn');
  void b.getBoundingClientRect();
  crank.classList.add('turn');
  b.classList.add('drop');
  shake();
  // The gumball shows .35s in and lands 45% into its .9s fall, at .755s. The chute sound rolls for .44s and
  // then lands, so it starts at .32s. With reduced motion the gumball is simply there, so the sound is too,
  // and the gumball sits in the tray until that sound is over (.62s) so The Peel does not open on top of it.
  const still = reducedMotion();
  cue('chute', { delay: still ? 0 : 0.32 });
  $('machine').scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' });
  await (still ? new Promise((r) => setTimeout(r, 620)) : wait(1350));
  crank.classList.remove('turn');
}
export function clearGumball() {
  $('dgb').classList.remove('drop');
  $('crank').classList.remove('turn');
}

// The jump scare. Ten quick taps on the glass and a mutant gumball slams its face against the inside of it,
// holds for about a second and drops back into the pile. Three faces take turns.
// canScare: main.js says when the face may come. Not while a pull is in flight or the coin is on its way in
// (nothing jolts the machine then), and not under the CLOSED sign or the SOLD OUT stamp, which would hide it.
const SCARE_HOLD = 1300; const SCARE_DROP = 340; const SCARE_JOLT = 480;
export function setupGlassEgg(canScare = () => true) {
  let count = 0; let timer = null; let active = false; let turn = 0;
  const face = $('eeFace'); const hint = $('eeTapHint'); const glass = $('glass');
  const middle = () => { const r = glass.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  const scare = () => {
    const m = $('machine'); const still = reducedMotion();
    active = true;
    clearTimeout(timer);
    hint.style.opacity = '0';
    face.dataset.v = String(turn++ % 3);
    face.classList.remove('drop');
    face.classList.add('visible');
    cue('scare');
    // The machine takes the hit and the pile is thrown outward as the face lands, 110ms in. The face and the jolt
    // start in this frame and then run on their own. The pile is set up straight after that frame, with what is
    // left of the 110ms as its delay, so a slow phone shows the face first and has nothing to do when it hits.
    // With reduced motion the face is simply there, and then it is not.
    if (!still) {
      m.classList.remove('jolt', 'knock');
      m.classList.add('jolt');
      const t0 = performance.now();
      requestAnimationFrame(() => setTimeout(() => scatterPile(...middle(), { reach: 0.62, push: 1.3, delay: Math.max(0, Math.round(110 - (performance.now() - t0))) }), 0));
      // The jolt comes off as soon as it is over, so the machine is free to shake for a coin.
      setTimeout(() => m.classList.remove('jolt'), SCARE_JOLT);
    }
    const end = () => {
      face.classList.remove('visible', 'drop');
      count = 0; active = false; hint.style.opacity = '';
    };
    setTimeout(() => {
      if (still) { end(); return; }
      face.classList.add('drop');
      // It lands back in the pile.
      setTimeout(() => { end(); rattlePile(); }, SCARE_DROP);
    }, SCARE_HOLD);
  };
  glass.addEventListener('click', (e) => {
    const now = !active && count >= 9 && canScare();
    // Every tap rattles the pile, and the gumballs nearest the finger hop away from it. A tap from the
    // keyboard has no place of its own, so it lands in the middle of the glass. The tap that brings the
    // face leaves the pile to the face, which throws all of it.
    if (!now) {
      rattlePile();
      const [mx, my] = middle();
      const keyed = e.detail === 0 && !e.clientX && !e.clientY;
      scatterPile(keyed ? mx : e.clientX, keyed ? my : e.clientY);
    }
    // The pitch climbs with each tap of a run.
    cue('glass', { n: active ? 8 : Math.min(count, 8) });
    if (active) return;
    // A run that cannot end in the face yet stays one tap short of it.
    count = Math.min(count + 1, now ? 10 : 9);
    if (count === 1) hint.style.opacity = '1';
    clearTimeout(timer);
    timer = setTimeout(() => { count = 0; hint.style.opacity = ''; }, 2000);
    if (now) scare();
  });
  // The glass is a button to the keyboard too.
  glass.addEventListener('keydown', (e) => {
    if (e.target !== glass || (e.key !== 'Enter' && e.key !== ' ') || e.repeat) return;
    e.preventDefault();
    glass.click();
  });
}

/* ---------- gallery and odds ---------- */

let shownGallery = null;
export function renderGallery(cards, pulledIds) {
  const key = [...pulledIds].join(',');
  if (key === shownGallery) return;
  shownGallery = key;
  const pick = $('galleryPick');
  $('galleryGrid').replaceChildren(...cards.map((c) => {
    const pulled = pulledIds.has(c.id);
    const label = pulled ? `#${pad3(c.id)} ${c.name} · ${c.rarity}` : 'Still in The Machine';
    const say = () => { pick.textContent = pulled ? label : `#${pad3(c.id)} is still in The Machine.`; };
    const ball = h('button', {
      type: 'button', class: `gball ${pulled ? 'pulled' : 'locked'}`, tabindex: pulled ? null : '-1',
      'aria-label': pulled ? label : `Number ${c.id}. Still in The Machine`,
      onclick: say, onfocus: say, onmouseenter: say,
    });
    if (pulled) {
      ball.style.setProperty('--c', c.color);
      const dot = h('span', { class: 'rardot' });
      dot.style.background = tierColor(c.rarity);
      ball.append(h('span', { class: 'glo' }), dot);
    }
    ball.append(h('span', { class: 'gtip', 'aria-hidden': 'true' }, label));
    return ball;
  }));
}

export function renderOdds(tiers, leftByTier, remaining) {
  $('oddsBody').replaceChildren(...Object.entries(tiers).map(([tier, total]) => {
    const left = leftByTier[tier];
    const dot = h('i', { class: 'tier-dot' });
    dot.style.background = tierColor(tier);
    const chance = left == null ? '...' : remaining ? `${((left / remaining) * 100).toFixed(1)}%` : 'None left';
    return h('tr', null,
      h('th', { scope: 'row' }, dot, tier),
      h('td', null, left == null ? `... of ${total}` : `${left} of ${total}`),
      h('td', null, chance));
  }));
}

export function renderDrops(pulls, cardById, shortAddress) {
  $('drops').hidden = pulls.length === 0;
  $('dropsList').replaceChildren(...pulls.map((p) => {
    const c = cardById.get(p.id);
    if (!c) return null;
    const dot = h('i', { class: 'tier-dot' });
    dot.style.background = c.color;
    return h('li', null, dot, h('strong', null, `#${pad3(c.id)} ${c.name}`), ` ${c.rarity} · ${shortAddress(p.to)}`);
  }).filter(Boolean));
}

/* ---------- modal ---------- */

const dialog = $('modal');
let onClose = null;
let view = null;
// The close event arrives a moment after close(). If another view was opened in between (the Cranking view
// closing as The Peel opens), the event belongs to the old view and must not run the new view's handler.
dialog?.addEventListener('close', () => { if (dialog.open) return; const fn = onClose; onClose = null; view = null; fn?.(); });
// A tap on the dark backdrop closes, like the X does.
dialog?.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
$('modalClose')?.addEventListener('click', () => dialog.close());

// Shows one view in the shared dialog. The native dialog traps focus and closes on Escape.
// view is a name main.js can ask for later, to know which view is on screen.
export function openModal(title, kids, { closed, view: name } = {}) {
  onClose = closed || null;
  view = name || null;
  $('modalTitle').textContent = title;
  $('modalBody').replaceChildren(...kids.flat().filter(Boolean));
  if (!dialog.open) dialog.showModal();
  // Focus without scrolling, then go to the top. Otherwise a short screen opens scrolled down to the
  // focused button and the top of the view (the card art on The Peel) is cut off.
  ($('modalBody').querySelector('[data-focus]') || $('modalClose')).focus({ preventScroll: true });
  dialog.querySelector('.modal').scrollTop = 0;
}
// quiet: true closes without running the view's closed handler.
export function closeModal({ quiet } = {}) {
  if (!dialog.open) return;
  if (quiet === true) onClose = null;
  dialog.close();
  // Run the view's closed handler now. The browser's close event comes later, on its own schedule,
  // and a caller that goes straight on (CRANK AGAIN) must find the coin already put back.
  const fn = onClose; onClose = null; view = null; fn?.();
}
export const modalOpen = () => dialog.open;
export const currentView = () => (dialog.open ? view : null);

export const btn = (label, onclick, kind = 'p', focus = false) =>
  h('button', { type: 'button', class: `mbtn ${kind}`, onclick, 'data-focus': focus }, label);
export const linkBtn = (label, href, kind = 'bl') =>
  h('a', { class: `mbtn ${kind}`, href, target: '_blank', rel: 'noopener' }, label);
export const note = (...kids) => h('p', { class: 'tnote' }, ...kids);
export const rows = (pairs) => h('div', { class: 'psum' }, pairs.filter(Boolean).map(([l, v, cls]) =>
  h('div', { class: 'pr' }, h('span', { class: 'pl' }, l), h('span', { class: `pv ${cls || ''}` }, v))));
export const netBadge = (label) => h('span', { class: 'net' }, h('span', { class: 'net-dot' }), label);

// A plain message with one or two ways out. Used for closed, soon and every error.
export function showMessage(title, lines, actions = [], opts) {
  openModal(title, [
    ...[].concat(lines).map((l) => (typeof l === 'string' ? h('p', { class: 'msg' }, l) : l)),
    ...actions,
    btn('Close', closeModal, 's', actions.length === 0),
  ], opts);
}

// The Cranking view. Three true steps. step is 0, 1 or 2 for the one in progress, 3 when all are done.
// hint is one extra line for the step in progress. action is an optional button under it.
export function crankView(labels, step, txLink, { hint, action } = {}) {
  const icon = (i) => (i < step ? '✓' : i === step ? '●' : '○');
  return [h('div', { class: 'mscreen' },
    h('div', { class: 'sring' }, h('div', { class: 'sinner' })),
    h('div', { class: 'mlbl', 'aria-live': 'polite' }, labels[Math.min(step, labels.length - 1)]),
    h('div', { class: 'pgsteps' }, labels.map((l, i) =>
      h('div', { class: `pgs ${i < step ? 'done' : i === step ? 'active' : ''}` },
        h('div', { class: 'pi', 'aria-hidden': 'true' }, icon(i)),
        h('span', null, l),
        i === 1 && txLink ? h('a', { class: 'txl', href: txLink, target: '_blank', rel: 'noopener' }, 'View transaction') : null))),
    hint ? h('p', { class: 'chint' }, hint) : null,
    h('p', { class: 'msub' }, 'You can close this. The Peel opens when your Splatz lands.'),
    action,
  )];
}

// Starts fetching a card's art before The Peel needs it. The image is held so the browser keeps it ready.
let ahead = null;
export function preload(src) { ahead = new Image(); ahead.src = src; }

// The Peel. The real card straight from cards.json. card.img is the WebP copy of the 1040 by 1520 card.
// onArt is called when the art is on screen, or when the note that it did not load is. It may be called twice.
export function peelView({ card, statNames, txHash, txLink, actions, onArt }) {
  const img = h('img', { class: 'rimg', src: card.img, width: 1040, height: 1520, alt: `Card ${card.id}, ${card.name}, ${card.rarity}` });
  const frame = h('div', { class: 'rcard' }, img);
  img.addEventListener('load', () => onArt?.());
  if (img.complete && img.naturalWidth) onArt?.();
  img.addEventListener('error', () => {
    onArt?.();
    // No stand in art. Say what the card is and offer another go at loading it.
    frame.replaceChildren(h('div', { class: 'rfail' },
      h('strong', null, `#${pad3(card.id)}`), h('span', null, card.name),
      h('span', { class: 'rfail-note' }, 'The card art did not load.'),
      h('button', { type: 'button', class: 'sbtn', onclick: () => { img.src = `${card.img}?retry=${Date.now()}`; frame.replaceChildren(img); } }, 'Retry')));
  });
  const badge = h('span', { class: 'rrar' }, card.rarity);
  badge.style.background = tierColor(card.rarity);
  const stats = h('div', { class: 'rstats' }, statNames.map((name, i) => {
    const fill = h('div', { class: 'rsf' });
    fill.style.cssText = `width:${card.stats[i] * 10}%;animation-delay:${0.1 * (i + 1)}s;background:${tierColor(card.rarity)}`;
    return h('div', { class: 'rsr' }, h('span', { class: 'rsl' }, name), h('div', { class: 'rsbg' }, fill), h('span', { class: 'rsv' }, String(card.stats[i])));
  }));
  const short = `${txHash.slice(0, 10)}...${txHash.slice(-6)}`;
  return [h('div', { class: 'peel' },
    h('div', { class: 'rcardwrap' }, frame),
    h('div', { class: 'rinfo' },
      h('div', { class: 'rhead' }, h('span', { class: 'rnum' }, `#${pad3(card.id)}`), h('span', { class: 'rname' }, card.name), badge),
      stats,
      h('p', { class: 'rtx' }, 'Yours on chain. ', txLink ? h('a', { href: txLink, target: '_blank', rel: 'noopener' }, `Transaction ${short}`) : `Transaction ${short}`),
      h('div', { class: 'rbtns' }, actions)),
  )];
}
