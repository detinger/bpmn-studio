# Deploying BPMN Studio on Railway

BPMN Studio is a static web application: the build produces HTML, JavaScript and CSS in `dist/`, and everything — modeling, validation, simulation — runs in the student's browser. There is **no backend, no database and no secret** to configure. Railway only has to build the app and serve the files.

## What is in the repository for deployment

| File | Purpose |
|---|---|
| `Dockerfile` | Two stages: Node 24 installs dependencies, type-checks and builds `dist/`; then a small Caddy image serves it. Railway detects a root `Dockerfile` automatically. |
| `Caddyfile` | Web server: listens on `$PORT` (8080 if unset), `/health` health check, gzip/zstd compression, long-term caching for hashed assets, no caching for `index.html`, basic security headers. |
| `.dockerignore` | Keeps `node_modules`, build output, test reports and the reference material (`Wien/`, `Signavio/`, BPMN posters) out of the image. |
| `package.json` → `engines.node` | `>=24.15.0` — required by `bpmnlint` (Node 24) and the test tooling. |

No `railway.json` is used. Railway's Config as Code (`railway.json` / `railway.toml`) is deprecated and stops being read on 2026-12-01; the Dockerfile and a few dashboard settings are all this app needs.

## Before the first deployment

1. **Check locally** that tests and build pass:

   ```bash
   npm ci
   npm test
   npm run build
   ```

2. **Reference material stays local.** The project folder contains material the app does not use: `Wien/` (PDFs of process models), `BPMN2_0_Poster_EN_PM.pdf` and `BPMN-20-Poster-EN.png`. These files are listed in `.gitignore` and `.dockerignore`, so they are never pushed to GitHub or built into the image.

3. **Choose the final web address now.** Diagrams, simulation settings and learning progress are stored in each student's browser *per web address*. If you later move from `…up.railway.app` to your own domain, students' work stays behind on the old address. They can move it with **Library → Export backup / Restore backup**, but it is easier to start on the final domain.

## Option A — Deploy from GitHub (recommended)

Railway then redeploys automatically on every push.

1. Put the project under version control and push it to a new GitHub repository (private is fine):

   ```bash
   git init
   git add .
   git commit -m "BPMN Studio"
   git branch -M main
   git remote add origin git@github.com:<your-account>/bpmn-studio.git
   git push -u origin main
   ```

