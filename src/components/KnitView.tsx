import { useEffect, useMemo, useRef, useState } from 'react';
import type { Stitch } from '../knit';
import { toProse } from '../knit/prose';
import { shareLink, type ViewMode } from '../urlState';
import { Viewer, type ViewerHandle } from './Viewer';
import { Params } from './Params';
import { Inspector } from './Inspector';
import { ProjectBar } from './ProjectBar';
import { WrittenPattern, stopsOf } from './WrittenPattern';
import { IconClose, IconNext, IconPrev } from './Icons';
import { spellOut } from '../knit/prose';
import { useDoc, type ProjectViewProps } from './project';

const NO_INSETS = { t: 0, b: 0, r: 0 };

/**
 * The knitter's interface: the pattern is the page. A small preview shows the piece at the step
 * you tapped; tap the preview to open it full screen and step through the pattern there.
 */
export function KnitView({ project, saved, saveState, view, onView, onChange, onSaveCopy, onBack }: ProjectViewProps) {
  const { code, params } = project;
  const { doc, runCode } = useDoc(code, params);
  const prose = useMemo(() => toProse(doc, runCode), [doc, runCode]);
  const stops = useMemo(() => stopsOf(prose), [prose]);

  const [sel, setSel] = useState<string | null>(null);
  const stop = stops.find((s) => s.id === sel) ?? null;
  const names = doc.built.order.filter((p) => p.nrows).map((p) => p.name);
  const pieceName = stop && names.includes(stop.piece) ? stop.piece : names[0] ?? null;
  const piece = pieceName ? doc.built.pieces[pieceName] : null;
  const row = stop && piece ? piece.rows[Math.min(stop.row, piece.rows.length - 1)] : null;
  const progress = piece ? (row ? Math.min(piece.total, row.firstOrd + row.order.length) : piece.total) : 0;

  // the preview: small beside the pattern, or full screen
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

  const select = (id: string) => setSel(id === sel ? null : id);
  const idx = stop ? stops.indexOf(stop) : -1;
  const go = (d: number) => {
    const next = stops[Math.max(0, Math.min(stops.length - 1, idx + d))];
    if (next) {
      setSel(next.id);
      document.querySelector(`[data-step="${next.id}"]`)?.scrollIntoView({ block: 'center' });
    }
  };

  const errors = doc.errors.filter((e) => e.level === 'error').length;
  const settings = doc.params.length > 0
    ? <Params
        params={doc.params}
        onSet={(name, v) => onChange({ params: { ...params, [name]: v } })}
        onReset={(name) => { const p = { ...params }; delete p[name]; onChange({ params: p }); }}
      />
    : <p className="muted small">This pattern has no adjustable size or yarn.</p>;

  const caption = stop ? `${stop.label}` : piece ? 'Finished piece' : '';
  const pieceTitle = pieceName ? pieceName.replace(/_/g, ' ') : '';
  const words = stop ? spellOut(stop.text, stop.round) ?? stop.text : null;

  return (
    <div className={'kv' + (big ? ' kv-big' : '')}>
      <ProjectBar
        name={project.name} saved={saved} saveState={saveState}
        ui="knit" onUi={(ui) => onView({ ui })}
        onBack={onBack} onSaveCopy={onSaveCopy}
        link={() => shareLink(code, params, view)}
      />
      <div className="kv-body">
        <main className="kv-pattern">
          <WrittenPattern prose={prose} errors={errors} settings={settings} selected={sel} onSelect={select} />
        </main>

        <aside className="kv-preview" aria-label="Preview of the piece">
          <div className="kv-stage">
            <Viewer ref={viewer} doc={doc} mode={mode} showSeams={big && bigMode !== 'pieces'} knit={knit}
              onPick={(st) => big && setPicked({ doc, st })} panelOpen={false} chrome={big ? { t: 70, b: 150, r: 0 } : NO_INSETS} />
            {!big && <button className="kv-tap" aria-label="Enlarge the preview" onClick={() => setBig(true)} />}
          </div>
          {!big && (
            <div className="kv-cap">
              <strong className="cap">{pieceTitle}</strong>
              <span>{caption}</span>
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
                <button className="icon-btn" aria-label="Previous step" disabled={idx <= 0 && !!stop} onClick={() => (stop ? go(-1) : setSel(stops[0]?.id ?? null))}><IconPrev /></button>
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
  );
}
