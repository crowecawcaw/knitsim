// Real yarn: every stitch is drawn as a 3D loop of plied yarn riding on the simulated cloth.
//
// The cloth sim stays coarse (one particle per ~0.75″), so each stitch gets its own frame
// (centre, one-stitch-wide and one-row-high tangents) by bilinear interpolation over the
// cloth grid, recomputed on the CPU whenever the cloth moves. The GPU then bends one shared
// tube template into a knit loop per stitch (instancing), so ~15k stitches cost one draw call
// per piece. Ply twist, fibres and sheen are shading only.
import * as THREE from 'three';
import type { Piece } from '../knit';
import { rowExtents } from '../draw/stitches';

/* eslint-disable @typescript-eslint/no-explicit-any */
interface MeshLike { local: { x: number; y: number }[]; nx: number; ny: number; cs: number; cr: number; x0: number; y0: number; band?: boolean }

const TEMPLATES = { hi: [20, 6], lo: [10, 4] } as const;
export type YarnLod = 'off' | keyof typeof TEMPLATES;

function template(segs: number, radial: number) {
  const g = new THREE.InstancedBufferGeometry();
  const sp: number[] = [], idx: number[] = [];
  for (let i = 0; i <= segs; i++) for (let j = 0; j <= radial; j++) sp.push(i / segs, (j / radial) * Math.PI * 2);
  for (let i = 0; i < segs; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  g.setAttribute('sp', new THREE.Float32BufferAttribute(sp, 2));
  // three wants a position attribute to size draws; the vertex shader ignores it
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array((sp.length / 2) * 3), 3));
  g.setIndex(idx);
  return g;
}

const VERT_HEAD = /* glsl */ `
attribute vec2 sp;
attribute vec3 iP; attribute vec3 iU; attribute vec3 iV; attribute vec3 iC; attribute vec4 iK;
uniform float uH; uniform float uD; uniform float uR; uniform vec3 uSel;
varying vec3 vYCol; varying vec2 vSP; varying vec3 vTanV;
// one knit loop in stitch-local units: x in stitch widths, y in rows, z (depth) in stitch widths.
// It starts and ends low and behind (the sinker loops joining the neighbours), comes forward
// as two legs that make the V, and goes back over the top (the head the next row pulls through).
vec3 loopL(float s) {
  float a = 6.2831853 * s;
  float bo = step(0.5, iK.z);
  float h = mix(uH, uH * 0.42, bo);
  float x = s - 0.5 + 0.24 * sin(2.0 * a);
  float y = -h * cos(a);
  x += iK.y * 0.2 * (y / h + 1.0) * 0.5;
  float z = -uD * cos(2.0 * a) * iK.x * mix(1.0, 0.5, bo);
  return vec3(x, y + bo * 0.1, z);
}
`;

const VERT_BODY = /* glsl */ `
  vec3 yN = normalize(cross(iU, iV));
  float yLs = length(iU);
  #define TOW(l) (iP + iU * (l).x + iV * (l).y + yN * ((l).z * yLs))
  vec3 yC = TOW(loopL(sp.x));
  vec3 yT = normalize(TOW(loopL(sp.x + 0.01)) - TOW(loopL(sp.x - 0.01)));
  vec3 yB1 = cross(yT, yN);
  if (dot(yB1, yB1) < 1e-8) yB1 = cross(yT, normalize(iV));
  yB1 = normalize(yB1);
  vec3 yB2 = cross(yT, yB1);
  vec3 yNrm = cos(sp.y) * yB1 + sin(sp.y) * yB2;
  vec3 yPos = iK.w < 0.5 ? iP : yC + yNrm * (uR * yLs);
  vYCol = iK.w > 1.5 ? mix(iC, uSel, 0.6) : iC;
  vSP = sp;
  vTanV = normalize((viewMatrix * vec4(yT, 0.0)).xyz);
  vec3 objectNormal = yNrm;
`;

const FRAG_HEAD = /* glsl */ `
uniform vec3 uKey; uniform float uTw;
varying vec3 vYCol; varying vec2 vSP; varying vec3 vTanV;
float yHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
`;

