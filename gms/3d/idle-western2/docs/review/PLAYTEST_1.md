# PLAYTEST 1: adversarial phone playtest

2026-10-04. Headless Chrome 154 on `--use-angle=metal`, CDP 9391, S22 viewport (412×915 @3, mobile, touch emulation). All input went through real `Input.dispatchTouchEvent`: taps, holds, swipes and slider drags. Debug acts were used only to fast-forward (cash cheats, forcing a special or a held drunk, finishing builds offscreen). The audio lane is still running, so `audio/manifest.json` is missing and every bark is text-only. Today's date falls inside the Ghost Town season window, so the season overlay is live in every run.

Scripts and screenshots are in `docs/shots/playtest/` (gitignored). `lib.mjs` is the driver: `a_open` is the opening, `b_early` the first 70 s, `e_glyph` glyphs/tabs/settings, `f_action`/`g_specials` piano, fling, duel and specials, `h_piano`, `i_mid`/`j_deed` hire, build, promo, Deed and poker, `k_misc`/`l_gen2` look, dock, settings, poster, FYD and lifecycle, `m_persist` reload, `n_read` readability, `o_hold` hold-repeat, and `p_five` a 5-minute realistic play bot.

**Verdict.** The core verbs work under real touch, and the duel and robbery are good. The first five minutes are where it falls down: a stuck coach, missed payoffs and slow pacing. The two showpiece gags (fling and stagecoach) often play out of shot.

---

## 1. Bugs

