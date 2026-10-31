// Pure sample-level synthesis. No DOM or WebAudio here, so tools/audio-check.mjs can
// render and measure exactly the same sounds in Node.

export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const TAU = Math.PI * 2;
const dbToLin = d => Math.pow(10, d / 20);
const onePole = fc => (sr) => 1 - Math.exp(-TAU * fc / sr);

export function normalize(x, peak = .9) {
  let m = 0; for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i]));
  if (m > 0) { const k = peak / m; for (let i = 0; i < x.length; i++) x[i] *= k; }
  return x;
}
function fadeEdges(x, sr, inMs = .3, outMs = 8) {
  const a = Math.floor(sr * inMs / 1000), b = Math.floor(sr * outMs / 1000);
  for (let i = 0; i < a && i < x.length; i++) x[i] *= i / a;
  for (let i = 0; i < b && i < x.length; i++) x[x.length - 1 - i] *= i / b;
  return x;
}
function mixInto(dst, src, at, gain = 1) {
  for (let i = 0; i < src.length && at + i < dst.length; i++) if (at + i >= 0) dst[at + i] += src[i] * gain;
}
// Seamless loops: crossfade tail into head.
function loopify(x, sr, ms = 90) {
  const n = Math.floor(sr * ms / 1000), out = new Float32Array(x.length - n);
  out.set(x.subarray(0, out.length));
  for (let i = 0; i < n; i++) { const k = i / n; out[i] = x[i] * Math.sqrt(k) + x[out.length + i] * Math.sqrt(1 - k); }
  return out;
}

// Sum of exponentially decaying partials plus a brightness-controlled contact burst.
export function modal(sr, modes, { dur = 2, contact = .4, contactMs = 1.2, contactFc = 7000, seed = 1, peak = .9 } = {}) {
  const r = rng(seed), n = Math.floor(sr * dur), x = new Float32Array(n);
  for (const m of modes) {
    if (m.f >= sr * .45) continue;
    const w = TAU * m.f / sr, d = Math.exp(-6.91 / (m.t60 * sr)), rot = 2 * Math.cos(w);
    const ph = r() * .4; // start near zero-crossing so the attack is a clean click
    let y1 = Math.sin(ph) * m.a, y2 = Math.sin(ph - w) * m.a / d, e = 1;
    for (let i = 0; i < n; i++) { x[i] += y1; const y = rot * d * y1 - d * d * y2; y2 = y1; y1 = y; e *= d; if (e < 1e-5) break; }
  }
  const a = onePole(contactFc)(sr), cn = Math.floor(sr * contactMs / 1000 * 6);
  let lp = 0;
  for (let i = 0; i < cn && i < n; i++) { lp += a * ((r() * 2 - 1) - lp); x[i] += lp * contact * Math.exp(-i / (sr * contactMs / 1000)); }
  return fadeEdges(normalize(x, peak), sr, .15, 12);
}

// Struck thick ceramic: inharmonic plate-like series.
export function ceramic(sr, f0, { hard = .6, dur = 1.2, ring = 1, seed = 1, peak = .9 } = {}) {
  const r = rng(seed), ratios = [1, 2.71, 5.18, 8.33, 12.1, 16.4], modes = [];
  ratios.forEach((q, i) => {
    const det = 1 + (r() - .5) * .012;
    const a = Math.pow(.62 + hard * .3, i) * dbToLin((r() - .5) * 4) * (i === 0 ? .9 : 1);
    const t = ring * Math.max(.05, .95 / Math.pow(1 + i, 1.15));
    modes.push({ f: f0 * q * det, a, t60: t });
    if (i < 4) modes.push({ f: f0 * q * det * 1.0035, a: a * .45, t60: t * .9 });
  });
  return modal(sr, modes, { dur, contact: .3 + hard * .9, contactFc: 3500 + hard * 8000, seed: seed + 9, peak });
}

// Crack tick: tiny glassy fracture.
export function tick(sr, f0, seed) {
  return ceramic(sr, f0, { hard: 1, dur: .09, ring: .07, seed, peak: .8 });
}

