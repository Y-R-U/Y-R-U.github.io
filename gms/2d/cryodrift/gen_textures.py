#!/usr/bin/env python3
"""Generate Cryodrift background textures via the local MFLUX queue (:7867).

Dark-field microscopy backdrop layers + an intro hero. Saved to
app/src/assets/textures/ and imported (hashed) by the Vite build.
"""
import base64, json, os, sys, time, urllib.request

HOST = "http://localhost:7867"
OUT = os.path.join(os.path.dirname(__file__), "app", "src", "assets", "textures")
os.makedirs(OUT, exist_ok=True)

JOBS = [
    ("haze_far", 768, 768,
     "extreme close-up dark-field microscopy, deeply out of focus microorganisms, "
     "large soft glowing bokeh orbs in cyan teal and violet, abyssal near black indigo "
     "background, bioluminescent, heavy blur, ethereal depth, no text"),
    ("haze_near", 768, 768,
     "dark-field microscopy, drifting translucent micro-organisms and nutrient motes, "
     "faint cyan green and violet bioluminescent specks scattered, very dark deep blue "
     "background, shallow depth of field, delicate, no text"),
    ("dish_hero", 768, 768,
     "a glass petri dish under a microscope on a dark laboratory bench, soft rim light, "
     "a glistening droplet of pond water, shallow depth of field, cinematic moody teal "
     "and cyan lighting, scientific, no text"),
]


def post(path, payload):
    req = urllib.request.Request(HOST + path, data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def get(path):
    with urllib.request.urlopen(HOST + path, timeout=30) as r:
        return r.read()


def get_json(path):
    return json.loads(get(path))


def main():
    submitted = []
    for name, w, h, prompt in JOBS:
        resp = post("/api/generate", {
            "mode": "txt2img", "prompt": prompt, "model": "flux2-klein-4b",
            "width": w, "height": h, "num_inference_steps": 12, "guidance": 1.0,
            "seed": abs(hash(name)) % 100000, "num_images": 1,
        })
        jid = resp.get("job_id") or resp.get("id") or resp.get("jobId")
        print(f"submitted {name}: {jid}", flush=True)
        submitted.append((name, jid))

    for name, jid in submitted:
        deadline = time.time() + 300
        while time.time() < deadline:
            st = get_json(f"/api/jobs/{jid}")
            status = st.get("status") or st.get("state")
            if status in ("done", "completed", "finished", "succeeded"):
                break
            if status in ("error", "failed"):
                print(f"!! {name} failed: {st}", flush=True)
                jid = None
                break
            time.sleep(2)
        if not jid:
            continue
        # try the file endpoint first, then any base64 in the job json
        try:
            data = get(f"/api/jobs/{jid}/file/0")
        except Exception:
            st = get_json(f"/api/jobs/{jid}")
            imgs = st.get("images") or st.get("outputs") or []
            if not imgs:
                print(f"!! {name}: no output", flush=True)
                continue
            b64 = imgs[0].split(",")[-1]
            data = base64.b64decode(b64)
        path = os.path.join(OUT, f"{name}.png")
        with open(path, "wb") as f:
            f.write(data)
        print(f"saved {path} ({len(data)} bytes)", flush=True)


if __name__ == "__main__":
    main()
