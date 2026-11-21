// The cloth is simulated on a coarse mesh (cells of about ¾ inch) and drawn on a fine one. Loop
// subdivision turns the coarse triangles into a smooth surface: folds become round, silhouettes lose
// their corners, and the shading has real normals to work with. Each level is a sparse matrix (a new
// vertex is a weighted mean of a few old ones), built once per mesh and applied whenever the cloth moves.
//
// Vertices sewn to each other from the start (the two ends of a tube knit in the round) are welded
// first, so the surface is smooth across that join; they keep their own uv, so the stitches still
// run 0..1 around the tube.

interface Level { n: number; start: Uint32Array; col: Uint32Array; wt: Float32Array }

export interface Subdivision {
  levels: Level[];
  /** scratch positions per level (the last one is the fine surface) */
  buf: Float32Array[];
  /** fine triangles, for normals */
  tris: Uint32Array;
  nFine: number;
  /** fine vertices on an open edge of the cloth */
  edge: Uint8Array;
  // the drawn mesh: fine vertices, split where uv is discontinuous
  nRender: number;
  fineOf: Uint32Array;
  uv: Float32Array;
  index: Uint32Array;
  /** drawn vertex → the simulated vertex it follows most closely */
  nearest: Int32Array;
  nrm: Float32Array; lap: Float32Array; cnt: Float32Array;
}

class Rows {
  start: number[] = [0]; col: number[] = []; wt: number[] = [];
  add(cols: number[], wts: number[]) { for (let i = 0; i < cols.length; i++) { this.col.push(cols[i]); this.wt.push(wts[i]); } this.start.push(this.col.length); }
  done(): Level { return { n: this.start.length - 1, start: Uint32Array.from(this.start), col: Uint32Array.from(this.col), wt: Float32Array.from(this.wt) }; }
}

/**
 * @param nVerts simulated vertices
 * @param tris   their triangles
 * @param uv     2 per vertex
 * @param rest   flat rest position per vertex, to find the true corners of a piece (kept sharp)
 * @param weld   pairs of vertices that are one point of the cloth
 */
