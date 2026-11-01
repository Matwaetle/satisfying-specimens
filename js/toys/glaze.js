// Mirror glaze. Pour a rope of colour over a cake and watch it run down the sides as one skin.
import { pourLoop, gloop, gleam, bubble } from '../core/synth.js';

const TERRAIN = /* glsl */ `in vec2 v; out vec4 o;
void main(){ vec2 p=(v-.5)*4.8; float r=length(p); float a=atan(p.y,p.x);
  float top=.62+.018*(1.-r*r);
  // Tiny bumps on the wall are what split a falling sheet into fingers.
  float wob=.012*(vnoise(vec2(a*14.,1.))-.5)+.006*(vnoise(vec2(a*37.,4.))-.5);
  float b=top*smoothstep(1.11+wob*2.,.97+wob*2.,r);
  float rim=smoothstep(2.05,2.3,r)*.14; o=vec4(b+rim,0.,0.,1.); }`;
// Thin-film flow, conservative: rgb carries colour * height, a = height.
const FLOW = /* glsl */ `in vec2 v; out vec4 o; uniform sampler2D s,ter; uniform vec2 tx,src; uniform vec3 col; uniform float rate,srcR;
const float K=48000.; const float LIM=.21;
float mob(float h){ return min(K*h*h*h+h*.0,LIM); }
void main(){ vec4 c=texture(s,v); float b=texture(ter,v).r; float H0=c.a+b; vec4 d=vec4(0.);
  for(int i=0;i<4;i++){ vec2 e=i==0?vec2(tx.x,0.):i==1?vec2(-tx.x,0.):i==2?vec2(0.,tx.y):vec2(0.,-tx.y);
    vec4 n=texture(s,v+e); float diff=(n.a+texture(ter,v+e).r)-H0;
    if(diff>0.) d+=n*min(mob(n.a)*diff/max(n.a,1e-5),.2); else d-=c*min(mob(c.a)*(-diff)/max(c.a,1e-5),.2); }
  vec4 r=max(c+d,vec4(0.));
  vec2 p=(v-.5)*4.8; if(rate>0.){ float g=exp(-dot(p-src,p-src)/(srcR*srcR))*rate; r+=vec4(col*g,g); }
  // The plate carries away what runs off so the pool never swallows the cake.
  float rr=length(p); r*=1.-.012*smoothstep(1.35,1.95,rr)-.04*smoothstep(1.95,2.05,rr);
  o=r; }`;
