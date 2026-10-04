# PLAYTEST 2: adversarial phone playtest (second pass)

Tested 2026-10-04 on BUILD 20261004f. Setup: headless Chrome with `--use-angle=metal` on CDP port 9391, S22 viewport (412×915 @3, mobile, touch emulation).

**How input was driven.** Every game input used real `Input.dispatchTouchEvent` events: taps, holds, swipes and slider drags. Debug acts (`cheat`, forcing a special, a held drunk or a ghost) were used only to fast-forward between checks. `scrollIntoView` stood in for a thumb scroll. A real touch swipe was checked separately and does scroll the list.

**Audio.** `audio/manifest.json` is live: 151 lines and the wordless clips load, the context reports `running`, and there were zero "not allowed to start" warnings.

**Scripts and evidence.** Everything is in `docs/shots/playtest2/` (gitignored):

| Script | What it covers |
|---|---|
| `lib2.mjs` | Extends the PT1 driver with an in-page event/bubble/voice/coach/toast logger |
| `a_ten.mjs` | A 10-minute casual bot that follows the coach. Output in `a_ten.out`, event log in `a_ten.log` |
| `b_action.mjs` | Piano, fling in all 4 directions, the duel ×3, brawl, robbery, stagecoach, tumbleweed, ghost |
| `c_progress.mjs` | ×1/×10/MAX, hold, glyphs, hire, promo, Deed, poker, sheets |
| `d_misc.mjs` | Look, dock, settings, volumes, Sunday School, poster, Fake Your Death + gen 2, background, reload |
| `e_`–`m_*.mjs` | Probes |
| `sheet_*.jpg` | Contact sheets |

**Verdict.** This is a big step up from PT1:
- The brawl, robbery and the Deed/poker cutscenes now play in shot.
- Hat promos wait for the hero.
- The hint queue no longer sticks.
- Audio unlocks properly.
- Fling direction is honoured in all 4 directions.

What still hurts:
- The **very first instruction is invisible** (N1).
- Specials die if a sheet is open (N2).
- The Saloon Row Deed (the main beat after Lower Street) has **no signpost at all** (N3).
- Barks fire too often and repeat within minutes (N4).
- The duel and fling, the two showpiece gags, are still framed badly enough that the joke is hard to read on a phone (N7, N9).

---

## 1. PLAYTEST_1 issue status

