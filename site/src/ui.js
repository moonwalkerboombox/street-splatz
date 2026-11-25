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

// Decorative gumballs in brand colors. How full the glass looks follows how many cards are left.
const SIZES = [22, 20, 18, 22, 20, 18, 20, 22, 18, 20, 16, 20, 22, 18, 20, 18, 22, 16, 20, 18, 22, 20, 16, 18, 20, 22, 18, 20, 16, 18, 20, 18, 22, 16, 20, 18, 20, 22, 16, 18, 20, 22, 18, 20, 16];
const BALL_COLORS = ['#e31e24', '#e31e24', '#e31e24', '#1a1aff', '#1a1aff', '#f0f0f0', '#f0f0f0', '#1a1a1a', '#cc1a1f', '#3030dd', '#e8e8e8'];
let shownBalls = -1;
export function renderGlass(remaining, total) {
  const count = Math.ceil((remaining / total) * SIZES.length);
  $('soldStamp').hidden = remaining !== 0;
  $('eeTapHint').hidden = remaining === 0;
  if (count === shownBalls) return;
  shownBalls = count;
  $('gbGrid').replaceChildren(...SIZES.slice(0, count).map((s, i) => {
    const d = h('div', { class: 'gbl' });
    d.style.cssText = `width:${s}px;height:${s}px;background:${BALL_COLORS[(i * 7 + 3) % BALL_COLORS.length]}`;
    return d;
  }));
}

export async function coinInsert() {
  $('coin').classList.add('inserted');
  await wait(200);
  shake();
  await wait(420);
}
export const coinReset = () => $('coin').classList.remove('inserted');

export function shake() {
  const m = $('machine');
  m.classList.remove('shake');
  void m.offsetWidth;
  m.classList.add('shake');
  setTimeout(() => m.classList.remove('shake'), 600);
}
export const crankHandle = (on) => $('mIndent').classList.toggle('spin', on);

export async function dropGumball(color) {
  const b = $('dgb');
  b.style.background = color;
  b.classList.remove('drop');
  void b.offsetWidth;
  b.classList.add('drop');
  $('machine').scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
  await wait(1000);
  b.classList.remove('drop');
}

// Easter egg from the mockup. Ten quick taps on the glass and something looks back.
export function setupGlassEgg() {
  let count = 0; let timer = null; let active = false;
  const face = $('eeFace'); const hint = $('eeTapHint');
  $('glass').addEventListener('click', () => {
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
dialog?.addEventListener('close', () => { const fn = onClose; onClose = null; view = null; fn?.(); });
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
export function closeModal() { if (dialog.open) dialog.close(); }
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
