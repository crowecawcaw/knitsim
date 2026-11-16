import { useEffect, useRef, useState } from 'react';
import type { KnitDoc, Stitch } from '../knit';
import { ANIM_H, ANIM_PERIOD_MS, ANIM_W, drawAnim } from '../draw/anim';
import { stitchName } from '../draw/stitches';

interface Props { doc: KnitDoc; stitch: Stitch | null; onClose: () => void }

export function Inspector({ doc, stitch: s, onClose }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [step, setStep] = useState('');

  useEffect(() => {
    const cv = canvas.current; if (!s || !cv) return;
    const P = doc.built.pieces[s.piece];
    const dpr = window.devicePixelRatio || 1;
    cv.width = ANIM_W * dpr; cv.height = ANIM_H * dpr;
    const ctx = cv.getContext('2d')!;
    const start = performance.now(); let raf = 0;
    const loop = (now: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      setStep(drawAnim(ctx, ((now - start) / ANIM_PERIOD_MS) % 1, s, P));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [doc, s]);

  if (!s) return null;

  const P = doc.built.pieces[s.piece]; const row = P.rows[s.row];
  const rsLook = s.op === 'bo' ? 'a chain along the edge' : s.t === 'k' ? 'a V (knit side)' : 'a bump (purl side)';
  const parents = s.parents.length ? `${s.parents.length} loop${s.parents.length > 1 ? 's' : ''} from row ${s.row - 1}` : 'none — this is the foundation row';
  const holds = s.children?.length ? ` Holds ${s.children.length} stitch${s.children.length > 1 ? 'es' : ''} in the next row.` : s.top ? ' Bound off on the top edge.' : '';

  return (
    <section className="card" id="inspector">
      <div className="card-head">
        <h2><span className="h-ico">✦</span> {stitchName(s, P)}</h2>
        <button className="icon-btn small" aria-label="Close stitch details" onClick={onClose}>✕</button>
      </div>
      <canvas id="anim" ref={canvas} style={{ aspectRatio: `${ANIM_W} / ${ANIM_H}` }} />
      <p className="step">{step}</p>
      <dl className="facts">
        <div><dt>Piece</dt><dd>{P.name.replace(/_/g, ' ')}</dd></div>
        <div><dt>Row</dt><dd>{s.row} {row.dir === 'CO' ? '(cast on)' : `· ${row.dir}`}</dd></div>
        <div><dt>Stitch</dt><dd>{s.inRow + 1} of {row.stitches.length}</dd></div>
      </dl>
      <p className="muted small">Pulled through {parents}.{holds} On the right side it shows as {rsLook}.</p>
    </section>
  );
}
