#!/usr/bin/env python3
"""Run a JSON list of flux jobs one after another.

  python3 batch.py jobs.json [outdir]

Each entry: {"out": "name", "prompt": "...", "w":1024, "h":576, "steps":6, "seed":11,
             "model": "...", "guidance": 1.0, "neg": "..."}
Skips entries whose output already exists so a batch can be resumed.
"""
import json, sys, pathlib, time
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from flux import gen

DEFAULT_NEG = "text, letters, words, runes, watermark, signature, ui, hud, people, characters, photo"

def main():
    jobs = json.load(open(sys.argv[1]))
    outdir = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else ".")
    outdir.mkdir(parents=True, exist_ok=True)
    for i, j in enumerate(jobs):
        dst = outdir / (j["out"] + ".png")
        if dst.exists():
            print(f"[{i+1}/{len(jobs)}] skip {dst.name}")
            continue
        t = time.time()
        try:
            gen(str(outdir / j["out"]), j["prompt"],
                w=j.get("w", 1024), h=j.get("h", 576), steps=j.get("steps", 6),
                seed=j.get("seed", 11), n=j.get("n", 1),
                neg=j.get("neg", DEFAULT_NEG),
                model=j.get("model", "flux2-klein-9b-mlx-4bit"),
                guidance=j.get("guidance", 1.0), quiet=True)
            print(f"[{i+1}/{len(jobs)}] {dst.name}  {time.time()-t:.0f}s", flush=True)
        except SystemExit as e:
            print(f"[{i+1}/{len(jobs)}] FAILED {dst.name}: {str(e)[:200]}", flush=True)

main()
