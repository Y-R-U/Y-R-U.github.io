# Dev tools — how they work and how to add a tab

The dev tools are the product of this project. The shell exists so a tab is ~100 lines of "draw my
UI, edit `ctx.data`" and gets persistence, undo, save reporting, validation and backend access for
free. Read §3 before writing one.

Owner of everything in here: the dev-infrastructure agent. `js/dev/tabs/<id>.js` belongs to
whoever owns that tab.

```
js/dev/gate.js        isLocal() — the local-only gate. Pure, unit-tested.
js/dev/boot.js        inserts the DEV button, only when isLocal(). Lazy-imports the hub.
js/dev/hub.js         the overlay: tab registry, chrome, toast, save indicator, game pause
js/dev/api.js         client for the dev server; every call returns {ok,…} and never throws
js/dev/data.js        the shared document store: load/cache/mutate/undo/save/notify
js/dev/dev.css        all the overlay styling
js/dev/tabs/*.js      one file per tab; each calls registerTab()
js/dev/selftest.html  the hub over a fake game — works with no engine at all
js/dev/cdp.mjs        headless-Chrome driver (node only, no puppeteer)
js/dev/uitest.mjs     clicks through the hub and checks the bytes on disk changed
js/dev/*.test.mjs     pure-module tests: node js/dev/gate.test.mjs
tools/devserver.mjs   the authoring server
tools/vo/kokoro_say.py  batched Kokoro TTS, run by /api/tts
```

---

## 1. Running it

```bash
node tools/devserver.mjs            # port 8796, binds 0.0.0.0 so a phone on the LAN can reach it
open http://localhost:8796/
```

