// Paint roller over masking tape. Cover the wall, then the tape comes off and the crisp lines appear.
import { tackLoop, brownLoop, gloop, tapeRip, gleam } from '../core/synth.js';
import { SWEPT, Coverage } from '../core/cover.js';

// rgb = wall colour, a = wet film thickness (with raised ridges at the roller's ends).
const ROLL = /* glsl */ `in vec2 v; out vec4 o; uniform sampler2D h; uniform vec2 asp,c,dir,c0,dir0; uniform float W,load; uniform vec3 paint;
${SWEPT}void main(){ vec2 p=(v-.5)*asp; vec4 cur=texture(h,v);
  if(!swept(p,c0,vec2(-dir0.y,dir0.x),c,vec2(-dir.y,dir.x),W)){ o=cur; return; }
  float s=abs(dot(p-c,vec2(-dir.y,dir.x)))/W;
  // A full roller lays a solid film; a tired one skips over the wall's pits and leaves dry-brush.
  float pits=fbm(p*vec2(60.,60.))*.62+fbm(p*190.)*.38; float d=load*2.2-pits-.18;
  float cov=smoothstep(.0,.14,d);
  vec3 col=mix(cur.rgb,paint,cov);
  float ridge=smoothstep(.93,.985,s)*load*.9;
  o=vec4(col,max(cur.a*(1.-cov*.7),cov*(.55+.45*load)+ridge)); }`;
