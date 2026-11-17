import { EXAMPLES } from '../knit/examples';
import { LocalProjectsApi, type ProjectInput, type ProjectsApi } from './api';

export * from './api';

/** The pattern title from `pattern "…"`, if any. */
export function titleOf(code: string): string | null {
  const m = /^\s*pattern\s+"([^"]*)"/m.exec(code);
  return m ? m[1] : null;
}

export const BLANK_PATTERN = `pattern "New project"
gauge 20 sts x 28 rows = 4 in
yarn #8a6fd1

piece swatch
  cast_on 30
  rows 6 garter
  rows 4in st
  rows 6 garter
  bind_off
end
`;

export const seedProjects = (): ProjectInput[] =>
  EXAMPLES.map((e) => ({ name: titleOf(e.src) ?? e.label, code: e.src, example: e.key }));

/** The app-wide projects API. Swap this for an HTTP client when there is a server. */
export const projectsApi: ProjectsApi = new LocalProjectsApi({ seed: seedProjects });
