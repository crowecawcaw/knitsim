import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { runPattern, type Piece, type Stitch, type KnitDoc } from './knit';
import { EXAMPLES, findExample } from './knit/examples';
import agentPrompt from './knit/agentPrompt.txt?raw';
import { parseState, writeState, type AppState, type Tab, type ViewMode } from './urlState';
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
  useEffect(() => { document.body.dataset.tab = tab; }, [tab]);

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

  const errs = doc.errors.filter((e) => e.level === 'error').length, warns = doc.errors.length - errs;
  const okc = doc.checks.filter((c) => c.ok).length, allc = doc.checks.length;
  const activeLine = piece && progress < piece.total ? piece.rows[curRowIndex(piece, progress)].line : 0;
  const example = findExample(code);

  const [copied, setCopied] = useState('');
  const copy = async (what: 'prompt' | 'link') => {
    try { await navigator.clipboard.writeText(what === 'prompt' ? agentPrompt.trim() : location.href); setCopied(what); }
    catch { setCopied('failed'); }
    setTimeout(() => setCopied(''), 2000);
  };

  return (
    <>
      <header>
        <h1>Knit<span>·</span>Sim</h1>
        <div className="sub">
          <select id="exsel" aria-label="Example pattern" value={example?.key ?? ''} onChange={(e) => loadExample(e.target.value)}>
            {!example && <option value="">Custom</option>}
            {EXAMPLES.map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}
          </select>{' '}
          <span id="pname">{doc.name || 'Untitled'}</span>
          {doc.source && <> · <a href={doc.source} target="_blank" rel="noopener">original pattern ↗</a></>}
        </div>
      </header>
      <nav>
        {(['pattern', 'sim', 'checks'] as Tab[]).map((t) => (
          <button key={t} className={'tabbtn' + (tab === t ? ' on' : '')} data-tab={t}
            data-badge={t === 'checks' ? String(errs + warns || '') : undefined} onClick={() => patch({ tab: t })}>
            {t === 'pattern' ? 'Pattern DSL' : t === 'sim' ? 'Simulator' : 'Checks'}
          </button>
        ))}
      </nav>
      <main className="layout">
        <section className={'panel' + (tab === 'pattern' ? ' on' : '')} id="panel-pattern">
          <div className="row" style={{ marginBottom: 8, justifyContent: 'space-between' }}>
            <div id="status">
              {errs ? <span className="bad">● {errs} error{errs > 1 ? 's' : ''}</span> : <span className="good">● parsed</span>}{' '}
              <span className="muted">{okc}/{allc} checks pass{warns ? ` · ${warns} warning${warns > 1 ? 's' : ''}` : ''}</span>
            </div>
            <div className="row">
              <button className="btn" onClick={() => copy('link')}>{copied === 'link' ? 'Copied ✓' : 'Copy link'}</button>
              <button className="btn" onClick={() => copy('prompt')}>{copied === 'prompt' ? 'Copied ✓' : 'Copy agent prompt'}</button>
            </div>
          </div>
          <Editor ref={editor} value={code} onChange={(v) => patch({ code: v })} problems={doc.errors} activeLine={activeLine} />
          <details>
            <summary>DSL reference &amp; prompt for an agent</summary>
            <pre className="ref">{agentPrompt}</pre>
          </details>
        </section>

        <section className={'panel' + (tab === 'sim' ? ' on' : '')} id="panel-sim">
          <Params
            params={doc.params}
            onSet={(name, v) => patch({ params: { ...params, [name]: v } })}
            onReset={(name) => { const p = { ...params }; delete p[name]; patch({ params: p }); }}
          />
          <div className="simbar">
            <div className="seg" role="tablist">
              {(['pieces', 'aligned', 'assembled'] as ViewMode[]).map((m) => (
                <button key={m} className={'modebtn' + (mode === m ? ' on' : '')} onClick={() => patch({ mode: m })}>
                  {m[0].toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>
            <button className="btn small" title="Fit view" onClick={() => viewer.current?.fit()}>⤢ Fit</button>
            <label className="muted tog"><input type="checkbox" checked={showSeams} onChange={(e) => setShowSeams(e.target.checked)} /> seams</label>
          </div>
          <div className="chips">
            {names.map((n) => <button key={n} className={'chip' + (n === curPiece ? ' on' : '')} onClick={() => selectPiece(n)}>{n}</button>)}
          </div>
          <Viewer ref={viewer} doc={doc} mode={mode} showSeams={showSeams} knit={knit} onPick={selectStitch} />
          <KnitControls piece={piece} progress={progress} setProgress={setProgress} onInspect={selectStitch} />
          <div className="gap" />
          <Inspector doc={doc} stitch={selected} gotoLine={gotoLine} />
        </section>

        <section className={'panel' + (tab === 'checks' ? ' on' : '')} id="panel-checks">
          <Checks doc={doc} gotoLine={gotoLine} />
        </section>
      </main>
    </>
  );
}
