# docs/refs/probes_d39 — the D39 lighting A/B, and the prop set for the critic sheet

Agent G, 2026-08-24. Full analysis in `../../ART_PROPS.md`.

- `d39.json` + `gen_d39.py` — the A/B. Two subjects × four LIGHT clauses, everything else held
  constant (D34 stem, same subject clause, same isolation tail, 4B per D36, 768×512, 16 steps,
  seed 13 gun / 12 hangar). Reproduce: `python3 gen_d39.py d39.json .`
- `d39_{gun,hangar}_{L0neutral,L1warmcool,L2actii,L3hybrid}.png` — the eight plates.
- `_grid_raw.png` — the eight as generated. `_grid_baked.png` — the same eight through
  `art/tools/bake.js`. Read them together: L0 is flat as generated and painted after the bake,
  which is the whole D39 argument.
- `props.json`, `p1…p6_*.png` — six further TERRAIN props on the adopted grammar (L0 neutral),
  generated to make the blind-critic contact sheet in `../poster/prop_sheet.png`. Seeds 1–6 on the
  shared cross-act base 0, per ART.md §7.
- `_log_d39.txt`, `_log_props.txt` — wall times. Both batches shared the queue with another agent's
  jobs; no OOM, no stall, no contention failure.

`gen_d39.py` is a byte-for-byte copy of `../probes_ab/gen_ab.py`.