// Whole plate shattering: thump, power-law shower of shards, tinkling tail.
export function shatter(sr, seed) {
  const r = rng(seed), x = new Float32Array(Math.floor(sr * 2.6));
  mixInto(x, ceramic(sr, 410, { hard: 1, dur: .9, ring: .8, seed: seed + 1, peak: 1 }), 0, .9);
  const n = Math.floor(sr * .18);
  for (let i = 0; i < n; i++) x[i] += Math.sin(TAU * 95 * i / sr) * Math.exp(-i / (sr * .035)) * .9;
  for (let i = 0; i < 64; i++) {
    const t = Math.pow(r(), 2.4) * 2.1, size = Math.pow(r(), 1.6);
    const f = 800 + (1 - size) * 2900;
    const hit = ceramic(sr, f, { hard: .9, dur: .28, ring: .1 + size * .25, seed: seed + 20 + i, peak: 1 });
    mixInto(x, hit, Math.floor(t * sr), (.5 + size * .45) * Math.exp(-t * 1.25));
  }
  return fadeEdges(normalize(x, .95), sr, .05, 40);
}

// Bubble-wrap pop: membrane rupture click, air jet, cavity resonance, table thump, film flutter.
export function pop(sr, { size = 1, seed = 1 } = {}) {
  const r = rng(seed), n = Math.floor(sr * .26), x = new Float32Array(n);
  const s = Math.max(.6, size);
  let lp = 0, prev = 0;
  const aLp = onePole(9000 / Math.sqrt(s))(sr);
  const clickT = sr * (.00045 + r() * .00035) * s;
  for (let i = 0; i < clickT * 8 && i < n; i++) { const w = r() * 2 - 1; lp += aLp * (w - lp); const hp = lp - prev; prev = lp; x[i] += hp * 2.4 * Math.exp(-i / clickT); }
  // air jet, band-limited noise that dies quickly
  let b1 = 0, b2 = 0;
  const fj = (2100 + r() * 1300) / Math.sqrt(s), q = .75, f = 2 * Math.sin(Math.PI * fj / sr), jetT = sr * (.0032 + r() * .002) * s;
  for (let i = 0; i < jetT * 7 && i < n; i++) { const w = r() * 2 - 1; b1 += f * b2; const h = w - b1 - q * b2; b2 += f * h; x[i] += b2 * .85 * Math.exp(-i / jetT); }
  // cavity modes with a downward chirp as the volume collapses
  const f0 = (640 + r() * 380) / s;
  [[1, .95, .013], [1.73 + r() * .2, .55, .009], [2.9 + r() * .4, .32, .006]].forEach(([q2, a, tau]) => {
    let ph = r() * .3; const T = sr * tau * (s > 1 ? 1.3 : 1);
    for (let i = 0; i < T * 7 && i < n; i++) { const fr = f0 * q2 * (1 + .22 * Math.exp(-i / (sr * .004))); ph += TAU * fr / sr; x[i] += Math.sin(ph) * a * Math.exp(-i / T); }
  });
  // thump, with harmonics so that phone speakers keep the weight
  let ph = 0; const T = sr * .017 * Math.sqrt(s), f1 = 175 / Math.sqrt(s), thump = .55 / Math.pow(s, .9);
  for (let i = 0; i < T * 7 && i < n; i++) { ph += TAU * f1 * (1 + .5 * Math.exp(-i / (sr * .006))) / sr; const e = Math.exp(-i / T); x[i] += (Math.sin(ph) + .5 * Math.sin(2 * ph) + .4 * Math.sin(3 * ph) + .25 * Math.sin(5 * ph)) * thump * e; }
  // film flutter: sparse tiny crackles as the plastic settles
  const count = 4 + Math.floor(r() * 7);
  for (let k = 0; k < count; k++) {
    const at = Math.floor(sr * (.006 + Math.pow(r(), 1.6) * .13)), amp = .1 * (1 - at / n) * (.4 + r());
    const fc = 3000 + r() * 5000, t2 = sr * .0006; let p2 = r() * 6;
    for (let i = 0; i < t2 * 6 && at + i < n; i++) { p2 += TAU * fc / sr; x[at + i] += Math.sin(p2) * amp * Math.exp(-i / t2); }
  }
  return fadeEdges(normalize(x, .95), sr, .05, 10);
}

