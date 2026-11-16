// 2D canvas drawing of stitches, pieces and the knitting-progress overlay.
import type { Piece, Stitch } from '../knit';

type RGB = [number, number, number];
type Ctx = CanvasRenderingContext2D;
export type Side = 'RS' | 'WS';

function hexToRgb(h: string): RGB {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(h: string, t: string | RGB, amt: number) {
  const a = hexToRgb(h), b = typeof t === 'string' ? hexToRgb(t) : t;
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * amt)).join(',')})`;
}
export const shade = (h: string, a: number) => mix(h, [20, 12, 6], a);
export const tint = (h: string, a: number) => mix(h, [255, 250, 240], a);

export type DrawableStitch = Pick<Stitch, 't' | 'color' | 'op'> & Partial<Pick<Stitch, 'lean'>>;

/** cx, cy = centre of stitch cell; w, h = cell size in px */
export function drawStitch(ctx: Ctx, st: DrawableStitch, cx: number, cy: number, w: number, h: number, side: Side, ghost: boolean) {
  const col = st.color;
  let t = st.t;
  if (side === 'WS') t = t === 'k' ? 'p' : 'k';
  if (ghost) {
    ctx.strokeStyle = 'rgba(80,60,40,0.16)'; ctx.lineWidth = Math.max(0.6, w * 0.08);
    ctx.beginPath();
    if (t === 'k') { ctx.moveTo(cx - w * 0.38, cy - h * 0.5); ctx.lineTo(cx, cy + h * 0.45); ctx.lineTo(cx + w * 0.38, cy - h * 0.5); }
    else ctx.ellipse(cx, cy, w * 0.42, h * 0.28, 0, 0, Math.PI * 2);
    ctx.stroke();
    return;
  }
  const lw = w * 0.42;
  ctx.lineCap = 'round';
  if (st.op === 'bo') { // bound-off chain
    ctx.strokeStyle = shade(col, 0.25); ctx.lineWidth = lw * 0.9;
    ctx.beginPath(); ctx.moveTo(cx - w * 0.45, cy - h * 0.05); ctx.quadraticCurveTo(cx, cy - h * 0.45, cx + w * 0.45, cy - h * 0.05); ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = lw * 0.55; ctx.stroke();
    return;
  }
  if (t === 'k') {
    const lean = st.lean === 'l' ? -0.25 : st.lean === 'r' ? 0.25 : 0;
    for (const sx of [-1, 1]) {
      const x0 = cx + sx * w * 0.06, y0 = cy + h * 0.55;
      const x1 = cx + sx * w * 0.36 + lean * w, y1 = cy - h * 0.62;
      ctx.strokeStyle = shade(col, 0.35); ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(cx + sx * w * 0.36, cy + h * 0.1, x1, y1); ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = lw * 0.62; ctx.stroke();
      ctx.strokeStyle = tint(col, 0.35); ctx.lineWidth = lw * 0.22;
      ctx.beginPath(); ctx.moveTo(x0 - sx * w * 0.03, y0 - h * 0.15); ctx.quadraticCurveTo(cx + sx * w * 0.3, cy + h * 0.05, x1 - sx * w * 0.05, y1 + h * 0.2); ctx.stroke();
    }
    if (st.op === 'dec') {
      ctx.strokeStyle = shade(col, 0.2); ctx.lineWidth = lw * 0.5;
      ctx.beginPath(); ctx.moveTo(cx - (st.lean === 'l' ? -1 : 1) * w * 0.4, cy - h * 0.5); ctx.lineTo(cx, cy + h * 0.3); ctx.stroke();
    }
  } else {
    ctx.strokeStyle = shade(col, 0.4); ctx.lineWidth = h * 0.62;
    ctx.beginPath(); ctx.moveTo(cx - w * 0.42, cy + h * 0.08); ctx.quadraticCurveTo(cx, cy - h * 0.5, cx + w * 0.42, cy + h * 0.08); ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = h * 0.42; ctx.stroke();
    ctx.strokeStyle = tint(col, 0.3); ctx.lineWidth = h * 0.14;
    ctx.beginPath(); ctx.moveTo(cx - w * 0.28, cy - h * 0.06); ctx.quadraticCurveTo(cx, cy - h * 0.4, cx + w * 0.28, cy - h * 0.06); ctx.stroke();
  }
  if (st.op === 'co' || st.op === 'pu') {
    ctx.fillStyle = shade(col, 0.15);
    ctx.beginPath(); ctx.ellipse(cx, cy + h * 0.55, w * 0.42, h * 0.2, 0, 0, Math.PI * 2); ctx.fill();
  }
}

/** Per-row extent (in stitch units) of a piece. */
export function rowExtents(P: Piece) {
  return P.rows.map((r) => {
    let lo = Infinity, hi = -Infinity;
    r.stitches.forEach((s) => { lo = Math.min(lo, s.x); hi = Math.max(hi, s.x); });
    return { lo: lo - 0.5, w: hi - lo + 1 };
  });
}

export type XFn = (x: number, r: number) => number;
export type YFn = (r: number) => number;

/** Pixel position of stitches drawn by drawPiece with the same arguments. */
export function pieceXY(P: Piece, ox: number, oy: number, sw: number, sh: number, stretch = false): { X: XFn; Y: YFn } {
  let X: XFn = (x) => ox + (x - P.minx + 0.5) * sw;
  if (stretch) {
    const ext = rowExtents(P);
    const W0 = Math.max(...ext.map((e) => e.w));
    X = (x, r) => ox + ((x - ext[r].lo) / ext[r].w) * W0 * sw;
  }
  return { X, Y: (r) => oy + (P.nrows - 1 - r + 0.5) * sh };
}

/** ox, oy = pixel of (minx-0.5, top of last row); sw, sh = px per stitch / row */
export function drawPiece(ctx: Ctx, P: Piece, ox: number, oy: number, sw: number, sh: number,
  opts: { side?: Side; stretch?: boolean; progress?: number | null } = {}): { X: XFn; Y: YFn } {
  const side = opts.side || 'RS';
  let X: XFn = (x) => ox + (x - P.minx + 0.5) * sw;
  let swOf = (_r: number) => sw;
  if (opts.stretch) { // round pieces in 3D: each round spans the full width of the texture
    const ext = rowExtents(P);
    const W0 = Math.max(...ext.map((e) => e.w));
    X = (x, r) => ox + ((x - ext[r].lo) / ext[r].w) * W0 * sw;
    swOf = (r) => (sw * W0) / ext[r].w;
  }
  const Y: YFn = (r) => oy + (P.nrows - 1 - r + 0.5) * sh;
  const prog = opts.progress;
  // backing (gaps between yarn)
  P.rows.forEach((r) => r.stitches.forEach((s) => {
    if (prog != null && s.ord >= prog) return;
    const w = swOf(r.index);
    ctx.fillStyle = shade(s.color, 0.62);
    ctx.fillRect(X(s.x, r.index) - w / 2 - 0.3, Y(r.index) - sh / 2 - 0.3, w + 0.6, sh + 0.6);
  }));
  for (let ri = 0; ri < P.nrows; ri++) {
    const r = P.rows[ri]; const w = swOf(ri);
    r.stitches.forEach((s) => drawStitch(ctx, s, X(s.x, ri), Y(ri), w, sh, side, prog != null && s.ord >= prog));
  }
  return { X, Y };
}

export const curRowIndex = (P: Piece, progress: number) => {
  let ri = 0;
  for (let k = 0; k < P.rows.length; k++) if (P.rows[k].firstOrd <= progress) ri = k;
  return ri;
};

/** Stitches already worked in the current row, and the loops still on the left needle. */
export function needleState(P: Piece, progress: number) {
  const ri = curRowIndex(P, progress); const row = P.rows[ri];
  const nextSt = row.order[progress - row.firstOrd];
  const worked = row.order.filter((s) => s.ord < progress);
  const parents = new Set<Stitch>();
  row.order.filter((s) => s.ord >= progress).forEach((s) => s.parents.forEach((p) => parents.add(p)));
  return { ri, row, nextSt, worked, parents };
}

/** Needles + current/selected stitch, drawn straight into a piece texture. */
export function drawOverlay(ctx: Ctx, P: Piece, progress: number, selected: Stitch | null, X: XFn, Y: YFn, swFor: (r: number) => number, sh: number) {
  if (progress < P.total) {
    const { ri, row, nextSt, worked, parents } = needleState(P, progress);
    const rtl = row.dir !== 'WS';
    const sw = swFor(ri);
    const needle = (sts: Stitch[], r: number, tipDir: number) => {
      if (!sts.length) return;
      const xs = sts.map((s) => X(s.x, s.row)); const y = Y(r) - sh * 0.55;
      const a = Math.min(...xs) - sw * 0.7, b = Math.max(...xs) + sw * 0.7;
      const L = tipDir < 0 ? a - sw * 1.2 : a - sw * 4, R = tipDir > 0 ? b + sw * 1.2 : b + sw * 4;
      const th = Math.max(4, sw * 0.5);
      ctx.save(); ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(60,35,15,0.4)'; ctx.lineWidth = th + 2; ctx.beginPath(); ctx.moveTo(L, y + 1.5); ctx.lineTo(R, y + 1.5); ctx.stroke();
      ctx.strokeStyle = '#a8763f'; ctx.lineWidth = th; ctx.beginPath(); ctx.moveTo(tipDir < 0 ? L + th * 2 : L, y); ctx.lineTo(tipDir > 0 ? R - th * 2 : R, y); ctx.stroke();
      ctx.strokeStyle = '#d4a46a'; ctx.lineWidth = th * 0.3; ctx.beginPath(); ctx.moveTo(L + th * 2, y - th * 0.2); ctx.lineTo(R - th * 2, y - th * 0.2); ctx.stroke();
      ctx.fillStyle = '#a8763f'; ctx.beginPath();
      if (tipDir < 0) { ctx.moveTo(L - th * 0.6, y); ctx.lineTo(L + th * 2, y - th / 2); ctx.lineTo(L + th * 2, y + th / 2); }
      else { ctx.moveTo(R + th * 0.6, y); ctx.lineTo(R - th * 2, y - th / 2); ctx.lineTo(R - th * 2, y + th / 2); }
      ctx.fill(); ctx.restore();
    };
    needle([...parents], Math.max(0, ri - 1), rtl ? 1 : -1);
    needle(worked, ri, rtl ? -1 : 1);
    if (nextSt) {
      ctx.strokeStyle = '#c0573e'; ctx.lineWidth = Math.max(3, sw * 0.18);
      ctx.strokeRect(X(nextSt.x, ri) - sw / 2, Y(ri) - sh / 2, sw, sh);
    }
  }
  if (selected && selected.piece === P.name) {
    const sw = swFor(selected.row);
    ctx.strokeStyle = '#1d5fa8'; ctx.lineWidth = Math.max(2, sw * 0.14);
    ctx.strokeRect(X(selected.x, selected.row) - sw / 2, Y(selected.row) - sh / 2, sw, sh);
    selected.parents.forEach((p) => {
      const w = swFor(p.row);
      ctx.strokeStyle = 'rgba(29,95,168,0.6)'; ctx.lineWidth = Math.max(1.5, w * 0.1);
      ctx.strokeRect(X(p.x, p.row) - w / 2, Y(p.row) - sh / 2, w, sh);
    });
  }
}

/** What the knitter does to make this stitch (on WS rows the action is the opposite of the RS look). */
export function stitchName(st: Stitch | undefined | null, P?: Piece): string {
  if (!st) return '';
  const base = ({ co: 'cast on', pu: 'pick up', bo: 'bind off' } as Record<string, string>)[st.op];
  if (base) return base;
  const dir = P ? P.rows[st.row].dir : 'RS';
  const act = dir === 'WS' ? (st.t === 'k' ? 'p' : 'k') : st.t;
  if (st.op === 'dec') return act === 'k' ? (st.lean === 'l' ? 'ssk (dec)' : 'k2tog (dec)') : (st.lean === 'l' ? 'ssp (dec)' : 'p2tog (dec)');
  if (st.op === 'inc') return act === 'k' ? 'make 1 (inc)' : 'make 1 purlwise (inc)';
  return act === 'k' ? 'knit' : 'purl';
}
