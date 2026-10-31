// No.03 Lake ice. Every blow sings through the sheet; the last one opens the lake.
import { rng, iceBoom, slump, waterLoop, bubble, gloop } from '../core/synth.js';
import { meshVAO } from '../core/gl.js';
import { voronoiCells, fanVertices } from '../core/fracture.js';

const BAKE = /* glsl */ `in vec2 v; out vec4 o; uniform float seed;
void main(){ vec2 p=v*3.;
  // r: trapped air bubbles, g: wind-blown snow on the surface, b: milky density.
  float b=0.; for(int i=0;i<3;i++){ float s=26.+float(i)*22.; vec2 g=p*s+seed; vec2 id=floor(g),f=fract(g)-.5; vec2 j=(hash2(id)-.5)*.6; float r=.08+.2*hash(id+3.); float on=step(.82,hash(id+7.)); b=max(b,on*smoothstep(r,r*.5,length(f-j))); }
  float sn=smoothstep(.6,.86,fbm(p*vec2(9.,16.)+seed)); float m=fbm(p*2.+seed*2.);
  o=vec4(b,sn,m,1.); }`;

const LINE_VS = /* glsl */ `#version 300 es
in vec2 a_p; in vec2 a_a; uniform vec2 size; out vec2 s;
void main(){ s=a_a; gl_Position=vec4(a_p*2./size,0.,1.); }`;
const LINE_FS = /* glsl */ `in vec2 s; out vec4 o; void main(){ float c=exp(-s.x*s.x*5.)*s.y; o=vec4(c,c,c,c); }`;

const PLATE_VS = /* glsl */ `#version 300 es
in vec2 a_p,a_c,a_r; in float a_e; uniform vec2 size,off; uniform float ang,scaleP;
out vec2 w; out float e,rr; out vec2 scr;
void main(){ vec2 l=a_p-a_c; float c=cos(ang),s=sin(ang); l=vec2(l.x*c-l.y*s,l.x*s+l.y*c)*scaleP; vec2 p=a_c+l+off;
  gl_Position=vec4(p*2./size,0.,1.); w=a_p; e=a_e; rr=a_r.x; scr=p; }`;
const ICE_FS = /* glsl */ `in vec2 w; in float e,rr; in vec2 scr; out vec4 o;
uniform sampler2D crack,tile; uniform vec2 size,tiltP; uniform float sink,broken,lamp;
float cr(vec2 q){ return texture(crack,q/size+.5).r; }
void main(){
  vec2 q=w; vec4 t=texture(tile,fract(q*.33+.5));
  // Looking down into a metre of black ice: crack sheets sit at depth, so step through them.
  vec2 view=(scr*.09+vec2(.018,.03));
  float depthC=0.; float jit=hash(gl_FragCoord.xy)*.08; for(int i=0;i<10;i++){ float d=(float(i)+jit*10.)/10.; depthC+=cr(q+view*d)*(1.-d*.8); }
  depthC=clamp(depthC*.22,0.,1.2);
  float top=cr(q);
  vec3 deep=vec3(.002,.012,.02),mid=vec3(.008,.05,.07);
  vec3 c=mix(deep,mid,t.b*.8+.15);
  vec4 t2=texture(tile,fract((q+view*.7)*.33+.5));
  c+=vec3(.42,.6,.68)*t2.r*.12;
  c+=vec3(.22,.34,.4)*t.r*.05;
  c+=vec3(.55,.8,.92)*depthC*.42;
  c+=vec3(1.)*top*.8;
  vec3 snow=vec3(.68,.74,.8)*(.55+.45*vnoise(q*60.));
  c=mix(c,snow*(.55+.45*smoothstep(-.8,.8,q.y)),t.g*.1*(1.-top*.6));
  // Surface sheen from a low winter sky.
  vec3 N=normalize(vec3((t.b-.5)*.05+tiltP.x,(t.g-.5)*.04+tiltP.y,1.));
  vec3 Ny=vec3(N.x,N.z,-N.y); vec3 Rf=reflect(vec3(0.,-1.,0.),Ny);
  float tx=dot(Rf,normalize(vec3(.25,.75,-.6)));
  c+=vec3(.75,.88,1.)*pow(max(tx,0.),90.)*.7;
  c+=vec3(.02,.03,.04)*(.5+.5*Rf.z);
  // Broken faces glow where light enters the plate edge.
  float side=(1.-smoothstep(.0,.05,e))*broken;
  c=mix(c,vec3(.62,.86,.92)*(.75+.5*rr),side*.85);
  c*=mix(1.,.28,sink);
  c=mix(c,vec3(.004,.012,.018),sink*.6);
  o=vec4(c,1.);
}`;
const WATER = /* glsl */ `in vec2 v; out vec4 o; uniform vec2 size; uniform float time,slosh; uniform vec2 imp;
void main(){ vec2 p=(v-.5)*size; float d=length(p-imp);
  vec2 g=vec2(vnoise(p*7.+time*.5)-.5,vnoise(p*7.-time*.4+9.)-.5)*.14; g+=(p-imp)/max(d,.01)*sin(d*30.-time*9.)*exp(-d*2.)*.11*slosh;
  vec3 N=normalize(vec3(g,1.)); vec3 Ny=vec3(N.x,N.z,-N.y); vec3 R=reflect(vec3(0.,-1.,0.),Ny);
  vec3 c=vec3(.0015,.008,.012)+vec3(.55,.75,.9)*pow(max(dot(R,normalize(vec3(.25,.75,-.6))),0.),60.)*.32;
  o=vec4(c,1.); }`;

