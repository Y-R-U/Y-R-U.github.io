#!/usr/bin/env python3
"""Monster art + video pipeline for the hub-video games (awake / the_horrors).

Reads `monsters.json` from the same folder. Identical file in both projects —
everything project-specific lives in that config.

Two stages, deliberately separated because Flux (~9 GB) and LTX (~16 GB) do not
co-reside in 24 GB:

  stage images  every monster gets four stills, each derived from the last:
                  ref/monster_<id>.jpg          full-body identity reference
                  ref/monster_<id>_attack.jpg   snarling close-up, from the ref
                  images/monster_release_<id>_end.jpg  ref composited into the hallway
                  images/monster_attack_<id>_end.jpg   attack ref filling the hallway frame

  stage videos  one LTX clip per monster per kind. Every clip starts on the bare
                hallway plate and is pinned (image_end) to arrive at the matching
                composite, because the hub topology means the player is looking
                at exactly that empty hallway when the event fires — so the cut
                into the event is invisible and LTX only invents the journey.
                Written as a numbered variant (`..._v3.mp4`) and appended to
                js/variants.js, so nothing already on disk is overwritten and the
                debug panel can compare every attempt side by side.

    python3 gen_monsters.py images                 # all stills
    python3 gen_monsters.py videos                 # one new variant per clip
    python3 gen_monsters.py videos --only gene,mimic --kind attack
    python3 gen_monsters.py images --force         # re-roll stills that exist
"""

import argparse
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
LTX_API = "http://localhost:7866"
MFLUX_API = "http://localhost:7867"

IMAGE_MODEL = "flux2-klein-9b-mlx-4bit"
IMAGE_STEPS = 10
# txt2img identity references render at full size — they are the master art.
IMAGE_WIDTH = 768
IMAGE_HEIGHT = 1280
# Edit passes (attack close-up, hallway composites) run much smaller. Flux2 edit
# cost scales with output pixels *and* with every conditioning image, and a
# 768x1280 two-reference composite takes 15+ minutes on this box against ~3 for
# this size. The composites only ever feed LTX at 384x640, so the extra
# resolution bought nothing.
EDIT_WIDTH = 512
EDIT_HEIGHT = 848
COND_MAX_WIDTH = 512
# Committed copy of each reference: small enough to live in the repo so the
# debug panel can show monster art when the helper is not reachable.
REF_MAX_WIDTH = 640
REF_QUALITY = 85

VIDEO_WIDTH = 384
VIDEO_HEIGHT = 640
VIDEO_FPS = 24
# Every event clip starts on the empty hallway plate and ends on the composite,
# because the hub topology guarantees the player is looking at exactly that
# hallway when the event fires. The release is a slow walk-in; the attack is a
# charge down the corridor and gets the extra second — it is the end of the run.
VIDEO_FRAMES = {"release": 73, "attack": 97}

LOG_PATH = os.path.join(HERE, "gen_monsters.log")


def log(message):
    line = f"[{time.strftime('%H:%M:%S')}] {message}"
    print(line, flush=True)
    with open(LOG_PATH, "a", encoding="utf-8") as handle:
        handle.write(line + "\n")


def load_config():
    with open(os.path.join(HERE, "monsters.json"), "r", encoding="utf-8") as handle:
        return json.load(handle)


# ── HTTP ───────────────────────────────────────────────────────────────
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


def unload(base):
    """Ask a backend to drop its resident model so the other one fits."""
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


# ── stills ─────────────────────────────────────────────────────────────
def pixel_height(path):
    out = subprocess.check_output(["sips", "-g", "pixelHeight", path], text=True)
    return int(out.strip().split(":")[-1])


