#!/usr/bin/env python3
"""Queue painted-asset jobs on the local mflux-queue and save PNGs.

  python3 gen.py probes.json [outdir]

Entry: {"out","prompt","w","h","steps","seed","model","guidance","neg","n"}
Existing outputs are skipped so a batch resumes. The queue serialises itself —
never invent a lock. Check /api/status queue_depth and 7866 worker_warm first.
"""
import json, sys, time, pathlib, urllib.request

API = "http://127.0.0.1:7867"
NEG = "text, letters, words, watermark, signature, logo, ui, hud, frame, border, photo, photograph, 3d render, cgi, pixel art, cel shaded, anime lineart"

def post(p, b):
    r = urllib.request.Request(API + p, data=json.dumps(b).encode(),
                               headers={"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(r, timeout=60))

def get(p):
    return json.load(urllib.request.urlopen(API + p, timeout=60))

def gen(prefix, j):
    body = {"prompt": j["prompt"], "width": j.get("w", 1024), "height": j.get("h", 576),
            "num_inference_steps": j.get("steps", 14), "seed": j.get("seed", 11),
            "num_images": j.get("n", 1), "model": j.get("model", "flux2-klein-4b"),
            "guidance": j.get("guidance", 1.0), "negative_prompt": j.get("neg", NEG)}
    jid = post("/api/generate", body).get("job_id")
    t0 = time.time()
    while True:
        st = get(f"/api/jobs/{jid}")
        s = st.get("status")
        if s in ("done", "complete", "completed", "finished", "error", "failed"): break
        if time.time() - t0 > 1800: raise RuntimeError(f"timeout {jid}")
        time.sleep(3)
    if s in ("error", "failed"): raise RuntimeError(f"{jid} failed: {json.dumps(st)[:300]}")
    n = len(st.get("files") or []) or 1
    out = []
    for i in range(n):
        dst = pathlib.Path(f"{prefix}_{i}.png" if n > 1 else f"{prefix}.png")
        dst.parent.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(f"{API}/api/jobs/{jid}/file/{i}", timeout=180) as r:
            dst.write_bytes(r.read())
        out.append(dst)
    return out, time.time() - t0

def main():
    jobs = json.load(open(sys.argv[1]))
    outdir = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else ".")
    outdir.mkdir(parents=True, exist_ok=True)
    for i, j in enumerate(jobs):
        dst = outdir / (j["out"] + ".png")
        if dst.exists():
            print(f"[{i+1}/{len(jobs)}] skip {dst.name}", flush=True); continue
        try:
            out, secs = gen(str(outdir / j["out"]), j)
            print(f"[{i+1}/{len(jobs)}] {dst.name}  {secs:.0f}s  {j.get('w')}x{j.get('h')} {j.get('model','flux2-klein-4b')}", flush=True)
        except Exception as e:
            print(f"[{i+1}/{len(jobs)}] FAILED {dst.name}: {str(e)[:250]}", flush=True)

main()
