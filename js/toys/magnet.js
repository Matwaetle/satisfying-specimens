// Magnet and steel shot. Press and thousands of balls race in; let go and they rain apart.
import { ballClick, sandGrains, brownLoop, rng } from '../core/synth.js';

const BALL_V = `#version 300 es
in vec3 inst; uniform vec2 asp; uniform float rad,grow; out vec2 q; out float lift;
void main(){ vec2 c=vec2(gl_VertexID&1,(gl_VertexID>>1)&1)*2.-1.; q=c; lift=inst.z; gl_Position=vec4((inst.xy+c*rad*grow*(1.+inst.z*.28))/(asp*.5),0.,1.); }`;
const BALL_F = /* glsl */ `in vec2 q; in float lift; out vec4 o;
void main(){ float d2=dot(q,q); if(d2>1.) discard; float aa=smoothstep(1.,.88,d2);
  vec3 N=vec3(q,sqrt(1.-d2)); vec3 Rf=reflect(vec3(0.,0.,-1.),N); vec3 Ry=normalize(vec3(Rf.x,Rf.z,-Rf.y));
  vec3 env=studio(Ry); if(Ry.y<0.) env=vec3(.01)*(1.+Ry.y);
  vec3 c=vec3(.78,.79,.82)*env*.72+vec3(.03,.031,.034)*(.5+.5*N.y);
  c*=.6+.4*smoothstep(0.,.5,N.z)+lift*.25;
  o=vec4(c*aa,aa); }`;
const SHADOW_F = /* glsl */ `in vec2 q; out vec4 o; void main(){ float a=smoothstep(1.,.2,length(q))*.75; o=vec4(0.,0.,0.,a); }`;
const FLOOR = /* glsl */ `in vec2 v; out vec4 o; uniform vec2 asp,mag; uniform float pull;
void main(){ vec2 p=(v-.5)*asp;
  float grain=fbm(vec2(p.x*3.,p.y*520.))-.5;
  vec3 N=normalize(vec3(0.,grain*.5,1.));
  float glow=.03+.05*smoothstep(1.2,0.,length(p-vec2(-.25,.3)));
  vec3 c=vec3(.058,.056,.056)*(1.+grain*.6)*glow*5.;
  float d=length(p-mag); c+=vec3(.5,.32,.2)*pull*.03*exp(-d*d*16.);
  o=vec4(c,1.); }`;

