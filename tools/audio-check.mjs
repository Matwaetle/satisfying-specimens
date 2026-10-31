// Numerical checks of every synthesized sound: node tools/audio-check.mjs
import * as S from '../js/core/synth.js';

const sr = 48000;
function fftMag(x) {
  const n = 1 << Math.ceil(Math.log2(Math.min(x.length, 65536))), re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < n && i < x.length; i++) re[i] = x[i] * (.5 - .5 * Math.cos(2 * Math.PI * i / (Math.min(n, x.length) - 1)));
  for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; } }
  for (let l = 2; l <= n; l <<= 1) { const a = -2 * Math.PI / l; for (let i = 0; i < n; i += l) for (let k = 0; k < l / 2; k++) { const c = Math.cos(a * k), s = Math.sin(a * k), u = i + k, v = u + l / 2, tr = re[v] * c - im[v] * s, ti = re[v] * s + im[v] * c; re[v] = re[u] - tr; im[v] = im[u] - ti; re[u] += tr; im[u] += ti; } }
  return { mag: Array.from({ length: n / 2 }, (_, i) => Math.hypot(re[i], im[i])), n };
}
function measure(x) {
  let peak = 0, sum = 0, dc = 0, clip = 0, nan = 0;
  for (const v of x) { if (!Number.isFinite(v)) nan++; const a = Math.abs(v); peak = Math.max(peak, a); sum += v * v; dc += v; if (a >= 1) clip++; }
  const { mag, n } = fftMag(x);
  let c = 0, t = 0, low = 0, high = 0, phone = 0;
  mag.forEach((m, i) => { const f = i * sr / n, e = m * m; c += f * m; t += m; if (f < 40) low += e; if (f > 12000) high += e; if (f > 300) phone += e; });
  const total = mag.reduce((s, m) => s + m * m, 0) || 1;
  // Time from peak until the envelope falls 60 dB.
  let pi = 0; for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) === peak) { pi = i; break; }
  let t60 = x.length - 1; const th = peak * .001; for (let i = x.length - 1; i > pi; i--) if (Math.abs(x[i]) > th) { t60 = i; break; }
  return { peak, rms: Math.sqrt(sum / x.length), crest: peak / (Math.sqrt(sum / x.length) || 1), dc: Math.abs(dc / x.length), clip, nan, centroid: c / (t || 1), low: low / total, high: high / total, phone: phone / total, tail: (t60 - pi) / sr, end: Math.abs(x[x.length - 1]) };
}

const items = {
  'pop size 1': S.pop(sr, { size: 1, seed: 3 }), 'pop size 2.6': S.pop(sr, { size: 2.6, seed: 3 }),
  'rustle': S.rustle(sr, { seed: 2 }), 'ceramic clack': S.ceramic(sr, 700, { hard: .7, dur: .6, ring: .5, seed: 2 }),
  'tick': S.tick(sr, 2400, 3), 'shatter': S.shatter(sr, 5), 'bowl': S.ceramic(sr, 440, { hard: .55, dur: 4.5, ring: 3.6, seed: 120 }),
  'bell low': S.bell(sr, S.dScale(1, 293.66), { seed: 2 }), 'bell top': S.bell(sr, S.dScale(16, 293.66), { seed: 3 }),
  'water drop': S.waterDrop(sr, 3), 'gloop': S.gloop(sr, 4), 'wet tick': S.wetTick(sr, 4),
  'sand grains (loop)': S.sandGrains(sr, 1), 'brown (loop)': S.brownLoop(sr), 'water (loop)': S.waterLoop(sr), 'drone (loop)': S.drone(sr),
};
let bad = 0;
console.log('name'.padEnd(20), 'peak  crest cent(Hz) <40Hz  >12k   >300Hz tail(s) end');
for (const [k, x] of Object.entries(items)) {
  const m = measure(x), fails = [];
  if (m.nan) fails.push('NaN');
  if (m.clip) fails.push('clip');
  if (m.dc > .01) fails.push('dc ' + m.dc.toFixed(4));
  if (m.low > .3 && !/drone|brown/.test(k)) fails.push('sub-heavy');
  if (m.high > .12) fails.push('harsh');
  if (m.phone < .15 && !/drone|brown/.test(k)) fails.push('inaudible on phone');
  if (!/loop/.test(k) && m.end > .005) fails.push('click at end');
  if (fails.length) bad++;
  console.log(k.padEnd(20), m.peak.toFixed(2).padEnd(5), m.crest.toFixed(1).padEnd(5), m.centroid.toFixed(0).padEnd(8), m.low.toFixed(3).padEnd(6), m.high.toFixed(3).padEnd(6), m.phone.toFixed(2).padEnd(6), m.tail.toFixed(2).padEnd(7), m.end.toFixed(4), fails.join(', '));
}
// Pop variety: consecutive variants must really differ.
const specs = Array.from({ length: 24 }, (_, i) => S.pop(sr, { size: 1, seed: i }));
const cents = specs.map(x => measure(x).centroid);
console.log('pop centroid range', Math.min(...cents).toFixed(0), '-', Math.max(...cents).toFixed(0));
// Loop seam: first and last samples must join without a jump.
for (const k of ['sand grains (loop)', 'brown (loop)', 'water (loop)', 'drone (loop)']) { const x = items[k]; console.log(k, 'seam jump', Math.abs(x[0] - x[x.length - 1]).toFixed(4)); }
// Worst-case bell pile-up before the mastering chain: all 16 together at play gain.
const mix = new Float32Array(sr * 3);
for (let i = 0; i < 16; i++) { const b = S.bell(sr, S.dScale(i + 1, 293.66), { seed: 200 + i }); const g = .5 * .3 * .9; for (let j = 0; j < mix.length && j < b.length; j++) mix[j + 0] += b[j] * g; }
console.log('all-16 alignment peak (pre-limiter)', measure(mix).peak.toFixed(2));
console.log(bad ? `${bad} item(s) flagged` : 'all items pass');
process.exit(0);
