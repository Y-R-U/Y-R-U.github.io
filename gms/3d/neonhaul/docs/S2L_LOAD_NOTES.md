# S2-L — the load bug, the cog, and context recovery

The manager's half of pass 2-C. The cockpit and dashboard rebuild (L2/L3) is the build agent's and
is written up in `docs/S2L_NOTES.md`.

## L1 — "sometimes the game doesn't load if i reload the page"

`index.html` resolved the bare specifier `three` to `https://cdn.jsdelivr.net/npm/three@0.160.0/…`.
That makes the **entire module graph**, and therefore the whole game, hostage to one third-party
fetch. When it fails there is no error, no retry and no fallback — `js/main.js` never evaluates,
`#boot` sits on its bar, and `__state.errors` is **empty**, because the module that owns
`reportError` is the module that did not load.

Aaron's follow-up named the trigger: *"happens on local as well. i think game freezes first on
restore of browser? then refresh of game doesn't work."* A machine coming back from sleep has no
network for the first second or two, and a reload issued in that window resolves nothing. It
reproduced on a local server because the **server** was local and the CDN was not.

### Measured, with a control

```
CDN importmap,      DNS blocked, fresh profile → 0/2 loads   stuck on "warming the grid…", 0 errors
vendored importmap, DNS blocked, fresh profile → 3/3 loads   clean
```

The first attempt at that control **passed**, which was wrong: the Chrome profile was being reused
and was serving three out of its HTTP cache. It only became a control once the profile was destroyed
between arms. `gates_boot.mjs` B2 therefore runs with `Network.setCacheDisabled` and says so in the
comment, because this is the exact shape of [[believable-wrong-metric]] — a check that cannot see
the thing it is trusted to see, returning a clean result that reads as safety.

### The fix

`vendor/three/0.160.0/` — three@0.160.0, the four postprocessing addons in use, and their four
transitive deps, resolved recursively from the same CDN URL the importmap used to name. 1.3 MB.
The game now makes **no request to any origin but its own**, which is what B1 asserts; "three is
vendored" would only cover one file and the next dependency somebody adds would not be it.

**Every other game in this repo still has the CDN importmap and therefore still has this bug.**
Twenty-plus of them. Out of scope here; worth Aaron knowing.

### Two defences, because a silent hang must not be possible again

* **the boot watchdog** — a CLASSIC inline script in `index.html`, deliberately not a module,
  because the failure it catches is the module never running. At 20 s with `__ready` still false it
  turns `#boot` amber, prints whatever it caught (`could not load …/js/main.js`, in the gate), and
  shows a **Reload** button.
* **`#ctxlost` grew a Reload button.**

## L5 — a lost context froze the game forever

`preventDefault()` makes a restore *possible*; it does not make one happen. Chrome restores when
its compositor gets round to it, and a tab that lost the context while backgrounded can sit there
indefinitely. The shipped recovery story was preventDefault and hope, and the overlay said
"Restoring…" whether or not anything was coming.

Now the game **asks**, on a backoff — 0.9 s, then 1.4 / 2.8 / 5.6 / 11.2 — and only while the tab
is visible, since `restoreContext()` from a hidden tab is spent for nothing. After four tries the
panel stops claiming a restore is coming. Measured: an unassisted `loseContext(-1)` in headless
Chrome used to leave the overlay up indefinitely and now clears in about 3 s with the loop
advancing (B4, `frames 9 → 11 → 66`).

**What a restored context actually needs**, audited rather than guessed: a render target drawn into
*once* does not survive — three re-creates the framebuffer with no idea anything was rendered into
it. There are exactly **two** targets in the game: the composer's, re-rendered every frame, and
sky's PMREM, which `bakeEnv()` already covers. Every other "bake" in `js/` is a CanvasTexture or an
image atlas and re-uploads from its CPU-side copy. So `sky.bakeEnv()` **is** the complete restore
path. A `Game.rebake` hook was written, found to have nothing to do, and deleted rather than left in
looking like coverage.

## L4 — "settings is unclickable (in testing on mobile)"

`js/controls.js` bound the cog to **`click` alone**:

```js
if (gear) gear.addEventListener('click', () => this.onSettings?.());
```

Four lines up in the same file, the `touchstart` handler on `#controls` ends with an unconditional
`e.preventDefault()` — including on the path where `isBtn(t)` matched and the finger was handed to
the pad. preventDefault on touchstart is what suppresses the browser's **synthesised** mouse events,
and a `click` on a touch device is one of those. The cog's only listener could never fire on a
phone, and worked perfectly under a mouse, which is why it shipped.

Every other `.ctl-btn` survived by accident: `_btn()` binds touchstart/touchend directly and
`tapBtn()` binds touchend, so none of them was relying on the event the router had already
cancelled. The cog is now bound the same way, with the same 600 ms guard against a device that
delivers both.

Aaron also asked for the cog to *"only a little overlap/under"* the map. It currently clears the map
disc by 21 px of its 36 — under the 44 px floor. **Left for the build agent**, since it is the same
surface it is rebuilding.

## New tooling

* **`tools/hands.mjs`** — a pair of thumbs on a phone. Boots the REAL game in a phone viewport,
  drives it with real `Input.dispatchTouchEvent` points, screenshots it, and hit-tests every control
  with `elementFromPoint`. A box that exists and is covered reports its own rect happily, so
  `hitsSelf` is the only honest answer to "is this clickable". `shot.mjs` renders a frozen camera
  with the DOM layer suppressed and could never have seen any of this.
* **`tools/gates_boot.mjs`** — B1..B5 above, each falsified in-suite. 10/10 green.

## Voices — L6

`tools/vo/gen_story.py` gained a SUNO override: a file in `tools/vo/raw/suno/` named for a slot
**replaces** that slot's synthesis and is never overwritten. SUNO takes skip `room()` — that chain
exists to put a synthesiser's dry output in a cabin, and a performance arrives with its own space
on it — and get trim, the shared -16 LUFS shelf and a -1.5 dBTP ceiling instead. The manifest
records `src: 'suno' | 'kokoro'` per clip.

`docs/SUNO.md` §0 carries the prompt Aaron pastes, the split command, and the drop path. **The game
is correct and playable with the file absent**; the Kokoro takes stay wired.

Two bugs found while wiring it:

* `gen_story.py --only boss` rewrote `index.json` **from the subset**, deleting the other twelve
  clips from the manifest while leaving the files on disk. True since S2-E. Now merged.
* `write_suno_md.py` still emitted *"31 voice identities over 27 installed macOS voices"*. That
  string was corrected last session **in the output** rather than in the generator, so the next
  regeneration put it straight back. Fixed at the source this time — the general lesson being that
  a fix applied to generated output is not a fix.
