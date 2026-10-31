// No.03 Dry garden. A height field, a rake, three stones, and low evening sun.
import { sandGrains, brownLoop, ceramic } from '../core/synth.js';

const STONES = /* glsl */ `uniform vec3 stones[3];
vec2 warped(vec2 p,int i){ float r=stones[i].z,k=float(i)*3.7; return p-stones[i].xy+vec2(vnoise(p*7.+k)-.5,vnoise(p*7.+k+9.)-.5)*r*.9; }
float stoneH(vec2 p){ float m=0.; for(int i=0;i<3;i++){ float r=stones[i].z; vec2 d=warped(p,i); float t=1.-dot(d,d)/(r*r);
   if(t>0.) m=max(m,sqrt(t)*r*1.05*(.9+.2*fbm(p*11.+float(i)))); } return m; }
float stoneD(vec2 p){ float m=1e3; for(int i=0;i<3;i++) m=min(m,length(warped(p,i))-stones[i].z); return m; }`;

// Stones never change, so their height and distance are baked once.
const BAKE = /* glsl */ `in vec2 v; out vec4 o; uniform vec2 asp;
${STONES}
void main(){ vec2 p=(v-.5)*asp; o=vec4(stoneH(p),stoneD(p),0.,1.); }`;
// Classic composition: concentric rings hugging stones, straight lines elsewhere.
const INIT = /* glsl */ `in vec2 v; out vec4 o; uniform vec2 asp; uniform float groove,wipeX; uniform sampler2D h;
${STONES}
float pattern(vec2 p){
  float d=stoneD(p); float rings=cos(d/groove*PI*2.);
  float lines=cos(p.y/groove*PI*2.);
  return mix(rings,lines,smoothstep(groove*5.,groove*5.6,d));
}
void main(){ vec2 p=(v-.5)*asp; float n=fbm(p*40.)*.05; float k=smoothstep(wipeX,wipeX-.02,p.x); if(k<=0.){ o=texture(h,v); return; } o=vec4(mix(texture(h,v).r,pattern(p)*.5+n,k),0.,0.,1.); }`;

const STAMP = /* glsl */ `in vec2 v; out vec4 o; uniform sampler2D h; uniform vec2 asp,a,b,dir; uniform float width,tines,amp,flatten,mixK,seedS; uniform sampler2D st;
void main(){
  vec4 c=texture(h,v); vec2 p=(v-.5)*asp; vec2 n=vec2(-dir.y,dir.x);
  vec2 ab=b-a; float L2=dot(ab,ab); float u=L2>1e-9?clamp(dot(p-a,ab)/L2,0.,1.):0.;
  vec2 q=a+ab*u; float s=dot(p-q,n); float along=length(p-q-n*s);
  float side=abs(s)/width;
  if(side>1.4||along>width*.6){ o=c; return; }
  float sd=texture(st,v).g;
  float mask=smoothstep(1.,.93,side)*smoothstep(width*.42,width*.22,along);
  mask*=smoothstep(0.,.012,sd);
  // Each tine pushes grain aside into ridges; slight per-tine irregularity.
  float prof=cos(s/width*PI*tines);
  float irr=(vnoise(vec2(s/width*tines+seedS,dot(p,dir)*14.))-.5)*.22;
  float target_=flatten>.5?(vnoise(p*120.)-.5)*.02:(prof*.5+irr)*amp;
  float nh=mix(c.r,target_,mask*mixK);
  // Displaced sand piles up in soft berms beside the tool.
  float berm=exp(-pow((side-1.08)/.08,2.))*smoothstep(width*.5,width*.2,along)*smoothstep(0.,.02,sd);
  nh+=berm*.006*(flatten>.5?2.2:1.);
  o=vec4(nh,c.gba);
}`;

// Slumps anything steeper than the angle of repose. Keeps ridges soft but crisp.
const RELAX = /* glsl */ `in vec2 v; out vec4 o; uniform sampler2D h; uniform vec2 tx; uniform float k;
void main(){ float c=texture(h,v).r;
  float l=texture(h,v-vec2(tx.x,0.)).r,r=texture(h,v+vec2(tx.x,0.)).r,d=texture(h,v-vec2(0.,tx.y)).r,u=texture(h,v+vec2(0.,tx.y)).r;
  float limit=.18; float dd=0.;
  dd+=clamp(l-c-limit,0.,1.)-clamp(c-l-limit,0.,1.); dd+=clamp(r-c-limit,0.,1.)-clamp(c-r-limit,0.,1.);
  dd+=clamp(d-c-limit,0.,1.)-clamp(c-d-limit,0.,1.); dd+=clamp(u-c-limit,0.,1.)-clamp(c-u-limit,0.,1.);
  o=vec4(c+dd*k,0.,0.,1.); }`;

