#!/usr/bin/env python3
"""One-shot 2am Mimic start-frame and video regeneration for Awake."""

from __future__ import annotations

import datetime as dt
import json
import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request


ROOT = os.path.dirname(os.path.abspath(__file__))
HELPER_API = os.environ.get("AWAKE_HELPER_API", "http://127.0.0.1:8788/awake/api")
PYTHON = os.environ.get("PYTHON", sys.executable or "/opt/homebrew/bin/python3")
STATE_PATH = os.path.join(ROOT, ".scheduled_mimic_regen_state.json")
HELPER_LOG = os.path.join(ROOT, "regen_helper.scheduled_mimic.log")
LABEL = "com.codex.awake-mimic-regen"
SCHEDULED_FOR = "2026-06-13 02:00 AEST"
TARGETS = ["monster_release_mimic.mp4", "monster_attack_mimic.mp4"]


def now_iso() -> str:
    return dt.datetime.now().astimezone().isoformat(timespec="seconds")


def log(message: str) -> None:
    print(f"[{now_iso()}] {message}", flush=True)


def save_state(data: dict) -> None:
    tmp = STATE_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=2, sort_keys=True)
        handle.write("\n")
    os.replace(tmp, STATE_PATH)


def api_json(path: str, data: dict | None = None, timeout: int = 45) -> dict:
    body = None
    headers = {"Accept": "application/json"}
    method = "GET"
    if data is not None:
        body = json.dumps(data).encode("utf-8")
        headers["Content-Type"] = "application/json"
        method = "POST"
    request = urllib.request.Request(
        HELPER_API + path,
        data=body,
        headers=headers,
        method=method,
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{path} returned HTTP {exc.code}: {raw[:1000]}") from exc
    return json.loads(raw)


def wait_for_port(port: int, label: str, timeout: int = 90) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=2):
                log(f"{label} port {port} is reachable")
                return
        except OSError:
            time.sleep(2)
    log(f"{label} port {port} was not reachable after {timeout}s; continuing")


def kickstart_services() -> None:
    uid = os.getuid()
    for label, port in (("com.airon.mflux-queue", 7867), ("com.airon.ltx-video", 7866)):
        command = ["launchctl", "kickstart", "-k", f"gui/{uid}/{label}"]
        result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, check=False)
        if result.returncode == 0:
            log(f"kickstarted {label}")
        else:
            log(f"kickstart {label} exited {result.returncode}: {result.stdout.strip()}")
        wait_for_port(port, label)


def helper_status() -> dict:
    status = api_json("/status", timeout=60)
    if not status.get("ok"):
        raise RuntimeError(f"helper status not ok: {status}")
    return status


