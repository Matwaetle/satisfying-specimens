// No.04 Ebru. Pigment floats on size water; every drop pushes the last into rings.
// Dye is stored as absorbance so overlaps deepen like real ink instead of turning grey.
import { waterDrop, waterLoop, rustle, bell, dScale } from '../core/synth.js';

const ADVECT = /* glsl */ `in vec2 v; out vec4 o; uniform sampler2D vel,src; uniform vec2 velTx; uniform float dt,keep;
void main(){ vec2 c=v-dt*texture(vel,v).xy*velTx; o=texture(src,c)*keep; }`;
// MacCormack correction keeps ink edges razor sharp.
const MAC = /* glsl */ `in vec2 v; out vec4 o; uniform sampler2D vel,src,fwd,bwd; uniform vec2 velTx,tx; uniform float dt;
void main(){ vec4 f=texture(fwd,v),b=texture(bwd,v),s=texture(src,v); vec4 r=f+.5*(s-b);
  vec2 c=v-dt*texture(vel,v).xy*velTx;
  vec2 st=c/tx-.5; vec2 i=(floor(st)+.5)*tx;
  vec4 a0=texture(src,i),a1=texture(src,i+vec2(tx.x,0.)),a2=texture(src,i+vec2(0.,tx.y)),a3=texture(src,i+tx);
  vec4 mn=min(min(a0,a1),min(a2,a3)),mx=max(max(a0,a1),max(a2,a3));
  o=clamp(r,mn,mx); }`;
const FORCE = /* glsl */ `in vec2 v; out vec4 o; uniform sampler2D vel; uniform vec2 a,b,force,asp; uniform float rad,teeth,spacing;
float seg(vec2 p,vec2 a,vec2 b){ vec2 ab=b-a; float u=clamp(dot(p-a,ab)/max(dot(ab,ab),1e-8),0.,1.); return length(p-a-ab*u); }
void main(){ vec2 p=v*asp; float f=0.; vec2 d=normalize(force+vec2(1e-5)); vec2 n=vec2(-d.y,d.x);
  if(teeth<1.5){ float s=seg(p,a*asp,b*asp); f=exp(-s*s/(rad*rad)); }
  else for(float i=0.;i<teeth;i+=1.){ vec2 o2=n*(i-(teeth-1.)*.5)*spacing; float s=seg(p,a*asp+o2,b*asp+o2); f=max(f,exp(-s*s/(rad*rad))); }
  o=vec4(texture(vel,v).xy+force*f,0.,1.); }`;
const DIV = /* glsl */ `in vec2 v; out vec4 o; uniform sampler2D vel; uniform vec2 tx,asp; uniform vec3 drops[8];
void main(){ float l=texture(vel,v-vec2(tx.x,0.)).x,r=texture(vel,v+vec2(tx.x,0.)).x,d=texture(vel,v-vec2(0.,tx.y)).y,u=texture(vel,v+vec2(0.,tx.y)).y;
  float div=.5*(r-l+u-d);
  // Drops are pressure sources: new pigment shoves old pigment outward as a ring.
  vec2 p=v*asp; for(int i=0;i<8;i++){ if(drops[i].z>0.){ vec2 q=p-drops[i].xy*asp; div-=drops[i].z*exp(-dot(q,q)/.0009); } }
  o=vec4(div,0.,0.,1.); }`;
const JACOBI = /* glsl */ `in vec2 v; out vec4 o; uniform sampler2D p,dv; uniform vec2 tx;
void main(){ float l=texture(p,v-vec2(tx.x,0.)).r,r=texture(p,v+vec2(tx.x,0.)).r,d=texture(p,v-vec2(0.,tx.y)).r,u=texture(p,v+vec2(0.,tx.y)).r;
  o=vec4((l+r+d+u-texture(dv,v).r)*.25,0.,0.,1.); }`;
