// Turns a built pattern back into written instructions, the way a printed pattern reads:
// materials, then each piece row by row (runs of identical rows merged, repeat blocks folded),
// then finishing. It works from the engine's rows (so per-size numbers are already resolved)
// plus the source lines for statements that don't make rows (markers, bind-off, notes, seams).

import type { KnitDoc, Param, Piece, Row } from './types';

export interface ProseStep {
  kind: 'step' | 'note' | 'repeat';
  /** "Row 5 (WS)", "Rnds 1–12", "Cast on" … */
  label?: string;
  text: string;
  /** stitch count after the step */
  count?: string;
  /** the pattern author's own comment */
  note?: string;
  line: number;
  /** row index in the piece to show in the simulation */
  row?: number;
  /** for a repeat: the steps to repeat */
  steps?: ProseStep[];
}

export interface ProseSection {
  piece: string;
  title: string;
  round: boolean;
  /** "Work as for the right sleeve" */
  like?: string;
  steps: ProseStep[];
  size: string;
}

export interface Prose {
  title: string;
  source: string;
  intro: string[];
  materials: { label: string; value: string; color?: string }[];
  sections: ProseSection[];
  finishing: ProseStep[];
  abbreviations: [string, string][];
}

// ---------------------------------------------------------------- words

const FABRICS: Record<string, string> = {
  st: 'stockinette stitch',
  rev_st: 'reverse stockinette stitch',
  garter: 'garter stitch',
  seed: 'seed stitch',
  moss: 'moss stitch',
  edge: 'stockinette stitch',
};

export function fabricName(f: string): string {
  if (FABRICS[f]) return FABRICS[f];
  const rib = /^rib(\d+)x(\d+)$/.exec(f);
  if (rib) return `k${rib[1]}, p${rib[2]} rib`;
  return `${f.replace(/_/g, ' ')} pattern`;
}