const HEIGHT = /* glsl */ `in vec2 v; out vec4 o; uniform sampler2D s,ter; void main(){ o=vec4(texture(s,v).a+texture(ter,v).r,0.,0.,1.); }`;
const CHECK = /* glsl */ `in vec2 v; out vec4 o; uniform sampler2D s; void main(){ vec2 p=(v-.5)*2.; o=vec4(length(p)<.92?(texture(s,(p*1.0)*.22+.5).a>.004?1.:0.):.5,0.,0.,1.); }`;
const SHADE = /* glsl */ `in vec2 v; out vec4 o; uniform sampler2D ht,s,ter; uniform vec2 res,tx; uniform vec3 cam,fw,up,rt,pc; uniform vec3 strm; uniform float fov,sweep; uniform int steps;
float H(vec2 p){ return texture(ht,p/4.8+.5).r; }
vec3 rig(vec3 d){ vec3 c=mix(vec3(.018,.016,.016),vec3(.13,.125,.12),smoothstep(-.2,1.,d.y));
  if(d.y>.02){ vec2 p=d.xz/d.y;
    c+=vec3(1.,.96,.9)*15.*rectBox(p,vec2(-.55,-.1),vec2(.55,.4),.03);
    c+=vec3(1.,.96,.9)*3.*rectBox(p,vec2(-.55,-.1),vec2(.018,.42),.004)*-.9;
    c+=vec3(.72,.82,1.)*6.*rectBox(p,vec2(1.2,.3),vec2(.07,.95),.02);
    c+=vec3(1.,.82,.66)*2.5*rectBox(p,vec2(0.,1.4),vec2(1.2,.12),.05); }
  return c; }
void main(){
  vec2 uv=(v-.5)*res/min(res.x,res.y)*2.; vec3 rd=normalize(fw*fov+rt*uv.x+up*uv.y); vec3 ro=cam;
  if(rd.y>=0.){ o=vec4(0.,0.,0.,1.); return; }
  float t0=(.9-ro.y)/rd.y,t1=(-.0-ro.y)/rd.y,dt=(t1-t0)/float(steps),t=t0,hitT=t1;
  for(int i=0;i<steps;i++){ t+=dt; vec3 p=ro+rd*t; if(abs(p.x)>2.38||abs(p.z)>2.38) continue;
    if(p.y-H(p.xz)<0.){ float a=t-dt,b=t; for(int k=0;k<6;k++){ float m=(a+b)*.5; vec3 q=ro+rd*m; if(q.y-H(q.xz)<0.) b=m; else a=m; } hitT=(a+b)*.5; break; } }
  vec3 P=ro+rd*hitT; vec2 uvP=P.xz/4.8+.5;
  vec2 e=tx*4.8*1.3;
  vec3 Ng=normalize(vec3(H(P.xz-vec2(e.x,0.))-H(P.xz+vec2(e.x,0.)),2.*e.x,H(P.xz-vec2(0.,e.y))-H(P.xz+vec2(0.,e.y))));
  vec4 st=texture(s,uvP); float h=st.a; vec3 alb=h>1e-4?st.rgb/h:vec3(.5);
  float b=texture(ter,uvP).r; float r=length(P.xz);
  vec3 L=normalize(vec3(-.45,.8,-.2));
  vec3 col;
  // Cake under the glaze: matte butter cream; plate: dark, faintly glossy stoneware.
  vec3 cake=vec3(.82,.72,.55)*(.28+.8*max(dot(Ng,L),0.))*.55+vec3(.015);
  vec3 Rp=reflect(rd,Ng);
  vec3 plate=vec3(.03,.03,.033)*(.4+max(dot(Ng,L),0.))+min(rig(Rp),vec3(2.))*schlick(max(dot(Ng,-rd),0.),.04)*.1;
  col=mix(plate,cake,smoothstep(.02,.12,b)*step(r,1.3));
  float cover=smoothstep(.0006,.003,h);
  vec3 Rf=reflect(rd,Ng); float Fr=schlick(max(dot(Ng,-rd),0.),.06);
  vec3 g=alb*alb*(.2+.5*max(dot(Ng,L),0.))*(.45+.55*smoothstep(0.,.03,h));
  // The flat pool on the plate would mirror the whole softbox, so it only gets a hint of it.
  vec3 lit=g+min(rig(Rf),vec3(mix(15.,2.5,smoothstep(1.12,1.3,r))))*(Fr+.012);
  col=mix(col,lit,cover);
  col+=alb*cover*exp(-pow((P.x*.7+P.z*.5-sweep)*5.,2.))*.5;
  // The falling rope, a slim gloss cylinder from above frame to the surface.
  if(strm.z>.0005){ vec2 oc=ro.xz-strm.xy; float a=dot(rd.xz,rd.xz),bb=dot(oc,rd.xz),cc=dot(oc,oc)-strm.z*strm.z,dd=bb*bb-a*cc;
    if(dd>0.){ float tc=(-bb-sqrt(dd))/a; vec3 Q=ro+rd*tc; if(tc<hitT&&Q.y>H(Q.xz)){ vec3 Nc=normalize(vec3(Q.x-strm.x,0.,Q.z-strm.y)); float f2=schlick(max(dot(Nc,-rd),0.),.06); col=pc*pc*(.25+.7*max(dot(Nc,L),0.))+rig(reflect(rd,Nc))*(f2+.02); } } }
  float fog=smoothstep(2.36,1.85,r); o=vec4(col*fog,1.);
}`;

const GLAZES = [[.62, .05, .22], [.92, .58, .16], [.12, .05, .03], [.14, .34, .62], [.34, .14, .58], [.1, .46, .4]];

