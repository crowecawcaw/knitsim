// Knitted fabric drawn per pixel. The cloth mesh stays coarse; its fragment shader works out
// which stitch loops pass over each pixel (from a small per-piece stitch table), how high the
// topmost strand sits, and shades that strand as plied, fibrous yarn. Cost follows screen
// pixels, not stitch count. Fuzz is a few translucent shells floating just above the cloth.
import * as THREE from 'three';
import type { Piece } from '../knit';
import { rowExtents } from '../draw/stitches';

interface MeshLike { W: number; H: number; x0: number; y0: number; band?: boolean; graph?: boolean }

const F_EXISTS = 1, F_PURL = 2, F_LEANL = 4, F_LEANR = 8, F_BO = 16;
export const FUZZ_SHELLS = 6;

/** Per-piece stitch tables: one texel per stitch (row, index from the row's first stitch). */
export function fabricData(P: Piece) {
  const ext = rowExtents(P);
  const firsts = P.rows.map((r) => Math.min(...r.stitches.map((s) => s.x)));
  const cols = Math.max(1, ...P.rows.map((r, i) => Math.round(Math.max(...r.stitches.map((s) => s.x)) - firsts[i]) + 1));
  const st = new Float32Array(cols * P.nrows * 4);
  const rows = new Float32Array(P.nrows * 4);
  const c = new THREE.Color();
  P.rows.forEach((r, ri) => {
    rows.set([firsts[ri], ext[ri].lo, ext[ri].w, 0], ri * 4);
    r.stitches.forEach((s) => {
      const i = Math.round(s.x - firsts[ri]); const o = (ri * cols + i) * 4;
      c.set(s.color);
      const packed = Math.round(c.r * 255) * 65536 + Math.round(c.g * 255) * 256 + Math.round(c.b * 255);
      const fl = F_EXISTS | (s.t === 'p' ? F_PURL : 0) | (s.lean === 'l' ? F_LEANL : s.lean === 'r' ? F_LEANR : 0) | (s.op === 'bo' ? F_BO : 0);
      st.set([packed, fl, s.x - firsts[ri] - i, s.ord], o);
    });
  });
  const tex = (a: Float32Array, w: number, h: number) => {
    const t = new THREE.DataTexture(a, w, h, THREE.RGBAFormat, THREE.FloatType);
    t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t;
  };
  return { st: tex(st, cols, P.nrows), rows: tex(rows, P.nrows, 1), cols };
}

const COMMON = /* glsl */ `
precision highp float;
precision highp int;
uniform sampler2D uSt, uRows;
uniform int uCols, uNRows;
uniform float uBand, uW, uX0, uH, uY0, uAsp;
uniform float uProg, uSelOrd, uGraph;
varying vec2 vUv;
varying vec2 vCell;
varying vec3 vWorld;
varying vec3 vNrm;
vec3 srgb2lin(vec3 c) { return pow(c, vec3(2.2)); }
vec3 unpackCol(float p) { float r = floor(p / 65536.0); float g = floor((p - r * 65536.0) / 256.0); return srgb2lin(vec3(r, g, p - r * 65536.0 - g * 256.0) / 255.0); }
float rowF() { return uY0 + vUv.y * uH; }
float xIn(vec4 R) { return uBand > 0.5 ? R.y + vUv.x * R.z : uX0 + vUv.x * uW; }
vec4 rowT(int r) { return texelFetch(uRows, ivec2(clamp(r, 0, uNRows - 1), 0), 0); }
vec4 stT(int i, int r) { return texelFetch(uSt, ivec2(i, r), 0); }
bool shown(vec4 S) { return (int(S.g) & 1) != 0 && S.a < uProg; }
float h11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float h21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
`;

