// @ts-nocheck -- engine internals are loosely typed; the public shapes are in ../types.ts
// Written rows ("k3 *p2 k2* p2 k3"): parsing into a tree, and working a row over a run of live stitches.

export class KnitError extends Error {}
const fail = (msg) => { throw new KnitError(msg); };

// ---------- The stitch table ----------
// in = stitches used, out = stitches made, w = how the made stitches look as worked (k/p), op/lean for drawing.
const DEC = {
  k2tog: [2, 'k', 'r'], ssk: [2, 'k', 'l'], k2togtbl: [2, 'k', 'l'], skp: [2, 'k', 'l'], p2tog: [2, 'p', 'r'], ssp: [2, 'p', 'l'], p2togtbl: [2, 'p', 'l'],
  k3tog: [3, 'k', 'r'], sssk: [3, 'k', 'l'], p3tog: [3, 'p', 'r'], sssp: [3, 'p', 'l'], cdd: [3, 'k', null], sk2p: [3, 'k', 'l'], s2kp: [3, 'k', null], k3togtbl: [3, 'k', 'l'],
};
const MADE = { yo: 1, yo2: 2, m1: 1, m1l: 1, m1r: 1, m1p: 1, m1pl: 1, m1pr: 1, lli: 1, rli: 1, m1lp: 1, m1rp: 1 };
const MADE_LEAN = { m1l: 'l', m1r: 'r', lli: 'l', rli: 'r', m1pl: 'l', m1pr: 'r' };

/** What one stitch word does, or null. */
export function wordInfo(word, keys) {
  let m;
  if (keys && keys[word]) return { ...keys[word], word };
  if ((m = /^(k|p)(\d+)?(tbl|b)?$/.exec(word))) {
    if (m[2] === undefined && m[3] && m[3] !== 'tbl') return null;
    const n = m[2] === undefined ? null : +m[2];
    return { word, in: n ?? 1, out: n ?? 1, w: m[1], fill: n === null, plain: true, tbl: m[3] === 'tbl' };
  }
  if ((m = /^(k|p)tbl$/.exec(word))) return { word, in: 1, out: 1, w: m[1], fill: true, plain: true };
  if ((m = /^pat(\d+)?$/.exec(word))) { const n = m[1] === undefined ? null : +m[1]; return { word, in: n ?? 1, out: n ?? 1, pat: true, fill: n === null }; }
  if ((m = /^sl(\d+)?(wyif|wyib|yo|k|p|kwise|pwise)?$/.exec(word))) { const n = m[1] ? +m[1] : 1; return { word, in: n, out: n, w: 'k', slip: true, brioche: m[2] === 'yo' }; }
  if (word === 'ds') return { word, in: 1, out: 1, pat: true };
  if (word === 'brk' || word === 'brp') return { word, in: 1, out: 1, w: word[2] };
  if (word === 'brkyobrk') return { word, in: 1, out: 3, w: 'k', op: 'inc' };
  if (word in MADE) return { word, in: 0, out: MADE[word], w: /p/.test(word.slice(2)) ? 'p' : 'k', op: 'inc', lean: MADE_LEAN[word], made: true };
  if (word === 'kfb' || word === 'pfb') return { word, in: 1, out: 2, w: word[0], op: 'inc' };
  if (word === 'kfbf') return { word, in: 1, out: 3, w: 'k', op: 'inc' };
  if (DEC[word]) { const [n, w, lean] = DEC[word]; return { word, in: n, out: 1, w, op: 'dec', lean }; }
  if (word === 'psso') return { word, in: 0, out: -1, pass: 1 };
  if (word === 'p2sso') return { word, in: 0, out: -2, pass: 2 };
  if (word === 'lt' || word === 'rt') return { word, in: 2, out: 2, w: 'k', cross: word === 'lt' ? [1, 1, 'f'] : [1, 1, 'b'] };
  if ((m = /^c(\d+)(f|b)$/.exec(word))) { const n = +m[1]; if (n % 2) return null; return { word, in: n, out: n, w: 'k', cross: [n / 2, n / 2, m[2]] }; }
  if ((m = /^c(\d+)\/(\d+)(?:\/(\d+))?(f|b)$/.exec(word))) {
    const a = +m[1], b = +m[2], c = m[3] ? +m[3] : 0; const n = a + b + c;
    return { word, in: n, out: n, w: 'k', cross: c ? [a, b, m[4], c] : [a, b, m[4]] };
  }
  if ((m = /^co(\d+)$/.exec(word))) return { word, in: 0, out: +m[1], w: 'k', op: 'co', made: true };
  if ((m = /^bo(\d+)?$/.exec(word))) return { word, in: m[1] ? +m[1] : 1, out: 0, bo: true };
  return null;
}

