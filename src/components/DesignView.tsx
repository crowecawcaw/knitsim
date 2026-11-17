import { useCallback, useMemo, useRef, useState } from 'react';
import type { Piece, Stitch, KnitDoc } from '../knit';
import agentPrompt from '../knit/agentPrompt.txt?raw';
import { shareLink, type DesignTab, type ViewMode } from '../urlState';
import { Editor, type EditorHandle } from './Editor';
import { Params } from './Params';
import { Checks } from './Checks';
import { Inspector } from './Inspector';
import { Viewer, type ViewerHandle } from './Viewer';
import { KnitControls } from './KnitControls';
import { ProjectBar } from './ProjectBar';
import { curRowIndex } from '../draw/stitches';
import { useStacked } from '../layout';
import { useDoc, type ProjectViewProps } from './project';

interface KnitRaw { doc: KnitDoc | null; curPiece: string | null; progress: number; selected: Stitch | null }

const MODE_LABEL: Record<ViewMode, string> = { assembled: 'Assembled', aligned: 'Laid out', pieces: 'Pieces' };
const TAB_LABEL: Record<DesignTab, string> = { options: 'Options', code: 'Code', checks: 'Checks', agent: 'Agent' };

/** The designer's workbench: the simulation, with options, source, checks and (soon) an agent beside it. */
export function DesignView({ project, saved, saveState, view, onView, onChange, onSaveCopy, onBack }: ProjectViewProps) {
  const { code, params } = project;
  const { mode, tab } = view;
  const { doc } = useDoc(code, params);
  const [showSeams, setShowSeams] = useState(true);

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

  const [dockMini, setDockMini] = useState(false);
  const stacked = useStacked();
  const viewer = useRef<ViewerHandle>(null);
  const editor = useRef<EditorHandle>(null);
  const gotoLine = useCallback((n: number) => {
    onView({ tab: 'code' });
    requestAnimationFrame(() => editor.current?.gotoLine(n));
  }, [onView]);

  const errs = doc.errors.filter((e) => e.level === 'error').length;
  const failed = doc.checks.filter((c) => !c.ok).length;
  const problems = errs + failed;
  const activeLine = piece && progress < piece.total ? piece.rows[curRowIndex(piece, progress)].line : 0;

  const [copied, setCopied] = useState(false);
  const copyPrompt = async () => {
    try { await navigator.clipboard.writeText(agentPrompt.trim()); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* blocked */ }
  };

  return (
    <div className="dv">
      <ProjectBar
        name={project.name} saved={saved} saveState={saveState}
        ui="design" onUi={(ui) => onView({ ui })} onRename={(name) => onChange({ name })}
        onBack={onBack} onSaveCopy={onSaveCopy}
        link={() => shareLink(code, params, view)}
      />
      <div className="dv-body">
        <section className="dv-stage">
          <Viewer ref={viewer} doc={doc} mode={mode} showSeams={showSeams} knit={knit} onPick={selectStitch}
            panelOpen={false} chrome={{ t: 56, b: stacked ? 84 : dockMini ? 76 : 112, r: 0 }} />
          <div className="dv-modes seg" role="tablist" aria-label="Layout">
            {(['assembled', 'aligned', 'pieces'] as ViewMode[]).map((m) => (
              <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? 'on' : ''} onClick={() => onView({ mode: m })}>{MODE_LABEL[m]}</button>
            ))}
          </div>
          <button className="icon-btn dv-fit" title="Fit to view" aria-label="Fit to view" onClick={() => viewer.current?.fit()}>
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          {selected && <div className="dv-inspect"><Inspector doc={doc} stitch={selected} onClose={clearStitch} /></div>}
          <div className={'dock' + (dockMini ? ' mini' : '')}>
            <KnitControls piece={piece} progress={progress} setProgress={setProgress} onInspect={selectStitch} mini={dockMini} onToggleMini={() => setDockMini(!dockMini)} compact={stacked} />
          </div>
        </section>

        <aside className="dv-panel">
          <nav className="dv-tabs" role="tablist" aria-label="Panel">
            {(Object.keys(TAB_LABEL) as DesignTab[]).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => onView({ tab: t })}>
                {TAB_LABEL[t]}
                {t === 'checks' && (problems > 0 ? <span className="badge">{problems}</span> : <span className="ok-dot" title="All checks pass" />)}
              </button>
            ))}
          </nav>

          <div className="dv-content">
            {tab === 'options' && (
              <div className="dv-pad">
                <h3>Settings</h3>
                {doc.params.length > 0
                  ? <Params
                      params={doc.params}
                      onSet={(name, v) => onChange({ params: { ...params, [name]: v } })}
                      onReset={(name) => { const p = { ...params }; delete p[name]; onChange({ params: p }); }}
                    />
                  : <p className="muted small">No settings yet. <code>param</code> lines in the code become controls here.</p>}
                {names.length > 0 && (
                  <>
                    <h3>Pieces</h3>
                    <div className="chips">
                      {names.map((n) => <button key={n} className={'chip' + (n === curPiece ? ' on' : '')} onClick={() => selectPiece(n)}>{n.replace(/_/g, ' ')}</button>)}
                    </div>
                  </>
                )}
                {mode !== 'pieces' && (
                  <label className="switch">
                    <input type="checkbox" checked={showSeams} onChange={(e) => setShowSeams(e.target.checked)} />
                    <span className="track" /> Show seams
                  </label>
                )}
                {doc.source && <p><a className="soft-link" href={doc.source} target="_blank" rel="noopener">Original pattern ↗</a></p>}
              </div>
            )}

            {/* the editor stays mounted so its scroll position and undo history survive tab switches */}
            <div className={'dv-code' + (tab === 'code' ? '' : ' hidden')}>
              <Editor ref={editor} value={code} onChange={(v) => onChange({ code: v })} problems={doc.errors} activeLine={activeLine} />
              <details>
                <summary>Syntax reference</summary>
                <pre className="ref">{agentPrompt}</pre>
              </details>
            </div>

            {tab === 'checks' && <div className="dv-pad"><Checks doc={doc} gotoLine={gotoLine} /></div>}

            {tab === 'agent' && (
              <div className="dv-agent">
                <div className="dv-pad">
                  <p className="agent-intro"><strong>Edit by asking.</strong> Describe a change, like “make the sleeves 2in longer” or
                    “add a size 3X”, and an agent rewrites the code and re-runs the checks.</p>
                  <p className="muted small">Not connected yet. Meanwhile you can give any AI agent the language reference and paste its result into Code.</p>
                  <button className="soft-btn" onClick={copyPrompt}>{copied ? 'Copied ✓' : 'Copy the prompt for an AI agent'}</button>
                </div>
                <div className="composer">
                  <textarea placeholder="Describe a change to the pattern…" disabled rows={2} />
                  <button className="dark-btn" disabled>Send</button>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
