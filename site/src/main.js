// The machine page. Holds the state and walks a visitor through one pull.
import * as chain from './chain.js';
import * as wallet from './wallet.js';
import * as ui from './ui.js';
import * as sfx from './sfx.js';
import { setupPlay } from './play.js';
import { $, h, btn, eth } from './ui.js';
import { addressUrl, chainInfo, collectionLink, contractAddress, fiftyCentPriceWei, preview, tokenLink, txUrl } from './config.js';

const NET = chainInfo.label;
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const word = (n) => WORDS[n] ?? String(n);
// The dollar note is only shown at the one price it is true for. See config.js.
const centsNote = (wei) => (fiftyCentPriceWei != null && wei === fiftyCentPriceWei ? 'about 50 cents' : null);
const HONEST = 'The Machine picks from the cards left using public block data. It is not verifiable randomness.';

const S = {
  data: null,      // cards.json
  cardById: new Map(),
  total: 100,
  machine: null,   // last good machineState read
  unreachable: false,
  session: null,   // { provider, account, walletClient }
  busy: false,     // a pull is in flight
  run: null,       // token of the pull that owns the page. Cleared when the visitor stops waiting
  crank: null,     // what the Cranking view last showed, so it can be reopened
  shown: null,     // what the open Pull or Approve view was drawn with: { price, remaining }
  landing: false,  // the visitor's own pull has landed and its gumball or The Peel is on screen
  soldSaid: false, // the sold out sound has played. It plays once
  soldDue: false,  // the sold out sound is waiting for The Peel to close
};

/* ---------- sound ---------- */

// The four tiers in the order sound.js numbers them, plainest first.
const TIERS = ['Pavement Card', 'Fresh Drop', 'Block Hitter', 'Street Legend'];

// The crank is heard while a pull is pending and its Cranking view is open.
let stopCrank = null;
function crankOn() { if (!stopCrank) stopCrank = sfx.crank(); }
function crankOff() { stopCrank?.(); stopCrank = null; }

// Once, when the last card goes in front of the visitor. If it was the visitor's own pull, the sound
// waits until The Peel is closed and the stamped machine comes into view.
function soldOutSound(now) {
  if (S.soldSaid) return;
  if (S.landing && !now) { S.soldDue = true; return; }
  S.soldSaid = true;
  S.soldDue = false;
  sfx.play('soldOut');
}

function setupSound() {
  ui.onCue(sfx.play);
  // Every button and button shaped link clicks. The coin, the sound button and the parts of the machine
  // that can be played with (data-play) have sounds of their own.
  document.addEventListener('click', (e) => {
    const b = e.target.closest?.('button, a.mbtn');
    if (b && b.id !== 'coin' && b.id !== 'soundBtn' && !b.hasAttribute('data-play')) sfx.play('tap');
  });
  const b = $('soundBtn');
  if (!sfx.available()) return;
  sfx.onLost(() => { b.hidden = true; });
  // Pressed means muted. The name says which state it is in.
  const show = () => {
    const off = sfx.muted();
    b.setAttribute('aria-pressed', String(off));
    b.setAttribute('aria-label', off ? 'Mute sound. Sound is off' : 'Mute sound. Sound is on');
    b.title = off ? 'Sound is off' : 'Sound is on';
  };
  show();
  b.hidden = false;
  b.addEventListener('click', () => { sfx.setMuted(!sfx.muted()); show(); });
}

/* ---------- reading and rendering ---------- */

async function loadCards() {
  const res = await fetch('/cards.json');
  if (!res.ok) throw new Error('cards.json missing. Run npm run build:assets at the repo root.');
  S.data = await res.json();
  S.total = S.data.cards.length;
  S.cardById = new Map(S.data.cards.map((c) => [c.id, c]));
  $('fineProv').textContent = S.data.provenance;
}

// Reads the machine. Keeps the last good reading on failure and says so, never invents one.
async function refresh() {
  if (preview) return null;
  try {
    const was = S.machine?.remaining;
    S.machine = await chain.readMachine();
    S.unreachable = false;
    if (was > 0 && S.machine.remaining === 0) soldOutSound();
  } catch (err) {
    console.warn('machineState read failed', err);
    S.unreachable = true;
  }
  render();
  if (!S.unreachable) { loadDrops(); syncOpenView(); }
  return S.unreachable ? null : S.machine;
}

