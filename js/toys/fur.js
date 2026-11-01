// Clipper through deep fur. Each pass leaves a clean lane, and the lanes catch the light like a mown lawn.
import { clipperLoop, sandGrains, gleam, rustle, rng } from '../core/synth.js';
import { SWEPT, Coverage } from '../core/cover.js';

// r = fur length, gb = lie direction, a = regrowth delay noise.
const GROW = /* glsl */ `in vec2 v; out vec4 o; uniform sampler2D h; uniform vec2 asp; uniform float seed,grow;
void main(){ vec2 p=(v-.5)*asp; vec4 c=texture(h,v); float a=fbm(p*1.4+seed)*6.28; vec2 d=vec2(cos(a),sin(a)-.8); d/=max(length(d),.01);
  float l=.72+.32*fbm(p*5.+seed*2.); float g=smoothstep(0.,.25,grow-fbm(p*3.+seed*3.)*1.1);
  o=vec4(mix(c.r,l*smoothstep(0.,1.,grow),g),mix(c.gb,d,g),1.); }`;
const CUT = /* glsl */ `in vec2 v; out vec4 o; uniform sampler2D h; uniform vec2 asp,c,dir,c0,dir0; uniform float W;
${SWEPT}void main(){ vec2 p=(v-.5)*asp; vec4 cur=texture(h,v); vec2 n=vec2(-dir.y,dir.x); vec2 rel=p-c;
  if(swept(p,c0,vec2(-dir0.y,dir0.x),c,n,W)){ o=vec4(min(cur.r,.075),dir,1.); return; }
  // Long fur is shouldered aside at the edges and ahead of the head.
  float s=dot(rel,n),f=dot(rel,dir); float near=smoothstep(.1,.0,abs(abs(s)-W))*smoothstep(.14,-.05,abs(f));
  if(cur.r>.2&&near>0.){ vec2 out_=normalize(n*sign(s)+dir*.8); cur.gb=normalize(mix(cur.gb,out_,near*.5)); }
  o=cur; }`;
