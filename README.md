# Knit·Sim

Write a knitting pattern in a small text DSL. Knit·Sim builds every stitch, checks stitch counts and
seam lengths, animates the knitting, and sews the pieces together in a 3D cloth simulation.

- **Language reference:** [SYNTAX.md](SYNTAX.md)
- **Live app:** https://crowecawcaw.github.io/knitsim/

## Development

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # vitest: examples parse, prose, projects API, URL routes
npm run typecheck
npm run build      # → dist/
```

Stack: React 19 + TypeScript + Vite, three.js for the 3D view. It is a single-page app with no backend (yet: see Projects).

## Projects

The app opens on a project browser. Projects are stored in `localStorage` behind a small CRUD interface,
`ProjectsApi` in `src/projects/api.ts`, shaped like the REST API it is meant to become:

| Method | Would be |
|---|---|
| `list()` → `ProjectSummary[]` | `GET /projects` (newest first, no source, plus derived colours and piece names) |
| `get(id)` → `Project` | `GET /projects/:id` |
| `create(input)` → `Project` | `POST /projects` |
| `update(id, patch)` → `Project` | `PATCH /projects/:id` (name, code, params) |
| `remove(id)` | `DELETE /projects/:id` |

All methods are async and return copies; a missing id rejects with `NotFoundError` (status 404). The app uses the
single instance exported from `src/projects/index.ts`: swap `LocalProjectsApi` for an HTTP client there. The bundled
examples are seeded the first time the store is opened.

A project opens in one of two interfaces:

- **Knit** (default), for someone following the pattern: the written pattern is the page (rendered from the code by
  `src/knit/prose.ts`), with their size and yarn at the top. Tapping a step shows it in plain words and shows the piece
  as it looks after that step in a small preview; tapping the preview opens it full screen, where the arrows step
  through the pattern and a stitch can be tapped to see how it's made.
- **Design**, for someone writing the pattern: the simulation (assembled by default) with the player, and a side
  panel with Options, Code, Checks and Agent (editing by chat; not connected yet).

## URL state

The route lives in the query string:

| Param | Value |
|---|---|
| *(none)* | the project browser |
| `p` | id of a saved project |
| `code` | a shared pattern: base64url (UTF-8) of the DSL source. Opens unsaved, with a "Save to my projects" button |
| `params` | with `code`: base64url of a JSON object of parameter overrides, e.g. `{"size":"M"}` |
| `ui` | `knit` (default) or `design` |
| `mode` | designer's 3D layout: `assembled` (default), `aligned` or `pieces` |
| `tab` | designer's side panel: `options` (default), `code`, `checks` or `agent` |

Older links still open: `drawer=code|checks` and `tab=pattern|checks` go to the designer on that tab.

Projects live in one browser, so the share button copies a `code=` link.

## Layout

```
src/
  knit/            DSL engine: parser, params, stitch graph, checks, meshes, cloth sim
    core.ts        engine (ported from the original single-file prototype; still untyped inside)
    types.ts       public shapes of the engine's output
    examples/      bundled .knit patterns
    prose.ts       built pattern → written instructions
  draw/            2D canvas drawing: stitches, needles, the "how is it made" animation
  scene/           three.js scene (imperative; React drives it via KnitScene's methods)
  components/      React UI: KnitView (knitter), DesignView (designer), ProjectBrowser
  projects/        ProjectsApi: CRUD interface + localStorage implementation
  urlState.ts      query-string <-> route
```

## Deploys

- **Production:** every push to `main` builds and publishes to the root of the `gh-pages` branch
  (`.github/workflows/deploy.yml`).
- **PR previews:** each PR is built and published to `gh-pages/pr-preview/pr-<N>/`, and a comment with the
  link is posted on the PR. The preview is removed when the PR closes (`.github/workflows/preview.yml`).

One-time setup: in **Settings → Pages**, set the source to **Deploy from a branch**, branch `gh-pages`, folder `/ (root)`.
The `gh-pages` branch is created by the first deploy. Previews don't run for PRs from forks, because those
runs get a read-only token.
