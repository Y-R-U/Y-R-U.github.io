# Designs narrator candidates: python3 vo_design.py <seed>...   then save one: python3 vo_design.py save <job_id> <seed>
import sys, json; sys.path.insert(0, '.'); import vo_tts as tts
INSTRUCT = ("A warm, gentle British woman in her thirties narrating a magical story for children. Soft, clear and "
            "wondrous, hopeful and kind, unhurried, with a quiet smile in her voice.")
TEXT = "A tiny seed could hold a whole design. Plant it, and the land would grow into its shape, block by block."
NAME = 'Synthwild · Narrator'
def st(seed): return dict(mode='design', speaker='Ryan', language='English', instruct=INSTRUCT, temperature=0.9,
                          top_p=1.0, top_k=50, repetition_penalty=1.05, speed=1, seed=seed)
if sys.argv[1] == 'save':
    jid, seed = sys.argv[2], int(sys.argv[3])
    r = tts.req('/api/voices', dict(name=NAME, notes='Designed for SYNTHWILD (yru gms/3d/synthwild) intro narration.',
                                    settings=dict(st(seed), text=TEXT), job_id=jid, preserve_voice=True))
    json.dump(r, open('vo_voice.json', 'w'), indent=1); print(json.dumps(r)[:600])
else:
    import os; os.makedirs('scratch', exist_ok=True)
    for s in map(int, sys.argv[1:]):
        jid, res = tts.gen(st(s), TEXT, f'scratch/narr_{s}.wav'); print(s, jid, round(res['duration'], 2), flush=True)
