# Codex Guide: Y-R-U.github.io

## What This Is

This is the GitHub Pages repo for `https://y-r-u.github.io/`. It contains many browser apps and games, mostly vanilla HTML, CSS, and JavaScript with no build step.

- Repo: `git@github.com:Y-R-U/Y-R-U.github.io.git`
- Default branch: `main`
- Deployment: push/merge to `main` auto-deploys through GitHub Pages.

## Repository Structure

```text
/                      Home page and project registry
/assets/               Shared screenshots and media
/ai/                   AI knowledge base and asset zips
/app/pwa/              PWA apps: fnote, timezones, edit2d, khydro, reader
/d/                    Image Editor
/d2/                   Draw & Paint
/e/                    Code Editor
/e2/                   Code Editor V2
/m/                    Mobile Editor
/m2/                   AB Edit
/n/                    WebRTC Test
/q/                    Goal Tracker
/k/                    K-Hydro Track
/t5/                   Top 5 Review
/gms/                  Games
/gms/pwa/              PWA games
/gms/3d/               Three.js 3D games
/gms/2d/               2D games
```

## Project Registry

`/projects.js` is the source of truth for the Projects page.

Entries use this shape:

```js
{ name: "...", path: "/gms/foo/", screenshot: "foo", type: "app"|"game"|"other",
  desc: "...", date: "YYYY-MM-DD" }
```

- `type: "app"` and `type: "game"` are shown on the Projects page.
- `type: "other"` is tracked but not displayed.
- Screenshots live at `/assets/screenshots/<screenshot>.jpg`.
- When adding a visible project, add both the `projects.js` entry and a screenshot.

## Tech Stack And Style

- Prefer vanilla JS, HTML, and CSS.
- Most projects have no build step and are loaded directly by GitHub Pages.
- Three.js projects commonly use CDN/global `THREE`.
- Babylon.js and Monaco projects also use CDN dependencies.
- Use `localStorage` for lightweight saves when existing projects already do.
- Preserve each subproject's style and architecture rather than normalizing everything.
- Keep mobile support in mind; many apps and games are mobile-first.

## Deployment Notes

- Main site deploys from `main` to GitHub Pages.
- Some PWAs deploy to Cloudflare Pages through `.github/workflows/`.
- Cloudflare account ID in existing docs: `923cdf859ffb1c6b2d38f267d9521078`.

## Branch And Change Discipline

- Use descriptive branch names for feature work if asked to create branches.
- Do not amend commits unless explicitly asked.
- Do not revert unrelated user changes.
- Before editing a game/app folder, check for nested `AGENTS.md`, `CLAUDE.md`, or `claude.md`.

## Known Project Notes

- `/gms/3d/crowd/AGENTS.md` documents Crowd Rush 3D.
- `/gms/2d/paperant/AGENTS.md` documents Paper Ant.
