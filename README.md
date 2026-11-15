# Knit·Sim

Write a knitting pattern in a small text DSL. Knit·Sim builds every stitch, checks stitch counts and
seam lengths, animates the knitting, and sews the pieces together in a 3D cloth simulation.

- **Language reference:** [SYNTAX.md](SYNTAX.md)
- **Live app:** https://crowecawcaw.github.io/knitsim/

## Development

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # vitest: examples parse cleanly, URL state round-trips
npm run typecheck
npm run build      # → dist/
```

Stack: React 19 + TypeScript + Vite, three.js for the 3D view. It is a single-page app with no backend.

## URL state

All state is kept in the query string, so you can share any view as a link:

| Param | Value |
|---|---|
| `code` | base64url (UTF-8) of the DSL source. Omitted when it's the default example |
| `params` | base64url of a JSON object of parameter overrides, e.g. `{"size":"M"}` |
| `mode` | `pieces` (default), `aligned` or `assembled` |
| `tab` | `sim` (default), `pattern` or `checks` |

## Layout

```
src/
  knit/            DSL engine: parser, params, stitch graph, checks, meshes, cloth sim
    core.ts        engine (ported from the original single-file prototype; still untyped inside)
    types.ts       public shapes of the engine's output
    examples/      bundled .knit patterns
  draw/            2D canvas drawing: stitches, needles, the "how is it made" animation
  scene/           three.js scene (imperative; React drives it via KnitScene's methods)
  components/      React UI
  urlState.ts      query-string <-> app state
```

## Deploys

- **Production:** every push to `main` builds and publishes to the root of the `gh-pages` branch
  (`.github/workflows/deploy.yml`).
- **PR previews:** each PR is built and published to `gh-pages/pr-preview/pr-<N>/`, and a comment with the
  link is posted on the PR. The preview is removed when the PR closes (`.github/workflows/preview.yml`).

One-time setup: in **Settings → Pages**, set the source to **Deploy from a branch**, branch `gh-pages`, folder `/ (root)`.
The `gh-pages` branch is created by the first deploy. Previews don't run for PRs from forks, because those
runs get a read-only token.
