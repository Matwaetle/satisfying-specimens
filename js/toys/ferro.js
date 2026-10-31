// No.05 Ferrofluid. Black mirror liquid crowning into Rosensweig spikes under a magnet.
import { drone, gloop, wetTick, brownLoop } from '../core/synth.js';

// Magnet field relaxes with mass and a neighbour coupling, so spikes lag and shiver.
const FIELD = /* glsl */ `in vec2 v; out vec4 o; uniform sampler2D f; uniform vec2 tx; uniform vec4 mag[2]; uniform float dt;
void main(){ vec4 c=texture(f,v); float tgt=0.; vec2 p=v*8.-4.;
  for(int i=0;i<2;i++){ vec2 d=p-mag[i].xy; float s=mag[i].z; tgt+=s*exp(-dot(d,d)/(mag[i].w*mag[i].w)); }
  float l=texture(f,v-vec2(tx.x,0.)).r+texture(f,v+vec2(tx.x,0.)).r+texture(f,v-vec2(0.,tx.y)).r+texture(f,v+vec2(0.,tx.y)).r;
  float lap=l*.25-c.r;
  float vel=c.g+(tgt-c.r)*dt*62.+lap*dt*240.; vel*=exp(-dt*6.5);
  o=vec4(c.r+vel*dt,vel,0.,1.); }`;

const HEIGHT = /* glsl */ `in vec2 v; out vec4 o; uniform sampler2D f; uniform float time,cell;
const float SQ=.8660254;
float F(vec2 p){ return texture(f,(p+4.)/8.).r; }
void main(){
  vec2 p=v*8.-4.;
  float field=F(p);
  float mound=.24*smoothstep(.02,1.3,field)+.05*field;
  vec2 c=p/cell;
  float r0=floor(c.y/SQ+.5); float spike=0.;
  for(int k=-1;k<=1;k++){ float r=r0+float(k); float off=mod(r,2.)*.5; float cx=floor(c.x-off+.5);
    { float xx=cx; vec2 id=vec2(xx,r); vec2 ctr=vec2(xx+off,r*SQ);
      vec2 jit=(hash2(id)-.5)*.08; vec2 w=(ctr+jit)*cell;
      float a=F(w);
      float s=smoothstep(.24,.82,a);
      if(s<=0.) continue;
      float hgt=s*(.2+.3*min(a,1.6))*(.9+.2*hash(id+4.))+.02*sin(time*9.+hash(id)*20.)*s;
      float d=length(c-ctr-jit)/(.58);
      // Sharp cusp tip with a smooth flared skirt: the Rosensweig profile.
      float prof=d<1.?pow(1.-d,1.75)*.82+.18*(1.-d*d)*(1.-d):0.;
      spike=max(spike,hgt*prof);
    }
  }
  // Slow ripples so the pool is never dead glass.
  float rip=.0035*sin(p.x*3.1+time*.8+sin(p.y*2.3+time*.5))+.002*sin(p.y*7.+p.x*2.-time*1.3);
  o=vec4(mound+spike*1.0+rip+field*.008*sin(p.x*23.+time*7.),field,0.,1.);
}`;

