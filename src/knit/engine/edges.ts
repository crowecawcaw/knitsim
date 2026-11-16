// @ts-nocheck -- engine internals are loosely typed; the public shapes are in ../types.ts
// Edges, lines and points of built pieces, as polylines in piece-local inches.

export class EdgeError extends Error {}
const fail = (m) => { throw new EdgeError(m); };

const LEN_RE = /^(-?\d*\.?\d+)(in|cm)$/;
export const toIn = (v, u) => (u === 'cm' ? v / 2.54 : v);

/** Split on a separator at depth 0 (outside (), [], quotes). */
export function splitTop(s, sep) {
  const out = []; let d = 0, q = false, cur = '';
  for (const ch of s) {
    if (ch === '"') q = !q;
    if (!q) { if (ch === '(' || ch === '[') d++; else if (ch === ')' || ch === ']') d--; }
    if (!q && !d && ch === sep) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

/** Length of a polyline; side edges carry `ix`, the edge's position in the fabric, for their lengths. */
export const polyLen = (pts) => { let L = 0; for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i]; const dx = a.ix != null && b.ix != null ? b.ix - a.ix : b.x - a.x; L += Math.hypot(dx, b.y - a.y); } return L; };
export const edgeLen = (segs) => segs.reduce((a, s) => a + polyLen(s.pts), 0);

function arcs(pts) { const a = [0]; for (let i = 1; i < pts.length; i++) a.push(a[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)); return a; }
function pointAt(pts, A, s) {
  if (!pts.length) return null;
  if (s <= 0) return { ...pts[0] };
  for (let i = 1; i < pts.length; i++) if (A[i] >= s) { const f = (s - A[i - 1]) / ((A[i] - A[i - 1]) || 1); return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f, ix: pts[i - 1].ix != null && pts[i].ix != null ? pts[i - 1].ix + (pts[i].ix - pts[i - 1].ix) * f : undefined, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * f, r: pts[i].r, st: pts[i].st }; }
  return { ...pts[pts.length - 1] };
}
function slice(pts, sa, sb) {
  const A = arcs(pts); const lo = Math.min(sa, sb), hi = Math.max(sa, sb);
  const out = [pointAt(pts, A, lo)];
  for (let i = 0; i < pts.length; i++) if (A[i] > lo + 1e-9 && A[i] < hi - 1e-9) out.push(pts[i]);
  if (hi > lo + 1e-9) out.push(pointAt(pts, A, hi));
  return sa <= sb ? out : out.reverse();
}

const geo = (P) => ({ sg: P.sg, rg: P.rg });
const xsOf = (sts) => sts.map((s) => s.x);

/** Horizontal polyline through stitches given in RS order (right → left): one point per stitch boundary. */
function hline(P, sts, y) {
  const { sg } = geo(P);
  if (!sts.length) return [];
  const pts = [];
  // stitches in RS order have decreasing x (right edge first) in flat pieces; keep their order
  const dirx = sts.length > 1 && sts[sts.length - 1].x > sts[0].x ? 1 : -1;
  pts.push({ x: (sts[0].x - dirx * 0.5) / sg, y, st: sts[0], k: 0 });
  sts.forEach((s, i) => pts.push({ x: (s.x + dirx * 0.5) / sg, y, st: sts[i + 1] || null, k: i + 1, sec: s.sec, prev: s }));
  return pts;
}

function rowY(P, r) { return r / P.rg; }

function rowOf(P, R) {
  if (R === undefined || R === '') return null;
  if (R === 'start') return 0;
  if (R === 'end') return P.nrows - 1;
  if (/^-?\d+$/.test(R)) { const n = +R; return n < 0 ? P.nrows - 1 + n : n; }
  if (P.markers[R]) return P.markers[R].row;
  fail(`${P.name}: unknown row or marker "${R}"`);
}

