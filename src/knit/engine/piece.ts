// @ts-nocheck -- engine internals are loosely typed; the public shapes are in ../types.ts
// The needle model: live stitches, working one row (fabric, written rows, shaping), sections, holders, short rows.
import { workWritten, parseRow, KnitError } from './rows';
import { fabricRowAst, mod } from './fabric';

const fail = (m) => { throw new KnitError(m); };
export const flip = (w) => (w === 'k' ? 'p' : w === 'p' ? 'k' : w);

// ---------- Pieces and stitches ----------
export function newPiece(G, name, line, opts = {}) {
  const P = {
    name, line, round: !!opts.round, mode: opts.icord ? 'icord' : opts.round ? 'round' : 'flat', topDown: !!opts.topDown,
    rows: [], stitches: [], needle: [], pos: 0, dir: 1, bounds: [],
    markers: {}, points: {}, holders: {}, named: {}, top: null, gather: false, splitRow: null, splitSts: [],
    yarn: G.defaultYarn, color: G.yarnColor(G.defaultYarn), needleLabel: null, stripes: null, stripeRow: 0,
    expects: [], pickups: [], links: [], colIdN: 0, slidePending: false, inFabs: {}, origin: null, warned: {},
    sg: 5, rg: 7, approx: false, consumed: [],
  };
  const g = G.gaugeFor(null, null); P.sg = g.sg; P.rg = g.rg; P.approx = g.approx;
  return P;
}
export function mkSt(P, o) {
  o.id = P.stitches.length; o.piece = P.name; if (!o.color) o.color = P.color; if (!o.children) o.children = [];
  if (o.colId === undefined) o.colId = P.colIdN++;
  P.stitches.push(o); return o;
}
const secOf = (s) => s.sec || '';

/** Put a fresh set of stitches (RS order) on the needle as row 0 (a start statement). */
export function startNeedle(P, sts, line, desc, ws) {
  const row = { index: 0, dir: 'CO', line, desc, stitches: sts.slice(), fabric: 'cast on' };
  P.rows.push(row); P.needle = sts.slice(); layoutFresh(P.needle);
  P.pos = ws ? sts.length : 0; P.dir = ws ? -1 : 1;
  P.markers.start = { row: 0, lenMap: {}, maxLen: 0, gmax: Math.max(0, ...sts.map((s) => s.glen || 0)) };
}
export function layoutFresh(sts) { const n = sts.length; sts.forEach((s, i) => { s.x = (n - 1) / 2 - i; }); }

/** New stitches for a start statement or a mid-piece pick-up. */
export function freshSts(P, n, op, line, extra = {}) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(mkSt(P, { x: 0, row: P.rows.length ? P.rows.length - 1 : 0, op, t: 'k', parents: [], line, sec: extra.sec ?? '', fp: extra.fp || null, col: i, prow: 0, len: extra.len || 0, glen: extra.glen || 0, yarn: P.yarn, color: P.color }));
  return out;
}

// ---------- Fabric in force ----------
/** Assign fabric parts [{fab, count, sec, shift}] across the live needle (RS order). Same fabric → phase continues. */
export function assignFabric(P, parts, G, mirror) {
  const N = P.needle; if (!N.length) return;
  const ps = mirror ? parts.slice().reverse() : parts;
  const secCount = (s, from) => { let k = 0; for (let i = from; i < N.length && secMatch(N[i], s); i++) k++; return k; };
  // every part names a section: each goes on its section wherever it is; other stitches keep their fabric
  if (ps.every((p) => p.sec)) {
    for (const part of ps) {
      const run = N.filter((s) => secMatch(s, part.sec));
      if (!run.length) fail(`no live section "${part.sec}" here for the fabric part`);
      if (run.every((s) => s.fp && s.fp.fab.name === part.fab.name && (s.fp.shift || 0) === (part.shift || 0))) continue;
      const fp = { fab: part.fab, shift: part.shift || 0 };
      run.forEach((s, k) => { s.fp = fp; s.col = k; s.prow = part.row0 || 0; });
    }
    return;
  }
  let i = 0;
  ps.forEach((part, pi) => {
    let take;
    if (part.sec) take = secCount(part.sec, i);
    else if (part.count != null) take = part.count;
    else {
      // fill: what is left after the fixed parts that follow
      let after = 0, j = i;
      for (const q of ps.slice(pi + 1)) { if (q.sec) { after += N.filter((s) => secMatch(s, q.sec)).length; } else if (q.count != null) after += q.count; else fail('only one fabric part may leave out its count'); void j; }
      take = N.length - i - after;
    }
    if (take < 0 || i + take > N.length) fail(`fabric parts don't fit: ${N.length} live sts`);
    if (part.sec && !take) fail(`no live section "${part.sec}" here for the fabric part`);
    const run = N.slice(i, i + take); i += take;
    const same = run.length && run.every((s) => s.fp && s.fp.fab.name === part.fab.name && (s.fp.shift || 0) === (part.shift || 0));
    if (same) return;
    const fp = { fab: part.fab, shift: part.shift || 0 };
    run.forEach((s, k) => { s.fp = fp; s.col = k; s.prow = part.row0 || 0; });
  });
  if (i !== N.length) fail(`the fabric parts cover ${i} of ${N.length} live sts`);
}
const secMatch = (s, name) => secOf(s) === name || secOf(s).startsWith(name + '_');

// ---------- Planning a row in pattern ----------
function lookOf(st, side, mode) {
  const fp = st.fp; if (!fp) return 'k';
  const f = fp.fab;
  if (f.kind === 'builtin') return f.fn((st.col || 0) + (fp.shift || 0), st.prow || 0, { round: mode !== 'flat', side });
  return st.t || 'k';
}
const pureRep = (ast) => ast.length === 1 && ast[0].t === 'rep' && ast[0].body.every((n) => n.t === 'w' && n.info.in === 1 && n.info.out === 1);

