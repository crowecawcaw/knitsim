import { useEffect, useRef, useState } from 'react';
import type { Piece, Stitch } from '../knit';
import { curRowIndex, needleState, stitchName } from '../draw/stitches';

interface Props {
  piece: Piece | null;
  progress: number;
  setProgress: (p: number) => void;
  onInspect: (st: Stitch) => void;
}

/** Scrubber, step/play buttons and the "what's next" row description. */
export function KnitControls({ piece: P, progress, setProgress, onInspect }: Props) {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(8);
  const live = useRef({ progress, speed, P });
  live.current = { progress, speed, P };

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      const { progress: p, speed: v, P: piece } = live.current;
      if (!piece) return;
      const next = Math.min(piece.total, p + v);
      setProgress(next);
      if (next >= piece.total) setPlaying(false);
    }, 50);
    return () => clearInterval(id);
  }, [playing, setProgress]);

  useEffect(() => { setPlaying(false); }, [P]);

  const total = P?.total ?? 0;
  const prog = Math.min(progress, total);

  const rowPrev = () => {
    if (!P) return; const r = curRowIndex(P, progress); const fo = P.rows[r].firstOrd;
    setProgress(progress > fo ? fo : r > 0 ? P.rows[r - 1].firstOrd : 0);
  };
  const rowNext = () => {
    if (!P) return; const r = curRowIndex(P, progress);
    setProgress(r + 1 < P.rows.length ? P.rows[r + 1].firstOrd : P.total);
  };
  const togglePlay = () => {
    if (!P) return;
    if (!playing && progress >= P.total) setProgress(0);
    setPlaying(!playing);
  };

  return (
    <>
      <div className="scrub">
        <input type="range" id="scrub" min={0} max={total} value={prog} aria-label="Knitting progress" onChange={(e) => setProgress(+e.target.value)} />
      </div>
      <div className="ctrls">
        <button className="btn" title="Previous row" onClick={rowPrev}>⏮ row</button>
        <button className="btn" title="Previous stitch" onClick={() => setProgress(Math.max(0, prog - 1))}>◀ st</button>
        <button className="btn primary" onClick={togglePlay}>{playing ? '❚❚ Pause' : '▶ Knit'}</button>
        <button className="btn" title="Next stitch" onClick={() => setProgress(Math.min(total, prog + 1))}>st ▶</button>
        <button className="btn" title="Next row" onClick={rowNext}>row ⏭</button>
        <label>speed <input type="range" min={1} max={60} value={speed} style={{ width: 70 }} onChange={(e) => setSpeed(+e.target.value)} /></label>
        <span id="scrubLabel">{P ? `${P.name}: ${prog.toLocaleString()} / ${total.toLocaleString()} sts` : ''}</span>
      </div>
      <div className="gap" />
      <div className="card" id="rowinfo"><RowInfo P={P} progress={progress} onInspect={onInspect} /></div>
    </>
  );
}

function RowInfo({ P, progress, onInspect }: { P: Piece | null; progress: number; onInspect: (st: Stitch) => void }) {
  if (!P) return <>No pieces yet.</>;
  if (progress >= P.total) {
    return (
      <>
        <b>{P.name} finished</b> — {P.nrows - 1} rows, {P.total.toLocaleString()} stitches, {P.widthIn.toFixed(1)}″ × {P.heightIn.toFixed(1)}″.
        {P.top && ` ${P.gather ? 'Gathered' : 'Bound off'} ${P.top.map((s) => s.length).join(' + ')} sts.`}
        <br /><span className="muted">Drag the slider back to watch it knit, needles and all. Tap any stitch on any piece to inspect it.</span>
      </>
    );
  }
  const { row, nextSt, worked, parents } = needleState(P, progress);
  const rtl = row.dir !== 'WS';
  return (
    <>
      <b>{row.desc}</b><br />
      Next: <b>{stitchName(nextSt, P)}</b> — stitch {progress - row.firstOrd + 1} of {row.stitches.length},{' '}
      {row.dir === 'CO' ? 'casting on' : `working ${rtl ? 'right → left' : 'left → right'} as seen from the right side`}.<br />
      <span className="muted">
        Right needle holds {worked.length}; left needle holds {parents.size}. Line {row.line} ·{' '}
        <a href="#" onClick={(e) => { e.preventDefault(); if (nextSt) onInspect(nextSt); document.getElementById('inspector')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }}>
          how is this stitch made?
        </a>
      </span>
    </>
  );
}