def ensure_helper() -> dict:
    try:
        status = helper_status()
        log("Awake helper is already running")
        return status
    except Exception as exc:
        log(f"Awake helper is offline; starting regen_helper.py ({exc})")

    helper_log = open(HELPER_LOG, "a", encoding="utf-8")
    subprocess.Popen(
        [PYTHON, "regen_helper.py"],
        cwd=ROOT,
        stdout=helper_log,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    deadline = time.time() + 90
    last_error = ""
    while time.time() < deadline:
        try:
            status = helper_status()
            log("Awake helper started")
            return status
        except Exception as exc:
            last_error = str(exc)
            time.sleep(3)
    raise RuntimeError(f"Awake helper did not start: {last_error}")


def find_transition(status: dict, file_name: str) -> dict:
    for transition in status.get("transitions", []):
        if transition.get("file") == file_name:
            return transition
    raise RuntimeError(f"{file_name} not found in helper transitions")


def wait_for_job(job_id: str, success_status: str, timeout: int) -> tuple[dict, dict]:
    deadline = time.time() + timeout
    last_status = ""
    while time.time() < deadline:
        status = helper_status()
        jobs = status.get("jobs") if isinstance(status.get("jobs"), list) else []
        job = next((item for item in jobs if item.get("id") == job_id), None)
        if job is None:
            time.sleep(8)
            continue
        current = job.get("status", "")
        if current != last_status:
            log(f"{job_id}: {current or 'unknown'}")
            last_status = current
        if current == success_status:
            return job, status
        if current == "failed":
            raise RuntimeError(f"{job_id} failed: {job.get('error', 'unknown error')}")
        time.sleep(10)
    raise TimeoutError(f"{job_id} did not reach {success_status} within {timeout}s")


def run_target(initial_status: dict, file_name: str) -> dict:
    transition = find_transition(initial_status, file_name)
    image_info = transition.get("imageRedo") or {}
    if not image_info:
        raise RuntimeError(f"{file_name} does not support image redo")

    image_prompt = (image_info.get("imagePrompt") or transition.get("promptText") or "").strip()
    video_prompt = (transition.get("promptText") or image_prompt).strip()
    if not image_prompt:
        raise RuntimeError(f"{file_name} has no start-frame prompt")

    log(f"generating Mimic hallway start frame for {file_name}")
    preview_result = api_json(
        "/image_preview",
        {
            "file": file_name,
            "promptText": image_prompt,
            "useMonsterRef": True,
            "monsterRefPrompt": image_info.get("monsterRefPrompt", ""),
            "rerollRef": False,
        },
        timeout=60,
    )
    preview_job_id = preview_result["job"]["id"]
    preview_job, status = wait_for_job(preview_job_id, "image_ready", timeout=90 * 60)
    preview_token = preview_job.get("preview")
    if not preview_token:
        raise RuntimeError(f"{preview_job_id} completed without a preview token")

    log(f"accepting hallway start frame for {file_name}: {preview_token}")
    commit_result = api_json(
        "/image_commit",
        {
            "file": file_name,
            "preview": preview_token,
            "movedStatus": f"Scheduled Mimic start-frame regen {SCHEDULED_FOR}.",
            "width": 384,
            "height": 640,
            "numFrames": 73,
            "videoPromptText": video_prompt,
            "mode": "other",
        },
        timeout=60,
    )
    jobs = commit_result.get("jobs") or []
    if not jobs:
        raise RuntimeError(f"{file_name} commit did not enqueue a video job")

    completed = []
    for job in jobs:
        regen_job, status = wait_for_job(job["id"], "done", timeout=120 * 60)
        completed.append({
            "id": regen_job.get("id"),
            "file": regen_job.get("file"),
            "ltx_job_id": regen_job.get("ltx_job_id"),
            "moved_to": regen_job.get("moved_to"),
            "bytes": regen_job.get("bytes"),
            "duration_secs": regen_job.get("duration_secs"),
            "render_options": regen_job.get("renderOptions"),
        })
    return {
        "file": file_name,
        "preview_job_id": preview_job_id,
        "preview": preview_token,
        "preview_src": preview_job.get("previewSrc"),
        "monster_ref_src": preview_job.get("monsterRefSrc"),
        "video_jobs": completed,
    }


def remove_launch_agent() -> None:
    result = subprocess.run(["launchctl", "remove", LABEL], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, check=False)
    if result.returncode == 0:
        log(f"removed LaunchAgent label {LABEL}")
    else:
        log(f"launchctl remove {LABEL} exited {result.returncode}: {result.stdout.strip()}")


def main() -> int:
    force = "--force" in sys.argv
    if os.path.exists(STATE_PATH) and not force:
        log(f"state file exists; one-shot job already ran or started: {STATE_PATH}")
        return 0

    state = {
        "scheduled_for": SCHEDULED_FOR,
        "started_at": now_iso(),
        "status": "started",
        "targets": TARGETS,
        "results": [],
    }
    save_state(state)

    try:
        kickstart_services()
        status = ensure_helper()
        for file_name in TARGETS:
            result = run_target(status, file_name)
            state["results"].append(result)
            state["updated_at"] = now_iso()
            save_state(state)
            status = helper_status()
        state["status"] = "complete"
        state["completed_at"] = now_iso()
        save_state(state)
        log("Mimic scheduled regeneration complete")
        return 0
    except Exception as exc:
        state["status"] = "failed"
        state["error"] = str(exc)
        state["failed_at"] = now_iso()
        save_state(state)
        log(f"Mimic scheduled regeneration failed: {exc}")
        return 1
    finally:
        remove_launch_agent()


if __name__ == "__main__":
    raise SystemExit(main())
