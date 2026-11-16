import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { runPattern, type Piece, type Stitch, type KnitDoc } from './knit';
import { EXAMPLES, findExample } from './knit/examples';
import agentPrompt from './knit/agentPrompt.txt?raw';
import { parseState, writeState, type AppState, type ViewMode } from './urlState';
import { Editor, type EditorHandle } from './components/Editor';
import { Params } from './components/Params';
import { Checks } from './components/Checks';
import { Inspector } from './components/Inspector';
import { Viewer, type ViewerHandle } from './components/Viewer';
import { KnitControls } from './components/KnitControls';
import { curRowIndex } from './draw/stitches';
import { useStacked } from './layout';
import { Steps } from './components/Steps';
import { MoreMenu, type MenuItem } from './components/MoreMenu';
import { IconCheck, IconChecks, IconCode, IconFit, IconList, IconShare, IconSliders, IconSpark } from './components/Icons';
import { Card } from './components/Card';
import { loadPref, savePref } from './prefs';

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

interface KnitRaw { doc: KnitDoc | null; curPiece: string | null; progress: number; selected: Stitch | null }

type PhoneTab = 'steps' | 'adjust';
const PHONE_TABS: { key: PhoneTab; label: string }[] = [{ key: 'steps', label: 'Steps' }, { key: 'adjust', label: 'Adjust' }];

const MODE_LABEL: Record<ViewMode, string> = { pieces: 'Pieces', aligned: 'Laid out', assembled: 'Assembled' };

