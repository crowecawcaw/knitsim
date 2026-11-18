// The one 3D scene: pieces on the mat ⇄ aligned around the form ⇄ assembled.
// Imperative three.js code; React drives it through the public methods.
import * as THREE from 'three';
import { BODY, TABLE, makeSim, type KnitDoc, type Piece, type Stitch } from '../knit';
import { drawOverlay, pieceXY, rowExtents } from '../draw/stitches';
import type { ViewMode } from '../urlState';
import { fabricMaterials, setFabricState, type FabricMats } from './fabric';

// Match the look of the original (three r147, legacy lighting): hex colours are
// used as-is and lights are scaled from the old intensity units.
THREE.ColorManagement.enabled = false;
const LEGACY_LIGHT = Math.PI;

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const MAT_Y = -16;

export interface Insets { l: number; r: number; t: number; b: number }
export interface KnitState { curPiece: string | null; progress: number; selected: Stitch | null }

interface Cam { target: THREE.Vector3; dist: number; phi: number; theta: number; fov: number }
interface Box { x0: number; x1: number; z0: number; z1: number }
interface Fade { v: number; t: number; mats: THREE.Material[]; base: number[] }

/* eslint-disable @typescript-eslint/no-explicit-any */
type Sim = any; // returned by makeSim (untyped engine)
interface Part {
  P: Piece; mesh: any; offset: number; idx: number; at: string;
  canvas: HTMLCanvasElement; tex: THREE.CanvasTexture;
  g: THREE.BufferGeometry; attr: THREE.BufferAttribute; meshes: THREE.Mesh[]; flatBox: Box;
  fab: FabricMats; shells: THREE.Mesh[]; label: THREE.Mesh;
  /** stitch-graph parts: render vertex → sim vertex, and the indexed sim mesh used for normals */
  map?: Int32Array; gi?: THREE.BufferGeometry;
}

/** Capsules drawn as soft see-through solids (the dress form, the foot forms). */
function capsuleGroup(caps: any[], mat: THREE.Material) {
  const form = new THREE.Group();
  caps.filter((c) => !c.hidden).forEach((c) => {
    const a = new THREE.Vector3(...(c.a as [number, number, number])), b = new THREE.Vector3(...(c.b as [number, number, number]));
    const L = a.distanceTo(b); const g = new THREE.Group();
    if (L > 0.01) g.add(new THREE.Mesh(new THREE.CylinderGeometry(c.rb, c.ra, L, 24, 1, true), mat));
    [a, b].forEach((_p, i) => {
      const sp = new THREE.Mesh(new THREE.SphereGeometry(i ? c.rb : c.ra, 24, 16), mat);
      sp.position.set(0, (i ? 0.5 : -0.5) * L, 0); g.add(sp);
    });
    g.position.copy(a.clone().add(b).multiplyScalar(0.5));
    if (L > 0.01) g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    form.add(g);
  });
  return form;
}

/** Non-indexed geometry for a stitch-graph mesh: each cell carries its own stitch coordinates. */
function graphGeometry(mesh: any) {
  const map: number[] = [], uv: number[] = [], cell: number[] = [];
  mesh.cells.forEach((c: { v: number[]; pos: number[][]; tris: number[][] }) => {
    const A = mesh.sts[c.v[0]]; const B = c.v[1] >= 0 ? mesh.sts[c.v[1]] : null;
    const dir = B && B.row === A.row && B.x < A.x ? -1 : 1; const s0 = c.pos[0][0];
    c.tris.forEach((t) => t.forEach((slot) => {
      map.push(c.v[slot]); const [ps, pt] = c.pos[slot];
      uv.push(A.x + (ps - s0) * dir, A.row - 1 + pt); cell.push(A.x, A.row);
    }));
  });
  const g = new THREE.BufferGeometry(); const n = map.length;
  const pa = new THREE.BufferAttribute(new Float32Array(n * 3), 3); pa.setUsage(THREE.DynamicDrawUsage);
  const na = new THREE.BufferAttribute(new Float32Array(n * 3), 3); na.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('position', pa); g.setAttribute('normal', na);
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('aCell', new THREE.Float32BufferAttribute(cell, 2));
  return { g, map: Int32Array.from(map) };
}

export interface SceneCallbacks {
  onPick: (st: Stitch) => void;
}

export class KnitScene {
  mode: ViewMode = 'pieces';
  showSeams = true;
  private doc: KnitDoc | null = null;
  private knit: KnitState = { curPiece: null, progress: Infinity, selected: null };
  private seamLine?: number;
  private dirtyTex = new Set<string>();

  private R: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(22, 1, 0.5, 2000);
  private raycaster = new THREE.Raycaster();
  private mat: THREE.Mesh; private mtex: THREE.CanvasTexture; private grabDot: THREE.Mesh;
  private formMat!: THREE.Material;
  private fades: Record<'form' | 'table' | 'mat' | 'labels', Fade>;
  private group: THREE.Group | null = null;
  private parts: Part[] = [];
  private sim: Sim = null;
  private posAligned: Float32Array | null = null;
  private posFlat: Float32Array | null = null;
  private posAssembled: Float32Array | null = null;
  private flatBounds: Box | null = null;
  private seamAttr: THREE.BufferAttribute | null = null;
  private seamLines: THREE.LineSegments | null = null;
  private seamMat: THREE.LineBasicMaterial | null = null;
  private tween: { from: Float32Array; to: Float32Array; lift: number; t0: number; dur: number; stagger: number; done?: () => void } | null = null;
  private camTween: { from: Cam; to: Cam; t0: number; dur: number } | null = null;
  private cam: Cam = { target: new THREE.Vector3(0, MAT_Y, 0), dist: 80, phi: 0.01, theta: 0, fov: 22 };
  private camSet = false; private sized = false;
  /** the piece the camera was last focused on (pieces mode), kept framed when the free area changes */
  private focused: string | null = null;
  private insets: Insets = { l: 0, r: 0, t: 0, b: 0 };
  private simRunning = false; private simT = 0; private relaxUntil = 0; private lastT = 0;
  private raf = 0;
  private fuzzOn = false;
  private cleanup: (() => void)[] = [];

