import { describe, expect, it } from 'vitest';
import { EXAMPLES } from './examples';
import { makeSim, runPattern } from '.';

const example = (k: string) => EXAMPLES.find((e) => e.key === k)!.src;

/** Closest approach between cloth points that are not neighbours in the knitted fabric. */
function minLayerGap(sim: any) {
  const P = sim.pos; let m = Infinity;
  for (let i = 0; i < sim.N; i++) for (let j = i + 1; j < sim.N; j++) {
    if (sim.restNear(i, j)) continue;
    m = Math.min(m, Math.hypot(P[i * 3] - P[j * 3], P[i * 3 + 1] - P[j * 3 + 1], P[i * 3 + 2] - P[j * 3 + 2]));
  }
  return m;
}

describe('cloth simulation', () => {
  it('the two layers of a folded cowl do not pass through each other', () => {
    const sim: any = makeSim(runPattern(example('cowl'), {}));
    for (let t = 0; t < sim.settleT; t += 1 / 60) sim.step(1 / 60, { assembleT: t });
    expect(minLayerGap(sim)).toBeGreaterThan(0.3);
  }, 30000);
});