// Crinkled plastic sheet moving: dense filtered crackle.
export function rustle(sr, { dur = 1.1, seed = 1, density = 900 } = {}) {
  const r = rng(seed), n = Math.floor(sr * dur), x = new Float32Array(n);
  for (let k = 0; k < density * dur; k++) {
    const u = r(), env = Math.sin(Math.PI * Math.pow(u, .7));
    const at = Math.floor(u * n), amp = env * Math.pow(r(), 3) * .9, fc = 1800 + r() * 7000, t2 = sr * (.0003 + r() * .0009);
    let p = r() * 6;
    for (let i = 0; i < t2 * 5 && at + i < n; i++) { p += TAU * fc / sr; x[at + i] += Math.sin(p) * amp * Math.exp(-i / t2); }
  }
  return fadeEdges(normalize(x, .8), sr, 3, 40);
}

// Rising-pitch water bubble (Minnaert resonance), the sound of a drop hitting water.
export function bubble(sr, f0, { rise = 1.6, tau = .03, seed = 1, impact = .25 } = {}) {
  const r = rng(seed), n = Math.floor(sr * Math.max(.15, tau * 7)), x = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr; ph += TAU * f0 * (1 + rise * t / (tau * 4)) / sr;
    x[i] = Math.sin(ph) * Math.min(1, t / .0012) * Math.exp(-t / tau);
  }
  if (impact > 0) { let lp = 0; const a = onePole(4200)(sr), T = sr * .0018; for (let i = 0; i < T * 5 && i < n; i++) { lp += a * ((r() * 2 - 1) - lp); x[i] += lp * impact * 2 * Math.exp(-i / T); } }
  return fadeEdges(normalize(x, .9), sr, .2, 6);
}

// Drop into a tray: splash transient, then one or two bubbles.
export function waterDrop(sr, seed) {
  const r = rng(seed), x = new Float32Array(Math.floor(sr * .55));
  const f = 620 + r() * 760;
  mixInto(x, bubble(sr, f, { rise: 1.1 + r() * 1.2, tau: .028 + r() * .03, seed, impact: .5 }), 0, 1);
  if (r() > .35) mixInto(x, bubble(sr, f * (1.4 + r() * .8), { rise: 1.8, tau: .014 + r() * .012, seed: seed + 5, impact: 0 }), Math.floor(sr * (.03 + r() * .08)), .45);
  return fadeEdges(normalize(x, .9), sr, .2, 15);
}

// Descending gloop of viscous liquid collapsing.
export function gloop(sr, seed, { base = 150, count = 6, span = .55 } = {}) {
  const r = rng(seed), x = new Float32Array(Math.floor(sr * (span + .5)));
  for (let i = 0; i < count; i++) {
    const t = Math.pow(i / count, 1.3) * span, f = base * (1.5 - .8 * i / count) * (.85 + r() * .3);
    const at = Math.floor(t * sr), g = .9 - .1 * i;
    mixInto(x, bubble(sr, f, { rise: .55, tau: .04 + r() * .03, seed: seed + i, impact: .05 }), at, g);
    // Upper partial so the gloop survives phone speakers, which cut below ~300 Hz.
    mixInto(x, bubble(sr, f * 3.1, { rise: .7, tau: .018 + r() * .012, seed: seed + i + 50, impact: 0 }), at, g * .55);
  }
  return fadeEdges(normalize(x, .9), sr, 1, 40);
}

// Tiny wet tick for ferrofluid spikes.
export function wetTick(sr, seed) {
  const r = rng(seed);
  return bubble(sr, 1400 + r() * 2200, { rise: 1.4, tau: .004 + r() * .005, seed, impact: .1 });
}

// Bell for pendulum balls: doublet partials give slow beating.
export function bell(sr, f0, { seed = 1, dur = 3.4, t = 2.6 } = {}) {
  const r = rng(seed), ratios = [1, 2.76, 5.4, 8.93], amps = [1, .34, .13, .05], modes = [];
  ratios.forEach((q, i) => {
    const det = 1 + (r() - .5) * .006, tt = t / Math.pow(1 + i, 1.1);
    modes.push({ f: f0 * q * det, a: amps[i], t60: tt });
    modes.push({ f: f0 * q * det * (1 + (.0009 + r() * .0011) / (1 + i * .4)), a: amps[i] * .55, t60: tt * .92 });
  });
  modes.push({ f: f0 * .5, a: .1, t60: t * .7 });
  return modal(sr, modes, { dur, contact: .14, contactMs: .8, contactFc: 6500, seed: seed + 3, peak: .8 });
}