export function buildSubdivision(nVerts: number, tris: ArrayLike<number>, uv: ArrayLike<number>, rest: { x: number; y: number }[], weld: number[], levels: number): Subdivision {
  // ---- weld ----
  const rep = new Int32Array(nVerts); for (let i = 0; i < nVerts; i++) rep[i] = i;
  const find = (i: number): number => { while (rep[i] !== i) { rep[i] = rep[rep[i]]; i = rep[i]; } return i; };
  for (let i = 0; i < weld.length; i += 2) { const a = find(weld[i]), b = find(weld[i + 1]); if (a !== b) rep[Math.max(a, b)] = Math.min(a, b); }
  const wid = new Int32Array(nVerts).fill(-1); const members: number[][] = [];
  for (let i = 0; i < nVerts; i++) { const r = find(i); if (wid[r] < 0) { wid[r] = members.length; members.push([]); } wid[i] = wid[r]; members[wid[i]].push(i); }
  const L0 = new Rows(); members.forEach((m) => L0.add(m, m.map(() => 1 / m.length)));
  const out: Level[] = [L0.done()];

  let n = members.length;
  let T = new Uint32Array(tris.length); for (let i = 0; i < tris.length; i++) T[i] = wid[tris[i]];
  let CUV = new Float32Array(tris.length * 2); for (let i = 0; i < tris.length; i++) { CUV[i * 2] = uv[tris[i] * 2]; CUV[i * 2 + 1] = uv[tris[i] * 2 + 1]; }
  let origin = Int32Array.from(members, (m) => m[0]);
  let sharp = new Uint8Array(n);
  let edgeFlag = new Uint8Array(n);

  for (let lv = 0; lv <= levels; lv++) {
    // ---- edges of this level ----
    const nT = T.length / 3;
    const eKey = new Map<number, number>(); const eA: number[] = [], eB: number[] = [], eC: number[] = [], eD: number[] = [];
    const triE = new Uint32Array(nT * 3);
    for (let t = 0; t < nT; t++) for (let k = 0; k < 3; k++) {
      const a = T[t * 3 + k], b = T[t * 3 + (k + 1) % 3], c = T[t * 3 + (k + 2) % 3];
      const key = a < b ? a * n + b : b * n + a; let e = eKey.get(key);
      if (e === undefined) { e = eA.length; eKey.set(key, e); eA.push(a); eB.push(b); eC.push(c); eD.push(-1); } else if (eD[e] < 0) eD[e] = c;
      triE[t * 3 + k] = e;
    }
    const nE = eA.length;
    // boundary neighbours per vertex
    const bN = new Int32Array(n * 2).fill(-1), bCount = new Uint8Array(n);
    for (let e = 0; e < nE; e++) if (eD[e] < 0) for (const [p, q] of [[eA[e], eB[e]], [eB[e], eA[e]]]) { if (bCount[p] < 2) bN[p * 2 + bCount[p]] = q; bCount[p]++; }
    edgeFlag = new Uint8Array(n); for (let i = 0; i < n; i++) edgeFlag[i] = bCount[i] ? 1 : 0;
    if (lv === 0) {
      // corners of the piece: where its outline turns sharply in the flat. They stay put.
      const restOf = (w: number) => rest[members[w][0]];
      for (let i = 0; i < n; i++) {
        if (bCount[i] !== 2) { if (bCount[i]) sharp[i] = 1; continue; }
        const p = restOf(i), a = restOf(bN[i * 2]), b = restOf(bN[i * 2 + 1]);
        const ux = a.x - p.x, uy = a.y - p.y, vx = b.x - p.x, vy = b.y - p.y;
        const cos = (ux * vx + uy * vy) / ((Math.hypot(ux, uy) * Math.hypot(vx, vy)) || 1);
        if (cos > -0.5) sharp[i] = 1; // turns by more than 60°
      }
    }
    if (lv === levels) break;
    // ---- one Loop step ----
    const nbr: number[][] = Array.from({ length: n }, () => []);
    for (let e = 0; e < nE; e++) { nbr[eA[e]].push(eB[e]); nbr[eB[e]].push(eA[e]); }
    const R = new Rows();
    for (let i = 0; i < n; i++) {
      if (bCount[i]) {
        if (sharp[i] || bCount[i] !== 2) R.add([i], [1]);
        else R.add([i, bN[i * 2], bN[i * 2 + 1]], [0.75, 0.125, 0.125]);
      } else {
        const k = nbr[i].length; const beta = k === 3 ? 3 / 16 : 3 / (8 * k);
        R.add([i, ...nbr[i]], [1 - k * beta, ...nbr[i].map(() => beta)]);
      }
    }
    for (let e = 0; e < nE; e++) {
      if (eD[e] < 0) R.add([eA[e], eB[e]], [0.5, 0.5]);
      else R.add([eA[e], eB[e], eC[e], eD[e]], [0.375, 0.375, 0.125, 0.125]);
    }
    out.push(R.done());
    const n2 = n + nE;
    const T2 = new Uint32Array(nT * 12), C2 = new Float32Array(nT * 24);
    const origin2 = new Int32Array(n2); origin2.set(origin); for (let e = 0; e < nE; e++) origin2[n + e] = origin[eA[e]];
    const sharp2 = new Uint8Array(n2); sharp2.set(sharp);
    for (let t = 0; t < nT; t++) {
      const v = [T[t * 3], T[t * 3 + 1], T[t * 3 + 2]], m = [n + triE[t * 3], n + triE[t * 3 + 1], n + triE[t * 3 + 2]];
      const cu = (k: number) => [CUV[(t * 3 + k) * 2], CUV[(t * 3 + k) * 2 + 1]];
      const c = [cu(0), cu(1), cu(2)]; const mu = [0, 1, 2].map((k) => [(c[k][0] + c[(k + 1) % 3][0]) / 2, (c[k][1] + c[(k + 1) % 3][1]) / 2]);
      const put = (j: number, ids: number[], uvs: number[][]) => { for (let k = 0; k < 3; k++) { T2[t * 12 + j * 3 + k] = ids[k]; C2[(t * 12 + j * 3 + k) * 2] = uvs[k][0]; C2[(t * 12 + j * 3 + k) * 2 + 1] = uvs[k][1]; } };
      put(0, [v[0], m[0], m[2]], [c[0], mu[0], mu[2]]);
      put(1, [m[0], v[1], m[1]], [mu[0], c[1], mu[1]]);
      put(2, [m[2], m[1], v[2]], [mu[2], mu[1], c[2]]);
      put(3, [m[0], m[1], m[2]], [mu[0], mu[1], mu[2]]);
    }
    T = T2; CUV = C2; n = n2; origin = origin2; sharp = sharp2;
  }

  // ---- drawn vertices: one per (fine vertex, uv) ----
  const first = new Int32Array(n).fill(-1); const next: number[] = []; const fineOf: number[] = []; const ruv: number[] = [];
  const index = new Uint32Array(T.length);
  for (let c = 0; c < T.length; c++) {
    const f = T[c], u = CUV[c * 2], v = CUV[c * 2 + 1]; let r = first[f];
    while (r >= 0 && (Math.abs(ruv[r * 2] - u) > 1e-5 || Math.abs(ruv[r * 2 + 1] - v) > 1e-5)) r = next[r];
    if (r < 0) { r = fineOf.length; fineOf.push(f); ruv.push(u, v); next.push(first[f]); first[f] = r; }
    index[c] = r;
  }
  return {
    levels: out, buf: out.map((l) => new Float32Array(l.n * 3)), tris: T, nFine: n, edge: edgeFlag,
    nRender: fineOf.length, fineOf: Uint32Array.from(fineOf), uv: Float32Array.from(ruv), index,
    nearest: Int32Array.from(fineOf, (f) => origin[f]),
    nrm: new Float32Array(n * 3), lap: new Float32Array(n * 3), cnt: new Float32Array(n),
  };
}