/** Units for working W[a..b) in pattern. */
function planRun(P, G, W, a, b, side, ri) {
  const units = []; const s0 = W[a]; const fp = s0.fp; const mode = P.mode;
  const asisUnits = (from, to) => { for (let k = from; k < to; k++) units.push({ ins: [k], outs: [{ w: side === 'RS' ? lookOf(W[k], side, mode) : flip(lookOf(W[k], side, mode)) }] }); };
  if (!fp || fp.fab.kind === 'builtin') {
    for (let k = a; k < b; k++) { const l = lookOf(W[k], side, mode); units.push({ ins: [k], outs: [{ w: side === 'RS' ? l : flip(l), word: l }] }); }
    return units;
  }
  const f = fp.fab; const round = mode !== 'flat';
  let ast;
  try { ast = fabricRowAst(f, s0.prow || 0, side, round, G.keys, G.yarns, P.yarn); } catch (e) { G.warnOnce(P, f.name + e.message, G.line, e.message); asisUnits(a, b); return units; }
  if (ast.length === 1 && ast[0].t === 'asis') { asisUnitsLook(); return units; }
  if (pureRep(ast)) {
    const L = ast[0].body.length; const c = (s0.col || 0) + (fp.shift || 0);
    const run = W.slice(a, b); const maxCol = Math.max(...run.map((s) => s.col || 0));
    let rot;
    const flipped = f.kind === 'chart' ? side === 'WS' : (!f.quoted && writtenSide(f, s0.prow || 0, round) !== side);
    if (side === 'RS' || P.dir > 0) rot = mod(c, L);
    else if (flipped) rot = mod(L - 1 - mod(c, L), L);
    else rot = mod(maxCol - (s0.col || 0) + (fp.shift || 0), L);
    if (rot) { const body = ast[0].body; ast = [{ t: 'rep', stops: false, body: body.slice(rot).concat(body.slice(0, rot)) }]; }
  }
  const sub = W.slice(a, b);
  try {
    const res = workWritten(ast, {
      W: sub, bnd: () => false, gaps: [], named: () => -1, patUnits: () => fail('pat inside a fabric row'),
      asis: (k) => (side === 'RS' ? sub[k].t || 'k' : flip(sub[k].t || 'k')), side, exact: false, partial: true, lenient: true,
      warn: (m) => G.warnOnce(P, f.name + m, G.line, `${f.name}: ${m}`),
    });
    res.units.forEach((u) => units.push({ ...u, ins: u.ins.map((k) => k + a) }));
    if (res.end < sub.length) { G.warnOnce(P, f.name + 'short', G.line, `${f.name}: the pattern row covers ${res.end} of ${sub.length} sts; the rest are worked as they appear`); asisUnits(a + res.end, b); }
  } catch (e) {
    G.warnOnce(P, f.name + e.message, G.line, `${f.name} row ${(s0.prow || 0) % f.nrows + 1}: ${e.message}; worked as the stitches appear`);
    asisUnits(a, b);
  }
  return units;
  function asisUnitsLook() { for (let k = a; k < b; k++) units.push({ ins: [k], outs: [{ w: side === 'RS' ? W[k].t || 'k' : flip(W[k].t || 'k') }] }); }
}
function writtenSide(f, r, round) { return f.round || round || f.quoted ? 'RS' : (mod(r, f.nrows) % 2 === 0 ? 'RS' : 'WS'); }

function plan(P, G, W, side, ri) {
  const units = []; let a = 0;
  while (a < W.length) {
    let b = a + 1;
    while (b < W.length && W[b].fp === W[a].fp && (W[a].fp == null || W[a].fp.fab.kind === 'builtin' || (W[b].prow || 0) === (W[a].prow || 0))) b++;
    units.push(...planRun(P, G, W, a, b, side, ri));
    a = b;
  }
  return units;
}

// ---------- The work sequence of the next row ----------
export function workSeq(P, opts = {}) {
  const N = P.needle, n = N.length; const idx = [];
  if (!n) return idx;
  if (P.mode === 'flat') {
    if (P.dir > 0) for (let i = P.pos; i < n; i++) idx.push(i); else for (let i = P.pos - 1; i >= 0; i--) idx.push(i);
  } else if (P.dir > 0) {
    const full = opts.turn || opts.over;
    const len = full ? n : n - P.pos;
    for (let k = 0; k < len; k++) idx.push((P.pos + k) % n);
    for (let k = 0; k < (opts.over || 0); k++) idx.push(k % n);
  } else {
    for (let k = 1; k <= n; k++) idx.push(mod(P.pos - k, n));
  }
  return idx;
}
const astHas = (ast, t) => ast.some((nd) => nd.t === t || ((nd.t === 'rep' || nd.t === 'opt' || nd.t === 'in') && astHas(nd.body, t)));
const astOver = (ast) => { for (const nd of ast) if (nd.t === 'over') return nd.n; return 0; };

// ---------- Places for shaping ----------
/** The region a WHERE refers to: needle indices in RS order. */
function regionOf(P, sec) {
  const N = P.needle, n = N.length;
  if (!sec) return N.map((_, i) => i);
  const idx = []; N.forEach((s, i) => { if (secMatch(s, sec)) idx.push(i); });
  if (!idx.length) fail(`no live section "${sec}"`);
  // a section straddling the round start begins after its gap
  if (P.mode !== 'flat' && idx.length < n && idx[0] === 0 && idx[idx.length - 1] === n - 1) {
    let k = 1; while (k < idx.length && idx[k] === idx[k - 1] + 1) k++;
    return idx.slice(k).concat(idx.slice(0, k));
  }
  return idx;
}
const sectionList = (P) => { const out = []; P.needle.forEach((s) => { const c = secOf(s); if (!out.includes(c)) out.push(c); }); return out; };

