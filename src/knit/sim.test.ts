/// <reference types="node" />
import { readFileSync } from 'node:fs';
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
  it.each(['hat', 'blanket'])('Wasm and JS agree during assembly and a tug on the %s', name => {
    const module = new WebAssembly.Module(readFileSync(new URL('./cloth.wasm', import.meta.url)));
    const doc = runPattern(example(name), {});
    const reference = makeSim(doc), accelerated = makeSim(doc, module);
    for (const sim of [reference, accelerated]) {
      for (let i = 0; i < 240; i++) sim.step(1 / 60);
      const grab = sim.startGrab(0)!;
      grab.target[1] += 2;
      sim.step(1 / 60);
      sim.endGrab();
      sim.step(1 / 60);
    }
    expect(accelerated.pos).toEqual(reference.pos);
    accelerated.reset();
    reference.reset();
    expect(accelerated.pos).toEqual(reference.pos);
  }, 30000);

  it('the two layers of a folded cowl do not pass through each other', () => {
    const sim: any = makeSim(runPattern(example('cowl'), {}));
    for (let t = 0; t < sim.settleT; t += 1 / 60) sim.step(1 / 60, { assembleT: t });
    expect(minLayerGap(sim)).toBeGreaterThan(0.3);
  }, 30000);
});
