# Idle Western 2: UI (lane U)

Lane U owns `js/ui/*`, `style.css`, `fonts/`, the UI tests (`tools/test-ui.mjs`, `tools/test-layout.mjs`, `tools/ui-shots.mjs`) and this doc. The UI reads `game.state` / `game.stats()` / `game.quote()` through `ui/model.js` and writes only through `game.act(...)`. IL2's mature UI (`idle-life2/docs/UI.md`) is still the reference for job slicing, the scrolling hero, look-around and the jump dock; this doc covers what is Western.

## Theme

- **Wood, paper and brass.** The HUD and tab bar are dark walnut planks with a brass rule; cards are framed in wood with a brass hairline; sheets are wanted-poster parchment with a red Rye title; buttons are paper tokens with a wood under-shadow; buy buttons are sage green; the Ghost Town sheet is ecto-green on charcoal.
- **Fonts:** Rye (display: cash, titles, stamps, captions, coach) and Bitter (body, variable 400–900), both self-hosted in `fonts/` (SIL OFL) so nothing loads cross-origin (test-boot asserts same-origin requests). Tokens live on `:root` in `style.css` (`--wood-*`, `--brass*`, `--paper*`, `--teal` = yours, `--pom` = Pomfrey's).
- **Emoji:** kept to one per control (glyphs, tab icons, toasts). Words stay under 30 above the fold on a fresh start (test-layout).
- **Readability floor (PT#12):** tab labels, glyph costs, glyph badges, rank numbers and fling labels are ≥ 12 px; the focus chip, pin chip and ribbon are ≥ 40 px tall. Toasts sit low in the hero above the label/qty row (never over the ribbon, the special chip or a mini-game timer) and the wind-up chip is hidden while a special is live.
- **Portrait S22 first.** Desktop (≥ 900 px) docks the hero left and the list, tab bar and sheets right, exactly as IL2.

## Screen map (phone)

| Where | What |
|---|---|
| HUD | cash (Rye), $/s, 👻 ecto (season only), 🦷 teeth (→ Crew), ⚙️ |
| Hero, top-left | **hat ribbon** `🤠 You 3/18 · 🎩 Pom 7/18` (40 px tall, 15 px numbers, 20 px hats); each hat icon scales with that side's tier, and Pomfrey's never drops below ~14 px so the shrinking stays visible. Tap: who wears what |
| Hero, bottom-left | floating **label** of the business in shot; tap scrolls to its card (W7: tapping a building never scrolls) |
| Hero, bottom-right | ×1 / ×10 / MAX |
| Hero, centre | coach, bubbles, fling overlay, captions, mini-games, the opening's mud hat |
| Hero, bottom-left above label | 🎹 button with a glint: from the 3rd mud tap until the piano has been played once (wherever it was played), and afterwards only while no plot or Spectacle exposes a piano tap target |
| Tab bar | **⤒ ×qty** · Street · Town · Crew · Demands · Ghosts · Boot Hill · **⤓** |
| Hero, just above the label/qty row | toasts (at most two; achievements, gag links and rank-ups wait while a special or caption owns the hero). With the hero away (scrolled, sheet, Town) they drop to just under the HUD |
| List end, fresh start only | the Stranger's WANTED poster nailed up beside the DRIBBLE CREEK · Pop. 212 sign, filling the empty parchment under the first FOR SALE card (gen 1 only, gone once the first business opens) |

**Jump dock fix (IL2 backlog #1).** IL2's ⤒⤓ floated at the bottom-left over the list and covered card badges as they scrolled under it. Here the dock lives *inside* the opaque tab bar (left: ⤒ and the ×qty cycler, right: ⤓). The list is padded by `--tab-h`, so no visible badge, glyph or corner can ever sit under a jump button; anything under the bar is hidden by the bar. `test-ui` asserts it at eight scroll positions. Tab labels are 12 px; while the dock is showing the labels hide and the icons grow (six tabs plus three dock buttons do not fit 12 px words at 360 px). The dock reads from IntersectionObservers only (the hero's, and a `.list-end` sentinel with a 60% bottom margin for ⤓), so scrolling never forces a layout (PERF P#8).

**Red dots (PT#11).** At most one tab carries a dot, by priority: strongboxes to open (Crew), ready Demands, a recommended Fake Your Death (Boot Hill), newly revealed tabs in bar order, spare gear (Crew). The Ghosts tab, the 👻 HUD pill and the DOM ghosts only appear once you hold a second Deed, have a grave, or have played 10 minutes.

## Hero input (W7)

`ui/pick.js` wraps Spectacle (`host.world.spectacle`, lane S). One tap resolves to one winner, highest first:

1. a live mini-game (`kind:'minigame'` picks carry `{act, payload}`; the duel layer catches its own taps),
2. an event actor (tumbleweed) / tip rider / ghost,
3. the fling grab (a tap on the held drunk says "Swipe!"),
4. the piano,
5. a character (bark, 20 s cooldown, pays nothing),
6. a construction site (`site` → `build:hurry`),
7. a pile, then the street (hustle tap; a mud coin before the first business; during the very first build a street tap hurries the build, which pays the same mud coin).

**Hold-to-look** is IL2's `look.js` with `HOLD_MS = 300` (W7); blocked while a special or a fling hold is live. **Swipe-to-fling** (W6, `ui/fling.js`) listens on the whole hero in the capture phase, so a swipe that starts on a target chip still counts; `touch-action: none` is set on the hero only while Mabel is holding someone. The direction is **cardinal**, exactly like Spectacle's `dirFor` and E's target dirs: ←trough →dentist ↓jail ↑Pomfrey, whatever the camera shows (PT#4: a ↓ swipe used to land in the trough when the jail was projected off screen). The four chips sit in those cardinal spots around the grab and are tappable; for the first four holds each carries a 12 px label (Trough, Dentist, Jail, Pomfrey's). "Swipe to fling!" sits below the ↓ chip. While a drunk is held the ribbon, focus chip, qty bar, 🎹 and tip fade out.

## Spectacle hooks (lane S contract as built)

| UI calls | Returns | Used for |
|---|---|---|
| `spectacle.pickHero(clientX, clientY, timeStamp)` | `{kind, id, act?, payload?, lineId?, char?, ...}` | W7 routing; `site` is normalised to `build` |
| `spectacle.bubble(charId)` | `{x, y, visible}` hero px | speech bubbles; also `bubble('hat')` places the opening's mud-hat ring over the 3D hat |
| `spectacle.duel()` | `{phase, drawAt, id}` | duel overlay follows S's timeline; reaction = `pointerdown.timeStamp − drawAt` |
| `spectacle.fling()` | `{id, x, y, targets:[{id,x,y,visible}]}` | fling overlay placement + swipe direction |
| bus `bark {char, trig, src:'spectacle'}` | | ambient gag barks; the UI applies the 30 s sentence gap to these |

The UI emits on the bus: `ui:special {kind, phase:'start'|'end', id}`, `ui:duel {phase:'eyes'|'draw'|'result', ...}`, `ui:piano {tempo, wrong, frenzy, sec}`, `ui:frenzy`, `ui:unlocked {lineId}`.

**Hero visibility and beats (round 2).** `heroVisible()` = the hero is ≥ 25% on screen, no phone sheet is open and Town is closed. The UI emits `ui:hero {visible}` on every flip (and `__iw2ui.heroVisible()`). Hat promotions, the Deed and Half-the-Town captions and acquisition captions go through a beat queue: they run once the hero has been visible for 1.2 s and nothing else (special, caption) owns it, or at once when Spectacle emits `spectacle:beat {kind, phase:'start'}` for the same kind. A promo that happens while you are scrolled away also gets a small gold toast ("🤠 New hat: Bowler! ⤒"); queued beats expire after 2 minutes (acquisition captions after their build). Ghosts: `pick.js` `has(kind)` also reads `spectacle.caps` (a Set), so the DOM 👻 disappears the moment S publishes `caps.add('ghost')`.

Without Spectacle every feature still works: plot anchors place bubbles and overlays, the duel runs its own paces/eyes/DRAW timeline (DRAW time = the rAF timestamp of the frame that shows it), brawl and robbery spawn DOM stand-ins (flying 🤠/💰 to tap), the stagecoach shows passenger chips, and ghosts drift across as DOM 👻.

## Construction cards (W13, proposal §3.2)

A business under construction gets the full card: the live site in the view, a brass badge `🧱 Walls · 12s` (or `🃏 Poker game`, `⚰️ Takeover`, `✍️ Signing`, `🪧 Rebrand`), a striped brass **progress border** driven per frame from `build.t / build.T`, and one **🔨 HURRY** glyph (`build:hurry`). Tapping the card's view also hurries. When the sign goes up the card flashes, an **OPEN FOR BUSINESS** double-ruled stamp lands on the card (and the hero when visible) with the `st_sign` stinger, and the normal glyphs appear. Offline completions are listed on the "welcome back" card.

**Acquisition captions** (`ui/captions.js`): letterboxed lines over the hero, timed to the build's T: the poker five aces (Saloon), the takeover (Undertaker), Wendell selling the badge (Jail), Thrupp fainting (Bank), rebrands, the Deed showdown, Half the Town, and the Fake Your Death ceremony (skippable after the first).

## Hats

The ribbon (above), plus a **promotion card** on `hat:promo`: the new hat drops in, "Pomfrey shrinks to a Fifty-Gallon" (or "Pomfrey is wearing a THIMBLE"), `st_hat` stinger.

## Specials (W8, W9)

`ui/specials.js`. On `special:wind` the bell tolls twice and a red chip shows `🔔 🤠 High Noon Duel! · Get ready…` (or `⤒ Watch` when the hero is scrolled away; tapping it jumps up). The UI calls `special:begin` once the hero has been visible for 1.7 s (or, for a brawl, when the Saloon card is on screen). Whoever begins it, `special:start` opens the overlay and the wind-up chip fades at once (it used to linger 1.4 s over HIGH NOON and the timer); never begun, it expires and the chip fades with "the duel wandered off".

- **Duel:** letterbox bars, HIGH NOON + opponent name, the pace counter, "Steady…" with an ECU vignette, spoilers (horse, Pickles, fly) in the fallback timeline, a huge **DRAW!**, then `duel:result {ms}` or `{early:true}` (shot your own boot, tuba). The result card shows `172 ms · GOLD` and the strongbox. Music cue `duel`.
- **Brawl / robbery:** score + timer bar; taps on Spectacle's actors (or the DOM stand-ins) call `brawl:hit` / `robbery:hit`; result shows hits, "Bart caught! +🦷2" or "Bart hit a low sign. Again."
- **Stagecoach:** pick a passenger (Spectacle's, or DOM chips each labelled with one of your businesses) → `claimEvent {lineId}`.
- Strongbox rewards toast and point the coach at the Crew tab.

**Strongbox opening** (`ui/boxes.js`): the box rattles three times, the lid pops, the loot fans out coloured by rarity, `st_box` stinger.

## Sheets (tabs)

- **Crew:** strongboxes to open, managers (★ levels, gear), the saddlebag, auto-equip all. **Manager sheet:** promote (cash + 🦷), item slots (2nd at Lv 3), equip by tapping twice, merge 3 → 1, auto-equip.
- **Demands:** Town Council Demands grouped by block with progress and a claim pill, and the achievement grid (+1% each).
- **Boot Hill:** the Bounty on your head, the requirements, what you keep, **Fake Your Death** (two-tap confirm, no `confirm()`), the Wanted Poster button, and every grave with its epitaph.
- **Ghost Town:** only while `seasonInfo().live` and revealed (see red dots); ectoplasm, the 8 ranks as a 4 × 2 grid (no horizontal overflow), keepsake hats and who wears each. Poster titles scale with the width and may wrap ("TOWN COUNCIL DEMANDS" no longer truncates); Crew names wrap to two lines.
- **Settings:** Sound master; **Voices / Music / Effects & piano** volume sliders each with its own mute; **Sunday School**; haptics, quality, compact cards, reduce motion; save export/import/reset.

**Wanted Poster** (`ui/poster.js`, W16): a 1200 × 1650 PNG drawn on a 2D canvas: parchment, WANTED in Rye, a caricature with your hat (scaled by tier), the disguise's moustache and specs, your alias, the reward (Bounty and lifetime cash) and joke stats (Ejected, Duels won, Baths taken: 0, Shot own boot, Pianos played). Shared via the Web Share sheet on phones, downloaded elsewhere. Cancelling the share sheet (AbortError) does nothing; it no longer falls through to a download. Offered after every Fake Your Death and from Boot Hill.

## Audio (`ui/audio.js`, `ui/barks.js`)

- Reads `audio/manifest.json` (lane AU) on the **first gesture**, never at boot (a missing file would be a failed request in test-boot). If it is missing, bubble text comes from `tools/audio/script.json` and the SFX are synthesised.
- **Buses:** sfx, voice and piano are WebAudio gains; music is **one streamed `<audio>` element**, never decoded. A cue change fades out (650 ms), swaps `src`, fades in (900 ms). Cues hold ≥ 6 s unless a special owns the bed. Choice, highest first: `fakedeath` during the ceremony, `robbery`, `duel`, `saloon` (brawl, or the saloon in shot or pinned), `build` while anything is going up, `night` 18:00–06:00 local (`ghost` instead during the season), else `main`. Voices duck music to 50%, piano to 40%, stingers to 35%. Paused while the page is hidden.
- **Buffers:** barks, wordless clips, stingers and piano samples are decoded into a 20 MB LRU (piano samples pinned).
- **Piano (W11):** `audio/piano/phrases.json` note lists played through the pitch-shifted samples, pre-decoded on the first gesture, so a tap schedules notes 4 ms ahead (zero latency); before the samples land a tap plays a triangle-wave fallback. Random phrase, no repeat among the last 6; `wrong` picks a wrong-note phrase plus a groan; `frenzy` plays faster (×1.4) and tempo follows the state's `tempo` (1–1.6). A new tap cuts the previous phrase.
- **Barks (W5):** the state gates sentence barks; the UI picks the line: unplayed `once` lines first (then `barkOnce` persists the id in the save), 10-minute no-repeat, `rude` lines skipped under Sunday School. **One bubble at a time**; a priority bark queues behind it, others are dropped. Bubbles are positioned by `transform` only, from Spectacle's anchors, refreshed at 30 Hz. Character taps: a sentence if off the 20 s cooldown and no bubble is up, else a grunt. Wordless clips (HUP!, hic, oof, hammers) fire on ejections, flings, brawl hits, hurries and duels, capped at one per 3 s globally and never the same clip twice running. Barks from Spectacle's gags also respect the 30 s sentence gap.
- **Unlock (PT#9):** the AudioContext is created on the first `touchend`/`click`/`keydown` (or a *mouse* `pointerdown`; a touch `pointerdown` is not user activation on Chrome Android) and `resume()` is only ever called from those handlers. The listeners stay attached until the context reports `running`, come back if it drops out (`onstatechange`), and a `visibilitychange` to visible re-arms them and tries a resume; the music element is re-played on success. Sounds before that are scheduled silently, with no "not allowed to start" warnings. `audio.running` / `audio.listening` expose the state for tests.
- **Music night** follows the W18 game clock when lane A exposes `world.gameClock()` → `{hour, night}`, else local time.

## First five minutes (W15, proposal §7.2)

1. Fresh start: the hero shows you face-down in the mud (Spectacle's `opening`); coach **"👆 Tap the mud"** pulses on the tap zone.
2. Each tap flips a coin (+$2) into the upturned hat (a ring over the 3D hat, ×N coin count; coins fly into it).
3. At 3 coins the coach moves to the hat: **"🎩 Tap your hat"**; tapping it banks the coins into cash.
4. At $50 (cash + hat) the Spit & Shine **FOR SALE** card glows: **"🥾 Buy it!"**.
5. The card becomes the construction site. Builds of 8 s or less get no hurry coach (the 6 s Spit & Shine is over before it is read); longer ones say **"🔨 Tap to hurry"** on the card's glyph while the card is on screen, or on the hero during the opening.
6. OPEN FOR BUSINESS → Bowler promotion → the hat ribbon appears, then IL2's coach (sell the pile once ~2% stocked, level up, glyphs, managers, pin, qty, tabs, and "💰 Save for it" on the next FOR SALE card when lane E's `game.saveFor()` names one).

**Hint queue (PT#1).** One hint at a time, but none can block: each carries a `when` condition and is dropped (not marked seen) the moment it stops holding, so it can come back; it is marked seen after its `ms` (hints without a condition are capped at 20 s). A higher-`prio` hint pre-empts the current one (buy 3 > hat 2 > mud = hurry 1 > the rest). Nothing shows during captions or the Fake Your Death ceremony. **Gen 2+ (PT#8)** skips the mud and hat hints, the dashed mud ring and the upturned hat (unless coins are already in it), and the fresh-start poster; the coach starts at "🥾 Buy it!".

The piano gets a soft glint (fallback button) until first played; it is otherwise a discovery.

## Tests

| Command | Checks |
|---|---|
| `CDP_PORT=9361 node tools/test-ui.mjs` | Opening flow with real touches (mud → hat → buy → hurry → OPEN, ribbon), piano, swipe-to-fling to the trough and through Pomfrey's window, duel (chip, begin, DRAW, reaction ms, boot shot), brawl, bark bubble (one at a time, transform-placed), Sunday School (no rude line, Garter renamed), strongbox, jump dock never over a visible badge/glyph/corner. |
| `CDP_PORT=9361 node tools/test-ui-r2.mjs [--strict]` | Round-2 regressions, real touches, Chrome on the Android autoplay policy: PT#9 audio (bare touchstart does not unlock, touchend does, zero "not allowed" warnings, re-arms after a suspend + visibilitychange), PT#1 (no stale hurry/mud/hat/buy hint after an unhurried first build, a later sell/level hint arrives, the long-build hurry coach follows its card and leaves when the build ends), PT#3/#4 (↓ ← → ↑ and a diagonal ↓ swipe land in jail/trough/dentist/Pomfrey/jail, ↓ chip jails; S's in-shot framing is a WARN unless `--strict`), one red tab dot, Ghosts after Demands, PT#8 (no coach, ring or hat over the funeral captions, no mud opening in gen 2). |
| `CDP_PORT=9361 node tools/test-layout.mjs [--shots]` | 6 viewports × fresh/demo: no overflow, buttons ≥ 40 px, canvases match boxes, hero chrome < 10% of the hero, ≤ 5 controls and ≤ 40% cover per card, < 30 words on a fresh start, < 2 views fully on screen mid-list, hero stops rendering when away, jump buttons shown. |
| `CDP_PORT=9361 node tools/ui-shots.mjs [outDir] [s22\|desktop]` | Screenshots: fresh, mud coins, building, demo street, scrolled, every sheet, settings. |
| test-boot / test-look / test-scroll | Engine tests; kept green by this lane. |
