import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Piece, Stitch } from '../knit';
import { spellOut, toProse } from '../knit/prose';
import { shareLink, type ViewMode } from '../urlState';
import { Viewer, type ViewerHandle } from './Viewer';
import { Params } from './Params';
import { Inspector } from './Inspector';
import { ProjectBar } from './ProjectBar';
import { WrittenPattern, stopsOf } from './WrittenPattern';
import { IconClose, IconNext, IconPrev } from './Icons';
import { useDoc, type ProjectViewProps } from './project';

const NO_INSETS = { t: 0, b: 0, r: 0 };
/** where the eye reads: this far down the scrolling pattern */
const READ_AT = 0.35;

/** stitches knitted by the end of row `r` */
const endOf = (P: Piece, r: number) => { const row = P.rows[Math.min(r, P.rows.length - 1)]; return row ? row.firstOrd + row.order.length : 0; };

interface ReadPos { piece: string | null; progress: number; id: string | null }
const TOP: ReadPos = { piece: null, progress: Infinity, id: null };

/**
 * The knitter's interface: the pattern is the page. Scrolling it knits the preview along: the step at the
 * reading line, and how far through it you are, decide how many stitches are worked. Tapping a step reads it
 * in plain words; tapping the preview opens it full screen to step through the pattern there.
 */
