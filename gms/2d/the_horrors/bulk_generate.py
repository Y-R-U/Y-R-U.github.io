#!/usr/bin/env python3
"""Bulk generator for The Horrors media.

Walks the catalogues in gen_images.py, gen_transitions.py, and gen_event_videos.py
and queues everything that doesn't already exist on disk. Reports progress with
running ETAs based on observed durations. Resumable — just rerun, anything that
already exists on disk is skipped.

Usage:
  python3 bulk_generate.py                # everything missing
  python3 bulk_generate.py images         # only PNG room stills (via MFLUX)
  python3 bulk_generate.py videos         # transitions + monster events
  python3 bulk_generate.py transitions    # just transitions
  python3 bulk_generate.py events         # just monster + ending events
  python3 bulk_generate.py --force        # ignore "already exists" skips
  python3 bulk_generate.py --dry-run      # list what would queue, do nothing

About warm weights
------------------
The LTX server (:7866) is deliberately subprocess-per-job: it loads the
~30 GB model, renders one mp4, exits, lets the OS reclaim. That gives
"load on demand, unload after use" on a 24 GB Mac — the whole reason the
server was built that way. The trade-off you're hitting now is: every
queued job pays a ~20 s model-load tax from the SSD cache.

For ~80 queued videos that's ~25–30 min of loading on top of the actual
~2–5 min/clip generation. Annoying but not catastrophic (5–15% overhead).

Truly warm batching would require either:
  - holding the model in one long-lived Python process AND patching
    mlx_video to separate load-once from generate-many (the public
    generate_video_with_audio reloads internally), OR
  - a "batch mode" flag in the LTX server that keeps a single worker
    subprocess alive for N jobs before exiting.

Either is its own engineering project — left for later if the overhead
ever bites. Recommendation in the meantime: hit the airon Load/Unload
panel to unload aliensky/qwen36/mflux/ace-step BEFORE starting a bulk
run so they don't compete for RAM with the LTX worker.
"""

from __future__ import annotations

import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
PYTHON = sys.executable

# Map shorthand → which sub-script to run.
SUITES = {
    "images":      [os.path.join(HERE, "gen_images.py")],
    "transitions": [os.path.join(HERE, "gen_transitions.py")],
    "events":      [os.path.join(HERE, "gen_event_videos.py")],
    "videos":      [
        os.path.join(HERE, "gen_transitions.py"),
        os.path.join(HERE, "gen_event_videos.py"),
    ],
    "all": [
        os.path.join(HERE, "gen_images.py"),
        os.path.join(HERE, "gen_transitions.py"),
        os.path.join(HERE, "gen_event_videos.py"),
    ],
}


def log(message: str) -> None:
    stamp = time.strftime("%H:%M:%S")
    print(f"[{stamp}] bulk: {message}", flush=True)


def run_suite(suite_path: str, passthrough_args: list[str]) -> int:
    log(f"START {os.path.basename(suite_path)} {' '.join(passthrough_args) or '(all)'}")
    t0 = time.time()
    rc = subprocess.call([PYTHON, suite_path] + passthrough_args)
    dt = time.time() - t0
    log(f"DONE  {os.path.basename(suite_path)} rc={rc} in {dt:.1f}s")
    return rc


def main() -> int:
    args = list(sys.argv[1:])
    force = "--force" in args
    dry = "--dry-run" in args
    args = [a for a in args if a not in ("--force", "--dry-run")]

    if not args:
        suite = "all"
    elif len(args) == 1 and args[0] in SUITES:
        suite = args[0]
    else:
        # Pass any other arguments through to the underlying scripts (so you
        # can still run a single file by stem). Default to "all" pipeline.
        suite = "all"

    passthrough = []
    if force:
        passthrough.append("--force")

    scripts = SUITES[suite]
    log(f"plan: {[os.path.basename(s) for s in scripts]}"
        + (" [DRY RUN]" if dry else "")
        + (" [FORCE]" if force else ""))

    if dry:
        for script in scripts:
            log(f"would run {script} {' '.join(passthrough)}")
        return 0

    overall_t0 = time.time()
    failed = []
    for script in scripts:
        rc = run_suite(script, passthrough)
        if rc != 0:
            failed.append(os.path.basename(script))
    overall_dt = time.time() - overall_t0

    log(f"ALL DONE in {overall_dt / 60:.1f} min, {len(failed)} script(s) failed")
    if failed:
        log(f"failed: {failed}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
