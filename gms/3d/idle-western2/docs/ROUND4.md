# Round 4: art quality (manager, 2026-10-04)

Input: the blind critic r3 (`docs/art/critic/r3/REPORT.md`). Game about 2.5–4.5 against refs about 8.5–9.

Its main complaints:
- crowd soup with no hero vignette;
- peg characters without arms or hands;
- dead pale sky;
- flat vertex-colour materials;
- night bloom blowing out characters;
- unreadable construction;
- toasts in the centre of the screen.

Verify with real-game captures (`tools/camshot.mjs`, `tools/cdp.mjs` cardShot). Every lane keeps test-scroll, test-cards and test-boot green.

| Lane | Port | Scope |
|---|---|---|
| **A** | 9331 | 1. **Crowd:** cut the visible town crowd by 60–70% (it is also a perf win). Leave open dirt around the staged gags. 2. **Characters:** visible arms with mitten hands and boots in the lite rig. Chunkier body under the big head. A soft clay rim/wrap term in the shader. Acting poses. 3. **Sky:** a sunset gradient sky (golden as the default) with distance layers (mesas, water tower, windmill, saguaro silhouettes) and atmospheric haze. The mesas and sky must also show in **cards** (P asked for this). 4. **Ground:** ruts, footprints, pebbles, grass tufts and rocks along building edges, with blob AO under every character and prop. 5. **Night:** clamp bloom to emissive-only and never on characters; amber lantern pools; violet ambient; no grey-white wash. 6. **Facades:** darker trim, AO under eaves and in porch corners, worn plank edges. |
| **P** | 9341 | 1. **Saloon:** a deep porch with posts and overhang, a glowing interior card, lanterns on posts, and a barrel/crate pyramid. Move the black carriage away from the doors. The ejection gag is the showpiece of the card. 2. **Construction**, as chunky readable stages: deck platform → framed walls with cross-bracing → ladder → false front. Chunky beams, no thin sticks. Remove the white box and anything floating. Give each worker a job and a prop (plank carrier, hammerer, foreman with blueprint, sawhorse, toolbox, mule cart), spaced out. 3. **Cards:** a foreground framing element (cactus, fence post or barrel) with the existing tilt-shift blur. 4. **Character separation:** no merged clumps of hats in card crowds. |
| **S** | 9351 | 1. **Hero vignette:** a 2–3 character staged gag with open dirt around it (coordinate with A's crowd cut). The ejection with its dust puff at the saloon is the hero showpiece, and the duel standoff is a second staging. 2. **Character poses:** characters in spectacle use strong acting poses (A's new rig). |
| **U** | 9361 | 1. **Toasts:** keep toasts, banners and achievement chips out of the central 50% of the hero (edges or under the HUD); stack them, and keep them short. 2. **Small items:** check `CONTRACT.md` for open U requests. |
