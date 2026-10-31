// No.04 Thick chocolate. Each square snaps clean off the slab, trailing warm caramel.
import { rng, chocSnap, bubble, rustle } from '../core/synth.js';

const CARAMEL = /* glsl */ `in vec2 v; out vec4 o; uniform vec2 size; uniform vec3 fill; uniform float time;
void main(){ vec2 p=(v-.5)*size;
  vec2 q=p*2.2+vec2(time*.03,-time*.02); float a=vnoise(q)+.5*vnoise(q*2.1+7.);
  vec2 g=vec2(vnoise(q+vec2(.05,0.))+.5*vnoise((q+vec2(.05,0.))*2.1+7.)-a,vnoise(q+vec2(0.,.05))+.5*vnoise((q+vec2(0.,.05))*2.1+7.)-a)/.05*.18;
  vec3 N=normalize(vec3(-g,1.)); vec3 Ny=vec3(N.x,N.z,-N.y); vec3 R=reflect(vec3(0.,-1.,0.),Ny);
  vec3 c=fill*fill*(.3+.42*a);
  c+=fill*pow(max(N.z,0.),8.)*.1;
  c+=studio(R)*schlick(Ny.y,.05)*.9;
  o=vec4(c,1.); }`;

const VS = /* glsl */ `#version 300 es
uniform vec2 size,ctr,half_; uniform float rot,lift;
out vec2 q;
void main(){ vec2 c=vec2(float(gl_VertexID&1),float((gl_VertexID>>1)&1))*2.-1.;
  if(gl_VertexID==4) c=vec2(1.,-1.); if(gl_VertexID==5) c=vec2(-1.,1.); if(gl_VertexID==3) c=vec2(1.,1.);
  c=c*1.0; q=c; vec2 l=c*half_*(1.+lift*.16); float a=rot; l=vec2(l.x*cos(a)-l.y*sin(a),l.x*sin(a)+l.y*cos(a));
  gl_Position=vec4((ctr+l)*2./size,0.,1.); }`;
const SHADOW = /* glsl */ `in vec2 q; out vec4 o; uniform float alpha; void main(){ vec2 d=abs(q); float e=max(d.x,d.y); o=vec4(0.,0.,0.,alpha*smoothstep(1.,.72,e)); }`;
const PIECE = /* glsl */ `in vec2 q; out vec4 o; uniform vec2 half_,ctr,lightP; uniform float press,seedP,rot,lift,open,milk;
float pil(vec2 p){ vec2 d=abs(p); float e=max(d.x,d.y);
  float rim=smoothstep(1.,.84,e);
  float plateau=smoothstep(.84,.62,e)*.0;
  // Raised pillow, then a sunken tile with a raised diamond, as on a good couverture bar.
  float pillow=rim*.8+smoothstep(.72,.62,e)*-.28;
  float dia=abs(p.x)+abs(p.y); float di=smoothstep(.45,.38,dia)*.22-smoothstep(.2,.14,dia)*.12;
  return pillow+di; }
void main(){
  float e=.012; float h=pil(q),hx=pil(q+vec2(e,0.)),hy=pil(q+vec2(0.,e));
  vec2 g=vec2(hx-h,hy-h)/e*.085*(1.-press*.25);
  // Fat-bloom waviness and fine polish scratches.
  vec2 wp=q*half_+ctr; g+=vec2(vnoise(wp*30.+seedP)-.5,vnoise(wp*30.+seedP+9.)-.5)*.025;
  vec3 N=normalize(vec3(-g,1.));
  float c=cos(rot),s=sin(rot); N.xy=vec2(N.x*c-N.y*s,N.x*s+N.y*c);
  vec3 Ny=vec3(N.x,N.z,-N.y);
  vec3 base=mix(vec3(.054,.021,.01),vec3(.16,.066,.03),milk);
  vec3 L=normalize(vec3(-.45+lightP.x*.1,.8,.3-lightP.y*.1));
  vec3 col=base*(vec3(1.,.9,.8)*max(dot(Ny,L),0.)*1.25+.18);
  vec3 R=reflect(vec3(0.,-1.,0.),Ny);
  R=normalize(R+vec3(wp.x*.34,0.,-wp.y*.34));
  float F=schlick(Ny.y,.055);
  col+=studio(R)*F*1.15;
  col*=1.-press*.25;
  // Snapped edges show matte, grainy break with a thread of filling.
  vec2 d=abs(q); float ee=max(d.x,d.y);
  float jag=(vnoise(q*19.+seedP)-.5)*.05;
  if(open>0.){ float brk=smoothstep(.93,.985,ee+jag)*open; vec3 raw=vec3(.1,.042,.02)*(.65+.8*vnoise(wp*190.)); col=mix(col,raw,brk); if(ee+jag>.995) discard; }
  o=vec4(col,1.);
}`;
const STRAND = /* glsl */ `in vec2 q; out vec4 o; uniform vec3 fill; uniform float alpha;
void main(){ float x=q.x; float s=1.-abs(x); float n=fill.r; vec3 c=fill*(.9+.4*(1.-abs(x)*abs(x)))+vec3(.5,.42,.3)*pow(max(1.-abs(x),0.),12.)*.8; o=vec4(c,alpha*smoothstep(1.,.75,abs(x))); }`;

