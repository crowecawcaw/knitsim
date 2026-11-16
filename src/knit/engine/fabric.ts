// @ts-nocheck -- engine internals are loosely typed; the public shapes are in ../types.ts
// Fabrics: built-in looks, `stitch` and `chart` definitions, and quoted written rows used as a fabric.
import { parseRow, flipRow, wordInfo, KnitError, seqCounts } from './rows';

/** A fabric row with no *…* and no fill repeats across as a whole ("p3 k2" = *p3, k2*). */
const repeating = (ast) => (seqCounts(ast) && !ast.some((n) => n.t === 'stop' || n.t === 'turn' || n.t === 'slide') ? [{ t: 'rep', body: ast, stops: false }] : ast);

const mod = (a, n) => ((a % n) + n) % n;

// RS look of a built-in fabric for stitch column c (from the right edge) on pattern row r (0-based).
const BUILTIN = {
  st: () => 'k', rev_st: () => 'p', edge: () => 'k',
  garter: (c, r, o) => (o.round ? (r % 2 ? 'p' : 'k') : (o.side === 'RS' ? 'k' : 'p')),
  seed: (c, r) => (mod(c + r, 2) ? 'p' : 'k'),
  moss: (c, r) => (mod(c + (r >> 1), 2) ? 'p' : 'k'),
};
export function builtinFabric(name) {
  if (BUILTIN[name]) return { name, kind: 'builtin', fn: BUILTIN[name], nrows: name === 'moss' ? 4 : name === 'seed' || name === 'garter' ? 2 : 1 };
  const m = /^rib(\d+)x(\d+)$/.exec(name);
  if (m) { const a = +m[1], b = +m[2]; return { name, kind: 'builtin', nrows: 1, fn: (c) => (mod(c, a + b) < a ? 'k' : 'p') }; }
  return null;
}

/** A quoted row used as a fabric: one row, repeated. */
export function writtenFabric(text, keys) {
  const ast = repeating(parseRow(text, keys));
  return { name: text, kind: 'written', rows: [{ ast, side: null }], nrows: 1, quoted: true };
}

/** `stitch NAME [round]` body → fabric. */
export function stitchDef(name, round, lines, keys, err) {
  const rows = []; let odd = null, even = null; let labelled = null;
  for (const { line, text } of lines) {
    const m = /^((?:\d+(?:-\d+)?)(?:\s*,\s*\d+(?:-\d+)?)*|odd|even)\s*:\s*(.*)$/.exec(text);
    if (labelled === null) labelled = !!m;
    else if (labelled !== !!m) { err(line, `stitch ${name}: label every line or none`); }
    let ast;
    const body = m ? m[2] : text;
    try { ast = repeating(parseRow(body, keys)); } catch (e) { err(line, `stitch ${name}: ${e.message}`); ast = parseRow('pat', keys); }
    const row = { ast, line };
    if (!m) { rows.push(row); continue; }
    if (m[1] === 'odd') { odd = row; continue; }
    if (m[1] === 'even') { even = row; continue; }
    for (const part of m[1].split(',')) {
      const [a, b] = part.trim().split('-').map(Number);
      for (let r = a; r <= (b || a); r++) { if (rows[r - 1]) err(line, `stitch ${name}: row ${r} is given twice`); rows[r - 1] = row; }
    }
  }
  let n = rows.length;
  if (odd || even) n = Math.max(n, 2);
  for (let r = 0; r < n; r++) if (!rows[r]) { rows[r] = (r % 2 === 0 ? odd : even) || null; if (!rows[r]) err(lines[0]?.line || 0, `stitch ${name}: row ${r + 1} is missing`); }
  return { name, kind: 'written', round, rows: rows.map((r) => r && { ast: r.ast, line: r.line }), nrows: n };
}