export function create(env) {
  const { kit, gl, post, input, audio, seed, quality } = env;
  const pT = kit.program(TERRAIN), pF = kit.program(FLOW), pH = kit.program(HEIGHT), pC = kit.program(CHECK), pS = kit.program(SHADE);
  const bus = audio && audio.bus({ gain: 1, send: .2 });
  let pour, snd = {};
  if (bus) {
    const sr = bus.sr;
    pour = bus.loop(bus.buffer(pourLoop(sr, 31)), { gain: 0, hp: 110, lp: 2600, send: .18 });
    snd.start = [0, 1, 2].map(i => bus.buffer(gloop(sr, 40 + i, { base: 150 + i * 24, count: 4, span: .3 })));
    snd.drip = [0, 1, 2, 3].map(i => bus.buffer(bubble(sr, 420 + i * 190, { rise: .9, tau: .03, seed: 5 + i, impact: .15 })));
    snd.gleam = bus.buffer(gleam(sr, seed & 1023));
  }
  const N = quality === 'low' ? 360 : 512;
  const ter = kit.fbo(N, N, 'rg16f'); kit.draw(pT, {}, ter);
  let sim = kit.double(N, N, 'rgba16f');
  const ht = kit.fbo(N, N, 'rg16f'), chk = kit.fbo(32, 32, 'rgba8');
  let W = 2, H = 2, fw, rt, up; const fov = 2.1, cam = [0, 3.4, 2.75], target = [0, .22, .1];
  const norm = a => { const l = Math.hypot(...a); return a.map(x => x / l); };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const updCam = () => { const r = W / H; cam[1] = r < 1 ? 5 : 3.4; cam[2] = r < 1 ? 4.2 : 2.75; fw = norm([target[0] - cam[0], target[1] - cam[1], target[2] - cam[2]]); rt = norm(cross(fw, [0, 1, 0])); up = cross(rt, fw); };
  let hand = { x: 0, z: 0, tx: 0, tz: 0, on: false, id: null }, pourS = 0, ci = (seed >>> 0) % GLAZES.length, col = GLAZES[ci], checkT = 0, done = false, sweep = 9, dripT = 0, poured = 0;
  const px = new Uint8Array(32 * 32 * 4);

  function toPlane(p) {
    const m = Math.min(W, H), ux = (p.x - .5) * W / m * 2, uy = (p.y - .5) * H / m * 2;
    const d = norm([0, 1, 2].map(i => fw[i] * fov + rt[i] * ux + up[i] * uy)), t = (.62 - cam[1]) / d[1];
    return [Math.max(-1.9, Math.min(1.9, cam[0] + d[0] * t)), Math.max(-1.9, Math.min(1.9, cam[2] + d[2] * t))];
  }
  function clearCake() { for (const t of [sim.read, sim.write]) { gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); } done = false; sweep = 9; poured = 0; }
  input.on({
    down(p) { const l = toPlane(p); hand.id = p.id; hand.on = true; hand.x = hand.tx = l[0]; hand.z = hand.tz = l[1]; ci = (ci + 1) % GLAZES.length; col = GLAZES[ci]; if (bus) bus.play(snd.start[Math.floor(Math.random() * 3)], { gain: .45 }); },
    move(p) { if (hand.id === p.id) { const l = toPlane(p); hand.tx = l[0]; hand.tz = l[1]; } },
    up(p) { if (hand.id === p.id) { hand.id = null; hand.on = false; } },
  });
  return {
    resize(w, h) { W = w; H = h; updCam(); },
    reset() { clearCake(); },
    attract(t) {
      const id = 8, on = (t % 7) < 5, q = { id, x: .5 + .1 * Math.sin(t * .8), y: .55 + .1 * Math.cos(t * .6), pressed: true };
      if (on && hand.id !== id) input.emit('down', q);
      if (on) input.emit('move', q);
      if (!on && hand.id === id) input.emit('up', q);
    },
    frame(t, dt) {
      const k = 1 - Math.exp(-dt * 8); hand.x += (hand.tx - hand.x) * k; hand.z += (hand.tz - hand.z) * k;
      pourS += ((hand.on ? 1 : 0) - pourS) * Math.min(1, dt * (hand.on ? 6 : 10));
      const scale = Math.min(dt * 60, 2), steps = 5;
      for (let i = 0; i < steps; i++) { kit.draw(pF, { s: sim.read, ter, tx: [1 / N, 1 / N], src: [hand.x, hand.z], col, rate: pourS * .03 * scale, srcR: .075 }, sim.write); sim.swap(); }
      kit.draw(pH, { s: sim.read, ter }, ht);
      poured += pourS * dt;

      if (bus) {
        const wob = 1 + .025 * Math.sin(t * 2.3);
        pour.set({ gain: .62 * Math.pow(pourS, .7), rate: wob, lp: 1400 + 1400 * pourS }, .05);
        dripT -= dt;
        // Glaze keeps falling off the rim for a while after the pour stops.
        if (poured > .6 && dripT <= 0) { dripT = .22 + Math.random() * .7; bus.play(snd.drip[Math.floor(Math.random() * 4)], { gain: .08 + Math.random() * .13, pan: (Math.random() - .5) * .9, rate: .8 + Math.random() * .4 }); }
        poured = Math.max(0, poured - dt * .08);
      }
      checkT -= dt;
      if (!done && checkT <= 0) {
        checkT = .5;
        kit.draw(pC, { s: sim.read }, chk); gl.readPixels(0, 0, 32, 32, gl.RGBA, gl.UNSIGNED_BYTE, px);
        let n = 0, c = 0; for (let i = 0; i < px.length; i += 4) { if (px[i] === 128 || px[i] === 127) continue; n++; if (px[i] > 200) c++; }
        if (n && c / n > .97) { done = true; sweep = -2.6; snd.gleam && bus.play(snd.gleam, { gain: .5, send: .55 }); env.buzz(25); }
      }
      if (sweep < 8) sweep += dt * 2.2;
      post.begin();
      kit.draw(pS, { ht, s: sim.read, ter, res: [W, H], tx: [1 / N, 1 / N], cam, fw, up, rt, fov, pc: col, strm: [hand.x + .006 * Math.sin(t * 17), hand.z, .034 * pourS], sweep, steps: quality === 'low' ? 36 : 56 });
      post.end({ exposure: 1.1, bloom: .09, dof: .5, dofY: .45, dofW: .36, vig: .75, grain: .013 }, dt);
    },
    destroy() { bus && bus.destroy(); },
  };
}