/** places: [{R, b, inward, owner}] — b is a boundary in R (0..len); inward +1 = the stitches R[b], R[b+1]…, -1 = R[b-1], R[b-2]… */
function placesOf(P, wh, item, mirror) {
  const out = [];
  const regions = wh.sec === 'each' ? sectionList(P).map((s) => regionOf(P, s)) : [regionOf(P, wh.sec)];
  let w = wh.where;
  if (mirror && w === 'left') w = 'right'; else if (mirror && w === 'right') w = 'left';
  for (const R of regions) {
    const L = R.length;
    const right = { R, b: 0, inward: 1 }, left = { R, b: L, inward: -1 };
    const fwd = P.dir > 0;
    if (w === 'right') out.push(right);
    else if (w === 'left') out.push(left);
    else if (w === 'start') out.push(fwd ? right : left);
    else if (w === 'end') out.push(fwd ? left : right);
    else if (w === 'edges') { if (fwd) out.push(right, left); else out.push(left, right); }
    else if (w === 'center') out.push({ R, center: true });
    else if (w === 'evenly') out.push({ R, evenly: true });
    else if (w === 'at') for (const I of wh.at) out.push(I >= 0 ? { R, b: I, inward: 1 } : { R, b: L + I, inward: -1 });
    else if (w === 'markers') {
      const N = P.needle, n = N.length; const bs = [];
      for (let i = 1; i < n; i++) if (secOf(N[i]) !== secOf(N[i - 1])) bs.push(i);
      if (P.mode !== 'flat' && n > 1 && secOf(N[0]) !== secOf(N[n - 1])) bs.push(n);
      if (!bs.length) fail('"markers": there are no section boundaries (declare sections first)');
      const all = N.map((_, i) => i).concat(N.map((_, i) => i));
      for (const b of bs) { const Rb = all.slice(b % n, b % n + n); out.push({ R: Rb, b: n, inward: -1, before: true }); out.push({ R: all.slice(b % n, b % n + n), b: 0, inward: 1 }); }
      if (!fwd) out.reverse();
    } else if (w === 'neck') {
      const sp = P.bounds.filter((x) => x.kind === 'split').map((x) => x.b).filter((b) => b > 0 && b < P.needle.length);
      if (!sp.length) fail('"neck" needs a split piece (after a centre bind-off or hold)');
      const all = P.needle.map((_, i) => i);
      for (const b of sp) { out.push({ R: all, b, inward: -1 }); out.push({ R: all, b, inward: 1 }); }
    } else if (w === 'all' || w === 'section') out.push({ R, all: true });
    else fail(`unknown place "${w}"`);
  }
  return out;
}

// ---------- One row ----------
/**
 * req: { fabric: parts|null, written: ast|null, shaping: [items], line, desc, fabName }
 * Returns a summary of the row.
 */