export function create(env) {
  const { kit, gl, post, input, audio, seed, quality } = env;
  const pB = kit.program(BALL_F, BALL_V), pSh = kit.program(SHADOW_F, BALL_V), pF = kit.program(FLOOR);
  const bus = audio && audio.bus({ gain: 1, send: .16 });
  let snd = {}, roll, roll2, rumble;
  if (bus) {
    const sr = bus.sr;
    snd.click = Array.from({ length: 14 }, (_, i) => bus.buffer(ballClick(sr, seed + i * 5, { size: i < 11 ? 1 : 1.5 })));
    roll = bus.loop(bus.buffer(sandGrains(sr, 61, 4, 2300)), { gain: 0, hp: 2400, lp: 11000, send: .07 });
    roll2 = bus.loop(bus.buffer(sandGrains(sr, 63, 4, 800)), { gain: 0, hp: 800, lp: 4800, rate: .7, send: .1 });
    rumble = bus.loop(bus.buffer(brownLoop(sr, 17)), { gain: 0, hp: 60, lp: 420, send: .05 });
  }
  const r = rng(seed);
  const N = quality === 'low' ? 1200 : 1800, RAD = quality === 'low' ? .0105 : .0088;
  const x = new Float32Array(N), y = new Float32Array(N), px = new Float32Array(N), py = new Float32Array(N), lift = new Float32Array(N);
  const nxt = new Int32Array(N); let head = new Int32Array(1), gw = 1, gh = 1;
  const inst = new Float32Array(N * 3);
  const vao = gl.createVertexArray(), buffer = gl.createBuffer();
  gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, inst.byteLength, gl.DYNAMIC_DRAW);
  // Both programs must agree on the slot, so the location is taken from one and bound for the other.
  const loc = gl.getAttribLocation(pB.h, 'inst'), loc2 = gl.getAttribLocation(pSh.h, 'inst');
  for (const l of new Set([loc, loc2])) { gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 3, gl.FLOAT, false, 12, 0); gl.vertexAttribDivisor(l, 1); }
  gl.bindVertexArray(null);
  kit.owned.push({ vao, buffer });

  let W = 2, H = 2, asp = [0, 0];
  let mag = { x: 0, y: 0, tx: 0, ty: 0, on: false, id: null, s: 0 }, hitAcc = 0, speedS = 0, boom = 0;

  function scatter() {
    for (let i = 0; i < N; i++) {
      x[i] = (r() - .5) * asp[0] * .96; y[i] = (r() - .5) * asp[1] * .96;
      const a = r() * 6.28, sp = r() * .002; px[i] = x[i] - Math.cos(a) * sp; py[i] = y[i] - Math.sin(a) * sp;
    }
  }
  const local = p => [(p.x - .5) * asp[0], (p.y - .5) * asp[1]];
  function hitSound(sp, ax, ay) {
    if (!bus) return;
    const g = Math.min(.5, .04 + sp * .34);
    bus.play(snd.click[Math.floor(r() * 14)], { gain: g, rate: .85 + r() * .4, pan: ax / asp[0] * 1.2, delay: r() * .014 });
  }
  input.on({
    down(p) { const l = local(p); mag.id = p.id; mag.on = true; mag.x = mag.tx = l[0]; mag.y = mag.ty = l[1]; env.buzz(8); },
    move(p) { if (mag.id === p.id) { const l = local(p); mag.tx = l[0]; mag.ty = l[1]; } },
    up(p) {
      if (mag.id !== p.id) return;
      mag.id = null; mag.on = false;
      // The magnet lifts away: the packed ball springs apart in one shove.
      let moved = 0;
      for (let i = 0; i < N; i++) {
        const dx = x[i] - mag.x, dy = y[i] - mag.y, d = Math.hypot(dx, dy) + 1e-4;
        if (d < .55) { const sp = (1 - d / .55) * (.005 + r() * .011); px[i] -= dx / d * sp + (r() - .5) * .002; py[i] -= dy / d * sp + (r() - .5) * .002; moved++; }
      }
      boom = Math.min(1, moved / (N * .4));
      if (bus && boom > .1) for (let k = 0; k < 44 * boom; k++) bus.play(snd.click[Math.floor(r() * 14)], { gain: .08 + r() * .22 * Math.exp(-k * .05), rate: .8 + r() * .5, pan: (r() - .5) * .9, delay: Math.pow(r(), 1.6) * .75 });
      env.buzz(22);
    },
  });
  function stepPhysics(dt) {
    const d2 = dt * dt, keep = Math.exp(-dt * (mag.on ? 2.4 : 2.6)), S = mag.s * 9;
    for (let i = 0; i < N; i++) {
      let ax = 0, ay = 0;
      if (S > 0) { const dx = mag.x - x[i], dy = mag.y - y[i], d = Math.hypot(dx, dy) + .02, f = S / (d + .1); ax = dx / d * f; ay = dy / d * f; }
      const vx = (x[i] - px[i]) * keep, vy = (y[i] - py[i]) * keep;
      px[i] = x[i]; py[i] = y[i];
      x[i] += vx + ax * d2; y[i] += vy + ay * d2;
    }
    // Uniform grid: only touching neighbours are ever compared.
    const c = RAD * 2.05; gw = Math.ceil(asp[0] / c) + 2; gh = Math.ceil(asp[1] / c) + 2;
    if (head.length !== gw * gh) head = new Int32Array(gw * gh);
    head.fill(-1);
    for (let i = 0; i < N; i++) {
      const gx = Math.max(0, Math.min(gw - 1, Math.floor((x[i] + asp[0] / 2) / c) + 1)), gy = Math.max(0, Math.min(gh - 1, Math.floor((y[i] + asp[1] / 2) / c) + 1)), k = gy * gw + gx;
      nxt[i] = head[k]; head[k] = i;
    }
    const Dbase = RAD * 2, Dbase2 = Dbase * Dbase, vth = .0028;
    for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
      for (let i = head[gy * gw + gx]; i >= 0; i = nxt[i]) {
        for (let oy = 0; oy <= 1; oy++) for (let ox = oy ? -1 : 0; ox <= 1; ox++) {
          const qx = gx + ox, qy = gy + oy; if (qx < 0 || qx >= gw || qy >= gh) continue;
          for (let j = ox === 0 && oy === 0 ? nxt[i] : head[qy * gw + qx]; j >= 0; j = nxt[j]) {
            const dx = x[j] - x[i], dy = y[j] - y[i], q = dx * dx + dy * dy;
            if (q >= Dbase2 || q < 1e-10) continue;
            // Under the magnet balls climb over each other, so the pile packs into a mound.
            const D = Dbase * (1 - .42 * Math.min(1, (lift[i] + lift[j]) * .6)), d = Math.sqrt(q); if (d >= D) continue;
            const nx = dx / d, ny = dy / d, push = (D - d) * .5 * .85;
            const rv = ((x[i] - px[i]) - (x[j] - px[j])) * nx + ((y[i] - py[i]) - (y[j] - py[j])) * ny;
            if (rv > vth) hitAcc += rv * 12;
            if (rv > vth * 2.4 && r() < .08) hitSound(Math.min(1, rv / .02), x[i], y[i]);
            x[i] -= nx * push; y[i] -= ny * push; x[j] += nx * push; y[j] += ny * push;
          }
        }
      }
    }
    const lx = asp[0] / 2 - RAD, ly = asp[1] / 2 - RAD;
    for (let i = 0; i < N; i++) {
      if (x[i] > lx || x[i] < -lx) { const vx = x[i] - px[i], w = x[i] > 0 ? lx : -lx; if (Math.abs(vx) > .003 && r() < .1) hitSound(Math.abs(vx) / .012, x[i], y[i]); x[i] = w; px[i] = w + vx * .45; }
      if (y[i] > ly || y[i] < -ly) { const vy = y[i] - py[i], w = y[i] > 0 ? ly : -ly; if (Math.abs(vy) > .003 && r() < .1) hitSound(Math.abs(vy) / .012, x[i], y[i]); y[i] = w; py[i] = w + vy * .45; }
    }
  }
  return {
    resize(w, h) {
      W = w; H = h; const na = w > h ? [w / h, 1] : [1, h / w], first = !asp[0];
      asp = na;
      if (first) scatter();
    },
    reset() { const id = mag.id; if (id !== null) { mag.id = null; mag.on = false; } scatter(); },
    attract(t) {
      const id = 4, on = (t % 5) < 3.2;
      const px_ = { id, x: .5 + .25 * Math.sin(t * .7), y: .5 + .2 * Math.cos(t * .9), pressed: true };
      if (on && mag.id !== id) input.emit('down', px_);
      if (on) input.emit('move', px_);
      if (!on && mag.id === id) input.emit('up', px_);
    },
    frame(t, dt) {
      const k = 1 - Math.exp(-dt * 22);
      mag.x += (mag.tx - mag.x) * k; mag.y += (mag.ty - mag.y) * k;
      mag.s += ((mag.on ? 1 : 0) - mag.s) * Math.min(1, dt * (mag.on ? 7 : 18));
      const h = Math.min(dt, 1 / 40) / 2;
      stepPhysics(h); stepPhysics(h);

      let sum = 0;
      for (let i = 0; i < N; i++) {
        const v = Math.hypot(x[i] - px[i], y[i] - py[i]); sum += v;
        // Balls lift a little toward the magnet, so the pile reads as a mound.
        const d = Math.hypot(x[i] - mag.x, y[i] - mag.y), tgt = mag.s * Math.max(0, 1 - d / .34);
        lift[i] += (tgt - lift[i]) * Math.min(1, dt * 9);
        inst[i * 3] = x[i]; inst[i * 3 + 1] = y[i]; inst[i * 3 + 2] = lift[i];
      }
      const speed = Math.min(1, sum / N / (h * 1.35));
      speedS += (speed - speedS) * Math.min(1, dt * 16);
      if (bus) {
        const s = Math.sqrt(speedS);
        roll.set({ gain: .5 * s, hp: 1800 + 1800 * speedS, lp: 7000 + 5000 * speedS, rate: .8 + speedS * .5 }, .03);
        roll2.set({ gain: .42 * s, lp: 2800 + 3000 * speedS }, .03);
        rumble.set({ gain: .55 * speedS + .16 * boom, lp: 240 + 400 * speedS }, .05);
        boom *= Math.exp(-dt * 3);
      }
      post.begin();
      kit.draw(pF, { asp, mag: [mag.x, mag.y], pull: mag.s });
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferSubData(gl.ARRAY_BUFFER, 0, inst);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.bindVertexArray(vao);
      kit.use(pSh, { asp, rad: RAD, grow: 1.7 }); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, N);
      kit.use(pB, { asp, rad: RAD, grow: 1.02 }); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, N);
      gl.bindVertexArray(null);
      gl.disable(gl.BLEND);
      post.end({ exposure: 1.25, bloom: .09, vig: .65, grain: .013 }, dt);
    },
    destroy() { bus && bus.destroy(); },
  };
}