| # | Sev | Bug | Repro | Evidence |
|---|---|---|---|---|
| B1 | **P1** | **"🔨 Tap to hurry" coach sticks on the hero forever.** If you don't hurry the first build (it only takes 6 s), coach `hurry-hero` has `ms: Infinity`. It is only cleared by an actual hurry, so it stays pulsing on empty dirt for the rest of the session. Because the coach is one-at-a-time, it also **blocks every later hint**: 👆 Tap to sell, ⬆ Level up, 🕴 Hire, qty, pin. In the 5-minute bot run it was still current at 300 s. It happens again in gen 2 after a 3 s rebrand. | `?nosave=1` → mud → hat → buy Spit & Shine → don't tap anything → wait. `__iw2ui.debug.coach.current === 'hurry-hero'` | `c01_top_after_open.jpg`, `b02_t30.jpg`; p_five log |
| B2 | **P1** | **The stagecoach plays off camera.** The chip says "Stagecoach! Pick a passenger", but the hero stays on the saloon street with no coach or passengers in shot. A passenger pick target surfaced on only 1 of ~30 polled frames, so a real player has nothing to tap and the special times out. | demo → force `stagecoach` → watch the hero | `f30_stagecoach_live.jpg`, `g_stagecoach_*.jpg` |
| B3 | **P1** | **The fling gag is off camera.** When Mabel grabs a drunk, `spectacle.fling()` puts him at x=617–638 px (offscreen right), with all four targets `visible:false`. The UI then shows its DOM stand-in (💪🥴 plus four emoji chips) floating over whatever the hero shows, usually Spit & Shine. The swipe works, but the 3D throw lands out of shot, so the main joke of W6 is never seen. The hero should cut to the saloon doors (W9 does this for specials). | demo, scrollTo 0, force a held drunk | `n01_fling_held.jpg`, `f10_fling_held.jpg` |
| B4 | **P1** | **The jail wagon is unreachable by swipe** whenever its projected target is offscreen: a ↓ swipe sent him to the **trough**. Fling stats after ←, →, ↓, ↑ were `trough 2, dentist 1, jail 0, pomfrey 1`. Only the ↓ chip tap reaches jail. W6 promises that direction picks the target. | f_action fling loop | f_action log |
| B5 | **P2** | **The hat promotion is invisible if the hero is not on screen.** `hats.promo()` appends a 2.8 s card to the hero and then removes it. The first business auto-scrolls the page down (scrollY 227), and later purchases happen from the list, so the Bowler and Stetson promotions (W14, "the first promotion beat") are never seen. They should queue until `heroVisible()`, or show a toast-sized version in the list. | Buy Livery from its card while scrolled. `st.hat` goes 1→2 and nothing shows | `a09_promo.jpg`, `i05_livery_promo.jpg` |
| B6 | **P2** | **The Deed showdown is unseen for the same reason.** Tapping the gate (at the bottom of the list) plays the 3 s "his sign comes down" showdown in the hero while you are at scrollY 1550. All you see is a stamp and a Pomfrey bubble with no context. The poker acquisition is only a toast plus the camera cut (known gap: cutscenes not staged). | j_deed | `j03_deed_*.jpg`, `j05_poker_*.jpg` |
| B7 | **P2** | **Gen 2 restarts the mud opening.** After Fake Your Death, `bootstrap.opening = true` and the coach says "👆 Tap the mud" with a dashed ring, **while you already hold $200** and Spit & Shine shows "$50 · BUY". The coach and the mud ring also appear *during* the funeral captions, under "Pomfrey laughs…". Either skip the bootstrap in gen ≥ 2 or hold it until the ceremony ends. | demo → Boot Hill → FYD ×2 taps | `l01_gen2_start.jpg`, `k08_fyd_20.jpg` |
| B8 | **P2** | **Audio unlocks on `pointerdown`.** On Chrome Android, touch `pointerdown`/`touchstart` is *not* user activation, so the context is created suspended and then the unlock listeners are removed (`gestured = true`). Every later `ctx.resume()` from a pointerdown handler logs "AudioContext was not allowed to start" (12 warnings in one session). In practice the first mud taps are silent, and so is the honky-tonk opening the beat sheet relies on. Unlock on `touchend`/`click` instead, and keep retrying `resume()` in those until it reports `running`. | any fresh run with touch input | console log in every script |
| B9 | P3 | **The special wind-up chip lingers.** "🔔 High Noon Duel! Get ready…" and "Bar Brawl! Get ready…" stay visible behind "HIGH NOON" and the brawl timer for the first 1–2 s of the live phase. | force any special | `f21_duel_live_ontime.jpg`, `g_brawl_01.jpg` |
| B10 | P3 | **The poster button does nothing visible in headless mobile.** `navigator.share` exists and `pointer:coarse` is true, so it awaits the share sheet. There was no toast and no download. On a real S22 the sheet will probably open. But if the user cancels (AbortError), the code falls through and *also* downloads, so a cancel triggers an unwanted download. Treat AbortError as done. The poster itself renders fine. | Boot Hill → 🖼️ Print my Wanted Poster | `l00_poster.jpg` |
| B11 | P3 | **Toasts stack over the list.** Achievement toasts ("Railroad Money", "Ragtime Riot") sit at the top of the viewport over the next card's glyph row while you are scrolled, and over the live special's timer bar in the hero. | any level spree | `h02_frenzy.jpg`, `sheet_g.jpg` |
| B12 | P3 | **The Ghost Town sheet's rank row overflows to the right** (rank 6 is cut off). The Demands title truncates to "TOWN COUNCIL DEM…", and Crew names truncate ("Hortense Hoof…"). | open the sheets | `sheet_e.jpg` |

Verified OK under real touch: mud taps, the hat bank, buying from the glowing card (cash + hat combined), hurry (hero tap and glyph), level ×1/×10/MAX via the tab-bar qty cycler, hold-to-repeat level (+30 levels in 2 s), throughput/boost glyphs, hire manager, all six tabs plus Settings, piano (hero and Saloon card; 9 taps in 5.7 s → PIANO FRENZY), swipe-fling ←→↑, the ↓ chip, duel on time (172 ms GOLD), early (shot own boot) and late (2616 ms BASIC), brawl (7/7 with taps), robbery (Bart caught, +🦷2), tumbleweed (JACKPOT), Deed purchase, the poker acquisition, hold-to-look on the hero and on a card (a vertical drag still scrolls the page), jump dock ⤓/⤒, Sunday School toggle, a volume slider drag, two-tap Fake Your Death plus gen-2 rebrand (3 s), reload persistence (mid-opening hat coins and post-opening state, settings and volumes), and hidden → visible (welcome-back card, no black frame, no "graphics paused" chip). Freezing via `Page.setWebLifecycleState` hung CDP evaluate. That was harness noise, not reproduced via visibility.

