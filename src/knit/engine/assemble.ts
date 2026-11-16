// @ts-nocheck -- engine internals are loosely typed; the public shapes are in ../types.ts
// Assembly: placement, seams (written and automatic), assembly-time checks.
import { qtoks, unq } from './lex';
import { KnitError } from './rows';
import { evalExpr, expandVars, UnknownName } from './expr';
import { edgeOf, edgeLen, splitTop, toIn, EdgeError } from './edges';
import { sizeCheck } from './build';

const fail = (m) => { throw new KnitError(m); };
const LEN = /^(-?\d*\.?\d+)(in|cm)$/;
const lenIn = (t) => { const m = LEN.exec(t || ''); if (!m) fail(`expected a length like 2in, not "${t}"`); return toIn(+m[1], m[2]); };

export const SPOTS = new Set(['front', 'back', 'left_arm', 'right_arm', 'neck', 'head', 'scarf', 'table',
  'torso', 'front_left', 'front_right', 'shoulders', 'left_hand', 'right_hand', 'left_foot', 'right_foot', 'waist', 'left_leg', 'right_leg', 'crotch']);
const METHODS = new Set(['mattress', 'whip', 'backstitch', 'graft', '3needle', 'tie', 'zipper', 'buttons']);

const CLOSED_CAST_ONS = new Set(['judys', 'judy', 'magic', 'turkish', 'figure8', 'figure_8']);