const SHADE = /* glsl */ `in vec2 v; out vec4 o; uniform sampler2D h; uniform vec2 asp,tx,res,bc,bd; uniform vec3 tip,root,skin; uniform float bw,show,sweep,buzz; uniform int shells;
void main(){
  vec2 p=(v-.5)*asp; const float GS=235.; const float BEND=.055;
  vec3 L=normalize(vec3(-.45,.62,.65)); vec3 V=vec3(0.,0.,1.);
  vec4 c0=texture(h,v); vec2 fl0=c0.gb;
  // Lanes: stubble shows which way the head travelled, as on a mown lawn.
  float lane=.74+.5*dot(fl0,normalize(vec2(-.55,.84)));
  float st=hash(floor(p*GS*1.1));
  vec3 col=mix(skin*skin,skin*skin*.62+root*.3,st)*(.34+.7*lane*lane);
  bool hit=false;
  // Bare lanes have nothing to march through, unless long fur leans in from next door.
  float reach=max(c0.r,texture(h,(p-fl0*BEND)/asp+.5).r);
  for(int i=0;i<shells&&!hit;i++){
    float t=1.-(float(i)+.5)/float(shells); if(t>reach*1.05) continue;
    // Strands lean, so each shell looks up the length and lie at its own root position.
    vec2 rp=p-fl0*t*BEND; vec4 st2=texture(h,rp/asp+.5); float len=st2.r; if(t>=len*1.02) continue;
    vec2 g=rp*GS; vec2 id=floor(g); vec2 f=fract(g)-.5+(hash2(id)-.5)*.72;
    float rnd=hash(id+7.); float top=len*(.56+.5*rnd); if(t>=top) continue;
    float rad=.64*(1.-pow(t/top,1.6))+.02;
    if(length(f)<rad){ hit=true;
      vec2 fl=st2.gb; vec3 T=normalize(vec3(fl,.8));
      float ao=pow(t/max(len,.05),.8); vec3 base=mix(root,tip,clamp(ao*(.72+.5*rnd),0.,1.));
      vec3 H_=normalize(L+V); float dTL=dot(T,L),dTH=dot(T,H_);
      float diff=sqrt(max(1.-dTL*dTL,0.)); float spec=pow(max(1.-dTH*dTH,0.),70.);
      col=base*base*(.1+1.05*diff*(.3+.7*ao))+vec3(1.,.95,.88)*spec*.2*ao;
      col*=.82+.3*hash(id+3.); } }
  col+=tip*.42*exp(-pow((p.x*.8+p.y-sweep)*7.,2.));
  if(show>0.){ vec2 n=vec2(-bd.y,bd.x); vec2 r=p-bc; float s=dot(r,n),f=dot(r,bd); float inS=smoothstep(bw+.004,bw,abs(s));
    col*=1.-.5*show*smoothstep(bw+.05,bw,abs(s))*smoothstep(.12,.0,abs(f+.05));
    // Comb teeth at the front, chrome block behind, black body running back to the hand.
    float teeth=inS*step(.004,f+.0)*step(f,.018)*step(.3,fract(s*130.+buzz*.0));
    vec3 Nb=normalize(vec3(bd*(f+.03)/.05,.8)); vec3 Ry=vec3(Nb.x,Nb.z,-Nb.y); vec3 metal=vec3(.72,.73,.76)*(.14+.5*max(dot(Nb,L),0.))+studio(reflect(vec3(0.,-1.,0.),Ry))*.35;
    col=mix(col,metal*1.2,teeth*show);
    float head=inS*smoothstep(.0,-.002,f-.005)*smoothstep(-.058,-.055,f); col=mix(col,metal,head*show);
    float hs=bw*.74; float bodyM=smoothstep(hs+.004,hs,abs(s))*step(f,-.055)*smoothstep(-.34,-.31,f);
    if(bodyM>0.){ vec3 Nh=normalize(vec3(n*s/hs*.9,.7)); float sh=max(dot(Nh,L),0.); vec3 pl=vec3(.024,.024,.027)*(.2+1.2*sh)+vec3(1.)*pow(max(dot(Nh,normalize(L+V)),0.),40.)*.09; col=mix(col,pl,bodyM*show); } }
  o=vec4(col,1.);
}`;
const TUFT_V = `#version 300 es
in vec4 inst; uniform vec2 asp; uniform float size; out vec2 q; out float al;
void main(){ vec2 c=vec2(gl_VertexID&1,(gl_VertexID>>1)&1)*2.-1.; q=c; al=inst.w; float ca=cos(inst.z),sa=sin(inst.z);
  vec2 l=vec2(c.x*size,c.y*size*.13); gl_Position=vec4((inst.xy+vec2(l.x*ca-l.y*sa,l.x*sa+l.y*ca))/(asp*.5),0.,1.); }`;
const TUFT_F = /* glsl */ `in vec2 q; in float al; out vec4 o; uniform vec3 tip;
void main(){ float bow=q.y-.5*(q.x*q.x-.4); float w=(1.-abs(q.x))*.42+.04; float a=smoothstep(w,w*.5,abs(bow))*smoothstep(1.,.8,abs(q.x))*al; o=vec4(tip*tip*.75*a,a); }`;

const COATS = [
  { tip: [.86, .64, .36], root: [.3, .18, .09], skin: [.56, .44, .32] },
  { tip: [.8, .8, .82], root: [.2, .21, .25], skin: [.5, .5, .54] },
  { tip: [.2, .56, .6], root: [.04, .13, .2], skin: [.42, .58, .56] },
  { tip: [.96, .58, .66], root: [.42, .12, .25], skin: [.72, .44, .48] },
];

