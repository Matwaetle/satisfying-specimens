// No.02 Kintsugi. Stress the plate until it gives, then return every shard. Gold fills the seams.
import { ceramic, tick, shatter, bell, rng, dScale } from '../core/synth.js';
import { meshVAO } from '../core/gl.js';

const TABLE = /* glsl */ `in vec2 v; out vec4 o; uniform vec2 res; uniform float glow;
void main(){ vec2 p=(v-.5)*res/min(res.x,res.y);
  // Dark walnut under a low lamp.
  vec2 q=vec2(p.x*1.2+.25*fbm(p*1.3),p.y*16.+1.6*fbm(p*vec2(1.6,5.)));
  float grain=fbm(q*vec2(.9,1.))*.7+.3*fbm(q*vec2(4.,3.));
  vec3 a=vec3(.042,.027,.018),b=vec3(.105,.066,.04);
  vec3 c=mix(a,b,smoothstep(.25,.75,grain));
  float l=exp(-dot(p-vec2(-.1,.12),p-vec2(-.1,.12))*1.5);
  c*=.1+.72*l;
  c*=.9+.2*vnoise(p*vec2(30.,300.));
  o=vec4(c,1.); }`;
const BLIT = /* glsl */ `in vec2 v; out vec4 o; uniform sampler2D t; uniform vec2 res; uniform float glow;
void main(){ vec2 p=(v-.5)*res/min(res.x,res.y); o=vec4(texture(t,v).rgb+vec3(1.,.72,.3)*glow*.05*exp(-dot(p,p)*2.),1.); }`;
// Everything about the glaze that does not move is baked per plate; shards only sample it.
const GLAZE_BAKE = /* glsl */ `in vec2 v; out vec4 o; uniform vec3 glaze,glaze2; uniform float seedG,pass_;
void main(){ vec2 q=(v-.5)*2.1; float r=length(q);
  if(pass_>.5){ float w=fbm(q*5.+seedG),wx=fbm(q*5.+seedG+vec2(.02,0.)),wy=fbm(q*5.+seedG+vec2(0.,.02)); o=vec4((vec2(wx-w,wy-w)/.02*.012),vnoise(q*230.+seedG),1.); return; }
  float pool=smoothstep(.95,.3,r); float speck=smoothstep(.76,.84,vnoise(q*150.+seedG))*.5+smoothstep(.72,.78,vnoise(q*330.+seedG*2.))*.5;
  vec3 albedo=mix(glaze2,glaze,pool*.7+.3*fbm(q*3.+seedG));
  albedo*=1.-speck*.2;
  albedo=mix(albedo,vec3(.42,.29,.19),smoothstep(.95,.995,r)*.8);
  vec2 cp=q*19.+seedG; vec2 ci=floor(cp); float m=1.,m2=1.;
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){ vec2 g2=vec2(x,y); vec2 o2=hash2(ci+g2); float l=length(g2+o2-fract(cp)); if(l<m){m2=m;m=l;}else if(l<m2)m2=l; }
  albedo*=1.-.09*smoothstep(.05,.0,m2-m);
  o=vec4(albedo,1.); }`;

const VS = /* glsl */ `#version 300 es
in vec2 a_q; in float a_e; uniform vec2 scale,offset; uniform vec2 rot; uniform float grow;
out vec2 q; out float e;
void main(){ q=a_q; e=a_e; vec2 r=vec2(a_q.x*rot.x-a_q.y*rot.y,a_q.x*rot.y+a_q.y*rot.x)*(1.+grow);
  gl_Position=vec4((r+offset)*scale,0.,1.); }`;

const SHADOW = /* glsl */ `in vec2 q; in float e; out vec4 o; uniform float alpha;
void main(){ o=vec4(0.,0.,0.,alpha*smoothstep(0.,.06,e)); }`;

