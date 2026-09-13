# NINE STRINGS — Decisions

Numbered so they can be cited and so they are not silently re-litigated.

**D1 — WebGL2, not Canvas2D.** 400 enemies plus 3000 additive particles at DPR2
is not a Canvas2D workload. A single-atlas batcher is ~400 lines and buys the
"looks amazing" budget outright. No fallback renderer: WebGL2 is present on
every phone this game targets, and a second renderer is a second set of bugs.

**D2 — Procedural sprite atlas, not generated sprite PNGs.** Flux cannot hold a
character consistent across a walk cycle at 32px, and a folder of sprites is
bytes, pop-in and rot. A parametric humanoid rig baked into one 2048² atlas at
boot gives unlimited variants, real animation, perfect readability, and zero
download. Flux is used where it is genuinely better: portraits, backdrops,
title, story panels — none of which are in a frame budget.

**D3 — Fixed 60Hz sim step.** Balance must be reproducible headless. Variable
dt makes the node harness a liar.

**D4 — `world.events` is the only sim→host channel.** Keeps `js/sim/**`
node-runnable, which is what makes the balance harness possible at all.

**D5 — DOM menus, canvas HUD.** Crisp text at any DPR, real safe-area handling,
and no bitmap-font layout misery for paragraphs. The HUD stays on canvas
because it must sit inside the post-processing.

**D6 — Procedural audio, no files.** Zero bytes, no licensing, no pop-in, and
music that can actually react to threat instead of crossfading clips.

**D7 — 420 world units of visible width on every device.** Portrait phones vary
enormously in aspect; if the visible play area changes, the balance is not
portable and the same stage is a different game on a tablet.

**D8 — Short opening runs (8 min), long late runs (20 min).** The genre's usual
20-minute first run is a bad trade on a phone. Earn the player's time.

**D9 — Nothing in the UI before it is earned.** The Sanctum, relics, sigils and
curse tiers do not exist on screen until the ladder in DESIGN §4 unlocks them.

**D10 — The sever hit test and the drawn curve share `stringPoints()`.** If the
thread you can see is not the thread you can cut, the core mechanic is a lie.
