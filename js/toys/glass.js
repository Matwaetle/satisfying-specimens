// No.02 Tempered glass. Lean on the pane until it lets go, all of it, at once.
import { rng, tick, paneBreak, glassRain, rustle } from '../core/synth.js';
import { meshVAO } from '../core/gl.js';
import { voronoiCells, fanVertices } from '../core/fracture.js';
import { CITY } from '../core/scenes.js';

const VS = /* glsl */ `#version 300 es
in vec2 a_p,a_c,a_r; in float a_e;
uniform vec2 size,imp; uniform float t,front,hang,drain,slide;
out vec2 w,uv; out vec3 n; out float e,crk,fall,rr;
void main(){
  vec2 c=a_c; float d=length(c-imp);
  crk=smoothstep(front,front-.035,d);
  float H=size.y;
  float delay=hang+(H*.5-c.y)*.72+d*.14+a_r.x*.3;
  float td=t>0.?max(t-delay,0.):0.;
  fall=td>0.?1.:0.;
  const float g=4.2;
  float rest=-H*.5+.012+.17*a_r.y*a_r.y+.035*sin(c.x*7.);
  float tL=sqrt(max(2.*(c.y-rest),0.)/g);
  float tm=min(td,tL);
  float vx=(a_r.x-.5)*.4+(c.x-imp.x)*.1;
  float yc=c.y-.5*g*tm*tm; float xc=c.x+vx*tm;
  float ang=(a_r.y-.5)*17.*tm;
  float sq=fall>.5?.2+.8*abs(cos(ang*.8+a_r.x*6.)):1.;
  vec2 l=a_p-c; float ca=cos(ang),sa=sin(ang);
  l=vec2(l.x*ca-l.y*sa,l.x*sa+l.y*ca); l.y*=sq;
  // Pre-stress relieved: each die shifts a hair once crazed.
  vec2 od=(c-imp)/max(d,.001);
  vec2 pos=vec2(xc,yc)+l+od*.0016*crk*(1.-fall);
  pos.y+=slide-drain;
  gl_Position=vec4(pos*2./size,0.,1.);
  uv=pos/size+.5; w=a_p; e=a_e; rr=a_r.x;
  vec2 tiltJ=(a_r-.5)*.17*crk+(fall>.5?vec2(sin(ang),cos(ang*1.3))*.7:vec2(0.));
  n=normalize(vec3(tiltJ,1.));
}`;
const FS = /* glsl */ `in vec2 w,uv; in vec3 n; in float e,crk,fall,rr; out vec4 o;
uniform sampler2D scene; uniform vec2 imp; uniform float stress,time;
void main(){
  vec3 Ny=vec3(n.x,n.z,-n.y);
  vec2 dI=w-imp; float bul=exp(-dot(dI,dI)/.03)*stress*.03;
  vec2 ruv=uv+n.xy*.05*crk-dI*bul*2.;
  vec3 c=texture(scene,ruv).rgb;
  // Tempered dice go milky with crazing; the view survives only as colour.
  c*=mix(.93,.66,crk);
  vec3 R=reflect(vec3(0.,-1.,0.),Ny);
  float F=schlick(Ny.y,.05);
  c+=studio(normalize(R+vec3((uv.x-.5)*.5,0.,-(uv.y-.5)*.5)))*F*(.28+crk*.75);
  float edge=(1.-smoothstep(.0,.2,e))*crk;
  float sparkle=.25+.75*pow(rr,3.);
  c+=vec3(.82,.88,.92)*edge*.26*sparkle;
  // Fallen dice are thick glass: dark, cold bodies with hard glints, not windows.
  c=mix(c,c*vec3(.2,.25,.28)+vec3(.012,.016,.02),fall);
  c+=vec3(.9,.95,1.)*pow(max(dot(Ny,normalize(vec3(-.3,1.,.2))),0.),90.)*crk*.8;
  // Intact pane: faint dust and one long reflection.
  float streak=smoothstep(.09,.0,abs(w.x*.75+w.y-.28))*.03+smoothstep(.02,.0,abs(w.x*.75+w.y-.11))*.018;
  c+=vec3(.75,.8,.86)*streak*(1.-crk);
  c+=vec3(.5)*.018*vnoise(w*80.)*(1.-fall);
  o=vec4(c,1.);
}`;
const BLIT = /* glsl */ `in vec2 v; out vec4 o; uniform sampler2D t; uniform float dim; void main(){ o=vec4(texture(t,v).rgb*dim,1.); }`;

