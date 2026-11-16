// @ts-nocheck -- engine internals are loosely typed; the public shapes are in ../types.ts
// The interpreter: header, definitions, flow control, pieces and their statements.
import { evalExpr, expandVars, UnknownName } from './expr';
import { parseParams, expandSizes, tree, stripComment, qtoks, unq, isHex } from './lex';
import { parseRow, parseKey, KnitError } from './rows';
import { builtinFabric, writtenFabric, stitchDef, chartDef } from './fabric';
import { newPiece, mkSt, startNeedle, freshSts, assignFabric, workRow, setSections, holdNow, addHolder, sectionCounts, countsText, layoutFresh, flip } from './piece';
import { edgeOf, edgeLen, splitTop, toIn, EdgeError } from './edges';
const userErr = (e) => e instanceof KnitError || e instanceof UnknownName || e instanceof EdgeError;

const fail = (m) => { throw new KnitError(m); };
const LEN = /^(-?\d*\.?\d+)(in|cm)$/;
const isLen = (t) => LEN.test(t || '');
const lenIn = (t) => { const m = LEN.exec(t); return toIn(+m[1], m[2]); };
const isNum = (t) => /^-?\d*\.?\d+$/.test(t || '');
const int = (t, what) => { if (!/^-?\d+$/.test(t || '')) fail(`${what} needs a whole number${t ? `, not "${t}"` : ''}`); return +t; };
const VERBS = new Set(['inc', 'dec', 'bind_off', 'cast_on', 'hold', 'buttonhole']);
const PLACE_WORDS = new Set(['edges', 'neck', 'center', 'start', 'end', 'left', 'right', 'markers', 'evenly', 'all']);
const SCHED = new Set(['every', 'spaced', 'last', 'ending']);
const START = new Set(['cast_on', 'pick_up', 'join']);

class StopCopy extends Error {}

// ---------- Entry ----------
export function buildDoc(src, overrides) {
  const errors = [];
  const lines = src.split('\n');
  const pctx = parseParams(lines, overrides || {}, errors);
  // per-size lists, except in chart bodies, titles, links and notes
  let inChart = false;
  for (let i = 0; i < lines.length; i++) {
    const t = stripComment(lines[i]).trim();
    if (inChart) { if (t === 'end') inChart = false; continue; }
    if (/^chart\b/.test(t) && !/[{}]/.test(t)) { inChart = true; }
    if (/^(pattern|source)\b/.test(t)) continue;
    const masks = [];
    let s = lines[i].replace(/(\bnote\s+|\bprinted\s+|\bkey\s+[^=]*=.*?\s)("[^"]*")\s*$|(\bnote\s+|\bprinted\s+)("[^"]*")/g, (m0) => { masks.push(m0); return `\u0000${masks.length - 1}\u0000`; });
    // comments are left alone
    const c = stripComment(s); const tail = s.slice(c.length);
    s = expandSizes(c, pctx, i + 1, errors) + tail;
    lines[i] = s.replace(/\u0000(\d+)\u0000/g, (_, k) => masks[+k]);
  }
  const doc = { name: '', source: '', params: pctx.params, expanded: lines.join('\n'), errors, checks: [], seams: [], assemble: [], built: null, notes: [] };
  const nodes = tree(lines, errors);
  const G = makeGlobal(doc, pctx);
  const vars = Object.assign(Object.create(null), pctx.vars);
  G.vars = vars;
  runTop(G, nodes, vars);
  if (!G.gauges.length) { G.gauges.push({ sts: 20, rows: 28, per: 4, fab: null, needle: null }); }
  for (const P of G.order) finalizePiece(P);
  doc.built = { pieces: G.pieces, order: G.order, sg: G.gaugeFor(null, null).sg, rg: G.gaugeFor(null, null).rg };
  doc.G = G;
  return doc;
}

function makeGlobal(doc, pctx) {
  const G = {
    doc, groups: pctx.groups, gauges: [], yarns: {}, defaultYarn: null, defaultColor: '#b89b72', keys: {}, fabrics: {}, defines: {},
    pieces: {}, order: [], pieceNodes: {}, asm: [], finish: [], line: 0, approx: false,
    err(line, msg, level = 'error') { doc.errors.push({ line, msg, level }); },
    warn(line, msg) { doc.errors.push({ line, msg, level: 'warn' }); },
    warnOnce(P, key, line, msg) { const w = P ? P.warned : (G._w = G._w || {}); if (w[key]) return; w[key] = 1; G.warn(line, msg); },
    yarnColor(name, P) { if (!name) return P ? P.color : G.defaultColor; if (isHex(name)) return name; const y = G.yarns[name]; return y ? y.color : (P ? P.color : G.defaultColor); },
    gaugeFor(fab, needle) {
      let best = null, bs = -1;
      for (const g of G.gauges) {
        if (g.fab && g.fab !== fab) continue; if (g.needle && g.needle !== needle) continue;
        const sc = (g.fab ? 2 : 0) + (g.needle ? 1 : 0); if (sc > bs) { bs = sc; best = g; }
      }
      const g = best || { sts: 20, rows: 28, per: 4 };
      const sg = g.sts / g.per, rg0 = g.rows / g.per;
      // garter with no gauge of its own is square: twice as many rows as stitches per inch
      const rg = fab === 'garter' && !(best && best.fab === 'garter') ? 2 * sg : rg0;
      return { sg, rg, approx: !!(best && best.approx) || G.approx };
    },
  };
  return G;
}

// ---------- ${} and scope ----------
function ex(G, text, vars) {
  try { return expandVars(text, vars, G.groups); }
  catch (e) { fail(e instanceof UnknownName ? `\${${e.expr}}: unknown name "${e.name0}" (declare it with param or let)` : `\${${e.expr || ''}}: ${e.message}`); }
}
const child = (vars) => Object.create(vars);
function cond(G, expr, vars) {
  const t = ex(G, expr, vars);
  try { return !!evalExpr(t, vars, G.groups); } catch (e) { fail(`if ${expr}: ${e instanceof UnknownName ? `unknown name "${e.name0}"` : e.message}`); }
}
function forValues(G, spec, vars) {
  const m = /^([a-z_][a-z0-9_]*)\s+in\s+(.*)$/i.exec(spec);
  if (!m) fail('for VAR in A..B { … }  or  for VAR in x y z { … }');
  const rest = ex(G, m[2].trim(), vars);
  const r = /^(-?\d+)\s*\.\.\s*(-?\d+)$/.exec(rest);
  if (r) { const a = +r[1], b = +r[2]; const out = []; for (let k = a; a <= b ? k <= b : k >= b; k += a <= b ? 1 : -1) out.push(k); return [m[1], out]; }
  return [m[1], qtoks(rest).map(unq)];
}
function letValue(G, text, vars) {
  const t = ex(G, text.trim(), vars);
  if (/^"[^"]*"$/.test(t)) return unq(t);
  try { const v = evalExpr(t, vars, G.groups); return v; } catch { return t; }
}

