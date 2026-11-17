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
import { Steps } from './Steps';
import { MoreMenu, type MenuItem } from './MoreMenu';
import { IconCheck, IconChecks, IconCode, IconFit, IconList, IconShare, IconSliders, IconSpark } from './Icons';
import { curRowIndex } from '../draw/stitches';
import { useStacked } from '../layout';
import { Card } from './Card';
import { loadPref, savePref } from '../prefs';

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

interface KnitRaw { doc: KnitDoc | null; curPiece: string | null; progress: number; selected: Stitch | null }

type PhoneTab = 'steps' | 'adjust';
const PHONE_TABS: { key: PhoneTab; label: string }[] = [{ key: 'steps', label: 'Steps' }, { key: 'adjust', label: 'Adjust' }];

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
  const sim = view === 'sim';
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

  const stacked = useStacked();
  // wide screens: the project cards float on the left and can be hidden (remembered)
  const [sheet, setSheet] = useState(() => loadPref('panel') !== 'hidden');
  const toggleSheet = () => { savePref('panel', sheet ? 'hidden' : 'shown'); setSheet(!sheet); };
  // phones: one panel at a time opens above the player, picked from the tab bar under it
  const [phoneTab, setPhoneTab] = useState<PhoneTab | null>(null);
  const pickTab = (t: PhoneTab) => {
    if (selected) clearStitch();
    const next = t === phoneTab && !selected ? null : t;
    setPhoneTab(next);
    if (!sim) return;
    // following the pattern: bring the piece being knitted up close
    if (next === 'steps' && curPiece) viewer.current?.focusPiece(curPiece);
    else if (!next) viewer.current?.fit();
  };
  // the player can shrink to a small pill
  const [dockMini, setDockMini] = useState(() => loadPref('dock') === 'mini');
  const toggleDock = () => { savePref('dock', dockMini ? 'full' : 'mini'); setDockMini(!dockMini); };
  // the knit (and the written pattern) are framed in the space the header and dock leave free
  const topRef = useRef<HTMLElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const [chrome, setChrome] = useState({ t: 0, b: 0, r: 0 });
  useEffect(() => {
    const measure = () => {
      const t = topRef.current?.getBoundingClientRect().bottom ?? 0;
      const d = dockRef.current?.getBoundingClientRect();
      // phones in landscape keep the sheet on the right; everywhere else it sits along the bottom
      const side = !!d && stacked && window.innerWidth > window.innerHeight;
      const b = d && !side ? window.innerHeight - d.top : 0;
      const r = d && side ? window.innerWidth - d.left : 0;
      setChrome((c) => (Math.abs(c.t - t) < 2 && Math.abs(c.b - b) < 2 && Math.abs(c.r - r) < 2 ? c : { t: Math.round(t), b: Math.round(b), r: Math.round(r) }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (topRef.current) ro.observe(topRef.current);
    if (dockRef.current) ro.observe(dockRef.current);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [stacked, sim]);

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
  const problems = errs + failed;
  const activeLine = piece && progress < piece.total ? piece.rows[curRowIndex(piece, progress)].line : 0;

  const [copied, setCopied] = useState('');
  const copy = async (what: 'prompt' | 'link') => {
    try { await navigator.clipboard.writeText(what === 'prompt' ? agentPrompt.trim() : shareLink(code, params, vs)); setCopied(what); }
    catch { setCopied('failed'); }
    setTimeout(() => setCopied(''), 2000);
  };
  // phones get the system share sheet (message a friend); elsewhere the link is copied
  const share = async () => {
    if (stacked && navigator.share) {
      try { await navigator.share({ title: project.name || 'KnitSim pattern', url: shareLink(code, params, vs) }); } catch { /* cancelled */ }
      return;
    }
    copy('link');
  };

  const menu: MenuItem[] = [
    ...(stacked && sim ? [{ label: 'Fit to view', icon: <IconFit />, onClick: () => viewer.current?.fit() }] : []),
    { label: 'Pattern code', icon: <IconCode />, onClick: () => onView({ drawer: 'code' }) },
    { label: 'Checks', icon: <IconChecks />, onClick: () => onView({ drawer: 'checks' }), hint: problems > 0 ? <span className="badge">{problems}</span> : <span className="good">all pass</span> },
    { label: copied === 'prompt' ? 'Copied ✓' : 'Copy prompt for an AI agent', icon: <IconSpark />, onClick: () => copy('prompt') },
  ];

  const adjust = (
    <>
      {doc.params.length > 0
        ? <Params
            params={doc.params}
            onSet={(name, v) => onChange({ params: { ...params, [name]: v } })}
            onReset={(name) => { const p = { ...params }; delete p[name]; onChange({ params: p }); }}
          />
        : <p className="muted small">This pattern has no settings. Add <code>param</code> lines in the source to make sizes, colours and lengths adjustable.</p>}
      {doc.source && <a className="soft-link" href={doc.source} target="_blank" rel="noopener">Original pattern ↗</a>}
    </>
  );
  const seamSwitch = (
    <label className="switch">
      <input type="checkbox" checked={showSeams} onChange={(e) => setShowSeams(e.target.checked)} />
      <span className="track" /> Show seams
    </label>
  );
  const pieces = (
    <>
      <div className="chips">
        {names.map((n) => <button key={n} className={'chip' + (n === curPiece ? ' on' : '')} onClick={() => selectPiece(n)}>{n.replace(/_/g, ' ')}</button>)}
      </div>
      {mode !== 'pieces' && seamSwitch}
    </>
  );
  const steps = <Steps piece={piece} progress={progress} setProgress={setProgress} />;
  const pieceChips = names.length > 1 && (
    <div className="chips chips-row">
      {names.map((n) => <button key={n} className={'chip' + (n === curPiece ? ' on' : '')} onClick={() => selectPiece(n)}>{n.replace(/_/g, ' ')}</button>)}
    </div>
  );

  // the written pattern is its own step list, so on phones it only offers Adjust
  const tabs = sim ? PHONE_TABS : PHONE_TABS.filter((t) => t.key === 'adjust');
  const tab = sim ? phoneTab : phoneTab === 'adjust' ? 'adjust' : null;
  const phonePanel = !stacked ? null
    : sim && selected ? <div className="scroll-y"><Inspector doc={doc} stitch={selected} onClose={clearStitch} /></div>
    : tab === 'steps' ? <>{pieceChips}<div className="scroll-y">{steps}</div></>
    : tab === 'adjust' ? <div className="scroll-y">{adjust}{sim && mode !== 'pieces' && seamSwitch}</div>
    : null;

  return (
    <div className={'app' + (drawerOpen ? ' drawer-open' : '') + (stacked ? ' phone' : '') + (phonePanel ? ' panel-open' : '') + (sim ? '' : ' view-written')}>
      <header className="topbar" ref={topRef}>
        <div className="brand project-brand">
          <button className="icon-btn back-btn" title="All projects" aria-label="All projects" onClick={onBack}>
            <svg viewBox="0 0 24 24" width="20" height="20"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <div className="title-wrap">
            {saved && !stacked
              ? <input className="title-input" aria-label="Project name" value={project.name} onChange={(e) => onChange({ name: e.target.value })} />
              : stacked
                ? <button className="title-btn" onClick={() => pickTab('adjust')} aria-label="Adjust the pattern"><span className="title-name">{project.name}</span></button>
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
          {!saved && <button className="soft-btn save-btn" onClick={onSaveCopy}>Save<span className="wide-only"> to my projects</span></button>}
          {!stacked && (
            <>
              <button className={'icon-btn' + (sheet ? ' on' : '')} title={sheet ? 'Hide settings and pieces' : 'Show settings and pieces'} aria-label="Settings and pieces" aria-expanded={sheet} onClick={toggleSheet}>
                <IconSliders />
              </button>
              {sim && <button className="icon-btn" title="Fit to view" aria-label="Fit to view" onClick={() => viewer.current?.fit()}><IconFit /></button>}
            </>
          )}
          <button className="icon-btn" title="Share a link to this pattern" aria-label="Share" onClick={share}>
            {copied === 'link' ? <IconCheck /> : <IconShare />}
          </button>
          <MoreMenu items={menu} alert={problems > 0} />
        </div>
      </header>
      {copied === 'link' && <div className="toast" role="status">Link copied</div>}

      <main className="stage">
        <Viewer ref={viewer} doc={doc} mode={mode} showSeams={showSeams} knit={knit} onPick={selectStitch} chrome={stacked && !chrome.r && !phonePanel ? { ...chrome, t: chrome.t + 26 } : chrome} panelOpen={!stacked && sheet} />

        {!sim && <WrittenPattern doc={doc} code={runCode} panelOpen={!stacked && sheet} insets={chrome} onShowRow={showRow} onGotoLine={gotoLine} />}

        {!stacked && (
          <aside className={'float float-left' + (sheet ? ' open' : '')}>
            <Card id="project" icon="◍" title="Make it yours">{adjust}</Card>
            {sim && names.length > 0 && <Card id="pieces" icon="▦" title="Pieces">{pieces}</Card>}
            {sim && piece && <Card id="steps" icon="≡" title="Steps"><div className="scroll-y steps-box">{steps}</div></Card>}
          </aside>
        )}

        {!stacked && sim && selected && (
          <aside className="float float-right">
            <Inspector doc={doc} stitch={selected} onClose={clearStitch} />
          </aside>
        )}

        {(sim || stacked) && (
          <div className={'dock' + (!stacked && dockMini ? ' mini' : '') + (phonePanel ? ' has-panel' : '')} ref={dockRef}>
            {stacked ? (
              <div className="sheet card">
                {phonePanel && <div className="sheet-panel">{phonePanel}</div>}
                {sim && <KnitControls piece={piece} progress={progress} setProgress={setProgress} onInspect={selectStitch} mini={false} onToggleMini={toggleDock} compact />}
                <nav className={'tabbar' + (tabs.length === 1 ? ' single' : '')} aria-label="Panels">
                  {tabs.map(({ key, label }) => {
                    const on = tab === key && !(sim && selected);
                    return (
                      <button key={key} className={on ? 'on' : ''} aria-pressed={on} onClick={() => pickTab(key)}>
                        {key === 'steps' ? <IconList size={18} /> : <IconSliders size={18} />}
                        {label}
                      </button>
                    );
                  })}
                </nav>
              </div>
            ) : (
              <KnitControls piece={piece} progress={progress} setProgress={setProgress} onInspect={selectStitch} mini={dockMini} onToggleMini={toggleDock} />
            )}
          </div>
        )}
      </main>

      <div className="scrim" onClick={() => onView({ drawer: null })} />
      <aside className="drawer" aria-hidden={!drawerOpen}>
        <div className="drawer-head">
          <h2>Pattern code</h2>
          <div className="seg-mini">
            <button className={drawer === 'code' ? 'on' : ''} onClick={() => onView({ drawer: 'code' })}>Code</button>
            <button className={drawer === 'checks' ? 'on' : ''} onClick={() => onView({ drawer: 'checks' })}>
              Checks{problems > 0 && <span className="badge">{problems}</span>}
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
