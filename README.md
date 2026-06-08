# bigstacks

An investment roguelike browser game inspired by [Build your STAX](https://buildyourstax.com/).

The client is a static ES-module app (`index.html` + `ui/app.js`). Multiplayer uses a separate Node.js WebSocket server in `server/`.

## Local development

```bash
npm run server
```

Open `index.html` in a browser (or serve the repo root with any static file server). Multiplayer connects to `ws://localhost:3001` by default.

## Tests

```bash
npm run test:mp
```

Runs multiplayer integration checks (deterministic market boot/advance, save snapshots, wire payloads, room cleanup).

## Deploy

- **Client:** GitHub Pages from `main`
- **Server:** [Render](https://render.com) from `main` (see `render.yaml`)

After merging release tooling, update the Render service in the dashboard to track `main` instead of `mp`, then retire the `mp` branch.

## Releases

Version **0.1.0** is the first tracked release. App version lives in `package.json` and `version.js`; save-file schema version is separate (`SAVE_VERSION` in `saveLoad.js`).

### Cut a release

1. Land changes on `main` using [conventional commits](.github/CONTRIBUTING.md) (`feat:`, `fix:`, `chore:`, etc.)
2. Run one of:
   - `npm run release` — bump per commit history
   - `npm run release:patch` / `release:minor` / `release:major` — explicit bump
3. Push with tags: `git push origin main --follow-tags`
4. GitHub Actions runs `test:mp` and publishes a GitHub Release for the tag
5. Render redeploys `main` automatically

### First tag

After this tooling is merged:

```bash
git push origin main --follow-tags
```

If you have not tagged yet, create the initial release:

```bash
npm run release -- --first-release
git push origin main --follow-tags
```
