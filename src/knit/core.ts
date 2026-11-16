// @ts-nocheck -- ported verbatim from the original single-file app; see types.ts for the public shapes.
// TODO: type this module incrementally.
// ===== Knit DSL core: parser → stitch graph → checks → meshes → cloth sim =====

import { buildDoc } from './engine/build';
import { assemble } from './engine/assemble';
import { edgeOf as engineEdgeOf } from './engine/edges';

// ---------- Tokenizing into statements ----------
function splitStatements(src) {
  // returns flat list of {line, toks} with '{' and '}' as their own statements
  const out = [];
  src.split('\n').forEach((raw, i) => {
    const line = i + 1;
    let s = raw.replace(/#(?![0-9a-fA-F]{3,8}\b).*$/, ''); // comments, but keep #hex colors
    // keep quoted strings intact
    const parts = [];
    let cur = '', q = false;
    for (const ch of s) {
      if (ch === '"') { q = !q; cur += ch; continue; }
      if (!q && (ch === '{' || ch === '}' || ch === ';')) { parts.push(cur); if (ch !== ';') parts.push(ch); cur = ''; continue; }
      cur += ch;
    }
    parts.push(cur);
    parts.forEach(p => {
      const t = p.trim();
      if (!t) return;
      const toks = t.match(/"[^"]*"|\S+/g);
      out.push({ line, toks });
    });
  });
  return out;
}

function parse(src) {
  const errors = [];
  const stmts = splitStatements(src);
  const doc = { name: 'Untitled', source: '', gauge: { sts: 20, rows: 28, per: 4 }, yarn: '#b89b72', pieces: [], assemble: [], errors };
  let i = 0;
  const err = (line, msg, level = 'error') => errors.push({ line, msg, level });

  function parseBlock(endTok) {
    const body = [];
    while (i < stmts.length) {
      const st = stmts[i];
      const k = st.toks[0];
      if (k === '}' && endTok === '}') { i++; return body; }
      if (k === 'end' && endTok === 'end') { i++; return body; }
      if (k === 'piece' || k === 'assemble') {
        if (endTok) { err(st.line, `Missing "${endTok === '}' ? '}' : 'end'}" before "${k}"`); return body; }
      }
      i++;
      if (k === 'repeat') {
        const n = parseInt(st.toks[1]);
        if (!(n >= 0)) err(st.line, 'repeat needs a count, e.g. "repeat 3 {"');
        if (st.toks[2] && st.toks[2] !== '{') err(st.line, 'Expected "{" after repeat count');
        if (!(i < stmts.length && stmts[i].toks[0] === '{') && st.toks[2] !== '{') { err(st.line, 'Expected "{" after repeat count'); continue; }
        if (i < stmts.length && stmts[i].toks[0] === '{') i++;
        const inner = parseBlock('}');
        body.push({ kind: 'repeat', n: n || 0, body: inner, line: st.line });
        continue;
      }
      if (k === '{') { err(st.line, 'Unexpected "{"'); continue; }
      if (k === '}') { err(st.line, 'Unexpected "}"'); continue; }
      body.push({ kind: 'stmt', toks: st.toks, line: st.line });
    }
    if (endTok) err(stmts.length ? stmts[stmts.length - 1].line : 1, `Missing "${endTok}"`);
    return body;
  }

  while (i < stmts.length) {
    const st = stmts[i]; const k = st.toks[0]; i++;
    if (k === 'pattern') doc.name = unq(st.toks.slice(1).join(' '));
    else if (k === 'source') doc.source = st.toks[1] || '';
    else if (k === 'gauge') {
      // gauge 10 sts x 14 rows = 4 in
      const m = st.toks.join(' ').match(/gauge\s+([\d.]+)\s*sts?\s*x\s*([\d.]+)\s*rows?\s*=\s*([\d.]+)\s*(in|cm)/);
      if (!m) err(st.line, 'Gauge format: gauge 10 sts x 14 rows = 4 in');
      else { let per = +m[3]; if (m[4] === 'cm') per /= 2.54; doc.gauge = { sts: +m[1], rows: +m[2], per }; }
    }
    else if (k === 'yarn') { if (isHex(st.toks[1])) doc.yarn = st.toks[1]; else err(st.line, 'yarn needs a hex color like #b89b72'); }
    else if (k === 'piece') {
      const name = st.toks[1];
      if (!name || !/^[a-z_][a-z0-9_]*$/i.test(name)) err(st.line, 'Piece needs a name: piece back');
      const p = { name, round: false, like: null, line: st.line, body: [] };
      for (let j = 2; j < st.toks.length; j++) {
        if (st.toks[j] === 'round') p.round = true;
        else if (st.toks[j] === 'like') { p.like = st.toks[++j]; }
        else err(st.line, `Unknown piece option "${st.toks[j]}"`);
      }
      if (p.like) {
        // "piece x like y" may be a single line with no body
        if (i < stmts.length && stmts[i].toks[0] !== 'piece' && stmts[i].toks[0] !== 'assemble' && stmts[i].toks[0] === 'end') i++;
      } else p.body = parseBlock('end');
      doc.pieces.push(p);
    }
    else if (k === 'assemble') {
      const body = parseBlock('end');
      body.forEach(b => {
        if (b.kind !== 'stmt') { err(b.line, 'Only place/seam statements go in assemble'); return; }
        const t = b.toks;
        if (t[0] === 'place') {
          if (t[2] !== 'at' || !t[3]) err(b.line, 'place <piece> at front|back|left_arm|right_arm|neck');
          else doc.assemble.push({ kind: 'place', piece: t[1], at: t[3], line: b.line });
        } else if (t[0] === 'seam') {
          const s = t.slice(1).join(' ');
          const m = s.split('=');
          if (m.length !== 2) err(b.line, 'seam <edge> = <edge>');
          else doc.assemble.push({ kind: 'seam', a: m[0].trim(), b: m[1].trim(), line: b.line });
        } else err(b.line, `Unknown assemble statement "${t[0]}"`);
      });
    }
    else err(st.line, `Unknown statement "${k}" (expected pattern, gauge, yarn, piece or assemble)`);
  }
  return doc;
}
const unq = s => s.replace(/^"|"$/g, '');
const isHex = s => /^#[0-9a-fA-F]{6}$/.test(s || '');


// ---------- Parameters ----------
// param size enum S M L = M "Size"         (also: select)
// param length float 40..100 = 86 "Length (in)"
// param width_sts int 11..31 = 19
// param main color = #c4a27a "Main colour"
// Use them as ${expr} anywhere in a line, and as a/b/c per-size lists (indexed by the "size" param, or the first enum).
function parseParams(src, overrides, errors) {
  const params = []; const lines = src.split('\n');
  lines.forEach((raw, i) => {
    const line = raw.replace(/(^|\s)#(?![0-9a-fA-F]{6}\b).*$/, '');
    const m = /^\s*param\s+([a-z_][a-z0-9_]*)\s+(enum|select|int|float|color)\b(.*)$/i.exec(line);
    if (!m) { if (/^\s*param\b/.test(line)) errors.push({ line: i + 1, level: 'error', msg: 'param NAME enum A B C = B | int MIN..MAX = V | float MIN..MAX = V | color = #hex  ["label"]' }); return; }
    const [, name, type0, rest0] = m; const type = type0 === 'select' ? 'enum' : type0;
    let rest = rest0; let label = null;
    // split default from options at the last '='
    const eq = rest.lastIndexOf('=');
    let opts = eq >= 0 ? rest.slice(0, eq) : rest, def = eq >= 0 ? rest.slice(eq + 1) : '';
    const toks = s => (s.match(/"[^"]*"|\S+/g) || []).map(t => t.replace(/^"|"$/g, ''));
    let dt = toks(def); if (dt.length > 1) { label = dt.slice(1).join(' '); dt = dt.slice(0, 1); }
    else if (!def && /"[^"]*"\s*$/.test(opts)) { const q = /"([^"]*)"\s*$/.exec(opts); label = q[1]; opts = opts.slice(0, q.index); }
    const P = { name, type, label: label || name.replace(/_/g, ' '), line: i + 1 };
    if (params.some(q => q.name === name)) errors.push({ line: i + 1, level: 'error', msg: `Duplicate param "${name}"` });
    if (type === 'enum') {
      P.options = toks(opts); if (P.options.length < 2) errors.push({ line: i + 1, level: 'error', msg: 'enum needs at least two options: param size enum S M L = M' });
      P.default = dt[0] !== undefined ? dt[0] : P.options[0];
      if (!P.options.includes(P.default)) { errors.push({ line: i + 1, level: 'error', msg: `Default "${P.default}" isn't one of ${P.options.join(', ')}` }); P.default = P.options[0]; }
    } else if (type === 'color') {
      P.default = dt[0] || '#b89b72'; if (!isHex(P.default)) errors.push({ line: i + 1, level: 'error', msg: 'color default must be #rrggbb' });
    } else {
      const r = /^\s*(-?[\d.]+)\s*\.\.\s*(-?[\d.]+)\s*$/.exec(opts);
      if (opts.trim() && !r) errors.push({ line: i + 1, level: 'error', msg: `Range format is MIN..MAX, e.g. param ${name} ${type} 10..40 = 20` });
      if (r) { P.min = +r[1]; P.max = +r[2]; }
      P.default = dt[0] !== undefined ? +dt[0] : (P.min ?? 0);
      if (!isFinite(P.default)) { errors.push({ line: i + 1, level: 'error', msg: `${name} needs a numeric default` }); P.default = 0; }
      if (type === 'int' && !Number.isInteger(P.default)) errors.push({ line: i + 1, level: 'error', msg: `${name} is an int; default ${P.default} isn't whole` });
    }
    // value: override if valid
    let v = overrides && overrides[name] !== undefined ? overrides[name] : P.default;
    if (type === 'enum' && !P.options.includes(v)) v = P.default;
    if (type === 'color' && !isHex(v)) v = P.default;
    if (type === 'int' || type === 'float') { v = +v; if (!isFinite(v)) v = P.default; if (P.min !== undefined) v = Math.min(P.max, Math.max(P.min, v)); if (type === 'int') v = Math.round(v); }
    P.value = v; params.push(P);
    lines[i] = ''; // keep line numbers stable
  });
  return { params, lines };
}
function evalExpr(expr, vars, line) {
  let i = 0; const s = expr;
  const ws = () => { while (i < s.length && /\s/.test(s[i])) i++; };
  const FN = { round: Math.round, ceil: Math.ceil, floor: Math.floor, min: Math.min, max: Math.max, abs: Math.abs,
    even: x => 2 * Math.round(x / 2), odd: x => 2 * Math.floor(x / 2) + 1, mult: (x, m) => m * Math.round(x / m) };
  function prim() {
    ws();
    if (s[i] === '(') { i++; const v = tern(); ws(); if (s[i] !== ')') throw new Error('missing )'); i++; return v; }
    if (s[i] === '-') { i++; return -prim(); }
    const num = /^\d*\.?\d+/.exec(s.slice(i)); if (num) { i += num[0].length; return +num[0]; }
    const str = /^"([^"]*)"/.exec(s.slice(i)); if (str) { i += str[0].length; return str[1]; }
    const id = /^[a-z_][a-z0-9_]*/i.exec(s.slice(i));
    if (id) {
      i += id[0].length; ws();
      if (s[i] === '(') { i++; const args = []; ws(); if (s[i] !== ')') { args.push(tern()); ws(); while (s[i] === ',') { i++; args.push(tern()); ws(); } } if (s[i] !== ')') throw new Error('missing )'); i++;
        if (id[0] === 'pick') { const k = args[0]; return args[1 + k]; }
        if (!FN[id[0]]) throw new Error(`unknown function ${id[0]}()`); return FN[id[0]](...args); }
      if (!(id[0] in vars)) throw new Error(`unknown param "${id[0]}"`);
      return vars[id[0]];
    }
    throw new Error(`can't read "${s.slice(i, i + 8)}"`);
  }
  function mul() { let v = prim(); for (;;) { ws(); const c = s[i]; if (c === '*' || c === '/' || c === '%') { i++; const r = prim(); v = c === '*' ? v * r : c === '/' ? v / r : v % r; } else return v; } }
  function add() { let v = mul(); for (;;) { ws(); const c = s[i]; if (c === '+' || c === '-') { i++; const r = mul(); v = c === '+' ? v + r : v - r; } else return v; } }
  function cmp() { let v = add(); ws(); const m = /^(==|!=|>=|<=|>|<)/.exec(s.slice(i)); if (m) { i += m[0].length; const r = add(); v = { '==': v == r, '!=': v != r, '>=': v >= r, '<=': v <= r, '>': v > r, '<': v < r }[m[0]] ? 1 : 0; } return v; }
  function tern() { const c = cmp(); ws(); if (s[i] === '?') { i++; const a = tern(); ws(); if (s[i] !== ':') throw new Error('missing : in ?:'); i++; const b = tern(); return c ? a : b; } return c; }
  const v = tern(); ws(); if (i < s.length) throw new Error(`unexpected "${s.slice(i)}"`);
  return v;
}
const fmtNum = v => typeof v === 'number' ? (Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100)) : String(v);
function applyParams(src, overrides, errors) {
  const { params, lines } = parseParams(src, overrides, errors);
  const vars = {}; params.forEach(p => { vars[p.name] = p.type === 'enum' ? p.value : p.value; });
  const sizeP = params.find(p => p.name === 'size' && p.type === 'enum') || params.find(p => p.type === 'enum');
  const sizeIdx = sizeP ? sizeP.options.indexOf(sizeP.value) : -1;
  if (sizeP) vars.size_index = sizeIdx;
  const used = new Set();
  const out = lines.map((raw, i) => {
    if (/^\s*source\b/.test(raw)) return raw;
    const ci = raw.search(/(^|\s)#(?![0-9a-fA-F]{6}\b)/); const code = ci >= 0 ? raw.slice(0, ci) : raw, cmt = ci >= 0 ? raw.slice(ci) : '';
    let c = code.replace(/\$\{([^{}]*)\}/g, (m0, e) => {
      try { Object.keys(vars).forEach(k => { if (new RegExp(`\\b${k}\\b`).test(e)) used.add(k); }); return fmtNum(evalExpr(e, vars, i + 1)); }
      catch (err) { errors.push({ line: i + 1, level: 'error', msg: `In \${${e}}: ${err.message}` }); return '0'; }
    });
    c = c.replace(/(^|[\s=:])((?:[\d.]+(?:in|cm)?)(?:\/[\d.]+(?:in|cm)?)+)(?=\s|$|;)/g, (m0, pre, list) => {
      const vals = list.split('/');
      if (!sizeP) { errors.push({ line: i + 1, level: 'error', msg: `Per-size list "${list}" needs a size param, e.g. param size enum ${vals.map((_, k) => 'S' + (k + 1)).join(' ')}` }); return pre + vals[0]; }
      used.add(sizeP.name);
      if (vals.length !== sizeP.options.length) errors.push({ line: i + 1, level: 'error', msg: `"${list}" has ${vals.length} values but ${sizeP.name} has ${sizeP.options.length} options (${sizeP.options.join(', ')})` });
      const unit = (/(in|cm)$/.exec(vals[vals.length - 1]) || [''])[0];
      let v = vals[sizeIdx] ?? vals[vals.length - 1]; if (unit && !/(in|cm)$/.test(v)) v += unit;
      return pre + v;
    });
    return c + cmt;
  });
  params.forEach(p => { p.used = used.has(p.name); });
  return { src: out.join('\n'), params };
}

// ---------- Fabrics ----------
const FABRICS = {
  st: () => 'k', rev_st: () => 'p',
  garter: (c, r) => (r % 2 === 0 ? 'p' : 'k'),
  seed: (c, r) => ((c + r) % 2 ? 'p' : 'k'),
  moss: (c, r) => ((c + (r >> 1)) % 2 ? 'p' : 'k'),
  edge: () => 'k',
};
function fabricFn(name) {
  if (FABRICS[name]) return FABRICS[name];
  const m = /^rib(\d+)x(\d+)$/.exec(name);
  if (m) { const a = +m[1], b = +m[2]; return c => ((((c % (a + b)) + (a + b)) % (a + b)) < a ? 'k' : 'p'); }
  return null;
}
const FABRIC_WORDS = { k: 'knit', p: 'purl' };
const FABRIC_DESC = { st: 'stockinette', rev_st: 'reverse stockinette', garter: 'garter', seed: 'seed stitch', moss: 'moss stitch', edge: 'slipped edge' };
const fabricDesc1 = f => FABRIC_DESC[f] || f.replace(/^rib(\d+)x(\d+)$/, '$1×$2 rib');
const fabricDesc = f => f.split(' ').map(p => { const [a, n] = p.split(':'); return n ? `${n} ${fabricDesc1(a)}` : fabricDesc1(a); }).join(' | ');
const MOD_WORDS = new Set(['inc', 'dec', 'bind_off']);
// composite fabric: "garter:6 st garter:6" — one part may omit its count and fills the rest
function fabricSpec(toks, line) {
  const parts = toks.map(tk => { const [name, n] = tk.split(':'); const fn = fabricFn(name);
    if (!fn) fail(line, `Unknown fabric "${name}". Use st, rev_st, garter, seed, moss, edge, rib2x2… (combine like garter:6 st garter:6)`);
    if (n !== undefined && !(+n > 0)) fail(line, `Bad stitch count in "${tk}"`);
    return { name, fn, n: n === undefined ? null : +n }; });
  if (!parts.length) fail(line, 'Missing fabric (st, rev_st, garter, seed, moss, rib2x2…)');
  const fills = parts.filter(p => p.n === null).length;
  if (fills > 1) fail(line, 'Only one part of a combined fabric may leave out its stitch count');
  if (parts.length === 1) return { name: toks.join(' '), assign: (sts, r, x0) => sts.forEach(s => { s.t = parts[0].fn(Math.round(s.x - x0), r); s.fab = parts[0].name; }) };
  return { name: toks.join(' '), assign: (sts, r, x0, warn) => {
    const fixed = parts.reduce((a, p) => a + (p.n || 0), 0);
    let fillN = sts.length - fixed;
    if (fillN < 0 || (!fills && fillN !== 0)) { warn(`Combined fabric needs ${fixed}${fills ? '+' : ''} sts but the row has ${sts.length}`); fillN = Math.max(0, fillN); }
    let i = 0;
    for (const p of parts) { const n = p.n === null ? fillN : p.n; for (let k = 0; k < n && i < sts.length; k++, i++) { sts[i].t = p.fn(Math.round(sts[i].x - x0), r); sts[i].fab = p.name; } }
    for (; i < sts.length; i++) { sts[i].t = parts[parts.length - 1].fn(Math.round(sts[i].x - x0), r); sts[i].fab = parts[parts.length - 1].name; }
  } };
}

// ---------- Building pieces ----------
function build(doc) {
  const errors = doc.errors;
  const err = (line, msg, level = 'error') => errors.push({ line, msg, level });
  const g = doc.gauge; const sg = g.sts / g.per, rg = g.rows / g.per; // per inch
  const pieces = {};
  const byName = {};
  doc.pieces.forEach(p => { if (p.name) byName[p.name] = p; });
  const order = [];

  doc.pieces.forEach(pdef => {
    let body = pdef.body;
    if (pdef.like) {
      const src = byName[pdef.like];
      if (!src) { err(pdef.line, `"like ${pdef.like}": no such piece`); return; }
      body = src.body; pdef.round = pdef.round || src.round;
    }
    if (pieces[pdef.name]) err(pdef.line, `Duplicate piece name "${pdef.name}"`);
    const P = { name: pdef.name, round: pdef.round, line: pdef.line, like: pdef.like, rows: [], live: [], markers: {}, top: null, split: null,
      color: doc.yarn, pickup: null, expects: [], segCounter: 0, stitches: [] };
    pieces[P.name] = P; order.push(P);
    const ctx = { P, err, sg, rg, pieces };
    try { execBody(ctx, body); } catch (e) { if (e.msg) err(e.line, e.msg); else throw e; }
    if (P.rows.length && !P.top) err(pdef.line, `Piece "${P.name}" never binds off (add "bind_off")`, 'warn');
    finalizePiece(P, sg, rg);
  });
  doc.built = { pieces, order, sg, rg };
  return doc.built;
}

function fail(line, msg) { throw { line, msg }; }

function execBody(ctx, body) {
  for (const s of body) {
    if (s.kind === 'repeat') { for (let k = 0; k < s.n; k++) execBody(ctx, s.body); continue; }
    execStmt(ctx, s);
  }
}

function execStmt(ctx, s) {
  const { P, err, sg, rg } = ctx;
  const t = s.toks; const k = t[0]; const line = s.line;
  if (k === 'cast_on' || k === 'pick_up') {
    if (P.rows.length) fail(line, `${k} must be the first row of a piece`);
    const n = parseInt(t[1]);
    if (!(n > 0)) fail(line, `${k} needs a stitch count`);
    if (k === 'pick_up') {
      if (t[2] !== 'from' || !t[3]) fail(line, 'pick_up 48 from front.neck + back.neck');
      P.pickup = { expr: t.slice(3).join(' '), line };
    }
    const seg = P.segCounter++;
    const row = { index: 0, dir: 'CO', line, desc: `${k === 'cast_on' ? 'Cast on' : 'Pick up'} ${n} sts`, stitches: [] };
    for (let i = 0; i < n; i++) {
      const st = mkStitch(P, { x: i - (n - 1) / 2, row: 0, op: k === 'cast_on' ? 'co' : 'pu', t: 'k', parents: [], seg, line });
      row.stitches.push(st);
    }
    P.rows.push(row); P.live = row.stitches.slice();
    P.x0 = row.stitches[0].x;
    return;
  }
  if (k === 'yarn') { if (!isHex(t[1])) fail(line, 'yarn needs a hex color like #b89b72'); P.color = t[1]; return; }
  if (k === 'marker') { if (!t[1]) fail(line, 'marker needs a name'); P.markers[t[1]] = P.rows.length - 1; return; }
  if (k === 'expect') {
    const want = t.slice(1).filter(x => x !== '+').map(Number);
    const segs = groupSegs(P.live).map(s => s.length);
    const ok = want.length === segs.length ? want.every((w, i) => w === segs[i]) : (want.length === 1 && want[0] === P.live.length);
    P.expects.push({ line, want, got: segs, ok });
    if (!ok) err(line, `Stitch count check failed: expected ${want.join(' + ')}, have ${segs.join(' + ')} (row ${P.rows.length - 1})`);
    return;
  }
  if (k === 'gather') {
    if (!P.live.length) fail(line, 'Nothing to gather');
    P.top = [P.live.slice()]; P.live.forEach(st => { st.top = 1; st.gathered = true; });
    P.gather = true; P.bindOffLine = line; P.live = [];
    return;
  }
  if (k === 'bind_off') {
    if (t.length > 1) fail(line, 'Use "bind_off" alone to bind off everything; for a centre bind-off write "row <fabric> bind_off center N"');
    if (!P.live.length) fail(line, 'Nothing to bind off');
    const segs = groupSegs(P.live);
    P.top = segs; segs.forEach((sgm, i) => sgm.forEach(st => { st.top = i + 1; }));
    P.bindOffLine = line; P.live = [];
    return;
  }
  if (k === 'row' || k === 'rows') {
    if (!P.rows.length) fail(line, 'Start the piece with cast_on or pick_up');
    if (!P.live.length) fail(line, 'No live stitches (already bound off?)');
    let j = 1; let n = 1; let untilDesc = '';
    if (k === 'rows') {
      if (t[1] === 'until') {
        j = 2;
        let target;
        if (t[j] === 'match') {
          const other = ctx.pieces[t[j + 1]];
          if (!other) fail(line, `until match: unknown piece "${t[j + 1]}"`);
          target = other.rows.length - 1; j += 2; untilDesc = `until same length as ${t[j - 1]}`;
        } else {
          const m = /^([\d.]+)(in|cm)$/.exec(t[j]);
          if (!m) fail(line, 'rows until 18in <fabric>  (or "until 9in from <marker>", "until match <piece>")');
          let len = +m[1]; if (m[2] === 'cm') len /= 2.54; j++;
          let base = 0;
          if (t[j] === 'from') {
            const mk = t[j + 1];
            if (!(mk in P.markers)) fail(line, `Unknown marker "${mk}"`);
            base = P.markers[mk]; j += 2; untilDesc = `until ${t[j - 3 + 0] || ''}`;
            untilDesc = `until ${m[1]}${m[2]} from ${mk}`;
          } else untilDesc = `until piece measures ${m[1]}${m[2]}`;
          target = base + Math.ceil(len * rg - 1e-6);
        }
        n = target - (P.rows.length - 1);
        if (n < 0) { err(line, `"rows ${untilDesc}" was already passed ${-n} row(s) ago`, 'warn'); return; }
        if (n === 0) return;
      } else {
        const m = /^([\d.]+)(in|cm)$/.exec(t[1] || '');
        if (m) { let len = +m[1]; if (m[2] === 'cm') len /= 2.54; n = Math.max(1, Math.ceil(len * rg - 1e-6)); untilDesc = `${m[1]}${m[2]}`; }
        else { n = parseInt(t[1]); if (!(n > 0)) fail(line, 'rows needs a count or length: rows 4 st, rows 2in garter'); }
        j = 2;
      }
    }
    let e = j; while (e < t.length && !MOD_WORDS.has(t[e])) e++;
    const spec = fabricSpec(t.slice(j, e), line);
    const mods = parseMods(t.slice(e), line);
    for (let r = 0; r < n; r++) workRow(ctx, spec, mods, line, untilDesc);
    return;
  }
  fail(line, `Unknown piece statement "${k}"`);
}

function parseMods(t, line) {
  const mods = [];
  for (let i = 0; i < t.length;) {
    const w = t[i];
    if (w === 'dec' && t[i + 1] === 'every') {
      const n = parseInt(t[i + 2]); if (!(n >= 2)) fail(line, 'dec every N  (N ≥ 2: work N-2, k2tog around)');
      mods.push({ op: 'dec_every', n }); i += 3; continue;
    }
    if ((w === 'inc' || w === 'dec') && (t[i + 1] === 'edges' || t[i + 1] === 'neck')) {
      const where = t[i + 1];
      let n = 1; if (/^\d+$/.test(t[i + 2] || '')) { n = +t[i + 2]; i++; }
      mods.push({ op: w, where, n }); i += 2; continue;
    }
    if (w === 'bind_off' && t[i + 1] === 'center') {
      const n = parseInt(t[i + 2]); if (!(n > 0)) fail(line, 'bind_off center N');
      mods.push({ op: 'bo_center', n }); i += 3; continue;
    }
    fail(line, `Unknown shaping "${t.slice(i).join(' ')}". Use inc edges, dec edges, dec neck, dec every N, bind_off center N`);
  }
  return mods;
}

function mkStitch(P, o) { o.id = P.stitches.length; o.piece = P.name; o.color = o.color || P.color; P.stitches.push(o); return o; }

function groupSegs(list) {
  const segs = []; let cur = null, last = null;
  list.forEach(st => { if (st.seg !== last) { cur = []; segs.push(cur); last = st.seg; } cur.push(st); });
  return segs;
}

function workRow(ctx, spec, mods, line, untilDesc) {
  const fab = spec.name;
  const { P } = ctx;
  const ri = P.rows.length;
  const dir = P.round ? 'RS' : (ri % 2 === 1 ? 'RS' : 'WS');
  const segs = groupSegs(P.live);
  let ns = segs.map(sgm => sgm.map(p => ({ x: p.x, parents: [p], op: 'n' })));
  const notes = [];
  for (const m of mods) {
    if (m.op === 'inc' && m.where === 'edges') {
      for (let k = 0; k < m.n; k++) {
        const L = ns[0][0], R = ns[ns.length - 1][ns[ns.length - 1].length - 1];
        ns[0].unshift({ x: L.x - 1, parents: [L.parents[L.parents.length - 1]], op: 'inc' });
        ns[ns.length - 1].push({ x: R.x + 1, parents: [R.parents[R.parents.length - 1]], op: 'inc' });
      }
      notes.push(`inc ${m.n} at each edge`);
    } else if (m.op === 'dec') {
      if (m.where === 'neck' && ns.length < 2) fail(line, '"dec neck" needs a split piece (after bind_off center)');
      for (let k = 0; k < m.n; k++) {
        if (m.where === 'edges') { decAt(ns[0], 'left', line); decAt(ns[ns.length - 1], 'right', line); }
        else { for (let s = 0; s < ns.length - 1; s++) { decAt(ns[s], 'right', line); decAt(ns[s + 1], 'left', line); } }
      }
      notes.push(`dec ${m.n} at each ${m.where === 'edges' ? 'edge' : 'neck edge'}`);
    } else if (m.op === 'dec_every') {
      if (ns.length !== 1) fail(line, 'dec every works on an unsplit piece');
      const all = ns[0]; const groups = Math.floor(all.length / m.n);
      if (!groups) fail(line, `Only ${all.length} sts left — can't work "dec every ${m.n}"`);
      if (all.length % m.n) ctx.err(line, `${all.length} sts isn't a multiple of ${m.n}; ${all.length % m.n} st(s) left over at the end of the round`, 'warn');
      const out = [];
      for (let g = 0; g < groups; g++) {
        const grp = all.slice(g * m.n, (g + 1) * m.n);
        const a = grp[grp.length - 2], b = grp[grp.length - 1];
        b.parents = a.parents.concat(b.parents); b.op = 'dec'; b.lean = 'r';
        out.push(...grp.slice(0, -2), b);
      }
      out.push(...all.slice(groups * m.n));
      // re-centre: the row is now physically narrower
      const cx = (all[0].x + all[all.length - 1].x) / 2;
      out.forEach((c, i) => { c.x = cx + i - (out.length - 1) / 2; });
      ns[0] = out;
      notes.push(m.n > 2 ? `*k${m.n - 2}, k2tog* around` : 'k2tog around');
    } else if (m.op === 'bo_center') {
      if (ns.length !== 1) fail(line, 'bind_off center works on an unsplit piece');
      const all = ns[0]; if (m.n >= all.length) fail(line, `Can't bind off ${m.n} of ${all.length} sts`);
      const start = Math.floor((all.length - m.n) / 2);
      if ((all.length - m.n) % 2) ctx.err(line, `Centre bind-off of ${m.n} from ${all.length} sts is off-centre by 1`, 'warn');
      all.slice(start, start + m.n).forEach(s => { s.op = 'bo'; });
      ns = [all.slice(0, start), all.slice(start, start + m.n), all.slice(start + m.n)];
      notes.push(`bind off centre ${m.n}`);
      P.split = { row: ri };
    }
  }
  const row = { index: ri, dir, line, stitches: [], fabric: fab };
  const live = [];
  const segIds = ns.map(() => P.segCounter++);
  ns.forEach((sgm, si) => sgm.forEach(c => {
    const st = mkStitch(P, { x: c.x, row: ri, op: c.op, t: 'k', parents: c.parents, seg: c.op === 'bo' ? -1 : segIds[si], lean: c.lean, line, color: P.color });
    c.parents.forEach(pp => { (pp.children = pp.children || []).push(st); });
    row.stitches.push(st);
    if (c.op !== 'bo') live.push(st);
  }));
  spec.assign(row.stitches.slice().sort((a, b) => a.x - b.x), ri, P.x0, msg => ctx.err(line, msg, 'warn'));
  const counts = groupSegs(live).map(s => s.length).join(' + ');
  const verb = dir === 'WS' ? 'WS' : 'RS';
  row.desc = `Row ${ri} (${verb}): ${fabricDesc(fab)}${notes.length ? ', ' + notes.join(', ') : ''}${untilDesc ? ' — ' + untilDesc : ''} → ${counts} sts`;
  P.rows.push(row); P.live = live;
}

function decAt(seg, side, line) {
  if (seg.length < 2) fail(line, 'Not enough stitches to decrease');
  if (side === 'left') { const a = seg.shift(), b = seg[0]; b.parents = a.parents.concat(b.parents); b.op = 'dec'; b.lean = 'l'; }
  else { const a = seg.pop(), b = seg[seg.length - 1]; b.parents = b.parents.concat(a.parents); b.op = 'dec'; b.lean = 'r'; }
}

function finalizePiece(P, sg, rg) {
  if (!P.rows.length) return;
  let minx = Infinity, maxx = -Infinity;
  P.stitches.forEach(s => { minx = Math.min(minx, s.x); maxx = Math.max(maxx, s.x); });
  P.minx = minx; P.maxx = maxx; P.nrows = P.rows.length;
  // work order: ordinal per stitch
  let ord = 0;
  P.rows.forEach(r => {
    const seq = r.stitches.slice().sort((a, b) => a.x - b.x);
    if (r.dir === 'RS' || r.dir === 'CO') seq.reverse();
    r.order = seq; r.firstOrd = ord;
    seq.forEach((s, i) => { s.ord = ord++; s.inRow = i; });
  });
  P.total = ord;
  P.widthIn = (maxx - minx + 1) / sg; P.heightIn = P.nrows / rg;
}

// ---------- Edges ----------
function edgeOf(built, expr) {
  // returns {pts:[{x,y}] in piece-local inches, piece, desc} list joined
  const parts = expr.split('+').map(s => s.trim()).filter(Boolean);
  const segsOut = [];
  for (const p0 of parts) {
    let rev = false, p = p0;
    if (p.startsWith('~')) { rev = true; p = p.slice(1).trim(); }
    const m = /^([a-z_][a-z0-9_]*)\.(left|right|top|bottom|neck)(?:\.(\d+))?(?:\[([^\]]*)\])?$/i.exec(p);
    if (!m) throw new Error(`Bad edge "${p0}". Examples: front.left[start:underarm], back.top.1, ~front.neck`);
    const P = built.pieces[m[1]];
    if (!P) throw new Error(`Unknown piece "${m[1]}" in edge "${p0}"`);
    let pts = edgePts(built, P, m[2], m[3], m[4]);
    if (rev) pts = pts.slice().reverse();
    segsOut.push({ piece: P.name, pts });
  }
  return segsOut;
}
function rowRef(P, s, def) {
  if (s === undefined || s === '') return def;
  if (s === 'start') return 0;
  if (s === 'end') return P.nrows - 1;
  if (/^\d+$/.test(s)) return +s;
  if (s in P.markers) return P.markers[s];
  throw new Error(`Unknown row/marker "${s}" on ${P.name}`);
}
function edgePts(built, P, side, idx, range) {
  const { sg, rg } = built;
  if (!P.nrows) throw new Error(`Piece ${P.name} has no rows`);
  if (side === 'left' || side === 'right') {
    let a = 0, b = P.nrows - 1;
    if (range !== undefined) { const [ra, rb] = range.split(':'); a = rowRef(P, ra.trim(), 0); b = rowRef(P, (rb || '').trim(), P.nrows - 1); }
    const step = a <= b ? 1 : -1; const pts = [];
    for (let r = a; step > 0 ? r <= b : r >= b; r += step) {
      const sts = P.rows[r].stitches; if (!sts.length) continue;
      const x = side === 'left' ? Math.min(...sts.map(s => s.x)) - 0.5 : Math.max(...sts.map(s => s.x)) + 0.5;
      pts.push({ x: x / sg, y: r / rg });
    }
    return pts;
  }
  const widen = (pts) => pts.length ? [{ x: pts[0].x - 0.5 / sg, y: pts[0].y }, ...pts, { x: pts[pts.length - 1].x + 0.5 / sg, y: pts[pts.length - 1].y }] : pts;
  if (side === 'bottom') return widen(P.rows[0].stitches.slice().sort((a, b) => a.x - b.x).map(s => ({ x: s.x / sg, y: -0.5 / rg })));
  if (side === 'top') {
    if (!P.top) throw new Error(`${P.name} has no bound-off top edge`);
    let segs = P.top;
    if (idx) { const k = +idx; if (!segs[k - 1]) throw new Error(`${P.name}.top.${k}: piece top has ${segs.length} part(s)`); segs = [segs[k - 1]]; }
    else if (segs.length > 1 && range === undefined) { /* whole top across gap */ }
    if (idx) return widen(segs[0].map(s => ({ x: s.x / sg, y: (s.row + 0.5) / rg })));
    return [].concat(...segs.map(sgm => widen(sgm.map(s => ({ x: s.x / sg, y: (s.row + 0.5) / rg })))));
  }
  if (side === 'neck') {
    if (!P.split) throw new Error(`${P.name}.neck: piece has no centre bind-off`);
    const r0 = P.split.row; const pts = [];
    const segAt = (r) => groupSegs(P.rows[r].stitches.filter(s => s.op !== 'bo'));
    for (let r = P.nrows - 1; r > r0; r--) { const sgs = segAt(r); if (sgs.length >= 2) { const L = sgs[0]; pts.push({ x: (L[L.length - 1].x + 0.5) / sg, y: r / rg }); } }
    P.rows[r0].stitches.filter(s => s.op === 'bo').forEach(s => pts.push({ x: s.x / sg, y: (r0 + 0.5) / rg }));
    for (let r = r0 + 1; r < P.nrows; r++) { const sgs = segAt(r); if (sgs.length >= 2) { const R = sgs[sgs.length - 1]; pts.push({ x: (R[0].x - 0.5) / sg, y: r / rg }); } }
    return pts;
  }
}
const polyLen = pts => { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); return L; };
const edgeLen = segs => segs.reduce((a, s) => a + polyLen(s.pts), 0);

