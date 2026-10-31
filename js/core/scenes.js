// The night city behind every pane of glass. Baked once, then only sampled.
export const CITY = /* glsl */ `in vec2 v; out vec4 o; uniform vec2 res; uniform float seed;
vec3 tone(float h){ return h<.45?vec3(1.,.66,.28):h<.68?vec3(1.,.42,.26):h<.85?vec3(.42,.72,1.):vec3(1.,.35,.6); }
void main(){
  vec2 p=v*res/min(res.x,res.y);
  float W=res.x/min(res.x,res.y);
  vec3 c=mix(vec3(.11,.055,.075),vec3(.012,.02,.05),smoothstep(.0,.95,v.y));
  c+=vec3(.42,.17,.09)*exp(-v.y*5.5)*.8;
  // Far city out of focus.
  for(int l=0;l<3;l++){ float sz=.16-.04*float(l); vec2 g=p/sz+float(l)*7.3+seed; vec2 id=floor(g);
    for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){ vec2 n=id+vec2(x,y); float h=hash(n+float(l)); if(h<.42) continue;
      vec2 ctr=n+hash2(n)*.9+.05; float d=length(g-ctr); float r=.22+.3*hash(n+3.);
      float yy=(ctr.y*sz-float(l)*7.3*sz); float band=smoothstep(.72,.2,v.y);
      float disc=smoothstep(r,r-.035,d)*(.72+.28*smoothstep(r*.55,r,d));
      c+=tone(hash(n+9.))*disc*band*(.035+.1*hash(n+5.))*(1.-float(l)*.18); } }
  // Near skyline, in sharp focus, so that clean glass really reads as clean.
  float bx=floor(p.x*11.+seed); float top=.13+.24*hash(vec2(bx,seed))*hash(vec2(bx,2.))+.05*hash(vec2(bx,8.));
  if(v.y<top){ vec3 b=vec3(.008,.009,.014)+vec3(.012,.008,.01)*(1.-v.y/top);
    vec2 w=vec2(fract(p.x*11.+seed)*7.,p.y*95.); vec2 wi=floor(w); vec2 wf=fract(w);
    float lit=step(.62,hash(wi+bx*3.))*step(.14,wf.x)*step(wf.x,.72)*step(.2,wf.y)*step(wf.y,.74)*step(1.,wi.x)*step(wi.x,5.);
    c=b+tone(hash(wi+bx))*lit*(.55+.8*hash(wi+bx+4.)); }
  o=vec4(c,1.);
}`;
