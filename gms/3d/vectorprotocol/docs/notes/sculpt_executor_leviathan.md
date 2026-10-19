# sculptor-15 — EXECUTOR + LEVIATHAN (map 8 core legendaries)

Owns: `js/actors/models/executor.js`, `js/actors/models/leviathan.js`, `js/fx/units/executor.js`, `js/fx/units/leviathan.js`, this file,
one line per unit in `js/actors/models/index.js` + `js/fx/units/index.js`.
Scratch: `/private/tmp/claude-501/-Users-aaronair-cc-airon/9f0adda7-8cfb-4e58-acf3-950485f78a19/scratchpad/s15/` (working copies
`executor.js`, `leviathan.js`, `fx_executor.js`, `fx_leviathan.js`: `node --check`, then copy into the tree; `shot.mjs`, `v3.sh out model "" dist`
= front / 3/4 / side / back-high, `sheet.sh` contact sheets, `od.mjs` frames after a named unit's overdrive, `tile.py`). CDP port 9426.
Best screenshots: scratch `best/` (executor_views, leviathan_views, *_ranks, battle_both, executor_termination_order,
leviathan_abyssal_grip, executor_sheet_a/b, leviathan_sheet_a).

## Checkpoint 2 (end of this run)
DONE
- Both models + FX files built and registered. testAll: 0 fails (whole roster).
- Stats (high; dc includes kit motes R2+ and aura R4+):

| unit | R0 | R1 | R2 | R3 (default) | R4 | R5 | low R3 |
|---|---|---|---|---|---|---|---|
| executor | 5 / 17.3k | 5 / 17.3k | 6 / 17.8k | 7 / 18.1k | 8 / 18.7k | 8 / 19.4k | 6 / 8.7k |
| leviathan | 6 / 15.8k | 6 / 16.6k | 7 / 17.1k | 7 / 18.0k | 8 / 18.9k | 8 / 22.4k | 6 / 5.9k |

- EXECUTOR (L, 1.98 m, biped): pearl-white tailored armour (jacket halves in a deep V, gold-piped lapels, black shirt, gold tie with a
  cyan pin, high black collar), domed pauldrons with gold rings, slicked-back crest helm, GOLD MONOCLE (glow lens, chain, `monocle` socket),
  long slim custom legs with pointed black shoes, split coat tails on aux2/aux3 (flare/sway in post), railcannon on a boom (aux0 behind
  the right shoulder: stowed angled up, swings level to fire; pitch/yaw are pose channels so anims blend), wrist pistol on the left
  forearm (`pistol` socket). Ranks: R0 short coat/bare cannon, R1 rail fins, R2 3rd shoulder lame + collar fins + cannon shroud,
  R3 coils/monocle/tie pin lit, R4 gold glowing coat edges + cannon side fins + pauldron fins, R5 orbiting holo-contract ring (aux1).
  Anims (all bespoke): idle (hand behind back, tie straighten every 9 s), advance, attack (cannon levels, fire 0.32), attack_alt
  (duelist side-on wrist pistol double tap, fire 0.3/0.42), cast (monocle scan), overdrive (plant, tick unfolds + raises the cannon,
  fire 0.25/0.32/0.39 tracking 3 targets, then straightens tie), hit, die (topples, cannon droops), victory (courtly bow), deploy.
- LEVIATHAN (XL, 2.45 m, hover): violet mantle tilted back under alternating gold / violet isopod carapace bands with nacre edges, two
  big gold fins at the top (aux2/aux3, flap in post), nacre dorsal ridge, brass portholes, front face (cyan eye cluster in gold
  bezels, violet lantern, gold mandibles), angler lure (aux1), draped anchor chain, hover emitter ring, 4 articulated cable tentacles
  (arms = gold grapple hooks, legs = gold anchors; sockets muzzle/muzzleL/anchorL/anchorR) + rear cable skirt (aux0). Ranks: R0 fewer
  bands + cracked right fin, R2 ridge spines/porthole bezels/nacre clamps, R3 spot rows + glowing tips + lit lure, R4 6-cable skirt +
  side cables + fin edge lights, R5 glow rings on every cable + harder ripple + nacre halo crown.
  Anims (all bespoke): idle (bob + travelling cable ripple), advance (swim, cables streaming), attack (right grapple rears and whips,
  impact 0.42), attack_alt (cross double lash 0.4/0.56), cast (umbrella flare), overdrive (rear up, umbrella, all cables shoot forward
  at 0.25 = 0.6 s release, squeeze, crush 0.5), hit, die (sinks onto the plate, rolls, cables limp), victory, deploy (cables stream up
  during the drop, splay on land).
- FX executor: rail shot (accelerator rings, gold vent jets, rail + gold slug), pistol second tap via shot(), kill = gold assets stream
  back (Hostile Takeover), Termination Order = fx.dim + three gold beams 0.168 s apart + TERMINATED seal (gold frame + X) + floor hex.
- FX leviathan: cable lash beam + dark splash (fx.darkCore) + floor shock ring (splash), second lash via shot(), shield() = biolum
  rings rising the hull (Abyssal Hull), Abyssal Grip = fx.dim, 4 taut cables to the front line held ~2 s, stacked purple coils per
  target for the stun, crush flash + darkCore at +0.5 s, fx.lean pulls the targets toward it.

Honest score vs ref_battle_02 at battle size: EXECUTOR ~6/10 (clean white/gold read, cannon reads; body still a bit blocky, coat tails
mostly hidden from the top camera), LEVIATHAN ~6.5/10 (biggest, most distinctive shape on the board; carapace reads a little "beehive",
tentacles only partly visible from above).

OPEN / NEXT
1. Leviathan attack lash could rear higher so it reads at 120 px; tentacles could splay wider from the top view (kept within ~0.65 m reach).
2. Executor jacket front is a flat slab; could use a chamfered/curved front + more taper at the waist.
3. Flat glossy white plates catch a blown-out specular in the gallery side view (not visible from the battle camera).
4. In battle_test the units' rank comes from data; check R4/R5 look in a real map 8 fight once the battle passes rank.

## Requests (kit / battle)
- None blocking. The per-slot `panel.rim` override works for the gold-rim-on-dark issue (both units set `accent.panel.rim` ~0.3 with a dark tint).