const PLATE = /* glsl */ `in vec2 q; in float e; out vec4 o;
uniform sampler2D albedoT,detailT; uniform vec2 rot,lightP; uniform float seedG,lift;
float prof(float r){ // Shallow plate cross-section
  float well=smoothstep(.56,.84,r)*.16; float rim=smoothstep(.9,.985,r)*.05-smoothstep(.975,1.,r)*.09; return well+rim+.012*sin(r*30.)*smoothstep(.55,.8,r)*.25; }
void main(){
  float r=length(q);
  float d=.006; float dh=(prof(r+d)-prof(max(r-d,0.)))/(2.*d);
  vec2 dir=r>1e-4?q/r:vec2(0.);
  vec2 buv=q/2.1+.5; vec4 det=texture(detailT,buv);
  vec2 g=dir*dh*1.6+det.xy;
  vec3 N=normalize(vec3(-g,1.));
  N.xy=vec2(N.x*rot.x-N.y*rot.y,N.x*rot.y+N.y*rot.x);
  vec3 Ny=vec3(N.x,N.z,-N.y); vec3 V=vec3(0.,1.,0.);
  vec3 albedo=texture(albedoT,buv).rgb;
  // Key light and sky.
  vec2 lp=lightP; vec3 L=normalize(vec3(-.55+lp.x*.1,.8,.28-lp.y*.1));
  float ndl=max(dot(Ny,L),0.);
  vec3 col=albedo*(vec3(1.,.93,.83)*ndl*.72+vec3(.08,.095,.12));
  // Thick glaze: glassy reflection with softbox and depth.
  vec3 R=reflect(-V,Ny);
  float F=schlick(Ny.y,.055);
  col=col*(1.-F)+studio(R)*F*1.15;
  // Fracture bevel exposes raw stoneware.
  float edge=1.-smoothstep(.0,.045,e);
  if(edge>0.){ float gr=det.b*.5+.5; vec3 clay=vec3(.56,.44,.33)*gr; float ln=.55+.55*dot(normalize(vec3(rot.x,1.,rot.y)),L); col=mix(col,clay*ln*(vec3(1.,.93,.83)),edge); }
  col*=1.+lift*.1;
  o=vec4(col,1.);
}`;

const SEAM_VS = /* glsl */ `#version 300 es
in vec2 a_q; in vec2 a_s; uniform vec2 scale,offset; uniform float R; out vec2 s; out vec2 q;
void main(){ s=a_s; q=a_q; gl_Position=vec4((a_q*R+offset)*scale,0.,1.); }`;
const SEAM = /* glsl */ `in vec2 s; in vec2 q; out vec4 o; uniform float reveal,sweep,gold,time,mode;
void main(){
  // s.x: across [-1,1]; s.y: along-route phase.
  float across=abs(s.x);
  float rimClip=smoothstep(.995,.975,length(q));
  if(mode<.5){ // hairline crack
    float a=smoothstep(reveal,reveal-.02,s.y)*smoothstep(1.,.0,across)*rimClip;
    o=vec4(vec3(.0),a*.92); return; }
  float a=smoothstep(1.,.62,across)*gold*rimClip;
  float bump=sqrt(max(1.-across*across,0.));
  vec3 N=normalize(vec3(s.x*.9,bump+.25,(vnoise(q*60.)-.5)*.5));
  vec3 Rf=reflect(vec3(0.,-1.,0.),N);
  vec3 au=vec3(1.,.62,.16);
  vec3 c=au*(.2+.42*studio(Rf)*.55+.5*pow(max(N.y,0.),6.));
  // Hammered highlights and the travelling gleam.
  c*=.86+.3*vnoise(q*90.);
  float d=s.y-sweep; float g=exp(-d*d*180.);
  c+=vec3(1.,.8,.45)*g*7.;
  o=vec4(c,a);
}`;

const GLAZES = [
  [[.33, .47, .42], [.54, .66, .58]], // celadon
  [[.035, .045, .07], [.11, .13, .18]], // tenmoku indigo
  [[.72, .69, .61], [.86, .83, .76]], // kohiki cream
  [[.32, .07, .05], [.5, .15, .09]], // copper red
  [[.05, .19, .25], [.12, .34, .4]], // sea glaze
];

