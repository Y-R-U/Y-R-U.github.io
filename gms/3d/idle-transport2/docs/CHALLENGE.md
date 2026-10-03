# Transport visual and game-feel challenge — 2026-10-04

Status: implementation complete; final review and authorized Pages release checkpoint. User asked to compare Idle Life 2 and substantially improve Transport 2 to challenge its results. Publication remains authorized from earlier requests. Last transport release 684ad2dc. Preserve all unrelated files, especially the active Idle Life 2 project.

Observed in actual fresh 412x915 Chrome and published Life screenshot: Life has better close framing, warm detailed materials, articulated buildings, people, attractive surfaces, and progression that feels personal. Transport has functioning one-world transport but distant framing, broad flat olive ground and raw box buildings. Improving visual quality is the primary scope; extra menu features are insufficient.

Direction: a premium miniature logistics district, cream/terracotta depot and shaped industrial buildings, teal/copper fleet, rich fields/yards, workers and support props, textured but calm terrain, neutral roads with curb/landscape detail, warm light and grounded shadows. Keep Transport's own management identity and compact phone layout.

Ownership:
- scenery agent: js/scenes.mjs, optional new render/art.mjs, docs/SCENES.md. Shared physical district/road/camera identity, recovery and deterministic traffic APIs preserved.
- interface agent: index.html, style.css, js/app.mjs, docs/UI.md. Polish theme and compact controls; contextual startup hint; bounded delivery/upgrade feedback. No scene/economy edits.
- economy agent: independent assessment and one bounded transport-specific gameplay proposal; separate module/test if approved.
- root: integration, root-owned feature wiring coordination, adversarial cross-review, syntax/economy/gameplay/mobile/lifecycle/district tests, final visual inspection, scoped commit/Pages/live verification.

Hard constraints: one physical THREE.Scene per listed district, central depot and one-way arterial; row and hero use identical sites/trucks; one offscreen renderer; no black frames after mobile foreground/GPU recovery; no unrelated changes; existing saves preserved; first company starts closed/$0; scene taps earn, controls/swipes do not; 44px touch regions; 2 rows full at top and 3 after collapse at 320/390/430. Physical Samsung/Safari remains unverified unless user tests it.

Baseline captures: /tmp/idle-life2-comparison.png and /tmp/idle-transport2-comparison.png. Existing docs/verification captures are previous release baseline until replaced by final run.

Resume: inspect git status and agent checkpoint docs before restarting. Recreate missing agents by ownership above. Do not redo passing checks without a source change or unresolved issue. Run browser suites outside restricted sandbox, serve established port8888. Never manipulate user's browser or other agents' Chrome profiles; use unique test profiles.

Approved gameplay scope: optional Priority Freight job, targeted business, three LIVE deliveries plus one manual priority load during loading; deadline45–180s tied to route duration. First3 completed jobs earn three unique permanent tools (business/manager/character), subsequent jobs give bounded cash. No entry fee/failure penalty. Offline never advances job progress; wall-clock expiry, idempotent claims, sanitized save/import/prestige. Economy agent owns economy.mjs + freight.mjs + freight-test; interface owns UI wiring. Scenery adds one physical target marker. Existing policy rates unchanged in this release.

Root tap refinement: fast nearby taps combine their financial float instead of creating unreadable overlapping text; floating nodes and ripples have tight caps. Removed forced layout from tap feedback. Scene-wide gesture/control exclusion and actual earning unchanged.

Final implementation: art2/optimization/cinematic rounds complete. Main/rows retain one district; pooled color/static/moving meshes lowered comparable starter calls606→458 despite added detail. Five graphics checks cover resources, high-DPR backing budget, projected truck following and reduced motion. UI feedback and real freight flow pass all existing/new suites. Found and fixed static-batch source rehydration, depot multi-material disposal/shared texture ownership, freight modal loading access, and camera lookahead/lag losing its subject. No ongoing source edits after final freeze. Physical phone results await owner/device verification.

Final portrait review caught an intrinsic grid-width overflow at320px that clipped manager/MAX/pin controls despite nominal44px dimensions. Shrinkable grid tracks now keep all cards within the scroller; strengthened expansion regression checks every button's complete bounds inside its card at320/390/430. Layout, expansion, freight interaction and tap suites passed after this fix. Corrected compact captures and a new actual-game project preview are included.

Release cache version20261004-miniature1; all relative runtime imports and HTML assets share it. Root performs scoped commit/push, exact Pages run monitoring, public asset hashes and live browser smoke before completion. Idle Life 2 remains ahead in character/emotional-world detail; this release gives Transport a clearer miniature industrial identity and a real hands-on freight loop without copying its life systems.
