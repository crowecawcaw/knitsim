// @ts-nocheck -- engine internals are loosely typed; the public shapes are in ../types.ts
// Source → params, per-size expansion, and a tree of statements.

const isHex = (s) => /^#[0-9a-fA-F]{6}$/.test(s || '');
export { isHex };

/** Strip a comment: `#` at the start of a line or after a space, outside quotes, unless it is a #rrggbb colour. */
export function stripComment(raw) {
  let q = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === '"') q = !q;
    else if (c === '#' && !q && (i === 0 || /\s/.test(raw[i - 1])) && !/^#[0-9a-fA-F]{6}\b/.test(raw.slice(i))) return raw.slice(0, i);
  }
  return raw;
}

const qtoks = (s) => (s.match(/"[^"]*"|\S+/g) || []);
const unq = (s) => s.replace(/^"|"$/g, '');

// ---------- Parameters ----------
export function parseParams(lines, overrides, errors) {
  const params = [];
  const vars = {}; const groups = {};
  let size = null;
  lines.forEach((raw, i) => {
    const line = stripComment(raw);
    if (!/^\s*param\b/.test(line)) return;
    lines[i] = '';
    const m = /^\s*param\s+([a-z_][a-z0-9_]*)\s+(enum|select|int|float|color)\b(.*)$/i.exec(line);
    if (!m) { errors.push({ line: i + 1, level: 'error', msg: 'param NAME enum A B C = B | int MIN..MAX = V | float MIN..MAX = V | color = #hex  ["label"]' }); return; }
    const [, name, type0, rest] = m; const type = type0 === 'select' ? 'enum' : type0;
    // split at the first '=' outside quotes
    let eq = -1, q = false;
    for (let k = 0; k < rest.length; k++) { if (rest[k] === '"') q = !q; else if (rest[k] === '=' && !q) { eq = k; break; } }
    let opts = eq >= 0 ? rest.slice(0, eq) : rest; const def = eq >= 0 ? rest.slice(eq + 1) : '';
    let dt = qtoks(def); let label = null;
    if (dt.length > 1 && /^"/.test(dt[dt.length - 1])) { label = unq(dt.pop()); }
    else if (!def && /"[^"]*"\s*$/.test(opts) && type !== 'enum') { const qq = /"([^"]*)"\s*$/.exec(opts); label = qq[1]; opts = opts.slice(0, qq.index); }
    const P = { name, type, label: label || name.replace(/_/g, ' '), line: i + 1 };
    if (params.some((p) => p.name === name)) errors.push({ line: i + 1, level: 'error', msg: `Duplicate param "${name}"` });
    if (type === 'enum') {
      // options, possibly grouped: women(XS S M) men(S M L)
      const opt = []; P.groups = [];
      const re = /([a-z_][a-z0-9_]*)\(([^)]*)\)|"[^"]*"|\S+/gi; let mm;
      while ((mm = re.exec(opts))) {
        if (mm[1]) { const g = mm[1]; const os = qtoks(mm[2]).map((o) => `${g}.${unq(o)}`); P.groups.push({ name: g, options: os }); groups[g] = os; opt.push(...os); }
        else opt.push(unq(mm[0]));
      }
      P.options = opt;
      if (opt.length < 2) errors.push({ line: i + 1, level: 'error', msg: 'enum needs at least two options: param size enum S M L = M' });
      P.default = dt[0] !== undefined ? unq(dt[0]) : opt[0];
      if (!opt.includes(P.default)) { errors.push({ line: i + 1, level: 'error', msg: `Default "${P.default}" isn't one of ${opt.join(', ')}` }); P.default = opt[0]; }
    } else if (type === 'color') {
      P.default = dt[0] || '#b89b72'; if (!isHex(P.default)) errors.push({ line: i + 1, level: 'error', msg: 'color default must be #rrggbb' });
    } else {
      const r = /^\s*(-?[\d.]+)\s*\.\.\s*(-?[\d.]+)\s*$/.exec(opts);
      if (opts.trim() && !r) errors.push({ line: i + 1, level: 'error', msg: `Range format is MIN..MAX, e.g. param ${name} ${type} 10..40 = 20` });
      if (r) { P.min = +r[1]; P.max = +r[2]; }
      let d = dt[0];
      if (d !== undefined && /\//.test(d) && size) { // per-size default
        const vals = splitList(d);
        if (vals.length !== size.options.length) errors.push({ line: i + 1, level: 'error', msg: `"${d}" has ${vals.length} values but ${size.name} has ${size.options.length} options` });
        d = vals[size.options.indexOf(size.value)] ?? vals[vals.length - 1];
      }
      P.default = d !== undefined ? +d : (P.min ?? 0);
      if (!isFinite(P.default)) { errors.push({ line: i + 1, level: 'error', msg: `${name} needs a numeric default` }); P.default = 0; }
    }
    let v = overrides && overrides[name] !== undefined ? overrides[name] : P.default;
    if (type === 'enum' && !P.options.includes(v)) {
      // a bare option of a family (M) picks the first family that has it
      const hit = P.options.find((o) => o.endsWith('.' + v)); v = hit || P.default;
    }
    if (type === 'color' && !isHex(v)) v = P.default;
    if (type === 'int' || type === 'float') { v = +v; if (!isFinite(v)) v = P.default; if (P.min !== undefined) v = Math.min(P.max, Math.max(P.min, v)); if (type === 'int') v = Math.round(v); }
    P.value = v; params.push(P); vars[name] = v;
    if (type === 'enum' && (!size || (name === 'size' && size.name !== 'size'))) size = P;
  });
  const sizeIdx = size ? size.options.indexOf(size.value) : -1;
  if (size) vars.size_index = sizeIdx;
  return { params, vars, groups, size, sizeIdx };
}

function splitList(s) { return s.replace(/\/\//g, '/').split('/'); }

// ---------- Per-size lists ----------
// A list is numbers (with an optional unit) joined by '/', or '//' between size groups. It may follow a stitch word in a
// written row (k3/4/5) or ")x". Nothing inside ${…} is touched.
const LIST_RE = /(^|[\s=:(*|"+,[\]-]|\)x|\b[a-z]+)((?:\d*\.?\d+(?:in|cm|%)?)(?:\/\/?\d*\.?\d+(?:in|cm|%)?)+)(?=$|[\s;)*|"\],:+]|\.\.|in\b|x\d)/gi;
export function expandSizes(text, ctx, line, errors) {
  // protect ${…}
  const parts = []; let i = 0;
  while (i < text.length) {
    const j = text.indexOf('${', i);
    if (j < 0) { parts.push([text.slice(i), true]); break; }
    parts.push([text.slice(i, j), true]);
    let d = 0, k = j + 1; for (; k < text.length; k++) { if (text[k] === '{') d++; else if (text[k] === '}') { d--; if (!d) break; } }
    parts.push([text.slice(j, k + 1), false]); i = k + 1;
  }
  return parts.map(([s, doIt]) => !doIt ? s : s.replace(LIST_RE, (m0, pre, list) => {
    // crosses: c1/1f, c2/2b, c1/1/1b(...) are words, not lists
    if (/^c$/i.test(pre) || /^(lt|rt)$/i.test(pre)) return m0;
    const vals = splitList(list);
    if (!ctx.size) { errors.push({ line, level: 'error', msg: `Per-size list "${list}" needs a size param, e.g. param size enum ${vals.map((_, k) => 'S' + (k + 1)).join(' ')}` }); return pre + vals[0]; }
    const n = ctx.size.options.length;
    if (vals.length !== n) errors.push({ line, level: 'error', msg: `"${list}" has ${vals.length} values but ${ctx.size.name} has ${n} options (${ctx.size.options.join(', ')})` });
    if (/\/\//.test(list) && ctx.size.groups && ctx.size.groups.length) {
      const gs = list.split('//').map((g) => g.split('/').length); const want = ctx.size.groups.map((g) => g.options.length);
      if (gs.join() !== want.join()) errors.push({ line, level: 'error', msg: `"${list}": size groups have ${gs.join('+')} values, expected ${want.join('+')}` });
    }
    const unit = (/(in|cm|%)$/.exec(vals[vals.length - 1]) || [''])[0];
    let v = vals[ctx.sizeIdx] ?? vals[vals.length - 1]; if (unit && !/(in|cm|%)$/.test(v)) v += unit;
    return pre + v;
  })).join('');
}

// ---------- Statements ----------
/** Split one source line into statements on ';', keeping quotes and ${…} intact; '{' and '}' become statements. */
function splitLine(s) {
  const out = []; let cur = '', q = false, d = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"') { q = !q; cur += ch; continue; }
    if (!q && ch === '$' && s[i + 1] === '{') { d++; cur += '${'; i++; continue; }
    if (!q && d && ch === '{') { d++; cur += ch; continue; }
    if (!q && d && ch === '}') { d--; cur += ch; continue; }
    if (!q && !d && (ch === '{' || ch === '}' || ch === ';')) { out.push(cur); if (ch !== ';') out.push(ch); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map((t) => t.trim()).filter(Boolean);
}

const BLOCK_END = new Set(['piece', 'assemble', 'stitch', 'chart']);
const TOP_KW = new Set(['piece', 'assemble', 'cut', 'stitch', 'chart', 'pattern', 'source', 'gauge', 'param', 'finish', 'key']);

/** Build the statement tree. Each node: {line, text} or {line, text, kind:'block', body:[…]} for `{ }` and `end` blocks;
 * charts keep their raw lines. */
export function tree(lines, errors) {
  const flat = [];
  lines.forEach((raw, i) => {
    const s = stripComment(raw);
    splitLine(s).forEach((text) => flat.push({ line: i + 1, text, raw }));
  });
  let i = 0;
  const kw = (st) => st && st.text.split(/\s+/)[0];
  function block(close) {
    const body = [];
    while (i < flat.length) {
      const st = flat[i]; const k = kw(st);
      if (st.text === '}') { if (close === '}') { i++; return body; } errors.push({ line: st.line, level: 'error', msg: 'Unexpected "}"' }); i++; continue; }
      if (k === 'end' && st.text === 'end') { if (close === 'end') { i++; return body; } errors.push({ line: st.line, level: 'error', msg: 'Unexpected "end"' }); i++; continue; }
      if (close === 'end' && (k === 'piece' || k === 'assemble') ) { errors.push({ line: st.line, level: 'error', msg: `Missing "end" before "${k}"` }); return body; }
      i++;
      if (st.text === '{') { errors.push({ line: st.line, level: 'error', msg: 'Unexpected "{"' }); continue; }
      const node = { line: st.line, text: st.text };
      if ((k === 'chart' || k === 'stitch') && close !== 'chartbody') {
        // raw body lines up to a line that is just `end`
        node.kind = 'def'; node.lines = [];
        let ln = st.line; // the header's line; body starts on the following source line
        // skip any statements on the header's own line (none expected)
        while (i < flat.length && flat[i].line === ln) i++;
        let j = ln; // 1-based line index → lines[j] is the next line
        for (; j < lines.length; j++) {
          const t = stripComment(lines[j]).trim();
          if (t === 'end') break;
          if (t) node.lines.push({ line: j + 1, text: t });
        }
        if (j >= lines.length) errors.push({ line: st.line, level: 'error', msg: `Missing "end" for ${k}` });
        while (i < flat.length && flat[i].line <= j + 1) i++;
        body.push(node); continue;
      }
      if (flat[i] && flat[i].text === '{' ) {
        i++; node.kind = 'block'; node.body = block('}');
        // `} else …` and `else` on the next line
        while (kw(flat[i]) === 'else') {
          const e = flat[i]; i++;
          const enode = { line: e.line, text: e.text, kind: 'block' };
          if (flat[i] && flat[i].text === '{') { i++; enode.body = block('}'); } else { errors.push({ line: e.line, level: 'error', msg: 'Expected "{" after else' }); enode.body = []; }
          (node.elses = node.elses || []).push(enode);
        }
        body.push(node); continue;
      }
      if (k === 'piece' || k === 'assemble') {
        if (k === 'piece' && /\slike\s/.test(' ' + st.text + ' ')) {
          // a body only if an `end` comes before the next piece/assemble/cut or the end of the enclosing block
          let depth = 0, hasBody = false;
          for (let j = i; j < flat.length; j++) {
            const t = flat[j].text, kk = kw(flat[j]);
            if (t === '{') depth++;
            else if (t === '}') { if (!depth) break; depth--; }
            else if (!depth && t === 'end') { hasBody = true; break; }
            else if (!depth && (kk === 'piece' || kk === 'assemble' || kk === 'cut' || kk === 'stitch' || kk === 'chart' || kk === 'define' || kk === 'for')) break;
          }
          // no `end`, but piece statements follow: take them (block reports the missing end)
          const nk = kw(flat[i]);
          if (!hasBody && flat[i] && flat[i].text !== '}' && nk && !TOP_KW.has(nk) && nk !== 'end') hasBody = true;
          node.kind = 'piece'; node.body = hasBody ? block('end') : [];
        } else { node.kind = k; node.body = block('end'); }
        body.push(node); continue;
      }
      body.push(node);
    }
    if (close) errors.push({ line: flat.length ? flat[flat.length - 1].line : 1, level: 'error', msg: `Missing "${close}"` });
    return body;
  }
  return block(null);
}

export { qtoks, unq, TOP_KW, BLOCK_END };