// Keeps an open Pull or Approve view in step with a fresh reading, so it never shows an old price or count.
function syncOpenView() {
  const view = ui.currentView();
  if (S.busy || !S.machine || !S.shown || (view !== 'pull' && view !== 'approve')) return;
  const m = S.machine;
  const opts = { closed: ui.coinReset };
  if (m.remaining === 0) return ui.showMessage('SOLD OUT', `All ${S.total} are pulled. The Machine is empty.`, [], opts);
  if (!m.saleOpen) return ui.showMessage('CLOSED FOR NOW', ['The Machine is closed for now.', 'No coins are being taken. Check back soon.'], [], opts);
  const priceMoved = m.price !== S.shown.price;
  if (view === 'pull' && (priceMoved || m.remaining !== S.shown.remaining)) showPull();
  if (view === 'approve' && priceMoved) showApprove(`The price changed. A pull is now ${eth(m.price)}.`);
}

async function loadDrops() {
  try {
    ui.renderDrops(await chain.recentPulls(), S.cardById, wallet.shortAddress);
  } catch (err) {
    console.info('recent pulls strip skipped', err?.shortMessage || err);
    $('drops').hidden = true;
  }
}

const mode = () => {
  if (preview) return 'preview';
  if (!S.machine) return S.unreachable ? 'error' : 'loading';
  if (S.machine.remaining === 0) return 'soldout';
  return S.machine.saleOpen ? 'open' : 'closed';
};

function render() {
  const m = S.machine;
  const state = mode();
  const known = preview || !!m;
  const remaining = preview ? S.total : m?.remaining ?? S.total;
  const pulledCount = S.total - remaining;
  const pulledIds = new Set(m ? S.data.cards.filter((c) => chain.isPulled(m, c.id)).map((c) => c.id) : []);
  const price = m ? eth(m.price) : null;

  // nav and footer numbers
  $('navPulled').textContent = known ? `${pulledCount}/${S.total}` : '...';
  $('navPrice').textContent = price || (preview ? 'Soon' : '...');
  $('footPulled').textContent = known ? String(pulledCount) : '...';
  $('footNet').textContent = NET;

  // machine and call to action
  // Before the first reading the glass is empty, because the page does not know yet what is left.
  // After that it holds exactly the cards not yet pulled. The preview build shows them all.
  ui.renderGlass(S.data.cards, pulledIds, known);
  $('machine').classList.toggle('closed', state === 'closed');
  const sold = state === 'soldout';
  const link = sold ? collectionLink() : null;
  $('coin').hidden = sold;
  $('coin').classList.toggle('dim', state === 'closed' || state === 'error');
  $('soldLink').hidden = !link;
  if (link) { $('soldLink').href = link.url; $('soldLink').textContent = link.label; }
  $('ctaLabel').textContent = {
    soldout: `Sold out. All ${S.total} pulled.`,
    closed: 'The Machine is closed for now.',
  }[state] || `Drop a Coin. Pull 1 of ${S.total}.`;
  const counts = `${pulledCount} of ${S.total} pulled.`;
  // Each sentence is its own span so a narrow phone breaks the line between them.
  $('ctaSub').replaceChildren(...{
    preview: ['The Machine opens soon.'],
    loading: ['Checking The Machine'],
    error: [],
    open: [counts, m && centsNote(m.price) ? `${price} a pull, ${centsNote(m.price)}.` : `${price} a pull.`],
    closed: [counts, 'Check back soon.'],
    soldout: ['The glass is empty.', 'Every Splatz has a home.'],
  }[state].flatMap((t) => [h('span', null, t), ' ']));

  // could not reach the chain
  $('notice').hidden = !S.unreachable;
  $('noticeText').textContent = m
    ? `Could not reach ${NET}. These numbers may be out of date.`
    : `Could not reach ${NET}.`;
  fitNotice();

  // explainer, present tense until the last card is gone
  const legends = S.data.tiers['Street Legend'];
  // The dollar figure is only stated while it is true: before launch, or while the price on chain matches it.
  const coinLine = (preview && fiftyCentPriceWei != null) || (m && centsNote(m.price))
    ? `Put in about 50 cents worth of ETH on ${NET}. Less than a real gumball machine. The handle does the rest.`
    : `Put in ${price || 'a little ETH'} on ${NET}. The handle does the rest.`;
  const [e1, e2, e3] = sold ? [
    'Collectors put in a little ETH for each pull. The handle did the rest.',
    `All ${S.total} dropped to wallets, one random card at a time. Nobody knew which until The Peel.`,
    `Every Splatz now lives in a wallet on ${NET}. Only ${S.total} exist. They are gone from The Machine.`,
  ] : [
    coinLine,
    `One of ${S.total} drops to your wallet. You never know which until The Peel.${legends ? ` ${word(legends)[0].toUpperCase()}${word(legends).slice(1)} Street Legends went into the glass.` : ''}`,
    `Your Splatz is yours on ${NET}. Only ${S.total} will ever exist. When they are gone, they are gone.`,
  ];
  $('ex1').textContent = e1; $('ex2').textContent = e2; $('ex3').textContent = e3;

  // gallery and odds
  ui.renderGallery(S.data.cards, pulledIds);
  $('gallerySub').textContent = sold
    ? `All ${S.total} Genesis Splatz. Every one has been pulled.`
    : `All ${S.total} Genesis Splatz. Pulled ones are revealed. The rest are still in The Machine.`;
  const left = {};
  if (known) for (const c of S.data.cards) left[c.rarity] = (left[c.rarity] || 0) + (pulledIds.has(c.id) ? 0 : 1);
  ui.renderOdds(S.data.tiers, left, remaining);
  $('oddsNote').textContent = sold
    ? 'Nothing is left to pull.'
    : 'Next pull is the share of the cards left that belong to each tier. Every card left has the same chance.';
  $('footLegends').textContent = known ? String(left['Street Legend'] ?? 0) : '...';
}

