// The projects API. Everything in the app talks to `ProjectsApi`, never to storage directly, so the
// localStorage implementation below can be swapped for an HTTP client later without touching the UI.
//
// The shape is a plain REST resource:
//
//   GET    /projects        list()            → ProjectSummary[]   (newest first)
//   GET    /projects/:id    get(id)           → Project
//   POST   /projects        create(input)     → Project
//   PATCH  /projects/:id    update(id, patch) → Project
//   DELETE /projects/:id    remove(id)        → void
//
// Every method is async and returns copies, as a network client would.

import type { ParamValues } from '../knit';

export interface Project {
  id: string;
  name: string;
  /** Knit DSL source */
  code: string;
  /** parameter overrides, e.g. { size: 'M' } */
  params: ParamValues;
  /** the bundled example this project was started from, if any */
  example?: string;
  /** ISO timestamps */
  createdAt: string;
  updatedAt: string;
}

/** What the list endpoint returns: enough to draw the project browser without the full source. */
export interface ProjectSummary {
  id: string;
  name: string;
  example?: string;
  createdAt: string;
  updatedAt: string;
  /** derived from the source on write: yarn colours and piece names */
  colors: string[];
  pieces: string[];
}

export interface ProjectInput {
  name: string;
  code: string;
  params?: ParamValues;
  example?: string;
}

export type ProjectPatch = Partial<Pick<Project, 'name' | 'code' | 'params'>>;

export class NotFoundError extends Error {
  readonly status = 404;
  constructor(id: string) { super(`Project ${id} not found`); this.name = 'NotFoundError'; }
}

export interface ProjectsApi {
  list(): Promise<ProjectSummary[]>;
  get(id: string): Promise<Project>;
  create(input: ProjectInput): Promise<Project>;
  update(id: string, patch: ProjectPatch): Promise<Project>;
  remove(id: string): Promise<void>;
}

/** Yarn colours and piece names, read cheaply from the source text (no full build). */
export function summarize(p: Project): ProjectSummary {
  const colors = new Set<string>();
  const pieces: string[] = [];
  for (const raw of p.code.split('\n')) {
    const line = raw.trim();
    const param = /^param\s+(\w+)\s+colou?r\s*=\s*(#[0-9a-fA-F]{6})/.exec(line);
    if (param) colors.add(String(p.params[param[1]] ?? param[2]).toLowerCase());
    const yarn = /^yarn\b.*?(#[0-9a-fA-F]{6})/.exec(line);
    if (yarn) colors.add(yarn[1].toLowerCase());
    const piece = /^piece\s+(\w+)/.exec(line);
    if (piece) pieces.push(piece[1]);
  }
  const { id, name, example, createdAt, updatedAt } = p;
  return { id, name, example, createdAt, updatedAt, colors: [...colors], pieces };
}

/** The subset of the Web Storage API we use, so tests can pass a plain object. */
export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem'>;

interface StoredDb { version: 1; projects: Record<string, Project> }

const KEY = 'knitsim.projects.v1';

function memoryStore(): KeyValueStore {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}

function browserStore(): KeyValueStore {
  try {
    const s = window.localStorage;
    s.getItem(KEY); // throws when storage is blocked
    return s;
  } catch {
    return memoryStore(); // private mode etc.: projects last for this visit only
  }
}

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

export interface LocalOptions {
  store?: KeyValueStore;
  /** projects to create the first time the store is opened */
  seed?: () => ProjectInput[];
  now?: () => Date;
}

/** ProjectsApi backed by one JSON blob in localStorage. */
export class LocalProjectsApi implements ProjectsApi {
  private store: KeyValueStore;
  private now: () => Date;

  constructor(opts: LocalOptions = {}) {
    this.store = opts.store ?? browserStore();
    this.now = opts.now ?? (() => new Date());
    if (this.store.getItem(KEY) == null) {
      const db: StoredDb = { version: 1, projects: {} };
      const t = this.now().getTime();
      // stagger the timestamps so the first seed sorts to the top of the list
      (opts.seed?.() ?? []).forEach((input, i) => {
        const stamp = new Date(t - i * 1000).toISOString();
        const p = this.make(input, stamp);
        db.projects[p.id] = p;
      });
      this.write(db);
    }
  }

  async list(): Promise<ProjectSummary[]> {
    return Object.values(this.read().projects)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(summarize);
  }

  async get(id: string): Promise<Project> {
    const p = this.read().projects[id];
    if (!p) throw new NotFoundError(id);
    return clone(p);
  }

  async create(input: ProjectInput): Promise<Project> {
    const db = this.read();
    const p = this.make(input, this.now().toISOString());
    db.projects[p.id] = p;
    this.write(db);
    return clone(p);
  }

  async update(id: string, patch: ProjectPatch): Promise<Project> {
    const db = this.read();
    const cur = db.projects[id];
    if (!cur) throw new NotFoundError(id);
    const next: Project = { ...cur, updatedAt: this.now().toISOString() };
    if (patch.name !== undefined) next.name = patch.name.trim() || cur.name;
    if (patch.code !== undefined) next.code = patch.code;
    if (patch.params !== undefined) next.params = clone(patch.params);
    db.projects[id] = next;
    this.write(db);
    return clone(next);
  }

  async remove(id: string): Promise<void> {
    const db = this.read();
    if (!db.projects[id]) throw new NotFoundError(id);
    delete db.projects[id];
    this.write(db);
  }

  private make(input: ProjectInput, stamp: string): Project {
    return {
      id: newId(),
      name: input.name.trim() || 'Untitled project',
      code: input.code,
      params: clone(input.params ?? {}),
      ...(input.example ? { example: input.example } : {}),
      createdAt: stamp,
      updatedAt: stamp,
    };
  }

  private read(): StoredDb {
    try {
      const db = JSON.parse(this.store.getItem(KEY) ?? '');
      if (db && db.version === 1 && db.projects) return db;
    } catch { /* corrupt: start over */ }
    return { version: 1, projects: {} };
  }

  private write(db: StoredDb) {
    try { this.store.setItem(KEY, JSON.stringify(db)); } catch { /* quota: keep going */ }
  }
}
