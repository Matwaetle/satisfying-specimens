// No.07 Squeegee. Soap across the whole pane; one pull and the city is suddenly, perfectly there.
import { squeakLoop, waterLoop, gleam, bubble, rustle, rng } from '../core/synth.js';
import { CITY } from '../core/scenes.js';

// r = foam thickness, g = water film, b = clear-line age (0 where freshly wiped).
const INIT = /* glsl */ `in vec2 v; out vec4 o; uniform vec2 asp; uniform float seed,cover; uniform sampler2D h;
void main(){ vec2 p=(v-.5)*asp; float f=fbm(p*3.+seed); float th=.72+.5*f;
  // Roll on from the top with a soft wandering edge.
  float g=smoothstep(0.,.05,cover-(1.-v.y)-(fbm(p*5.+seed)-.5)*.14);
  vec4 c=texture(h,v); o=mix(c,vec4(th,.6,1.,1.),g); }`;
const WIPE = /* glsl */ `in vec2 v; out vec4 o; uniform sampler2D h; uniform vec2 asp,c,dir; uniform float W,ds;
void main(){ vec2 p=(v-.5)*asp; vec2 n=vec2(-dir.y,dir.x); vec2 rel=p-c; float s=dot(rel,n),f=dot(rel,dir);
  vec4 cur=texture(h,v); float inW=smoothstep(W,W*.985,abs(s));
  if(inW<=0.){ o=cur; return; }
  // Rubber lip: whatever it passes is gone, and foam bunches up against it.
  if(f<=0.&&f>-ds-.014){ vec4 k=cur; k.r*=1.-inW; k.g*=1.-inW; k.b*=1.-inW; o=k; return; }
  const float R=.035;
  if(f>0.&&f<R){ float m=0.; for(int i=0;i<3;i++){ vec2 q=p-dir*(f+ds*(float(i)+.5)/3.); m+=texture(h,q/asp+.5).r; } m/=3.;
    o=cur+vec4(m*inW*ds*(2./R)*(1.-f/R),.1*inW,0.,0.); return; }
  o=cur; }`;
const DRIP = /* glsl */ `in vec2 v; out vec4 o; uniform sampler2D h; uniform vec2 asp; uniform vec3 d[24]; uniform float dt;
void main(){ vec2 p=(v-.5)*asp; vec4 c=texture(h,v);
  // Foam slowly sags; thin water evaporates back to clear.
  vec4 up=texture(h,v+vec2(0.,.0016)); c.r=mix(c.r,max(c.r,up.r*.992),.05); c.g*=exp(-dt*.5);
  for(int i=0;i<24;i++){ if(d[i].z<=0.) continue; vec2 q=(p-d[i].xy)/vec2(d[i].z,d[i].z*1.5); float m=smoothstep(1.,.5,length(q)); c.r*=1.-m; c.g=max(c.g,m*.5); }
  o=c; }`;
