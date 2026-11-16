// @ts-nocheck -- engine internals are loosely typed; the public shapes are in ../types.ts
// Expressions inside ${…} and `if`: numbers, strings, + - * / %, comparisons, && || !, ?:, functions, `x in A B C`.

const FN = {
  round: Math.round, ceil: Math.ceil, floor: Math.floor, min: Math.min, max: Math.max, abs: Math.abs,
  even: (x) => 2 * Math.round(x / 2), odd: (x) => 2 * Math.floor(x / 2) + 1, mult: (x, m) => m * Math.round(x / m),
};

export class UnknownName extends Error {
  constructor(name) { super(`unknown name "${name}"`); this.name0 = name; }
}

/** Evaluate an expression. `vars` maps names to numbers or strings. `groups` maps an option-group name to its options
 * (for `size in women`). */
export function evalExpr(expr, vars, groups = {}) {
  let i = 0; const s = expr;
  const ws = () => { while (i < s.length && /\s/.test(s[i])) i++; };
  const peek = (re) => re.exec(s.slice(i));
  function word() {
    ws();
    const q = /^"([^"]*)"/.exec(s.slice(i)); if (q) { i += q[0].length; return q[1]; }
    const w = /^[^\s()&|!=<>?:,]+/.exec(s.slice(i)); if (w) { i += w[0].length; return w[0]; }
    return null;
  }
  function prim() {
    ws();
    if (s[i] === '(') { i++; const v = tern(); ws(); if (s[i] !== ')') throw new Error('missing )'); i++; return v; }
    if (s[i] === '-') { i++; return -prim(); }
    if (s[i] === '!') { i++; return prim() ? 0 : 1; }
    const num = peek(/^\d*\.?\d+/); if (num) { i += num[0].length; return +num[0]; }
    const str = peek(/^"([^"]*)"/); if (str) { i += str[0].length; return str[1]; }
    const id = peek(/^[a-z_][a-z0-9_.]*/i);
    if (id) {
      i += id[0].length; ws();
      const name = id[0];
      if (s[i] === '(') {
        i++; const args = []; ws();
        if (s[i] !== ')') { args.push(tern()); ws(); while (s[i] === ',') { i++; args.push(tern()); ws(); } }
        if (s[i] !== ')') throw new Error('missing )'); i++;
        if (name === 'pick') { const k = args[0]; return args[1 + k]; }
        if (!FN[name]) throw new Error(`unknown function ${name}()`);
        return FN[name](...args);
      }
      if (!(name in vars)) throw new UnknownName(name);
      const v = vars[name];
      return typeof v === 'string' && /^-?\d*\.?\d+$/.test(v) ? +v : v;
    }
    throw new Error(`can't read "${s.slice(i, i + 8)}"`);
  }
  function mul() { let v = prim(); for (;;) { ws(); const c = s[i]; if ((c === '*' || c === '/' || c === '%') && s[i + 1] !== '/') { i++; const r = prim(); v = c === '*' ? v * r : c === '/' ? v / r : v % r; } else return v; } }
  function add() { let v = mul(); for (;;) { ws(); const c = s[i]; if (c === '+' || (c === '-' && !/^-\s*$/.test(s.slice(i)))) { i++; const r = mul(); v = c === '+' ? (typeof v === 'string' || typeof r === 'string' ? '' + v + r : v + r) : v - r; } else return v; } }
  function cmp() {
    let v = add(); ws();
    if (/^in\b/.test(s.slice(i))) {
      i += 2; const opts = [];
      for (;;) { ws(); if (i >= s.length || /^(&&|\|\||\)|\?|:)/.test(s.slice(i))) break; const w = word(); if (w === null) break; opts.push(w); }
      const sv = String(v);
      const hit = opts.some((o) => o === sv || (groups[o] && groups[o].includes(sv)) || sv.endsWith('.' + o));
      return hit ? 1 : 0;
    }
    const m = /^(==|!=|>=|<=|>|<)/.exec(s.slice(i));
    if (m) {
      i += m[0].length; let r;
      // a bare word on the right of == / != is a string (if size == M)
      ws(); const save = i;
      try { r = add(); } catch (e) { if (e instanceof UnknownName) { i = save; r = word(); } else throw e; }
      const a = typeof v === 'number' && typeof r === 'string' && /^-?[\d.]+$/.test(r) ? v : v;
      v = { '==': a == r, '!=': a != r, '>=': a >= r, '<=': a <= r, '>': a > r, '<': a < r }[m[0]] ? 1 : 0;
    }
    return v;
  }
  function and() { let v = cmp(); for (;;) { ws(); if (s.startsWith('&&', i)) { i += 2; const r = cmp(); v = v && r ? 1 : 0; } else return v; } }
  function or() { let v = and(); for (;;) { ws(); if (s.startsWith('||', i)) { i += 2; const r = and(); v = v || r ? 1 : 0; } else return v; } }
  function tern() { const c = or(); ws(); if (s[i] === '?') { i++; const a = tern(); ws(); if (s[i] !== ':') throw new Error('missing : in ?:'); i++; const b = tern(); return c ? a : b; } return c; }
  const v = tern(); ws(); if (i < s.length) throw new Error(`unexpected "${s.slice(i)}"`);
  return v;
}

export const fmtNum = (v) => typeof v === 'number' ? (Number.isInteger(v) ? String(v) : String(Math.round(v * 10000) / 10000)) : String(v);

/** Replace every ${…} in text. Unknown names throw UnknownName unless `keepUnknown`, which leaves that ${…} as it is. */
export function expandVars(text, vars, groups, keepUnknown = false) {
  let out = '', i = 0;
  while (i < text.length) {
    const j = text.indexOf('${', i);
    if (j < 0) { out += text.slice(i); break; }
    out += text.slice(i, j);
    let depth = 0, k = j + 1;
    for (; k < text.length; k++) { if (text[k] === '{') depth++; else if (text[k] === '}') { depth--; if (!depth) break; } }
    const inner = text.slice(j + 2, k);
    try { out += fmtNum(evalExpr(inner, vars, groups)); }
    catch (e) { if (keepUnknown && e instanceof UnknownName) out += text.slice(j, k + 1); else { e.expr = inner; throw e; } }
    i = k + 1;
  }
  return out;
}
