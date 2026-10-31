// No.06 Sand block. The knife drags, a slab stands a moment, tips, and lands showing every stripe inside.
import { sandGrains, brownLoop, slump, rng } from '../core/synth.js';

const VS = /* glsl */ `#version 300 es
in vec3 a_w; in vec3 a_f; in vec3 a_n; uniform vec2 size; uniform vec2 pv; uniform float ang,shift;
out vec3 f; out vec3 N; out vec3 wp;
void main(){ vec3 p=a_w; p.xy-=pv; float c=cos(ang),s=sin(ang);
  vec3 r=vec3(p.x*c+p.y*s,-p.x*s+p.y*c,p.z); r.xy+=pv; r.x+=shift;
  N=vec3(a_n.x*c+a_n.y*s,-a_n.x*s+a_n.y*c,a_n.z);
  vec2 scr=vec2(r.x-r.z*.34+.04,r.y-r.z*.36-.13);
  gl_Position=vec4(scr*2./size,-r.z*.001,1.); f=a_f; wp=r; }`;
const FS = /* glsl */ `in vec3 f; in vec3 N; in vec3 wp; out vec4 o; uniform vec3 pal[5]; uniform float bodyH,seedS,exposeC;
// f: x,y = material coordinates on the face, z = face id (0 top, 1 front, 2 cut).
vec3 layer(float y,vec2 q){ float w=(vnoise(q*vec2(5.,2.)+seedS)-.5)*.022+(vnoise(q*22.+seedS)-.5)*.006; float t=clamp((y+w)/bodyH,0.,.999)*5.; int i=int(t); return pal[i]; }
void main(){
  vec2 q=f.xy;
  vec2 gi=floor(q*1050.); vec2 rnd=hash2(gi);
  // Cut faces read wet and dense; the outer skin is drier and paler.
  float cut=step(1.5,f.z);
  vec3 alb=layer(f.y,q+f.z*3.);
  if(f.z<.5) alb=pal[4];
  alb*=mix(.76,1.13,hash(gi+3.)); alb*=1.-.26*step(.87,hash(gi+7.));
  alb*=mix(1.,.8,cut);
  vec2 bump=(rnd-.5)*.4+vec2(vnoise(q*80.+seedS)-.5,vnoise(q*80.+seedS+5.)-.5)*.55;
  vec3 n=normalize(N+vec3(bump.x,bump.y,bump.x*.5)*.5);
  vec3 L=normalize(vec3(-.45,.72,.52));
  float d=max(dot(n,L),0.);
  float ao=mix(.5,1.,smoothstep(.0,.06,wp.y+.015));
  alb*=alb;
  vec3 c=alb*(vec3(1.5,1.2,.92)*d*1.05+vec3(.22,.23,.27))*ao;
  c+=vec3(1.,.93,.78)*pow(max(dot(normalize(n+(rnd-.5).xyx*.5),normalize(L+vec3(0.,0.,1.))),0.),120.)*step(.72,rnd.y)*.8;
  o=vec4(c,1.);
}`;
const FLOOR = /* glsl */ `in vec2 v; out vec4 o; uniform vec2 size; uniform float seedS;
void main(){ vec2 p=(v-.5)*size; float l=exp(-dot(p-vec2(-.05,-.08),p-vec2(-.05,-.08))*1.2);
  vec3 c=mix(vec3(.018,.0165,.016),vec3(.075,.068,.06),l);
  float y0=-.13; float hor=smoothstep(.02,-.04,p.y-y0-.1);
  c*=mix(.42,1.,hor);
  c*=.9+.1*vnoise(p*vec2(300.,40.));
  o=vec4(c,1.); }`;
const SHADOW = /* glsl */ `in vec2 v; out vec4 o; uniform vec2 size; uniform vec4 rect;
void main(){ vec2 p=(v-.5)*size; float a=smoothstep(rect.x-.06,rect.x+.015,p.x)*smoothstep(rect.y+.06,rect.y-.015,p.x)*smoothstep(-.13-.17,-.13-.08,p.y)*smoothstep(-.13+.04,-.13-.04,p.y);
  o=vec4(0.,0.,0.,a*.62); }`;