// ---------- Checks ----------
function check(doc) {
  const built = doc.built; const errors = doc.errors; const checks = [];
  built.order.forEach(P => {
    P.expects.forEach(e => checks.push({ kind: 'count', piece: P.name, line: e.line, ok: e.ok, text: `${P.name}: ${e.want.join(' + ')} sts${e.ok ? '' : ` (have ${e.got.join(' + ')})`}` }));
    // rib balance
    P.rows.forEach(r => {
      if (r.fabric && /^rib/.test(r.fabric) && r.index === 1 && !P.round) {
        const sts = r.stitches.slice().sort((a, b) => a.x - b.x);
        if (sts[0].t !== sts[sts.length - 1].t) errors.push({ line: r.line, level: 'warn', msg: `${P.name}: rib isn't symmetric across ${sts.length} sts (edges start ${FABRIC_WORDS[sts[0].t]} and end ${FABRIC_WORDS[sts[sts.length - 1].t]})` });
      }
    });
  });
  const seams = [];
  const placed = {};
  doc.assemble.forEach(a => {
    if (a.kind === 'place') {
      if (!built.pieces[a.piece]) errors.push({ line: a.line, msg: `place: unknown piece "${a.piece}"`, level: 'error' });
      else if (!PLACES[a.at]) errors.push({ line: a.line, msg: `place: unknown spot "${a.at}" (front, back, left_arm, right_arm, neck)`, level: 'error' });
      else placed[a.piece] = a.at;
    }
  });
  const addSeam = (aExpr, bExpr, line, auto) => {
    try {
      const A = edgeOf(built, aExpr), B = edgeOf(built, bExpr);
      const la = edgeLen(A), lb = edgeLen(B);
      const diff = Math.abs(la - lb) / Math.max(la, lb, 1e-6);
      const level = diff < 0.05 ? 'ok' : diff < 0.15 ? 'ease' : 'bad';
      const s = { a: aExpr, b: bExpr, A, B, la, lb, diff, level, line, auto };
      seams.push(s);
      checks.push({ kind: 'seam', line, ok: level !== 'bad', level, text: `${auto ? '(pick-up) ' : ''}${aExpr} = ${bExpr}: ${la.toFixed(1)}″ vs ${lb.toFixed(1)}″` + (level === 'ease' ? ` — ease in ${Math.abs(la - lb).toFixed(1)}″` : level === 'bad' ? ` — ${Math.round(diff * 100)}% mismatch` : '') });
      if (level === 'bad') errors.push({ line, level: 'warn', msg: `Seam lengths differ by ${Math.round(diff * 100)}%: ${aExpr} (${la.toFixed(1)}″) vs ${bExpr} (${lb.toFixed(1)}″)` });
    } catch (e) { errors.push({ line, msg: e.message, level: 'error' }); }
  };
  built.order.forEach(P => { if (P.pickup) addSeam(`${P.name}.bottom`, P.pickup.expr, P.pickup.line, true); });
  doc.assemble.forEach(a => { if (a.kind === 'seam') addSeam(a.a, a.b, a.line, false); });
  // assembly order = order of seam statements; pick-ups join right after their source pieces are first sewn together
  let k = 0; seams.forEach(s => { if (!s.auto) s.stage = k++; });
  const piecesOf = s => new Set([...(s.A || []), ...(s.B || [])].map(x => x.piece));
  seams.forEach(s => { if (!s.auto) return; const src = new Set((s.B || []).map(x => x.piece));
    const first = seams.find(o => !o.auto && [...src].every(p => piecesOf(o).has(p)));
    s.stage = first ? first.stage + 0.6 : k; });
  built.order.forEach(P => { if (P.round && P.nrows) seams.push({ a: `${P.name}.left`, b: `${P.name}.right`, A: edgeOf(built, `${P.name}.left`), B: edgeOf(built, `${P.name}.right`), hidden: true, level: 'ok', stage: 0 }); });
  doc.nStages = k;
  // auto-place picked-up pieces
  built.order.forEach(P => { if (!placed[P.name] && P.pickup) placed[P.name] = 'neck'; });
  built.order.forEach(P => { if (!placed[P.name] && P.nrows) errors.push({ line: P.line, level: 'warn', msg: `${P.name} has no "place" in assemble — it won't appear in 3D` }); });
  doc.seams = seams; doc.placed = placed; doc.checks = checks;
  return checks;
}