// The notice and its Retry button belong on the first screen. If they would fall below it, the machine
// gives up exactly that much height (--fit caps its width, see .mach in style.css).
function fitNotice() {
  const mach = $('machine'); const notice = $('notice');
  mach.style.removeProperty('--fit');
  if (notice.hidden) return;
  const over = notice.getBoundingClientRect().bottom + window.scrollY + 10 - document.documentElement.clientHeight;
  if (over > 0) mach.style.setProperty('--fit', `${Math.max(0, (mach.offsetHeight - over) * (400 / 540))}px`);
}

function renderStatic() {
  $('year').textContent = String(new Date().getFullYear());
  if (contractAddress) {
    const url = addressUrl(contractAddress);
    $('fineContract').replaceChildren(url
      ? h('a', { href: url, target: '_blank', rel: 'noopener' }, contractAddress)
      : contractAddress);
  }
}

/* ---------- the pull flow ---------- */

// held: the visitor carried the coin to the slot and dropped it in (play.js). Everything else is the same
// as a tap on the coin, except that the coin was already heard being picked up and goes in from the hand.
async function onCoin(held = false) {
  const state = mode();
  // Sold out means the coin is gone from the page. Guard anyway so nothing can start a pull.
  if (state === 'loading' || state === 'soldout') return;
  if (state === 'error') { sfx.play('tap'); refresh(); return; }
  if (S.busy) { sfx.play('tap'); showCrank(); return; }
  // One coin at a time. A second press from the keyboard while the coin is in flight is not another coin.
  if ($('coin').classList.contains('inserted')) return;
  if (!held) sfx.play('coinPick');
  // The preview build has nothing to pull, so the coin flies without the slot and shake sounds.
  await ui.coinInsert(state !== 'preview', held);
  const closed = ui.coinReset;
  if (state === 'preview') {
    ui.showMessage('THE MACHINE OPENS SOON', [
      'The Machine opens soon.',
      `${S.total} Splatz are loaded behind the glass. Come back when the coin slot lights up.`,
    ], [], { closed });
  } else if (state === 'closed') {
    sfx.play('jam');
    ui.showMessage('CLOSED FOR NOW', ['The Machine is closed for now.', 'No coins are being taken. Check back soon.'], [], { closed });
  } else {
    showPull();
  }
}

