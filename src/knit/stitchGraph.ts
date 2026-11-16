// @ts-nocheck -- engine internals are loosely typed
// Pieces knit in the round with short rows (toes, heels, shoes from a closed cast-on) can't be
// drawn as rings of rows: their rows are partial and run back and forth. They get a mesh with one
// particle per stitch instead, linked the way the yarn links them: each stitch to its needle
// neighbours (course) and to the stitch(es) it was knitted through (wale).

/** Round pieces that turn somewhere (short rows) need the stitch graph. */
export function needsGraph(P) {
  return P.mode === 'round' && P.rows.some((r) => r.dir === 'WS');
}

/**
 * Build the stitch graph.
 * Returns the usual mesh fields (local: a flat 2D rest layout in inches, tris, cons) plus
 *   graph: true, sts: stitch per vertex, seamLocal: (x/sg, row/rg) per vertex for edge lookups,
 *   near: per vertex the set of vertices close along the fabric,
 *   cells: render cells [{v:[TL,TR,BL,BR] (-1 = none), pos:[[s,t]×4], tris:[[slot,slot,slot],...]}],
 *   soleDepth, flatL, w0 for draping it over a foot.
 */
export function buildGraphMesh(P, sg, rg, stretchOf) {
  const sts = []; const vid = new Map();
  P.rows.forEach((r) => r.stitches.forEach((s) => { vid.set(s, sts.length); sts.push(s); }));
  const n = sts.length;
  const theta = new Float32Array(n);
  const dir = new Map(); // "a>b": b follows a along the needle
  const und = new Set();
  const key = (a, b) => (a < b ? a + ',' + b : b + ',' + a);
  const course = [];
  const addCourse = (a, b) => { if (a === b || und.has(key(a, b))) return; und.add(key(a, b)); dir.set(a + '>' + b, true); course.push([a, b]); };

  let needle = (P.rows[0].order || P.rows[0].stitches).slice(); let fwdNow = true; let fullProw = 0; const levelRows = [0];
  // angle around the tube: the cast-on spread evenly, every later stitch over the stitch(es) it came from
  const circMean = (ts) => { let x = 0, y = 0; ts.forEach((t) => { x += Math.cos(2 * Math.PI * t); y += Math.sin(2 * Math.PI * t); }); return ((Math.atan2(y, x) / (2 * Math.PI)) + 1) % 1; };
  let first = true;
  const ring = (fresh) => {
    const m = needle.length;
    needle.forEach((s, i) => {
      if (!fresh(s)) return;
      const v = vid.get(s);
      if (first) { theta[v] = i / m; return; }
      const ps = (s.parents || []).filter((p) => vid.has(p));
      if (ps.length) {
        // siblings from one stitch (kfb) fan out around it
        const sib = sts[vid.get(ps[0])] && ps.length === 1 ? ps[0].children.filter((c) => vid.has(c) && (c.parents || []).length === 1) : [s];
        const j = sib.indexOf(s), k = sib.length;
        theta[v] = (circMean(ps.map((p) => theta[vid.get(p)])) + (k > 1 ? (j - (k - 1) / 2) * (0.6 / m) * (fwdNow ? 1 : -1) : 0) + 1) % 1;
      } else {
        const a = needle[(i - 1 + m) % m], b = needle[(i + 1) % m];
        theta[v] = circMean([theta[vid.get(a)], theta[vid.get(b)]]);
      }
    });
    // a whole round: spread its stitches evenly, keeping the ring turned where its parents were
    if (!first && needle.every((s) => fresh(s))) {
      let x = 0, y = 0;
      needle.forEach((s, i) => { const d = 2 * Math.PI * (theta[vid.get(s)] - i / m); x += Math.cos(d); y += Math.sin(d); });
      const c = Math.atan2(y, x) / (2 * Math.PI);
      needle.forEach((s, i) => { theta[vid.get(s)] = (i / m + c + 2) % 1; });
    }
    first = false;
    for (let i = 0; i < m; i++) addCourse(vid.get(needle[i]), vid.get(needle[(i + 1) % m]));
  };
  ring(() => true);
  for (let r = 1; r < P.rows.length; r++) {
    const R = P.rows[r]; const order = R.order || R.stitches;
    // which way this row travels along the needle
    let dsum = 0, prevI = null; const at = new Map(needle.map((s, i) => [s, i]));
    for (const s of order) {
      const p = s.parents && s.parents[0]; if (!p || !at.has(p)) continue;
      const i = at.get(p);
      if (prevI != null) { let d = i - prevI; const m = needle.length; if (d > m / 2) d -= m; if (d < -m / 2) d += m; dsum += Math.sign(d); }
      prevI = i;
    }
    const fwd = dsum >= 0; fwdNow = fwd;
    const rep = new Map(); let last = null;
    const insertBeside = (t, s) => { const j = needle.indexOf(t); needle.splice(fwd ? j + 1 : j, 0, s); };
    for (const s of order) {
      const ps = (s.parents || []).filter((p) => needle.includes(p));
      if (ps.length) {
        needle[needle.indexOf(ps[0])] = s;
        ps.slice(1).forEach((p) => needle.splice(needle.indexOf(p), 1));
        s.parents.forEach((p) => rep.set(p, s));
      } else if (s.parents && s.parents.length && rep.has(s.parents[0]) && needle.includes(rep.get(s.parents[0]))) {
        insertBeside(rep.get(s.parents[0]), s); rep.set(s.parents[0], s);
      } else if (last && needle.includes(last)) insertBeside(last, s);
      else needle.push(s);
      last = s;
    }
    const inRow = new Set(R.stitches);
    // a full round, level all the way round (a bind-off after a toe flap is full but not level)
    const pr = R.stitches.map((s) => s.prow || 0);
    if (needle.every((s) => inRow.has(s)) && Math.max(...pr) - Math.min(...pr) <= 6) { fullProw = Math.max(fullProw, ...pr); levelRows.push(r); }
    ring((s) => inRow.has(s));
    if (r < P.rows.length - 1) needle = needle.filter((s) => s.op !== 'bo');
  }

  const isEdge = (a, b) => und.has(key(a, b));
  const isDir = (a, b) => dir.has(a + '>' + b);
  const par = sts.map((s) => (s.parents || []).map((p) => vid.get(p)).filter((v) => v != null));

  // ---- render cells and triangles ----
  const cells = []; const tris = [];
  const quad = new Set();
  const cell = (v, pos, tl) => { cells.push({ v, pos, tris: tl }); tl.forEach((t) => tris.push(v[t[0]], v[t[1]], v[t[2]])); };
  for (const [a0, b0] of course) {
    // orient along the needle
    const [a, b] = isDir(a0, b0) ? [a0, b0] : [b0, a0];
    let done = false;
    for (const pa of par[a]) if (!done && isDir(pa, b)) { cell([a, b, pa, -1], [[0, 1], [1, 1], [0, 0], [1, 0]], [[0, 1, 2]]); done = true; }
    for (const pb of par[b]) if (!done && isDir(a, pb)) { cell([a, b, -1, pb], [[0, 1], [1, 1], [0, 0], [1, 0]], [[0, 1, 3]]); done = true; }
    for (const pa of par[a]) for (const pb of par[b]) {
      if (done) break;
      if (pa === pb) { cell([a, b, pa, -1], [[0, 1], [1, 1], [0.5, 0], [1, 0]], [[0, 1, 2]]); done = true; }
      else if (isDir(pa, pb)) { cell([a, b, pa, pb], [[0, 1], [1, 1], [0, 0], [1, 0]], [[0, 1, 3], [0, 3, 2]]); quad.add(a + ',' + pb); quad.add(b + ',' + pa); done = true; }
    }
  }
  // decreases: the stitch sits over the gap between the stitches it joined
  par.forEach((ps, a) => {
    for (let i = 0; i < ps.length; i++) for (let j = 0; j < ps.length; j++) if (isDir(ps[i], ps[j])) cell([a, -1, ps[i], ps[j]], [[0.5, 1], [1, 1], [0, 0], [1, 0]], [[0, 3, 2]]);
  });

  // ---- springs ----
  const cons = []; const cw = 1 / sg, rw = 1 / rg;
  const fabOf = (v) => P.rows[sts[v].row]?.fabric;
  for (const [a, b] of course) cons.push([a, b, cw, 1, stretchOf(fabOf(a))]);
  const kids = new Map(); par.forEach((ps, a) => ps.forEach((p) => kids.set(p, (kids.get(p) || 0) + 1)));
  par.forEach((ps, a) => ps.forEach((p) => cons.push([a, p, ps.length > 1 || kids.get(p) > 1 ? Math.hypot(0.5 * cw, rw) : rw, 1, 0])));
  quad.forEach((k) => { const [a, b] = k.split(',').map(Number); cons.push([a, b, Math.hypot(cw, rw), 0.5, 0]); });
  // bending: two stitches along a course, two rows up a column
  const nb = Array.from({ length: n }, () => []);
  for (const [a, b] of course) { const [x, y] = isDir(a, b) ? [a, b] : [b, a]; nb[x].push(y); }
  const bend = new Set();
  nb.forEach((ys, a) => ys.forEach((b) => nb[b].forEach((c) => { if (c !== a && !bend.has(key(a, c))) { bend.add(key(a, c)); cons.push([a, c, 2 * cw, 0.15, stretchOf(fabOf(a))]); } })));
  par.forEach((ps, a) => { if (ps.length !== 1) return; par[ps[0]].forEach((g) => { if (par[ps[0]].length === 1) cons.push([a, g, 2 * rw, 0.15, 0]); }); });

  // ---- neighbourhoods along the fabric (self-collision ignores these pairs) ----
  const adj = Array.from({ length: n }, () => []);
  for (const [a, b] of course) { adj[a].push([b, cw]); adj[b].push([a, cw]); }
  par.forEach((ps, a) => ps.forEach((p) => { adj[a].push([p, rw]); adj[p].push([a, rw]); }));
  const near = new Array(n); const RAD = 1.3;
  for (let s = 0; s < n; s++) {
    const dist = new Map([[s, 0]]); const q = [s];
    while (q.length) { const u = q.shift(); const du = dist.get(u); for (const [v, w] of adj[u]) { const dv = du + w; if (dv <= RAD && (!dist.has(v) || dist.get(v) > dv)) { dist.set(v, dv); q.push(v); } } }
    near[s] = new Set(dist.keys());
  }

  // ---- flat rest layout: rings around the cast-on line (a closed cast-on sole), toe toward +x ----
  const n0 = P.rows[0].stitches.length;
  const deep = sts.map((s, v) => v).sort((a, b) => (sts[b].prow || 0) - (sts[a].prow || 0)).slice(0, Math.max(1, Math.floor(n * 0.08)));
  let cx = 0, cy = 0; deep.forEach((v) => { cx += Math.cos(2 * Math.PI * theta[v]); cy += Math.sin(2 * Math.PI * theta[v]); });
  const tToe = Math.atan2(cy, cx) / (2 * Math.PI);
  const off = Math.abs(((tToe - 0.5 + 1.5) % 1) - 0.5) < Math.abs(((tToe + 1.5) % 1) - 0.5) ? 0 : 0.5;
  // the sole ends where the increasing stops
  // depth: distance along the fabric from the cast-on line (a toe flap's edges sit as high as the side they join)
  const depth = new Float64Array(n).fill(Infinity); const doneD = new Uint8Array(n);
  P.rows[0].stitches.forEach((s) => { depth[vid.get(s)] = 0; });
  for (let it = 0; it < n; it++) {
    let u = -1, bu = Infinity; for (let v = 0; v < n; v++) if (!doneD[v] && depth[v] < bu) { bu = depth[v]; u = v; }
    if (u < 0) break; doneD[u] = 1;
    for (const [v, w] of adj[u]) if (depth[u] + w < depth[v]) depth[v] = depth[u] + w;
  }
  let soleDepth = 0; sts.forEach((s, v) => { if (s.op === 'inc' && isFinite(depth[v])) soleDepth = Math.max(soleDepth, depth[v]); });
  const flatL = (n0 / 2) / sg, w0 = 0.6 / sg;
  // stitches of the full rounds hold the shape; what was worked after them (toe flaps, edgings) follows
  const anchor = Uint8Array.from(sts, (s) => ((s.prow || 0) <= fullProw ? 1 : 0));
  const nbrs = adj.map((l) => l.map(([v]) => v));
  // how long each level round is, by its depth: the shape a closed cast-on bowl takes
  const rings = levelRows.map((r) => { const vs = P.rows[r].stitches.map((s) => vid.get(s)); return { d: vs.reduce((a, v) => a + (isFinite(depth[v]) ? depth[v] : 0), 0) / vs.length, p: vs.length / sg }; }).sort((a, b) => a.d - b.d);
  const local = sts.map((s, v) => {
    const d = isFinite(depth[v]) ? depth[v] : (s.prow || 0) / rg; const t = (theta[v] + off) % 1;
    return { ...stadium(flatL, w0, t, d), d, t };
  });
  const seamLocal = sts.map((s) => ({ x: s.x / sg, y: s.row / rg }));
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  local.forEach((l) => { x0 = Math.min(x0, l.x); x1 = Math.max(x1, l.x); y0 = Math.min(y0, l.y); y1 = Math.max(y1, l.y); });
  return {
    graph: true, local, uv: new Float32Array(n * 2), tris, cons, sts, seamLocal, near, cells,
    flatL, w0, soleDepth, anchor, nbrs, rings, x0: x0 * sg, y0: y0 * rg, W: (x1 - x0) * sg, H: (y1 - y0) * rg,
  };
}

/** A point on the ring `d` out from a cast-on line of length L (a stadium), at fraction t of the way
 *  round by arc length; t = 0 is the -x tip (heel), t = 0.5 the +x tip (toe). */
export function stadium(L, w0, t, d) {
  const r = w0 + d, P = 2 * L + 2 * Math.PI * r; let u = (((t % 1) + 1) % 1) * P;
  const arc = (a0, cx) => { const a = a0 - u / r; return { x: cx + r * Math.cos(a), y: r * Math.sin(a) }; };
  const q = Math.PI * r / 2;
  if (u < q) return arc(Math.PI, -L / 2); u -= q;                       // heel, up to the +y side
  if (u < L) return { x: -L / 2 + u, y: r }; u -= L;                     // +y side
  if (u < 2 * q) return arc(Math.PI / 2, L / 2); u -= 2 * q;             // round the toe
  if (u < L) return { x: L / 2 - u, y: -r }; u -= L;                     // -y side
  return arc(-Math.PI / 2, -L / 2);                                      // back to the heel
}
