# Content / progression status

- Contract read: `AGENTS.md` and `docs/PLAN.md`.
- Complete: six-chapter radio story (June's trapped spirit, rescue, reversal of demon broadcast, release and sunrise), eight weapons with distinct evolutions, six passives, three survivors, four five-rank relics.
- Owned files: `content.mjs`, `progression.mjs`, `tests/progression.test.mjs`, this file.
- Engine notified of evolution pairing and optional survivor bonuses. Inventory cap: four weapons and four passives. Ready evolutions get a guaranteed draft slot.
- Complete: defensive versioned localStorage handling (`hellwake-v1`), bounded recognized data, corruption/storage-denial fallback, increasing relic prices, replay-safe unlocks and campaign/endless stats. Storage failure returns false to retain in-memory gameplay.
- Interface additions: `SAVE_KEY`, `validateSave` from progression; `MAX_WEAPONS`, `MAX_PASSIVES`, `relicCost(relic, level)` from content. All required exports match PLAN.
- Root notified: `getDraft` has a single healing choice when every legal build choice is maxed. Render variable draft counts. `endingSeen` is acknowledged by UI after ending presentation, never automatically by `recordRun`.
- Verification: `node --test tests/progression.test.mjs` passes all 10 tests. Covers complete campaign progression, replays, failures/endless, save corruption and denial, exact increasing purchase costs/caps, starting drafts, inventory caps, evolution gating/guarantee and maxed healing.
- Engine notified of all bonus values. Weapon prose aligned with implemented frost field, drone bolts, healing/execute scythe and explosive pistol.
- Remaining: root browser verification and integration; no known content/progression blockers.

## Read-only integration review

- Reviewed `main.mjs` and current engine against content/progression. Root files unchanged.
- Reported high-priority Escape dismissal bug: results/ending overlays can be closed while the page beneath stays hidden, stranding the user.
- Reported replay mismatch: arsenal unlock display follows saved highest chapter, but weapon drafts follow current chapter. Suggested a separate highest-unlocked field for drafts.
- Reported final-outro recovery gap: completed chapter six saves before the ending, but `endingSeen` is not read to offer recovery after a reload.
- Purchases use exact increasing costs; relic/passive bonuses align with engine; retry resets one-result guard; abandon preserves earned embers; normal victory/outro/refuge routes are consistent.
- Root owns fixes and browser verification for these findings.

## Replay arsenal fix

- Root authorized content fix: weapon eligibility now uses `run.arsenalChapter ?? run.chapter`; tutorial guidance still uses actual `run.chapter`.
- Engine adds `state.arsenalChapter` from constructor `unlockedChapter`, which root supplies from save.
- Added regression covering all eight permanent weapon unlocks during chapter-one replay and unchanged initial starter guidance.
- Verification: `node --test tests/progression.test.mjs` passes all 11 tests after this fix.
