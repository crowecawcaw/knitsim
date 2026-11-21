// The studio around the knitting: one soft key light that casts real shadows, the dress form the
// garment hangs on, and the floor that catches its shadow. Everything here shares the fabric's
// lights (see LIGHTING), so cloth, form and floor sit in the same light.
import * as THREE from 'three';
import { edgeTable, triTable } from 'three/examples/jsm/objects/MarchingCubes.js';

export const LIGHTING = /* glsl */ `
// a soft studio setup: a warm key high on the right, a dim cool fill from the left, a rim light from behind
// that picks out the silhouette and the fuzz, and a little sky / floor bounce. Linear values; the renderer
// tone-maps the result (ACES), so the key can be bright without clipping.
const vec3 L0 = vec3(0.2857, 0.8571, 0.5);   // key: the light that casts the shadows
const vec3 L1 = vec3(-0.8018, 0.2673, -0.5345);
const vec3 L2 = vec3(0.3, 0.45, -0.84);
const vec3 C0 = vec3(1.0, 0.94, 0.85) * 1.55;
const vec3 C1 = vec3(0.82, 0.88, 1.0) * 0.22;
const vec3 C2 = vec3(0.85, 0.9, 1.0) * 0.55;
const vec3 SKY = vec3(0.24, 0.25, 0.27), GROUND = vec3(0.07, 0.06, 0.05);
`;
export const KEY_DIR = new THREE.Vector3(0.2857, 0.8571, 0.5).normalize();

// Shadow lookup. The key is a large softbox, so shadows are sharp where the caster touches and blur
// with distance from it: a few taps find how far away the casters are, then the shadow is averaged
// over a disc of that size. The disc is turned by a different angle at each pixel, which trades
// banding for fine noise.
export const SHADOW = /* glsl */ `
uniform sampler2D uShadow; uniform mat4 uShadowMat; uniform float uShadowOn; uniform vec3 uShadowInfo; // texel, depth range (in), texels per inch
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
float keyShadow(vec3 wp, vec3 n) {
  if (uShadowOn < 0.5) return 1.0;
  float ndl = clamp(dot(n, L0), 0.0, 1.0);
  vec4 sc = uShadowMat * vec4(wp + n * (0.1 + 0.22 * (1.0 - ndl)), 1.0);
  vec3 c = sc.xyz * 0.5 + 0.5;
  if (c.x <= 0.0 || c.x >= 1.0 || c.y <= 0.0 || c.y >= 1.0) return 1.0;
  c.z = min(c.z, 0.9995);   // the floor lies beyond the casters' box, and is still in their shadow
  float a = ign(gl_FragCoord.xy) * 6.2831853;
  float bias = 0.05 / uShadowInfo.y;
  float blockers = 0.0, depth = 0.0;
  for (int i = 0; i < 6; i++) {
    float r = sqrt((float(i) + 0.5) / 6.0), t = float(i) * 2.39996323 + a;
    float d = texture2D(uShadow, c.xy + vec2(cos(t), sin(t)) * r * 1.4 * uShadowInfo.z * uShadowInfo.x).r;
    if (d < c.z - bias) { blockers += 1.0; depth += d; }
  }
  if (blockers < 0.5) return 1.0;
  float gap = (c.z - depth / blockers) * uShadowInfo.y;        // inches from the caster
  float rad = clamp(0.03 + gap * 0.11, 0.04, 1.4) * uShadowInfo.z;  // texels
  float lit = 0.0;
  for (int i = 0; i < 14; i++) {
    float r = sqrt((float(i) + 0.5) / 14.0), t = float(i) * 2.39996323 + a;
    lit += step(c.z - bias, texture2D(uShadow, c.xy + vec2(cos(t), sin(t)) * r * rad * uShadowInfo.x).r);
  }
  return lit / 14.0;
}
`;