export function create(env) {
  const { kit, gl, post, input, audio, seed, quality } = env;
  const pG = kit.program(GROW), pC = kit.program(CUT), pS = kit.program(SHADE), pT = kit.program(TUFT_F, TUFT_V);
  const bus = audio && audio.bus({ gain: 1, send: .08 });
  let motor, crunch, snd = {};
  if (bus) {
    const sr = bus.sr;
    motor = bus.loop(bus.buffer(clipperLoop(sr)), { gain: 0, hp: 90, lp: 3200, send: .06 });
    crunch = bus.loop(bus.buffer(sandGrains(sr, 71, 4, 2800)), { gain: 0, hp: 1400, lp: 8500, rate: .85, send: .05 });
    snd.gleam = bus.buffer(gleam(sr, seed & 1023)); snd.grow = bus.buffer(rustle(sr, { dur: 1.4, density: 1400, seed: 21 }));
  }
  const r = rng(seed);
  const MAXT = 420, tD = new Float32Array(MAXT * 4), tuft = [];
  const vao = gl.createVertexArray(), buffer = gl.createBuffer(), loc = gl.getAttribLocation(pT.h, 'inst');
  gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, tD.byteLength, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 16, 0); gl.vertexAttribDivisor(loc, 1); gl.bindVertexArray(null);
  kit.owned.push({ vao, buffer });

  let W = 2, H = 2, asp = [1, 1], sim = null, cover = null, b = { x: 0, y: 0, tx: 0, ty: 0, dx: 0, dy: 1, on: false, id: null };
  let ci = (seed >>> 0) % COATS.length, grow = 2, seedG = (seed % 43) * .3, on = 0, cutS = 0, speedS = 0, done = false, doneT = 0, sweep = 9;
  const bw = () => Math.min(asp[0], asp[1]) * .13, local = p => [(p.x - .5) * asp[0], (p.y - .5) * asp[1]];
  function regrow() { ci = (ci + 1) % COATS.length; seedG += 1.9; grow = 0; done = false; doneT = 0; sweep = 9; cover && cover.clear(); if (bus) bus.play(snd.grow, { gain: .4 }); }
  input.on({
    down(p) { if (done) return; const l = local(p); b.id = p.id; b.on = true; b.x = b.tx = l[0]; b.y = b.ty = l[1]; b.fresh = true; env.buzz(8); },
    move(p) { if (b.id === p.id) { const l = local(p); b.tx = l[0]; b.ty = l[1]; } },
    up(p) { if (b.id === p.id) { b.id = null; b.on = false; } },
  });
  function shed(x, y, n, dirX, dirY) {
    for (let i = 0; i < n && tuft.length < MAXT; i++) {
      const s = (r() * 2 - 1) * bw();
      tuft.push({ x: x - dirY * s, y: y + dirX * s, vx: dirX * (.1 + r() * .35) + (r() - .5) * .3, vy: dirY * (.1 + r() * .35) + (r() - .5) * .3, a: r() * 6.28, w: (r() - .5) * 8, life: .45 + r() * .75, t: 0 });
    }
  }
  function cut(dt) {
    if (!b.on) { speedS *= Math.exp(-dt * 18); return 0; }
    const dx = b.tx - b.x, dy = b.ty - b.y, d = Math.hypot(dx, dy), mv = d * (1 - Math.exp(-dt * 30));
    if (b.fresh) { if (d < .012) return 0; b.dx = dx / d; b.dy = dy / d; b.fresh = false; }
    if (d < 1e-4) { speedS *= Math.exp(-dt * 18); return 0; }
    const reach = Math.min(mv, .1), steps = Math.max(1, Math.ceil(reach / .012)), ds = reach / steps, tt = 1 - Math.exp(-dt * 12 / steps), W_ = bw();
    let fresh = 0;
    for (let i = 0; i < steps; i++) {
      const c0 = [b.x, b.y], dir0 = [b.dx, b.dy];
      b.dx += (dx / d - b.dx) * tt; b.dy += (dy / d - b.dy) * tt;
      const l = Math.hypot(b.dx, b.dy) || 1; b.dx /= l; b.dy /= l;
      b.x += dx / d * ds; b.y += dy / d * ds;
      kit.draw(pC, { h: sim.read, asp, c: [b.x, b.y], dir: [b.dx, b.dy], c0, dir0, W: W_ }, sim.write); sim.swap();
      fresh += cover.mark(c0[0], c0[1], b.x, b.y, W_ * .97);
    }
    speedS += (Math.min(1, reach / Math.max(dt, .001) / 1.3) - speedS) * Math.min(1, dt * 28);
    if (fresh) shed(b.x + b.dx * .02, b.y + b.dy * .02, Math.min(14, 2 + fresh * 2), b.dx, b.dy);
    return fresh;
  }
  return {
    resize(w, h) {
      W = w; H = h; const na = w > h ? [w / h, 1] : [1, h / w];
      if (!sim || Math.abs(na[0] / na[1] - asp[0] / asp[1]) > .02) {
        asp = na; const m = quality === 'low' ? 512 : 768;
        sim = kit.double(w >= h ? m : Math.round(m * w / h), w >= h ? Math.round(m * h / w) : m, 'rgba16f');
        cover = new Coverage(asp); grow = 0;
      }
    },
    reset() { b.on = false; b.id = null; regrow(); },
    attract(t) {
      if (done) return;
      const id = 7, x = .5 + .44 * Math.sin(t * .75), y = .5 + .42 * Math.sin(t * .17 + .4);
      if (b.id !== id) input.emit('down', { id, x, y });
      input.emit('move', { id, x, y, pressed: true });
    },
    frame(t, dt) {
      if (grow < 1.4) { grow += dt * .85; kit.draw(pG, { h: sim.read, asp, seed: seedG, grow: Math.min(grow, 1.4) }, sim.write); sim.swap(); }
      const fresh = done ? 0 : cut(dt);
      on += ((b.on ? 1 : 0) - on) * Math.min(1, dt * 22);
      cutS += (Math.min(1, fresh / 20) - cutS) * Math.min(1, dt * 16);
      if (bus) {
        // The motor labours a little when it bites, then sings freely on bare lanes.
        motor.set({ gain: .26 * on * (1 + .35 * cutS), rate: 1 - cutS * .035, lp: 1900 + 2200 * cutS + 700 * speedS }, .03);
        crunch.set({ gain: .55 * cutS, rate: .8 + speedS * .35 }, .02);
      }
      for (const q of tuft) { q.t += dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= Math.exp(-dt * 2.6); q.vy *= Math.exp(-dt * 2.6); q.a += q.w * dt; }
      for (let i = tuft.length - 1; i >= 0; i--) if (tuft[i].t > tuft[i].life) tuft.splice(i, 1);
      if (!done && grow >= 1.4 && cover.fraction > .96) { done = true; doneT = 0; sweep = -asp[0] * .8 - asp[1]; b.on = false; b.id = null; if (bus) bus.play(snd.gleam, { gain: .45, send: .5 }); env.buzz(25); }
      if (done) { doneT += dt; sweep += dt * 2.6; if (doneT > 2.8) regrow(); }

      const coat = COATS[ci];
      post.begin();
      kit.draw(pS, { h: sim.read, asp, tx: [1 / sim.w, 1 / sim.h], res: [W, H], bc: [b.x, b.y], bd: [b.dx, b.dy], bw: bw(), show: on > .5 ? 1 : 0, ...coat, sweep, buzz: t, shells: quality === 'low' ? 7 : 9 });
      tuft.forEach((q, i) => { tD[i * 4] = q.x; tD[i * 4 + 1] = q.y; tD[i * 4 + 2] = q.a; tD[i * 4 + 3] = Math.min(1, (q.life - q.t) * 3); });
      if (tuft.length) {
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferSubData(gl.ARRAY_BUFFER, 0, tD, 0, tuft.length * 4);
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.bindVertexArray(vao);
        kit.use(pT, { asp, size: .017, tip: coat.tip }); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, tuft.length);
        gl.bindVertexArray(null); gl.disable(gl.BLEND);
      }
      post.end({ exposure: 1.05, bloom: .05, vig: .6, grain: .012 }, dt);
    },
    destroy() { bus && bus.destroy(); },
  };
}
