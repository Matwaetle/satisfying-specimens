// Shared camera/lens finish: energy-conserving bloom, lens blur, ACES, vignette, grain, dither.
const DOWN = `in vec2 v; out vec4 o; uniform sampler2D t; uniform vec2 px;
void main(){ vec3 c=texture(t,v).rgb*4.;
 c+=texture(t,v+px*vec2(-1,-1)).rgb; c+=texture(t,v+px*vec2(1,-1)).rgb; c+=texture(t,v+px*vec2(-1,1)).rgb; c+=texture(t,v+px*vec2(1,1)).rgb;
 c=min(c/8.,vec3(40.)); if(any(isnan(c))) c=vec3(0.); o=vec4(c,1.); }`;
const UP = `in vec2 v; out vec4 o; uniform sampler2D t; uniform sampler2D lo; uniform vec2 px; uniform float k;
void main(){ vec3 c=vec3(0.);
 c+=texture(lo,v+px*vec2(-1,0)).rgb+texture(lo,v+px*vec2(1,0)).rgb+texture(lo,v+px*vec2(0,-1)).rgb+texture(lo,v+px*vec2(0,1)).rgb;
 c+=(texture(lo,v+px*vec2(-.7,-.7)).rgb+texture(lo,v+px*vec2(.7,-.7)).rgb+texture(lo,v+px*vec2(-.7,.7)).rgb+texture(lo,v+px*vec2(.7,.7)).rgb)*2.;
 o=vec4(texture(t,v).rgb+c/12.*k,1.); }`;
const FINISH = `in vec2 v; out vec4 o; uniform sampler2D hdr; uniform sampler2D bloomT; uniform sampler2D blurT;
uniform float exposure,bloom,dof,dofY,dofW,vig,grain,time,fade; uniform vec2 res;
vec3 aces(vec3 x){ return clamp(x*(2.51*x+.03)/(x*(2.43*x+.59)+.14),0.,1.); }
void main(){
 vec3 c=texture(hdr,v).rgb;
 float coc=smoothstep(dofW,dofW+.45,abs(v.y-dofY))*dof;
 c=mix(c,texture(blurT,v).rgb,coc);
 c=mix(c,texture(bloomT,v).rgb,bloom);
 vec2 q=(v-.5)*vec2(res.x/res.y,1.)/max(1.,res.x/res.y);
 c*=mix(1.,smoothstep(1.05,.2,length(q)*1.25),vig);
 c=aces(c*exposure*fade);
 c=pow(c,vec3(1./2.2));
 float g=hash(gl_FragCoord.xy+fract(time)*311.)-.5;
 c+=g*grain*(1.-c*.6);
 c+=(hash(gl_FragCoord.yx+fract(time*.7)*97.)-.5)/255.;
 o=vec4(c,1.);
}`;

export class Post {
  constructor(kit) {
    this.kit = kit;
    this.down = kit.program(DOWN);
    this.up = kit.program(UP);
    this.finish = kit.program(FINISH);
    this.time = 0;
  }
  resize(w, h, levels = 5) {
    // The lens chain outlives specimens, so it stays out of the kit's tracked list.
    const gl = this.kit.gl;
    for (const r of this.own || []) { gl.deleteFramebuffer(r.fb); gl.deleteTexture(r.tex); }
    this.own = [];
    const make = (a, b) => { const r = this.kit.fbo(a, b, 'rgba16f'); this.kit.owned.pop(); this.own.push(r); return r; };
    this.w = w; this.h = h;
    this.hdr = make(w, h);
    this.chain = []; this.upChain = [];
    let cw = w, ch = h;
    for (let i = 0; i < levels; i++) {
      cw = Math.max(2, cw >> 1); ch = Math.max(2, ch >> 1);
      this.chain.push(make(cw, ch));
      this.upChain.push(make(cw, ch));
    }
  }
  begin() {
    const gl = this.kit.gl;
    this.kit.bind(this.hdr);
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    return this.hdr;
  }
  end({ exposure = 1, bloom = .05, dof = 0, dofY = .5, dofW = .25, vig = .6, grain = .018, fade = 1 } = {}, dt = 0) {
    const k = this.kit, gl = k.gl;
    gl.disable(gl.BLEND);
    this.time += dt;
    let src = this.hdr;
    for (const t of this.chain) {
      k.draw(this.down, { t: src, px: [1 / src.w, 1 / src.h] }, t);
      src = t;
    }
    let lo = this.chain[this.chain.length - 1];
    for (let i = this.chain.length - 2; i >= 0; i--) {
      const dst = this.upChain[i];
      k.draw(this.up, { t: this.chain[i], lo, px: [1.5 / lo.w, 1.5 / lo.h], k: 1 }, dst);
      lo = dst;
    }
    k.draw(this.finish, {
      hdr: this.hdr, bloomT: lo, blurT: this.chain[1], exposure, bloom: bloom, dof, dofY, dofW, vig, grain,
      time: this.time, fade, res: [gl.drawingBufferWidth, gl.drawingBufferHeight],
    }, null);
  }
}