const SHADE = /* glsl */ `in vec2 v; out vec4 o; uniform sampler2D h; uniform vec2 asp,tx,res,sun; uniform float gain,wipe; uniform sampler2D st;
float sandH(vec2 uv){ return texture(h,uv).r*.0062; }
float stoneAt(vec2 q,vec2 a){ return texture(st,q/a+.5).r; }
void main(){
  vec2 p=(v-.5)*asp; vec2 e=tx*1.1;
  float h0=sandH(v),hx=sandH(v+vec2(e.x,0.))-sandH(v-vec2(e.x,0.)),hy=sandH(v+vec2(0.,e.y))-sandH(v-vec2(0.,e.y));
  vec2 wE=e*asp*2.; vec2 g=vec2(hx,hy)/wE;
  vec2 baked=texture(st,v).rg; float sH=baked.r,sD=baked.g;
  // Macro grain: fixed to the world, not to the pixel grid of the simulation.
  float gs=res.y/1.1; vec2 gc=p*gs; vec2 gi=floor(gc);
  vec2 rnd=hash2(gi); vec2 mg=(rnd-.5)*.34;
  float big=vnoise(p*360.)-.5; vec2 gb=vec2(big,vnoise(p*360.+9.)-.5)*.18;
  vec3 N=normalize(vec3(-g*(1.35)+mg+gb,1.));
  // Low evening sun rakes across the ridges.
  vec3 L=normalize(vec3(sun.x,sun.y,.5));
  float ndl=max(dot(N,L),0.);
  // Self-shadow by marching the height field toward the sun.
  float sh=1.; vec2 stepP=L.xy*.0028; float z=h0+sH+.0003;
  for(int i=1;i<=10;i++){ vec2 q=p+stepP*float(i)*(1.+float(i)*.12); vec2 uv=q/asp+.5; float hh=sandH(uv)+stoneAt(q,asp);
    float rayz=z+L.z/length(L.xy)*length(stepP)*float(i)*(1.+float(i)*.12); sh=min(sh,1.-smoothstep(0.,.0034,hh-rayz)); }
  sh=mix(.46,1.,sh);
  // Valley occlusion from a wide height comparison.
  float ao=0.; for(int i=0;i<4;i++){ float a=float(i)*1.57; ao+=sandH(v+vec2(cos(a),sin(a))*tx*5.); }
  ao=clamp(1.-(ao*.25-h0)*190.,.55,1.25);
  vec3 alb=mix(vec3(.60,.53,.43),vec3(.76,.70,.60),rnd.x*.55+vnoise(p*6.)*.45);
  alb*=mix(.82,1.08,hash(gi+3.));
  alb*=1.-.18*smoothstep(.75,.95,hash(gi+7.));
  vec3 sunC=vec3(1.5,1.06,.68)*gain, sky=vec3(.3,.27,.25);
  vec3 col=alb*(sunC*ndl*sh*1.45+sky*(.45+.55*N.z)*ao);
  // Mineral sparkle: only grains aligned to the half-vector flash.
  vec3 H=normalize(L+vec3(0.,0.,1.)); vec3 Ng=normalize(vec3(mg*2.2+(hash2(gi+11.)-.5)*.9,1.));
  float sp=pow(max(dot(Ng,H),0.),260.)*sh*step(.6,hash(gi+21.));
  col+=vec3(1.,.9,.72)*sp*2.8;
  // Contact shadow around each stone.
  col*=mix(.42,1.,smoothstep(0.,.038,sD+(dot(p,L.xy)*0.)));
  // Stone: dark basalt with a thin specular sheen.
  if(sH>0.){
    float e2=.006;
    float sx=stoneAt(p+vec2(e2,0.),asp)-stoneAt(p-vec2(e2,0.),asp),sy=stoneAt(p+vec2(0.,e2),asp)-stoneAt(p-vec2(0.,e2),asp);
    vec3 Ns=normalize(vec3(-sx/(2.*e2),-sy/(2.*e2),1.));
    float nn=fbm(p*38.); vec3 ns2=normalize(Ns+vec3(fbm(p*90.)-.5,fbm(p*90.+5.)-.5,0.)*.5);
    vec3 a2=mix(vec3(.028,.027,.027),vec3(.13,.125,.115),nn);
    a2=mix(a2,vec3(.13,.17,.09),smoothstep(.56,.72,fbm(p*11.+3.))*smoothstep(.2,.9,Ns.z)*.65);
    float d2=max(dot(ns2,L),0.);
    vec3 cs=a2*(sunC*d2*1.8+sky*.8);
    vec3 Hs=normalize(L+vec3(0.,0.,1.));
    cs+=vec3(1.,.86,.65)*pow(max(dot(ns2,Hs),0.),36.)*.28*gain;
    col=mix(col,cs,smoothstep(0.,.0015,sH));
  }
  o=vec4(col,1.);
}`;