def shrink_to_ref(src, dst):
    """Committed JPEG copy of a generated PNG. `sips -Z` upscales when the source
    is already small, so only pass it when there is something to shrink."""
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    args = ["sips", "-s", "format", "jpeg", "-s", "formatOptions", str(REF_QUALITY)]
    if pixel_height(src) > REF_MAX_WIDTH * 2:
        args += ["-Z", str(REF_MAX_WIDTH * 2)]
    subprocess.run(args + [src, "--out", dst],
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def condition_copy(src):
    """Downscaled copy of a conditioning image. Full-size references cost as
    much as the render itself in Flux2 edit mode and add nothing at 512 px."""
    cache = os.path.join(HERE, ".image_previews", "cond")
    os.makedirs(cache, exist_ok=True)
    dst = os.path.join(cache, os.path.splitext(os.path.basename(src))[0] + ".jpg")
    if not os.path.exists(dst) or os.path.getmtime(dst) < os.path.getmtime(src):
        subprocess.run(
            ["sips", "-Z", str(COND_MAX_WIDTH * 2), "-s", "format", "jpeg",
             "-s", "formatOptions", "88", src, "--out", dst],
            check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
    return dst


def flux(prompt, target, image_paths=None, seed=None):
    payload = {
        "mode": "edit" if image_paths else "txt2img",
        "prompt": prompt,
        "model": IMAGE_MODEL,
        "width": EDIT_WIDTH if image_paths else IMAGE_WIDTH,
        "height": EDIT_HEIGHT if image_paths else IMAGE_HEIGHT,
        "num_inference_steps": IMAGE_STEPS,
        "seed": int(seed if seed is not None else time.time()) % 100000,
        "num_images": 1,
    }
    if image_paths:
        payload["image_paths"] = [condition_copy(path) for path in image_paths]
    job_id = api_post(MFLUX_API, "/api/generate", payload)["job_id"]
    while True:
        job = api_get(MFLUX_API, f"/api/jobs/{job_id}")
        status = job.get("status")
        if status == "done":
            break
        if status in {"failed", "cancelled"}:
            raise RuntimeError(f"flux job {job_id} {status}: {job.get('error', '')}")
        time.sleep(3)
    api_download(MFLUX_API, f"/api/jobs/{job_id}/file/0", target)
    return target


def hallway_source():
    for candidate in ("original_files/hallway.png", "images/hallway.jpg"):
        path = os.path.join(HERE, candidate)
        if os.path.exists(path):
            return path
    raise RuntimeError("no hallway still found")


def legacy_ref_png(monster_id):
    """Earlier runs saved references as ref/monster_<id>.png. Reuse an approved
    one rather than re-rolling the monster's identity."""
    path = os.path.join(HERE, "ref", f"monster_{monster_id}.png")
    return path if os.path.exists(path) else None


def stage_images(config, only, force, kinds):
    hallway = hallway_source()
    for monster in config["monsters"]:
        mid = monster["id"]
        if only and mid not in only:
            continue
        master_dir = os.path.join(HERE, "original_files")
        ref_png = os.path.join(master_dir, f"monster_{mid}.png")
        ref_jpg = os.path.join(HERE, "ref", f"monster_{mid}.jpg")
        attack_png = os.path.join(master_dir, f"monster_{mid}_attack.png")
        attack_jpg = os.path.join(HERE, "ref", f"monster_{mid}_attack.jpg")

        # 1. identity reference
        if force or not os.path.exists(ref_jpg):
            legacy = legacy_ref_png(mid)
            if legacy and not force:
                log(f"{mid}: reusing approved reference {os.path.basename(legacy)}")
                shrink_to_ref(legacy, ref_jpg)
                if not os.path.exists(ref_png):
                    os.makedirs(master_dir, exist_ok=True)
                    subprocess.run(["cp", legacy, ref_png], check=True)
            else:
                log(f"{mid}: reference")
                flux(monster["refPrompt"], ref_png)
                shrink_to_ref(ref_png, ref_jpg)
        ref_input = ref_png if os.path.exists(ref_png) else ref_jpg

        # 2. attack close-up, conditioned on the identity reference
        if force or not os.path.exists(attack_jpg):
            log(f"{mid}: attack close-up")
            flux(monster["attackRefPrompt"], attack_png, image_paths=[ref_input])
            shrink_to_ref(attack_png, attack_jpg)
        attack_input = attack_png if os.path.exists(attack_png) else attack_jpg

        # 3/4. hallway composites — the LTX *end* frames. The clip starts on the
        # bare hallway plate (what the player is already looking at) and is
        # pinned to arrive here, so these describe the destination, not the
        # opening shot.
        for kind, prompt_key, source in (
            ("release", "releaseStartPrompt", ref_input),
            ("attack", "attackStartPrompt", attack_input),
        ):
            if kinds and kind not in kinds:
                continue
            end_png = os.path.join(master_dir, f"monster_{kind}_{mid}_end.png")
            end_jpg = os.path.join(HERE, "images", f"monster_{kind}_{mid}_end.jpg")
            if not force and os.path.exists(end_jpg):
                continue
            log(f"{mid}: {kind} end frame")
            flux(monster[f"{kind}StartPrompt"], end_png, image_paths=[hallway, source])
            shrink_to_ref(end_png, end_jpg)


# ── variants manifest ──────────────────────────────────────────────────
VARIANTS_PATH = os.path.join(HERE, "js", "variants.js")
VARIANTS_HEADER = (
    "// Generated by gen_monsters.py — every monster clip that has ever been\n"
    "// rendered, plus which one the game plays. Edit through the debug panel\n"
    "// (Monsters tab) rather than by hand.\n"
    "window.MonsterVariants = "
)


def load_variants():
    if not os.path.exists(VARIANTS_PATH):
        return {"generated": "", "clips": {}, "zoom": {}}
    with open(VARIANTS_PATH, "r", encoding="utf-8") as handle:
        raw = handle.read()
    start = raw.index("{")
    end = raw.rindex("}") + 1
    data = json.loads(raw[start:end])
    data.setdefault("clips", {})
    data.setdefault("zoom", {})
    return data


def save_variants(data):
    data["generated"] = time.strftime("%Y-%m-%d %H:%M:%S")
    os.makedirs(os.path.dirname(VARIANTS_PATH), exist_ok=True)
    with open(VARIANTS_PATH, "w", encoding="utf-8") as handle:
        handle.write(VARIANTS_HEADER + json.dumps(data, indent=2, sort_keys=True) + ";\n")


def seed_variants(config):
    """First run: register the pre-existing monster_<kind>_<id>.mp4 files as v1
    so the panel has a baseline to compare new attempts against."""
    data = load_variants()
    data["game"] = config["game"]
    data["monsters"] = [
        {
            "id": monster["id"],
            "name": monster["name"],
            "ref": f"ref/monster_{monster['id']}.jpg",
            "attackRef": f"ref/monster_{monster['id']}_attack.jpg",
        }
        for monster in config["monsters"]
    ]
    for monster in config["monsters"]:
        mid = monster["id"]
        for kind in ("release", "attack"):
            key = f"{kind}:{mid}"
            entry = data["clips"].setdefault(key, {"selected": "", "variants": []})
            legacy_file = f"monster_{kind}_{mid}.mp4"
            legacy_path = os.path.join(HERE, "videos", legacy_file)
            known = {variant["file"] for variant in entry["variants"]}
            if os.path.exists(legacy_path) and legacy_file not in known:
                stat = os.stat(legacy_path)
                entry["variants"].insert(0, {
                    "n": 1,
                    "file": legacy_file,
                    "src": f"videos/{legacy_file}",
                    "created": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(stat.st_mtime)),
                    "bytes": stat.st_size,
                    "prompt": "",
                    "start": "images/hallway.jpg",
                    "note": "original",
                })
            if not entry["selected"] and entry["variants"]:
                entry["selected"] = entry["variants"][0]["src"]
    adopt_orphan_variants(data)
    save_variants(data)
    return data


def adopt_orphan_variants(data):
    """Register any monster_<kind>_<id>_v<N>.mp4 on disk that the manifest has
    lost. Two generator processes running at once (a repair pass alongside the
    main batch) can each read-modify-write this file and drop the other's entry,
    so the manifest is reconciled against the videos folder rather than trusted."""
    pattern = re.compile(r"^monster_(release|attack)_(.+)_v(\d+)\.mp4$")
    adopted = 0
    for file_name in sorted(os.listdir(os.path.join(HERE, "videos"))):
        match = pattern.match(file_name)
        if not match:
            continue
        kind, monster_id, number = match.group(1), match.group(2), int(match.group(3))
        entry = data["clips"].setdefault(f"{kind}:{monster_id}", {"selected": "", "variants": []})
        if any(variant["file"] == file_name for variant in entry["variants"]):
            continue
        path = os.path.join(HERE, "videos", file_name)
        stat = os.stat(path)
        entry["variants"].append({
            "n": number,
            "file": file_name,
            "src": f"videos/{file_name}",
            "created": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(stat.st_mtime)),
            "bytes": stat.st_size,
            "prompt": "",
            "start": "images/hallway.jpg",
            "end": f"images/monster_{kind}_{monster_id}_end.jpg",
            "note": "recovered from disk",
        })
        entry["variants"].sort(key=lambda variant: variant["n"])
        arm_default_zoom(data, kind, f"videos/{file_name}")
        adopted += 1
    if adopted:
        log(f"adopted {adopted} variant file(s) missing from the manifest")
    return adopted