export function assemble(doc, G) {
  const built = doc.built; const errors = doc.errors; const checks = doc.checks;
  const seams = []; const placed = {}; const pairs = {};
  const A = { G, built, seams, placed, pairs, stuffed: [], trims: [], folds: [] };
  // statements of every assemble block, in order
  for (const blk of G.asm) runAsm(A, blk.body, Object.create(blk.vars));

  // automatic seams: pick-ups, live joins, hems, closed tops
  const auto = (a, b, line, kind, check) => {
    try {
      const SA = edgeOf(built, a), SB = edgeOf(built, b);
      const la = edgeLen(SA), lb = edgeLen(SB);
      const diff = Math.abs(la - lb) / Math.max(la, lb, 1e-6);
      const level = diff < 0.05 ? 'ok' : diff < 0.15 ? 'ease' : 'bad';
      const s = { a, b, A: SA, B: SB, la, lb, diff, level: check ? level : 'ok', line, auto: true, kind };
      seams.push(s);
      if (check) {
        // N sts at this piece's gauge against the edge; never an error (bands are often picked up tight)
        const P = built.pieces[a.split('.')[0]]; const own = check.n / P.sg;
        const d2 = Math.abs(own - lb) / Math.max(own, lb, 1e-6);
        const span = edgeUnits(built, SB);
        const text = `pick up ${check.n} sts from ${span} (${b}): ${own.toFixed(1)}″ on ${lb.toFixed(1)}″` + (d2 >= 0.15 ? ` — ${Math.round(d2 * 100)}% ${own < lb ? 'tight' : 'loose'}` : '');
        checks.push({ kind: 'seam', line, ok: true, level: d2 < 0.05 ? 'ok' : d2 < 0.15 ? 'ease' : 'bad', text });
        if (d2 >= 0.15) errors.push({ line, level: 'warn', msg: `Pick-up: ${text}` });
      }
      return s;
    } catch (e) { errors.push({ line, msg: e.message, level: 'error' }); return null; }
  };
  built.order.forEach((P) => {
    (P.pickups || []).forEach((pu) => { const s = auto(pu.own, pu.expr, pu.line, 'pickup', { n: pu.n }); if (s) s.srcPieces = new Set(s.B.map((x) => x.piece)); });
    (P.links || []).forEach((l) => { const s = auto(l.a, l.b, l.line, 'join', false); if (s) s.stage = 0; });
    if (P.folded && P.folded.joinRow != null) { const s = auto(`${P.name}.bottom`, `${P.name}.row[${P.folded.joinRow}]`, P.folded.line, 'hem', false); if (s) { s.stage = 0; s.hidden = true; } }
    // a closed top (close), or a closed cast-on (Judy's, Turkish, figure-8): the edge's two halves meet
    const closeEdge = (edge, line) => {
      try {
        const e = edgeOf(built, `${P.name}.${edge}`); const pts = e[0].pts; const h = Math.floor(pts.length / 2);
        seams.push({ a: `${P.name}.${edge}`, b: '(closed)', A: [{ piece: P.name, pts: pts.slice(0, h + 1) }], B: [{ piece: P.name, pts: pts.slice(h).reverse() }], level: 'ok', stage: 0, hidden: true, auto: true, kind: 'close' });
      } catch (e) { errors.push({ line, msg: e.message, level: 'error' }); }
    };
    if (P.closed) closeEdge('top', P.closed.line);
    if (P.mode !== 'flat' && CLOSED_CAST_ONS.has(P.coMethod)) closeEdge(P.topDown ? 'top' : 'bottom', P.coLine);
  });
  // assembly order = the order of the written seams; pick-ups join right after their sources are sewn
  let k = 0; seams.forEach((s) => { if (!s.auto) s.stage = k++; });
  const piecesOf = (s) => new Set([...(s.A || []), ...(s.B || [])].map((x) => x.piece));
  seams.forEach((s) => {
    if (!s.auto || s.stage != null) return;
    const src = s.srcPieces || new Set();
    const first = seams.find((o) => !o.auto && src.size > 1 && [...src].every((p) => piecesOf(o).has(p)));
    s.stage = first ? first.stage + 0.6 : 0;
  });
  built.order.forEach((P) => {
    if (P.round && P.nrows) {
      try { seams.push({ a: `${P.name}.left`, b: `${P.name}.right`, A: edgeOf(built, `${P.name}.left`), B: edgeOf(built, `${P.name}.right`), hidden: true, level: 'ok', stage: 0, auto: true, kind: 'round' }); }
      catch { /* a round piece with no rows */ }
    }
  });
  doc.nStages = Math.max(1, k);

  // pieces linked by join / pick-up follow their source
  const links = {};
  const link = (a, b) => { (links[a] = links[a] || new Set()).add(b); (links[b] = links[b] || new Set()).add(a); };
  built.order.forEach((P) => { (P.pickups || []).forEach((pu) => edgePieces(built, pu.expr).forEach((q) => link(P.name, q))); (P.links || []).forEach((l) => link(P.name, l.piece)); });
  for (let pass = 0; pass < built.order.length; pass++) {
    let changed = false;
    built.order.forEach((P) => {
      if (placed[P.name] || !P.nrows) return;
      const nb = [...(links[P.name] || [])].find((q) => placed[q]);
      if (!nb) return;
      const isNeckband = (P.pickups || []).some((pu) => /\.neck\b|\.top\b/.test(pu.expr)) && !P.links.length;
      placed[P.name] = isNeckband && !['torso', 'table', 'head'].includes(placed[nb]) ? 'neck' : placed[nb];
      changed = true;
    });
    if (!changed) break;
  }
  // v1: a picked-up piece with nothing placed goes at the neck
  built.order.forEach((P) => { if (!placed[P.name] && P.pickup) placed[P.name] = 'neck'; });
  built.order.forEach((P) => { if (!placed[P.name] && P.nrows) errors.push({ line: P.line, level: 'warn', msg: `${P.name} has no "place" in assemble — it won't appear in 3D` }); });

  // stitches left live or held that nothing used
  built.order.forEach((P) => {
    const held = Object.entries(P.holders || {}).filter(([, h]) => h.length && h.length > 0);
    const usedBy = (nm) => seams.some((s) => [s.a, s.b].some((e) => typeof e === 'string' && e.includes(`${P.name}.${nm}`)));
    for (const [nm, h] of held) if (!usedBy(nm) && nm !== 'provisional') errors.push({ line: P.line, level: 'warn', msg: `${P.name}: ${h.length} held sts "${nm}" are never used (join, seam or bind_off them)` });
    if (P.live && P.live.length && !P.top && !usedBy('live') && !usedBy('top')) errors.push({ line: P.line, level: 'warn', msg: `${P.name} ends with ${P.live.length} live sts (bind_off, gather, close or hold them)` });
  });

  doc.seams = seams; doc.placed = placed; doc.pairs = pairs; doc.stuffed = A.stuffed; doc.trims = A.trims; doc.folds = A.folds;
}