/** The full edge (before any range): {pts, kind:'v'|'h'|'pt'}; h edges are in RS order. */
function baseEdge(built, P, name, idx) {
  const { sg } = geo(P);
  const topName = P.topDown ? 'bottom' : 'top', botName = P.topDown ? 'top' : 'bottom';
  if (name === 'left' || name === 'right') {
    // x is where the layout put the edge; ix (for lengths) follows the edge as the fabric does: an edge stitch
    // that moves with its neighbours (increases further in, a re-centred row) adds no width to the edge
    const pts = []; const sgn = name === 'left' ? 1 : -1; let prevX = null, ix = 0;
    for (let r = 0; r < P.nrows; r++) {
      const sts = P.rows[r].stitches; if (!sts.length) continue;
      const xs = xsOf(sts);
      const x = name === 'left' ? Math.min(...xs) - 0.5 : Math.max(...xs) + 0.5;
      if (prevX != null) {
        const near = sts.filter((s) => s.parents && s.parents.length === 1 && s.parents[0].row === r - 1)
          .sort((a, b) => sgn * (a.x - b.x)).slice(0, 5).map((s) => s.x - s.parents[0].x).sort((a, b) => a - b);
        const drift = near.length ? near[near.length >> 1] : 0;
        ix += (x - prevX) - drift;
      }
      prevX = x;
      pts.push({ x: x / sg, ix: ix / sg, y: rowY(P, r), r });
      // the side ends where the top begins (a shoulder bound off in steps)
      const edgeSt = sts.reduce((a, b) => ((name === 'left' ? b.x < a.x : b.x > a.x) ? b : a));
      if (edgeSt.top && sts.some((q) => !q.top)) break;
    }
    return { pts, kind: 'v' };
  }
  if (name === botName) {
    const sts = P.rows[0] ? P.rows[0].stitches.filter((s) => s.op !== 'bo').slice().sort((a, b) => b.x - a.x) : [];
    return { pts: hline(P, sts, -0.5 / P.rg), kind: 'h' };
  }
  if (name === topName) {
    let segs = P.top || (P.needle && P.needle.length ? [P.needle] : null);
    if (!segs) fail(`${P.name} has no top edge (it was held or joined on; name the holder instead)`);
    if (idx) { const k = +idx; const ordered = segs.slice().sort((a, b) => Math.min(...xsOf(a)) - Math.min(...xsOf(b))); if (!ordered[k - 1]) fail(`${P.name}.top.${k}: the top has ${segs.length} part(s)`); segs = [ordered[k - 1]]; }
    const all = [].concat(...segs).slice().sort((a, b) => b.x - a.x);
    return { pts: all.map((s) => ({ x: s.x / sg, y: rowY(P, s.row + 0.5), st: s })).flatMap((p, i, arr) => i === 0 ? [{ ...p, x: p.x + 0.5 / sg }, p] : i === arr.length - 1 ? [p, { ...p, x: p.x - 0.5 / sg }] : [p]), kind: 'h', sts: all };
  }
  if (name === 'neck') return neckEdge(P, idx);
  if (name === 'live') return { pts: hline(P, P.needle || [], rowY(P, P.nrows - 0.5)), kind: 'h' };
  // named edges
  const nm = P.named && P.named[name];
  if (nm) {
    const sts = unwrap(P, nm.sts);
    const pts = sts.map((s) => ({ x: s.ux / sg, y: rowY(P, s.st.row + (nm.kind === 'co' ? -0.5 : 0.5)), st: s.st, sec: s.st.sec }));
    return { pts: widen(pts, sg, sts), kind: sts.length > 1 ? 'h' : 'pt' };
  }
  if (P.holders && P.holders[name]) {
    const sts = unwrap(P, P.holders[name].all || P.holders[name]);
    const pts = sts.map((s) => ({ x: s.ux / sg, y: rowY(P, s.st.row + 0.5), st: s.st }));
    return { pts: widen(pts, sg, sts), kind: 'h' };
  }
  if (P.points && P.points[name]) {
    const s = P.points[name];
    return { pts: [{ x: s.x / sg, y: rowY(P, s.row), st: s }], kind: 'pt' };
  }
  // a section: live, or bound off at the top
  const live = (P.needle || []).filter((s) => s.sec === name);
  if (live.length) return { pts: hline(P, live, rowY(P, P.nrows - 0.5)), kind: 'h' };
  const top = P.top ? [].concat(...P.top).filter((s) => s.sec === name) : [];
  if (top.length) return { pts: hline(P, top.sort((a, b) => b.x - a.x), rowY(P, P.nrows - 0.5)), kind: 'h' };
  if (P.markers && P.markers[name]) { const r = P.markers[name].row; const sts = P.rows[r] ? P.rows[r].stitches.slice().sort((a, b) => b.x - a.x) : []; return { pts: hline(P, sts, rowY(P, r)), kind: 'h' }; }
  fail(`${P.name} has no edge, section, holder or marker "${name}"`);
}
function widen(pts, sg, sts) {
  if (pts.length < 1) return pts;
  if (pts.length === 1) return [{ ...pts[0], x: pts[0].x + 0.5 / sg }, { ...pts[0], x: pts[0].x - 0.5 / sg }];
  const d = pts[pts.length - 1].x > pts[0].x ? 1 : -1;
  return [{ ...pts[0], x: pts[0].x - d * 0.5 / sg }, ...pts, { ...pts[pts.length - 1], x: pts[pts.length - 1].x + d * 0.5 / sg }];
}

