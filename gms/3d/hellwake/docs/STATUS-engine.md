# Engine status

Completed engine.mjs and tests/engine.test.mjs. Contract unchanged. DOM-free deterministic simulation, serialized state, normalized movement and pause, eight distinct auto weapons, eight evolutions, six passives, four relic bonuses, capped hordes/projectiles/gems/effects, drops and XP drafts, proximity objectives, telegraphed boss attacks and summons, charged pulse, terminal results, and endless boss cycles.

Actual values match content: vitality relic +10 and passive +25; might +18%/passive rank, haste +12%, reach +15%, magnet pickup +40%, fortune XP +12%. Survivor bonuses supported. Pulse clears nearby hostile projectiles, deals area damage, pushes/slows zombies and vacuums XP. Objectives heal20, charge25%, award XP and embers.

Verification: `node --test tests/engine.test.mjs` passes 11 tests covering determinism, movement/pause, basic kills/XP, objectives, pulse, drafts/stats, all weapons/evolutions, boss telegraph/victory requirements, death, endless and relics. Non-cheating automated steering with seed53 and no relics completed chapters0-3 at104/142/162/185 seconds; chapters4-5 died near193/180seconds, with objectives complete. This is a pacing sanity check, not a substitute for real mobile testing; later chapters are intended to benefit from earned relics and balanced health drafts.

Renderer notes: lightning effects include fromX/fromY/toX/toY. Projectile hostile flag marks acid/hellfire. Friendly zones flame/frost; hostile warning zones detonate on expiry. Orbit count=2+floor(rank/2)+(evolved?2:0), radius=(2+rank*.1)*reachMultiplier, angle=time*2.3+i*TAU/count. Drones have two/four positions radius1.4, angle=time*.8+i*PI/(evolved?2:1).

No known blockers. Root owns browser verification and integration. Engine updates clamp input dt to .25 seconds and substep at1/30 for pause-resume safety.

## Campaign and replay follow-up

Completed bounded natural-play balance verification across seeds53,103,801. The steering bot only submits normalized movement/pulse/upgrade choices; it never changes HP, XP, timers, enemy state, or objective progress. Each seed completed all six chapters on its first attempt while buying relics only from the preceding run's earned embers. Draft priorities favor the starter, matching evolution passive, a close-range second weapon, and health when hurt.

| Seed | Chapter completion seconds (1 through 6) | First chapter evolution | Final chapter evolutions |
| --- | --- | --- | --- |
| 53 | 104,140,160,185,197,236 | pistol94s | pistol141s,orbit169s,drone211s |
| 103 | 103,148,160,192,196,210 | pistol86s | pistol141s,orbit177s,lightning203s |
| 801 | 112,141,160,181,205,210 | pistol107s | pistol94s,orbit151s,drone192s |

All three then naturally survived647seconds in endless and reached six boss waves. Endless enemy HP scales with elapsed time after the chapter duration; boss HP increases50% of baseline each wave. No balance adjustment was needed to make the campaign and evolutions achievable. The skilled bot is not evidence of ordinary-player win rates or device performance.

Added a repeatable public-API campaign plus430second endless regression; tests now pass13/13 in approximately1second. The full campaign verifies every chapter has at least one naturally earned evolution and that three successive endless bosses increase maximum HP.

Added constructor option `unlockedChapter = chapter` and serializable state `arsenalChapter = max(chapter, unlockedChapter)` bounded0–5. Content agent updated draft eligibility to this field, keeping chapter0 tutorial selection behavior. Root must pass save.unlockedChapter so replaying earlier chapters retains earned weapons. Regression confirms chapter0 with arsenalChapter5 can draft drone/scythe. Contract addition coordinated with root and content; all other interfaces unchanged.
