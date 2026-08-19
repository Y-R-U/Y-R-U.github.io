#!/usr/bin/env python3
"""NEONHAUL living-poster media generator (S2-G).

Reads `data/posters.json` and produces, per item:

    assets/posters/<channel>_<id>.jpg      192x384 still            (kind: still)
    assets/posters/<channel>_<id>.mp4      192x384 ping-pong loop   (kind: video)

Deliberately much smaller than the client portraits. A living poster is 24-40 m
tall on a facade at least 120 m up (DECISIONS decision 9), and at the distances
it is ever visible from it covers 40-160 screen px. 192x384 is already more
texels than the screen has. Target: stills under 16 KB, clips under 90 KB.

Same two-batch discipline as tools/gen_clients.py, and for the same reason —
Flux (:7867) and LTX (:7866) cannot both hold a worker in 24 GB, so all the
stills go first and all the clips after.

    python3 tools/gen_posters.py                 # generate whatever is missing
    python3 tools/gen_posters.py --stage post    # re-encode from existing raws
    python3 tools/gen_posters.py --verify        # check the shipped files only
"""

import argparse
import hashlib
import json
import os
import subprocess
import sys
import time

sys.path.insert(0, os.path.expanduser('~/cc/yru/site/gms/2d/awake'))
from regen_helper import (  # noqa: E402
    wait_for_ltx_idle, best_effort_unload,
    mflux_post, mflux_get, mflux_download,
    post_json, get_json, download,
    MFLUX_API, LTX_API, IMAGE_MODEL,
)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST = os.path.join(ROOT, 'data', 'posters.json')
OUT_DIR = os.path.join(ROOT, 'assets', 'posters')

# Raw Flux frames and raw LTX clips live OUTSIDE site/ so they can never be
# committed — same convention as tools/gen_clients.py.
RAW_DIR = os.path.expanduser('~/cc/yru/gms/3d/neonhaul_poster_raw')

STILL_W, STILL_H = 512, 1024    # Flux for a `still`: already 1:2, no crop
LTX_W, LTX_H = 384, 640         # LTX accepts only (384,640) or (576,960)
CROP_W = 320                    # 320x640 is 1:2 — the poster band's aspect
OUT_W, OUT_H = 192, 384         # what ships
FLUX_STEPS = 10
NUM_FRAMES = 65                 # 65 forward + 63 back = 128 frames = 5.33 s
FPS = 24
QUEUE_LIMIT = 20

# DECISIONS decision 9's limits are the prompt, not a note next to it: "stylised
# and graphic only ... no attempt at photoreal faces or anatomy". A photoreal
# portrait on a facade would also read as a different game from the one behind it.
POSTER_TMPL = (
    "{subject}, stylised graphic advertising poster, flat bold colour blocking, "
    "high contrast screenprint, {palette}, hard-edged shapes, minimal detail, "
    "strong single light, vertical poster composition, matte print, "
    "no text, no letters, no numbers, no logos, no watermark, no border"
)

MOTION_TMPL = (
    "{motion}, the poster artwork itself does not change, static camera, "
    "no zoom, no pan, no cut, flat graphic poster style, film grain"
)

MOTION_NEG = ("camera movement, zoom, pan, cut, morphing, text, letters, "
              "watermark, blur, people walking, extra limbs")


def load():
    with open(MANIFEST) as fh:
        man = json.load(fh)
    items = []
    for ch in man['channels']:
        for it in ch['items']:
            items.append(dict(it, channel=ch['id'], accent=ch['accent'],
                              key=f"{ch['id']}_{it['id']}"))
    return man, items


def seed_for(item):
    if item.get('seed') is not None:
        return int(item['seed'])
    return int(hashlib.sha1(item['key'].encode()).hexdigest()[:8], 16) % 100000