/** The key light's shadow map, and the uniforms every lit material shares to read it. */
export class KeyShadow {
  readonly size: number;
  readonly target: THREE.WebGLRenderTarget;
  readonly cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  readonly uniforms: Record<string, THREE.IUniform>;
  private depthMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, colorWrite: false });
  dirty = true;
  /** Shadow casters live on this layer. */
  static LAYER = 1;

  constructor(size = 2048) {
    this.size = size;
    this.target = new THREE.WebGLRenderTarget(size, size, { depthBuffer: true, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    const depth = new THREE.DepthTexture(size, size, THREE.UnsignedIntType);
    depth.minFilter = depth.magFilter = THREE.NearestFilter;
    this.target.depthTexture = depth;
    this.cam.layers.set(KeyShadow.LAYER);
    this.uniforms = {
      uShadow: { value: depth }, uShadowMat: { value: new THREE.Matrix4() }, uShadowOn: { value: 0 },
      uShadowInfo: { value: new THREE.Vector3(1 / size, 100, 30) },
    };
  }

  /** Fit the light's view around `box` (world space) and draw the casters into the map. */
  render(R: THREE.WebGLRenderer, scene: THREE.Scene, box: THREE.Box3) {
    this.dirty = false;
    if (box.isEmpty()) { this.uniforms.uShadowOn.value = 0; return; }
    const cam = this.cam; const c = box.getCenter(new THREE.Vector3());
    cam.position.copy(c).addScaledVector(KEY_DIR, 500); cam.up.set(0, 0, -1); cam.lookAt(c); cam.updateMatrixWorld();
    const inv = cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity; const p = new THREE.Vector3();
    for (let i = 0; i < 8; i++) {
      p.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).applyMatrix4(inv);
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z);
    }
    // square texels, with a margin for the blur
    const half = Math.max(x1 - x0, y1 - y0) / 2 + 2, mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    cam.left = mx - half; cam.right = mx + half; cam.bottom = my - half; cam.top = my + half;
    cam.near = -z1 - 2; cam.far = -z0 + 2; cam.updateProjectionMatrix();
    (this.uniforms.uShadowMat.value as THREE.Matrix4).multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    (this.uniforms.uShadowInfo.value as THREE.Vector3).set(1 / this.size, cam.far - cam.near, this.size / (2 * half));
    this.uniforms.uShadowOn.value = 1;
    const prevTarget = R.getRenderTarget(), prevOverride = scene.overrideMaterial;
    scene.overrideMaterial = this.depthMat;
    R.setRenderTarget(this.target); R.clear();
    R.render(scene, cam);
    R.setRenderTarget(prevTarget); scene.overrideMaterial = prevOverride;
  }

  dispose() { this.target.dispose(); this.target.depthTexture?.dispose(); this.depthMat.dispose(); }
}