// ---------- Parsing ----------
// Nodes: {t:'w', info} | {t:'rep', body, stops} | {t:'opt', body} | {t:'in', body, n} | {t:'stop', kind, name, off}
//        {t:'mark', name} | {t:'yarn', name} | {t:'turn', wrap} | {t:'slide'} | {t:'over', n} | {t:'asis'}
export function parseRow(text, keys, line) {
  const s = text.replace(/^"|"$/g, '').replace(/,/g, ' ');
  let i = 0;
  const err = (m) => fail(`In "${s.trim()}": ${m}`);
  function ws() { while (i < s.length && /\s/.test(s[i])) i++; }
  function seq(close) {
    const out = [];
    for (;;) {
      ws();
      if (i >= s.length) { if (close) err(`missing "${close}"`); return out; }
      const c = s[i];
      if (c === '*') {
        if (close === '*') { i++; return out; }
        i++; const body = seq('*'); out.push({ t: 'rep', body, stops: hasStop(body) }); continue;
      }
      if (c === ')') {
        if (close !== ')') err('unexpected ")"');
        i++;
        const m = /^(x(\d+)|in(\d+)|\?)?/.exec(s.slice(i)); i += m[0].length;
        out.suffix = m[2] ? { x: +m[2] } : m[3] ? { in: +m[3] } : m[0] === '?' ? { opt: true } : { x: 1 };
        return out;
      }
      if (c === '(') {
        i++; const body = seq(')'); const sfx = body.suffix; delete body.suffix;
        if (sfx.in !== undefined) out.push({ t: 'in', body, n: sfx.in });
        else if (sfx.opt) out.push({ t: 'opt', body });
        else for (let k = 0; k < sfx.x; k++) out.push(...cloneSeq(body));
        continue;
      }
      if (c === '|') {
        i++; const m = /^([a-z_][a-z0-9_]*)?(?:-(\d+))?/i.exec(s.slice(i)); i += m[0].length;
        out.push({ t: 'stop', kind: m[1] ? 'name' : '|', name: m[1], off: m[2] ? +m[2] : 0 }); continue;
      }
      if (c === '^') {
        i++; const m = /^(?:-(\d+))?/.exec(s.slice(i)); i += m[0].length;
        out.push({ t: 'stop', kind: '^', off: m[1] ? +m[1] : 0 }); continue;
      }
      if (c === '@') { i++; const m = /^[a-z_0-9]+/i.exec(s.slice(i)); if (!m) err('@ needs a yarn name'); i += m[0].length; out.push({ t: 'yarn', name: m[0] }); continue; }
      if (c === ':') { i++; const m = /^[a-z_][a-z0-9_]*/i.exec(s.slice(i)); if (!m) err('":" needs a name'); i += m[0].length; out.push({ t: 'mark', name: m[0] }); continue; }
      // a word, possibly a cross with legs c1/1f(p1 k1tbl), possibly :NAME
      const m = /^[^\s*()|^@:]+/.exec(s.slice(i));
      if (!m) err(`can't read "${s.slice(i, i + 6)}"`);
      i += m[0].length; let word = m[0];
      if (word === 'wyif' || word === 'wyib') { const prev = out[out.length - 1]; if (prev && prev.t === 'w' && prev.info.slip) { prev.info.word += ' ' + word; continue; } err(`"${word}" must follow a slipped stitch`); }
      if (word === 'turn' || word === 'wt') { out.push({ t: 'turn', wrap: word === 'wt' }); continue; }
      if (word === 'slide') { out.push({ t: 'slide' }); continue; }
      let mm;
      if ((mm = /^over(\d+)$/.exec(word))) { out.push({ t: 'over', n: +mm[1] }); continue; }
      const info = wordInfo(word, keys);
      if (!info) err(`unknown stitch "${word}"${/\//.test(word) ? ' (per-size lists must have one value per size)' : ''}. Add a key for the pattern's own abbreviations`);
      const node = { t: 'w', info: { ...info } };
      if (info.cross && s[i] === '(') { // legs
        i++; const legs = seq(')'); delete legs.suffix;
        node.legs = legs.filter((n) => n.t === 'w').map((n) => n.info.w || 'k');
      }
      if (info.macro) { out.push(...cloneSeq(info.macro)); continue; }
      if (s[i] === ':') { const nm = /^:([a-z_][a-z0-9_]*)/i.exec(s.slice(i)); if (nm) { node.name = nm[1]; i += nm[0].length; } }
      out.push(node);
    }
  }
  const ast = seq(null);
  return ast;
}
const cloneSeq = (body) => JSON.parse(JSON.stringify(body));
const hasStop = (body) => body.some((n) => n.t === 'stop' || ((n.t === 'opt' || n.t === 'in') && hasStop(n.body)));

