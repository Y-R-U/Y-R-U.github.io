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
