// The looping "how is this stitch made?" animation in the inspector.
import type { Piece, Stitch } from '../knit';
import { drawStitch, shade, stitchName, tint } from './stitches';

type Ctx = CanvasRenderingContext2D;
type Pt = [number, number];

export const ANIM_W = 320, ANIM_H = 210, ANIM_PERIOD_MS = 4200;

function yarnPath(ctx: Ctx, pts: Pt[], col: string, w: number) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const stroke = (c: string, lw: number) => {
    ctx.strokeStyle = c; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  };
  stroke(shade(col, 0.4), w); stroke(col, w * 0.65); stroke(tint(col, 0.35), w * 0.2);
}
/** inverted U from left base to right base through head */
function loopPts(cx: number, baseY: number, headY: number, half: number, frac = 1): Pt[] {
  const pts: Pt[] = []; const N = 30;
  for (let i = 0; i <= N; i++) {
    const a = Math.PI * (i / N);
    pts.push([cx - Math.cos(a) * half, baseY - (baseY - headY) * Math.sin(a) ** 0.6]);
  }
  if (frac < 1) return pts.slice(0, Math.max(2, Math.round(pts.length * frac)));
  return pts;
}
function needleDraw(ctx: Ctx, x1: number, y1: number, x2: number, y2: number) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(60,35,15,0.35)'; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(x1, y1 + 2); ctx.lineTo(x2, y2 + 2); ctx.stroke();
  ctx.strokeStyle = '#a8763f'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.strokeStyle = '#d4a46a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x1, y1 - 1.5); ctx.lineTo(x2, y2 - 1.5); ctx.stroke();
}

