import { describe, expect, it } from 'vitest';
import { runPattern } from '.';
import { EXAMPLES } from './examples';

describe('bundled examples', () => {
  for (const ex of EXAMPLES) {
    it(`${ex.key} parses with no errors and all checks pass`, () => {
      const doc = runPattern(ex.src, {});
      expect(doc.errors.filter((e) => e.level === 'error')).toEqual([]);
      expect(doc.checks.filter((c) => !c.ok)).toEqual([]);
      expect(doc.built.order.length).toBeGreaterThan(0);
    });
  }

  it('applies per-size param overrides', () => {
    const sweater = EXAMPLES.find((e) => e.key === 'sweater')!.src;
    const s = runPattern(sweater, { size: 'S' }).built.pieces.back.rows[0].stitches.length;
    const xl = runPattern(sweater, { size: '3X' }).built.pieces.back.rows[0].stitches.length;
    expect([s, xl]).toEqual([50, 74]);
  });

  it('reports errors with line numbers', () => {
    const doc = runPattern('piece a\n  cast_on 10\n  rows 2 nonsense\nend', {});
    expect(doc.errors.some((e) => e.level === 'error' && e.line === 3)).toBe(true);
  });
});
