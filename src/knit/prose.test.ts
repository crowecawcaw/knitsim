import { describe, expect, it } from 'vitest';
import { runPattern } from '.';
import { EXAMPLES } from './examples';
import { edgeText, splitComment, toProse, type ProseStep } from './prose';
import { stopsOf } from '../components/WrittenPattern';

const src = (k: string) => EXAMPLES.find((e) => e.key === k)!.src;
const flat = (steps: ProseStep[]): ProseStep[] => steps.flatMap((s) => [s, ...flat(s.steps ?? [])]);

describe('written pattern', () => {
  it('writes every example without throwing', () => {
    for (const ex of EXAMPLES) {
      const p = toProse(runPattern(ex.src, {}), ex.src);
      expect(p.sections.length).toBeGreaterThan(0);
      expect(p.finishing.at(-1)?.text).toBe('Weave in all ends.');
    }
  });

  it('merges runs of rows and spells out the crown', () => {
    const code = src('hat');
    const p = toProse(runPattern(code, { size: '16in' }), code);
    const steps = flat(p.sections[0].steps);
    expect(steps[0].text).toMatch(/^Cast on 64 sts\. Join to work in the round/);
    expect(steps[1]).toMatchObject({ label: 'Rnds 1–30', count: '64 sts' });
    expect(steps[1].text).toBe('Work in k6, p2 rib until work measures 6in from the beginning.');
    expect(steps.some((s) => s.text === '*k6, k2tog; rep from * to end.')).toBe(true);
    expect(steps.at(-1)!.text).toMatch(/remaining 4 sts/);
  });

  it('folds repeat blocks and keeps statements inside them', () => {
    const code = src('blanket');
    const steps = toProse(runPattern(code, {}), code).sections[0].steps;
    const rep = steps.find((s) => s.kind === 'repeat')!;
    expect(rep.text).toBe('Work the following 20 rows 10 times in all:');
    expect(rep.steps!.map((s) => s.text)[0]).toBe('Change to the garter stripes yarn.');
  });

  it('describes shaping and seams', () => {
    const code = src('sweater');
    const p = toProse(runPattern(code, {}), code);
    const back = flat(p.sections.find((s) => s.piece === 'back')!.steps);
    expect(back.some((s) => /decreasing 1 st at each neck edge/.test(s.text) && s.count === '16 sts each side')).toBe(true);
    expect(p.sections.find((s) => s.piece === 'sleeve_l')!.like).toBe('right sleeve');
    expect(p.finishing.map((s) => s.text)).toContain('Sew the right sleeve seam, joining its left and right edges.');
  });

  it('reads comments and edges', () => {
    expect(splitComment('yarn #aabbcc   # main colour')).toEqual({ code: 'yarn #aabbcc', comment: 'main colour' });
    expect(edgeText('~front.left[start:underarm]')).toBe('front left edge (cast-on to underarm marker)');
  });

  it('lists every step that has a place in a piece', () => {
    const code = src('sweater');
    const stops = stopsOf(toProse(runPattern(code, {}), code));
    expect(stops[0]).toMatchObject({ piece: 'back', row: 0 });
    expect(new Set(stops.map((s) => s.id)).size).toBe(stops.length);
    expect(stops.some((s) => s.piece === 'neckband')).toBe(true);
  });
});
