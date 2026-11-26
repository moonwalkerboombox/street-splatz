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

export async function coinInsert() {
  clearGumball();
  aimCoin();
  $('coin').classList.add('inserted');
  await wait(460);
  shake();
  await wait(260);
}
// The coin stays in the machine (out of sight) from the moment the pull lands until The Peel is closed.
export const coinAway = () => $('coin').classList.add('away');
export const coinReset = () => $('coin').classList.remove('inserted', 'away');

export function shake() {
  const m = $('machine');
  m.classList.remove('shake');
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
  $('machine').scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
  await wait(1350);
  crank.classList.remove('turn');
}
export function clearGumball() {
  $('dgb').classList.remove('drop');
  $('crank').classList.remove('turn');
}

// Easter egg from the mockup. Ten quick taps on the glass and something looks back.
export function setupGlassEgg() {
  let count = 0; let timer = null; let active = false;
  const face = $('eeFace'); const hint = $('eeTapHint'); const glass = $('glass');
  // Every tap rattles the pile.
  const rattle = () => {
    glass.classList.remove('rattle');
    void glass.offsetWidth;
    glass.classList.add('rattle');
    setTimeout(() => glass.classList.remove('rattle'), 600);
  };
  glass.addEventListener('click', () => {
    rattle();
    if (active) return;
    count += 1;
    if (count === 1) hint.style.opacity = '1';
    clearTimeout(timer);
    timer = setTimeout(() => { count = 0; hint.style.opacity = ''; }, 2000);
    if (count < 10) return;
    active = true;
    hint.style.opacity = '0';
    face.classList.add('visible');
    shake();
    setTimeout(() => { face.classList.remove('visible'); count = 0; active = false; hint.style.opacity = ''; }, 3200);
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

// The Peel. The real card straight from cards.json.
export function peelView({ card, statNames, txHash, txLink, actions }) {
  const img = h('img', { class: 'rimg', src: card.img, width: 520, height: 720, alt: `Card ${card.id}, ${card.name}, ${card.rarity}` });
  const frame = h('div', { class: 'rcard' }, img);
  img.addEventListener('error', () => {
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