function showPull() {
  const m = S.machine;
  const cents = centsNote(m.price);
  S.shown = { price: m.price, remaining: m.remaining };
  ui.openModal('PULL A SPLATZ', [
    ui.rows([
      ['The Pull', '1 Splatz'],
      ['Price', h('span', null, eth(m.price), cents ? h('small', null, ` ${cents}`) : null), 'go'],
      ['Cards left', `${m.remaining} of ${S.total}`],
      ['Network', ui.netBadge(NET)],
    ]),
    ui.note(HONEST, ' ', h('strong', null, 'All sales final.')),
    btn(S.session ? 'CONTINUE' : 'CONNECT WALLET', () => (S.session ? showApprove() : chooseWallet()), 'p', true),
    h('p', { class: 'mfoot' }, `Crypto wallet and a little ETH on ${NET} required`),
  ], { closed: ui.coinReset, view: 'pull' });
}

async function chooseWallet() {
  const wallets = await wallet.discoverWallets();
  if (!wallets.length) return showNoWallet();
  ui.openModal('CONNECT WALLET', [
    h('p', { class: 'msg' }, 'Pick the wallet you want to pull with.'),
    h('div', { class: 'wlist' }, wallets.map((w, i) => h('button', {
      type: 'button', class: 'wopt', 'data-focus': i === 0, onclick: () => connectWith(w),
    }, w.icon ? h('img', { src: w.icon, alt: '', width: 32, height: 32 }) : h('span', { class: 'wopt-blank', 'aria-hidden': 'true' }), h('span', null, w.name)))),
    btn('Back', showPull, 's'),
  ], { closed: ui.coinReset });
}

function showNoWallet() {
  ui.openModal('OPEN IN YOUR WALLET APP', [
    h('p', { class: 'msg' }, 'This browser has no wallet. Open The Machine inside your wallet app and drop your coin there.'),
    h('div', { class: 'rbtns' }, wallet.walletAppLinks().map((l, i) =>
      h('a', { class: `mbtn ${i ? 'bl' : 'p'}`, href: l.url, 'data-focus': i === 0 }, `Open in ${l.name}`))),
    ui.note(`New here? Get a wallet app such as Coinbase Wallet or MetaMask and a few dollars of ETH on ${NET}.`),
    btn('Back', showPull, 's'),
  ], { closed: ui.coinReset });
}

async function connectWith(w) {
  ui.openModal('CONNECT WALLET', [h('div', { class: 'mscreen' },
    h('div', { class: 'sring' }, h('div', { class: 'sinner' })),
    h('div', { class: 'mlbl', 'aria-live': 'polite' }, `Check ${w.name}`),
    h('p', { class: 'msub' }, `Approve the connection and switch to ${NET} if it asks.`))], { closed: ui.coinReset });
  try {
    const account = await wallet.connect(w.provider);
    setSession(w.provider, account);
    showApprove();
  } catch (err) {
    console.warn('connect failed', err);
    sfx.play('jam');
    const kind = err?.kind === 'network' ? 'network' : chain.errorKind(err);
    ui.showMessage('NOT CONNECTED', {
      rejected: 'The wallet request was closed, so nothing is connected.',
      network: `The wallet is not on ${NET}. Switch networks in your wallet and try again.`,
    }[kind] || 'The wallet did not connect. Try again.', [btn('TRY AGAIN', chooseWallet, 'p', true)], { closed: ui.coinReset });
  }
}

function setSession(provider, account) {
  S.session = { provider, account, walletClient: chain.walletClientFor(provider, account) };
  $('walletNav').hidden = false;
  $('walletNavAddr').textContent = wallet.shortAddress(account);
  if (!provider.__splatzBound) {
    provider.__splatzBound = true;
    provider.on?.('accountsChanged', (accounts) => onAccountsChanged(provider, accounts));
  }
}

// The visitor swapped accounts in the wallet, or disconnected it. Follow the wallet, and redraw the
// view on screen so it never shows an address the wallet is no longer using.
function onAccountsChanged(provider, accounts) {
  if (S.session && S.session.provider !== provider) return;
  const next = Array.isArray(accounts) ? accounts[0] : null;
  if (next) {
    setSession(provider, next);
  } else {
    S.session = null;
    $('walletNav').hidden = true;
  }
  // A pull in flight keeps the account it started with. Its views are redrawn when it ends.
  if (S.busy) return;
  const view = ui.currentView();
  if (view === 'approve') { if (next) showApprove(); else showPull(); }
  if (view === 'pull') showPull();
}