export function yarnMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 });
  const uniforms = {
    uH: { value: 0.74 }, uD: { value: 0.2 }, uR: { value: 0.17 }, uTw: { value: 7.0 },
    uSel: { value: new THREE.Color(0x8a6fd1) }, uKey: { value: new THREE.Vector3(20, 60, 35).normalize() },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = VERT_HEAD + sh.vertexShader
      .replace('#include <beginnormal_vertex>', VERT_BODY)
      .replace('#include <begin_vertex>', 'vec3 transformed = yPos;');
    sh.fragmentShader = FRAG_HEAD + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        // three plies twisting along the yarn, each made of fine fibres
        float yPh = vSP.y * (3.0 / 6.2831853) + vSP.x * uTw;
        float yF = fract(yPh);
        float yGroove = smoothstep(0.0, 0.2, yF) * smoothstep(1.0, 0.8, yF);
        float yFib = yHash(vec2(floor(yPh * 9.0 + vSP.y * 2.0), floor(vSP.x * 90.0)));
        diffuseColor.rgb *= vYCol * mix(0.5, 1.0, yGroove) * (0.88 + 0.16 * yFib);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = normalize(normal + vTanV * (0.5 - yF) * 0.9);`)
      .replace('#include <opaque_fragment>', `
        {
          vec3 yV = normalize(vViewPosition);
          vec3 yL = normalize((viewMatrix * vec4(uKey, 0.0)).xyz);
          // fibres lie along the twisted plies, not the yarn: anisotropic (Kajiya-Kay) sheen
          vec3 yTf = normalize(vTanV + 0.55 * cross(normal, vTanV));
          float yTH = dot(yTf, normalize(yL + yV));
          float ySpec = pow(sqrt(max(0.0, 1.0 - yTH * yTH)), 28.0) * 0.08 * yGroove * max(dot(normal, yL), 0.0);
          // loose fibres catch light at grazing angles: a soft halo
          float yRim = pow(1.0 - max(dot(normal, yV), 0.0), 3.0) * 0.1;
          outgoingLight += (ySpec + yRim * yGroove) * mix(vec3(1.0), vYCol, 0.8);
        }
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'knit-yarn-v1';
  return m;
}

export class YarnPart {
  readonly meshes: Record<'hi' | 'lo', THREE.Mesh>;
  private n: number;
  private corner: Int32Array; // 4 global particle indices per stitch (-1 = missing)
  private w: Float32Array;    // fu, fv, cell width (stitch units), cell height (rows)
  private iP: THREE.InstancedBufferAttribute; private iU: THREE.InstancedBufferAttribute; private iV: THREE.InstancedBufferAttribute;
  private iK: THREE.InstancedBufferAttribute;
  private ord: Int32Array; private ids: Int32Array; private base: Float32Array; private bad: Uint8Array;
  dirty = true;

  constructor(P: Piece, mesh: MeshLike, offset: number, sg: number, rg: number, mat: THREE.Material) {
    const sts = P.rows.flatMap((r) => r.stitches);
    const n = (this.n = sts.length);
    const { nx, ny, cs, cr, x0, y0 } = mesh;
    // grid (i, j) -> particle
    const grid = new Int32Array((nx + 1) * (ny + 1)).fill(-1);
    if (mesh.band) for (let k = 0; k < grid.length; k++) grid[k] = offset + k;
    else mesh.local.forEach((l, k) => {
      const i = Math.round((l.x * sg - x0) / cs), j = Math.round((l.y * rg - y0) / cr);
      if (i >= 0 && j >= 0 && i <= nx && j <= ny) grid[j * (nx + 1) + i] = offset + k;
    });
    const rowY = (j: number) => (mesh.band ? Math.min(y0 + j * cr, P.nrows - 0.5) : y0 + j * cr);
    const ext = mesh.band ? rowExtents(P) : null;
    this.corner = new Int32Array(n * 4); this.w = new Float32Array(n * 4);
    this.ord = new Int32Array(n); this.ids = new Int32Array(n); this.base = new Float32Array(n * 4); this.bad = new Uint8Array(n);
    const col = new Float32Array(n * 3); const c = new THREE.Color();
    sts.forEach((s, k) => {
      const r = s.row;
      let j0 = Math.min(ny - 1, Math.max(0, Math.floor((r - y0) / cr)));
      while (j0 < ny - 1 && rowY(j0 + 1) <= r) j0++;
      const ch = Math.max(1e-3, rowY(j0 + 1) - rowY(j0));
      const fv = Math.min(1, Math.max(0, (r - rowY(j0)) / ch));
      let gu: number, cw: number;
      if (ext) { const e = ext[Math.max(0, Math.min(P.nrows - 1, r))]; gu = ((s.x - e.lo) / e.w) * nx; cw = e.w / nx; }
      else { gu = (s.x - x0) / cs; cw = cs; }
      const i0 = Math.min(nx - 1, Math.max(0, Math.floor(gu)));
      const fu = Math.min(1, Math.max(0, gu - i0));
      const g = (i: number, j: number) => grid[j * (nx + 1) + i];
      this.corner.set([g(i0, j0), g(i0 + 1, j0), g(i0, j0 + 1), g(i0 + 1, j0 + 1)], k * 4);
      this.w.set([fu, fv, cw, ch], k * 4);
      // off the edge of a shaped cloth: no frame to ride on
      this.bad[k] = this.corner.subarray(k * 4, k * 4 + 4).filter((v) => v < 0).length > 1 ? 1 : 0;
      c.set(s.color).convertSRGBToLinear(); col.set([c.r, c.g, c.b], k * 3);
      const bo = s.op === 'bo' ? 1 : 0;
      this.base.set([s.t === 'p' ? -1 : 1, s.lean === 'l' ? -1 : s.lean === 'r' ? 1 : 0, bo, 1], k * 4);
      this.ord[k] = s.ord; this.ids[k] = s.id;
    });
    const dyn = (a: Float32Array, sz: number) => { const b = new THREE.InstancedBufferAttribute(a, sz); b.setUsage(THREE.DynamicDrawUsage); return b; };
    this.iP = dyn(new Float32Array(n * 3), 3); this.iU = dyn(new Float32Array(n * 3), 3); this.iV = dyn(new Float32Array(n * 3), 3);
    this.iK = dyn(new Float32Array(this.base), 4);
    this.setState(null, null);
    const iC = new THREE.InstancedBufferAttribute(col, 3);
    const make = (lod: 'hi' | 'lo') => {
      const [segs, radial] = TEMPLATES[lod]; const g = template(segs, radial);
      g.setAttribute('iP', this.iP); g.setAttribute('iU', this.iU); g.setAttribute('iV', this.iV);
      g.setAttribute('iC', iC); g.setAttribute('iK', this.iK);
      g.instanceCount = n;
      const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.raycast = () => {}; m.visible = false;
      return m;
    };
    this.meshes = { hi: make('hi'), lo: make('lo') };
  }