export function workRow(P, G, req) {
  const N = P.needle; const n = N.length;
  if (!n) fail('No live stitches (bound off or held? use resume or join)');
  if (req.fabric) assignFabric(P, req.fabric, G, req.mirror);
  const ri = P.rows.length; const line = req.line;
  const ast = req.written;
  const over = ast ? astOver(ast) : 0;
  const widx = workSeq(P, { turn: ast && astHas(ast, 'turn'), over: P.mode !== 'flat' ? over : 0 });
  const W = widx.map((i) => N[i]);
  if (!W.length) fail('No stitches to work in this direction');
  const side = P.mode !== 'flat' && P.dir > 0 ? 'RS' : P.dir > 0 ? 'RS' : 'WS';
  const wpos = new Map(); widx.forEach((i, k) => { if (!wpos.has(i)) wpos.set(i, k); });
  // gaps as W indices: a gap bound before W[k] in work order
  const gapB = P.bounds.filter((x) => x.kind === 'gap').map((x) => x.b);
  const boundBefore = (k) => { if (k === 0) return null; const i = widx[k], j = widx[k - 1]; if (P.dir > 0) return (j + 1) % n === i ? (i === 0 ? n : i) : null; return (i + 1) % n === j ? (j === 0 ? n : j) : null; };
  const gapsW = []; for (let k = 1; k < W.length; k++) { const b = boundBefore(k); if (b != null && gapB.some((g) => g === b || (P.mode !== 'flat' && mod(g, n) === mod(b, n)))) gapsW.push(k); }

  let units, res = { turn: false, slide: false, over: 0, names: [], points: [] };
  let planned = null;
  const planOnce = () => (planned = planned || plan(P, G, W, side, ri));
  if (ast) {
    res = workWritten(ast, {
      W, bnd: (k) => k > 0 && k < W.length && secOf(W[k]) !== secOf(W[k - 1]), gaps: gapsW,
      named: (name, from) => { for (let k = Math.max(from, 0) + (from > 0 ? 0 : 0); k < W.length; k++) { if ((W[k].pm || []).includes(name)) return k; if (secOf(W[k]) === name && (k === 0 || secOf(W[k - 1]) !== name) && k >= from) return k; } return -1; },
      patUnits: (a, b) => { const pl = planOnce(); const out = []; for (const u of pl) { if (!u.ins.length) continue; const lo = Math.min(...u.ins), hi = Math.max(...u.ins); if (lo >= a && hi < b) out.push(u); else if (hi >= a && lo < b) { for (const k of u.ins) if (k >= a && k < b) out.push({ ins: [k], outs: [{ w: side === 'RS' ? W[k].t || 'k' : flip(W[k].t || 'k') }] }); } } return out; },
      asis: (k) => (side === 'RS' ? W[k].t || 'k' : flip(W[k].t || 'k')), side, exact: true, partial: false,
      warn: (m) => G.warn(line, m),
    });
    units = res.units;
    if (over && P.mode !== 'flat') { // the first N stitches are worked by the cross at the end of the round
      units = units.filter((u) => !u.ins.length || Math.max(...u.ins) >= over);
      units.forEach((u) => { u.ins = u.ins.map((k) => (k >= n ? k - n : k)); });
    }
  } else units = planOnce().map((u) => ({ ...u, outs: u.outs.map((o) => ({ ...o })) }));
  const end = ast ? Math.min(res.end, n) : W.length;

  // ----- shaping -----
  const uOf = new Array(W.length).fill(null);
  units.forEach((u) => u.ins.forEach((k) => { uOf[k] = u; }));
  const inserts = new Map(); // W boundary -> [made units]
  const touched = new Set();
  const notes = [];
  let usingIdx = 0;
  const needW = (i) => { const k = wpos.get(i); if (k === undefined || k >= end) fail('that place is not in this row (short row?)'); return k; };
  const boundaryW = (R, b) => {
    // W boundary (insert before W[k]) between R[b-1] and R[b] (RS order)
    const L = R.length; const w = (i) => { const k = wpos.get(i); if (k === undefined) fail('that place is not in this row (short row?)'); return k; };
    if (P.dir > 0) return b < L ? w(R[b]) : w(R[L - 1]) + 1;
    return b > 0 ? w(R[b - 1]) : w(R[0]) + 1;
  };
  const stitchesAt = (pl, k) => { const out = []; for (let j = 0; j < k; j++) { const r = pl.inward > 0 ? pl.b + j : pl.b - 1 - j; if (r < 0 || r >= pl.R.length) fail(`not enough stitches for the shaping (${pl.R.length} in that place)`); out.push(pl.R[r]); } return out; };
  const usingFor = (item) => { if (!item.using) return null; const u = item.using[usingIdx % item.using.length]; usingIdx++; return u; };
  const merge = (ks, lean, word) => {
    ks.forEach((k) => { if (touched.has('m' + k)) { fail('shaping places overlap'); } touched.add('m' + k); });
    const us = [...new Set(ks.map((k) => uOf[k]))]; if (us.some((u) => !u)) fail('that place is not in this row');
    if (us.some((u) => u.bo || u.hold)) fail('shaping places overlap');
    const outs = us.flatMap((u) => u.outs); const drop = ks.length - 1;
    if (outs.length - drop < 1) fail('not enough stitches to decrease');
    const keep = outs.slice(drop); keep[0] = { ...keep[0], op: 'dec', lean, word: word || keep[0].word };
    if (us.length === 1) { us[0].outs = keep; return; }
    const nu = { ins: us.flatMap((u) => u.ins).sort((a, b) => a - b), outs: keep };
    const at = units.indexOf(us[0]); units.splice(at, 1, nu);
    us.slice(1).forEach((u) => units.splice(units.indexOf(u), 1));
    nu.ins.forEach((k) => { uOf[k] = nu; });
  };
  const madeAt = (kb, outs) => { if (!inserts.has(kb)) inserts.set(kb, []); inserts.get(kb).push({ ins: [], outs, made: true }); };
  const holdUnits = (ks, name) => ks.forEach((k) => { const u = uOf[k]; if (!u) fail('that place is not in this row'); if (touched.has('h' + k)) fail('shaping places overlap'); touched.add('h' + k); u.hold = name; });
  const boUnits = (ks, name) => ks.forEach((k) => { const u = uOf[k]; if (!u) fail('that place is not in this row'); if (touched.has('h' + k)) fail('shaping places overlap'); touched.add('h' + k); u.bo = true; u.outs = u.outs.map((o) => ({ ...o, op: 'bo', name: name || o.name })); });
  const centerRun = (R, k) => { const L = R.length; if (k > L) fail(`can't take ${k} of ${L} sts at the centre`); const rest = L - k; const before = Math.floor(rest / 2); const s = P.dir > 0 ? before : rest - before; return R.slice(s, s + k); };

  for (const item of req.shaping || []) {
    const v = item.verb; const nn = item.n ?? 1;
    if (v === 'dec_every') {
      const all = W.slice(0, end).map((_, k) => k); const g = Math.floor(all.length / item.every);
      if (!g) fail(`only ${all.length} sts: can't work "dec every ${item.every}"`);
      if (all.length % item.every) G.warn(line, `${all.length} sts isn't a multiple of ${item.every}; ${all.length % item.every} st(s) left over`);
      for (let q = 0; q < g; q++) { const e = (q + 1) * item.every; merge([e - 2, e - 1], 'r', 'k2tog'); }
      notes.push(item.every > 2 ? `*k${item.every - 2}, k2tog*` : 'k2tog around'); continue;
    }
    if (!nn && v !== 'hold') { continue; }
    if (v === 'hold' && item.holdCo) {
      const R = regionOf(P, item.holdCo.sec); const ks = R.map(needW);
      holdUnits(ks, item.as || item.holdCo.sec);
      const kb = Math.min(...ks); const name = item.holdCo.name;
      madeAt(P.dir > 0 ? kb : Math.max(...ks) + 1, Array.from({ length: item.holdCo.n }, () => ({ w: 'k', op: 'co', sec: name || secOf(N[R[0]]), name })));
      notes.push(`hold ${item.holdCo.sec}, cast on ${item.holdCo.n}`); continue;
    }
    for (const wh of item.wheres) {
      const pls = placesOf(P, wh, item, req.mirror);
      for (const pl of pls) {
        const owner = (r) => secOf(N[r]);
        if (pl.all) {
          // `all` is everything the other shaping of this row left alone
          const ks = pl.R.map(needW).filter((k) => wh.where !== 'all' || !touched.has('h' + k));
          if (v === 'hold') holdUnits(ks, item.as || wh.sec || 'all'); else if (v === 'bind_off') boUnits(ks, item.as || wh.sec); else fail(`${v} needs a place: ${wh.sec}.edges, ${wh.sec}.start …`);
          continue;
        }
        if (pl.center || pl.evenly) {
          const R = pl.R, L = R.length;
          if (v === 'bind_off' || v === 'hold') {
            if (pl.evenly) fail(`${v} evenly: use a place`);
            const run = centerRun(R, nn); const ks = run.map(needW);
            if (v === 'hold') holdUnits(ks, item.as || 'center'); else boUnits(ks, item.as);
            if (P.mode === 'flat' && run.length < L) { P._centerSplit = run; }
          } else if (v === 'dec') {
            if (pl.center) { const run = centerRun(R, nn + 1); merge(run.map(needW), null, usingFor(item) || (nn === 2 ? 'cdd' : 'k2tog')); }
            else { if (nn > L / 2) fail(`can't decrease ${nn} evenly over ${L} sts`); for (let q = 0; q < nn; q++) { const e = Math.round((q + 1) * L / nn); merge([R[e - 2], R[e - 1]].map(needW), 'r', usingFor(item) || 'k2tog'); } }
          } else if (v === 'inc') {
            const bs = pl.center ? [Math.floor(L / 2)] : Array.from({ length: nn }, (_, q) => Math.round((q + 1) * L / (nn + 1)));
            const per = pl.center ? nn : 1;
            for (const b of bs) { const u = usingFor(item); if (u && /f[bf]/.test(u)) { extraOut(R[Math.min(b, L - 1)], per, u); continue; } madeAt(boundaryW(R, b), Array.from({ length: per }, () => madeOut(item, u, owner(R[Math.min(b, L - 1)]), pl))); }
          } else if (v === 'cast_on') {
            const split = P.bounds.find((x) => x.kind === 'split' && x.b > 0 && x.b < n);
            if (pl.center && split) { P.bounds = P.bounds.filter((x) => x !== split); madeAt(boundaryW(P.needle.map((_, i) => i), split.b), coOuts(item, nn, owner(R[0]))); }
            else madeAt(boundaryW(R, Math.floor(L / 2)), coOuts(item, nn, owner(R[Math.floor(L / 2)] ?? R[0])));
          } else if (v === 'buttonhole') { const run = centerRun(R, item.wide || 2); run.map(needW).forEach((k) => { const u = uOf[k]; u.outs = u.outs.map((o) => ({ ...o, word: 'buttonhole', hole: true })); }); }
          continue;
        }
        const pli = { ...pl, b: pl.b + (item.inset || 0) * pl.inward };
        if (v === 'dec') {
          const sts = stitchesAt(pli, nn + 1); const u = usingFor(item);
          merge(sts.map(needW), u ? leanOf(u) : pl.inward > 0 ? 'l' : 'r', u || (nn === 1 ? (pl.inward > 0 ? 'ssk' : 'k2tog') : `k${nn + 1}tog`));
        } else if (v === 'inc') {
          const u = usingFor(item);
          if (u && /f[bf]/.test(u)) { const r = pli.inward > 0 ? pli.R[pli.b] : pli.R[pli.b - 1]; extraOut(r, nn, u); continue; }
          madeAt(boundaryW(pli.R, pli.b), Array.from({ length: nn }, () => madeOut(item, u, owner(pli.inward > 0 ? pli.R[Math.min(pli.b, pli.R.length - 1)] : pli.R[Math.max(0, pli.b - 1)]), pl)));
        } else if (v === 'bind_off' || v === 'hold') {
          const sts = stitchesAt(pli, nn); const ks = sts.map(needW);
          if (v === 'hold') holdUnits(ks, item.as || secOf(N[sts[0]]) || 'held'); else boUnits(ks, item.as);
        } else if (v === 'cast_on') {
          madeAt(boundaryW(pli.R, pli.b), coOuts(item, nn, owner(pli.inward > 0 ? pli.R[Math.min(pli.b, pli.R.length - 1)] : pli.R[Math.max(0, pli.b - 1)])));
        } else if (v === 'buttonhole') {
          const sts = stitchesAt(pli, item.wide || 2); sts.map(needW).forEach((k) => { const u = uOf[k]; u.outs = u.outs.map((o) => ({ ...o, word: 'buttonhole', hole: true })); });
        }
      }
    }
    notes.push(item.text);
  }
  function extraOut(r, k, word) { const kw = needW(r); const u = uOf[kw]; for (let q = 0; q < k; q++) u.outs.push({ ...u.outs[u.outs.length - 1], op: 'inc', word }); }
  function madeOut(item, u, sec, pl) {
    const inFab = item.inFab ? (P.inFabs[item.inFab.name + ':' + sec + ':' + (pl.inward || 0)] = P.inFabs[item.inFab.name + ':' + sec + ':' + (pl.inward || 0)] || { fab: item.inFab, shift: 0 }) : null;
    return { w: side === 'RS' ? 'k' : 'p', op: 'inc', lean: u ? leanOf(u) : pl.inward > 0 ? 'r' : 'l', word: u || 'm1', sec, inFab };
  }
  function coOuts(item, k, sec) { return Array.from({ length: k }, () => ({ w: 'k', op: 'co', word: 'co', sec: item.coName || sec, name: item.coName })); }

  // ----- assemble the final unit list (work order) with insertions -----
  const final = [];
  const ins0 = (k) => { const a = inserts.get(k); if (a) final.push(...a); };
  const seen = new Set();
  for (let k = 0; k <= W.length; k++) {
    ins0(k);
    const u = uOf[k];
    if (k < W.length && u && !seen.has(u)) { seen.add(u); final.push(u); }
    if (k < W.length && !u && k < end) { /* worked by nothing: should not happen */ }
  }
  // units with no inputs from the written row (made stitches) keep their place
  units.forEach((u) => { if (!u.ins.length && !seen.has(u)) { seen.add(u); const at = units.indexOf(u); const prev = units.slice(0, at).reverse().find((x) => seen.has(x) && final.includes(x)); final.splice(prev ? final.indexOf(prev) + 1 : 0, 0, u); } });

  // ----- make the stitches -----
  const g = G.gaugeFor(dominantFab(P, W), P.needleLabel);
  const h = P.slidePending ? 0 : 1 / g.rg;
  const rowSts = []; const held = {}; const removed = [];
  let lastSec = null; const newOrigin = [];
  const fwd = P.dir > 0;
  let prevUnitB = null; // boundary after the previous unit (old needle index space)
  let madeK = 0;
  const yarnOf = (o) => o.yarn || (o.yarnCell) || null;
  final.forEach((u, ui) => {
    if (u.hold) { u.ins.forEach((k) => { (held[u.hold] = held[u.hold] || []).push(W[k]); removed.push(widx[k]); }); prevUnitB = fwd ? Math.max(...u.ins.map((k) => widx[k])) + 1 : Math.min(...u.ins.map((k) => widx[k])); return; }
    const parents = u.ins.map((k) => W[k]);
    let lo, hi;
    if (parents.length) { const ix = u.ins.map((k) => widx[k]); lo = Math.min(...ix); hi = Math.max(...ix); if (hi - lo > n / 2) { lo = Math.max(...ix.filter((i) => i < n / 2)); hi = lo; } madeK = 0; }
    const m = u.outs.length;
    // RS order of this unit's outs
    const rsOuts = fwd ? u.outs.map((o, j) => [o, j]) : u.outs.map((o, j) => [o, j]).reverse();
    const nextParentSec = () => { for (let q = ui + 1; q < final.length; q++) if (final[q].ins.length) return secOf(W[final[q].ins[0]]); return ''; };
    const made = [];
    u.outs.forEach((o, j) => {
      let origin;
      if (parents.length) { const rj = fwd ? j : m - 1 - j; origin = lo - 0.4 + (rj + 0.5) / m * (hi - lo + 0.8); }
      else {
        const B = prevUnitB != null ? prevUnitB : fwd ? widx[0] : widx[0] + 1;
        madeK++; origin = B - 0.5 + (fwd ? 1 : -1) * 0.001 * madeK;
      }
      const p0 = parents[Math.min(j, parents.length - 1)];
      const pLast = parents[parents.length - 1];
      // a cable (as many out as in) keeps each position's section, so a cross over a section boundary moves no stitches
      const cablePos = u.ins.length > 1 && u.ins.length === m ? u.ins.slice().sort((a, b) => (fwd ? a - b : b - a)) : null;
      let sec = o.sec ?? (cablePos ? secOf(W[cablePos[j]]) : parents.length ? secOf(u.ins.length > 1 ? (fwd ? pLast : parents[0]) : p0) : (lastSec ?? nextParentSec()));
      const yarn = yarnOf(o) || P.yarn;
      const color = G.yarnColor(yarn, P);
      const st = mkSt(P, {
        x: NaN, row: ri, op: o.op || (m > u.ins.length && parents.length ? (j > 0 ? 'inc' : 'n') : 'n'), t: o.op === 'bo' ? 'k' : side === 'RS' ? o.w || 'k' : flip(o.w || 'k'),
        lean: o.lean, parents, line, sec, word: o.word, yarn, color,
        fp: o.inFab || (p0 ? p0.fp : null), col: p0 ? p0.col : null, prow: p0 ? Math.max(...parents.map((q) => q.prow || 0)) + 1 : null,
        len: parents.length ? Math.max(...parents.map((q) => q.len || 0)) + h : null, glen: parents.length ? Math.max(...parents.map((q) => q.glen || 0)) + h : null,
        colId: p0 && j === 0 ? p0.colId : undefined, hole: o.hole,
      });
      if (o.inFab && !p0) st.col = 0;
      if (j === 0 && parents.length) { const pm = parents.flatMap((q) => q.pm || []); if (pm.length) st.pm = [...new Set(pm)]; }
      parents.forEach((q) => q.children.push(st));
      if (o.name) (P.named[o.name] = P.named[o.name] || { sts: [], kind: o.op === 'bo' ? 'bo' : o.op === 'co' ? 'co' : 'live' }).sts.push(st);
      rowSts.push(st); made.push(st);
      if (o.op === 'bo') { removed.push(origin); st.origin = origin; }
      else newOrigin.push([origin, st]);
      lastSec = sec;
    });
    if (parents.length) prevUnitB = fwd ? hi + 1 : lo;
    void rsOuts;
  });
  // points named in a written row: the stitch just made
  (res.points || []).forEach((p) => { const u = final.filter((x) => !x.hold)[Math.max(0, p.unit - 1)]; const st = rowSts.filter((s) => s.op !== 'bo').find((s) => u && s.parents.length && u.ins.length && s.parents[0] === W[u.ins[0]]) || rowSts[rowSts.length - 1]; if (st) { st.pm = [...new Set([...(st.pm || []), p.name])]; P.points[p.name] = st; } });

  // ----- the new needle -----
  const worked = new Set(widx.slice(0, Math.min(end, widx.length)));
  final.forEach((u) => u.ins.forEach((k) => worked.add(widx[k])));
  const entries = [];
  N.forEach((s, i) => { if (!worked.has(i)) entries.push([i, s]); });
  entries.push(...newOrigin);
  entries.sort((a, b) => a[0] - b[0]);
  const newN = entries.map((e) => e[1]);
  const remap = (b) => entries.filter((e) => e[0] < b - 0.5).length;
  // carry the bounds over
  const nb = [];
  for (const bd of P.bounds) {
    if (bd.kind === 'gap') { const b0 = mod(bd.b, n), bm = b0 === 0 ? n - 1 : b0 - 1; const bb = b0 === 0 ? 0 : b0; if (worked.has(bm) && worked.has(bb) && (P.mode !== 'flat' || b0 !== 0)) continue; }
    nb.push({ ...bd, b: remap(bd.b) });
  }
  // splits where stitches were removed between live ones
  const rem = removed.slice().sort((a, b) => a - b);
  let midRem = null;
  for (let i = 1; i < entries.length; i++) { const a = entries[i - 1][0], b = entries[i][0]; const between = rem.filter((r) => r > a && r < b); if (between.length) { nb.push({ kind: 'split', b: i }); if (!midRem) midRem = between; } }
  if (P.mode !== 'flat' && entries.length && rem.some((r) => r > entries[entries.length - 1][0] || r < entries[0][0])) nb.push({ kind: 'split', b: 0 });
  // positions
  let pos, dir = P.dir;
  const newLen = newN.length;
  if (res.turn) {
    const lastW = widx[Math.max(0, end - 1)];
    const tb = fwd ? lastW + 1 : lastW;
    pos = remap(tb); dir = -P.dir;
    if (P.mode !== 'flat' || (pos > 0 && pos < newLen)) nb.push({ kind: 'gap', b: P.mode !== 'flat' ? mod(pos, newLen || 1) : pos });
  } else if (res.slide) { pos = remap(fwd ? widx[0] : widx[0] + 1); }
  else if (P.mode === 'flat') { pos = fwd ? newLen : 0; dir = -P.dir; }
  else { pos = 0; dir = 1; }
  // de-duplicate bounds
  const seenB = new Set(); P.bounds = nb.filter((x) => { const k = x.kind + ':' + x.b; if (seenB.has(k)) return false; seenB.add(k); return true; });
  P.needle = newN; P.pos = pos; P.dir = dir; P.slidePending = !!res.slide;
  if (over && P.mode !== 'flat') { P.needle = newN.slice(over).concat(newN.slice(0, over)); P.bounds = P.bounds.map((x) => ({ ...x, b: mod(x.b - over, newLen) })); }
  // holders
  for (const [name, sts] of Object.entries(held)) addHolder(P, name, sts, ri);
  // made stitches: fabric, column, length from their neighbours
  fillMade(P, rowSts);
  layoutRow(P, rowSts);
  // split bookkeeping
  if (P._centerSplit) { if (P.splitRow == null) { P.splitRow = ri; P.splitSts = P._centerSplit.map((i) => rowSts.find((s) => s.parents[0] === N[i]) || N[i]); } P._centerSplit = null; }
  else if (midRem && P.mode === 'flat' && P.splitRow == null) { P.splitRow = ri; P.splitSts = midRem.map((i) => rowSts.find((s) => s.parents[0] === N[i]) || N[i]); }
  renameHalves(P);
  // row record
  const fabName = req.fabName || dominantFab(P, rowSts.filter((s) => s.op !== 'bo')) || 'st';
  const row = { index: ri, dir: side, line, stitches: rowSts, fabric: fabName, desc: '' };
  const counts = countsText(P);
  const what = req.desc || (ast ? `"${req.writtenText}"` : fabName);
  row.desc = `Row ${ri} (${side}): ${what}${notes.length ? ', ' + notes.join(', ') : ''}${res.turn ? ', turn' : ''}${req.untilDesc ? ' — ' + req.untilDesc : ''} → ${counts} sts`;
  P.rows.push(row);
  Object.keys(held).forEach((k) => { P.holders[k].row = ri; });
  return { row, turn: res.turn };
}

