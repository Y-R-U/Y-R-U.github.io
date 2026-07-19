# Racketeer — 2026-07-19 feature pass (TAKEOVER-READY PLAN)

Aaron's six requests, designed in full so any session/model can pick this up cold.
**Update the checkboxes in this file as items land. Commit+push to main when a coherent
chunk is done (repo convention). Read `~/.claude/.../memory/racketeer.md` + this file first.**

## Status checklist

- [x] PLAN.md written & committed
- [ ] 1. Skill slots gated by story level (dock shows locked slots)
- [ ] 2. Quick Match ★ tiers gated by story level
- [ ] 3. Match-length popup ONLY before tournaments (everything else uses default)
- [ ] 4. Ranked → "Friendly" (no rank change); story + cups now drive world rank
- [ ] 5. Rank + money shown on home screen (flanking title)
- [ ] 6. Story rewrite: pub-bet narrative, cutscenes at start/L1/every boss/end
- [ ] Headless verification (soaks + gesture run + screenshots)
- [ ] Final commit + push to main

## Context (do not rediscover)

- Game: `~/cc/yru/site/gms/2d/racketeer/` — vanilla ES modules, NO build step.
- `save` shape in `career.js newSave()`. `save.story` = NEXT story level (1..100);
  "reached level N" == `save.story >= N`. `save.storyDone` after beating 100.
- Match configs flow: modes.js builds `cfg` → `main.js launch(cfg, opp, onOver)` →
  `makeMatch` in match.js. `cfg.mlen` ∈ "1g"|"2g"|"set"|"match" (see MATCH_LENS in ui.js).
- Skill dock renders in `ui.js matchHooks.onSkillDock` from `m.save.loadout` (max 4).
- Test rig: `python3 -m http.server 8642` at site root + headless Chrome
  `--remote-debugging-port=9223`; scratchpad has cdp.mjs (soak) and gest.mjs (real swipes).
  MUST send `Network.setCacheDisabled` — ?cb= only busts the HTML.
  Soak URL: `/gms/2d/racketeer/?auto=1&mode=story&mlen=1g&level=N&skills=all`.

## Designs

### 1. Skill slots (4 total, no 5th — dock space on phones)
Unlock schedule: slot 1 always; slot 2 at story ≥5; slot 3 at ≥10; slot 4 at ≥20.
- `career.skillSlots(save)` → 1..4 (storyDone → 4).
- `career.load()` trims `save.loadout` to that count.
- Dock (`onSkillDock`): ALWAYS render 4 slots — equipped skill buttons for unlocked
  slots, dashed "＋" for unlocked-but-empty, and 🔒 "LVL 5/10/20" for locked slots
  (class `slot-locked`, non-interactive).
- Shop (`buildShop`): equip cap = skillSlots; header text says how many slots + next unlock.
- `?skills=all` test hook bumps `save.story` to ≥40 (unless ?level given) so old soaks keep 4 slots.

### 2. Quick Match ★ gating
★1 needs story ≥5, ★2 ≥10, ★3 ≥20, ★4 ≥30, ★5 ≥40 (`career.quickStars(save)` → max ★, 0 = locked).
- Menu QUICK button: if 0, sub shows "🔒 lv5" and tapping shows a "reach story level 5" popup.
- `pickQuick` modal: locked stars rendered disabled with "Unlock lv10" etc.

### 3. Match-length popup only before tournaments
- `launch()`: `cfg.mlen = cfg.mlen || save.settings?.matchLen || "1g"` — NO popup ever.
- `playTournament(kind)`: after paying entry, `UI.showMatchLen(...)` then bracket;
  each round uses `save.settings.matchLen` (showMatchLen already persists the pick).
- Settings cycler row remains the way to change the default otherwise.