/** Stitches used and made by a fixed sequence (no fills, no *…*). */
export function seqCounts(body) {
  let a = 0, b = 0;
  for (const n of body) {
    if (n.t === 'w') { if (n.info.fill) return null; a += n.info.in; b += n.info.out; }
    else if (n.t === 'in') { const c = seqCounts(n.body); if (!c) return null; a += n.n; b += c.out; }
    else if (n.t === 'opt') { const c = seqCounts(n.body); if (!c) return null; a += c.in; b += c.out; }
    else if (n.t === 'rep' || n.t === 'asis') return null;
  }
  return { in: a, out: b };
}

/** Parse a key definition: `NAME = STITCHES` or `NAME = A to B`. */
export function parseKey(rest, keys) {
  const m = /^\s*(\d+)\s+to\s+(\d+)\s*$/.exec(rest);
  if (m) return { in: +m[1], out: +m[2], w: 'k', custom: true };
  const ast = parseRow(rest, keys);
  if (ast.length === 1 && ast[0].t === 'w') return { ...ast[0].info, legs: ast[0].legs };
  const c = seqCounts(ast);
  if (!c) fail(`key body "${rest}" must have fixed counts`);
  return { in: c.in, out: c.out, macro: ast };
}

// ---------- Working a written row ----------
/**
 * ctx: {
 *   W: input stitches in work order (may be longer than needed),
 *   bnd(k): true when a section boundary is just before W[k],
 *   gaps: sorted W-indices of short-row gaps,
 *   named(name): W-index where section NAME starts or point marker NAME sits, or -1,
 *   patUnits(a, b): pattern units for W[a..b) (as established),
 *   asis(k): how W[k] looks as worked when worked "as it presents itself",
 *   side: 'RS'|'WS', exact: require the row to use every stitch of W (unless it turns),
 *   warn(msg)
 * }
 * Returns { units, end, turn, wrap, slide, over, names, points }
 * A unit: { ins:[W indices], outs:[{w, op, lean, word, yarn, name}], made?, bo?, sec? }
 */