function leanOf(u) { return /ssk|skp|sk2p|ssp|tbl|m1l|lli|m1pl/.test(u) ? 'l' : /k2tog|p2tog|k3tog|p3tog|m1r|rli|m1pr/.test(u) ? 'r' : null; }

export function dominantFab(P, sts) {
  const c = {}; let best = null, bn = 0;
  sts.forEach((s) => { const k = s.fp ? s.fp.fab.name : 'st'; c[k] = (c[k] || 0) + 1; if (c[k] > bn) { bn = c[k]; best = k; } });
  return best;
}

function fillMade(P, rowSts) {
  const N = P.needle;
  for (let pass = 0; pass < 2; pass++) N.forEach((s, i) => {
    if (s.len != null && s.fp !== undefined && s.col != null) return;
    const nb = [N[i - 1], N[i + 1]].filter((q) => q && q.len != null);
    const ref = nb[0];
    if (!ref) return;
    if (s.len == null) { s.len = Math.max(...nb.map((q) => q.len)); s.glen = Math.max(...nb.map((q) => q.glen || 0)); }
    if (s.fp === undefined || s.fp === null) s.fp = (N[i + 1] && N[i + 1].len != null ? N[i + 1] : ref).fp || null;
    if (s.col == null) { const r = N[i - 1] && N[i - 1].col != null ? N[i - 1] : null; s.col = r ? r.col + 1 : (N[i + 1] ? (N[i + 1].col || 0) - 1 : 0); }
    if (s.prow == null) s.prow = ref.prow || 0;
  });
  rowSts.forEach((s) => { if (s.len == null) { s.len = 0; s.glen = 0; } if (s.prow == null) s.prow = 0; if (s.col == null) s.col = 0; if (s.fp === undefined) s.fp = null; });
}