| PT1 | Issue | Status | Evidence |
|---|---|---|---|
| B1 | Stuck "Tap to hurry" coach blocks every later hint | **Fixed.** Hint order was mud → hat → buy → level (0:28) → crew tab → goals tab → pin → qty. A 6 s build gets no hurry coach | `a_ten.log` |
| B2 | Stagecoach plays off camera | **Partly fixed.** It is tappable now (pick works, `×3 for 30s`). Framing is still poor: top-down, the passengers read as giant hats, one is cut by the top edge, and the coach is out of shot (N11) | `sheet_specials.jpg` col 4 |
| B3 | Fling gag off camera | **Partly fixed.** It cuts to the saloon doors, and the trough, dentist and Pomfrey's window project on screen. **The jail is still off screen** (`jail x=419, visible:false`). During a tumbleweed the fling falls back to the 💪🥴 DOM emoji stand-in over an empty street (N9) | `b10_*`, `sheet_specials.jpg` col 5 top |
| B4 | Jail unreachable by swipe | **Fixed.** ← trough, → dentist, ↓ jail, ↑ Pomfrey: stats went 1,1,1,1 | `b_action.out` |
| B5 | Hat promo invisible when scrolled | **Fixed.** A "🤠 New hat: Stetson! ⤒" toast shows while scrolled, and the promo card plays when you return to the top | `c05_*`, `c06_promo_at_top.jpg` |
| B6 | Deed showdown unseen | **Fixed.** It is queued until the hero is visible, then plays the letterboxed "A Deed showdown… / His sign comes down. Splendidly." Poker is now a staged five-aces cutscene | `sheet_deed.jpg` |
| B7 | Gen 2 restarts the mud opening | **Partly fixed.** The coach skips mud/hat and the ring is gone. But the hero still replays the face-down-in-mud opening shot at gen-2 start, and the gen-2 Bowler promo covers Nubbin's bubble | `d11_gen2_start.jpg`, `sheet_fyd.jpg` |
| B8 | Audio unlock on pointerdown | **Fixed.** `running:true` after the first touch, 0 autoplay warnings in 9 sessions | all `.out` |
| B9 | Wind-up chip lingers over HIGH NOON | **Fixed** | `b31_*` |
| B10 | Poster share cancel falls through to a download | **Code fixed** (AbortError handled). Headless still shows nothing on tap; device-only | `d_misc.out` |
| B11 | Toasts stack over the list and timers | **Mostly fixed** in the hero (right band). New collisions are listed in N10 | |
| B12 | Ghost sheet overflow, truncated titles | **Fixed.** Ranks are a 4×2 grid, no overflow in any sheet. The Crew sheet still has 11.5 px captions (`crew-s`), below the 12 px floor | `sheet_sheets.jpg` |
| #1 | Boot frame doesn't read as "thrown out" | **Better.** Mabel at the doors, the Stranger mid-throw, the derby with its ring. But the **lower 40% of the hero is flat brown mud**, and see N1 | `a00_1s_boot.jpg` |
| #2 | No "And STAY out!" moment | **Still missing** (N5) | |
| #3 | Hats eat people | **Improved** in the tour and cards. It is still the case in the duel OTS shot (N7) | |
| #4 | Ghosts are emoji stickers | **Fixed** (3D sheet-ghosts). But they spawn and are tappable 10 minutes before the season is revealed (N6) | `a06_69s_tap_ghost.jpg` |
| #5 | Red-dot fatigue | **Fixed:** one dot at a time | |
| #6 | Brawl is specks | **Fixed.** Tight shot on the doors with gold rings on the bodies; 5/7 tapped | `sheet_specials.jpg` col 1 |
| #7 | Piano hidden | **Fixed.** Hero piano target (15 pick cells), 🎹 fallback, Saloon card piano (41 cells). 10 taps → PIANO FRENZY | `b02_piano_frenzy.jpg` |
| #8 | Duel OTS is 50% hat | **Still present, arguably worse.** The Stranger's dark hat now fills ~40% of the frame with the pace number printed on it | `sheet_duel.jpg` |
| #9 | Hurry coach on a 6 s build | **Fixed** | |
| #10 | Pacing | **Improved but N3 blocks it.** Tubs 1:41, Livery 2:56, first special 4:22, Deed never (see §3) | |
| #11 | Bare fling chips | **Fixed.** Chips are labelled (Trough / Dentist / Jail / Pomfrey's) and the hint sits below. The ↑ chip and its label sit on the held drunk (N9) | `b10_fling_held_left.jpg` |

---

## 2. New bugs