The **DEV** button appears bottom-right. `` ` `` or ctrl/cmd+shift+D toggles the hub, Esc closes it,
ctrl/cmd+S saves everything dirty, ctrl/cmd+Z / shift+ctrl/cmd+Z undo and redo (except inside a
text field, where the browser's own undo wins).

**The tools work with no dev server at all.** Open the page from any static server and every tab
still opens and still edits; documents load from the static `data/*.json` files, saves go to
localStorage, and a banner says so. That path is tested — see §8.

`node tools/devserver.mjs --port 9000` moves it. `WF_ACE`, `WF_FLUX`, `WF_LTX`, `WF_KOKORO_PY`
override the backend addresses (used by the tests to point at a dead port).

### The gate

`isLocal()` is true for `localhost`, `127.0.0.1`, `::1`, anything ending `.local`, a `file:` origin,
and the private IPv4 ranges `10.*`, `192.168.*`, `172.16-31.*`. Nothing else — `172.32.x` is not
private, `010.0.0.1` is not canonical, `localhost.evil.com` is not localhost. When it is false the
button is **not created**; it is not hidden with CSS, and nothing under `js/dev/` except `gate.js`
is even fetched. `node js/dev/gate.test.mjs` covers 56 cases.

---

## 2. The dev server — `tools/devserver.mjs`

Node, zero dependencies. Serves this directory statically (`.js`/`.mjs` as `text/javascript`, Range
requests for audio) plus:

| Route | Body | Returns |
|---|---|---|
| `GET  /api/status` | — | `{ok, devserver, kokoro, ace, flux, detail, queue}` |
| `POST /api/load` | `{path}` | `{ok, json, bytes}` or `{ok:false, missing:true}` |
| `POST /api/save` | `{path, json}` | `{ok, path, bytes}` — pretty-printed 2-space, atomic |
| `GET  /api/ls` | `?dir=` | `{ok, files:[{name,size,mtime,dir}]}` |
| `POST /api/tts` | `{voice,text,speed,out}` | `{ok, url, seconds, rms, peak, wpm}` |
| `POST /api/tts/batch` | `{jobs:[…]}` | `{ok, results:[…], failed}` |
| `POST /api/music` | `{prompt,lyrics,seconds,out}` | `{ok, job, position}` — then poll |
| `POST /api/flux` | `{prompt,out,width,height,seed}` | `{ok, job, position}` — then poll |
| `GET  /api/job/<id>` | — | `{ok, state, note, position, url, error}` |
| `GET  /api/queue` | — | `{ok, running, waiting, jobs}` |

`state` is `queued` → `running` → `done` | `error`.

### Safety rules, all enforced server-side

- `/api/save` writes **only** under `data/`, **only** `.json`. The path is resolved and compared
  against the resolved `data/` directory, so `../`, an absolute path and a URL-encoded escape all
  fail with `path escapes data/`.
- Writes are **atomic** — temp file, fsync, rename. A killed process leaves the old document or the
  new one, never half of one.
- Every write route refuses a caller whose address is not loopback or private, and every `/api/`
  route refuses a request carrying a non-local `Origin` (a page on the internet, open in Aaron's
  browser, can otherwise reach localhost).
- `/api/ls` only lists a whitelist: `data`, `data/levels`, `audio/vo`, `audio/music`, `art`,
  `tools/vo`, `js/dev/tabs`.
- Generated output names are `[A-Za-z0-9._-]` plus `/`, confined to their own directory.

### The one GPU slot

**ACE-Step and Flux cannot co-reside in 24 GB.** `/api/music` and `/api/flux` go through a single
in-process queue: one runs, the rest wait, and the POST answers immediately with `{job, position}`
so a tab can show "2nd in queue". Before a job starts, the server unloads the *other* backend and
waits (up to 150 s) for LTX — which is not ours but holds ~16 GB when warm — to drop its worker.
There is no lock file and there must never be one; the mflux and LTX queue servers serialise their
own work and a side channel only fights them.

`/api/status` is **passive**: `GET /admin/status` on ACE-Step and `GET /api/status` on mflux/LTX are
the endpoints that do not wake a model. Both idle-unload after 120 s; a status poll must never be
the thing that keeps them resident. Do not add a status check that submits a job.

### Serving above the root

`index.html`'s importmap points at `../../lib/three/…`, which the browser normalises to `/lib/…` —
above this server's root. `/lib/` and `/assets/` are therefore mounted read-only from `gms/lib` and
`site/assets`. Without them the game cannot boot under the dev server at all.

---

## 3. Writing a tab

Create `js/dev/tabs/<id>.js` for one of the five reserved ids — `level`, `convo`, `chars`, `music`,
`debug`. The hub imports it automatically (it asks `/api/ls` first, so an id with no file shows a
placeholder instead of logging a 404). Nothing else needs changing: no registry edit, no import
line anywhere.

```js
import { registerTab } from '../hub.js';

registerTab({
  id: 'convo',
  label: 'Conversations',            // optional — the hub already knows the label and order
  order: 20,
  async mount(el, ctx) {             // el is an empty <main>; fill it
    const doc = await ctx.data.load('conversations');
    el.innerHTML = `<section>…</section>`;
    this._off = ctx.data.onChange('conversations', d => repaint(d));
  },
  unmount() { this._off?.(); },      // called on every tab switch and on close
});
```

`mount` may be async and may throw — the hub catches it, shows the error in place and toasts it.
`this` inside `mount`/`unmount` is the registered tab object, which is a fine place to park handles.

### `ctx`

| | |
|---|---|
| `ctx.app` | the engine `App` (getter — safe to read late) |
| `ctx.world` | the world, whatever `main.js` passed to `bootDev` |
| `ctx.api` | §5 |
| `ctx.data` | §4 |
| `ctx.toast(msg, kind)` | `''`, `'good'`, `'warn'`, `'bad'`. Click dismisses; `bad` lingers |
| `ctx.close()` | back to the game (resumes the loop) |
| `ctx.hub` | *(addition to the contract)* `{show(id), registerTab, refreshStatus(), slots()}` |

`main.js` calls `bootDev({ app, world, player, doors, characters })`; anything it passes is on
`host` and reachable via `ctx.app`/`ctx.world`, and `window.__wf` is read as a fallback.

### CSS

`js/dev/dev.css` is the only stylesheet, and it is loaded once by `boot.js`. Reuse the existing
classes — `.row`, `.pill`, `.split/.side/.main`, `.problems`, `.empty`, `.wide`, `.good/.bad/
.warnc/.dim`, `button.primary`, `button.danger`.

**The game's own `style.css` defines generic class names too** (`.row` is `justify-content:
space-between` there, and it silently reshaped a toolbar in here). `#wf-dev` carries a reset that
outranks any foreign class rule, so this is handled — but if you invent a class inside your tab,
prefix it (`convo-list`, not `list`). A corollary of that reset: it re-enables `display` on
everything, so the `hidden` attribute is separately forced back off — do not remove that rule.

---

## 4. The document store — `js/dev/data.js`

One module owns every authored document. Two tabs reading the same document see the same object and
the same changes, and one undo stack covers all of them.

| kind | file | id? |
|---|---|---|
| `levelIndex` | `data/levels/index.json` | — (**a bare array**, per the contract, not `{version,…}`) |
| `levels` | `data/levels/<id>.json` | **yes** — every call takes an id |
| `conversations` | `data/conversations.json` | — |
| `characters` | `data/characters.json` | — |
| `barks` | `data/barks.json` | — |
| `music` | `data/music.json` | — |

```js
await data.load('conversations')          // → doc. Caches; safe to call from every tab.
await data.load('levels', 'academy')      // collection kinds take an id everywhere
data.get('characters')                    // → doc or null (sync, must be loaded)
data.set(kind, doc, id, { label, coalesce })
data.mutate(kind, id, d => { d.nodes.x = …; }, { label: 'add node' })
await data.save(kind, id)                 // → {ok, where, path, bytes, problems, error}
data.revert(kind, id)                     // back to the last saved bytes
data.dirty(kind, id) / data.dirtyKeys()
data.validate(kind, doc)                  // → [] or a list of human-readable problems
data.undo() / data.redo() / data.canUndo() / data.historyLabels()
data.onChange(kind, (doc, id, why) => …)  // why: load | set | undo | redo
data.onAny(({kind, id, doc, why}) => …)
data.onSave(({key, ok, where, path, error}) => …)
await data.levelIds()                     // index + files on disk + drafts + anything loaded
data.download(kind, id) / data.applyDraft / data.dropDraft / data.storageHealth()
```

**Always change a document through `set`/`mutate`.** Mutating the object from `get()` in place skips
undo, dirty tracking and every other tab's redraw. `mutate` clones for you.

`coalesce: true` merges consecutive same-label edits made within 800 ms into one undo step — use it
for anything driven by a slider or a keystroke, so one drag is one undo.

### Saving, and knowing whether it landed

`save()` writes through the dev server when it is up. When it is not, it writes to localStorage and
returns `{ok:true, where:'local', note:'no dev server — saved in this browser only'}` — and the
document **stays dirty**, because the file on disk did not change. The header says
`1 in this browser only · characters` for that, and `1 unsaved` for a genuine unsaved edit. If both
fail you get `{ok:false, error}` and a red toast that does not auto-dismiss.

Every tool that edits data must show the result of its last save. `data.onSave` and the header
indicator do it for free; do not add a save button that discards the return value.

### Loading order

dev server → the static file over `fetch` (so it works on GitHub Pages) → the blank template for
that kind. A blank document is *dirty on arrival* — it has never been written. If a localStorage
draft exists while the dev server is up the file still wins, and the draft is flagged
(`staleDraft`) for the Status tab so nothing is silently resurrected or silently lost.

---

## 5. The dev API — `js/dev/api.js`

```js
await api.up()        // {ok, base, devserver, kokoro, ace, flux} — which backends answered
await api.status()    // cached; status({force:true}) re-probes
await api.online()    // is there a dev server at all
await api.save(path, json) / api.load(path) / api.ls(dir)
await api.tts({ voice:'bm_fable', text:'Who fights?', speed:1, out:'greeter_hello_01' })
await api.ttsBatch([ …the same objects… ])
await api.music({ prompt, lyrics, seconds, out }, onProgress)
await api.flux({ prompt, out, width, height, seed }, onProgress)
```

Nothing throws. Every result is `{ok:true, …}` or `{ok:false, error, offline?}`. `music` and `flux`
submit, then poll `/api/job/<id>` for you and call `onProgress({state, note, position})` on the way,
so `await` reads like a synchronous call that takes two minutes.

The base URL is found once: same origin, then `<hostname>:8796`, then `127.0.0.1:8796`. With no dev
server the answer is cached for 10 s before re-probing — without that backoff a status pill on a
timer fills the console with connection errors.

### Voice-over

`out` is a basename under `audio/vo/`, no extension. `kokoro_say.py` **refuses** to write a take
that comes back silent or shorter than 0.2 s and returns an error for that job instead — a
zero-byte clip that "exists" is this house's classic bug, so do not work around the refusal, fix the
line. It is batched because loading the 82M model costs ~6 s and a line costs ~1 s: **one
`ttsBatch` of 40 lines is 40× faster than 40 `tts` calls.** Measured here: one line 8.0 s, two lines
8.8 s.

`keep_words` + `overlap` cut a take on the model's own word boundary — give it the whole sentence
and keep the first n words, which is how you get an interruption that sounds interrupted.

### Music and images

Both are slow (a 150 s song ≈ 2 min) and both are serialised. Show `position` from the job while it
waits. Never call them in parallel expecting parallelism, and never bypass the server to hit
`:8001` or `:7867` directly from a tab — that is how two models end up resident at once.

---

## 6. The two shipped tabs

**Status** — what the dev server reports, which backends answered (and whether their model is
resident), the generation queue, every loaded document with its source, dirty state and last save,
localStorage health, and the engine readout. It is the only thing that polls.

**Data** — the raw JSON editor for every kind, with live validation, save, revert, download and
import. It is the escape hatch when a purpose-built tab cannot express something. If your tab's
document looks wrong, open it here first.

---

## 7. Testing

```bash
node js/dev/gate.test.mjs      # 56 assertions, pure
node js/dev/data.test.mjs      # 51 assertions, fake api + fake storage, no DOM
node tools/devserver.mjs &
node js/dev/uitest.mjs /tmp/wf-devshots     # headless Chrome, real clicks, real save
```

`uitest.mjs` drives `index.html` if it exists and `js/dev/selftest.html` otherwise, opens the hub,
edits a scratch level, saves it and **checks the bytes on disk changed**. It writes and deletes
`data/levels/__uitest.json`.

**Never point a UI test at a real document.** The first version of that script saved over a seeded
`data/conversations.json`; the Data tab saves exactly what it is given and there is no undo on disk.

`js/dev/cdp.mjs` is the driver if you want to write your own: `launch()`, `attach(port, url)`, then
`eval`, `click` (a real `Input.dispatchMouseEvent`, not `element.click()`), `clickText`, `key`,
`type`, `waitFor`, `shot`, `logs`. **Always open the PNG with the Read tool** — a screenshot you did
not look at is not evidence.

---

## 8. Gotchas that have already cost time here

- **WebGL headless needs `--use-angle=metal --use-gl=angle`.** Without them the renderer throws
  before `bootDev` is ever reached and the DEV button "does not exist".
- **`beforeunload` blocks headless navigation.** The unsaved-changes guard puts up a dialog that
  nothing answers; handle `Page.javascriptDialogOpening` (cdp.mjs does).
- **The game's `style.css` styles `.row` and friends inside the overlay.** See §3.
- **`display: revert` un-hides `[hidden]`.** See §3.
- **The real `index.html` boots an engine first**, so the DEV button appears a second or two after
  load. Poll for it, do not assert immediately.
- **The dev server's root is this directory**, so `three` at `gms/lib` is above it — hence the
  `/lib/` mount. A new shared dependency outside this folder needs a new mount.
- Missing tab modules log one 404 each **only when there is no dev server** to list the directory.
- `window.__wf` is replaced wholesale by `app.expose()`, so `window.__wfDev` is the handle that is
  always there; `window.__wf.dev` is attached on top when it can be.
- The hub pauses the loop with `cancelAnimationFrame(app.raf)` and resumes with `app.start()`. If
  the engine grows a real `pause()`/`resume()` (on the app or on `window.__wf`) the hub will use
  that instead, automatically.