// ---------- Top level ----------
function runTop(G, nodes, vars) {
  for (const nd of nodes) {
    G.line = nd.line;
    try { topStmt(G, nd, vars); }
    catch (e) { if (userErr(e)) G.err(nd.line, e.message); else { G.err(nd.line, 'Internal error: ' + e.message); console.error(e); } }
  }
}
function topStmt(G, nd, vars) {
  const head = nd.kind === 'def' ? nd.text : ex(G, nd.text, vars);
  const t = qtoks(head); const k = t[0];
  if (nd.kind === 'piece') return buildPiece(G, nd, vars);
  if (nd.kind === 'assemble') { G.asm.push({ body: nd.body, vars, line: nd.line }); return; }
  if (nd.kind === 'def') return defStmt(G, nd, vars);
  if (nd.kind === 'block') {
    if (k === 'if') { return ifBlock(G, nd, vars, (body, v) => runTop(G, body, v)); }
    if (k === 'for') { const [name, vals] = forValues(G, head.slice(3).trim(), vars); for (const v of vals) { const sc = child(vars); sc[name] = v; runTop(G, nd.body, sc); } return; }
    if (k === 'define') return defineBlock(G, G.defines, head, nd);
    fail(`"${k} { … }" is not allowed at the top level`);
  }
  switch (k) {
    case 'pattern': G.doc.name = unq(t.slice(1).join(' ')); return;
    case 'source': G.doc.source = t[1] || ''; return;
    case 'param': return;
    case 'gauge': return gaugeStmt(G, t);
    case 'yarn': return yarnDecl(G, head);
    case 'finish': G.finish.push(head); return;
    case 'key': return keyStmt(G, head);
    case 'let': return letStmt(G, head, vars);
    case 'note': G.doc.notes.push({ line: nd.line, text: unq(t.slice(1).join(' ')) }); return;
    case 'cut': return cutStmt(G, t, nd.line);
    case 'end': return;
  }
  fail(`Unknown top-level statement "${k}". Expected pattern, source, param, gauge, yarn, key, let, stitch, chart, define, if, for, piece, cut or assemble`);
}
function ifBlock(G, nd, vars, run) {
  const head = ex(G, nd.text, vars);
  if (cond(G, head.replace(/^if\s+/, ''), vars)) return run(nd.body, child(vars));
  for (const e of nd.elses || []) {
    const h = ex(G, e.text, vars).replace(/^else\s*/, '');
    if (!h) return run(e.body, child(vars));
    if (/^if\s/.test(h) && cond(G, h.replace(/^if\s+/, ''), vars)) return run(e.body, child(vars));
  }
}
function defineBlock(G, table, head, nd) {
  const m = /^define\s+([a-z_][a-z0-9_]*)\s*(?:\(([^)]*)\))?\s*$/i.exec(head);
  if (!m) fail('define NAME { … }  or  define NAME(a, b) { … }');
  table[m[1]] = { args: m[2] ? m[2].split(',').map((s) => s.trim()).filter(Boolean) : [], body: nd.body, line: nd.line };
}
function letStmt(G, head, vars) {
  const m = /^let\s+([a-z_][a-z0-9_]*)\s*=\s*(.+)$/i.exec(head);
  if (!m) fail('let NAME = VALUE');
  vars[m[1]] = letValue(G, m[2], vars);
}
function gaugeStmt(G, t) {
  let i = 1; const g = { fab: null, needle: null, approx: false };
  if (t[i] === 'approx') { g.approx = true; G.approx = true; i++; }
  if (t[i] && !isNum(t[i]) && t[i] !== 'on') { g.fab = t[i]; i++; }
  if (t[i] === 'on') { g.needle = t[i + 1]; i += 2; }
  const rest = t.slice(i).join(' ');
  const m = /^(\d*\.?\d+)\s*sts\s*x\s*(\d*\.?\d+)\s*rows\s*=\s*(\d*\.?\d+)\s*(in|cm)$/.exec(rest);
  if (!m) fail('gauge [FABRIC] [on NEEDLE] 20 sts x 28 rows = 4 in');
  g.sts = +m[1]; g.rows = +m[2]; g.per = m[4] === 'cm' ? +m[3] / 2.54 : +m[3];
  if (!(g.sts > 0 && g.rows > 0 && g.per > 0)) fail('gauge numbers must be positive');
  G.gauges.push(g);
}
function yarnDecl(G, head) {
  const t = qtoks(head);
  if (isHex(t[1])) { G.defaultColor = t[1]; if (!G.defaultYarn) G.defaultYarn = null; return; }
  const name = t[1]; if (!name || !/^[a-z_][a-z0-9_]*$/i.test(name)) fail('yarn #rrggbb | yarn NAME #rrggbb [xN] ["Label"] | yarn NAME = A+B');
  const y = { name, color: null, strands: 1, label: name };
  if (t[2] === '=') {
    const parts = t.slice(3).filter((x) => !/^"/.test(x)).join(' ');
    const m = /^([a-z_][a-z0-9_]*)\s*x\s*(\d*\.?\d+)$/i.exec(parts) || /^([a-z_][a-z0-9_]*)\s+x(\d*\.?\d+)$/i.exec(parts);
    const names = m ? [m[1]] : parts.split('+').map((s) => s.trim());
    for (const nm of names) if (!G.yarns[nm]) fail(`yarn ${name}: unknown yarn "${nm}"`);
    y.color = G.yarns[names[0]].color; y.parts = names; if (m) y.strands = +m[2];
  } else {
    if (!isHex(t[2])) fail(`yarn ${name} needs a colour: yarn ${name} #3d6274`);
    y.color = t[2];
    const x = t.find((q) => /^x\d*\.?\d+$/.test(q)); if (x) y.strands = +x.slice(1);
  }
  const lab = t.find((q) => /^"/.test(q)); if (lab) y.label = unq(lab);
  G.yarns[name] = y; if (!G.defaultYarn) { G.defaultYarn = name; G.defaultColor = y.color; }
}
function keyStmt(G, head) {
  const m = /^key\s+(\S+)\s*=\s*(.*?)\s*(?:"([^"]*)")?\s*$/.exec(head);
  if (!m) fail('key NAME = STITCHES ["text"]  or  key NAME = A to B "text"');
  const info = parseKey(m[2], G.keys);
  G.keys[m[1]] = { ...info, word: m[1], text: m[3] };
}
function defStmt(G, nd, vars) {
  const t = qtoks(nd.text); const kind = t[0]; const name = t[1];
  if (!name || !/^[a-z_][a-z0-9_]*$/i.test(name)) fail(`${kind} NAME [options] … end`);
  if (builtinFabric(name)) fail(`"${name}" is a built-in fabric`);
  const opts = new Set(t.slice(2));
  const err = (line, msg) => G.err(line, msg);
  if (kind === 'stitch') {
    const lines = nd.lines.map((l) => ({ line: l.line, text: ex(G, l.text, vars) }));
    G.fabrics[name] = stitchDef(name, opts.has('round'), lines, G.keys, err);
  } else {
    G.fabrics[name] = chartDef(name, { odd: opts.has('odd'), mosaic: opts.has('mosaic'), round: opts.has('round') }, nd.lines, G.keys, G.yarns, err);
  }
}

// ---------- Fabrics ----------
function fabricByName(G, name) {
  const b = builtinFabric(name); if (b) return b;
  if (G.fabrics[name]) return G.fabrics[name];
  return null;
}
/** Parse fabric tokens → parts [{fab, count, sec, shift}] */
function parseFabric(G, ctx, toks) {
  const parts = [];
  for (let i = 0; i < toks.length; i++) {
    let tk = toks[i];
    if (tk === 'shift') { const p = parts[parts.length - 1]; if (!p) fail('shift follows a fabric'); p.shift = int(toks[++i], 'shift'); continue; }
    let attach = null;
    if (/^"/.test(tk)) {
      const m = /^("[^"]*")(?::(.*))?$/.exec(tk); attach = m[2] ?? null;
      if (attach === null && toks[i + 1] && /^:/.test(toks[i + 1])) attach = toks[++i].slice(1);
      let fab; try { fab = writtenFabric(unq(m[1]), G.keys); } catch (e) { fail(e.message); }
      parts.push(partOf(fab, attach)); continue;
    }
    const m = /^([a-z_][a-z0-9_]*)(?::(.+))?$/i.exec(tk);
    if (!m) fail(`can't read fabric "${tk}"`);
    const fab = fabricByName(G, m[1]);
    if (!fab) fail(`Unknown fabric or shaping "${tk}". Fabrics: st, rev_st, garter, seed, moss, edge, ribAxB, a quoted row, or a stitch/chart name`);
    parts.push(partOf(fab, m[2] ?? null));
  }
  return parts.length ? parts : null;
  function partOf(fab, attach) { if (attach == null || attach === '') return { fab, count: null }; if (/^\d+$/.test(attach)) return { fab, count: +attach }; return { fab, sec: attach }; }
}

// ---------- Pieces ----------
function buildPiece(G, nd, vars) {
  const head = ex(G, nd.text, vars);
  const t = qtoks(head);
  const name = t[1];
  if (!name || !/^[a-z_][a-z0-9_]*$/i.test(name)) fail('piece NAME [round] [top_down] [like OTHER [mirrored] [until MARKER]]');
  if (G.pieces[name]) fail(`Duplicate piece name "${name}"`);
  const opts = new Set(t.slice(2));
  const li = t.indexOf('like');
  const likeName = li >= 0 ? t[li + 1] : null;
  const ui = t.indexOf('until');
  let round = opts.has('round');
  if (likeName) { const src = G.pieceNodes[likeName]; if (!src) fail(`"like ${likeName}": no such piece (it must come first)`); round = round || src.round; }
  const P = newPiece(G, name, nd.line, { round, icord: opts.has('icord'), topDown: opts.has('top_down') });
  if (likeName) P.topDown = P.topDown || G.pieceNodes[likeName].topDown;
  G.pieces[name] = P; G.order.push(P);
  G.pieceNodes[name] = { nd, vars, round, topDown: P.topDown, likeName, mirrored: opts.has('mirrored'), until: ui >= 0 ? t[ui + 1] : null };
  const ctx = { G, P, vars: child(vars), defines: Object.create(G.defines), frames: [], mirror: false, errs: 0 };
  ctx.vars.piece = name;
  try { drive(ctx, pieceBody(ctx, name, nd.body)); }
  catch (e) { if (e.abort) { if (!e.quiet) G.err(nd.line, `${name}: stopped after too many errors`); } else throw e; }
  if (!P.rows.length && !G.doc.errors.some((e) => e.level === 'error' && e.line > nd.line && e.line <= (nd.body.length ? nd.body[nd.body.length - 1].line : nd.line))) G.err(nd.line, `Piece "${name}" never starts (begin with cast_on, pick_up or join)`);
}
/** The body of a piece, following `like` copies. */
function* pieceBody(ctx, name, ownBody) {
  const info = ctx.G.pieceNodes[name];
  if (!info.likeName) { yield* runStmts(ctx, ownBody, { top: true }); return; }
  const ownStart = ownBody.find((s) => START.has(s.text.split(/\s+/)[0]) && !s.kind);
  const rest = ownBody.filter((s) => s !== ownStart);
  const saved = { mirror: ctx.mirror, until: ctx.until, replace: ctx.replaceStart, vars: ctx.vars };
  if (info.mirrored) ctx.mirror = !ctx.mirror;
  ctx.until = info.until || ctx.until; ctx.replaceStart = ownStart || ctx.replaceStart;
  const src = ctx.G.pieceNodes[info.likeName];
  ctx.vars = child(src.vars); ctx.vars.piece = name;
  try { yield* pieceBody(ctx, info.likeName, src.nd.body); }
  catch (e) { if (!(e instanceof StopCopy)) throw e; }
  ctx.mirror = saved.mirror; ctx.until = saved.until; ctx.replaceStart = saved.replace; ctx.vars = saved.vars;
  ctx.started = true;
  yield* runStmts(ctx, rest, { top: true });
}

function drive(ctx, gen) { for (let r = gen.next(); !r.done; r = gen.next()) { /* rows are performed in place */ } }

/** `at_same_time { … } and { … }`: the `and` blocks belong to the at_same_time before them. */
function pairAnds(nodes) {
  const out = [];
  for (const nd of nodes) {
    const k = nd.kind === 'block' && nd.text.split(/\s+/)[0];
    const prev = out[out.length - 1];
    if (k === 'and' && prev && prev.kind === 'block' && /^at_same_time\b/.test(prev.text)) { prev.ands.push(nd); continue; }
    if (k === 'at_same_time') nd.ands = []; // nodes are run again by `like`: pair them afresh
    out.push(nd);
  }
  return out;
}
function* runStmts(ctx, nodes) {
  for (const nd of pairAnds(nodes)) {
    if (anyHit(ctx)) return;
    ctx.G.line = nd.line;
    try { yield* stmt(ctx, nd); }
    catch (e) {
      if (e instanceof StopCopy || e.abort) throw e;
      const msg = userErr(e) ? e.message : 'Internal error: ' + e.message;
      if (!userErr(e)) console.error(e);
      ctx.G.err(nd.line, msg);
      if (!ctx.P.rows.length) { const a = new Error('abort'); a.abort = true; a.quiet = true; throw a; } // the piece never started
      if (++ctx.errs > 12) { const a = new Error('abort'); a.abort = true; throw a; }
    }
  }
}
const anyHit = (ctx) => ctx.frames.some((f) => f.hit);

function* stmt(ctx, nd) {
  const { G, P } = ctx;
  const head = nd.kind === 'def' ? nd.text : ex(G, nd.text, ctx.vars);
  const t = qtoks(head); const k = t[0];
  if (nd.kind === 'block') {
    if (k === 'if') { const h = head.replace(/^if\s+/, ''); if (cond(G, h, ctx.vars)) { yield* scoped(ctx, nd.body); return; } for (const e of nd.elses || []) { const eh = ex(G, e.text, ctx.vars).replace(/^else\s*/, ''); if (!eh || (/^if\s/.test(eh) && cond(G, eh.replace(/^if\s+/, ''), ctx.vars))) { yield* scoped(ctx, e.body); return; } } return; }
    if (k === 'for') { const [name, vals] = forValues(G, head.slice(3).trim(), ctx.vars); for (const v of vals) { const sv = ctx.vars; ctx.vars = child(sv); ctx.vars[name] = v; try { yield* runStmts(ctx, nd.body); } finally { ctx.vars = sv; } if (anyHit(ctx)) return; } return; }
    if (k === 'define') return defineBlock(G, ctx.defines, head, nd);
    if (k === 'repeat') { yield* repeatStmt(ctx, head, nd); return; }
    if (k === 'at_same_time') { yield* sameTime(ctx, nd); return; }
    if (k === 'and') fail('"and { … }" must follow at_same_time { … }');
    fail(`"${k} { … }" is not a block statement`);
  }
  if (nd.kind === 'def') fail('stitch and chart are declared at the top level');
  if (nd.kind === 'piece' || nd.kind === 'assemble') fail(`${nd.kind} inside a piece (missing "end"?)`);
  // a start statement
  if (START.has(k) && !P.rows.length) {
    if (ctx.replaceStart && !ctx.replacing) { ctx.replacing = true; try { yield* stmt({ ...ctx, vars: ctx.vars }, ctx.replaceStart); } finally { ctx.replacing = false; } return; }
    return startStmt(ctx, head, t, nd.line);
  }
  if (!P.rows.length && !['note', 'let', 'define', 'yarn', 'needle', 'stripes', 'if', 'gauge'].includes(k) && !ctx.defines[k] && !/^[a-z_][a-z0-9_]*\(/i.test(k)) fail('Start the piece with cast_on, pick_up or join');
  switch (k) {
    case 'row': case 'rows': yield* rowsStmt(ctx, t, nd.line, k === 'row'); return;
    case 'bind_off': if (t.length > 1 && t[1] !== 'using') { yield* rowsStmt(ctx, ['row', ...t], nd.line, true); return; } return bindOffAll(ctx, t, nd.line);
    case 'cast_on': case 'pick_up': if (P.rows.length) fail(`${k} must be the first statement of a piece (mid-piece: "row cast_on N WHERE" or "join … + pick_up …")`); return;
    case 'join': return joinStmt(ctx, head, nd.line, false);
    case 'marker': return markerStmt(ctx, t);
    case 'sections': return sectionsStmt(ctx, head, t);
    case 'expect': return expectStmt(ctx, head, t, nd.line);
    case 'yarn': return pieceYarn(ctx, t);
    case 'stripes': if (t[1] === 'off') { P.stripes = null; return; } P.stripes = t.slice(1).map((x) => { const m = /^([a-z_#][a-z0-9_]*):(\d+)$/i.exec(x); if (!m) fail('stripes A:2 B:4 …'); return { yarn: m[1], n: +m[2] }; }); P.stripeRow = 0; return;
    case 'needle': P.needleLabel = t[1] || null; return;
    case 'fabric': { const parts = parseFabric(G, ctx, t.slice(1)); if (parts) assignFabric(P, parts, G, ctx.mirror); return; }
    case 'round': P.mode = 'round'; P.pos = 0; P.dir = 1; return;
    case 'icord': P.mode = 'icord'; P.pos = 0; P.dir = 1; return;
    case 'flat': P.mode = 'flat'; if (t[1] === 'ws') { P.pos = P.needle.length; P.dir = -1; } else { P.pos = 0; P.dir = 1; } return;
    case 'round_start': return roundStart(ctx, t);
    case 'hold': return holdStmt(ctx, t);
    case 'resume': return resumeStmt(ctx, t);
    case 'fold': yield* foldStmt(ctx, t, nd.line); return;
    case 'gather': if (!P.needle.length) fail('Nothing to gather'); P.top = [P.needle.slice()]; P.needle.forEach((s) => { s.top = 1; s.gathered = true; }); P.gather = true; P.needle = []; return;
    case 'close': if (!P.needle.length) fail('Nothing to close'); P.top = [P.needle.slice()]; P.needle.forEach((s) => { s.top = 1; }); P.closed = { line: nd.line, using: t[t.indexOf('using') + 1] }; P.needle = []; return;
    case 'stuff': case 'note': return;
    case 'let': return letStmt(G, head, ctx.vars);
    case 'repeat': fail('repeat needs a block: repeat 4 { … }');
    case 'piece': fail('piece inside a piece (missing "end"?)');
    case 'end': return;
  }
  // a defined block
  const cm = /^([a-z_][a-z0-9_]*)\s*(?:\((.*)\))?\s*$/i.exec(head);
  if (cm && ctx.defines[cm[1]]) {
    const def = ctx.defines[cm[1]];
    const args = cm[2] != null ? splitTop(cm[2], ',') : [];
    if (args.length !== def.args.length) fail(`${cm[1]} takes ${def.args.length} argument(s), got ${args.length}`);
    const sv = ctx.vars; ctx.vars = child(sv); def.args.forEach((a, i) => { ctx.vars[a] = isNum(args[i]) ? +args[i] : unq(args[i]); });
    try { yield* runStmts(ctx, def.body); } finally { ctx.vars = sv; }
    return;
  }
  fail(`Unknown piece statement "${k}"`);
}
function* scoped(ctx, body) { const sv = ctx.vars; ctx.vars = child(sv); try { yield* runStmts(ctx, body); } finally { ctx.vars = sv; } }

// ---------- repeat / at_same_time ----------
function* repeatStmt(ctx, head, nd) {
  const m = /^repeat(?:\s+(\S+))?(?:\s+until\s+(.*?))?(\s+whole)?\s*$/.exec(head);
  if (!m || (!m[1] && !m[2])) fail('repeat N { … }  or  repeat [N] until COND [whole] { … }');
  let n = Infinity;
  if (m[1] && m[1] !== 'until') n = int(m[1], 'repeat');
  const c = m[2] ? parseCond(ctx, qtoks(m[2]), 0).cond : null;
  const frame = { cond: c, whole: !!m[3], hit: false };
  if (c) { ctx.frames.push(frame); if (condHolds(ctx, c)) { ctx.frames.pop(); return; } }
  try {
    for (let i = 0; i < n; i++) {
      if (i > 2000) fail('repeat until: the condition never holds');
      const e0 = ctx.errs;
      yield* runStmts(ctx, nd.body);
      if (ctx.errs > e0) break; // the same error would come back every time
      if (frame.hit) break;
      if (anyHit(ctx)) return;
      if (c && condHolds(ctx, c)) break;
      if (c && c.kind === 'sts') { // a stitch count that stops moving toward its target never gets there
        const now = c.sec ? ctx.P.needle.filter((s) => (s.sec || '') === c.sec).length : ctx.P.needle.length;
        if (frame.last != null && Math.abs(c.n - now) >= Math.abs(c.n - frame.last)) fail(`repeat until ${c.text}: the count isn't moving toward it (${frame.last} → ${now})`);
        frame.last = now;
      }
    }
  } finally { if (c) ctx.frames.splice(ctx.frames.indexOf(frame), 1); }
}
function* sameTime(ctx, nd) {
  const tracks = [nd.body];
  // the following `and { … }` blocks are collected by the caller's node list: we find them through ctx.siblings
  for (const a of nd.ands || []) tracks.push(a.body);
  const gens = tracks.map((body) => { const tc = { ...ctx, track: true, frames: [] }; return { tc, g: runStmts(tc, body), done: false }; });
  for (let guard = 0; guard < 5000; guard++) {
    const reqs = [];
    for (const tr of gens) { if (tr.done) continue; const r = tr.g.next(); if (r.done) tr.done = true; else reqs.push(r.value); }
    if (!reqs.length) return;
    const merged = mergeReqs(reqs);
    yield* rowY(ctx, merged);
    for (const tr of gens) for (const f of tr.tc.frames) if (!f.whole && f.cond && !f.hit && condHolds(ctx, f.cond)) f.hit = true;
  }
}
function mergeReqs(reqs) {
  if (reqs.length === 1) return reqs[0];
  const out = { ...reqs[0], shaping: [], notes: [] };
  const fabs = reqs.filter((r) => r.fabric); const wr = reqs.filter((r) => r.written);
  if (fabs.length > 1) fail('at_same_time: two tracks set the fabric on the same row');
  if (wr.length > 1) fail('at_same_time: two tracks give a written row on the same row');
  out.fabric = fabs[0] ? fabs[0].fabric : null; out.written = wr[0] ? wr[0].written : null; out.writtenText = wr[0] ? wr[0].writtenText : null;
  reqs.forEach((r) => out.shaping.push(...(r.shaping || [])));
  out.desc = reqs.map((r) => r.desc).filter(Boolean).join(' + ') || null;
  return out;
}

// ---------- Rows ----------
function* rowY(ctx, req) {
  if (ctx.track) { yield req; return; }
  performRow(ctx, req);
}
function performRow(ctx, req) {
  const { P, G } = ctx;
  if (P.rows.length > 4000) fail(`${P.name} has over 4000 rows: a repeat or until never ends`);
  if (P.stripes) { const tot = P.stripes.reduce((a, s) => a + s.n, 0); let r = P.stripeRow % tot; for (const s of P.stripes) { if (r < s.n) { setYarn(ctx, s.yarn); break; } r -= s.n; } P.stripeRow++; }
  if (P.needle.length === 0 && P.top) fail('No live stitches (already bound off?)');
  workRow(P, G, { ...req, mirror: ctx.mirror });
  for (const f of ctx.frames) if (!f.whole && f.cond && !f.hit && condHolds(ctx, f.cond)) f.hit = true;
}

function parseRowsHead(ctx, t, single) {
  // rows N | rows LEN | rows until COND | rows NAME[a:b] ; then [ending …] FABRIC [schedule] [shaping]
  const spec = { count: null, len: null, cond: null, ending: null, fabric: null, written: null, sched: null, shaping: [], rowsOf: null };
  let i = 1;
  if (!single) {
    const a = t[1];
    if (a === 'until') { const r = parseCond(ctx, t, 2); spec.cond = r.cond; i = r.i; }
    else if (isLen(a)) { spec.len = lenIn(a); i = 2; }
    else if (/^-?\d+$/.test(a || '')) { spec.count = +a; if (spec.count < 0) fail('rows needs a count ≥ 0'); i = 2; }
    else {
      const m = /^([a-z_][a-z0-9_]*)(?:\[(\d+)?:(\d+)?\])?$/i.exec(a || '');
      const fab = m && ctx.G.fabrics[m[1]];
      if (!fab) fail('rows needs a count, a length or until: rows 4 st, rows 2in garter, rows until 18in, rows NAME');
      const r0 = m[2] ? +m[2] : 1, r1 = m[3] ? +m[3] : fab.nrows;
      spec.rowsOf = { fab, r0, r1 }; spec.count = r1 - r0 + 1; i = 2;
    }
  } else spec.count = 1;
  // ending may come before or after the fabric
  const rest = t.slice(i); const fabT = []; let j = 0;
  const takeEnding = () => {
    const e = { side: null, rows: null, sec: null };
    j++;
    if (rest[j] === 'ws' || rest[j] === 'rs') { e.side = rest[j].toUpperCase(); j++; }
    else if (rest[j] === 'row') { e.rows = rest[j + 1].split(',').map(Number); j += 2; if (rest[j] === 'in') { e.sec = rest[j + 1]; j += 2; } }
    else fail('ending ws | ending rs | ending row K[,K] [in SECTION]');
    spec.ending = e;
  };
  while (j < rest.length && !VERBS.has(rest[j]) && !SCHED.has(rest[j]) || rest[j] === 'ending') {
    if (rest[j] === 'ending') { takeEnding(); continue; }
    fabT.push(rest[j]); j++;
  }
  // schedule
  while (j < rest.length && SCHED.has(rest[j])) {
    const w = rest[j];
    if (w === 'ending') { takeEnding(); continue; }
    if (w === 'last') { spec.sched = { kind: 'last' }; j++; continue; }
    const n = int(rest[j + 1], w); j += 2; let from = null;
    if (rest[j] === 'from' && rest[j + 1] === 'row') { from = int(rest[j + 2], 'from row'); j += 3; }
    spec.sched = w === 'every' ? { kind: 'every', k: n, from: from ?? n } : { kind: 'spaced', n, from: from ?? 1 };
  }
  // `ending …` may also follow the shaping
  let shT = rest.slice(j);
  const ek = shT.indexOf('ending');
  if (ek >= 0) { const save = j; const tail = shT.slice(ek); rest.splice(0, rest.length, ...tail); j = 0; takeEnding(); if (j < tail.length) fail(`can't read "${tail.slice(j).join(' ')}" after ending`); shT = shT.slice(0, ek); j = save; }
  spec.shaping = parseShaping(ctx, shT);
  // fabric: a single quoted row on `row` is a one-off; on `rows` it becomes the fabric
  if (fabT.length === 1 && /^"[^"]*"$/.test(fabT[0])) {
    const text = unq(fabT[0]);
    try { const ast = parseRow(text, ctx.G.keys); if (single) spec.written = ast; } catch (e) { fail(e.message); }
    spec.writtenText = text;
    if (!single) spec.fabric = [{ fab: writtenFabric(text, ctx.G.keys), count: null }];
  } else spec.fabric = parseFabric(ctx.G, ctx, fabT);
  return spec;
}

function parseShaping(ctx, toks) {
  const items = [];
  let i = 0;
  while (i < toks.length) {
    const verb = toks[i];
    if (!VERBS.has(verb)) fail(`Unknown shaping "${toks.slice(i).join(' ')}". Shaping is inc, dec, bind_off, cast_on, hold or buttonhole`);
    let j = i + 1; while (j < toks.length && !VERBS.has(toks[j])) j++;
    // `hold SECTION cast_on N` keeps its cast_on
    if (verb === 'hold' && toks[j] === 'cast_on' && j === i + 2) { j++; while (j < toks.length && !VERBS.has(toks[j])) j++; }
    items.push(parseItem(ctx, verb, toks.slice(i + 1, j)));
    i = j;
  }
  return items;
}
function parseItem(ctx, verb, a) {
  const item = { verb, n: null, wheres: [], text: [verb, ...a].join(' ') };
  let i = 0;
  if (verb === 'dec' && a[0] === 'every') { item.verb = 'dec_every'; item.every = int(a[1], 'dec every'); if (item.every < 2) fail('dec every N (N ≥ 2)'); return item; }
  if (verb === 'hold' && a[1] === 'cast_on') {
    const m = /^(?:([a-z_][a-z0-9_]*):)?(\d+)$/i.exec(a[2] || ''); if (!m) fail('hold SECTION cast_on [NAME:]N');
    item.holdCo = { sec: a[0], name: m[1] || null, n: +m[2] }; item.as = a[4] && a[3] === 'as' ? a[4] : null; return item;
  }
  if (verb === 'cast_on') { const m = /^(?:([a-z_][a-z0-9_]*):)?(\d+)$/i.exec(a[0] || ''); if (!m) fail('cast_on [NAME:]N [WHERE]'); item.n = +m[2]; item.coName = m[1] || null; i = 1; }
  else if (isNum(a[0])) { item.n = int(a[0], verb); i = 1; }
  while (i < a.length) {
    const w = a[i];
    if (w === 'inset') { item.inset = int(a[i + 1], 'inset'); i += 2; continue; }
    if (w === 'using') { item.using = a[i + 1].split(','); if (ctx.mirror && item.using.length === 2) item.using.reverse(); i += 2; continue; }
    if (w === 'in') { const f = fabricByName(ctx.G, a[i + 1]); if (!f) fail(`in ${a[i + 1]}: unknown fabric`); item.inFab = f; i += 2; continue; }
    if (w === 'as') { item.as = a[i + 1]; i += 2; continue; }
    if (w === 'wide') { item.wide = int(a[i + 1], 'wide'); i += 2; continue; }
    if (w === 'at') { const at = []; i++; while (i < a.length && /^-?\d+$/.test(a[i])) at.push(+a[i++]); if (!at.length) fail('at I [I …]'); item.wheres.push({ sec: null, where: 'at', at }); continue; }
    if (/^-?\d+$/.test(w) && item.wheres.length === 1 && item.n == null) { item.n = +w; i++; continue; } // v1 order: inc edges 2
    let m = /^([a-z_0-9][a-z0-9_]*)\.([a-z]+)$/i.exec(w);
    if (m) {
      if (m[2] === 'at') { const at = []; i++; while (i < a.length && /^-?\d+$/.test(a[i])) at.push(+a[i++]); item.wheres.push({ sec: m[1], where: 'at', at }); continue; }
      if (!PLACE_WORDS.has(m[2]) || m[2] === 'all') fail(`unknown place "${w}"`); item.wheres.push({ sec: m[1], where: m[2] }); i++; continue;
    }
    const isSec = (verb === 'hold' || verb === 'bind_off') && ctx.P.needle.some((q) => (q.sec || '') === w);
    if (PLACE_WORDS.has(w) && !isSec) { item.wheres.push({ sec: null, where: w }); i++; continue; }
    if (/^[a-z_][a-z0-9_]*$/i.test(w) && (verb === 'hold' || verb === 'bind_off')) { item.wheres.push({ sec: w, where: 'section' }); i++; continue; }
    if (/^[a-z_0-9]+$/i.test(w) && /^\d+$/.test(w)) { item.wheres.push({ sec: w, where: 'section' }); i++; continue; }
    fail(`unknown place "${w}" in "${item.text}"`);
  }
  if (!item.wheres.length) {
    if (verb === 'inc' || verb === 'dec') fail(`${verb} needs a place: ${verb} edges, ${verb} 2 markers, ${verb} 6 evenly, ${verb} at 10, ${verb} front.end …`);
    item.wheres.push({ sec: null, where: 'start' });
  }
  if (item.n == null) item.n = item.wheres.some((w) => w.where === 'section' || w.where === 'all') ? null : 1;
  return item;
}

function* rowsStmt(ctx, t, line, single) {
  const { P, G } = ctx;
  const spec = parseRowsHead(ctx, t, single);
  if (spec.rowsOf) { assignFabric(P, [{ fab: spec.rowsOf.fab, count: null, row0: spec.rowsOf.r0 - 1 }], G, ctx.mirror); P.needle.forEach((s) => { if (s.fp && s.fp.fab === spec.rowsOf.fab) s.prow = spec.rowsOf.r0 - 1; }); spec.fabric = null; }
  if (spec.fabric && !spec.written) assignFabric(P, spec.fabric, G, ctx.mirror);
  const reqBase = { line, written: spec.written, writtenText: spec.writtenText, fabName: null };
  // how many rows
  let n = spec.count, dyn = null, untilDesc = '';
  if (spec.len != null) { const base = measure(P, null); spec.cond = { kind: 'len', target: base + spec.len, from: null, absolute: true }; untilDesc = `${t[1]}`; }
  if (spec.cond) {
    untilDesc = untilDesc || 'until ' + spec.cond.text;
    if (condHolds(ctx, spec.cond)) { if (spec.cond.kind === 'len' || spec.cond.kind === 'match') { const over = condOver(ctx, spec.cond); if (over > 0.0001) G.warn(line, `"rows ${untilDesc}" was already passed`); } n = 0; }
    else if (spec.sched && (spec.sched.kind === 'last' || spec.sched.kind === 'spaced') || (spec.ending && false)) { n = estimateRows(ctx, spec.cond); if (n == null) fail('last and spaced need a run of known length (a count, a length or match)'); }
    else dyn = spec.cond;
  }
  // ending, when the length is known
  if (n != null && spec.ending) n += endingExtra(ctx, n, spec.ending);
  const shapeOn = (k, total) => {
    const s = spec.sched; if (!spec.shaping.length) return false; if (!s) return true;
    if (s.kind === 'every') return k >= s.from && (k - s.from) % s.k === 0;
    if (s.kind === 'last') return k === total;
    if (s.kind === 'spaced') { if (s.n <= 0) return false; if (s.n === 1) return k === total; const span = total - s.from; for (let q = 0; q < s.n; q++) if (k === s.from + Math.round(q * span / (s.n - 1))) return true; return false; }
  };
  const mkReq = (k, total) => ({ ...reqBase, shaping: shapeOn(k, total) ? spec.shaping : [], untilDesc: untilDesc + (total && total > 1 ? ` (${k}/${total})` : '') });
  if (n != null) {
    for (let k = 1; k <= n; k++) { yield* rowY(ctx, mkReq(k, n)); if (anyHit(ctx)) return; if (spec.cond && spec.cond.kind === 'sts') checkSts(ctx, spec.cond, line); }
    if (spec.cond && spec.cond.kind === 'fits') P._fitsBase = measure(P, null);
    return;
  }
  // until a condition that is checked as we go
  let k = 0;
  for (;;) {
    if (++k > 5000) fail(`rows until ${dyn.text}: never reached`);
    yield* rowY(ctx, { ...reqBase, shaping: shapeOn(k, null) ? spec.shaping : [], untilDesc });
    if (anyHit(ctx)) return;
    if (dyn.kind === 'sts') checkSts(ctx, dyn, line);
    if (condHolds(ctx, dyn)) break;
  }
  if (spec.ending) for (let q = 0; q < 24 && !endingOk(ctx, spec.ending); q++) { yield* rowY(ctx, { ...reqBase, shaping: [], untilDesc: untilDesc + ' (ending)' }); if (anyHit(ctx)) return; }
  if (dyn.kind === 'fits') ctx.P._fitsBase = measure(ctx.P, null); // the next `fits` runs on from here
}
function checkSts(ctx, c, line) {
  const n = c.sec ? ctx.P.needle.filter((s) => (s.sec || '') === c.sec).length : ctx.P.needle.length;
  if (c.start != null && ((c.start < c.n && n > c.n) || (c.start > c.n && n < c.n))) fail(`until ${c.n} sts: overshot (now ${n})`);
  if (c.start == null) c.start = n;
}

// side and fabric row after k more rows
function predict(ctx, k) {
  const P = ctx.P; let side = P.mode !== 'flat' ? 'RS' : P.dir > 0 ? 'RS' : 'WS';
  if (P.mode === 'flat' && k > 0 && (k - 1) % 2 === 1) side = side === 'RS' ? 'WS' : 'RS';
  return side;
}
function endingExtra(ctx, n, e) {
  if (e.side) { if (ctx.P.mode !== 'flat') return 0; return predict(ctx, n) === e.side ? 0 : 1; }
  const s = endingStitch(ctx, e); if (!s || !s.fp) return 0;
  const per = s.fp.fab.nrows || 1;
  for (let x = 0; x < per; x++) { const last = ((s.prow || 0) + n + x - 1) % per + 1; if (e.rows.includes(last)) return x; }
  fail(`ending row ${e.rows.join(',')}: the fabric has ${per} rows`);
}
function endingStitch(ctx, e) { const N = ctx.P.needle; return e.sec ? N.find((s) => (s.sec || '') === e.sec) : N[0]; }
function endingOk(ctx, e) {
  const P = ctx.P; const last = P.rows[P.rows.length - 1];
  if (e.side) return P.mode !== 'flat' || last.dir === e.side;
  const s = endingStitch(ctx, e); if (!s || !s.fp) return true;
  const per = s.fp.fab.nrows || 1; return e.rows.includes(((s.prow || 0) - 1 + per * 100) % per + 1);
}

// ---------- Conditions ----------
function parseCond(ctx, t, i) {
  const a = t[i]; const c = {};
  const take = () => t[i++];
  if (a === 'match') {
    i++; c.kind = 'match'; if (t[i] === 'length') { c.byLen = true; i++; }
    c.target = take(); c.text = `match ${c.byLen ? 'length ' : ''}${c.target}`;
    if (t[i] === 'from') { c.from = t[i + 1]; i += 2; }
    if (/^[+-]\d+$/.test(t[i] || '')) { c.adj = +t[i]; i++; }
  } else if (a === 'worked') { i++; c.kind = 'worked'; c.text = 'worked'; if (t[i] === 'in') { c.sec = t[i + 1]; i += 2; } }
  else if (a === 'fits') { i++; c.kind = 'fits'; const es = [take()]; while (t[i] === '+' && t[i + 1]) { es.push(t[i + 1]); i += 2; } c.edges = es; c.edge = es.join(' + '); c.text = `fits ${c.edge}`; }
  else if (a === 'width') { i++; c.kind = 'width'; const w = take(); if (!isLen(w)) fail('until width LEN'); c.target = lenIn(w); c.text = `width ${w}`; }
  else if (/^\d+$/.test(a || '') && t[i + 1] === 'sts') { c.kind = 'sts'; c.n = +a; i += 2; c.text = `${a} sts`; if (t[i] === 'in') { c.sec = t[i + 1]; i += 2; } }
  else if (isLen(a)) {
    c.kind = 'len'; c.len = lenIn(a); i++; c.text = a;
    if (t[i] === 'from') { c.from = t[i + 1]; i += 2; c.text += ` from ${c.from}`; }
    if (t[i] === 'at') { c.at = t[i + 1]; i += 2; c.text += ` at ${c.at}`; }
  } else fail(`can't read the condition "${t.slice(i).join(' ')}". Use until 18in [from MARKER], until match PIECE, until 44 sts, until worked, until fits EDGE, until width 8in`);
  if (c.kind === 'len' && (t[i] === 'at')) { c.at = t[i + 1]; i += 2; }
  return { cond: c, i };
}

/** Length of the piece (in) now: the longest live column, from the origin or a marker. */
function measure(P, c) {
  const live = P.needle.length ? P.needle : [];
  if (!live.length) return 0;
  let base = 0, glob = false;
  if (c && c.from) {
    const m = /^([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)$/i.exec(c.from);
    if (m && m[1] !== P.name) { const Q = c.G.pieces[m[1]]; if (!Q) fail(`from ${c.from}: unknown piece`); const mk = Q.markers[m[2]]; if (!mk) fail(`from ${c.from}: ${m[1]} has no marker "${m[2]}"`); base = mk.gmax; glob = true; }
    else {
      const nm = m ? m[2] : c.from; const mk = P.markers[nm];
      if (mk) base = mk;
      else {
        // a marker of a piece this one was joined to or picked up from: measure in the whole garment
        const src = new Set([...(P.links || []).map((l) => l.piece), ...(P.pickups || []).flatMap((pu) => pu.expr.split(/[\s+~()]+/).map((e) => e.split('.')[0]))]);
        const Q = c.G && [...src].map((q) => c.G.pieces[q]).find((q) => q && q.markers[nm]);
        if (!Q) fail(`Unknown marker "${nm}"`);
        base = Q.markers[nm].gmax; glob = true;
      }
    }
  } else if (P.origin) base = P.origin;
  const val = (s) => {
    if (glob) return (s.glen || 0) - base;
    if (typeof base === 'object') return (s.len || 0) - (base.lenMap[s.colId] ?? base.maxLen);
    return (s.len || 0) - base;
  };
  if (c && c.at) { const s = stitchAt(P, c.at); return val(s); }
  return Math.max(...live.map(val));
}
function stitchAt(P, where) {
  if (P.points[where]) { const p = P.points[where]; let s = p; while (s.children && s.children.length) s = s.children[0]; return P.needle.includes(s) ? s : p; }
  const m = /^(?:([a-z_0-9]+)\.)?(center|start|end|left|right)$/i.exec(where);
  const sts = m && m[1] ? P.needle.filter((s) => (s.sec || '') === m[1] || (s.sec || '').startsWith(m[1] + '_')) : P.needle;
  if (!sts.length) fail(`at ${where}: no such live stitches`);
  const w = m ? m[2] : 'center';
  if (w === 'center') return sts[Math.floor(sts.length / 2)];
  if (w === 'right' || (w === 'start' && P.dir > 0) || (w === 'end' && P.dir < 0)) return sts[0];
  return sts[sts.length - 1];
}
function condTarget(ctx, c) {
  const { P, G } = ctx;
  if (c.kind === 'len') return c.absolute ? c.target : c.len;
  if (c.kind === 'fits') return (c.edges || [c.edge]).reduce((sum, e) => sum + edgeLen(edgeOf(geomShim(G), e)), 0);
  return null;
}
function condHolds(ctx, c) {
  const { P, G } = ctx; c.G = G;
  switch (c.kind) {
    case 'len': return measure(P, c.absolute ? null : c) >= condTarget(ctx, c) - 1e-6;
    case 'fits': return measure(P, null) - (P._fitsBase || 0) >= condTarget(ctx, c) - 1e-6;
    case 'width': return widthOf(P, G) >= c.target - 1e-6;
    case 'sts': { const n = c.sec ? P.needle.filter((s) => (s.sec || '') === c.sec).length : P.needle.length; return n === c.n; }
    case 'worked': { const N = P.needle; return !P.bounds.some((b) => b.kind === 'gap' && (!c.sec || ((N[b.b - 1] || {}).sec === c.sec && (N[b.b] || {}).sec === c.sec))); }
    case 'match': return matchLeft(ctx, c) <= 0;
  }
  return true;
}
function condOver(ctx, c) { if (c.kind === 'len') return measure(ctx.P, c.absolute ? null : c) - condTarget(ctx, c); if (c.kind === 'match') return -matchLeft(ctx, c); return 0; }
function matchLeft(ctx, c) {
  const { P, G } = ctx;
  const m = /^([a-z_][a-z0-9_]*)(?:\.([a-z_][a-z0-9_]*)|\[([^\]:]*):([^\]]*)\])?$/i.exec(c.target);
  if (!m) fail(`match ${c.target}: PIECE, PIECE.MARKER or PIECE[a:b]`);
  const Q = G.pieces[m[1]]; if (!Q) fail(`until match: unknown piece "${m[1]}"`);
  if (Q === P) fail('until match: a piece can\'t match itself');
  const rowOf = (nm) => { if (nm === 'start' || nm === '') return 0; if (nm === 'end') return Q.rows.length - 1; const mk = Q.markers[nm]; if (!mk) fail(`match: ${Q.name} has no marker "${nm}"`); return mk.row; };
  const own0 = c.from ? (P.markers[c.from] || fail(`Unknown marker "${c.from}"`)).row : 0;
  if (c.byLen) {
    let target;
    if (m[2]) target = Q.markers[m[2]] ? Q.markers[m[2]].maxLen : fail(`match: ${Q.name} has no marker "${m[2]}"`);
    else if (m[3] !== undefined) target = (Q.markers[m[4]]?.maxLen ?? maxLen(Q)) - (Q.markers[m[3]]?.maxLen ?? 0);
    else target = maxLen(Q);
    return target - measure(P, c.from ? { from: c.from, G } : null);
  }
  let target;
  if (m[2]) target = rowOf(m[2]); else if (m[3] !== undefined) target = rowOf(m[4] || 'end') - rowOf(m[3] || 'start'); else target = Q.rows.length - 1;
  target += c.adj || 0;
  return target - ((P.rows.length - 1) - own0);
}
const maxLen = (Q) => Math.max(0, ...Q.stitches.map((s) => s.len || 0));
function estimateRows(ctx, c) {
  const { P, G } = ctx;
  if (c.kind === 'match' && !c.byLen) return Math.max(0, matchLeft(ctx, c));
  let left;
  if (c.kind === 'match') left = matchLeft(ctx, c);
  else if (c.kind === 'len' || c.kind === 'fits') left = condTarget(ctx, c) - measure(P, c.kind === 'fits' || c.absolute ? null : c) + (c.kind === 'fits' ? ctx.P._fitsBase || 0 : 0);
  else return null;
  const fab = P.needle[0] && P.needle[0].fp ? P.needle[0].fp.fab.name : 'st';
  const rg = G.gaugeFor(fab, P.needleLabel).rg;
  return Math.max(0, Math.ceil(left * rg - 1e-6));
}
export function widthOf(P, G, sts) {
  let w = 0; for (const s of sts || P.needle) w += 1 / G.gaugeFor(s.fp ? s.fp.fab.name : 'st', P.needleLabel).sg;
  return w;
}

// ---------- Start statements ----------
function startStmt(ctx, head, t, line) {
  const { P } = ctx;
  let ws = false; let toks = t.slice();
  if (toks[toks.length - 1] === 'ws') { ws = true; toks = toks.slice(0, -1); }
  const k = toks[0];
  if (k === 'cast_on') {
    const ui = toks.indexOf('using'); const method = ui >= 0 ? toks[ui + 1] : null; if (ui >= 0) toks.splice(ui, 2);
    const runs = toks.slice(1).map((x) => { const m = /^(?:([a-z_][a-z0-9_]*):)?(\d+)$/i.exec(x); if (!m) fail('cast_on N | cast_on NAME:N NAME:N … [using METHOD] [ws]'); return { name: m[1] || null, n: +m[2] }; });
    if (!runs.length) fail('cast_on needs a stitch count');
    const total = runs.reduce((a, r) => a + r.n, 0);
    if (!(total > 0)) fail('cast_on needs a stitch count');
    const ordered = ws ? runs.slice().reverse() : runs;
    const sts = [];
    for (const r of ordered) { const part = freshSts(P, r.n, 'co', line, { sec: r.name || '' }); if (r.name) P.named[r.name] = { sts: part, kind: 'co' }; sts.push(...part); }
    if (runs.length > 1 && runs.every((r) => !r.name)) fail('several cast-on runs need names: cast_on a:10 b:10');
    startNeedle(P, sts, line, `Cast on ${total} sts${method ? ` (${method.replace(/_/g, ' ')})` : ''}`, ws);
    P.coMethod = method; P.coLine = line;
    if (method === 'provisional') addHolder(P, 'provisional', [], 0);
    return;
  }
  if (k === 'pick_up') {
    const p = pickPart(ctx, toks.join(' '), line, true);
    const sts = freshSts(P, p.n, 'pu', line, { sec: p.name || '' });
    if (p.name) P.named[p.name] = { sts, kind: 'co' };
    P.pickup = { expr: p.edge, line, n: p.n };
    P.pickups.push({ expr: p.edge, n: p.n, line, own: `${P.name}.bottom` });
    startNeedle(P, sts, line, `Pick up ${p.n} sts`, ws);
    return;
  }
  if (k === 'join') return joinStmt(ctx, toks.join(' '), line, true, ws);
}

function pickPart(ctx, text, line, start) {
  // pick_up [NAME:]N from EDGE | pick_up [NAME:]A per B from EDGE
  const m = /^pick_up\s+(?:([a-z_][a-z0-9_]*):)?(\d+)(?:\s+per\s+(\d+))?\s+from\s+(.+?)(?:\s+mult\s+(\d+))?$/i.exec(text.trim());
  if (!m) fail('pick_up N from EDGE | pick_up A per B from EDGE [mult M]');
  let edge = m[4].trim(); if (/^\(.*\)$/.test(edge) && !/\)\s*\[/.test(edge)) edge = edge.slice(1, -1);
  // an edge of this piece needs no prefix
  if (!start) edge = splitTop(edge, '+').map((e) => { const r = e.replace(/^~/, ''); return /^[a-z_][a-z0-9_]*\.(?!\d)/i.test(r) && ctx.G.pieces[r.split('.')[0]] ? e : (e.startsWith('~') ? '~' : '') + `${ctx.P.name}.${r}`; }).join(' + ');
  const out = { name: m[1] || null, n: +m[2], edge, per: m[3] ? { a: +m[2], b: +m[3] } : null, mult: m[5] ? +m[5] : null };
  if (out.per) {
    const span = edgeSpan(ctx, edge);
    out.n = Math.round(out.per.a * span / out.per.b);
    if (out.mult) out.n = Math.max(out.mult, Math.round(out.n / out.mult) * out.mult);
  }
  return out;
}
/** An edge's size in rows (vertical) or stitches (horizontal), at the source's gauge. */
function edgeSpan(ctx, expr) {
  const segs = edgeOf(geomShim(ctx.G, ctx.P), expr); let span = 0;
  for (const s of segs) { const Q = ctx.G.pieces[s.piece]; for (let i = 1; i < s.pts.length; i++) { const dx = Math.abs(s.pts[i].x - s.pts[i - 1].x), dy = Math.abs(s.pts[i].y - s.pts[i - 1].y); span += dy > dx ? dy * Q.rg : dx * Q.sg; } }
  return span;
}

/** A built-like view of the pieces with current geometry (for edges while building). */
function geomShim(G, cur) {
  for (const P of G.order) if (P.rows.length) tempGeom(P);
  return { pieces: G.pieces, order: G.order };
}
function tempGeom(P) {
  P.nrows = P.rows.length;
  const ml = maxLen(P); const g = P.sg;
  P.rg = P.nrows > 1 && ml > 0 ? (P.nrows - 1) / ml : P.rg; void g;
}

function joinStmt(ctx, head, line, start, ws) {
  const { P, G } = ctx;
  let text = head.replace(/^join\s+/, '');
  let mult = null; const mm = /\s+mult\s+(\d+)\s*$/.exec(text); if (mm) { mult = +mm[1]; text = text.slice(0, mm.index); }
  if (/\s+ws\s*$/.test(text)) { ws = true; text = text.replace(/\s+ws\s*$/, ''); }
  const parts = splitTop(text, '+');
  if (!parts.length) fail('join PART + PART …');
  const built = [];
  let unnamed = 0;
  const usedNames = new Set();
  // names are settled once every part is known: a name wanted twice becomes piece_name for each of them
  const wants = [];
  const nameFor = (want, piece) => { const key = `\u0001${wants.length}`; wants.push({ want, piece }); usedNames.add(key); return key; };
  for (const raw of parts) {
    unnamed++;
    const p = raw.trim();
    if (/^cast_on\b/.test(p)) {
      const m = /^cast_on\s+(?:([a-z_][a-z0-9_]*):)?(\d+)$/i.exec(p); if (!m) fail('join … + cast_on [NAME:]N');
      const nm = nameFor(m[1] || `p${unnamed}`, P.name);
      const sts = freshSts(P, +m[2], 'co', line, { sec: nm }); P.named[nm] = { sts, kind: 'co' };
      built.push({ sts, fresh: true, name: nm }); continue;
    }
    if (/^pick_up\b/.test(p)) {
      const pp = pickPart(ctx, p, line, start);
      built.push({ pick: pp, name: nameFor(pp.name || `p${unnamed}`, P.name) }); continue;
    }
    const lb = /^(.*)\.(below|above)$/.exec(p);
    if (lb) {
      const segs = edgeOf(geomShim(G, P), lb[1]); const Q = G.pieces[segs[0].piece];
      const n = Math.max(1, Math.round(edgeLen(segs) * Q.sg));
      const nm = nameFor(`p${unnamed}`, P.name);
      const sts = freshSts(P, n, 'pu', line, { sec: nm }); P.named[nm] = { sts, kind: 'co' };
      built.push({ sts, fresh: true, name: nm, line: lb[1] }); continue;
    }
    // live or held stitches, here or in another piece
    const m = /^(?:([a-z_][a-z0-9_]*)\.)?([a-z0-9_]+)(?:\[([^\]]*)\])?$/i.exec(p);
    if (!m) fail(`can't read join part "${p}"`);
    let Q = m[1] ? G.pieces[m[1]] : P; if (m[1] && !Q) fail(`join: unknown piece "${m[1]}"`);
    if (m[1] && Q === P && start) fail('join: a piece can\'t join itself');
    const what = m[2];
    let pool, from;
    if (what === 'live') { pool = Q.needle; from = 'live'; }
    else if (Q.holders[what]) { pool = Q.holders[what]; from = 'holder'; }
    else { pool = Q.needle.filter((s) => (s.sec || '') === what || (s.sec || '').startsWith(what + '_')); from = 'section'; if (!pool.length) fail(`join: ${Q.name} has no live section or holder "${what}"${Q.named[what] ? ' (that is an edge: pick up from it)' : ''}`); }
    let take = pool.slice();
    if (m[3] !== undefined) take = rangeOf(take, m[3]);
    if (!take.length) fail(`join: ${p} has no stitches`);
    if (take.some((s) => s.consumed)) fail(`join: some stitches of ${p} were already used`);
    // remove from the source
    if (from === 'holder') { const h = Q.holders[what]; take.forEach((s) => h.splice(h.indexOf(s), 1)); }
    else { Q.needle = Q.needle.filter((s) => !take.includes(s)); if (Q.pos > Q.needle.length) Q.pos = Q.needle.length; }
    const secName = from === 'section' || from === 'holder' ? what : null;
    if (Q === P) { built.push({ sts: take, own: true, name: secName }); continue; }
    take.forEach((s) => { s.consumed = P.name; });
    Q.consumed.push(...take);
    const fresh = take.map((s) => mkSt(P, { x: 0, row: start ? 0 : P.rows.length - 1, op: 'pu', t: s.t, parents: [], line, src: s, sec: s.sec, fp: s.fp, col: s.col, prow: s.prow, len: 0, glen: s.glen || 0, yarn: s.yarn, color: s.color }));
    // section names: SOURCE section → its name; a clash → piece_section; a section-less part → the piece's name
    const own = new Map();
    fresh.forEach((s, i) => { const sec = take[i].sec || ''; if (!own.has(sec)) own.set(sec, nameFor(from === 'holder' ? what : sec || secName || Q.name, Q.name)); s.sec = own.get(sec); });
    const jn = `__j${G.order.indexOf(P)}_${built.length}`;
    Q.named[jn] = { sts: take, kind: 'live' }; P.named[jn] = { sts: fresh, kind: 'co' };
    P.links.push({ piece: Q.name, a: `${Q.name}.${jn}`, b: `${P.name}.${jn}`, line });
    built.push({ sts: fresh, fresh: true });
  }
  // mult: adjust the `per` pick-ups
  if (mult) {
    const fixed = built.reduce((a, b) => a + (b.sts ? b.sts.length : b.pick.per ? 0 : b.pick.n), 0);
    const per = built.filter((b) => b.pick && b.pick.per);
    let tot = fixed + per.reduce((a, b) => a + b.pick.n, 0);
    const want = Math.max(mult, Math.round(tot / mult) * mult);
    for (let d = want - tot, q = 0; d !== 0 && per.length; q++) { const b = per[q % per.length]; b.pick.n += Math.sign(d); d -= Math.sign(d); }
  }
  for (const b of built) if (b.pick) {
    b.sts = freshSts(P, b.pick.n, 'pu', line, { sec: b.name }); P.named[b.name] = { sts: b.sts, kind: 'co' };
    P.pickups.push({ expr: b.pick.edge, n: b.pick.n, line, own: `${P.name}.${b.name}` });
    b.fresh = true;
  }
  const cnt = {}; wants.forEach((w) => { cnt[w.want] = (cnt[w.want] || 0) + 1; });
  const real = (key) => { const m = /^\u0001(\d+)$/.exec(key || ''); if (!m) return key; const w = wants[+m[1]]; return cnt[w.want] > 1 ? `${w.piece}_${w.want}` : w.want; };
  built.forEach((b) => { b.sts.forEach((s) => { s.sec = real(s.sec); }); });
  for (const k of Object.keys(P.named)) if (/^\u0001/.test(k)) { P.named[real(k)] = P.named[k]; delete P.named[k]; }
  P.pickups.forEach((pu) => { pu.own = pu.own.replace(/\u0001\d+/, (k) => real(k)); });
  const order = ws ? built.slice().reverse() : built;
  const needle = []; order.forEach((b) => b.sts.forEach((s) => needle.push(s)));
  const total = needle.length;
  if (start) {
    startNeedle(P, needle, line, `Join ${parts.length} parts: ${total} sts`, ws);
    return;
  }
  // mid-piece: new stitches belong to the last row; the needle is rebuilt
  const last = P.rows[P.rows.length - 1];
  const live = needle.filter((s) => !order.find((b) => b.fresh && b.sts.includes(s)));
  const ml = live.length ? Math.max(...live.map((s) => s.len || 0)) : 0;
  order.forEach((b) => { if (b.fresh) b.sts.forEach((s) => { s.row = last.index; s.len = ml; last.stitches.push(s); }); });
  order.forEach((b) => { if (b.own) b.sts.forEach((s) => { s.held = null; }); });
  P.needle = needle; P.pos = ws ? total : 0; P.dir = ws ? -1 : 1;
  P.bounds = [];
  // x for new stitches next to their neighbours
  let lastX = null;
  needle.forEach((s, i) => { if (s.row === last.index && s.parents.length === 0 && s.op !== 'co' || (s.op === 'pu' && s.row === last.index)) { s.x = lastX != null ? lastX - 1 : (needle.find((q) => !isNaN(q.x) && q.row !== last.index)?.x ?? 0) + 1; } if (s.op === 'co' && s.row === last.index && s.parents.length === 0) s.x = lastX != null ? lastX - 1 : 0; lastX = s.x; });
}

/** Stitches [a:b] of a list: numbers, start, mid, end, end-6. */
function rangeOf(list, r) {
  const n = list.length;
  const pos = (p, def) => {
    p = (p || '').trim(); if (!p) return def;
    let m = /^(start|mid|end)?([+-]?\d+)?$/.exec(p);
    if (m && (m[1] || m[2])) { const base = m[1] === 'end' ? n : m[1] === 'mid' ? Math.floor(n / 2) : m[1] === 'start' ? 0 : null; const off = m[2] ? +m[2] : 0; if (base === null) return off < 0 ? n + off : off; return base + off; }
    fail(`bad stitch position "${p}"`);
  };
  const [a, b] = r.split(':');
  if (b === undefined) { const k = pos(a, 0); return list.slice(k, k + 1); }
  return list.slice(pos(a, 0), pos(b, n));
}

// ---------- Other piece statements ----------
function bindOffAll(ctx, t, line) {
  const { P } = ctx;
  if (!P.needle.length) fail('Nothing to bind off');
  if (t[1] === 'using' && /^"/.test(t[2] || '')) { try { parseRow(unq(t[2]), ctx.G.keys); } catch (e) { fail(e.message); } }
  const N = P.needle; const sp = new Set(P.bounds.filter((b) => b.kind === 'split').map((b) => b.b));
  const segs = []; let cur = null;
  N.forEach((s, i) => { if (!cur || sp.has(i) || (P.mode === 'flat' && Math.abs(s.x - N[i - 1].x) > 1.6)) { cur = []; segs.push(cur); } cur.push(s); });
  segs.sort((a, b) => Math.min(...a.map((s) => s.x)) - Math.min(...b.map((s) => s.x)));
  segs.forEach((sg, i) => sg.forEach((s) => { s.top = i + 1; }));
  P.top = (P.top || []).concat(segs); P.bindOffLine = line; P.needle = []; P.bounds = [];
}
function markerStmt(ctx, t) {
  const { P } = ctx;
  const name = t[1]; if (!name) fail('marker needs a name');
  if (t.length > 2) {
    const where = t.slice(2).join(' ');
    const s = pointOf(ctx, where);
    s.pm = [...new Set([...(s.pm || []), name])]; P.points[name] = s;
    return;
  }
  const lenMap = {}; let mx = 0, gmx = 0;
  for (const s of P.needle) { lenMap[s.colId] = s.len || 0; mx = Math.max(mx, s.len || 0); gmx = Math.max(gmx, s.glen || 0); }
  P.markers[name] = { row: P.rows.length - 1, lenMap, maxLen: mx, gmax: gmx };
  if (ctx.until && name === ctx.until) throw new StopCopy();
}
function pointOf(ctx, where) {
  const { P } = ctx; const N = P.needle;
  if (!N.length) fail('marker NAME WHERE needs live stitches');
  const lastRow = P.rows[P.rows.length - 1]; const lastFwd = lastRow.dir !== 'WS';
  let m = /^(?:([a-z_0-9]+)\.)?(start|end|left|right|center|mid)$/i.exec(where);
  if (m) {
    const sts = m[1] ? N.filter((s) => (s.sec || '') === m[1] || (s.sec || '').startsWith(m[1] + '_')) : N;
    if (!sts.length) fail(`no live section "${m[1]}"`);
    let w = m[2]; if (ctx.mirror && w === 'left') w = 'right'; else if (ctx.mirror && w === 'right') w = 'left';
    if (w === 'center' || w === 'mid') return sts[Math.floor(sts.length / 2)];
    if (w === 'right' || (w === 'start' && lastFwd) || (w === 'end' && !lastFwd)) return sts[0];
    return sts[sts.length - 1];
  }
  if ((m = /^at\s+(-?\d+)$/.exec(where))) { const k = +m[1]; return N[k < 0 ? N.length + k : k] || fail(`at ${k}: only ${N.length} sts`); }
  if (P.points[where]) return stitchAt(P, where);
  fail(`marker NAME WHERE: WHERE is start, end, left, right, center, SECTION.center … or at N`);
}
function sectionsStmt(ctx, head, t) {
  const { P } = ctx;
  if (t[1] === 'off') { P.needle.forEach((s) => { s.sec = ''; }); return; }
  const mg = /^sections\s+([a-z_][a-z0-9_]*)\s*=\s*(.+)$/i.exec(head);
  if (mg) { const parts = mg[2].split('+').map((s) => s.trim()); P.needle.forEach((s) => { if (parts.includes(s.sec || '')) s.sec = mg[1]; }); return; }
  if (t.length === 2 && /^\d+$/.test(t[1])) {
    const k = +t[1]; const n = P.needle.length; if (n % k) fail(`${n} sts don't divide into ${k} equal sections`);
    return setSections(P, Array.from({ length: k }, (_, i) => ({ name: `s${i + 1}`, n: n / k })), ctx.mirror);
  }
  const specs = t.slice(1).map((x) => { const m = /^([a-z_][a-z0-9_]*)(?::(\d+))?$/i.exec(x); if (!m) fail('sections NAME:N NAME:N …'); return { name: m[1], n: m[2] != null ? +m[2] : null }; });
  // names in use by holders are taken
  for (const s of specs) if (ctx.P.holders[s.name] && ctx.P.holders[s.name].length) fail(`"${s.name}" is a holder; pick another section name`);
  setSections(P, specs, ctx.mirror);
}
function expectStmt(ctx, head, t, line) {
  const { P, G } = ctx;
  let printed = null; const pi = t.indexOf('printed');
  let toks = t;
  if (pi >= 0) { printed = unq(t.slice(pi + 1).join(' ')) || 'printed'; toks = t.slice(0, pi); }
  const k1 = toks[1];
  if (k1 === 'width' || k1 === 'length') return sizeExpect(ctx, toks, line);
  const push = (ok, text) => {
    if (printed) { G.doc.checks.push({ kind: 'count', piece: P.name, line, ok: true, text: `${P.name}: ${text}${ok ? ' (the printed count is right after all)' : ` — erratum: the pattern prints "${printed}"`}` }); if (!ok) G.warn(line, `Erratum: ${text}`); return; }
    G.doc.checks.push({ kind: 'count', piece: P.name, line, ok, text: `${P.name}: ${text}` });
    if (!ok) G.err(line, `Stitch count check failed: ${text} (row ${P.rows.length - 1})`);
  };
  const vals = toks.slice(1).filter((x) => x !== '+');
  if (!vals.length) fail('expect N [N …] | expect NAME=N … | expect width|length LEN');
  if (vals.every((v) => /=/.test(v))) {
    const got = []; let ok = true;
    for (const v of vals) {
      const [nm, nv] = v.split('='); const want = int(nv, 'expect');
      let n = P.needle.filter((s) => (s.sec || '') === nm).length;
      if (!n && P.holders[nm]) n = P.holders[nm].length;
      if (!n && P.named[nm]) n = P.named[nm].sts.length;
      if (n !== want) ok = false; got.push(`${nm}=${n}`);
    }
    push(ok, `${vals.join(' ')}${ok ? '' : ` (have ${got.join(' ')})`}`);
    return;
  }
  const want = vals.map((v) => int(v, 'expect'));
  const sc = sectionCounts(P);
  const isDefault = sc.every((s) => /^\d+(_\d+)*$/.test(s.name) || s.name === '');
  const list = (isDefault ? sc.slice().reverse() : sc).map((s) => s.n);
  const ok = want.length === 1 ? want[0] === P.needle.length : want.length === list.length && want.every((w, i) => w === list[i]);
  push(ok, `${want.join(' + ')} sts${ok ? '' : ` (have ${want.length === 1 ? P.needle.length : list.join(' + ')})`}`);
  P.expects.push({ line, want, ok });
}
function sizeExpect(ctx, toks, line) {
  const { P, G } = ctx;
  const what = toks[1]; const v = toks[2]; if (!isLen(v)) fail(`expect ${what} LEN`);
  const want = lenIn(v); let i = 3; let flat = false, within = null, at = null, of = null;
  while (i < toks.length) {
    if (toks[i] === 'flat') { flat = true; i++; }
    else if (toks[i] === 'within') { const w = toks[i + 1]; within = /%$/.test(w) ? { pct: parseFloat(w) / 100 } : { len: lenIn(w) }; i += 2; }
    else if (toks[i] === 'at') { at = toks[i + 1]; i += 2; }
    else if (toks[i] === 'of') { of = toks[i + 1]; i += 2; }
    else fail(`expect ${what}: unexpected "${toks[i]}"`);
  }
  let got;
  if (what === 'width') { got = widthOf(P, G); if (flat || (P.mode === 'flat' && false)) got /= 2; }
  else if (of) got = edgeLen(edgeOf(geomShim(G, P), of.includes('.') ? of : `${P.name}.${of}`));
  else got = measure(P, at ? { at, G } : null);
  sizeCheck(G, { piece: P.name, line, what, want, got, within, approx: P.approx || G.approx, label: `${P.name}: ${what}${at ? ' at ' + at : ''}${of ? ' of ' + of : ''}` });
}
export function sizeCheck(G, c) {
  const diff = Math.abs(c.got - c.want) / Math.max(c.want, 1e-6);
  let level = diff < 0.05 ? 'ok' : diff < 0.15 ? 'ease' : 'bad';
  if (c.within) level = (c.within.pct != null ? diff <= c.within.pct : Math.abs(c.got - c.want) <= c.within.len) ? 'ok' : 'bad';
  const text = `${c.label} ${c.got.toFixed(2)}in, expected ${c.want.toFixed(2)}in${level === 'ok' ? '' : ` (${Math.round(diff * 100)}% off)`}`;
  const ok = level !== 'bad' || c.approx;
  G.doc.checks.push({ kind: 'count', piece: c.piece, line: c.line, ok, level, text: c.approx && level !== 'ok' ? text + ' (approximate gauge: reported only)' : text });
  if (c.approx) return;
  if (level === 'ease') G.warn(c.line, text); else if (level === 'bad') { if (c.within) G.err(c.line, text); else G.err(c.line, text); }
}
function setYarn(ctx, y) {
  const { P, G } = ctx;
  if (isHex(y)) { P.color = y; P.yarn = null; return; }
  if (!G.yarns[y]) fail(`Unknown yarn "${y}" (declare it: yarn ${y} #rrggbb)`);
  P.yarn = y; P.color = G.yarns[y].color;
}
function pieceYarn(ctx, t) {
  if (!t[1]) fail('yarn NAME or yarn #rrggbb');
  if (!isHex(t[1]) && !/^[a-z_][a-z0-9_]*$/i.test(t[1])) fail('yarn needs a hex color like #b89b72');
  ctx.P.stripes = null; setYarn(ctx, t[1]);
}
function roundStart(ctx, t) {
  const { P } = ctx; const N = P.needle; const n = N.length;
  if (!n) fail('round_start needs live stitches');
  let k;
  if (t[1] === 'at') k = int(t[2], 'round_start at');
  else {
    const w = t[1];
    if (P.points[w]) k = N.indexOf(stitchAt(P, w));
    else if (/^[a-z_0-9]+\.(center|start|end|left|right)$/i.test(w)) k = N.indexOf(stitchAt(P, w));
    else { k = N.findIndex((s, i) => (s.sec || '') === w && (i === 0 || (N[i - 1].sec || '') !== w)); if (k < 0) fail(`round_start: no place "${w}"`); }
  }
  k = ((k % n) + n) % n;
  P.needle = N.slice(k).concat(N.slice(0, k));
  P.bounds = P.bounds.map((b) => ({ ...b, b: ((b.b - k) % n + n) % n }));
  P.pos = 0; P.dir = 1;
}
function holdStmt(ctx, t) {
  const { P } = ctx;
  const ai = t.indexOf('as'); const as = ai >= 0 ? t[ai + 1] : null;
  const a = (ai >= 0 ? t.slice(1, ai) : t.slice(1));
  const N = P.needle;
  if (a[0] === 'all') { const name = as || 'all'; holdNow(P, N.map((_, i) => i), name); return; }
  if (a.length === 1 && !PLACE_WORDS.has(a[0]) && !/\./.test(a[0])) {
    const idx = []; N.forEach((s, i) => { if ((s.sec || '') === a[0] || (s.sec || '').startsWith(a[0] + '_')) idx.push(i); });
    if (!idx.length) fail(`hold: no live section "${a[0]}"`);
    holdNow(P, idx, as || a[0]); return;
  }
  // hold N WHERE: as a row that only holds (no stitches worked)
  const item = parseItem(ctx, 'hold', a.concat(as ? ['as', as] : []));
  const n = item.n ?? 1;
  const idx = [];
  for (const wh of item.wheres) {
    const sts = wh.sec ? N.filter((s) => (s.sec || '') === wh.sec) : N;
    const L = sts.length;
    let pick;
    const fwd = P.dir > 0;
    let w = wh.where; if (ctx.mirror && w === 'left') w = 'right'; else if (ctx.mirror && w === 'right') w = 'left';
    if (w === 'right' || (w === 'start' && fwd) || (w === 'end' && !fwd)) pick = sts.slice(0, n);
    else if (w === 'left' || (w === 'end' && fwd) || (w === 'start' && !fwd)) pick = sts.slice(L - n);
    else if (w === 'edges') pick = sts.slice(0, n).concat(sts.slice(L - n));
    else if (w === 'center') { const rest = L - n; const b = Math.floor(rest / 2); const s0 = fwd ? b : rest - b; pick = sts.slice(s0, s0 + n); }
    else if (w === 'at') pick = wh.at.flatMap((I) => (I >= 0 ? sts.slice(I, I + n) : sts.slice(L + I - n + 1, L + I + 1)));
    else fail(`hold ${w}: use a row ("row hold …") for this place`);
    pick.forEach((s) => idx.push(N.indexOf(s)));
  }
  holdNow(P, [...new Set(idx)].sort((x, y) => x - y), as || (item.wheres[0].sec || 'held'));
}
function resumeStmt(ctx, t) {
  const { P } = ctx;
  if (P.needle.length) fail('resume: there are live stitches; hold them first');
  const name = t[1]; const h = P.holders[name];
  if (!h) fail(`resume: no holder "${name}"`);
  if (!h.length) fail(`resume: holder "${name}" is empty`);
  P.needle = h.splice(0, h.length); P.needle.forEach((s) => { s.held = null; });
  P.mode = h.whole ? 'round' : 'flat';
  const ws = t[2] === 'ws';
  P.pos = ws ? P.needle.length : 0; P.dir = ws ? -1 : 1; P.bounds = []; P.top = P.top || null;
}
function* foldStmt(ctx, t, line) {
  const { P } = ctx;
  const mk = t[1] === 'at' ? t[2] : null;
  const co = P.rows[0].stitches.length;
  if (P.needle.length !== co) fail(`fold: ${P.needle.length} live sts but ${co} were cast on`);
  let base;
  if (mk) { const m = P.markers[mk]; if (!m) fail(`Unknown marker "${mk}"`); base = m; }
  else { const half = measure(P, null) / 2; base = { lenMap: {}, maxLen: half, row: Math.round((P.rows.length - 1) / 2) }; P.markers.fold = P.markers.fold || { ...base, gmax: 0 }; }
  yield* rowY(ctx, { line, shaping: [], untilDesc: 'fold: knit together with the cast-on edge' });
  P.origin = { lenMap: {}, maxLen: base.maxLen };
  P.folded = { row: base.row, line, joinRow: P.rows.length - 1 };
}

// ---------- cut ----------
function cutStmt(G, t, line) {
  // cut PIECE at ROW [to ROW] as A B
  const m = /^cut\s+(\S+)\s+at\s+(\S+)(?:\s+to\s+(\S+))?\s+as\s+(\S+)\s+(\S+)$/.exec(t.join(' '));
  if (!m) fail('cut PIECE at ROW [to ROW] as A B');
  const P = G.pieces[m[1]]; if (!P) fail(`cut: unknown piece "${m[1]}"`);
  const rowRef = (r) => { if (/^\d+$/.test(r)) return +r; if (P.markers[r]) return P.markers[r].row; fail(`cut: ${P.name} has no marker "${r}"`); };
  const r1 = rowRef(m[2]), r2 = m[3] ? rowRef(m[3]) : r1;
  if (r1 < 0 || r2 >= P.rows.length - 1 || r2 < r1) fail(`cut: rows ${r1}..${r2} are outside ${P.name}`);
  const mk = (name) => { if (G.pieces[name] && name !== P.name) fail(`cut: "${name}" is taken`); const Q = newPiece(G, name, line, { round: P.round }); Q.mode = P.mode; Q.sg = P.sg; Q.rg = P.rg; Q.approx = P.approx; Q.color = P.color; return Q; };
  const A = mk(m[4]), B = mk(m[5]);
  A.rows = P.rows.slice(0, r1 + 1);
  B.rows = P.rows.slice(r2 + 1); B.rows.forEach((r, i) => { r.index = i; r.stitches.forEach((s) => { s.row = i; s.piece = B.name; }); });
  B.rows[0].dir = 'CO'; B.rows[0].stitches.forEach((s) => { s.parents = []; });
  A.rows[r1].stitches.forEach((s) => { s.children = []; });
  A.rows.forEach((r) => r.stitches.forEach((s) => { s.piece = A.name; }));
  const inA = new Set(); A.rows.forEach((r) => r.stitches.forEach((s) => inA.add(s)));
  A.stitches = P.stitches.filter((s) => inA.has(s)); B.stitches = P.stitches.filter((s) => !inA.has(s) && s.row >= 0 && B.rows[s.row] && B.rows[s.row].stitches.includes(s));
  A.needle = A.rows[r1].stitches.filter((s) => s.op !== 'bo'); B.needle = P.needle; B.top = P.top; B.gather = P.gather; B.closed = P.closed;
  for (const [k, v] of Object.entries(P.markers)) { if (v.row <= r1) A.markers[k] = v; else if (v.row > r2) B.markers[k] = { ...v, row: v.row - r2 - 1 }; }
  for (const [k, v] of Object.entries(P.holders)) (v.all && v.all[0] && inA.has(v.all[0]) ? A : B).holders[k] = v;
  for (const [k, v] of Object.entries(P.named)) (v.sts[0] && inA.has(v.sts[0]) ? A : B).named[k] = v;
  for (const [k, v] of Object.entries(P.points)) (inA.has(v) ? A : B).points[k] = v;
  B.markers.start = { row: 0, lenMap: {}, maxLen: 0, gmax: 0 };
  B.splitRow = P.splitRow != null && P.splitRow > r2 ? P.splitRow - r2 - 1 : null; B.splitSts = P.splitSts;
  const base = Math.min(...B.rows[0].stitches.map((s) => s.len || 0));
  B.stitches.forEach((s) => { s.len = (s.len || 0) - base; });
  const at = G.order.indexOf(P);
  G.order.splice(at, 1, A, B); delete G.pieces[P.name]; G.pieces[A.name] = A; G.pieces[B.name] = B;
  B.stitches.forEach((s, i) => { s.id = i; }); A.stitches.forEach((s, i) => { s.id = i; });
}

// ---------- Finishing a piece ----------
export function finalizePiece(P) {
  if (!P.rows.length) { P.nrows = 0; P.total = 0; P.minx = 0; P.maxx = 0; P.widthIn = 0; P.heightIn = 0; return; }
  let minx = Infinity, maxx = -Infinity;
  P.rows.forEach((r) => r.stitches.forEach((s) => { if (isNaN(s.x)) s.x = 0; minx = Math.min(minx, s.x); maxx = Math.max(maxx, s.x); }));
  P.minx = minx; P.maxx = maxx; P.nrows = P.rows.length;
  let ord = 0;
  P.rows.forEach((r) => {
    const seq = r.stitches.slice().sort((a, b) => a.x - b.x);
    if (r.dir === 'RS' || r.dir === 'CO') seq.reverse();
    r.order = seq; r.firstOrd = ord;
    seq.forEach((s, i) => { s.ord = ord++; s.inRow = i; });
  });
  P.total = ord;
  const ml = maxLen(P);
  P.heightIn = P.nrows > 1 && ml > 0 ? ml * P.nrows / (P.nrows - 1) : P.nrows / P.rg;
  P.rg = P.nrows / P.heightIn;
  P.widthIn = (maxx - minx + 1) / P.sg;
  if (!P.top) topFromBindOffs(P);
  if (!P.top && P.needle.length === 0 && P.consumed.length) P.top = [P.consumed.slice()];
  P.live = P.needle;
  P.split = P.splitRow != null ? { row: P.splitRow } : (P.bounds.some((b) => b.kind === 'split') ? { row: P.nrows - 1 } : null);
}

/** A piece that ends in stepped bind-offs (shoulders) and held stitches: its top is the bound-off stitches of the
 * last run of bind-off rows (a row without one in between is allowed), in parts from left to right. */
function topFromBindOffs(P) {
  const isBo = (s) => s.op === 'bo' && !(s.children && s.children.length);
  let r = P.rows.length - 1, gap = 0; const band = [];
  for (; r > 0; r--) {
    const bo = P.rows[r].stitches.filter(isBo);
    if (bo.length) { band.push(...bo); gap = 0; } else if (band.length && ++gap > 1) break;
  }
  if (!band.length) return;
  const xs = band.slice().sort((a, b) => a.x - b.x);
  const segs = []; let cur = null;
  xs.forEach((s) => { if (cur && s.x - cur[cur.length - 1].x <= 1.6) cur.push(s); else { cur = [s]; segs.push(cur); } });
  segs.forEach((sg, i) => sg.forEach((s) => { s.top = i + 1; }));
  P.top = segs;
}

export { geomShim, measure };
