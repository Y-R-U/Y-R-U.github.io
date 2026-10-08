# fp2 — notes (wave 3 helper: Chapter Two Free Play)
Owns ONLY js/levels/freeplay2.js and tools/sim/fp2.mjs. CDP port 9408. Test: ?level=fp2&skip=1&ch2=1.
Run: `node tools/sim/fp2.mjs [--mins=6] [--shots=DIR] [--only=zoomies,carpet] [--nosoak]` (starts/stops its own Chrome).

## DONE
- js/levels/freeplay2.js: Ch2 Free Play on defineLevel2.
  - Director: rolls every 18–34 s (first at 10–16 s); 30% of rolls draw a second event. Contradictory pair rolled
    together → BOTH cancel ("fp2_g_cancel"); an event clashing with a running one → cancelled; actors busy → skipped.
    Exclusions are symmetric (EVENTS[...].excl). Events: tvtime, dinner (steak x2, Ew → leave → eat), soup (splash →
    wipe), delivery (once: delivery man + new TV, old TV on the carpet), mice (triggered by 2 cheeses; queued if
    blocked), disco (Lyman changes in his room, dances, rub legs → furry → changes back), shedding (4 spots, 40% bald
    for 60 s), goodmorning (sit on table → Jon sings → poke → hold-to-glare → 40% group hug), zoomies (Odie laps the
    table then pants on the edge), sill (Odie sits under the vase), brawl (spit-ball while both on the sofa).
  - Always-on tricks: Odie scratch (off the table → land_head + "Naughty Garfield!" chase; window open → splat on the
    wall or out of the window from high up, back via the front door after 20 s), vase on Odie, window open/close (a
    human shuts it after ~55 s), cupboard biscuits + shut Odie in (60 s or door), bedroom/Lyman doors trap humans (60 s
    or door; anyone left inside a shut room later is trapped too; Odie shut upstairs gets out after 60 s), sock drawer
    + socking Odie (Jon chases), whistle (Odie shakes 10 s, whistle tossed and re-findable), drawer → launcher (one
    shot per trip), carpet pull after the delivery (blocked while someone watches telly unless mice), cat bowl / dog
    bowl / plates / soup eating, table warp ("Diet time.") when Garfield reaches the table middle while someone sits.
  - Jon/Lyman day: wander / sofa (Lyman sometimes coffee) / coffee at the table / own room / armchair.
  - Odie day: bowl / sill / sofa foot / table edge / roam / follow Garfield / old TV / upstairs.
  - Watchdogs (logged in L.fp.watchdog): humans in transit >40 s, 'off' >6 s, outside the house; Odie in walls.
  - Test hooks: `__game.ctx.L.fp.api` {start, end, roll(a,b), can, act(who,name), odieGo, director(on), excl}.
  - Lines: FP2_LINES (≈75 new fp2_* lines) inside freeplay2.js; bark() prefers lines.js/manifest, else subtitle only.

- tools/sim/fp2.mjs: 18 directed checks + 6-min random soak → FP2: 48/48 PASS (run 6). Soak: 9 event starts,
  6 pair/clash cancels, 6 knockouts, 0 watchdogs, 117 barks (71 distinct), no exclusive overlap, no frozen actors.
- Ch1 untouched: ?level=1 and ?level=fp1 boot to play, no errors.

## NEXT / ideas
- Real-input playtest (all checks teleport + real key presses).

## REQUESTS — all DONE (game merged lines + fixed humanAI; media voicing the 83 fp2_* keys)
- Merge FP2_LINES (exported from js/levels/freeplay2.js) into js/game/lines.js so media can voice them.
- humanAI: cancelTask()/setOff() leaves ai.taskName stale (task already nulled, so the .then never clears it) — I work
  around it with h.busy(). And when nav.path returns null (closed door) setGoal falls back to a straight line, so a
  human can walk through a closed door (fp2 traps anyone left inside a shut room to avoid it).
