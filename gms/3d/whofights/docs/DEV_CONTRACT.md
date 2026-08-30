# WHO FIGHTS — the contract

Binding for every agent working on this project. If you need to change something in here, say so in
your report; do not silently diverge. **File ownership is exclusive** — do not edit a file another
section names as its owner.

Project root: `~/cc/yru/site/gms/3d/whofights/`. Engine lifted from `../forge/`.
Style bible + comment rules: `../forge/CLAUDE.md` (Aaron has ADHD — very few comments, only where
genuinely confusing; never restate what a line does; no banner comments; no JSDoc).

No build step. ES modules, `three` via the importmap. The shipped game must run as plain static
files from GitHub Pages. The dev server is an **authoring-only** convenience.

---

## 1. Dev mode gate

`js/dev/gate.js` exports `isLocal()`. True when `location.hostname` is `localhost`, `127.0.0.1`,
`::1`, ends in `.local`, is a `file:` origin, or is a private IPv4: `10.*`, `192.168.*`,
`172.16-31.*`. Nothing else. The DEV button is only inserted into the DOM when `isLocal()`.

`js/dev/api.js` exports the dev server client. Every call returns `{ok, ...}` and never throws.
`await api.up()` reports which backends answered. When the dev server is absent the tools still
open, still edit, and fall back to localStorage + a download button — they say so in a banner.

## 2. Dev server — `tools/devserver.mjs`

Node, zero dependencies, `node tools/devserver.mjs` (default port **8796**). Serves the whofights
directory statically *and*:

| Route | Body | Does |
|---|---|---|
| `GET  /api/status` | — | `{devserver:true, kokoro:bool, ace:bool, flux:bool}` |
| `POST /api/save` | `{path, json}` | writes `data/<path>` (path is confined to `data/`, `.json` only), pretty-printed 2-space |
| `POST /api/load` | `{path}` | reads it back |
| `POST /api/tts` | `{voice, text, speed, out}` | kokoro → writes `audio/vo/<out>.wav`, returns `{url, seconds}` |
| `POST /api/tts/batch` | `{jobs:[…]}` | same, batched (one model load) |
| `POST /api/music` | `{prompt, lyrics, seconds, out}` | ACE-Step → `audio/music/<out>.mp3` |
| `POST /api/flux` | `{prompt, out, width, height, seed}` | mflux → `art/<out>.png` |
| `GET  /api/ls` | `?dir=` | lists a whitelisted asset dir |

Backends: kokoro via `/Users/aaronair/.local/share/uv/tools/abogen/bin/python` running
`tools/vo/kokoro_say.py` (lifted from `../neonhaul/tools/vo/kokoro_say.py`); ACE-Step at
`http://localhost:8001` (submit `/release_task`, poll `/query_result`, fetch `/v1/audio?path=`);
mflux at `http://localhost:7867` (`/api/generate`, `/api/jobs/{id}`).

**GPU rule:** ACE-Step and Flux cannot co-reside in 24 GB. The server serialises `/api/music` and
`/api/flux` through a single in-process queue. Never run both at once.

## 3. Dev hub — `js/dev/hub.js`

Full-screen overlay over the game, tabbed. Owns the shell, the tab registry and the CSS
(`js/dev/dev.css`). A tab registers itself:

```js
registerTab({ id:'level', label:'Level', order:10, mount(el, ctx){…}, unmount(){} });
```

`ctx` = `{ app, world, api, data, toast, close }`. `ctx.data` is the shared document store (§4).
`close()` returns to the game. Opening the hub pauses the game loop; closing resumes it.

## 4. Data documents — `js/dev/data.js` (owner: scaffold agent)

One module loads, caches, mutates and saves every authored document. `data.get(kind)`,
`data.set(kind, doc)`, `await data.save(kind)`, `data.onChange(kind, fn)`. Kinds and files:

| kind | file | shape |
|---|---|---|
| `levels` | `data/levels/<id>.json` | scene doc + `hotspots` (§5) |
| `levelIndex` | `data/levels/index.json` | `[{id, name, start:{x,z,yaw}}]` |
| `conversations` | `data/conversations.json` | §6 |
| `characters` | `data/characters.json` | §7 |
| `barks` | `data/barks.json` | §8 |
| `music` | `data/music.json` | §9 |

Every file is plain JSON, hand-editable, and the game reads the same files the tools write.

## 5. Hotspots — inside a level document

```json
{ "id": "hs.doorway.hall", "name": "Hall doorway",
  "shape": {"k":"circle","x":0,"z":0,"r":3},        // or {"k":"rect",x0,z0,x1,z1}
  "trigger": "enter",                                 // enter | exit | click | interact | always
  "once": false,
  "cooldown": 0,
  "if": null,                                         // predicate, forge js/game/predicate.js
  "actions": [ … ]                                    // §10
}
```

A hotspot may also be attached to a character rather than a place: `"attach": "<characterId>"`,
in which case `shape` is ignored and the radius comes from `"r"` (default 2.5).

## 6. Conversations — `data/conversations.json`

```json
{ "version": 1,
  "nodes": {
    "academy.greeter.hello": {
      "name": "Greeter — first hello",
      "cam": "two",
      "once": true,
      "lines": [ {"who":"greeter", "text":"Welcome to the Academy.", "vo":"greeter_hello_01"} ],
      "choices": [ {"say":"Who are you?", "goto":"academy.greeter.who", "sets":[]} ],
      "next": null,
      "sets": []
    }
  }
}
```

`who` is a **character id** (§7). Narrators and bodiless NPCs are characters too — they just have
`body: "none"`. `vo` is the basename of a clip under `audio/vo/`; absent means unvoiced.

