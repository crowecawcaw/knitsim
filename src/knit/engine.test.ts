import { describe, expect, it } from 'vitest';
import { runPattern } from '.';

const run = (body: string, params = {}) => runPattern(`gauge 20 sts x 28 rows = 4 in\n${body}`, params);
const failures = (doc: ReturnType<typeof run>) => [
  ...doc.errors.filter((e) => e.level === 'error').map((e) => e.msg),
  ...doc.checks.filter((c) => !c.ok).map((c) => c.text),
];

describe('shaping counts', () => {
  it('inc edges N / dec edges N honour N', () => {
    const doc = run('piece p\n  cast_on 20\n  row st inc edges 3 ; expect 26\n  row st dec edges 2 ; expect 22\nend');
    expect(failures(doc)).toEqual([]);
  });
  it('dec neck N honours N', () => {
    const doc = run('piece p\n  cast_on 30\n  row st bind_off center 10 ; expect 10 10\n  row st dec neck 2 ; expect 8 8\nend');
    expect(failures(doc)).toEqual([]);
  });
});

describe('expressions', () => {
  it('allows comparisons and ?: inside parentheses and function args', () => {
    const doc = run('param w int 1..9 = 4\npiece p\n  cast_on ${(w > 3 ? 20 : 10) + max(w == 4 ? 2 : 0, 1)}\n  expect 22\nend');
    expect(failures(doc)).toEqual([]);
  });
  it('expands per-size lists inside fabric:count', () => {
    const doc = run('param size enum S M = M\npiece p\n  cast_on 30\n  row garter:4/6 st garter:4/6\nend');
    expect(failures(doc)).toEqual([]);
  });
});
