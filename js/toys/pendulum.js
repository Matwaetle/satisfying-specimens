// No.06 Pendulum wave. Sixteen tuned lengths drift out of phase, and every 30s fall back into one line.
import { bell, drone, dScale } from '../core/synth.js';

const N = 16, CYCLE = 30, BASE = 24;

const FRAG = /* glsl */ `in vec2 v; out vec4 o; uniform vec2 res; uniform vec3 cam,fw,up,rt; uniform vec3 balls[16]; uniform float glow[16]; uniform float fov,rad,barY,time;
bool sphere(vec3 ro,vec3 rd,vec3 c,float r,out float t){ vec3 oc=ro-c; float b=dot(oc,rd),q=dot(oc,oc)-r*r,h=b*b-q; if(h<0.) return false; h=sqrt(h); t=-b-h; return t>1e-3; }
// Nearest ball along a ray.
int trace(vec3 ro,vec3 rd,out float tOut){ int id=-1; tOut=1e9; for(int i=0;i<16;i++){ float t; if(sphere(ro,rd,balls[i],rad,t)&&t<tOut){ tOut=t; id=i; } } return id; }
float shadowBalls(vec3 p,vec3 L){ float s=1.; for(int i=0;i<16;i++){ vec3 d=balls[i]-p; float b=dot(d,L); if(b<0.) continue; float h=length(d-L*b); s=min(s,smoothstep(rad*.75,rad*1.4+b*.09,h)); } return s; }
// Ray vs thin vertical string: returns coverage.
float lineCov(vec3 ro,vec3 rd,vec3 a,vec3 b,float w,float px,out float tl){ vec3 u=b-a,w0=ro-a; float A=dot(u,u),B=dot(u,rd),D=dot(u,w0),E=dot(rd,w0),den=A-B*B; float sc=clamp((D-B*E)/max(den,1e-5),0.,1.),tc=sc*B-E; vec3 c=w0+rd*tc-u*sc; tl=tc; float dist=length(c); float r=px*max(tc,.01); return (1.-smoothstep(w,w+r,dist))*step(0.,tc)*min(1.,w/max(r,w)*1.2+.2); }
bool inBounds(vec3 ro,vec3 rd){ vec3 lo=vec3(-3.4,-.1,-4.4),hi=vec3(3.4,barY+.2,4.4); vec3 a=(lo-ro)/rd,b=(hi-ro)/rd; vec3 mn=min(a,b),mx=max(a,b); float n=max(max(mn.x,mn.y),mn.z),f=min(min(mx.x,mx.y),mx.z); return f>max(n,0.); }
vec3 floorEnv(vec3 d){ vec2 p=d.xz/max(d.y,.03); return vec3(.018,.017,.016)+vec3(.8,.82,.86)*1.4*rectBox(p,vec2(-.6,-.5),vec2(1.6,.03),.02)+vec3(1.,.9,.8)*.5*rectBox(p,vec2(.3,-.1),vec2(.03,1.),.02); }
vec3 floorC(vec3 p,vec3 rd,int depth){
  // Black polished stone: strong blurred mirror, faint mottling, contact shadows.
  vec3 c=vec3(.012,.0115,.011)*(.7+.6*vnoise(p.xz*1.4));
  vec3 Rr=reflect(rd,vec3(0.,1.,0.));
  float F=schlick(max(-rd.y,0.),.035);
  float sB=0.; if(abs(p.x)<4.5&&abs(p.z)<5.5) for(int i=0;i<16;i++){ vec2 q=p.xz-balls[i].xz; sB+=exp(-dot(q,q)/(.11+balls[i].y*.05))*.42; }
  c*=1.-min(sB,.85);
  c+=floorEnv(Rr)*F*.9*(1.-min(sB,.7));
  return c;
}
vec3 skyOf(vec3 d){ return studio(d)+vec3(.012,.012,.014)*smoothstep(.3,-.2,d.y); }
vec3 shadeBall(vec3 ro,vec3 rd,float t,int id,int bounce){
  vec3 P=ro+rd*t,Nn=normalize(P-balls[id]); vec3 R=reflect(rd,Nn);
  float F=schlick(max(dot(Nn,-rd),0.),.62);
  vec3 env;
  // One real inter-reflection so chrome shows its neighbours.
  float t2; int j=-1;
  if(bounce>0){ j=trace(P+Nn*.001,R,t2); }
  if(j>=0){ vec3 Pj=P+R*t2,Nj=normalize(Pj-balls[j]); env=studio(reflect(R,Nj))*.75+vec3(1.,.72,.38)*glow[j]*1.3; }
  else if(R.y<0.){ float tf=-P.y/R.y; vec3 pf=P+R*tf; env=floorC(pf,R,0); }
  else env=studio(R)+vec3(.34,.33,.32)*smoothstep(-.05,.95,R.y);
  vec3 c=env*F*vec3(.96,.94,.92);
  // Warm emission on strike feels like the ball itself rings.
  c+=vec3(1.,.72,.38)*glow[id]*(.38+1.6*pow(1.-max(dot(Nn,-rd),0.),2.));
  return c;
}
void main(){
  vec2 uv=(v-.5)*res/min(res.x,res.y)*2.;
  vec3 rd=normalize(fw*fov+rt*uv.x+up*uv.y); vec3 ro=cam;
  float px=2./min(res.x,res.y)/fov;
  // Backdrop: a seamless dark sweep with a lit pool behind the row.
  vec3 col=vec3(.006,.0055,.005)+vec3(.022,.02,.018)*exp(-dot(uv-vec2(.1,.25),uv-vec2(.1,.25))*.6);
  float depth=1e9;
  if(rd.y<0.){ float t=-ro.y/rd.y; vec3 p=ro+rd*t; if(length(p.xz)<40.){ col=floorC(p,rd,1)*1.;
      // Mirror image of balls in the stone.
      vec3 Rr=reflect(rd,vec3(0.,1.,0.)); float tt; int id=-1; if(inBounds(p+vec3(0.,.001,0.),Rr)) id=trace(p+vec3(0.,.001,0.),Rr,tt);
      if(id>=0){ float F=schlick(max(-rd.y,0.),.1); col+=shadeBall(p,Rr,tt,id,0)*F*2.6*exp(-tt*.16); }
      col=mix(col,vec3(.006,.0055,.005)+vec3(.022,.02,.018)*exp(-dot(uv-vec2(.1,.25),uv-vec2(.1,.25))*.6),smoothstep(10.,24.,t));
      depth=t; } }
  if(inBounds(ro,rd)){
  float tb; int id=trace(ro,rd,tb);
  if(id>=0&&tb<depth){ col=shadeBall(ro,rd,tb,id,1); depth=tb; }
  // Strings and frame are thin line-coverage overlays with depth test.
  for(int i=0;i<16;i++){ vec3 a=vec3(0.,barY,balls[i].z),b=balls[i]+vec3(0.,rad,0.); float tl; float c=lineCov(ro,rd,a,b,.006,px,tl); if(tl<depth) col=mix(col,vec3(.5,.47,.42),c*.72); }
  { vec3 a=vec3(0.,barY,balls[0].z-.5),b=vec3(0.,barY,balls[15].z+.5); float tl; float c=lineCov(ro,rd,a,b,.045,px,tl);
    if(tl<depth){ col=mix(col,vec3(.09,.085,.08)+vec3(.8,.77,.72)*.18*smoothstep(.3,1.,uv.y*.5+.5),c); } }
  }
  o=vec4(col,1.);
}`;

