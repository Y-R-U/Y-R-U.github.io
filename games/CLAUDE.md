# games.br8t.com — read this first

The hub at **https://games.br8t.com** and the shared player-account layer behind
it. Read this before touching anything under `/games/` or `/lib/auth/`, or any
game that has a `js/cloud.js`.

Companion doc: `games/README.md` (hosting, deploy, how to add a game). This file
is the state of play and the reasoning behind it.

---

## The shape of it

| Piece | Where | What it is |
|---|---|---|
| Hub page | `/games/` | Curated line-up. Deploys to the document root of games.br8t.com |
| Account layer | `/lib/auth/` | Firebase auth + Firestore saves + the avatar UI. Shared by every game |
| Games | `/gms/…` | Each keeps its repo path on the server |
| Rules | `/firestore.rules` | Deployed. Each uid reaches its own document tree, nothing else |

**Firebase project `br8t-games`**, Firestore `(default)` in `europe-west2`
(permanent — region cannot be changed).

Sign-in providers: **Anonymous** (every visitor, on load), **Google**,
**Email link**. Email/Password is technically on because the console won't
separate it from Email link — accepted deliberately. **Apple is skipped**: it
needs the $99/yr Apple Developer Program, and Aaron will revisit only if players
ask.

### The one architectural constraint

Firebase keeps its session in origin-scoped storage, so **one origin = one
login**. Games must live at **paths** under games.br8t.com, never their own
subdomains — `racketeer.br8t.com` would be a separate login. The GitHub Pages
mirror is likewise its own login; that is expected and Aaron is fine with it.

---

## The account layer

```
/lib/auth/config.js     firebaseConfig (public by design — NOT a secret)
/lib/auth/auth.js       anonymous on load, Google popup link, email link, AccountConflict
/lib/auth/cloud.js      users/{uid}/games/{gameId}, debounced writes
/lib/auth/ui.js         avatar + panel in a shadow root, mountAccount(), matchCompleted()
/lib/auth/localsync.js  mirror a game's localStorage keys — the easy path for new games
/lib/auth/diag.html     live diagnostics; start here when sign-in "doesn't stick"
```

Games import these by **absolute path** (`/lib/auth/localsync.js`), which
resolves identically on games.br8t.com and on GitHub Pages.

### Wiring a new game (the whole job)

1. `js/cloud.js` in the game folder calling `syncLocalKeys({ gameId, keys, describe })`.
2. Dynamic `import().then().catch()` from the game's entry module, so the game
   still runs when the account layer can't load. Skip it under the game's own
   test/soak flags.
3. `matchCompleted()` once per completed match/level, on the results screen.
4. Shift any top-right furniture with `calc(… + var(--br8t-account-space, 0px))`.
5. Add the path to `GAMES` in `games/deploy.sh`, and flip `soon` in `games/js/games.js`.

**Never sync in-progress match state.** Career progress, unlocks, settings,
competitions and stats travel between devices; a half-played match does not.
Aaron was explicit about this. Hexpire's `hexpire.resume` is the clearest case.

---

## Hard-won gotchas — do not relearn these

- **Never compare two saves with `JSON.stringify`.** A save that round-trips
  through Firestore comes back with different key order, and load-with-defaults
  adds keys — byte equality reports a difference that isn't there. This caused an
  **infinite reload loop** in Racketeer. Decide freshness with an explicit
  `savedAt` timestamp. `localsync.js` mirrors **raw strings** for this reason.
- **Any reload-on-adopt needs a session-scoped once-guard**, so a future mistake
  degrades to a stale save instead of an unusable game.
- **`onAuthStateChanged` does not fire on `linkWithPopup`** — linking mutates the
  current user rather than swapping it. Listen on `onIdTokenChanged`.
- **Don't `deleteUser()` the orphaned anonymous user** after adopting an account:
  sign-out bookkeeping on the same auth instance can land in persistence *after*
  the real session, so the player is signed out by their next reload.
- **Caching bit us twice.** Caddy sent no `Cache-Control` at all, so Chrome
  heuristically cached `auth.js` and Aaron kept retesting old code after every
  deploy. Both vhosts now send `no-cache` for js/css/html and a week for images.
  Keep it that way.
- **Screenshots don't prove interactivity.** A `pointer-events: none` bug on the
  br8t.com GAMES link passed every screenshot. Test real clicks.

## Testing

Headless Chrome + raw CDP from node, no puppeteer:
`~/.claude/bin/cdp start --port 92xx`, then `Page.navigate` / `Runtime.evaluate`
over the WebSocket. Use a distinct port per agent. Always include a
**reload-loop check**: count top-level `Page.frameNavigated` events over ~12s
after loading a game while signed in — it must be 1.

Sign-in flows that need a real popup can't be driven headlessly. Use an
email/password `linkWithCredential` as a stand-in — it exercises the same
"linking mutates the current user" path — or drive Aaron's own Chrome via the
Claude in Chrome extension (`/chrome` to enable).

## Session lifetime

No TTL. Indefinite on Chrome/Android; **~7 days of inactivity on Safari/iOS**,
where tracking prevention evicts IndexedDB. `navigator.storage.persist()`
deliberately not used — it prompts in Firefox and Safari ignores it.

---

## State of play

**Live:** the hub, and **Racketeer** fully wired (cloud saves, third-match
prompt, avatar clear of the money chip). Rules deployed and verified, including
that one player cannot read or write another's document.

**In flight (2026-07-29):** Ironhail, Hexpire, Grudge Bugs, Sunday League and
Paper Ant being wired to the account layer, one agent per game.

**Deliberately not on the hub yet:** Prism Break, Towered, Hotwire — they want
more play testing first. Voidcast stays as a "coming soon" card.

**Open items:**
- **App Check** before publicising the hub. The Email/Password provider can't be
  disabled separately, so anyone with the public API key can create junk
  accounts. Harmless under the current rules, but worth closing.
- The **two-saves chooser** has never fired in anger — it needs genuinely
  different progress on two devices.
- `firebase deploy` needs Aaron to run `firebase login --reauth` when the
  firebase-tools token in `~/.config/configstore/` expires.