export function create(env) {
  const { kit, gl, post, input, ui, audio, quality } = env;
  const pInit = kit.program(INIT), pStamp = kit.program(STAMP), pRelax = kit.program(RELAX), pShade = kit.program(SHADE), pBake = kit.program(BAKE);
  const bus = audio && audio.bus({ gain: 1, send: .12 });
  let grains, grains2, body, wind, thunk;
  if (bus) {
    const sr = bus.sr;
    grains = bus.loop(bus.buffer(sandGrains(sr, 11)), { gain: 0, hp: 1800, lp: 12000, send: .08 });
    grains2 = bus.loop(bus.buffer(sandGrains(sr, 23, 4, 900)), { gain: 0, hp: 500, lp: 5000, rate: .62, send: .1 });
    body = bus.loop(bus.buffer(brownLoop(sr, 5)), { gain: 0, hp: 90, lp: 900, send: .05 });
    wind = bus.loop(bus.buffer(brownLoop(sr, 8, 7, .995)), { gain: .035, hp: 60, lp: 480, send: .3 });
    thunk = bus.buffer(ceramic(sr, 120, { hard: .1, dur: .18, ring: .1, seed: 3 }));
  }
  const TOOLS = { rake: { width: .068, tines: 5, amp: 1, flatten: 0 }, finger: { width: .017, tines: 1, amp: 1.25, flatten: 0 }, board: { width: .13, tines: 1, amp: 0, flatten: 1 } };
  let tool = TOOLS.rake;
  ui.tools([{ id: 'rake', label: '갈퀴' }, { id: 'finger', label: '손가락' }, { id: 'board', label: '고름판' }], id => { tool = TOOLS[id]; });

  let W = 2, H = 2, sim = null, stoneTex = null, asp = [1, 1], stones = new Float32Array(9);
  let dirty = 0, wipe = -1;
  const pts = new Map();
  let speed = 0, sndSpeed = 0, sun = [-.78, .62], acc = 0;

  function pickStones() {
    // Asymmetric triad: rule-of-thirds, sizes in ratio.
    const a = asp[0], b = asp[1], land = a > b;
    const seed = env.seed;
    const j = i => (Math.sin(seed * .001 + i * 12.9) * 43758.5453) % 1;
    const base = land ? [[-.2 * a, .08 * b, .082], [-.11 * a, -.03 * b, .046], [.27 * a, -.14 * b, .06]]
      : [[-.14 * a, .2 * b, .088], [.03 * a, .13 * b, .05], [.16 * a, -.22 * b, .065]];
    base.forEach((s, i) => { stones[i * 3] = s[0] + j(i) * .015; stones[i * 3 + 1] = s[1] + j(i + 5) * .015; stones[i * 3 + 2] = s[2]; });
  }
  function init() {
    kit.draw(pInit, { asp, stones, groove: .0272, wipeX: 99, h: sim.read }, sim.write); sim.swap();
    dirty = 0;
  }
  function stamp(ax, ay, bx, by, t) {
    const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1;
    kit.draw(pStamp, { h: sim.read, asp, a: [ax, ay], b: [bx, by], dir: [dx / l, dy / l], width: t.width, tines: t.tines, amp: t.amp, flatten: t.flatten, mixK: .78, seedS: 0, st: stoneTex }, sim.write);
    sim.swap(); dirty = 40;
  }
  const local = p => [(p.x - .5) * asp[0], (p.y - .5) * asp[1]];

  input.on({
    down(p) { const l = local(p); pts.set(p.id, { x: l[0], y: l[1], sx: l[0], sy: l[1], lastx: l[0], lasty: l[1], speed: 0 }); if (bus) bus.play(thunk, { gain: tool.flatten ? .3 : .16 }); },
    move(p) {
      if (!pts.has(p.id)) return;
      const q = pts.get(p.id), l = local(p);
      q.x = l[0]; q.y = l[1];
    },
    up(p) { pts.delete(p.id); },
  });

  function strokes(dt) {
    let total = 0;
    for (const q of pts.values()) {
      // A rake has mass: it trails the hand by a spring.
      const k = 1 - Math.exp(-dt * 24);
      const nx = q.sx + (q.x - q.sx) * k, ny = q.sy + (q.y - q.sy) * k;
      const dist = Math.hypot(nx - q.sx, ny - q.sy);
      if (dist > 1e-5) {
        const steps = Math.min(6, Math.max(1, Math.ceil(dist / (tool.width * .45))));
        let ax = q.sx, ay = q.sy;
        const dirx = (nx - q.sx) / dist, diry = (ny - q.sy) / dist;
        for (let i = 1; i <= steps; i++) { const bx = q.sx + (nx - q.sx) * i / steps, by = q.sy + (ny - q.sy) * i / steps; stamp(ax, ay, bx, by, tool); ax = bx; ay = by; }
        q.sx = nx; q.sy = ny;
        total += dist / Math.max(dt, .001);
      }
    }
    return total;
  }
  function audioFrom(v, dt) {
    if (!bus) return;
    const widthK = tool.flatten ? 1.25 : tool === TOOLS.finger ? .55 : 1;
    const e = Math.min(1, v / 1.25);
    sndSpeed += (e - sndSpeed) * Math.min(1, dt * (e > sndSpeed ? 40 : 14));
    const s = Math.sqrt(sndSpeed), m = widthK;
    grains.set({ gain: .5 * s * m, hp: 1300 + 2200 * sndSpeed, lp: 6500 + 6000 * sndSpeed }, .018);
    grains2.set({ gain: .26 * s * m, lp: 2500 + 3500 * sndSpeed, rate: .55 + sndSpeed * .3 }, .018);
    body.set({ gain: .34 * s * m, lp: 320 + 900 * sndSpeed }, .02);
  }

  return {
    resize(w, h) {
      W = w; H = h;
      const na = w > h ? [w / h, 1] : [1, h / w];
      const m = quality === 'low' ? 720 : 1200;
      const sw = w >= h ? m : Math.round(m * w / h), sh = w >= h ? Math.round(m * h / w) : m;
      if (!sim || Math.abs(na[0] / na[1] - asp[0] / asp[1]) > .02) {
        asp = na;
        sim = kit.double(sw, sh, 'r16f');
        stoneTex = kit.fbo(sw, sh, 'rg16f');
        pickStones();
        kit.draw(pBake, { asp, stones }, stoneTex);
        init();
      }
    },
    reset() { wipe = 0; if (bus) { grains.set({ gain: .5, lp: 9000 }, .12); body.set({ gain: .5, lp: 900 }, .12); } },
    attract(t, dt) {
      const id = 999, x = .5 + .36 * Math.sin(t * .62), y = .5 + .28 * Math.sin(t * .41 + .7);
      if (!pts.has(id)) input.emit('down', { id, x, y });
      input.emit('move', { id, x, y, pressed: true });
    },
    frame(t, dt) {
      const v = strokes(dt);
      audioFrom(v, dt);
      // Wipe sweep: a long board crosses the garden and leaves fresh parallel lines.
      if (wipe >= 0) {
        wipe += dt / 1.15;
        const e = Math.min(1.05, wipe), x0 = (e - .5) * asp[0] * 1.2;
        kit.draw(pInit, { asp, stones, groove: .0272, wipeX: x0, h: sim.read }, sim.write); sim.swap();
        if (e >= 1.05) { wipe = -1; if (bus) { grains.set({ gain: 0 }, .1); body.set({ gain: 0 }, .1); } }
      }
      if (dirty > 0) {
        dirty--;
        kit.draw(pRelax, { h: sim.read, tx: [1 / sim.w, 1 / sim.h], k: .22 }, sim.write); sim.swap();
      }
      post.begin();
      sun[0] = -.78 + Math.sin(t * .025) * .05; sun[1] = .62 + Math.cos(t * .021) * .04;
      kit.draw(pShade, { h: sim.read, asp, tx: [1 / sim.w, 1 / sim.h], res: [W, H], sun, gain: 1, st: stoneTex, wipe });
      post.end({ exposure: 1, bloom: .035, dof: .8, dofW: .3, vig: .85, grain: .014 }, dt);
    },
    destroy() { bus && bus.destroy(); },
  };
}