def next_variant_number(entry):
    return max([variant["n"] for variant in entry["variants"]] + [0]) + 1


# Attack clips carry the jump scare, and LTX reliably stops the creature a step
# or two short of the lens — so every new attack variant gets the punch-in armed
# by default, aimed where the composited start frame puts the head. Release
# clips are a slow reveal and stay off unless a reviewer turns them on.
# Off by default now. The punch existed because LTX used to stop the creature a
# step short of the lens; pinning image_end means the clip is guaranteed to
# arrive, and punching into an already-full-frame face just crops it. Still
# available per-clip in the debug panel.
DEFAULT_ATTACK_ZOOM = {"enabled": False, "x": 0.5, "y": 0.4, "scale": 2.6, "lead": 1.0, "fade": 0.4}


def arm_default_zoom(data, kind, src):
    if kind == "attack" and src not in data["zoom"]:
        data["zoom"][src] = dict(DEFAULT_ATTACK_ZOOM)


# ── videos ─────────────────────────────────────────────────────────────
def submit_video(config, monster, kind, end_image, frames):
    prompt = monster[f"{kind}VideoPrompt"]
    payload = {
        "prompt": f"{prompt}, {config['common']}",
        "width": VIDEO_WIDTH,
        "height": VIDEO_HEIGHT,
        "num_frames": frames,
        "fps": VIDEO_FPS,
        "seed": int(time.time() * 1000) % 100000,
        "num_inference_steps": 20,
        "cfg_scale": 3.0,
        "negative_prompt": config["negative"],
        # The first frame is the hallway the player is already looking at, so
        # the cut into the event is invisible; the composite is pinned as the
        # last frame, so LTX only has to invent the journey between the two.
        "image": hallway_source(),
        "image_end": end_image,
        "image_strength": 1.0,
        "tiling": "aggressive",
        "no_audio": True,
    }
    return api_post(LTX_API, "/api/generate", payload)["job_id"], prompt