## 2. Confusing or unfunny moments, and fixes

1. **The boot frame doesn't read as "you got thrown out".** The tap ring labelled as your hat sits on the Stranger's *head*. The biggest hat in frame is some passer-by's giant brown hat filling the foreground. The mud tapzone is a dashed circle on a table/stall roof. **Fix:** frame the Stranger face-down plus an upturned derby at 40 px or more. Put the coin glint on the mud beside him, not on a roof, and push the foreground extra out of frame.
2. **There is no visible "And STAY out!" moment.** With no VO the slow-mo eject is easy to miss, so the opening is a static street with a coach pill. **Fix:** a one-line caption "MABEL: And STAY out!" on the eject, as the captions system already does for acquisitions.
3. **Hats eat the people.** At the card and hero camera pitch every NPC is a disc of hat. Faces, gestures and the "drunk" are illegible (`a10_after.jpg`, `b02_t30.jpg`). It's on-theme, but the gags (W4 at 40 px) die. The planned round-2 ~30–35° camera is the fix. It should also cap the hat brim radius for extras near the camera.
4. **The ghosts are emoji stickers.** Glowing 👻 DOM emoji float over buildings from the first 20 seconds. They look like debug placeholders next to clay art, and add a fourth currency pill (🦷 + 👻 + cash + gear) before the player knows what a manager is. **Fix:** hide the season tab and ghosts until the first Deed, or until 10 minutes in, and draw them as a translucent clay sheet-ghost.
5. **Every tab has a red dot at once** (Town, Crew, Demands, Boot Hill, Ghosts in demo; Ghosts alone at 18 s on a fresh game). Dot fatigue means none of them gets read. **Fix:** at most one "new" dot at a time, highest priority first.
6. **The brawl is a crowd of specks.** The camera stays wide and high. The flying bodies are ~15 px on the phone, there's no dust cloud read, and "Tap the flying bodies!" is hard to obey. The brawl that plays *in the Saloon card* (j06) reads far better, with target rings and bigger bodies. **Fix:** cut the hero to the card-like framing.
7. **The Saloon card hides the piano** under its balcony roof. It's tappable there, but nobody will find it, and the 🎹 fallback is hidden whenever any plot exposes a piano target. **Fix:** angle the card camera so the porch piano shows, or keep the 🎹 glint until the first play.
8. **The duel OTS shot is 50% a giant cream hat**, with "3" printed on the hat. It's funny once, but the opponent is barely visible. Trim the brim or pull the OTS camera wider.
9. **"Tap to hurry" on a 6 s build is noise.** Hurrying saves ~0.5 s per tap. The first build is over before the coach is read. Drop the hurry coach for builds of 8 s or less.
10. **Pacing deflates the comedy.** A greedy-but-sensible player (level, hire, sell piles, buy the next card when lit) reaches Tubs at 2:56, versus 1:05 on the beat sheet. Livery was not reached by 5:00 (beat 2:30), there was no special in 5 minutes, and the Saloon Deed (beat ~5:00) is far away. Income after the first business is $0.3/s against a $360 Tubs, with no hint to save for it. **Fix:** Tubs to ~$150, or a coach line "Save for the Tubs" once Shine is Lv 5.
11. **Fling chips are bare emoji** (💦 🦷 🚓 🪟). The "Swipe to fling!" hint is half-covered by the 🪟 chip. Move the hint below the ring and label the targets on first show (Trough, Dentist, Jail, Pomfrey's window).

## 3. First five minutes vs the beat sheet (§7.2)

| Beat | Sheet | Measured (real touch) | Verdict |
|---|---|---|---|
| Eject, face in mud, "And STAY out!" | 0:00 | Static frame plus coach. No VO, no readable slide | ✗ weak |
| Tap mud → coins into hat | 0:03 | Works; +$2 coins flip, ×N badge | ✓ |
| "Tap your hat" | 0:12 | Appears at 6 coins (~2 s of tapping); banks fine | ✓ |
| Piano glint discovery | 0:15 | Piano at the far left edge (hit area ~30 px wide); no glint because the plot target hides the 🎹 fallback | ✗ |
| $50 → card glows "Buy it!" → build → "I'm eight. I got a business. You?" → **Bowler** | 0:30 | $50 at 11–14 s; build 6 s; Nubbin's bubble shows; **Bowler card not visible** (B5); page auto-scrolls the hero half off | ½ |
| Coach points at ⬆ | 0:40 | **Never**: blocked by the stuck hurry coach (B1) | ✗ |
| Golden Tumbleweed | 1:00 | 0:42 ✓ (tap pays a JACKPOT toast) | ✓ |
| Tubs build | 1:05 | **2:56** | ✗ |
| Manager offer | 1:45 | 2:31 (hired, no coach) | ½ |
| Livery, Stetson, Pomfrey rides past, ribbon | 2:30 | Not reached by 5:00. The ribbon appears at the first business instead, which is fine | ✗ |
| Demands tab revealed | 3:00–4:30 | 2:23 ✓ | ✓ |
| Saloon Row Deed, poker, scripted brawl | ~5:00–5:30 | Not reached. When reached (fast-forwarded), poker is just a toast and the showdown plays offscreen; the scripted brawl does fire right after the Saloon opens ✓ | ✗ |

## 4. Phone readability

- **Tap targets:** glyphs are 48×52, tabs 60×56, the qty segments 42–45×40 and corner buttons 40×40, all OK. Under 40 px: `focus-chip` (34 px tall) and the ribbon (34 px tall).
- **Text size:** tab labels are **9 px** (×6 tabs; at 3× DPR they are legible but tiny), glyph costs 10.5 px, ribbon names 11 px, and the Pomfrey hat icon in the ribbon is 6.75 px, a dot that won't read as "his hat is shrinking". The ribbon is the hat-war signal (W3) and should be at least 14 px with a visible hat.
- **Clutter:** the hero routinely carries the ribbon, focus chip, qty bar, coach pill, the floating ghost 👻, a toast and sometimes the fling ring and chips. Together they cover roughly 25–35% of the hero during a fling (`n01_fling_held.jpg`).
- **Overlap:** the wind-up chip over the duel title (B9), toasts over the brawl timer and card glyph rows (B11), the poster chip over the gen-2 mud area (`l01`), the "Swipe to fling" hint under the 🪟 chip, and the stale hurry coach over empty dirt (B1).
- **Chips covering the 3D gag:** the fling stand-in sits exactly where the 3D gag *should* be, but the gag is offscreen (B3). The tapzone dashed ring sits over the Spit & Shine stall in the opening.
- **Fresh-start layout:** the hero is 522 px, and below the single FOR SALE card about 40% of the screen is empty parchment (`a00_boot.jpg`). A greyed silhouette of the next two lots, or a taller hero during bootstrap, would fill it.

## 5. Console errors

- `404 audio/manifest.json` on every first gesture. This is expected while the AU lane runs, but the request should not fire until the file exists (it shows as a red network error in DevTools).
- `The AudioContext was not allowed to start…` once per gesture-handled sound attempt, up to 12 per session (B8).
- No uncaught exceptions or `console.error` in any of 14 scripted sessions.
