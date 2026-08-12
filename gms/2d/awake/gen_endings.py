#!/usr/bin/env python3
"""Escape-ending clips: hallway -> generated destination plate.

Same architecture as the monster event clips. The hub topology means the player
is always looking at images/hallway.jpg when the run ends, so every ending opens
on that plate and is pinned with LTX image_end to a destination generated here.

The four pre-existing Horrors endings failed because they started from *room*
stills (wine_cellar, attic, ...) and had no end frame at all, so LTX free-ran
for six seconds with nothing to aim at. Only ending_escape_front_door.mp4, which
started from the hallway, ever worked.

Stages run in order and must not overlap: Flux and LTX cannot both hold a worker
in 24 GB.

    python3 gen_endings.py stills           # destination plates (Flux)
    python3 gen_endings.py videos           # hallway -> plate (LTX)
    python3 gen_endings.py all              # stills, unload, videos
    python3 gen_endings.py videos --only moonscape,escape_pod
    python3 gen_endings.py stills --reroll  # replace plates already on disk
"""
import argparse
import json
import os
import subprocess
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
LTX_API = "http://localhost:7866"
MFLUX_API = "http://localhost:7867"

IMAGE_MODEL = "flux2-klein-9b-mlx-4bit"
IMAGE_STEPS = 10
# Matches the monster composites: these only ever feed LTX at 384x640, so the
# full 768x1280 master size buys nothing and costs several minutes per plate.
PLATE_WIDTH = 512
PLATE_HEIGHT = 848

VIDEO_WIDTH = 384
VIDEO_HEIGHT = 640
VIDEO_FPS = 24