/** sleeve_r → right sleeve, front_band → front band */
export function pieceName(n: string): string {
  const side = /^(.*)_(r|l)$/.exec(n);
  if (side) return `${side[2] === 'r' ? 'right' : 'left'} ${side[1].replace(/_/g, ' ')}`;
  return n.replace(/_/g, ' ');
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const sentence = (s: string) => { s = cap(s.trim()); return /[.!?:]$/.test(s) ? s : s + '.'; };

const ABBREVIATIONS: [string, string][] = [
  ['k2tog', 'knit 2 together (1 st decreased)'],
  ['ssk', 'slip, slip, knit (1 st decreased)'],
  ['p2tog', 'purl 2 together (1 st decreased)'],
  ['m1l', 'make 1 left (1 st increased)'],
  ['m1r', 'make 1 right (1 st increased)'],
  ['m1', 'make 1 (1 st increased)'],
  ['kfb', 'knit front and back (1 st increased)'],
  ['yo', 'yarn over'],
  ['sl', 'slip'],
  ['k', 'knit'],
  ['p', 'purl'],
  ['rep', 'repeat'],
  ['rnd', 'round'],
  ['RS', 'right side'],
  ['WS', 'wrong side'],
  ['st', 'stitch(es)'],
];

/** One shaping clause from a row description, in pattern English. */
function shapingText(s: string): string {
  s = s.trim();
  let m: RegExpExecArray | null;
  if ((m = /^bind_off center (\d+)$/.exec(s))) return `bind off the center ${m[1]} sts, then work each side separately from here`;
  if ((m = /^bind_off (\d+)(?: at)? (start|end|left|right)$/.exec(s))) return `bind off ${m[1]} sts at the ${m[2] === 'start' ? 'beginning' : m[2]} of the row`;
  if ((m = /^(inc|dec) (\w+) (\d+)$/.exec(s))) return `${m[1] === 'inc' ? 'increase' : 'decrease'} ${m[3]} st${m[3] === '1' ? '' : 's'} at each ${m[2] === 'edges' ? '' : m[2] + ' '}edge`;
  if ((m = /^(inc|dec) edges$/.exec(s))) return `${m[1] === 'inc' ? 'increase' : 'decrease'} 1 st at each edge`;
  if ((m = /^(inc|dec) (\d+) evenly$/.exec(s))) return `${m[1] === 'inc' ? 'increase' : 'decrease'} ${m[2]} sts evenly across`;
  // a written row: *k6, k2tog* → *k6, k2tog; rep from * to end
  if (/\*/.test(s)) return s.replace(/\*([^*]+)\*/g, '*$1; rep from * to end');
  return s.replace(/_/g, ' ');
}

function condText(c: string, round: boolean): string {
  c = c.trim();
  if (!c || /^\(\d+\/\d+\)$/.test(c)) return '';
  const what = round ? 'work' : 'piece';
  let m: RegExpExecArray | null;
  if ((m = /^until match (\w+)(?:\.(\w+))?$/.exec(c))) return `until ${what} has as many rows as the ${pieceName(m[1])}${m[2] ? ` to the ${m[2].replace(/_/g, ' ')} marker` : ''}`;
  if ((m = /^until ([\d.]+(?:in|cm)) from (\w+)$/.exec(c))) return `until ${what} measures ${m[1]} from the ${m[2].replace(/_/g, ' ')} marker`;
  if ((m = /^until ([\d.]+(?:in|cm))$/.exec(c))) return `until ${what} measures ${m[1]} from the beginning`;
  if ((m = /^([\d.]+(?:in|cm))$/.exec(c))) return `for ${m[1]}`;
  if ((m = /^until (.*)$/.exec(c))) return `until ${m[1].replace(/_/g, ' ')}`;
  return c.replace(/_/g, ' ');
}

const countText = (c: string) => {
  const parts = /^(\d+)(?: \+ (\d+))+ sts$/.exec(c);
  if (parts) { const ns = c.match(/\d+/g)!; if (ns.every((n) => n === ns[0])) return `${ns[0]} sts each side`; }
  return c;
};

// ---------------------------------------------------------------- source

interface SrcLine { code: string; comment: string }

/** Split a source line into statement and trailing comment (`#rrggbb` colours aren't comments). */
export function splitComment(line: string): SrcLine {
  const m = /(^|\s)#(?![0-9a-fA-F]{6}\b)(.*)$/.exec(line);
  if (!m) return { code: line.trim(), comment: '' };
  return { code: line.slice(0, m.index).trim(), comment: m[2].trim() };
}

// ---------------------------------------------------------------- rows

interface Group { first: Row; last: Row; n: number; key: string; body: string; head: string; cond: string; count: string }

function parseDesc(desc: string) {
  const m = /^(?:Row \d+ \((?:RS|WS)\): )?(.*?)(?: → (.+))?$/.exec(desc)!;
  const [head, cond = ''] = m[1].split(' — ');
  return { head: head.trim(), cond: cond.trim(), count: m[2] ?? '' };
}

function groupRows(rows: Row[]): Group[] {
  const out: Group[] = [];
  for (const r of rows) {
    if (r.dir === 'CO') continue;
    const d = parseDesc(r.desc);
    const key = r.line + '|' + d.head + '|' + d.cond.replace(/\(\d+\/\d+\)/, '');
    const g = out[out.length - 1];
    if (g && g.key === key && g.last.index === r.index - 1) { g.last = r; g.n++; g.count = d.count; continue; }
    out.push({ first: r, last: r, n: 1, key, body: d.head, head: d.head, cond: d.cond, count: d.count });
  }
  return out;
}

function rowLabel(p: Piece, a: Row, b: Row): string {
  const one = p.round ? 'Rnd' : 'Row';
  if (a === b) return `${one} ${a.index}${p.round ? '' : ` (${a.dir})`}`;
  return `${one}s ${a.index}–${b.index}`;
}

const WRITTEN = /\*|\b[kp]\d|\b(k2tog|ssk|p2tog|yo|m1[lr]?|kfb|sl\d?)\b|\baround\b/;
const GERUND: Record<string, string> = { increase: 'increasing', decrease: 'decreasing', bind: 'binding' };

function groupText(p: Piece, g: Group): string {
  const comma = g.head.indexOf(', ');
  const fabric = comma < 0 ? g.head : g.head.slice(0, comma);
  const rest = comma < 0 ? '' : g.head.slice(comma + 2);
  const fab = fabricName(fabric);
  const cond = condText(g.cond, p.round);
  const every = g.n > 1 ? ` on every ${p.round ? 'round' : 'row'}` : '';
  let text: string;
  if (rest && WRITTEN.test(rest) && !/^(inc|dec|bind_off)\b/.test(rest)) {
    // a written row: give the stitches themselves
    text = sentence(shapingText(rest) + every);
  } else if (rest) {
    const parts = rest.split(', ').map(shapingText);
    const ger = parts.map((t) => t.replace(/^(\w+)/, (w) => GERUND[w] ?? w)).join(' and ');
    const [main, after] = ger.split(', then ');
    text = `Work in ${fab}, ${main}${every}`;
    if (cond) text += ', ' + cond;
    text = sentence(text) + (after ? ' ' + sentence(after) : '');
    if (!p.round && g.n > 1 && g.first.dir === 'WS') text += ' Begin with a WS row.';
    return text;
  } else text = `Work in ${fab}`;
  if (cond) text = text.replace(/\.$/, '') + ' ' + cond;
  text = sentence(text);
  if (!p.round && g.n > 1 && g.first.dir === 'WS') text += ' Begin with a WS row.';
  return text;
}

function stepFor(p: Piece, g: Group, comment: string): ProseStep {
  return {
    kind: 'step', label: rowLabel(p, g.first, g.last), text: groupText(p, g),
    count: g.count ? countText(g.count) : undefined, note: comment || undefined, line: g.first.line, row: g.last.index,
  };
}

/** Fold runs of repeated groups (from `repeat N { … }`) into repeat steps. */
function foldRepeats(p: Piece, gs: Group[], comments: Map<number, string>): ProseStep[] {
  const out: ProseStep[] = [];
  const same = (a: Group, b: Group) => a.key === b.key && a.n === b.n;
  let i = 0;
  while (i < gs.length) {
    let best = { k: 0, m: 1 };
    for (let k = 1; k <= 6 && i + 2 * k <= gs.length; k++) {
      let m = 1;
      while (i + (m + 1) * k <= gs.length && gs.slice(i, i + k).every((g, j) => same(g, gs[i + m * k + j]))) m++;
      if (m > 1 && k * m > best.k * best.m) best = { k, m };
    }
    if (best.k === 0) { out.push(stepFor(p, gs[i], comments.get(gs[i].first.line) ?? '')); i++; continue; }
    const { k, m } = best;
    const cycle = gs.slice(i, i + k);
    const last = gs[i + k * m - 1];
    const rowsPer = cycle.reduce((s, g) => s + g.n, 0);
    const unit = p.round ? 'round' : 'row';
    out.push({
      kind: 'repeat',
      label: rowLabel(p, gs[i].first, last.last),
      text: `Work the following ${rowsPer === 1 ? unit : `${rowsPer} ${unit}s`} ${m} times in all:`,
      count: last.count ? countText(last.count) : undefined,
      line: gs[i].first.line,
      row: last.last.index,
      steps: cycle.map((g) => ({ ...stepFor(p, g, comments.get(g.first.line) ?? ''), count: undefined })),
    });
    i += k * m;
  }
  return out;
}

/** A source statement that makes no rows, as an instruction (or null to skip it). */
function statementText(code: string, p: Piece, params: Param[]): string | null {
  const w = code.split(/\s+/);
  const live = p.rows[p.rows.length - 1]?.stitches.length ?? 0;
  switch (w[0]) {
    case 'marker':
      return w.length > 2
        ? `Place a removable marker in the ${w.slice(2).join(' ').replace(/_/g, ' ').replace(/\./g, ' ')} stitch ("${w[1]}").`
        : `Mark both ends of the last row worked with a removable marker ("${w[1].replace(/_/g, ' ')}").`;
    case 'bind_off': {
      const using = /using\s+(.+)$/.exec(code);
      return `Bind off all sts${using ? ` ${/^"/.test(using[1]) ? 'as ' + using[1].replace(/"/g, '') : using[1].replace(/_/g, ' ') + ' style'}` : ' in pattern'}.`;
    }
    case 'gather': return `Cut the yarn, leaving a long tail. Thread the tail through the remaining ${live} sts, pull tight and fasten off.`;
    case 'close': return /3needle/.test(code) ? 'Join the two halves of the remaining sts with a three-needle bind-off.' : 'Graft the two halves of the remaining sts together (Kitchener stitch).';
    case 'stuff': return w[1] === 'none' ? null : `Stuff ${w[1] === 'light' ? 'lightly' : w[1] === 'firm' ? 'firmly' : 'the piece'}.`;
    case 'note': return sentence(code.slice(4).trim().replace(/^"|"$/g, ''));
    case 'round': return 'Join to work in the round, being careful not to twist.';
    case 'flat': return w[1] === 'ws' ? 'Turn, and work back and forth in rows.' : 'Work back and forth in rows.';
    case 'hold': return `Place ${w.slice(1).join(' ').replace(/_/g, ' ')} sts on a holder.`;
    case 'resume': return `Return the held sts (${w[1]}) to the needle and rejoin the yarn.`;
    case 'yarn': {
      const ref = /^\$\{(\w+)\}$/.exec(w[1] ?? '');
      const prm = ref && params.find((x) => x.name === ref[1]);
      if (prm) return `Change to the ${prm.label && prm.label !== 'Yarn' ? prm.label.toLowerCase() : prm.name} yarn.`;
      return w[1] && !w[1].startsWith('#') ? `Change to yarn ${w[1]}.` : 'Change yarn colour.';
    }
    case 'needle': return `Change to ${w.slice(1).join(' ')} needles.`;
    default: return null;
  }
}

