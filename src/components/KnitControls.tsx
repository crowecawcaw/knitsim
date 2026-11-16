import { useEffect, useRef, useState } from 'react';
import type { Piece, Stitch } from '../knit';
import { curRowIndex, needleState, stitchName } from '../draw/stitches';

interface Props {
  piece: Piece | null;
  progress: number;
  setProgress: (p: number) => void;
  onInspect: (st: Stitch) => void;
  /** shrunk to a pill: just play and the scrubber */
  mini: boolean;
  onToggleMini: () => void;
}

const CHEV_DOWN = <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const CHEV_UP = <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 15l6-6 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;

/** Scrubber, step/play buttons and the "what's next" row description. */
export function KnitControls({ piece: P, progress, setProgress, onInspect, mini, onToggleMini }: Props) {
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
        {playing
          ? <svg viewBox="0 0 24 24" width="22" height="22"><rect x="6" y="5" width="4" height="14" rx="1.2" fill="currentColor" /><rect x="14" y="5" width="4" height="14" rx="1.2" fill="currentColor" /></svg>
          : <svg viewBox="0 0 24 24" width="22" height="22"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" fill="currentColor" /></svg>}
      </button>
      {mini ? (
        <>
          {scrub}
          <button className="icon-btn small" title="Show the full player" aria-label="Show the full player" aria-expanded={false} onClick={onToggleMini}>{CHEV_UP}</button>
        </>
      ) : (
      <div className="player-main">
        <div className="player-top">
          <div className="rowinfo" id="rowinfo"><RowInfo P={P} progress={progress} onInspect={onInspect} /></div>
          <div className="steppers">
            <button className="icon-btn small" title="Previous row" aria-label="Previous row" onClick={rowPrev}>⏮</button>
            <button className="icon-btn small" title="Previous stitch" aria-label="Previous stitch" onClick={() => setProgress(Math.max(0, prog - 1))}>‹</button>
            <button className="icon-btn small" title="Next stitch" aria-label="Next stitch" onClick={() => setProgress(Math.min(total, prog + 1))}>›</button>
            <button className="icon-btn small" title="Next row" aria-label="Next row" onClick={rowNext}>⏭</button>
            <button className="speed" title="Playback speed" onClick={() => setSpeed(speed >= 32 ? 2 : speed * 2)}>{speed / 8}×</button>
            <button className="icon-btn small collapse" title="Shrink the player" aria-label="Shrink the player" aria-expanded={true} onClick={onToggleMini}>{CHEV_DOWN}</button>
          </div>
        </div>
        {scrub}
      </div>
      )}
    </div>
  );
}

function RowInfo({ P, progress, onInspect }: { P: Piece | null; progress: number; onInspect: (st: Stitch) => void }) {
  if (!P) return <span className="muted">Nothing to knit yet.</span>;
  const name = P.name.replace(/_/g, ' ');
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
