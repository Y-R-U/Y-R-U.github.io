# Round 5: art polish plus a draw trim (manager)

Input: `docs/art/critic/r4/REPORT.md`. Desktop is at 246/250 draws, with the hero at 154, so it must come down to ≤ 200 with headroom.

| Lane | Port | Scope |
|---|---|---|
| **A** | 9331 | **Light and haze:** critic fix 1 (low key light, long dark shadows, rim/fresnel on characters and props, much less haze and fog wash). **Night:** fix 2, together with the bloom settings; kill the floating orbs. **Faces:** fix 3 (eye whites and pupils, brows, a less orange and less saturated skin tone). **Wood:** fix 5 (plank seams and grain via procedural detail in the uber shader, hoop and bottle spec). **Backdrop:** fix 7 (sun disc, cloud bands, warm-lit mesa faces). **Draws:** trim hero draw calls by ≥ 40 (merge static town chunks, batch signs and bulbs, instance props) while keeping card culling working. |
| **P** | 9341 | **Build card:** fix 6 (lower pitch with the horizon about 1/3 down, less empty sand, actors spread out, lumber stacks, sawhorse, toolbox, water tower in the background). **Saloon card:** fix 4 (the ejected cowboy scaled up and centred, with a bigger dust burst and squash/stretch). **Foreground:** fix 8 (a round ribbed foreground cactus with arms, denser porch clutter). Trim plot draws where you can. |
| **S** | 9351 | **Hero gags:** fix 4 (scale the focal vignette actors up, centre the gag, add squash/stretch on the impacts). Townsfolk near the camera face it 3/4. |
