// No.05 Sweep. Scattered coloured sand, a wide blade, one long push, a mirror left behind.
import { sandGrains, brownLoop, slump, gleam, rustle } from '../core/synth.js';

// Sim texture: rgb = colour * height (premultiplied), a = height. Everything moved keeps its colour.
const INIT = /* glsl */ `in vec2 v; out vec4 o; uniform vec2 asp; uniform float seed; uniform vec3 pal[4]; uniform sampler2D h; uniform float grow;
void main(){ vec2 p=(v-.5)*asp;
  float f=fbm(p*2.6+seed); float f2=fbm(p*9.+seed*2.);
  float H=pow(max(0.,f-.27),1.25)*.14*(.55+.85*f2)+.0016*fbm(p*40.+seed);
  // Soft drifts of each colour, never hard-edged patches.
  vec4 wt=vec4(fbm(p*2.4+seed+11.),fbm(p*2.4+seed+23.),fbm(p*2.4+seed+37.),fbm(p*2.4+seed+51.));
  wt=pow(max(wt,vec4(.001)),vec4(7.)); wt/=dot(wt,vec4(1.));
  vec3 c=pal[0]*wt.x+pal[1]*wt.y+pal[2]*wt.z+pal[3]*wt.w;
  // Pour-in: new sand arrives irregularly.
  float gate=smoothstep(0.,.14,grow-fbm(p*6.+seed*3.)*1.05);
  vec4 cur=texture(h,v); o=mix(cur,vec4(c*H,H),gate); }`;
const PUSH = /* glsl */ `in vec2 v; out vec4 o; uniform sampler2D h; uniform vec2 asp,c,dir; uniform float W,ds;
void main(){ vec2 p=(v-.5)*asp; vec2 n=vec2(-dir.y,dir.x); vec2 rel=p-c; float s=dot(rel,n),f=dot(rel,dir);
  vec4 cur=texture(h,v);
  float inW=smoothstep(W,W*.88,abs(s));
  if(inW<=0.){ o=cur; return; }
  const float R=.05;
  // Strip just passed by the blade is scraped bare; its load lands ahead of the blade.
  if(f<=0.&&f>-ds-.003){ o=cur*(1.-inW); return; }
  if(f>0.&&f<R){ vec4 m=vec4(0.); for(int i=0;i<4;i++){ vec2 q=p-dir*(f+ds*(float(i)+.5)/4.); m+=texture(h,q/asp+.5); } m*=.25;
    float wg=2./R*(1.-f/R); o=cur+m*inW*ds*wg; return; }
  o=cur; }`;
const RELAX = /* glsl */ `in vec2 v; out vec4 o; uniform sampler2D h; uniform vec2 tx,asp;
void main(){ vec4 c=texture(h,v); float lim=1.05*tx.x*asp.x; vec4 d=vec4(0.);
  for(int i=0;i<4;i++){ vec2 e=i==0?vec2(tx.x,0.):i==1?vec2(-tx.x,0.):i==2?vec2(0.,tx.y):vec2(0.,-tx.y); vec4 n=texture(h,v+e);
    float diff=n.a-c.a; if(diff>lim){ d+=n*min((diff-lim)/max(n.a,1e-5),1.)*.11; } else if(diff<-lim){ d-=c*min((-diff-lim)/max(c.a,1e-5),1.)*.11; } }
  o=max(c+d,vec4(0.)); }`;
const CHECK = /* glsl */ `in vec2 v; out vec4 o; uniform sampler2D h; void main(){ float a=0.; for(int y=0;y<3;y++)for(int x=0;x<3;x++) a=max(a,texture(h,v+(vec2(x,y)-1.)*.01).a); o=vec4(a*300.,0.,0.,1.); }`;
const FADE = /* glsl */ `in vec2 v; out vec4 o; uniform sampler2D h; uniform float k; void main(){ vec4 c=texture(h,v); o=c*(c.a<.002?k:1.); }`;