export function workWritten(ast, ctx) {
  const W = ctx.W; const units = []; let c = 0; let yarn = null;
  const res = { units, turn: false, slide: false, over: 0, names: [], points: [] };
  const err = (m) => fail(m);
  const hasTurn = (seq) => seq.some((n) => n.t === 'turn');
  const topTurn = hasTurn(ast);

  // incl: the cursor itself may be the stop (checking a stop just reached); otherwise the next one ahead of a segment start
  function stopIndex(node, from, incl = false) {
    let k;
    if (node.kind === '|') { k = W.length; for (let j = Math.max(from + (incl ? 0 : 1), 1); j < W.length; j++) if (ctx.bnd(j)) { k = j; break; } }
    else if (node.kind === '^') { k = W.length; for (const g of ctx.gaps) if (g >= Math.max(from, 1)) { k = g; break; } }
    else { k = ctx.named(node.name, from); if (k < 0) err(`no marker or section "${node.name}" ahead`); }
    return k - (node.off || 0);
  }

  function emit(info, n, extra = {}) {
    // work one word at the cursor
    if (info.pat) {
      const us = ctx.patUnits(c, c + info.in); us.forEach((u) => units.push(u)); c += info.in; return;
    }
    if (c + info.in > W.length) err(`the row runs out of stitches at "${info.word}" (${W.length} available)`);
    const ins = []; for (let k = 0; k < info.in; k++) ins.push(c + k);
    if (info.pass) { // psso: merge the last two stitches made
      for (let p = 0; p < info.pass; p++) {
        let u = units[units.length - 1]; if (!u || !u.outs.length) err('psso needs stitches before it');
        let last = u.outs[u.outs.length - 1];
        // the stitch before the last one: same unit or the previous unit
        let pu = u, pi = u.outs.length - 2;
        if (pi < 0) { pu = units[units.length - 2]; if (!pu || !pu.outs.length) err('psso needs two stitches before it'); pi = pu.outs.length - 1; }
        const passed = pu.outs.splice(pi, 1)[0];
        last.op = 'dec'; last.lean = 'l'; last.word = (last.word || '') + ' psso';
        if (pu !== u) { u.ins = pu.ins.concat(u.ins); if (!pu.outs.length) { units.splice(units.indexOf(pu), 1); } else { /* keep */ } }
        void passed;
      }
      return;
    }
    if (info.bo) {
      // bind off: after a made stitch, the stitch just made
      const u = { ins, outs: ins.map(() => ({ op: 'bo', w: 'k', word: 'bo', name: extra.name })), bo: true };
      units.push(u); c += info.in; return;
    }
    if (!info.in && !info.out) return;
    const outs = [];
    const legs = extra.legs;
    for (let k = 0; k < info.out; k++) {
      outs.push({ w: legs ? legs[k] || info.w : info.w || 'k', op: info.op || (info.cross ? 'n' : 'n'), lean: info.lean, word: info.word, yarn, name: extra.name, tbl: info.tbl, slip: info.slip });
    }
    const u = { ins, outs, made: info.in === 0, word: info.word };
    if (info.cross) u.cross = info.cross;
    if (info.macroIn) u.inN = info.macroIn;
    units.push(u); c += info.in;
  }

  function workIn(node) {
    // (…)inN: the group is worked into the next N stitches together
    const ins = []; for (let k = 0; k < node.n; k++) ins.push(c + k);
    if (c + node.n > W.length) err('the row runs out of stitches in an (…)in group');
    const outs = [];
    for (const m of node.body) if (m.t === 'w') for (let k = 0; k < m.info.out; k++) outs.push({ w: m.info.w || 'k', op: node.body.length > 1 || m.info.out !== node.n ? (m.info.out > node.n ? 'inc' : m.info.out < node.n ? 'dec' : 'n') : 'n', word: m.info.word, yarn });
    units.push({ ins, outs, word: '(…)in' + node.n }); c += node.n;
  }

  function fixedIn(nodes) {
    let n = 0;
    for (const m of nodes) {
      if (m.t === 'w') { if (m.info.fill) err('only one fill per segment (a bare k, p or pat, or a *…*)'); n += m.info.in; }
      else if (m.t === 'in') n += m.n;
      else if (m.t === 'opt') { const cc = seqCounts(m.body); n += cc ? cc.in : 0; }
      else if (m.t === 'rep') err('only one *…* per segment');
    }
    return n;
  }

  function runSeq(seq) {
    for (let i = 0; i < seq.length; i++) {
      const n = seq[i];
      if (n.t === 'stop') {
        const k = stopIndex(n, c, true);
        if (k !== c) err(`${n.kind === '^' ? '^' : '|' + (n.name || '')}: ${k > c ? k - c + ' stitch(es) left before the stop' : 'the row is ' + (c - k) + ' stitch(es) past the stop'}`);
        continue;
      }
      if (n.t === 'mark') { res.points.push({ name: n.name, at: c, unit: units.length }); continue; }
      if (n.t === 'yarn') { yarn = n.name; continue; }
      if (n.t === 'turn') { res.turn = true; res.wrap = n.wrap; continue; }
      if (n.t === 'slide') { res.slide = true; continue; }
      if (n.t === 'over') { res.over = n.n; continue; }
      if (n.t === 'in') { workIn(n); continue; }
      if (n.t === 'rep' && n.stops) {
        // once per section, until the end of the row
        let guard = 0;
        while (c < W.length && guard++ < 10000) { const c0 = c; runSeq(n.body); if (c === c0) break; }
        continue;
      }
      const isFill = (n.t === 'w' && n.info.fill) || n.t === 'rep' || n.t === 'asis';
      if (!isFill) {
        if (n.t === 'opt') {
          const cc = seqCounts(n.body); const room = segRoom(seq, i + 1);
          let after = 0; try { after = fixedIn(seq.slice(i + 1, segEnd(seq, i + 1))); } catch { after = 0; }
          if (cc && room - after >= cc.in && c + cc.in <= W.length) runSeq(n.body);
          continue;
        }
        emit(n.info, 1, { legs: n.legs, name: n.name }); continue;
      }
      // a fill region: [*…*] (…)? … [bare fill], then fixed items up to the stop
      let j = i; const region = [];
      while (j < seq.length && (seq[j].t === 'rep' || seq[j].t === 'opt' || (seq[j].t === 'w' && seq[j].info.fill) || seq[j].t === 'asis')) {
        region.push(seq[j]); j++;
        if (region[region.length - 1].t === 'w' || region[region.length - 1].t === 'asis') break;
      }
      const e = segEnd(seq, j);
      const after = seq.slice(j, e);
      const stopNode = seq[e];
      let stop = stopNode && stopNode.t === 'stop' ? stopIndex(stopNode, c) : (topTurn && !stopNode ? W.length : W.length);
      if (!stopNode && ctx.segStop) stop = ctx.segStop(c);
      let rest = stop - c - fixedIn(after);
      if (rest < 0) err(`not enough stitches: ${stop - c} before the ${stopNode ? 'stop' : 'end of the row'}, ${fixedIn(after)} needed after the fill`);
      for (const r of region) {
        if (r.t === 'rep') {
          const cc = seqCounts(r.body);
          if (!cc) err('a *…* repeat must have fixed counts');
          if (cc.in === 0) { err('a *…* repeat must use stitches'); }
          const hasBare = region.some((q) => q.t === 'w' || q.t === 'asis');
          const optIn = 0;
          let times = Math.floor((rest - optIn) / cc.in);
          let left = rest - times * cc.in;
          if (times < 1 && !hasBare && region.length === 1 && !ctx.lenient) err(`*…* needs ${cc.in} sts but only ${rest} are left`);
          for (let t = 0; t < times; t++) runSeq(r.body);
          rest = left;
          if (left && !hasBare && !region.some((q) => q.t === 'opt')) {
            if (ctx.partial) { partial(r.body, left); rest = 0; }
            else err(`${stop - c + left} sts left over: the *…* repeat of ${cc.in} doesn't fit (${rest + times * cc.in} sts)`);
          }
        } else if (r.t === 'opt') {
          const cc = seqCounts(r.body); if (cc && cc.in <= rest) { runSeq(r.body); rest -= cc.in; }
        } else if (r.t === 'asis') {
          for (let k = 0; k < rest; k++) emit({ word: 'as is', in: 1, out: 1, w: ctx.asis(c) });
          rest = 0;
        } else { // bare fill
          emit({ ...r.info, in: rest, out: rest }, rest, { name: r.name }); rest = 0;
        }
      }
      if (rest > 0) err(`${rest} stitch(es) left over before the ${stopNode ? 'stop' : 'end of the row'}`);
      i = j - 1;
    }
  }
  function partial(body, left) { // work the next columns of a repeat that doesn't fit, plain where a stitch is cut off
    for (const n of body) {
      if (left <= 0) break;
      if (n.t === 'w' && n.info.in <= left && n.info.in > 0 && !n.info.cross) { emit(n.info, 1, {}); left -= n.info.in; }
      else if (n.t === 'w' && n.info.in === 0) continue;
      else { const k = Math.min(left, n.t === 'w' ? n.info.in : 1); for (let q = 0; q < k; q++) emit({ word: 'k1', in: 1, out: 1, w: ctx.asis(c) }); left -= k; }
    }
    for (; left > 0; left--) emit({ word: 'k1', in: 1, out: 1, w: ctx.asis(c) });
    ctx.warn && ctx.warn('partial pattern repeat at the edge');
  }
  function segEnd(seq, from) { let e = from; while (e < seq.length && seq[e].t !== 'stop' && !(seq[e].t === 'rep' && seq[e].stops)) e++; return e; }
  function segRoom(seq, from) { const e = segEnd(seq, from); const st = seq[e]; return (st && st.t === 'stop' ? stopIndex(st, c) : W.length) - c; }

  runSeq(ast);
  res.end = c;
  if (!res.turn && ctx.exact && c !== W.length && !res.slide) {
    if (c < W.length) err(`the row uses ${c} of ${W.length} stitches (${W.length - c} left unworked; end with "turn" for a short row)`);
  }
  return res;
}

