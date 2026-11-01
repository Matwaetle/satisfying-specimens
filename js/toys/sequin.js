// Sequin cloth. Stroke one way and the discs flip to a hidden picture; stroke back to erase it.
import { sequinTick, rustle, sandGrains, gleam, rng } from '../core/synth.js';

// One texel per sequin: r = flip angle, g = angular velocity, b = target side, a = lean under the hand.
const STEP = /* glsl */ `in vec2 v; out vec4 o; uniform sampler2D s; uniform vec2 asp,cell,a,b; uniform float rad,side,on,dt;
void main(){ ivec2 ij=ivec2(gl_FragCoord.xy); vec4 c=texelFetch(s,ij,0);
  vec2 p=vec2((float(ij.x)+.5*float(ij.y&1))*cell.x,(float(ij.y)+.5)*cell.y)-asp*.5;
  if(on>0.){ vec2 d=b-a; float u=clamp(dot(p-a,d)/max(dot(d,d),1e-7),0.,1.); float dist=length(p-a-d*u);
    if(dist<rad){ c.b=side; c.a=max(c.a,1.-dist/rad); } }
  float k=300.+240.*hash(vec2(ij)); c.g+=(k*(c.b*PI-c.r)-24.*c.g)*dt; c.r+=c.g*dt; c.a*=exp(-dt*5.);
  o=c; }`;

const SHADE = /* glsl */ `in vec2 v; out vec4 o; uniform sampler2D s; uniform vec2 asp,cell,lp,dirL; uniform float time,sweepD,pic,seed;
vec3 picture(vec2 q){ vec2 u=q/asp+.5;
  if(pic<.5){ // Sun going down over a calm sea.
    vec3 sky=mix(vec3(1.,.42,.12),vec3(.26,.06,.42),smoothstep(.42,1.,u.y)); float sun=smoothstep(.19,.175,length((q-vec2(asp.x*.14,.08))));
    sky=mix(sky,vec3(1.,.88,.42),sun); vec3 sea=mix(vec3(.02,.1,.3),vec3(.1,.28,.5),u.y/.42);
    float g=smoothstep(.16,.0,abs(q.x-asp.x*.14)-(.42-u.y)*.28)*(.5+.5*sin(q.y*90.+fbm(q*7.)*6.)); sea+=vec3(1.,.55,.18)*g*.85;
    vec3 c=u.y>.42?sky:sea; float hill=.42+.13*fbm(vec2(q.x*2.2+seed,1.))-.04; if(u.y>.42&&u.y<hill) c=vec3(.08,.03,.12); return c; }
  if(pic<1.5){ // Moon over ridges.
    vec3 c=mix(vec3(.02,.08,.3),vec3(.08,.34,.56),smoothstep(1.,.25,u.y)); c=mix(c,vec3(1.,.96,.78),smoothstep(.135,.12,length(q-vec2(-asp.x*.17,.24))));
    for(int i=0;i<4;i++){ float f=float(i); float h=.54-f*.12+.16*fbm(vec2(q.x*(1.6+f*.5)+seed+f*5.,f)); if(u.y<h) c=mix(vec3(.03,.28,.42),vec3(.01,.05,.14),f/3.); } return c; }
  // Great rings of warm colour.
  float r=length(q-vec2(0.,-.05))*5.5+fbm(q*2.+seed)*2.2; float t=fract(r*.5);
  vec3 c=t<.25?vec3(.92,.16,.3):t<.5?vec3(1.,.66,.1):t<.75?vec3(.05,.55,.62):vec3(.1,.09,.36); return c; }
void main(){
  vec2 p=(v-.5)*asp; vec2 g=(p+asp*.5)/cell; int r0=int(floor(g.y));
  vec3 col=vec3(.012,.011,.013)*(.7+.5*fbm(p*420.)); float R=cell.x*.62; bool hit=false;
  for(int dr=3;dr>=-2&&!hit;dr--){ int r=r0+dr; if(r<0) continue; float off=.5*float(r&1); int c0=int(floor(g.x-off));
    for(int dc=-1;dc<=1;dc++){ ivec2 ij=ivec2(c0+dc,r); ivec2 sz=textureSize(s,0); if(ij.x<0||ij.y>=sz.y||ij.x>=sz.x) continue;
      vec2 ctr=vec2((float(ij.x)+off)*cell.x,(float(ij.y)+.5)*cell.y)-asp*.5; vec2 q=p-ctr;
      vec4 st=texelFetch(s,ij,0); float th=st.r; float cs=cos(th);
      // Hung by the top edge, so the disc swings about a hinge above its centre.
      q.y=(q.y-R)/max(abs(cs),.1)+R; float d=length(q)/R; if(d>1.) continue;
      hit=true; float aa=smoothstep(1.,.96,d); vec2 id=vec2(ij);
      vec2 tilt=(hash2(id+seed)-.5)*.42; float sB=step(cs,0.);
      // Cupped discs: the exposed lower lip tips up toward the lights.
      vec3 N=normalize(vec3(vec2(q.x,-q.y)/R*.13+tilt+dirL*st.a*.5,1.)); N.y+=sin(th)*1.1; N=normalize(N);
      vec3 Rf=reflect(vec3(0.,0.,-1.),N); vec3 Ry=vec3(Rf.x+p.x*.28+lp.x*.5,Rf.z,-Rf.y-p.y*.28-lp.y*.5); Ry=normalize(Ry);
      vec3 env=studio(Ry);
      vec3 alb=sB>.5?picture(ctr)*1.25:mix(vec3(.82,.8,.76),vec3(.9,.8,.62),hash(id+2.)*.45);
      float hole=smoothstep(.1,.16,length(q-vec2(0.,R*.72))/R);
      float L=max(dot(N,normalize(vec3(-.25,.45,.85))),0.);
      vec3 sc=alb*alb*(.5+.7*L*L)+alb*min(env,vec3(6.))*.035;
      sc+=env*.015+vec3(1.,.95,.86)*pow(L,70.)*(.2+1.2*step(.93,hash(id)));
      sc*=mix(.72,1.,smoothstep(.5,-.3,q.y/R))*hole;
      // Light running through the cloth when the picture completes.
      sc+=alb*vec3(1.,.95,.85)*exp(-pow((p.x*.8+p.y-sweepD)*7.,2.))*1.2;
      col=mix(col,sc,aa); break; } }
  o=vec4(col,1.);
}`;