// ---------- Mesh + placement ----------
const PLACES = { front: 1, back: 1, left_arm: 1, right_arm: 1, neck: 1, head: 1, scarf: 1, table: 1 };
// dress form: tapered capsules {a, b, ra, rb} in inches, y up, wearer faces +z
const BODY = {
  shoulderY: 23.6, shoulderX: 6.6, headY: 33.6,
  capsules: [
    { a: [-1.8, -10, 0], b: [-1.8, 20.2, 0], ra: 4.4, rb: 4.4 },
    { a: [1.8, -10, 0], b: [1.8, 20.2, 0], ra: 4.4, rb: 4.4 },
    { a: [-6.4, 23.2, 0], b: [6.4, 23.2, 0], ra: 2.5, rb: 2.5 },
    { a: [0, 22, 0], b: [0, 31, 0], ra: 2.2, rb: 2.0 },
    { a: [0, 32.4, 0.2], b: [0, 35.8, 0], ra: 3.1, rb: 3.1, head: true, grip: true },
    { a: [-3.0, 32.2, -0.2], b: [-3.05, 30.9, -0.1], ra: 0.75, rb: 0.6, grip: true, hidden: true },   // ears: what really holds a hat on
    { a: [3.0, 32.2, -0.2], b: [3.05, 30.9, -0.1], ra: 0.75, rb: 0.6, grip: true, hidden: true },
    { a: [0, 31.0, 2.6], b: [0, 32.2, 2.9], ra: 0.7, rb: 0.7, hidden: true }, // brow ridge
    { a: [0, 32.6, -2.7], b: [0, 31.2, -2.6], ra: 0.8, rb: 0.6, hidden: true }, // back of skull
  ],
};
const ARM_ANGLE = 50 * Math.PI / 180;
(function () {
  const c = Math.cos(ARM_ANGLE), s = Math.sin(ARM_ANGLE);
  [-1, 1].forEach(sx => {
    const a = [sx * BODY.shoulderX, BODY.shoulderY - 0.4, 0];
    const at = L => [a[0] + sx * c * L, a[1] - s * L, 0];
    BODY.capsules.push({ a, b: at(10), ra: 2.15, rb: 1.75 });       // upper arm
    BODY.capsules.push({ a: at(10), b: at(21), ra: 1.75, rb: 1.05 }); // forearm → wrist
    BODY.capsules.push({ a: at(21.8), b: at(24.5), ra: 1.2, rb: 1.0, hand: true });
  });
})();
const TABLE = { c: [0, 2, 24], r: 13, top: 2, depth: 1.5 };