const SHADE = /* glsl */ `in vec2 v; out vec4 o; uniform sampler2D ht; uniform vec2 res; uniform vec3 cam,fw,up,rt; uniform float fov,time; uniform vec2 tx; uniform int steps;
float H(vec2 p){ return texture(ht,(p+4.)/8.).r; }
vec3 stage(vec3 d){
  // Only slender strips: a flat pool mirrors a thin line, while spike flanks sweep the bright ones.
  vec3 c=mix(vec3(.012,.012,.014),vec3(.36,.345,.33),smoothstep(0.,1.,d.y));
  if(d.y>.02){ vec2 p=d.xz/d.y;
    c+=vec3(.92,.96,1.)*20.*rectBox(p,vec2(.1,.55),vec2(1.7,.04),.012);
    c+=vec3(1.,.84,.66)*12.*rectBox(p,vec2(-1.1,.75),vec2(.06,.75),.02);
    c+=vec3(.62,.75,1.)*10.*rectBox(p,vec2(1.25,.75),vec2(.05,.75),.02);
    c+=vec3(1.,.93,.85)*2.2*rectBox(p,vec2(0.,1.2),vec2(1.3,.3),.12);
  }
  return c;
}
void main(){
  vec2 uv=(v-.5)*res/min(res.x,res.y)*2.;
  vec3 rd=normalize(fw*fov+rt*uv.x+up*uv.y);
  vec3 ro=cam;
  // March the height volume between its bounding planes.
  float ceil_=1.05;
  if(rd.y>=0.){ o=vec4(0.,0.,0.,1.); return; }
  float t0=(ceil_-ro.y)/rd.y, t1=(0.-ro.y)/rd.y;
  float dt=(t1-t0)/float(steps); float t=t0; float hitT=t1; float prev=ro.y+rd.y*t-H((ro+rd*t).xz);
  bool hit=false;
  for(int i=0;i<steps;i++){ t+=dt; vec3 p=ro+rd*t; if(abs(p.x)>3.95||abs(p.z)>3.95) { continue; } float d=p.y-H(p.xz);
    if(d<0.){ float a=t-dt,b=t; for(int k=0;k<6;k++){ float m=(a+b)*.5; vec3 q=ro+rd*m; if(q.y-H(q.xz)<0.) b=m; else a=m; } hitT=(a+b)*.5; hit=true; break; } prev=d; }
  vec3 P=ro+rd*hitT;
  float fog=smoothstep(3.6,1.6,length(P.xz));
  vec2 e=tx*8.*1.1;
  float hL=H(P.xz-vec2(e.x,0.)),hR=H(P.xz+vec2(e.x,0.)),hD=H(P.xz-vec2(0.,e.y)),hU=H(P.xz+vec2(0.,e.y));
  vec3 N=normalize(vec3(hL-hR,2.*e.x,hD-hU));
  vec3 Rf=reflect(rd,N); if(Rf.y<.0) Rf.y=-Rf.y*.3;
  // Short self-reflection march darkens what points into neighbouring spikes.
  float occ=1.; float tr=.04; for(int i=0;i<7;i++){ vec3 q=P+N*.01+Rf*tr; float d=q.y-H(q.xz); occ=min(occ,smoothstep(-.04,.04,d)+.12); tr+=.06+.05*float(i); }
  float cosV=max(dot(N,-rd),0.);
  float F=schlick(cosV,.13);
  // Still pool stays deep black; only what the magnet raises catches the rig.
  vec3 col=stage(Rf)*F*occ*1.2*mix(.22,1.,smoothstep(.0,.09,P.y));
  // Ferrofluid is not pure black: oily brown body at grazing light.
  float vall=smoothstep(.0,.35,P.y);
  col+=vec3(.012,.0095,.0085)*(.3+1.*vall)*(.4+max(N.y,0.));
  col*=fog;
  o=vec4(col,1.);
}`;