const SHADE = /* glsl */ `in vec2 v; out vec4 o; uniform sampler2D h; uniform vec2 asp,tx,res,sun,bc,bd; uniform float bw,show,gleamX,seedB;
float H(vec2 uv){ return texture(h,uv).a; }
void main(){
  vec2 p=(v-.5)*asp; vec4 c=texture(h,v); float h0=c.a;
  vec2 e=tx*1.2; float hx=H(v+vec2(e.x,0.))-H(v-vec2(e.x,0.)),hy=H(v+vec2(0.,e.y))-H(v-vec2(0.,e.y));
  vec2 g=vec2(hx,hy)/(2.*e*asp)*1.15;
  float gs=res.y/1.05; vec2 gi=floor(p*gs); vec2 rnd=hash2(gi); vec2 mg=(rnd-.5)*.32;
  vec3 N=normalize(vec3(-g+mg,1.));
  vec3 L=normalize(vec3(sun,.55));
  float sh=1.; float z=h0+.0002; vec2 st=L.xy*.0035;
  for(int i=1;i<=9;i++){ float d=float(i)*(1.+float(i)*.15); vec2 uv=(p+st*d)/asp+.5; float rz=z+.65*length(st)*d; sh=min(sh,1.-smoothstep(0.,.0028,H(uv)-rz)); }
  sh=mix(.36,1.,sh);
  // Polished obsidian bed: the prize under the sand.
  vec3 Nb=normalize(vec3((vnoise(p*3.+seedB)-.5)*.012,(vnoise(p*3.+seedB+5.)-.5)*.012,1.));
  vec3 Ny=vec3(Nb.x,Nb.z,-Nb.y); vec3 R=normalize(reflect(vec3(0.,-1.,0.),Ny)+vec3(p.x*1.25-.65,0.,-p.y*1.25-.4));
  // A soft window and gradient lie in the polish, so bare stone reads as mirror, not as a hole.
  float win=smoothstep(.75,-.45,p.x*.7+p.y)*.032+.005;
  vec3 bed=vec3(win*.94,win*.97,win);
  bed*=mix(.6,1.,sh);
  float gl=exp(-pow((p.x+p.y*.4-gleamX)*5.,2.)); bed+=vec3(1.,.96,.88)*gl*.42;
  // Sand with visible grains and thin scatter at the fringes.
  float cov=smoothstep(.0002+rnd.y*.0024,.0009+rnd.y*.0026,h0);
  vec3 alb=h0>1e-5?c.rgb/h0:vec3(.5);
  alb*=mix(.74,1.14,hash(gi+3.)); alb*=1.-.3*step(.86,hash(gi+7.));
  vec3 sunC=vec3(1.5,1.14,.82),sky=vec3(.38,.37,.38);
  vec3 col=alb*alb*(sunC*max(dot(N,L),0.)*sh*1.55+sky*(.5+.5*N.z));
  vec3 Hv=normalize(L+vec3(0.,0.,1.)); vec3 Ng=normalize(vec3(mg*2.2+(hash2(gi+11.)-.5)*.9,1.));
  col+=vec3(1.,.92,.75)*pow(max(dot(Ng,Hv),0.),240.)*sh*step(.6,hash(gi+21.))*2.2;
  col=mix(bed,col,cov);
  // Blade and its contact shadow.
  if(show>0.){ vec2 n=vec2(-bd.y,bd.x); vec2 r=p-bc; float s=dot(r,n),f=dot(r,bd);
    float inS=smoothstep(bw+.004,bw,abs(s));
    col*=1.-.5*show*inS*smoothstep(.05,.0,abs(f+.016));
    float bar=inS*smoothstep(.0105,.0085,abs(f+.003));
    vec3 Nbar=normalize(vec3(bd*(f+.003)/.012,.65)); vec3 Ry=vec3(Nbar.x,Nbar.z,-Nbar.y);
    vec3 metal=vec3(.72,.56,.33)*(.1+.8*max(dot(Nbar,L),0.))+studio(reflect(vec3(0.,-1.,0.),Ry))*.3;
    col=mix(col,metal,bar*show); }
  o=vec4(col,1.);
}`;

const PALS = [
  [[.82, .36, .22], [.9, .67, .3], [.29, .46, .62], [.82, .78, .7]],
  [[.25, .55, .55], [.83, .78, .62], [.74, .32, .38], [.2, .28, .46]],
  [[.92, .78, .55], [.62, .42, .28], [.78, .55, .36], [.34, .22, .17]],
  [[.74, .42, .72], [.42, .4, .82], [.34, .72, .78], [.9, .85, .75]],
];

