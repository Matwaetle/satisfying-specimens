// Protective film. Pull from a corner and the hazy skin folds back off a flawless surface.
import { peelLoop, rustle, gleam, tick, rng } from '../core/synth.js';

const MASK = /* glsl */ `in vec2 v; out vec4 o; uniform sampler2D m; uniform vec2 asp,fm,fn; void main(){ vec2 p=(v-.5)*asp; float f=dot(p-fm,fn); o=vec4(max(texture(m,v).r,step(f,0.)),0.,0.,1.); }`;
const SHADE = /* glsl */ `in vec2 v; out vec4 o; uniform sampler2D m,label; uniform vec2 asp,hs,fm,fn,lp; uniform float surf,gone,sweep,time,seed;
float rbox(vec2 p,vec2 b,float r){ vec2 q=abs(p)-b+r; return length(max(q,0.))+min(max(q.x,q.y),0.)-r; }
vec3 hsv(float h){ return clamp(abs(mod(h*6.+vec3(0.,4.,2.),6.)-3.)-1.,0.,1.); }
// The prize: what the film has been protecting.
vec3 surface(vec2 p,vec3 N){
  vec3 Rf=reflect(vec3(0.,0.,-1.),N); vec3 Ry=normalize(vec3(Rf.x+p.x*.45+lp.x*.22,Rf.z,-Rf.y-p.y*.45-lp.y*.22)); vec3 env=studio(Ry);
  if(surf<.5){ // Piano lacquer with one gold line.
    float gl=smoothstep(.0035,.0015,abs(rbox(p,hs*.82,.03))); return vec3(.006)+env*.09+vec3(.9,.66,.28)*gl*(.34+env*.3); }
  if(surf<1.5){ // Brushed copper: the highlight stretches across the grain.
    float gr=fbm(vec2(p.x*2.,p.y*620.))-.5; vec3 n2=normalize(N+vec3(0.,gr*.34,0.)); vec3 R2=reflect(vec3(0.,0.,-1.),n2); vec3 e2=studio(normalize(vec3(R2.x*.25+p.x*.2+lp.x*.25,R2.z,-R2.y-p.y*.5-lp.y*.2)));
    return vec3(.86,.45,.28)*(e2*.32+.035); }
  if(surf<2.5){ // Diffraction foil: colour is angle.
    float a=dot(p-lp*.4,vec2(.8,.6))*5.+fbm(p*2.+seed)*.8; vec3 h=hsv(fract(a)); float g=.5+.5*sin(length(p-lp*.5)*50.);
    return h*(.1+.26*g)+env*.05; }
  // Mirror steel with concentric spin marks.
  float rr=length(p); float gr=fbm(vec2(rr*420.,atan(p.y,p.x)*2.))-.5; vec3 tn=vec3(p.xy/max(rr,.001)*gr*.12,0.); vec3 R2=reflect(vec3(0.,0.,-1.),normalize(N+tn));
  return vec3(.72,.74,.78)*studio(normalize(vec3(R2.x+p.x*.45,R2.z,-R2.y-p.y*.45)))*.3+.014; }
void main(){
  vec2 p=(v-.5)*asp; vec3 col=vec3(.012,.011,.012)*(.8+.4*smoothstep(1.2,0.,length(p)));
  float dPanel=rbox(p,hs,.022);
  // Panel's own contact shadow on the desk.
  col*=mix(1.,.45,smoothstep(.05,.0,dPanel));
  vec3 N=vec3((vnoise(p*2.)-.5)*.02,(vnoise(p*2.+7.)-.5)*.02,1.); N=normalize(N);
  if(dPanel<0.){ col=surface(p,N); float be=smoothstep(-.006,0.,dPanel); col=mix(col,vec3(.16,.16,.17),be*.8);
    col+=vec3(1.,.97,.92)*exp(-pow((p.x*.7+p.y-sweep)*6.,2.))*.26; }
  float f=dot(p-fm,fn); bool ok=true;
  float mk=texture(m,v).r; vec2 q=p;
  float film=(dPanel<0.&&f>0.&&mk<.5&&gone<.5)?1.:0.;
  if(film>0.){
    // Milky skin: the surface shows through dulled, lit in soft patches, with trapped air.
    vec3 thru=mix(col,vec3(.13,.14,.15),.66)*.8;
    vec2 g=p*16.; vec2 id=floor(g); vec2 ctr=hash2(id+seed)*.7+.15; float rr=.08+.2*hash(id+9.); float dB=length(fract(g)-ctr)/rr; float bb=step(.7,hash(id+3.))*smoothstep(1.,.75,dB)*.5;
    vec3 Nf=normalize(vec3((vnoise(p*7.)-.5)*.12+(bb>0.?(fract(g)-ctr)/rr*.62*bb:vec2(0.)),1.));
    vec3 Rf=reflect(vec3(0.,0.,-1.),Nf); vec3 env=studio(normalize(vec3(Rf.x+p.x*.45+lp.x*.1,Rf.z,-Rf.y-p.y*.45)));
    vec3 fc=thru+min(env,vec3(1.6))*.05+vec3(.05,.052,.056)*(.5+.5*vnoise(p*30.));
    float tx=texture(label,p*1.5+vec2(.3,.1)).r; fc=mix(fc,vec3(.42,.44,.46),tx*.2);
    // Shadow where the skin curves up to the fold.
    fc*=1.-.42*smoothstep(.05,.0,f);
    col=fc;
  }
  // Flap: the film reflected across the fold line, its underside toward us.
  if(f>0.&&gone<.5){ vec2 rf=p-2.*f*fn; float dRef=rbox(rf,hs,.022);
    if(dRef<0.&&dot(rf-fm,fn)<0.){
      float curl=exp(-f*f/(.045*.045)); float roll=smoothstep(.1,.0,f);
      vec3 Nf=normalize(vec3(fn*(1.-f/.12)*roll*1.25+vec2(vnoise(rf*6.)-.5,vnoise(rf*6.+4.)-.5)*.1,1.));
      vec3 Rf=reflect(vec3(0.,0.,-1.),Nf); vec3 env=studio(normalize(vec3(Rf.x+p.x*.3,Rf.z,-Rf.y-p.y*.3)));
      vec3 back=vec3(.24,.25,.27)*(.25+.55*smoothstep(.0,.5,f))+min(env,vec3(3.))*.1+vec3(1.)*curl*.22;
      float edge=smoothstep(-.005,.0,dRef); back=mix(back,vec3(.9),edge*.5);
      col=back; } else {
      // Soft drop shadow from the flap on whatever is beneath it.
      vec2 sh=p-vec2(.016,-.022); float sf=dot(sh-fm,fn); if(sf>0.){ vec2 rs=sh-2.*sf*fn; if(rbox(rs,hs,.022)<.012&&dot(rs-fm,fn)<0.) col*=.58; } } }
  o=vec4(col,1.);
}`;