/** Draw frame t ∈ [0,1) of the animation for stitch s; returns the caption for this step. */
export function drawAnim(ctx: Ctx, t: number, s: Stitch, P: Piece): string {
  ctx.clearRect(0, 0, ANIM_W, ANIM_H);
  ctx.fillStyle = '#ede2cc'; ctx.fillRect(0, 0, ANIM_W, ANIM_H);
  const col = s.color; const row = P.rows[s.row];
  const act = row.dir === 'WS' ? (s.t === 'k' ? 'p' : 'k') : s.t; // action from the knitter's side
  const op = s.op;
  const ease = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x));
  const ph = (a: number, b: number) => ease((t - a) / (b - a));
  // fabric below
  ctx.globalAlpha = 0.5;
  for (let i = -3; i <= 3; i++) for (let j = 0; j < 2; j++) drawStitch(ctx, { t: act, color: col, op: 'n' }, 160 + i * 30, 182 + j * 22, 28, 22, 'RS', false);
  ctx.globalAlpha = 1;
  const baseY = 165, headY = 112;
  let step = '';
  if (op === 'co' || op === 'pu') {
    const k = ph(0.1, 0.7);
    needleDraw(ctx, 20, 92, 300, 92);
    yarnPath(ctx, [[300, 40], [230, 60], [180, 92]], col, 8);
    for (let i = 0; i < 3; i++) { const f = i < 2 ? 1 : k; if (f > 0.05) yarnPath(ctx, loopPts(110 + i * 40, 140, 80, 14, f), col, 9); }
    step = op === 'co'
      ? (t < 0.7 ? 'Form a loop with the working yarn and slide it onto the needle.' : 'One new stitch is on the needle — repeat for each cast-on stitch.')
      : (t < 0.7 ? 'Insert the needle under the edge stitch and pull a loop of yarn through.' : 'The picked-up loop becomes a live stitch for the neckband.');
  } else if (op === 'bo') {
    const lift = ph(0.2, 0.6), off = ph(0.6, 0.85);
    needleDraw(ctx, 200, 90, 320, 90);
    // two loops on right needle; lift the first (rightmost) over the second
    yarnPath(ctx, loopPts(230, 140, 78, 14), col, 9);
    const fx = 270 - 40 * lift, fy = -lift * 30 + off * 40;
    if (off < 1) yarnPath(ctx, loopPts(fx, 140 + fy, 78 + fy - lift * 10, 14 + lift * 8), shade(col, 0.1), 9);
    needleDraw(ctx, 10 + 120 * lift * (1 - off), 130 - 50 * lift, 130 + 60 * lift * (1 - off), 100 - 30 * lift);
    step = t < 0.2 ? 'Work two stitches so both sit on the right needle.'
      : t < 0.6 ? 'Lift the first stitch over the second with the left needle tip…'
      : '…and drop it off. One stitch is bound off; the edge forms a chain.';
  } else {
    const nPar = op === 'dec' ? 2 : 1;
    const insert = ph(0.05, 0.25), wrap = ph(0.28, 0.45), pull = ph(0.48, 0.72), slide = ph(0.75, 0.92);
    const parX = nPar === 2 ? [146, 174] : [160];
    // left needle holds parents
    const lnx = -slide * 90;
    needleDraw(ctx, 0 + lnx, headY + 2, 200 + lnx - slide * 30, headY + 2);
    const drawParents = (front: boolean) => parX.forEach((px) => {
      const pts = loopPts(px, baseY, headY, 13);
      if (front) yarnPath(ctx, pts.slice(9, 22), col, 9);
      else yarnPath(ctx, pts, shade(col, 0.08), 9);
    });
    const newX = op === 'inc' ? [148, 174] : [160];
    const newTop = headY - 6 - pull * 50;
    const drawNew = () => newX.forEach((nx, i) => {
      const f = op === 'inc' && i === 1 ? ph(0.6, 0.8) : 1;
      if (pull <= 0.01 || f <= 0) return;
      yarnPath(ctx, loopPts(nx, headY + 4, headY + 4 - (headY + 4 - newTop) * f, 12), tint(col, 0.08), 9);
    });
    // right needle
    const tipX = 300 - insert * 150 + pull * 60, tipY = headY + (act === 'k' ? 10 : -10) * (1 - pull) - pull * 50;
    const rn = () => needleDraw(ctx, tipX, tipY, 330, tipY + (act === 'k' ? 30 : -20) * (1 - pull) + 10);
    drawParents(false);
    if (act === 'k') { if (t < 0.48) { drawParents(true); rn(); } else { drawNew(); rn(); } }
    else if (t < 0.48) { rn(); drawParents(true); } else { drawNew(); drawParents(true); rn(); }
    // working yarn wrap
    if (wrap > 0 && pull < 0.6) {
      const a0 = -Math.PI / 2, pts: Pt[] = []; const N = 20;
      for (let i = 0; i <= N * wrap; i++) { const a = a0 + (i / N) * Math.PI * 1.6; pts.push([tipX + 4 + Math.cos(a) * 12, tipY + Math.sin(a) * 12]); }
      if (pts.length > 1) yarnPath(ctx, [[300, act === 'k' ? 60 : 160], ...pts], col, 7);
    } else yarnPath(ctx, [[300, act === 'k' ? 60 : 160], [tipX + 14, tipY]], col, 7);
    const verb = act === 'k' ? 'knit' : 'purl';
    const ins = act === 'k'
      ? 'Insert the right needle into the front of the loop, left to right (yarn at the back).'
      : 'Bring yarn to the front; insert the right needle into the front of the loop, right to left.';
    const insDec = act === 'k'
      ? (s.lean === 'l' ? 'Slip two stitches knitwise one at a time, then insert the left needle into their fronts (ssk).' : 'Insert the right needle through two loops at once, as if to knit (k2tog).')
      : 'Insert the right needle through two loops at once, as if to purl (p2tog).';
    const insInc = 'Lift the bar between stitches onto the left needle, then work into the back of it (make 1).';
    step = t < 0.27 ? (op === 'dec' ? insDec : op === 'inc' ? insInc : ins)
      : t < 0.47 ? 'Wrap the working yarn around the right needle tip.'
      : t < 0.74 ? (act === 'k' ? 'Pull the new loop through toward you — it passes in front of the old loop.' : 'Push the new loop through to the back — the old loop’s top stays in front as a bump.')
      : (op === 'dec' ? 'Slide both old loops off: two stitches became one.' : op === 'inc' ? 'Two new loops from one: the row grows by a stitch.' : `Slide the old loop off. One ${verb} stitch done.`);
  }
  ctx.fillStyle = '#1e2b3c'; ctx.font = '600 12px "DM Sans", system-ui, sans-serif';
  ctx.fillText(stitchName(s, P).toUpperCase(), 12, 20);
  return step;
}