function castOnText(p: Piece, row: Row, code: string): string {
  let t = row.desc.replace(/^Cast on/, 'Cast on').replace(/^Pick up/, 'Pick up and knit');
  const from = /\bfrom\s+(.+?)(?:\s+mult\b.*)?$/.exec(code);
  if (from && /^pick_up/.test(code)) t += ' along the ' + from[1].split(/\s*\+\s*/).map(edgeText).join(' and the ');
  const using = /\busing\s+(\w+)/.exec(code);
  if (using) t += ` using the ${using[1].replace(/_/g, '-')} method`;
  t = sentence(t);
  if (p.round) t += ' Join to work in the round, being careful not to twist.';
  return t;
}

/** front.left[start:underarm] → front left edge, from the cast-on to the underarm marker */
export function edgeText(e: string): string {
  e = e.trim().replace(/^~/, '');
  const m = /^(\w+)(?:\.(\w+))?(?:\.(\d+))?(?:\[(\w+):(\w+)\])?$/.exec(e);
  if (!m) return e.replace(/[._]/g, ' ');
  const [, piece, edge, part, a, b] = m;
  const edgeWord: Record<string, string> = { top: 'top edge', bottom: 'cast-on edge', left: 'left edge', right: 'right edge' };
  let t = `${pieceName(piece)} ${edge ? edgeWord[edge] ?? edge.replace(/_/g, ' ') : ''}`.trim();
  if (part) t += ` (part ${part})`;
  const where = (x: string) => x === 'start' ? 'cast-on' : x === 'end' ? 'top' : `${x.replace(/_/g, ' ')} marker`;
  if (a) t += ` (${where(a)} to ${where(b)})`;
  return t;
}

