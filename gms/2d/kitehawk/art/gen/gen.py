#!/usr/bin/env python3
"""KITEHAWK sky/FX/hero plate generator (agent J).

  python3 gen.py manifests/<batch>.json [outdir]

Same contract as docs/refs/gen_ab.py — a JSON list of entries:
  {"out","prompt","w","h","steps","seed","model","guidance","neg","n","refs"}
plus it appends one JSON line per finished plate to out/_manifest.jsonl so any
plate can be regenerated exactly (prompt + model + seed + steps + size).

Existing outputs are skipped, so a batch resumes after an OOM or a kill.
The queue serialises itself. Never invent a lock.
"""
import json, sys, time, pathlib, hashlib, urllib.request, datetime

API = "http://127.0.0.1:7867"
NEG = "text, letters, words, watermark, signature, logo, ui, hud, frame, border, photo, photograph, 3d render, cgi, pixel art, cel shaded, anime lineart"
MANIFEST = None


def post(p, b):
    r = urllib.request.Request(API + p, data=json.dumps(b).encode(),
                               headers={"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(r, timeout=60))


def get(p):
    return json.load(urllib.request.urlopen(API + p, timeout=60))


def upload(path):
    path = pathlib.Path(path).resolve()
    boundary = "----kh8gen"
    data = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{path.name}\"\r\n"
            "Content-Type: image/png\r\n\r\n").encode() + path.read_bytes() + f"\r\n--{boundary}--\r\n".encode()
    r = urllib.request.Request(API + "/api/upload", data=data,
                               headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    j = json.load(urllib.request.urlopen(r, timeout=120))
    return j.get("path") or j.get("image_path") or j.get("file") or j


def gen(prefix, j):
    body = {"prompt": j["prompt"], "width": j.get("w", 1024), "height": j.get("h", 576),
            "num_inference_steps": j.get("steps", 16), "seed": j.get("seed", 11),
            "num_images": j.get("n", 1), "model": j.get("model", "flux2-klein-4b"),
            "guidance": j.get("guidance", 1.0), "negative_prompt": j.get("neg", NEG)}
    if j.get("refs"):
        body["mode"] = "edit"
        body["image_paths"] = [upload(r) for r in j["refs"]]
    jid = post("/api/generate", body).get("job_id")
    t0 = time.time()
    while True:
        st = get(f"/api/jobs/{jid}")
        s = st.get("status")
        if s in ("done", "complete", "completed", "finished", "error", "failed"):
            break
        if time.time() - t0 > 2400:
            raise RuntimeError(f"timeout {jid}")
        time.sleep(3)
    if s in ("error", "failed"):
        raise RuntimeError(f"{jid} failed: {json.dumps(st)[:300]}")
    n = len(st.get("files") or []) or 1
    out = []
    for i in range(n):
        dst = pathlib.Path(f"{prefix}_{i}.png" if n > 1 else f"{prefix}.png")
        dst.parent.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(f"{API}/api/jobs/{jid}/file/{i}", timeout=240) as r:
            dst.write_bytes(r.read())
        out.append(dst)
    return out, time.time() - t0, body, jid


def record(entry):
    with open(MANIFEST, "a") as f:
        f.write(json.dumps(entry) + "\n")


def main():
    global MANIFEST
    src = pathlib.Path(sys.argv[1])
    jobs = json.load(open(src))
    outdir = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else ".")
    outdir.mkdir(parents=True, exist_ok=True)
    MANIFEST = outdir / "_manifest.jsonl"
    total = 0.0
    for i, j in enumerate(jobs):
        dst = outdir / (j["out"] + ".png")
        if dst.exists():
            print(f"[{i+1}/{len(jobs)}] skip {dst.name}", flush=True)
            continue
        try:
            files, secs, body, jid = gen(str(outdir / j["out"]), j)
            total += secs
            for p in files:
                record({"file": p.name, "batch": src.name, "job_id": jid,
                        "model": body["model"], "seed": body["seed"],
                        "steps": body["num_inference_steps"],
                        "w": body["width"], "h": body["height"],
                        "guidance": body["guidance"],
                        "mode": body.get("mode", "txt2img"),
                        "refs": j.get("refs", []),
                        "prompt": body["prompt"],
                        "negative_prompt": body["negative_prompt"],
                        "bytes": p.stat().st_size,
                        "sha256": hashlib.sha256(p.read_bytes()).hexdigest()[:16],
                        "secs": round(secs, 1),
                        "at": datetime.datetime.now().isoformat(timespec="seconds")})
            print(f"[{i+1}/{len(jobs)}] {dst.name}  {secs:.0f}s  {body['width']}x{body['height']} {body['model']}", flush=True)
        except Exception as e:
            print(f"[{i+1}/{len(jobs)}] FAILED {dst.name}: {str(e)[:250]}", flush=True)
    print(f"batch {src.name} queue time {total/60:.1f} min", flush=True)


main()