// --- Continuous loops -------------------------------------------------------

// Grain loop: Poisson clicks of tiny sand particles. Spectrum tilted, not flat.
export function sandGrains(sr, seed = 1, dur = 5, density = 2600) {
  const r = rng(seed), n = Math.floor(sr * (dur + .09)), x = new Float32Array(n);
  for (let k = 0; k < density * dur; k++) {
    const at = Math.floor(r() * n), fc = 2200 + Math.pow(r(), 1.5) * 7500, T = sr * (.00016 + r() * .0007);
    const cluster = .55 + .45 * Math.sin(at / sr * 3.1 + 1.3 * Math.sin(at / sr * 7.7));
    const amp = Math.pow(r(), 2.4) * cluster; let p = r() * 6;
    for (let i = 0; i < T * 5 && at + i < n; i++) { p += TAU * fc / sr; x[at + i] += Math.sin(p) * amp * Math.exp(-i / T); }
  }
  return normalize(loopify(x, sr), .8);
}
// Brown-ish body: friction of a tool dragged through a mass.
export function brownLoop(sr, seed = 2, dur = 6, leak = .985) {
  const r = rng(seed), n = Math.floor(sr * (dur + .09)), x = new Float32Array(n);
  let y = 0; for (let i = 0; i < n; i++) { y = y * leak + (r() * 2 - 1) * (1 - leak) * 6; x[i] = y; }
  return normalize(loopify(x, sr), .8);
}
// Gentle water-stirring bed: low noise with random small bubbles.
export function waterLoop(sr, seed = 3, dur = 6) {
  const r = rng(seed), n = Math.floor(sr * (dur + .09)), x = brownLoopRaw(n, r, .97);
  for (let k = 0; k < 42; k++) mixInto(x, bubble(sr, 240 + r() * 900, { rise: 1, tau: .012 + r() * .03, seed: seed + k, impact: 0 }), Math.floor(r() * (n - sr * .3)), .12 + r() * .25);
  return normalize(loopify(x, sr), .8);
}
function brownLoopRaw(n, r, leak) { const x = new Float32Array(n); let y = 0; for (let i = 0; i < n; i++) { y = y * leak + (r() * 2 - 1) * (1 - leak) * 2; x[i] = y * .35; } return x; }

// Periodic drone in D: integer cycles per loop so it never clicks, doublets for motion.
export function drone(sr, root = 36.71, dur = 8, seed = 4) {
  const r = rng(seed), n = Math.floor(sr * dur), x = new Float32Array(n);
  const q = f => Math.max(1, Math.round(f * dur)) / dur;
  const parts = [[1, 1], [1.5, .55], [2, .7], [3, .32], [4, .18], [4.5, .14], [6, .08], [8, .05]];
  for (const [m, a] of parts) for (const d of [0, .25]) {
    const f = q(root * m) + d, w = TAU * f / sr, ph = r() * 6;
    for (let i = 0; i < n; i++) x[i] += Math.sin(w * i + ph) * a * .6;
  }
  return normalize(x, .8);
}

// D lydian pentatonic ladder used for all pitched specimens.
const LADDER = [0, 2, 4, 7, 9];
export function dScale(i, base = 146.83) { const o = Math.floor(i / 5), k = ((i % 5) + 5) % 5; return base * Math.pow(2, o + LADDER[k] / 12); }

// Stereo room impulse: early reflections plus exponential tail that darkens with time.
export function roomIR(sr, { rt = 1.4, pre = .012, seed = 7 } = {}) {
  const r = rng(seed), n = Math.floor(sr * rt * 1.25), L = new Float32Array(n), R = new Float32Array(n);
  [L, R].forEach((ch, c) => {
    let lp = 0;
    const start = Math.floor(pre * sr);
    for (let i = start; i < n; i++) {
      const t = (i - start) / sr, e = Math.exp(-6.91 * t / rt);
      const a = 1 - Math.exp(-TAU * (9000 * Math.exp(-t * 3.2 / rt) + 500) / sr);
      lp += a * ((r() * 2 - 1) - lp);
      ch[i] = lp * e * Math.min(1, t / .006);
    }
    [.011, .017, .023, .031, .041, .053].forEach((d, k) => { const j = Math.floor((d + c * .0013 * (k + 1)) * sr); if (j < n) ch[j] += (k % 2 ? -1 : 1) * .35 / (1 + k * .4); });
    fadeEdges(ch, sr, .05, 60);
  });
  let e = 0; for (let i = 0; i < n; i++) e += L[i] * L[i] + R[i] * R[i];
  const k = 1 / Math.sqrt(e / 2);
  for (let i = 0; i < n; i++) { L[i] *= k; R[i] *= k; }
  return [L, R];
}