export function KnitView({ project, saved, saveState, view, onView, onChange, onSaveCopy, onBack }: ProjectViewProps) {
  const { code, params } = project;
  const { doc, runCode } = useDoc(code, params);
  const prose = useMemo(() => toProse(doc, runCode), [doc, runCode]);
  const stops = useMemo(() => stopsOf(prose), [prose]);
  const names = doc.built.order.filter((p) => p.nrows).map((p) => p.name);

  // ---- where the reader is: from scrolling, or pinned to a tapped step until they scroll on
  const scroller = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<ReadPos>(TOP);
  const [sel, setSel] = useState<string | null>(null);
  const [pinned, setPinned] = useState(false);
  const pinTop = useRef(0);

  const measure = useCallback(() => {
    const el = scroller.current; if (!el) return;
    if (pinned) {
      if (Math.abs(el.scrollTop - pinTop.current) < 40) return;
      setPinned(false);
    }
    const box = el.getBoundingClientRect();
    const line = box.top + box.height * READ_AT;
    let cur: HTMLElement | null = null;
    for (const u of el.querySelectorAll<HTMLElement>('[data-piece]')) {
      if (u.getBoundingClientRect().top <= line) cur = u; else break;
    }
    // above the first step: the finished piece, as a picture of what you'll make
    if (!cur) { setPos((p) => (p === TOP ? p : TOP)); return; }
    const P = doc.built.pieces[cur.dataset.piece!]; if (!P) return;
    const r = cur.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (line - r.top) / Math.max(1, r.height)));
    const from = +cur.dataset.from!, to = +cur.dataset.to!;
    const a = from > 0 ? endOf(P, from - 1) : 0, b = endOf(P, to);
    const next: ReadPos = { piece: P.name, progress: Math.round(a + f * (b - a)), id: cur.dataset.step! };
    setPos((p) => (p.piece === next.piece && p.progress === next.progress && p.id === next.id ? p : next));
  }, [doc, pinned]);

  useEffect(() => {
    const el = scroller.current; if (!el) return;
    let raf = 0;
    const on = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure); };
    on();
    el.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    return () => { cancelAnimationFrame(raf); el.removeEventListener('scroll', on); window.removeEventListener('resize', on); };
  }, [measure]);

  const stop = stops.find((s) => s.id === sel) ?? null;
  const usePin = pinned && stop;
  const pieceName = usePin ? stop.piece : pos.piece && names.includes(pos.piece) ? pos.piece : names[0] ?? null;
  const piece = pieceName ? doc.built.pieces[pieceName] : null;
  const progress = !piece ? 0 : usePin ? endOf(piece, stop.row) : Math.min(pos.progress, piece.total);

  const pin = (id: string | null) => {
    setSel(id);
    setPinned(id !== null);
    pinTop.current = scroller.current?.scrollTop ?? 0;
  };
  const select = (id: string) => pin(id === sel ? null : id);

  // ---- the preview: small beside the pattern, or full screen
  const [big, setBig] = useState(false);
  const [bigMode, setBigMode] = useState<ViewMode>('pieces');
  const mode: ViewMode = big ? bigMode : 'pieces';
  const [picked, setPicked] = useState<{ doc: unknown; st: Stitch } | null>(null);
  const selected = picked && picked.doc === doc ? picked.st : null;
  const knit = useMemo(() => ({ curPiece: pieceName, progress, selected }), [pieceName, progress, selected]);

  const viewer = useRef<ViewerHandle>(null);
  // keep the piece being read in frame
  useEffect(() => { if (pieceName && mode === 'pieces') viewer.current?.focusPiece(pieceName); }, [pieceName, mode, doc, big]);
  useEffect(() => {
    if (!big) { setPicked(null); return; }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setBig(false); };
    window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc);
  }, [big]);

  // full screen: step through the pattern, and keep the page in step behind it
  const idx = stop ? stops.indexOf(stop) : -1;
  const go = (d: number) => {
    const next = stops[idx < 0 ? 0 : Math.max(0, Math.min(stops.length - 1, idx + d))]; if (!next) return;
    const el = scroller.current;
    const li = el?.querySelector<HTMLElement>(`[data-step="${next.id}"]`);
    if (el && li) {
      // put the end of the step on the reading line, where scrolling would show the same thing
      const box = el.getBoundingClientRect();
      el.scrollTop += li.getBoundingClientRect().bottom - (box.top + box.height * READ_AT);
    }
    pin(next.id);
  };

  const errors = doc.errors.filter((e) => e.level === 'error').length;
  const pattern = useMemo(() => (
    <WrittenPattern
      prose={prose} errors={errors} selected={sel} here={usePin ? null : pos.id} onSelect={select}
      settings={doc.params.length > 0
        ? <Params
            params={doc.params}
            onSet={(name, v) => onChange({ params: { ...params, [name]: v } })}
            onReset={(name) => { const p = { ...params }; delete p[name]; onChange({ params: p }); }}
          />
        : <p className="muted small">This pattern has no adjustable size or yarn.</p>}
    />
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [prose, errors, sel, usePin, pos.id, doc.params, params]);

  const here = usePin ? stop : stops.find((s) => s.id === pos.id) ?? null;
  const pieceTitle = pieceName ? pieceName.replace(/_/g, ' ') : '';
  const caption = here && piece && progress < piece.total ? here.label : 'Finished piece';
  const words = stop ? spellOut(stop.text, stop.round) ?? stop.text : null;

  return (
    <div className={'kv' + (big ? ' kv-big' : '')}>
      <ProjectBar
        name={project.name} saved={saved} saveState={saveState}
        ui="knit" onUi={(ui) => onView({ ui })}
        onBack={onBack} onSaveCopy={onSaveCopy}
        link={() => shareLink(code, params, view)}
      />
      <div className="kv-body" ref={scroller}>
        <div className="kv-grid">
        <main className="kv-pattern">{pattern}</main>

        <aside className="kv-preview" aria-label="Preview of the piece">
          <div className="kv-stage">
            <Viewer ref={viewer} doc={doc} mode={mode} showSeams={big && bigMode !== 'pieces'} knit={knit}
              onPick={(st) => big && setPicked({ doc, st })} panelOpen={false} chrome={big ? { t: 70, b: 150, r: 0 } : NO_INSETS} />
            {!big && <button className="kv-tap" aria-label="Enlarge the preview" onClick={() => setBig(true)} />}
          </div>
          {!big && (
            <div className="kv-cap">
              <strong className="cap">{pieceTitle}</strong>
              <span>{caption}{piece && progress > 0 && progress < piece.total ? ` · ${progress} of ${piece.total} sts worked` : ''}</span>
            </div>
          )}
          {big && (
            <>
              <div className="kv-bigtop">
                <div className="seg" role="tablist" aria-label="Show">
                  <button role="tab" aria-selected={bigMode === 'pieces'} className={bigMode === 'pieces' ? 'on' : ''} onClick={() => setBigMode('pieces')}>This piece</button>
                  <button role="tab" aria-selected={bigMode === 'assembled'} className={bigMode === 'assembled' ? 'on' : ''} onClick={() => setBigMode('assembled')}>Finished</button>
                </div>
                <button className="icon-btn kv-close" aria-label="Close the preview" onClick={() => setBig(false)}><IconClose size={20} /></button>
              </div>
              <div className="kv-bigbottom">
                <button className="icon-btn" aria-label="Previous step" disabled={idx === 0} onClick={() => go(-1)}><IconPrev /></button>
                <div className="kv-bigtext">
                  <strong className="cap">{pieceTitle}{stop ? ` · ${stop.label}` : ''}</strong>
                  <p>{words ?? 'Step through the pattern with the arrows, or tap a stitch to see how it’s made.'}</p>
                </div>
                <button className="icon-btn" aria-label="Next step" disabled={idx >= stops.length - 1} onClick={() => go(1)}><IconNext /></button>
              </div>
              {selected && <div className="kv-inspect"><Inspector doc={doc} stitch={selected} onClose={() => setPicked(null)} /></div>}
            </>
          )}
        </aside>
        </div>
      </div>
    </div>
  );
}