/** x for the new stitches: over their parents, then made stitches between their neighbours, then compacted to one stitch apart. */
function layoutRow(P, rowSts) {
  const N = P.needle; const fresh = new Set(rowSts);
  rowSts.forEach((s) => { if (s.parents.length) s.x = s.parents.reduce((a, q) => a + q.x, 0) / s.parents.length; });
  // spread outs of one unit
  const byParent = new Map();
  rowSts.forEach((s) => { if (!s.parents.length) return; const k = s.parents.map((q) => q.id).join(','); if (!byParent.has(k)) byParent.set(k, []); byParent.get(k).push(s); });
  for (const grp of byParent.values()) if (grp.length > 1) { const live = grp.filter((s) => s.op !== 'bo'); const m = live.length; live.sort((a, b) => N.indexOf(a) - N.indexOf(b)); live.forEach((s, j) => { s.x += (m - 1) / 2 - j; }); }
  // made: between neighbours along the needle
  N.forEach((s, i) => {
    if (!isNaN(s.x)) return;
    let a = i - 1; while (a >= 0 && isNaN(N[a].x)) a--;
    let b = i + 1; while (b < N.length && isNaN(N[b].x)) b++;
    const xa = a >= 0 ? N[a].x : null, xb = b < N.length ? N[b].x : null;
    if (xa != null && xb != null) s.x = xa + (xb - xa) * (i - a) / (b - a);
    else if (xa != null) s.x = xa - (i - a); else if (xb != null) s.x = xb + (b - i); else s.x = (N.length - 1) / 2 - i;
  });
  rowSts.forEach((s) => { if (isNaN(s.x)) s.x = s.parents.length ? s.parents[0].x : 0; });
  // compact runs of fresh live stitches (RS order: x decreasing)
  let i = 0;
  while (i < N.length) {
    if (!fresh.has(N[i])) { i++; continue; }
    let j = i; while (j + 1 < N.length && fresh.has(N[j + 1]) && Math.abs(N[j].x - N[j + 1].x) < 1.75) j++;
    const run = N.slice(i, j + 1); const c = run.reduce((a, s, k) => a + s.x + k, 0) / run.length;
    run.forEach((s, k) => { s.x = c - k; });
    i = j + 1;
  }
}