export function create(env) {
  const { kit, post, input, ui, audio, reduced } = env;
  const prog = kit.program(FRAG);
  const bus = audio && audio.bus({ gain: .9, send: .5 });
  let bells = [], pad = null;
  const lengths = [], freqs = [];
  for (let i = 0; i < N; i++) {
    const n = BASE + i; // n complete swings per CYCLE: longest string = lowest note.
    const T = CYCLE / n;
    lengths.push(9.81 * T * T / (4 * Math.PI * Math.PI) * 11.6);
    freqs.push(n / CYCLE);
  }
  if (bus) {
    const sr = bus.sr;
    bells = Array.from({ length: N }, (_, i) => bus.buffer(bell(sr, dScale(i + 1, 293.66), { seed: 200 + i, t: 2.6 - i * .05 })));
    pad = bus.loop(bus.buffer(drone(sr, 73.42, 8, 21)), { gain: 0, hp: 50, lp: 700, send: .6 });
  }

  let W = 2, H = 2;
  const barY = 5.25, rad = .22;
  const cam = [6.9, 3.2, 7.6], target = [0, 2.65, 0];
  const norm = v => { const l = Math.hypot(...v); return v.map(x => x / l); };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  let fw, rt, up;
  let fov = 3.3;
  function updCam() {
    const portrait = W < H, k = portrait ? 1.25 : 1; fov = portrait ? 3.1 : 3.3;
    const c = [cam[0] * k, cam[1] + (portrait ? 1.1 : 0), cam[2] * k];
    camNow = c;
    fw = norm([target[0] - c[0], target[1] - c[1], target[2] - c[2]]);
    rt = norm(cross(fw, [0, 1, 0])); up = cross(rt, fw);
  }
  let camNow = cam;

  let clock = 0, amp = 0.4, targetAmp = .4, grabbed = null, grabAngle = 0, prevS = new Float32Array(N), glow = new Float32Array(N);
  let scheduled = new Float32Array(N).fill(-1);
  let padLevel = 0, lastAlign = 0;
  const balls = new Float32Array(N * 3);
  const angles = new Float32Array(N);

  function angleOf(i) {
    if (grabbed) return grabAngle * (.82 + .18 * i / (N - 1));
    return amp * Math.cos(2 * Math.PI * freqs[i] * clock);
  }

  input.on({
    down(p) { grabbed = { id: p.id, x0: p.x, a0: 0 }; grabAngle = angles[Math.floor(N / 2)]; ui.hideHint(); },
    move(p) {
      if (!grabbed || grabbed.id !== p.id) return;
      const dx = (p.x - .5) * 2;
      grabAngle += (Math.max(-.72, Math.min(.72, -dx * .85)) - grabAngle) * .22;
    },
    up(p) {
      if (!grabbed || grabbed.id !== p.id) return;
      grabbed = null;
      amp = Math.max(.08, Math.abs(grabAngle)); targetAmp = amp;
      clock = grabAngle >= 0 ? 0 : 15 * 0 + .5 / freqs[0] * 0; // released in phase: the wave starts from one line
      phaseFlip = grabAngle < 0 ? -1 : 1;
      prevS.fill(0);
    },
  });
  let phaseFlip = 1;

  return {
    resize(w, h) { W = w; H = h; updCam(); },
    reset() { clock = 0; amp = .5; targetAmp = .5; phaseFlip = 1; },
    attract() {},
    frame(t, dt) {
      clock += dt * (reduced ? .6 : 1);
      // Air takes the swing down very slowly, then it holds steady.
      amp += (Math.max(.2, targetAmp * .995) - amp) * dt * .03; targetAmp = Math.max(.2, targetAmp - dt * .002);

      let cx = 0, cy = 0;
      for (let i = 0; i < N; i++) {
        const a = angleOf(i) * (grabbed ? 1 : phaseFlip); angles[i] = a;
        const L = lengths[i], z = (i - (N - 1) / 2) * .46;
        balls[i * 3] = Math.sin(a) * L; balls[i * 3 + 1] = barY - Math.cos(a) * L; balls[i * 3 + 2] = z;
        const ph = 2 * Math.PI * freqs[i] * clock; cx += Math.cos(ph); cy += Math.sin(ph);
        // A note rings as a ball crosses plumb going one way.
        if (!grabbed) {
          const s = Math.sin(ph);
          const crossing = prevS[i] > 0 && Math.cos(ph) * 0 + s <= 0;
          if (s * prevS[i] < 0 && crossing) {
            glow[i] = Math.min(.26, amp * .5);
            if (bus) {
              const g = Math.min(1, amp * 1.9) * (.3 + .1 * Math.sin(i * 1.7));
              bus.play(bells[i], { gain: g * .5, pan: (i / (N - 1) - .5) * .9, send: .6 });
            }
          }
          prevS[i] = s;
        }
        glow[i] *= Math.exp(-dt * 4.5);
      }
      // Alignment drives the swell: the room opens as the row closes into a line.
      const R = Math.hypot(cx, cy) / N;
      padLevel += (Math.pow(R, 3) - padLevel) * Math.min(1, dt * 1.6);
      pad && pad.set({ gain: (.03 + .3 * padLevel) * Math.min(1, amp * 2.2), lp: 260 + 1100 * padLevel }, .1);

      post.begin();
      kit.draw(prog, { res: [W, H], cam: camNow, fw, up, rt, balls, glow, fov, rad, barY, time: t });
      post.end({ exposure: 1.1, bloom: .06 + padLevel * .03, dof: .55, dofY: .55, dofW: .38, vig: .85, grain: .018 }, dt);
    },
    destroy() { bus && bus.destroy(); },
  };
}
