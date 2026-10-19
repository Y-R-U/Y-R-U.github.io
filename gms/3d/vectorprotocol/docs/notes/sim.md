# sim agent notes

## Status (2026-10-19) — Phase 0 complete; a fresh agent can resume from here
- DONE: js/sim/{SCHEMA.md, README.md, rng, constants, stats, battle, data, fixture_data, progression, economy, story, arena, events, save, game_state}.js;
  tools/sim/{test.mjs (15 tests, `--quick`), validate.mjs, balance.mjs}. Real js/data validates (0 errors); tests pass.
- Battle implements DESIGN.md §1–9: board/targeting (guard taunt, screen, sticky targets, marked preferred), triangle, position bonuses, synergies (faction tiers, role mixes),
  overdrive charge (landed basics, damage taken, trickle, kills), statuses, shields (60% cap), waves (HP carry, 10% heal, statuses clear, 1 s deploy), 75 s wave timeout = loss,
  **overtime** (45 s, +4%/s dmg, heals ×0.5), stun-in-windup cancels overdrive (+50 refund), stars by units lost (+ level `stars` override incl. threeMaxTime), forfeit(), recorded inputs → exact replay.
  Optional rule `screenBypass` ({archer:'mage'}) exists, default off — tested, no meaningful effect because the Guard taunt wins first.
- game_state: features/unlock gating, role-balanced autoFormation, arena rivals (power-matched), events, recruit (seeded, pity), save v1 + migrations.
- NEXT (if resumed): run `node tools/sim/balance.mjs --seeds=1,2,3 --hours=60` after design's latest retune and post the summary here; consider a `rewardBoost` (design §12) if design adds it.