const CHECK = /* glsl */ `in vec2 v; out vec4 o; uniform sampler2D h; void main(){ float a=0.; for(int y=0;y<3;y++)for(int x=0;x<3;x++) a=max(a,texture(h,v+(vec2(x,y)-1.)*.012).r); o=vec4(a,0.,0.,1.); }`;
const FADE = /* glsl */ `in vec2 v; out vec4 o; uniform sampler2D h; uniform float k; void main(){ vec4 c=texture(h,v); c.r*=k; c.g*=k; o=c; }`;
const SHADE = /* glsl */ `in vec2 v; out vec4 o; uniform sampler2D h,scene,cells; uniform vec2 asp,tx,bc,bd; uniform float bw,show,sweepD,time;
void main(){
  vec2 p=(v-.5)*asp; vec4 c=texture(h,v); float th=c.r;
  vec2 e=tx*1.5; vec2 g=vec2(texture(h,v+vec2(e.x,0.)).r-texture(h,v-vec2(e.x,0.)).r,texture(h,v+vec2(0.,e.y)).r-texture(h,v-vec2(0.,e.y)).r);
  vec4 cc=texture(cells,fract(p*1.55));
  vec2 bubN=(cc.rg-.5)*2.;
  // Clean glass: the scene, razor sharp, with a thin wet refraction where water lingers.
  vec2 wg=vec2(texture(h,v+vec2(e.x,0.)).g-texture(h,v-vec2(e.x,0.)).g,texture(h,v+vec2(0.,e.y)).g-texture(h,v-vec2(0.,e.y)).g);
  vec3 back=texture(scene,v+wg*.09).rgb;
  back*=1.+c.g*.12;
  float streak=smoothstep(.12,.0,abs(p.x*.75+p.y-.15+.02*sin(p.y*6.)))*.028+smoothstep(.016,.0,abs(p.x*.75+p.y-.34))*.035;
  back+=vec3(.75,.82,.9)*streak;
  back+=vec3(.8,.9,1.)*smoothstep(.015,.0,abs(p.x*.75+p.y-sweepD))*.9+vec3(.5,.6,.72)*exp(-pow((p.x*.75+p.y-sweepD)*6.,2.))*.26;
  // Foam: stacked bubbles, lit from above, glowing faintly with the city behind.
  float dens=smoothstep(.02,.32,th);
  vec3 N=normalize(vec3(-g*7.+bubN*(.5+.25*cc.a),1.));
  vec3 L=normalize(vec3(-.4,.55,.75));
  float d=max(dot(N,L),0.);
  vec3 foam=vec3(.5,.53,.58)*(.3+.66*d)*(.55+.55*smoothstep(0.,1.2,th));
  foam*=.76+.34*cc.b;
  foam+=vec3(1.)*pow(max(dot(N,normalize(L+vec3(0.,0.,1.))),0.),90.)*.65*cc.a;
  foam+=texture(scene,v+bubN*.04).rgb*.22;
  vec3 col=mix(back,foam,dens);
  if(show>0.){ vec2 n=vec2(-bd.y,bd.x); vec2 r=p-bc; float s=dot(r,n),f=dot(r,bd); float inS=smoothstep(bw+.002,bw,abs(s));
    float rub=inS*smoothstep(.0052,.004,abs(f+.003)); float chan=inS*smoothstep(.0145,.0125,abs(f+.016));
    vec3 Nbar=normalize(vec3(bd*(f+.016)/.016,.7)); vec3 Ry=vec3(Nbar.x,Nbar.z,-Nbar.y);
    vec3 metal=vec3(.54,.56,.58)*(.12+.6*max(dot(Nbar,L),0.))+studio(reflect(vec3(0.,-1.,0.),Ry))*.4;
    col=mix(col,metal,chan*show); col=mix(col,vec3(.008),rub*show); }
  o=vec4(col,1.);
}`;
const CELLS = /* glsl */ `in vec2 v; out vec4 o;
void main(){ vec2 nrm=vec2(0.); float fl=0.,lit=0.; for(int l=0;l<3;l++){ float s=20.*pow(1.9,float(l)); vec2 g=v*s; vec2 id=floor(g),f=fract(g); float best=9.; vec2 bd=vec2(0.); float br=.4;
    for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){ vec2 n=vec2(x,y); vec2 w=mod(id+n,s); vec2 ctr=n+hash2(w+float(l)*7.)*.8+.1; vec2 dd=f-ctr; float r=.26+.42*hash(w+3.); float q=length(dd)/r; if(q<best){ best=q; bd=dd/r; br=r; } }
    if(best<1.){ float z=sqrt(1.-best*best); float wg=(1./(1.+float(l)*.7)); nrm+=bd*wg; lit=max(lit,pow(1.-best,.3)*wg); fl=max(fl,smoothstep(.75,.98,best)*wg); } }
  o=vec4(clamp(nrm*.5+.5,0.,1.),.45+.55*lit,fl); }`;