/**
 * Move the fine surface to follow the simulated vertices in `src`, and fill the drawn mesh's
 * position, normal and curvature (how sharply the surface folds toward its normal, in units of the
 * fine mesh's spacing: positive in a valley seen from the front).
 */
export function applySubdivision(S: Subdivision, src: ArrayLike<number>, pos: Float32Array, nrm: Float32Array, curv: Float32Array) {
  let from: ArrayLike<number> = src;
  for (let l = 0; l < S.levels.length; l++) {
    const { n, start, col, wt } = S.levels[l]; const to = S.buf[l];
    for (let i = 0; i < n; i++) {
      let x = 0, y = 0, z = 0;
      for (let k = start[i]; k < start[i + 1]; k++) { const c = col[k] * 3, w = wt[k]; x += from[c] * w; y += from[c + 1] * w; z += from[c + 2] * w; }
      to[i * 3] = x; to[i * 3 + 1] = y; to[i * 3 + 2] = z;
    }
    from = to;
  }
  const P = S.buf[S.buf.length - 1], T = S.tris, N = S.nrm, Lp = S.lap, C = S.cnt;
  N.fill(0); Lp.fill(0); C.fill(0);
  for (let t = 0; t < T.length; t += 3) {
    const a = T[t] * 3, b = T[t + 1] * 3, c = T[t + 2] * 3;
    const ax = P[a], ay = P[a + 1], az = P[a + 2], bx = P[b], by = P[b + 1], bz = P[b + 2], cx = P[c], cy = P[c + 1], cz = P[c + 2];
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    N[a] += nx; N[a + 1] += ny; N[a + 2] += nz; N[b] += nx; N[b + 1] += ny; N[b + 2] += nz; N[c] += nx; N[c + 1] += ny; N[c + 2] += nz;
    Lp[a] += bx + cx; Lp[a + 1] += by + cy; Lp[a + 2] += bz + cz;
    Lp[b] += ax + cx; Lp[b + 1] += ay + cy; Lp[b + 2] += az + cz;
    Lp[c] += ax + bx; Lp[c + 1] += ay + by; Lp[c + 2] += az + bz;
    C[a / 3] += 2; C[b / 3] += 2; C[c / 3] += 2;
  }
  for (let i = 0; i < S.nFine; i++) {
    const o = i * 3; const l = Math.hypot(N[o], N[o + 1], N[o + 2]) || 1; N[o] /= l; N[o + 1] /= l; N[o + 2] /= l;
    if (S.edge[i] || !C[i]) { C[i] = 0; continue; }
    const k = 1 / C[i]; const dx = Lp[o] * k - P[o], dy = Lp[o + 1] * k - P[o + 1], dz = Lp[o + 2] * k - P[o + 2];
    // mean edge length ≈ distance to the ring's centre for a flat ring; use the ring's own spread
    C[i] = dx * N[o] + dy * N[o + 1] + dz * N[o + 2];
  }
  const F = S.fineOf;
  for (let r = 0; r < S.nRender; r++) {
    const f = F[r] * 3, d = r * 3;
    pos[d] = P[f]; pos[d + 1] = P[f + 1]; pos[d + 2] = P[f + 2];
    nrm[d] = N[f]; nrm[d + 1] = N[f + 1]; nrm[d + 2] = N[f + 2];
    curv[r] = C[F[r]];
  }
}
