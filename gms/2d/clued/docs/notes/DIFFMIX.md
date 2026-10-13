# DIFFMIX: blended round difficulty (2026-10-13)

Aaron: an Easy/Medium/Hard round should have some texture instead of being one level. Per 10 questions:
Easy 6/3/1, Medium 2/6/2, Hard 1/3/6 (easy/medium/hard). Mixed (0) is unchanged.

## Where
- `js/core/diffmix.js`: `BLEND`, `BLEND_NOTE` (setup text), `blendOn`, `blendCounts`, `levelOf`, `levelMap`, `pickBlend`.
- `js/core/spec.js` `buildQuestions` → `blendRound` for every format that takes `difficulty` (one place). The old path is
  untouched and still runs whenever the blend is off.
- `js/core/localgeo.js` `homeQuestions` tags `q.lv` with the in-country rating (eased for "I live here").
- Setup screen (`js/ui/setup.js`, `.diff-note` in css/screens.css): one line under the difficulty chips,
  "ⓘ Mostly easy, with a few medium and one hard" (one line on a 384 px phone).

## When it applies (`blendOn`)
`spec.blend === 1` (makeSpec sets it on every new spec except the daily) and round difficulty 1–3, and not: kids
(spec/round/opts), the Ladder (`structure: 'ladder'`, its 1→2→3 stages stay pure), the daily. Specs made before the
blend (old link challenges, saved specs) have no `blend`, so they rebuild exactly as before. Rooms ship questions.
The pub quiz's Hard "final" and the suggested sets' medium map round DO blend.

## Rounding
`blendCounts(count, d)`: largest remainder of count × weights/10; a tie goes to the level nearest the round's own
difficulty (Medium ties go easy). 5 → Easy 3/2/0, Medium 1/3/1, Hard 0/2/3; 20 → doubled; 15 → 9/5/1, 3/9/3, 1/5/9.
So 5-question Easy rounds have no hard one (chosen to keep a short Easy round honest).

## How a round is built
1. Generate each level on its own rng stream (`seed:i:format:L1..3`), about `pool × weight + 2` each; a level whose
   band is diluted (e.g. hard map band = levels 3+2) gets one 3× second pass (`:L3+`).
2. Rate every question by its REAL level (`levelOf`): map formats by `countryLevel`/`stateDifficulty`, pack formats by
   `refs[0]`'s item/question difficulty (after LOCAL's easeView), in-country questions by their rating, else the level
   asked for. Stored as `q.lv`.
3. Dedupe (id, dupKey, the game's earlier rounds). FRESH ranks unseen first within each level.
4. `pickBlend`: LOCAL share first (it beat level before too): local picks split across levels like the round, unseen
   local at any level before seen local, short levels borrow the nearest level. Normal questions fill each level's room,
   the round's level first; a short level borrows from the nearest level (normal, then local). Never short.
5. Shuffle (`seed:i:format:blend`); an Easy round never opens on a hard question. Spares = leftovers nearest the
   round's level first, capped at the old spare count.
spec.fresh replays: same pools + same tokens → identical set (tested, plain and with LOCAL).

## Measured (`node tools/diffmix_report.mjs [seeds]`, ~20 s)
All themes, 10 per round × 50 seeds: mc, tf, type, number, map-click tap, map-click name, listen all hit
6/3/1, 2/6/2, 1/3/6 in 100% of rounds.

Packs that can't honour Hard on their own (single-pack mc round, % e/m/h):
birds 10/90/0 (no hard items), mammals 10/82/8, sea 10/56/34, flowers 10/55/35, screen-themes 10/90/0,
music-artists 10/90/0 (MUSIC), pd-melodies 20/80/0 (also can't honour Easy: 40/60/0), kids 10/90/0,
kids-film-tv / kids-nature / nursery-rhymes 100/0/0 (all easy). Hard falls back to medium (the nearest level), then easy.

With LOCAL on, the share wins over the blend: AUS "Most" + I live here, Hard round → local items are mostly eased,
so the mix leans easier. "More" stays within ±1 per level.

## Also (manager add-on)
`kidsOk` (spec.js) now rejects anything with `kids: false` or `facts.kids: false`, whatever its difficulty (MUSIC's
explicit songs). Side effect: 20 difficulty-1 movie-moments items flagged kids:false left kids mode.

## Tests
- `node tools/diffmix_test.mjs` (~10 s, 699 checks): counts for 1–40 × 3, synthetic pickBlend (nearest borrowing,
  tiny pool, local split, local beats blend), real builds of 7 formats × 3 levels × 3 seeds (full, exact mix,
  deterministic, no hard opener, no-blend spec = old path), pub quiz at 5/7/20 never shorter than pure, kids/party-kids/
  ladder/daily/Mixed unchanged, FRESH avoid + blend + spec.fresh replay (plain, AUS, USA), LOCAL shares 5 settings × 3
  levels, kids:false. Falsified: removing nearest borrowing, blending kids, the hard-opener swap, ignoring spec.fresh,
  the kids:false rule each fail it.
- `CDP_PORT=9610 node tools/diffmix_e2e.mjs OUT [portrait|landscape]`: ⓘ line per chip, layout, an Easy solo game
  plays 6/3/1 and doesn't open hard.
- Adjusted: suggest_test's easy map pool check and fresh_test's exhausted-geo check now build pure specs
  (`delete spec.blend`); they test the pool / FRESH ordering, which the blend widens.

## Open
- p2p_e2e q3/q4 "early reveal" fails 2/43 with DIFFMIX disabled too (pre-existing, rooms there use Mixed).
- Possible later: the runner could prefer a spare of the same `lv` when replacing a failed question.