/** "55 rows" / "40 sts" / "55 rows + 12 sts": an edge measured in rows (vertical runs) and stitches (horizontal). */
function edgeUnits(built, segs) {
  let rows = 0, sts = 0;
  for (const sg of segs) { const Q = built.pieces[sg.piece]; for (let i = 1; i < sg.pts.length; i++) { const dx = Math.abs(sg.pts[i].x - sg.pts[i - 1].x), dy = Math.abs(sg.pts[i].y - sg.pts[i - 1].y); if (dy > dx) rows += dy * Q.rg; else sts += dx * Q.sg; } }
  rows = Math.round(rows); sts = Math.round(sts);
  return [rows ? `${rows} rows` : '', sts ? `${sts} sts` : ''].filter(Boolean).join(' + ') || '1 st';
}
function edgePieces(built, expr) { try { return [...new Set(edgeOf(built, expr).map((s) => s.piece))]; } catch { return []; } }

function ex(G, text, vars) {
  try { return expandVars(text, vars, G.groups); }
  catch (e) { fail(e instanceof UnknownName ? `\${${e.expr}}: unknown name "${e.name0}"` : `\${${e.expr || ''}}: ${e.message}`); }
}

function runAsm(A, nodes, vars) {
  for (const nd of nodes) {
    try { asmStmt(A, nd, vars); }
    catch (e) { const user = e instanceof KnitError || e instanceof UnknownName || e instanceof EdgeError; A.G.err(nd.line, user ? e.message : 'Internal error: ' + e.message); if (!user) console.error(e); }
  }
}