function showApprove(message) {
  // No wallet session (the wallet was disconnected or the account went away). Ask for one first.
  if (!S.session) return chooseWallet();
  const m = S.machine;
  const { account } = S.session;
  S.shown = { price: m.price, remaining: m.remaining };
  const gas = h('span', { class: 'pv g' }, 'Estimating');
  const warn = h('p', { class: 'warn', role: 'status' }, message || '');
  warn.hidden = !message;
  ui.openModal('APPROVE IN WALLET', [
    h('div', { class: 'wrow' }, h('span', { class: 'wdg' }), h('span', { class: 'waddr' }, 'Wallet connected ', h('strong', null, wallet.shortAddress(account)))),
    warn,
    h('div', { class: 'psum' },
      h('div', { class: 'pr' }, h('span', { class: 'pl' }, 'The Pull'), h('span', { class: 'pv' }, '1 Splatz')),
      h('div', { class: 'pr' }, h('span', { class: 'pl' }, 'Network'), h('span', { class: 'pv' }, NET)),
      h('div', { class: 'pr' }, h('span', { class: 'pl' }, 'Network fee estimate'), gas),
      h('div', { class: 'pr' }, h('span', { class: 'pl' }, 'Price'), h('span', { class: 'pv go' }, eth(m.price)))),
    btn('DROP THE COIN', () => drop(m.price), 'p', true),
    btn('Cancel', ui.closeModal, 's'),
    h('p', { class: 'mfoot' }, 'All sales final'),
  ], { closed: ui.coinReset, view: 'approve' });

  // Live extras. Neither one blocks the button.
  chain.estimatePullFee(account, m.price)
    .then((fee) => { gas.textContent = fee < 10n ** 12n ? 'under 0.000001 ETH' : `about ${(Number(fee / 10n ** 10n) / 1e8).toFixed(6)} ETH`; })
    .catch(() => { gas.textContent = 'Shown in your wallet'; });
  chain.balanceOf(account).then((bal) => {
    if (bal >= m.price || message) return;
    warn.textContent = `This wallet holds ${bal < 10n ** 12n ? 'almost no ETH' : `about ${(Number(bal / 10n ** 12n) / 1e6).toFixed(6)} ETH`} on ${NET}. A pull needs ${eth(m.price)} plus a small network fee.`;
    warn.hidden = false;
  }).catch(() => {});
}

const CRANK_STEPS = ['Waiting for your wallet', 'Transaction sent', `Confirmed on ${NET}`];
// Closing this view puts the coin back, and a tap on the coin opens it again while the pull is in flight.
function showCrank(step, hash) {
  if (step != null) S.crank = { step, hash };
  // While the page waits for the wallet, say where to look and offer a way out of a wait that never ends.
  const waiting = S.crank.step === 0;
  if (S.busy && S.crank.step < 3) crankOn();
  ui.openModal('THE MACHINE IS CRANKING', ui.crankView(CRANK_STEPS, S.crank.step, S.crank.hash && txUrl(S.crank.hash), waiting ? {
    hint: 'Open your wallet to approve the pull.',
    action: btn('STOP WAITING', stopWaiting, 's'),
  } : {}), { closed: () => { crankOff(); ui.coinReset(); } });
}

// The wallet never answered (for example the wallet app was put in the background on a phone).
// Let go of the wait so the page works again without a reload. Only offered before anything is sent.
function stopWaiting() {
  if (!S.busy || S.crank?.step !== 0) return;
  S.run = null;
  S.busy = false;
  ui.crankHandle(false);
  crankOff();
  ui.showMessage('STOPPED WAITING', [
    'The page stopped waiting for your wallet. Nothing was sent from this page.',
    'If the request is still open in your wallet, reject it there before you try again, so you do not pay twice. If you approve it instead, that pull still goes through.',
  ], [btn('TRY AGAIN', () => showApprove(), 'p', true)], { closed: ui.coinReset });
}