export function create(env) {
  const { kit, gl, post, input, ui, audio, quality, seed } = env;
  const pI = kit.program(INIT), pP = kit.program(PUSH), pR = kit.program(RELAX), pS = kit.program(SHADE), pC = kit.program(CHECK), pF = kit.program(FADE);
  const bus = audio && audio.bus({ gain: 1, send: .12 });
  let grains, grains2, body, snd = {};
  if (bus) {
    const sr = bus.sr;
    grains = bus.loop(bus.buffer(sandGrains(sr, 11)), { gain: 0, hp: 1800, lp: 12000, send: .07 });
    grains2 = bus.loop(bus.buffer(sandGrains(sr, 23, 4, 900)), { gain: 0, hp: 500, lp: 5000, rate: .62, send: .1 });
    body = bus.loop(bus.buffer(brownLoop(sr, 5)), { gain: 0, hp: 75, lp: 700, send: .05 });
    snd.spill = [0, 1, 2].map(i => bus.buffer(slump(sr, seed + i, { size: 1 + i * .3 })));
    snd.gleam = bus.buffer(gleam(sr, seed & 1023));
    snd.pour = bus.buffer(rustle(sr, { dur: 1.5, density: 2400, seed: 8 }));
  }
  let W = 2, H = 2, asp = [1, 1], sim = null, chk = null, gen = 0, pal = null;
  let blade = { x: 0, y: 0, tx: 0, ty: 0, dx: 0, dy: 1, on: false, id: null, a: 0 };
  let load = 0, speedS = 0, grow = 2, doneT = -1, checkT = 0, relaxN = 8, gleamX = -9, spillT = 0, autoT = 0, seedG = 0;
  const bw = () => Math.min(asp[0], asp[1]) * .29;

  function pour() {
    gen++; seedG = (seed % 91) * .3 + gen * 3.1; pal = new Float32Array(PALS[gen % PALS.length].flat());
    grow = 0; doneT = -1; gleamX = -9; relaxN = 40; load = 0;
    snd.pour && bus.play(snd.pour, { gain: .5 });
  }
  const local = p => [(p.x - .5) * asp[0], (p.y - .5) * asp[1]];
  input.on({
    down(p) { if (doneT >= 0 && doneT < 1) return; const l = local(p); blade.id = p.id; blade.on = true; blade.x = blade.tx = l[0]; blade.y = blade.ty = l[1]; blade.fresh = true; },
    move(p) { if (blade.id === p.id) { const l = local(p); blade.tx = l[0]; blade.ty = l[1]; } },
    up(p) { if (blade.id === p.id) { blade.id = null; blade.on = false; } },
  });
  function push(dt) {
    if (!blade.on) { speedS += (0 - speedS) * Math.min(1, dt * 18); return 0; }
    const dx = blade.tx - blade.x, dy = blade.ty - blade.y, d = Math.hypot(dx, dy);
    // The heavier the load, the more the blade lags the hand.
    const k = 1 - Math.exp(-dt * (26 - Math.min(15, load * 13))), mv = d * k;
    if (blade.fresh) { if (d < .012) return 0; blade.dx = dx / d; blade.dy = dy / d; blade.fresh = false; }
    if (d > 1e-4) {
      // A wide plow has to be turned before it can push the new way, so it pivots in place first.
      const along0 = (dx * blade.dx + dy * blade.dy) / d;
      if (along0 < .75) {
        const tt = 1 - Math.exp(-dt * 20);
        blade.dx += (dx / d - blade.dx) * tt; blade.dy += (dy / d - blade.dy) * tt;
        const l = Math.hypot(blade.dx, blade.dy) || 1; blade.dx /= l; blade.dy /= l;
        return 0;
      }
      const reach = Math.min(mv, .09), steps = Math.max(1, Math.ceil(reach / .009)), ds = reach / steps;
      const tt = 1 - Math.exp(-dt * 6 / steps);
      for (let i = 0; i < steps; i++) {
        // Turn a little on every step: turning between frames would leave a fan of ridges.
        blade.dx += (dx / d - blade.dx) * tt; blade.dy += (dy / d - blade.dy) * tt;
        const l = Math.hypot(blade.dx, blade.dy) || 1; blade.dx /= l; blade.dy /= l;
        blade.x += dx / d * ds; blade.y += dy / d * ds;
        const along = (dx * blade.dx + dy * blade.dy) / d;
        kit.draw(pP, { h: sim.read, asp, c: [blade.x, blade.y], dir: [blade.dx, blade.dy], W: bw(), ds: ds * along }, sim.write); sim.swap();
      }
      relaxN = 22;
    }
    const v = Math.min(mv, .09) / Math.max(dt, .001);
    speedS += (Math.min(1, v / 1.2) - speedS) * Math.min(1, dt * 30);
    load = Math.min(1.1, load + v * dt * .62);
    return v;
  }
  const px = new Uint8Array(32 * 32 * 4);
  function check() {
    kit.draw(pC, { h: sim.read }, chk);
    gl.readPixels(0, 0, 32, 32, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let clean = 0; for (let i = 0; i < px.length; i += 4) if (px[i] < 14) clean++;
    return clean / (32 * 32);
  }
  return {
    resize(w, h) {
      W = w; H = h; const na = w > h ? [w / h, 1] : [1, h / w];
      if (!sim || Math.abs(na[0] / na[1] - asp[0] / asp[1]) > .02) {
        asp = na; const m = quality === 'low' ? 720 : 1100;
        sim = kit.double(w >= h ? m : Math.round(m * w / h), w >= h ? Math.round(m * h / w) : m, 'rgba16f');
        chk = kit.fbo(32, 32, 'rgba8');
        pour();
      }
    },
    reset() { pour(); },
    attract(t) {
      const id = 5, a = t * .55, x = .5 + .42 * Math.sin(a * 1.3), y = .5 + .42 * Math.sin(a * .8 + 1);
      if (blade.id !== id) input.emit('down', { id, x, y });
      input.emit('move', { id, x, y, pressed: true });
    },
    frame(t, dt) {
      if (grow < 1.2) { grow += dt * .9; kit.draw(pI, { asp, seed: seedG, pal, h: sim.read, grow }, sim.write); sim.swap(); relaxN = 20; }
      const v = push(dt);
      for (let i = 0; i < (relaxN > 0 ? 3 : 0); i++) { kit.draw(pR, { h: sim.read, tx: [1 / sim.w, 1 / sim.h], asp }, sim.write); sim.swap(); }
      relaxN--;
      load *= Math.exp(-dt * (blade.on ? .28 : 1.4));

      if (bus) {
        const s = Math.sqrt(speedS), l = .35 + Math.min(1, load) * .9;
        grains.set({ gain: .42 * s * l, hp: 1300 + 1900 * speedS, lp: 6000 + 5000 * speedS }, .02);
        grains2.set({ gain: .32 * s * l, lp: 2400 + 3000 * speedS, rate: .52 + speedS * .25 }, .02);
        body.set({ gain: .75 * s * l * (.45 + load), lp: 260 + 760 * speedS }, .03);
        spillT -= dt;
        // Load tumbling over the edge of the plate.
        const edge = Math.abs(blade.x + blade.dx * .05) > asp[0] * .5 || Math.abs(blade.y + blade.dy * .05) > asp[1] * .5;
        if (edge && blade.on && load > .25 && spillT <= 0) { bus.play(snd.spill[Math.floor(Math.random() * 3)], { gain: .55 + Math.min(.4, load * .4), pan: blade.x / asp[0] }); load *= .35; spillT = .5; env.buzz(30); }
      }
      checkT -= dt;
      if (checkT <= 0 && doneT < 0 && grow >= 1.2) {
        checkT = .35;
        if (check() > .94) { doneT = 0; gleamX = -asp[0] - asp[1] * .4; blade.on = false; blade.id = null; snd.gleam && bus.play(snd.gleam, { gain: .55, send: .5 }); env.buzz(25); }
      }
      if (doneT >= 0) {
        doneT += dt; gleamX += dt * 2.3;
        kit.draw(pF, { h: sim.read, k: Math.exp(-dt * 4) }, sim.write); sim.swap();
        if (doneT > 2.7) pour();
      }
      post.begin();
      kit.draw(pS, { h: sim.read, asp, tx: [1 / sim.w, 1 / sim.h], res: [W, H], sun: [-.7, .55], bc: [blade.x, blade.y], bd: [blade.dx, blade.dy], bw: bw(), show: blade.on ? 1 : 0, gleamX, seedB: 3 });
      post.end({ exposure: 1, bloom: .05, dof: .55, dofW: .34, vig: .7, grain: .014 }, dt);
    },
    destroy() { bus && bus.destroy(); },
  };
}