const stretchOf = fab => !fab ? 1.15 : /rib/.test(fab) ? 1.55 : /garter|moss|seed/.test(fab) ? 1.2 : 1.15;
function rowExtent(P) {
  return P.rows.map(r => { let lo = Infinity, hi = -Infinity; r.stitches.forEach(s => { lo = Math.min(lo, s.x); hi = Math.max(hi, s.x); }); return { lo: lo - 0.5, w: hi - lo + 1 }; });
}
// Pieces knit in the round: mesh in (around, up) coordinates, so every round is a full ring of its own width
function buildRoundMesh(built, P) {
  const { sg, rg } = built;
  const cs = Math.max(1, Math.round(0.75 * sg)), cr = Math.max(1, Math.round(0.75 * rg));
  const ext = rowExtent(P); const W0 = Math.max(...ext.map(e => e.w));
  const nx = Math.max(3, Math.ceil(W0 / cs)), y0 = -0.5, ny = Math.max(1, Math.ceil((P.nrows - 0.5 - y0) / cr));
  const local = [], uv = [], us = [], wid = [];
  const rowAt = ys => ext[Math.max(0, Math.min(P.nrows - 1, Math.round(ys)))];
  for (let j = 0; j <= ny; j++) { const ys = Math.min(y0 + j * cr, P.nrows - 0.5); const e = rowAt(ys);
    for (let i = 0; i <= nx; i++) { const u = i / nx; local.push({ x: (e.lo + u * e.w) / sg, y: ys / rg }); uv.push(u, (ys - y0) / (P.nrows - 0.5 - y0)); us.push(u); wid.push(e.w / sg); } }
  const V = (i, j) => j * (nx + 1) + i; const tris = [], cons = [];
  const fabAt = y => { const r = P.rows[Math.max(0, Math.min(P.nrows - 1, Math.round(y * rg)))]; return r.fabric; };
  const addC = (a, b, k, horiz) => { const du = Math.abs(us[a] - us[b]) * (wid[a] + wid[b]) / 2, dy = Math.abs(local[a].y - local[b].y); cons.push([a, b, Math.hypot(du, dy), k, horiz ? stretchOf(fabAt(local[a].y)) : 0]); };
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { tris.push(V(i, j), V(i + 1, j), V(i + 1, j + 1), V(i, j), V(i + 1, j + 1), V(i, j + 1)); addC(V(i, j), V(i + 1, j + 1), 0.5, 0); addC(V(i + 1, j), V(i, j + 1), 0.5, 0); }
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    if (i < nx) addC(V(i, j), V(i + 1, j), 1, 1);
    if (j < ny) addC(V(i, j), V(i, j + 1), 1, 0);
    if (i + 2 <= nx) addC(V(i, j), V(i + 2, j), 0.15, 1);
    if (j + 2 <= ny) addC(V(i, j), V(i, j + 2), 0.15, 0);
  }
  return { local, uv, tris, cons, us, round: !!P.round, band: true, x0: P.minx - 0.5, y0, W: W0, H: P.nrows - 0.5 - y0, cs, cr, nx, ny };
}