export function create(env) {
  const { kit, gl, post, input, audio, quality } = env;
  const pField = kit.program(FIELD), pH = kit.program(HEIGHT), pS = kit.program(SHADE);
  const bus = audio && audio.bus({ gain: 1, send: .2 });
  let dr, dr2, hiss, gloops = [], ticks = [], whoomp;
  if (bus) {
    const sr = bus.sr;
    dr = bus.loop(bus.buffer(drone(sr)), { gain: 0, hp: 25, lp: 300, send: .25 });
    dr2 = bus.loop(bus.buffer(drone(sr, 73.42, 8, 6)), { gain: 0, hp: 70, lp: 900, send: .3 });
    hiss = bus.loop(bus.buffer(brownLoop(sr, 12, 6, .94)), { gain: 0, hp: 500, lp: 2200, send: .15 });
    gloops = Array.from({ length: 4 }, (_, i) => bus.buffer(gloop(sr, 200 + i * 7, { base: 110 + i * 16, count: 6 + i })));
    ticks = Array.from({ length: 12 }, (_, i) => bus.buffer(wetTick(sr, 300 + i)));
    whoomp = bus.buffer(gloop(sr, 400, { base: 90, count: 3, span: .25 }));
  }
  const fieldN = quality === 'low' ? 128 : 192, hN = quality === 'low' ? 640 : 900;
  const field = kit.double(fieldN, fieldN, 'rg16f');
  const hmap = kit.fbo(hN, hN, 'rg16f');
  let W = 2, H = 2;
  const cam = [0, 3.0, 2.75], target = [0, .08, -.25];
  const norm = v => { const l = Math.hypot(...v); return v.map(x => x / l); };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  let fw, rt, up, fov = 2.05;
  const updCam = () => {
    const r = W / H;
    // Portrait pulls back so the pool still fills the frame.
    cam[1] = r < 1 ? 3.8 : 3; cam[2] = r < 1 ? 3.4 : 2.75;
    fw = norm([target[0] - cam[0], target[1] - cam[1], target[2] - cam[2]]);
    rt = norm(cross(fw, [0, 1, 0])); up = cross(rt, fw);
  };
  const mags = [{ x: 0, z: -.4, s: .32, tx: 0, tz: -.4, ts: .32, w: 1, id: null }, { x: 0, z: 0, s: 0, tx: 0, tz: 0, ts: 0, w: .9, id: null }];
  let energy = 0, tickAcc = 0, heldLevel = 0, lastLevel = 0, hoverOn = false;

  function plane(p) {
    const m = Math.min(W, H), ux = (p.x - .5) * W / m * 2, uy = (p.y - .5) * H / m * 2;
    const d = norm([fw[0] * fov + rt[0] * ux + up[0] * uy, fw[1] * fov + rt[1] * ux + up[1] * uy, fw[2] * fov + rt[2] * ux + up[2] * uy]);
    const t = (.15 - cam[1]) / d[1];
    return [Math.max(-3.6, Math.min(3.6, cam[0] + d[0] * t)), Math.max(-3.6, Math.min(3.6, cam[2] + d[2] * t))];
  }
  function clack() { if (bus) bus.play(whoomp, { gain: .55 }); env.buzz(10); }
  input.on({
    down(p) {
      const m = mags.find(q => q.id === null) || mags[0];
      m.id = p.id; m.pressed = true;
      const l = plane(p); m.tx = l[0]; m.tz = l[1]; m.ts = 1.05; m.w = 1;
      clack();
    },
    move(p) {
      const m = mags.find(q => q.id === p.id);
      if (m) { const l = plane(p); m.tx = l[0]; m.tz = l[1]; return; }
      // Mouse hover keeps the magnet near but not fully engaged.
      if (!p.pressed && mags[0].id === null) { const l = plane(p); mags[0].tx = l[0]; mags[0].tz = l[1]; mags[0].ts = .62; mags[0].w = 1; hoverOn = true; }
    },
    up(p) {
      const m = mags.find(q => q.id === p.id); if (!m) return;
      m.id = null; m.pressed = false; m.ts = m === mags[0] ? .34 : 0; m.w = .9;
      if (bus && heldLevel > .35) bus.play(gloops[Math.floor(Math.random() * gloops.length)], { gain: .4 + heldLevel * .5 });
    },
  });

  return {
    resize(w, h) { W = w; H = h; updCam(); },
    attract(t) {
      mags[0].tx = Math.sin(t * .45) * 1.4; mags[0].tz = Math.cos(t * .33) * .9 - .3; mags[0].ts = .72 + .38 * Math.sin(t * .7); mags[0].w = .95;
    },
    frame(t, dt) {
      let move = 0;
      for (const m of mags) {
        const k = 1 - Math.exp(-dt * 9), ox = m.x, oz = m.z;
        m.x += (m.tx - m.x) * k; m.z += (m.tz - m.z) * k;
        // Holding slowly draws the field deeper: the crown keeps rising.
        if (m.pressed) m.ts = Math.min(1.75, m.ts + dt * .42);
        m.s += (m.ts - m.s) * (1 - Math.exp(-dt * (m.ts > m.s ? 3.2 : 4.2)));
        move += Math.hypot(m.x - ox, m.z - oz) / Math.max(dt, .001) * m.s;
      }
      const magArr = new Float32Array(8);
      mags.forEach((m, i) => magArr.set([m.x, m.z, m.s, m.w], i * 4));
      const sub = 2;
      for (let i = 0; i < sub; i++) { kit.draw(pField, { f: field.read, tx: [1 / fieldN, 1 / fieldN], mag: magArr, dt: Math.min(dt, 1 / 40) / sub }, field.write); field.swap(); }
      kit.draw(pH, { f: field.read, time: t, cell: .25 }, hmap);

      // Sound driven by magnet level and the churn of spikes passing through threshold.
      const level = Math.min(1, Math.max(mags[0].s, mags[1].s) / 1.7);
      heldLevel = level;
      energy += (Math.min(1, move / 3) - energy) * Math.min(1, dt * 8);
      if (bus) {
        dr.set({ gain: .05 + .4 * level * level + .08 * energy, lp: 110 + 420 * level }, .06);
        dr2.set({ gain: .24 * Math.pow(level, 1.6) + .05 * energy, lp: 280 + 1700 * level * level, rate: 1 + .02 * energy }, .08);
        hiss.set({ gain: .05 * energy + .03 * level * level, lp: 1300 + 2000 * energy }, .05);
        const dl = Math.max(0, level - lastLevel) / Math.max(dt, .001);
        tickAcc += dt * (energy * 26 + dl * 34 + level * 1.5);
        while (tickAcc > 1) { tickAcc -= 1; bus.play(ticks[Math.floor(Math.random() * ticks.length)], { gain: .08 + Math.random() * .16, rate: .8 + Math.random() * .5, pan: (Math.random() - .5) * .7, delay: Math.random() * .02 }); }
      }
      lastLevel = level;

      post.begin();
      kit.draw(pS, { ht: hmap, res: [W, H], cam, fw, up, rt, fov, time: t, tx: [1 / hN, 1 / hN], steps: quality === 'low' ? 32 : 48 });
      post.end({ exposure: 1.3, bloom: .075, dof: .6, dofY: .45, dofW: .3, vig: .8, grain: .02 }, dt);
    },
    destroy() { bus && bus.destroy(); },
  };
}
