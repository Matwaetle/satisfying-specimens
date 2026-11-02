// Bubble-net hunt. Ring a shoal with a curtain of bubbles; the ring tightens and a humpback comes up through it.
import { bubble, waterDrop, bubbleLoop, whaleCall, breachSplash, jawThud, gleam, brownLoop, waterLoop, rng } from '../core/synth.js';

const FISH_V = `#version 300 es
in vec4 a; in vec2 b; uniform vec2 asp; uniform float t; out vec2 q; out float flash; out float deep;
void main(){ vec2 c=vec2(gl_VertexID&1,(gl_VertexID>>1)&1)*2.-1.; q=c;
  vec2 lc=c*vec2(.0088,.0029)*b.x*(.8+.35*fract(b.y*7.)); vec2 w=a.xy+vec2(lc.x*a.z-lc.y*a.w,lc.x*a.w+lc.y*a.z);
  // Silver sides catch the sun only at one heading, so turns travel through the shoal as a flash.
  float g=dot(a.zw,normalize(vec2(.62,.78))); flash=pow(.5+.5*g,18.)+pow(.5+.5*sin(a.x*9.+a.y*7.+t*1.7+b.y*2.),10.)*.22;
  deep=fract(b.y*3.1); gl_Position=vec4(w/(asp*.5),0.,1.); }`;
const FISH_F = /* glsl */ `in vec2 q; in float flash; in float deep; out vec4 o;
void main(){ float x=q.x; float body=.82*sqrt(max(0.,1.-pow((x-.12)/.86,2.)));
  float tail=smoothstep(-.62,-1.,x)*(abs(q.y)*1.1-.1+(x+1.)*.3); float w=max(body,tail);
  float e=fwidth(q.y)+.02; float a=smoothstep(w+e,w-e,abs(q.y));
  if(a<=.002) discard;
  vec3 c=mix(vec3(.30,.42,.50),vec3(.72,.82,.88),smoothstep(.6,-.6,q.y));
  c=c*(.13+.13*(1.-deep))+vec3(1.,1.04,1.08)*flash*1.05; c=mix(c,vec3(.006,.05,.08),deep*.5);
  o=vec4(c*a,a); }`;
const FOAM_V = `#version 300 es
in vec4 a; in float k; uniform vec2 asp; out vec2 q; out float al; out float kind;
void main(){ vec2 c=vec2(gl_VertexID&1,(gl_VertexID>>1)&1)*2.-1.; q=c; al=a.w; kind=k; gl_Position=vec4((a.xy+c*a.z)/(asp*.5),0.,1.); }`;
const FOAM_F = /* glsl */ `in vec2 q; in float al; in float kind; out vec4 o;
void main(){ float d=length(q); if(d>1.) discard;
  float rim=smoothstep(1.,.82,d)*smoothstep(.45,.82,d), fill=.13*smoothstep(1.,.5,d), spec=smoothstep(.3,.0,length(q-vec2(-.34,.36)));
  float b=mix(rim*.72+fill+spec*.9,smoothstep(1.,.2,d),kind);
  vec3 c=vec3(.86,.96,1.)*(1.+kind*.2); o=vec4(c*b*al,b*al*.7); }`;
const SEA = /* glsl */ `in vec2 v; out vec4 o; uniform vec2 asp,fc; uniform float t,foam,fr;
float ridge(vec2 p){ return 1.-abs(2.*fbm(p)-1.); }
void main(){ vec2 p=(v-.5)*asp; vec2 w=p;
  float dc=length(p-fc); if(foam>.001){ float wv=sin((dc-fr)*40.)*exp(-pow((dc-fr)*7.,2.))*foam; w+=normalize(p-fc+1e-4)*wv*.022; }
  vec2 wr=vec2(fbm(w*2.1+t*.07),fbm(w*2.1-t*.06+4.));
  float ca=pow(ridge(w*3.4+wr*1.7+t*.05),9.)*.8+pow(ridge(w*6.3-wr*2.2-t*.06+7.),12.)*.45;
  float light=smoothstep(1.5,.0,length(p-vec2(.25,.35)));
  vec3 c=mix(vec3(.002,.012,.03),vec3(.005,.05,.085),light);
  c+=vec3(.012,.06,.07)*ca*(.3+.7*light);
  if(foam>.001){ float lace=pow(ridge(p*11.+wr*3.+t*.25),5.)+.55*pow(ridge(p*27.-wr*2.-t*.2),6.);
    float band=exp(-pow((dc-fr)*4.5,2.));
    float f=smoothstep(.3,.85,lace)*band*foam*.85;
    c=mix(c,vec3(.62,.72,.76),clamp(f,0.,.9)); }
  o=vec4(c,1.); }`;
