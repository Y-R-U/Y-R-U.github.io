# games.br8t.com

The hub, and the games that have been brought across to it. One account spans
every game on the origin; progress is stored per game.

## Layout

Everything keeps its repo path on the server **except the hub**, which moves from
`/games/` to the document root:

```
games/index.html          →  /
games/css, games/js       →  /css, /js
lib/auth/                 →  /lib/auth/          (shared account layer)
gms/2d/racketeer/         →  /gms/2d/racketeer/
assets/screenshots/*.jpg  →  /assets/screenshots/
```

That means absolute URLs like `/lib/auth/ui.js` and `/gms/2d/racketeer/` resolve
identically here and on the GitHub Pages mirror — no per-origin path juggling.

## Deploy

```
./deploy.sh          # rsync to /srv/apps/br8tgames/site on the br8t box
```

Caddy serves it statically. Nothing is built.

## Adding a game

1. Flip `soon` off in `js/games.js` (or add a new entry).
2. Add its path to `GAMES` in `deploy.sh` so the files actually ship.
3. Wire its save to the account layer — `gms/2d/racketeer/js/cloud.js` is the
   worked example: a sync hook on the game's own persist(), plus `mountAccount`
   with `getLocal` / `applyRemote` / `describe`.

## Why sign-in is per-origin

Firebase keeps the session in origin-scoped storage, so everything under
`games.br8t.com` shares one login. **Games must live at paths, not subdomains** —
`racketeer.br8t.com` would be a separate origin and a separate login. The Pages
mirror is likewise its own login; that's expected.

## Caching

The Caddy vhost sends `Cache-Control: no-cache` for `.js` / `.css` / `.html` and
a week for images. This is deliberate and worth keeping: without it Caddy sends
no cache header at all, Chrome applies its own heuristic, and players keep
running a stale `auth.js` after a deploy. `no-cache` still stores the file — it
just revalidates first, which is a cheap 304 when nothing changed.

## Diagnostics

`/lib/auth/diag.html` — reports the current uid, whether the session is
anonymous, and which storage Firebase actually settled on. An in-memory
fallback looks perfectly healthy until the page is reloaded, so check here
first when a sign-in "doesn't stick".

## Ragdojo release preparation (2026-09-08, not deployed)

Ragdojo is the first game with a minified release step. Run `npm ci && npm run build`
inside `gms/2d/ragdojo` before deployment. `deploy.sh` checks that build exists before
any remote action and ships `dist/home` at `/gms/2d/ragdojo/`. The source remains
readable, and shared `/lib/auth/` must ship with it. A stale existing build is still
possible: always rebuild from the reviewed commit immediately before deployment.

Its test payment API is a separate Go/SQLite service in
`/Users/aaronair/cc/ionos/ragdojo-payments`, proxied by Caddy at `/api/ragdojo/*`.
The static deploy script does not install that service or its private environment.
See `gms/2d/ragdojo/docs/MONETISATION.md` for the approved free/DARK split, build,
verification boundaries and release approvals. Live payments remain disabled.