/** Halves of sections split by a removal in their middle: NAME_1 (left, RS view), NAME_2…; the default section's are 1, 2. */
function renameHalves(P) {
  const N = P.needle; const sp = new Set(P.bounds.filter((x) => x.kind === 'split').map((x) => x.b));
  const runs = []; let cur = null;
  N.forEach((s, i) => { if (!cur || secOf(s) !== secOf(N[i - 1]) || sp.has(i)) { cur = { sec: secOf(s), sts: [] }; runs.push(cur); } cur.sts.push(s); });
  const by = {}; runs.forEach((r) => { (by[r.sec] = by[r.sec] || []).push(r); });
  for (const [sec, rs] of Object.entries(by)) {
    if (rs.length < 2) continue;
    if (P.mode !== 'flat' && rs.length === 2 && !sp.has(0) && rs[0].sts[0] === N[0] && rs[1].sts[rs[1].sts.length - 1] === N[N.length - 1]) continue; // straddles the round start
    const ordered = rs.slice().reverse(); // left first
    ordered.forEach((r, k) => { const nm = sec ? `${sec}_${k + 1}` : String(k + 1); r.sts.forEach((s) => { s.sec = nm; }); });
  }
}

export function addHolder(P, name, sts, row) {
  const h = P.holders[name] || Object.assign([], { all: [], row, mode: P.mode });
  if (P.holders[name] && !P.holders[name].length && P.holders[name].all.length) h.all = [];
  h.push(...sts); h.all.push(...sts); h.row = row; h.mode = P.mode;
  h.whole = !P.needle.length && P.mode !== 'flat';
  P.holders[name] = h;
  sts.forEach((s) => { s.held = name; });
}

