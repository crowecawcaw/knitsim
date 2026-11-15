// Usage: npx tsx scripts/knit-check.ts FILE.knit [name=value ...]
// Parses, builds and checks a pattern; prints errors, checks and per-piece stitch counts.
import { readFileSync } from 'node:fs';
import { runPattern } from '../src/knit';

const [file, ...overrides] = process.argv.slice(2);
if (!file) { console.error('usage: knit-check FILE.knit [param=value ...]'); process.exit(2); }
const params: Record<string, string | number> = {};
for (const o of overrides) { const [k, v] = o.split('='); params[k] = isNaN(+v) ? v : +v; }
const doc = runPattern(readFileSync(file, 'utf8'), params);

console.log(`# ${doc.name}${doc.source ? '  <' + doc.source + '>' : ''}`);
for (const e of doc.errors) console.log(`${e.level.toUpperCase()} line ${e.line}: ${e.msg}`);
for (const p of doc.built.order) {
  const counts = p.rows.map((r: { stitches?: unknown[]; count?: number }) => r.count ?? r.stitches?.length ?? '?');
  console.log(`piece ${p.name}: ${p.nrows} rows, ${p.total} sts total, cast-on ${counts[0]}, last row ${counts[counts.length - 1]}`);
}
for (const c of doc.checks) console.log(`${c.ok ? 'ok  ' : 'FAIL'} ${c.text}`);
const bad = doc.errors.some((e) => e.level === 'error') || doc.checks.some((c) => !c.ok);
process.exit(bad ? 1 : 0);
