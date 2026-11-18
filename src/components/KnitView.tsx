import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Piece, Stitch } from '../knit';
import { spellOut, toProse } from '../knit/prose';
import { shareLink, type ViewMode } from '../urlState';
import { Viewer, type ViewerHandle } from './Viewer';
import { Params } from './Params';
import { Inspector } from './Inspector';
import { ProjectBar } from './ProjectBar';
import { PatternHeading, WrittenPattern, stopsOf } from './WrittenPattern';
import { IconClose, IconNext, IconPrev } from './Icons';
import { useDoc, type ProjectViewProps } from './project';

const NO_INSETS = { t: 0, b: 0, r: 0 };
/** where the eye reads: this far down the scrolling pattern */
const READ_AT = 0.35;

/** stitches knitted by the end of row `r` */
const endOf = (P: Piece, r: number) => { const row = P.rows[Math.min(r, P.rows.length - 1)]; return row ? row.firstOrd + row.order.length : 0; };

interface ReadPos { piece: string | null; progress: number; id: string | null; finishing: boolean; seamLine?: number }
const TOP: ReadPos = { piece: null, progress: Infinity, id: null, finishing: false };

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
  const closeButton = useRef<HTMLButtonElement>(null);
  const openButton = useRef<HTMLButtonElement>(null);
  const wasBig = useRef(false);
  const [floating, setFloating] = useState(false);

  // ---- where the reader is: from scrolling, or pinned to a tapped step until they scroll on
  const scroller = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<ReadPos>(TOP);
  const [sel, setSel] = useState<string | null>(null);
  const [pinned, setPinned] = useState(false);
  const pinTop = useRef(0);

  const measure = useCallback(() => {
    const el = scroller.current; if (!el) return;
    const box = el.getBoundingClientRect();
    const readingLine = box.top + box.height * READ_AT;
    const gridStyle = getComputedStyle(el.firstElementChild!);
    const stickyTop = parseFloat(gridStyle.getPropertyValue('--preview-top'));
    const paddingTop = parseFloat(gridStyle.paddingTop);
    setFloating(el.scrollTop >= paddingTop - stickyTop);
    if (pinned) {
      if (Math.abs(el.scrollTop - pinTop.current) < 40) return;
      setPinned(false);
    }

    let next = TOP;
    for (const section of el.querySelectorAll<HTMLElement>('[data-pattern-piece], [data-finishing]')) {
      if (section.getBoundingClientRect().top > readingLine) break;
      if (section.hasAttribute('data-finishing')) {
        next = { ...TOP, finishing: true };
        for (const step of section.querySelectorAll<HTMLElement>('[data-source-line]')) {
          if (step.getBoundingClientRect().top > readingLine) break;
          next = { ...next, seamLine: Number(step.dataset.sourceLine), id: step.dataset.step! };
        }
        break;
      }
      const piece = doc.built.pieces[section.dataset.patternPiece!];
      if (!piece) continue;
      const steps = section.querySelectorAll<HTMLElement>('[data-piece]');
      next = { ...TOP, piece: piece.name, progress: steps.length ? 0 : Infinity };
      for (const step of steps) {
        const rect = step.getBoundingClientRect();
        if (rect.top > readingLine) break;
        const fraction = Math.max(0, Math.min(1, (readingLine - rect.top) / Math.max(1, rect.height)));
        const from = Number(step.dataset.from);
        const before = from > 0 ? endOf(piece, from - 1) : 0;
        const after = endOf(piece, Number(step.dataset.to));
        next = { ...next, progress: Math.round(before + fraction * (after - before)), id: step.dataset.step! };
      }
    }
    setPos((prev) => (
      prev.piece === next.piece && prev.progress === next.progress && prev.id === next.id
        && prev.finishing === next.finishing && prev.seamLine === next.seamLine ? prev : next
    ));
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
  const pieceName = usePin ? stop.piece : pos.piece;
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
  const [choice, setChoice] = useState<{ section: string | null; mode: ViewMode } | null>(null);
  const finishing = !usePin && pos.finishing;
  const section = finishing ? 'finishing' : pieceName ? `piece:${pieceName}` : null;
  const needs3D = finishing || piece?.round || doc.seams.some((s) =>
    (s.kind === 'pickup' || s.kind === 'join') && s.a.split('.')[0] === pieceName);
  const mode: ViewMode = choice && choice.section === section ? choice.mode : !piece || needs3D ? 'assembled' : 'pieces';
  const setMode = (mode: ViewMode) => setChoice({ section, mode });
  useEffect(() => setChoice(null), [section]);
  const [picked, setPicked] = useState<{ doc: unknown; st: Stitch } | null>(null);
  const selected = picked && picked.doc === doc ? picked.st : null;
  const knit = useMemo(() => ({ curPiece: pieceName, progress, selected }), [pieceName, progress, selected]);

  const viewer = useRef<ViewerHandle>(null);
  // keep the piece being read in frame
  useEffect(() => { if (pieceName) viewer.current?.focusPiece(pieceName); else viewer.current?.fit(); }, [pieceName, mode, doc]);
  useEffect(() => {
    if (!big) {
      setPicked(null);
      if (wasBig.current) openButton.current?.focus({ preventScroll: true });
      wasBig.current = false;
      return;
    }
    wasBig.current = true;
    closeButton.current?.focus({ preventScroll: true });
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setBig(false); };
    window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc);
  }, [big]);

  // full screen: step through the pattern, and keep the page in step behind it
  const here = usePin ? stop : stops.find((s) => s.id === pos.id) ?? null;
  const idx = here ? stops.indexOf(here) : -1;
  const go = (d: number) => {
    const next = stops[idx < 0 && finishing ? stops.length - 1 : Math.max(0, Math.min(stops.length - 1, idx + d))]; if (!next) return;
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
        : null}
      version={doc.params.filter((p) => p.name === 'size' || p.type === 'color').map((p) => (
        p.type === 'color' ? <span key={p.name} className="wp-swatch" title={p.label} style={{ background: String(p.value) }} />
          : <span key={p.name} className="wp-version-size">{p.value}</span>
      ))}
    />
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [prose, errors, sel, usePin, pos.id, doc.params, params]);

  const pieceTitle = pieceName ? pieceName.replace(/_/g, ' ') : '';
  const caption = finishing ? 'Finishing' : here ? here.label : piece ? progress < piece.total ? 'Starting piece' : 'Finished piece' : 'Finished project';
  const modes = (
    <div className="seg kv-modes" role="group" aria-label="Preview view">
      <button aria-pressed={mode === 'assembled'} className={mode === 'assembled' ? 'on' : ''} onClick={() => setMode('assembled')}>3D view</button>
      <button aria-pressed={mode === 'pieces'} className={mode === 'pieces' ? 'on' : ''} onClick={() => setMode('pieces')}>Piece view</button>
    </div>
  );
  const words = here ? spellOut(here.text, here.round) ?? here.text : null;

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
        <div className="kv-heading wp" inert={big}><PatternHeading prose={prose} /></div>
        <main className="kv-pattern" inert={big}>{pattern}</main>

        <aside className={'kv-preview' + (floating ? ' kv-floating' : '')} role={big ? 'dialog' : undefined} aria-modal={big || undefined} aria-label="Pattern preview">
          <div className="kv-stage">
            <Viewer ref={viewer} doc={doc} mode={mode} showSeams={finishing} knit={knit} firm seamLine={finishing ? pos.seamLine : undefined}
              onPick={(st) => big && setPicked({ doc, st })} panelOpen={false} chrome={NO_INSETS} />
            {!big && <button className="kv-tap" ref={openButton} aria-label="Enlarge the preview" onClick={() => setBig(true)} />}
          </div>
          {!big && (
            <div className="kv-cap">
              {pieceTitle && <strong className="cap">{pieceTitle}</strong>}
              <span>{caption}{piece && progress > 0 && progress < piece.total ? ` · ${progress} of ${piece.total} sts worked` : ''}</span>
            </div>
          )}
          {big && (
            <>
              <div className="kv-bigtop">
                {modes}
                <button className="icon-btn kv-close" ref={closeButton} aria-label="Close the preview" onClick={() => setBig(false)}><IconClose size={20} /></button>
              </div>
              <div className="kv-bigbottom">
                <button className="icon-btn" aria-label="Previous step" disabled={idx === 0} onClick={() => go(-1)}><IconPrev /></button>
                <div className="kv-bigtext">
                  <strong><span className="cap">{pieceTitle}</span>{here ? ` · ${here.label}` : caption}</strong>
                  <p>{words ?? 'Step through the pattern with the arrows, or tap a stitch to see how it’s made.'}</p>
                </div>
                <button className="icon-btn" aria-label="Next step" disabled={finishing || idx >= stops.length - 1} onClick={() => go(1)}><IconNext /></button>
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