const WHALE = /* glsl */ `in vec2 v; out vec4 o; uniform vec2 asp,c,dir; uniform float S,open,fog,t,wet;
float ell(vec2 p,vec2 r){ return length(p/r)-1.; }
void main(){ vec2 d=((v-.5)*asp-c)/S; vec2 l=vec2(d.x*dir.y-d.y*dir.x,d.x*dir.x+d.y*dir.y);
  float aa=.012+fog*.34;
  // Body runs away behind the head and tapers toward the flukes.
  float wid=l.y>-.2?.37*sqrt(max(0.,1.-pow((l.y+.2)/.86,2.))):mix(.37,.09,smoothstep(-.2,-2.7,l.y));
  float body=smoothstep(aa,-aa,abs(l.x)-wid)*smoothstep(-3.1,-2.6,l.y)*smoothstep(0.,.03,wid);
  vec3 skin=vec3(.004,.006,.009)*(1.+1.6*fbm(l*5.))+vec3(.006,.011,.014)*pow(max(0.,1.-abs(l.x)/(wid+.001)),2.);
  vec3 col=skin; float alpha=body;
  // Lower jaw balloons out as the throat fills.
  vec2 jp=l-vec2(0.,.2*open); vec2 jr=mix(vec2(.36,.62),vec2(.54,.74),open);
  float jaw=ell(jp,jr); float jm=smoothstep(aa,-aa,jaw*.55);
  float pleat=.5+.5*sin(atan(l.x,l.y+1.25)*88.+fbm(l*4.)*2.);
  vec3 under=mix(vec3(.02,.022,.025),vec3(.17,.17,.165),pow(pleat,1.6)*(.45+.55*smoothstep(-.1,-.8,jaw)));
  col=mix(col,under*(.55+.45*open),jm*open); alpha=max(alpha,jm);
  // Inside of the mouth: wet dark red, with the tongue rising in the middle.
  vec2 mr=vec2(.46,.64)*open+1e-3; float mo=ell(jp,mr); float mm=smoothstep(.02+aa,-.02-aa,mo*.5)*step(.02,open);
  float tg=smoothstep(1.,.15,length((jp-vec2(0.,-.1))/(mr*vec2(.6,.72))));
  vec3 inner=mix(vec3(.012,.002,.003),vec3(.2,.045,.05),tg*(.55+.45*fbm(l*9.)));
  col=mix(col,inner,mm);
  // Rostrum tips back while feeding and slides forward over the mouth to close.
  vec2 rc=mix(vec2(0.,.1),vec2(0.,-.46),open), rr=mix(vec2(.34,.6),vec2(.34,.2),open);
  float ro=ell(l-rc,rr); float rm=smoothstep(aa,-aa,ro*.45);
  // Baleen hangs from the rostrum's edge as a pale comb.
  float bl=smoothstep(.13,.0,ro)*smoothstep(-.01,.02,ro)*step(rc.y,l.y)*open;
  float comb=.5+.5*sin(l.x*210.); col=mix(col,mix(vec3(.3,.25,.17),vec3(.8,.73,.56),comb),bl*(1.-fog));
  alpha=max(alpha,bl);
  vec3 N=normalize(vec3((l-rc)/rr*.9+(vec2(fbm(l*11.),fbm(l*11.+3.))-.5)*.6,1.));
    vec3 top=vec3(.004,.006,.009)*(1.+1.5*fbm(l*6.))+vec3(.05,.06,.07)*pow(max(dot(N,normalize(vec3(.3,.5,.8))),0.),26.)*wet;
  float bumps=smoothstep(.9,.97,vnoise(l*30.))*step(rc.y-.2,l.y); top+=vec3(.035,.038,.035)*bumps;
  col=mix(col,top,rm); alpha=max(alpha,rm);
  // Water still sheeting off the skin at the surface.
  float sheet=smoothstep(.66,.8,fbm(l*vec2(26.,6.)+vec2(0.,t*1.7)))*wet*(1.-mm); col=mix(col,vec3(.2,.27,.3),sheet*.5*alpha);
  col=mix(col,vec3(.006,.07,.105),fog);
  float a=alpha*(1.-fog*.42);
  o=vec4(col*a,a); }`;