// --- Breaking and pushing ---------------------------------------------------

// Thousands of tempered-glass dice raining down, then settling into a heap.
export function glassRain(sr, seed = 1, dur = 2.8) {
  const r = rng(seed), n = Math.floor(sr * dur), x = new Float32Array(n);
  for (let k = 0; k < 5200; k++) {
    const u = Math.pow(r(), 1.5), t = u * (dur - .12), env = Math.min(1, t / .12) * Math.exp(-t * 1.25);
    const size = Math.pow(r(), 2.2), fc = 1900 + (1 - size) * 5200 + r() * 700, T = sr * (.0005 + size * .0035);
    const at = Math.floor(t * sr), amp = env * (.12 + size * .6) * r(); let p = r() * 6;
    for (let i = 0; i < T * 5 && at + i < n; i++) { p += TAU * fc / sr; x[at + i] += Math.sin(p) * amp * Math.exp(-i / T); }
  }
  return fadeEdges(normalize(x, .85), sr, 2, 60);
}

// Pane letting go: a hard crack, dense crazing, a chest-level thump.
export function paneBreak(sr, seed = 1) {
  const r = rng(seed), x = new Float32Array(Math.floor(sr * 1.1));
  mixInto(x, rustle(sr, { dur: .34, density: 5200, seed }), 0, .9);
  mixInto(x, ceramic(sr, 760, { hard: 1, dur: .5, ring: .35, seed: seed + 1, peak: 1 }), 0, .8);
  mixInto(x, ceramic(sr, 1620, { hard: 1, dur: .3, ring: .2, seed: seed + 2, peak: 1 }), Math.floor(sr * .006), .5);
  let ph = 0;
  for (let i = 0; i < sr * .4; i++) { const t = i / sr; ph += TAU * (46 + 80 * Math.exp(-t * 26)) / sr; const e = Math.exp(-t * 11); x[i] += (Math.sin(ph) + .55 * Math.sin(2 * ph) + .4 * Math.sin(3 * ph) + .22 * Math.sin(5 * ph)) * e * .75; }
  return fadeEdges(normalize(x, .95), sr, .05, 30);
}

// Lake ice: a shock wave disperses through the sheet, so highs arrive first and it sings downward.
export function iceBoom(sr, seed = 1, { power = 1 } = {}) {
  const r = rng(seed), dur = .9 + power * .9, n = Math.floor(sr * dur), x = new Float32Array(n);
  const paths = 3 + Math.floor(power * 3);
  for (let k = 0; k < paths; k++) {
    const start = k * (.012 + r() * .05), f0 = 4300 + r() * 2200, f1 = 170 + r() * 150, span = .34 + r() * .34 + power * .18, a = .8 / (1 + k * .45);
    let ph = r() * 6; const s0 = Math.floor(start * sr);
    for (let i = 0; i < span * sr * 1.4 && s0 + i < n; i++) {
      const u = i / (span * sr), f = f1 + (f0 - f1) * Math.pow(Math.max(0, 1 - u), 3.1);
      ph += TAU * f / sr;
      const e = Math.min(1, i / (sr * .0015)) * Math.exp(-u * 3.1);
      x[s0 + i] += (Math.sin(ph) + .28 * Math.sin(2.02 * ph)) * e * a;
    }
  }
  let ph = 0;
  for (let i = 0; i < sr * .6 && i < n; i++) { const t = i / sr; ph += TAU * (58 + 42 * Math.exp(-t * 22)) / sr; const e = Math.exp(-t * (7 - power * 2)); x[i] += (Math.sin(ph) + .5 * Math.sin(2 * ph) + .36 * Math.sin(3 * ph) + .2 * Math.sin(5 * ph)) * e * (.55 + power * .4); }
  mixInto(x, tick(sr, 2600 + r() * 1800, seed + 8), 0, .55);
  return fadeEdges(normalize(x, .92), sr, .05, 40);
}

