// Thin WebGL2 kit: cached programs, reflected uniforms, tracked FBOs, shared GLSL.

export const COMMON = /* glsl */ `
#define PI 3.14159265359
float hash(vec2 p){ vec3 q=fract(vec3(p.xyx)*.1031); q+=dot(q,q.yzx+33.33); return fract((q.x+q.y)*q.z); }
vec2 hash2(vec2 p){ return vec2(hash(p),hash(p+17.3)); }
float vnoise(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*f*(f*(f*6.-15.)+10.);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
float fbm(vec2 p){ float a=.5,s=0.; mat2 m=mat2(1.6,1.2,-1.2,1.6); for(int i=0;i<5;i++){ s+=a*vnoise(p); p=m*p+3.1; a*=.5; } return s; }
float rectBox(vec2 p,vec2 c,vec2 h,float e){ vec2 d=abs(p-c)-h; return (1.-smoothstep(-e,e,d.x))*(1.-smoothstep(-e,e,d.y)); }
// One photo-studio lighting rig shared by every specimen. y is up.
vec3 studio(vec3 d){
  vec3 c=mix(vec3(.010,.009,.008),vec3(.045,.042,.038),smoothstep(-.5,1.,d.y));
  if(d.y>.02){
    vec2 p=d.xz/d.y;
    c+=vec3(1.,.95,.88)*11.*rectBox(p,vec2(-1.15,-.75),vec2(.75,.38),.05);
    c+=vec3(.68,.8,1.)*4.*rectBox(p,vec2(1.7,.35),vec2(.12,1.3),.03);
    c+=vec3(1.,.93,.84)*1.3*rectBox(p,vec2(.25,1.7),vec2(1.2,.22),.12);
  }
  return c;
}
float schlick(float c,float f0){ return f0+(1.-f0)*pow(clamp(1.-c,0.,1.),5.); }
`;

const VERT = `#version 300 es
out vec2 v; void main(){ vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2); v=p; gl_Position=vec4(p*2.-1.,0.,1.); }`;

const FORMATS = {
  rgba16f: ['RGBA16F', 'RGBA', 'HALF_FLOAT'],
  rg16f: ['RG16F', 'RG', 'HALF_FLOAT'],
  r16f: ['R16F', 'RED', 'HALF_FLOAT'],
  rgba8: ['RGBA8', 'RGBA', 'UNSIGNED_BYTE'],
};

export class Kit {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    if (!gl) throw new Error('webgl2');
    this.gl = gl; this.canvas = canvas;
    this.floatOK = !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
    gl.getExtension('OES_texture_float_linear');
    this.vao = gl.createVertexArray();
    this.programs = new Map();
    this.owned = [];
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
  }

  mark() { return this.owned.length; }
  release(mark = 0) {
    const gl = this.gl;
    for (const r of this.owned.splice(mark)) {
      if (r.fb) gl.deleteFramebuffer(r.fb);
      if (r.tex) gl.deleteTexture(r.tex);
      if (r.buffer) gl.deleteBuffer(r.buffer);
      if (r.vao) gl.deleteVertexArray(r.vao);
    }
  }

  _shader(type, src) {
    const gl = this.gl, s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      console.error(log, '\n', src.split('\n').map((l, i) => (i + 1) + ': ' + l).join('\n'));
      throw new Error('shader: ' + log);
    }
    return s;
  }

  program(frag, vert = VERT) {
    const key = vert + frag;
    if (this.programs.has(key)) return this.programs.get(key);
    const gl = this.gl, h = gl.createProgram();
    const header = `#version 300 es\nprecision highp float;\nprecision highp sampler2D;\n${COMMON}\n`;
    gl.attachShader(h, this._shader(gl.VERTEX_SHADER, vert));
    gl.attachShader(h, this._shader(gl.FRAGMENT_SHADER, header + frag));
    gl.linkProgram(h);
    if (!gl.getProgramParameter(h, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(h));
    const u = {};
    const n = gl.getProgramParameter(h, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const a = gl.getActiveUniform(h, i), name = a.name.replace(/\[0\]$/, '');
      u[name] = { loc: gl.getUniformLocation(h, a.name), type: a.type, size: a.size };
    }
    const p = { h, u };
    this.programs.set(key, p);
    return p;
  }

  use(p, uniforms = {}) {
    const gl = this.gl; let unit = 0;
    gl.useProgram(p.h);
    for (const k in uniforms) {
      const info = p.u[k]; if (!info) continue;
      const v = uniforms[k], l = info.loc;
      switch (info.type) {
        case gl.FLOAT: info.size > 1 ? gl.uniform1fv(l, v) : gl.uniform1f(l, v); break;
        case gl.INT: gl.uniform1i(l, v); break;
        case gl.BOOL: gl.uniform1i(l, v ? 1 : 0); break;
        case gl.FLOAT_VEC2: gl.uniform2fv(l, v); break;
        case gl.FLOAT_VEC3: gl.uniform3fv(l, v); break;
        case gl.FLOAT_VEC4: gl.uniform4fv(l, v); break;
        case gl.SAMPLER_2D:
          gl.activeTexture(gl.TEXTURE0 + unit);
          gl.bindTexture(gl.TEXTURE_2D, v && v.tex ? v.tex : v);
          gl.uniform1i(l, unit++);
          break;
      }
    }
  }

  // Fullscreen triangle into `target` (null = whatever viewport is already bound).
  draw(p, uniforms, target) {
    const gl = this.gl;
    if (target !== undefined) this.bind(target);
    this.use(p, uniforms);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  bind(t) {
    const gl = this.gl;
    if (t) { gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb); gl.viewport(0, 0, t.w, t.h); }
    else { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight); }
  }

  texture(w, h, format = 'rgba8', { filter = 'LINEAR', wrap = 'CLAMP_TO_EDGE', data = null } = {}) {
    const gl = this.gl, [i, f, t] = FORMATS[this.floatOK ? format : 'rgba8'];
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl[i], w, h, 0, gl[f], gl[t], data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl[filter]);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl[filter]);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl[wrap]);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl[wrap]);
    return tex;
  }

  fbo(w, h, format = 'rgba16f', opts) {
    const gl = this.gl, tex = this.texture(w, h, format, opts), fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    const r = { fb, tex, w, h };
    this.owned.push(r);
    return r;
  }

  double(w, h, format, opts) {
    let a = this.fbo(w, h, format, opts), b = this.fbo(w, h, format, opts);
    return { get read() { return a; }, get write() { return b; }, swap() { [a, b] = [b, a]; }, w, h };
  }
}

// Mesh helper for specimens that draw real polygons.
export function meshVAO(kit, program, data, stride, attrs) {
  const gl = kit.gl, vao = gl.createVertexArray(), buffer = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  for (const [name, size, offset] of attrs) {
    const loc = gl.getAttribLocation(program.h, name);
    if (loc < 0) continue;
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride * 4, offset * 4);
  }
  gl.bindVertexArray(null);
  kit.owned.push({ vao, buffer });
  return { vao, count: data.length / stride };
}