export function create(env) {
  const { kit, gl, post, input, ui, audio, seed, quality } = env;
  const pLine = kit.program(LINE_FS, LINE_VS), pIce = kit.program(ICE_FS, PLATE_VS), pBake = kit.program(BAKE), pWater = kit.program(WATER);
  const bus = audio && audio.bus({ gain: 1, send: .42 });
  const snd = {};
  if (bus) {
    const sr = bus.sr;
    snd.hit = [0, 1, 2, 3, 4, 5].map(i => bus.buffer(iceBoom(sr, seed + i, { power: .3 + i * .1 })));
    snd.big = bus.buffer(iceBoom(sr, seed + 20, { power: 1.3 }));
    snd.whump = bus.buffer(slump(sr, 5, { size: 1.6 }));
    snd.gloop = bus.buffer(gloop(sr, 6, { base: 170, count: 7, span: .9 }));
    snd.drops = [0, 1, 2, 3].map(i => bus.buffer(bubble(sr, 300 + i * 170, { rise: 1.1, tau: .04, seed: i + 3 })));
    snd.water = bus.loop(bus.buffer(waterLoop(sr, 13)), { gain: 0, lp: 650, hp: 70, send: .3 });
  }
  const r = rng(seed);
  const tile = kit.fbo(1024, 1024, 'rgba8', { wrap: 'REPEAT' });
  kit.draw(pBake, { seed: (seed % 41) * .9 }, tile);
  let W = 2, H = 2, wu = 1, hu = 1, crack = null, plates = [], mesh = null;
  let hits = 0, growing = [], state = 'ice', brokenT = 0, imp = [0, 0], wobble = 0, autoT = 0;
  let lineBuf = gl.createBuffer(), lineVAO = gl.createVertexArray();
  kit.owned.push({ buffer: lineBuf, vao: lineVAO });
  gl.bindVertexArray(lineVAO); gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf);
  const la = gl.getAttribLocation(pLine.h, 'a_p'), lb = gl.getAttribLocation(pLine.h, 'a_a');
  gl.enableVertexAttribArray(la); gl.vertexAttribPointer(la, 2, gl.FLOAT, false, 16, 0);
  gl.enableVertexAttribArray(lb); gl.vertexAttribPointer(lb, 2, gl.FLOAT, false, 16, 8);
  gl.bindVertexArray(null);

  // One fracture: jagged rays that fork as they run. Each segment appears when the wave reaches it.
  function ray(x, y, a, len, width, dist, out, depth) {
    const step = .022; let d = 0;
    while (d < len) {
      a += (r() - .5) * .55; const nx = x + Math.cos(a) * step, ny = y + Math.sin(a) * step;
      const k = 1 - d / len, w2 = width * (.35 + .65 * k);
      out.push({ x0: x, y0: y, x1: nx, y1: ny, w: w2, b: .35 + .65 * k, at: (dist + d) / 2.4 });
      x = nx; y = ny; d += step;
      if (depth < 3 && r() < .1) ray(x, y, a + (r() < .5 ? 1 : -1) * (.5 + r() * .8), (len - d) * (.35 + r() * .35), w2 * .7, dist + d, out, depth + 1);
    }
  }
  function strike(p) {
    const pow = .25 + hits * .16, out = [], n = 7 + Math.floor(r() * 4) + hits;
    const a0 = r() * 6.28;
    for (let i = 0; i < n; i++) ray(p[0], p[1], a0 + i / n * 6.28 + (r() - .5) * .4, (.24 + r() * .5) * (1 + pow), .0032, 0, out, 0);
    // A crushed white star where the blow landed.
    for (let i = 0; i < 26; i++) ray(p[0], p[1], r() * 6.28, .02 + r() * .05, .0024, 0, out, 3);
    out.t = 0; growing.push(out);
    if (bus) { bus.play(snd.hit[Math.min(5, hits)], { gain: .95, pan: p[0] * .6 }); }
    env.buzz(20 + hits * 8); wobble = 1; hits++;
  }
  function open(p) {
    state = 'open'; brokenT = 0; imp = p;
    const m = Math.min(W, H);
    const cells = voronoiCells(r, -wu / 2 - .05, -hu / 2 - .05, wu / 2 + .05, hu / 2 + .05, .2, 1);
    mesh = meshVAO(kit, pIce, fanVertices(cells, r), 7, [['a_p', 2, 0], ['a_c', 2, 2], ['a_r', 2, 4], ['a_e', 1, 6]]);
    plates = cells.map(c => {
      const dx = c.cx - p[0], dy = c.cy - p[1], d = Math.hypot(dx, dy) + .05, v = (.07 + r() * .07) / (d + .3);
      return { c, vx: dx / d * v, vy: dy / d * v, x: 0, y: 0, a: 0, va: (r() - .5) * 1.1, sinkMax: Math.max(0, 1 - d / .24) * (.6 + r() * .3), delay: d * .16, tilt: [(r() - .5) * .9, (r() - .5) * .9], ph: r() * 6 };
    });
    if (bus) {
      bus.play(snd.big, { gain: 1 }); bus.play(snd.whump, { gain: .8, delay: .05 }); bus.play(snd.gloop, { gain: .72, delay: .28, send: .4 });
      snd.water.set({ gain: .34, lp: 800 }, .5);
      snd.drops.forEach((b, i) => bus.play(b, { gain: .3, delay: .4 + i * .32 + Math.random() * .2, pan: (Math.random() - .5) * .8 }));
    }
    env.buzz([60, 40, 40]);
    ui.hint('다시 얼리려면 한 번 더 누르세요', 3500);
  }
  function freeze() {
    state = 'ice'; hits = 0; growing = []; plates = []; mesh = null;
    kit.bind(crack); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    if (bus) snd.water.set({ gain: 0 }, .3);
  }
  const local = p => [(p.x - .5) * wu, (p.y - .5) * hu];
  input.on({
    down(p) {
      const l = local(p);
      if (state === 'open') { if (brokenT > 1.6) freeze(); return; }
      if (hits >= 5) open(l); else strike(l);
    },
  });
  function drawGrowth(dt) {
    let any = false; const verts = [];
    for (const g of growing) {
      g.t += dt;
      for (let i = g.length - 1; i >= 0; i--) {
        const s = g[i]; if (s.at > g.t) continue;
        const dx = s.x1 - s.x0, dy = s.y1 - s.y0, l = Math.hypot(dx, dy) || 1, nx = -dy / l * s.w, ny = dx / l * s.w;
        verts.push(s.x0 + nx, s.y0 + ny, 1, s.b, s.x0 - nx, s.y0 - ny, -1, s.b, s.x1 + nx, s.y1 + ny, 1, s.b, s.x1 + nx, s.y1 + ny, 1, s.b, s.x0 - nx, s.y0 - ny, -1, s.b, s.x1 - nx, s.y1 - ny, -1, s.b);
        g[i] = g[g.length - 1]; g.pop(); any = true;
      }
    }
    growing = growing.filter(g => g.length);
    if (!any) return;
    kit.bind(crack);
    gl.enable(gl.BLEND); gl.blendEquation(gl.MAX); gl.blendFunc(gl.ONE, gl.ONE);
    kit.use(pLine, { size: [wu, hu] });
    gl.bindVertexArray(lineVAO); gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, verts.length / 4);
    gl.bindVertexArray(null); gl.blendEquation(gl.FUNC_ADD); gl.disable(gl.BLEND);
  }
  let whole = null;
  return {
    resize(w, h) {
      W = w; H = h; const m = Math.min(w, h); wu = w / m; hu = h / m;
      crack = kit.fbo(quality === 'low' ? 1024 : 1536, Math.round((quality === 'low' ? 1024 : 1536) * h / w), 'rgba8');
      const q = new Float32Array([-wu, -hu, 0, 0, 0, 1, 1, wu, -hu, 0, 0, 0, 1, 1, wu, hu, 0, 0, 0, 1, 1, -wu, -hu, 0, 0, 0, 1, 1, wu, hu, 0, 0, 0, 1, 1, -wu, hu, 0, 0, 0, 1, 1]);
      whole = meshVAO(kit, pIce, q, 7, [['a_p', 2, 0], ['a_c', 2, 2], ['a_r', 2, 4], ['a_e', 1, 6]]);
    },
    reset() { freeze(); },
    attract(_, dt) { autoT += dt; if (state === 'ice' && autoT > 1.15) { autoT = 0; const p = [(Math.random() - .5) * wu * .6, (Math.random() - .5) * hu * .6]; hits >= 5 ? open(p) : strike(p); } else if (state === 'open' && brokenT > 6) { freeze(); autoT = 0; } },
    frame(t, dt) {
      drawGrowth(dt);
      wobble *= Math.exp(-dt * 7);
      post.begin();
      const base = { size: [wu, hu], crack, tile, broken: 0, sink: 0, tiltP: [0, 0], off: [0, 0], ang: 0, scaleP: 1 };
      if (state === 'ice') {
        gl.bindVertexArray(whole.vao); kit.use(pIce, base); gl.drawArrays(gl.TRIANGLES, 0, whole.count);
      } else {
        brokenT += dt;
        kit.draw(pWater, { size: [wu, hu], time: t, slosh: Math.exp(-brokenT * .5), imp }, undefined);
        gl.bindVertexArray(mesh.vao);
        for (const pl of plates) {
          const tt = Math.max(0, brokenT - pl.delay);
          if (tt > 0) { const k = Math.exp(-dt * .9); pl.x += pl.vx * dt; pl.y += pl.vy * dt; pl.vx *= k; pl.vy *= k; pl.a += pl.va * dt; pl.va *= k; }
          const ramp = 1 - Math.exp(-tt * 2.2);
          const bob = Math.sin(t * 1.4 + pl.ph) * .018;
          const sink = pl.sinkMax * ramp;
          kit.use(pIce, { ...base, broken: 1, off: [pl.x, pl.y], ang: pl.a, scaleP: .985 - sink * .06, sink, tiltP: [pl.tilt[0] * ramp * .25 + bob, pl.tilt[1] * ramp * .25 - bob] });
          gl.drawArrays(gl.TRIANGLES, pl.c.first, pl.c.count);
        }
      }
      gl.bindVertexArray(null);
      post.end({ exposure: 1.2, bloom: .05, vig: .8, grain: .016 }, dt);
    },
    destroy() { bus && bus.destroy(); },
  };
}
