# Economy implementation checkpoint

Status: COMPLETE. Owner: economy agent. Run `node tools/economy-test.mjs` from the game folder. No dependencies or build step.

## Gameplay

15 distinct routes in Meadow County, Ironworks Basin, Sapphire Coast, Alpine Frontier and Orbital Gateway. Fresh company starts at $0 with every route closed. Work action earns $5 per tap before ownership; twelve taps fund the $60 grain permit. Once purchased, grain travels in 8 seconds and pays $18 unattended. Work subsequently earns max($5, half a second of current network income). No work cooldown so touch input remains responsive. Meadow unlocks the first contract reward after five deliveries. Version 1 existing saves retain their actual purchased grain status; missing or false unlocked fields stay closed. Each route has 200 upgrade levels and up to 30 vehicles; fares compound 12% per level, upgrade costs 28% per level. Fleet adds parallel cargo capacity, route upgrades also shorten journey times. Region permits need preceding region, cash and completed deliveries; later gates intentionally take longer: 30 / 180 / 900 / 4,000 deliveries and $3,600 / $120,000 / $80M / $12B.

Routes travel automatically from the start. Unmanaged routes receive 45% of full fare. Dispatch advances progress by 30% and makes the next delivery earn full fare; 1.5-second simulation cooldown. Managers earn full fares automatically and while the game is closed. Predictive loading research raises unmanaged fare to 70%. Each route shares one progress field for hero and row renderers.

Eight research upgrades: routing, cargo, fleet, contracts, engines, nightshift, automation, orbital. Eleven milestone contracts are claimed once per company. Prestige available after $2M earned and four regions open; resets the company and awards floor(sqrt(totalEarned / $2M)) reputation, minimum one. Each point permanently adds 15% to fares; settings preserved, contracts repeat in new company.

## Additional API

Exports `SAVE_KEY`, `CONTRACTS` in addition to module contract. `game.contractStatus(id)` returns current,target,complete,claimed,reward. `game.prestigeInfo()` returns available,reward,requirement,progress. `game.offlineReport` reports seconds,cash,deliveries. `game.resumeAway(seconds)` credits manager-only income for a live page returning from background suspension, caps at four/eight hours, emits offline and saves immediately. Crediting is bounded to real elapsed time since lastSaved, so repeated calls do not pay twice. `game.persistenceAvailable` indicates a browser storage object exists. `stats(id)` adds fullPayout,automaticRate,dispatchReady. `action('quality','high'|'medium'|'low')` and `action('sound')` persist settings.

`createGame({storage,now,random})` optionally accepts injected storage, milliseconds clock and random generator for tests. The public no-argument signature remains unchanged.

## Persistence and validation

Save key idle-transport2-v1, version 1 JSON. Autosaves every 12 simulated seconds and after successful actions. Local storage errors return false from save and emit warning; import validates before replacing current company. Invalid/nonfinite/negative balances rejected, progression fields bounded (level 200, fleet 30, progress <1), region unlocks normalized to contiguous prefix, research dependencies enforced, unknown ids dropped, unknown quality rejected to high default, future save timestamps clamped. Import length capped at 100KB. Offline managed income capped at four hours, eight with Night Shift; immediately saves credited state to prevent repeated reload credits. Imported saves do not grant offline rewards.

## Validation

Node suite passes: automatic travel/progress, dispatch cooldown and full fare, rejected unaffordable purchases, contract single claim, region prerequisites and delivery gates, research effects, prestige reset/preserved settings, valid save roundtrip, malformed save rejection, bounded input normalization, managed-only offline income, four/eight-hour caps and no double reload income. No browser code needed in economy module.

Resume: economy complete; root/interface can integrate directly. Do not overwrite js/app.mjs or js/scenes.mjs owned by other agents.

## Pacing benchmark

`node tools/economy-pacing.mjs`: automated policy claims contracts, purchases permits/routes/managers/research, upgrades each route to level 25 and fleet 5, with no dispatch. Ironworks 3.9 minutes; Coast 8.9; Alpine 19.0; Gateway 58.0; all 15 routes 87.8. Later cash and delivery gates both matter: Gateway leaves ~$673M after its $12B permit; first airport route costs $3B, grows the active network within a few minutes. Prestige becomes available at Alpine; an earlier reset helps the next company. This is an optimistic automated benchmark, not measured human play. Contract rewards and manual dispatch make early play quicker.

## Random opportunities and latest checkpoint

COMPLETE after prepublication steering. State event is null or {id,kind,title,description,reward,remaining}; action claimEvent pays once then clears it. First opportunity appears after 45 simulated seconds of company ownership, later ones every random 80–140 seconds. Rush, backhaul and supply offers have 25-second claim windows; bonuses scale from minimum $80 with network income. No negative costs, no forced choice, no events generated from offline advance. Research, contracts and prestige still work; prestige restarts at zero with no owned routes. Event fields are sanitized on import. Tests cover work bootstrap, no initial idle income, existing-save closed/purchased route preservation, deterministic injected opportunities, expiry, repeated claim rejection and offline exclusion. Updated automated no-work-after-bootstrap benchmark: region times 4.0 / 8.7 / 19.1 / 58.0 minutes; every route 87.8. This benchmark ignores optional event claims and manual dispatch.