export function create(env) {
  const { kit, gl, post, input, ui, audio } = env;
  const table = kit.program(TABLE), blit = kit.program(BLIT), glazeBake = kit.program(GLAZE_BAKE);
  const albedoT = kit.fbo(1024, 1024, 'rgba16f'), detailT = kit.fbo(1024, 1024, 'rgba16f');
  let tableT = null;
  const pPlate = kit.program(PLATE, VS), pShadow = kit.program(SHADOW, VS), pSeam = kit.program(SEAM, SEAM_VS);
  const bus = audio && audio.bus({ gain: 1, send: .22 });
  const snd = {};
  if (bus) {
    const sr = bus.sr;
    snd.ticks = Array.from({ length: 8 }, (_, i) => bus.buffer(tick(sr, 1900 + i * 520, 40 + i)));
    snd.shatter = bus.buffer(shatter(sr, env.seed & 65535));
    snd.clacks = Array.from({ length: 6 }, (_, i) => bus.buffer(ceramic(sr, 620 + i * 130, { hard: .7, dur: .6, ring: .5, seed: 70 + i })));
    snd.dribble = Array.from({ length: 5 }, (_, i) => bus.buffer(ceramic(sr, 1500 + i * 500, { hard: .9, dur: .25, ring: .16, seed: 90 + i })));
    snd.ring = [0, 3, 5, 7, 9].map((k, i) => bus.buffer(bell(sr, dScale(k), { seed: 110 + i, dur: 5, t: 4.2 })));
    snd.bowl = bus.buffer(ceramic(sr, 440, { hard: .55, dur: 4.5, ring: 3.6, seed: 120 }));
  }

  let W = 2, H = 2, R = .4, fragments = [], seams = [], plateVAO = null, seamVAO = null, plateSeed = 0;
  let glaze = GLAZES[0], gen = 0, r = rng(env.seed);
  let state = 'intact', stress = 0, holding = null, slowmo = 0, stressTick = 0;
  let impact = [0.1, .1], sweep = -1, goldShown = 0, glow = 0, drag = null, autoT = 0, doneT = 0;
  let lp = [0, 0];

  // Build Voronoi shards with matching jagged edges.
  function shardsFor(impactX, impactY) {
    const seeds = [], N = 11 + Math.floor(r() * 4);
    for (let i = 0; i < N; i++) {
      // Denser near impact, but keep pieces large enough to grab.
      const a = r() * Math.PI * 2, d = Math.pow(r(), .7) * .92;
      const x = Math.cos(a) * d, y = Math.sin(a) * d;
      seeds.push([x * .86 + impactX * .14, y * .86 + impactY * .14]);
    }
    for (let k = 0; k < 3; k++) { // relax to even out sizes
      for (let i = 0; i < N; i++) { let fx = 0, fy = 0; for (let j = 0; j < N; j++) if (i !== j) { const dx = seeds[i][0] - seeds[j][0], dy = seeds[i][1] - seeds[j][1], l = dx * dx + dy * dy + .001; if (l < .16) { fx += dx / l * .012; fy += dy / l * .012; } } seeds[i][0] += fx; seeds[i][1] += fy; }
    }
    const circle = []; for (let i = 0; i < 64; i++) { const a = i / 64 * Math.PI * 2; circle.push({ x: Math.cos(a), y: Math.sin(a), n: -1 }); }
    const polys = seeds.map((s, i) => {
      let poly = circle.map(p => ({ ...p }));
      seeds.forEach((o, j) => {
        if (i === j) return;
        const mx = (s[0] + o[0]) / 2, my = (s[1] + o[1]) / 2, nx = o[0] - s[0], ny = o[1] - s[1];
        const out = [];
        for (let k = 0; k < poly.length; k++) {
          const a = poly[k], b = poly[(k + 1) % poly.length];
          const da = (a.x - mx) * nx + (a.y - my) * ny, db = (b.x - mx) * nx + (b.y - my) * ny;
          if (da <= 0) out.push(a);
          if ((da <= 0) !== (db <= 0)) { const u = da / (da - db); out.push({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, n: da <= 0 ? j : a.n }); }
          else if (da <= 0) a.n = a.n;
        }
        poly = out;
      });
      return poly;
    });
    return { seeds, polys };
  }
  // Canonical jagged polyline per seam so both neighbours share the same edge.
  const edgeCache = new Map();
  function jagged(a, b, i, j) {
    const lo = Math.min(i, j), hi = Math.max(i, j), key = lo + '/' + hi + '/' + a.x.toFixed(3) + b.x.toFixed(3);
    const flip = i > j;
    const A = flip ? b : a, B = flip ? a : b, k2 = lo + '/' + hi;
    let line = edgeCache.get(k2);
    if (!line) {
      const q = rng(plateSeed + lo * 131 + hi * 17), len = Math.hypot(B.x - A.x, B.y - A.y), n = Math.max(2, Math.ceil(len / .06));
      const nx = -(B.y - A.y) / (len || 1), ny = (B.x - A.x) / (len || 1);
      line = [{ x: A.x, y: A.y }];
      for (let m = 1; m < n; m++) { const u = m / n, off = (q() - .5) * .032 * Math.sin(Math.PI * u) + (q() - .5) * .012; line.push({ x: A.x + (B.x - A.x) * u + nx * off, y: A.y + (B.y - A.y) * u + ny * off }); }
      line.push({ x: B.x, y: B.y });
      edgeCache.set(k2, line);
    }
    return flip ? line.slice().reverse() : line;
  }
  function buildPlate() {
    gen++; plateSeed = (env.seed + gen * 977) >>> 0; r = rng(plateSeed);
    glaze = gen === 1 ? GLAZES[0] : GLAZES[Math.floor(r() * GLAZES.length)];
    kit.draw(glazeBake, { glaze: glaze[0], glaze2: glaze[1], seedG: (plateSeed % 97) * .37, pass_: 0 }, albedoT);
    kit.draw(glazeBake, { seedG: (plateSeed % 97) * .37, pass_: 1 }, detailT);
    edgeCache.clear();
    const a = r() * 6.28, d = .2 + r() * .4;
    const { seeds, polys } = shardsFor(Math.cos(a) * d, Math.sin(a) * d);
    fragments = [];
    const verts = [];
    const seamEdges = [];
    polys.forEach((poly, i) => {
      const pts = [];
      for (let k = 0; k < poly.length; k++) {
        const p = poly[k], q = poly[(k + 1) % poly.length];
        if (p.n >= 0 && p.n !== i) {
          const line = jagged(p, q, i, p.n);
          for (let m = 0; m < line.length - 1; m++) pts.push({ x: line[m].x, y: line[m].y, rim: false, n: p.n });
          if (i < p.n) seamEdges.push({ line, a: i, b: p.n });
        } else pts.push({ x: p.x, y: p.y, rim: true, n: -1 });
      }
      // Rim vertices count as fracture only where a seam touches them.
      let cx = 0, cy = 0; pts.forEach(p => { cx += p.x; cy += p.y; }); cx /= pts.length; cy /= pts.length;
      const start = verts.length / 3;
      const size = pts.reduce((m, p) => Math.max(m, Math.hypot(p.x - cx, p.y - cy)), 0);
      for (let k = 0; k < pts.length; k++) {
        const p = pts[k], q = pts[(k + 1) % pts.length];
        // Rim edges stay fully glazed (edge value 1): only fracture edges show clay.
        const ep = p.rim ? 1 : 0;
        const eq = q.rim ? 1 : 0;
        verts.push(cx, cy, 1, p.x, p.y, ep, q.x, q.y, eq);
      }
      const count = verts.length / 3 - start;
      fragments.push({ i, start, count, cx, cy, size, pts, x: 0, y: 0, a: 0, vx: 0, vy: 0, va: 0, placed: true, lift: 0, home: seeds[i], tx: 0, ty: 0, ta: 0 });
    });
    if (plateVAO) kit.owned.push(); // old buffers are freed with the specimen
    plateVAO = meshVAO(kit, pPlate, new Float32Array(verts), 3, [['a_q', 2, 0], ['a_e', 1, 2]]);
    // Route phases: seams revealed in order of distance from impact.
    const hx = Math.cos(a) * d, hy = Math.sin(a) * d;
    seamEdges.forEach(s => { const m = s.line[Math.floor(s.line.length / 2)]; s.dist = Math.hypot(m.x - hx, m.y - hy); });
    seamEdges.sort((p, q) => p.dist - q.dist);
    impact = [hx, hy];
    const sv = [];
    let cursor = 0, total = seamEdges.reduce((t, s) => t + s.line.length, 0);
    const W0 = .0095;
    seams = seamEdges;
    seamEdges.forEach(s => {
      s.start = sv.length / 4;
      const q = rng(plateSeed + s.a * 7 + s.b);
      for (let m = 0; m < s.line.length - 1; m++) {
        const A = s.line[m], B = s.line[m + 1], dx = B.x - A.x, dy = B.y - A.y, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
        const wa = W0 * (.7 + q() * .9), wb = W0 * (.7 + q() * .9);
        const pa = (cursor + m) / total, pb = (cursor + m + 1) / total;
        sv.push(A.x + nx * wa, A.y + ny * wa, 1, pa, A.x - nx * wa, A.y - ny * wa, -1, pa, B.x + nx * wb, B.y + ny * wb, 1, pb);
        sv.push(B.x + nx * wb, B.y + ny * wb, 1, pb, A.x - nx * wa, A.y - ny * wa, -1, pa, B.x - nx * wb, B.y - ny * wb, -1, pb);
      }
      s.count = sv.length / 4 - s.start;
      cursor += s.line.length;
    });
    seamVAO = meshVAO(kit, pSeam, new Float32Array(sv), 4, [['a_q', 2, 0], ['a_s', 2, 2]]);
    state = 'intact'; stress = 0; holding = null; sweep = -1; goldShown = 0; drag = null; slowmo = 0; glow = 0; stressTick = 0; autoT = 0;
  }

  const toLocal = p => { const m = Math.min(W, H); return [(p.x - .5) * W / m, (p.y - .5) * H / m]; };
  function hitPlate(l) { return Math.hypot(l[0], l[1]) < R; }

  function doShatter() {
    state = 'scattered'; slowmo = 1;
    snd.shatter && bus.play(snd.shatter, { gain: .95 });
    env.buzz([30, 20, 18]);
    const m = Math.min(W, H), maxX = W / m * .5 - .06, maxY = H / m * .5 - .06;
    fragments.forEach(f => {
      f.placed = false;
      const hx = f.cx - impact[0], hy = f.cy - impact[1], l = Math.hypot(hx, hy) + .001;
      const ox = f.cx + (hx / l) * .22 + (Math.random() - .5) * .25, oy = f.cy + (hy / l) * .22 + (Math.random() - .5) * .25;
      const inX = Math.max(.02, maxX - f.size * R * .75), inY = Math.max(.02, maxY - f.size * R * .75);
      f.tx = Math.max(-inX, Math.min(inX, f.cx * R + ox * R * .62)) - f.cx * R;
      f.ty = Math.max(-inY, Math.min(inY, f.cy * R + oy * R * .62)) - f.cy * R;
      f.ta = (Math.random() - .5) * 1.5;
      f.x = 0; f.y = 0; f.a = 0;
      f.t0 = Math.random() * .08; f.t = 0;
      f.bounced = 0;
    });
    ui.hint('조각을 제자리로 돌려놓으세요', 2400);
    setTimeout(() => state === 'scattered' && fragments.forEach(f => { if (!f.settle) f.settle = 1; }), 0);
  }
  function place(f) {
    f.placed = true; f.x = 0; f.y = 0; f.a = 0; f.lift = 0;
    if (snd.clacks) { bus.play(snd.clacks[Math.floor(Math.random() * 6)], { gain: .72, rate: .96 + Math.random() * .08 }); const k = fragments.filter(g => g.placed).length; bus.play(snd.ring[k % 5], { gain: .16, send: .35 }); }
    env.buzz(14);
    glow = Math.min(1, glow + .25);
    if (fragments.every(g => g.placed)) finish();
  }
  function finish() {
    state = 'done'; sweep = 0; doneT = 0; goldShown = 1;
    if (bus) {
      bus.play(snd.bowl, { gain: .9, send: .5 });
      [0, 1, 2, 3, 4].forEach(i => bus.play(snd.ring[i], { gain: .32 - i * .03, delay: .22 + i * .28, send: .55, pan: (i - 2) * .22 }));
    }
    ui.hint('다시 깨려면 한 번 눌러주세요', 3600);
  }

  input.on({
    down(p) {
      lp = [p.x * 2 - 1, p.y * 2 - 1];
      const l = toLocal(p);
      if (state === 'intact') { if (hitPlate(l)) { holding = { id: p.id, t: 0 }; stress = Math.min(.99, stress + .24); crackTick(); } return; }
      if (state === 'done') { if (doneT > 1) { buildPlate(); } return; }
      // Topmost unplaced shard wins; forgiving grab distance.
      let best = null, bd = 1e9;
      for (const f of fragments) {
        if (f.placed) continue;
        const cx = f.cx * R * Math.cos(f.a) - f.cy * R * Math.sin(f.a) + f.x, cy = f.cx * R * Math.sin(f.a) + f.cy * R * Math.cos(f.a) + f.y;
        const d = Math.hypot(l[0] - cx, l[1] - cy);
        if (d < f.size * R * 1.05 + .03 && d < bd) { bd = d; best = f; }
      }
      if (best) { drag = { f: best, id: p.id, dx: best.x - l[0], dy: best.y - l[1] }; best.lift = 1; snd.dribble && bus.play(snd.dribble[Math.floor(Math.random() * 5)], { gain: .12 }); }
    },
    move(p) {
      lp[0] += ((p.x * 2 - 1) - lp[0]) * .1; lp[1] += ((p.y * 2 - 1) - lp[1]) * .1;
      if (drag && drag.id === p.id) { const l = toLocal(p); drag.tx = l[0] + drag.dx; drag.ty = l[1] + drag.dy; drag.moved = true; }
    },
    up(p) {
      if (holding && holding.id === p.id) holding = null;
      if (drag && drag.id === p.id) {
        const f = drag.f; f.lift = 0;
        if (Math.hypot(f.x, f.y) < R * .52) { f.snapping = true; }
        else if (snd.clacks) bus.play(snd.dribble[Math.floor(Math.random() * 5)], { gain: .3 });
        drag = null;
      }
    },
  });

  function crackTick() {
    if (snd.ticks) bus.play(snd.ticks[Math.floor(Math.random() * snd.ticks.length)], { gain: .28 + stress * .5, rate: .92 + Math.random() * .2 });
    env.buzz(6);
  }

  function updateSim(dt) {
    if (state === 'intact') {
      if (holding) {
        stress += dt * .78;
        stressTick -= dt;
        if (stressTick <= 0) { crackTick(); stressTick = .28 - stress * .2 + Math.random() * .06; }
      }
      if (stress >= 1) doShatter();
    }
    if (state === 'scattered' || state === 'done') {
      for (const f of fragments) {
        if (f.placed) continue;
        if (f.t !== undefined && f.t < 1) {
          f.t = Math.min(1, f.t + dt * (slowmo > 0 ? .95 : 1.9));
          const e = 1 - Math.pow(1 - f.t, 3.2);
          f.x = f.tx * e; f.y = f.ty * e; f.a = f.ta * e;
          if (f.t > .45 && !f.bounced) { f.bounced = 1; snd.dribble && bus.play(snd.dribble[Math.floor(Math.random() * 5)], { gain: .16 + Math.random() * .22, pan: f.tx * .8, delay: Math.random() * .1 }); }
        }
        if (drag && drag.f === f && drag.moved) {
          f.x += (drag.tx - f.x) * Math.min(1, dt * 26); f.y += (drag.ty - f.y) * Math.min(1, dt * 26);
          // Shards turn themselves into true as they near home.
          const k = Math.min(1, Math.hypot(f.x, f.y) / (R * 1.1));
          const target = f.ta * k * k;
          f.a += (target - f.a) * Math.min(1, dt * 11);
        }
        if (f.snapping) {
          const k = Math.min(1, dt * 18);
          f.x -= f.x * k; f.y -= f.y * k; f.a -= f.a * k;
          if (Math.hypot(f.x, f.y) < .004) { f.snapping = false; place(f); }
        }
      }
      slowmo = Math.max(0, slowmo - dt * 1.5);
    }
    if (state === 'done') {
      doneT += dt;
      sweep = Math.min(1.4, doneT / 2.4);
    }
    glow = Math.max(state === 'done' ? .25 * Math.max(0, 1 - doneT * .2) : 0, glow - dt * .8);
  }

  function drawShard(f, uniforms) {
    const m = Math.min(W, H);
    const scale = [2 * m / W, 2 * m / H];
    const lift = f.lift;
    kit.use(uniforms.p, { ...uniforms.u, scale, offset: [f.x + (uniforms.shadow ? (.008 + lift * .03) : 0), f.y - (uniforms.shadow ? (.012 + lift * .04) : 0)], rot: [Math.cos(f.a) * R, Math.sin(f.a) * R], grow: uniforms.shadow ? .01 : 0 });
    gl.drawArrays(gl.TRIANGLES, f.start, f.count);
  }

  return {
    resize(w, h) { W = w; H = h; tableT = kit.fbo(w, h, 'rgba16f'); kit.draw(table, { res: [w, h] }, tableT); R = Math.min(.42, Math.max(.3, .36 * Math.min(1, w / h * 1.15))); if (!plateVAO) buildPlate(); },
    reset() { buildPlate(); },
    attract(t, dt) {
      autoT += dt;
      if (state === 'intact' && autoT > 1) { stress += dt * .5; if (stress >= 1) { doShatter(); autoT = 0; } }
      else if (state === 'scattered' && autoT > 1.6) {
        const next = fragments.find(f => !f.placed && !f.snapping);
        if (next) { next.snapping = true; autoT = 1.3; }
      } else if (state === 'done' && doneT > 4) buildPlate();
    },
    frame(t, dt) {
      updateSim(dt * (slowmo > 0 ? .55 : 1));
      post.begin();
      gl.disable(gl.BLEND);
      kit.draw(blit, { t: tableT, res: [W, H], glow }, undefined);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      const m = Math.min(W, H), scale = [2 * m / W, 2 * m / H];

      gl.bindVertexArray(plateVAO.vao);
      const sorted = fragments.slice().sort((a, b) => (a.placed === b.placed ? a.lift - b.lift : a.placed ? -1 : 1));
      // Soft drop shadows: wide then tight.
      const shUni = { p: pShadow, u: { alpha: .3 }, shadow: true };
      for (const f of sorted) drawShard(f, shUni);
      const plUni = { p: pPlate, u: { albedoT, detailT, seedG: (plateSeed % 97) * .37, lightP: lp, lift: 0 } };
      gl.disable(gl.BLEND);
      for (const f of sorted) {
        if (!f.placed) continue;
        kit.use(pPlate, { ...plUni.u, scale, offset: [0, 0], rot: [R, 0], grow: 0 });
        gl.drawArrays(gl.TRIANGLES, f.start, f.count);
      }
      // Seams between placed neighbours.
      gl.enable(gl.BLEND);
      gl.bindVertexArray(seamVAO.vao);
      kit.use(pSeam, { scale, offset: [0, 0], R, reveal: state === 'intact' ? stress * 1.15 : 2, sweep: state === 'done' ? sweep : -1, gold: 1, time: t, mode: state === 'intact' ? 0 : 1 });
      for (const s of seams) {
        const ok = state === 'intact' || (fragments[s.a].placed && fragments[s.b].placed);
        if (ok) gl.drawArrays(gl.TRIANGLES, s.start, s.count);
      }
      // Loose shards float above the seams.
      gl.bindVertexArray(plateVAO.vao);
      if (state !== 'intact') {
        for (const f of sorted) {
          if (f.placed) continue;
          gl.enable(gl.BLEND);
          drawShard(f, shUni);
          gl.disable(gl.BLEND);
          drawShard(f, { p: pPlate, u: { ...plUni.u, lift: f.lift } });
        }
      }
      gl.disable(gl.BLEND);
      gl.bindVertexArray(null);
      post.end({ exposure: 1.05, bloom: state === 'done' ? .09 : .05, vig: .85, dof: 0 }, dt);
    },
    destroy() { bus && bus.destroy(); },
  };
}
