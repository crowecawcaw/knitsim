// Close-up yarn on the regular simulation grid. Each patch shares one tube across
// its stitches. Patch bounds follow the cloth so off-screen rows cost no vertex work.
import * as THREE from 'three';
import type { Piece } from '../knit';
import { rowExtents } from '../draw/stitches';

interface Grid {
  nx: number;
  ny: number;
  cr: number;
  H: number;
}
interface Patch {
  stitches: number[];
  colors: number[];
  cells: Set<number>;
}

const vertexShader = `
attribute vec4 stitch;
attribute vec3 yarnColor;
uniform sampler2D particles;
uniform vec4 grid; // nx, ny, simulation row spacing, piece height in rows
uniform float sg, matLift;
varying vec3 nWorld, world, dye;
varying vec2 ply; varying float strandDepth;
void main() {
  int flags = int(stitch.w);
  float lean = float((flags & 4) != 0) - float((flags & 2) != 0);
  float side = (flags & 1) != 0 ? -1.0 : 1.0;
  float bound = float((flags & 8) != 0);
  float x = position.x + lean * 0.1 * (position.y / 0.74 + 1.0);
  float y = position.y * mix(1.0, 0.42, bound) + bound * 0.1;
  float row = stitch.y + y;
  vec2 coord = vec2((stitch.x + x * stitch.z) * grid.x, row / grid.z);
  ivec2 cell = ivec2(clamp(floor(coord), vec2(0), grid.xy - 1.0));
  vec2 f = coord - vec2(cell);
  f.y = (row - float(cell.y) * grid.z) / min(grid.z, grid.w - float(cell.y) * grid.z);
  vec3 a = texelFetch(particles, cell, 0).xyz;
  vec3 b = texelFetch(particles, cell + ivec2(1,0), 0).xyz;
  vec3 c = texelFetch(particles, cell + ivec2(0,1), 0).xyz;
  vec3 d = texelFetch(particles, cell + ivec2(1), 0).xyz;
  vec3 U = normalize(mix(b-a,d-c,f.y)), V = normalize(mix(c-a,d-b,f.x));
  vec3 N = normalize(cross(U,V));
  vec3 center = mix(mix(a,b,f.x),mix(c,d,f.x),f.y);
  nWorld = normalize(U*normal.x + V*normal.y + N*normal.z*side);
  strandDepth = position.z*side;
  world = center + (matLift*N + N * position.z * side * mix(1.0,0.5,bound) + 0.18*nWorld) / sg;
  dye = yarnColor;
  ply = uv;
  gl_Position = projectionMatrix * viewMatrix * vec4(world,1);
}`;
const fragmentShader = `
varying vec3 nWorld, world, dye;
varying vec2 ply; varying float strandDepth;
void main(){
  vec3 N = normalize(nWorld), V = normalize(cameraPosition-world);
  vec3 L = vec3(.80,.48,.36);
  float key = max(0.0,dot(N,L)), rim = max(0.0,dot(N,vec3(.3,.45,-.84)));
  float twist = 6.2831853*(ply.x*9.0 + ply.y*3.0);
  float grooves = 0.90 - 0.16*cos(twist)*(1.0-smoothstep(0.5,3.0,fwidth(twist)));
  vec3 light = vec3(.25,.25,.27) + vec3(1.55,1.46,1.32)*key + vec3(.38,.42,.50)*rim;
  float sheen = pow(1.0-abs(dot(N,V)),3.0);
  float depth = mix(0.56,1.0,smoothstep(-0.20,0.18,strandDepth));
  vec2 fiberCell = floor(vec2(ply.x * 175.0, ply.y * 60.0));
  float fiber = fract(sin(dot(fiberCell,vec2(12.9898,78.233)))*43758.5453);
  float resolved = 1.0-smoothstep(.3,1.2,max(fwidth(ply.x)*175.0,fwidth(ply.y)*60.0));
  gl_FragColor = vec4(dye*grooves*depth*(light + 0.2*sheen)*(1.0+(fiber-.5)*.20*resolved),1);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function yarnTubes(piece: Piece, mesh: Grid, sg: number, rg: number) {
  const points = new Float32Array((mesh.nx + 1) * (mesh.ny + 1) * 4);
  const texture = new THREE.DataTexture(points, mesh.nx + 1, mesh.ny + 1, THREE.RGBAFormat, THREE.FloatType);
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    side: THREE.DoubleSide,
    uniforms: {
      particles: { value: texture },
      grid: { value: new THREE.Vector4(mesh.nx, mesh.ny, mesh.cr, mesh.H) },
      sg: { value: sg },
      matLift: { value: 0 },
    },
  });
  const positions: number[] = [],
    normals: number[] = [],
    uv: number[] = [],
    indices: number[] = [];
  const tangent = new THREE.Vector3(),
    across = new THREE.Vector3(),
    up = new THREE.Vector3();
  const segments = 16,
    sides = 6;
  for (let k = 0; k <= segments; k++) {
    const t = k / segments,
      a = t * 2 * Math.PI;
    tangent
      .set(
        1 + 0.96 * Math.PI * Math.cos(2 * a),
        (1.48 * Math.PI * Math.sin(a) * sg) / rg,
        0.8 * Math.PI * Math.sin(2 * a),
      )
      .normalize();
    across.set(-tangent.y, tangent.x, 0).normalize();
    up.crossVectors(tangent, across);
    for (let j = 0; j <= sides; j++) {
      const angle = (2 * Math.PI * j) / sides;
      positions.push(t - 0.5 + 0.24 * Math.sin(2 * a), -0.74 * Math.cos(a), -0.2 * Math.cos(2 * a));
      normals.push(
        ...across.clone().multiplyScalar(Math.cos(angle)).addScaledVector(up, Math.sin(angle)).toArray(),
      );
      uv.push(t, j / sides);
      const i = k * (sides + 1) + j;
      if (k < segments && j < sides) indices.push(i, i + 1, i + sides + 1, i + 1, i + sides + 2, i + sides + 1);
    }
  }
  const tube = new THREE.BufferGeometry();
  tube.setIndex(indices);
  tube.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  tube.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  tube.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const patches = new Map<string, Patch>(),
    ext = rowExtents(piece);
  piece.rows.forEach((row, r) =>
    row.stitches.forEach((s) => {
      const u = (s.x - ext[r].lo) / ext[r].w;
      const i = Math.min(mesh.nx - 1, Math.floor(u * mesh.nx)),
        j = Math.min(mesh.ny - 1, Math.floor((r + 0.5) / mesh.cr));
      const key = Math.floor(i / 2) + ',' + Math.floor(j / 2);
      let patch = patches.get(key);
      if (!patch) {
        patch = { stitches: [], colors: [], cells: new Set() };
        patches.set(key, patch);
      }
      const flags =
        (s.t === 'p' ? 1 : 0) + (s.lean === 'l' ? 2 : s.lean === 'r' ? 4 : 0) + (s.op === 'bo' ? 8 : 0);
      patch.stitches.push(u, r + 0.5, 1 / ext[r].w, flags);
      patch.colors.push(...new THREE.Color(s.color).convertSRGBToLinear().toArray());
      // Include adjacent grid cells reached by the ends of the loop.
      for (let y = Math.max(0, j - 1); y <= Math.min(mesh.ny, j + 2); y++)
        for (let x = Math.max(0, i - 1); x <= Math.min(mesh.nx, i + 2); x++)
          patch.cells.add(y * (mesh.nx + 1) + x);
    }),
  );
  const group = new THREE.Group();
  const chunks = Array.from(patches.values(), (patch) => {
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setIndex(tube.index);
    for (const [name, attr] of Object.entries(tube.attributes)) geometry.setAttribute(name, attr);
    geometry.setAttribute('stitch', new THREE.InstancedBufferAttribute(new Float32Array(patch.stitches), 4));
    geometry.setAttribute('yarnColor', new THREE.InstancedBufferAttribute(new Float32Array(patch.colors), 3));
    geometry.instanceCount = patch.stitches.length / 4;
    const sphere = new THREE.Sphere();
    geometry.boundingSphere = sphere;
    group.add(new THREE.Mesh(geometry, material));
    return { cells: Array.from(patch.cells), sphere, count: geometry.instanceCount };
  });
  const box = new THREE.Box3(),
    v = new THREE.Vector3();
  return {
    group,
    texture,
    matLift: material.uniforms.matLift,
    visibleStitches(frustum: THREE.Frustum) {
      let count = 0;
      for (const chunk of chunks) if (frustum.intersectsSphere(chunk.sphere)) count += chunk.count;
      return count;
    },
    update(pos: Float32Array) {
      for (let i = 0; i < pos.length / 3; i++) {
        points[i * 4] = pos[i * 3];
        points[i * 4 + 1] = pos[i * 3 + 1];
        points[i * 4 + 2] = pos[i * 3 + 2];
      }
      texture.needsUpdate = true;
      for (const { cells, sphere } of chunks) {
        box.makeEmpty();
        for (const i of cells) box.expandByPoint(v.fromArray(pos, i * 3));
        box.getBoundingSphere(sphere);
        sphere.radius += 2 / sg;
      }
    },
  };
}
