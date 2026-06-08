# Contributing

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/) so `standard-version` can build the changelog:

| Prefix | When to use |
|--------|-------------|
| `feat:` | New player-facing feature |
| `fix:` | Bug fix |
| `chore:` | Tooling, deps, housekeeping |
| `docs:` | README, comments, in-app copy |
| `refactor:` | Code change without behavior change |

Examples:

```
feat: add corporate bond autobuy
fix: correct perp funding on quarter rollover
chore: sync cache-bust version on release
```

## Branches

- **`main`** — production branch; deploys to GitHub Pages and Render
- Feature branches merge into `main` via PR or direct push (solo project)

The legacy **`mp`** deploy branch is retired. Render should track `main` (update in the Render dashboard under your service → Settings → Branch).

## Releases

See [README.md](../README.md#releases). Summary:

1. Conventional commits on `main`
2. `npm run release` (or `release:patch` / `minor` / `major`)
3. `git push origin main --follow-tags`

`scripts/sync-version.mjs` keeps `version.js`, `server/package.json`, and cache-bust query strings aligned with `package.json`.

## Save format vs app version

- **App version** (`0.1.0`, …) — releases, UI, cache busting
- **`SAVE_VERSION`** in `saveLoad.js` — bump only when save files break backward compatibility