2. In Railway: **New Project → Deploy from GitHub repo**, authorize GitHub if asked, and select the repository.
3. Railway starts a build. The build log should show that the Dockerfile was detected (*"Using detected Dockerfile"*), followed by `npm ci`, `tsc -b && vite build` and the Caddy stage. The first build takes a few minutes; later builds reuse the dependency layer.
4. Configure the service (see [Settings](#settings)): add the `PORT` variable, the health check, and a public domain.
5. Open the generated URL.

## Option B — Deploy from your computer with the Railway CLI

Useful without GitHub, or for a quick test deployment.

```bash
npm install -g @railway/cli      # or: brew install railway
railway login
cd /path/to/BPMN-studio
railway init                     # create a new project (or `railway link` to an existing one)
railway up                       # upload the folder, build with the Dockerfile and deploy
railway domain                   # create a public *.up.railway.app address
```

`railway up` uploads the folder except what `.gitignore` excludes (so no `node_modules` and no reference PDFs). Run `railway up` again to deploy a new version.

## Settings

All in the Railway dashboard, on the service:

| Where | Setting | Value | Why |
|---|---|---|---|
| **Variables** | `PORT` | `8080` | Caddy listens on `$PORT`. Setting it explicitly keeps the port and the domain's target port in agreement. |
| **Settings → Networking → Public Networking** | Generate Domain, target port | `8080` | Creates `https://<name>.up.railway.app`. HTTPS is handled by Railway. |
| **Settings → Deploy** | Healthcheck Path | `/health` | Railway switches traffic to a new deployment only after it answers `ok`, so failed deploys don't take the site down. |
| **Settings → Build** | Builder | Dockerfile (detected automatically) | Nothing to change. Use `RAILWAY_DOCKERFILE_PATH` only if the Dockerfile is moved. |
| **Settings → Source** | Branch, auto deploy | `main`, on | Option A only. Optionally set watch paths so documentation-only commits don't trigger builds. |
| **Settings → Deploy** | Replicas, region | 1, close to your students | The container is stateless; more replicas are possible but not needed for a class. |

**No other environment variables are needed.** The app has no API keys, database URLs or build-time variables.

Resource use is small: Caddy serving static files needs a few tens of MB of memory and almost no CPU, because the simulations run in the students' browsers, not on the server.

## Custom domain (optional)

1. **Settings → Networking → Custom Domain**, enter e.g. `bpmn.your-faculty.example`, target port `8080`.
2. Railway shows a **CNAME** record (and possibly a TXT record for verification). Create it at your DNS provider — usually the university IT department.
3. Railway issues the TLS certificate automatically once DNS has propagated.

Keep the earlier note about per-address browser storage in mind before switching domains while a course is running.

## After deploying: a 2-minute check

1. `https://<your-domain>/health` returns `ok`.
2. The home page loads, and the theme toggle and navigation work.
3. **Library → Open copy** of *Claims handling — AS-IS* → **Performance → Run simulation** shows KPI tiles. This confirms that the simulation Web Worker is served correctly.
4. The modeler shows the bpmn.io logo in the bottom-right corner of the canvas. The bpmn-js license requires it to stay visible.
5. Reload the page: your diagram is still in the library (browser storage works on the domain).

## Updating and rolling back

- **Update:** push to `main` (Option A) or run `railway up` (Option B). The new version goes live after the health check passes. `index.html` is never cached and asset files have content-hashed names, so a normal reload shows the new version.
- **Roll back:** **Deployments** tab → choose an earlier deployment → **Rollback**.
- Students' data is not affected by deployments: it lives in their browsers, not on the server.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Build fails in `npm ci` with an engine or platform error | The build image must be Node 24 (`FROM node:24-bookworm-slim`). Keep `package-lock.json` committed and up to date (`npm install` locally, then commit the lock file). |
| Build fails in `tsc -b` | A TypeScript error; the same command fails locally. Run `npm run build` and fix it before pushing. |
| "Application failed to respond" / 502 | Port mismatch. Set the variable `PORT=8080` and the domain's target port to `8080`, then redeploy. |
| Deployment never becomes active | The health check fails. The healthcheck path must be `/health` (not `/healthz`). Check the deploy logs. |
| Page loads but a simulation never finishes | Open the browser console. The worker file is under `/assets/`; a proxy or extension that blocks workers is the usual cause. |
| Students "lost" their diagrams | Different browser, private window, cleared site data, or a changed domain. Data is per browser and per address; use Export/Restore backup. |

## Running the same image elsewhere

The image is not Railway-specific:

```bash
docker build -t bpmn-studio .
docker run --rm -p 8080:8080 bpmn-studio
# open http://localhost:8080
```

Any host that serves static files also works. Run `npm run build` and publish `dist/`; no rewrite rules are needed because the app uses hash-based URLs (`/#/learn`).

## Alternative: Railway without a Dockerfile

If you remove the `Dockerfile`, Railway's default builder (Railpack) detects the Vite app, runs the build script and serves `dist/` with its own Caddy configuration on `$PORT`, including a `/health` endpoint. In that case:

- Also remove the root `Caddyfile`. Railpack would use it instead of its default, but it serves files from `/srv`, which is the Docker image's layout.
- Set the variable `RAILPACK_NODE_VERSION=24` (the `engines` field is read as well).
- You lose the cache headers defined here.

The Dockerfile route is recommended because it pins every step.