function YarnLogo() {
  return (
    <svg viewBox="0 0 40 40" width="34" height="34" aria-hidden="true" className="logo-mark">
      <circle cx="21" cy="19" r="13" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <path d="M10 13c6 2 13 9 15 19M13 9c7 3 13 11 15 21M20 6c5 4 9 10 10 17M9 21c5 0 11 4 13 11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M8 30c-3 2-5 4-6 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function App() {
  const [state, setState] = useState<AppState>(() => parseState(location.search));
  const { code, params, mode, tab } = state;
  const patch = useCallback((p: Partial<AppState>) => setState((s) => ({ ...s, ...p })), []);
  const [showSeams, setShowSeams] = useState(true);

  // the pattern is re-run shortly after typing / dragging a param stops
  const runCode = useDebounced(code, 400);
  const runParams = useDebounced(params, 100);
  const doc = useMemo(() => runPattern(runCode, runParams), [runCode, runParams]);

  useEffect(() => { writeState({ ...state, code: runCode, params: runParams }); }, [state, runCode, runParams]);

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
    // following the pattern: bring the piece being knitted up close
    if (next === 'steps' && curPiece) viewer.current?.focusPiece(curPiece);
    else if (!next) viewer.current?.fit();
  };
  // the player can shrink to a small pill
  const [dockMini, setDockMini] = useState(() => loadPref('dock') === 'mini');
  const toggleDock = () => { savePref('dock', dockMini ? 'full' : 'mini'); setDockMini(!dockMini); };
  // the knit is framed in the space the header and dock leave free
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
  }, [stacked]);

  // the source drawer holds everything technical: the DSL and the checks
  const drawerOpen = tab !== 'sim';
  const editor = useRef<EditorHandle>(null);
  const viewer = useRef<ViewerHandle>(null);
  const gotoLine = useCallback((n: number) => {
    patch({ tab: 'pattern' });
    requestAnimationFrame(() => editor.current?.gotoLine(n));
  }, [patch]);

  const loadExample = (key: string) => {
    const ex = EXAMPLES.find((e) => e.key === key); if (!ex) return;
    patch({ code: ex.src, params: {} });
    setRaw({ doc: null, curPiece: null, progress: Infinity, selected: null });
  };

  const errs = doc.errors.filter((e) => e.level === 'error').length;
  const failed = doc.checks.filter((c) => !c.ok).length;
  const activeLine = piece && progress < piece.total ? piece.rows[curRowIndex(piece, progress)].line : 0;
  const example = findExample(code);

  const [copied, setCopied] = useState('');
  const copy = async (what: 'prompt' | 'link') => {
    try { await navigator.clipboard.writeText(what === 'prompt' ? agentPrompt.trim() : location.href); setCopied(what); }
    catch { setCopied('failed'); }
    setTimeout(() => setCopied(''), 2000);
  };
  // phones get the system share sheet (message a friend); elsewhere the link is copied
  const share = async () => {
    if (stacked && navigator.share) {
      try { await navigator.share({ title: doc.name || 'KnitSim pattern', url: location.href }); } catch { /* cancelled */ }
      return;
    }
    copy('link');
  };

  const problems = errs + failed;
  const menu: MenuItem[] = [
    ...(stacked ? [{ label: 'Fit to view', icon: <IconFit />, onClick: () => viewer.current?.fit() }] : []),
    { label: 'Pattern code', icon: <IconCode />, onClick: () => patch({ tab: 'pattern' }) },
    { label: 'Checks', icon: <IconChecks />, onClick: () => patch({ tab: 'checks' }), hint: problems > 0 ? <span className="badge">{problems}</span> : <span className="good">all pass</span> },
    { label: copied === 'prompt' ? 'Copied ✓' : 'Copy prompt for an AI agent', icon: <IconSpark />, onClick: () => copy('prompt') },
  ];

  const patternPicker = (
    <select className="soft-select" aria-label="Example pattern" value={example?.key ?? ''} onChange={(e) => loadExample(e.target.value)}>
      {!example && <option value="">{doc.name || 'Custom pattern'}</option>}
      {EXAMPLES.map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}
    </select>
  );
  const adjust = (
    <>
      {!stacked && patternPicker}
      {doc.source && <a className="soft-link" href={doc.source} target="_blank" rel="noopener">Original pattern ↗</a>}
      {doc.params.length > 0 && (
        <>
          <h3>Make it yours</h3>
          <Params
            params={doc.params}
            onSet={(name, v) => patch({ params: { ...params, [name]: v } })}
            onReset={(name) => { const p = { ...params }; delete p[name]; patch({ params: p }); }}
          />
        </>
      )}
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

  const phonePanel = !stacked ? null
    : selected ? <div className="scroll-y"><Inspector doc={doc} stitch={selected} onClose={clearStitch} /></div>
    : phoneTab === 'steps' ? <>{pieceChips}<div className="scroll-y">{steps}</div></>
    : phoneTab === 'adjust' ? <div className="scroll-y">{patternPicker}{adjust}{mode !== 'pieces' && seamSwitch}</div>
    : null;

  return (
    <div className={'app' + (drawerOpen ? ' drawer-open' : '') + (stacked ? ' phone' : '') + (phonePanel ? ' panel-open' : '')}>
      <header className="topbar" ref={topRef}>
        <div className="brand">
          <YarnLogo />
          {stacked ? (
            <button className="title-btn" onClick={() => pickTab('adjust')} aria-label="Change pattern">
              <span className="title-name">{example?.label ?? (doc.name || 'Custom pattern')}</span>
            </button>
          ) : (
            <div>
              <h1>KnitSim</h1>
              <p>Watch a pattern knit itself</p>
            </div>
          )}
        </div>
        <div className="pill-seg" role="tablist" aria-label="View">
          {(['pieces', 'aligned', 'assembled'] as ViewMode[]).map((m) => (
            <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? 'on' : ''} onClick={() => patch({ mode: m })}>
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>
        <div className="top-actions">
          {!stacked && (
            <>
              <button className={'icon-btn' + (sheet ? ' on' : '')} title={sheet ? 'Hide project and pieces' : 'Show project and pieces'} aria-label="Project and pieces" aria-expanded={sheet} onClick={toggleSheet}>
                <IconSliders />
              </button>
              <button className="icon-btn" title="Fit to view" aria-label="Fit to view" onClick={() => viewer.current?.fit()}><IconFit /></button>
            </>
          )}
          <button className="icon-btn" title="Share a link to this view" aria-label="Share" onClick={share}>
            {copied === 'link' ? <IconCheck /> : <IconShare />}
          </button>
          <MoreMenu items={menu} alert={problems > 0} />
        </div>
      </header>
      {copied === 'link' && <div className="toast" role="status">Link copied</div>}

      <main className="stage">
        <Viewer ref={viewer} doc={doc} mode={mode} showSeams={showSeams} knit={knit} onPick={selectStitch} chrome={stacked && !chrome.r && !phonePanel ? { ...chrome, t: chrome.t + 26 } : chrome} panelOpen={!stacked && sheet} />

        {!stacked && (
          <aside className={'float float-left' + (sheet ? ' open' : '')}>
            <Card id="project" icon="◍" title="Project">{adjust}</Card>
            {names.length > 0 && <Card id="pieces" icon="▦" title="Pieces">{pieces}</Card>}
            {piece && <Card id="steps" icon="≡" title="Steps"><div className="scroll-y steps-box">{steps}</div></Card>}
          </aside>
        )}

        {!stacked && selected && (
          <aside className="float float-right">
            <Inspector doc={doc} stitch={selected} onClose={clearStitch} />
          </aside>
        )}

        <div className={'dock' + (!stacked && dockMini ? ' mini' : '') + (phonePanel ? ' has-panel' : '')} ref={dockRef}>
          {stacked ? (
            <div className="sheet card">
              {phonePanel && <div className="sheet-panel">{phonePanel}</div>}
              <KnitControls piece={piece} progress={progress} setProgress={setProgress} onInspect={selectStitch} mini={false} onToggleMini={toggleDock} compact />
              <nav className="tabbar" aria-label="Panels">
                {PHONE_TABS.map(({ key, label }) => {
                  const on = phoneTab === key && !selected;
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
      </main>

      <div className="scrim" onClick={() => patch({ tab: 'sim' })} />
      <aside className="drawer" aria-hidden={!drawerOpen}>
        <div className="drawer-head">
          <h2>Pattern code</h2>
          <div className="seg-mini">
            <button className={tab === 'pattern' ? 'on' : ''} onClick={() => patch({ tab: 'pattern' })}>Code</button>
            <button className={tab === 'checks' ? 'on' : ''} onClick={() => patch({ tab: 'checks' })}>
              Checks{problems > 0 && <span className="badge">{problems}</span>}
            </button>
          </div>
          <button className="icon-btn" aria-label="Close" onClick={() => patch({ tab: 'sim' })}>✕</button>
        </div>
        <div className="drawer-body">
          <div className={tab === 'pattern' ? '' : 'hidden'}>
            <Editor ref={editor} value={code} onChange={(v) => patch({ code: v })} problems={doc.errors} activeLine={activeLine} />
            <div className="row">
              <button className="soft-btn" onClick={() => copy('prompt')}>{copied === 'prompt' ? 'Copied ✓' : 'Copy prompt for an AI agent'}</button>
            </div>
            <details>
              <summary>Syntax reference</summary>
              <pre className="ref">{agentPrompt}</pre>
            </details>
          </div>
          {tab === 'checks' && <Checks doc={doc} gotoLine={gotoLine} />}
        </div>
      </aside>
    </div>
  );
}
