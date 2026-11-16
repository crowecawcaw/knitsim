import { describe, expect, it } from 'vitest';
import { runPattern } from '.';

const run = (body: string, params = {}) => runPattern(`gauge 20 sts x 28 rows = 4 in\n${body}`, params);
const errors = (doc: ReturnType<typeof run>) => doc.errors.filter((e) => e.level === 'error').map((e) => e.msg);
const failures = (doc: ReturnType<typeof run>) => [...errors(doc), ...doc.checks.filter((c) => !c.ok).map((c) => c.text)];

describe('v2 written rows', () => {
  it('a | stop right after a fixed run is met', () => {
    const doc = run('piece p\n  cast_on 34\n  sections a:15 b:4 c:15\n  row "k15 | k4 | k15"\n  row "p15 | p4 | p15"\nend');
    expect(failures(doc)).toEqual([]);
  });
  it('a fabric row with no repeat repeats as a whole', () => {
    const doc = run('piece p\n  cast_on 20\n  rows 4 "p1 k4"\n  expect 20\nend');
    expect(failures(doc)).toEqual([]);
  });
});

describe('v2 sections', () => {
  it('a cable across a section boundary keeps the section counts', () => {
    const doc = run('stitch cab round\n  *k1 c1/1f(k1 k1) k1*\nend\npiece p round\n  cast_on 16\n  sections a:7 b:9\n  rows 6 cab\n  expect a=7 b=9\nend');
    expect(failures(doc)).toEqual([]);
  });
  it('fabric parts that name sections apply to those sections only', () => {
    const doc = run('piece p round\n  cast_on 20\n  sections a:10 b:10\n  rows 2 garter:b\n  expect 20\nend');
    expect(failures(doc)).toEqual([]);
  });
});

describe('v2 conditions', () => {
  it('a repeat until N sts that makes no progress stops with an error', () => {
    const doc = run('piece p\n  cast_on 20\n  repeat until 30 sts { row st }\nend');
    expect(errors(doc).some((m) => /isn't moving toward it/.test(m))).toBe(true);
  });
  it('fits measures from the end of the previous fits', () => {
    const doc = run(
      'piece a\n  cast_on 20\n  rows until 4in st\n  marker m\n  rows until 6in st\n  bind_off\nend\n' +
        'piece band\n  cast_on 6\n  rows until fits a.left[start:m] st\n  marker half\n  rows until fits a.left[m:end] st\n  bind_off\nend',
    );
    expect(failures(doc)).toEqual([]);
    const band = doc.built.pieces.band;
    // 6in at 28 rows/4in, give or take the bind-off row
    expect(Math.abs(band.rows.length - 43)).toBeLessThanOrEqual(2);
  });
});

describe('v2 joins', () => {
  it('stitch ranges accept unsigned positions', () => {
    const doc = run('piece h round\n  cast_on 20\n  rows 4 st\n  hold all as palm\nend\npiece f round\n  join h.palm[0:4] + cast_on gap:2 + h.palm[end-4:end]\n  expect 10\n  rows 2 st\n  bind_off\nend');
    expect(errors(doc)).toEqual([]);
  });
});