/** Turn a row written for one side into the same row worked from the other side (round ↔ flat conversion). */
const FLIP = { k: 'p', p: 'k', k2tog: 'p2tog', p2tog: 'k2tog', ssk: 'ssp', ssp: 'ssk', k3tog: 'p3tog', p3tog: 'k3tog', sssk: 'sssp', sssp: 'sssk', k1tbl: 'p1tbl', p1tbl: 'k1tbl', m1l: 'm1pr', m1r: 'm1pl', m1pl: 'm1r', m1pr: 'm1l', kfb: 'pfb', pfb: 'kfb', lli: 'rli', rli: 'lli' };
export function flipRow(ast, keys) {
  const out = [];
  for (let i = ast.length - 1; i >= 0; i--) {
    const n = ast[i];
    if (n.t === 'w') {
      const w = n.info.word; let m; let nw = FLIP[w];
      if (!nw && (m = /^(k|p)(\d+)(tbl)?$/.exec(w))) nw = (m[1] === 'k' ? 'p' : 'k') + m[2] + (m[3] || '');
      if (!nw && (w === 'k' || w === 'p')) nw = w === 'k' ? 'p' : 'k';
      const info = nw ? wordInfo(nw, keys) : { ...n.info, w: n.info.w === 'k' ? 'p' : n.info.w === 'p' ? 'k' : n.info.w };
      out.push({ ...n, info: info || n.info, legs: n.legs ? n.legs.slice().reverse().map((x) => (x === 'k' ? 'p' : 'k')) : undefined });
    } else if (n.t === 'rep' || n.t === 'opt' || n.t === 'in') out.push({ ...n, body: flipRow(n.body, keys) });
    else if (n.t === 'turn' || n.t === 'slide' || n.t === 'over') out.push(n);
    else out.push(n);
  }
  // control words stay at the end
  const ctl = out.filter((n) => n.t === 'turn' || n.t === 'slide' || n.t === 'over');
  return out.filter((n) => !ctl.includes(n)).concat(ctl);
}