/** Stitches in RS order (high x first). In a round piece a run that wraps past the round start is made continuous. */
function unwrap(P, list) {
  const sts = list.slice().sort((a, b) => b.x - a.x).map((st) => ({ st, ux: st.x }));
  if (!P.round || sts.length < 2) return sts;
  const runs = []; let cur = null;
  sts.forEach((o) => { if (cur && cur[cur.length - 1].ux - o.ux <= 1.6) cur.push(o); else { cur = [o]; runs.push(cur); } });
  if (runs.length < 2) return sts;
  const row = P.rows[sts[0].st.row]; if (!row) return sts;
  const xs = row.stitches.map((q) => q.x); const W = Math.max(...xs) - Math.min(...xs) + 1;
  // the run at the low end continues past the high end
  const last = runs[runs.length - 1].map((o) => ({ ...o, ux: o.ux + W }));
  return [...last, ...runs.slice(0, -1).flat()];
}

function segsOfRow(sts) {
  const xs = sts.filter((s) => s.op !== 'bo').map((s) => s.x).sort((a, b) => a - b);
  const segs = []; let cur = null;
  xs.forEach((x) => { if (cur && x - cur[cur.length - 1] <= 1.6) cur.push(x); else { cur = [x]; segs.push(cur); } });
  return segs;
}
function neckEdge(P, idx) {
  const { sg } = geo(P);
  const r0 = P.splitRow;
  if (r0 == null) {
    // no split: a neck held (or bound off) straight across, e.g. `hold neck as neck` at the top
    const h = P.holders.neck;
    if (h && h.all.length) return { pts: h.all.slice().sort((a, b) => a.x - b.x).map((s) => ({ x: s.x / sg, y: rowY(P, s.row + 0.5), st: s })), kind: 'h' };
    fail(`${P.name}.neck: the piece has no centre bind-off or hold`);
  }
  const side1 = [], side2 = [];
  for (let r = r0 + 1; r < P.nrows; r++) {
    const sg2 = segsOfRow(P.rows[r].stitches);
    if (sg2.length >= 2) { const L = sg2[0], R = sg2[sg2.length - 1]; side1.push({ x: (L[L.length - 1] + 0.5) / sg, y: rowY(P, r), r }); side2.push({ x: (R[0] - 0.5) / sg, y: rowY(P, r), r }); }
  }
  const mid = (P.splitSts || []).slice().sort((a, b) => a.x - b.x).map((s) => ({ x: s.x / sg, y: rowY(P, s.row + 0.5), st: s }));
  if (idx === '1') return { pts: side1.reverse(), kind: 'v' };
  if (idx === '2') return { pts: side2, kind: 'v' };
  return { pts: [...side1.slice().reverse(), ...mid, ...side2], kind: 'v' };
}