// shownPrice is the price the visitor just agreed to on the Approve view.
async function drop(shownPrice) {
  if (S.busy) return;
  if (!S.session) { chooseWallet(); return; }
  const run = {};
  const mine = () => S.run === run;
  const session = S.session;
  S.run = run;
  S.busy = true;
  ui.crankHandle(true);
  showCrank(0);
  let sentHash = null;
  try {
    // Read the price again right before paying so the coin is always the right size.
    const m = await refresh();
    if (!mine()) return;
    if (!m) throw Object.assign(new Error('rpc unreachable'), { kind: 'offline' });
    if (m.remaining === 0) throw Object.assign(new Error('sold out'), { kind: 'soldout' });
    if (!m.saleOpen) throw Object.assign(new Error('closed'), { kind: 'closed' });
    // Never send a different amount than the one on screen. Show the new price and ask again.
    if (m.price !== shownPrice) throw Object.assign(new Error('price changed'), { kind: 'price' });
    await wallet.ensureChain(session.provider);
    if (!mine()) return;
    const { id, hash } = await chain.pull({
      ...session, price: m.price, shouldSend: mine,
      onSent: (hsh) => {
        sentHash = hsh;
        if (!mine()) {
          // The visitor stopped waiting and then approved in the wallet after all. Pick the pull back up,
          // unless a newer pull already owns the page.
          if (S.busy) return;
          S.run = run;
          S.busy = true;
          ui.crankHandle(true);
          showCrank(1, hsh);
        } else if (ui.modalOpen()) showCrank(1, hsh);
        else S.crank = { step: 1, hash: hsh };
      },
    });
    // A newer pull owns the page. This one landed, so just show the new numbers.
    if (!mine()) { refresh(); return; }
    crankOff();
    const card = S.cardById.get(id);
    if (!card) throw Object.assign(new Error(`card ${id} not in cards.json`), { kind: 'unread', hash });
    // Fetch the card art now, so it is ready when The Peel opens.
    ui.preload(card.img);
    if (ui.modalOpen()) { showCrank(3, hash); await ui.wait(700); }
    S.busy = false;
    S.run = null;
    ui.crankHandle(false);
    // The coin is in the machine now. It comes back when The Peel is closed, not while the gumball drops.
    ui.coinAway();
    ui.closeModal({ quiet: true });
    S.landing = true;
    await Promise.all([ui.dropGumball(card.color), refresh()]);
    showPeel(card, hash);
  } catch (err) {
    console.warn('pull failed', err);
    // The visitor already stopped waiting for this one and has been told. Do not talk over them.
    if (!mine()) return;
    S.busy = false;
    S.run = null;
    S.landing = false;
    ui.crankHandle(false);
    crankOff();
    await showPullError(err, err?.hash || sentHash);
  }
}