/** `chart NAME [odd] [mosaic] [round]` body → fabric. The last line is row 1. */
export function chartDef(name, opts, lines, keys, yarns, err) {
  const ckeys = {}; const grid = [];
  for (const { line, text } of lines) {
    const km = /^key\s+(\S+)\s*=\s*(.*)$/.exec(text);
    if (km) {
      const sym = km[1]; let body = km[2].trim(); let yarn = null;
      const toks = body.split(/\s+/);
      if (yarns[toks[0]]) { yarn = toks[0]; body = toks.slice(1).join(' '); }
      let info = body ? (keys[body] || wordInfo(body, keys)) : { word: 'k1', in: 1, out: 1, w: 'k' };
      if (!info) { try { const ast = parseRow(body, keys); info = { word: body, macro: ast }; } catch (e) { err(line, `chart ${name}: ${e.message}`); info = { word: 'k1', in: 1, out: 1, w: 'k' }; } }
      ckeys[sym] = { ...info, yarn };
      continue;
    }
    grid.push({ line, text });
  }
  const parsed = grid.map(({ line, text }) => ({ line, cells: chartCells(text, name, line, ckeys, yarns, err) }));
  parsed.reverse(); // row 1 first
  // Counts: a decrease drawn in one cell either fills as many cells as it uses (`/` then the cell it eats is an x in
  // the row above), or swallows the cell beside it. Pick, row by row, the reading whose counts follow on.
  const cinfo = (c) => { if (c === '~' || c === 'x') return null; if (c === '<<' || c === '>>') return { in: 2, out: 2 }; const k = ckeys[c] || (CELL[c] && wordInfo(CELL[c])); return k && k.in != null ? { in: k.in, out: k.out } : { in: 1, out: 1 }; };
  const counts = parsed.map((r) => { let cells = 0, ins = 0, outs = 0, extra = 0; for (const c of r.cells.cells) { const i = cinfo(c); if (!i) continue; cells++; ins += i.in; outs += i.out; if (i.in > 1 && c !== '<<' && c !== '>>') extra += i.in - 1; } return { cells, ins, outs, extra }; });
  parsed.forEach((r, i) => {
    if (i === 0) return; const prev = counts[i - 1]; const c = counts[i];
    const prevOut = prev.absorbOuts ?? prev.outs;
    if (c.ins !== prevOut && c.extra && c.cells === prevOut) { r.absorb = true; c.absorbOuts = c.outs - c.extra; }
  });
  return { name, kind: 'chart', odd: !!opts.odd, mosaic: !!opts.mosaic, round: !!opts.round, grid: parsed, ckeys, nrows: parsed.length * (opts.odd || opts.mosaic ? 2 : 1) };
}

function chartCells(text, name, line, ckeys, yarns, err) {
  const cells = []; let rep = null; let i = 0;
  const s = text.replace(/\s+/g, '');
  while (i < s.length) {
    const c = s[i];
    if (c === '|') { if (rep === null) rep = { a: cells.length }; else rep.b = cells.length; i++; continue; }
    if (/\d/.test(c)) {
      const m = /^\d+/.exec(s.slice(i)); i += m[0].length;
      const prev = cells[cells.length - 1]; if (!prev) { err(line, `chart ${name}: a number must follow a symbol`); continue; }
      for (let k = 1; k < +m[0]; k++) cells.push(prev);
      continue;
    }
    if ((c === '<' || c === '>') && s[i + 1] === c) { cells.push(c + c); cells.push('~'); i += 2; continue; }
    cells.push(c); i++;
  }
  return { cells, rep: rep && rep.b !== undefined ? rep : null };
}

/** A decrease drawn in one cell takes the k cells worked just before it (to its right); at the start of a row, the
 * cells after it. Returns the index to continue from. */
function swallow(out, rev, i, k) {
  while (k > 0 && out.length && out[out.length - 1].t === 'w' && out[out.length - 1].info.in === 1 && out[out.length - 1].info.out === 1) { out.pop(); k--; }
  let j = i; while (k > 0 && j + 1 < rev.length) { j++; if (rev[j] !== 'x' && rev[j] !== '~') k--; }
  return j;
}