/** A position on an edge → arc length from the start of pts. */
function posArc(P, e, pos, A) {
  const total = A[A.length - 1] || 0;
  let m = /^(.*?)([+-])(\d*\.?\d+)(in|cm)?$/.exec(pos);
  if (m && m[1] && !/^-?\d*\.?\d+(in|cm)?$/.test(pos)) {
    const base = posArc(P, e, m[1], A);
    const amt = m[4] ? toIn(+m[3], m[4]) : unitLen(P, e, +m[3]);
    return base + (m[2] === '+' ? amt : -amt);
  }
  if (pos === 'start') return 0;
  if (pos === 'end') return total;
  if (pos === 'mid') return total / 2;
  if ((m = LEN_RE.exec(pos))) { const v = toIn(+m[1], m[2]); return v < 0 ? total + v : v; }
  if (/^-?\d+$/.test(pos)) {
    const n = +pos;
    if (e.kind === 'v') {
      const r = n < 0 ? P.nrows - 1 + n : n;
      let best = 0, bd = Infinity; e.pts.forEach((p, i) => { const d = Math.abs((p.r ?? 0) - r); if (d < bd) { bd = d; best = i; } });
      return A[best];
    }
    const k = n < 0 ? e.pts.length - 1 + n : n;
    return A[Math.max(0, Math.min(e.pts.length - 1, k))];
  }
  // marker / section / point marker
  if (e.kind === 'v' && P.markers && P.markers[pos]) {
    const r = P.markers[pos].row; let best = 0, bd = Infinity; e.pts.forEach((p, i) => { const d = Math.abs((p.r ?? 0) - r); if (d < bd) { bd = d; best = i; } });
    return A[best];
  }
  if (e.kind !== 'v') {
    const i = e.pts.findIndex((p) => p.st && (p.st.sec === pos || (p.st.pm && p.st.pm.includes(pos)) || (P.points && P.points[pos] && p.st.colId === P.points[pos].colId)));
    if (i >= 0) return A[i];
    if (P.markers && P.markers[pos]) return total / 2;
  }
  fail(`${P.name}: no position "${pos}" on this edge`);
}
function unitLen(P, e, n) { return e.kind === 'v' ? n / P.rg : n / P.sg; }

function applyRange(P, e, range) {
  const A = arcs(e.pts);
  const parts = splitTop(range, ':');
  if (range.trim() === '') return e.pts;
  if (!range.includes(':')) {
    // a section alone is its extent; anything else is a point
    const name = range.trim();
    if (e.kind !== 'v' && /^[a-z_][a-z0-9_]*$/i.test(name) && !['start', 'mid', 'end'].includes(name)) {
      const idx = e.pts.map((p, i) => (p.prev && p.prev.sec === name ? i : -1)).filter((i) => i >= 0);
      if (idx.length) { const a = A[idx[0] - 1] ?? 0, b = A[idx[idx.length - 1]]; return slice(e.pts, a, b); }
    }
    const s = posArc(P, e, name, A); return [pointAt(e.pts, A, s)];
  }
  const a = parts[0] === undefined || range.trim().startsWith(':') ? 0 : posArc(P, e, parts[0], A);
  const b = range.trim().endsWith(':') ? A[A.length - 1] : posArc(P, e, parts[range.trim().startsWith(':') ? 0 : 1], A);
  return slice(e.pts, a, b);
}