export function create(env) {
  const { kit, gl, post, input, audio, seed, quality } = env;
  const pFish = kit.program(FISH_F, FISH_V), pFoam = kit.program(FOAM_F, FOAM_V), pSea = kit.program(SEA), pWhale = kit.program(WHALE);
  const bus = audio && audio.bus({ gain: 1, send: .22 });
  let snd = {}, curtain, wash, rumble;
  if (bus) {
    const sr = bus.sr;
    snd.blub = Array.from({ length: 12 }, (_, i) => bus.buffer(bubble(sr, 380 + i * 95, { rise: 1.2, tau: .03 + i * .002, seed: seed + i, impact: .08 })));
    snd.drop = Array.from({ length: 8 }, (_, i) => bus.buffer(waterDrop(sr, seed + 30 + i)));
    snd.call = bus.buffer(whaleCall(sr, seed));
    snd.splash = bus.buffer(breachSplash(sr, seed));
    snd.jaw = bus.buffer(jawThud(sr, seed));
    snd.chime = bus.buffer(gleam(sr, seed));
    curtain = bus.loop(bus.buffer(bubbleLoop(sr, seed)), { gain: 0, hp: 240, lp: 7000, send: .24 });
    wash = bus.loop(bus.buffer(waterLoop(sr, 71)), { gain: 0, hp: 500, lp: 6000, send: .1 });
    rumble = bus.loop(bus.buffer(brownLoop(sr, 19)), { gain: 0, hp: 40, lp: 300, send: .05 });
  }
  const r = rng(seed);
  const N = quality === 'low' ? 1500 : 2800, MP = 2600, MAXPTS = 420;
  const x = new Float32Array(N), y = new Float32Array(N), vx = new Float32Array(N), vy = new Float32Array(N);
  const alive = new Uint8Array(N), trapped = new Uint8Array(N), size = new Float32Array(N), hash = new Float32Array(N);
  const nxt = new Int32Array(N); let head = new Int32Array(1), gw = 1, gh = 1;
  const pNext = new Int32Array(MAXPTS); let pHead = new Int32Array(1);
  const fishData = new Float32Array(N * 6), foamData = new Float32Array(MP * 5);
  const px = new Float32Array(MP), py = new Float32Array(MP), pvx = new Float32Array(MP), pvy = new Float32Array(MP), pr = new Float32Array(MP), pl = new Float32Array(MP), pm = new Float32Array(MP), pk = new Float32Array(MP);
  let pCursor = 0;

  function instanced(prog, buffer, bytes, attrs, stride) {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, bytes, gl.DYNAMIC_DRAW);
    for (const [name, n, off] of attrs) { const l = gl.getAttribLocation(prog.h, name); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, n, gl.FLOAT, false, stride, off); gl.vertexAttribDivisor(l, 1); }
    gl.bindVertexArray(null);
    return vao;
  }
  const fishBuf = gl.createBuffer(), foamBuf = gl.createBuffer();
  const fishVao = instanced(pFish, fishBuf, fishData.byteLength, [['a', 4, 0], ['b', 2, 16]], 24);
  const foamVao = instanced(pFoam, foamBuf, foamData.byteLength, [['a', 4, 0], ['k', 1, 16]], 20);
  kit.owned.push({ vao: fishVao, buffer: fishBuf }, { vao: foamVao, buffer: foamBuf });

  let asp = [0, 0], time = 0;
  let phase = 'idle', phaseT = 0, foam = 0, fr = 0;
  let pts = [], drawId = null, fade = 0, emitAcc = 0, lastBlubT = 0;
  const finger = { x: 0, y: 0, on: 0, t: -9 }, ball = { x: 0, y: 0, R0: 1, R: 1, tR: .1, n: 0 };
  const whale = { x: 0, y: 0, dx: 0, dy: 1, S: .6, open: 0, fog: 1, wet: 0, show: false };
  let speedS = 0, respawn = 0;

  function spawnFish(i, offscreen) {
    if (offscreen) {
      const a = r() * 6.283, R = Math.hypot(asp[0], asp[1]) * .56 + r() * .2;
      x[i] = Math.cos(a) * R; y[i] = Math.sin(a) * R;
      vx[i] = -Math.cos(a) * .25; vy[i] = -Math.sin(a) * .25;
    } else {
      const a = r() * 6.283, R = Math.sqrt(r()) * .36;
      x[i] = Math.cos(a) * R * Math.min(1.5, asp[0]); y[i] = Math.sin(a) * R; const h = r() * 6.283; vx[i] = Math.cos(h) * .12; vy[i] = Math.sin(h) * .12;
    }
    alive[i] = 1; trapped[i] = 0; size[i] = 1; hash[i] = r();
  }
  const local = p => [(p.x - .5) * asp[0], (p.y - .5) * asp[1]];
  function puff(ax, ay, kind, rad, life, ovx = 0, ovy = 0) {
    const i = pCursor; pCursor = (pCursor + 1) % MP;
    px[i] = ax; py[i] = ay; pvx[i] = ovx; pvy[i] = ovy; pr[i] = rad; pl[i] = pm[i] = life; pk[i] = kind;
  }
  const blub = (ax, g) => { if (bus) bus.play(snd.blub[Math.floor(r() * 12)], { gain: g, rate: .85 + r() * .5, pan: ax / asp[0] * 1.1 }); };
  function area(list) { let s = 0; for (let i = 0; i < list.length; i++) { const a = list[i], b = list[(i + 1) % list.length]; s += a.x * b.y - b.x * a.y; } return Math.abs(s) * .5; }
  function inside(list, ax, ay) { let c = false; for (let i = 0, j = list.length - 1; i < list.length; j = i++) { const a = list[i], b = list[j]; if ((a.y > ay) !== (b.y > ay) && ax < (b.x - a.x) * (ay - a.y) / (b.y - a.y) + a.x) c = !c; } return c; }

  function rehash() {
    if (pHead.length !== head.length) pHead = new Int32Array(head.length);
    pHead.fill(-1);
    const c = .05;
    pts.forEach((q, i) => { const k = cell(q.x, q.y, c); pNext[i] = pHead[k]; pHead[k] = i; });
  }
  function cell(ax, ay, c) { const gx = Math.max(0, Math.min(gw - 1, Math.floor((ax + asp[0] * .75) / c))), gy = Math.max(0, Math.min(gh - 1, Math.floor((ay + asp[1] * .75) / c))); return gy * gw + gx; }

  function tryClose(from) {
    const loop = pts.slice(from);
    if (loop.length < 20 || area(loop) < .045) return false;
    let cx = 0, cy = 0; for (const q of loop) { cx += q.x; cy += q.y; } cx /= loop.length; cy /= loop.length;
    let n = 0, R = 0;
    for (let i = 0; i < N; i++) { trapped[i] = alive[i] && inside(loop, x[i], y[i]) ? 1 : 0; n += trapped[i]; }
    if (n < 12) return false;
    for (const q of loop) { q.a = Math.atan2(q.y - cy, q.x - cx); R = Math.max(R, Math.hypot(q.x - cx, q.y - cy)); }
    pts = loop; drawId = null; fade = 0;
    ball.x = cx; ball.y = cy; ball.R0 = ball.R = R; ball.n = n; ball.tR = Math.min(.2, Math.max(.055, Math.sqrt(n) * .0046));
    phase = 'tighten'; phaseT = 0;
    if (bus) bus.play(snd.chime, { gain: .22 });
    env.buzz(14);
    return true;
  }
  function addPoint(ax, ay) {
    const last = pts[pts.length - 1];
    if (last && Math.hypot(ax - last.x, ay - last.y) < .017) return;
    if (pts.length >= MAXPTS) pts.shift();
    pts.push({ x: ax, y: ay, a: 0 }); rehash();
    for (let j = 0; j < pts.length - 26; j++) if (Math.hypot(pts[j].x - ax, pts[j].y - ay) < .05 && tryClose(j)) return;
  }
  const canDraw = () => phase === 'idle';
  input.on({
    down(p) { const l = local(p); finger.x = l[0]; finger.y = l[1]; finger.on = 1; if (canDraw()) { drawId = p.id; pts = []; fade = 0; addPoint(l[0], l[1]); env.buzz(6); } },
    move(p) { const l = local(p); finger.x = l[0]; finger.y = l[1]; finger.t = time; if (drawId === p.id) addPoint(l[0], l[1]); },
    up(p) {
      finger.on = 0;
      if (drawId !== p.id) return;
      drawId = null;
      // A nearly closed loop counts: nobody draws a perfect circle with a thumb.
      if (pts.length > 20 && Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) < .24 && tryClose(0)) return;
      fade = 1;
    },
  });

  function stepFish(dt) {
    const c = .05, keepV = phase === 'breach' || phase === 'close';
    const nw = Math.ceil(asp[0] * 1.5 / c) + 1, nh = Math.ceil(asp[1] * 1.5 / c) + 1;
    if (nw !== gw || nh !== gh) { gw = nw; gh = nh; head = new Int32Array(gw * gh); rehash(); }
    head.fill(-1);
    for (let i = 0; i < N; i++) { if (!alive[i]) continue; const k = cell(x[i], y[i], c); nxt[i] = head[k]; head[k] = i; }
    // The shoal idles around a slow wandering point so it stays in reach.
    const gx = Math.sin(time * .19 + seed) * asp[0] * .2, gy = Math.cos(time * .15 + seed * 2) * asp[1] * .16;
    const closing = phase !== 'idle' && phase !== 'sink';
    let sum = 0, live = 0;
    for (let i = 0; i < N; i++) {
      if (!alive[i]) continue;
      let ax = 0, ay = 0, ali = 0, aly = 0, cox = 0, coy = 0, sx = 0, sy = 0, cn = 0, seen = 0;
      const X = x[i], Y = y[i], T = trapped[i] && closing;
      const hc = cell(X, Y, c), hx = hc % gw, hy = (hc - hx) / gw, sep = T ? .007 : .017;
      for (let oy = -1; oy <= 1 && seen < 9; oy++) for (let ox = -1; ox <= 1 && seen < 9; ox++) {
        const qx = hx + ox, qy = hy + oy; if (qx < 0 || qy < 0 || qx >= gw || qy >= gh) continue;
        for (let j = head[qy * gw + qx]; j >= 0 && seen < 9; j = nxt[j]) {
          if (j === i) continue;
          const dx = x[j] - X, dy = y[j] - Y, q = dx * dx + dy * dy;
          if (q > c * c) continue;
          ali += vx[j]; aly += vy[j]; cox += dx; coy += dy; cn++; seen++;
          if (q < sep * sep && q > 1e-9) { const d = Math.sqrt(q), f = (sep - d) / sep / d; sx -= dx * f; sy -= dy * f; }
        }
      }
      if (cn) { const u = 1 / cn; ax += (ali * u - vx[i]) * 2.4 + cox * u * 7; ay += (aly * u - vy[i]) * 2.4 + coy * u * 7; }
      ax += sx * 2.4; ay += sy * 2.4;
      let maxV = .24, minV = .09;
      if (T) {
        const dx = X - ball.x, dy = Y - ball.y, d = Math.hypot(dx, dy) + 1e-4, nx = dx / d, ny = dy / d;
        if (phase === 'breach' || phase === 'close') {
          // Everything in the ball goes down the throat.
          const pull = 6 + phaseT * 26; ax = -nx * pull; ay = -ny * pull; maxV = 2.4;
          if (d < .05 + phaseT * .1) { alive[i] = 0; continue; }
        } else {
          // Inside the ring they mill: tangent speed plus a wall that keeps moving in.
          const over = d - ball.R * .9; if (over > 0) { ax -= nx * over * 95; ay -= ny * over * 95; maxV = .6; }
          const home = ball.R * .86 * Math.sqrt(hash[i]), pull = (d - home) * 26; ax += -ny * 1.5 - nx * pull; ay += nx * 1.5 - ny * pull;
          minV = .15; maxV = Math.max(maxV, .34);
        }
      } else {
        ax += (gx - X) * .22; ay += (gy - Y) * .22;
        if (closing && !keepV) { const dx = X - ball.x, dy = Y - ball.y, d = Math.hypot(dx, dy) + 1e-4, over = ball.R + .06 - d; if (over > 0) { ax += dx / d * over * 44; ay += dy / d * over * 44; maxV = .6; } }
        if (whale.show && whale.fog < .8) { const dx = X - whale.x, dy = Y - whale.y, d = Math.hypot(dx, dy) + 1e-4, over = whale.S * 1.05 - d; if (over > 0) { ax += dx / d * over * 18; ay += dy / d * over * 18; maxV = .9; } }
        const fx = X - finger.x, fy = Y - finger.y, fd = Math.hypot(fx, fy) + 1e-4;
        if (fd < .2 && (finger.on || time - finger.t < .5)) { const f = (1 - fd / .2); ax += fx / fd * f * f * 16; ay += fy / fd * f * f * 16; maxV = .72; }
        // Bubble curtain: fish turn back from any wall of bubbles still in the water.
        if (pts.length && !closing) {
          const hh = cell(X, Y, c), bx = hh % gw, by = (hh - bx) / gw;
          for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
            const qx = bx + ox, qy = by + oy; if (qx < 0 || qy < 0 || qx >= gw || qy >= gh) continue;
            for (let j = pHead[qy * gw + qx]; j >= 0; j = pNext[j]) { const q = pts[j], dx = X - q.x, dy = Y - q.y, d = Math.hypot(dx, dy) + 1e-4; if (d < .05) { ax += dx / d * (1 - d / .05) * 5; ay += dy / d * (1 - d / .05) * 5; } }
          }
        }
        const lx = asp[0] * .46, ly = asp[1] * .46;
        if (Math.abs(X) > lx) ax -= Math.sign(X) * (Math.abs(X) - lx) * 12;
        if (Math.abs(Y) > ly) ay -= Math.sign(Y) * (Math.abs(Y) - ly) * 12;
      }
      vx[i] += ax * dt; vy[i] += ay * dt;
      const v = Math.hypot(vx[i], vy[i]) + 1e-5, cl = v > maxV ? maxV / v : v < minV ? minV / v : 1;
      vx[i] *= cl; vy[i] *= cl;
      x[i] = X + vx[i] * dt; y[i] = Y + vy[i] * dt;
      sum += Math.min(v, maxV); live++;
    }
    return live ? sum / live : 0;
  }
  function stepFoam(dt) {
    let m = 0;
    for (let i = 0; i < MP; i++) {
      if (pl[i] <= 0) { continue; }
      pl[i] -= dt;
      const u = Math.max(0, pl[i] / pm[i]), k = pk[i], drag = Math.exp(-dt * (k ? 3 : 1.5));
      pvx[i] *= drag; pvy[i] *= drag; px[i] += pvx[i] * dt; py[i] += pvy[i] * dt;
      const j = m * 5, grow = k ? .75 + .25 * u : Math.min(1, (1 - u) * 6 + .3) * (1 + (1 - u) * .5);
      foamData[j] = px[i]; foamData[j + 1] = py[i]; foamData[j + 2] = pr[i] * grow; foamData[j + 3] = k ? u * u : Math.min(1, u * 3) * .85; foamData[j + 4] = k;
      m++;
    }
    return m;
  }
  function emitCurtain(dt, rate) {
    emitAcc += rate * dt;
    while (emitAcc > 1 && pts.length) {
      emitAcc--;
      const q = pts[Math.floor(r() * pts.length)], a = r() * 6.283, s = r() * .014;
      let ax = q.x, ay = q.y;
      if (phase === 'tighten' || phase === 'rise') { const m = Math.min(1, phaseMorph * 1.3), ring = Math.min(1, ball.R / ball.R0); ax = ball.x + ((q.x - ball.x) * (1 - m) + Math.cos(q.a) * ball.R0 * m) * ring; ay = ball.y + ((q.y - ball.y) * (1 - m) + Math.sin(q.a) * ball.R0 * m) * ring; }
      puff(ax + Math.cos(a) * s, ay + Math.sin(a) * s, 0, .0035 + Math.pow(r(), 3) * .012, .5 + r() * .95, Math.cos(a) * .014, Math.sin(a) * .014);
    }
  }
  let phaseMorph = 0;
  const ease = u => { u = Math.min(1, Math.max(0, u)); return u * u * (3 - 2 * u); };
  const go = n => { phase = n; phaseT = 0; };
  function startWhale() {
    const lim = [asp[0] / 2 - .24, asp[1] / 2 - .24];
    ball.x = Math.max(-lim[0], Math.min(lim[0], ball.x)); ball.y = Math.max(-lim[1], Math.min(lim[1], ball.y));
    const a = r() * 6.283;
    Object.assign(whale, { x: ball.x, y: ball.y, dx: Math.cos(a), dy: Math.sin(a), S: Math.min(Math.min(asp[0], asp[1]) * .52, Math.max(.36, ball.tR * 3.1)), open: 0, fog: 1, wet: 0, show: true });
    if (bus) bus.play(snd.call, { gain: .7 });
  }
  function breach() {
    foam = 1; fr = whale.S * .8; whale.wet = 1;
    for (let k = 0; k < 760; k++) {
      const a = r() * 6.283, R = whale.S * (.42 + r() * .5), sp = .1 + Math.pow(r(), 2.2) * 1.5;
      puff(whale.x + Math.cos(a) * R, whale.y + Math.sin(a) * R, 1, .0018 + Math.pow(r(), 3) * .007, .45 + r() * 1.1, Math.cos(a) * sp, Math.sin(a) * sp);
    }
    if (bus) {
      bus.play(snd.splash, { gain: .95 });
      for (let k = 0; k < 16; k++) bus.play(snd.drop[Math.floor(r() * 8)], { gain: .1 + r() * .2, rate: .85 + r() * .5, pan: (r() - .5) * 1.3, delay: .4 + r() * 1.5 });
    }
    env.buzz(45);
  }
  function resetAll() {
    for (let i = 0; i < N; i++) spawnFish(i, false);
    pts = []; drawId = null; fade = 0; phase = 'idle'; whale.show = false; foam = 0; pl.fill(0); respawn = 0;
  }
  let attractOn = false;
  return {
    resize(w, h) { const first = !asp[0]; asp = w > h ? [w / h, 1] : [1, h / w]; if (first) resetAll(); },
    reset: resetAll,
    attract(t) {
      const u = (t % 11) / 11, id = 6, on = u > .08 && u < .42, a = (u - .08) / .34 * 6.5 + .5;
      const R = .3, p = { id, x: .5 + Math.cos(a) * R / asp[0] * 1.2, y: .5 + Math.sin(a) * R / asp[1], pressed: true };
      if (on && !attractOn) { attractOn = true; input.emit('down', p); }
      if (on) input.emit('move', p);
      if (!on && attractOn) { attractOn = false; input.emit('up', { ...p, pressed: false }); }
    },
    frame(t, dt) {
      time = t; dt = Math.min(dt, 1 / 30); phaseT += dt;
      const tighten = phase === 'tighten' || phase === 'rise';
      if (phase === 'tighten') {
        phaseMorph = ease(phaseT / .7); ball.R = ball.R0 + (ball.tR - ball.R0) * ease(phaseT / 1.8);
        if (phaseT > .9) { startWhale(); go('rise'); }
      } else if (phase === 'rise') {
        const u = (phaseT + .9) / 1.8; ball.R = ball.R0 + (ball.tR - ball.R0) * ease(u);
        whale.open = ease(phaseT / 1.1); whale.fog = 1 - ease(phaseT / 1.2) * .92; whale.wet = 0;
        if (phaseT > 1.25) { breach(); go('breach'); }
      } else if (phase === 'breach') {
        whale.open = 1; whale.fog = .02;
        if (phaseT > .52) { go('close'); if (bus) bus.play(snd.jaw, { gain: .85 }); env.buzz(25); }
      } else if (phase === 'close') {
        whale.open = 1 - ease(phaseT / .42); whale.fog = .02;
        if (phaseT > .62) { for (let i = 0; i < N; i++) if (trapped[i]) { alive[i] = 0; trapped[i] = 0; } pts = []; respawn = 1; go('sink'); }
      } else if (phase === 'sink') {
        whale.fog = ease(phaseT / 1.9); whale.wet = Math.max(0, 1 - phaseT * 1.8); whale.S *= 1 - dt * .05;
        if (phaseT > 2) { whale.show = false; go('idle'); }
      }
      if (respawn) { let n = 0; for (let i = 0; i < N && n < 24; i++) if (!alive[i]) { spawnFish(i, true); n++; } if (!n) respawn = 0; }
      const sp = stepFish(dt);
      if (tighten || drawId !== null) emitCurtain(dt, tighten ? 340 : Math.min(420, pts.length * 7));
      else if (fade > 0) { fade -= dt / 1.8; emitCurtain(dt, 170 * Math.max(0, fade)); if (fade <= 0) { pts = []; rehash(); } }
      const m = stepFoam(dt);
      foam *= Math.exp(-dt * .75); if (foam < .005) foam = 0; fr += dt * (.34 + foam * .6);

      if (bus) {
        speedS += (Math.min(1, sp / .5) - speedS) * Math.min(1, dt * 5);
        const bubbling = drawId !== null || tighten ? 1 : Math.max(0, fade) * .6;
        curtain.set({ gain: .62 * bubbling, rate: tighten ? 1 + (1 - ball.R / ball.R0) * .32 : 1 }, .06);
        wash.set({ gain: .05 + .22 * speedS + foam * .5, lp: 2400 + 4200 * foam }, .08);
        const rise = phase === 'rise' ? ease(phaseT / 1.25) : phase === 'tighten' ? ease(phaseT / .9) * .15 : 0;
        rumble.set({ gain: rise * .72 + foam * .3, lp: 140 + rise * 320 }, .05);
        if (drawId !== null && t - lastBlubT > .05 + r() * .09) { lastBlubT = t; blub(finger.x, .08 + r() * .15); }
      }
            for (let i = 0; i < N; i++) {
        const j = i * 6;
        if (!alive[i]) { fishData[j + 4] = 0; continue; }
        const v = Math.hypot(vx[i], vy[i]) + 1e-5;
        fishData[j] = x[i]; fishData[j + 1] = y[i]; fishData[j + 2] = vx[i] / v; fishData[j + 3] = vy[i] / v; fishData[j + 4] = size[i]; fishData[j + 5] = hash[i];
      }
      post.begin();
      kit.draw(pSea, { asp, t, foam, fc: [whale.x, whale.y], fr });
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      if (whale.show) kit.draw(pWhale, { asp, c: [whale.x, whale.y], dir: [whale.dx, whale.dy], S: whale.S, open: whale.open, fog: whale.fog, t, wet: whale.wet });
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.bindBuffer(gl.ARRAY_BUFFER, fishBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, fishData);
      kit.use(pFish, { asp, t }); gl.bindVertexArray(fishVao); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, N);
      if (m) {
        gl.bindBuffer(gl.ARRAY_BUFFER, foamBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, foamData.subarray(0, m * 5));
        kit.use(pFoam, { asp }); gl.bindVertexArray(foamVao); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, m);
      }
      gl.bindVertexArray(null);
      gl.disable(gl.BLEND);
      post.end({ exposure: 1.15, bloom: .1, vig: .7, grain: .011 }, dt);
    },
    destroy() { bus && bus.destroy(); },
  };
}
