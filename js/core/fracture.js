// Voronoi fracture shared by every specimen that breaks.
export function voronoiCells(r, x0, y0, x1, y1, size, jitter = .85) {
  const nx = Math.max(1, Math.round((x1 - x0) / size)), ny = Math.max(1, Math.round((y1 - y0) / size));
  const sx = (x1 - x0) / nx, sy = (y1 - y0) / ny, sites = new Float32Array(nx * ny * 2);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    sites[(j * nx + i) * 2] = x0 + (i + .5 + (r() - .5) * jitter) * sx;
    sites[(j * nx + i) * 2 + 1] = y0 + (j + .5 + (r() - .5) * jitter) * sy;
  }
  const cells = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const sxp = sites[(j * nx + i) * 2], syp = sites[(j * nx + i) * 2 + 1];
    let poly = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    for (let b = Math.max(0, j - 2); b <= Math.min(ny - 1, j + 2); b++) for (let a = Math.max(0, i - 2); a <= Math.min(nx - 1, i + 2); a++) {
      if (a === i && b === j) continue;
      const ox = sites[(b * nx + a) * 2], oy = sites[(b * nx + a) * 2 + 1];
      const mx = (sxp + ox) / 2, my = (syp + oy) / 2, ax = ox - sxp, ay = oy - syp, out = [];
      for (let k = 0; k < poly.length; k++) {
        const p = poly[k], q = poly[(k + 1) % poly.length];
        const dp = (p[0] - mx) * ax + (p[1] - my) * ay, dq = (q[0] - mx) * ax + (q[1] - my) * ay;
        if (dp <= 0) out.push(p);
        if ((dp <= 0) !== (dq <= 0)) { const u = dp / (dp - dq); out.push([p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u]); }
      }
      poly = out;
      if (poly.length < 3) break;
    }
    if (poly.length < 3) continue;
    let cx = 0, cy = 0; for (const p of poly) { cx += p[0]; cy += p[1]; }
    cells.push({ cx: cx / poly.length, cy: cy / poly.length, pts: poly });
  }
  return cells;
}

// Triangle fan per cell. Each vertex: px, py, cx, cy, randA, randB, edge (0 at rim, 1 at centre).
export function fanVertices(cells, r) {
  let tris = 0; for (const c of cells) tris += c.pts.length;
  const v = new Float32Array(tris * 3 * 7);
  let o = 0;
  const put = (x, y, c, a, b, e) => { v[o++] = x; v[o++] = y; v[o++] = c.cx; v[o++] = c.cy; v[o++] = a; v[o++] = b; v[o++] = e; };
  cells.forEach((c, idx) => {
    const a = r(), b = r();
    c.first = o / 7; c.a = a; c.b = b;
    for (let k = 0; k < c.pts.length; k++) {
      const p = c.pts[k], q = c.pts[(k + 1) % c.pts.length];
      put(c.cx, c.cy, c, a, b, 1); put(p[0], p[1], c, a, b, 0); put(q[0], q[1], c, a, b, 0);
    }
    c.count = o / 7 - c.first;
    c.index = idx;
  });
  return v;
}
