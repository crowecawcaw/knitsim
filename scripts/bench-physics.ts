// Run with npx tsx scripts/bench-physics.ts from the repository root.
import { readFileSync } from 'node:fs';
import { makeSim, runPattern } from '../src/knit';

const wasm = new WebAssembly.Module(readFileSync('src/knit/cloth.wasm'));
const steps = 240;
for (const pattern of ['sweater', 'cowl', 'hat']) {
  const doc = runPattern(readFileSync(`src/knit/examples/${pattern}.knit`, 'utf8'), {});
  const sims = [makeSim(doc), makeSim(doc, wasm)];
  const samples: number[][] = [[], []];
  for (let run = 0; run < 5; run++) {
    for (const index of run % 2 ? [1, 0] : [0, 1]) {
      const sim = sims[index];
      sim.reset();
      const start = performance.now();
      for (let i = 0; i < steps; i++) sim.step(1 / 60);
      if (run > 0) samples[index].push((performance.now() - start) / steps);
    }
  }
  const [js, accelerated] = samples.map(times => {
    times.sort((a, b) => a - b);
    return ((times[1] + times[2]) / 2).toFixed(2);
  });
  console.log(`${pattern}: JS ${js} ms/step, Wasm ${accelerated} ms/step`);
}
