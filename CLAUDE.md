# Y-R-U — Y-R-U.github.io Repo Guide

## What This Is

A GitHub Pages site at https://y-r-u.github.io/ containing a growing collection of browser-based apps and games, all written in vanilla JS with no build step (except a few PWAs deployed to Cloudflare Pages).

- **Repo:** `git@github.com:Y-R-U/Y-R-U.github.io.git`
- **Default branch:** `main` → auto-deploys to GitHub Pages

---

## Repository Structure

```
/                      Root — index.html (home/landing), projects.js (project registry)
/assets/               Shared assets: screenshots, home video
/ai/                   AI knowledge base and asset zips
/app/pwa/              PWA apps (fnote, timezones, edit2d, khydro)
/d/                    Image Editor
/d2/                   Draw & Paint
/e/                    Code Editor (Monaco)
/e2/                   Code Editor V2
/m/                    Mobile Editor
/m2/                   AB Edit
/n/                    WebRTC Test
/q/                    Goal Tracker
/k/                    K-Hydro Track
/t5/                   Top 5 Review
/gms/                  All games
  /gms/a/              Asteroids
  /gms/c/              Pocket Legends CCG
  /gms/s/              Snake Battle
  /gms/t/              Desert Throw
  /gms/o/              Storybook Adventure
  /gms/z/              Zombie Horde
  /gms/k/kc/           Kingdom City
  /gms/k/kg/           Kingdom Manager
  /gms/pirates/        Pirates (Babylon.js 3D isometric)
  /gms/driverc/        DriverC (isometric racing)
  /gms/simple-shooter/ Simple Shooter
  /gms/pwa/            PWA games (sudoku, crpg, dicey, drace, idleLife, idleWestern,
                         miniwar, orpg, rcell, dodgybird, idleTransport, pirate2d,
                         snake, transport, cc1, wl)
  /gms/3d/             3D games (bouncem — Three.js, crowd — Three.js)
  /gms/2d/             2D games (paperant)
```

---

## Project Registry — projects.js

**`/projects.js`** is the single source of truth for what's displayed on the Projects page.

```js
{ name: "...", path: "/gms/foo/", screenshot: "foo", type: "app"|"game"|"other",
  desc: "...", date: "YYYY-MM-DD" }
```

- `type: "app"` or `type: "game"` — shown on Projects page
- `type: "other"` — tracked but not displayed (with `note` field)
- Screenshots go in `/assets/screenshots/<screenshot>.jpg`

**When adding a new project:** add entry to `projects.js` + add screenshot.

---

## Tech Stack

- **Vanilla JS, HTML, CSS** — no build step for most projects
- **Three.js** (CDN, r128) — 3D games
- **Babylon.js** (CDN) — Pirates game
- **Monaco Editor** (CDN) — code editors
- **Web Audio API** — game audio
- **localStorage** — save data
- **PWAs** — service worker + manifest for installable apps/games

---

## Deployment

| What | How |
|------|-----|
| Main site | Push to `main` → GitHub Pages auto-deploys |
| fnote PWA | GitHub Actions → Cloudflare Pages (`CLOUDFLARE_API_TOKEN` secret) |
| Other PWAs | Same pattern via `.github/workflows/` |

Cloudflare account ID: `923cdf859ffb1c6b2d38f267d9521078`

---

## Branch Conventions

- Feature branches: descriptive name (e.g. `add-idle-western`)
- Claude-created branches: `claude/<feature-slug>-<id>` (e.g. `claude/create-dicey-pwa-WMnQa`)
- PRs merge to `main`

---

## Adding a New Project — Checklist

1. Create directory under appropriate path (e.g. `/gms/pwa/newgame/`)
2. Build with `index.html` as entry point
3. Add screenshot to `/assets/screenshots/newgame.jpg`
4. Add entry to `projects.js`
5. Create branch, open PR to `main`

---

## Per-Project CLAUDE.md Files

Some projects have their own `CLAUDE.md` with architecture details:
- `/gms/3d/crowd/CLAUDE.md` — Crowd Rush 3D (Three.js, multi-file)
- `/gms/2d/paperant/claude.md` — Paper Ant puzzle game

When working on a specific project, read its `CLAUDE.md` first if present.
