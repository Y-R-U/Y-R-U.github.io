# CalTrack — calorie & exercise tracker

Mobile-first, super-simple calorie/exercise tracker. **One front-end codebase, two
deployments, auto-detected at runtime:**

| Deployment | Mode | Storage |
|------------|------|---------|
| **caltrack.br8t.com** (IONOS VPS) | `server` | Accounts + SQLite via `/api/*` |
| **GitHub Pages** (`/app/caltrack/`) | `client` | `localStorage`, browser-only backup |

`app.js` probes `GET /api/health` on boot. If the Go backend answers → server mode
(login, server-stored data). If not (GitHub Pages, no backend) → client mode:
no login, everything in `localStorage`, and a toast nudges the user to
caltrack.br8t.com to make an account and sync.

## Files

```
index.html          SPA shell (auth screen, app, settings sheet, confirm modal, toasts)
app.css             All styles. Mobile-first, light + dark (prefers-color-scheme).
app.js              Storage adapter (Store), shared pure helpers, UI, tiny canvas charts.
manifest.webmanifest + sw.js + icon.svg/icon-192.png/icon-512.png  — installable PWA / offline shell.
server/main.go      Go HTTP API + static file server. modernc.org/sqlite (CGO-free) + bcrypt.
server/go.mod
caltrack.service    systemd unit (port 8003, db at /srv/data/caltrack).
deploy.sh           Build-on-box deploy to the br8t VPS (mirrors ../../../ionos/vpstats).
```

PWA: `sw.js` precaches the shell; API requests are never cached, navigations are
network-first, other assets stale-while-revalidate. Scope = wherever it's served
(`/` on the VPS, `/app/caltrack/` on Pages). Time-of-day matching: the client sends
its local `hour` with each entry so server-stored `hour_sum` is in the user's
timezone. "Base daily burn" is BMR (rest only); exercise is added on top.

The Go source lives in the repo as the single source of truth; GitHub Pages just
ignores it and serves the static files.

## Data model (SQLite)

- `users` — username, bcrypt `pass_hash`, `daily_burn` (resting kcal), `target_loss_kg`, `start_weight_kg`.
- `entries` — `kind` (`food`=eaten / `exercise`=burned), `label`, `calories`, `created_at`.
- `suggestions` — remembered label+calories, `use_count`, `hour_sum` (for time-of-day ranking). `user_id 0` = global/seeded.
- `hidden` — lets a user hide a *global* suggestion without affecting others.
- `sessions` — opaque token → user, delivered as an httpOnly cookie.

## Key behaviours

- Pick Food/Exercise → autofocused text field → live suggestions ranked by **frequency
  + closeness to the current time of day** (`rankSuggestions`). Tap fills label+calories.
- Calorie field has −50 / −10 / +10 / +50 steppers.
- Saving upserts the suggestion (so it's remembered unless it already exists).
- Delete a suggestion via the ✕ (confirm modal). Own ones are deleted; global ones are hidden per-user.
- **Projection card** works from a cold start (no data): deficit ± 50, weeks ± 1, live curve. ~7700 kcal ≈ 1 kg.
- **Actuals card** appears once there's data + a daily burn: avg deficit over a ± adjustable period, with a deficit/surplus bar chart.
- Daily burn / target loss / weight live behind the ⚙️ cog; the cog pulses until burn is set.

## Deploy

```bash
./deploy.sh                 # rsync static + Go source, build on box, systemd + Caddy, restart
```

Backend listens on `127.0.0.1:8003`; Caddy reverse-proxies `caltrack.br8t.com`.
DNS (`caltrack.br8t.com` → `74.208.219.127`) is added in Cloudflare separately;
Caddy auto-provisions the TLS cert once it resolves. See `../../../ionos` memories
for VPS access.

Built by Opus 4.8, 2026-06-04.