export function create(env) {
  const { kit, gl, post, input, audio, seed, quality } = env;
  const pM = kit.program(MASK), pS = kit.program(SHADE);
  const bus = audio && audio.bus({ gain: 1, send: .12 });
  let crack, crack2, snd = {};
  if (bus) {
    const sr = bus.sr;
    crack = bus.loop(bus.buffer(peelLoop(sr, 7)), { gain: 0, hp: 1100, lp: 9000, send: .06 });
    crack2 = bus.loop(bus.buffer(peelLoop(sr, 13, 3)), { gain: 0, hp: 300, lp: 3200, rate: .5, send: .08 });
    snd.pops = [0, 1, 2, 3, 4, 5].map(i => bus.buffer(tick(sr, 1700 + i * 520, 40 + i)));
    snd.fly = bus.buffer(rustle(sr, { dur: .75, density: 1900, seed: 12 }));
    snd.gleam = bus.buffer(gleam(sr, seed & 1023));
  }
  const r = rng(seed);
  // Repeating print, so the skin reads as a real factory film.
  const canvas2d = document.createElement('canvas'); canvas2d.width = canvas2d.height = 512;
  const c2 = canvas2d.getContext('2d'); c2.fillStyle = '#000'; c2.fillRect(0, 0, 512, 512); c2.fillStyle = '#fff'; c2.font = '600 22px "Noto Sans KR",system-ui,sans-serif'; c2.textBaseline = 'middle';
  c2.translate(256, 256); c2.rotate(-.42); c2.translate(-256, -256);
  for (let y = -256, i = 0; y < 800; y += 86, i++) for (let x = -256 + (i % 2) * 150; x < 800; x += 300) c2.fillText('사용 전 벗겨주세요', x, y);
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas2d);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  kit.owned.push({ tex });

  let W = 2, H = 2, asp = [1, 1], hs = [.4, .4], mask = null;
  let surf = (seed >>> 0) % 4, corner = null, P = [0, 0], tgt = [0, 0], grab = null, id = null, base = [0, 0], maxLen = 0, state = 'film', T = 0, speedS = 0, popAcc = 0, lp = [0, 0], sweep = 9, peeled = 0;
  const local = p => [(p.x - .5) * asp[0], (p.y - .5) * asp[1]];
  const nearestCorner = l => [l[0] >= 0 ? hs[0] : -hs[0], l[1] >= 0 ? hs[1] : -hs[1]];
  function fold() {
    const dx = P[0] - corner[0], dy = P[1] - corner[1], d = Math.hypot(dx, dy) || 1e-4;
    return { fm: [(P[0] + corner[0]) / 2, (P[1] + corner[1]) / 2], fn: [dx / d, dy / d] };
  }
  function clearMask() { for (const t of [mask.read, mask.write]) { gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); } gl.clearColor(0, 0, 0, 0); }
  function fresh() { clearMask(); corner = null; maxLen = 0; state = 'film'; T = 0; sweep = 9; peeled = 0; surf = (surf + 1) % 4; }
  // How much of the panel the fold has already passed, tested at its far corners and centre lines.
  function fraction() {
    if (!corner) return 0; const { fm, fn } = fold(); let n = 0, c = 0;
    for (let j = 0; j < 12; j++) for (let i = 0; i < 12; i++) { const x = ((i + .5) / 12 * 2 - 1) * hs[0], y = ((j + .5) / 12 * 2 - 1) * hs[1]; n++; if ((x - fm[0]) * fn[0] + (y - fm[1]) * fn[1] < 0) c++; }
    return c / n;
  }
  input.on({
    down(p) {
      if (state !== 'film') return; const l = local(p); lp = l; id = p.id;
      if (!corner) { corner = nearestCorner(l); P = [corner[0] - Math.sign(corner[0]) * .012, corner[1] - Math.sign(corner[1]) * .012]; tgt = P.slice(); maxLen = .017; }
      grab = l; base = tgt.slice(); env.buzz(6);
    },
    move(p) {
      const l = local(p); lp = l; if (id !== p.id) return;
      const n = [base[0] + l[0] - grab[0], base[1] + l[1] - grab[1]];
      // The film can never stick back down: the fold only moves on.
      const dx = n[0] - corner[0], dy = n[1] - corner[1], d = Math.hypot(dx, dy) || 1e-4;
      maxLen = Math.max(maxLen, d); const s = Math.max(d, maxLen) / d;
      tgt = [corner[0] + dx * s, corner[1] + dy * s];
    },
    up(p) {
      if (id !== p.id) return; id = null;
      // Past three quarters the rest lets go by itself, the most satisfying part.
      if (state === 'film' && fraction() > .74) state = 'run';
    },
  });
  return {
    resize(w, h) {
      W = w; H = h; const na = w > h ? [w / h, 1] : [1, h / w];
      if (!mask || Math.abs(na[0] / na[1] - asp[0] / asp[1]) > .02) {
        asp = na; hs = [asp[0] * .5 - .05, asp[1] * .5 - .05];
        const m = quality === 'low' ? 640 : 1024;
        mask = kit.double(w >= h ? m : Math.round(m * w / h), w >= h ? Math.round(m * h / w) : m, 'rgba8');
        clearMask(); corner = null; maxLen = 0;
      }
    },
    reset() { id = null; fresh(); },
    attract(t) {
      if (state !== 'film') return;
      const pid = 12, u = Math.min(1, (t % 7) / 5.5), q = { id: pid, x: .92 - u * .7, y: .86 - u * .62, pressed: true };
      if (id !== pid) input.emit('down', q);
      input.emit('move', q);
      if (u >= 1) input.emit('up', q);
    },
    frame(t, dt) {
      T += dt; let v = 0;
      if (corner && state !== 'gone') {
        const k = 1 - Math.exp(-dt * 30);
        if (state === 'run') { const dx = tgt[0] - corner[0], dy = tgt[1] - corner[1], d = Math.hypot(dx, dy) || 1; tgt = [tgt[0] + dx / d * dt * 5.5, tgt[1] + dy / d * dt * 5.5]; }
        const ox = P[0], oy = P[1];
        P[0] += (tgt[0] - P[0]) * k; P[1] += (tgt[1] - P[1]) * k;
        v = Math.hypot(P[0] - ox, P[1] - oy) / Math.max(dt, .001);
        const { fm, fn } = fold();
        kit.draw(pM, { m: mask.read, asp, fm, fn }, mask.write); mask.swap();
        peeled = fraction();
        if (peeled > .995) {
          state = 'gone'; T = 0; sweep = -asp[0] * .7 - asp[1];
          if (bus) { bus.play(snd.fly, { gain: .55 }); bus.play(snd.gleam, { gain: .5, send: .5 }); } env.buzz(28);
        }
      }
      if (state === 'gone') { sweep += dt * 2.5; if (T > 2.6) fresh(); }
      speedS += (Math.min(1, v / 1.5) - speedS) * Math.min(1, dt * 26);
      if (bus) {
        const s = Math.pow(speedS, .6);
        crack.set({ gain: .55 * s, rate: .7 + speedS * .75, hp: 900 + 900 * speedS, lp: 5500 + 4500 * speedS }, .015);
        crack2.set({ gain: .42 * s, rate: .45 + speedS * .35 }, .02);
        // Air pockets snapping as the peel line reaches them.
        popAcc += v * dt * 34;
        while (popAcc > 1) { popAcc -= 1; if (r() < .6) bus.play(snd.pops[Math.floor(r() * 6)], { gain: .05 + r() * .13, rate: .8 + r() * .6, pan: (P[0] / asp[0]) * .9, delay: r() * .02 }); }
      }
      post.begin();
      const { fm, fn } = corner ? fold() : { fm: [99, 99], fn: [-1, 0] };
      kit.draw(pS, { m: mask.read, label: tex, asp, hs, fm, fn, lp: [lp[0] * .5 + .1 * Math.sin(t * .3), lp[1] * .5], surf, gone: state === 'gone' ? 1 : 0, sweep, time: t, seed: (seed % 37) * .31 });
      post.end({ exposure: 1.1, bloom: .08, vig: .55, grain: .012 }, dt);
    },
    destroy() { bus && bus.destroy(); },
  };
}
