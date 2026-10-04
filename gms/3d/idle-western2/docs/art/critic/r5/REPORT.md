# Blind critic r5
Game scores: day 4, night 4.5, saloon card 4.5, build card 4. Average about 4.25, flat since r4. The plateau is caused by concrete, fixable blockers.

**The game's specific problems:**
1. Dust puffs are opaque cream spheres that read as "cotton balls / bread rolls / tumours" and smother the focal gag in the hero and the saloon card. They need soft alpha billboard sprites that spread and fade.
2. The saloon-card ejection actor at 1.45× is a huge lumpy blob that covers the doors. Make it smaller, cleanly silhouetted, and away from other characters.
3. Skin still reads as orange-red sunburn. Target peach.
4. A big character at night looks translucent and ghosted (check opacity/depthWrite, or the ghost material leaking).
5. The foreground cactus is huge and smooth and covers about 15% of the card. Make it smaller and darker/blurred, at the frame edge.
6. The ground shows visible hex tiling. Break it up with larger-scale variation.
7. Red rock chunks at the build site read as gems or meat. Swap them for sawdust, offcuts and planks.
8. Night lamp pools read as smeared fog. They need crisp, warm pools on boards and the nearby walls.
9. Wood still needs bevels, seams and roof shingles. Light the saloon interior.