function asmStmt(A, nd, vars) {
  const { G, built } = A;
  const head = ex(G, nd.text, vars);
  const t = qtoks(head); const k = t[0];
  if (nd.kind === 'block') {
    if (k === 'if') {
      const c = (h) => { try { return !!evalExpr(h, vars, G.groups); } catch (e) { fail(`if: ${e.message}`); } };
      if (c(head.replace(/^if\s+/, ''))) return runAsm(A, nd.body, Object.create(vars));
      for (const e of nd.elses || []) { const h = ex(G, e.text, vars).replace(/^else\s*/, ''); if (!h || (/^if\s/.test(h) && c(h.replace(/^if\s+/, '')))) return runAsm(A, e.body, Object.create(vars)); }
      return;
    }
    if (k === 'for') {
      const m = /^for\s+([a-z_][a-z0-9_]*)\s+in\s+(.*)$/i.exec(head); if (!m) fail('for VAR in A..B { … }');
      const r = /^(-?\d+)\s*\.\.\s*(-?\d+)$/.exec(m[2].trim());
      const vals = r ? Array.from({ length: Math.abs(+r[2] - +r[1]) + 1 }, (_, i) => +r[1] + (+r[2] >= +r[1] ? i : -i)) : qtoks(m[2]).map(unq);
      for (const v of vals) { const sc = Object.create(vars); sc[m[1]] = v; runAsm(A, nd.body, sc); }
      return;
    }
    fail(`"${k} { … }" is not allowed in assemble`);
  }
  switch (k) {
    case 'place': return place(A, t, nd.line);
    case 'seam': return seam(A, head, nd.line);
    case 'expect': return asmExpect(A, t, nd.line);
    case 'gather': { const e = t[1]; if (!e) fail('gather EDGE [to LEN|P%]'); edgeOf(built, e); const P = built.pieces[e.split('.')[0]]; if (P && /\.(top|bottom)$/.test(e) && /top$/.test(e)) P.gather = true; return; }
    case 'stuff': { const P = built.pieces[t[1]]; if (!P) fail(`stuff: unknown piece "${t[1]}"`); A.stuffed.push({ piece: P.name, how: t[2] || null }); return; }
    case 'trim': case 'embroider': { const ai = t.indexOf('at'); if (ai < 0) fail(`${k} … at PLACE`); for (const p of t.slice(ai + 1)) { if (p === 'yarn') break; edgeOf(built, p); } A.trims.push({ kind: k, what: t.slice(1, ai).join(' '), at: t.slice(ai + 1), line: nd.line }); return; }
    case 'buttons': { const oi = t.indexOf('on'); if (oi < 0) fail('buttons N on EDGE [at LEN …]'); edgeOf(built, t[oi + 1]); return; }
    case 'fold': { const P = built.pieces[t[1]]; if (!P) fail(`fold: unknown piece "${t[1]}"`); if (t[2] !== 'at' || !P.markers[t[3]]) fail(`fold ${t[1]} at MARKER [out]: no marker "${t[3]}"`); A.folds.push({ piece: P.name, marker: t[3], out: t[4] === 'out', line: nd.line }); return; }
    case 'let': { const m = /^let\s+([a-z_][a-z0-9_]*)\s*=\s*(.+)$/i.exec(head); if (!m) fail('let NAME = VALUE'); try { vars[m[1]] = evalExpr(m[2], vars, G.groups); } catch { vars[m[1]] = unq(m[2]); } return; }
    case 'note': case 'end': return;
  }
  fail(`Unknown assemble statement "${k}". Expected place, seam, expect, gather, stuff, trim, embroider, buttons or fold`);
}

function place(A, t, line) {
  const { built, placed, pairs } = A;
  const name = t[1];
  if (t[2] !== 'at' || !t[3]) fail('place PIECE at SPOT [SPOT [mirrored]]');
  if (!built.pieces[name]) fail(`place: unknown piece "${name}"`);
  const spots = t.slice(3).filter((s) => s !== 'mirrored');
  for (const s of spots) if (!SPOTS.has(s)) fail(`place: unknown spot "${s}" (${[...SPOTS].join(', ')})`);
  placed[name] = spots[0];
  if (spots.length > 1) pairs[name] = { spots, mirrored: t.includes('mirrored') };
}

