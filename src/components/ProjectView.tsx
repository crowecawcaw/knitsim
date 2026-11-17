import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { runPattern, type ParamValues, type Piece, type Stitch, type KnitDoc } from '../knit';
import agentPrompt from '../knit/agentPrompt.txt?raw';
import { shareLink, type ViewMode, type ViewState } from '../urlState';
import { Editor, type EditorHandle } from './Editor';
import { Params } from './Params';
import { Checks } from './Checks';
import { Inspector } from './Inspector';
import { Viewer, type ViewerHandle } from './Viewer';
import { KnitControls } from './KnitControls';
import { WrittenPattern } from './WrittenPattern';
import { curRowIndex } from '../draw/stitches';
import { isStacked, STACKED_QUERY } from '../layout';
import { Card } from './Card';
import { loadPref, savePref } from '../prefs';

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

interface KnitRaw { doc: KnitDoc | null; curPiece: string | null; progress: number; selected: Stitch | null }

const MODE_LABEL: Record<ViewMode, string> = { pieces: 'Pieces', aligned: 'Laid out', assembled: 'Assembled' };

export interface WorkingProject { name: string; code: string; params: ParamValues }

interface Props {
  project: WorkingProject;
  /** false for a shared link that hasn't been saved to the browser's projects */
  saved: boolean;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  view: ViewState;
  onView: (p: Partial<ViewState>) => void;
  onChange: (p: Partial<WorkingProject>) => void;
  /** save a shared pattern as a project of one's own */
  onSaveCopy: () => void;
  onBack: () => void;
}