// ---------------------------------------------------------------- whole pattern

/** `{ … }` blocks by line: [first line, last line], innermost last. */
function braceBlocks(lines: SrcLine[], from: number, to: number): [number, number][] {
  const out: [number, number][] = [];
  const open: number[] = [];
  for (let ln = from; ln < to; ln++) {
    for (const ch of lines[ln - 1]?.code ?? '') {
      if (ch === '{') open.push(ln);
      else if (ch === '}' && open.length) out.push([open.pop()!, ln]);
    }
  }
  return out;
}

function pieceSteps(p: Piece, lines: SrcLine[], endLine: number, params: Param[]): ProseStep[] {
  const rowLines = new Set(p.rows.map((r) => r.line));
  const comments = new Map<number, string>();
  const statements: ProseStep[] = [];
  for (let ln = p.line + 1; ln < endLine; ln++) {
    const l = lines[ln - 1]; if (!l) continue;
    if (l.comment && l.code) comments.set(ln, l.comment);
    if (rowLines.has(ln)) continue;
    if (!l.code && l.comment) { statements.push({ kind: 'note', text: cap(l.comment.replace(/\.$/, '')), line: ln }); continue; }
    const t = l.code && statementText(l.code, p, params);
    if (t) statements.push({ kind: 'step', text: t, line: ln, note: l.comment || undefined });
  }

  const steps: ProseStep[] = [];
  const co = p.rows[0];
  if (co && co.dir === 'CO') {
    steps.push({ kind: 'step', text: castOnText(p, co, lines[co.line - 1]?.code ?? ''), note: comments.get(co.line), line: co.line, row: 0 });
  }
  const body = foldRepeats(p, groupRows(p.rows), comments);

  // a statement inside a `repeat { … }` belongs to the repeat step made from that block
  const blocks = braceBlocks(lines, p.line + 1, endLine);
  const blockOf = (ln: number) => {
    let best: [number, number] | null = null;
    for (const b of blocks) if (b[0] <= ln && ln <= b[1] && (!best || b[0] > best[0])) best = b;
    return best;
  };
  const pending = [...statements];
  for (const st of body) {
    if (st.kind !== 'repeat' || !st.steps) continue;
    const blk = blockOf(st.steps[0].line);
    if (!blk) continue;
    const inside = pending.filter((s) => s.line >= blk[0] && s.line <= blk[1]);
    if (!inside.length) continue;
    st.steps = [...st.steps, ...inside].sort((x, y) => x.line - y.line);
    for (const s of inside) pending.splice(pending.indexOf(s), 1);
  }

  // the rest interleave by source line
  let si = 0;
  const flush = (upto: number) => { while (si < pending.length && pending[si].line < upto) steps.push(pending[si++]); };
  for (const st of body) { flush(st.line); steps.push(st); }
  flush(Infinity);
  return steps;
}

