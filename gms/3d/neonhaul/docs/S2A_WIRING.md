# S2-A → manager: the one thing I could not do myself

S2-A owns `hud.js ui.js settings.js minimap.js save.js camera.js main.js config.js index.html
style.css` and wired all of its own changes through `main.js`. **There is no pending wiring for
anything I built** — the phase is live in the game as it stands.

This file exists for one observation about a file I do not own, plus two notes S2-B needs.

---

## 1. `js/radio.js` — `bg`-tagged lines cannot currently reach the ticker

`radio.js:550` sets `const fore = rec.layer !== 'back'`, and `chatterOut(...)` is called **only
inside `if (fore)`**. So a manifest entry with `layer: "back"` plays its audio at 0.22 gain and
never produces a line of text.

Today's manifest has 7 back-layer entries (`bg_net` × 4, `bg_dock` × 3) and 57 foreground ones.

The S2-A↔S2-B contract gives `bg` a rendering — a faded background wash in the ticker — and that
rendering is built and measured (`gates_s2a.mjs`, check 5: `bg` and `alert` differ in both opacity
and rule colour, falsified by requiring the two to differ). **But nothing will ever be tagged `bg`
and reach it** unless one of these happens:

- **(a) S2-B tags some FOREGROUND entries `bg`** — advertising, net housekeeping, overheard traffic
  that is not addressed to the player. This needs no code change anywhere and is my recommendation:
  `bg` in the contract means "not addressed to the player", not "the ambience bed".
- **(b) somebody changes `radio.js` to call `chatterOut` for back-layer lines too.** That is a
  one-line change in a file S2-A must not touch, and it is a behaviour change to the audio
  director, not a rendering one — so it is S2-B's call or the manager's, not mine.

I have not assumed either. The renderer handles `bg` correctly if it ever arrives.

## 2. The legacy tag alias, and when to delete it

`ui.js` `normTag()` maps the contract's three values straight through and aliases today's manifest
vocabulary — `pay` / `warn` / `bad` → `alert` — so the two phases can land in either order without
a run of unstyled lines in between. Anything unrecognised becomes `info`.

`assets/audio/manifest.json` as it stands is `info` × 38, `pay` × 8, `warn` × 6, `bad` × 5, and 7
entries with **no `tag` field at all** (the back-layer ones).

**Once S2-B has relabelled every entry to `bg` / `info` / `alert`, delete `TAG_ALIAS` from
`js/ui.js`.** It is a bridge, and obligation T3's rule is that a bridge goes when the thing it
bridges to arrives. `gates_s2a.mjs` check 5 will still pass without it — the falsification leg only
requires that an *unknown* tag normalises to `info`.

## 3. Two hooks S2-B may want

`__game.chatLog()` returns the ticker's scrollback (`{k, speaker, text, tag}`, oldest first), and
`__game.chatter({speaker, text, tag, audio})` is unchanged. The `tag` field is the only channel
between us and neither side added a field.