/** Resolve an edge expression to [{piece, pts}] (x, y in inches). Horizontal edges come out left → right. */
export function edgeOf(built, expr) {
  const out = [];
  for (let p of splitTop(expr, '+')) {
    let rev = false;
    if (p.startsWith('~')) { rev = true; p = p.slice(1).trim(); }
    let segs;
    const g = /^\((.*)\)\s*(?:\[([^\]]*)\])?$/.exec(p);
    if (g) {
      segs = edgeOf(built, g[1]);
      if (g[2] !== undefined) {
        // a range over the joined edge
        const P0 = built.pieces[segs[0].piece];
        const pts = [].concat(...segs.map((s) => s.pts));
        const e = { pts, kind: 'v' }; segs = [{ piece: segs[0].piece, pts: applyRange(P0, e, g[2]) }];
      }
    } else segs = [one(built, p)];
    if (rev) segs = segs.reverse().map((s) => ({ ...s, pts: s.pts.slice().reverse() }));
    out.push(...segs);
  }
  if (!out.length) fail(`empty edge "${expr}"`);
  return out;
}

function one(built, p) {
  const m = /^([a-z_][a-z0-9_]*)\.(.+)$/i.exec(p);
  if (!m) fail(`Bad edge "${p}". Examples: front.left[start:underarm], back.top.1, ~front.neck, body.row[12][5:7]`);
  const P = built.pieces[m[1]];
  if (!P) fail(`Unknown piece "${m[1]}" in "${p}"`);
  if (!P.nrows) fail(`Piece ${P.name} has no rows`);
  let rest = m[2];
  let mm;
  // row / col lines
  if ((mm = /^row\[([^\]]*)\](?:\[([^\]]*)\])?(?:\.(below|above))?$/.exec(rest))) {
    const r = rowOf(P, mm[1].trim());
    const sts = P.rows[r].stitches.filter((s) => s.op !== 'bo').slice().sort((a, b) => b.x - a.x);
    const e = { pts: hline(P, sts, rowY(P, r)), kind: 'h' };
    const pts = mm[2] !== undefined ? applyRange(P, e, mm[2]) : e.pts;
    return { piece: P.name, pts: pts.length > 1 && pts[0].x > pts[pts.length - 1].x ? pts.slice().reverse() : pts };
  }
  if ((mm = /^col\[([^\]]*)\](?:\[([^\]]*)\])?$/.exec(rest))) {
    const r0 = mm[2] ? rowOf(P, splitTop(mm[2], ':')[0] || 'start') : 0;
    const r1 = mm[2] ? rowOf(P, splitTop(mm[2], ':')[1] || 'end') : P.nrows - 1;
    const sts = P.rows[r0].stitches.slice().sort((a, b) => b.x - a.x);
    const k = /^-?\d+$/.test(mm[1]) ? +mm[1] : 0;
    const s = sts[Math.max(0, Math.min(sts.length - 1, k < 0 ? sts.length + k : k))];
    const x = s ? s.x / P.sg : 0;
    return { piece: P.name, pts: [{ x, y: rowY(P, r0) }, { x, y: rowY(P, r1) }] };
  }
  mm = /^([a-z_][a-z0-9_]*)(?:\.(\d+))?(?:\[([^\]]*)\])?$/i.exec(rest);
  if (!mm) fail(`Bad edge "${p}"`);
  const e = baseEdge(built, P, mm[1], mm[2]);
  let pts = mm[3] !== undefined ? applyRange(P, e, mm[3]) : e.pts;
  // horizontal edges are given left → right (RS view) unless the range runs backwards
  if (e.kind === 'h' && pts.length > 1) {
    const ranged = mm[3] !== undefined && mm[3].includes(':');
    const backwards = ranged && (() => { const [a, b] = splitTop(mm[3], ':'); try { const A = arcs(e.pts); return posArc(P, e, a || 'start', A) > posArc(P, e, b || 'end', A); } catch { return false; } })();
    if (!backwards) pts = pts.slice().reverse();
  }
  return { piece: P.name, pts };
}