function assembleSteps(lines: SrcLine[]): ProseStep[] {
  const out: ProseStep[] = [];
  const start = lines.findIndex((l) => l.code === 'assemble');
  if (start >= 0) {
    for (let i = start + 1; i < lines.length; i++) {
      const { code, comment } = lines[i];
      if (code === 'end') break;
      if (!code && comment) { out.push({ kind: 'note', text: cap(comment.replace(/\.$/, '')), line: i + 1 }); continue; }
      const seam = /^seam\s+(.+?)\s*=\s*(.+)$/.exec(code);
      if (seam) {
        const [a, b] = [seam[1], seam[2]].map((s) => s.split(/\s*\+\s*/).map(edgeText).join(' and the '));
        const self = /^(\w+)\.left$/.exec(seam[1].trim());
        const text = self && seam[2].trim() === `${self[1]}.right`
          ? `Sew the ${pieceName(self[1])} seam, joining its left and right edges.`
          : `Sew the ${a} to the ${b}.`;
        out.push({ kind: 'step', text, note: comment || undefined, line: i + 1 });
      }
    }
  }
  const finish = lines.find((l) => /^finish\s+(felt|block)/.test(l.code));
  if (finish) out.push({ kind: 'step', text: /felt/.test(finish.code) ? 'Felt the piece to size.' : 'Block to the finished measurements.', line: lines.indexOf(finish) + 1 });
  out.push({ kind: 'step', text: 'Weave in all ends.', line: 0 });
  return out;
}