/** One project: the 3D simulation or the written pattern, with its parameters and source drawer. */
export function ProjectView({ project, saved, saveState, view: vs, onView, onChange, onSaveCopy, onBack }: Props) {
  const { code, params } = project;
  const { mode, view, drawer } = vs;
  const [showSeams, setShowSeams] = useState(true);

  // the pattern is re-run shortly after typing / dragging a param stops
  const runCode = useDebounced(code, 400);
  const runParams = useDebounced(params, 100);
  const doc = useMemo(() => runPattern(runCode, runParams), [runCode, runParams]);

  // knitting progress + selection, re-validated against the current doc
  const [raw, setRaw] = useState<KnitRaw>({ doc: null, curPiece: null, progress: Infinity, selected: null });
  const names = doc.built.order.filter((p) => p.nrows).map((p) => p.name);
  const curPiece = raw.curPiece && names.includes(raw.curPiece) ? raw.curPiece : names[0] ?? null;
  const piece: Piece | null = curPiece ? doc.built.pieces[curPiece] : null;
  const progress = piece ? Math.min(curPiece === raw.curPiece ? raw.progress : Infinity, piece.total) : 0;
  const selected = raw.doc === doc ? raw.selected : null;
  const knit = useMemo(() => ({ curPiece, progress, selected }), [curPiece, progress, selected]);

  const setProgress = useCallback((p: number) => setRaw((r) => ({ ...r, doc, curPiece, progress: p })), [doc, curPiece]);
  const selectPiece = (name: string) => {
    if (name !== curPiece) setRaw({ doc, curPiece: name, progress: Infinity, selected });
    viewer.current?.focusPiece(name);
  };
  const selectStitch = useCallback((st: Stitch) => setRaw({
    doc, selected: st, curPiece: st.piece,
    progress: st.piece === curPiece ? progress : doc.built.pieces[st.piece].total,
  }), [doc, curPiece, progress]);
  const clearStitch = () => setRaw((r) => ({ ...r, selected: null }));
  /** from the written pattern: knit up to the end of that row and show it */
  const showRow = (name: string, rowIndex: number) => {
    const P = doc.built.pieces[name]; const row = P?.rows[rowIndex]; if (!row) return;
    setRaw({ doc, curPiece: name, progress: Math.min(P.total, row.firstOrd + row.order.length), selected: null });
    onView({ view: 'sim' });
    requestAnimationFrame(() => viewer.current?.focusPiece(name));
  };

  // the project cards can be hidden. On wide screens they start shown (unless hidden last time);
  // on small screens they are a sheet over the knit, one sheet at a time
  const panelDefault = () => !isStacked() && loadPref('panel') !== 'hidden';
  const [sheet, setSheet] = useState(panelDefault);
  useEffect(() => {
    const mq = window.matchMedia(STACKED_QUERY);
    const on = () => setSheet(panelDefault());
    mq.addEventListener('change', on); return () => mq.removeEventListener('change', on);
  }, []);
  useEffect(() => { if (selected && isStacked()) setSheet(false); }, [selected]);
  const toggleSheet = () => {
    if (isStacked()) { if (!sheet) clearStitch(); }
    else savePref('panel', sheet ? 'hidden' : 'shown');
    setSheet(!sheet);
  };
  // the player can shrink to a small pill
  const [dockMini, setDockMini] = useState(() => loadPref('dock') === 'mini');
  const toggleDock = () => { savePref('dock', dockMini ? 'full' : 'mini'); setDockMini(!dockMini); };

  // the source drawer holds everything technical: the DSL and the checks
  const drawerOpen = drawer !== null;
  const editor = useRef<EditorHandle>(null);
  const viewer = useRef<ViewerHandle>(null);
  const gotoLine = useCallback((n: number) => {
    onView({ drawer: 'code' });
    requestAnimationFrame(() => editor.current?.gotoLine(n));
  }, [onView]);

  const errs = doc.errors.filter((e) => e.level === 'error').length;
  const failed = doc.checks.filter((c) => !c.ok).length;
  const activeLine = piece && progress < piece.total ? piece.rows[curRowIndex(piece, progress)].line : 0;

  const [copied, setCopied] = useState('');
  const copy = async (what: 'prompt' | 'link') => {
    try { await navigator.clipboard.writeText(what === 'prompt' ? agentPrompt.trim() : shareLink(code, params, vs)); setCopied(what); }
    catch { setCopied('failed'); }
    setTimeout(() => setCopied(''), 2000);
  };

  const sim = view === 'sim';

  return (
    <div className={'app' + (drawerOpen ? ' drawer-open' : '') + (sim ? '' : ' view-written')}>
      <header className="topbar">
        <div className="brand project-brand">
          <button className="icon-btn back-btn" title="All projects" aria-label="All projects" onClick={onBack}>
            <svg viewBox="0 0 24 24" width="20" height="20"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <div className="title-wrap">
            {saved
              ? <input className="title-input" aria-label="Project name" value={project.name} onChange={(e) => onChange({ name: e.target.value })} />
              : <h1 className="title-static">{project.name}</h1>}
            <p>
              {!saved ? 'Shared pattern · not saved'
                : saveState === 'saving' ? 'Saving…'
                : saveState === 'error' ? <span className="bad">Couldn’t save</span>
                : 'Saved in this browser'}
            </p>
          </div>
        </div>
        <div className="topbar-break" aria-hidden="true" />
        <div className="pill-seg view-seg" role="tablist" aria-label="Show">
          <button role="tab" aria-selected={sim} className={sim ? 'on' : ''} onClick={() => onView({ view: 'sim' })}>
            <span className="wide-only">Simulation</span><span className="narrow-only">3D</span>
          </button>
          <button role="tab" aria-selected={!sim} className={!sim ? 'on' : ''} onClick={() => onView({ view: 'written' })}>
            Written<span className="wide-only"> pattern</span>
          </button>
        </div>
        {sim && (
          <div className="pill-seg mode-seg" role="tablist" aria-label="Layout">
            {(['assembled', 'aligned', 'pieces'] as ViewMode[]).map((m) => (
              <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? 'on' : ''} onClick={() => onView({ mode: m })}>
                {MODE_LABEL[m]}
              </button>
            ))}
          </div>
        )}
        <div className="top-actions">
          {!saved && <button className="soft-btn save-btn" onClick={onSaveCopy}>Save to my projects</button>}
          <button className={'icon-btn' + (sheet ? ' on' : '')} title={sheet ? 'Hide settings and pieces' : 'Show settings and pieces'} aria-label="Settings and pieces" aria-expanded={sheet} onClick={toggleSheet}>
            <svg viewBox="0 0 24 24" width="20" height="20"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><circle cx="16" cy="7" r="2" fill="none" stroke="currentColor" strokeWidth="1.8" /><circle cx="10" cy="17" r="2" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
          </button>
          {sim && (
            <button className="icon-btn" title="Fit to view" aria-label="Fit to view" onClick={() => viewer.current?.fit()}>
              <svg viewBox="0 0 24 24" width="20" height="20"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          )}
          <button className="icon-btn" title="Copy share link" aria-label="Copy share link" onClick={() => copy('link')}>
            {copied === 'link'
              ? <svg viewBox="0 0 24 24" width="20" height="20"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              : <svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 15V4M8 8l4-4 4 4M5 13v6h14v-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
          </button>
          <button className="dark-btn" aria-label="Pattern source" onClick={() => onView({ drawer: drawerOpen ? null : 'code' })}>
            <span className="mono">&lt;/&gt;</span> <span className="label">{drawerOpen ? 'Close' : 'Source'}</span>
            {(errs > 0 || failed > 0) && !drawerOpen && <span className="dot-alert" title="The pattern has problems" />}
          </button>
        </div>
      </header>

      <main className="stage">
        <Viewer ref={viewer} doc={doc} mode={mode} showSeams={showSeams} knit={knit} onPick={selectStitch} panelOpen={sheet} dockMini={dockMini} />

        {!sim && <WrittenPattern doc={doc} code={runCode} panelOpen={sheet} onShowRow={showRow} onGotoLine={gotoLine} />}

        <aside className={'float float-left' + (sheet ? ' open' : '')}>
          <Card id="project" icon="◍" title="Make it yours">
            {doc.params.length > 0
              ? <Params
                  params={doc.params}
                  onSet={(name, v) => onChange({ params: { ...params, [name]: v } })}
                  onReset={(name) => { const p = { ...params }; delete p[name]; onChange({ params: p }); }}
                />
              : <p className="muted small">This pattern has no settings. Add <code>param</code> lines in the source to make sizes, colours and lengths adjustable.</p>}
            {doc.source && <a className="soft-link" href={doc.source} target="_blank" rel="noopener">Original pattern ↗</a>}
          </Card>
          {sim && names.length > 0 && (
            <Card id="pieces" icon="▦" title="Pieces">
              <div className="chips">
                {names.map((n) => <button key={n} className={'chip' + (n === curPiece ? ' on' : '')} onClick={() => selectPiece(n)}>{n.replace(/_/g, ' ')}</button>)}
              </div>
              {mode !== 'pieces' && (
                <label className="switch">
                  <input type="checkbox" checked={showSeams} onChange={(e) => setShowSeams(e.target.checked)} />
                  <span className="track" /> Show seams
                </label>
              )}
            </Card>
          )}
        </aside>

        {sim && selected && (
          <aside className="float float-right">
            <Inspector doc={doc} stitch={selected} onClose={clearStitch} />
          </aside>
        )}

        {sim && (
          <div className={'dock' + (dockMini ? ' mini' : '')}>
            <KnitControls piece={piece} progress={progress} setProgress={setProgress} onInspect={selectStitch} mini={dockMini} onToggleMini={toggleDock} />
          </div>
        )}
      </main>

      <div className="scrim" onClick={() => onView({ drawer: null })} />
      <aside className="drawer" aria-hidden={!drawerOpen}>
        <div className="drawer-head">
          <h2>Pattern<span className="wide-only"> source</span></h2>
          <div className="seg-mini">
            <button className={drawer === 'code' ? 'on' : ''} onClick={() => onView({ drawer: 'code' })}>Code</button>
            <button className={drawer === 'checks' ? 'on' : ''} onClick={() => onView({ drawer: 'checks' })}>
              Checks{errs + failed > 0 && <span className="badge">{errs + failed}</span>}
            </button>
          </div>
          <button className="icon-btn" aria-label="Close" onClick={() => onView({ drawer: null })}>✕</button>
        </div>
        <div className="drawer-body">
          <div className={drawer === 'checks' ? 'hidden' : ''}>
            <Editor ref={editor} value={code} onChange={(v) => onChange({ code: v })} problems={doc.errors} activeLine={activeLine} />
            <div className="row">
              <button className="soft-btn" onClick={() => copy('prompt')}>{copied === 'prompt' ? 'Copied ✓' : 'Copy prompt for an AI agent'}</button>
            </div>
            <details>
              <summary>Syntax reference</summary>
              <pre className="ref">{agentPrompt}</pre>
            </details>
          </div>
          {drawer === 'checks' && <Checks doc={doc} gotoLine={gotoLine} />}
        </div>
      </aside>
    </div>
  );
}