def paths(item):
    k = item['key']
    ext = 'mp4' if item['kind'] == 'video' else 'jpg'
    return {
        'ship': os.path.join(OUT_DIR, f'{k}.{ext}'),
        'flux': os.path.join(RAW_DIR, f'{k}_flux.png'),
        'ltxsrc': os.path.join(RAW_DIR, f'{k}_ltxsrc.jpg'),
        'ltxraw': os.path.join(RAW_DIR, f'{k}_ltx.mp4'),
    }


def run(cmd):
    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode != 0:
        raise RuntimeError(f'{cmd[0]} failed:\n{" ".join(cmd)}\n{p.stderr[-2000:]}')
    return p


def ffprobe(path, *fields):
    out = run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-count_frames',
               '-show_entries', 'stream=' + ','.join(fields),
               '-of', 'default=nw=1', path]).stdout
    got = dict(l.split('=', 1) for l in out.strip().splitlines() if '=' in l)
    return [got.get(f, '') for f in fields]


def check_queues():
    import urllib.request
    for api, name in ((MFLUX_API, 'mflux'), (LTX_API, 'LTX')):
        try:
            with urllib.request.urlopen(f'{api}/api/status', timeout=15) as r:
                st = json.load(r)
        except Exception as exc:
            sys.exit(f'{name} at {api} is not answering: {exc}')
        print(f'  {name:6s} queue_depth={st.get("queue_depth")} '
              f'worker_warm={st.get("worker_warm")}')
        if st.get('queue_depth', 0) > QUEUE_LIMIT:
            sys.exit(f'{name} queue_depth is {st["queue_depth"]}; come back later.')


# ── batch A: Flux plates ───────────────────────────────────────────────
def batch_flux(items):
    if not items:
        return
    print(f'\nBATCH A — {len(items)} Flux plates')
    wait_for_ltx_idle({})
    jobs = []
    for it in items:
        video = it['kind'] == 'video'
        payload = {
            'mode': 'txt2img',
            'prompt': POSTER_TMPL.format(**it),
            'model': IMAGE_MODEL,
            'width': LTX_W if video else STILL_W,
            'height': LTX_H if video else STILL_H,
            'num_inference_steps': FLUX_STEPS,
            'seed': seed_for(it),
            'num_images': 1,
        }
        jid = mflux_post('/api/generate', payload)['job_id']
        jobs.append((it, jid))
        print(f'  queued {it["key"]:16s} seed={seed_for(it):<6d} {jid}')
    for it, jid in jobs:
        t0 = time.time()
        while True:
            job = mflux_get(f'/api/jobs/{jid}')
            if job.get('status') == 'done':
                break
            if job.get('status') in {'failed', 'cancelled'}:
                raise RuntimeError(f'flux {jid} {job.get("status")}: {job.get("error", "")}')
            time.sleep(3)
        mflux_download(f'/api/jobs/{jid}/file/0', paths(it)['flux'])
        print(f'  got    {it["key"]:16s} '
              f'{os.path.getsize(paths(it)["flux"])/1024:7.1f} KB  {time.time()-t0:5.1f}s')


# ── batch B: LTX loops ─────────────────────────────────────────────────
JOBS_FILE = os.path.join(RAW_DIR, '_ltx_jobs.json')


def _live_job(jid):
    try:
        return get_json(f'/api/jobs/{jid}').get('status') not in \
            {None, 'failed', 'cancelled'} and jid or None
    except Exception:
        return None