function buildMesh(built, P) {
  // any piece whose rows are single contiguous runs (no neckline split) gets a smooth per-row band mesh
  if (P.round || !P.split) return buildRoundMesh(built, P);
  const { sg, rg } = built;
  const cs = Math.max(1, Math.round(0.75 * sg)), cr = Math.max(1, Math.round(0.75 * rg)); // ≈ 0.6–0.9″ cells
  const x0 = P.minx - 0.5, y0 = -0.5;
  const nx = Math.max(1, Math.ceil((P.maxx + 0.5 - x0) / cs)), ny = Math.max(1, Math.ceil((P.nrows - 0.5 - y0) / cr));
  const rowsX = P.rows.map(r => r.stitches.map(s => s.x).sort((a, b) => a - b));
  const covered = (xs, rs) => { const r = Math.round(rs); if (r < 0 || r >= P.nrows) return false; const a = rowsX[r]; for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - xs) <= 0.55) return true; return false; };
  const cell = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    let c = 0;
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) if (covered(x0 + (i + (a + 0.5) / 3) * cs, y0 + (j + (b + 0.5) / 3) * cr)) c++;
    cell[j * nx + i] = c >= 5 ? 1 : 0;
  }
  const vid = new Int32Array((nx + 1) * (ny + 1)).fill(-1);
  const local = [], uv = [];
  const W = nx * cs, H = ny * cr;
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    const used = [[i - 1, j - 1], [i, j - 1], [i - 1, j], [i, j]].some(([a, b]) => a >= 0 && b >= 0 && a < nx && b < ny && cell[b * nx + a]);
    if (!used) continue;
    vid[j * (nx + 1) + i] = local.length;
    local.push({ x: (x0 + i * cs) / sg, y: (y0 + j * cr) / rg });
    uv.push(i * cs / W, j * cr / H);
  }
  const tris = []; const cons = [];
  const V = (i, j) => vid[j * (nx + 1) + i];
  const addC = (a, b, k) => { if (a < 0 || b < 0) return; const horiz = Math.abs(local[a].y - local[b].y) < 1e-6 ? stretchOf(P.rows[Math.max(0, Math.min(P.nrows - 1, Math.round(local[a].y * rg)))].fabric) : 0; cons.push([a, b, Math.hypot(local[a].x - local[b].x, local[a].y - local[b].y), k, horiz]); };
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (!cell[j * nx + i]) continue;
    const a = V(i, j), b = V(i + 1, j), c = V(i + 1, j + 1), d = V(i, j + 1);
    tris.push(a, b, c, a, c, d);
    addC(a, c, 0.5); addC(b, d, 0.5);
  }
  const seen = new Set();
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    const a = V(i, j); if (a < 0) continue;
    const nb = (ii, jj, k) => { if (ii > nx || jj > ny) return; const b = V(ii, jj); if (b < 0) return; const key = a * 1e6 + b; if (seen.has(key)) return; // only along existing cells
      seen.add(key); addC(a, b, k); };
    // structural edges only if an adjacent cell exists
    const cellOn = (ci, cj) => ci >= 0 && cj >= 0 && ci < nx && cj < ny && cell[cj * nx + ci];
    if (cellOn(i, j) || cellOn(i, j - 1)) nb(i + 1, j, 1);
    if (cellOn(i, j) || cellOn(i - 1, j)) nb(i, j + 1, 1);
    if (V(i + 2, j) >= 0 && (cellOn(i, j) || cellOn(i, j - 1)) && (cellOn(i + 1, j) || cellOn(i + 1, j - 1))) nb(i + 2, j, 0.15);
    if (V(i, j + 2) >= 0 && (cellOn(i, j) || cellOn(i - 1, j)) && (cellOn(i, j + 1) || cellOn(i - 1, j + 1))) nb(i, j + 2, 0.15);
  }
  return { local, uv, tris, cons, x0, y0, W, H, cs, cr, nx, ny, texW: W, texH: H };
}

