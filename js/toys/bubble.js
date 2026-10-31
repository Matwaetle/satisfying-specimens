// No.01 Bubble film. Press builds, the membrane gives, air escapes.
import { pop, rustle, rng } from '../core/synth.js';

const FRAG = /* glsl */ `in vec2 v; out vec4 o;
uniform sampler2D state; uniform vec2 res,grid,light; uniform float cell,slide,tint,time;
const float SQ=.8660254;
vec3 TINTS[4]=vec3[4](vec3(.93,.96,.97),vec3(.98,.86,.70),vec3(.74,.93,.92),vec3(.97,.78,.76));

// Find the nearest hex-packed bubble centre in cell units.
void nearest(vec2 p,out vec2 id,out vec2 d){
  float r0=floor(p.y/SQ+.5); float best=1e9;
  for(int k=-1;k<=1;k++){ float r=r0+float(k); float off=mod(r,2.)*.5; float c=floor(p.x-off+.5);
    vec2 q=p-vec2(c+off,r*SQ); float l=dot(q,q); if(l<best){best=l;id=vec2(c,r);d=q;} }
}
float dome(float r){ return r<1.?pow(1.-r*r,.62):0.; }
float hBubble(float r,float press,float popped,vec2 q,float seed){
  // Press flattens the crown and pushes volume out towards the weld.
  float base=dome(r)*(1.-press*.62)+press*.22*exp(-pow((r-.86)/.16,2.))*step(r,1.1);
  // Burst film collapses into radial creases.
  if(popped<=0.) return base;
  float crease=(vnoise(q*1.9+seed*41.)-.5)*.62+(vnoise(q*4.3+seed*17.)-.5)*.22;
  float flat_=(.1+crease)*smoothstep(1.,.45,r)*.62;
  return mix(base,flat_,popped);
}
void main(){
  vec2 px=v*res; vec2 p=vec2(px.x,px.y-slide*res.y)/cell;
  vec2 id,d; nearest(p,id,d);
  ivec2 ij=ivec2(int(id.x)+1,int(id.y)+1);
  vec4 s=vec4(0.,1.,.5,0.);
  bool has=ij.x>=0&&ij.y>=0&&ij.x<int(grid.x)&&ij.y<int(grid.y);
  if(has) s=texelFetch(state,ij,0);
  float press=s.r,popped=s.g,seed=s.b;
  const float R=.455;
  vec2 q=d/R; float r=length(q);
  q*=1.+.012*sin(seed*40.+atan(q.y,q.x)*3.);
  r=length(q);
  float e=.02;
  float h0=hBubble(r,press,popped,q,seed);
  float hx=hBubble(length(q+vec2(e,0.)),press,popped,q+vec2(e,0.),seed);
  float hy=hBubble(length(q+vec2(0.,e)),press,popped,q+vec2(0.,e),seed);
  vec2 g=vec2(hx-h0,hy-h0)/e;
  float inside=smoothstep(1.03,.97,r);
  // Film between bubbles: a soft, slightly wavy polyethylene sheet.
  vec2 wp=p*.55; float w0=vnoise(wp+2.),wx=vnoise(wp+vec2(.03,0.)+2.),wy=vnoise(wp+vec2(0.,.03)+2.);
  vec2 gs=vec2(wx-w0,wy-w0)/.03*.05;
  vec3 N=normalize(vec3(mix(gs,g*.62*(1.-popped*.72)+gs*.3,inside),1.));
  vec3 Ny=vec3(N.x,N.z,-N.y);
  vec3 V=vec3(0.,1.,0.);
  vec3 tintc=TINTS[int(tint)];
  // What sits under the film: warm dark card with a pool of light.
  vec2 uvn=(v-.5)*vec2(res.x/res.y,1.);
  vec2 refr=px/cell-N.xy*.35*(.3+h0);
  float card=.72+.28*vnoise(refr*2.3);
  vec3 under=vec3(.042,.037,.032)*card;
  under*=.72+1.6*exp(-dot(uvn-light*.2,uvn-light*.2)*2.2);
  // Dome casts a soft contact shadow up-right of light.
  float sh=smoothstep(1.15,.55,length(q-vec2(-.17,.17)))*(1.-popped*.65);
  under*=1.-.55*sh*(1.-smoothstep(.7,1.,r)*0.)*(1.-inside*.7);
  // Caustic crescent: dome focuses light onto the card on the far side.
  float ca=exp(-pow((length(q-vec2(.14,-.14))-.55)/.2,2.))*inside*(1.-popped)*(1.-press*.8);
  under+=vec3(1.,.93,.82)*ca*.12;
  // Light through plastic.
  vec3 col=under*mix(vec3(1.),tintc,.5+inside*.3);
  // Weld ring where dome meets the sheet.
  float weld=exp(-pow((r-1.)/.045,2.));
  col+=vec3(.5,.48,.45)*weld*.08*(1.-popped*.5);
  // Stress-whitened crease in burst bubbles.
  if(popped>0.){
    float cr=length(g)*.42; float milky=smoothstep(.15,.9,cr)*inside;
    col+=tintc*milky*.085*popped;
    col+=vec3(.75,.75,.72)*.035*popped*inside;
  }
  // Two-surface reflection: outer shell plus a dimmer flipped inner shell.
  vec3 lDir=normalize(vec3(light.x*.35,1.,-light.y*.35));
  vec3 Rf=reflect(-lDir*0.-V,Ny); Rf=vec3(Rf.x,abs(Rf.y),Rf.z);
  // Reflections drift across the sheet, so no two bubbles carry the same highlight.
  vec3 tilt=normalize(Ny+vec3(light.x,0.,-light.y)*.1+vec3(uvn.x,0.,-uvn.y)*.34+vec3(seed-.5,0.,fract(seed*7.)-.5)*.035);
  vec3 R1=reflect(-V,tilt);
  float F=schlick(max(dot(tilt,V),0.),.05);
  vec3 refl=studio(R1)*F*1.9;
  vec3 Ninner=normalize(vec3(-Ny.x,Ny.y,-Ny.z)*vec3(.72,1.,.72));
  vec3 R2=reflect(-V,Ninner);
  refl+=studio(R2)*schlick(Ninner.y,.05)*.85*inside*(1.-popped*.85)*(1.-press*.5);
  // Fresnel rim glow from thick edges of the dome.
  float rim=pow(smoothstep(.45,.97,r),3.)*inside*(1.-popped);
  col+=tintc*rim*.07;
  // Flat film between bubbles only glints faintly, and burst film goes matte.
  col+=refl*mix(vec3(1.),tintc,.25)*mix(.1,1.-popped*.72,inside);
  // Sheet edge after sliding.
  float top=res.y*(slide);
  o=vec4(col,1.);
}`;

