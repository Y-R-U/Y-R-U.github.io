# HEIRFRAME UI — API

```js
import { ui } from './ui/ui.js';
ui.mount(document.getElementById('ui'));   // injects css/*.css + Google Fonts, builds HUD + controls
```

Everything is DOM/CSS over the WebGL canvas. The UI root is `pointer-events:none`; only real
controls take input, so taps anywhere else reach the canvas (tap-to-move stays with the engine).
Showcase / visual test bed: `tools/ui_kit.html` (`?state=<name>` opens a state directly).

## Mount / globals

| call | notes |
|---|---|
| `ui.mount(el, {css=true, fonts=true, keys=true, controls='auto'})` | `controls`: `'auto'` (touch UI on coarse pointers), `'touch'`, `'desktop'`. `keys` binds the desktop keyboard (below). |
| `ui.theme('surface' \| 'undercity')` | darker, magenta-tinged palette for later acts. |
| `ui.quality('low' \| 'med' \| 'high')` | low drops backdrop blur + ambient motion. Also driven by the Settings panel. |
| `ui.config({rarities, statLabels, slots})` | override rarity names/colours, stat display names, part-slot order. |
| `ui.hideHud(bool)` | fade HUD + controls (cutscenes). Dialogue / panels do this automatically. |
| `ui.debug()` | snapshot `{screen, panel, dialogue, move, hud, settings}` for tests. Also `window.__ui`. |

## Events — `ui.on(name, fn) → unsubscribe`, `ui.off(name, fn)`

Combat/controls: `attack` (pointer down), `attackUp`, `skill` (id), `dodge`, `interact`, `tap` ({x,y} short
tap inside the joystick zone — treat as tap-to-move), `pause`, `warehouse`, `contracts`, `codex`.
Panels: `panel:open` (name), `panel:close` (name) — pause the sim on these if you like.
Contracts: `contract:accept` (contract), `contract:reroll`.
Contracts also: `contract:threat` (threat id).
Warehouse: `warehouse:activate` ({frameId}), `warehouse:equip` ({frameId, itemId}),
`warehouse:unequip` ({frameId, slot}), `warehouse:autoEquip` ({frameId}), `warehouse:tune` ({itemId}),
`warehouse:salvage` ({itemId}), `warehouse:salvageAll` ({tier}), `warehouse:mk` ({frameId}), `warehouse:buy` ({kind}).
Loot: `loot:equip` (item) — the one-tap ▲ EQUIP on a loot row. Lens: `lens:capture`, `lens:close`.
Settings: `settings` (full settings object, on every change), `volumes` (`{master, music, sfx, vo, ambient}` — pass straight to
`audio.setVolumes`; fires on mount-time changes too, and `ui.settings.volumes()` returns the current values for boot).
Dialogue: `dialogue:line` (the line object, when it starts), `dialogue:end` (letterbox closed — call `audio.stopVo()`).
Pause menu: `pause:resume`, `pause:quit` (its Contracts/Warehouse/Codex buttons emit the plain events).
Screens: `title:continue`, `title:new`, `complete:continue`, `death:redeploy`, `death:warehouse`. Loot: `loot:inspect` (item).
Audio hooks: `sfx` (name) — `click`, `open`, `close`, `toast`, `loot`, `loot_rare`, `type`, `deny`, `confirm`, `levelup`.

The UI only emits; the engine/sim owns state and pushes it back (`hud.set`, `panel.update`).

## Controls

- `ui.controls.move` → live `{x, y}` in [-1, 1] (x right, y **down/screen-forward**: y=-1 is up the
  screen). Merges joystick + WASD/arrows. Read it every frame.