def api_post(base, path, payload):
    request = urllib.request.Request(
        f"{base}{path}",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        return json.loads(response.read().decode("utf-8"))


def api_get(base, path):
    with urllib.request.urlopen(f"{base}{path}", timeout=60) as response:
        return json.loads(response.read().decode("utf-8"))


def api_download(base, path, target):
    os.makedirs(os.path.dirname(target), exist_ok=True)
    with urllib.request.urlopen(f"{base}{path}", timeout=600) as response, open(target, "wb") as handle:
        handle.write(response.read())
    return target


def unload(base):
    try:
        request = urllib.request.Request(f"{base}/admin/unload", data=b"{}",
                                         headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(request, timeout=60):
            return True
    except Exception:
        return False


def wait_for_ltx_idle(timeout=180):
    """LTX has no unload endpoint — it drops its worker after 120 s idle."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            if not api_get(LTX_API, "/api/status").get("worker_warm"):
                return
        except Exception:
            return
        time.sleep(5)


def log(message):
    print(f"[{time.strftime('%H:%M:%S')}] {message}", flush=True)


def load_config():
    with open(os.path.join(HERE, "endings.json"), "r", encoding="utf-8") as handle:
        return json.load(handle)


def hallway_source():
    for candidate in ("original_files/hallway.png", "images/hallway.jpg"):
        path = os.path.join(HERE, candidate)
        if os.path.exists(path):
            return path
    raise SystemExit("no hallway plate found")


def plate_path(eid):
    return os.path.join(HERE, "images", f"ending_escape_{eid}_end.jpg")


def next_video_path(eid):
    """Numbered takes, like the monster clips — a rejected ending stays on disk
    next to its replacement so the two can be compared in review."""
    n = 1
    while True:
        path = os.path.join(HERE, "videos", f"ending_escape_{eid}_v{n}.mp4")
        if not os.path.exists(path):
            return path, n
        n += 1


# ── stills ─────────────────────────────────────────────────────────────
def stage_stills(config, only, reroll):
    for ending in config["endings"]:
        eid = ending["id"]
        if only and eid not in only:
            continue
        target = plate_path(eid)
        if os.path.exists(target) and not reroll:
            log(f"plate {eid}: already on disk, skipping (--reroll to replace)")
            continue
        # stillCommon, never videoCommon: putting the doorway language in the
        # plate prompt makes Flux paint a doorframe into the destination, and the
        # clip then correctly stops on the threshold instead of walking out.
        prompt = f"{ending['still']}, {config['stillCommon']}"
        payload = {
            "prompt": prompt,
            "model": IMAGE_MODEL,
            "width": PLATE_WIDTH,
            "height": PLATE_HEIGHT,
            "num_inference_steps": IMAGE_STEPS,
            "guidance": 1.0,
            "seed": int(time.time() * 1000) % 100000,
            "num_images": 1,
        }
        log(f"plate {eid}: submitting")
        job_id = api_post(MFLUX_API, "/api/generate", payload)["job_id"]
        while True:
            job = api_get(MFLUX_API, f"/api/jobs/{job_id}")
            status = job.get("status")
            if status == "done":
                break
            if status in {"failed", "cancelled"}:
                raise RuntimeError(f"flux job {job_id} {status}: {job.get('error', '')}")
            time.sleep(3)
        png = os.path.join(HERE, "original_files", f"ending_escape_{eid}_end.png")
        api_download(MFLUX_API, f"/api/jobs/{job_id}/file/0", png)
        subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "88",
                        png, "--out", target],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        log(f"plate {eid}: {os.path.getsize(target) // 1024} KB")


# ── videos ─────────────────────────────────────────────────────────────
def stage_videos(config, only, frames, alt=None):
    hallway = hallway_source()
    for ending in config["endings"]:
        eid = ending["id"]
        if only and eid not in only:
            continue
        if ending.get("accepted") and alt is not None:
            log(f"clip {eid}: accepted take {ending['accepted']}, not re-rendering")
            continue
        plate = plate_path(eid)
        if not os.path.exists(plate):
            log(f"clip {eid}: no destination plate, run `stills` first — skipping")
            continue
        # A different phrasing beats a different seed when the prompt itself is
        # what is failing: --alt selects one of the alternates authored per
        # ending rather than re-rolling the wording that already did not work.
        prompt_text = ending["video"]
        if alt is not None:
            variants = ending.get("videoAlts") or []
            if alt >= len(variants):
                log(f"clip {eid}: no alt {alt}, skipping")
                continue
            prompt_text = variants[alt]
        target, n = next_video_path(eid)
        payload = {
            "prompt": f"{prompt_text}, {config['videoCommon']}",
            "width": VIDEO_WIDTH,
            "height": VIDEO_HEIGHT,
            "num_frames": frames or config.get("frames", 145),
            "fps": VIDEO_FPS,
            "seed": int(time.time() * 1000) % 100000,
            "num_inference_steps": 20,
            "cfg_scale": 3.0,
            "negative_prompt": config["negative"],
            # Frame 0 is the hallway the player is already looking at; the
            # destination is pinned as the last frame, so LTX only invents the
            # walk between the two.
            "image": hallway,
            "image_end": plate,
            "image_strength": 1.0,
            "tiling": "aggressive",
            "no_audio": True,
        }
        log(f"clip {eid} v{n}{'' if alt is None else f' alt{alt}'}: submitting")
        job_id = api_post(LTX_API, "/api/generate", payload)["job_id"]
        while True:
            job = api_get(LTX_API, f"/api/jobs/{job_id}")
            status = job.get("status")
            if status == "done":
                break
            if status in {"failed", "cancelled"}:
                raise RuntimeError(f"LTX job {job_id} {status}")
            time.sleep(5)
        api_download(LTX_API, f"/api/jobs/{job_id}/file", target)
        log(f"clip {eid} v{n}: {os.path.getsize(target) // 1024} KB -> {os.path.basename(target)}")


# ── review page ────────────────────────────────────────────────────────
REVIEW_CSS = """
:root { color-scheme: dark; }
body { margin: 0; padding: 24px; background: #0d0f12; color: #e6e8ec;
       font: 15px/1.5 -apple-system, system-ui, sans-serif; }
h1 { font-size: 20px; margin: 0 0 4px; }
p.sub { margin: 0 0 28px; color: #8a93a0; }
section { margin-bottom: 34px; }
h2 { font-size: 16px; margin: 0 0 2px; }
h2 small { color: #8a93a0; font-weight: 400; }
.blurb { margin: 0 0 10px; color: #8a93a0; font-size: 13px; max-width: 70ch; }
.row { display: flex; gap: 14px; align-items: flex-start; flex-wrap: wrap; }
figure { margin: 0; }
figcaption { font-size: 12px; color: #8a93a0; margin-top: 4px; text-align: center;
              max-width: 190px; }
.alt { color: #d8b46a; }
img, video { display: block; width: 190px; border-radius: 8px;
             border: 1px solid #232830; background: #000; }
.plate { border-color: #3a4250; }
.plate figcaption { color: #b9c2cf; }
"""


def stage_review(config):
    """A plain page listing every destination plate beside its takes. The debug
    panel's ending rows point at the old canonical filenames, so new numbered
    takes are invisible there; this is the surface for choosing between them.
    Served by the regen helper, which honours Range — a stock http.server does
    not, and video will not seek."""
    rows = []
    for ending in config["endings"]:
        eid = ending["id"]
        plate = f"images/ending_escape_{eid}_end.jpg"
        # Takes at or below supersededThrough were reviewed and rejected; they
        # stay on disk but fold away so the page shows what is actually up for
        # review. `accepted` marks a take already chosen — nothing to compare.
        cut = ending.get("supersededThrough", 0)
        accepted = ending.get("accepted", "")
        takes, old = [], []
        n = 1
        while True:
            rel = f"videos/ending_escape_{eid}_v{n}.mp4"
            if not os.path.exists(os.path.join(HERE, rel)):
                break
            kb = os.path.getsize(os.path.join(HERE, rel)) // 1024
            mark = " &check; in use" if accepted == f"v{n}" else ""
            # Name the phrasing rather than the take number: three alts per
            # ending is unreviewable if they are only labelled v3/v4/v5.
            start = ending.get("altsFrom", 0)
            labels = config.get("altLabels", [])
            if start and n >= start and (n - start) < len(labels):
                mark += f'<br><span class="alt">{labels[n - start]}</span>'
            fig = (f'<figure><video src="../{rel}" controls preload="metadata" '
                   f'poster="../{plate}"></video>'
                   f'<figcaption>v{n} &middot; {kb} KB{mark}</figcaption></figure>')
            (old if (n <= cut and accepted != f"v{n}") else takes).append(fig)
            n += 1
        if not takes:
            takes.append('<figcaption>no takes yet</figcaption>')
        if old:
            takes.append(f'<details><summary>{len(old)} rejected take'
                         f'{"s" if len(old) > 1 else ""}</summary>'
                         f'<div class="row">{"".join(old)}</div></details>')
        rows.append(
            f'<section><h2>{ending["title"]} <small>{eid}</small></h2>'
            f'<p class="blurb">{ending["video"]}</p><div class="row">'
            f'<figure class="plate"><img src="../{plate}" alt="">'
            f'<figcaption>destination plate</figcaption></figure>'
            + "".join(takes) + '</div></section>')
    html = (f'<!doctype html><meta charset="utf-8">'
            f'<meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<title>Ending takes</title><style>{REVIEW_CSS}</style>'
            f'<h1>Escape endings</h1>'
            f'<p class="sub">Every clip starts on the hallway plate and is pinned to the '
            f'destination on the left. Generated {time.strftime("%Y-%m-%d %H:%M")}.</p>'
            + "".join(rows))
    out_dir = os.path.join(HERE, "tools")
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, "endings.html")
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(html)
    log(f"review page: tools/endings.html "
        f"(http://127.0.0.1:8788/{os.path.basename(HERE)}/tools/endings.html)")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("stage", choices=["stills", "videos", "all", "review"])
    parser.add_argument("--only", default="")
    parser.add_argument("--frames", type=int, default=0)
    parser.add_argument("--reroll", action="store_true")
    parser.add_argument("--alt", type=int, default=None,
                        help="render videoAlts[N] instead of the main video prompt")
    args = parser.parse_args()

    config = load_config()
    only = {p.strip() for p in args.only.split(",") if p.strip()}
    known = {e["id"] for e in config["endings"]}
    unknown = only - known
    if unknown:
        raise SystemExit(f"unknown ending id(s): {', '.join(sorted(unknown))}")

    if args.stage in {"stills", "all"}:
        wait_for_ltx_idle()
        stage_stills(config, only, args.reroll)
    if args.stage == "all":
        # Flux must give the GPU back before LTX can hold its ~16 GB worker.
        unload(MFLUX_API)
        time.sleep(5)
    if args.stage in {"videos", "all"}:
        stage_videos(config, only, args.frames, args.alt)
    if args.stage in {"videos", "all", "review"}:
        stage_review(config)
    log("done")


if __name__ == "__main__":
    main()