const DRY = /* glsl */ `in vec2 v; out vec4 o; uniform sampler2D h; uniform float k; void main(){ vec4 c=texture(h,v); c.a*=k; o=c; }`;
const COPY = /* glsl */ `in vec2 v; out vec4 o; uniform sampler2D h; void main(){ o=texture(h,v); }`;
const TAPE = /* glsl */ `// x = inside the tape, y = position along the pull 0..1 per strip.
vec2 tape(vec2 p,float mode,float w){
  if(mode<.5){ float q=(p.x+p.y)*.7071; float g=mod(q+.11,.22)-.11; float id=floor((q+.11)/.22); return vec2(smoothstep(w+.0012,w-.0012,abs(g)),fract(((p.y-p.x)*.7071+1.4)*.34+hash(vec2(id))*.1)); }
  if(mode<1.5){ float x=abs(mod(p.x+.14,.28)-.14); float q=p.y+x*1.05; float g=mod(q+.12,.24)-.12; return vec2(smoothstep(w+.0012,w-.0012,abs(g)*.69),p.x*.32+.5); }
  if(mode<2.5){ vec2 q=vec2(p.x+p.y,p.x-p.y)*.7071; vec2 g=mod(q+.15,.3)-.15; float a=smoothstep(w+.0012,w-.0012,abs(g.x)),b=smoothstep(w+.0012,w-.0012,abs(g.y)); return vec2(max(a,b),p.y*.4+.5); }
  float r=length(p+vec2(.12,.08)); float g=mod(r+.11,.22)-.11; return vec2(smoothstep(w+.0012,w-.0012,abs(g)),atan(p.y+.08,p.x+.12)/6.2832+.5); }
`;
const BAKE = /* glsl */ `in vec2 v; out vec4 o; uniform sampler2D h,prev; uniform vec2 asp; uniform float mode; ${TAPE}
void main(){ vec2 p=(v-.5)*asp; vec4 c=texture(h,v); o=mix(c,vec4(texture(prev,v).rgb,.0),tape(p,mode,.021).x); }`;
const SHADE = /* glsl */ `in vec2 v; out vec4 o; uniform sampler2D h,prev; uniform vec2 asp,tx,bc,bd; uniform float mode,lay,peel,bw,show,spin,gleamD; uniform vec3 paint; ${TAPE}
float film(vec2 uv){ return texture(h,uv).a; }
void main(){
  vec2 p=(v-.5)*asp; vec4 c=texture(h,v); vec3 alb=c.rgb;
  // Roller nap leaves an orange peel in wet paint; it flattens as the film dries.
  float peelN=fbm(p*170.)-.5; vec2 e=tx*1.4;
  vec2 g=vec2(film(v+vec2(e.x,0.))-film(v-vec2(e.x,0.)),film(v+vec2(0.,e.y))-film(v-vec2(0.,e.y)))*.55;
  vec2 ng=vec2(fbm((p+vec2(.003,0.))*170.)-.5-peelN,fbm((p+vec2(0.,.003))*170.)-.5-peelN)*1.2*min(c.a,1.)+vec2(vnoise(p*60.),vnoise(p*60.+9.))*.02-.01;
  vec3 N=normalize(vec3(-g-ng,1.)); vec3 L=normalize(vec3(-.42,.6,.68));
  vec3 Rf=reflect(vec3(0.,0.,-1.),N); vec3 Ry=normalize(vec3(Rf.x+p.x*.4,Rf.z,-Rf.y-p.y*.4));
  float wet=min(c.a*1.1,1.);
  vec3 wall=alb*alb*(.3+.92*max(dot(N,L),0.))+studio(Ry)*(.015+.075*wet);
  // Tape, with the pull running along it.
  vec2 tp=tape(p,mode,.021); float laid=step(tp.y,lay); float t=tp.x*laid*(1.-step(tp.y,peel));
  if(tp.x>0.&&laid>0.){
    float pd=tp.y-peel;
    vec3 under=texture(prev,v).rgb; under=under*under*(.3+.92*max(dot(normalize(vec3(-ng*.2,1.)),L),0.));
    float painted=clamp(length(c.rgb-texture(prev,v).rgb)*5.,0.,1.);
    vec3 crepe=mix(vec3(.72,.62,.4),vec3(.84,.74,.5),vnoise(p*vec2(180.,40.)));
    crepe=mix(crepe,c.rgb,painted);
    vec3 tp3=crepe*crepe*(.34+.9*max(dot(N,L),0.))+studio(Ry)*.02*painted;
    vec3 base=mix(wall,under,tp.x);
    wall=mix(base,tp3,t);
    // Lifted lip at the pull line.
    if(peel>0.&&abs(pd)<.008) wall=mix(wall,vec3(.95,.9,.72),tp.x*smoothstep(.008,.0,abs(pd)));
  }
  wall+=alb*vec3(1.,.96,.88)*exp(-pow((p.x*.8+p.y-gleamD)*7.,2.))*.5;
  vec3 col=wall;
  if(show>0.){ vec2 n=vec2(-bd.y,bd.x); vec2 r=p-bc; float s=dot(r,n),f=dot(r,bd); float inS=smoothstep(bw+.003,bw,abs(s));
    col*=1.-.42*show*smoothstep(bw+.06,bw,abs(s))*smoothstep(.11,.03,abs(f+.012));
    float rad=.044; float body=inS*smoothstep(rad,rad-.003,abs(f));
    if(body>0.){ float z=sqrt(max(0.,1.-f*f/(rad*rad))); vec3 Nc=normalize(vec3(bd*f/rad,z));
      float nap=fbm(vec2(s*220.,f*60.+spin*1.2)); vec3 cc=paint*paint*(.3+1.05*max(dot(Nc,L),0.))*(.62+.76*nap);
      cc+=vec3(1.)*pow(max(dot(Nc,normalize(L+vec3(0.,0.,1.))),0.),30.)*.12;
      col=mix(col,cc,body*show); }
    float cap=smoothstep(.016,.012,abs(abs(s)-bw-.006))*smoothstep(rad*.6,rad*.45,abs(f));
    col=mix(col,vec3(.18,.18,.2),cap*show);
    float arm=smoothstep(.012,.009,abs(s))*step(f,-rad)*smoothstep(-.26,-.22,f);
    col=mix(col,vec3(.05,.05,.06)+.1*max(dot(normalize(vec3(n*s/.012,1.)),L),0.),arm*show); }
  o=vec4(col,1.);
}`;

const COATS = [[.11, .35, .42], [.88, .42, .18], [.94, .86, .68], [.2, .22, .46], [.76, .2, .28], [.32, .5, .34], [.95, .68, .2]];