const VERT = /* glsl */ `
varying vec2 vUv; varying vec3 vWorld; varying vec3 vNrm; varying vec2 vCell;
attribute vec2 aCell;
uniform float uLift;
void main() {
  vUv = uv; vCell = aCell;
  vec4 w = modelMatrix * vec4(position + normal * uLift, 1.0);
  vWorld = w.xyz; vNrm = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

// Lights mirror the scene's, plus a cool back light so strands separate from the gaps.
const LIGHTING = /* glsl */ `
// a soft studio setup: a warm key high on the right, a dim cool fill from the left, a rim light from behind
// that picks out the silhouette and the fuzz, and a little sky / floor bounce. Linear values; the renderer
// tone-maps the result (ACES), so the key can be bright without clipping.
const vec3 L0 = vec3(0.2857, 0.8571, 0.5);   // key, matches the scene's main light
const vec3 L1 = vec3(-0.8018, 0.2673, -0.5345);
const vec3 L2 = vec3(0.3, 0.45, -0.84);
const vec3 C0 = vec3(1.0, 0.94, 0.85) * 1.55;
const vec3 C1 = vec3(0.82, 0.88, 1.0) * 0.22;
const vec3 C2 = vec3(0.85, 0.9, 1.0) * 0.55;
const vec3 SKY = vec3(0.24, 0.25, 0.27), GROUND = vec3(0.07, 0.06, 0.05);
`;

const FRAG = COMMON + LIGHTING + /* glsl */ `
uniform float uR, uD, uHgt, uTw;
uniform sampler2D uOv; uniform float uOvOn, uFirm, uContext;
uniform vec3 uSelCol;

// one knit loop, in stitch widths: starts and ends low behind the fabric (the sinker loops
// joining the neighbours), comes forward as the two legs of the V, goes back over the head.
vec3 loopP(float s, float lean, float bo, float zs) {
  float a = 6.2831853 * s;
  float h = uHgt * mix(1.0, 0.42, bo);
  float x = s - 0.5 + 0.24 * sin(2.0 * a);
  float y = -h * cos(a);
  x += lean * 0.2 * (y / h + 1.0) * 0.5;
  float z = -uD * cos(2.0 * a) * zs * mix(1.0, 0.5, bo);
  return vec3(x, (y + bo * 0.1) * uAsp, z);
}

struct Hit { float h; vec3 n; vec3 t; float s; float th; vec4 S; };

// strands of one stitch over point p: the closest point on each half of the loop
void probe(vec2 p, vec4 S, float zs, inout Hit best) {
  int fl = int(S.g);
  float lean = (fl & 4) != 0 ? -1.0 : (fl & 8) != 0 ? 1.0 : 0.0;
  float bo = (fl & 16) != 0 ? 1.0 : 0.0;
  float z0 = (fl & 2) != 0 ? -zs : zs;
  // quarters: each is nearly monotonic, so its closest point is the only one covering p
  for (int q = 0; q < 4; q++) {
    float s0 = float(q) * 0.25, bs = s0, bd = 1e9;
    for (int k = 0; k <= 4; k++) {
      float s = s0 + float(k) / 16.0;
      vec2 d = p - loopP(s, lean, bo, z0).xy; float dd = dot(d, d);
      if (dd < bd) { bd = dd; bs = s; }
    }
    // refine: two Newton steps on the squared distance
    for (int k = 0; k < 2; k++) {
      vec2 c = loopP(bs, lean, bo, z0).xy, c1 = loopP(bs + 0.004, lean, bo, z0).xy, c0 = loopP(bs - 0.004, lean, bo, z0).xy;
      vec2 d1 = (c1 - c0) / 0.008, d2 = (c1 - 2.0 * c + c0) / (0.004 * 0.004);
      vec2 e = c - p;
      float g = dot(e, d1), H = dot(d1, d1) + dot(e, d2);
      bs = clamp(bs - g / max(H, 1e-4), s0 - 0.01, s0 + 0.26);
    }
    vec3 C = loopP(bs, lean, bo, z0);
    vec2 e = p - C.xy; float d = length(e);
    if (d >= uR) continue;
    float hz = sqrt(uR * uR - d * d);
    float h = C.z + hz;
    if (h > best.h) {
      vec3 Ta = loopP(bs + 0.004, lean, bo, z0) - loopP(bs - 0.004, lean, bo, z0);
      best.h = h; best.n = normalize(vec3(e, hz)); best.t = normalize(Ta); best.s = bs; best.S = S;
      vec2 tn = normalize(Ta.xy); float side = tn.x * e.y - tn.y * e.x;
      best.th = atan(side, hz);
    }
  }
}

