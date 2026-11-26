// Sound effects for the machine page. A thin, safe front for sound.js: nothing in here can throw,
// so a browser with no Web Audio (or one that fails halfway) still gets a working machine.
// The admin page never imports this file, so it stays silent.
import { createSound } from './sound.js';

// This file wakes the sound itself (autoUnlock off), so that a visitor who muted it never builds an AudioContext.
let sound = null;
try { sound = createSound({ autoUnlock: false }); } catch { /* no sound */ }
const GESTURES = ['pointerdown', 'pointerup', 'keydown', 'touchend'];
const hasAudio = () => !!(window.AudioContext || window.webkitAudioContext);
let lost = () => {};

// Tests cannot hear. With window.__SFX_TEST__ set before load, every request is written down here.
const log = window.__SFX_TEST__ ? (window.__sfxLog = []) : null;
const note = (name, opts) => log?.push({ ...opts, name, muted: muted(), t: performance.now() });

// False where the browser has no Web Audio. The mute button is not shown there.
export const available = () => !!sound && hasAudio();
// fn runs if a tap shows that this browser has Web Audio but cannot set it up. The mute button goes away then.
export const onLost = (fn) => { lost = fn; };
export function muted() {
  try { return !!sound?.isMuted(); } catch { return false; }
}

function quit() {
  try { sound?.destroy(); } catch { /* gone already */ }
  sound = null;
  GESTURES.forEach((e) => window.removeEventListener(e, wake, true));
}
// Every tap and key press readies the sound, unless it is muted. A gesture that is allowed to start sound
// and still leaves no context means it cannot be set up here, so stop trying.
function wake() {
  if (!sound || muted()) return;
  try {
    sound.unlock();
    if (sound.context() || !(navigator.userActivation?.isActive ?? true)) return;
  } catch { /* the same as no context */ }
  quit();
  try { lost(); } catch { /* the page carries on */ }
}
if (available()) GESTURES.forEach((e) => window.addEventListener(e, wake, true));
if (import.meta.hot) import.meta.hot.dispose(quit);

// One shot. opts: { delay } in seconds, { n } for glass, { tier } for peel.
// A page in the background keeps quiet: nobody is looking at what the sound goes with.
export function play(name, opts) {
  try {
    if (document.hidden) return;
    note(name, opts);
    sound?.play(name, opts);
  } catch { /* sound never breaks the page */ }
}

// The crank, for as long as a pull is pending. Returns stop(), safe to call more than once.
// sound.js stops a loop by itself after 20 seconds unless told how long it may run. A wallet can take far
// longer than that, and the page always stops the crank itself, so the limit is ten minutes.
export function crank() {
  let stop = null; let done = false;
  try { note('crankLoop'); if (!muted()) stop = sound?.play('crankLoop', { max: 600 }); } catch { /* silent */ }
  return () => {
    if (done) return;
    done = true;
    try { note('crankLoop:stop'); stop?.(); } catch { /* silent */ }
  };
}

// The choice is kept by sound.js (localStorage). Turning the sound back on answers with a blip.
export function setMuted(on) {
  try { sound?.setMuted(on); } catch { /* silent */ }
  if (!on) { wake(); play('toggle'); }
}
