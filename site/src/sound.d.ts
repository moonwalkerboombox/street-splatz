/**
 * Street Splatz sound effects. Everything is synthesized with the Web Audio API.
 *
 *   import { createSound } from './sound.js';
 *   const sound = createSound();                  // once, at module level
 *   button.addEventListener('click', () => sound.play('tap'));
 *   const stop = sound.play('crankLoop');         // while a transaction is pending
 *   stop();                                       // 80 ms fade
 *   sound.play('peel', { tier: 3 });
 *   if (import.meta.hot) import.meta.hot.dispose(() => sound.destroy());
 */
export type SoundName =
  | 'tap' | 'glass' | 'coinPick' | 'coinDrop' | 'crank' | 'crankLoop'
  | 'rattle' | 'chute' | 'peel' | 'jam' | 'soldOut' | 'toggle';

export interface CreateSoundOptions {
  /** localStorage key for the mute state ('on' / 'off'). null or '' disables persistence. Default 'splatz-sound'. */
  storageKey?: string | null;
  /**
   * Use this context instead of creating one. An OfflineAudioContext is detected and rendered
   * without the real time behaviour (no 10 ms lead, no burst guard, no timers).
   * With an injected context no gesture listeners are installed and destroy() will not close it.
   */
  context?: BaseAudioContext;
  /** Where the master output connects. Default context.destination. */
  destination?: AudioNode;
  /**
   * Install capture listeners (pointerdown, pointerup, keydown, touchend) on the global object
   * that call unlock(). Default true. Ignored when a context is injected.
   */
  autoUnlock?: boolean;
}

export interface PlayOptions {
  /** glass: tap count, 0 to 8, raises the pitch by 2.5% per tap. */
  n?: number;
  /** peel: 0 Pavement Card, 1 Fresh Drop, 2 Block Hitter, 3 Street Legend. Clamped, default 0. */
  tier?: number;
  /** Any sound: start this many seconds from now. */
  delay?: number;
  /** crankLoop: stop by itself after this many seconds if stop() was never called. Default 20. */
  max?: number;
}

export interface Sound {
  /**
   * Plays a sound. Never throws; does nothing while muted, for unknown names, when Web Audio is
   * missing, or before the first user gesture (the AudioContext is only created inside one).
   * If the context is suspended or interrupted, the sound starts as soon as resume() succeeds
   * (one shots are dropped if that takes more than 400 ms).
   * Burst guard: the same sound is ignored if asked for again within 30 ms (tap, glass,
   * toggle, coinPick, peel 0) or 120 ms (the rest).
   *
   * play('crankLoop') returns a stop function (safe to call more than once); every other
   * name returns undefined. Only one loop runs at a time: starting another stops the one
   * before. The loop goes silent while the page is hidden and picks up again when it is
   * visible, until stop() or opts.max. For a pending state use crankLoop, not repeated 'crank'.
   */
  play(name: 'crankLoop', opts?: PlayOptions | null): () => void;
  play(name: SoundName, opts?: PlayOptions | null): undefined;
  /** Creates or resumes the AudioContext. Only has an effect inside a user gesture. */
  unlock(): void;
  /** Mutes or unmutes (10 ms ramp) and stores the choice. Default is sound on. */
  setMuted(muted: boolean): void;
  isMuted(): boolean;
  readonly names: SoundName[];
  /** The AudioContext in use, or null/undefined before the first gesture and after destroy(). */
  context(): BaseAudioContext | null | undefined;
  /**
   * Stops the loop, removes every listener and closes the context this instance created
   * (an injected context is only disconnected). The instance is silent afterwards.
   */
  destroy(): void;
}

export function createSound(options?: CreateSoundOptions): Sound;