const FILLS = [[.82, .36, .08], [.92, .78, .5], [.74, .13, .1], [.32, .62, .28], [.95, .55, .16]];

export function create(env) {
  const { kit, gl, post, input, ui, audio, seed } = env;
  const pC = kit.program(CARAMEL), pS = kit.program(SHADOW, VS), pP = kit.program(PIECE, VS), pT = kit.program(STRAND, VS);
  const bus = audio && audio.bus({ gain: 1, send: .13 });
  const snd = {};
  if (bus) {
    const sr = bus.sr;
    snd.snap = Array.from({ length: 16 }, (_, i) => bus.buffer(chocSnap(sr, seed + i, { size: .9 + i * .03 })));
    snd.big = bus.buffer(chocSnap(sr, seed + 40, { size: 1.8 }));
    snd.goo = [0, 1, 2, 3].map(i => bus.buffer(bubble(sr, 190 + i * 70, { rise: .7, tau: .05, seed: i + 7, impact: .05 })));
    snd.foil = bus.buffer(rustle(sr, { dur: .8, density: 1100, seed: 5 }));
  }
  let W = 2, H = 2, wu = 1, hu = 1, cols = 0, rows = 0, pieces = [], gen = 0, fill = FILLS[0], milk = 0, autoT = 0, lp = [0, 0], enter = 1, wob = 0;
  const pts = new Map(), r = rng(seed);
  let left = 0, finishT = -1;
  function build() {
    gen++;
    fill = gen === 1 ? FILLS[0] : FILLS[Math.floor(r() * FILLS.length)]; milk = r();
    const m = Math.min(W, H); wu = W / m; hu = H / m;
    const portrait = W < H;
    cols = portrait ? 4 : Math.round(4 * wu + .4); rows = portrait ? Math.round(4 * hu + .4) : 4;
    const sx = wu * 1.02 / cols, sy = hu * 1.02 / rows;
    pieces = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      pieces.push({ x, y, hx: (x + .5) * sx - wu * .51, hy: (y + .5) * sy - hu * .51, hsx: sx * .493, hsy: sy * .493, press: 0, target: 0, gone: 0, t: 0, vx: 0, vy: 0, ox: 0, oy: 0, rot: 0, vr: 0, lift: 0, seed: r() * 90, strand: 0, jig: 0 });
    }
    left = pieces.length; enter = 1; finishT = -1;
    if (gen > 1 && snd.foil) bus.play(snd.foil, { gain: .4 });
  }
  const local = p => [(p.x - .5) * wu, (p.y - .5) * hu];
  function pick(l) { for (const b of pieces) if (!b.gone && Math.abs(l[0] - b.hx) < b.hsx * 1.01 && Math.abs(l[1] - b.hy) < b.hsy * 1.01) return b; return null; }
  function snap(b, fast) {
    b.gone = 1; b.t = 0; left--;
    const d = Math.hypot(b.hx, b.hy) + .1, sp = .75 + Math.random() * .55;
    b.vx = b.hx / d * sp + (Math.random() - .5) * .5; b.vy = b.hy / d * sp + (Math.random() - .5) * .5 + .25; b.vr = (Math.random() - .5) * 3.5; b.strand = 1;
    if (bus) {
      bus.play(snd.snap[Math.floor(Math.random() * snd.snap.length)], { gain: .95, rate: .94 + Math.random() * .14, pan: b.hx / wu * .8 });
      bus.play(snd.goo[Math.floor(Math.random() * 4)], { gain: .26, delay: .05 + Math.random() * .05 });
    }
    env.buzz(14);
    for (const n of pieces) if (!n.gone) { const dd = Math.hypot(n.hx - b.hx, n.hy - b.hy); if (dd < b.hsx * 3.2) n.jig = Math.max(n.jig, 1 - dd / (b.hsx * 3.2)); }
    if (left === 0) finishT = 0;
  }
  function touch(l, fast) { const b = pick(l); if (b) { b.target = 1; b.fast = fast; } }
  input.on({
    down(p) { const l = local(p); lp = [p.x * 2 - 1, p.y * 2 - 1]; pts.set(p.id, l); touch(l, false); },
    move(p) { lp[0] += ((p.x * 2 - 1) - lp[0]) * .1; lp[1] += ((p.y * 2 - 1) - lp[1]) * .1; if (!pts.has(p.id)) return; const q = pts.get(p.id), l = local(p), n = Math.ceil(Math.hypot(l[0] - q[0], l[1] - q[1]) / .08); for (let i = 1; i <= n; i++) touch([q[0] + (l[0] - q[0]) * i / n, q[1] + (l[1] - q[1]) * i / n], true); pts.set(p.id, l); },
    up(p) { pts.delete(p.id); },
  });
  return {
    resize(w, h) { W = w; H = h; build(); },
    reset() { build(); },
    attract(_, dt) { autoT += dt; if (autoT > .32) { autoT = 0; const c = pieces.filter(b => !b.gone); if (c.length) { c[Math.floor(Math.random() * c.length)].target = 1; } } },
    frame(t, dt) {
      enter = Math.max(0, enter - dt * 1.8);
      wob = 0;
      for (const b of pieces) {
        if (!b.gone) {
          if (b.target) { b.press = Math.min(1, b.press + dt * (b.fast ? 28 : 9)); if (b.press >= 1) snap(b); }
          b.jig *= Math.exp(-dt * 13);
        } else {
          b.t += dt; b.ox += b.vx * dt * (.55 + b.t); b.oy += b.vy * dt * (.55 + b.t); b.rot += b.vr * dt; b.lift = Math.min(1, b.lift + dt * 6); b.strand = Math.max(0, b.strand - dt * 1.9);
        }
      }
      if (finishT >= 0) { finishT += dt; if (finishT > 1.35) build(); }
      post.begin();
      kit.draw(pC, { size: [wu, hu], fill, time: t }, undefined);
      gl.bindVertexArray(kit.vao);
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      const off = (1 - Math.pow(1 - enter, 3)) * hu * 1.1;
      // Slab shadow on the caramel gives every gap real depth.
      for (const b of pieces) if (!b.gone) {
        kit.use(pS, { size: [wu, hu], ctr: [b.hx + .01, b.hy - .014 + off], half_: [b.hsx * 1.1, b.hsy * 1.1], rot: 0, lift: 0, alpha: .75 });
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
      for (const b of pieces) if (b.gone && b.strand > 0) {
        const dx = b.ox, dy = b.oy, l = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
        kit.use(pT, { size: [wu, hu], ctr: [b.hx + dx / 2, b.hy + dy / 2], half_: [l / 2 + .01, b.hsx * .34 * b.strand], rot: a, lift: 0, fill, alpha: b.strand });
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
      gl.disable(gl.BLEND);
      for (const b of pieces) if (!b.gone) {
        const j = b.jig * .004 * Math.sin(t * 95 + b.seed);
        kit.use(pP, { size: [wu, hu], ctr: [b.hx + j, b.hy + off + j * .7], half_: [b.hsx, b.hsy], rot: 0, lift: -b.press * .09, press: b.press, seedP: b.seed, open: 0, milk, lightP: lp });
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
      for (const b of pieces) if (b.gone && b.t < 1.7) {
        gl.enable(gl.BLEND);
        kit.use(pS, { size: [wu, hu], ctr: [b.hx + b.ox + .04 * b.lift, b.hy + b.oy - .06 * b.lift], half_: [b.hsx * 1.05, b.hsy * 1.05], rot: b.rot, lift: b.lift, alpha: .55 });
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        gl.disable(gl.BLEND);
        kit.use(pP, { size: [wu, hu], ctr: [b.hx + b.ox, b.hy + b.oy], half_: [b.hsx, b.hsy], rot: b.rot, lift: b.lift, press: 0, seedP: b.seed, open: 1, milk, lightP: lp });
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
      gl.bindVertexArray(null);
      post.end({ exposure: 1.2, bloom: .06, vig: .78, grain: .014 }, dt);
    },
    destroy() { bus && bus.destroy(); },
  };
}