const GRAD = /* glsl */ `in vec2 v; out vec4 o; uniform sampler2D p,vel; uniform vec2 tx;
void main(){ float l=texture(p,v-vec2(tx.x,0.)).r,r=texture(p,v+vec2(tx.x,0.)).r,d=texture(p,v-vec2(0.,tx.y)).r,u=texture(p,v+vec2(0.,tx.y)).r;
  vec2 w=texture(vel,v).xy-.5*vec2(r-l,u-d);
  w*=smoothstep(0.,.012,v.x)*smoothstep(0.,.012,1.-v.x)*smoothstep(0.,.012,v.y)*smoothstep(0.,.012,1.-v.y);
  o=vec4(w,0.,1.); }`;
const INK = /* glsl */ `in vec2 v; out vec4 o; uniform sampler2D dye; uniform vec2 c,asp; uniform vec3 ink; uniform float rad;
void main(){ vec2 q=(v-c)*asp; float l=length(q)+(vnoise(q*160.)-.5)*.0035;
  float m=smoothstep(rad,rad-.0035,l); vec3 d=texture(dye,v).rgb; o=vec4(mix(d,ink*(.82+.25*vnoise(q*70.)),m),1.); }`;
const SHADE = /* glsl */ `in vec2 v; out vec4 o; uniform sampler2D dye; uniform vec2 tx,asp,res; uniform vec4 ripples[6]; uniform float paper,time; uniform vec2 lp;
float fiber(vec2 p){ return fbm(p*vec2(60.,180.))*.5+fbm(p*vec2(170.,70.))*.5; }
void main(){
  vec2 p=v*asp;
  vec3 A=texture(dye,v).rgb;
  // Surface tension keeps real ink edges crisp, so steepen what advection softens.
  vec2 t2=tx*2.;
  vec3 blur=(texture(dye,v+vec2(t2.x,0.)).rgb+texture(dye,v-vec2(t2.x,0.)).rgb+texture(dye,v+vec2(0.,t2.y)).rgb+texture(dye,v-vec2(0.,t2.y)).rgb)*.25;
  A=max(A+(A-blur)*2.2,vec3(0.));
  A*=smoothstep(.1,.38,max(A.r,max(A.g,A.b)));
  // Warm laid paper shows through the bath; Beer-Lambert keeps mixes luminous.
  vec3 base=vec3(.95,.88,.76);
  vec3 pig=exp(-A*1.7);
  // Slight granulation where pigment is thick.
  float dens=dot(A,vec3(.33)); pig*=1.-.09*smoothstep(.2,1.6,dens)*(vnoise(p*420.)-.3);
  // Ink meniscus darkens fine edges.
  vec3 Ax=texture(dye,v+vec2(tx.x,0.)).rgb-texture(dye,v-vec2(tx.x,0.)).rgb; vec3 Ay=texture(dye,v+vec2(0.,tx.y)).rgb-texture(dye,v-vec2(0.,tx.y)).rgb;
  float edge=length(vec2(dot(Ax,vec3(.33)),dot(Ay,vec3(.33))));
  pig*=1.-clamp(edge*.55,0.,.3);
  if(paper>.5){
    // Lifted print: dry pigment bonded to fibres, soft deckle, cast shadow.
    float fb=fiber(p);
    vec2 q=abs(v-.5)*asp; vec2 mar=asp*.5-.045; float dk=(fbm(p*30.)-.5)*.008;
    float inP=1.-smoothstep(-.004,.004,max(q.x-mar.x+dk,q.y-mar.y+dk));
    float fbn=(fiber(p+vec2(.01,0.))-fb)*22.;
    vec3 pc=vec3(.94,.905,.84)*(.95+fb*.1);
    float sh=smoothstep(.025,.0,-max(q.x-mar.x-.008,q.y-mar.y-.012));
    vec3 tray=vec3(.016,.015,.014);
    vec3 print=pc*mix(vec3(1.),pig,.96)*(1.+fbn*.05);
    vec3 c=mix(tray*(1.-sh*.6),print,inP);
    o=vec4(c*vec3(1.05,1.02,.97),1.); return;
  }
  vec3 col=base*pig;
  float l=exp(-dot(v-.5+lp*.08,v-.5+lp*.08)*1.1);
  col*=vec3(1.,.97,.92)*(.3+.42*l);
  // Water surface: expanding ripples plus slow carrageenan swell.
  vec2 g=vec2(vnoise(p*2.2+time*.04+5.)-.5,vnoise(p*2.2-time*.03+9.)-.5)*.022;
  for(int i=0;i<6;i++){ vec4 r=ripples[i]; if(r.w<=0.) continue; vec2 q=p-r.xy*asp; float d=length(q); float w=(d-r.z)*90.;
     g+=(q/max(d,1e-3))*sin(w)*exp(-w*w*.02)*.045*r.w; }
  vec3 N=normalize(vec3(g,1.)); vec3 Ny=vec3(N.x,N.z,-N.y);
  // Only moving water glints: ripples catch the lamp, still water stays matte.
  vec3 H=normalize(vec3(-.25+lp.x*.06,-.3+lp.y*.06,1.));
  col+=vec3(1.,.97,.92)*pow(max(dot(N,H),0.),260.)*.5;
  o=vec4(col,1.);
}`;

