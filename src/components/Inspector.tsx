import { useEffect, useRef, useState } from 'react';
import type { KnitDoc, Stitch } from '../knit';
import { ANIM_H, ANIM_PERIOD_MS, ANIM_W, drawAnim } from '../draw/anim';
import { stitchName } from '../draw/stitches';

interface Props { doc: KnitDoc; stitch: Stitch | null; gotoLine: (n: number) => void }

export function Inspector({ doc, stitch: s, gotoLine }: Props) {
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

  if (!s) return <div className="card" id="inspector"><p className="muted">Tap any stitch to see what it is and how it's made.</p></div>;

  const P = doc.built.pieces[s.piece]; const row = P.rows[s.row];
  const rsLook = s.op === 'bo' ? 'a chain along the edge' : s.t === 'k' ? 'a V (knit side)' : 'a bump (purl side)';
  const parents = s.parents.length ? `${s.parents.length} loop${s.parents.length > 1 ? 's' : ''} from row ${s.row - 1}` : 'none — this is the foundation row';
  const holds = s.children?.length ? ` Holds ${s.children.length} stitch${s.children.length > 1 ? 'es' : ''} in the next row.` : s.top ? ' Bound off on the top edge.' : '';
  const srcLine = (doc.expanded.split('\n')[s.line - 1] || '').trim();

  return (
    <div className="card" id="inspector">
      <div className="insp">
        <canvas id="anim" ref={canvas} style={{ width: ANIM_W, height: ANIM_H }} />
        <div className="insp-text">
          <h4>{stitchName(s, P)}</h4>
          <p>{P.name}, row {s.row} ({row.dir === 'CO' ? 'foundation' : row.dir}), stitch {s.inRow + 1} of {row.stitches.length} in work order.</p>
          <p>Pulled through: {parents}.{holds}</p>
          <p>On the right side it shows as {rsLook}.</p>
          <p className="step">{step}</p>
          <p className="muted">
            From line <a href="#" onClick={(e) => { e.preventDefault(); gotoLine(s.line); }}>{s.line}</a>: <code>{srcLine}</code>
          </p>
        </div>
      </div>
    </div>
  );
}