export function create(env) {
  const { kit, gl, post, input, ui, audio, seed, quality } = env;
  const p = { init: kit.program(INIT), wipe: kit.program(WIPE), drip: kit.program(DRIP), shade: kit.program(SHADE), city: kit.program(CITY), cells: kit.program(CELLS), check: kit.program(CHECK), fade: kit.program(FADE) };
  const bus = audio && audio.bus({ gain: 1, send: .2 });
  let squeak, wet, snd = {};
  if (bus) {
    const sr = bus.sr;
    squeak = bus.loop(bus.buffer(squeakLoop(sr)), { gain: 0, hp: 900, lp: 7500, rate: 1, send: .16 });
    wet = bus.loop(bus.buffer(waterLoop(sr, 17)), { gain: 0, hp: 350, lp: 3800, rate: 1.4, send: .1 });
    snd.gleam = bus.buffer(gleam(sr, seed & 1023));
    snd.drops = [0, 1, 2, 3, 4].map(i => bus.buffer(bubble(sr, 900 + i * 420, { rise: 1.7, tau: .012, seed: i + 3, impact: .1 })));
    snd.lather = bus.buffer(rustle(sr, { dur: 1.1, density: 800, seed: 4 }));
  }
  const r = rng(seed);
  const cellsT = kit.fbo(1024, 1024, 'rgba8', { wrap: 'REPEAT' });
  kit.draw(p.cells, {}, cellsT);
  let W = 2, H = 2, asp = [1, 1], sim = null, chk = null, sceneT = null;
  let blade = { x: 0, y: 0, tx: 0, ty: 0, dx: 0, dy: -1, on: false, id: null };
  let cover = 1.3, sndV = 0, drops = [], gen = 0, doneT = -1, checkT = 0, gleamD = 9, spawn = 0, seedG = (seed % 37) * .41;
  const bw = () => Math.min(asp[0], asp[1]) * .24, dropArr = new Float32Array(72);

  const local = q => [(q.x - .5) * asp[0], (q.y - .5) * asp[1]];
  function lather() { gen++; seedG += 1.7; cover = 0; doneT = -1; gleamD = 9; snd.lather && bus.play(snd.lather, { gain: .35 }); }
  input.on({
    down(q) { if (doneT >= 0) return; const l = local(q); blade.id = q.id; blade.on = true; blade.x = blade.tx = l[0]; blade.y = blade.ty = l[1]; blade.fresh = true; },
    move(q) { if (blade.id === q.id) { const l = local(q); blade.tx = l[0]; blade.ty = l[1]; } },
    up(q) { if (blade.id === q.id) { blade.id = null; blade.on = false; } },
  });
  function addDrop(x, y, rad) { if (drops.length < 24) drops.push({ x, y, r: rad, v: .06 + r() * .1, w: r() * 6, life: 5 }); }
  function move(dt) {
    if (!blade.on) return 0;
    const dx = blade.tx - blade.x, dy = blade.ty - blade.y, d = Math.hypot(dx, dy), k = 1 - Math.exp(-dt * 30), mv = d * k;
    if (blade.fresh) { if (d < .012) return 0; blade.dx = dx / d; blade.dy = dy / d; blade.fresh = false; }
    if (d > 1e-4) {
      const tt = 1 - Math.exp(-dt * 13); blade.dx += (dx / d - blade.dx) * tt; blade.dy += (dy / d - blade.dy) * tt;
      const l = Math.hypot(blade.dx, blade.dy) || 1; blade.dx /= l; blade.dy /= l;
      const steps = Math.min(6, Math.ceil(mv / .012)), ds = mv / Math.max(steps, 1);
      for (let i = 0; i < steps; i++) {
        blade.x += dx / d * ds; blade.y += dy / d * ds;
        kit.draw(p.wipe, { h: sim.read, asp, c: [blade.x, blade.y], dir: [blade.dx, blade.dy], W: bw(), ds }, sim.write); sim.swap();
      }
    }
    return mv / Math.max(dt, .001);
  }
  const px = new Uint8Array(32 * 32 * 4);
  function clean() {
    kit.draw(p.check, { h: sim.read }, chk); gl.readPixels(0, 0, 32, 32, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let n = 0; for (let i = 0; i < px.length; i += 4) if (px[i] < 22) n++; return n / (32 * 32);
  }
  return {
    resize(w, h) {
      W = w; H = h; const na = w > h ? [w / h, 1] : [1, h / w];
      sceneT = kit.fbo(w, h, 'rgba16f'); kit.draw(p.city, { res: [w, h], seed: (seed % 53) * .7 }, sceneT);
      if (!sim || Math.abs(na[0] / na[1] - asp[0] / asp[1]) > .02) {
        asp = na; const m = quality === 'low' ? 640 : 960;
        sim = kit.double(w >= h ? m : Math.round(m * w / h), w >= h ? Math.round(m * h / w) : m, 'rgba16f');
        chk = kit.fbo(32, 32, 'rgba8');
        kit.draw(p.init, { asp, seed: seedG, cover: 3, h: sim.read }, sim.write); sim.swap();
      }
    },
    reset() { lather(); },
    attract(t) {
      const id = 3, x = .5 + .4 * Math.sin(t * .5), y = .5 + .44 * Math.cos(t * 1.05);
      if (blade.id !== id) input.emit('down', { id, x, y });
      input.emit('move', { id, x, y, pressed: true });
    },
    frame(t, dt) {
      if (cover < 1.3) { cover += dt * 1.3; kit.draw(p.init, { asp, seed: seedG, cover, h: sim.read }, sim.write); sim.swap(); }
      const v = move(dt);
      const speed = Math.min(1, v / 1.5);
      sndV += (speed - sndV) * Math.min(1, dt * 34);
      if (bus) {
        // Squeak rises with speed; real rubber chatters, so wobble it slightly.
        const wob = 1 + .03 * Math.sin(t * 37) + .018 * Math.sin(t * 91);
        squeak.set({ gain: .24 * Math.pow(sndV, .75), rate: (.58 + sndV * .85) * wob, lp: 3500 + 4000 * sndV }, .012);
        wet.set({ gain: .42 * Math.sqrt(sndV), lp: 1800 + 2400 * sndV }, .02);
      }
      // Blade corners shed runs of water that track down the glass.
      spawn -= dt;
      if (blade.on && v > .2 && spawn <= 0) {
        spawn = .09 + r() * .14; const nx = -blade.dy, ny = blade.dx, s = r() < .5 ? -1 : 1;
        addDrop(blade.x + nx * bw() * s * (.97 + r() * .05), blade.y + ny * bw() * s, .0048 + r() * .004);
        if (bus && r() < .4) bus.play(snd.drops[Math.floor(r() * 5)], { gain: .1 + r() * .1, pan: blade.x / asp[0] });
      }
      dropArr.fill(0);
      drops.forEach((d, i) => { d.v = Math.min(.42, d.v + dt * .12); d.y -= d.v * dt; d.x += Math.sin(t * 2 + d.w) * dt * .012; d.life -= dt; dropArr.set([d.x, d.y, d.r], i * 3); });
      drops = drops.filter(d => d.life > 0 && d.y > -asp[1]);
      kit.draw(p.drip, { h: sim.read, asp, d: dropArr, dt }, sim.write); sim.swap();

      checkT -= dt;
      if (doneT < 0 && cover >= 1.3 && checkT <= 0) {
        checkT = .3;
        if (clean() > .93) { doneT = 0; gleamD = -asp[0] * .75 - asp[1]; blade.on = false; blade.id = null; snd.gleam && bus.play(snd.gleam, { gain: .5, send: .5 }); env.buzz(25); }
      }
      if (doneT >= 0) {
        doneT += dt; gleamD += dt * 3;
        kit.draw(p.fade, { h: sim.read, k: Math.exp(-dt * 5) }, sim.write); sim.swap();
        if (doneT > 3.4) lather();
      }
      post.begin();
      kit.draw(p.shade, { h: sim.read, scene: sceneT, cells: cellsT, asp, tx: [1 / sim.w, 1 / sim.h], bc: [blade.x, blade.y], bd: [blade.dx, blade.dy], bw: bw(), show: blade.on ? 1 : 0, sweepD: gleamD, time: t });
      post.end({ exposure: 1.2, bloom: .07, vig: .55, grain: .012 }, dt);
    },
    destroy() { bus && bus.destroy(); },
  };
}