| # | Sev | Bug | Repro | Evidence |
|---|---|---|---|---|
| **N1** | **P1** | **The opening "👆 Tap the mud" coach and the dashed mud ring are drawn at the hero's top-left corner, behind the HUD, so the first instruction of the game is invisible.** The tapzone is positioned by an inline `transform: translate(143px, 363px)` (from `spectacle.bubble('mud')`, which is correct). But `.hero-tapzone.coach-pulse` runs `@keyframes tapring { transform: scale(...) }` (`style.css:102–103`), and the animated `transform` overrides the inline translate. The measured rect is `(-50, 5, 101×101)` pulsing, and the coach text is at `(-78, -37)`. The game still works because any street tap is a mud coin, but a new player gets no prompt. **Fix:** animate the `scale` property (not `transform`), or put the ring on a child or `::before`. The hat coach is unaffected because it uses `coachpulse` (box-shadow). | `?nosave=1`, look at the screen, or run `k_coach.mjs` | `a00_1s_boot.jpg`, `k_coach.mjs` output |
| **N2** | **P2** | **"⤒ Watch" does nothing while a sheet (or Town) is open, so the special expires.** `specials.js` chip → `toHero()` = `toTop()` only scrolls; `heroVisible()` stays false while `sheets.isOpen`, so `special:begin` never happens. The coach actively sends players into the Crew, Demands and Town tabs, so this hits real players. The first 10-minute run lost its stagecoach this way ("🐎 The stagecoach wandered off"). After closing the sheet by hand it did start. **Fix:** Watch closes any sheet or Town before scrolling. | demo → Demands tab → force a duel → tap the chip: the sheet is still open and the special is not live | `f01_watch_sheet_before.jpg`, `f02_*`; `a17_275s_chip.jpg` (PT2 first run) |
| **N3** | **P2** | **The Saloon Row Deed has no signpost.** `game.nextGoal()` returns `{kind:'deed', …}` once Lower Street is open. But `goalHint()` (`app.js:500`) only acts on `kind === 'line'`. No coach, glow, save chip or hero hint points at the gate, which sits at the bottom of the list (y≈2200 of 2373). The coach-following casual bot ended 10:00 with **$896K banked against a $576K Deed** and three businesses, and never opened Saloon Row. Design target: ≤ 7:00. The "🔒 Finish 3 Lower Street demands" reason is also only readable on the gate itself. **Fix:** extend `goalHint` to deeds: a "📜 Deed ready ⤓" chip on the hero, a coach on the gate when affordable, and the blocked reason on the Demands dot. | `a_ten.mjs` FINAL; `i_goal.mjs` | `a44_601s_end.jpg`, `i_goal` output |
| **N4** | **P2** | **Bark rate and repeats break W5.** The 10-minute casual run had **28 sentence bubbles**. 9 gaps were under 15 s (5.2, 6.4, 6.9, 8.1, 9.7, 9.8, 10.3 s…) against the "one per 30–45 s" rule. Pickles had 10 of 28 and Pomfrey 7. Lines repeated inside the 10-minute no-repeat window: "That's my hat! …That's a chicken." at 5:01 and 8:06, "Spit's free. Polish costs." at 1:04 and 9:55. The first run had Pomfrey's "Mother writes" 3× and Fingers' only idle line 2×. Causes: (a) the idle speaker pool is filtered to characters whose business you own, so early on it is Nubbin (1 idle line), Fingers (1), Pomfrey (3) and Pickles (4), and `pickLine` falls back to repeating the oldest; (b) priority and gag barks and the spectacle's gag barks only pass through the UI's 30 s gate when `gated:true`. **Fix:** let idle draw from the 52 `tap` lines too; when nothing is fresh, stay **silent** instead of repeating; route every non-priority sentence through one 30 s gate; cap any one character at 1 sentence per 90 s. | `a_ten.log` (`grep BUBBLE`) | `a_ten.log` |
| **N5** | P2 | **"And STAY out!" (and the whole opening bark) never plays or shows.** Spectacle emits `bark mabel/opening` during the throw, before any gesture. `audio/manifest.json` is only fetched on the first gesture, so `barks.say` returns false (`chars` is null) and the line is dropped, not queued. Mabel does not speak at all in the first 10 minutes, because her idle lines need the Saloon. **Fix:** queue priority barks until the manifest loads (show the bubble even while audio is locked), or fetch the manifest at boot after first paint. | fresh run: no bubble or caption in 0–3 s | `e_probe` output, `a_ten.log` |
| **N6** | P2 | **Ghost Town ghosts spawn and are tappable from ~20 s on a fresh save**, although the Ghosts tab and the 👻 HUD pill are hidden for 10 minutes (UI.md, PT#11). The 3D ghost with its tap ring floats over the street (`ghost:spawn` every 20–40 s). The bot tapped 7 of them, and ecto was already 👻 9 when the tab appeared at 10:00. Gate the state's spawn (or Spectacle's draw and pick) behind the same reveal. | `a_ten.log` `ev:ghost:spawn` from 23 s | `a06_69s_tap_ghost.jpg`, `a24_295s_tap_ghost.jpg` |
| **N7** | P2 | **Duel readability:** (1) the OTS shot is the Stranger's dark hat at ~40% of the frame with the pace number "8" printed on it, and the opponent is not visible; (2) the ECU "Steady…" frame is a flesh-coloured blob, not eyes; (3) DRAW lands **10.3–11.5 s** after the duel starts, which is long for a repeated special; (4) the result card sits on top of a still-visible "D…!" DRAW word, and Mortimer's bubble overlaps the card. Reaction timing itself is correct: 270 ms GOLD, early = boot shot, 2613 ms BASIC. | force a duel | `sheet_duel.jpg` |
| **N8** | P2 | **The post-duel hero camera sits inside a character.** 2.5 s after the result, the hero (back on the Tubs tour shot) is filled by the back of a giant brown head. `heroTidy`'s near-cut doesn't apply to the duel's leftover cast. | duel on time, wait 2.5 s | `b24_duel_after_ontime.jpg` |
| **N9** | P2 | **Fling framing:** Mabel is a huge red back-of-body blob in the left foreground. The held drunk is ~40 px, under the tap ring, covered by the "Pomfrey's" ↑ chip and its label. The landing is mostly unreadable (the jail wagon is off screen). When a Golden Tumbleweed is up, the fling shows the 💪🥴 DOM stand-in over an empty street shot. **Fix:** pull the camera back and right so Mabel is ~200 px and in profile, and put the ↑ chip above the head, not on it. | demo, force a held drunk | `b10_fling_held_left.jpg`, `sheet_fling.jpg`, `sheet_specials.jpg` col 5 |
| **N10** | P3 | **Text collisions:** the Pomfrey-window gag toast "🪟 CRASH! My imported glass, too · +$226B" sits on top of Pomfrey's bubble, which says the same joke. The "⚰️ Greatly Exaggerated +1%" toast covers the "🖼️ Your new Wanted Poster" chip. The gen-2 Bowler promo card covers Nubbin's "I'm eight…" bubble. The Stetson promo card covers the Stranger's head. Bubbles clip at the right edge (Wendell at 7:56): the clamp is `x ≤ W−70` but the bubble is wider than 140 px. The Deed toasts sit over the next card's glyph row while you are scrolled. | | `sheet_fling.jpg` col 4, `sheet_fyd.jpg`, `sheet_tenmin.jpg` (476 s), `c11_deed_tapped.jpg` |
| **N11** | P3 | **Cutscene framing:** in the stagecoach, the passengers read as giant hats from above and the coach is out of shot. In the Fake Your Death procession, "Mortimer is overjoyed" and "Mabel blows her nose" are shot on the backs of Mabel's and Mortimer's heads, so no coffin is visible. In the Deed showdown, "His sign comes down" is a two-head close-up and the falling sign is out of shot. The poker scene is good. | | `sheet_specials.jpg`, `sheet_fyd.jpg`, `sheet_deed.jpg` |
| **N12** | P3 | **The first card shows only desert at rest.** Every card composes the business in its lower ~55% under a big sky and mesa band. At scroll 0 only the card's top shows under the hero, so in every rest screenshot the player's first business looks like an empty lot. Centred, it is fine (`sheet_cards.jpg`). Push the subject up, or shorten the sky band. | | `sheet_cardscroll.jpg` |
| N13 | P3 | Tapping the drunk does nothing (no grunt, no bubble). A Pomfrey caption says "**Colonel** Pomfrey", which W5 rules out ("never a plantation colonel"). The Crew sheet's `crew-s` captions are 11.5 px. The casual bot's Tubs time of 1:41 misses the ≤ 1:30 target. | | `j_chars`, `sheet_deed.jpg` |

**Verified OK under real touch:**
- **Opening and leveling:** mud → hat bank → buy (hat promo, OPEN stamp, Nubbin's first-business line); ×1 / ×10 / MAX via the tab-bar cycler (2→12→58); hold-repeat (+22 in 1.6 s); throughput glyph; hire.
- **Pacing hints:** the "💰 Save for it" glyph glow.
- **Piano:** in the hero and on the Saloon card; 10 taps = frenzy; one wrong-note groan seen in the 10-minute run.
- **Fling:** ×4 by swipe.
- **Duel:** gold, early and late.
- **Specials:** brawl, with the Saloon-card brawl after the poker win; robbery; stagecoach pick; tumbleweed (JACKPOT toast).
- **Ghosts:** ghost tap (+1 ecto).
- **Character taps:** bark with the 20 s cooldown (Pete, Wendell; Mabel grunts while a bubble is up).
- **Navigation:** hold-to-look on the hero (camera orbits, no hustle tap paid) and on a card (no page scroll); vertical touch swipe scrolls; jump dock ⤓/⤒.
- **Sheets and settings:** every sheet; the three volume sliders by drag (0.9 → 0.3, etc.); Sunday School on and off.
- **Endgame and persistence:**
  - Wanted Poster: it renders and is funny.
  - Two-tap Fake Your Death: "Two-Hats Hargrove", bounty 3, a 3 s rebrand.
  - Persistence: a mid-opening reload keeps the hat coins (16), and a post-opening reload keeps the business.
  - Hidden → visible: no black frame, and income continued.

---

## 3. First ten minutes, casual bot vs the beat sheet

The bot taps mud in bursts, follows every coach, buys when lit, levels/hires/throughput with a 70% chance per loop, sells piles, visits the hero every 15 s to tap events, the piano and characters, and answers special chips.

| Beat | Sheet | Measured | Verdict |
|---|---|---|---|
| Eject, "And STAY out!" | 0:00 | The throw plays. No line, and **no visible coach** (N1) | ✗ |
| Mud → hat → bank | 0:03–0:12 | Hat coach at 0:06, $50 at 0:18 | ✓ |
| Buy Shine → build → OPEN → Bowler | 0:30 | Buy 0:19, open 0:22, Bowler promo plus Nubbin's line | ✓ |
| Coach → ⬆ Level | 0:40 | 0:28 | ✓ |
| Golden Tumbleweed | 1:00 | 0:47 (tapped 0:53) | ✓ |
| Tubs open | 1:05 (target ≤ 1:30) | Bought 1:27, open **1:41** | ½ |
| Manager | 1:45 | Crew tab revealed 1:15 | ✓ |
| Livery, Stetson | 2:30 (≤ 3:00) | Bought 2:37, open **2:56**, Stetson | ✓ |
| Demands tab | 3:00–4:30 | 1:39 | ✓ (early) |
| First special | ≤ 5:00 | Duel wind-up at **4:22** | ✓ |
| Saloon Row Deed, poker, brawl | 5:00–7:00 | **Not reached by 10:00**, with $896K banked (N3) | ✗ |
| Ghost Town reveal | ≥ 10:00 | Tab at 10:00 ✓, but 3D ghosts from 0:23 (N6) | ½ |

In 10 minutes: 214 taps, 271 levels, 9 tip riders, 5 tumbleweeds, 7 ghosts, 35 piano taps, 1 duel, **0 ejections or flings** (the Saloon was never owned), 28 bubbles, 61 voice plays.

---

## 4. Fun and comedy

**What lands:**
- The **brawl** (rings on cartwheeling bodies) and the **poker five-aces** cutscene. Poker plays as a real scene, with "Slick Vinnie: 'Full house. Read 'em and weep.'" → "You lay down… five aces." → "The Gizzard is yours. Mabel comes with it."
- The Pomfrey window fling, with "My window! That was imported glass!"
- The duel boot-shot result.
- The **Wanted Poster** ("Dead or alive · preferably confused", "Baths taken: 0").
- Mortimer's "Lie still, he's not finished measuring you" on a duel win.
- The writing is consistently good. The best lines: Pickles's "I was sober once. Terrible. Everything was so… clear.", Pomfrey's "Father sent me West to build character. I bought one.", Wendell's "This badge stops bullets! …Says so on the box."
- Voice plays with every bubble.

**What deflates it:**
1. **The first 10 minutes have no Saloon, so there are no ejections or flings.** The showpiece verbs (W4, W6) and Mabel are locked behind the Deed that nobody is pointed at (N3). For ten minutes the comedy is ambient vignettes and barks only. Either signpost the Deed hard from ~4:00, or let the pre-Saloon ambient ejection (Pomfrey's saloon) offer a fling once or twice as a taste.
2. **Barks become wallpaper** (N4). With ~3 sentences a minute, most from Pickles and Pomfrey, the good lines lose their punch and the repeats are noticed by minute 5. Half the rate and twice the pool would be funnier.
3. **The gags are framed on the backs of heads.** The fling (Mabel's back), the FYD procession (Mabel's and Mortimer's backs), the duel OTS (the hat). The comedy is in faces and impacts, and the cameras keep finding shoulders. Rule of thumb for S: the payoff actor faces the lens at ≥ 150 px on the S22, with no big near-camera body in the frame.
4. **Repetition within 10 minutes:**
   - The hero tour shows the eject-dust vignette at the saloon over and over.
   - Tip riders ("Tap glinting riders for tips") appear about every 30–60 s.
   - Ghosts appear every 20–40 s before they mean anything.
   - "↑ Level N" chips float on every card.
   - None of these is annoying on its own, but together with the barks the screen is never calm. Thin the riders and ghosts in the first 10 minutes.
5. **The duel is long for a repeat:** about 10–11 s of paces and stare before DRAW. That's a great Leone joke the first time, and a wait the third time. After the first duel, shorten the paces (skip the ECU or the interruption 50% of the time).
6. **Opening confusion.** With no visible prompt (N1) and no line (N5), a new player sees a brown, mostly empty frame with a ring on a hat. Fix N1/N5, and put the Stranger's face and the hat in the middle third with the mud in front.
7. **Unfair or confusing:**
   - Specials silently die behind sheets (N2).
   - Any tap during the 10 s duel build-up is an instant "shot your own boot", with no "wait for DRAW" text on screen. Add "Don't touch… wait for DRAW" under "Steady…" for the first duel.
   - The ↑ fling target is "Pomfrey's" but lands in the saloon's upper window. That reads as your own saloon until the purple nameplate is noticed.

---

## 5. Console errors

None. All 13 sessions had 0 exceptions, 0 `console.error`/`warning` entries and 0 failed requests, including the reloads, visibility toggles and Fake Your Death. `audio/manifest.json` is no longer a 404, and the autoplay warnings are gone.
