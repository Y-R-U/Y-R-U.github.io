# docs/refs — art evidence and the generation probe

- `gen.py` — submits a JSON manifest to the local mflux-queue (`:7867`) and saves the PNGs.
  Skips outputs that already exist, so a batch resumes. Moves to `art/tools/flux.py` at build time.
- `probes.json` — the ten probe prompts. Reproduces `probes/` exactly.
- `probes/` — **committed.** These are the evidence that the direction in `../ART.md` is achievable
  and they are ours. `p07`/`p08` are the intended look of an Act II frame. `_log.txt` records the
  wall time and model of each.
- `study/` — **gitignored.** Third-party reference plates for the §9 blind-critic rounds live here
  locally and never enter the repo.

Run: `python3 gen.py probes.json probes` — but check `curl -s localhost:7867/api/status` for
`queue_depth` and `curl -s localhost:7866/api/status` for `worker_warm` first.