## Requests
- design: credits are the progression cap (see run 5 snapshots) — rank-up credit costs vs income.
- battle/ui: use js/sim/data.js loadData() now that js/data/index.js exists (manager's 404 concern is resolved).

## Harness findings (latest, run 5, seed 1, design data as of ~run 5)
- Straight-through (story only): hard wall m4_l10 at 13 h (stalls from m1_l12, m2_l10, m2_l14, m3_l10). Story replays farm ~47k xp/h, 18k credits/h.
- Grinder (story + arena/events, naive auto formation): m1–m5 in ~8 h, then m6 (fantasy) 21 h, hard wall m6_l13; 66% of time in arena/events.
- Smart (formation search): m1–m5 in 2.5 h, m6 4.2 h, m7 wall (20 h, walled m7_l14 at power 12k); 59% grind share.
- Overtime fixed the stalemates: timeouts m3 324 → 0–8.
- Snapshots: units at level cap with enough shards but **no credits to rank up** (wallet 0–2.3k vs rank-up 8k/20k/45k). Abilities stuck at 2/3 for the same reason.
- vs D10: walls start too early for the straight player (m1/m2 stalls, but they're short); map 5 is a dip (0–1 losses), m6/m7 cliffs; total >27 h without finishing. Design is retuning m7/m8 (run 6).

## Matchup findings (L30 R3 A3, run 4 data)
- Mono-role is a hard counter even at triangle 0.20/0.15 (archers 0% vs 3 tanks, 100% vs 3 mages) — inherent to 3-of-a-kind; mixed squads OK.
- Comps: 3/0/3 83%, 3/1/2 75% … 0/6/0 8%: **archers are the weak role** (they're forced by the screen to shoot tanks, which resist them).
- Factions (T/A/M): corporate strongest (80/78% vs rogue/exp); mono-corporate 6 85%.
- Rarity at honest rank: common 23%, rare 27%, epic 52%, legendary 60% — rare barely above common.
- Unit outliers: pyre 80%, paladin 70%, gunner 67% high; wisp 10%, aegis 17%, prism/rattler 20%, needle/juggernaut 23% low.

## Non-obvious decisions
- Ticks 10/s; damage/crit/variance rolled at fire time (attack event carries `crit`), defence/shields at impact.
- Charge per basic on *landing* (DESIGN §6); charge frozen while stunned.
- Shots in flight from a unit that dies still land.
- Feature gating only applies to feature ids some level actually grants (so missing data never locks the game).
- Loss in story gives 20% xp (`economy.lossXp`), no currency.
- Harness time model: battle time / 2 (x2 speed) + 15 s overhead per battle, 2 s per upgrade action, a "day" per 1.5 h played.

## sim-2 (round 2) — checkpoint 1
- DONE: (a) Rift banner `recruit.rift` (chips 150): fantasy NPCs as `RIFT_RECRUITS` (enemies.js) merged into DATA.units with `bannerOnly`+`noArena`; each joins the pool when its `recruitable` level is cleared (m6_l5 dire_wolf, m6_l8 elf_ranger, m6_l11 horde_shaman, m6_l12 frost_wolf, m6_l16 rift_knight+elf_sage, m7_l6 minotaur, m7_l12 treant). m6 shard rewards now = Rift recruits (bank until recruited). `game.bannerPool(id)`.
  (b) `economy.shardExchange` {to:'chips', rate by rarity}; `game.convertShards(def, n?)`, `convertAllShards()`, `surplusShards(def)`; UnitCard `surplusShards`, `shardValue`. Unowned units' shards never convert.
  (c) forfeit() already returned the end event with full stats (test added).
  (d) m8 lv [48,52].
  Star goals: story.js evalGoal/goalText/goalSquadRule/recordGoals/mapChests; battle.js `opts.goals` → result.goals + stars; game_state stores `story.levels[id].goals` (bool×3), goalRewards on first completion, map chests auto-granted; `goalFormation`, `autoFormation(opts)`; save v2 + migration. maps.js generates goals/goalRewards/chests; time limits baked by `node js/data/_gen_star_times.mjs` → js/data/star_times.js (re-run after wave/stat changes!).
  Tests 23/23, validate 0 errors (validate now checks goals/chests/recruitable).
- IN PROGRESS: balance.mjs star-play policy (smart plays star goals when overpowered) + time breakdown.
- NEXT: balance pass (3 seeds × 60 h), per-unit outliers (within-rarity), README API, ECONOMY/DESIGN docs, regen ROSTER/MAPS docs.
- Baseline before sim-2 (3 seeds): smart finish 17.3/14.1/14.2 h, grind 55–60%; grinder 1/3 finish; straight walls m5–m7. Units at equal rank: paladin 68, leviathan 65, citadel 64 … gunner/phase 28, kingpin 29 (legendary!).

## sim-2 — checkpoint 2
- DONE since cp1: harness star play (smart policy: alternates star replays with arena/events whenever a cleared level with open goals is ≤80% of squad power; 2 fails → retry at +15% power) + completionist phase after the story + per-policy curve table; spendAll converts surplus shards. Per-unit report vs rarity mean (`--unitTrials=200`). Unit tweaks (bulwark/citadel/paladin/seraph down; paragon/kingpin/arbiter/scrapper/jammer/singularity up). Goals tightened (time SLACK 0.95, integrity 0.6–0.75). README API, DESIGN §8, ECONOMY sections (shards, Rift, stars), MAPS/ROSTER regenerated.
- First star run (seed 1, loose goals): smart finished in 13.3 h (faster than 17.3 baseline — star rewards add power), 91% stars at story end → goals were too easy; tightened.
- IN PROGRESS: round-1 runs in <scratchpad>/sim2/r1 (3 seeds, all policies).
- NEXT: tune curve (m3–m6 too quick, m7/m8 too heavy), ECONOMY § Balance status, final report.

## sim-2 — checkpoint 3 (handed back before the final balance pass)
- DONE: kit buffs for kingpin (drone_sting 1.1, swarm 0.7, aura +crit/atk), arbiter (aura atk .09, pulse 1.0) and scrapper (adrenal_burn threshold .6 + fortify); stat boosts that did nothing were reverted. Matchups m2: only patch is outside ±10 of its rarity mean (+11) → patch/bulwark nerfed slightly (not re-measured yet).
- Round-1 runs (<scratchpad>/sim2/r1, tightened goals, older unit stats) were still running for the smart policy. Straight: walls m5_l16 / m5_l16 / m7_l3 at 16–23 h. Grinder: finished in 11.1 h on seed 1, walled m7 on seeds 2 and 3.
- NEXT: re-run `node js/data/_gen_star_times.mjs` (unit stats changed), then `balance.mjs --seeds=1,2,3 --hours=60`, tune the curve (m3–m6 too quick, m7/m8 too heavy), write ECONOMY § Balance status, re-check matchups.
- Requests: battle (js/battle/battle.js:168) and ui (js/ui/scr_battle.js:128) should pass `goals: cfg.goals` into createBattle so the end banner's stars match.

## sim-3 (round 3) — checkpoint 1
- DONE: read brief/notes; star_times regenerated (unchanged). Diagnosed sim-2's slow/erratic smart runs as **harness policy bugs**, not data:
  (1) `playStar()` left the goal formation (e.g. 3 units, no tanks) in place, so the following arena/event battles ran with a crippled squad (arena win 19%, events 45% on seed 1);
  (2) smart always picked the hard arena rival; (3) smart kept re-entering event tiers it had just lost; (4) HQ/abilities/Street Hire spent the credits every battle, so 8k/14k rank-ups never got funded (scrap piled to 580k).
  Fixed in balance.mjs (smart only; straight/grinder unchanged): restore formation after star play, EMA rival pick, event tier block until +8% power after a loss, credit reserve for a ready rank-up, Street Hire only to fill a slot. New report line: rank-up blockers (shards vs credits, unit-time at cap).
- IN PROGRESS: baseline (old data, old policy for straight/grinder) in <scratchpad>/sim3/b0; new-policy smart runs in <scratchpad>/sim3/h1.
- NEXT: tune curve with the fixed policy.

## sim-3 — checkpoint 2
- DONE: fixed-policy smart on current data = **5.6 / 6.3 / 6.7 h**, all 3 seeds finish (the "back-loaded m8" of sim-2 was mostly the harness bugs). Shards bind (66–73% of capped unit-time), credits never (683k banked at the end). Shard sources (whole run, seed 1): dupes 830 · stars 418 · events 352 · arena shop 340 · story 322.
  Matchups re-measured (`--unitTrials=200`): **no unit outside ±10 of its rarity mean** (bulwark +7, patch +6; arbiter/singularity −10 borderline).
  So the job is now "slow the whole economy ~2.5–3×", not "soften m8". Experimenting in variant copies (<scratchpad>/sim3/var/*, scripts mkvar.sh / plib.py / sum.sh) so the live tree stays untouched.
  v3 (rankUp shards [15,25,45,75,110], credits [500,2.5k,7k,14k,24k], arena rivals [0.9,1.2] + arena credits ×0.5, Vault ×0.6) → 10.4–10.8 h, arena+events 39–42%.
- IN PROGRESS: v4 (v3 + heavier credits + lv m3–m8 +1..2), v5 (heavier shards, shop shards 90 tokens).
- NEXT: pick, apply to live js/data, regen star times + docs, full 3-seed run with all policies.

## sim-3 — checkpoint 3
- DONE: variants v4–v9. Findings: the elastic power source is the **arena shop** (tokens → 5 shards) plus drafts/dupes; cutting rank-up cost alone just moves players to the shop. Credits only co-bind once rank-up credits ≈ ×2.5–3 and arena/Vault credits are cut.
  v9 (rank shards [15,30,50,80,110], credits [500,3.5k,12k,25k,40k], ability credits [300,1.5k,5k,12k], arena rivals [0.9,1.2], arena credits ×0.4, tokens ×0.6, shop 90 tokens, Vault ×0.5, lv m3 [17,25] m4 [25,33] m5 [32,39] m6 [40,45] m7 [44,49] m8 [49,53]) → 12.3/15.0/16.0 h, blockers "both" ~80% (credits & shards co-bind), arena+events 50–54%. m6 is a dip (0.5 h), m7/m8 3–5.5 h.
  Harness: added "(grind at x4: …)" sensitivity to the time-split line.
- IN PROGRESS: v10/v11 (m6 [40,47], m7 [46,49], m8 [49,52]; v11 also m3 [17,26] m4 [26,34]).

## sim-3 — checkpoint 4
- DONE: new tool `tools/sim/curve.mjs` (difficulty probe: lowest uniform level at which a fixed reference squad wins ≥50% of each story level; `--squad=a,b,…`). It showed: m5 opens with a jump (req 37 vs m4 end 31–34), **m6's first half only needs L31–38** although enemies are L41+ (fantasy pool is weak), m7 L41–50, m8 needs R5 (commons can't follow).
  m6 `rankBonus: 1` + lv [40,46] fills the m5→m7 gap (req 31→51, median 41).
  v10–v14: totals 12–26 h but m7/m8 3–9 h: the R4→R5 step (≥95 shards, ≥30k) is the long pole because elastic shard income (shop) doesn't scale with it. Next: flatter rank-cost ratio (cheaper top, pricier middle).
- IN PROGRESS: v15 (v14 + m6 rankBonus), v16 (shards [10,25,40,55,70], credits [500,3k,10k,20k,30k]).

## sim-3 — checkpoint 5 (resumed after usage reset; nothing had died — v15/v16 had completed)
- v15 (v14 + m6 rankBonus 1): 20.3/19.6/13.3 h, m8 4.9–9 h. v16 (shards [10,25,40,55,70], credits [500,3k,10k,20k,30k], tokens ×0.5, shop 90, arena credits ×0.4, rivals [0.9,1.2], Vault ×0.5, ability credits [300,1.5k,5k,12k], lv m3 [17,26] m4 [26,34] m5 [33,40] m6 [40,46]+rankBonus 1 m7 [45,49] m8 [49,52]): 11.9/18.7/14.6 h; m7 fixed (1.8–1.9 h) but m8 3.5–9.9 h (mid-m8 elite needs R5 on 4+ units).
- IN PROGRESS: v17 (v16 + m8 [48,51]), v18 (v16 + m8 [48,50], m6 [40,45]).
- v17 13.4 h mean (10.4/15.0/14.8), v18 (m8 [48,50], m6 [40,45]) 12.5 h, v19/v20 (m3–m5 +1) 9–12 h: seed noise (~±25%) swamps single-map tweaks. Map shape from v18 is good (max map ≤ ~4.6 h); now slowing the economy uniformly ×1.35.
- IN PROGRESS: v21 (v18 shape, rank shards [14,34,54,74,94], credits [700,4k,13.5k,27k,40k]), v22 (= v21 + shop 120 tokens).
- NEXT: apply the winner to live js/data, regen star times + MAPS/ROSTER docs, full `balance.mjs --seeds=1,2,3 --hours=60` (all policies), ECONOMY § Balance status.
- v21/v22 ~10–17 h; v23 = 14.9/19.2/16.4 h (mean 16.8) → **applied v23 to live js/data** (backup of previous files in <scratchpad>/sim3/live_bak), star_times + MAPS/ROSTER/STORY regenerated, tests 23/23, validate 0 errors.
- IN PROGRESS: final all-policy runs per seed (parallel) → <scratchpad>/sim3/final/p{1,2,3}.txt. If cut off: re-launch `node tools/sim/balance.mjs --only=progress --seed=N --hours=60` per seed.
- NEXT: ECONOMY.md (numbers + § Balance status), DESIGN.md check, report.

## sim-3 — final (handed back)
- DONE: final all-policy runs on the live data (<scratchpad>/sim3/final): smart **14.9 / 19.2 / 16.4 h**, all finish; straight walls m4_l9–10 (stalls from m2_l6); naive grinder walls m3_l9–m4_l9 (credit-bound). ECONOMY.md numbers + § Balance status rewritten; README lists curve.mjs. Tests 23/23, validate 0 errors.
- Misses: one map per seed is 3.5–8.9 h (luck-driven: m6 s1, m7 s2); arena+events 56–58% (structural, see ECONOMY).
- NEXT (for a later round): reduce recruit-luck variance in m6–m8 (pity or targeted shards for late epics), then trim m7; ask Aaron whether the 25–40% target should count star replays as grind or whether story fights should get longer.

## sim-4 (round 4) — checkpoint 1
- DONE: dev cheats in js/sim/battle.js: `createBattle({cheats:{invulnerable, oneHit}})` or `player.cheats` (works through
  battle.js and scr_battle's fallback today, both pass `B.player` as `player`). Invulnerable = 0 damage to player units and
  **no timeout loss** (overtime still ramps so the wave ends). oneHit = player damage strips shields and kills. `state.cheats`,
  `result.cheats`. game_state never emits them. README "Dev cheats". Test added (24/24).
- IN PROGRESS: recruit-luck variance in m6–m8.
## sim-4 — checkpoint 2
- DONE: **focus shards** (variance fix candidate): level `rewards.focusShards: n` → game_state gives n shards to the deployed unit
  that still lacks shards for its next rank (highest rank first, then fewest short; skipped when everyone is maxed). maps.js
  spec `focusShards: [normal, elite, boss]` + `focusOnly` (drops the old enemy-unit shards, which in m7/m8 landed on units you
  mostly don't own). validate + SCHEMA + test (25/25). Live data still has it OFF until the variant runs pick numbers.
- IN PROGRESS: smart-policy variants in <scratchpad>/sim4/var/{f1,f2,f3} (mkvar.sh/sum.sh copied from sim3; patches f*.py, lib4.py):
  f1 m7/m8 focus [2,4,8] replace; f2 m6–m8 [3,6,12] (m6 keeps Rift shards); f3 = f2 + contract/arena legendary pity 25.
  Baseline = sim-3 final: smart 14.9/19.2/16.4 h, worst maps m6 5.2 (s1), m7 8.9 (s2), m6/m7 3.5 (s3).
## sim-4 — checkpoint 3
- Round-1 variants (smart, hours per map m1..m8 | total): baseline (sim-3 final) 14.9/19.2/16.4 h.
  f1 (m7/m8 focus [2,4,8] replace): 14.3/16.9/15.3 h, seed 2 m7 still 8.6 h. f2 (m6–m8 [3,6,12]): 13.5/11.1/13.2 h, max map
  4.15 (s1 m6), s2 m7 8.6 → 2.2 h. f3 (= f2 + legendary pity 25): identical to f2 within noise → **pity is not the lever; dropped**.
- IN PROGRESS: g1 (f2 + m5 focus [2,4,8] + m7 lv [46,50] + m8 [49,51]), g2 (… m8 [49,52]), g3 (f2 + m5 focus + rank shards
  [14,34,54,80,110]) in <scratchpad>/sim4/var/g*. `maps.sh var/<v>` prints per-seed map hours.
## sim-4 — checkpoint 4
- Changed: focus shards are now **first clear only** (story replays pay shards at full value → a targeted replay farm would
  beat the shop). `focusShards` in any reward bag is scaled by mult **and floored** (so event diminish caps a daily source);
  plain shards keep the old "never reduced" rule. Seed-1 snapshots: the slow seed is the *lucky* one (4 legendaries at R3,
  L40 cap, 0/74 shards each, no shard source for them). Stuck players get no first clears, so first-clear focus can't unstick them.
- g1–g3 (m5 focus, m7/m8 levels, rank R5 110): totals 10–15 h, seed 1 m5 3.85 unchanged. h1–h3 (first-clear focus m5–m8
  [4,8,16] + trial tiers 4–6 → focusShards 3): seed 1 m5 still 3.9 (trials L40+ unreachable then); h3 (m4 focus + trials from
  tier 5) m5 1.1 h but m6 7.7 h: per-map hours are noisy/chaotic per seed.
- IN PROGRESS: k1 (focus m5–m8 [4,8,16] + every trial tier → focusShards 3), k2 (k1 + m7 [46,50] m8 [49,52]), k3 (trials 4 from tier 3, m8 [49,52]).
## sim-4 — checkpoint 5
- k1–k3 (trial focus on all tiers): seed 2 m6 7.4 h. Snapshot: focus (then "highest rank first") built paladin R5 L60 next to an
  R2/L30 squad. **Target rule changed to fewest-shards-short first** (cheap ranks finish first, squad rises together). Live code has it.
- n1 (= k1 with new rule: first-clear focus m5–m8 [4,8,16], m5/m7/m8 focusOnly, trials all tiers focusShards 3): 12.4/15.9/12.4 h,
  m5/m6 fixed but m7 4.8–5.1 h on s1/s2. Snapshot: arrives in m7 at 5.3 h with HQ 3 and little credit → time to the end is
  income-bound; speeding early maps lengthens late ones. Per-map hours on 3 seeds are noise-dominated.
- IN PROGRESS: base (no focus) seeds 4–6, n1b (n1) seeds 4–6, n4 (n1 + m3 [18,27] m4 [27,35] m8 [49,51]) seeds 1–6, to compare distributions.
## sim-4 — checkpoint 6 (6 seeds per variant now; 3 seeds is noise)
- base (no focus) s1–6 max map 5.2/8.9/3.5/3.9/3.9/2.75, totals mean 15.4. n1 s1–6 max 5.1/4.8/3.1/3.7/3.0/2.6, mean 12.3.
  n4 (n1 + m3 [18,27] m4 [27,35] m8 [49,51]) max 4.4/3.3/3.5/4.0/2.9/3.4 (m8 always the long one), mean 12.7.
- p2 = n4 with m8 back to [48,50], m6 [41,47], rankUp ×1.25 (shards [18,43,68,93,118], credits [900,5k,17k,34k,50k]):
  **max map ≤3.25 on all 6 seeds**, totals 12.0–14.1. p1 (m6 [41,46], ×1.15) had a 7.2 h outlier.
- IN PROGRESS: q1 (p2 with ×1.4 rank), q2 (×1.33) to lift totals to 15+.