function placePiece(P, mesh, at, built, neckRef) {
  const n = mesh.local.length; const pos = new Float32Array(n * 3);
  const cx = (mesh.x0 + mesh.W / 2) / built.sg; const Hin = P.nrows / built.rg;
  const topY = BODY.shoulderY + 4.5;
  for (let k = 0; k < n; k++) {
    const { x, y } = mesh.local[k]; let w;
    if (at === 'front') w = [x - cx, topY - Hin + y, 8.5];
    else if (at === 'back') w = [-(x - cx), topY - Hin + y, -8.5];
    else if (at === 'left_arm' || at === 'right_arm') {
      const sx = at === 'left_arm' ? 1 : -1;
      const d = [sx * Math.cos(ARM_ANGLE), -Math.sin(ARM_ANGLE), 0];
      const a = [0, 0, -sx];
      const nrm = [sx * Math.sin(ARM_ANGLE), Math.cos(ARM_ANGLE), 0];
      const S = [sx * BODY.shoulderX, BODY.shoulderY - 0.4, 0];
      const along = 7 + (Hin - y);
      // wrap each row into its own 300° ring, so a tapered sleeve starts as a cone
      const ri = Math.max(0, Math.min(P.nrows - 1, Math.round(y * built.rg)));
      const rs = P.rows[ri].stitches; let lo = Infinity, hi = -Infinity; rs.forEach(s => { lo = Math.min(lo, s.x); hi = Math.max(hi, s.x); });
      const span = 300 * Math.PI / 180, Wd = (hi - lo + 1) / built.sg, R = Wd / span, rc = (lo + hi) / 2 / built.sg;
      const th = (x - rc) / R;
      w = [0, 1, 2].map(q => S[q] + d[q] * along + R * (nrm[q] * Math.cos(th) + a[q] * Math.sin(th)));
    } else if (at === 'torso') { // a tube around the body, hanging from the shoulders
      const circ = mesh.W / built.sg; const R = Math.max(circ / (2 * Math.PI), 6.5) + 0.5;
      const phi = -Math.PI / 2 + 2 * Math.PI * (mesh.us ? mesh.us[k] : (x - mesh.x0 / built.sg) / circ);
      w = [R * Math.sin(phi), topY - Hin + y, R * Math.cos(phi) * 0.75];
    } else if (at === 'neck' || at === 'head') { // rings: cylinder, x around, rows up
      const circ = mesh.W / built.sg; const R = circ / (2 * Math.PI);
      const phi = -Math.PI / 2 + 2 * Math.PI * (mesh.us ? mesh.us[k] : (x - mesh.x0 / built.sg) / circ);
      let rad, y0;
      if (at === 'head') { rad = Math.max(R, 3.6) + 0.6; y0 = BODY.headY - 2.5; }
      else if (P.pickup) { rad = R + 2.5; y0 = topY - 2.5; }
      else { rad = Math.max(R, 3.4) + 0.4; y0 = topY - 1.5; }
      let yy = y;
      if (at === 'neck' && !P.pickup && Hin > 9) { // a tall cowl is worn folded in half
        if (y > Hin / 2) { yy = Hin - y; rad += 0.8; }
        rad += 0.25 * Math.sin(phi * 5 + y * 0.7); // tiny wobble so it can slump into folds
        const z = rad * Math.cos(phi) + 1.2; w = [rad * Math.sin(phi), y0 + yy - (z + 3) * 0.45, z];
      } else w = [rad * Math.sin(phi), y0 + yy, rad * Math.cos(phi)];
    } else if (at === 'scarf') {
      const sc = scarfFrame((y - Hin / 2));
      const u = x - cx;
      w = [0, 1, 2].map(q => sc.p[q] + sc.w[q] * u);
    } else { // table: lifted flat above the table top
      w = [x - cx, TABLE.top + 6, TABLE.c[2] + (y - Hin / 2)];
    }
    pos[k * 3] = w[0]; pos[k * 3 + 1] = w[1]; pos[k * 3 + 2] = w[2];
  }
  return pos;
}