const STUDIO_VERT = /* glsl */ `
varying vec3 vWorld; varying vec3 vNrm;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz; vNrm = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

// A matte solid: the dress form (unglazed, slightly chalky), the table, the stand.
const STUDIO_FRAG = /* glsl */ `
precision highp float;
varying vec3 vWorld; varying vec3 vNrm;
uniform vec3 uColor; uniform float uOpacity, uRough, uGrain;
` + LIGHTING + SHADOW + /* glsl */ `
float h31(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
vec3 lit(vec3 L, vec3 C, vec3 n, vec3 V, vec3 base) {
  float ndl = dot(n, L);
  float diff = max(0.0, (ndl + 0.12) / 1.12);
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(n, H), 0.0), mix(60.0, 6.0, uRough)) * mix(0.25, 0.03, uRough) * smoothstep(0.0, 0.2, ndl);
  return C * (base * diff + spec);
}
void main() {
  vec3 n = normalize(vNrm) * (gl_FrontFacing ? 1.0 : -1.0);
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 base = pow(uColor, vec3(2.2));
  // a faint speckle, so large plain surfaces aren't perfectly even
  base *= 1.0 + uGrain * (h31(floor(vWorld * 9.0)) - 0.5);
  float sh = keyShadow(vWorld, n);
  vec3 col = lit(L0, C0, n, V, base) * sh + lit(L1, C1, n, V, base) + lit(L2, C2, n, V, base)
           + base * mix(GROUND, SKY, n.y * 0.5 + 0.5) * 1.25;
  // light skimming a matte surface scatters back toward the eye
  col += base * pow(1.0 - max(dot(n, V), 0.0), 4.0) * 0.12;
  gl_FragColor = vec4(col, uOpacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function studioMaterial(shadow: KeyShadow, color: number, rough = 0.9, grain = 0.05) {
  return new THREE.ShaderMaterial({
    uniforms: { ...shadow.uniforms, uColor: { value: new THREE.Color(color) }, uOpacity: { value: 1 }, uRough: { value: rough }, uGrain: { value: grain } },
    vertexShader: STUDIO_VERT, fragmentShader: STUDIO_FRAG, transparent: true,
  });
}

// The floor is not drawn: only the shadow on it is, as a darkening of whatever is behind the canvas.
const FLOOR_FRAG = /* glsl */ `
precision highp float;
varying vec3 vWorld; varying vec3 vNrm;
uniform float uOpacity, uReach; uniform vec3 uCentre;
` + LIGHTING + SHADOW + /* glsl */ `
void main() {
  float sh = keyShadow(vWorld, vec3(0.0, 1.0, 0.0));
  float fade = 1.0 - smoothstep(0.55, 1.0, length(vWorld.xz - uCentre.xz) / uReach);
  gl_FragColor = vec4(vec3(0.16, 0.12, 0.09), (1.0 - sh) * 0.42 * fade * uOpacity);
}`;

export function shadowCatcher(shadow: KeyShadow, x: number, y: number, z: number, reach: number) {
  const m = new THREE.ShaderMaterial({
    uniforms: { ...shadow.uniforms, uOpacity: { value: 1 }, uReach: { value: reach }, uCentre: { value: new THREE.Vector3(x, y, z) } },
    vertexShader: STUDIO_VERT, fragmentShader: FLOOR_FRAG, transparent: true, depthWrite: false,
  });
  const q = new THREE.Mesh(new THREE.PlaneGeometry(reach * 2, reach * 2), m);
  q.rotation.x = -Math.PI / 2; q.position.set(x, y, z); q.renderOrder = -1;
  return q;
}

// ---------- the dress form ----------
interface Capsule { a: number[]; b: number[]; ra: number; rb: number; hidden?: boolean }

/** Distance to a tapered capsule (the same shape the cloth collides with). */
function capsuleDist(c: Capsule, x: number, y: number, z: number) {
  const ax = c.a[0], ay = c.a[1], az = c.a[2], bx = c.b[0] - ax, by = c.b[1] - ay, bz = c.b[2] - az;
  const L2 = bx * bx + by * by + bz * bz;
  let t = L2 ? ((x - ax) * bx + (y - ay) * by + (z - az) * bz) / L2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(x - ax - bx * t, y - ay - by * t, z - az - bz * t) - (c.ra + (c.rb - c.ra) * t);
}

/**
 * One smooth solid from a set of capsules: where two meet they blend into each other, the way a
 * shoulder runs into an arm, instead of showing as two shapes pushed together.
 */
export function formGeometry(caps: Capsule[], blend = 1.6, cell = 0.5): THREE.BufferGeometry {
  const C = caps.filter((c) => !c.hidden);
  const field = (x: number, y: number, z: number) => {
    let d = Infinity;
    for (const c of C) { const e = capsuleDist(c, x, y, z); const h = Math.max(blend - Math.abs(d - e), 0) / blend; d = Math.min(d, e) - h * h * blend * 0.25; }
    return d;
  };
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const c of C) for (let q = 0; q < 3; q++) { const r = Math.max(c.ra, c.rb) + blend * 0.3 + cell * 2; lo[q] = Math.min(lo[q], c.a[q] - r, c.b[q] - r); hi[q] = Math.max(hi[q], c.a[q] + r, c.b[q] + r); }
  const n = [0, 1, 2].map((q) => Math.ceil((hi[q] - lo[q]) / cell) + 1);
  const [nx, ny, nz] = n; const F = new Float32Array(nx * ny * nz);
  // most of the box is far from the surface: sample every 4th node first and fill in only near it
  const far = 4 * cell * 1.75 + cell; // a block's diagonal, and a cell more for its neighbours
  for (let k = 0; k < nz; k += 4) for (let j = 0; j < ny; j += 4) for (let i = 0; i < nx; i += 4) {
    const d = field(lo[0] + i * cell, lo[1] + j * cell, lo[2] + k * cell);
    const near = Math.abs(d) < far;
    for (let c = k; c < Math.min(nz, k + 4); c++) for (let b = j; b < Math.min(ny, j + 4); b++) for (let a = i; a < Math.min(nx, i + 4); a++) {
      F[(c * ny + b) * nx + a] = near ? field(lo[0] + a * cell, lo[1] + b * cell, lo[2] + c * cell) : d;
    }
  }
  const pos: number[] = [], idx: number[] = []; const cache = new Map<number, number>();
  const CORNER = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
  const EDGE = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
  const node = (i: number, j: number, k: number) => (k * ny + j) * nx + i;
  const ev = new Int32Array(12), val = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let ci = 0;
    for (let c = 0; c < 8; c++) { val[c] = F[node(i + CORNER[c][0], j + CORNER[c][1], k + CORNER[c][2])]; if (val[c] < 0) ci |= 1 << c; }
    const bits = edgeTable[ci]; if (!bits) continue;
    for (let e = 0; e < 12; e++) {
      if (!(bits & (1 << e))) continue;
      const [p, q] = EDGE[e]; const A = CORNER[p], B = CORNER[q];
      const na = node(i + A[0], j + A[1], k + A[2]), nb = node(i + B[0], j + B[1], k + B[2]);
      const key = Math.min(na, nb) * 3 + (A[0] !== B[0] ? 0 : A[1] !== B[1] ? 1 : 2);
      let v = cache.get(key);
      if (v === undefined) {
        const t = val[p] / (val[p] - val[q]);
        v = pos.length / 3; cache.set(key, v);
        pos.push(lo[0] + (i + A[0] + (B[0] - A[0]) * t) * cell, lo[1] + (j + A[1] + (B[1] - A[1]) * t) * cell, lo[2] + (k + A[2] + (B[2] - A[2]) * t) * cell);
      }
      ev[e] = v;
    }
    for (let t = ci * 16; triTable[t] >= 0; t += 3) idx.push(ev[triTable[t]], ev[triTable[t + 1]], ev[triTable[t + 2]]);
  }
  // normals straight from the field, so the shading is smoother than the triangles
  const nrm = new Float32Array(pos.length); const e = 0.05;
  for (let v = 0; v < pos.length; v += 3) {
    const x = pos[v], y = pos[v + 1], z = pos[v + 2];
    const gx = field(x + e, y, z) - field(x - e, y, z), gy = field(x, y + e, z) - field(x, y - e, z), gz = field(x, y, z + e) - field(x, y, z - e);
    const l = Math.hypot(gx, gy, gz) || 1; nrm[v] = gx / l; nrm[v + 1] = gy / l; nrm[v + 2] = gz / l;
  }
  // face the triangles the way the normals point
  if (idx.length >= 3) {
    const a = idx[0] * 3, b = idx[1] * 3, c = idx[2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const d = (uy * vz - uz * vy) * nrm[a] + (uz * vx - ux * vz) * nrm[a + 1] + (ux * vy - uy * vx) * nrm[a + 2];
    if (d < 0) for (let t = 0; t < idx.length; t += 3) { const s = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = s; }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setIndex(idx);
  return g;
}
