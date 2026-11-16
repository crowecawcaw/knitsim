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

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

interface KnitRaw { doc: KnitDoc | null; curPiece: string | null; progress: number; selected: Stitch | null }

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

  return (
    <div className={'app' + (drawerOpen ? ' drawer-open' : '')}>
      <header className="topbar">
        <div className="brand">
          <YarnLogo />
          <div>
            <h1>KnitSim</h1>
            <p>Watch a pattern knit itself</p>
          </div>
        </div>
        <div className="pill-seg" role="tablist" aria-label="View">
          {(['pieces', 'aligned', 'assembled'] as ViewMode[]).map((m) => (
            <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? 'on' : ''} onClick={() => patch({ mode: m })}>
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>
        <div className="top-actions">
          <button className="icon-btn" title="Fit to view" aria-label="Fit to view" onClick={() => viewer.current?.fit()}>
            <svg viewBox="0 0 24 24" width="20" height="20"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <button className="icon-btn" title="Copy share link" aria-label="Copy share link" onClick={() => copy('link')}>
            {copied === 'link'
              ? <svg viewBox="0 0 24 24" width="20" height="20"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              : <svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 15V4M8 8l4-4 4 4M5 13v6h14v-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
          </button>
          <button className="dark-btn" onClick={() => patch({ tab: drawerOpen ? 'sim' : 'pattern' })}>
            <span className="mono">&lt;/&gt;</span> {drawerOpen ? 'Close' : 'Pattern'}
            {(errs > 0 || failed > 0) && !drawerOpen && <span className="dot-alert" title="The pattern has problems" />}
          </button>
        </div>
      </header>

      <main className="stage">
        <Viewer ref={viewer} doc={doc} mode={mode} showSeams={showSeams} knit={knit} onPick={selectStitch} />

        <aside className="float float-left">
          <section className="card">
            <h2><span className="h-ico">◍</span> Project</h2>
            <select className="soft-select" aria-label="Example pattern" value={example?.key ?? ''} onChange={(e) => loadExample(e.target.value)}>
              {!example && <option value="">{doc.name || 'Custom pattern'}</option>}
              {EXAMPLES.map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}
            </select>
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
          </section>
          {names.length > 0 && (
            <section className="card">
              <h2><span className="h-ico">▦</span> Pieces</h2>
              <div className="chips">
                {names.map((n) => <button key={n} className={'chip' + (n === curPiece ? ' on' : '')} onClick={() => selectPiece(n)}>{n.replace(/_/g, ' ')}</button>)}
              </div>
              {mode !== 'pieces' && (
                <label className="switch">
                  <input type="checkbox" checked={showSeams} onChange={(e) => setShowSeams(e.target.checked)} />
                  <span className="track" /> Show seams
                </label>
              )}
            </section>
          )}
        </aside>

        {selected && (
          <aside className="float float-right">
            <Inspector doc={doc} stitch={selected} onClose={clearStitch} />
          </aside>
        )}

        <div className="dock">
          <KnitControls piece={piece} progress={progress} setProgress={setProgress} onInspect={selectStitch} />
        </div>
      </main>

      <div className="scrim" onClick={() => patch({ tab: 'sim' })} />
      <aside className="drawer" aria-hidden={!drawerOpen}>
        <div className="drawer-head">
          <h2>Pattern source</h2>
          <div className="seg-mini">
            <button className={tab === 'pattern' ? 'on' : ''} onClick={() => patch({ tab: 'pattern' })}>Code</button>
            <button className={tab === 'checks' ? 'on' : ''} onClick={() => patch({ tab: 'checks' })}>
              Checks{errs + failed > 0 && <span className="badge">{errs + failed}</span>}
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
