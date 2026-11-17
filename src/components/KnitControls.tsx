import { useEffect, useRef, useState } from 'react';
import type { Piece, Stitch } from '../knit';
import { curRowIndex, needleState, stitchName } from '../draw/stitches';
import { IconDown, IconNext, IconPause, IconPlay, IconPrev, IconRowNext, IconRowPrev, IconUp } from './Icons';

interface Props {
  piece: Piece | null;
  progress: number;
  setProgress: (p: number) => void;
  onInspect: (st: Stitch) => void;
  /** shrunk to a pill: just play and the scrubber */
  mini: boolean;
  onToggleMini: () => void;
  /** phone: step by row (what a knitter follows), no shrinking */
  compact?: boolean;
}


/** Scrubber, step/play buttons and the "what's next" row description. */
export function KnitControls({ piece: P, progress, setProgress, onInspect, mini, onToggleMini, compact }: Props) {
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

  const pct = total ? (prog / total) * 100 : 0;
  const scrub = (
    <input type="range" id="scrub" className="scrub" min={0} max={total} value={prog} aria-label="Knitting progress"
      style={{ ['--pct' as string]: pct + '%' }} onChange={(e) => setProgress(+e.target.value)} />
  );
  return (
    <div className={'player card' + (mini ? ' mini' : '')}>
      <button className="play" aria-label={playing ? 'Pause' : 'Knit'} title={playing ? 'Pause' : 'Knit'} onClick={togglePlay}>
        {playing ? <IconPause size={compact ? 20 : 22} /> : <IconPlay size={compact ? 20 : 22} />}
      </button>
      {mini ? (
        <>
          {scrub}
          <button className="icon-btn small" title="Show the full player" aria-label="Show the full player" aria-expanded={false} onClick={onToggleMini}><IconUp /></button>
        </>
      ) : (
      <div className="player-main">
        <div className="player-top">
          <div className="rowinfo" id="rowinfo"><RowInfo P={P} progress={progress} onInspect={onInspect} compact={compact} /></div>
          <div className="steppers">
            {compact ? (
              <>
                <button className="icon-btn small" title="Previous row" aria-label="Previous row" onClick={rowPrev}><IconPrev /></button>
                <button className="icon-btn small" title="Next row" aria-label="Next row" onClick={rowNext}><IconNext /></button>
              </>
            ) : (
              <>
                <button className="icon-btn small" title="Previous row" aria-label="Previous row" onClick={rowPrev}><IconRowPrev /></button>
                <button className="icon-btn small" title="Previous stitch" aria-label="Previous stitch" onClick={() => setProgress(Math.max(0, prog - 1))}><IconPrev /></button>
                <button className="icon-btn small" title="Next stitch" aria-label="Next stitch" onClick={() => setProgress(Math.min(total, prog + 1))}><IconNext /></button>
                <button className="icon-btn small" title="Next row" aria-label="Next row" onClick={rowNext}><IconRowNext /></button>
                <button className="speed" title="Playback speed" onClick={() => setSpeed(speed >= 32 ? 2 : speed * 2)}>{speed / 8}×</button>
                <button className="icon-btn small collapse" title="Shrink the player" aria-label="Shrink the player" aria-expanded={true} onClick={onToggleMini}><IconDown /></button>
              </>
            )}
          </div>
        </div>
        {scrub}
      </div>
      )}
    </div>
  );
}

function RowInfo({ P, progress, onInspect, compact }: { P: Piece | null; progress: number; onInspect: (st: Stitch) => void; compact?: boolean }) {
  if (!P) return <span className="muted">Nothing to knit yet.</span>;
  const name = P.name.replace(/_/g, ' ');
  if (compact) {
    if (progress >= P.total) return (
      <>
        <div className="ri-1"><b className="cap">{name}</b> <span className="muted">· {P.nrows - 1} {P.round ? 'rnds' : 'rows'} · {P.widthIn.toFixed(1)}″ × {P.heightIn.toFixed(1)}″</span></div>
        <div className="ri-2 muted">Press play to watch it knit</div>
      </>
    );
    const { row, nextSt } = needleState(P, progress);
    return (
      <>
        <div className="ri-1"><b className="cap">{name}</b> <span className="muted">· {row.dir === 'CO' ? 'cast on' : `${P.round ? 'Rnd' : 'Row'} ${row.index} of ${P.nrows - 1} · ${row.dir}`}</span></div>
        <div className="ri-2 muted">
          <a href="#" onClick={(e) => { e.preventDefault(); if (nextSt) onInspect(nextSt); }}>{stitchName(nextSt, P)}</a>, stitch {progress - row.firstOrd + 1} of {row.stitches.length}
        </div>
      </>
    );
  }
  if (progress >= P.total) {
    return (
      <>
        <b className="cap">{name}</b> <span className="muted">· finished<span className="wide-only"> · {P.nrows - 1} rows · {P.widthIn.toFixed(1)}″ × {P.heightIn.toFixed(1)}″</span></span>
        <div className="muted small">Press play to watch it knit, or tap any stitch to see how it's made.</div>
      </>
    );
  }
  const { row, nextSt } = needleState(P, progress);
  return (
    <>
      <b className="cap">{name}</b> <span className="muted">· {row.desc}</span>
      <div className="muted small">
        Next: {stitchName(nextSt, P)}, stitch {progress - row.firstOrd + 1} of {row.stitches.length} ·{' '}
        <a href="#" onClick={(e) => { e.preventDefault(); if (nextSt) onInspect(nextSt); }}>how is it made?</a>
      </div>
    </>
  );
}