export function create(env) {
  const { kit, post, input, audio, seed, quality } = env;
  const pS = kit.program(STEP), pD = kit.program(SHADE);
  const bus = audio && audio.bus({ gain: 1, send: .13 });
  let snd = {}, hiss, grit;
  if (bus) {
    const sr = bus.sr;
    snd.ticks = Array.from({ length: 12 }, (_, i) => bus.buffer(sequinTick(sr, seed + i * 3)));
    snd.gleam = bus.buffer(gleam(sr, seed & 1023));
    hiss = bus.loop(bus.buffer(rustle(sr, { dur: 3.1, density: 2600, seed: 3 })), { gain: 0, hp: 2200, lp: 11000, send: .06 });
    grit = bus.loop(bus.buffer(sandGrains(sr, 41, 4, 1500)), { gain: 0, hp: 1600, lp: 9000, send: .08 });
  }
  const r = rng(seed);
  let W = 2, H = 2, asp = [1, 1], cell = [1, 1], sim = null, cols = 1, rows = 1, side = null, onB = 0, total = 1;
  let hand = { x: 0, y: 0, tx: 0, ty: 0, on: false, id: null, dx: 0, dy: 1 }, seg = null, sideNow = 1, pic = (seed >>> 0) % 3, sweepD = 9, done = false;
  let tickAcc = 0, speedS = 0, lp = [0, 0], flipS = 0;
  const RAD = () => Math.min(asp[0], asp[1]) * .085;
  const local = p => [(p.x - .5) * asp[0], (p.y - .5) * asp[1]];

  function build() {
    const u = Math.min(asp[0], asp[1]) * .021;
    cell = [u, u * .62];
    cols = Math.ceil(asp[0] / cell[0]) + 2; rows = Math.ceil(asp[1] / cell[1]) + 2;
    sim = kit.double(cols, rows, 'rgba16f', { filter: 'NEAREST' });
    side = new Uint8Array(cols * rows); onB = 0; total = cols * rows; done = false;
  }
  // Same test as the shader, run per cell: the number of real flips drives the sound.
  function flipCount(a, b, s) {
    const R = RAD(), minX = Math.min(a[0], b[0]) - R, maxX = Math.max(a[0], b[0]) + R, minY = Math.min(a[1], b[1]) - R, maxY = Math.max(a[1], b[1]) + R;
    const r0 = Math.max(0, Math.floor((minY + asp[1] / 2) / cell[1]) - 1), r1 = Math.min(rows - 1, Math.ceil((maxY + asp[1] / 2) / cell[1]) + 1);
    const dx = b[0] - a[0], dy = b[1] - a[1], l2 = Math.max(dx * dx + dy * dy, 1e-7);
    let n = 0;
    for (let j = r0; j <= r1; j++) {
      const off = .5 * (j & 1), y = (j + .5) * cell[1] - asp[1] / 2;
      const c0 = Math.max(0, Math.floor((minX + asp[0] / 2) / cell[0] - off) - 1), c1 = Math.min(cols - 1, Math.ceil((maxX + asp[0] / 2) / cell[0] - off) + 1);
      for (let i = c0; i <= c1; i++) {
        const k = j * cols + i; if (side[k] === s) continue;
        const x = (i + off) * cell[0] - asp[0] / 2, u = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2));
        if (Math.hypot(x - a[0] - dx * u, y - a[1] - dy * u) < R) { side[k] = s; n++; onB += s ? 1 : -1; }
      }
    }
    return n;
  }
  input.on({
    down(p) { const l = local(p); hand.id = p.id; hand.on = true; hand.x = hand.tx = l[0]; hand.y = hand.ty = l[1]; },
    move(p) { const l = local(p); lp = [l[0], l[1]]; if (hand.id === p.id) { hand.tx = l[0]; hand.ty = l[1]; } },
    up(p) { if (hand.id === p.id) { hand.id = null; hand.on = false; } },
  });
  return {
    resize(w, h) {
      W = w; H = h; const na = w > h ? [w / h, 1] : [1, h / w];
      if (!sim || Math.abs(na[0] / na[1] - asp[0] / asp[1]) > .02) { asp = na; build(); }
    },
    reset() { pic = (pic + 1) % 3; side.fill(0); onB = 0; done = false; sideNow = 0; seg = 'clear'; sweepD = 9; },
    attract(t) {
      const id = 9, x = .5 + .42 * Math.sin(t * .6), y = .5 + .4 * Math.sin(t * 1.9);
      if (hand.id !== id) input.emit('down', { id, x, y });
      input.emit('move', { id, x, y, pressed: true });
    },
    frame(t, dt) {
      let a = [hand.x, hand.y], b = a, flips = 0, on = 0, sv = sideNow;
      if (seg === 'clear') { a = [-99, 0]; b = [99, 0]; on = 1; sv = 0; seg = null; }
      else if (hand.on) {
        const k = 1 - Math.exp(-dt * 40), dx = (hand.tx - hand.x) * k, dy = (hand.ty - hand.y) * k, d = Math.hypot(dx, dy);
        if (d > 1e-4) {
          // The nap of the cloth decides the side: up or right flips one way, down or left the other.
          const along = dx * .42 + dy * .91; if (Math.abs(along) > d * .12) sideNow = along > 0 ? 1 : 0;
          hand.dx += (dx / d - hand.dx) * .3; hand.dy += (dy / d - hand.dy) * .3;
          b = [hand.x + dx, hand.y + dy]; sv = sideNow; on = 1; flips = flipCount(a, b, sv);
          hand.x = b[0]; hand.y = b[1];
          speedS += (Math.min(1, d / Math.max(dt, .001) / 1.6) - speedS) * Math.min(1, dt * 30);
        } else speedS *= Math.exp(-dt * 20);
      } else speedS *= Math.exp(-dt * 20);
      const rad = seg === null && on && a[0] === -99 ? 1e3 : RAD();
      const sub = 2;
      for (let i = 0; i < sub; i++) { kit.draw(pS, { s: sim.read, asp, cell, a, b, rad, side: sv, on: i === 0 ? on : 0, dt: Math.min(dt, 1 / 40) / sub }, sim.write); sim.swap(); }

      if (bus) {
        // Real flips only: a stroke over sequins that have already turned just whispers.
        flipS += (Math.min(1, flips / 45) - flipS) * Math.min(1, dt * 26);
        tickAcc = Math.min(5, tickAcc + flips * .26);
        let budget = 3;
        while (tickAcc >= 1 && budget-- > 0) { tickAcc -= 1; bus.play(snd.ticks[Math.floor(r() * 12)], { gain: .1 + r() * .26, rate: .85 + r() * .4, pan: hand.x / asp[0] * .8 + (r() - .5) * .25, delay: r() * .012 }); }
        hiss.set({ gain: .045 * Math.sqrt(speedS) + .26 * flipS, lp: 7000 + 5000 * flipS }, .02);
        grit.set({ gain: .34 * flipS, rate: .85 + flipS * .4 }, .02);
      }
      if (!done && onB / total > .985) { done = true; sweepD = -asp[0] * .8 - asp[1]; snd.gleam && bus.play(snd.gleam, { gain: .5, send: .5 }); env.buzz(25); }
      if (done && onB / total < .4) done = false;
      if (onB === 0 && !done && sideNow === 0 && flips > 0) pic = (pic + 1) % 3;
      if (sweepD < 8) sweepD += dt * 2.6;

      post.begin();
      kit.draw(pD, { s: sim.read, asp, cell, lp: [lp[0] * .5 + .08 * Math.sin(t * .4), lp[1] * .5 + .06 * Math.cos(t * .31)], dirL: [hand.dx, hand.dy], time: t, sweepD, pic, seed: (seed % 61) * .37 });
      post.end({ exposure: 1.15, bloom: .1, vig: .6, grain: .012 }, dt);
    },
    destroy() { bus && bus.destroy(); },
  };
}
