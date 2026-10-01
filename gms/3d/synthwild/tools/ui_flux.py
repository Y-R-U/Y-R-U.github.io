# Generates the intro key-art stills on the local mflux queue (:7867). Raw PNGs go to $RAW (outside the repo).
import json, os, sys, time, urllib.request
B = 'http://localhost:7867'
RAW = os.environ.get('RAW', '/tmp/synthwild_flux')
os.makedirs(RAW, exist_ok=True)
STYLE = ("luminous painterly concept art for a children's adventure film, bright and wondrous, soft volumetric light, "
         "warm daylight greens and golds with teal and magenta glowing accents, clean readable shapes, subtle blocky voxel "
         "cube forms in the terrain, cinematic wide composition, highly detailed, no text, no logo")
SHOTS = {
 'seed': "macro close-up of a glowing seed resting in soft moss on a sunlit forest floor, from the seed a small tower of "
         "translucent glowing teal cubes is growing upward block by block, tiny floating hexagonal light motes, shallow depth of field",
 'forest': "a bright bio-tech forest, tall trees with dark carbon-lattice bark with faint hexagon patterns, canopies of "
           "iridescent solar-film leaves like thin glossy panels catching the sun, glowing teal data vines hanging from branches, "
           "magenta glowing flowers, blocky stepped mossy terrain, sun rays",
 'shore': "a mirror-sand beach, the sand is polished chrome reflecting the blue sky like a mirror, smooth chrome pebbles, clear "
          "turquoise shallows, bio-tech trees with solar-film leaves at the edge of the beach, glowing teal vines, blocky rock terraces",
 'ocean': "underwater in a clear turquoise ocean, sun shafts from the surface, tall kelp forest where every kelp frond has glowing "
          "teal data lines and small blinking server nodes, little fish-shaped drones swimming in schools, blocky sea floor",
 'quiet': "an abandoned round greenhouse dome station of the growers, overgrown by solar-film leaves and glowing teal vines, "
          "peaceful golden afternoon light, dust motes, quiet and empty but beautiful, nobody there",
 'wake': "a small explorer in a sleek white and teal suit with softly glowing seams and a compact backpack fabricator kit, "
         "seen from behind, standing in a sunlit glade at the edge of a bio-tech forest with solar-film leaves, morning light, hopeful",
 'night': "night in a bio-tech forest, deep blue sky full of stars, plants and vines glowing teal and magenta, a small blocky "
          "shelter with warm golden lamps glowing in the windows, cosy and safe, never dark, glowing flowers",
 'vista': "a wide panoramic view from a hilltop at sunrise over a seeded wilderness, bio-tech forest with solar-film canopy, a "
          "mirror-sand shore and a turquoise ocean beyond, blocky voxel terraced hills, glowing teal vines, soft clouds, epic and inviting",
}
def req(path, data=None):
    r = urllib.request.Request(B + path, data=json.dumps(data).encode() if data is not None else None,
                               headers={'Content-Type': 'application/json'})
    return json.load(urllib.request.urlopen(r, timeout=60))
seeds = [int(s) for s in os.environ.get('SEEDS', '7,21').split(',')]
only = set(sys.argv[1:])
jobs = []
# Re-attach to jobs already on the queue (e.g. after this script was killed) instead of queueing duplicates.
pending = {}
for j in (lambda r: r.get('jobs', r) if isinstance(r, dict) else r)(req('/api/jobs')):
    pr = j.get('params') or {}
    if isinstance(pr, str):
        try: pr = __import__('ast').literal_eval(pr)
        except Exception: pr = {}
    for name, p in SHOTS.items():
        if pr.get('prompt', '').startswith(p[:80]) and j.get('status') not in ('failed', 'error', 'cancelled'):
            pending[(name, pr.get('seed'))] = j['id']
for name, p in SHOTS.items():
    if only and name not in only: continue
    for sd in seeds:
        out = f'{RAW}/{name}_{sd}.png'
        if os.path.exists(out): continue
        if (name, sd) in pending:
            jobs.append((pending[(name, sd)], out)); print('attached', name, sd, flush=True); continue
        j = req('/api/generate', dict(prompt=p + ', ' + STYLE, width=1344, height=768, num_inference_steps=8, seed=sd,
                                      model='flux2-klein-9b-mlx-4bit'))
        jobs.append((j.get('job_id') or j.get('id'), out)); print('queued', name, sd, flush=True)
while jobs:
    for jid, out in list(jobs):
        s = req(f'/api/jobs/{jid}')
        st = s.get('status')
        if st in ('complete', 'completed', 'done', 'succeeded'):
            urllib.request.urlretrieve(f'{B}/api/jobs/{jid}/file/0', out); jobs.remove((jid, out)); print('got', out, flush=True)
        elif st in ('failed', 'error', 'cancelled'):
            jobs.remove((jid, out)); print('FAILED', out, s.get('error'), flush=True)
    time.sleep(10)
print('DONE')
