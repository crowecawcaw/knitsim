import { describe, expect, it } from 'vitest';
import { EXAMPLES } from './examples';
import { makeSim, runPattern } from '.';

const example = (k: string) => EXAMPLES.find((e) => e.key === k)!.src;

/* eslint-disable @typescript-eslint/no-explicit-any */
function settled(key: string) {
  const sim: any = makeSim(runPattern(example(key), {}));
  for (let t = 0; t < sim.settleT; t += 1 / 60) sim.step(1 / 60, { assembleT: t });
  return sim;
}

/** Closest approach between cloth points that are not neighbours in the knitted fabric. */
function minLayerGap(sim: any) {
  const P = sim.pos; let m = Infinity;
  for (let i = 0; i < sim.N; i++) for (let j = i + 1; j < sim.N; j++) {
    if (sim.restNear(i, j)) continue;
    m = Math.min(m, Math.hypot(P[i * 3] - P[j * 3], P[i * 3 + 1] - P[j * 3 + 1], P[i * 3 + 2] - P[j * 3 + 2]));
  }
  return m;
}

/** Does the segment p→q pass through triangle t? */
function pierces(P: Float32Array, p: number, q: number, t: number[]) {
  const ax = P[t[0] * 3], ay = P[t[0] * 3 + 1], az = P[t[0] * 3 + 2];
  const e1x = P[t[1] * 3] - ax, e1y = P[t[1] * 3 + 1] - ay, e1z = P[t[1] * 3 + 2] - az;
  const e2x = P[t[2] * 3] - ax, e2y = P[t[2] * 3 + 1] - ay, e2z = P[t[2] * 3 + 2] - az;
  const dx = P[q * 3] - P[p * 3], dy = P[q * 3 + 1] - P[p * 3 + 1], dz = P[q * 3 + 2] - P[p * 3 + 2];
  const hx = dy * e2z - dz * e2y, hy = dz * e2x - dx * e2z, hz = dx * e2y - dy * e2x;
  const det = e1x * hx + e1y * hy + e1z * hz; if (Math.abs(det) < 1e-12) return false;
  const f = 1 / det; const sx = P[p * 3] - ax, sy = P[p * 3 + 1] - ay, sz = P[p * 3 + 2] - az;
  const u = f * (sx * hx + sy * hy + sz * hz); if (u < 0.001 || u > 0.999) return false;
  const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
  const v = f * (dx * qx + dy * qy + dz * qz); if (v < 0.001 || u + v > 0.999) return false;
  const w = f * (e2x * qx + e2y * qy + e2z * qz); return w > 0.001 && w < 0.999;
}

/** Pairs of triangles that cut through each other, away from seams and from their own neighbourhood. */
function crossings(sim: any) {
  const P: Float32Array = sim.pos; const T: number[][] = [];
  sim.parts.forEach((p: any) => { for (let i = 0; i < p.mesh.tris.length; i += 3) T.push([0, 1, 2].map((k) => p.mesh.tris[i + k] + p.offset)); });
  const c = T.map((t) => [0, 1, 2].map((q) => (P[t[0] * 3 + q] + P[t[1] * 3 + q] + P[t[2] * 3 + q]) / 3));
  let n = 0;
  for (let i = 0; i < T.length; i++) for (let j = i + 1; j < T.length; j++) {
    if (Math.abs(c[i][0] - c[j][0]) > 3 || Math.abs(c[i][1] - c[j][1]) > 3 || Math.abs(c[i][2] - c[j][2]) > 3) continue;
    const a = T[i], b = T[j]; if (a.some((v) => b.includes(v))) continue;
    let hit = false; for (let k = 0; k < 3 && !hit; k++) hit = pierces(P, a[k], a[(k + 1) % 3], b) || pierces(P, b[k], b[(k + 1) % 3], a);
    if (hit && !a.some((u) => b.some((v) => sim.restNear(u, v)))) n++;
  }
  return n;
}

describe('cloth simulation', () => {
  it('the two layers of a folded cowl do not pass through each other', () => {
    const sim = settled('cowl');
    expect(minLayerGap(sim)).toBeGreaterThan(0.3);
    expect(crossings(sim)).toBe(0);
  }, 60000);

  it('a scarf wrapped round the neck does not cut through itself', () => {
    expect(crossings(settled('scarf'))).toBe(0);
  }, 60000);

  it('sewn edges of a sweater end up lying on each other, and its pieces stay out of each other', () => {
    const sim = settled('sweater');
    const gap = sim.edgeGap();
    expect(gap.mean).toBeLessThan(0.05);
    expect(gap.max).toBeLessThan(0.25);
    expect(crossings(sim)).toBe(0);
  }, 90000);
});
