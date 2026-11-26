// Street Splatz sound effects, all synthesized with the Web Audio API.
// API: sound.d.ts. Measurements: node render.mjs

const SIN = 'sine', SQR = 'square', SAW = 'sawtooth', TRI = 'triangle', LP = 'lowpass', BP = 'bandpass', HP = 'highpass';
const set = (p, v, t) => p.setValueAtTime(v, t);
const lin = (p, v, t) => p.linearRampToValueAtTime(v, t);
const exp = (p, v, t) => p.exponentialRampToValueAtTime(v, t);
const noop = () => {};
const SHORT = /^(tap|glass|toggle|coinPick|peel0)$/; // retrigger after 30 ms, the rest 120 ms

// written by render.mjs --calibrate: peaks near -6 dBFS
const TRIM = {
  tap: 0.373, glass: 0.25, coinPick: 0.336, coinDrop: 0.44, crank: 0.606, crankLoop: 0.556, rattle: 0.412, chute: 0.543, peel0: 0.298, peel1: 0.269, peel2: 0.24, peel3: 0.218, jam: 0.65, soldOut: 0.288, toggle: 0.526,
};

export function createSound({ storageKey = 'splatz-sound', context, destination, autoUnlock = true } = {}) {
	let ctx = context, bus, master, noiseBuf, seed = 1, muted = false, off, loop, gone, turn = 0;
	try { muted = storageKey && localStorage.getItem(storageKey) === 'off'; } catch {}

	const G = globalThis, doc = G.document, AC = G.AudioContext || G.webkitAudioContext, last = {};
	const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
	// in a user gesture? `lax` answers where userActivation is missing
	const gesture = (lax) => G.navigator?.userActivation?.isActive ?? lax;

	function ensure(create) {
		try {
			if (!ctx && create && AC && !gone) ctx = new AC();
			if (ctx && !bus) {
				// bus > soft clip (linear to 0.6, ceiling 0.88) > mute > out
				off = !!ctx.startRendering;
				const shaper = ctx.createWaveShaper();
				shaper.curve = Float32Array.from({ length: 2049 }, (_, i) => {
					const u = Math.abs(i / 512 - 2);
					return Math.sign(i - 1024) * (u < 0.6 ? u : 0.6 + 0.28 * Math.tanh((u - 0.6) / 0.28));
				});
				master = ctx.createGain();
				master.gain.value = +!muted;
				shaper.connect(master).connect(destination || ctx.destination);
				noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
				noiseBuf.getChannelData(0).forEach((_, i, d) => { d[i] = rnd() * 2 - 1; });
				bus = ctx.createGain();
				bus.gain.value = 0.5;
				bus.connect(shaper);
			}
		} catch {
			// a context whose graph cannot be built is closed and not tried again
			try { if (!context) ctx.close().catch(noop); } catch {}
			ctx = bus = null; gone = 1;
		}
		return !!bus;
	}

	// now, or once a suspended context has resumed
	function running(fn) {
		if (off || ctx.state === 'running') fn();
		else if (ctx.state !== 'closed') ctx.resume().then(fn, noop);
	}

	function unlock() { try { ensure(gesture(true)) && running(noop); } catch {} }

	// shape: 'x' decay, 's' sustain, 'r' rising swell
	function amp(out, t, dur, peak, shape = 'x', a = 0.002) {
		const g = ctx.createGain(), p = g.gain, end = t + dur;
		set(p, 0, t);
		lin(p, peak, shape === 'r' ? end - 0.02 : t + a);
		if (shape === 's') lin(p, peak * 0.7, end - 0.035);
		if (shape === 'x') exp(p, 1e-4, end);
		else lin(p, 0, end);
		g.connect(out);
		return g;
	}

	// .value too, or an oscillator's start phase varies per play
	function sweep(p, t, f0, f1, dur) {
		p.value = f0;
		set(p, f0, t);
		if (f1 && f1 !== f0) exp(p, f1, t + dur);
	}

	function tone(out, t, type, f0, f1, dur, peak, shape, a) {
		const o = ctx.createOscillator();
		o.type = type;
		sweep(o.frequency, t, f0, f1, dur);
		o.connect(amp(out, t, dur, peak, shape, a));
		o.start(t); o.stop(t + dur + 0.02);
	}

	function filt(out, t, type, f0, f1, dur, q) {
		const f = ctx.createBiquadFilter();
		f.type = type; f.Q.value = q;
		sweep(f.frequency, t, f0, f1, dur);
		f.connect(out);
		return f;
	}

	function noise(out, t, type, f0, f1, q, dur, peak, shape, a) {
		const s = ctx.createBufferSource(), g = amp(out, t, dur, peak, shape, a);
		s.buffer = noiseBuf; s.loop = true;
		s.connect(filt(g, t, type, f0, f1, dur, q));
		s.start(t, rnd() * 1.5); s.stop(t + dur + 0.02);
		return g;
	}

	const pluck = (out, t, from, to, q = 3) => filt(out, t, LP, from, to, 0.09, q);
	// low cut, so phone speakers get the harmonics
	const thin = (out, t, f) => filt(out, t, HP, f, 0, 0, 0.7);

	function stab(out, t, type, freq, dur, peak, q, shape = 's') {
		const f = pluck(out, t, Math.min(freq * 6, 5000), Math.min(freq * 3.5, 3000), q);
		tone(f, t, type, freq, 0, dur, peak, shape, 0.004);
		tone(f, t, type, freq * 2, 0, dur, peak * 0.4, shape, 0.004);
	}

	const power = (out, t, root, dur, peak) =>
		[1, 1.5, 2].forEach((m, i) => stab(out, t, i ? SAW : SQR, root * m, dur, peak * (i ? 0.8 : 1), 1.2));

	function ping(out, t, f, dur, peak) {
		tone(out, t, TRI, f * 0.85, f, dur, peak);
		tone(out, t, SIN, f * 1.48, 0, dur * 0.7, peak * 0.5);
		tone(out, t, SIN, f * 2.09, 0, dur * 0.4, peak * 0.25);
	}

	function thud(out, t, f, dur, peak) {
		tone(out, t, SIN, f, f * 0.4, dur, peak, 'x', 0.003);
		noise(out, t, LP, 900, 250, 0.7, dur * 0.5, peak * 0.7);
	}

	function click(out, t, v) {
		noise(out, t, BP, 2100, 0, 1.4, 0.02, v * 1.6);
		noise(out, t, BP, 750, 0, 1.2, 0.03, v * 0.7);
		tone(out, t, SQR, 520, 210, 0.026, v * 0.3);
	}

	// LFO: [osc, depth]
	function wobble(param, t, f0, f1, dur) {
		const l = ctx.createOscillator(), d = ctx.createGain();
		l.frequency.value = f0;
		if (dur) { set(l.frequency, f0, t); lin(l.frequency, f1, t + dur); }
		l.connect(d).connect(param); l.start(t);
		return [l, d.gain];
	}

	function growl(out, t, dur) {
		const g = ctx.createGain(), o = ctx.createOscillator();
		o.type = SAW; o.frequency.value = 61;
		const [lfo, depth] = wobble(g.gain, t, 9.1);
		for (const [p, v] of [[g.gain, 0.2], [depth, 0.1]]) {
			set(p, 0, t); lin(p, v, t + 0.03);
			if (dur) { set(p, v, t + dur - 0.06); lin(p, 0, t + dur); }
		}
		o.connect(thin(filt(g, t, LP, 900, 0, 0, 1), t, 110)); g.connect(out); o.start(t);
		if (dur) { o.stop(t + dur + 0.02); lfo.stop(t + dur + 0.02); }
		return [o, lfo];
	}

	const sounds = {
		__proto__: null,
		tap(o, t) {
			tone(o, t, SIN, 950, 420, 0.055, 1);
			noise(o, t, HP, 2500, 0, 0.7, 0.012, 0.35);
		},
		glass(o, t, { n }) {
			const k = 1 + 0.025 * Math.max(0, Math.min(8, +n || 0));
			tone(o, t, SIN, 1480 * k, 0, 0.16, 0.8);
			tone(o, t, SIN, 2310 * k, 0, 0.09, 0.4);
			tone(o, t, SIN, 3620 * k, 0, 0.03, 0.2);
			tone(o, t, SIN, 330, 180, 0.03, 0.9);
			noise(o, t, BP, 1800, 0, 1, 0.008, 0.5);
		},
		coinPick(o, t) {
			ping(o, t, 1245, 0.07, 0.8);
			ping(o, t + 0.045, 1865, 0.11, 1);
		},
		coinDrop(o, t) {
			ping(o, t, 2050, 0.06, 0.8);
			ping(o, t + 0.1, 1730, 0.055, 0.65);
			ping(o, t + 0.17, 2280, 0.05, 0.5);
			noise(o, t + 0.1, BP, 2600, 0, 3, 0.02, 0.3);
			thud(o, t + 0.29, 150, 0.2, 1);
			tone(o, t + 0.29, TRI, 870, 0, 0.16, 0.22);
		},
		// 7 teeth 100 ms apart: retrigger every 0.7 s
		crank(o, t) {
			growl(o, t, 0.74);
			for (let i = 0; i < 7; i++) click(o, t + 0.005 + i * 0.1, i % 3 ? 0.7 : 1);
		},
		rattle(o, t) {
			noise(o, t, BP, 3200, 2200, 0.8, 0.46, 0.12, 'x', 0.03);
			for (let i = 0; i < 17; i++) {
				const at = t + 0.44 * (i / 17) ** 1.25 + rnd() * 0.012;
				const f = 620 + rnd() * 1250, v = (0.7 + rnd() * 0.3) * (1 - i / 26);
				tone(o, at, SIN, f, f * 0.72, 0.035, v);
				noise(o, at, BP, f * 2.2, 0, 2, 0.012, v * 0.5);
			}
		},
		chute(o, t) {
			const g = noise(o, t, LP, 1900, 950, 1.2, 0.43, 1.3, 'r');
			const [lfo, depth] = wobble(g.gain, t, 13, 34, 0.43);
			set(depth, 0, t); lin(depth, 0.6, t + 0.4); lin(depth, 0, t + 0.43);
			lfo.stop(t + 0.45);
			tone(o, t, TRI, 260, 150, 0.43, 0.3, 'r');
			thud(o, t + 0.44, 175, 0.13, 0.9);
			noise(o, t + 0.44, BP, 1300, 0, 1, 0.025, 0.7);
			thud(o, t + 0.545, 150, 0.06, 0.4);
			noise(o, t + 0.545, BP, 1100, 0, 1, 0.02, 0.3);
		},
		peel0(o, t) {
			tone(o, t, SIN, 420, 900, 0.12, 1, 'x', 0.004);
			tone(pluck(o, t, 5000, 1500), t, SQR, 840, 1260, 0.15, 0.3);
			noise(o, t, BP, 2400, 0, 1, 0.03, 0.4);
		},
		peel1(o, t) {
			stab(o, t, SQR, 659.3, 0.11, 0.8);
			stab(o, t + 0.11, SQR, 987.8, 0.32, 0.8, 3, 'x');
			stab(o, t + 0.11, SAW, 493.9, 0.32, 0.5, 3, 'x');
		},
		peel2(o, t) {
			power(o, t, 196, 0.12, 0.4);
			power(o, t + 0.12, 233.1, 0.12, 0.4);
			power(o, t + 0.24, 261.6, 0.4, 0.6);
			thud(o, t + 0.24, 165, 0.2, 0.35);
			noise(o, t + 0.24, HP, 1800, 0, 0.7, 0.22, 0.2);
		},
		peel3(o, t) {
			const hit = t + 0.3;
			// riser, a 25 ms gap, then the hit
			tone(pluck(o, t, 3000, 2400), t, SAW, 170, 1300, 0.275, 0.6, 'r');
			noise(o, t, BP, 500, 5000, 2, 0.275, 0.6, 'r');
			thud(o, hit, 170, 0.4, 0.7);
			noise(o, hit, LP, 7000, 900, 0.7, 0.45, 0.9);
			[293.7, 370, 440].forEach((f, i) => stab(o, hit + i * 0.075, SQR, f * 2, 0.075, 0.5));
			power(o, hit, 146.8, 0.225, 0.45);
			power(o, hit + 0.225, 293.7, 0.34, 0.75);
			stab(o, hit + 0.225, SQR, 1174.7, 0.34, 0.35);
			// sparkle rings on after the chord
			for (let i = 0; i < 9; i++) {
				tone(o, hit + 0.24 + i * 0.055 + rnd() * 0.01, TRI, [2093, 2349, 2637, 2794, 2960][(rnd() * 5) | 0], 0, 0.22, 0.7 + i * 0.05);
			}
		},
		jam(o, t) {
			[110, 98].forEach((f, i) => {
				const at = t + i * 0.125, lp = thin(pluck(o, at, 2400, 1300, 1), at, 260);
				tone(lp, at, SAW, f, 0, 0.11, 0.9, 's', 0.006);
				tone(lp, at, SQR, f * 2, 0, 0.11, 0.4, 's', 0.006);
			});
		},
		soldOut(o, t) {
			thud(o, t, 125, 0.2, 0.8);
			noise(o, t, BP, 1500, 0, 0.8, 0.025, 0.5);
			tone(o, t, SIN, 618, 0, 0.68, 0.6);
			tone(o, t, SIN, 1131, 0, 0.6, 0.35);
			tone(o, t, TRI, 1787, 0, 0.4, 0.15);
		},
		toggle(o, t) {
			tone(o, t, TRI, 880, 0, 0.04, 0.8);
			tone(o, t + 0.035, TRI, 1320, 0, 0.045, 1);
		},
	};

	// returns stop(): 80 ms fade
	function crankLoop(out, t) {
		const nodes = growl(out, t, 0);
		let next = t + 0.005, i = 0, timer;
		const fill = (until) => {
			if (next < ctx.currentTime) next = ctx.currentTime;
			for (; next < until; next += 0.1, i++) click(out, next, i % 3 ? 0.7 : 1);
		};
		if (off) fill(ctx.length / ctx.sampleRate);
		else { fill(t + 0.35); timer = setInterval(() => fill(ctx.currentTime + 0.35), 100); }
		return () => {
			clearInterval(timer);
			const now = ctx.currentTime, p = out.gain;
			p.cancelScheduledValues(now); set(p, p.value, now); lin(p, 0, now + 0.08);
			nodes.forEach((n) => n.stop(now + 0.09));
		};
	}

	function play(name, opts) {
		opts = opts || {};
		const isLoop = name === 'crankLoop', asked = Date.now();
		let end, dead, me, stop = isLoop ? noop : undefined;
		try {
			const key = name === 'peel' ? 'peel' + Math.max(0, Math.min(3, opts.tier | 0)) : name;
			// only a user gesture creates the context
			if ((!isLoop && (muted || !sounds[key])) || !ensure(gesture(false))) return stop;
			const go = () => {
				try {
					// stopped, going, hidden, or a one shot too late after resume()
					if (dead || end || (isLoop ? doc?.hidden : Date.now() - asked > 400)) return;
					const t = ctx.currentTime + (off ? 0 : 0.01) + Math.max(0, +opts.delay || 0);
					if (!off && !isLoop && Math.abs(t - last[key]) < (SHORT.test(key) ? 0.03 : 0.12)) return;
					last[key] = t;
					const out = ctx.createGain(), keep = seed;
					out.gain.value = TRIM[key] || 1;
					out.connect(bus);
					// one shots repeat exactly, the rattle has 8 variants
					seed = key === 'rattle' ? 9e8 * (turn++ % 8) + 1 : 1;
					if (isLoop) end = crankLoop(out, t);
					else sounds[key](out, t, opts);
					seed = keep + 1;
				} catch {}
			};
			if (isLoop) {
				if (loop) loop.stop();
				loop = me = {
					go: () => running(go),
					end() { try { end(); } catch {} end = 0; },
					stop() { dead = 1; me.end(); clearTimeout(cap); if (loop === me) loop = 0; },
				};
				stop = me.stop;
				const cap = off || setTimeout(stop, (+opts.max || 20) * 1000);
			}
			running(go);
		} catch {}
		return stop;
	}

	function setMuted(v) {
		muted = !!v;
		try { storageKey && localStorage.setItem(storageKey, muted ? 'off' : 'on'); } catch {}
		try { master.gain.setTargetAtTime(+!muted, ctx.currentTime, 0.01); } catch {}
	}

	// gestures re-arm the context; a hidden page pauses the crank
	const evs = ['pointerdown', 'pointerup', 'keydown', 'touchend'];
	const auto = autoUnlock && !context && AC && G.addEventListener;
	const vis = () => { if (loop) loop[doc.hidden ? 'end' : 'go'](); };
	if (auto) evs.forEach((e) => G.addEventListener(e, unlock, true));
	doc?.addEventListener('visibilitychange', vis);

	function destroy() {
		gone = 1;
		if (loop) loop.stop();
		if (auto) evs.forEach((e) => G.removeEventListener(e, unlock, true));
		doc?.removeEventListener('visibilitychange', vis);
		try { context ? master.disconnect() : ctx.close().catch(noop); } catch {}
		ctx = bus = null;
	}

	const names = 'tap glass coinPick coinDrop crank crankLoop rattle chute peel jam soldOut toggle'.split(' ');
	return { play, unlock, setMuted, isMuted: () => !!muted, names, context: () => ctx, destroy };
}