  constructor(private host: HTMLElement, private statusEl: HTMLElement, private cb: SceneCallbacks, private firm = false) {
    // the canvas is transparent: the studio backdrop behind it is a CSS gradient (#view3d), so it stays put
    // while the camera orbits, the way a paper sweep behind a product shot does
    const R = (this.R = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }));
    R.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    R.setClearColor(0x000000, 0);
    // filmic response: bright highlights roll off instead of clipping, shadows keep some colour
    R.toneMapping = THREE.ACESFilmicToneMapping;
    R.toneMappingExposure = 0.95;
    host.prepend(R.domElement);
    const scene = this.scene;
    scene.add(new THREE.HemisphereLight(0xfff6e8, 0x8a7a68, 0.7 * LEGACY_LIGHT));
    const d1 = new THREE.DirectionalLight(0xfff3e2, 1.0 * LEGACY_LIGHT); d1.position.set(20, 60, 35); scene.add(d1);
    const d2 = new THREE.DirectionalLight(0xdfe8ff, 0.25 * LEGACY_LIGHT); d2.position.set(-30, 10, -20); scene.add(d2);
    const d3 = new THREE.DirectionalLight(0xe6eeff, 0.35 * LEGACY_LIGHT); d3.position.set(8, 14, -28); scene.add(d3);
    // soft contact shadows on the floor, so the form and the table stand on something
    const sc = document.createElement('canvas'); sc.width = sc.height = 128; const sx = sc.getContext('2d')!;
    const sg = sx.createRadialGradient(64, 64, 0, 64, 64, 64);
    sg.addColorStop(0, 'rgba(60,45,30,0.42)'); sg.addColorStop(0.35, 'rgba(60,45,30,0.2)'); sg.addColorStop(1, 'rgba(60,45,30,0)');
    sx.fillStyle = sg; sx.fillRect(0, 0, 128, 128);
    const stex = new THREE.CanvasTexture(sc); stex.colorSpace = THREE.SRGBColorSpace;
    const shadowMat = () => new THREE.MeshBasicMaterial({ map: stex, transparent: true, depthWrite: false, toneMapped: false });
    const floorShadow = (x: number, y: number, z: number, w: number, d: number, m: THREE.Material) => {
      const q = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m); q.rotation.x = -Math.PI / 2; q.position.set(x, y, z); q.renderOrder = -1; return q;
    };
    // dress form
    const fm = new THREE.MeshStandardMaterial({ color: 0xcbc2b4, roughness: 0.85, transparent: true, opacity: 0.55, depthWrite: false });
    this.formMat = fm;
    const form = capsuleGroup(BODY.capsules, fm);
    const standMat = new THREE.MeshStandardMaterial({ color: 0x8b6b4a, transparent: true });
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 14, 12), standMat); stand.position.set(0, -14, 0); form.add(stand);
    const formShadowMat = shadowMat();
    form.add(floorShadow(0, -21, 0, 26, 18, formShadowMat));
    scene.add(form);
    const T = TABLE; const table = new THREE.Group();
    const tm = new THREE.MeshStandardMaterial({ color: 0xb08a62, roughness: 0.7, transparent: true });
    const top = new THREE.Mesh(new THREE.CylinderGeometry(T.r, T.r, T.depth, 48), tm); top.position.set(T.c[0], T.top - T.depth / 2, T.c[2]); table.add(top);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 2.2, 26, 16), tm); leg.position.set(T.c[0], T.top - 14, T.c[2]); table.add(leg);
    const tableShadowMat = shadowMat();
    table.add(floorShadow(T.c[0], T.top - 27, T.c[2], T.r * 2.6, T.r * 2.2, tableShadowMat));
    scene.add(table);
    // cutting mat with a 1-inch grid
    const mc = document.createElement('canvas'); mc.width = mc.height = 512; const mx = mc.getContext('2d')!;
    const palette = getComputedStyle(host);
    mx.fillStyle = palette.getPropertyValue('--pool').trim(); mx.fillRect(0, 0, 512, 512);
    for (let i = 0; i <= 12; i++) {
      const p = (i * 512) / 12;
      mx.strokeStyle = palette.getPropertyValue(i % 6 === 0 ? '--pool-grid-major' : '--pool-grid').trim();
      mx.lineWidth = i % 6 === 0 ? 2.5 : 1.2;
      mx.beginPath(); mx.moveTo(p, 0); mx.lineTo(p, 512); mx.moveTo(0, p); mx.lineTo(512, p); mx.stroke();
    }
    const mtex = (this.mtex = new THREE.CanvasTexture(mc));
    mtex.wrapS = mtex.wrapT = THREE.RepeatWrapping; mtex.anisotropy = 8; mtex.colorSpace = THREE.SRGBColorSpace;
    const mat = (this.mat = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: mtex, transparent: true, depthWrite: false, toneMapped: false })));
    mat.rotation.x = -Math.PI / 2; mat.position.y = MAT_Y - 0.05; scene.add(mat);
    const grabDot = (this.grabDot = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 12), new THREE.MeshBasicMaterial({ color: 0xc0573e })));
    grabDot.visible = false; scene.add(grabDot);
    this.fades = {
      form: { v: 0, t: 0, mats: [fm, standMat, formShadowMat], base: [0.55, 1, 1] },
      table: { v: 0, t: 0, mats: [tm, tableShadowMat], base: [1, 1] },
      mat: { v: 1, t: 1, mats: [mat.material as THREE.Material], base: [1] },
      labels: { v: 1, t: 1, mats: [], base: [] },
    };
    this.setupInput();
    const loop = () => { this.frame(); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.cleanup.forEach((f) => f());
    this.disposeGroup();
    this.R.dispose();
    this.R.domElement.remove();
  }

  // ---------- public API ----------
  setDoc(doc: KnitDoc) { this.doc = doc; this.rebuild(); }

  setKnitState(next: KnitState) {
    const prev = this.knit;
    [prev.curPiece, prev.selected?.piece, next.curPiece, next.selected?.piece].forEach((n) => { if (n) this.dirtyTex.add(n); });
    this.knit = next;
    const part = this.parts.find((p) => p.P.name === this.focused);
    if (this.firm && this.mode === 'assembled' && part && next.curPiece === part.P.name && prev.curPiece === next.curPiece) {
      const bucket = (progress: number) => Math.floor(40 * progress / Math.max(1, part.P.total));
      if (bucket(prev.progress) !== bucket(next.progress)) {
        const to = this.firmPreset();
        this.tweenCam({ ...to, theta: this.cam.theta, phi: this.cam.phi }, 0.25);
      }
    }
  }

  setShowSeams(v: boolean, line?: number) {
    this.showSeams = v;
    this.seamLine = line;
    if (this.firm) this.traceFirmSeam();
  }

  /** Screen space (px) covered by floating UI; the camera frames the knit in the rest. */
  setInsets(i: Insets) {
    const k = [i.l, i.r, i.t, i.b].join();
    if (k === [this.insets.l, this.insets.r, this.insets.t, this.insets.b].join()) return;
    this.insets = i; this.sized = false;
  }

  fit(dur = 0.8) {
    this.focused = null;
    if (this.firm) this.showFirmShape();
    else this.tweenCam(this.camPreset(this.mode), dur);
  }

  focusPiece(name: string) {
    if (this.mode !== 'pieces' && !this.firm) return;
    this.focused = name;
    if (this.firm) { this.showFirmShape(); return; }
    const c = this.focusPreset(); if (c) this.tweenCam(c, 0.8);
  }

  private focusPreset() {
    if (this.firm && this.mode === 'assembled') return this.firmPreset();
    if (this.mode !== 'pieces' || !this.focused) return null;
    const part = this.parts.find((p) => p.P.name === this.focused); if (!part || !part.flatBox) return null;
    const b = { ...part.flatBox };
    if (this.firm) {
      for (const p of this.parts) {
        if (!p.meshes[0].visible) continue;
        b.x0 = Math.min(b.x0, p.flatBox.x0);
        b.x1 = Math.max(b.x1, p.flatBox.x1);
        b.z0 = Math.min(b.z0, p.flatBox.z0);
        b.z1 = Math.max(b.z1, p.flatBox.z1);
      }
    }
    return this.camPreset('pieces', { x0: b.x0 - 3, x1: b.x1 + 3, z0: b.z0 - 3, z1: b.z1 + 5 });
  }

  setMode(m: ViewMode) {
    if (m === this.mode) return;
    this.focused = null;
    if (!this.sim) { this.mode = m; return; }
    const prev = this.mode; this.mode = m;
    if (this.firm) { this.showFirmShape(); return; }
    this.simRunning = false;
    const lift = (prev === 'pieces') !== (m === 'pieces') ? 10 : 0;
    if (m === 'pieces') { this.animateTo(this.posFlat!, lift, 1.5); this.tweenCam(this.camPreset('pieces'), 1.6); }
    else if (m === 'aligned') { this.animateTo(this.posAligned!, lift, 1.5); this.tweenCam(this.camPreset('aligned'), 1.6); }
    else { // assembled: fly to the aligned layout first (if needed), then sew
      this.tweenCam(this.camPreset('assembled'), prev === 'pieces' ? 2.4 : 1.4);
      if (prev === 'pieces') this.animateTo(this.posAligned!, lift, 1.4, () => this.startSim());
      else this.startSim();
    }
    this.applyFades(); this.updateStatus();
  }

  // ---------- build ----------
  private disposeGroup() {
    this.parts.forEach((p) => p.gi?.dispose());
    if (!this.group) return;
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.MeshStandardMaterial | undefined;
      if (mat && mat.map && mat.map !== this.mtex) mat.map.dispose();
    });
  }

  private rebuild() {
    this.disposeGroup();
    this.group = new THREE.Group(); this.scene.add(this.group);
    this.parts = []; this.sim = null; this.posAssembled = null; this.tween = null; this.simRunning = false;
    this.fades.labels.mats = []; this.fades.labels.base = [];
    const doc = this.doc;
    if (!doc || !doc.seams) return;
    let sim: Sim;
    try { sim = makeSim(doc, this.firm); } catch (e) { console.error(e); this.statusEl.textContent = 'Could not build 3D: ' + (e as Error).message; return; }
    this.sim = sim; sim.parts.forEach((pt: Part, i: number) => { pt.idx = i; });
    this.parts = sim.parts;
    this.posAligned = new Float32Array(sim.pos);
    this.posFlat = this.layoutFlat(sim);
    this.parts.forEach((part, idx) => {
      let g = new THREE.BufferGeometry();
      const n = part.mesh.local.length;
      const attr = new THREE.BufferAttribute(sim.pos.subarray(part.offset * 3, (part.offset + n) * 3), 3); attr.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('position', attr); g.setAttribute('uv', new THREE.Float32BufferAttribute(part.mesh.uv, 2)); g.setIndex(part.mesh.tris);
      if (part.mesh.graph) { const gg = graphGeometry(part.mesh); part.gi = g; part.map = gg.map; g = gg.g; }
      // the overlay (needles, the picked stitch) is drawn in 2D; the fabric itself is a shader
      part.canvas = document.createElement('canvas');
      part.tex = new THREE.CanvasTexture(part.canvas); part.tex.anisotropy = 8;
      const fm = fabricMaterials(part.P, part.mesh, doc.built.sg, doc.built.rg, part.tex);
      const a = new THREE.Mesh(g, fm.cloth); a.userData.part = part;
      const shells = fm.shells.map((m) => { const sh = new THREE.Mesh(g, m); sh.raycast = () => {}; sh.renderOrder = 1; sh.visible = this.fuzzOn; return sh; });
      this.group!.add(a, ...shells); Object.assign(part, { g, attr, meshes: [a], idx, fab: fm, shells });
      this.drawTexture(part);
      // label on the mat
      const lc = document.createElement('canvas'); lc.width = 512; lc.height = 96; const lx = lc.getContext('2d')!;
      lx.fillStyle = 'rgba(35,32,29,0.88)'; lx.font = '700 40px "IBM Plex Sans", sans-serif'; lx.fillText(part.P.name.replace(/_/g, ' '), 6, 46);
      lx.font = '500 28px "IBM Plex Sans", sans-serif'; lx.fillStyle = 'rgba(35,32,29,0.5)';
      const fb0 = part.flatBox; const [wIn, hIn] = part.mesh.graph ? [fb0.x1 - fb0.x0, fb0.z1 - fb0.z0] : [part.P.widthIn, part.P.heightIn];
      lx.fillText(`${wIn.toFixed(1)}″ × ${hIn.toFixed(1)}″ · ${part.P.nrows - 1} rows`, 6, 86);
      const lt = new THREE.CanvasTexture(lc); lt.colorSpace = THREE.SRGBColorSpace;
      const lm = new THREE.MeshBasicMaterial({ map: lt, transparent: true, depthWrite: false });
      const label = new THREE.Mesh(new THREE.PlaneGeometry(16, 3), lm); label.rotation.x = -Math.PI / 2;
      const fb = part.flatBox; label.position.set(fb.x0 + 8, MAT_Y + 0.01, fb.z1 + 2.6); this.group!.add(label);
      part.label = label;
      this.fades.labels.mats.push(lm); this.fades.labels.base.push(1);
    });
    // foot forms for shoes
    if (sim.feet && sim.feet.length) this.group.add(capsuleGroup(sim.feet, this.formMat));
    // seam threads
    const sp = new Float32Array(sim.seams.length * 3);
    const sg2 = new THREE.BufferGeometry(); const sattr = new THREE.BufferAttribute(sp, 3); sattr.setUsage(THREE.DynamicDrawUsage); sg2.setAttribute('position', sattr);
    this.seamMat = new THREE.LineBasicMaterial({ color: 0xc0573e, transparent: true, opacity: 0.85, depthTest: !this.firm });
    this.seamLines = new THREE.LineSegments(sg2, this.seamMat); this.seamAttr = sattr; this.group.add(this.seamLines);
    // mat size
    const fb = this.flatBounds!; const mw = Math.max(fb.x1 - fb.x0, fb.z1 - fb.z0) * 4 + 120, md = mw;
    if (sim.parts.length) this.mat.scale.set(mw, md, 1); this.mat.position.set((fb.x0 + fb.x1) / 2, MAT_Y - 0.05, (fb.z0 + fb.z1) / 2); this.mtex.repeat.set(mw / 12, md / 12);
    if (this.firm) { this.showFirmShape(); return; }
    // put pieces where the current mode wants them, no animation
    sim.pos.set(this.mode === 'pieces' ? this.posFlat : this.posAligned);
    this.applyFades(true);
    this.markDirty();
    if (this.mode === 'assembled') this.startSim();
    if (!this.camSet) { this.camSet = true; Object.assign(this.cam, this.camPreset(this.mode)); }
    this.updateStatus();
  }

  private showFirmShape() {
    const sim = this.sim;
    if (!sim) return;
    const flat = this.mode === 'pieces';
    const active = this.parts.find((p) => p.P.name === this.focused);
    // The simulation and the written pattern share the same construction order.
    const current = this.parts.find((p) => p.P.name === this.knit.curPiece);
    const joining = this.doc?.seams.some((s) => (s.kind === 'pickup' || s.kind === 'join') &&
      s.a.split('.')[0] === this.focused);
    // Close the joins in a short solve without gravity, then reuse the frozen shape.
    const useAssembly = !active || joining || !active.P.round;
    if (!flat && useAssembly && !this.posAssembled) {
      sim.reset();
      if (sim.seams.length || this.parts.some((p) => p.P.gather)) {
        for (let i = 0; i < 20; i++) sim.step(1 / 60, { assembleT: sim.tGrav, iters: 5, firm: true });
      }
      this.smoothNeckbands();
      this.posAssembled = new Float32Array(sim.pos);
    }
    sim.pos.set(flat ? this.posFlat : useAssembly ? this.posAssembled : this.posAligned);
    for (const part of this.parts) {
      const visible = !current || part.idx <= current.idx;
      const context = !flat && !!current && part !== current;
      part.meshes.forEach((mesh) => { mesh.visible = visible; });
      part.label.visible = visible;
      const cloth = part.fab.cloth;
      cloth.uniforms.uContext.value = context ? 1 : 0;
      cloth.transparent = context;
      cloth.depthWrite = !context;
      const side = context ? THREE.FrontSide : THREE.DoubleSide;
      if (cloth.side !== side) { cloth.side = side; cloth.needsUpdate = true; }
      const showFuzz = visible && !context && this.fuzzOn;
      part.shells.forEach((shell) => { shell.visible = showFuzz; });
    }
    this.markDirty();
    this.traceFirmSeam();
    this.applyFades(true);
    this.camTween = null;
    Object.assign(this.cam, this.focusPreset() ?? this.camPreset(this.mode));
  }

  /** Keep the pick-up edge attached, and fit the rounds above it to smooth ovals. */
  private smoothNeckbands() {
    const positions: Float32Array = this.sim.pos;
    for (const part of this.parts) {
      if (part.at !== 'neck' || !part.P.round || !part.mesh.band) continue;
      const attaches = this.doc?.seams.some((s) => s.kind === 'pickup' && s.a === `${part.P.name}.bottom`);
      if (!attaches) continue;

      const { nx, ny } = part.mesh;
      const angles = Array.from({ length: nx }, (_, column) => {
        const angle = 2 * Math.PI * column / nx;
        return [Math.cos(angle), Math.sin(angle)];
      });
      for (let row = 1; row <= ny; row++) {
        const start = 3 * (part.offset + row * (nx + 1));
        for (let axis = 0; axis < 3; axis++) {
          let center = 0, cos = 0, sin = 0;
          for (let column = 0; column < nx; column++) {
            const value = positions[start + 3 * column + axis];
            center += value;
            cos += value * angles[column][0];
            sin += value * angles[column][1];
          }
          for (let column = 0; column <= nx; column++) {
            const [c, s] = angles[column % nx];
            positions[start + 3 * column + axis] = (center + 2 * (cos * c + sin * s)) / nx;
          }
        }
      }
    }
  }

  private traceFirmSeam() {
    const sim = this.sim;
    const lines = this.seamLines;
    const attr = this.seamAttr;
    if (!sim || !lines || !attr) return;
    lines.visible = this.showSeams && this.mode === 'assembled' && !!this.seamLine;
    if (!lines.visible) return;

    lines.frustumCulled = false;
    const previous = new THREE.Vector3();
    const midpoint = new THREE.Vector3();
    const other = new THREE.Vector3();
    let count = 0;
    let continuing = false;
    for (let i = 0; i < sim.seams.length; i += 2) {
      if (sim.seamLines[i / 2] !== this.seamLine) { continuing = false; continue; }
      midpoint.fromArray(sim.pos, 3 * sim.seams[i]);
      other.fromArray(sim.pos, 3 * sim.seams[i + 1]);
      midpoint.lerp(other, 0.5);
      if (continuing) {
        attr.setXYZ(count++, previous.x, previous.y, previous.z);
        attr.setXYZ(count++, midpoint.x, midpoint.y, midpoint.z);
      }
      previous.copy(midpoint);
      continuing = true;
    }
    lines.geometry.setDrawRange(0, count);
    attr.needsUpdate = true;
  }

  private firmPreset(): Cam {
    const bounds = new THREE.Box3();
    const point = new THREE.Vector3();
    const active = this.parts.find((p) => p.P.name === this.focused);
    for (const part of active ? [active] : this.parts) {
      const pos = part.attr.array;
      const progress = this.knit.curPiece === part.P.name ? this.knit.progress : Infinity;
      const nextRow = part.P.rows.findIndex((row) => row.firstOrd >= progress);
      for (let i = 0; i < pos.length; i += 3) {
        const vertex = i / 3;
        const row = part.mesh.graph ? part.mesh.sts[vertex].row
          : part.mesh.y0 + part.mesh.uv[vertex * 2 + 1] * part.mesh.H;
        if (nextRow < 0 || row <= nextRow + (part.mesh.cr ?? 1)) bounds.expandByPoint(point.fromArray(pos, i));
      }
    }
    if (bounds.isEmpty()) return this.camPreset('assembled');
    const size = bounds.getSize(new THREE.Vector3());
    const target = bounds.getCenter(new THREE.Vector3());
    const onTable = active?.mesh.graph && (active.P.round || this.sim.feet.length) ||
      (!active && this.sim.useTable);
    const collar = active?.at === 'neck' && active.P.round;
    return {
      target, dist: Math.max(4, this.fitDist(size.x + 0.45 * size.z, Math.hypot(size.y, size.z), 38)),
      phi: onTable ? 0.62 : collar ? 1.05 : active?.P.round ? 0.85 : 1.28,
      theta: collar ? 0.6 : onTable ? 0.42 : 0.35, fov: 38,
    };
  }

  /** Shelf-pack the flat pieces onto the mat (x right, rows run "up" the screen = −z). */
  private layoutFlat(sim: Sim) {
    const out = new Float32Array(sim.pos.length);
    const items = (sim.parts as Part[]).map((p) => {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      p.mesh.local.forEach((l: { x: number; y: number }) => { x0 = Math.min(x0, l.x); x1 = Math.max(x1, l.x); y0 = Math.min(y0, l.y); y1 = Math.max(y1, l.y); });
      return { p, x0, x1, y0, y1, w: x1 - x0, h: y1 - y0, ox: 0, oz: 0 };
    });
    const area = items.reduce((a, it) => a + (it.w + 5) * (it.h + 6), 0);
    const maxW = Math.max(Math.sqrt(area) * 1.5, ...items.map((it) => it.w));
    let cx = 0, cz = 0, rowH = 0; const gap = 5, gapZ = 7;
    items.forEach((it) => {
      if (cx > 0 && cx + it.w > maxW) { cx = 0; cz += rowH + gapZ; rowH = 0; }
      it.ox = cx; it.oz = cz; cx += it.w + gap; rowH = Math.max(rowH, it.h);
    });
    let bx0 = Infinity, bx1 = -Infinity, bz0 = Infinity, bz1 = -Infinity;
    items.forEach((it) => { bx0 = Math.min(bx0, it.ox); bx1 = Math.max(bx1, it.ox + it.w); bz0 = Math.min(bz0, it.oz); bz1 = Math.max(bz1, it.oz + it.h); });
    const mx = (bx0 + bx1) / 2, mz = (bz0 + bz1) / 2;
    items.forEach((it) => {
      const { p } = it; const X0 = it.ox - mx, Ztop = it.oz - mz;
      // piece's top row sits at Ztop (far side), cast-on edge nearest the viewer
      p.mesh.local.forEach((l: { x: number; y: number }, k: number) => {
        const i = (p.offset + k) * 3;
        out[i] = X0 + (l.x - it.x0); out[i + 1] = MAT_Y + 0.02 + (p.idx || 0) * 0.002; out[i + 2] = Ztop + (it.y1 - l.y);
      });
      p.flatBox = { x0: X0, x1: X0 + it.w, z0: Ztop, z1: Ztop + it.h };
    });
    this.flatBounds = { x0: bx0 - mx, x1: bx1 - mx, z0: bz0 - mz, z1: bz1 - mz + 4 };
    return out;
  }

  private markDirty() {
    this.parts.forEach((p) => {
      p.attr.needsUpdate = true;
      if (p.map && p.gi) {
        // smooth normals from the indexed sim mesh, copied out to the per-cell render vertices
        p.gi.computeVertexNormals();
        const src = p.attr.array, nrm = p.gi.getAttribute('normal').array;
        const pa = p.g.getAttribute('position') as THREE.BufferAttribute, na = p.g.getAttribute('normal') as THREE.BufferAttribute;
        const P = pa.array as Float32Array, N = na.array as Float32Array, m = p.map;
        for (let i = 0; i < m.length; i++) { const o = m[i] * 3, d = i * 3; P[d] = src[o]; P[d + 1] = src[o + 1]; P[d + 2] = src[o + 2]; N[d] = nrm[o]; N[d + 1] = nrm[o + 1]; N[d + 2] = nrm[o + 2]; }
        pa.needsUpdate = na.needsUpdate = true;
      } else p.g.computeVertexNormals();
      p.g.computeBoundingSphere();
    });
  }

  // ---------- textures ----------
  private texSize(P: Piece) {
    const { sg, rg } = this.doc!.built;
    const big = Math.max(P.maxx - P.minx + 1, (P.nrows * sg) / rg);
    const pxS = Math.max(8, Math.min(24, Math.floor(2048 / big)));
    return { pxS, pxR: (pxS * sg) / rg };
  }

  private drawTexture(part: Part) {
    const P = part.P, mesh = part.mesh; const { pxS, pxR } = this.texSize(P);
    const { curPiece, progress, selected } = this.knit;
    const isCur = P.name === curPiece; const inProgress = isCur && progress < P.total;
    const sel = selected && selected.piece === P.name ? selected : null;
    setFabricState(part.fab, inProgress ? progress : null, sel ? sel.ord : null);
    const on = (inProgress || !!sel) && !mesh.graph; // graph meshes have no flat texture to paint on
    (part.fab.cloth.uniforms.uOvOn as THREE.IUniform).value = on ? 1 : 0;
    if (!on) return;
    const W = Math.ceil(mesh.W * pxS), H = Math.ceil(mesh.H * pxR);
    const cv = part.canvas; if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; part.tex.dispose(); }
    const ctx = cv.getContext('2d')!; ctx.clearRect(0, 0, W, H);
    const ox = (P.minx - 0.5 - mesh.x0) * pxS, oy = H - P.nrows * pxR;
    const geo = pieceXY(P, ox, oy, pxS, pxR, !!mesh.band);
    // in a band texture each row is stretched to full width, so stitch width varies by row
    const ext = mesh.band ? rowExtents(P).map((e) => e.w) : null;
    const W0 = ext ? Math.max(...ext) : 0;
    const swFor = (r: number) => (ext ? (pxS * W0) / ext[Math.max(0, Math.min(P.nrows - 1, r))] : pxS);
    drawOverlay(ctx, P, isCur ? progress : Infinity, selected, geo.X, geo.Y, swFor, pxR);
    part.tex.needsUpdate = true;
  }

  private refreshTexture(name: string) {
    const part = this.parts.find((p) => p.P.name === name);
    if (part) this.drawTexture(part);
  }

  // ---------- camera ----------
  /** Size of the free area not covered by floating UI. */
  private free() {
    const h = this.host, i = this.insets;
    const W = h.clientWidth, H = h.clientHeight;
    if (!W || !H) return { w: 1.3, h: 1, W: 1.3, H: 1 };
    const fw = W - i.l - i.r, fh = H - i.t - i.b;
    return fw > W * 0.35 && fh > H * 0.2 ? { w: fw, h: fh, W, H } : { w: W, h: H, W, H };
  }
  private aspect() { const f = this.free(); return f.w / f.h; }
  private fitDist(w: number, h: number, fov: number) {
    const t = 2 * Math.tan((fov * Math.PI) / 360); const f = this.free();
    // the vertical fov spans the whole (virtual) frame, of which the free area is f.h
    const vH = f.H + Math.abs(this.offY());
    return (Math.max(h, w / this.aspect()) * 1.12 * (vH / f.h)) / t;
  }
  private offX() { const f = this.free(); return f.w === f.W ? 0 : this.insets.l - this.insets.r; }
  private offY() { const f = this.free(); return f.h === f.H ? 0 : this.insets.t - this.insets.b; }
  /** Shift the projection so its centre sits in the middle of the free area. */
  private applyViewOffset(w: number, h: number) {
    const dx = this.offX(), dy = this.offY();
    const FW = w + Math.abs(dx), FH = h + Math.abs(dy);
    this.camera.aspect = FW / FH;
    if (dx || dy) this.camera.setViewOffset(FW, FH, dx < 0 ? -dx : 0, dy < 0 ? -dy : 0, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }
  private camPreset(mode: ViewMode, focusBox?: Box): Cam {
    if (mode === 'pieces') {
      const b = focusBox || this.flatBounds || { x0: -20, x1: 20, z0: -20, z1: 20 };
      return { target: new THREE.Vector3((b.x0 + b.x1) / 2, MAT_Y, (b.z0 + b.z1) / 2), dist: this.fitDist(b.x1 - b.x0, b.z1 - b.z0, 22), phi: 0.012, theta: 0, fov: 22 };
    }
    // shoes: look down at the foot forms from in front and to the side
    if (this.sim && this.sim.feet && this.sim.feet.length) return { target: new THREE.Vector3(TABLE.c[0], TABLE.top + 2, TABLE.c[2]), dist: 34 / Math.min(1, this.aspect() * 0.9), phi: 0.95, theta: 0.7, fov: 38 };
    if (this.sim && this.sim.useTable) return { target: new THREE.Vector3(TABLE.c[0], TABLE.top - 4, TABLE.c[2] - 6), dist: 80 / Math.min(1, this.aspect() * 0.9), phi: 1.05, theta: 0.45, fov: 38 };
    const P = this.posAligned; let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    if (P) for (let i = 0; i < P.length; i += 3) for (let q = 0; q < 3; q++) { mn[q] = Math.min(mn[q], P[i + q]); mx[q] = Math.max(mx[q], P[i + q]); }
    if (!(mx[0] > mn[0])) { mn = [-10, 0, -5]; mx = [10, 30, 5]; }
    const c = mn.map((v, i) => (v + mx[i]) / 2);
    if (mode === 'aligned') return { target: new THREE.Vector3(c[0], c[1], 0), dist: this.fitDist(mx[0] - mn[0] + 6, mx[1] - mn[1] + 6, 38), phi: 1.22, theta: 0.6, fov: 38 };
    const size = Math.max(Math.min(mx[0] - mn[0], 42), mx[1] - mn[1], 12);
    return { target: new THREE.Vector3(c[0] * 0.3, c[1] - (mx[1] - mn[1] > 20 ? 1.5 : 0), 0), dist: this.fitDist(size, size, 38), phi: 1.36, theta: 0.45, fov: 38 };
  }
  private tweenCam(to: Cam, dur = 1.3) {
    const c = this.cam;
    const from = { target: c.target.clone(), dist: c.dist, phi: c.phi, theta: c.theta, fov: c.fov };
    let dTh = to.theta - from.theta; dTh = ((((dTh + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
    this.camTween = { from, to: { ...to, theta: from.theta + dTh }, t0: performance.now(), dur: dur * 1000 };
  }
  private applyCam() {
    const c = this.cam, cam = this.camera;
    cam.position.set(c.target.x + c.dist * Math.sin(c.phi) * Math.sin(c.theta), c.target.y + c.dist * Math.cos(c.phi), c.target.z + c.dist * Math.sin(c.phi) * Math.cos(c.theta));
    cam.fov = c.fov; cam.near = Math.max(0.5, c.dist * 0.02); cam.far = c.dist * 6 + 500; cam.updateProjectionMatrix();
    cam.lookAt(c.target);
  }

  // ---------- modes + transitions ----------
  private animateTo(target: Float32Array, lift: number, dur: number, done?: () => void) {
    const from = new Float32Array(this.sim.pos); const n = this.parts.length;
    this.tween = { from, to: target, lift, t0: performance.now(), dur: dur * 1000, stagger: Math.min(0.35, 0.6 / Math.max(1, n)), done };
  }
  private startSim() { this.sim.reset(); this.simT = 0; this.simRunning = true; this.updateStatus(); }
  private applyFades(instant = false) {
    const m = this.mode; const f = this.fades;
    f.form.t = m === 'pieces' || this.firm ? 0 : 1; f.mat.t = m === 'pieces' ? 1 : 0; f.labels.t = f.mat.t;
    f.table.t = !this.firm && m !== 'pieces' && this.sim && this.sim.useTable ? 1 : 0;
    if (instant) Object.values(f).forEach((x) => { x.v = x.t; });
  }
  private updateStatus() {
    const s = this.sim; const el = this.statusEl; if (!s) return;
    if (this.mode === 'pieces') { el.textContent = `${s.parts.length} piece${s.parts.length > 1 ? 's' : ''} on a 1″ grid · ${matchMedia('(pointer: coarse)').matches ? 'pinch to zoom' : 'drag to pan, scroll to zoom'}, tap a stitch`; return; }
    if (this.mode === 'aligned') { el.textContent = `Pieces lined up where they'll be sewn · drag to orbit, two fingers to pan`; return; }
    const T = this.simT; let txt: string;
    if (!this.simRunning && this.posAssembled) txt = 'Drag the fabric to tug it · drag around it to orbit';
    else {
      const active = (this.doc!.seams || []).filter((x) => !x.hidden && s.stageOf(x.stage, T) > 0 && s.stageOf(x.stage, T) < 1).sort((a, b) => a.stage - b.stage);
      const last = active[active.length - 1];
      txt = last ? `Sewing the ${last.a.split('.')[0].replace(/_/g, ' ')} in place…` : T < s.tGrav + 1.5 ? 'Seams closed — letting it hang…' : 'Settling…';
    }
    if (el.textContent !== txt) el.textContent = txt;
  }

  private frame() {
    const host = this.host; const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return;
    const R = this.R;
    const resized = R.domElement.width !== Math.floor(w * R.getPixelRatio()) || R.domElement.height !== Math.floor(h * R.getPixelRatio());
    if (!this.sized || resized) {
      R.setSize(w, h); this.applyViewOffset(w, h);
      if (!this.sized || this.firm) {
        this.sized = true;
        const to = this.focusPreset() ?? this.camPreset(this.mode);
        // A flight in progress lands on the reframed view instead.
        if (this.camTween) this.camTween.to = { ...to, theta: this.camTween.to.theta, ...(this.firm ? { phi: this.camTween.to.phi } : {}) };
        else if (this.firm) Object.assign(this.cam, { target: to.target, dist: to.dist });
        else Object.assign(this.cam, to);
      }
    }
    const now = performance.now(); const dt = Math.min(0.1, (now - (this.lastT || now)) / 1000); this.lastT = now;
    const s = this.sim;
    if (s && this.tween) {
      const tw = this.tween; const u = Math.min(1, (now - tw.t0) / tw.dur); const P = s.pos; const n = this.parts.length;
      this.parts.forEach((part, i) => {
        const span = n > 1 ? 1 - tw.stagger : 1;
        const lu = n > 1 ? Math.min(1, Math.max(0, (u - (tw.stagger * i) / (n - 1)) / span)) : u;
        const e = ease(lu); const up = Math.sin(Math.PI * e) * tw.lift;
        const a = part.offset * 3, b = (part.offset + part.mesh.local.length) * 3;
        for (let k = a; k < b; k += 3) {
          P[k] = tw.from[k] + (tw.to[k] - tw.from[k]) * e;
          P[k + 1] = tw.from[k + 1] + (tw.to[k + 1] - tw.from[k + 1]) * e + up;
          P[k + 2] = tw.from[k + 2] + (tw.to[k + 2] - tw.from[k + 2]) * e;
        }
      });
      this.markDirty();
      if (u >= 1) { const d = tw.done; this.tween = null; d?.(); }
    } else if (s && !this.simRunning && (s.grab || now < this.relaxUntil) && this.mode === 'assembled') {
      for (let k = 0; k < 2; k++) s.step(1 / 60, { assembleT: Math.max(this.simT, s.settleT) });
      this.markDirty(); this.updateGrabDot();
    } else if (s && this.simRunning) {
      for (let k = 0; k < 3; k++) { this.simT += 1 / 60; s.step(1 / 60, { assembleT: this.simT }); }
      if (this.simT > s.settleT) { this.simRunning = false; this.posAssembled = new Float32Array(s.pos); }
      this.markDirty(); this.updateStatus(); this.updateGrabDot();
    }
    // camera
    if (this.camTween) {
      const ct = this.camTween; const u = Math.min(1, (now - ct.t0) / ct.dur); const e = ease(u);
      this.cam.target.lerpVectors(ct.from.target, ct.to.target, e);
      this.cam.dist = ct.from.dist + (ct.to.dist - ct.from.dist) * e;
      this.cam.phi = ct.from.phi + (ct.to.phi - ct.from.phi) * e;
      this.cam.theta = ct.from.theta + (ct.to.theta - ct.from.theta) * e;
      this.cam.fov = ct.from.fov + (ct.to.fov - ct.from.fov) * e;
      if (u >= 1) this.camTween = null;
    }
    this.applyCam();
    // fades
    Object.values(this.fades).forEach((f) => {
      f.v += (f.t - f.v) * Math.min(1, dt * 5); if (Math.abs(f.t - f.v) < 0.002) f.v = f.t;
      f.mats.forEach((m, i) => { m.opacity = f.v * f.base[i]; m.visible = f.v > 0.01; });
    });
    // seam threads
    if (!this.firm && s && this.seamAttr && this.seamLines && this.seamMat) {
      const SS = s.seams, P = s.pos, A = this.seamAttr.array as Float32Array;
      for (let i = 0; i < SS.length; i++) { A[i * 3] = P[SS[i] * 3]; A[i * 3 + 1] = P[SS[i] * 3 + 1]; A[i * 3 + 2] = P[SS[i] * 3 + 2]; }
      this.seamAttr.needsUpdate = true;
      this.seamLines.visible = this.showSeams && !(this.mode === 'assembled' && !this.simRunning && !this.tween);
      this.seamMat.opacity = this.mode === 'pieces' ? 0.3 : 0.85;
    }
    if (this.dirtyTex.size && this.parts.length) { this.dirtyTex.forEach((n) => this.refreshTexture(n)); this.dirtyTex.clear(); }
    this.updateFuzz(h);
    R.render(this.scene, this.camera);
  }

  /** Stray fibres only show when stitches are big enough on screen to see them. */
  private updateFuzz(hPx: number) {
    if (!this.doc) return;
    const pxPerIn = hPx / (2 * this.cam.dist * Math.tan((this.cam.fov * Math.PI) / 360));
    const on = pxPerIn / this.doc.built.sg > 5;
    if (on === this.fuzzOn) return;
    this.fuzzOn = on; this.parts.forEach((p) => p.shells.forEach((m) => { m.visible = on && p.meshes[0].visible && !p.fab.cloth.transparent; }));
  }

  private updateGrabDot() {
    const g = this.sim?.grab;
    this.grabDot.visible = !!g;
    if (g) this.grabDot.position.set(g.target[0], g.target[1], g.target[2]);
  }

  // ---------- input: 2D on the mat, orbit around the form ----------
  private setupInput() {
    const el = this.R.domElement; el.style.touchAction = 'none';
    const pts = new Map<number, [number, number]>();
    let last2: { d: number; ang: number; mid: [number, number] } | null = null, moved = 0, downAt: [number, number] | null = null;
    let hoverT = 0;
    const worldPerPx = () => (2 * this.cam.dist * Math.tan((this.cam.fov * Math.PI) / 360)) / el.clientHeight;
    const camR = new THREE.Vector3(), camU = new THREE.Vector3();
    const pan = (dx: number, dy: number) => {
      const k = worldPerPx();
      if (this.mode === 'pieces') {
        // on the mat: slide across the table
        const th = this.cam.theta;
        this.cam.target.x -= (Math.cos(th) * dx + Math.sin(th) * dy) * k;
        this.cam.target.z -= (-Math.sin(th) * dx + Math.cos(th) * dy) * k;
      } else {
        // around the form: slide in the screen plane
        camR.setFromMatrixColumn(this.camera.matrixWorld, 0); camU.setFromMatrixColumn(this.camera.matrixWorld, 1);
        this.cam.target.addScaledVector(camR, -dx * k).addScaledVector(camU, dy * k);
      }
    };
    // trackpads send a stream of small wheel events for a two-finger drag (and ctrl+wheel for a pinch);
    // mouse wheels send big notches. Once a stream looks like a trackpad, keep treating it as one.
    let padUntil = 0;
    const isPad = (e: WheelEvent) => {
      const now = performance.now();
      if (e.deltaMode === 0 && (e.deltaX !== 0 || !Number.isInteger(e.deltaY) || Math.abs(e.deltaY) < 16)) padUntil = now + 400;
      else if (e.deltaMode !== 0 || Math.abs(e.deltaY) >= 50) padUntil = 0;
      return now < padUntil;
    };
    const zoom = (f: number) => { const lim = this.mode === 'pieces' ? [6, 900] : [this.firm ? 3 : 15, 260]; this.cam.dist = Math.min(lim[1], Math.max(lim[0], this.cam.dist * f)); };
    const ray = (cx: number, cy: number) => {
      const r = el.getBoundingClientRect();
      this.raycaster.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), this.camera);
      return this.raycaster;
    };
    const hits = (cx: number, cy: number) => (this.parts.length ? ray(cx, cy).intersectObjects(this.parts.flatMap((p) => p.meshes.filter((mesh) => mesh.visible && !p.fab.cloth.transparent)), false) : []);
    let grabbing: { plane: THREE.Plane } | null = null;
    const down = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); this.camTween = null; moved = 0; downAt = [e.clientX, e.clientY];
      if (pts.size === 2) { last2 = null; if (grabbing) { this.sim.endGrab(); grabbing = null; } }
      if (pts.size === 1 && !this.firm && this.mode === 'assembled' && this.sim && !this.tween) {
        const h = hits(e.clientX, e.clientY)[0];
        if (h && h.face) {
          const part = h.object.userData.part as Part; const f = h.face; const P = this.sim.pos;
          let best = f.a, bd = Infinity;
          const mp = part.map;
          [f.a, f.b, f.c].map((v) => (mp ? mp[v] : v)).forEach((v) => {
            const gi = (part.offset + v) * 3;
            const d = (P[gi] - h.point.x) ** 2 + (P[gi + 1] - h.point.y) ** 2 + (P[gi + 2] - h.point.z) ** 2;
            if (d < bd) { bd = d; best = v; }
          });
          const g = this.sim.startGrab(part.offset + best);
          if (g) {
            const n = new THREE.Vector3(); this.camera.getWorldDirection(n);
            grabbing = { plane: new THREE.Plane().setFromNormalAndCoplanarPoint(n, new THREE.Vector3(...(g.target as [number, number, number]))) };
            el.style.cursor = 'grabbing';
          }
        }
      }
    };
    const move = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) {
        if (e.pointerType !== 'mouse') return;
        if (this.mode !== 'assembled') { el.style.cursor = this.mode === 'pieces' ? 'grab' : ''; return; }
        if (++hoverT % 3) return;
        el.style.cursor = hits(e.clientX, e.clientY).length ? 'grab' : '';
        return;
      }
      const [px, py] = pts.get(e.pointerId)!; pts.set(e.pointerId, [e.clientX, e.clientY]);
      const dx = e.clientX - px, dy = e.clientY - py; moved += Math.abs(dx) + Math.abs(dy);
      if (pts.size === 1 && grabbing) {
        const v = new THREE.Vector3();
        if (ray(e.clientX, e.clientY).ray.intersectPlane(grabbing.plane, v)) { const t = this.sim.grab?.target; if (t) { t[0] = v.x; t[1] = v.y; t[2] = v.z; } }
        return;
      }
      if (pts.size === 1) {
        if (this.mode === 'pieces') pan(dx, dy);
        else { this.cam.theta -= dx * 0.008; this.cam.phi = Math.min(2.9, Math.max(0.15, this.cam.phi - dy * 0.008)); }
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]), ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
        const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        if (last2) {
          zoom(last2.d / d);
          if (this.mode === 'pieces') { let da = ang - last2.ang; da = Math.atan2(Math.sin(da), Math.cos(da)); this.cam.theta -= da; }
          // two fingers dragging together pan, in every view
          pan(mid[0] - last2.mid[0], mid[1] - last2.mid[1]);
        }
        last2 = { d, ang, mid };
      }
    };
    const up = (e: PointerEvent) => {
      if (grabbing) { this.sim.endGrab(); grabbing = null; el.style.cursor = ''; this.relaxUntil = performance.now() + 4000; }
      const was = pts.size; pts.delete(e.pointerId); if (pts.size < 2) last2 = null;
      if (was === 1 && moved < 6 && downAt) this.pick(hits(e.clientX, e.clientY));
    };
    const cancel = (e: PointerEvent) => { pts.delete(e.pointerId); last2 = null; };
    const wheel = (e: WheelEvent) => {
      e.preventDefault(); this.camTween = null;
      const pad = isPad(e);
      if (e.ctrlKey) zoom(1 + e.deltaY * 0.01); // pinch on a trackpad
      else if (pad || e.shiftKey) pan(-e.deltaX, -e.deltaY); // two-finger drag on a trackpad
      else zoom(1 + e.deltaY * 0.0012); // mouse wheel
    };
    el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', cancel);
    el.addEventListener('wheel', wheel, { passive: false });
    this.cleanup.push(() => {
      el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', cancel); el.removeEventListener('wheel', wheel);
    });
  }

  private pick(hits: THREE.Intersection[]) {
    for (const h of hits) {
      const part = h.object.userData.part as Part;
      const st = part.map ? this.faceToStitch(part, h) : this.uvToStitch(part, h.uv);
      if (st) { this.cb.onPick(st); return; }
    }
  }

  private faceToStitch(part: Part, h: THREE.Intersection): Stitch | null {
    if (!h.face || !part.map) return null;
    const P = this.sim.pos; let best = -1, bd = Infinity;
    [h.face.a, h.face.b, h.face.c].forEach((r) => {
      const v = part.map![r], gi = (part.offset + v) * 3;
      const d = (P[gi] - h.point.x) ** 2 + (P[gi + 1] - h.point.y) ** 2 + (P[gi + 2] - h.point.z) ** 2;
      if (d < bd) { bd = d; best = v; }
    });
    const st = part.mesh.sts[best] as Stitch | undefined; if (!st) return null;
    const { curPiece, progress } = this.knit;
    if (st.piece === curPiece && progress < part.P.total && st.ord >= progress) return null;
    return st;
  }

  private uvToStitch(part: Part, uv?: THREE.Vector2): Stitch | null {
    if (!uv) return null;
    const P = part.P, m = part.mesh; let xs: number, ys: number;
    if (m.band) {
      ys = m.y0 + uv.y * m.H; const r = Math.max(0, Math.min(P.nrows - 1, Math.round(ys)));
      let lo = Infinity, hi = -Infinity; P.rows[r].stitches.forEach((s) => { lo = Math.min(lo, s.x); hi = Math.max(hi, s.x); });
      xs = lo - 0.5 + uv.x * (hi - lo + 1);
    } else { xs = m.x0 + uv.x * m.W; ys = m.y0 + uv.y * m.H; }
    const r = Math.round(ys); if (r < 0 || r >= P.nrows) return null;
    let best: Stitch | null = null, bd = Infinity;
    P.rows[r].stitches.forEach((s) => { const d = Math.abs(s.x - xs); if (d < bd) { bd = d; best = s; } });
    if (!best || bd > 0.8) return null;
    const { curPiece, progress } = this.knit;
    if ((best as Stitch).piece === curPiece && progress < P.total && (best as Stitch).ord >= progress) return null; // not knitted yet
    return best;
  }
}
