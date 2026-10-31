// One AudioContext, one mastering chain, one shared room. Specimens get a bus.
import { roomIR } from './synth.js';

class Bus {
  constructor(engine, gain, send) {
    this.e = engine;
    const c = engine.ctx;
    this.out = c.createGain(); this.out.gain.value = gain;
    this.dry = c.createGain();
    this.wet = c.createGain(); this.wet.gain.value = send;
    this.dry.connect(this.out); this.wet.connect(engine.reverb);
    this.out.connect(engine.input);
    this.loops = new Set();
    this.alive = true;
    this.send = send;
  }
  get now() { return this.e.ctx.currentTime; }
  get sr() { return this.e.ctx.sampleRate; }
  buffer(x) {
    const b = this.e.ctx.createBuffer(1, x.length, this.e.ctx.sampleRate);
    b.copyToChannel(x, 0);
    return b;
  }
  play(buf, { gain = 1, rate = 1, pan = 0, delay = 0, send = null } = {}) {
    if (!this.alive || this.e.voices >= this.e.maxVoices) return;
    const c = this.e.ctx, s = c.createBufferSource(), g = c.createGain();
    s.buffer = buf; s.playbackRate.value = rate; g.gain.value = gain;
    let tail = g;
    if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); tail = p; }
    s.connect(g); tail.connect(this.dry);
    if (send !== null && this.send > 0) { const w = c.createGain(); w.gain.value = send / this.send; tail.connect(w); w.connect(this.wet); s.addEventListener('ended', () => w.disconnect(), { once: true }); }
    else tail.connect(this.wet);
    this.e.voices++;
    s.addEventListener('ended', () => { this.e.voices--; tail.disconnect(); g.disconnect(); }, { once: true });
    s.start(c.currentTime + delay);
  }
  // Looping voice with gain, band and rate controls smoothed to avoid zipper noise.
  loop(buf, { gain = 0, lp = 18000, hp = 20, rate = 1, send = .2 } = {}) {
    const c = this.e.ctx, s = c.createBufferSource(), hpf = c.createBiquadFilter(), lpf = c.createBiquadFilter(), g = c.createGain(), w = c.createGain();
    s.buffer = buf; s.loop = true; s.playbackRate.value = rate;
    hpf.type = 'highpass'; hpf.frequency.value = hp; lpf.type = 'lowpass'; lpf.frequency.value = lp; lpf.Q.value = .4; g.gain.value = gain; w.gain.value = send;
    s.connect(hpf); hpf.connect(lpf); lpf.connect(g); g.connect(this.dry); g.connect(w); w.connect(this.wet);
    s.start(0, Math.random() * buf.duration);
    const v = {
      set: ({ gain: a, lp: b, hp: d, rate: e }, tc = .03) => {
        const t = c.currentTime;
        if (a !== undefined) g.gain.setTargetAtTime(a, t, tc);
        if (b !== undefined) lpf.frequency.setTargetAtTime(b, t, tc);
        if (d !== undefined) hpf.frequency.setTargetAtTime(d, t, tc);
        if (e !== undefined) s.playbackRate.setTargetAtTime(e, t, tc);
      },
      stop: () => { try { s.stop(); } catch { /* already stopped */ } s.disconnect(); hpf.disconnect(); lpf.disconnect(); g.disconnect(); w.disconnect(); this.loops.delete(v); },
    };
    this.loops.add(v);
    return v;
  }
  setSend(v) { this.send = v; this.wet.gain.setTargetAtTime(v, this.e.ctx.currentTime, .1); }
  destroy() {
    if (!this.alive) return;
    this.alive = false;
    const t = this.e.ctx.currentTime;
    this.out.gain.setTargetAtTime(0, t, .06);
    this.wet.gain.setTargetAtTime(0, t, .06);
    setTimeout(() => { [...this.loops].forEach(l => l.stop()); this.out.disconnect(); this.wet.disconnect(); this.dry.disconnect(); }, 900);
  }
}

export class AudioEngine {
  constructor() {
    this.voices = 0;
    this.maxVoices = /Mobi|Android|iPhone|iPad/.test(navigator.userAgent) ? 40 : 96;
    this.muted = false;
    try { this.muted = localStorage.getItem('specimen.muted') === '1'; } catch { /* storage may be blocked */ }
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC({ latencyHint: 'interactive' });
    if (navigator.audioSession) { try { navigator.audioSession.type = 'playback'; } catch { /* optional API */ } }
    const c = this.ctx;

    this.input = c.createGain();
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 28; hp.Q.value = .6;
    const tilt = c.createBiquadFilter(); tilt.type = 'peaking'; tilt.frequency.value = 3400; tilt.gain.value = -1.5; tilt.Q.value = .7;
    const air = c.createBiquadFilter(); air.type = 'highshelf'; air.frequency.value = 11000; air.gain.value = -2;
    const glue = c.createDynamicsCompressor(); glue.threshold.value = -20; glue.ratio.value = 2; glue.knee.value = 12; glue.attack.value = .012; glue.release.value = .22;
    const sat = c.createWaveShaper(); sat.curve = softClip(); sat.oversample = '2x';
    const limit = c.createDynamicsCompressor(); limit.threshold.value = -3; limit.ratio.value = 20; limit.knee.value = 1; limit.attack.value = .002; limit.release.value = .09;
    this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : .9;
    this.input.connect(hp); hp.connect(tilt); tilt.connect(air); air.connect(glue); glue.connect(sat); sat.connect(limit); limit.connect(this.master); this.master.connect(c.destination);

    this.reverb = c.createConvolver();
    const [L, R] = roomIR(c.sampleRate, { rt: 1.5 });
    const ir = c.createBuffer(2, L.length, c.sampleRate); ir.copyToChannel(L, 0); ir.copyToChannel(R, 1);
    this.reverb.buffer = ir; this.reverb.normalize = false;
    const rv = c.createGain(); rv.gain.value = .8;
    this.reverb.connect(rv); rv.connect(this.input);

    const unlock = () => { if (c.state !== 'running') c.resume(); };
    for (const ev of ['pointerdown', 'pointerup', 'touchend', 'keydown']) addEventListener(ev, unlock, { capture: true, passive: true });
  }
  bus({ gain = 1, send = .15 } = {}) { return new Bus(this, gain, send); }
  setMuted(m) {
    this.muted = m;
    this.master.gain.setTargetAtTime(m ? 0 : .9, this.ctx.currentTime, .03);
    try { localStorage.setItem('specimen.muted', m ? '1' : '0'); } catch { /* storage may be blocked */ }
  }
  suspend() { if (this.ctx.state === 'running') this.ctx.suspend(); }
  resume() { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); }
}

function softClip() {
  const n = 2048, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(x * 1.1) / Math.tanh(1.1); }
  return c;
}