// centreline of a scarf around the neck: s = 0 behind the neck, |s| grows toward the two front ends
function scarfPoint(s) {
  const R = 6.2, y = BODY.shoulderY + 3.6, a = R * 1.75; const sg = Math.sign(s) || 1; const u = Math.abs(s);
  if (u <= a) { const th = s / R; return { p: [R * Math.sin(th), y, -R * Math.cos(th)], n: [0, 1, 0] }; }
  const thA = sg * 1.75; const e = [R * Math.sin(thA), y, -R * Math.cos(thA)];
  const v = u - a; const f = Math.min(1, v / 5);
  return { p: [e[0], y - Math.max(0, v - 1.5) * 0.98 + 0.6 * f, e[2] + 5.5 * Math.sin(f * Math.PI / 2)], n: [0, 1 - f, f] };
}
function scarfFrame(s) {
  const a = scarfPoint(s), b = scarfPoint(s + 0.05);
  let T = [0, 1, 2].map(q => b.p[q] - a.p[q]); const tl = Math.hypot(...T) || 1; T = T.map(v => v / tl);
  const N = a.n; let W = [N[1] * T[2] - N[2] * T[1], N[2] * T[0] - N[0] * T[2], N[0] * T[1] - N[1] * T[0]];
  const wl = Math.hypot(...W) || 1; W = W.map(v => v / wl);
  return { p: a.p, w: W };
}

function nearestVert(mesh, p) {
  let best = -1, bd = Infinity;
  for (let k = 0; k < mesh.local.length; k++) { const d = (mesh.local[k].x - p.x) ** 2 + (mesh.local[k].y - p.y) ** 2; if (d < bd) { bd = d; best = k; } }
  return best;
}
function samplePath(segs, t) {
  // segs: [{piece, pts}] ; t in [0,1] by arc length
  const total = edgeLen(segs); let target = t * total;
  for (const s of segs) {
    const L = polyLen(s.pts);
    if (target <= L + 1e-9 || s === segs[segs.length - 1]) {
      const pts = s.pts; if (pts.length === 1) return { piece: s.piece, p: pts[0] };
      for (let i = 1; i < pts.length; i++) {
        const l = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
        if (target <= l || i === pts.length - 1) { const f = l ? Math.min(1, target / l) : 0; return { piece: s.piece, p: { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * f } }; }
        target -= l;
      }
    }
    target -= L;
  }
}

// v2 spots, roughly: tubes around the torso, fronts on the front, hands on the arms, the rest on the table
const SPOT_MAP = { front_left: 'front', front_right: 'front', shoulders: 'front', left_hand: 'left_arm', right_hand: 'right_arm', left_foot: 'table', right_foot: 'table', waist: 'torso', left_leg: 'table', right_leg: 'table', crotch: 'table' };

