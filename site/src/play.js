// Free play. Things to do with the machine that cost nothing: turn the handle, knock on it, poke the chute flap,
// and carry the coin to the slot by hand. Nothing in here talks to the chain. The only way from here to a pull
// is dropCoin, which is the same step a tap on the coin takes (main.js).
import { $, playCue, rattlePile, reducedMotion } from './ui.js';

// Puts a class on for the length of its animation, starting it over if it is already on.
// (Only a class that is already on needs the layout read that starts its animation over.)
const timers = new WeakMap();
function flash(el, cls, ms) {
  const mine = timers.get(el) || {};
  timers.set(el, mine);
  clearTimeout(mine[cls]);
  if (el.classList.contains(cls)) {
    el.classList.remove(cls);
    void el.getBoundingClientRect();
  }
  el.classList.add(cls);
  mine[cls] = setTimeout(() => el.classList.remove(cls), ms);
}

// blocked(): a pull is in flight, the coin is on its way in, or a view is open. Free play waits.
// coinLive(): the coin would be taken right now (the machine is open, or this is the preview build).
// coinMoves(): a tap on the coin would send it flying, so it may be carried too.
// dropCoin(): the visitor let go of the coin on the slot.
export function setupPlay({ blocked, coinLive, coinMoves, dropCoin }) {
  const mach = $('machine'); const coin = $('coin'); const crank = $('crank'); const crankBtn = $('crankBtn');
  const flap = mach.querySelector('.m-flap'); const slot = mach.querySelector('.m-slot');

  // "It needs a coin": the slot blinks and the coin hops, so a turn of the handle teaches the real thing.
  function needsCoin() {
    if (!coinLive()) return;
    flash(mach, 'nocoin', 900);
    flash(coin, 'nudge', 700);
  }

  /* ---------- the handle ---------- */

  // One turn finishes before the next can start, so a held key or a burst of clicks is one turn and one sound.
  const idle = () => !blocked() && !['spin', 'turn', 'ratchet'].some((c) => crank.classList.contains(c));
  // A key held down repeats itself. Each of these answers once per press.
  for (const b of [crankBtn, $('lidHit'), $('flapBtn')]) {
    b.addEventListener('keydown', (e) => { if (e.repeat && (e.key === 'Enter' || e.key === ' ')) e.preventDefault(); });
  }
  // One ratcheting turn.
  function turnHandle() {
    if (!idle()) return;
    flash(crank, 'ratchet', 720);
    playCue('crank');
    rattlePile();
    needsCoin();
  }
  // With a mouse or a pen the handle can also be pulled round, one tooth at a time. It only turns one way.
  // (A finger on a phone taps it instead, so a swipe that starts on the handle still scrolls the page.)
  const TOOTH = 30;
  let grip = null; let pulled = false;
  const angle = (e) => {
    const r = crankBtn.getBoundingClientRect();
    return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * (180 / Math.PI);
  };
  crankBtn.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch' || e.button !== 0 || !idle()) return;
    grip = { id: e.pointerId, at: angle(e), turned: 0, teeth: 0 };
    crank.classList.remove('ratchet', 'settle');
    try { crankBtn.setPointerCapture(e.pointerId); } catch { /* the pointer is gone already */ }
  });
  crankBtn.addEventListener('pointermove', (e) => {
    if (!grip || e.pointerId !== grip.id) return;
    const now = angle(e);
    const step = ((now - grip.at + 540) % 360) - 180;
    grip.at = now;
    if (step <= 0) return;
    grip.turned += step;
    crank.style.transform = `rotate(${grip.turned.toFixed(1)}deg)`;
    const teeth = Math.floor(grip.turned / TOOTH);
    if (teeth > grip.teeth) {
      grip.teeth = teeth;
      playCue('ratchet');
      // Every half turn shakes the pile.
      if (teeth % 6 === 0) rattlePile();
    }
  });
  const letGo = (e) => {
    if (!grip || e.pointerId !== grip.id) return;
    const g = grip; grip = null;
    if (g.turned < 4) { crank.style.transform = ''; return; }
    // That was a pull, not a tap. The handle falls into its next tooth and the art is back where it started
    // (a whole turn looks the same as none).
    pulled = true;
    setTimeout(() => { pulled = false; }, 60);
    crank.classList.add('settle');
    crank.style.transform = `rotate(${Math.ceil(g.turned / 360) * 360}deg)`;
    setTimeout(() => { crank.classList.remove('settle'); crank.style.transform = ''; }, reducedMotion() ? 0 : 300);
    if (g.turned >= 150) { rattlePile(); needsCoin(); }
  };
  crankBtn.addEventListener('pointerup', letGo);
  crankBtn.addEventListener('pointercancel', letGo);
  crankBtn.addEventListener('click', () => { if (pulled) { pulled = false; return; } turnHandle(); });

  /* ---------- knocks and the chute flap ---------- */

  // One knock, and one poke, at a time: each waits for its own animation.
  const knock = () => {
    if (blocked() || mach.classList.contains('knock')) return;
    flash(mach, 'knock', 380);
    playCue('knock');
    rattlePile();
  };
  $('lidHit').addEventListener('click', knock);
  $('bodyHit').addEventListener('click', knock);
  $('flapBtn').addEventListener('click', () => {
    if (blocked() || flap.classList.contains('poke')) return;
    flash(flap, 'poke', 520);
    playCue('flap');
  });

  /* ---------- the coin, carried to the slot ---------- */

  // With a mouse or a pen, a press that moves the coin START pixels picks it up. A finger has to rest on the
  // coin for HOLD ms first, without sliding SLOP pixels: a thumb that swipes over the coin is scrolling the page,
  // and the slot is straight above the coin, so a swipe must never be taken for a coin carried to it.
  // A press that never leaves the coin's own box is still the click it always was, however much it wobbles.
  const START = 12; const SLOP = 8; const HOLD = 160; const DWELL = 120;
  let hold = null; let swallow = false; let backTimer = null;
  // The slot's catch area: generous above and to the sides, shallow below, where the handle is.
  const overSlot = (x, y) => {
    const s = slot.getBoundingClientRect(); const m = mach.getBoundingClientRect();
    const dx = x - (s.left + s.width / 2); const dy = y - (s.top + s.height / 2);
    const rx = Math.max(34, m.width * 0.17); const ry = dy > 0 ? Math.max(10, m.width * 0.04) : rx;
    return (dx / rx) ** 2 + (dy / ry) ** 2 <= 1;
  };
  const skipClick = () => { swallow = true; setTimeout(() => { swallow = false; }, 80); };
  const putDown = () => {
    coin.classList.remove('held', 'aim');
    mach.classList.remove('slot-near');
    coin.style.removeProperty('--dx');
    coin.style.removeProperty('--dy');
  };
  const slideHome = () => {
    coin.classList.add('back');
    putDown();
    clearTimeout(backTimer);
    backTimer = setTimeout(() => coin.classList.remove('back'), 320);
  };
  const lift = (h) => {
    if (blocked() || !coinMoves()) return false;
    h.carried = true;
    coin.classList.remove('back');
    coin.classList.add('held');
    return true;
  };
  // Puts the coin under the pointer. The page may have been scrolled since the press (a mouse wheel), which
  // moves the coin's resting spot and not the pointer.
  const place = (h) => {
    const x = h.px + window.scrollX - h.sx; const y = h.py + window.scrollY - h.sy;
    coin.style.setProperty('--dx', `${(x - h.x).toFixed(1)}px`);
    coin.style.setProperty('--dy', `${(y - h.y).toFixed(1)}px`);
    // It is heard leaving its resting place, once.
    if (!h.out && (x < h.box.left || x > h.box.right || y < h.box.top || y > h.box.bottom)) { h.out = true; playCue('coinPick'); }
    const near = h.out && overSlot(h.px, h.py);
    if (near && !h.near) h.nearAt = performance.now();
    h.near = near;
    mach.classList.toggle('slot-near', near);
    coin.classList.toggle('aim', near);
  };
  // Gives the carry up: the pointer was lost, Escape was pressed or the window lost focus. Nothing is dropped.
  // down: the button may still be down, so letting go of it later, wherever, is not a click on the coin.
  const notAClick = () => skipClick();
  const cancel = (down = false) => {
    const h = hold;
    if (!h) return;
    hold = null;
    clearTimeout(h.timer);
    try { coin.releasePointerCapture(h.id); } catch { /* it had no hold on the pointer */ }
    if (!h.carried) return;
    slideHome();
    if (down) window.addEventListener('pointerup', notAClick, { once: true, capture: true });
  };
  coin.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary || e.button !== 0) return;
    // A press that never ended (its pointer was lost without a word) does not block the next one.
    cancel();
    window.removeEventListener('pointerup', notAClick, { capture: true });
    const r = coin.getBoundingClientRect();
    const h = hold = {
      id: e.pointerId, touch: e.pointerType === 'touch', x: e.clientX, y: e.clientY, px: e.clientX, py: e.clientY,
      sx: window.scrollX, sy: window.scrollY, box: { left: r.left, right: r.right, top: r.top, bottom: r.bottom },
      carried: false, out: false, slid: false, near: false, nearAt: 0, timer: null,
    };
    if (h.touch) h.timer = setTimeout(() => { if (hold === h && !h.slid && lift(h)) place(h); }, HOLD);
    // Keep hearing about this pointer when it leaves the coin.
    try { coin.setPointerCapture(e.pointerId); } catch { /* the pointer is gone already */ }
  });
  coin.addEventListener('pointermove', (e) => {
    const h = hold;
    if (!h || e.pointerId !== h.id) return;
    h.px = e.clientX; h.py = e.clientY;
    if (!h.carried) {
      const far = Math.hypot(h.px - h.x, h.py - h.y);
      // A finger that slides before the coin has lifted is scrolling (or tapping with a wobble), not carrying.
      if (h.touch) { if (far >= SLOP) h.slid = true; return; }
      if (far < START || !lift(h)) return;
    }
    place(h);
  });
  // While a finger carries the coin the page holds still. Before that, the browser is free to scroll.
  coin.addEventListener('touchmove', (e) => { if (hold?.carried && e.cancelable) e.preventDefault(); }, { passive: false });
  coin.addEventListener('contextmenu', (e) => { if (hold?.touch) e.preventDefault(); });
  const release = (e) => {
    const h = hold;
    if (!h || e.pointerId !== h.id) return;
    if (e.type !== 'pointerup') { cancel(); return; }
    hold = null;
    clearTimeout(h.timer);
    if (!h.carried) {
      // Pressed on the coin and let go off it: that was never a click on the coin.
      if (e.clientX < h.box.left || e.clientX > h.box.right || e.clientY < h.box.top || e.clientY > h.box.bottom) skipClick();
      return;
    }
    // It never left its resting place: a click with a wobble, or a slow press. The click that follows is the coin.
    if (!h.out) { putDown(); return; }
    // Carrying the coin away is never also a click on it.
    skipClick();
    // In the slot only if it was let go there, and a finger must also have stopped there: a thumb that lifts
    // on its way past has thrown the coin, not put it in.
    const hit = h.near && overSlot(e.clientX, e.clientY) && (!h.touch || performance.now() - h.nearAt >= DWELL) && !blocked() && coinMoves();
    mach.classList.remove('slot-near');
    if (hit) {
      // The coin keeps --dx and --dy, where it was let go, until it is put back (ui.coinReset).
      coin.classList.remove('held', 'aim');
      dropCoin();
      if (coin.classList.contains('inserted')) return;
    }
    // Anywhere else it slides home and nothing is pulled.
    slideHome();
  };
  coin.addEventListener('pointerup', release);
  coin.addEventListener('pointercancel', release);
  coin.addEventListener('lostpointercapture', (e) => { if (hold && e.pointerId === hold.id) cancel(true); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && hold?.carried) cancel(true); });
  window.addEventListener('blur', () => cancel(true));
  window.addEventListener('scroll', () => { if (hold?.carried) place(hold); }, { passive: true });
  // Registered before the coin's own click handler, so a swallowed click never reaches it.
  coin.addEventListener('click', (e) => {
    if (!swallow) return;
    swallow = false;
    e.stopImmediatePropagation();
    e.preventDefault();
  }, true);
}