function seam(A, head, line) {
  const { built, seams, G } = A;
  const m = /^seam\s+(.+?)\s*=\s*(.+)$/.exec(head);
  if (!m) fail('seam EDGE = EDGE [using METHOD] [ease LEN | gather]');
  const a = m[1].trim(); let rest = m[2].trim();
  const opts = {};
  const om = /\s+(using\s+\S+(?:\s+\S+in)?|ease\s+\S+|gather)(?:\s+(using\s+\S+(?:\s+\S+in)?|ease\s+\S+|gather))*\s*$/.exec(rest);
  if (om) {
    const tail = rest.slice(om.index).trim(); rest = rest.slice(0, om.index).trim();
    const tt = tail.split(/\s+/);
    for (let i = 0; i < tt.length; i++) {
      if (tt[i] === 'using') { opts.using = tt[++i]; if (!METHODS.has(opts.using)) fail(`seam using ${opts.using}: methods are ${[...METHODS].join(', ')}`); if (opts.using === 'zipper' && LEN.test(tt[i + 1] || '')) opts.zipper = lenIn(tt[++i]); }
      else if (tt[i] === 'ease') opts.ease = lenIn(tt[++i]);
      else if (tt[i] === 'gather') opts.gather = true;
    }
  }
  const b = rest;
  const SA = edgeOf(built, a), SB = edgeOf(built, b);
  const la = edgeLen(SA), lb = edgeLen(SB);
  const pointish = la < 1e-6 || lb < 1e-6;
  const diff = Math.abs(la - lb) / Math.max(la, lb, 1e-6);
  let level = diff < 0.05 ? 'ok' : diff < 0.15 ? 'ease' : 'bad';
  if (pointish || opts.gather || opts.using === 'buttons') level = 'ok';
  if (opts.ease != null) level = Math.abs(Math.abs(la - lb) - opts.ease) <= Math.max(0.5, 0.15 * opts.ease) ? 'ok' : 'bad';
  const s = { a, b, A: SA, B: SB, la, lb, diff, level, line, auto: false, using: opts.using || 'mattress' };
  seams.push(s);
  const text = `${a} = ${b}: ${la.toFixed(1)}″ vs ${lb.toFixed(1)}″` + (opts.ease != null ? ` (ease ${opts.ease.toFixed(1)}″)` : opts.gather ? ' (gathered)' : '') + (level === 'ease' ? ` — ease in ${Math.abs(la - lb).toFixed(1)}″` : level === 'bad' ? ` — ${Math.round(diff * 100)}% mismatch` : '');
  A.G.doc.checks.push({ kind: 'seam', line, ok: level !== 'bad', level, text });
  if (level === 'bad') G.warn(line, `Seam lengths differ by ${Math.round(diff * 100)}%: ${a} (${la.toFixed(1)}″) vs ${b} (${lb.toFixed(1)}″)`);
  if (opts.zipper != null) {
    const zl = Math.max(la, lb); const d = Math.abs(zl - opts.zipper); const tol = Math.max(0.5, 0.05 * zl);
    A.G.doc.checks.push({ kind: 'seam', line, ok: d <= tol, level: d <= tol ? 'ok' : 'bad', text: `zipper ${opts.zipper.toFixed(1)}″ on ${zl.toFixed(1)}″ of edge` });
  }
}

function asmExpect(A, t, line) {
  const { built, G } = A;
  const what = t[1]; if (what !== 'length' && what !== 'width') fail('in assemble: expect length|width LEN of EDGE  or  expect length LEN from POINT to POINT');
  const want = lenIn(t[2]);
  let within = null; const wi = t.indexOf('within'); if (wi >= 0) { const w = t[wi + 1]; within = /%$/.test(w) ? { pct: parseFloat(w) / 100 } : { len: lenIn(w) }; }
  const oi = t.indexOf('of'), fi = t.indexOf('from');
  if (oi >= 0) {
    const e = t[oi + 1]; const segs = edgeOf(built, e);
    const P = built.pieces[segs[0].piece];
    sizeCheck(G, { piece: P.name, line, want, got: edgeLen(segs), within, approx: P.approx || G.approx, label: `${what} of ${e}` });
    return;
  }
  if (fi >= 0 && t[fi + 2] === 'to') {
    const p = edgeOf(built, t[fi + 1]), q = edgeOf(built, t[fi + 3]);
    const pp = p[p.length - 1].pts.slice(-1)[0], qq = q[0].pts[0];
    if (p[0].piece === q[0].piece) {
      const P = built.pieces[p[0].piece];
      sizeCheck(G, { piece: P.name, line, want, got: Math.hypot(pp.x - qq.x, pp.y - qq.y), within, approx: P.approx || G.approx, label: `length from ${t[fi + 1]} to ${t[fi + 3]} (straight line)` });
    } else G.doc.checks.push({ kind: 'count', line, ok: true, level: 'ok', text: `length from ${t[fi + 1]} to ${t[fi + 3]}: across pieces, not measured yet` });
    return;
  }
  fail('expect length|width LEN of EDGE  or  expect length LEN from POINT to POINT');
}

export { splitTop };