// Thick chocolate snapping: dry brittle click, short woody body.
export function chocSnap(sr, seed = 1, { size = 1 } = {}) {
  const r = rng(seed), f0 = (1050 + r() * 650) / size;
  const modes = [[1, 1, .05], [1.83 + r() * .2, .7, .036], [2.9 + r() * .3, .5, .024], [4.4 + r() * .4, .3, .014]].map(([q, a, t]) => ({ f: f0 * q, a, t60: t * size }));
  const x = new Float32Array(Math.floor(sr * .22));
  mixInto(x, modal(sr, modes, { dur: .16, contact: 1.5, contactMs: .55, contactFc: 11000, seed, peak: 1 }), 0, 1);
  let ph = 0;
  for (let i = 0; i < sr * .08; i++) { const t = i / sr; ph += TAU * (205 / size) / sr; x[i] += (Math.sin(ph) + .5 * Math.sin(2 * ph) + .35 * Math.sin(3 * ph)) * .4 * Math.exp(-t * 62); }
  mixInto(x, rustle(sr, { dur: .1, density: 1100, seed: seed + 3 }), Math.floor(sr * .004), .12);
  return fadeEdges(normalize(x, .95), sr, .03, 10);
}

// Sand slump: soft low whump with a burst of grains that dies away.
export function slump(sr, seed = 1, { size = 1 } = {}) {
  const r = rng(seed), dur = .55 + size * .4, n = Math.floor(sr * dur), x = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < sr * .22; i++) { const t = i / sr; ph += TAU * (95 / Math.sqrt(size)) * (1 + .6 * Math.exp(-t * 34)) / sr; x[i] += (Math.sin(ph) + .55 * Math.sin(2 * ph) + .4 * Math.sin(3 * ph) + .22 * Math.sin(5 * ph)) * Math.exp(-t * 19) * .8; }
  let y = 0;
  for (let i = 0; i < n; i++) { const t = i / n; y = y * .96 + (r() * 2 - 1) * .08; x[i] += y * Math.exp(-t * 6) * .9; }
  for (let k = 0; k < 2600 * dur; k++) {
    const u = Math.pow(r(), 1.8), at = Math.floor(u * n), amp = Math.exp(-u * 5) * Math.pow(r(), 2) * .55, fc = 1500 + r() * 6000, T = sr * (.00018 + r() * .0007); let p = r() * 6;
    for (let i = 0; i < T * 5 && at + i < n; i++) { p += TAU * fc / sr; x[at + i] += Math.sin(p) * amp * Math.exp(-i / T); }
  }
  return fadeEdges(normalize(x, .92), sr, .1, 30);
}

// Rubber on wet glass: stick-slip impulses ringing the blade. Pitch follows playback rate.
export function squeakLoop(sr, seed = 2, dur = 2, rate = 240) {
  const r = rng(seed), n = Math.floor(sr * dur), x = new Float32Array(n), period = sr / (Math.round(rate * dur) / dur);
  const modes = [[1850, .62, .0022], [3050, .42, .0014], [5200, .16, .0007]];
  for (let k = 0; k * period < n; k++) {
    const at = Math.floor(k * period), amp = .55 + .45 * r();
    for (const [f, a, tau] of modes) { const T = sr * tau, w = TAU * f / sr; for (let i = 0; i < T * 6; i++) x[(at + i) % n] += Math.sin(w * i) * Math.exp(-i / T) * a * amp; }
  }
  let m = 0; for (let i = 0; i < n; i++) m += x[i]; m /= n;
  for (let i = 0; i < n; i++) x[i] -= m;
  return normalize(x, .8);
}

// Bright, soft two-note confirmation when a surface comes up perfectly clean.
export function gleam(sr, seed = 1) {
  const x = new Float32Array(Math.floor(sr * 3));
  [[587.33, 0, 1], [880, .09, .8], [1174.66, .19, .55], [1760, .3, .3]].forEach(([f, d, g], i) => mixInto(x, bell(sr, f, { seed: seed + i, dur: 2.5, t: 2 }), Math.floor(d * sr), g));
  return fadeEdges(normalize(x, .8), sr, .2, 40);
}
