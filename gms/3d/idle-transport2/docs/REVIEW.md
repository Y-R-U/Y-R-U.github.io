# Business scene expansion review — 2026-10-03

Implementation was split across scenery, economy and interface agents. Independent reviews crossed ownership: interface audited economy/save/bulk boundaries; economy audited scene phases/recovery; scenery inspected real narrow-browser interaction and scene visibility. Root integrated and exercised end-to-end touch, GPU loss and lifecycle sequences.

Fixed findings:
- Short away intervals formerly extended seasonal challenge time. All positive consumed away intervals now expire the challenge clock, without producing seasonal income.
- Repeated suspension events could overwrite the save timestamp and lose part of offline earnings. App saves only at first suspension, resumes once when visible, and clears the interval before granting income.
- Failed localStorage writes were shown as saved. Availability follows actual successful writes; failures warn once and a later successful write recovers the state.
- Equipment import could reserve an over-capacity discarded tool. Capacity is checked before uniqueness is consumed.
- Cargo popped back in during the return journey, and parked trucks spun wheels/kicked dust. Cargo now fills only during loading and is absent on return; movement effects follow fleet-specific motion phases.
- Loading chute originally followed only the leader despite more fleet trucks. It now responds to any loading truck. Visual stock drains during loading and fills while away.
- Overlay cards and bulk controls hid production. Name badges and quantity visuals are smaller, production staging is framed above the controls, storage growth is bounded, and mobile toasts are limited.

Verification passed: economy migration/pricing/season/equipment/audit suite;28 existing gameplay checks;10 touch checks;9 expansion flow checks;6 recovery/lifecycle checks;3 portrait sizes320/390/430. Ten fresh/regional captures had no console errors. Controls retain44px hit regions. Narrow320x740 still displays2 complete active rows at the top and3 after folding.

Recovery verification includes three real forced GPU-loss/restoration cycles, retained colored2D snapshots, browser freeze/active foreground return, repeated pagehide/pageshow events, once-only60second manager credit, challenge countdown, and resizing after recovery. These are Chrome checks, not physical iPhone/Safari evidence.

Boundaries: reserve fill is visual staging linked to real delivery progress, rather than a separately simulated resource bottleneck. Character bonuses cover Idle Transport2 main/seasonal businesses, not unrelated Y-R-U projects. Halloween is the first three-business seasonal challenge; practice remains available year-round and shares once-only rewards with its calendar window.

## Connected district correction

The scene agent built one central-depot district, the interface agent added overview/tour/pin framing, and the economy agent independently reviewed physical traffic and resource lifetime. Root verifies object identity and actual motion rather than trusting scene labels.

Fixed findings: Catmull curves formerly cut backwards across arterial segments; exact forward ring arcs now join tangent-guided business/depot connectors. Fleets have distinct loading bays and depot slots clear of the road. Three one-way lanes distribute routes. Instanced vehicle parts limit draw calls; rebuilding districts disposes private meshes, lane geometry, signs and shadows. Starter sites are balanced around the depot, overview avoids excessive empty terrain, and pinned cameras move closer. Closed businesses hide production goods and dust.

The district regression samples every one of 105 vehicle paths across all fifteen businesses, checks continuity and world-space forward motion, verifies unique depot bays, and confirms every row uses the same physical scene/site/vehicle identity as the hero. It passed 13 checks with no browser errors. Paths are synchronized animations from game progress, not collision-aware traffic AI.

## Idle Life 2 comparison and challenge — 2026-10-04

Life won the original comparison through inhabited spaces, detailed forms/surfaces and close framing. Transport's coherent physical freight network was its strongest distinction. Root directed an art/UI upgrade plus optional live priority jobs, with independent economy critique and repeated actual high-DPR phone-sized captures.

Adversarial findings fixed: new batching hid its cached source meshes on subsequent region rebuilds; sources now rehydrate and tests assert exact static instance counts. Gabled depot multi-material arrays exposed a disposal bug; cleanup handles arrays and protects shared procedural textures. Looking at road ahead of a fast truck combined with slow aim damping could lose the featured vehicle; closer aim/faster look damping and projected-truck tests now verify framing. Job detail dialogs hid the loading control, so the same action appears within details. Small bulk buttons now separate price from quantity using corner badges.

Final starter GPU draw calls458 versus606 baseline; all-network929, resource counts stable through three complete region churn cycles. Actual Mac Chrome paints remain near30/sec; rAF cadence is not GPU cost and cannot establish Samsung performance. Existing economy/recovery/district tests and new freight/camera tests pass. No traffic collision simulation or separately conserved cargo inventory is claimed. Life still has richer character/world storytelling; Transport now has a stronger crafted logistics identity and meaningful active transport jobs.
