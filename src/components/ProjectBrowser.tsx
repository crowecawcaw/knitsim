import { useCallback, useEffect, useState } from 'react';
import { EXAMPLES } from '../knit/examples';
import { BLANK_PATTERN, titleOf, type ProjectInput, type ProjectsApi, type ProjectSummary } from '../projects';
import { pieceName } from '../knit/prose';
import { YarnLogo } from './YarnLogo';

interface Props {
  api: ProjectsApi;
  onOpen: (id: string) => void;
}

/** A little knitted swatch in the project's yarn colours. */
function Swatch({ colors }: { colors: string[] }) {
  const cs = colors.length ? colors : ['#c4a27a'];
  const rows = 7, cols = 9;
  const vs = [];
  for (let r = 0; r < rows; r++) {
    const c = cs[Math.floor((r / rows) * cs.length)];
    for (let x = 0; x < cols; x++) {
      const cx = 8 + x * 12, cy = 6 + r * 11;
      vs.push(
        <g key={`${r}-${x}`} fill={c}>
          <path d={`M${cx - 5.5} ${cy}q1 7 5.5 9.5q-1 -7 -5.5 -9.5z`} />
          <path d={`M${cx + 5.5} ${cy}q-1 7 -5.5 9.5q1 -7 5.5 -9.5z`} />
        </g>,
      );
    }
  }
  return (
    <svg className="swatch" viewBox="0 0 112 82" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="112" height="82" fill={cs[0]} opacity="0.35" />
      {vs}
      <rect width="112" height="82" fill="url(#swatch-shade)" />
    </svg>
  );
}

const ago = (iso: string) => {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
  return new Date(iso).toLocaleDateString();
};

export function ProjectBrowser({ api, onOpen }: Props) {
  const [list, setList] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState('');
  const refresh = useCallback(() => {
    api.list().then(setList, (e) => setError(String(e?.message ?? e)));
  }, [api]);
  useEffect(refresh, [refresh]);

  const create = async (input: ProjectInput) => {
    try { const p = await api.create(input); onOpen(p.id); }
    catch (e) { setError(String((e as Error).message)); }
  };
  const duplicate = async (s: ProjectSummary) => {
    const p = await api.get(s.id);
    await api.create({ name: `${p.name} (copy)`, code: p.code, params: p.params, example: p.example });
    refresh();
  };
  const remove = async (s: ProjectSummary) => {
    if (!window.confirm(`Delete “${s.name}”? This can’t be undone.`)) return;
    await api.remove(s.id);
    refresh();
  };

  return (
    <div className="browser">
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <defs>
          <linearGradient id="swatch-shade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.18" />
            <stop offset="1" stopColor="#000" stopOpacity="0.12" />
          </linearGradient>
        </defs>
      </svg>
      <header className="browser-top">
        <div className="brand">
          <YarnLogo />
          <div>
            <h1>KnitSim</h1>
            <p>Watch a pattern knit itself</p>
          </div>
        </div>
        <button className="dark-btn" onClick={() => create({ name: 'New project', code: BLANK_PATTERN })}>
          <span aria-hidden="true">＋</span> New project
        </button>
      </header>

      <main className="browser-body">
        <h2 className="browser-h">Your projects</h2>
        {error && <p className="bad">{error}</p>}
        {list === null && !error && <p className="muted">Loading…</p>}
        {list && list.length === 0 && (
          <div className="empty">
            <p>No projects yet. Start a blank one, or pick an example below.</p>
          </div>
        )}
        {list && list.length > 0 && (
          <ul className="project-grid">
            {list.map((p) => (
              <li key={p.id} className="project-card">
                <button className="project-open" onClick={() => onOpen(p.id)} aria-label={`Open ${p.name}`}>
                  <Swatch colors={p.colors} />
                  <span className="project-meta">
                    <strong>{p.name}</strong>
                    <span className="muted small cap">
                      {p.pieces.length ? p.pieces.map(pieceName).join(' · ') : 'No pieces yet'}
                    </span>
                    <span className="muted small">Edited {ago(p.updatedAt)}</span>
                  </span>
                </button>
                <div className="project-actions">
                  <button className="icon-btn small" title="Duplicate" aria-label={`Duplicate ${p.name}`} onClick={() => duplicate(p)}>
                    <svg viewBox="0 0 24 24" width="16" height="16"><rect x="8" y="8" width="12" height="12" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M16 5.5V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                  </button>
                  <button className="icon-btn small" title="Delete" aria-label={`Delete ${p.name}`} onClick={() => remove(p)}>
                    <svg viewBox="0 0 24 24" width="16" height="16"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <h2 className="browser-h">Start from an example</h2>
        <div className="chips">
          {EXAMPLES.map((e) => (
            <button key={e.key} className="chip" onClick={() => create({ name: titleOf(e.src) ?? e.label, code: e.src, example: e.key })}>
              {e.label}
            </button>
          ))}
        </div>
        <p className="muted small browser-foot">Projects are saved in this browser. Use the share button inside a project to send someone a link.</p>
      </main>
    </div>
  );
}