def batch_ltx(items):
    items = [i for i in items if i['kind'] == 'video']
    if not items:
        return
    print(f'\nBATCH B — {len(items)} LTX loops')
    best_effort_unload(MFLUX_API)
    try:
        with open(JOBS_FILE) as fh:
            pending = json.load(fh)
    except Exception:
        pending = {}
    jobs = []
    for it in items:
        p = paths(it)
        jid = _live_job(pending.get(it['key'], '')) if pending.get(it['key']) else None
        if jid:
            print(f'  resume {it["key"]:16s} {jid}')
        else:
            run(['ffmpeg', '-y', '-loglevel', 'error', '-i', p['flux'],
                 '-vf', f'scale={LTX_W}:{LTX_H}', '-q:v', '2', p['ltxsrc']])
            jid = post_json('/api/generate', {
                'prompt': MOTION_TMPL.format(**it),
                'width': LTX_W, 'height': LTX_H,
                'num_frames': NUM_FRAMES, 'fps': FPS,
                'seed': seed_for(it),
                'num_inference_steps': 20,
                'cfg_scale': 3.0,
                'negative_prompt': MOTION_NEG,
                'image': p['ltxsrc'],
                'image_strength': 1.0,
                'tiling': 'aggressive',
                'no_audio': True,
            })['job_id']
            print(f'  queued {it["key"]:16s} {jid}')
        pending[it['key']] = jid
        jobs.append((it, jid))
        with open(JOBS_FILE, 'w') as fh:
            json.dump(pending, fh, indent=1)
    for it, jid in jobs:
        t0 = time.time()
        while True:
            job = get_json(f'/api/jobs/{jid}')
            if job.get('status') == 'done':
                break
            if job.get('status') in {'failed', 'cancelled'}:
                raise RuntimeError(f'LTX {jid} {job.get("status")}')
            time.sleep(4)
        # LTX serves at /file, NOT /file/0 — that suffix is mflux's.
        download(f'/api/jobs/{jid}/file', paths(it)['ltxraw'])
        print(f'  got    {it["key"]:16s} '
              f'{os.path.getsize(paths(it)["ltxraw"])/1024:7.1f} KB  {time.time()-t0:5.1f}s')


# ── post ───────────────────────────────────────────────────────────────
def post_one(item, q=9, crf=34):
    p = paths(item)
    if item['kind'] == 'still':
        run(['ffmpeg', '-y', '-loglevel', 'error', '-i', p['flux'],
             '-vf', f'scale={OUT_W}:{OUT_H}:flags=lanczos', '-q:v', str(q), p['ship']])
        return
    # The baked ping-pong, exactly as tools/gen_clients.py derives it: forward
    # f0..f64, then reversed indices 1..63 (f63..f1), which drops BOTH duplicates
    # — f64 at the turn and f0 at the wrap. 65 + 63 = 128 frames = 5.33 s, and
    # <video loop> alone then cycles with no hitch.
    cx = (LTX_W - CROP_W) // 2
    fc = (f'[0:v]crop={CROP_W}:{LTX_H}:{cx}:0,scale={OUT_W}:{OUT_H}:flags=lanczos,split[a][b];'
          f'[b]reverse,trim=start_frame=1:end_frame={NUM_FRAMES - 1},'
          f'setpts=N/FRAME_RATE/TB[r];[a][r]concat=n=2:v=1[v]')
    run(['ffmpeg', '-y', '-loglevel', 'error', '-i', p['ltxraw'],
         '-filter_complex', fc, '-map', '[v]', '-an',
         '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', str(crf),
         '-preset', 'slow', '-movflags', '+faststart',
         '-g', str(NUM_FRAMES), p['ship']])


def batch_post(items, q, crf):
    print(f'\nPOST — {len(items)} encodes')
    for it in items:
        post_one(it, q, crf)
        print(f'  {it["key"]:16s} {os.path.getsize(paths(it)["ship"])/1024:7.1f} KB')