// ---------- Cloth simulation ----------
function makeSim(doc) {
  const built = doc.built; const parts = [];
  let N = 0;
  built.order.forEach(P => {
    const at = SPOT_MAP[doc.placed[P.name]] || doc.placed[P.name]; if (!at || !P.nrows) return;
    const mesh = buildMesh(pv(built, P), P);
    const pos0 = placePiece(P, mesh, at, pv(built, P));
    parts.push({ P, mesh, offset: N, pos0, at }); N += mesh.local.length;
  });
  const partOf = {}; parts.forEach(p => partOf[p.P.name] = p);
  const pos = new Float32Array(N * 3), prev = new Float32Array(N * 3);
  parts.forEach(p => { pos.set(p.pos0, p.offset * 3); });
  prev.set(pos);
  const cons = [];
  parts.forEach(p => p.mesh.cons.forEach(([a, b, r, k, h]) => cons.push(a + p.offset, b + p.offset, r, k, h)));
  const C = new Float32Array(cons); const CS = 5;
  const seamPairs = [], pairStage = []; const seen = new Set();
  doc.seams.forEach(s => {
    if (!s.A || !s.B) return;
    const pa = s.A.map(x => partOf[x.piece]), pb = s.B.map(x => partOf[x.piece]);
    if (pa.some(x => !x) || pb.some(x => !x)) return;
    const L = Math.max(edgeLen(s.A), edgeLen(s.B)); const n = Math.max(4, Math.ceil(L / 0.7));
    for (let i = 0; i <= n; i++) {
      const sa = samplePath(s.A, i / n), sb = samplePath(s.B, i / n);
      const A = partOf[sa.piece], B = partOf[sb.piece];
      const va = nearestVert(A.mesh, sa.p) + A.offset, vb = nearestVert(B.mesh, sb.p) + B.offset;
      if (va === vb) continue;
      const key = va < vb ? va + ':' + vb : vb + ':' + va; if (seen.has(key)) continue; seen.add(key);
      seamPairs.push(va, vb); pairStage.push(s.stage || 0);
    }
  });
  const gathers = [];
  // gathered tops: pull every top-edge vertex toward their common centre
  parts.forEach(p => {
    if (!p.P.gather) return;
    let vs;
    if (p.mesh.band) { const m = p.mesh; vs = []; for (let i = 0; i <= m.nx; i++) vs.push(m.ny * (m.nx + 1) + i + p.offset); }
    else { const pts = engineEdgeOf(built, `${p.P.name}.top`)[0].pts; vs = [...new Set(pts.map(q => nearestVert(p.mesh, q) + p.offset))]; }
    gathers.push(Int32Array.from(vs));
  });
  const S = new Int32Array(seamPairs); const ST = new Float32Array(pairStage);
  const useTable = parts.some(p => p.at === 'table');
  const centred = parts.filter(p => p.at === 'head');
  const nStages = doc.nStages || 1;
  const STAGE_DT = 0.45, STAGE_LEN = 1.0;
  const tGrav = 0.2 + (nStages - 1) * STAGE_DT + STAGE_LEN;
  const stageK = new Float32Array(Math.ceil(nStages + 2) * 2);
  const stageOf = (stage, T) => { const u = Math.min(1, Math.max(0, (T - 0.2 - stage * STAGE_DT) / STAGE_LEN)); return u * u * (3 - 2 * u); };
  const caps = BODY.capsules;
  let time = 0;
  function step(dt, opts = {}) {
    time += dt;
    const assembleT = opts.assembleT ?? time;
    const grav = Math.min(1, Math.max(0, (assembleT - tGrav) / 1.4)) * 386 * 0.045; // inches/s² (softened)
    const damp = assembleT < tGrav + 1 ? 0.9 : 0.97;
    const SK = new Float32Array(ST.length); let anyK = false;
    for (let c = 0; c < ST.length; c++) { SK[c] = stageOf(ST[c], assembleT); if (SK[c] > 0) anyK = true; }
    for (let i = 0; i < N; i++) {
      const ix = i * 3;
      for (let q = 0; q < 3; q++) {
        const p = pos[ix + q]; const v = (p - prev[ix + q]) * damp;
        prev[ix + q] = p; pos[ix + q] = p + v + (q === 1 ? -grav * dt * dt : 0);
      }
    }
    const iters = opts.iters || 14;
    for (let it = 0; it < iters; it++) {
      for (let c = 0; c < C.length; c += CS) {
        const a = C[c] * 3, b = C[c + 1] * 3, r = C[c + 2], k = C[c + 3];
        const dx = pos[b] - pos[a], dy = pos[b + 1] - pos[a + 1], dz = pos[b + 2] - pos[a + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        // knit fabric: compresses easily, stretches ~25% widthwise before resisting
        const rMax = C[c + 4] ? r * C[c + 4] : r;
        let diff;
        if (d > rMax) diff = (d - rMax) / d; else if (d < r) diff = 0.3 * (d - r) / d; else continue;
        const f = 0.5 * k * diff;
        pos[a] += dx * f; pos[a + 1] += dy * f; pos[a + 2] += dz * f;
        pos[b] -= dx * f; pos[b + 1] -= dy * f; pos[b + 2] -= dz * f;
      }
      if (anyK) for (let c = 0; c < S.length; c += 2) {
        const f = 0.5 * SK[c >> 1]; if (!f) continue;
        const a = S[c] * 3, b = S[c + 1] * 3;
        const dx = pos[b] - pos[a], dy = pos[b + 1] - pos[a + 1], dz = pos[b + 2] - pos[a + 2];
        pos[a] += dx * f; pos[a + 1] += dy * f; pos[a + 2] += dz * f;
        pos[b] -= dx * f; pos[b + 1] -= dy * f; pos[b + 2] -= dz * f;
      }
      if (grab) applyGrab();
      if (gathers.length) { const g = stageOf(0, assembleT); if (g > 0) for (const vs of gathers) {
        let cx = 0, cy = 0, cz = 0; for (const v of vs) { cx += pos[v * 3]; cy += pos[v * 3 + 1]; cz += pos[v * 3 + 2]; }
        cx /= vs.length; cy /= vs.length; cz /= vs.length; const f = 0.5 * g;
        for (const v of vs) { pos[v * 3] += (cx - pos[v * 3]) * f; pos[v * 3 + 1] += (cy - pos[v * 3 + 1]) * f; pos[v * 3 + 2] += (cz - pos[v * 3 + 2]) * f; }
      } }
      if (it % 2 === 1 || it === iters - 1) collide();
    }
    // a head holds a hat centred: keep head-placed pieces on the head's axis (x, z)
    for (const p of centred) {
      let cx = 0, cz = 0; const a = p.offset, n = p.mesh.local.length;
      for (let k = a; k < a + n; k++) { cx += pos[k * 3]; cz += pos[k * 3 + 2]; }
      cx = cx / n * 0.5; cz = (cz / n - 0.1) * 0.5;
      for (let k = a; k < a + n; k++) { pos[k * 3] -= cx; pos[k * 3 + 2] -= cz; prev[k * 3] -= cx; prev[k * 3 + 2] -= cz; }
    }
  }
  function collide() {
    const th = 0.45;
    for (let i = 0; i < N; i++) {
      const ix = i * 3; let px = pos[ix], py = pos[ix + 1], pz = pos[ix + 2];
      if (useTable) {
        const dx = px - TABLE.c[0], dz = pz - TABLE.c[2]; const rr = Math.hypot(dx, dz);
        if (py < TABLE.top + th && py > TABLE.top - TABLE.depth) {
          const up = TABLE.top + th - py, side = TABLE.r + th - rr;
          if (side > 0) { if (up < side) pos[ix + 1] = TABLE.top + th; else { const s = (TABLE.r + th) / (rr || 1e-6); pos[ix] = TABLE.c[0] + dx * s; pos[ix + 2] = TABLE.c[2] + dz * s; }
            prev[ix] = prev[ix] * 0.3 + pos[ix] * 0.7; prev[ix + 2] = prev[ix + 2] * 0.3 + pos[ix + 2] * 0.7; prev[ix + 1] = prev[ix + 1] * 0.5 + pos[ix + 1] * 0.5; px = pos[ix]; py = pos[ix + 1]; pz = pos[ix + 2]; }
        }
      }
      for (const c of caps) {
        const ax = c.a[0], ay = c.a[1], az = c.a[2];
        const bx = c.b[0] - ax, by = c.b[1] - ay, bz = c.b[2] - az;
        const L2 = bx * bx + by * by + bz * bz;
        let t = L2 ? ((px - ax) * bx + (py - ay) * by + (pz - az) * bz) / L2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = ax + bx * t, qy = ay + by * t, qz = az + bz * t;
        const dx = px - qx, dy = py - qy, dz = pz - qz; const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const R = c.ra + (c.rb - c.ra) * t + th;
        if (d < R && d > 1e-6) { const s = R / d; pos[ix] = qx + dx * s; pos[ix + 1] = qy + dy * s; pos[ix + 2] = qz + dz * s; px = pos[ix]; py = pos[ix + 1]; pz = pos[ix + 2];
          // friction: pull prev toward current to kill sliding
          const fr = c.grip ? 0.95 : 0.5; // skin grips knit much more than the smooth form
          prev[ix] = prev[ix] * (1 - fr) + pos[ix] * fr; prev[ix + 1] = prev[ix + 1] * (1 - fr) + pos[ix + 1] * fr; prev[ix + 2] = prev[ix + 2] * (1 - fr) + pos[ix + 2] * fr; }
      }
    }
  }
  // user grabbing: a patch of vertices follows the pointer, weighted by distance from the grabbed point
  let grab = null;
  function applyGrab() {
    const { idx, w, off, target } = grab;
    for (let k = 0; k < idx.length; k++) { const i = idx[k] * 3, f = w[k];
      for (let q = 0; q < 3; q++) pos[i + q] += (target[q] + off[k * 3 + q] - pos[i + q]) * f; }
  }
  function startGrab(vi, radius = 2.2) {
    const part = parts.find(p => vi >= p.offset && vi < p.offset + p.mesh.local.length); if (!part) return null;
    const L = part.mesh.local, c = L[vi - part.offset]; const idx = [], w = [], off = [];
    for (let k = 0; k < L.length; k++) { const d = Math.hypot(L[k].x - c.x, L[k].y - c.y); if (d > radius) continue;
      const j = (part.offset + k) * 3; idx.push(part.offset + k); w.push(0.9 * (1 - d / radius) ** 2 + (d === 0 ? 0.1 : 0)); off.push(pos[j] - pos[vi * 3], pos[j + 1] - pos[vi * 3 + 1], pos[j + 2] - pos[vi * 3 + 2]); }
    grab = { idx: Int32Array.from(idx), w: Float32Array.from(w), off: Float32Array.from(off), target: [pos[vi * 3], pos[vi * 3 + 1], pos[vi * 3 + 2]], part: part.P.name };
    return grab;
  }
  function endGrab() { grab = null; }
  function reset() { time = 0; parts.forEach(p => pos.set(p.pos0, p.offset * 3)); prev.set(pos); }
  function seamGap() { let m = 0; for (let c = 0; c < S.length; c += 2) { const a = S[c] * 3, b = S[c + 1] * 3; m = Math.max(m, Math.hypot(pos[a] - pos[b], pos[a + 1] - pos[b + 1], pos[a + 2] - pos[b + 2])); } return m; }
  return { parts, pos, step, reset, seamGap, startGrab, endGrab, get grab() { return grab; }, seams: S, useTable, stageOf, tGrav, nStages, settleT: tGrav + 6, nSeam: S.length / 2, get time() { return time; }, N };
}

function run(src, overrides) {
  const doc = buildDoc(src, overrides || {});
  try { assemble(doc, doc.G); } catch (e) { doc.errors.push({ line: 0, msg: 'Internal error: ' + e.message, level: 'error' }); console.error(e); }
  delete doc.G;
  const seen = new Set(); doc.errors = doc.errors.filter((e) => { const k = `${e.line}|${e.level}|${e.msg}`; if (seen.has(k)) return false; seen.add(k); return true; });
  doc.errors.sort((a, b) => (a.line || 0) - (b.line || 0));
  return doc;
}
// each piece has its own gauge: mesh and placement read it from a per-piece view of `built`
const pv = (built, P) => ({ ...built, sg: P.sg, rg: P.rg });

export { applyParams, evalExpr, parse, build, check, run, engineEdgeOf as edgeOf, edgeLen, buildMesh, makeSim, BODY, TABLE, fabricDesc };
