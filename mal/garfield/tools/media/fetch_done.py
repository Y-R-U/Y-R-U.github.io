"""Download every finished mflux-queue job whose prompt matches a gen_refs REFS entry (loops until none pending)."""
import json, time, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from gen_refs import REFS, OUT, req
by_prompt = {p: n for n, (p, w, h) in REFS.items()}
while True:
    d = json.loads(req("/api/jobs")); jobs = d if isinstance(d, list) else d.get("jobs", [])
    pending = 0
    for j in jobs:
        p = j.get("params", {}); n = by_prompt.get(p.get("prompt"))
        if not n: continue
        f = OUT / f"{n}_s{p.get('seed')}.png"
        if j["status"] == "done" and not f.exists():
            f.write_bytes(req(f"/api/jobs/{j['id']}/file/0")); print("got", f.name, flush=True)
        elif j["status"] in ("queued", "running"): pending += 1
    if not pending: break
    time.sleep(5)
print("ALL DONE")