### 4. Friendly mode + global rank
- Menu button RANKED → 🤝 FRIENDLY (sub: W-L). Screen title "Friendly Match".
  Ladder (tiers/venues/opponents/promotion/champion flag) unchanged, but
  `career.applyResult` NO LONGER touches `save.rank` (friendlies don't count).
- Rank is now driven by story + cups (in career.js):
  - `rankFromStory(n) = max(2, round(10^(6*(1-n/100))))` — L1 win ≈ #871k, L50 ≈ #1000,
    finale (L100) sets rank **1**.
  - Story win: `save.rank = min(save.rank ?? 1e6, rankFromStory(level))`.
    Story loss: rank drifts worse ×rand(1.03,1.1), capped 1e6, only if ranked.
  - Cup CHAMPION: `rank = min(rank, max(floor, round(rank*0.5)))`,
    floors: local 20000, national 2000, world 50. Losses: no change.
- `showRankedResult` → friendly flavour (money/stats/promotion, no rank lines).
- Story + tournament result modals ADD a rank line when rank improved
  (pass oldRank/newRank in ctx from main.js).

### 5. Home screen rank + money
Two chips flanking the title in `buildMenu`: left `🏅 #871,204` (or "Unranked"),
right `💰 $1,240`. CSS `.home-chip` absolute top corners. buildMenu re-runs on every
return to menu so they self-refresh.

### 6. Story rewrite (biggest item — all content lives in story.js)
Narrative: after-work pub. RAY RENNIE (63, world #4 in 1987, career ended by
VICTOR KANE's cheated call in the '88 final) bets the unfit player he can beat them.
Player wins L1 → Ray coaches them. Rise: pub → park league → snobby club → county
(meet rival JADE SHARP) → Ray heart-scare wobble → Alicante qualifiers → tour +
Sharp rematch → Kane rigs draws, Sharp becomes ally, '88 tape leaked → Grand Slam →
Kane's gauntlet + final vs ADRIAN VOSS (Kane's machine, carries `boss3000: true`
so the final-boss AI buff still applies). Finale: win with Ray's 1988 racket.
- Rewrite `CHAPTERS` (10 new: names/emojis/venues/crowds/bosses), `LINES` (100 short
  beats, tension arc, boss every 10th), `INTRO`, `FINALE`.
- `storyLevel(1)` gets `fixed` opponent RAY ("👴", bio, stars as computed ~0.4);
  `modes.storyMatch` uses `lvl.fixed` when present.
- NEW `CUTSCENES` map in story.js: keys `start`, `1`, `10`, `20`, … `90`, `end`.
  Shape `{ title, bg, lines: [{who, face, txt} | {txt}] }` (no `who` = narration).
- NEW `UI.showCutscene(cs, onDone)` — modal, lines revealed one per tap (▶ then
  Continue), Skip button. CSS `.cutscene`, `.cs-line`, `.cs-face`, `.cs-narr`.
- Triggers in main.js `playStory` (all skipped when AUTO):
  - before launching L1 and `!save.csStart`: play `start`, set `save.csStart`.
  - on win of level n with `CUTSCENES[n]`: cutscene THEN `showStoryResult`.
  - finale: `CUTSCENES.end` then the finale modal.
- Storybook (`showStorybook`): interleave cutscenes (start at top, CUTSCENES[n]
  right after line n, end after 100) as `.sb-cs` dialogue blocks.
- Update the boot intro modal in main.js (car-park copy → pub-bet copy).
- Friendly-ladder lore (Gary from Accounts, TIERS flavour, BM3000 at ladder top)
  is untouched — that's a separate silly mode.

## Verification recipe (after implementing)
1. Story soak: `?auto=1&mode=story&mlen=1g&level=1` — cutscenes must NOT block AUTO.
2. Tourn soak: `?auto=1&mode=tourn` — no popup stall (AUTO path sets mlen).
3. gest.mjs: menu → QUICK now LOCKED on fresh save → verify lock popup; then
   `?level=40` save → QUICK opens with ★1-3 unlocked (spec: lv40 ⇒ ★5? recheck table).
4. Screenshots: menu chips, cutscene modal, dock with locked slots, storybook.
5. Rank math sanity in node: rankFromStory(1|10|50|99|100).