async function showPullError(err, hash) {
  const kind = err?.kind === 'network' ? 'network' : chain.errorKind(err);
  const link = hash && txUrl(hash);
  const txLine = link ? h('p', { class: 'msg' }, h('a', { href: link, target: '_blank', rel: 'noopener' }, 'View the transaction')) : null;
  const retry = btn('TRY AGAIN', () => showApprove(), 'p', true);
  const opts = { closed: ui.coinReset };
  const said = S.soldSaid;
  if (kind !== 'offline') await refresh();
  // The machine jams, except when it is empty: that has a sound of its own. It may have just played, if this
  // reading is the one that found the last card gone (someone else took it while the wallet was open).
  if (kind === 'soldout') soldOutSound(true); else if (S.soldSaid === said) sfx.play('jam');
  switch (kind) {
    case 'rejected':
      return ui.showMessage('NO COIN DROPPED', 'You closed the wallet request. Nothing was sent and nothing was charged.', [retry], opts);
    case 'funds':
      return ui.showMessage('NOT ENOUGH ETH', `This wallet does not have enough ETH on ${NET} for the pull and the network fee. Add a little ETH on ${NET} and try again.`, [retry], opts);
    case 'price':
      return S.machine
        ? ui.showMessage('THE PRICE JUST CHANGED', `The price changed while you were at The Machine. A pull is now ${eth(S.machine.price)}. Nothing was charged.`, [btn('CONTINUE', () => showApprove(), 'p', true)], opts)
        : ui.showMessage('THE PRICE JUST CHANGED', 'The price changed while you were at The Machine. Nothing was charged. Try again in a moment.', [], opts);
    case 'soldout':
      return ui.showMessage('SOLD OUT', `All ${S.total} are pulled. The Machine is empty. Nothing was charged.`, [], opts);
    case 'closed':
      return ui.showMessage('CLOSED FOR NOW', 'The Machine is closed for now. Nothing was charged. Check back soon.', [], opts);
    case 'network':
      return ui.showMessage('WRONG NETWORK', `Your wallet is not on ${NET}. Switch networks in your wallet and try again.`, [retry], opts);
    case 'offline':
      return ui.showMessage('COULD NOT REACH THE MACHINE', `Could not reach ${NET}. Nothing was sent. Check your connection and try again.`, [retry], opts);
    case 'reverted':
      return ui.showMessage('THE PULL DID NOT GO THROUGH', [
        'The transaction failed on chain, so no card was pulled. Only the network fee was spent.',
        S.machine && err.price != null && S.machine.price !== err.price ? `The price changed while your wallet was open. A pull is now ${eth(S.machine.price)}.` : null,
        txLine,
      ], [retry], opts);
    case 'lost':
      return ui.showMessage('STILL WAITING', ['The transaction was sent but the page lost track of it. Check it before you try again so you do not pay twice.', txLine], [], opts);
    case 'unread':
      return ui.showMessage('PULL CONFIRMED', ['Your pull confirmed but the page could not read which card dropped. Your Splatz is in your wallet.', txLine], [], opts);
    default:
      return ui.showMessage('SOMETHING JAMMED', [
        hash ? 'Something went wrong after the transaction was sent. Check it before you try again.' : 'The pull did not go through. Nothing was sent from this page.',
        txLine,
      ], hash ? [] : [retry], opts);
  }
}

function showPeel(card, hash) {
  const again = mode() === 'open';
  const view = tokenLink(card.id);
  // The sound goes with the card art. The art was fetched ahead, so as a rule that is the moment the view
  // opens. If the art is slow the sound waits for it, or for the note that says it did not load, but not
  // longer than two seconds and never past the closing of the view.
  let said = false;
  const reveal = () => {
    if (said) return;
    said = true;
    sfx.play('peel', { tier: Math.max(0, TIERS.indexOf(card.rarity)) });
  };
  setTimeout(reveal, 2000);
  ui.openModal('THE PEEL', ui.peelView({
    card, statNames: S.data.statNames, txHash: hash, txLink: txUrl(hash), onArt: reveal,
    actions: [
      again ? btn('CRANK AGAIN', () => { ui.closeModal(); setTimeout(onCoin, 60); }, 'p', true) : null,
      view ? ui.linkBtn(view.label, view.url) : null,
      btn('Close', ui.closeModal, 's', !again),
    ],
  }), {
    closed: () => {
      said = true;
      ui.coinReset(); ui.clearGumball();
      S.landing = false;
      if (S.soldDue) soldOutSound();
    },
  });
}

/* ---------- start ---------- */

async function start() {
  renderStatic();
  setupSound();
  // Free play never starts a pull by itself, and it waits while one is in flight, while the coin is on its way
  // in or out of sight, and while a view is open.
  const blocked = () => S.busy || S.landing || ui.modalOpen() || $('coin').matches('.inserted, .away');
  // The jump scare waits too, and stays away where the CLOSED sign or the SOLD OUT stamp would cover the face.
  ui.setupGlassEgg(() => !blocked() && !['closed', 'soldout'].includes(mode()));
  try {
    await loadCards();
  } catch (err) {
    console.error(err);
    $('ctaSub').textContent = 'The card list did not load. Refresh the page.';
    return;
  }
  render();
  setupPlay({
    blocked,
    coinLive: () => ['open', 'preview'].includes(mode()),
    coinMoves: () => ['open', 'preview', 'closed'].includes(mode()),
    dropCoin: () => onCoin(true),
  });
  $('coin').addEventListener('click', () => onCoin());
  $('retryBtn').addEventListener('click', refresh);
  window.addEventListener('resize', fitNotice);
  if (preview) return;
  await refresh();
  setInterval(() => { if (!document.hidden) refresh(); }, 30_000);
}
start();