def verify(items):
    ok, total = True, 0
    print(f'\n{"item":18s} {"kind":6s} {"bytes":>8s}  detail')
    for it in items:
        p = paths(it)['ship']
        if not os.path.exists(p):
            print(f'  MISSING {p}')
            ok = False
            continue
        n = os.path.getsize(p)
        total += n
        if it['kind'] == 'video':
            w, h, nb, dur = ffprobe(p, 'width', 'height', 'nb_read_frames', 'duration')
            want = 2 * NUM_FRAMES - 2
            bad = (int(w), int(h)) != (OUT_W, OUT_H) or int(nb) != want
            ok = ok and not bad
            detail = f'{w}x{h} {nb}f {float(dur):.2f}s' + (' BAD' if bad else '')
        else:
            w, h = ffprobe(p, 'width', 'height')
            bad = (int(w), int(h)) != (OUT_W, OUT_H)
            ok = ok and not bad
            detail = f'{w}x{h}' + (' BAD' if bad else '')
        print(f'{it["key"]:18s} {it["kind"]:6s} {n:8d}  {detail}')
    print(f'\nTOTAL {total} bytes ({total/1024:.1f} KB) over {len(items)} items')
    return ok


def seams(items):
    """Prove the clips actually loop: no duplicated frame anywhere in the file.
    A duplicate is the once-per-cycle hitch tools/gen_clients.py documents."""
    ok = True
    last = 2 * NUM_FRAMES - 3
    for it in [i for i in items if i['kind'] == 'video']:
        p = paths(it)['ship']
        out = subprocess.run(
            ['ffmpeg', '-v', 'error', '-i', p, '-i', p, '-filter_complex',
             f'[0:v]select=gt(n\\,0),setpts=N/FRAME_RATE/TB[a];'
             f'[1:v]select=lt(n\\,{last}),setpts=N/FRAME_RATE/TB[b];'
             f'[a][b]psnr=stats_file=-', '-f', 'null', '-'],
            capture_output=True, text=True).stdout
        adj = []
        for line in out.splitlines():
            for tok in line.split():
                if tok.startswith('psnr_avg:'):
                    v = tok.split(':')[1]
                    adj.append(float('inf') if v == 'inf' else float(v))
        dups = sum(1 for x in adj if x == float('inf'))
        bad = dups > 0 or len(adj) != last
        ok = ok and not bad
        print(f'{it["key"]:18s} pairs {len(adj):4d}/{last}  dups {dups}  '
              f'min {min(adj) if adj else 0:.2f} dB  {"FAIL" if bad else "ok"}')
    return ok


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--force', action='store_true')
    ap.add_argument('--only', default='')
    ap.add_argument('--stage', default='all',
                    choices=['all', 'flux', 'ltx', 'post', 'verify', 'seams'])
    ap.add_argument('--verify', action='store_true')
    ap.add_argument('--q', type=int, default=9)
    ap.add_argument('--crf', type=int, default=34)
    args = ap.parse_args()
    if args.verify:
        args.stage = 'verify'

    _, items = load()
    if args.only:
        want = {s.strip() for s in args.only.split(',') if s.strip()}
        unknown = want - {i['key'] for i in items}
        if unknown:
            sys.exit(f'unknown item keys: {sorted(unknown)}')
        items = [i for i in items if i['key'] in want]

    os.makedirs(OUT_DIR, exist_ok=True)
    os.makedirs(RAW_DIR, exist_ok=True)

    if args.stage == 'verify':
        sys.exit(0 if verify(items) else 1)
    if args.stage == 'seams':
        sys.exit(0 if seams(items) else 1)

    todo = items if args.force else [i for i in items
                                     if not os.path.exists(paths(i)['ship'])]
    if not todo:
        print(f'all {len(items)} poster items already present')
        return verify(items)
    print(f'{len(todo)} of {len(items)} items to generate')

    if args.stage in ('all', 'flux', 'ltx'):
        check_queues()
    if args.stage in ('all', 'flux'):
        batch_flux([i for i in todo
                    if args.force or not os.path.exists(paths(i)['flux'])])
    if args.stage in ('all', 'ltx'):
        batch_ltx([i for i in todo
                   if args.force or not os.path.exists(paths(i)['ltxraw'])])
    if args.stage in ('all', 'post'):
        batch_post(todo, args.q, args.crf)
        verify(items)


if __name__ == '__main__':
    main()
