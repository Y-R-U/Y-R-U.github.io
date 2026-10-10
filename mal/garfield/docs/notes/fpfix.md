# fpfix — notes (fp2 --nosoak flake hunt). Port 9408.
Owns js/levels/freeplay2.js, js/game/*, js/levels/ch2/common2.js, tools/sim/fp2.mjs. Originals backed up in scratchpad fpfix/.

## DONE
- run1 baseline: 44/46, FAIL soup splash + soup end. Suspect: test teleports to soupBowl+0.3z = (4.4, 8.88), 8 cm from
  the table middle (8.8) → 60% "Diet time" table-warp cutscene (controller locked → onTable() false → splash disabled).
- runs 2,3 (soup fix + isolate) 46/46. Loaded run (8x `yes` burners): FAIL Lyman 60 s — log showed Lyman trapped
  behind JON's bedroom door at t 32.9 while in his own room: l08 insideRoom() half-space test covers Lyman's room
  (REAL bug, fixed in fp2 door table). Test also took the FIRST lyman free event (fixed: event after the trap).
- REAL: Odie's 60 s self-escape / a human's self-escape opened the door but left others behind it 'trapped' → now freed.
- loaded runs 2,3 46/46. Added: soup event capped at splash+30 s (interrupted wipe no longer re-seats Jon at a spilt
  bowl for up to 90 s); sock test retries the 25% no-show (6 tries, waits on fpSockWalk not a fixed 25 s).
- VERIFIED: 3 consecutive unloaded --nosoak 46/46; full run + 6-min soak 50/50 (0 watchdogs); play.mjs fp1 PASS,
  c2:1-10 10/10 PASS, arena (c2:7, c2:7lose, arena) PASS. Chrome 9408 stopped.
## IN PROGRESS
- nothing
## REQUESTS (not my files)
- js/levels/ch2/c2_06.js:62 uses l08 insideRoom() for "in Jon's room" — it is also true inside Lyman's room
  (same half-space bug). Add `&& !(p.y > 2.5 && p.z > 7.05)` there, or fix insideRoom in l08.js (Ch1 owner).