Reverse links ("what triggers this conversation?") are **derived, never stored**: the conversation
tab scans every level's hotspots and every character for `{"k":"say","node":<id>}` actions.

## 7. Characters — `data/characters.json`

```json
{ "version": 1,
  "characters": {
    "player":  { "name":"You", "body":"robed", "robe":"dark",  "voice":"am_echo",  … },
    "greeter": { "name":"Instructor Vail", "body":"robed", "robe":"light", … },
    "narrator":{ "name":"Narrator", "body":"none", "voice":"bm_fable" }
  } }
```

Full field list (all optional except `name` and `body`):

| field | values |
|---|---|
| `body` | `robed` \| `dummy` \| `none` — **two rigs.** `robed` is the hooded cloak (`people.js`), the default look and what the player starts as. `dummy` is the configurable humanoid: a UV'd crash-test-dummy base in male and female shapes, skinned with a generated texture. `none` is a narrator or voice-only NPC. |
| `sex` | `f` \| `m` — **`dummy` only.** Picks the body shape. Nothing else reads it. |
| `skin` (dummy) | id of a generated skin under `art/skins/`. |
| `robe` | `light` \| `dark` \| `neutral` |
| `height` | 0.85–1.20 (multiplier) |
| `build` | 0.85–1.20 (width multiplier) |
| `gender` | `f` \| `m` \| `x` — **metadata only.** It must not pick a mesh, a rig or a variant. Voice is always chosen explicitly per character; gender may at most order the voice list. |
| `hair` | `#rrggbb` — `dummy` only; the cowl hides it on `robed`. |
| `hood` | `up` \| `down` |
| `voice` | kokoro voice id, e.g. `am_echo` |
| `voiceSpeed` | 0.7–1.3, default 1.0 |
| `voicePitch` | semitones −4…+4, default 0 (applied as an ffmpeg/WebAudio post-shift) |
| `barks` | `{ <category>: [line, …] }` — overrides/extends the shared set |
| `place` | `{level, x, z, yaw}` when the character has a body in the world |

A "simple NPC" or a narrator is just a character with `body: "none"`. **Promote to full character**
= set `body: "robed"` and give it a `place`. That is the whole operation; the UI button does that.

## 8. Barks — `data/barks.json`

```json
{ "version":1,
  "categories": { "idle": {"label":"Idle", "note":"…"}, … },
  "shared":     { "idle": ["Bored now.", …], … } }
```

Categories (fixed set — add more only by asking): `idle`, `greet`, `farewell`, `curious`,
`grumble`, `success`, `failure`, `hurt`, `combat`, `spot`, `thanks`, `refuse`, `wander`, `weather`.

Generated clips: `audio/vo/<characterId>__<category>__<nn>.wav`, and a sidecar
`audio/vo/index.json` mapping `{characterId, category, i} → {file, text, voice, speed, hash}`.
`hash` is of `text|voice|speed|pitch` so "Generate all" can skip what has not changed.

## 9. Music — `data/music.json`

```json
{ "version":1,
  "tracks": [ {"id":"tavern_01","title":"…","file":"audio/music/tavern_01.mp3",
               "kind":"song|instrumental","mood":"…","seconds":142,"prompt":"…","lyrics":"…",
               "source":"suno|acestep","ends":"clean|abrupt","starts":"clean|quiet"} ],
  "sets":   [ {"id":"academy_hall","label":"Academy hall","tracks":["…"],"shuffle":true,
               "fadeMs":1500,"volume":0.7} ] }
```

Tracks are generated on **Suno**, in Aaron's logged-in browser — the recipe is
`../../2d/skyhammer/docs/MUSIC_NOTES.md`. Aaron's Suno subscription
lapses before long, after which local **ACE-Step** (`/api/music`) is the only music route this
project has — so the ACE-Step path stays first-class and every track must be re-makeable from what
`docs/MUSIC.md` records about it. `source` records which tool made each track.

`ends` and `starts` describe the take, not the wish. `ends:"abrupt"` forces at least a 1500 ms
fade on the *natural* handover whatever the set's `fadeMs` says — `combat` is 400 ms and clicked —
and takes 400 ms off an abrupt sting's tail. `starts:"quiet"` caps the fade-in at 300 ms so a take
that already ramps itself is not dipped twice. A deliberate set change still uses the author's
`fadeMs`; only the natural end gets the longer one.

A music set is played by a hotspot action `{"k":"music","set":"academy_hall"}`, or by a level's
`"music"` field as its default.

## 10. Actions — the shared verb list

Used by hotspots, conversation `sets`, and character interactions. Owner of the runtime executor:
`js/game/actions.js` (scaffold agent creates it with the first four; other agents add verbs and
their own docs row).

| action | shape |
|---|---|
| say | `{"k":"say","node":"<conversationId>"}` |
| goto | `{"k":"goto","level":"<id>","at":{"x":0,"z":0,"yaw":0}}` |
| music | `{"k":"music","set":"<setId>"}` or `{"k":"music","stop":true}` |
| flag | `{"k":"flag","name":"…","value":true}` |
| bark | `{"k":"bark","who":"<characterId>","category":"idle"}` |
| event | `{"k":"event","name":"…","data":{}}` — emitted on `window.__wf.bus` |

## 11. House rules

- `window.__wf` is the debug handle (forge uses `__forge`). Expose your systems on it.
- Every tool that edits data must show whether the last save landed. A tool that has silently
  stopped saving looks exactly like one that is saving.
- Tests: plain `node --test`-free `*.test.mjs` run by `node tools/test.mjs`, the forge style —
  pure modules only, no DOM. If your module can be made pure, make it pure and test it.
- Before claiming a screen works, **look at it** — `node tools/shot.mjs` or a headless CDP
  screenshot, and open the PNG with the Read tool.
