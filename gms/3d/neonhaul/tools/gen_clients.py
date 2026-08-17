#!/usr/bin/env python3
"""NEONHAUL client media generator (BUILD_PLAN §9).

Reads `data/clients.json` and produces, per client:

    assets/clients/<id>.jpg         384x384 panel still, also the <video poster>
    assets/clients/<id>_thumb.jpg    96x96  job-board thumb
    assets/clients/<id>.mp4         288x288 baked ping-pong talking loop

The client COUNT is the length of the JSON array. Adding rows is the only thing
needed to raise it — no code change here or in js/.

Two strictly separated batches, never interleaved: Flux and LTX cannot both hold
a worker in 24 GB. All 16 stills are submitted up front so the queue keeps the
model warm, then all 16 clips.

Idempotent: a client whose three outputs already exist is skipped unless --force.

    python3 tools/gen_clients.py                 # generate whatever is missing
    python3 tools/gen_clients.py --force --only rat_kestin,brack_osun
    python3 tools/gen_clients.py --stage post    # re-encode from existing raws
    python3 tools/gen_clients.py --verify        # check the shipped files only
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
MANIFEST = os.path.join(ROOT, 'data', 'clients.json')
OUT_DIR = os.path.join(ROOT, 'assets', 'clients')

# Raw Flux frames and raw LTX clips are intermediates, not ship assets. They live
# OUTSIDE site/ so they can never be committed — same convention as aaa_refs/.
# Keeping them means a crop or CRF change is a re-encode, not a regeneration.
RAW_DIR = os.path.expanduser('~/cc/yru/gms/3d/neonhaul_client_raw')

FLUX_W, FLUX_H = 768, 1280      # doubles as the LTX start frame (2x 384x640)
LTX_W, LTX_H = 384, 640         # LTX accepts only (384,640) or (576,960)
FLUX_STEPS = 10
NUM_FRAMES = 49                 # forward frames; the loop ends up 96 (§9.2)
FPS = 24
STILL_PX, THUMB_PX, VIDEO_PX = 384, 96, 288
CROP_Y = 96                     # head crop offset in 768-space; halved for video
QUEUE_LIMIT = 20                # §14 risk 5 — do not pile onto a busy queue
TIE_DB = 0.5                    # seam matcher: PSNR within this is a tie, not a different frame

# §9.5's template, plus the four fields that keep sixteen portraits from reading as
# one face: gender+build (so the face matches the name), framing (lens and crop),
# light (key direction) and backdrop. The constants §9.5 calls load-bearing —
# "deep black background", "lit only by neon", "mostly black frame" — are untouched.
PORTRAIT_TMPL = (
    "cinematic portrait of a {age} {gender}, {build}, {look}, "
    "cyberpunk courier client, {framing}, {light}, lit only by neon, "
    "deep black background, {backdrop}, shallow depth of field, "
    "grimy near-future city interior, photographic, high contrast, "
    "mostly black frame, no text, no logos"
)

LOOP_TMPL = (
    "the person speaks a few words to camera, small natural head movement, eyes blink "
    "once, subtle jaw and lip motion, {mood} expression, lighting unchanged, "
    "static camera, static background, dark interior, neon rim light, film grain"
)

LOOP_NEGATIVE = ("camera movement, zoom, pan, cut, morphing, extra limbs, text, "
                 "watermark, blur")


# ── helpers ────────────────────────────────────────────────────────────
def load_clients():
    with open(MANIFEST) as fh:
        data = json.load(fh)
    return data, data['clients']


def seed_for(client):
    """Stable per client id. An explicit `seed` in the manifest pins it (that is
    how you reroll one bad face without disturbing the other fifteen); otherwise
    it is derived from the id, so it is identical on every machine and every run.
    Never wall-clock — regen_helper.mflux_generate()'s time-based seed is exactly
    why we wrap the primitives instead of reusing it."""
    if client.get('seed') is not None:
        return int(client['seed'])
    digest = hashlib.sha1(client['id'].encode('utf-8')).hexdigest()
    return int(digest[:8], 16) % 100000


def paths(client):
    cid = client['id']
    return {
        'still': os.path.join(OUT_DIR, f'{cid}.jpg'),
        'thumb': os.path.join(OUT_DIR, f'{cid}_thumb.jpg'),
        'video': os.path.join(OUT_DIR, f'{cid}.mp4'),
        'flux': os.path.join(RAW_DIR, f'{cid}_flux.png'),
        'ltxsrc': os.path.join(RAW_DIR, f'{cid}_ltxsrc.jpg'),
        'ltxraw': os.path.join(RAW_DIR, f'{cid}_ltx.mp4'),
    }


def complete(client):
    p = paths(client)
    return all(os.path.exists(p[k]) and os.path.getsize(p[k]) > 0
               for k in ('still', 'thumb', 'video'))


def run(cmd):
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f'{cmd[0]} failed:\n{" ".join(cmd)}\n{proc.stderr[-2000:]}')
    return proc


def ffprobe(path, *fields):
    """Values by name. nb_frames is absent from these containers, so frames are
    counted by decoding (nb_read_frames) rather than trusted from a header."""
    out = run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-count_frames',
               '-show_entries', 'stream=' + ','.join(fields),
               '-of', 'default=nw=1', path]).stdout
    got = dict(l.split('=', 1) for l in out.strip().splitlines() if '=' in l)
    return [got.get(f, '') for f in fields]


def check_queues():
    for api, name in ((MFLUX_API, 'mflux'), (LTX_API, 'LTX')):
        try:
            import urllib.request
            with urllib.request.urlopen(f'{api}/api/status', timeout=15) as r:
                st = json.load(r)
        except Exception as exc:
            sys.exit(f'{name} at {api} is not answering: {exc}')
        depth = st.get('queue_depth', 0)
        print(f'  {name:6s} queue_depth={depth} worker_warm={st.get("worker_warm")}')
        if depth > QUEUE_LIMIT:
            sys.exit(f'{name} queue_depth is {depth} (> {QUEUE_LIMIT}). '
                     'Another session is mid-batch; come back later.')


# ── batch A: Flux portraits ────────────────────────────────────────────
def flux_prompt(client):
    return PORTRAIT_TMPL.format(**client)


def submit_flux(client):
    payload = {
        'mode': 'txt2img',
        'prompt': flux_prompt(client),
        'model': IMAGE_MODEL,
        'width': FLUX_W, 'height': FLUX_H,
        'num_inference_steps': FLUX_STEPS,
        'seed': seed_for(client),
        'num_images': 1,
    }
    return mflux_post('/api/generate', payload)['job_id']


def collect_flux(client, job_id):
    while True:
        job = mflux_get(f'/api/jobs/{job_id}')
        status = job.get('status')
        if status == 'done':
            break
        if status in {'failed', 'cancelled'}:
            raise RuntimeError(f'flux job {job_id} {status}: {job.get("error", "")}')
        time.sleep(3)
    mflux_download(f'/api/jobs/{job_id}/file/0', paths(client)['flux'])


def batch_flux(clients):
    print(f'\nBATCH A — {len(clients)} Flux portraits')
    wait_for_ltx_idle({})          # required positional arg, and it is mutated
    jobs = []
    for c in clients:
        jid = submit_flux(c)
        jobs.append((c, jid))
        print(f'  queued {c["id"]:14s} seed={seed_for(c):<6d} {jid}')
    for c, jid in jobs:
        t0 = time.time()
        collect_flux(c, jid)
        size = os.path.getsize(paths(c)['flux'])
        print(f'  got    {c["id"]:14s} {size/1024:7.1f} KB  {time.time()-t0:5.1f}s')


# ── batch B: LTX talking loops ─────────────────────────────────────────
def submit_ltx_clip(client):
    p = paths(client)
    run(['ffmpeg', '-y', '-loglevel', 'error', '-i', p['flux'],
         '-vf', f'scale={LTX_W}:{LTX_H}', '-q:v', '2', p['ltxsrc']])
    payload = {
        'prompt': LOOP_TMPL.format(**client),
        'width': LTX_W, 'height': LTX_H,
        'num_frames': NUM_FRAMES, 'fps': FPS,
        'seed': seed_for(client),
        'num_inference_steps': 20,
        'cfg_scale': 3.0,
        'negative_prompt': LOOP_NEGATIVE,
        'image': p['ltxsrc'],
        'image_strength': 1.0,
        'tiling': 'aggressive',
        'no_audio': True,
    }
    return post_json('/api/generate', payload)['job_id']


def collect_ltx(client, job_id):
    while True:
        job = get_json(f'/api/jobs/{job_id}')
        status = job.get('status')
        if status == 'done':
            break
        if status in {'failed', 'cancelled'}:
            raise RuntimeError(f'LTX job {job_id} {status}')
        time.sleep(4)
    # NOTE: LTX serves its output at /file — NOT /file/0. That suffix is mflux's
    # (it can return several images); LTX 404s on it. Both MANAGER_BRIEF.md and
    # BUILD_PLAN §9 document one shared endpoint list, which is wrong here.
    download(f'/api/jobs/{job_id}/file', paths(client)['ltxraw'])


JOBS_FILE = os.path.join(RAW_DIR, '_ltx_jobs.json')


def _live_job(job_id):
    """A previously submitted job we can still collect from, or None."""
    try:
        return get_json(f'/api/jobs/{job_id}').get('status') not in \
            {None, 'failed', 'cancelled'} and job_id or None
    except Exception:
        return None


def batch_ltx(clients):
    """Submitting 16 clips is ~50 minutes of GPU. Job ids are persisted so a
    failure on the collect side resumes instead of paying for them twice."""
    print(f'\nBATCH B — {len(clients)} LTX loops')
    best_effort_unload(MFLUX_API)
    try:
        with open(JOBS_FILE) as fh:
            pending = json.load(fh)
    except Exception:
        pending = {}
    jobs = []
    for c in clients:
        jid = _live_job(pending.get(c['id'], '')) if pending.get(c['id']) else None
        if jid:
            print(f'  resume {c["id"]:14s} {jid}')
        else:
            jid = submit_ltx_clip(c)
            print(f'  queued {c["id"]:14s} {jid}')
        pending[c['id']] = jid
        jobs.append((c, jid))
        with open(JOBS_FILE, 'w') as fh:
            json.dump(pending, fh, indent=1)
    for c, jid in jobs:
        t0 = time.time()
        collect_ltx(c, jid)
        size = os.path.getsize(paths(c)['ltxraw'])
        print(f'  got    {c["id"]:14s} {size/1024:7.1f} KB  {time.time()-t0:5.1f}s')


# ── post: stills, thumbs, and the baked ping-pong ──────────────────────
def post_still(client, q_still=4, q_thumb=6):
    p = paths(client)
    cy = int(client.get('crop_y', CROP_Y))
    run(['ffmpeg', '-y', '-loglevel', 'error', '-i', p['flux'],
         '-vf', f'crop={FLUX_W}:{FLUX_W}:0:{cy},scale={STILL_PX}:{STILL_PX}',
         '-q:v', str(q_still), p['still']])
    run(['ffmpeg', '-y', '-loglevel', 'error', '-i', p['still'],
         '-vf', f'scale={THUMB_PX}:{THUMB_PX}', '-q:v', str(q_thumb), p['thumb']])


def post_loop(client, crf=30):
    """Bake the ping-pong so <video loop> alone gives a seamless cycle.

    Forward frames f0..f48. `reverse` yields f48..f0; trim start_frame=1
    end_frame=48 keeps reversed indices 1..47, i.e. f47..f1 — dropping BOTH
    duplicates: f48 at the turn AND f0 at the wrap. 49 + 47 = 96 frames = 4.00 s.
    Keeping f0 would show it twice on every wrap: a permanent hitch once per
    cycle on the main UI of the game."""
    p = paths(client)
    cy = int(client.get('crop_y', CROP_Y)) // 2
    fc = (f'[0:v]crop={LTX_W}:{LTX_W}:0:{cy},scale={VIDEO_PX}:{VIDEO_PX},split[a][b];'
          f'[b]reverse,trim=start_frame=1:end_frame={NUM_FRAMES - 1},'
          f'setpts=N/FRAME_RATE/TB[r];[a][r]concat=n=2:v=1[v]')
    run(['ffmpeg', '-y', '-loglevel', 'error', '-i', p['ltxraw'],
         '-filter_complex', fc, '-map', '[v]', '-an',
         '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', str(crf),
         '-preset', 'slow', '-movflags', '+faststart',
         '-g', str(NUM_FRAMES), p['video']])


def batch_post(clients, crf=30):
    print(f'\nPOST — {len(clients)} encodes')
    for c in clients:
        post_still(c)
        post_loop(c, crf)
        p = paths(c)
        print(f'  {c["id"]:14s} still {os.path.getsize(p["still"])/1024:6.1f} KB  '
              f'thumb {os.path.getsize(p["thumb"])/1024:5.1f} KB  '
              f'mp4 {os.path.getsize(p["video"])/1024:7.1f} KB')


# ── verification ───────────────────────────────────────────────────────
def verify(clients):
    """Real decode, real numbers. Frame count, dimensions and duration come from
    the container; seam evidence comes from --stage seams."""
    ok = True
    total = 0
    print(f'\n{"client":16s} {"still":>9s} {"thumb":>8s} {"mp4":>9s}  video')
    for c in clients:
        p = paths(c)
        row = []
        for k in ('still', 'thumb', 'video'):
            if not os.path.exists(p[k]):
                print(f'  MISSING {p[k]}')
                ok = False
                row.append(0)
            else:
                row.append(os.path.getsize(p[k]))
        total += sum(row)
        try:
            w, h, nb, dur = ffprobe(p['video'], 'width', 'height',
                                    'nb_read_frames', 'duration')
            expect = 2 * NUM_FRAMES - 2
            if (int(w), int(h)) != (VIDEO_PX, VIDEO_PX) or int(nb) != expect:
                print(f'  BAD {c["id"]}: {w}x{h} {nb} frames (want '
                      f'{VIDEO_PX}x{VIDEO_PX} {expect})')
                ok = False
            vid = f'{w}x{h} {nb}f {float(dur):.2f}s'
        except Exception as exc:
            vid = f'probe failed: {exc}'
            ok = False
        print(f'{c["id"]:16s} {row[0]:9d} {row[1]:8d} {row[2]:9d}  {vid}')
    print(f'\nTOTAL {total} bytes ({total/1048576:.2f} MB) for {len(clients)} clients, '
          f'{total/len(clients)/1024:.0f} KB each')
    return ok


def _psnr_pair(a, b):
    """PSNR between two PNG frames. inf == byte-identical after decode."""
    out = subprocess.run(['ffmpeg', '-v', 'info', '-i', a, '-i', b,
                          '-lavfi', 'psnr', '-f', 'null', '-'],
                         capture_output=True, text=True).stderr
    for line in out.splitlines():
        if 'PSNR' in line and 'average:' in line:
            val = line.split('average:')[1].split()[0]
            return float('inf') if val == 'inf' else float(val)
    raise RuntimeError('no PSNR line:\n' + out[-1000:])


def _frame(video, n, target):
    run(['ffmpeg', '-y', '-loglevel', 'error', '-i', video,
         '-vf', f'select=eq(n\\,{n})', '-vsync', '0', '-frames:v', '1', target])


def _match_source(frame_png, raw_mp4, crop_y):
    """PSNR of one output frame against every source frame, in a single ffmpeg
    pass. The argmax is which source frame it is."""
    proc = subprocess.run(
        ['ffmpeg', '-v', 'error', '-loop', '1', '-framerate', str(FPS),
         '-i', frame_png, '-i', raw_mp4, '-filter_complex',
         f'[0:v]trim=end_frame={NUM_FRAMES},setpts=N/FRAME_RATE/TB,format=yuv420p[a];'
         f'[1:v]crop={LTX_W}:{LTX_W}:0:{crop_y},scale={VIDEO_PX}:{VIDEO_PX},'
         f'format=yuv420p[b];[a][b]psnr=stats_file=-', '-f', 'null', '-'],
        capture_output=True, text=True)
    vals = []
    for line in proc.stdout.splitlines():
        for tok in line.split():
            if tok.startswith('psnr_avg:'):
                v = tok.split(':')[1]
                vals.append(float('inf') if v == 'inf' else float(v))
    if len(vals) != NUM_FRAMES:
        raise RuntimeError(f'expected {NUM_FRAMES} psnr rows, got {len(vals)}')
    return vals


def seams(clients):
    """Prove the baked ping-pong actually loops, at the level that matters:
    which SOURCE frame each output frame is.

    PSNR between two output frames cannot answer this — two encodings of the
    same source frame 94 apart in the GOP carry independent coding noise and
    score *lower* than two different adjacent frames, whose noise is correlated
    through the P-chain. So instead each boundary frame is matched back against
    every source frame, and the mapping must be exactly:

        out 0  -> src 0        the first frame
        out 48 -> src 48       the turn
        out 49 -> src 47       ... stepping back by one, NOT repeating src 48
        out 95 -> src 1        so <video loop> wraps src 1 -> src 0, adjacent

    Plus a full adjacent-pair sweep inside the file: any psnr == inf is a
    duplicated frame, which is the §9.2 hitch.
    """
    import tempfile
    ok = True
    last = 2 * NUM_FRAMES - 3                       # 95
    want = {0: 0, NUM_FRAMES - 1: NUM_FRAMES - 1,   # 0->0, 48->48
            NUM_FRAMES: NUM_FRAMES - 2, last: 1}    # 49->47, 95->1
    print(f'\n{"client":16s} {"dups":>5s} {"minadj":>7s} {"turn":>7s}  frame->source map')
    for c in clients:
        p = paths(c)
        stats = subprocess.run(
            ['ffmpeg', '-v', 'error', '-i', p['video'], '-i', p['video'],
             '-filter_complex',
             f'[0:v]select=gt(n\\,0),setpts=N/FRAME_RATE/TB[a];'
             f'[1:v]select=lt(n\\,{last}),setpts=N/FRAME_RATE/TB[b];'
             f'[a][b]psnr=stats_file=-', '-f', 'null', '-'],
            capture_output=True, text=True)
        adj = []
        for line in stats.stdout.splitlines():
            for tok in line.split():
                if tok.startswith('psnr_avg:'):
                    v = tok.split(':')[1]
                    adj.append(float('inf') if v == 'inf' else float(v))
        if len(adj) != last:
            print(f'  {c["id"]}: expected {last} adjacent pairs, got {len(adj)}')
            ok = False
            continue
        dups = sum(1 for x in adj if x == float('inf'))
        turn = adj[NUM_FRAMES - 1]
        cy = int(c.get('crop_y', CROP_Y)) // 2
        got, ties = {}, 0
        with tempfile.TemporaryDirectory() as td:
            for n, expect in want.items():
                png = os.path.join(td, f'{n}.png')
                _frame(p['video'], n, png)
                vals = _match_source(png, p['ltxraw'], cy)
                best = max(range(len(vals)), key=lambda k: vals[k])
                # A clip whose opening frames barely move gives near-identical
                # PSNR for two neighbouring source frames. Within TIE_DB that is
                # a measurement tie, not a different frame — accept the expected
                # index and say so, rather than reporting a failure that isn't.
                if best != expect and vals[expect] >= vals[best] - TIE_DB:
                    best, ties = expect, ties + 1
                got[n] = best
        bad = dups > 0 or got != want
        ok = ok and not bad
        chain = ' '.join(f'{n}->{got[n]}' for n in sorted(want))
        if ties:
            chain += f' ({ties} within {TIE_DB} dB tie)'
        print(f'{c["id"]:16s} {dups:5d} {min(adj):7.2f} {turn:7.2f}  {chain}'
              f'  {"FAIL" if bad else "ok"}')
    print('\nall loops: no duplicated frame anywhere in the file, turn steps '
          f'{NUM_FRAMES-1}->{NUM_FRAMES-2}, wrap steps 1->0 — seamless'
          if ok else '\nSEAM CHECK FAILED')
    return ok


# ── main ───────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--force', action='store_true', help='regenerate even if outputs exist')
    ap.add_argument('--only', default='', help='comma-separated client ids')
    ap.add_argument('--stage', default='all',
                    choices=['all', 'flux', 'ltx', 'post', 'verify', 'seams'])
    ap.add_argument('--verify', action='store_true', help='alias for --stage verify')
    ap.add_argument('--crf', type=int, default=30)
    args = ap.parse_args()
    if args.verify:
        args.stage = 'verify'

    manifest, clients = load_clients()
    if args.only:
        want = {s.strip() for s in args.only.split(',') if s.strip()}
        unknown = want - {c['id'] for c in clients}
        if unknown:
            sys.exit(f'unknown client ids: {sorted(unknown)}')
        clients = [c for c in clients if c['id'] in want]

    os.makedirs(OUT_DIR, exist_ok=True)
    os.makedirs(RAW_DIR, exist_ok=True)

    if args.stage == 'verify':
        sys.exit(0 if verify(clients) else 1)
    if args.stage == 'seams':
        sys.exit(0 if seams(clients) else 1)

    todo = clients if args.force else [c for c in clients if not complete(c)]
    if not todo:
        print(f'all {len(clients)} clients already complete; nothing to do')
        return verify(clients)
    print(f'{len(todo)} of {len(clients)} clients to generate')

    if args.stage in ('all', 'flux', 'ltx'):
        check_queues()
    if args.stage in ('all', 'flux'):
        batch_flux([c for c in todo if args.force or not os.path.exists(paths(c)['flux'])])
    if args.stage in ('all', 'ltx'):
        batch_ltx([c for c in todo if args.force or not os.path.exists(paths(c)['ltxraw'])])
    if args.stage in ('all', 'post'):
        batch_post(todo, args.crf)
        verify(clients)


if __name__ == '__main__':
    main()