const PALETTES = [
  [[.08, .52, 1.25], [1.45, .55, .09], [.15, 1.05, .9], [1.55, 1.3, .24], [.95, .85, .3]],
  [[1.75, .8, .1], [.95, .18, .08], [.1, .8, 1.5], [1.7, 1.45, .55], [.12, .25, .09]],
  [[.13, .85, .95], [.08, .36, .82], [1.3, 1.05, .1], [1.65, 1.5, .85], [.85, .1, .3]],
  [[1.6, 1.25, .35], [.2, 1.25, 1.35], [.1, .1, .1], [.95, .65, .1], [.45, .22, .6]],
];

export function create(env) {
  const { kit, gl, post, input, ui, audio, quality, seed } = env;
  const p = { adv: kit.program(ADVECT), mac: kit.program(MAC), force: kit.program(FORCE), div: kit.program(DIV), jac: kit.program(JACOBI), grad: kit.program(GRAD), ink: kit.program(INK), shade: kit.program(SHADE) };
  const bus = audio && audio.bus({ gain: .9, send: .3 });
  let drops = [], stir = null, peel = null, chimes = [];
  if (bus) {
    const sr = bus.sr;
    drops = Array.from({ length: 12 }, (_, i) => bus.buffer(waterDrop(sr, seed + i)));
    stir = bus.loop(bus.buffer(waterLoop(sr, 7)), { gain: 0, lp: 700, hp: 70, send: .25 });
    peel = bus.buffer(rustle(sr, { dur: 1.3, density: 340, seed: 5 }));
    chimes = [0, 1, 2, 3, 4, 5, 6, 7].map(i => bus.buffer(bell(sr, dScale(i + 3), { seed: i + 40, dur: 3, t: 2 })));
  }

  const lowQ = quality === 'low';
  let W = 2, H = 2, asp = [1, 1], vel, pres, dye, dv, fwd, bwd;
  let pal = PALETTES[Math.abs(seed) % PALETTES.length], inkI = 0, chimeI = 0;
  let active = []; // { x, y, rate, age, life, ink, rad, grow }
  let ripples = [];
  let paper = 0, printing = false, printT = 0, bake = 0;
  let comb = false;
  const pts = new Map();
  let stirE = 0, lp = [0, 0];
  let pending = [[.5, .55, 0], [.33, .4, .5], [.68, .36, .9], [.42, .68, 1.3], [.62, .66, 1.7], [.26, .62, 2.1], [.76, .58, 2.4], [.5, .28, 2.7], [.5, .5, 3.1]], clock = 0;

  ui.tools([{ id: 'stylus', label: '꼬챙이' }, { id: 'comb', label: '빗' }], id => { comb = id === 'comb'; });
  const printBtn = ui.action('종이로 뜨기', () => print());

  function setup() {
    const r = W / H; asp = r > 1 ? [r, 1] : [1, 1 / r];
    const m = lowQ ? 112 : 160, d = lowQ ? 720 : 1100;
    const fit = n => r > 1 ? [n, Math.max(4, Math.round(n / r))] : [Math.max(4, Math.round(n * r)), n];
    const [vw, vh] = fit(m), [dw, dh] = fit(d);
    vel = kit.double(vw, vh, 'rg16f');
    pres = kit.double(vw, vh, 'r16f');
    dv = kit.fbo(vw, vh, 'r16f');
    dye = kit.double(dw, dh, 'rgba16f');
    fwd = kit.fbo(dw, dh, 'rgba16f');
    bwd = kit.fbo(dw, dh, 'rgba16f');
  }
  function clearAll() { [vel.read, vel.write, pres.read, pres.write, dye.read, dye.write].forEach(t => { kit.bind(t); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); }); }

  function drop(x, y, big = 1) {
    const ink = pal[inkI++ % pal.length];
    active.push({ x, y, rate: .62 * big, age: 0, life: .55 * big, ink, rad: 0.026 * big });
    ripples.unshift({ x, y, age: 0, a: 1 }); ripples.length = Math.min(6, ripples.length);
    if (bus) {
      bus.play(drops[Math.floor(Math.random() * drops.length)], { gain: .85 * big, rate: (.9 + Math.random() * .25) / Math.sqrt(big), pan: (x - .5) * .8 });
      bus.play(chimes[chimeI], { gain: .09, send: .5, pan: (x - .5) * .5 }); chimeI = (chimeI + 1 + Math.floor(Math.random() * 3)) % chimes.length;
    }
    env.buzz(6);
  }
  function print() {
    if (printing || paper > .5) { if (paper > .5) { fresh(); } return; }
    printing = true; printT = 0; ui.hideHint();
    peel && bus.play(peel, { gain: .75 });
  }
  function fresh() {
    paper = 0; printing = false; clearAll();
    pal = PALETTES[Math.floor(Math.random() * PALETTES.length)]; inkI = 0;
    printBtn.textContent = '종이로 뜨기';
    pending = [[.5, .55, .2], [.35, .42, .6], [.66, .4, 1], [.45, .68, 1.4], [.68, .66, 1.8], [.3, .66, 2.2]]; clock = 0;
  }

  input.on({
    down(q) { if (paper > .5) return; lp = [q.x * 2 - 1, q.y * 2 - 1]; pts.set(q.id, { x: q.x, y: q.y, ox: q.x, oy: q.y, moved: 0, t0: q.t, sx: q.x, sy: q.y }); },
    move(q) {
      lp[0] += ((q.x * 2 - 1) - lp[0]) * .1; lp[1] += ((q.y * 2 - 1) - lp[1]) * .1;
      const s = pts.get(q.id); if (!s) return;
      s.moved += Math.hypot((q.x - s.x) * asp[0], (q.y - s.y) * asp[1]); s.x = q.x; s.y = q.y;
    },
    up(q) {
      const s = pts.get(q.id); if (!s) return;
      pts.delete(q.id);
      if (s.moved < .018) drop(s.x, s.y, Math.min(1.7, 1 + (q.t - s.t0) / 800));
    },
  });

  function forces(dt) {
    let e = 0;
    for (const s of pts.values()) {
      const dx = s.x - s.sx, dy = s.y - s.sy;
      if (s.moved < .018 || (Math.abs(dx) + Math.abs(dy)) < 1e-5) { s.sx = s.x; s.sy = s.y; continue; }
      const v = [dx * vel.w * 1.05 / Math.max(dt * 60, .4), dy * vel.h * 1.05 / Math.max(dt * 60, .4)];
      kit.draw(p.force, { vel: vel.read, a: [s.sx, s.sy], b: [s.x, s.y], force: v, asp, rad: comb ? .012 : .022, teeth: comb ? 7 : 1, spacing: .062 }, vel.write);
      vel.swap();
      e += Math.hypot(dx * asp[0], dy * asp[1]) / Math.max(dt, .001);
      s.sx = s.x; s.sy = s.y;
    }
    return e;
  }

  function step(dt) {
    const d = Math.min(dt, 1 / 40) * 60; // dt in frames: texels per frame
    const tx = [1 / vel.w, 1 / vel.h];
    const dropArr = new Float32Array(24);
    active.forEach((a, i) => { if (i < 8) { dropArr[i * 3] = a.x; dropArr[i * 3 + 1] = a.y; dropArr[i * 3 + 2] = a.rate * Math.max(0, 1 - a.age / a.life); } });

    kit.draw(p.adv, { vel: vel.read, src: vel.read, velTx: tx, dt: d, keep: .925 }, vel.write); vel.swap();
    const e = forces(dt);
    kit.draw(p.div, { vel: vel.read, tx, asp, drops: dropArr }, dv);
    for (let i = 0; i < (lowQ ? 12 : 18); i++) { kit.draw(p.jac, { p: pres.read, dv, tx }, pres.write); pres.swap(); }
    kit.draw(p.grad, { p: pres.read, vel: vel.read, tx }, vel.write); vel.swap();

    // Pigment is laid down continuously during the drop so its body stays solid.
    for (const a of active) {
      if (a.age < a.life) {
        kit.draw(p.ink, { dye: dye.read, c: [a.x, a.y], asp, ink: a.ink, rad: a.rad }, dye.write); dye.swap();
      }
      a.age += dt;
    }
    active = active.filter(a => a.age < a.life + .1);

    const vt = [1 / vel.w, 1 / vel.h];
    kit.draw(p.adv, { vel: vel.read, src: dye.read, velTx: vt, dt: d, keep: 1 }, fwd);
    kit.draw(p.adv, { vel: vel.read, src: fwd, velTx: vt, dt: -d, keep: 1 }, bwd);
    kit.draw(p.mac, { vel: vel.read, src: dye.read, fwd, bwd, velTx: vt, tx: [1 / dye.w, 1 / dye.h], dt: d }, dye.write); dye.swap();
    return e;
  }

  return {
    resize(w, h) { W = w; H = h; if (!vel || Math.abs(w / h - asp[0] / asp[1]) > .02) { setup(); clearAll(); } },
    reset() { fresh(); },
    attract(t, dt) {
      const id = 77;
      if (Math.floor(t * .8) !== Math.floor((t - dt) * .8) && Math.floor(t * .8) % 5 < 4) drop(.2 + Math.random() * .6, .2 + Math.random() * .6, 1);
      if (Math.floor(t / 7) % 2 === 1) {
        const x = .5 + .4 * Math.sin(t * .8), y = .5 + .34 * Math.cos(t * .55);
        if (!pts.has(id)) pts.set(id, { x, y, ox: x, oy: y, moved: 1, t0: 0, sx: x, sy: y });
        const s = pts.get(id); s.x = x; s.y = y;
      } else pts.delete(id);
    },
    frame(t, dt) {
      clock += dt;
      pending = pending.filter(q => { if (clock > q[2]) { drop(q[0], q[1]); return false; } return true; });
      const e = paper < .5 ? step(dt) : 0;
      stirE += (Math.min(1, e / 1.4) - stirE) * Math.min(1, dt * 16);
      stir && stir.set({ gain: .55 * Math.sqrt(stirE), lp: 300 + stirE * 1500, rate: .75 + stirE * .5 }, .03);
      ripples.forEach(r => { r.age += dt; r.a = Math.max(0, 1 - r.age / 1.6); });
      const rArr = new Float32Array(24);
      ripples.forEach((r, i) => { rArr.set([r.x * asp[0], r.y * asp[1], r.age * .26, r.a], i * 4); });
      // ripples hold positions in tray units; the shader multiplies by asp, so undo it here
      ripples.forEach((r, i) => { rArr[i * 4] = r.x; rArr[i * 4 + 1] = r.y; });

      let fade = 1;
      if (printing) {
        printT += dt;
        // Dip to dark as the sheet is laid, then lift to reveal the print.
        const k = printT / 1.5;
        if (k < .4) fade = 1 - .92 * (k / .4);
        else { if (paper < .5) { paper = 1; printBtn.textContent = '새 물감판'; if (bus) [0, 2, 4].forEach((n, i) => bus.play(chimes[n], { gain: .22, delay: i * .14, send: .55 })); } fade = .08 + .92 * Math.min(1, (k - .4) / .6); }
        if (k >= 1) printing = false;
      }
      post.begin();
      kit.draw(p.shade, { dye: dye.read, tx: [1 / dye.w, 1 / dye.h], asp, res: [W, H], ripples: rArr, paper, time: t, lp });
      post.end({ exposure: 1, bloom: paper > .5 ? .012 : .025, vig: paper > .5 ? .55 : .75, grain: .012, fade }, dt);
    },
    destroy() { bus && bus.destroy(); },
  };
}