/** The live sections, in RS order, as {name, n}. Default halves are listed left → right for a positional expect. */
export function sectionCounts(P) {
  const out = [];
  P.needle.forEach((s) => { const c = secOf(s); const last = out[out.length - 1]; if (last && last.name === c) last.n++; else out.push({ name: c, n: 1 }); });
  // a section given first and last in the round is one
  if (P.mode !== 'flat' && out.length > 1 && out[0].name === out[out.length - 1].name) { out[0].n += out.pop().n; }
  return out;
}
export function countsText(P) {
  const sc = sectionCounts(P);
  if (sc.length <= 1) return String(P.needle.length);
  const isDefault = sc.every((s) => /^\d+(_\d+)*$/.test(s.name) || s.name === '');
  return (isDefault ? sc.slice().reverse() : sc).map((s) => s.n).join(' + ');
}

// ---------- Sections ----------
export function setSections(P, specs, mirror) {
  const N = P.needle; const n = N.length;
  let list = mirror ? specs.slice().reverse() : specs;
  const fixed = list.reduce((a, s) => a + (s.n ?? 0), 0);
  const free = list.filter((s) => s.n == null);
  if (free.length > 1) fail('only one section may leave out its count');
  if (free.length) free[0].n = n - fixed;
  const tot = list.reduce((a, s) => a + s.n, 0);
  if (tot !== n) fail(`sections add up to ${tot}, but ${n} sts are live`);
  let i = 0; for (const s of list) { for (let k = 0; k < s.n; k++) N[i++].sec = s.name; }
  P.bounds = P.bounds.filter((b) => b.kind !== 'split');
}

// ---------- Holding / resuming ----------
export function holdNow(P, idxs, name) {
  const keep = new Set(idxs);
  const sts = P.needle.filter((_, i) => keep.has(i));
  const rest = P.needle.filter((_, i) => !keep.has(i));
  // removal in the middle splits
  const was = P.needle.length;
  const firstKeep = idxs.length ? Math.min(...idxs) : 0, lastKeep = idxs.length ? Math.max(...idxs) : 0;
  P.needle = rest;
  if (rest.length && firstKeep > 0 && lastKeep < was - 1 && P.mode === 'flat') P.bounds.push({ kind: 'split', b: firstKeep });
  addHolder(P, name, sts, P.rows.length - 1);
  if (P.pos > rest.length) P.pos = rest.length;
  return sts;
}

/** Look a written row up once, for errors. */
export function checkRow(text, keys) { return parseRow(text, keys); }