vec3 shade(vec3 L, vec3 C, vec3 n, vec3 V, vec3 tf, vec3 base) {
  float NdL = dot(n, L);
  float diff = max(0.0, (NdL + 0.2) / 1.2);
  diff *= diff * (3.0 - 2.0 * diff) * 0.6 + diff * 0.4; // a touch of contrast in the falloff
  vec3 H = normalize(L + V);
  float t1 = dot(normalize(tf + n * 0.12), H), t2 = dot(normalize(tf - n * 0.25), H);
  float s1 = pow(sqrt(max(0.0, 1.0 - t1 * t1)), 60.0), s2 = pow(sqrt(max(0.0, 1.0 - t2 * t2)), 14.0);
  vec3 spec = (vec3(s1) * 0.12 + base * s2 * 0.35) * smoothstep(-0.15, 0.35, NdL);
  return C * (base * diff + spec);
}

void main() {
  float zs = gl_FrontFacing ? 1.0 : -1.0;
  vec3 Ng = normalize(vNrm) * zs;
  float rf = rowF();
  int r0 = int(floor(rf));
  // the pixel's own stitch decides whether there is fabric here at all
  int rc = int(floor(rf + 0.5));
  vec4 Rc = rowT(rc);
  float xc = xIn(Rc);
  int ic = int(floor(xc - Rc.x + 0.5));
  // a stitch-graph cell may sit across rows that don't line up in the table: it belongs to its top stitch
  if (uGraph > 0.5) { rc = int(floor(vCell.y + 0.5)); Rc = rowT(rc); ic = int(floor(vCell.x - Rc.x + 0.5)); }
  vec4 Sc = (rc >= 0 && rc < uNRows && ic >= 0 && ic < uCols) ? stT(ic, rc) : vec4(0.0);
  if ((int(Sc.g) & 1) == 0) discard;

  // surface frame: one stitch to the right, one row up
  vec3 dpx = dFdx(vWorld), dpy = dFdy(vWorld);
  vec2 st = vec2(xc, rf);
  vec2 dsx = dFdx(st), dsy = dFdy(st);
  vec3 q1 = cross(dpy, Ng), q2 = cross(Ng, dpx);
  vec3 Tu = q1 * dsx.x + q2 * dsy.x, Tv = q1 * dsx.y + q2 * dsy.y;
  Tu = normalize(Tu - Ng * dot(Ng, Tu)); Tv = normalize(Tv - Ng * dot(Ng, Tv));
  float foot = max(length(vec2(dsx.x, dsy.x)), length(vec2(dsx.y, dsy.y)) * uAsp);
  vec3 V = normalize(cameraPosition - vWorld);

  vec3 col;
  float detail = (1.0 - uFirm) * (1.0 - smoothstep(0.22, 0.5, foot));
  Hit best; best.h = -1e9;
  if (detail > 0.0) {
    for (int dr = 0; dr < 2; dr++) {
      int r = r0 + dr; if (r < 0 || r >= uNRows) continue;
      vec4 R = rowT(r); float xr = xIn(R); int i0 = int(floor(xr - R.x));
      for (int dc = 0; dc < 2; dc++) {
        int i = i0 + dc; if (i < 0 || i >= uCols) continue;
        vec4 S = stT(i, r); if (!shown(S)) continue;
        vec2 p = vec2(xr - (R.x + float(i) + S.b), (rf - float(r)) * uAsp);
        if (abs(p.x) > 0.95 || abs(p.y) > (uHgt * uAsp + uR + 0.05)) continue;
        probe(p, S, zs, best);
      }
    }
  }
  vec3 near;
  if (best.h > -1e8) {
    vec3 base = unpackCol(best.S.r);
    if (abs(best.S.a - uSelOrd) < 0.5) base = mix(base, uSelCol, 0.55);
    vec3 n = normalize(Tu * best.n.x + Tv * best.n.y + Ng * best.n.z);
    vec3 ty = normalize(Tu * best.t.x + Tv * best.t.y + Ng * best.t.z);
    // three plies twisting along the strand, each a bundle of fibres
    float ph = best.th * (3.0 / 6.2831853) + best.s * uTw;
    float f = fract(ph);
    float ply = smoothstep(0.0, 0.22, f) * smoothstep(1.0, 0.78, f);
    vec3 side = normalize(cross(n, ty));
    n = normalize(n + side * (0.5 - f) * 0.8 * detail);
    vec3 tf = normalize(ty * 0.8 + side * 0.6);
    float fib = h21(vec2(floor(ph * 7.0 + best.th * 3.0), floor(best.s * 140.0)));
    base *= mix(1.0, (0.86 + 0.24 * fib), detail);
    // strands lower in the fabric sit in the shadow of the ones above
    float depth = smoothstep(-(uD + uR), uD + uR * 0.9, best.h);
    float ao = mix(0.32, 1.0, depth) * mix(0.55, 1.0, ply);
    near = (shade(L0, C0, n, V, tf, base) + shade(L1, C1, n, V, tf, base) + shade(L2, C2, n, V, tf, base)
         + base * mix(GROUND, SKY, n.y * 0.5 + 0.5)) * ao;
    near += base * pow(1.0 - max(dot(n, V), 0.0), 3.0) * 0.18 * ao;
  } else {
    // a gap between strands: the dim inside of the fabric
    vec3 base = unpackCol(Sc.r);
    near = base * (0.22 + 0.3 * max(dot(Ng, L0), 0.0)) * C0 * 0.6;
    if (!shown(Sc)) discard;
  }
  // far away, the average look of the stitch under the pixel
  vec3 baseF = unpackCol(Sc.r);
  if (abs(Sc.a - uSelOrd) < 0.5) baseF = mix(baseF, uSelCol, 0.55);
  float purl = ((int(Sc.g) & 2) != 0) == gl_FrontFacing ? 1.0 : 0.0;
  // the stitch texture, filtered: columns of Vs (knit) or ridges (purl) that fade out once they're under a pixel
  float tex = 1.0 - smoothstep(0.35, 0.9, foot);
  float ridge = purl > 0.5 ? cos(6.2831853 * rf * 2.0) : cos(6.2831853 * (xc + 0.5)) * 0.7 + cos(6.2831853 * rf) * 0.3;
  baseF *= 1.0 + 0.1 * (1.0 - uFirm) * ridge * tex;
  vec3 tfF = normalize(Tv);
  vec3 far = (shade(L0, C0, Ng, V, tfF, baseF) * 0.9 + shade(L1, C1, Ng, V, tfF, baseF) + shade(L2, C2, Ng, V, tfF, baseF)
            + baseF * mix(GROUND, SKY, Ng.y * 0.5 + 0.5)) * mix(0.86, 0.72, purl);
  // soft sheen at grazing angles, as yarn fuzz catches the light
  far += baseF * pow(1.0 - max(dot(Ng, V), 0.0), 3.0) * 0.22;
  if (!shown(Sc) && detail <= 0.0) discard;
  col = mix(far, near, detail);
  if (uFirm > 0.5) {
    // Matte relief follows knit columns and purl ridges without drawing individual loops.
    float phase = 6.2831853 * (purl > 0.5 ? rf * 2.0 : xc);
    vec3 across = purl > 0.5 ? Tv : Tu;
    float relief = tex * (1.0 - uContext);
    vec3 n = normalize(Ng + across * sin(phase) * 0.26 * relief);
    float key = 0.34 + 0.72 * max(0.0, dot(n, L0));
    float rim = pow(1.0 - clamp(dot(Ng, V), 0.0, 1.0), 3.0);
    col = baseF * (key + 0.14 * rim) * (1.0 + 0.09 * cos(phase) * relief);
    col *= gl_FrontFacing ? 1.0 : 0.62;
    col = mix(col, vec3(dot(col, vec3(0.2126, 0.7152, 0.0722))), uContext * 0.75);
  }
  if (uOvOn > 0.5 && gl_FrontFacing) { vec4 ov = texture2D(uOv, vUv); col = mix(col, srgb2lin(ov.rgb), ov.a); }
  gl_FragColor = vec4(col, mix(1.0, 0.26, uContext));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const FUZZ_FRAG = COMMON + LIGHTING + /* glsl */ `
uniform float uShell, uFz;
void main() {
  float rf = rowF();
  int rc = int(floor(rf + 0.5));
  vec4 R = rowT(rc); float xc = xIn(R);
  int ic = int(floor(xc - R.x + 0.5));
  if (uGraph > 0.5) { rc = int(floor(vCell.y + 0.5)); R = rowT(rc); ic = int(floor(vCell.x - R.x + 0.5)); }
  if (rc < 0 || rc >= uNRows || ic < 0 || ic >= uCols) discard;
  vec4 S = stT(ic, rc); if (!shown(S)) discard;
  // stray fibres: each cell of a fine grid holds one hair, shorter hairs end in lower shells
  vec2 q = vec2(xc, rf * uAsp) * uFz;
  vec2 cell = floor(q); vec2 fr = fract(q) - 0.5;
  float len = h21(cell);
  float k = uShell;
  if (len * len < k * 1.15) discard;
  vec2 off = (vec2(h21(cell + 17.0), h21(cell + 41.0)) - 0.5) * 0.6 * k;
  if (length(fr - off) > 0.2 * (1.0 - k * 0.6)) discard;
  vec3 base = unpackCol(S.r);
  vec3 Ng = normalize(vNrm) * (gl_FrontFacing ? 1.0 : -1.0);
  vec3 V = normalize(cameraPosition - vWorld);
  float rim = 1.0 - abs(dot(Ng, V));
  vec3 c = base * (C0 * (0.5 + 0.5 * max(dot(Ng, L0), 0.0)) * 0.6 + C2 * rim * 1.2 + SKY * 0.6);
  gl_FragColor = vec4(c, (0.55 - 0.45 * k) * (0.45 + 0.55 * rim));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export interface FabricMats { cloth: THREE.ShaderMaterial; shells: THREE.ShaderMaterial[]; uniforms: Record<string, THREE.IUniform> }

export function fabricMaterials(P: Piece, mesh: MeshLike, sg: number, rg: number, overlay: THREE.Texture): FabricMats & { data: ReturnType<typeof fabricData> } {
  const data = fabricData(P);
  const shared: Record<string, THREE.IUniform> = {
    uSt: { value: data.st }, uRows: { value: data.rows }, uCols: { value: data.cols }, uNRows: { value: P.nrows },
    // graph meshes carry stitch coordinates (x in the row, row) straight in their uv
    uBand: { value: mesh.band ? 1 : 0 }, uGraph: { value: mesh.graph ? 1 : 0 },
    uW: { value: mesh.graph ? 1 : mesh.W }, uX0: { value: mesh.graph ? 0 : mesh.x0 }, uH: { value: mesh.graph ? 1 : mesh.H }, uY0: { value: mesh.graph ? 0 : mesh.y0 },
    uAsp: { value: sg / rg }, uProg: { value: 1e9 }, uSelOrd: { value: -1 },
  };
  const cloth = new THREE.ShaderMaterial({
    uniforms: { ...shared, uLift: { value: 0 }, uR: { value: 0.18 }, uD: { value: 0.2 }, uHgt: { value: 0.74 }, uTw: { value: 9 },
      uOv: { value: overlay }, uOvOn: { value: 0 }, uFirm: { value: 0 }, uContext: { value: 0 }, uSelCol: { value: new THREE.Color(0x8a6fd1).convertSRGBToLinear() } },
    vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide,
  });
  const fuzzLen = 0.32 / sg; // ~1.8 yarn radii
  const shells = Array.from({ length: FUZZ_SHELLS }, (_, i) => {
    const k = (i + 1) / FUZZ_SHELLS;
    return new THREE.ShaderMaterial({
      uniforms: { ...shared, uLift: { value: k * fuzzLen }, uShell: { value: k }, uFz: { value: 22 } },
      vertexShader: VERT, fragmentShader: FUZZ_FRAG, side: THREE.DoubleSide, transparent: true, depthWrite: false,
    });
  });
  return { cloth, shells, uniforms: shared, data };
}

/** Which stitches show (unknitted ones are hidden while a piece is in progress) and which is picked. */
export function setFabricState(m: FabricMats, progress: number | null, selectedOrd: number | null) {
  m.uniforms.uProg.value = progress ?? 1e9;
  m.uniforms.uSelOrd.value = selectedOrd ?? -1;
}