const CRUMB_VS = /* glsl */ `#version 300 es
in vec4 a; uniform vec2 size; out float g; void main(){ vec2 s=vec2(a.x-.03,a.y-.13-.08); gl_Position=vec4(s*2./size,0.,1.); gl_PointSize=a.z; g=a.w; }`;
const CRUMB_FS = /* glsl */ `in float g; out vec4 o; uniform vec3 pal[5]; void main(){ vec2 d=gl_PointCoord-.5; float m=smoothstep(.5,.34,length(d)); int i=int(clamp(g*5.,0.,4.)); vec3 c=pal[i]*(.65+.7*max(-d.y+.2,0.)); o=vec4(c*1.15,m); }`;

const SETS = [
  [[.78, .28, .3], [.92, .6, .26], [.95, .85, .55], [.3, .62, .6], [.36, .34, .62]],
  [[.25, .45, .7], [.52, .76, .82], [.93, .88, .76], [.92, .62, .62], [.74, .36, .5]],
  [[.33, .22, .16], [.6, .36, .2], [.86, .6, .32], [.95, .85, .62], [.55, .68, .5]],
  [[.5, .28, .62], [.78, .42, .7], [.95, .7, .68], [.97, .88, .6], [.4, .72, .68]],
];

export function create(env) {
  const { kit, gl, post, input, ui, audio, seed } = env;
  const pB = kit.program(FS, VS), pF = kit.program(FLOOR), pSh = kit.program(SHADOW), pC = kit.program(CRUMB_FS, CRUMB_VS);
  const bus = audio && audio.bus({ gain: 1, send: .14 });
  let grain, body, snd = {};
  if (bus) {
    const sr = bus.sr;
    grain = bus.loop(bus.buffer(sandGrains(sr, 31, 4, 3000)), { gain: 0, hp: 1200, lp: 9000, send: .06 });
    body = bus.loop(bus.buffer(brownLoop(sr, 9)), { gain: 0, hp: 110, lp: 900, send: .05 });
    snd.fall = [0, 1, 2, 3].map(i => bus.buffer(slump(sr, seed + i, { size: .7 + i * .25 })));
    snd.crack = bus.buffer(slump(sr, seed + 9, { size: .4 }));
  }
  const r = rng(seed);
  const buf = gl.createBuffer(), vao = gl.createVertexArray(), kBuf = gl.createBuffer(), kVao = gl.createVertexArray(), cBuf = gl.createBuffer(), cVao = gl.createVertexArray();
  kit.owned.push({ buffer: buf, vao }, { buffer: kBuf, vao: kVao }, { buffer: cBuf, vao: cVao });
  [[vao, buf], [kVao, kBuf]].forEach(([va, bu]) => {
    gl.bindVertexArray(va); gl.bindBuffer(gl.ARRAY_BUFFER, bu);
    [['a_w', 3, 0], ['a_f', 3, 3], ['a_n', 3, 6]].forEach(([n, sz, o]) => { const l = gl.getAttribLocation(pB.h, n); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, sz, gl.FLOAT, false, 36, o * 4); });
  });
  gl.bindVertexArray(cVao); gl.bindBuffer(gl.ARRAY_BUFFER, cBuf);
  { const l = gl.getAttribLocation(pC.h, 'a'); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 4, gl.FLOAT, false, 16, 0); }
  gl.bindVertexArray(null);

  let W = 2, H = 2, wu = 1, hu = 1, pal = null, gen = 0, seedS = 0;
  const BH = .34, BD = .22;
  let x0 = -.5, x1 = .5, BLOCKW = 1, slabs = [], crumbs = [];
  let knife = null, autoT = 0, sndV = 0, stackX = 0, doneT = -1;
  const crumbData = new Float32Array(400 * 4);

  function fresh() {
    gen++; pal = new Float32Array(SETS[gen % SETS.length].flat()); seedS = (seed % 71) * .3 + gen * 1.7;
    const scale = Math.min(1, wu * .86);
    BLOCKW = Math.min(wu * .52, .62); x0 = -wu * .5 + (wu - BLOCKW) * .22; x1 = x0 + BLOCKW;
    slabs = []; crumbs = []; knife = null; stackX = 0; doneT = -1;
    upload();
  }
  // Six faces per piece collapse to three visible ones in this fixed oblique view.
  function boxVerts(a, b, out) {
    const quad = (A, B, C, D, F, id, n) => { [A, B, C, A, C, D].forEach((P, i) => { const fc = [F[0], F[1], F[2], F[0], F[2], F[3]][i]; out.push(P[0], P[1], P[2], fc[0], fc[1], id, n[0], n[1], n[2]); }); };
    // top
    quad([a, BH, 0], [b, BH, 0], [b, BH, BD], [a, BH, BD], [[a, 0], [b, 0], [b, BD], [a, BD]], 0, [0, 1, 0]);
    // front
    quad([a, 0, BD], [b, 0, BD], [b, BH, BD], [a, BH, BD], [[a, 0], [b, 0], [b, BH], [a, BH]], 1, [0, 0, 1]);
    // cut face, to the right
    quad([b, 0, BD], [b, 0, 0], [b, BH, 0], [b, BH, BD], [[BD, 0], [0, 0], [0, BH], [BD, BH]], 2, [1, 0, 0]);
  }
  // Left face of a slab: seen once it has fallen to the right.
  function leftFace(a, out) {
    [[a, 0, 0], [a, 0, BD], [a, BH, BD], [a, 0, 0], [a, BH, BD], [a, BH, 0]].forEach((P, i) => { const F = [[0, 0], [BD, 0], [BD, BH], [0, 0], [BD, BH], [0, BH]][i]; out.push(P[0], P[1], P[2], F[0] + 3, F[1], 2, -1, 0, 0); });
  }
  let bodyRange = [0, 0], draws = [];
  function upload() {
    const v = [];
    bodyRange[0] = 0; boxVerts(x0, x1, v); bodyRange[1] = v.length / 9;
    draws = [];
    for (const s of slabs) { const st = v.length / 9; boxVerts(s.a, s.b, v); leftFace(s.a, v); s.first = st; s.count = v.length / 9 - st; }
    gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.DYNAMIC_DRAW);
  }
  function spray(x, y, n, spd, g) {
    for (let i = 0; i < n && crumbs.length < 400; i++) {
      const a = Math.PI * (.05 + r() * .9);
      crumbs.push({ x: x + (r() - .5) * .03, y: y + r() * .02, vx: Math.cos(a) * spd * (.2 + r()), vy: Math.sin(a) * spd * (.3 + r()), s: 1 + r() * 2.6, g: g >= 0 ? g : r(), life: 2.6 + r() * 1.6, fy: r() * .07 });
    }
  }
  function commit(x) {
    const minW = .022, w = x1 - x;
    if (w < minW) return;
    slabs.push({ a: x, b: x1, ang: 0, va: 0, target: 1.5, state: 'stand', t: 0, shift: 0 });
    x1 = x; upload();
    snd.crack && bus.play(snd.crack, { gain: .36 });
    env.buzz(16);
    spray(x, BH * .5, 30, .22, -1);
    if (x1 - x0 < .08) doneT = 0;
  }
  const local = p => [(p.x - .5) * wu - .04 + .04, (p.y - .5) * hu + .13 + BD * .18];
  input.on({
    down(p) { const l = local(p); knife = { id: p.id, x: l[0], y0: Math.max(l[1], BH + .02), y: BH + .03, dragged: 0, armed: l[0] > x0 && l[0] < x1 }; },
    move(p) {
      if (!knife || knife.id !== p.id) return;
      const l = local(p);
      if (!knife.engaged) knife.x = Math.max(x0 + .004, Math.min(x1 - .012, l[0]));
      const ny = Math.min(BH + .03, Math.max(-.01, l[1] - (knife.y0 - (BH + .03))));
      const dv = Math.max(0, knife.y - ny);
      if (ny < BH) knife.engaged = true;
      knife.y = Math.min(knife.y, ny);
      knife.v = dv;
      if (knife.y <= .012 && !knife.done) { knife.done = true; commit(knife.x); }
    },
    up(p) { if (knife && knife.id === p.id) { if (knife.y < BH * .55 && !knife.done) commit(knife.x); knife = null; } },
  });
  return {
    resize(w, h) { W = w; H = h; const m = Math.min(w, h); wu = w / m; hu = h / m; fresh(); },
    reset() { fresh(); },
    attract(_, dt) {
      autoT += dt;
      if (autoT > 1.1) { autoT = 0; commit(x1 - .05 - Math.random() * .03); }
    },
    frame(t, dt) {
      // Knife pressure from speed: sand fights back when you hurry.
      let v = 0;
      if (knife && knife.engaged && !knife.done) { v = (knife.v || 0) / Math.max(dt, .001); knife.v = 0; }
      sndV += (Math.min(1, v / .9) - sndV) * Math.min(1, dt * 24);
      if (bus) { const s = Math.sqrt(sndV); grain.set({ gain: .5 * s, hp: 1000 + 2500 * sndV, lp: 5000 + 5000 * sndV }, .015); body.set({ gain: .45 * s, lp: 300 + 900 * sndV }, .02); }
      if (knife && knife.engaged && !knife.done && Math.random() < sndV * .9) spray(knife.x, knife.y, 2, .1, -1);

      for (const s of slabs) {
        s.t += dt;
        if (s.state === 'stand') {
          // Stands for a held breath, then starts to go.
          if (s.t > .3) s.state = 'tip';
        } else if (s.state === 'tip') {
          // Rigid slab tipping about its lower right edge.
          const torque = Math.sin(s.ang + .05) * 26;
          s.va += torque * dt; s.ang += s.va * dt;
          const limit = 1.5708 - Math.min(.3, slabs.indexOf(s) * .004) ;
          if (s.ang >= limit) {
            s.ang = limit; s.state = 'rest'; const w = s.b - s.a;
            if (bus) bus.play(snd.fall[Math.min(3, Math.floor(w * 18))], { gain: .85, pan: Math.min(.8, (s.b + .3) / wu) });
            env.buzz(24); spray(s.b + BH, .01, Math.floor(46 + w * 300), .42, -1);
          }
        }
      }
      if (doneT >= 0) { doneT += dt; if (doneT > 2.2) fresh(); }
      // Crumbs.
      let n = 0;
      for (let i = crumbs.length - 1; i >= 0; i--) {
        const c = crumbs[i]; c.vy -= 2.3 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.life -= dt;
        if (c.y < c.fy) { c.y = c.fy; c.vy *= -.22; c.vx *= .5; }
        if (c.life <= 0) { crumbs[i] = crumbs[crumbs.length - 1]; crumbs.pop(); continue; }
        crumbData.set([c.x, c.y, c.s * (Math.min(W, H) / 700), c.g], n * 4); n++;
      }

      post.begin();
      kit.draw(pF, { size: [wu, hu], seedS }, undefined);
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      let right = x1; for (const s of slabs) right = Math.max(right, s.b + (s.ang > 1 ? BH : 0));
      kit.draw(pSh, { size: [wu, hu], rect: [x0, right + .03, 0, 0] }, undefined);
      gl.disable(gl.BLEND);
      // Painter's order is right in this fixed view: slabs from first to last, then the body.
      gl.bindVertexArray(vao);
      const base = { size: [wu, hu], pal, bodyH: BH, seedS };
      for (const s of slabs) {
        // Each fallen slab rests a little beyond the last so that they shingle.
        kit.use(pB, { ...base, pv: [s.b, 0], ang: s.ang, shift: 0 });
        gl.drawArrays(gl.TRIANGLES, s.first, s.count);
      }
      kit.use(pB, { ...base, pv: [0, 0], ang: 0, shift: 0 });
      gl.drawArrays(gl.TRIANGLES, bodyRange[0], bodyRange[1]);
      // Knife groove, drawn as a dark line through the top and front faces.
      if (knife && knife.engaged && !knife.done) {
        const v2 = [];
        const x = knife.x, y = Math.max(0, knife.y), w = .0022;
        const add = (ax, ay, az, bx, by, bz) => { const n0 = [0, 0, 1]; [[ax - w, ay, az], [ax + w, ay, az], [bx + w, by, bz], [ax - w, ay, az], [bx + w, by, bz], [bx - w, by, bz]].forEach(P => v2.push(P[0], P[1], P[2], 0, 0, 1, 0, -1, 0)); };
        add(x, BH + .0005, 0, x, BH + .0005, BD); add(x, BH, BD + .0005, x, y, BD + .0005);
        gl.bindVertexArray(kVao); gl.bindBuffer(gl.ARRAY_BUFFER, kBuf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v2), gl.DYNAMIC_DRAW);
        kit.use(pB, { ...base, pv: [0, 0], ang: 0, shift: 0, bodyH: 1e6 });
        gl.drawArrays(gl.TRIANGLES, 0, v2.length / 9);
      }
      if (n > 0) {
        gl.enable(gl.BLEND);
        gl.bindVertexArray(cVao); gl.bindBuffer(gl.ARRAY_BUFFER, cBuf);
        gl.bufferData(gl.ARRAY_BUFFER, crumbData.subarray(0, n * 4), gl.DYNAMIC_DRAW);
        kit.use(pC, { size: [wu, hu], pal });
        gl.drawArrays(gl.POINTS, 0, n);
        gl.disable(gl.BLEND);
      }
      gl.bindVertexArray(null);
      post.end({ exposure: 1, bloom: .04, vig: .78, grain: .014 }, dt);
    },
    destroy() { bus && bus.destroy(); },
  };
}