def wait_for_video(job_id):
    while True:
        job = api_get(LTX_API, f"/api/jobs/{job_id}")
        status = job.get("status")
        if status == "done":
            return job
        if status in {"failed", "cancelled"}:
            raise RuntimeError(f"LTX job {job_id} {status}")
        time.sleep(5)


def stage_videos(config, only, kinds, frames):
    data = seed_variants(config)
    for monster in config["monsters"]:
        mid = monster["id"]
        if only and mid not in only:
            continue
        for kind in ("release", "attack"):
            if kinds and kind not in kinds:
                continue
            end_jpg = os.path.join(HERE, "images", f"monster_{kind}_{mid}_end.jpg")
            if not os.path.exists(end_jpg):
                log(f"{mid} {kind}: no end frame, skipping (run the images stage first)")
                continue
            entry = data["clips"].setdefault(f"{kind}:{mid}", {"selected": "", "variants": []})
            number = next_variant_number(entry)
            out_file = f"monster_{kind}_{mid}_v{number}.mp4"
            out_path = os.path.join(HERE, "videos", out_file)
            clip_frames = frames or VIDEO_FRAMES[kind]
            log(f"{mid} {kind}: rendering v{number} ({clip_frames}f)")
            job_id, prompt = submit_video(config, monster, kind, end_jpg, clip_frames)
            job = wait_for_video(job_id)
            api_download(LTX_API, f"/api/jobs/{job_id}/file", out_path)
            entry["variants"].append({
                "n": number,
                "file": out_file,
                "src": f"videos/{out_file}",
                "created": time.strftime("%Y-%m-%d %H:%M:%S"),
                "bytes": os.path.getsize(out_path),
                "prompt": prompt,
                "start": "images/hallway.jpg",
                "end": f"images/monster_{kind}_{mid}_end.jpg",
                "note": "",
                "durationSecs": job.get("duration_secs"),
            })
            arm_default_zoom(data, kind, f"videos/{out_file}")
            save_variants(data)
            log(f"{mid} {kind}: v{number} → {out_file} ({os.path.getsize(out_path) // 1024} KB)")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("stage", choices=["images", "videos", "seed"])
    parser.add_argument("--only", default="", help="comma-separated monster ids")
    parser.add_argument("--kind", default="", help="release, attack, or both")
    parser.add_argument("--force", action="store_true", help="re-roll stills that already exist")
    parser.add_argument("--frames", type=int, default=0,
                        help="override the per-kind frame count")
    args = parser.parse_args()

    config = load_config()
    only = {value.strip() for value in args.only.split(",") if value.strip()}
    kinds = {value.strip() for value in args.kind.split(",") if value.strip()}

    if args.stage == "seed":
        seed_variants(config)
        log("variants manifest seeded")
        return
    if args.stage == "images":
        wait_for_ltx_idle()
        stage_images(config, only, args.force, kinds)
    else:
        unload(MFLUX_API)
        stage_videos(config, only, kinds, args.frames)
    log(f"{args.stage} stage complete")


if __name__ == "__main__":
    sys.exit(main())