export function create(env) {
  const { kit, post, input, audio, seed, quality } = env;
  const pR = kit.program(ROLL), pD = kit.program(DRY), pC = kit.program(COPY), pB = kit.program(BAKE), pS = kit.program(SHADE);
  const bus = audio && audio.bus({ gain: 1, send: .15 });
  let tack, body, snd = {};
  if (bus) {
    const sr = bus.sr;
    tack = bus.loop(bus.buffer(tackLoop(sr, 9)), { gain: 0, hp: 500, lp: 7000, send: .1 });
    body = bus.loop(bus.buffer(brownLoop(sr, 21, 6, .97)), { gain: 0, hp: 90, lp: 900, send: .06 });
    snd.load = [0, 1].map(i => bus.buffer(gloop(sr, 70 + i, { base: 170 + i * 30, count: 3, span: .22 })));
    snd.rip = bus.buffer(tapeRip(sr, 11)); snd.gleam = bus.buffer(gleam(sr, seed & 1023));
  }
  let W = 2, H = 2, asp = [1, 1], sim = null, prev = null, cover = null;
  let b = { x: 0, y: 0, tx: 0, ty: 0, dx: 0, dy: 1, on: false, id: null };
  let load = 1, coat = (seed >>> 0) % COATS.length, mode = (seed >>> 3) % 4, paint = COATS[coat], lay = 0, peel = 0, phase = 'lay', phaseT = 0, spin = 0, speedS = 0, gleamD = 9;
  const bw = () => Math.min(asp[0], asp[1]) * .17;
  const local = p => [(p.x - .5) * asp[0], (p.y - .5) * asp[1]];
  function fresh() { kit.draw(pC, { h: sim.read }, prev); cover.clear(); phase = 'lay'; lay = 0; peel = 0; phaseT = 0; }
  function nextCoat() { coat = (coat + 1) % COATS.length; paint = COATS[coat]; mode = (mode + 1) % 4; load = 1; fresh(); }
  input.on({
    down(p) { if (phase !== 'paint' && phase !== 'lay') return; const l = local(p); b.id = p.id; b.on = true; b.x = b.tx = l[0]; b.y = b.ty = l[1]; b.fresh = true; load = 1; if (bus) bus.play(snd.load[Math.floor(Math.random() * 2)], { gain: .5 }); },
    move(p) { if (b.id === p.id) { const l = local(p); b.tx = l[0]; b.ty = l[1]; } },
    up(p) { if (b.id === p.id) { b.id = null; b.on = false; } },
  });
  function roll(dt) {
    if (!b.on) { speedS *= Math.exp(-dt * 16); return; }
    const dx = b.tx - b.x, dy = b.ty - b.y, d = Math.hypot(dx, dy), mv = d * (1 - Math.exp(-dt * 24));
    if (b.fresh) { if (d < .012) return; b.dx = dx / d; b.dy = dy / d; b.fresh = false; }
    if (d < 1e-4) { speedS *= Math.exp(-dt * 16); return; }
    const reach = Math.min(mv, .1), steps = Math.max(1, Math.ceil(reach / .012)), ds = reach / steps, tt = 1 - Math.exp(-dt * 9 / steps), W_ = bw();
    for (let i = 0; i < steps; i++) {
      const c0 = [b.x, b.y], dir0 = [b.dx, b.dy];
      b.dx += (dx / d - b.dx) * tt; b.dy += (dy / d - b.dy) * tt;
      const l = Math.hypot(b.dx, b.dy) || 1; b.dx /= l; b.dy /= l;
      b.x += dx / d * ds; b.y += dy / d * ds;
      kit.draw(pR, { h: sim.read, asp, c: [b.x, b.y], dir: [b.dx, b.dy], c0, dir0, W: W_, load, paint }, sim.write); sim.swap();
      if (load > .22) cover.mark(c0[0], c0[1], b.x, b.y, W_ * .94);
    }
    load = Math.max(.06, load - reach * .2); spin += reach * 26;
    speedS += (Math.min(1, reach / Math.max(dt, .001) / 1.4) - speedS) * Math.min(1, dt * 28);
  }
  return {
    resize(w, h) {
      W = w; H = h; const na = w > h ? [w / h, 1] : [1, h / w];
      if (!sim || Math.abs(na[0] / na[1] - asp[0] / asp[1]) > .02) {
        asp = na; const m = quality === 'low' ? 760 : 1200, sw = w >= h ? m : Math.round(m * w / h), sh = w >= h ? Math.round(m * h / w) : m;
        sim = kit.double(sw, sh, 'rgba16f'); prev = kit.fbo(sw, sh, 'rgba16f'); cover = new Coverage(asp);
        const g = kit.gl; g.bindFramebuffer(g.FRAMEBUFFER, sim.read.fb); g.clearColor(.56, .55, .53, 0); g.clear(g.COLOR_BUFFER_BIT);
        g.bindFramebuffer(g.FRAMEBUFFER, sim.write.fb); g.clear(g.COLOR_BUFFER_BIT); g.clearColor(0, 0, 0, 0);
        fresh();
      }
    },
    reset() { b.on = false; b.id = null; nextCoat(); },
    attract(t) {
      if (phase !== 'paint' && phase !== 'lay') return;
      const id = 6, x = .5 + .44 * Math.sin(t * .8), y = .5 + .42 * Math.sin(t * .23 + 1);
      if (b.id !== id) input.emit('down', { id, x, y });
      input.emit('move', { id, x, y, pressed: true });
    },
    frame(t, dt) {
      phaseT += dt;
      if (phase === 'lay') { lay = Math.min(1.01, lay + dt * 2.2); if (lay > 1) phase = 'paint'; }
      if (phase === 'paint' || phase === 'lay') roll(dt);
      else speedS *= Math.exp(-dt * 16);
      kit.draw(pD, { h: sim.read, k: Math.exp(-dt * .09) }, sim.write); sim.swap();
      if (phase === 'paint' && cover.fraction > .96) {
        // Coat finished: the roller lifts away and the tape comes off.
        // A last even pass closes the thin margins the roller never quite reached.
        kit.draw(pR, { h: sim.read, asp, c: [0, asp[1]], dir: [0, 1], c0: [0, -asp[1]], dir0: [0, 1], W: 9, load: 1, paint }, sim.write); sim.swap();
        phase = 'peel'; phaseT = 0; b.on = false; b.id = null; gleamD = 9;
        snd.rip && bus.play(snd.rip, { gain: .75 }); env.buzz(20);
      }
      if (phase === 'peel') {
        peel = Math.min(1.01, phaseT / 1.05);
        if (peel > 1) {
          kit.draw(pB, { h: sim.read, prev, asp, mode }, sim.write); sim.swap();
          phase = 'hold'; phaseT = 0; gleamD = -asp[0] * .8 - asp[1]; lay = 0; peel = 0;
          snd.gleam && bus.play(snd.gleam, { gain: .45, send: .5 }); env.buzz(25);
        }
      }
      if (phase === 'hold') { gleamD += dt * 2.6; if (phaseT > 2.4) nextCoat(); }
      if (bus) {
        const s = Math.sqrt(speedS), wet = .3 + load * .7;
        tack.set({ gain: .55 * s * wet, rate: .75 + speedS * .55, lp: 3000 + 4800 * speedS * wet }, .02);
        body.set({ gain: .42 * s * wet, lp: 300 + 600 * speedS }, .03);
      }
      post.begin();
      kit.draw(pS, { h: sim.read, prev, asp, tx: [1 / sim.w, 1 / sim.h], bc: [b.x, b.y], bd: [b.dx, b.dy], bw: bw(), show: b.on ? 1 : 0, spin, mode, lay, peel, paint, gleamD });
      post.end({ exposure: 1, bloom: .05, vig: .55, grain: .012 }, dt);
    },
    destroy() { bus && bus.destroy(); },
  };
}