const CELL = { '.': 'k1', '-': 'p1', o: 'yo', '/': 'k2tog', '\\': 'ssk', '^': 'cdd', '<<': 'lt', '>>': 'rt' };

/** One chart row (RS picture, row 1 = first) → written-row AST in RS work order (right to left). */
function chartRowAst(chart, r, keys, yarns, workYarn) {
  const { cells, rep } = chart.grid[r].cells; const absorb = chart.grid[r].absorb;
  const toWords = (arr) => {
    const out = [];
    // read right → left
    const rev = arr.slice().reverse();
    for (let i = 0; i < rev.length; i++) {
      const c = rev[i];
      if (c === '~' || c === 'x') continue;
      if (c === '<<' || c === '>>') { out.push({ t: 'w', info: wordInfo(CELL[c]) }); continue; }
      if (chart.mosaic) {
        const yarn = c;
        if (yarn === workYarn) out.push({ t: 'w', info: { ...wordInfo('k1'), yarnCell: yarn } });
        else out.push({ t: 'w', info: { ...wordInfo('sl1'), word: 'sl1 wyib' } });
        continue;
      }
      if (chart.ckeys[c]) {
        const k = chart.ckeys[c];
        if (k.macro) { out.push(...JSON.parse(JSON.stringify(k.macro))); continue; }
        const width = Math.max(1, k.in || 1);
        // a stitch several cells wide fills that many cells
        let run = 1; while (run < width && rev[i + run] === c) run++;
        i += run - 1;
        if (absorb && run === 1 && width > 1) i = swallow(out, rev, i, width - 1); // this decrease swallows the cells beside it
        out.push({ t: 'w', info: { ...k, yarnCell: k.yarn } });
        continue;
      }
      if (CELL[c]) { const info = wordInfo(CELL[c]); if (absorb && info.in > 1) i = swallow(out, rev, i, info.in - 1); out.push({ t: 'w', info }); continue; }
      if (yarns[c]) { out.push({ t: 'w', info: { ...wordInfo('k1'), yarnCell: c } }); continue; }
      throw new KnitError(`chart ${chart.name}: unknown symbol "${c}" (add a key)`);
    }
    return out;
  };
  if (!rep) return [{ t: 'rep', body: toWords(cells), stops: false }];
  // cells right of the repeat are worked first
  const right = toWords(cells.slice(rep.b)), mid = toWords(cells.slice(rep.a, rep.b)), left = toWords(cells.slice(0, rep.a));
  return [...right, { t: 'rep', body: mid, stops: false }, ...left];
}

/**
 * The written row to work for pattern row r (0-based) of a written/chart fabric, as worked on `side`, in a piece that is
 * `round` or flat. Returns an AST, or null for "work as the stitches present themselves".
 */
export function fabricRowAst(fab, r, side, round, keys, yarns, workYarn) {
  const rr = mod(r, fab.nrows);
  if (fab.kind === 'chart') {
    let ast;
    if (fab.odd || fab.mosaic) {
      const line = rr >> 1;
      if (fab.odd && rr % 2) return [{ t: 'asis' }];
      ast = chartRowAst(fab, line, keys, yarns, workYarn);
      if (fab.mosaic && rr % 2) ast = ast.map((n) => n); // the WS pass repeats the RS pass
    } else ast = chartRowAst(fab, rr, keys, yarns, workYarn);
    // a chart is a picture of the RS: on a WS row it is worked from the other side
    return side === 'WS' ? flipRow(ast, keys) : ast;
  }
  const row = fab.rows[rr];
  if (!row) return [{ t: 'asis' }];
  // as written: round patterns are all RS; flat patterns alternate RS (row 1) and WS
  const written = fab.round || fab.quoted ? 'RS' : (rr % 2 === 0 ? 'RS' : 'WS');
  if (fab.quoted) return row.ast; // a quoted row is worked as written on whichever side
  return written === side ? row.ast : flipRow(row.ast, keys);
}

export { mod };