function fmtLen(inches: number) {
  return `${Math.round(inches * 4) / 4}in (${Math.round(inches * 2.54)}cm)`;
}

export function toProse(doc: KnitDoc, src: string): Prose {
  const lines = src.split('\n').map(splitComment);
  const ends = new Map<number, number>();
  // where each piece's block ends
  for (const p of doc.built.order) {
    let e = p.line + 1;
    if (!/\blike\b/.test(lines[p.line - 1]?.code ?? '')) while (e <= lines.length && lines[e - 1].code !== 'end') e++;
    ends.set(p.line, e);
  }

  const firstPiece = lines.findIndex((l) => /^(piece|stitch|chart|define|assemble)\b/.test(l.code));
  const intro = lines.slice(0, firstPiece < 0 ? lines.length : firstPiece).filter((l) => !l.code && l.comment).map((l) => l.comment);

  const materials: Prose['materials'] = [];
  const size = doc.params.find((p) => p.name === 'size' && p.type === 'enum');
  if (size) materials.push({ label: 'Size', value: `${size.value} (sizes: ${size.options?.join(', ')})` });
  const colors = doc.params.filter((p) => p.type === 'color');
  for (const c of colors) materials.push({ label: c.label || 'Yarn', value: String(c.value), color: String(c.value) });
  if (!colors.length) {
    const y = lines.find((l) => /^yarn\b.*#[0-9a-fA-F]{6}/.test(l.code));
    const hex = y && /#[0-9a-fA-F]{6}/.exec(y.code)![0];
    if (hex) materials.push({ label: 'Yarn', value: hex, color: hex });
  }
  const { sg, rg } = doc.built;
  const r1 = (n: number) => String(Math.round(n * 10) / 10);
  materials.push({ label: 'Gauge', value: `${r1(sg * 4)} sts and ${r1(rg * 4)} rows = 4in (10cm) in stockinette stitch` });
  const needles = lines.filter((l) => /^needle\s/.test(l.code)).map((l) => l.code.slice(7));
  if (needles.length) materials.push({ label: 'Needles', value: [...new Set(needles)].join('; ') });
  if (lines.some((l) => /^(rows?|piece)\b.*\bround\b/.test(l.code) || l.code === 'round')) materials.push({ label: 'Notions', value: 'Circular needle or double-pointed needles; stitch markers; tapestry needle' });
  else materials.push({ label: 'Notions', value: 'Stitch markers; tapestry needle' });

  const sections: ProseSection[] = doc.built.order.filter((p) => p.nrows).map((p) => {
    const like = /\blike\s+(\w+)/.exec(lines[p.line - 1]?.code ?? '');
    return {
      piece: p.name, title: cap(pieceName(p.name)), round: p.round,
      like: like ? pieceName(like[1]) : undefined,
      steps: like ? [] : pieceSteps(p, lines, ends.get(p.line)!, doc.params),
      size: `${fmtLen(p.widthIn)} ${p.round ? 'around' : 'wide'} × ${fmtLen(p.heightIn)} long`,
    };
  });

  const finishing = assembleSteps(lines);

  // abbreviations that actually appear
  const all = JSON.stringify([sections, finishing]);
  const abbreviations = ABBREVIATIONS.filter(([a]) => new RegExp(`(^|[^a-zA-Z])${a}(?![a-zA-Z])`, a.length <= 2 ? '' : 'i').test(all));

  return { title: doc.name, source: doc.source, intro, materials, sections, finishing, abbreviations };
}

// ---------------------------------------------------------------- plain words

const FABRIC_GLOSS: [RegExp, (round: boolean) => string][] = [
  [/reverse stockinette stitch/, (r) => r ? 'purl every round' : 'purl the right-side rows, knit the wrong-side rows'],
  [/stockinette stitch/, (r) => r ? 'knit every round' : 'knit the right-side rows, purl the wrong-side rows'],
  [/garter stitch/, (r) => r ? 'knit one round, purl the next' : 'knit every row'],
  [/seed stitch/, () => 'knit 1, purl 1, then on the next row knit the purls and purl the knits'],
  [/moss stitch/, () => 'knit 1, purl 1 for two rows, then swap: knit the purls and purl the knits for two rows'],
];

const WORDS: [RegExp, string][] = [
  [/\bk2tog\b/gi, 'knit 2 together'],
  [/\bk3tog\b/gi, 'knit 3 together'],
  [/\bp2tog\b/gi, 'purl 2 together'],
  [/\bssk\b/gi, 'slip, slip, knit (slip 2 stitches one at a time, then knit them together through the back)'],
  [/\bm1l\b/gi, 'make 1 left'],
  [/\bm1r\b/gi, 'make 1 right'],
  [/\bm1\b/gi, 'make 1'],
  [/\bkfb\b/gi, 'knit into the front and back of the stitch'],
  [/\byo\b/gi, 'yarn over'],
  [/\bsl(\d+)\b/gi, 'slip $1'],
  [/\bk(\d+)\b/gi, 'knit $1'],
  [/\bp(\d+)\b/gi, 'purl $1'],
  [/\bk\b/g, 'knit'],
  [/\bp\b/g, 'purl'],
  [/\bsts\b/g, 'stitches'],
  [/\bst\b/g, 'stitch'],
  [/\brep\b/g, 'repeat'],
  [/\bRnds\b/g, 'Rounds'],
  [/\bRnd\b/g, 'Round'],
  [/\(RS\)/g, '(right side)'],
  [/\(WS\)/g, '(wrong side)'],
  [/\bRS\b/g, 'right-side'],
  [/\bWS\b/g, 'wrong-side'],
  [/(\d)in\b/g, '$1 inches'],
  [/(\d)cm\b/g, '$1 cm'],
];

/**
 * The same instruction with every abbreviation written out, and each named stitch pattern explained:
 * "*k6, k2tog; rep from * to end" → "Repeat “knit 6, knit 2 together” to the end of the round."
 * Returns null when there is nothing to translate.
 */
export function spellOut(text: string, round: boolean): string | null {
  let t = text;
  // *A; rep from * to end → Repeat “A” to the end
  t = t.replace(/\*([^*;]+); rep from \* to end/g, (_, a) => `repeat “${a.trim()}” to the end of the ${round ? 'round' : 'row'}`);
  t = t.replace(/^(\w+) around/i, (_, a) => `${a} all the way around`);
  t = t.replace(/Bind off all sts in pattern/, 'Bind off all the stitches, knitting the knits and purling the purls as they appear');
  // rib: "k2, p2 rib" → "rib (knit 2, purl 2, ...)"
  t = t.replace(/\bk(\d+), p(\d+) rib\b/g, (_, a, b) => `rib (knit ${a}, purl ${b} across; on later ${round ? 'rounds' : 'rows'} knit the knits and purl the purls)`);
  for (const [re, gloss] of FABRIC_GLOSS) {
    if (re.test(t)) { t = t.replace(re, (m) => `${m} (${gloss(round)})`); break; }
  }
  for (const [re, w] of WORDS) t = t.replace(re, w);
  t = t.charAt(0).toUpperCase() + t.slice(1);
  return t === text ? null : t;
}