- `ui.controls.attackHeld` → bool while attack is held (auto-repeat is the engine's job).
- `ui.controls.sneak` → true when 0 < |move| < 0.45 (joystick half-press, or Shift + WASD which scales move to 0.4).
- `ui.controls.setAttack({icon, label})` — swap the attack glyph per frame archetype.
- `ui.skills.set([{id, icon, label, cd, cdMax, ready=true, cost, key}])` — up to 4; the 4th is the gold
  **Heir Protocol** button (hidden unless given). Cheap to call every frame (diffed). `cd` seconds remaining;
  radial sweep = `cd/cdMax`. `ready:false` greys it (no energy). Icons match `js/data/frames.js` skill icons
  (baton pistol overclock advert fist slam charge wall carbine scatter rail turret blade veil blink hack heir).
- `ui.skills.dodge(cd, cdMax)`.
- Floating joystick appears where the left thumb lands (bottom-left zone; right side if the
  Settings "joystick side" is swapped). Hidden in desktop mode.
- Desktop keys (when `keys:true`, DESIGN §4): WASD/arrows move (Shift = sneak) · `J`/`F` attack ·
  `1 2 3` or `K L ;` skills · `Q`/`4` heir · `Space` dodge · `E` interact · `C` contracts · `Tab`/`I` warehouse ·
  `O` codex · `Esc` close card/panel, else emits `pause`. Mouse click-to-move/attack stays with the engine.

## HUD — `ui.hud.set(partial)` (diffed, fine to call every frame)

```js
ui.hud.set({
  hp: 80, hpMax: 120, shield: 30, shieldMax: 40, energy: 55, energyMax: 100,
  level: 4, xp: 340, xpMax: 900, credits: 12450,
  frame: { name: 'HireFrame R-1', kind: 'rental', tier: 0 },   // kind: rental|brawler|gunner|ghost
  heat: 1.5,                    // 0..5 Heat stars (fractional fills the next pip)
  district: 'Aurum Plaza',
  surcharge: 240,               // rental "usage surcharge" red line under credits (0/null hides)
  goal: 'Reach level 5 to unlock Pro contracts',   // next-goal chip (null hides); or the sim's {label, cost, progress} → "label · cost cr" + gold progress line
  mission: { title: 'Quiet Delivery', objective: 'Deliver the case to Pier 9', progress: 0.4,
             count: '2/5', timer: 94 } ,   // or null (a mission with no title/objective also hides the tracker)
  buffs: [{ id: 'ovr', icon: 'overload', t: 6, tMax: 10, kind: 'buff' | 'debuff', stacks: 2 }],
});
ui.hud.minimap            // <canvas> — draw into it; size with canvas.clientWidth * dpr
ui.hud.heading(rad)       // rotates the compass ring (0 = north up)
ui.hud.flash('hit' | 'heal' | 'shield')   // edge vignette pulse
```

## Feedback

- `ui.toast(text, kind='info', {sub, icon, ms=2600})` — kinds `info|good|warn|bad|gold|story`.
- `ui.loot(items)` — items `{name, rarity, slot?, icon?, qty?, credits?, better?}`; rarity index 0–6 or id/name.
  `better:true` adds the one-tap **▲ EQUIP** button (→ `loot:equip`). Relic/Heirloom also trigger a centre
  callout. Tap an entry → `loot:inspect`.
- `ui.damage(x, y, amount, kind='normal')` — screen px. kinds `normal|crit|shield|heal|player|miss|energy`.
- `ui.marker.set(sx, sy, onScreen, label, dist?)` / `ui.marker.hide()` — objective pin on screen,
  clamped edge arrow off screen. Pass projected screen px even when behind the camera
  (flip them: `sx = W - sx, sy = H - sy` and `onScreen=false`).
- `ui.interact.show(label, {icon, key:'E'})` / `ui.interact.hide()` — tappable prompt, emits `interact`.
- `ui.itemCard(item, compareTo?)` → shows a floating item card (with green/red stat deltas).

Rarity tiers (DESIGN §6.2, index → id): 0 scrap, 1 standard, 2 tuned, 3 custom, 4 prototype, 5 relic, 6 heirloom.
`ui.config({rarities: RARITIES})` accepts `js/data/loot.js` RARITIES directly.

Item shape: `{id, name, rarity, slot, level, fr?, icon?, element?, stats:{hp, armor, shield, energy, weaponDamage,
critChance, movePct, ...}, affixes:[string], flavor?, value, tune?, tuneMax=10, tuneCost?:{credits, scrap, circuitry,
flux, shards}, tuneChance?, salvage?:{scrap,...}, isNew?, better?}`. Percent stats (critChance, movePct, enRegen, cdr…)
are fractions and render as %. Slots: `chassis core weapon optics mobility chip`.

## Combat overlays
- `ui.boss.set({name, title, hp, max|hpMax, shield?, shieldMax?, phases: 3 | [0.66, 0.33], phase, enraged?})` —
  shows the ornate top-centre boss bar on first call; call again with any subset. `ui.boss.hide()`.
- `ui.detect.set(id, sx, sy, amount, {state?, onScreen?})` — detection meter over an enemy head (amount 0..1 or
  0..100). Off-screen observers clamp to the edge with a direction arrow; 1 = red "!". The strongest observer drives a
  top-centre SUSPICIOUS / ALERT chip. `ui.detect.clear(id?)`, `ui.detect.status('hidden'|'search'|null)` to force it.
- `ui.lens.show({label, count})` — surveillance/photo viewfinder (hides combat buttons, keeps the joystick).
  `ui.lens.target(sx, sy, sizePx, {label, dist, locked})` (null sx hides) · `ui.lens.progress(0..1)` lock ring ·
  `ui.lens.flash('Captured')` · `ui.lens.count('2 / 3')` · `ui.lens.hide()`. Emits `lens:capture`, `lens:close`.
- `ui.band.set({value, min, max, lo, hi, label, warn?})` — tail-mission distance band (red too close / cyan ok /
  amber too far). `ui.band.hide()`.
- `ui.sting(title, sub, kind='twist'|'level'|'alert'|'story'|'unlock', ms=3200)` — centre banner for twists,
  level-ups ("big UI moment"), warnings.

## Dialogue — cinematic letterbox

```js
const choice = await ui.dialogue.show({
  speaker: 'Vessa Ordell', role: 'Broker, Halcyon Exchange',
  portrait: { kind: 'human', seed: 7, hue: 200 },   // procedural holo bust, or an image URL string
  text: 'Your grandmother never rented anything in her life.',
  voiceUrl: 'audio/vo/vessa_01.mp3',   // optional: UI plays it (voice volume) and syncs typing to it
  voiceDuration: 3.2,                  // optional: if the engine plays VO itself, sync typing to this
  choices: ['Who are you?', { text: 'Not interested.', tag: 'leave' }],   // omit → tap to continue
  side: 'left',
});
// resolves choice index (0 when there were no choices). Consecutive show() calls keep the letterbox.

// VO through the audio engine (music ducking + volume buses): register once, then pass voiceKey per line.
ui.dialogue.setVoice(key => { audio.vo(key); return audio.voInfo(key)?.duration; });   // return s, {duration} or a Promise
await ui.dialogue.show({ speaker: 'Mara Quill', text: '…', voiceKey: 'a1_m1_mara_01' });
ui.on('dialogue:end', () => audio.stopVo());
ui.dialogue.close();
await ui.dialogue.play([line1, line2, ...]);   // runs a sequence, resolves the last choice
```
Portrait kinds: `human | robot | gold | chrome | black | bulwark | rental | ghost | unknown` (+ `seed`, `hue`). A bare kind
string (`'rental'`) works too; strings containing `/` or `.` are image URLs.

Sim adapters (`js/sim/ui_adapt.js`): `toUiBoard`, `toUiWarehouse`, `toUiCodex`, `toUiComplete`, `toUiItem`, `uiConfig` produce the
shapes on this page; `game.hud()` / `game.skillsHud()` feed `ui.hud.set` / `ui.skills.set` directly.
Panels and the results/death screens scale up on big viewports (`--ps`, never below 1); the HUD scales with `--hs`.

## Panels — `ui.panel.open(name, data)`, `ui.panel.update(data)`, `ui.panel.close()`, `ui.panel.current`

- `contracts` — `{contracts:[{id, title, archetype, grade:'street'|'pro'|'elite'|'black', story?, client:{name, org,
  kind?, seed?, portrait?}, location, district, difficulty?:1-5, level, payout, bonus?, xp, timeLimit?, suits?:'Brawler',
  desc?, target?, modifiers:[{label, kind:'good'|'bad'|'neutral'}]}], rerollCost?, refreshIn? (s), threat?, threats?:[{id, name,
  locked?}] | ['calm', …]}`. `toUiBoard(game)` in `js/sim/ui_adapt.js` builds exactly this. STORY cards pin first. Archetypes = MISSIONS §4 ids (courier pest retrieve surveil bounty escort
  sabotage hack tail infiltrate transport defend repo race assassinate rescue heist wetwork).
- `warehouse` — tabs Loadout / Frames / Fabricator (`tab` picks the first one). `{credits, active, invMax?,
  materials:{scrap, circuitry, flux, shards}, frames:[{id, kind, name, model, rental?, mk, mkMax, mkCost, sync, fr,
  level, stats, slots:{chassis:item|null, ...}, slotsAllowed?}], shop:[{kind, name, model, price}],
  inventory:[item]}`. Rental frames lock all slots except weapon + chip. Stash tiles show ▲ when `item.fr` beats the
  equipped part; compare deltas vs the selected frame's part are automatic.
- `codex` — tabs Family Tree / People / Places / Clues. `{chapter, people:[{id, gen, state:'unknown'|'rumoured'|
  'revealed'|'complete', name?, role?, years?, bio?, hint?, need?, portrait?, parents:[id], partner?, near?, you?,
  collapsed?, label?, newClue?}], links?:[{a, b, kind:'protege'|'sibling', label}], clues:[{id, title, text, source,
  personId?, icon?, new?, found?}], places:[{id, name, district, text, icon?, new?, found?}]}`. `gen` 0 = oldest.
  Unknown nodes show only "?" and a silhouette — don't send names for them. `near` places a parentless node
  beside another (e.g. a sibling); `collapsed` renders a small "… generations" pill.
- `settings` — no data needed. `ui.settings.get()` / `ui.settings.set(partial)`; persisted to
  localStorage `heirframe:settings`: `{quality, master, music, sfx, voice, ambient, subtitles, joystick:'left'|'right', haptics}`.
- `pause` — `{mission?}`; buttons resume / settings / codex / warehouse / quit.

`ui.panel.open('results', data)` is an alias for `ui.screen('complete', data)`.

## Screens — `ui.screen(name, data) → Promise<action>`; `ui.screen(null)` hides

- `title` `{hasSave}` → `'continue' | 'new'` (settings opens the panel itself).
- `loading` `{progress 0..1, label, tip}` — update with `ui.loading(progress, label)`.
- `rotate` — shown automatically on portrait touch devices; can be forced.
- `complete` `{title, grade:'S'|'A'|'B'|'C', credits, bonus, xp, xpMax, xpFrom, level, levelUp,
  items:[item], stats:[{label, value}]}` → `'continue'`.
- `death` `{cause, cost, tip}` → `'redeploy' | 'warehouse'`.

## Fullscreen
`js/ui/fullscreen.js` exports `toggleFullscreen()`, `fullscreenSupported`, `bindFullscreen(btn, bus)`. There is a toggle button in the HUD menu row (`.hf-fs`) and in the title screen corner (`.ti-fs`). Entering fullscreen also locks the screen to landscape where supported. The button is removed where the Fullscreen API is missing (iPhone Safari).