  /** Which stitches show: unknitted ones are hidden while a piece is in progress; the picked one is tinted. */
  setState(progress: number | null, selectedId: number | null) {
    const K = this.iK.array as Float32Array;
    for (let k = 0; k < this.n; k++) {
      K[k * 4 + 3] = this.bad[k] ? 0 : progress != null && this.ord[k] >= progress ? 0 : this.ids[k] === selectedId ? 2 : 1;
    }
    this.iK.needsUpdate = true;
  }

  setLod(lod: YarnLod) { this.meshes.hi.visible = lod === 'hi'; this.meshes.lo.visible = lod === 'lo'; }

  /** Recompute each stitch's frame from the cloth particles. */
  update(pos: Float32Array) {
    const P = this.iP.array as Float32Array, U = this.iU.array as Float32Array, V = this.iV.array as Float32Array;
    const C = this.corner, W = this.w;
    const q = new Float32Array(12);
    for (let k = 0; k < this.n; k++) {
      let miss = -1, nm = 0;
      for (let c = 0; c < 4; c++) {
        const v = C[k * 4 + c];
        if (v < 0) { miss = c; nm++; continue; }
        q[c * 3] = pos[v * 3]; q[c * 3 + 1] = pos[v * 3 + 1]; q[c * 3 + 2] = pos[v * 3 + 2];
      }
      if (nm > 1) continue;
      if (nm === 1) { // complete the parallelogram from the other three corners
        const o = miss ^ 3, a = miss ^ 1, b = miss ^ 2;
        for (let d = 0; d < 3; d++) q[miss * 3 + d] = q[a * 3 + d] + q[b * 3 + d] - q[o * 3 + d];
      }
      const fu = W[k * 4], fv = W[k * 4 + 1], cw = W[k * 4 + 2], ch = W[k * 4 + 3];
      for (let d = 0; d < 3; d++) {
        const a = q[d], b = q[3 + d], c = q[6 + d], e = q[9 + d];
        P[k * 3 + d] = (a * (1 - fu) + b * fu) * (1 - fv) + (c * (1 - fu) + e * fu) * fv;
        U[k * 3 + d] = ((b - a) * (1 - fv) + (e - c) * fv) / cw;
        V[k * 3 + d] = ((c - a) * (1 - fu) + (e - b) * fu) / ch;
      }
    }
    this.iP.needsUpdate = this.iU.needsUpdate = this.iV.needsUpdate = true;
    this.dirty = false;
  }

  dispose() { this.meshes.hi.geometry.dispose(); this.meshes.lo.geometry.dispose(); }
}
