import { useCallback, useEffect, useRef, useState } from 'react';
import { parseRoute, writeRoute, type Route, type ViewState } from './urlState';
import { projectsApi, titleOf, type ProjectPatch } from './projects';
import { ProjectBrowser } from './components/ProjectBrowser';
import { ProjectView, type WorkingProject } from './components/ProjectView';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type Loaded =
  | { status: 'loading'; id: string }
  | { status: 'missing'; id: string }
  | { status: 'ready'; id: string; project: WorkingProject };

const api = projectsApi;

/** Routes between the project browser and a project. */
export function App() {
  const [route, setRoute] = useState<Route>(() => parseRoute(location.search));
  useEffect(() => {
    const on = () => setRoute(parseRoute(location.search));
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);
  const navigate = useCallback((r: Route, push = true) => { writeRoute(r, push); setRoute(r); }, []);

  // ---- a saved project: load it, keep a working copy, save edits shortly after they stop
  const id = route.page === 'project' ? route.id : null;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const pending = useRef<{ id: string; patch: ProjectPatch; timer: number } | null>(null);

  const flush = useCallback(async () => {
    const p = pending.current; if (!p) return;
    clearTimeout(p.timer); pending.current = null;
    setSaveState('saving');
    try { await api.update(p.id, p.patch); setSaveState('saved'); }
    catch { setSaveState('error'); }
  }, []);

  useEffect(() => {
    if (!id) { setLoaded(null); return; }
    let live = true;
    setLoaded({ status: 'loading', id });
    setSaveState('idle');
    api.get(id).then(
      (p) => live && setLoaded({ status: 'ready', id, project: { name: p.name, code: p.code, params: p.params } }),
      () => live && setLoaded({ status: 'missing', id }),
    );
    return () => { live = false; void flush(); };
  }, [id, flush]);

  useEffect(() => {
    const save = () => { void flush(); };
    window.addEventListener('pagehide', save);
    return () => window.removeEventListener('pagehide', save);
  }, [flush]);

  const editProject = (patch: Partial<WorkingProject>) => {
    if (!loaded || loaded.status !== 'ready') return;
    setLoaded({ ...loaded, project: { ...loaded.project, ...patch } });
    const prev = pending.current?.id === loaded.id ? pending.current : null;
    if (prev) clearTimeout(prev.timer);
    pending.current = {
      id: loaded.id,
      patch: { ...prev?.patch, ...patch },
      timer: window.setTimeout(() => void flush(), 600),
    };
    setSaveState('saving');
  };

  const goBrowser = () => { void flush(); navigate({ page: 'browser' }); };
  const openProject = (pid: string) => navigate({ page: 'project', id: pid, view: 'sim', mode: 'assembled', drawer: null });

  if (route.page === 'browser') return <ProjectBrowser api={api} onOpen={openProject} />;

  const view: ViewState = { view: route.view, mode: route.mode, drawer: route.drawer };
  const setView = (p: Partial<ViewState>) => navigate({ ...route, ...p } as Route, false);

  if (route.page === 'shared') {
    const project: WorkingProject = { name: titleOf(route.code) ?? 'Shared pattern', code: route.code, params: route.params };
    const saveCopy = async () => {
      const p = await api.create({ name: project.name, code: route.code, params: route.params });
      navigate({ page: 'project', id: p.id, ...view }, false);
    };
    return (
      <ProjectView
        key="shared"
        project={project} saved={false} saveState="idle"
        view={view} onView={setView}
        onChange={(p) => navigate({ ...route, ...(p.code !== undefined ? { code: p.code } : {}), ...(p.params ? { params: p.params } : {}) }, false)}
        onSaveCopy={saveCopy} onBack={goBrowser}
      />
    );
  }

  if (!loaded || loaded.status === 'loading' || loaded.id !== route.id) return <div className="loading-page muted">Loading…</div>;
  if (loaded.status === 'missing') {
    return (
      <div className="loading-page">
        <p>That project isn’t in this browser. It may have been deleted, or saved on another device.</p>
        <button className="dark-btn" onClick={goBrowser}>All projects</button>
      </div>
    );
  }
  return (
    <ProjectView
      key={loaded.id}
      project={loaded.project} saved saveState={saveState}
      view={view} onView={setView}
      onChange={editProject}
      onSaveCopy={() => {}} onBack={goBrowser}
    />
  );
}
