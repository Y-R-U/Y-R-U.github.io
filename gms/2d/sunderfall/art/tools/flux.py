#!/usr/bin/env python3
"""Queue a job on the local mflux-queue and save the PNGs.

  python3 flux.py out_prefix "prompt" [--w 1024] [--h 576] [--steps 4] [--seed 7] [--n 1]

The queue serialises jobs itself, so just submit and poll; never invent a lock.
"""
import json, sys, time, urllib.request, argparse, pathlib

API = "http://127.0.0.1:7867"

def post(path, body):
    req = urllib.request.Request(API + path, data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req, timeout=60))

def get(path):
    return json.load(urllib.request.urlopen(API + path, timeout=60))

def gen(prefix, prompt, w=1024, h=576, steps=4, seed=7, n=1, neg=None,
        model="flux2-klein-9b-mlx-4bit", guidance=1.0, quiet=False):
    body = {"prompt": prompt, "width": w, "height": h, "num_inference_steps": steps,
            "seed": seed, "num_images": n, "model": model, "guidance": guidance}
    if neg: body["negative_prompt"] = neg
    job = post("/api/generate", body)
    jid = job.get("job_id") or job.get("id")
    t0 = time.time()
    while True:
        st = get(f"/api/jobs/{jid}")
        s = st.get("status")
        if s in ("done", "complete", "completed", "finished", "error", "failed"):
            break
        if time.time() - t0 > 1800:
            raise SystemExit(f"timeout on job {jid}")
        time.sleep(3)
    if s in ("error", "failed"):
        raise SystemExit(f"job {jid} failed: {st}")
    out = []
    count = len(st.get("files") or []) or n
    for i in range(count):
        dst = pathlib.Path(f"{prefix}_{i}.png" if count > 1 else f"{prefix}.png")
        dst.parent.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(f"{API}/api/jobs/{jid}/file/{i}", timeout=120) as r:
            dst.write_bytes(r.read())
        out.append(str(dst))
    if not quiet:
        print(f"{time.time()-t0:.0f}s  " + "  ".join(out))
    return out

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("prefix"); p.add_argument("prompt")
    p.add_argument("--w", type=int, default=1024); p.add_argument("--h", type=int, default=576)
    p.add_argument("--steps", type=int, default=4); p.add_argument("--seed", type=int, default=7)
    p.add_argument("--n", type=int, default=1); p.add_argument("--neg", default=None)
    p.add_argument("--model", default="flux2-klein-9b-mlx-4bit")
    p.add_argument("--guidance", type=float, default=1.0)
    a = p.parse_args()
    gen(a.prefix, a.prompt, a.w, a.h, a.steps, a.seed, a.n, a.neg, a.model, a.guidance)