export function create(env) {
  const { kit, gl, post, input, ui, audio, quality, seed } = env;
  const prog = kit.program(FS, VS), city = kit.program(CITY), blit = kit.program(BLIT);
  const bus = audio && audio.bus({ gain: 1, send: .2 });
  const snd = {};
  if (bus) {
    const sr = bus.sr;
    snd.creak = Array.from({ length: 8 }, (_, i) => bus.buffer(tick(sr, 1700 + i * 430, 60 + i)));
    snd.brk = [0, 1, 2].map(i => bus.buffer(paneBreak(sr, seed + i)));
    snd.rain = bus.buffer(glassRain(sr, seed & 65535));
    snd.heap = bus.buffer(rustle(sr, { dur: 1, density: 700, seed: 9 }));
    snd.thunk = bus.buffer(tick(sr, 240, 3));
  }
  let W = 2, H = 2, wu = 1, hu = 1, sceneT = null, mesh = null;
  let state = 'pane', stress = 0, t = -1, front = 0, imp = [0, 0], holding = null, creakT = 0, drain = 0, slide = 0, phaseT = 0, autoT = 0;
  const HANG = .5;

  function build() {
    const m = Math.min(W, H); wu = W / m; hu = H / m;
    const r = rng(seed);
    const cells = voronoiCells(r, -wu / 2 - .02, -hu / 2 - .02, wu / 2 + .02, hu / 2 + .02, quality === 'low' ? .023 : .0155);
    mesh = meshVAO(kit, prog, fanVertices(cells, r), 7, [['a_p', 2, 0], ['a_c', 2, 2], ['a_r', 2, 4], ['a_e', 1, 6]]);
    sceneT = kit.fbo(W, H, 'rgba16f');
    kit.draw(city, { res: [W, H], seed: (seed % 53) * .7 }, sceneT);
  }
  const local = p => [(p.x - .5) * wu, (p.y - .5) * hu];
  function creak() { if (snd.creak) bus.play(snd.creak[Math.floor(Math.random() * 8)], { gain: .2 + stress * .55, rate: .9 + Math.random() * .25 }); env.buzz(5); }
  function breakPane() {
    state = 'broken'; t = 0;
    if (bus) {
      bus.play(snd.brk[Math.floor(Math.random() * 3)], { gain: 1 });
      bus.play(snd.rain, { gain: .78, delay: HANG * .92 });
    }
    env.buzz([40, 30, 25]);
  }
  function fresh() {
    if (state === 'broken') { state = 'drain'; phaseT = 0; snd.heap && bus.play(snd.heap, { gain: .6 }); }
  }
  input.on({
    down(p) {
      if (state === 'pane') { imp = local(p); holding = p.id; stress = Math.min(.97, stress + .22); creak(); snd.thunk && bus.play(snd.thunk, { gain: .3 }); }
      else if (state === 'broken' && t > 3.2) fresh();
    },
    move(p) { if (holding === p.id && state === 'pane') { const l = local(p); imp[0] += (l[0] - imp[0]) * .05; imp[1] += (l[1] - imp[1]) * .05; } },
    up(p) { if (holding === p.id) holding = null; },
  });
  return {
    resize(w, h) { W = w; H = h; build(); kit.bind(null); },
    reset() { if (state === 'broken') fresh(); else { stress = 0; } },
    attract(_, dt) {
      autoT += dt;
      if (state === 'pane' && autoT > 1) { imp = [Math.sin(autoT) * .1, .05]; stress += dt * .7; }
      else if (state === 'broken' && t > 4) { autoT = 0; fresh(); }
    },
    frame(time, dt) {
      if (state === 'pane') {
        if (holding !== null) {
          stress += dt * 1.05; creakT -= dt;
          if (creakT <= 0) { creak(); creakT = .22 - stress * .17 + Math.random() * .05; }
        } else stress = Math.max(stress > .22 ? .22 : stress, stress - dt * .35);
        if (stress >= 1) breakPane();
        front = Math.pow(Math.max(0, stress), 2) * .24;
      } else if (state === 'broken') {
        t += dt; front = .24 + t * 5.5;
        if (t > 3.6) ui.hint('한 번 더 누르면 새 유리', 300);
      } else if (state === 'drain') {
        phaseT += dt; drain = phaseT * phaseT * 3;
        if (phaseT > .55) { state = 'in'; phaseT = 0; t = -1; stress = 0; front = 0; drain = 0; slide = hu; }
      } else if (state === 'in') {
        phaseT += dt; const k = Math.min(1, phaseT / .55); slide = hu * Math.pow(1 - k, 3);
        if (k >= 1) { state = 'pane'; slide = 0; }
      }
      post.begin();
      kit.draw(blit, { t: sceneT, dim: 1 }, undefined);
      gl.bindVertexArray(mesh.vao);
      kit.use(prog, { size: [wu, hu], imp, t, front, hang: HANG, drain, slide, scene: sceneT, stress, time });
      gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
      gl.bindVertexArray(null);
      post.end({ exposure: 1.2, bloom: .07, vig: .55, grain: .014 }, dt);
    },
    destroy() { bus && bus.destroy(); },
  };
}