export function create(env) {
  const { kit, gl, post, input, ui, audio } = env;
  const r = rng(env.seed);
  const prog = kit.program(FRAG);
  const bus = audio && audio.bus({ gain: .95, send: .1 });
  let pops = null, rust = null;
  if (bus) {
    const sr = bus.sr;
    pops = { 1: [], 1.5: [], 2.6: [] };
    for (let i = 0; i < 24; i++) pops[1].push(bus.buffer(pop(sr, { size: 1, seed: env.seed + i })));
    for (let i = 0; i < 12; i++) pops[1.5].push(bus.buffer(pop(sr, { size: 1.5, seed: env.seed + 100 + i })));
    for (let i = 0; i < 8; i++) pops[2.6].push(bus.buffer(pop(sr, { size: 2.6, seed: env.seed + 200 + i })));
    rust = bus.buffer(rustle(sr, { seed: env.seed }));
  }

  let W = 2, H = 2, cell = 100, cols = 0, rows = 0, data = null, tex = null;
  let bubbles = [], remaining = 0, sheet = 0, sizeK = 1, tint = 0;
  let slide = 0, phase = 'play', phaseT = 0;
  let lastPick = -1;
  const pointers = new Map();
  let light = [0, 0], lastPlayed = -1;

  function build() {
    const base = Math.min(W, H) / (W < H ? 6.3 : 7.6);
    sizeK = sheet === 0 ? 1 : [1, 1, 1.5, 1, 2.6][Math.floor(r() * 5)];
    cell = Math.max(base, 54) * sizeK;
    cols = Math.ceil(W / cell) + 3; rows = Math.ceil(H / (cell * .8660254)) + 3;
    data = new Uint8Array(cols * rows * 4);
    bubbles = []; remaining = 0;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const seed = r();
      const b = { x, y, seed, press: 0, target: 0, popped: 0, burst: 0, hold: 0 };
      bubbles.push(b);
      // Only bubbles that are visible count towards finishing the sheet.
      const c = centre(x - 1, y - 1);
      b.visible = c[0] > -cell * .2 && c[0] < W + cell * .2 && c[1] > -cell * .2 && c[1] < H + cell * .2;
      if (b.visible) remaining++;
    }
    if (tex) gl.deleteTexture(tex);
    tex = kit.texture(cols, rows, 'rgba8', { filter: 'NEAREST', data });
    tint = sheet === 0 ? 0 : Math.floor(r() * 4);
    upload();
  }
  function centre(cx, cy) { const off = ((cy % 2) + 2) % 2 * .5; return [(cx + off) * cell, cy * .8660254 * cell]; }
  function upload() {
    for (let i = 0; i < bubbles.length; i++) {
      const b = bubbles[i], j = i * 4;
      data[j] = Math.min(255, b.press * 255); data[j + 1] = Math.min(255, b.popped * 255); data[j + 2] = b.seed * 255;
    }
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, cols, rows, gl.RGBA, gl.UNSIGNED_BYTE, data);
  }
  function pick(px, py) {
    const y0 = Math.round(py / (cell * .8660254));
    let best = -1, bd = 1e9;
    for (let k = -1; k <= 1; k++) {
      const yy = y0 + k, off = ((yy % 2) + 2) % 2 * .5, xx = Math.round(px / cell - off);
      const dx = px - (xx + off) * cell, dy = py - yy * .8660254 * cell, l = dx * dx + dy * dy;
      if (l < bd) { bd = l; best = (yy + 1) * cols + (xx + 1); }
    }
    if (Math.sqrt(bd) > cell * .47) return -1;
    return best >= 0 && best < bubbles.length ? best : -1;
  }
  function burst(b) {
    if (b.popped > 0 || b.burst) return;
    b.burst = 1; remaining -= b.visible ? 1 : 0;
    const list = pops && pops[sizeK];
    if (list) {
      let i = Math.floor(Math.random() * list.length);
      if (i === lastPlayed) i = (i + 1) % list.length;
      lastPlayed = i;
      const c = centre(b.x - 1, b.y - 1);
      bus.play(list[i], { gain: .78 + Math.random() * .22, rate: .93 + Math.random() * .14, pan: (c[0] / W - .5) * .7 });
    }
    env.buzz(sizeK > 2 ? 22 : 9);
    if (remaining <= 0 && phase === 'play') { phase = 'wait'; phaseT = 0; }
  }
  function touch(p) {
    if (phase !== 'play') return;
    const i = pick(p.x * W, p.y * H - slide * H); // slide is 0 during play
    if (i < 0) return;
    const b = bubbles[i];
    if (!b.popped && !b.burst) { b.target = 1; b.fast = p.fast; }
  }

  input.on({
    down(p) { p.fast = false; pointers.set(p.id, p); touch(p); light = [p.x * 2 - 1, p.y * 2 - 1]; },
    move(p) {
      light[0] += ((p.x * 2 - 1) - light[0]) * .12; light[1] += ((p.y * 2 - 1) - light[1]) * .12;
      if (!pointers.has(p.id)) return;
      const q = pointers.get(p.id);
      const dist = Math.hypot((p.x - q.x) * W, (p.y - q.y) * H), steps = Math.ceil(dist / (cell * .4));
      for (let s = 1; s <= steps; s++) touch({ x: q.x + (p.x - q.x) * s / steps, y: q.y + (p.y - q.y) * s / steps, fast: true });
      pointers.set(p.id, p);
    },
    up(p) {
      pointers.delete(p.id);
      // A let-go still finishes what was pressed, so nothing is left half done.
    },
  });

  build.done = false;
  const inst = {
    resize(w, h) { const changed = Math.abs(w / h - W / H) > .01 || !tex; cell *= w / W; W = w; H = h; if (changed) build(); },
    reset() { sheet++; phase = 'slide'; phaseT = 0; rust && bus.play(rust, { gain: .55 }); },
    attract(t) {
      const x = .5 + .42 * Math.sin(t * .9), y = .5 + .34 * Math.sin(t * 1.3 + 1);
      touch({ x, y, fast: true }); light[0] = x * 2 - 1; light[1] = y * 2 - 1;
      if (remaining < 25 && phase === 'play') { phase = 'wait'; phaseT = 0; }
    },
    frame(t, dt) {
      for (const b of bubbles) {
        if (b.target > 0 && !b.burst) {
          // Slow press builds tension; a swipe crushes quickly.
          b.press = Math.min(1, b.press + dt * (b.fast ? 26 : 10));
          if (b.press >= 1) burst(b);
        }
        if (b.burst && b.popped < 1) { b.popped = Math.min(1, b.popped + dt * 32); b.press = Math.max(0, b.press - dt * 7); }
        else if (b.popped >= 1 && b.press > 0) b.press = Math.max(0, b.press - dt * 7);
      }
      upload();
      phaseT += dt;
      if (phase === 'wait' && phaseT > .55) { phase = 'slide'; phaseT = 0; sheet++; rust && bus.play(rust, { gain: .55 }); }
      if (phase === 'slide') {
        const k = Math.min(1, phaseT / .6);
        slide = k * k * (3 - 2 * k) * 1.15;
        if (k >= 1) { build(); phase = 'in'; phaseT = 0; }
      }
      if (phase === 'in') {
        const k = Math.min(1, phaseT / .7), e = 1 - Math.pow(1 - k, 3);
        slide = -1.15 * (1 - e);
        if (k >= 1) { slide = 0; phase = 'play'; }
      }
      post.begin();
      kit.draw(prog, { state: tex, res: [W, H], grid: [cols, rows], cell, slide, tint, time: t, light });
      post.end({ exposure: 1.15, bloom: .055, dof: .75, dofW: .32, vig: .75 }, dt);
    },
    destroy() { bus && bus.destroy(); if (tex) gl.deleteTexture(tex); },
  };
  return inst;
}
