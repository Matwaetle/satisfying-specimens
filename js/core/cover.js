// Coarse CPU record of what a wide tool has already passed over, so that sound and
// completion can follow real progress without reading pixels back from the GPU.
export const SWEPT = /* glsl */ `float side_(vec2 a,vec2 b,vec2 p){ return (b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x); }
bool inTri(vec2 p,vec2 a,vec2 b,vec2 c){ float d0=side_(a,b,p),d1=side_(b,c,p),d2=side_(c,a,p); return !((d0<0.||d1<0.||d2<0.)&&(d0>0.||d1>0.||d2>0.)); }
bool swept(vec2 p,vec2 c0,vec2 n0,vec2 c1,vec2 n1,float w){ vec2 a=c0-n0*w,b=c0+n0*w,d=c1+n1*w,e=c1-n1*w; return inTri(p,a,b,d)||inTri(p,a,d,e); }
`;

export class Coverage {
  constructor(asp, rows = 72) {
    this.asp = asp;
    const u = Math.min(asp[0], asp[1]) / rows;
    this.cols = Math.round(asp[0] / u); this.rows = Math.round(asp[1] / u);
    this.cells = new Uint8Array(this.cols * this.rows);
    this.count = 0;
  }
  clear() { this.cells.fill(0); this.count = 0; }
  get fraction() { return this.count / this.cells.length; }
  // Marks every cell within half-width w of the segment; returns how many are new.
  mark(x0, y0, x1, y1, w) {
    const { asp, cols, rows, cells } = this, pad = w + 1e-3;
    const toC = x => (x + asp[0] / 2) / asp[0] * cols, toR = y => (y + asp[1] / 2) / asp[1] * rows;
    const c0 = Math.max(0, Math.floor(toC(Math.min(x0, x1) - pad))), c1 = Math.min(cols - 1, Math.ceil(toC(Math.max(x0, x1) + pad)));
    const r0 = Math.max(0, Math.floor(toR(Math.min(y0, y1) - pad))), r1 = Math.min(rows - 1, Math.ceil(toR(Math.max(y0, y1) + pad)));
    const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy || 1e-9;
    let fresh = 0;
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const i = r * cols + c; if (cells[i]) continue;
      const x = (c + .5) / cols * asp[0] - asp[0] / 2, y = (r + .5) / rows * asp[1] - asp[1] / 2;
      const u = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / l2));
      if (Math.hypot(x - x0 - dx * u, y - y0 - dy * u) < w) { cells[i] = 1; fresh++; }
    }
    this.count += fresh;
    return fresh;
  }
}
